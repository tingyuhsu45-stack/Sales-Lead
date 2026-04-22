/**
 * YIT PR Agent v2 — One-time Setup
 * ==================================
 * Creates the Google Spreadsheet with all required tabs, headers, default
 * Settings rows (including agent prompts), and time-based triggers.
 *
 * Run order (once, from Apps Script editor):
 *   1. setScriptProperties()   — paste API keys + email first
 *   2. runSetup()              — creates spreadsheet + triggers
 *
 * Safe to re-run — checks for existing spreadsheet before creating a new one.
 */

// ── LEADS columns ─────────────────────────────────────────────────────────────
const LEADS_HEADERS = [
  'Company Name (TC)',   // A
  'Contact Email',       // B
  'Website',             // C
  'Status',              // D
  'Date Added',          // E
  'Cold Email Sent',     // F
  'Reply Date',          // G
  'Draft Created',       // H
  'Meeting Date/Time',   // I
  'Source',              // J
  'Review Reason',       // K
  'Notes',               // L
];

const REVIEW_HEADERS = [
  'Company Name (TC)', 'Contact Email', 'Website', 'Status',
  'Date Added', 'Review Reason', 'Notes',
];

const CONTEXT_HEADERS = ['Category', 'Content'];

// ── Settings rows: [Key, Value, Description] ─────────────────────────────────
// Rows starting with '===' are section separators (no value, spans full row).
const SETTINGS_ROWS = [
  // ── General ──────────────────────────────────────────────────────────────
  ['=== GENERAL ===', '', ''],
  ['MONITOR_INTERVAL_HOURS', '2',
    'How often to scan Gmail for sponsor replies (hours). Min 1.'],

  // ── Company Finder ────────────────────────────────────────────────────────
  ['=== COMPANY FINDER ===', '', ''],
  ['WEEKLY_TARGET', '20',
    'Number of new companies to find per week'],
  ['SEARCH_QUERY_1', '台灣中型企業 企業社會責任 贊助 聯絡信箱 官方網站',
    'Tavily search query 1'],
  ['SEARCH_QUERY_2', '台灣中小企業 官方網站 企業聯絡 電子郵件',
    'Tavily search query 2'],
  ['SEARCH_QUERY_3', 'Taiwan mid-size company sponsorship CSR contact email site:com.tw',
    'Tavily search query 3 (English)'],
  ['SEARCH_QUERY_4', '台灣科技公司 中小企業 聯絡我們 電子郵件',
    'Tavily search query 4'],
  ['FINDER_PROMPT',
    DEFAULT_PROMPTS.FINDER_PROMPT,
    'AI prompt for Company Finder — edit to change search behaviour'],

  // ── Email Reader ──────────────────────────────────────────────────────────
  ['=== EMAIL READER ===', '', ''],
  ['READER_SYSTEM_PROMPT',
    DEFAULT_PROMPTS.READER_SYSTEM_PROMPT,
    'AI system prompt for drafting sponsor replies — edit to change tone / rules'],

  // ── Meeting Scheduler ─────────────────────────────────────────────────────
  ['=== MEETING SCHEDULER ===', '', ''],
  ['MEETING_START_HOUR_UK', '7',
    'Meeting window start — UK time (7 = 14:00 Taiwan BST / 15:00 Taiwan GMT)'],
  ['MEETING_END_HOUR_UK', '11',
    'Meeting window end — UK time (11 = 18:00 Taiwan BST / 19:00 Taiwan GMT)'],
  ['DAYS_AHEAD_MIN', '3',
    'Minimum days ahead when proposing meeting slots'],
  ['DAYS_AHEAD_MAX', '14',
    'Maximum days ahead when proposing meeting slots'],
  ['SCHEDULER_PROMPT',
    DEFAULT_PROMPTS.SCHEDULER_PROMPT,
    'AI prompt for composing meeting invitation emails — edit as needed'],

  // ── Notifications ─────────────────────────────────────────────────────────
  ['=== NOTIFICATIONS ===', '', ''],
  ['NOTIFY_ERIC',   'tingyuhsu45@gmail.com',
    'Eric\'s email — notified when sponsor proposes a meeting time'],
  ['NOTIFY_CHANEL', 'chanelhwung94@gmail.com',
    'Chanel\'s email — notified when sponsor proposes a meeting time'],
];


/**
 * Main entry point — run once to bootstrap everything.
 */
