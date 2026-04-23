/**
 * YIT PR Agent v2 — Email Reader
 * =================================
 * Scans Gmail for replies FROM companies in the LEADS sheet only.
 * Ignores commercial / operational / newsletter emails.
 *
 * For each genuine sponsor reply:
 *   1. Update LEADS sheet (reply date, status)
 *   2. Draft an AI reply IN the Gmail thread (not a separate email)
 *   3. If the sponsor is proposing a meeting time → notify Eric + Chanel
 *   4. If the sponsor is asking to schedule a meeting → trigger MeetingScheduler
 */

function runEmailReader() {
  const cfg = getConfig();
  console.log('EmailReader: scanning Gmail for sponsor replies');

  // Load all leads that have had emails sent
  const sentLeads = [
    ...sheetsGetRowsByStatus(SHEET.LEADS, STATUS.EMAIL_SENT),
    ...sheetsGetRowsByStatus(SHEET.LEADS, STATUS.DRAFT_CREATED),
  ];

  if (!sentLeads.length) {
    console.log('EmailReader: no leads in email_sent or draft_created status');
    return;
  }

  // Build quick lookup: email → {row, rowNum}
  const leadsByEmail = {};
  const leadsByDomain = {};
  sentLeads.forEach(({ row, rowNum }) => {
    const email = (row[COL.EMAIL] || '').toLowerCase().trim();
    if (email) {
      leadsByEmail[email] = { row, rowNum };
      const domain = emailDomain(email);
      if (domain) leadsByDomain[domain] = { row, rowNum };
    }
  });

  // Search Gmail for unread replies to our sent emails
  const threads = gmailSearch('is:unread in:inbox', 100);
  let processed = 0;

  threads.forEach(thread => {
    try {
      const messages = thread.getMessages();
      const lastMsg  = messages[messages.length - 1];

      // Only look at unread messages
      if (!lastMsg.isUnread()) return;

      const fromEmail  = extractEmailFromHeader_(lastMsg.getFrom());
      const fromDomain = emailDomain(fromEmail);

      // Match against known leads (exact email or domain fallback)
      const lead = leadsByEmail[fromEmail.toLowerCase()]
                || leadsByDomain[fromDomain];

      if (!lead) {
        // Not from a known lead — ignore entirely
        return;
      }

      const { row, rowNum } = lead;
      const companyName = row[COL.COMPANY_NAME] || fromEmail;
      const threadId    = thread.getId();
      const subject     = lastMsg.getSubject() || '';
      const body        = lastMsg.getPlainBody() || '';

      // Build full thread history for AI context (all messages, oldest first)
      const threadHistory = buildThreadHistory_(messages);

      console.log(`EmailReader: reply from ${companyName} <${fromEmail}>`);

      // Mark as read
      gmailMarkAsRead(lastMsg);

      // Update sheet
      sheetsUpdateCells(SHEET.LEADS, rowNum, [
        [COL.REPLY_DATE, todayString()],
        [COL.STATUS,     STATUS.REPLIED],
      ]);

      // Classify the intent
      const intent = classifyIntent_(body, cfg);
      console.log(`  Intent: ${intent}`);

      if (intent === 'propose_time') {
        // Sponsor proposed their own specific time → notify Eric + Chanel immediately
        handleSponsorProposeTime_(companyName, fromEmail, body, cfg);
        sheetsUpdateCells(SHEET.LEADS, rowNum, [
          [COL.NOTES, '[Sponsor proposed time — notified Eric & Chanel]'],
          [COL.STATUS, STATUS.REPLIED],
        ]);
        return;
      }

      if (intent === 'wants_meeting') {
        // Sponsor is open to meeting → draft email with 3 time slots + notify Eric + Chanel
        handleMeetingRequest_(threadId, fromEmail, subject, companyName, rowNum, cfg);
        notifyMeetingInterest_(companyName, fromEmail, body, cfg);
        sheetsUpdateCells(SHEET.LEADS, rowNum, [
          [COL.DRAFT_CREATED, todayString()],
          [COL.STATUS,        STATUS.DRAFT_CREATED],
          [COL.NOTES,         '[Sponsor wants meeting — slots drafted, Eric & Chanel notified]'],
        ]);
        processed++;
        return;
      }

      // General reply or decline → draft a contextual AI reply
      const draftBody = draftReply_(companyName, body, threadHistory, intent, cfg);
      gmailCreateReplyDraft(threadId, fromEmail, subject, draftBody);

      // Notify Eric of all client replies
      notifyClientReply_(companyName, fromEmail, body, intent, cfg);

      sheetsUpdateCells(SHEET.LEADS, rowNum, [
        [COL.DRAFT_CREATED, todayString()],
        [COL.STATUS,        STATUS.DRAFT_CREATED],
      ]);

      processed++;
    } catch (err) {
      console.error(`EmailReader: error processing thread ${thread.getId()}: ${err}`);
    }
  });

  console.log(`EmailReader: processed ${processed} sponsor replies`);
}

