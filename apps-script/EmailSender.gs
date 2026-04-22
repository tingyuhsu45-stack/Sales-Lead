/**
 * Agent 2 — Email Sender
 * =======================
 * Sends the HTML cold email to all STATUS.FOUND companies.
 * 30-second delay between sends. Retries up to 3 times on failure.
 * Sends user a summary when done.
 */

function runEmailSender() {
  const cfg  = getConfig();
  const rows = sheetsGetRowsByStatus(cfg.LEADS_SHEET, STATUS.FOUND);

  if (!rows.length) {
    console.log('EmailSender: no STATUS_FOUND leads to send.');
    return;
  }

  console.log(`EmailSender: sending to ${rows.length} companies`);
  const failed = [];

  rows.forEach(({ row, rowNum }, idx) => {
    if (idx > 0) Utilities.sleep(30000); // 30s rate-limit gap

    const companyName  = row[COL.COMPANY_NAME];
    const companyEmail = row[COL.EMAIL];

    const sent = sendWithRetry_(companyName, companyEmail, 3);
    if (sent) {
      markSent_(cfg.LEADS_SHEET, rowNum, cfg);
    } else {
      failed.push(`${companyName} <${companyEmail}>`);
    }
  });

  sendSummary_(rows.length, failed, cfg);
  console.log(`EmailSender: done. ${rows.length - failed.length} sent, ${failed.length} failed.`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sendWithRetry_(companyName, companyEmail, maxAttempts) {
  const { subject, html } = renderColdEmail(companyName);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      GmailApp.sendEmail(companyEmail, subject, '(HTML email)', { htmlBody: html });
      return true;
    } catch (err) {
      console.warn(`EmailSender: attempt ${attempt}/${maxAttempts} failed for ${companyEmail}: ${err}`);
      if (attempt < maxAttempts) Utilities.sleep(5000);
    }
  }
  return false;
}

function markSent_(sheetName, rowNum, cfg) {
  sheetsUpdateCell(sheetName, rowNum, COL.STATUS, STATUS.EMAIL_SENT);
  sheetsUpdateCell(sheetName, rowNum, COL.EMAIL_SENT_DATE, todayString());
}

function sendSummary_(total, failed, cfg) {
  const subject = '[YIT] 本週冷郵件發送完成';
  const body = [
    `成功: ${total - failed.length} 封`,
    `失敗: ${failed.length} 封`,
    ...(failed.length ? ['', '失敗名單:', ...failed] : []),
  ].join('\n');
  gmailSend(cfg.USER_EMAIL, subject, body);
}
