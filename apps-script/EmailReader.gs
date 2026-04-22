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
        // Sponsor is proposing their own meeting time → notify team
        handleSponsorProposeTime_(companyName, fromEmail, body, cfg);
        sheetsUpdateCells(SHEET.LEADS, rowNum, [
          [COL.NOTES, '[Sponsor proposed time — notified Eric & Chanel]'],
        ]);
        return;
      }

      // Draft an AI reply in the thread
      const draftBody = draftReply_(companyName, body, intent, cfg);
      gmailCreateReplyDraft(threadId, fromEmail, subject, draftBody);

      sheetsUpdateCells(SHEET.LEADS, rowNum, [
        [COL.DRAFT_CREATED, todayString()],
        [COL.STATUS,        STATUS.DRAFT_CREATED],
      ]);

      // If sponsor is open to a meeting, also append meeting slots to the draft
      if (intent === 'wants_meeting') {
        handleMeetingRequest_(threadId, fromEmail, subject, companyName, draftBody, rowNum, cfg);
      }

      processed++;
    } catch (err) {
      console.error(`EmailReader: error processing thread ${thread.getId()}: ${err}`);
    }
  });

  console.log(`EmailReader: processed ${processed} sponsor replies`);
}

// ── Intent classification ─────────────────────────────────────────────────────

/**
 * Classify the sponsor's email intent.
 * Returns: 'wants_meeting' | 'propose_time' | 'general_reply' | 'decline'
 */
function classifyIntent_(body, cfg) {
  const lowerBody = body.toLowerCase();

  // Sponsor is declining
  const declineKeywords = ['不感興趣', '無法配合', '婉拒', '謝謝您的來信，但', '目前暫無贊助計畫'];
  if (declineKeywords.some(kw => lowerBody.includes(kw))) return 'decline';

  // Sponsor is proposing their own time slots
  const proposeKeywords = ['我這邊', '我方', '方便的時間', '可以約', '我可以', '這個時間'];
  const timePatterns    = [/\d{1,2}[/:]\d{2}/, /上午|下午|早上|晚上/, /週[一二三四五六日]/];
  const hasPropose      = proposeKeywords.some(kw => lowerBody.includes(kw));
  const hasTime         = timePatterns.some(p => p.test(lowerBody));
  if (hasPropose && hasTime) return 'propose_time';

  // Sponsor wants to schedule a meeting (asking us to propose times)
  const meetingKeywords = ['安排會議', '約個時間', '視訊', 'zoom', 'meet', '進一步了解', '有興趣'];
  if (meetingKeywords.some(kw => lowerBody.includes(kw))) return 'wants_meeting';

  return 'general_reply';
}

// ── Reply drafting ────────────────────────────────────────────────────────────

function draftReply_(companyName, incomingBody, intent, cfg) {
  const yitContext = sheetsGetYITContext();
  const systemPrompt = cfg.READER_SYSTEM_PROMPT.replace('{YIT_CONTEXT}', yitContext);

  const intentNote = {
    'wants_meeting':  '（對方有興趣進一步了解/安排會議）',
    'general_reply':  '（對方有一般性回覆）',
    'decline':        '（對方婉拒，請禮貌回應感謝對方的時間）',
    'propose_time':   '',
  }[intent] || '';

  const userMsg = `
公司名稱：${companyName}
對方來信內容：
${incomingBody}

請用繁體中文撰寫一封回覆草稿 ${intentNote}。
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

function handleMeetingRequest_(threadId, sponsorEmail, subject, companyName, existingDraft, rowNum, cfg) {
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

// ── Utility ───────────────────────────────────────────────────────────────────

/** Extract bare email address from a "Name <email>" header string. */
function extractEmailFromHeader_(fromHeader) {
  const match = (fromHeader || '').match(/<([^>]+)>/);
  return match ? match[1].toLowerCase().trim() : (fromHeader || '').toLowerCase().trim();
}