// ── Intent classification ─────────────────────────────────────────────────────

/**
 * Classify the sponsor's email intent using the LLM.
 * Returns: 'wants_meeting' | 'propose_time' | 'general_reply' | 'decline'
 *
 * Falls back to keyword matching if the LLM call fails.
 */
function classifyIntent_(body, cfg) {
  // ── Try LLM classification first ──────────────────────────────────────────
  try {
    const system = `你是一個電子郵件分類助理。請閱讀以下贊助商的回覆郵件，並將其分類為以下四種之一：

- wants_meeting：對方表示有興趣、想進一步了解、想安排會議、想視訊聊聊（但尚未提出具體時間）
- propose_time：對方主動提出了具體的會議時間（例如「週三下午兩點」、「5/10 14:00」）
- decline：對方明確拒絕或表示暫無興趣
- general_reply：其他一般性回覆（提問、感謝、需要更多資料等）

只輸出以上四個標籤之一，不要輸出任何其他文字。`;

    const user = `請分類以下郵件：\n\n${body}`;

    const result = llmComplete(system, user).trim().toLowerCase();

    // Validate the result is one of the expected values
    const valid = ['wants_meeting', 'propose_time', 'general_reply', 'decline'];
    if (valid.includes(result)) {
      console.log(`  Intent classified by AI: ${result}`);
      return result;
    }
    console.warn(`  AI returned unexpected intent "${result}", falling back to keywords`);
  } catch (err) {
    console.warn(`  classifyIntent_ LLM failed: ${err} — using keyword fallback`);
  }

  // ── Keyword fallback ───────────────────────────────────────────────────────
  const lowerBody = body.toLowerCase();

  const declineKeywords = ['不感興趣', '無法配合', '婉拒', '謝謝您的來信，但', '目前暫無贊助計畫', 'not interested', 'no thank'];
  if (declineKeywords.some(kw => lowerBody.includes(kw))) return 'decline';

  const proposeKeywords = ['我這邊', '我方', '方便的時間', '可以約', '我可以', '這個時間'];
  const timePatterns    = [/\d{1,2}[/:]\d{2}/, /上午|下午|早上|晚上/, /週[一二三四五六日]/, /monday|tuesday|wednesday|thursday|friday/i];
  const hasPropose      = proposeKeywords.some(kw => lowerBody.includes(kw));
  const hasTime         = timePatterns.some(p => p.test(lowerBody));
  if (hasPropose && hasTime) return 'propose_time';

  const meetingKeywords = ['安排會議', '約個時間', '視訊', 'zoom', 'meet', '進一步了解', '有興趣', '想聊', '聊聊', 'schedule', 'call', 'interested'];
  if (meetingKeywords.some(kw => lowerBody.includes(kw))) return 'wants_meeting';

  return 'general_reply';
}

// ── Reply drafting ────────────────────────────────────────────────────────────

function draftReply_(companyName, latestBody, threadHistory, intent, cfg) {
  const yitContext   = sheetsGetYITContext();
  const systemPrompt = cfg.READER_SYSTEM_PROMPT.replace('{YIT_CONTEXT}', yitContext);

  const intentNote = {
    'wants_meeting': '（對方有興趣進一步了解/安排會議）',
    'general_reply': '（對方有一般性回覆）',
    'decline':       '（對方婉拒，請禮貌回應感謝對方的時間）',
    'propose_time':  '',
  }[intent] || '';

  const userMsg = `
公司名稱：${companyName}

--- 完整對話紀錄（從最舊到最新）---
${threadHistory}
--- 對話紀錄結束 ---

最新一封來信：
${latestBody}

請根據以上完整對話紀錄，用繁體中文撰寫一封回覆草稿 ${intentNote}。
`.trim();

  try {
    return llmComplete(systemPrompt, userMsg);
  } catch (err) {
    console.error(`draftReply_ LLM failed: ${err}`);
    return `[AI 草稿生成失敗，請手動撰寫回覆。錯誤：${err}]`;
  }
}

// ── Sponsor proposes their own time ──────────────────────────────────────────

function handleSponsorProposeTime_(companyName, sponsorEmail, body, cfg) {
  const subject = `[YIT] ${companyName} 提出會議時間 — 請確認`;
  const msgBody = [
    `贊助商 ${companyName}（${sponsorEmail}）在回覆中提出了會議時間。`,
    ``,
    `--- 對方郵件內容 ---`,
    body,
    `--------------------`,
    ``,
    `請確認是否接受此時間，並在 Google Calendar 中手動建立會議。`,
  ].join('\n');

  gmailSend(cfg.NOTIFY_ERIC,   subject, msgBody);
  gmailSend(cfg.NOTIFY_CHANEL, subject, msgBody);
  console.log(`  Notified Eric + Chanel: ${companyName} proposed a time`);
}

// ── Sponsor open to a meeting — schedule and draft with slots ─────────────────

