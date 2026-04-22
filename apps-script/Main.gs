/**
 * YIT PR Agent — Orchestrator
 * ============================
 *
 * FIRST-TIME SETUP (run each function once in order from the Apps Script editor):
 *   1. setScriptProperties()   — saves API keys + spreadsheet ID
 *   2. setupSettingsSheet()    — creates the Settings tab in your Google Sheet
 *   3. setupTriggers()         — starts the weekly + hourly schedule
 *
 * CHANGE SETTINGS: open your Google Sheet → Settings tab → edit Column B.
 *   Changes take effect immediately on the next trigger run — no code edits needed.
 *
 * STOP THE SYSTEM:
 *   Run deleteTriggers(), or: Apps Script Editor → Triggers (clock icon) → delete all.
 *
 * MANUAL RUNS (any time):
 *   weeklyFinderJob()  — find new companies now
 *   sendEmailsJob()    — send cold emails to all approved (STATUS=found) leads
 *   monitorJob()       — scan Gmail for replies now (bypasses interval check)
 */

// ── Scheduled job functions ───────────────────────────────────────────────────

/**
 * Weekly job: find companies → save to sheet → email user for approval.
 * Triggered every Monday 09:00 UK time.
 */
function weeklyFinderJob() {
  try {
    runWeeklyFinder();
  } catch (err) {
    console.error(`weeklyFinderJob failed: ${err}\n${err.stack}`);
    notifyError_('Weekly Finder', err);
  }
}

/**
 * Hourly trigger — respects MONITOR_INTERVAL_HOURS from Settings sheet.
 * Skips the run if not enough time has passed since the last scan.
 * Change the interval in the Settings sheet without touching code.
 */
function monitorJob() {
  const cfg           = getConfig();
  const intervalHours = cfg.MONITOR_INTERVAL_HOURS || 2;
  const props         = PropertiesService.getScriptProperties();
  const lastRunStr    = props.getProperty('LAST_MONITOR_RUN');

  if (lastRunStr) {
    const hoursSinceLast = (Date.now() - new Date(lastRunStr).getTime()) / 3_600_000;
    if (hoursSinceLast < intervalHours - 0.05) { // 3-min tolerance
      console.log(`monitorJob: skipping — ${hoursSinceLast.toFixed(2)}h since last run (interval: ${intervalHours}h)`);
      return;
    }
  }

  props.setProperty('LAST_MONITOR_RUN', new Date().toISOString());

  try {
    const responses = runMonitor();
    if (responses && responses.length) {
      responses.forEach(response => {
        try {
          runReplyDrafter(response);
        } catch (err) {
          console.error(`ReplyDrafter failed for ${response.companyName}: ${err}`);
        }
      });
    }
  } catch (err) {
    console.error(`monitorJob failed: ${err}\n${err.stack}`);
    notifyError_('Response Monitor', err);
  }
}

/**
 * Manual trigger: send cold emails to all STATUS=found leads.
 * Run this after you reply "確認" to the weekly finder email.
 */
function sendEmailsJob() {
  try {
    runEmailSender();
  } catch (err) {
    console.error(`sendEmailsJob failed: ${err}\n${err.stack}`);
    notifyError_('Email Sender', err);
  }
}


// ── Setup functions ───────────────────────────────────────────────────────────

/**
 * Creates the Settings tab in your Google Sheet with all editable config.
 * Run once after setScriptProperties().
 * Safe to re-run — overwrites the tab with fresh defaults if it already exists.
 */
function setupSettingsSheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID not set — run setScriptProperties() first.');

  const ss = SpreadsheetApp.openById(id);
  let sheet = ss.getSheetByName('Settings');
  if (!sheet) {
    sheet = ss.insertSheet('Settings');
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }

  const HEADER = ['Key', 'Value (edit this column)', 'Description'];
  const ROWS = [
    // ── Gmail scanning ──────────────────────────────────────────────────────
    ['MONITOR_INTERVAL_HOURS', '2',
      'How often to scan Gmail for sponsor replies (hours). Min 1.'],

    // ── Company Finder — search queries ─────────────────────────────────────
    ['SEARCH_QUERY_1', '台灣中型企業 企業社會責任 贊助 聯絡信箱 官方網站',
      'Tavily search query 1 (edit or add up to SEARCH_QUERY_10)'],
    ['SEARCH_QUERY_2', '台灣中小企業 官方網站 企業聯絡 電子郵件',
      'Tavily search query 2'],
    ['SEARCH_QUERY_3', 'Taiwan mid-size company sponsorship CSR contact email site:com.tw',
      'Tavily search query 3 (English)'],
    ['SEARCH_QUERY_4', '台灣科技公司 中小企業 聯絡我們 電子郵件',
      'Tavily search query 4'],

    // ── Company Finder — volume ──────────────────────────────────────────────
    ['WEEKLY_TARGET', '20',
      'Number of new companies to find per week'],

    // ── Meeting scheduler ────────────────────────────────────────────────────
    ['MEETING_START_HOUR_UK', '7',
      'Meeting window start — UK time (7 = 14:00 Taiwan BST / 15:00 Taiwan GMT)'],
    ['MEETING_END_HOUR_UK', '11',
      'Meeting window end — UK time (11 = 18:00 Taiwan BST / 19:00 Taiwan GMT)'],
    ['DAYS_AHEAD_MIN', '3',
      'Minimum days ahead when proposing meeting slots'],
    ['DAYS_AHEAD_MAX', '7',
      'Maximum days ahead when proposing meeting slots'],

    // ── Email / notifications ────────────────────────────────────────────────
    ['BCC_EMAILS', 'tingyuhsu45@gmail.com,chanelhwung94@gmail.com',
      'BCC on all meeting emails — comma-separated'],
  ];

  // Write header + data
  sheet.getRange(1, 1, 1, 3).setValues([HEADER]);
  sheet.getRange(2, 1, ROWS.length, 3).setValues(ROWS);

  // Style header
  const headerRange = sheet.getRange(1, 1, 1, 3);
  headerRange.setBackground('#4a86e8').setFontColor('#ffffff').setFontWeight('bold');

  // Style Key column (read-only look)
  sheet.getRange(2, 1, ROWS.length, 1).setBackground('#f8f9fa').setFontColor('#555555');

  // Style Description column (greyed out)
  sheet.getRange(2, 3, ROWS.length, 1).setBackground('#f8f9fa').setFontColor('#999999');

  // Style Value column (editable — white background, bold hint)
  sheet.getRange(2, 2, ROWS.length, 1).setBackground('#ffffff');

  // Protect Key + Description columns so only Value is easily editable
  const protection = sheet.protect().setDescription('Settings — edit Column B only');
  const me = Session.getEffectiveUser();
  protection.addEditor(me);
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
  // Unprotect the Value column so user can edit it
  const valueCol = sheet.getRange(2, 2, ROWS.length, 1);
  protection.setUnprotectedRanges([valueCol]);

  sheet.autoResizeColumns(1, 3);
  sheet.setColumnWidth(2, 400); // value column wider

  console.log('Settings sheet created. Open your Google Sheet → Settings tab to edit config.');
}


// ── Trigger management ────────────────────────────────────────────────────────

/**
 * Creates the two automatic triggers. Run once.
 * Deletes existing triggers first — safe to re-run.
 */
function setupTriggers() {
  deleteTriggers();

  // Weekly finder: every Monday at 09:00 in Europe/London (script timezone)
  ScriptApp.newTrigger('weeklyFinderJob')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  // Monitor: fires every hour — actual interval controlled by Settings sheet
  // Change MONITOR_INTERVAL_HOURS in the Settings tab to adjust frequency.
  ScriptApp.newTrigger('monitorJob')
    .timeBased()
    .everyHours(1)
    .create();

  console.log('Triggers created:');
  console.log('  weeklyFinderJob — every Monday 09:00 UK time');
  console.log('  monitorJob      — hourly (respects MONITOR_INTERVAL_HOURS from Settings sheet)');
}

/** Removes all project triggers. Stops the system. */
function deleteTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log('All triggers deleted.');
}

/** Lists current triggers. */
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.length) { console.log('No triggers configured.'); return; }
  triggers.forEach(t =>
    console.log(`  ${t.getHandlerFunction()} — ${t.getTriggerSource()} ${t.getEventType()}`)
  );
}


// ── Error notification ────────────────────────────────────────────────────────

function notifyError_(agentName, err) {
  try {
    const email = PropertiesService.getScriptProperties().getProperty('USER_EMAIL');
    if (email) GmailApp.sendEmail(email, `[YIT ERROR] ${agentName} failed`,
      `Agent: ${agentName}\nError: ${err}\n\nStack:\n${err.stack || '(no stack)'}`);
  } catch (_) { /* don't let error notification crash */ }
}
