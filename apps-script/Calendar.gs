/**
 * YIT PR Agent v2 — Calendar Service
 * =====================================
 * Find free slots (3 on 3 DIFFERENT days), create Calendar events.
 */

/**
 * Return up to maxSlots free 30-min slots, each on a DIFFERENT calendar day
 * (Taiwan date). Slots fall within the UK meeting window from config.
 *
 * @param {number} maxSlots Default 3
 * @returns {Array<{start: Date, end: Date, twDisplay: string}>}
 */
function calendarGetFreeSlots(maxSlots = 3) {
  const cfg = getConfig();
  const candidates = generateCandidateSlots_(cfg);
  const calendar   = CalendarApp.getDefaultCalendar();
  const free       = [];
  const usedDays   = new Set(); // Taiwan date strings already used

  for (const slot of candidates) {
    if (free.length >= maxSlots) break;

    // Enforce one slot per Taiwan calendar day
    const twDay = Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(slot.start);
    if (usedDays.has(twDay)) continue;

    // Check for calendar conflicts (returns events overlapping [start, end))
    const events = calendar.getEvents(slot.start, slot.end);
    if (events.length === 0) {
      slot.twDisplay = formatToTaiwanTime(slot.start);
      free.push(slot);
      usedDays.add(twDay);
    }
  }

  return free;
}

/**
 * Create a Google Calendar event and invite the sponsor (+ notification contacts).
 * @param {string} title
 * @param {Date}   startDate
 * @param {Date}   endDate
 * @param {string} sponsorEmail
 * @returns {{id, htmlLink}}
 */
function calendarCreateEvent(title, startDate, endDate, sponsorEmail) {
  const cfg = getConfig();
  const guestList = [sponsorEmail, cfg.NOTIFY_ERIC, cfg.NOTIFY_CHANEL]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i) // dedupe
    .join(',');

  const event = CalendarApp.getDefaultCalendar().createEvent(title, startDate, endDate, {
    guests: guestList,
    sendInvites: true,
  });

  return {
    id: event.getId(),
    htmlLink: `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(event.getId())}`,
  };
}

// ── Candidate slot generation ─────────────────────────────────────────────────

/**
 * Generate every 30-min slot (Mon–Fri) within the UK meeting window
 * for the upcoming DAYS_AHEAD_MIN … DAYS_AHEAD_MAX range.
 */
function generateCandidateSlots_(cfg) {
  const candidates = [];
  const now = new Date();

  for (let d = cfg.DAYS_AHEAD_MIN; d <= cfg.DAYS_AHEAD_MAX; d++) {
    const date = new Date(now.getTime() + d * 24 * 3_600_000);

    // Skip weekends (London timezone)
    const londonWeekday = Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', weekday: 'short',
    }).format(date);
    if (londonWeekday === 'Sat' || londonWeekday === 'Sun') continue;

    // London date components
    const londonParts = Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date).split('-').map(Number);
    const [year, month, day] = londonParts;

    // UK UTC offset (BST = +1, GMT = 0)
    const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0));
    const londonHour = parseInt(Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: '2-digit', hour12: false,
    }).format(noonUTC), 10);
    const ukOffsetHours = londonHour - 12;

    for (let hour = cfg.MEETING_START_HOUR_UK; hour < cfg.MEETING_END_HOUR_UK; hour++) {
      for (const minute of [0, 30]) {
        const slotStart = new Date(Date.UTC(year, month - 1, day, hour - ukOffsetHours, minute));
        const slotEnd   = new Date(slotStart.getTime() + 30 * 60_000);

        // Ensure slot ends before window closes
        const windowClose = new Date(Date.UTC(year, month - 1, day, cfg.MEETING_END_HOUR_UK - ukOffsetHours, 0));
        if (slotEnd <= windowClose && slotStart > now) {
          candidates.push({ start: slotStart, end: slotEnd });
        }
      }
    }
  }

  return candidates;
}

// ── Time formatting ───────────────────────────────────────────────────────────

/** Format a Date to Taiwan time for display in emails. */
function formatToTaiwanTime(date) {
  const parts = Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const g = type => (parts.find(p => p.type === type) || {}).value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('weekday')} ${g('hour')}:${g('minute')} 台灣時間`;
}

/** Today as YYYY-MM-DD (en-CA locale gives ISO format). */
function todayString() {
  return Intl.DateTimeFormat('en-CA').format(new Date());
}
