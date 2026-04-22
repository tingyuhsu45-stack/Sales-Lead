/**
 * YIT PR Agent — Shared Services
 * ================================
 * Thin wrappers around Google Apps Script built-ins and external APIs.
 * Sheets, Gmail, Calendar, LLM (OpenAI/Anthropic/Gemini), Tavily.
 */

// ════════════════════════════════════════════════════════════════════════════
// SHEETS SERVICE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Open a sheet by name.
 * Reads SPREADSHEET_ID directly from Script Properties to avoid circular
 * dependency (getConfig → getSettings → getSheet_ → getConfig).
 */
function getSheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
    || '1XXYQUgbe11jYj2tMiEYlP3kaiv3xVA0JIim2dwwAiGE';
  return SpreadsheetApp.openById(id).getSheetByName(name);
}

/**
 * Read the Settings sheet and return a key → value map.
 * Column A = Key, Column B = Value (user editable), Column C = Description.
 * Returns {} if sheet is missing or unreadable.
 */
function getSettings() {
  try {
    const sheet = getSheet_('Settings');
    if (!sheet) return {};
    const rows = sheet.getDataRange().getValues().slice(1); // skip header
    const out  = {};
    rows.forEach(row => {
      const key = (row[0] || '').toString().trim();
      const val = (row[1] !== undefined && row[1] !== '') ? row[1].toString().trim() : null;
      if (key && val !== null) out[key] = val;
    });
    return out;
  } catch (err) {
    console.warn('getSettings: could not read Settings sheet —', err);
    return {};
  }
}

/** Returns all data rows (skips header row 1). Each row is an array of values. */
function sheetsGetAllRows(sheetName) {
  const sheet = getSheet_(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  return data.slice(1); // skip header
}

/** Returns a Set of all non-blank emails in COL.EMAIL of a sheet. */
function sheetsGetAllEmails(sheetName) {
  const rows = sheetsGetAllRows(sheetName);
  const emails = new Set();
  rows.forEach(row => {
    const email = (row[COL.EMAIL] || '').toString().trim().toLowerCase();
    if (email) emails.add(email);
  });
  return emails;
}

/** Returns rows where COL.STATUS === status. Each element is {row, rowNum}. */
function sheetsGetRowsByStatus(sheetName, status) {
  const rows = sheetsGetAllRows(sheetName);
  return rows
    .map((row, i) => ({ row, rowNum: i + 2 })) // +2 because 1-indexed + skip header
    .filter(({ row }) => row[COL.STATUS] === status);
}

/** Appends a row of values to the sheet. */
function sheetsAppendRow(sheetName, values) {
  const sheet = getSheet_(sheetName);
  if (sheet) sheet.appendRow(values);
}

/** Updates a single cell. rowNum is 1-based (row 1 = header). colIdx is 0-based. */
function sheetsUpdateCell(sheetName, rowNum, colIdx, value) {
  const sheet = getSheet_(sheetName);
  if (sheet) sheet.getRange(rowNum, colIdx + 1).setValue(value);
}

/** Find the first row where COL.EMAIL matches. Returns {row, rowNum} or null. */
function sheetsFindRowByEmail(sheetName, email) {
  const rows = sheetsGetAllRows(sheetName);
  const target = email.toLowerCase().trim();
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][COL.EMAIL] || '').toString().toLowerCase().trim() === target) {
      return { row: rows[i], rowNum: i + 2 };
    }
  }
  return null;
}

/** Returns all rows from YIT_Context as a single formatted string. */
function sheetsGetYITContext() {
  const sheet = getSheet_('YIT_Context');
  if (!sheet) return '';
  const rows = sheet.getDataRange().getValues().slice(1);
  return rows
    .filter(r => r.some(cell => cell))
    .map(r => r.filter(cell => cell).join(' | '))
    .join('\n');
}


