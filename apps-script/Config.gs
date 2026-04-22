/**
 * YIT PR Agent — Configuration
 * ==============================
 * Two-tier config:
 *   Tier 1 — Script Properties  (secrets: API keys, email, spreadsheet ID)
 *   Tier 2 — Settings Sheet     (runtime config: queries, intervals, hours…)
 *
 * Settings Sheet values OVERRIDE Script Properties for runtime configs.
 * Secrets always come from Script Properties only (never the sheet).
 *
 * To change runtime settings: open the Google Sheet → Settings tab → edit Column B.
 * To change secrets: Apps Script Editor → Project Settings → Script Properties.
 *
 * Run setScriptProperties() once to seed all secrets.
 * Run setupSettingsSheet() once to create the Settings tab in your sheet.
 */

// ── Sheet column indices (0-based) ──────────────────────────────────────────
const COL = {
  COMPANY_NAME:    0,
  EMAIL:           1,
  WEBSITE:         2,
  STATUS:          3,
  DATE_FOUND:      4,
  EMAIL_SENT_DATE: 5,
  RESPONSE_DATE:   6,
  REPLY_STATUS:    7,
  MEETING_DATETIME:8,
  REVIEW_REASON:   9,
  NOTES:           10,
};

// ── Status values ────────────────────────────────────────────────────────────
const STATUS = {
  FOUND:          'found',
  NEEDS_REVIEW:   'needs_human_review',
  EMAIL_SENT:     'email_sent',
  RESPONSE_RECV:  'response_received',
  REPLY_DRAFTED:  'reply_drafted_awaiting_approval',
  REPLY_SENT:     'reply_sent',
  MEETING_SCHED:  'meeting_scheduled',
};

/**
 * Merge Script Properties (secrets) + Settings sheet (runtime config).
 * Settings sheet wins for overlapping non-secret keys.
 */
function getConfig() {
  const p = PropertiesService.getScriptProperties().getProperties();
  const s = getSettings(); // reads from the Settings sheet

  // Helper: Settings sheet → Script Properties → hardcoded default
  const get = (key, def) => (s[key] !== undefined ? s[key] : (p[key] || def));

  // Build SEARCH_QUERIES array from SEARCH_QUERY_1 … SEARCH_QUERY_N
  const searchQueries = [];
  for (let i = 1; i <= 10; i++) {
    const q = s[`SEARCH_QUERY_${i}`] || p[`SEARCH_QUERY_${i}`] || '';
    if (q) searchQueries.push(q);
  }

  return {
    // ── Secrets (Script Properties only — never the sheet) ────────────────
    USER_EMAIL:      p.USER_EMAIL      || '',
    TAVILY_API_KEY:  p.TAVILY_API_KEY  || '',
    LLM_API_KEY:     p.LLM_API_KEY     || '',
    LLM_PROVIDER:    p.LLM_PROVIDER    || 'openai',
    LLM_MODEL:       p.LLM_MODEL       || 'gpt-4o',
    SPREADSHEET_ID:  p.SPREADSHEET_ID  || '',
    SENDER_NAME:     p.SENDER_NAME     || '徐廷宇',
    SENDER_TITLE:    p.SENDER_TITLE    || '商業經理',
    SENDER_PHONE:    p.SENDER_PHONE    || '',
    PDF_LINK:        p.PDF_LINK        || 'https://drive.google.com/file/d/1J77LPg8EnuTR1dohNaTmlsElUal4Hzpv/view?usp=sharing',

    // ── Runtime config (Settings sheet overrides Script Properties) ───────
    BCC_EMAILS: get('BCC_EMAILS', 'tingyuhsu45@gmail.com,chanelhwung94@gmail.com')
                  .split(',').map(e => e.trim()).filter(Boolean),
    LEADS_SHEET:            get('LEADS_SHEET',    'YIT_Lead_Gen_Leads'),
    CONTACTS_SHEET:         get('CONTACTS_SHEET', '贊助廠商名單'),
    REVIEW_SHEET:           get('REVIEW_SHEET',   'Needs Human Review'),
    WEEKLY_TARGET:          parseInt(get('WEEKLY_TARGET',           '20')),
    MONITOR_INTERVAL_HOURS: parseInt(get('MONITOR_INTERVAL_HOURS',  '2')),
    MEETING_START_HOUR_UK:  parseInt(get('MEETING_START_HOUR_UK',   '7')),
    MEETING_END_HOUR_UK:    parseInt(get('MEETING_END_HOUR_UK',     '11')),
    DAYS_AHEAD_MIN:         parseInt(get('DAYS_AHEAD_MIN',          '3')),
    DAYS_AHEAD_MAX:         parseInt(get('DAYS_AHEAD_MAX',          '7')),

    // Search queries from Settings sheet rows SEARCH_QUERY_1 … SEARCH_QUERY_N
    SEARCH_QUERIES: searchQueries.length > 0 ? searchQueries : [
      '台灣中型企業 企業社會責任 贊助 聯絡信箱 官方網站',
      '台灣中小企業 官方網站 企業聯絡 電子郵件',
      'Taiwan mid-size company sponsorship CSR contact email site:com.tw',
      '台灣科技公司 中小企業 聯絡我們 電子郵件',
    ],
  };
}

/**
 * Run ONCE from the Apps Script editor (▶ Run → setScriptProperties).
 * Seeds all secrets into Script Properties.
 */
function setScriptProperties() {
  PropertiesService.getScriptProperties().setProperties({
    USER_EMAIL:      'youthimpacttw@gmail.com',
    TAVILY_API_KEY:  'YOUR_TAVILY_API_KEY',   // ← paste real key
    LLM_API_KEY:     'YOUR_OPENAI_API_KEY',   // ← paste real key
    LLM_PROVIDER:    'openai',
    LLM_MODEL:       'gpt-4o',
    SENDER_NAME:     '徐廷宇',
    SENDER_TITLE:    '商業經理',
    SENDER_PHONE:    '',
    PDF_LINK:        'https://drive.google.com/file/d/1J77LPg8EnuTR1dohNaTmlsElUal4Hzpv/view?usp=sharing',
    SPREADSHEET_ID:  '1XXYQUgbe11jYj2tMiEYlP3kaiv3xVA0JIim2dwwAiGE',
  });
  console.log('Script properties set. Now run setupSettingsSheet() to create the Settings tab.');
}
