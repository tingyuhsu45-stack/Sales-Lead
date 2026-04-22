/**
 * YIT PR Agent v2 — Email Sender
 * =================================
 * Sends cold HTML sponsorship emails to all LEADS with STATUS = 'found'.
 * Updates the sheet with sent date and new status.
 *
 * Run manually after approving the weekly finder list:
 *   Apps Script Editor → Run → sendEmailsJob
 */

function runEmailSender() {
  const cfg   = getConfig();
  const leads = sheetsGetRowsByStatus(SHEET.LEADS, STATUS.FOUND);

  if (!leads.length) {
    console.log('EmailSender: no leads with status "found"');
    return;
  }

  let sent = 0;
  leads.forEach(({ row, rowNum }) => {
    const name  = row[COL.COMPANY_NAME] || '';
    const email = row[COL.EMAIL]        || '';

    if (!email) {
      console.warn(`EmailSender: skipping row ${rowNum} — no email`);
      return;
    }

    try {
      const { subject, plain, html } = buildColdEmail_(name, cfg);
      gmailSend(email, subject, plain, { html });

      sheetsUpdateCells(SHEET.LEADS, rowNum, [
        [COL.STATUS,          STATUS.EMAIL_SENT],
        [COL.EMAIL_SENT_DATE, todayString()],
      ]);

      sent++;
      console.log(`EmailSender: sent to ${name} <${email}>`);
      Utilities.sleep(2000); // 2 s between sends — avoid rate limits
    } catch (err) {
      console.error(`EmailSender: failed for ${name} <${email}>: ${err}`);
    }
  });

  console.log(`EmailSender: ${sent} emails sent`);
}

// ── Cold email HTML template ──────────────────────────────────────────────────

function buildColdEmail_(companyName, cfg) {
  const senderName  = cfg.SENDER_NAME  || '徐廷宇';
  const senderTitle = cfg.SENDER_TITLE || '商業經理';
  const senderPhone = cfg.SENDER_PHONE ? `<br>電話：${cfg.SENDER_PHONE}` : '';
  const pdfLink     = cfg.PDF_LINK     || '';

  const subject = `Youth Impact Taiwan — 贊助合作邀請`;

  const plain = [
    `敬啟者，${companyName} 負責人您好，`,
    ``,
    `我是 Youth Impact Taiwan（YIT）的${senderTitle}${senderName}。`,
    ``,
    `Youth Impact Taiwan 是一個致力於連結台灣青年與全球機遇的非營利組織。我們每年舉辦多場培訓計畫、實習媒合與論壇活動，幫助台灣大學生發展國際視野與職場競爭力。`,
    ``,
    `我們誠摯邀請 ${companyName} 成為我們的贊助夥伴。透過贊助，貴公司將能：`,
    `- 提升品牌在台灣青年群體中的曝光度`,
    `- 展現企業社會責任（CSR）的具體實踐`,
    `- 優先接觸 YIT 優質學生資源，協助人才招募`,
    ``,
    pdfLink ? `贊助方案說明書：${pdfLink}` : '',
    ``,
    `期待能與貴公司進行進一步的洽談，請問您方便安排一個 30 分鐘的視訊簡報嗎？`,
    ``,
    `敬祝商祺，`,
    ``,
    `${senderName}`,
    `${senderTitle}`,
    `Youth Impact Taiwan`,
    `youthimpacttw@gmail.com`,
  ].filter(l => l !== null).join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.75;max-width:620px;margin:0 auto;padding:28px 24px;">

  <p>敬啟者，<strong>${companyName}</strong> 負責人您好，</p>

  <p>我是 <strong>Youth Impact Taiwan（YIT）</strong> 的${senderTitle} <strong>${senderName}</strong>。</p>

  <p>Youth Impact Taiwan 是一個致力於連結台灣青年與全球機遇的非營利組織。我們每年舉辦多場培訓計畫、實習媒合與論壇活動，幫助台灣大學生發展國際視野與職場競爭力。</p>

  <p>我們誠摯邀請 <strong>${companyName}</strong> 成為我們的贊助夥伴。透過贊助，貴公司將能：</p>
  <ul style="padding-left:20px;">
    <li>提升品牌在台灣青年群體中的曝光度</li>
    <li>展現企業社會責任（CSR）的具體實踐</li>
    <li>優先接觸 YIT 優質學生資源，協助人才招募</li>
  </ul>

  ${pdfLink ? `<p><a href="${pdfLink}" style="color:#1a73e8;">贊助方案說明書（點此查看）</a></p>` : ''}

  <p>期待能與貴公司進行進一步的洽談，請問您方便安排一個 <strong>30 分鐘的視訊簡報</strong> 嗎？</p>

  <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">
  <p style="font-size:13px;color:#666;">
    <strong>${senderName}</strong><br>
    ${senderTitle}，Youth Impact Taiwan${senderPhone}<br>
    <a href="mailto:youthimpacttw@gmail.com" style="color:#1a73e8;">youthimpacttw@gmail.com</a>
  </p>

</body>
</html>`;

  return { subject, plain, html };
}
