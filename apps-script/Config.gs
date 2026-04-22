/**
 * YIT PR Agent — Configuration
 * ==============================
 * All secrets live in Script Properties (no .env needed).
 * Run setScriptProperties() once from the Apps Script editor to configure.
 *
 * To view/edit: Apps Script Editor → Project Settings → Script Properties
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
 * Load all config from Script Properties.
 * Called at the top of each agent function — fast (one API call).
 */
function getConfig() {
  const p = PropertiesService.getScriptProperties().getProperties();
  return {
    USER_EMAIL:            p.USER_EMAIL            || '',
    TAVILY_API_KEY:        p.TAVILY_API_KEY        || '',
    LLM_API_KEY:           p.LLM_API_KEY           || '',
    LLM_PROVIDER:          p.LLM_PROVIDER          || 'openai',
    LLM_MODEL:             p.LLM_MODEL             || 'gpt-4o',
    SENDER_NAME:           p.SENDER_NAME           || '徐廷宇',
    SENDER_TITLE:          p.SENDER_TITLE          || '商業經理',
    SENDER_PHONE:          p.SENDER_PHONE          || '',
    PDF_LINK:              p.PDF_LINK              || 'https://drive.google.com/file/d/1J77LPg8EnuTR1dohNaTmlsElUal4Hzpv/view?usp=sharing',
    SPREADSHEET_ID:        p.SPREADSHEET_ID        || '',
    BCC_EMAILS:            (p.BCC_EMAILS || 'tingyuhsu45@gmail.com,chanelhwung94@gmail.com')
                             .split(',').map(e => e.trim()).filter(Boolean),
    LEADS_SHEET:           p.LEADS_SHEET           || 'YIT_Lead_Gen_Leads',
    CONTACTS_SHEET:        p.CONTACTS_SHEET        || '贊助廠商名單',
    REVIEW_SHEET:          p.REVIEW_SHEET          || 'Needs Human Review',
    MEETING_START_HOUR_UK: parseInt(p.MEETING_START_HOUR_UK || '7'),
    MEETING_END_HOUR_UK:   parseInt(p.MEETING_END_HOUR_UK   || '11'),
    DAYS_AHEAD_MIN:        parseInt(p.DAYS_AHEAD_MIN        || '3'),
    DAYS_AHEAD_MAX:        parseInt(p.DAYS_AHEAD_MAX        || '7'),
    WEEKLY_TARGET:         parseInt(p.WEEKLY_TARGET         || '20'),
  };
}

/**
 * Run this ONCE from the Apps Script editor (▶ Run → setScriptProperties)
 * to populate all required Script Properties.
 */
function setScriptProperties() {
  PropertiesService.getScriptProperties().setProperties({
    USER_EMAIL:       'youthimpacttw@gmail.com',
    TAVILY_API_KEY:   'YOUR_TAVILY_API_KEY',        // ← paste your key here
    LLM_API_KEY:      'YOUR_OPENAI_API_KEY',        // ← paste your key here
    LLM_PROVIDER:     'openai',
    LLM_MODEL:        'gpt-4o',
    SENDER_NAME:      '徐廷宇',
    SENDER_TITLE:     '商業經理',
    SENDER_PHONE:     '',
    PDF_LINK:         'https://drive.google.com/file/d/1J77LPg8EnuTR1dohNaTmlsElUal4Hzpv/view?usp=sharing',
    SPREADSHEET_ID:   '1XXYQUgbe11jYj2tMiEYlP3kaiv3xVA0JIim2dwwAiGE',
    BCC_EMAILS:       'tingyuhsu45@gmail.com,chanelhwung94@gmail.com',
    LEADS_SHEET:      'YIT_Lead_Gen_Leads',
    CONTACTS_SHEET:   '贊助廠商名單',
    REVIEW_SHEET:     'Needs Human Review',
    WEEKLY_TARGET:    '20',
    DAYS_AHEAD_MIN:   '3',
    DAYS_AHEAD_MAX:   '7',
    MEETING_START_HOUR_UK: '7',
    MEETING_END_HOUR_UK:   '11',
  });
  console.log('Script properties configured successfully.');
}
