/**
 * Agent 3 — Response Monitor
 * ===========================
 * Scans Gmail every 2 hours for sponsor replies.
 * Matches sender to sheet by exact email, then domain fallback.
 * Unmatched replies → Needs Human Review tab.
 * Returns array of matched response objects for ReplyDrafter.
 */

function runMonitor() {
  const cfg = getConfig();
  console.log('ResponseMonitor: checking Gmail for replies');

  const threads = gmailSearch('subject:YIT is:unread newer_than:30d');
  if (!threads.length) {
    console.log('ResponseMonitor: no unread replies found');
    return [];
  }

  // Build email → rowNum and domain → rowNum indices from leads sheet
  const { emailIndex, domainIndex } = buildLeadIndices_(cfg.LEADS_SHEET);

  const responses = [];

  threads.forEach(thread => {
    thread.getMessages().forEach(message => {
      if (!message.isUnread()) return;

      const fromRaw  = message.getFrom();       // e.g. "Boss <boss@company.com>"
      const fromEmail = extractEmail(fromRaw).toLowerCase();
      const subject  = message.getSubject();
      const body     = message.getPlainBody();

      // Try exact match, then domain fallback
      let match = emailIndex[fromEmail];
      if (!match) {
        const domain = emailDomain(fromEmail);
        match = domainIndex[domain];
      }

      if (match) {
        // Known sponsor — update sheet and queue for drafter
        sheetsUpdateCell(cfg.LEADS_SHEET, match.rowNum, COL.STATUS, STATUS.RESPONSE_RECV);
        sheetsUpdateCell(cfg.LEADS_SHEET, match.rowNum, COL.RESPONSE_DATE, todayString());
        gmailMarkAsRead(message);

        responses.push({
          companyName:  match.row[COL.COMPANY_NAME],
          companyEmail: match.row[COL.EMAIL],
          rowNum:       match.rowNum,
          sender:       fromRaw,
          subject:      subject,
          body:         body,
        });
      } else {
        // Unknown sender → human review
        sheetsAppendRow(cfg.REVIEW_SHEET, [
          fromEmail, fromEmail, '', STATUS.RESPONSE_RECV, todayString(),
          '', todayString(), '', '', 'Unmatched email reply', subject,
        ]);
        gmailMarkAsRead(message);
        console.warn(`ResponseMonitor: unmatched sender ${fromEmail} → Needs Human Review`);
      }
    });
  });

  console.log(`ResponseMonitor: ${responses.length} matched response(s)`);
  return responses;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildLeadIndices_(sheetName) {
  const rows = sheetsGetAllRows(sheetName);
  const emailIndex  = {};
  const domainIndex = {};

  rows.forEach((row, i) => {
    const email = (row[COL.EMAIL] || '').toString().toLowerCase().trim();
    if (!email) return;
    const entry = { row, rowNum: i + 2 };
    emailIndex[email] = entry;
    const domain = emailDomain(email);
    if (domain) domainIndex[domain] = entry;
  });

  return { emailIndex, domainIndex };
}