// ════════════════════════════════════════════════════════════════════════════
// GMAIL SERVICE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Send an email via GmailApp.
 * @param {string} to - Recipient email
 * @param {string} subject
 * @param {string} body - Plain text body (fallback for non-HTML clients)
 * @param {Object} opts - { html: string, bcc: string[] }
 */
function gmailSend(to, subject, body, opts = {}) {
  const cfg = getConfig();
  const options = {
    name: 'Youth Impact Taiwan',
  };
  if (opts.html) options.htmlBody = opts.html;
  if (opts.bcc && opts.bcc.length) options.bcc = opts.bcc.join(',');

  GmailApp.sendEmail(to, subject, body || '(HTML email)', options);
}

/**
 * Search Gmail and return matching thread objects.
 * @param {string} query - Gmail search query
 */
function gmailSearch(query) {
  return GmailApp.search(query, 0, 50); // up to 50 threads
}

/** Mark a message as read. */
function gmailMarkAsRead(message) {
  message.markRead();
}


// ════════════════════════════════════════════════════════════════════════════
// CALENDAR SERVICE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Generate candidate 30-min slots in the UK meeting window, check calendar
 * for conflicts, and return up to maxSlots free slots.
 *
 * @returns {Array<{start: Date, end: Date}>}
 */
function calendarGetFreeSlots(maxSlots = 3) {
  const cfg = getConfig();
  const candidates = generateCandidateSlots_(cfg);
  const calendar = CalendarApp.getDefaultCalendar();
  const free = [];

  for (const slot of candidates) {
    if (free.length >= maxSlots) break;
    // getEvents returns events that overlap with [start, end)
    const events = calendar.getEvents(slot.start, slot.end);
    if (events.length === 0) free.push(slot);
  }

  return free;
}

/**
 * Create a Google Calendar event with Meet link.
 * BCC contacts added as optional attendees so they get the invite.
 */
function calendarCreateEvent(title, startDate, endDate, sponsorEmail) {
  const cfg = getConfig();
  const guestList = [sponsorEmail, ...cfg.BCC_EMAILS].join(',');

  const event = CalendarApp.getDefaultCalendar().createEvent(title, startDate, endDate, {
    guests: guestList,
    sendInvites: true,
  });

  // Add Meet conference (only available via Calendar API, not CalendarApp)
  // The event URL is sufficient for now
  return {
    id: event.getId(),
    htmlLink: `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(event.getId())}`,
    hangoutLink: event.getGuestList().length > 0 ? '(check Google Calendar for Meet link)' : '',
  };
}

/** Generate Mon–Fri slot candidates within the UK meeting window. */
function generateCandidateSlots_(cfg) {
  const candidates = [];
  const now = new Date();

  for (let d = cfg.DAYS_AHEAD_MIN; d <= cfg.DAYS_AHEAD_MAX; d++) {
    const date = new Date(now.getTime() + d * 24 * 3600 * 1000);

    // Get weekday name in London timezone
    const londonWeekday = Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', weekday: 'short',
    }).format(date);

    if (londonWeekday === 'Sat' || londonWeekday === 'Sun') continue;

    // Get date components in London timezone
    const londonParts = Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date).split('-').map(Number); // [year, month, day]
    const [year, month, day] = londonParts;

    // Determine UK UTC offset for this date (BST = +1, GMT = +0)
    const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0));
    const londonHour = parseInt(Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: '2-digit', hour12: false,
    }).format(noonUTC));
    const ukOffsetHours = londonHour - 12;

    // Generate 30-min slots within the meeting window
    for (let hour = cfg.MEETING_START_HOUR_UK; hour < cfg.MEETING_END_HOUR_UK; hour++) {
      for (const minute of [0, 30]) {
        const slotStart = new Date(Date.UTC(year, month - 1, day, hour - ukOffsetHours, minute));
        const slotEnd   = new Date(slotStart.getTime() + 30 * 60 * 1000);

        if (slotStart.getTime() + 30 * 60 * 1000 <= Date.UTC(year, month - 1, day, cfg.MEETING_END_HOUR_UK - ukOffsetHours, 0)) {
          if (slotStart > now) {
            candidates.push({ start: slotStart, end: slotEnd });
          }
        }
      }
    }
  }

  return candidates;
}