function runSetup() {
  const props = PropertiesService.getScriptProperties();

  // --- 1. Create (or reuse) the spreadsheet ---
  let spreadsheetId = props.getProperty('SPREADSHEET_ID') || '';
  let ss;

  if (spreadsheetId) {
    try {
      ss = SpreadsheetApp.openById(spreadsheetId);
      console.log(`Reusing existing spreadsheet: ${spreadsheetId}`);
    } catch (_) {
      spreadsheetId = '';
    }
  }

  if (!spreadsheetId) {
    ss = SpreadsheetApp.create('YIT PR Agent — Sponsorship Pipeline');
    spreadsheetId = ss.getId();
    props.setProperty('SPREADSHEET_ID', spreadsheetId);
    console.log(`Created new spreadsheet: ${spreadsheetId}`);
  }

  // --- 2. Create / reset all tabs ---
  createOrResetSheet_(ss, SHEET.LEADS,    LEADS_HEADERS);
  createOrResetSheet_(ss, SHEET.REVIEW,   REVIEW_HEADERS);
  createOrResetSheet_(ss, SHEET.CONTEXT,  CONTEXT_HEADERS);
  createSettingsSheet_(ss);

  // Remove the default empty "Sheet1" if it still exists
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  // --- 3. Create triggers ---
  setupTriggers_();

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  console.log(`\nSetup complete!`);
  console.log(`Spreadsheet: ${url}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Open the spreadsheet and fill in the YIT_Context tab`);
  console.log(`  2. Triggers are active — system runs automatically`);
  console.log(`  3. To send emails manually, run sendEmailsJob()`);
}

// ── Sheet creation helpers ────────────────────────────────────────────────────

function createOrResetSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }
  // Write header
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground('#4a86e8').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  console.log(`  Sheet "${name}" ready`);
}

function createSettingsSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET.SETTINGS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.SETTINGS);
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }

  // Header row
  const HEADER = ['Key', 'Value (edit this column)', 'Description'];
  sheet.getRange(1, 1, 1, 3).setValues([HEADER])
    .setBackground('#4a86e8').setFontColor('#ffffff').setFontWeight('bold');

  // Write all settings rows starting at row 2
  sheet.getRange(2, 1, SETTINGS_ROWS.length, 3).setValues(SETTINGS_ROWS);

  // Style section headers (rows where key starts with '===')
  SETTINGS_ROWS.forEach((row, i) => {
    const rowNum = i + 2;
    if (row[0].startsWith('===')) {
      sheet.getRange(rowNum, 1, 1, 3)
        .setBackground('#d9d9d9').setFontWeight('bold').setFontColor('#333333');
      sheet.getRange(rowNum, 1, 1, 3).mergeAcross();
      sheet.getRange(rowNum, 1).setValue(row[0]).setHorizontalAlignment('center');
    } else {
      sheet.getRange(rowNum, 1).setBackground('#f8f9fa').setFontColor('#555555'); // Key
      sheet.getRange(rowNum, 3).setBackground('#f8f9fa').setFontColor('#999999'); // Desc
      sheet.getRange(rowNum, 2).setBackground('#ffffff'); // Value — editable
    }
  });

  // Protect Key + Description columns; leave Value column editable
  const protection = sheet.protect().setDescription('Settings — edit Column B only');
  const me = Session.getEffectiveUser();
  protection.addEditor(me);
  protection.removeEditors(protection.getEditors());
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
  const valueCol = sheet.getRange(2, 2, SETTINGS_ROWS.length, 1);
  protection.setUnprotectedRanges([valueCol]);

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 3);
  sheet.setColumnWidth(2, 450);
  sheet.setColumnWidth(3, 350);

  console.log(`  Sheet "${SHEET.SETTINGS}" ready`);
}

// ── Trigger management ────────────────────────────────────────────────────────

function setupTriggers_() {
  // Delete all existing triggers first
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Weekly finder: every Monday at 09:00 UK time
  ScriptApp.newTrigger('weeklyFinderJob')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  // Monitor: fires every hour (actual interval controlled by Settings sheet)
  ScriptApp.newTrigger('monitorJob')
    .timeBased()
    .everyHours(1)
    .create();

  console.log('  Triggers created: weeklyFinderJob (Mon 09:00 UK), monitorJob (hourly)');
}

/** Stop the system — delete all triggers. */
function deleteTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log('All triggers deleted.');
}

/** List current triggers. */
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.length) { console.log('No triggers configured.'); return; }
  triggers.forEach(t =>
    console.log(`  ${t.getHandlerFunction()} — ${t.getTriggerSource()} ${t.getEventType()}`)
  );
}
