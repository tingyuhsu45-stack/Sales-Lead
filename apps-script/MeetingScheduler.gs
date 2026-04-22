/**
 * Agent 5 — Meeting Scheduler
 * ============================
 * proposeSlots()  — checks calendar, emails user available options (BCC'd)
 * bookMeeting()   — creates calendar event + sends invite, after user confirms
 *
 * All times shown in Taiwan time (UTC+8) in user-facing emails.
 * Never books without explicit user confirmation.
 */

/**
 * Check calendar and email user with available slots. Does NOT book.
 * Call this when a sponsor has expressed interest and you want to schedule.
 *
 * @param {string} companyName
 * @param {string} companyEmail
 * @param {number} rowNum - 1-based row number in leads sheet
 */
function proposeSlots(companyName, companyEmail, rowNum) {
  const cfg   = getConfig();
  const slots = calendarGetFreeSlots(3); // up to 3 options

  if (!slots.length) {
    notifyNoSlots_(companyName, cfg);
    return;
  }

  const subject = `[YIT] 請確認與 ${companyName} 的會議時間`;
  const lines = [
    `贊助商 ${companyName} 已表示有興趣，請選擇一個會議時段：`,
    '',
    ...slots.map((slot, i) => `選項 ${i + 1}: ${formatToTaiwanTime(slot.start)}`),
    '',
    '請回覆選項編號（例如「選項 1」）或指定其他時間。',
    '確認後系統將自動建立行事曆邀請並通知對方。',
    '',
    `贊助商 email: ${companyEmail}`,
    `Sheet row: ${rowNum}`,
    '',
    '── 可用時段（供系統使用）──',
    ...slots.map(slot => `START=${slot.start.toISOString()} END=${slot.end.toISOString()}`),
  ];

  gmailSend(cfg.USER_EMAIL, subject, lines.join('\n'), { bcc: cfg.BCC_EMAILS });
  console.log(`MeetingScheduler: proposed ${slots.length} slot(s) for ${companyName}`);
}

/**
 * Create calendar event and notify user. Only call after user confirms a slot.
 *
 * @param {string} companyName
 * @param {string} companyEmail
 * @param {number} rowNum
 * @param {Date|string} startDate - JS Date or ISO string
 * @param {Date|string} endDate
 */
function bookMeeting(companyName, companyEmail, rowNum, startDate, endDate) {
  const cfg   = getConfig();
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end   = endDate   instanceof Date ? endDate   : new Date(endDate);

  const event = calendarCreateEvent(
    `Meeting with ${companyName} - Sponsorship Discussion`,
    start, end, companyEmail
  );

  // Update sheet
  const sheetName = cfg.LEADS_SHEET;
  sheetsUpdateCell(sheetName, rowNum, COL.STATUS, STATUS.MEETING_SCHED);
  sheetsUpdateCell(sheetName, rowNum, COL.MEETING_DATETIME, start.toISOString());

  // Notify user
  const subject = `[YIT] 會議已確認 — ${companyName}`;
  const body = [
    `與 ${companyName} 的會議已建立。`,
    '',
    `時間: ${formatToTaiwanTime(start)}`,
    `贊助商 email: ${companyEmail}`,
    `行事曆連結: ${event.htmlLink}`,
  ].join('\n');

  gmailSend(cfg.USER_EMAIL, subject, body, { bcc: cfg.BCC_EMAILS });
  console.log(`MeetingScheduler: meeting booked with ${companyName} at ${start.toISOString()}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function notifyNoSlots_(companyName, cfg) {
  const startTW = computeTaiwanHour(cfg.MEETING_START_HOUR_UK);
  const endTW   = computeTaiwanHour(cfg.MEETING_END_HOUR_UK);

  const subject = `[YIT] 本週無空檔 — ${companyName}`;
  const body = [
    `系統在 ${cfg.DAYS_AHEAD_MIN}-${cfg.DAYS_AHEAD_MAX} 天內找不到可用的會議時段`,
    `（週一至週五 ${String(startTW).padStart(2,'0')}:00–${String(endTW).padStart(2,'0')}:00 台灣時間）。`,
    `請手動查看行事曆並與 ${companyName} 協調時間。`,
  ].join('\n');

  gmailSend(cfg.USER_EMAIL, subject, body, { bcc: cfg.BCC_EMAILS });
}
