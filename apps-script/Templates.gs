/**
 * YIT PR Agent — Cold Email Template
 * =====================================
 * Renders the HTML cold outreach email.
 * @param {string} orgName - Company name in Traditional Chinese
 * @returns {{ subject: string, html: string }}
 */
function renderColdEmail(orgName) {
  const cfg = getConfig();
  const phoneDisplay = cfg.SENDER_PHONE.trim()
    ? `<br>${cfg.SENDER_PHONE}`
    : '';

  const subject = `【YIT 合作邀請】與 ${orgName} 攜手 Youth Impact Taiwan：連結熱血青年與偏鄉學童，共創教育影響力`;

  const html = `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333333;">
  <p>${orgName}您好，</p>

  <p>我是 Youth Impact Taiwan (YIT) 的${cfg.SENDER_TITLE} ${cfg.SENDER_NAME}。冒昧寫信給您，是希望能邀請 <strong>${orgName}</strong> 成為我們推動教育平等的夥伴。</p>

  <p>在 YIT，我們看見的不只是偏鄉資源的缺口，還有青年世代改變社會的渴望。因此，我們搭建了一座橋樑，連結有抱負的青年志工與需要資源的偏鄉學童。透過我們的計畫，青年志工走進偏鄉教英文、帶活動。這不僅補足了城鄉資源的落差，更重要的是，這群志工成為了孩子們的榜樣，而志工本身也在服務中蛻變為更有擔當的領袖。</p>

  <p>過去兩年，這股「青年影響青年」的正向循環已服務全台超過 400 位學生。我們在偏鄉英文成長營收穫了孩子們 97% 的超高滿意度，並在一對一學伴計畫（Turtle Talk）上也獲得了極大的回響。</p>

  <p>為了將這份影響力延續到 2026 年，我們正在尋找認同此理念的企業夥伴，透過贊助或物資協力的方式，讓我們能將資源投入在擴大服務範圍上。</p>

  <p>不知最近是否方便與您約 30 分鐘線上聊聊？我很希望能聽聽您的建議，並分享更多我們的故事。</p>

  <p>非常期待有機會與您合作！</p>

  <p style="margin-top: 30px;">
    <strong>${cfg.SENDER_NAME}</strong> ${cfg.SENDER_TITLE}<br>
    青年啟航協會 | Youth Impact Taiwan${phoneDisplay}<br>
    官網：<a href="https://www.youthimpacttaiwan.com" style="color: #1a73e8; text-decoration: none;">https://www.youthimpacttaiwan.com</a>
  </p>

  <p style="margin-top: 20px;">
    <b><a href="${cfg.PDF_LINK}" target="_blank" style="color: #1a73e8;">點此查看 YIT 年度報告書 (PDF)</a></b>
  </p>
</div>`;

  return { subject, html };
}