// ════════════════════════════════════════════════════════════════════════════
// LLM SERVICE  (OpenAI / Anthropic / Google Gemini)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Call the configured LLM with a system prompt + user message.
 * @param {string} system - System prompt
 * @param {string} user   - User message
 * @returns {string} The model's reply text
 */
function llmComplete(system, user) {
  const cfg = getConfig();
  switch (cfg.LLM_PROVIDER.toLowerCase()) {
    case 'openai':    return llmOpenAI_(cfg, system, user);
    case 'anthropic': return llmAnthropic_(cfg, system, user);
    case 'google':    return llmGemini_(cfg, system, user);
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${cfg.LLM_PROVIDER}. Use: openai | anthropic | google`);
  }
}

function llmOpenAI_(cfg, system, user) {
  const resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${cfg.LLM_API_KEY}` },
    payload: JSON.stringify({
      model: cfg.LLM_MODEL || 'gpt-4o',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
    }),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(resp.getContentText());
  if (!data.choices) throw new Error(`OpenAI error: ${resp.getContentText()}`);
  return data.choices[0].message.content;
}

function llmAnthropic_(cfg, system, user) {
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': cfg.LLM_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: cfg.LLM_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: system,
      messages: [{ role: 'user', content: user }],
    }),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(resp.getContentText());
  if (!data.content) throw new Error(`Anthropic error: ${resp.getContentText()}`);
  return data.content[0].text;
}

function llmGemini_(cfg, system, user) {
  const model = cfg.LLM_MODEL || 'gemini-1.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.LLM_API_KEY}`;
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
    }),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(resp.getContentText());
  if (!data.candidates) throw new Error(`Gemini error: ${resp.getContentText()}`);
  return data.candidates[0].content.parts[0].text;
}


// ════════════════════════════════════════════════════════════════════════════
// TAVILY SERVICE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Search the web via Tavily API.
 * @param {string} query
 * @param {number} maxResults
 * @returns {Array<{url, content}>}
 */
function tavilySearch(query, maxResults = 10) {
  const cfg = getConfig();
  const resp = UrlFetchApp.fetch('https://api.tavily.com/search', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      api_key: cfg.TAVILY_API_KEY,
      query: query,
      max_results: maxResults,
    }),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(resp.getContentText());
  return data.results || [];
}


// ════════════════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════════════════

/** Format a Date to Taiwan time string for display in emails. */
function formatToTaiwanTime(date) {
  const parts = Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const g = type => (parts.find(p => p.type === type) || {}).value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('weekday')} ${g('hour')}:${g('minute')} 台灣時間`;
}

/** Today's date as YYYY-MM-DD. */
function todayString() {
  return Intl.DateTimeFormat('en-CA').format(new Date()); // en-CA gives YYYY-MM-DD
}

/** Extract the first email address from a string. Returns '' if none found. */
function extractEmail(text) {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : '';
}

/** Extract first Traditional Chinese company name from text. */
function extractTCCompanyName(text) {
  const match = text.match(/[\u4e00-\u9fff]{2,}(?:股份有限公司|有限公司|企業|集團|科技|實業|工業|商業)/);
  return match ? match[0] : '';
}

/** Extract domain from an email address. */
function emailDomain(email) {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

/** Compute Taiwan-local hour for a given UTC hour in UK time. */
function computeTaiwanHour(ukHour) {
  const now = new Date();
  const ukOffset = parseInt(Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', hour12: false,
  }).format(now)) - now.getUTCHours();
  const utcHour = ukHour - ukOffset;
  return (utcHour + 8 + 24) % 24; // Taiwan is UTC+8
}
