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
  const senderTitle = cfg.SENDER_TITLE || '營運經理';
  const senderPhone = cfg.SENDER_PHONE ? `電話：${cfg.SENDER_PHONE}\n` : '';
  const pdfLink     = cfg.PDF_LINK     || '';

  const subject = `邀請 ${companyName} 成為 Youth Impact Taiwan 教育夥伴`;

  const plain = [
    `${companyName} 您好，`,
    ``,
    `我是 Youth Impact Taiwan (YIT) 的${senderTitle} ${senderName}。冒昧寫信給您，是希望能邀請貴會成為我們推動教育平等的夥伴。`,
    ``,
    `在 YIT，我們看見的不只是偏鄉資源的缺口，還有青年世代改變社會的渴望。因此，我們搭建了一座橋樑，連結有抱負的青年志工與需要資源的偏鄉學童。`,
    ``,
    `過去兩年，這股「青年影響青年」的正向循環已服務全台超過 400 位學生。我們在偏鄉英文成長營收穫了孩子們 97% 的超高滿意度。`,
    ``,
    `為了將這份影響力延續到 2026 年，我們正在尋找認同此理念的企業夥伴，透過贊助或物資協力的方式，讓我們能將資源投入在擴大服務範圍上。`,
    ``,
    `不知最近是否方便與您約 30 分鐘線上聊聊？我很希望能聽聽您的建議，並分享更多我們的故事。`,
    ``,
    `非常期待有機會與您合作！`,
    ``,
    `${senderName} ${senderTitle}`,
    `青年啟航協會 | Youth Impact Taiwan`,
    `官網：https://www.youthimpacttaiwan.com`,
    senderPhone,
    pdfLink ? `點此查看YIT年度報告書 (PDF)：${pdfLink}` : '',
  ].filter(l => l !== null && l !== '').join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:15px;color:#222;line-height:1.85;max-width:620px;margin:0 auto;padding:28px 24px;">

  <p><strong>${companyName}</strong> 您好，</p>

  <p>我是 <strong>Youth Impact Taiwan (YIT)</strong> 的${senderTitle} <strong>${senderName}</strong>。冒昧寫信給您，是希望能邀請貴會成為我們推動教育平等的夥伴。</p>

  <p>在 YIT，我們看見的不只是偏鄉資源的缺口，還有青年世代改變社會的渴望。因此，我們搭建了一座橋樑，連結有抱負的青年志工與需要資源的偏鄉學童。</p>

  <p>過去兩年，這股「青年影響青年」的正向循環已服務全台超過 <strong>400 位學生</strong>。我們在偏鄉英文成長營收穫了孩子們 <strong>97% 的超高滿意度</strong>。</p>

  <p>為了將這份影響力延續到 2026 年，我們正在尋找認同此理念的企業夥伴，透過贊助或物資協力的方式，讓我們能將資源投入在擴大服務範圍上。</p>

  <p>不知最近是否方便與您約 <strong>30 分鐘線上聊聊</strong>？我很希望能聽聽您的建議，並分享更多我們的故事。</p>

  <p>非常期待有機會與您合作！</p>

  ${pdfLink ? `<p><a href="${pdfLink}" style="color:#1a73e8;">點此查看YIT年度報告書 (PDF)</a></p>` : ''}

  <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">
  <p style="font-size:13px;color:#555;line-height:1.7;">
    <strong>${senderName}</strong> ${senderTitle}<br>
    青年啟航協會 | Youth Impact Taiwan<br>
    官網：<a href="https://www.youthimpacttaiwan.com" style="color:#1a73e8;">www.youthimpacttaiwan.com</a><br>
    ${cfg.SENDER_PHONE ? `電話：${cfg.SENDER_PHONE}<br>` : ''}
    <a href="mailto:youthimpacttw@gmail.com" style="color:#1a73e8;">youthimpacttw@gmail.com</a>
  </p>

</body>
</html>`;

  return { subject, plain, html };
}