function handleMeetingRequest_(threadId, sponsorEmail, subject, companyName, rowNum, cfg) {
  try {
    const slots = calendarGetFreeSlots(3);
    if (!slots.length) {
      console.warn(`  No free slots found for ${companyName}`);
      return;
    }

    // Build the meeting email body using the scheduler prompt
    const slotsText = slots.map((s, i) =>
      `選項 ${i + 1}：${s.twDisplay}`
    ).join('\n');

    const schedulerPrompt = cfg.SCHEDULER_PROMPT
      .replace('{SLOTS}', slotsText)
      .replace('{COMPANY_NAME}', companyName);

    const systemPrompt = `你是Youth Impact Taiwan的會議安排助理。請直接輸出郵件正文，不需要任何前言或說明。`;
    let meetingBody;
    try {
      meetingBody = llmComplete(systemPrompt, schedulerPrompt);
    } catch (err) {
      // Fallback: plain text slot list
      meetingBody = [
        `感謝您的回覆！很高興有機會與您進一步交流。`,
        ``,
        `以下是我們可安排視訊會議的時間（台灣時間，每次30分鐘），請問哪個時間方便？`,
        ``,
        slotsText,
        ``,
        `如以上時間均不方便，歡迎告知您的可行時間，我們將竭力配合。`,
        ``,
        `期待與您的會面！`,
      ].join('\n');
    }

    // Create draft in thread with meeting slots
    gmailCreateReplyDraft(threadId, sponsorEmail, subject, meetingBody);

    sheetsUpdateCells(SHEET.LEADS, rowNum, [
      [COL.DRAFT_CREATED, todayString()],
      [COL.STATUS,        STATUS.DRAFT_CREATED],
    ]);

    console.log(`  Meeting slots draft created for ${companyName}`);
  } catch (err) {
    console.error(`  handleMeetingRequest_ failed: ${err}`);
  }
}

// ── Notify team when sponsor wants a meeting ──────────────────────────────────

function notifyMeetingInterest_(companyName, sponsorEmail, body, cfg) {
  const subject = `[YIT] ${companyName} 有興趣會議 — 草稿已建立`;
  const msgBody = [
    `贊助商 ${companyName}（${sponsorEmail}）表示有興趣安排會議。`,
    ``,
    `系統已自動草擬含有 3 個時間選項的回覆，請至 Gmail 草稿夾確認後發送。`,
    ``,
    `--- 對方來信內容 ---`,
    body,
    `--------------------`,
    ``,
    `查看草稿：https://mail.google.com/mail/u/0/#drafts`,
  ].join('\n');

  gmailSend(cfg.NOTIFY_ERIC,   subject, msgBody);
  gmailSend(cfg.NOTIFY_CHANEL, subject, msgBody);
  console.log(`  Notified Eric + Chanel: ${companyName} wants a meeting`);
}

// ── Notify Eric of general client replies ────────────────────────────────────

function notifyClientReply_(companyName, sponsorEmail, body, intent, cfg) {
  const intentLabel = { 'general_reply': '一般回覆', 'decline': '婉拒' }[intent] || intent;
  const subject = `[YIT] ${companyName} 來信 — ${intentLabel}`;
  const msgBody = [
    `贊助商 ${companyName}（${sponsorEmail}）有新的來信。`,
    ``,
    `意圖分類：${intentLabel}`,
    ``,
    `--- 來信內容 ---`,
    body,
    `--------------------`,
    ``,
    `系統已自動草擬回覆，請至 Gmail 草稿夾確認後發送。`,
    `查看草稿：https://mail.google.com/mail/u/0/#drafts`,
  ].join('\n');

  gmailSend(cfg.NOTIFY_ERIC, subject, msgBody);
  console.log(`  Notified Eric: ${companyName} replied (${intentLabel})`);
}

// ── Utility ───────────────────────────────────────────────────────────────────

/** Extract bare email address from a "Name <email>" header string. */
function extractEmailFromHeader_(fromHeader) {
  const match = (fromHeader || '').match(/<([^>]+)>/);
  return match ? match[1].toLowerCase().trim() : (fromHeader || '').toLowerCase().trim();
}

/**
 * Build a readable conversation history string from all messages in a thread.
 * Oldest message first. Each message shows sender, date, and body.
 * Capped at 8 messages to avoid exceeding LLM token limits.
 */
function buildThreadHistory_(messages) {
  const MAX_MESSAGES = 8;
  const MAX_BODY_CHARS = 800; // truncate very long emails

  const recent = messages.length > MAX_MESSAGES
    ? messages.slice(messages.length - MAX_MESSAGES)
    : messages;

  return recent.map((msg, i) => {
    const from = msg.getFrom() || '(unknown)';
    const date = Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(msg.getDate());

    let body = (msg.getPlainBody() || '').trim();
    if (body.length > MAX_BODY_CHARS) {
      body = body.slice(0, MAX_BODY_CHARS) + '\n...(截略)';
    }

    return `[訊息 ${i + 1}] 寄件者：${from} | 時間：${date}\n${body}`;
  }).join('\n\n---\n\n');
}
