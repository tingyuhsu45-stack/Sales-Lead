/**
 * YIT PR Agent v2 — Meeting Scheduler
 * ======================================
 * Books a confirmed meeting on Google Calendar after the sponsor confirms a slot.
 *
 * Flow:
 *   1. EmailReader detects "wants_meeting" → creates draft with 3 slots
 *   2. Sponsor replies confirming a slot
 *   3. EmailReader detects "propose_time" → notifies Eric + Chanel
 *   4. Team manually calls bookMeeting() to create the Calendar event
 *
 * previewFreeSlots() — call from editor to inspect available times.
 * bookMeeting()      — call after the sponsor confirms a time.
 */

/**
 * Book a confirmed meeting on Google Calendar.
 * Sends calendar invite to sponsor, Eric, and Chanel.
 *
 * @param {string} companyName  Display name for the event
 * @param {string} sponsorEmail Sponsor's email
 * @param {Date}   startDate    Meeting start
 * @param {Date}   endDate      Meeting end (optional — defaults to start + 30 min)
 */
function bookMeeting(companyName, sponsorEmail, startDate, endDate) {
  if (!endDate) {
    endDate = new Date(startDate.getTime() + 30 * 60_000);
  }

  const title = `YIT × ${companyName} — 贊助洽談`;
  const event  = calendarCreateEvent(title, startDate, endDate, sponsorEmail);

  const cfg    = getConfig();
  const twStart = formatToTaiwanTime(startDate);

  // Update LEADS sheet
  const lead = sheetsFindRowByEmail(SHEET.LEADS, sponsorEmail);
  if (lead) {
    sheetsUpdateCells(SHEET.LEADS, lead.rowNum, [
      [COL.MEETING_DATETIME, twStart],
      [COL.STATUS,           STATUS.MEETING_SCHED],
    ]);
  }

  // Notify Eric + Chanel
  const subject = `[YIT] 會議已確認：${companyName} — ${twStart}`;
  const body = [
    `會議標題：${title}`,
    `時間：${twStart}`,
    `贊助商：${companyName} <${sponsorEmail}>`,
    ``,
    `Google Calendar 連結：${event.htmlLink}`,
    ``,
    `已邀請：${sponsorEmail}、${cfg.NOTIFY_ERIC}、${cfg.NOTIFY_CHANEL}`,
  ].join('\n');

  gmailSend(cfg.NOTIFY_ERIC,   subject, body);
  gmailSend(cfg.NOTIFY_CHANEL, subject, body);

  console.log(`MeetingScheduler: booked "${title}" at ${twStart}`);
  console.log(`  Calendar: ${event.htmlLink}`);
  return event;
}

/**
 * Preview available meeting slots — call from the Apps Script editor.
 * Shows the next 3 free slots (on 3 different days) in Taiwan time.
 */
function previewFreeSlots() {
  const slots = calendarGetFreeSlots(3);
  if (!slots.length) {
    console.log('No free slots found in the configured window. Check DAYS_AHEAD_MIN/MAX and meeting hours in Settings.');
    return;
  }
  console.log(`Found ${slots.length} free slot(s) (Taiwan time):`);
  slots.forEach((s, i) => console.log(`  ${i + 1}. ${s.twDisplay}`));
}
