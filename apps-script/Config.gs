/**
 * YIT PR Agent v2 — Configuration
 * =================================
 * Two-tier config:
 *   Tier 1 — Script Properties  (secrets: API keys, email, spreadsheet ID)
 *   Tier 2 — Settings Sheet     (runtime config + agent prompts)
 *
 * Settings Sheet values OVERRIDE Script Properties for non-secret keys.
 *
 * HOW TO SET SECRETS (run once):
 *   Apps Script Editor → Run → setScriptProperties
 *
 * HOW TO CHANGE RUNTIME CONFIG / PROMPTS:
 *   Open your Google Sheet → Settings tab → edit Column B
 */

// ── Sheet names ──────────────────────────────────────────────────────────────
const SHEET = {
  LEADS:   'LEADS',
  REVIEW:  'Needs Human Review',
  CONTEXT: 'YIT_Context',
  SETTINGS:'Settings',
};

// ── LEADS column indices (0-based) ───────────────────────────────────────────
const COL = {
  COMPANY_NAME:    0,   // A
  EMAIL:           1,   // B
  WEBSITE:         2,   // C
  STATUS:          3,   // D
  DATE_ADDED:      4,   // E
  EMAIL_SENT_DATE: 5,   // F
  REPLY_DATE:      6,   // G
  DRAFT_CREATED:   7,   // H
  MEETING_DATETIME:8,   // I
  SOURCE:          9,   // J
  REVIEW_REASON:  10,   // K
  NOTES:          11,   // L
};

// ── Status values ─────────────────────────────────────────────────────────────
const STATUS = {
  FOUND:          'found',
  NEEDS_REVIEW:   'needs_human_review',
  EMAIL_SENT:     'email_sent',
  REPLIED:        'replied',
  DRAFT_CREATED:  'draft_created',
  MEETING_SCHED:  'meeting_scheduled',
};

// ── Default agent prompts (pre-populated into Settings sheet) ─────────────────
const DEFAULT_PROMPTS = {
  FINDER_PROMPT: `你是一個專門尋找台灣中型企業的研究助理。
你的目標是找到有可能成為Youth Impact Taiwan贊助商的台灣中型企業。
尋找標準：
- 企業規模：中型（員工50-500人）
- 行業：科技、金融、製造、零售、服務業
- 企業文化：重視CSR（企業社會責任）、教育、青年發展
- 聯絡資訊：有官方聯絡信箱
輸出格式：每家公司一行，格式為「公司名稱 | Email | 官網」。
不得捏造電子郵件地址。如果找不到Email，請填寫「未找到」。`,

  READER_SYSTEM_PROMPT: `你是Youth Impact Taiwan的贊助回覆助理。
你正在草擬回覆台灣企業對YIT贊助邀請的回覆郵件。

重要規則：
1. 只使用YIT_Context表格中的資訊回答問題，不得捏造任何數據或事實。
2. 如果不知道答案，請寫「[NEEDS HUMAN INPUT: 請補充關於XXX的資訊]」。
3. 語氣要專業、友善、有誠意，體現Youth Impact Taiwan的使命。
4. 回覆用繁體中文，格式清晰。
5. 如果對方問到具體的贊助金額、活動日期或其他敏感資訊，請寫「[NEEDS HUMAN INPUT: ...]」。

YIT背景資訊：
{YIT_CONTEXT}`,

  SCHEDULER_PROMPT: `你是Youth Impact Taiwan的會議安排助理。
根據以下可用時間段，用繁體中文撰寫一封會議邀請郵件。

要求：
1. 提供3個不同日期的時間選項（30分鐘視訊會議）
2. 時間以台灣時間（UTC+8）顯示
3. 語氣友善、專業
4. 說明是透過Google Meet進行視訊會議
5. 請對方回覆確認哪個時間方便

可用時間段（台灣時間）：
{SLOTS}

公司名稱：{COMPANY_NAME}`,
};

/**
 * Merge Script Properties (secrets) + Settings sheet (runtime config).
 * @returns {Object} Merged config object
 */
function getConfig() {
  const p = PropertiesService.getScriptProperties().getProperties();
  const s = getSettingsMap_();

  const get = (key, def) => (s[key] !== undefined && s[key] !== '') ? s[key] : (p[key] || def);

  // Build SEARCH_QUERIES array from SEARCH_QUERY_1 … SEARCH_QUERY_10
  const searchQueries = [];
  for (let i = 1; i <= 10; i++) {
    const q = s[`SEARCH_QUERY_${i}`] || p[`SEARCH_QUERY_${i}`] || '';
    if (q && !q.startsWith('===')) searchQueries.push(q);
  }

  return {
    // ── Secrets (Script Properties only) ────────────────────────────────────
    USER_EMAIL:     p.USER_EMAIL     || '',
    TAVILY_API_KEY: p.TAVILY_API_KEY || '',
    LLM_API_KEY:    p.LLM_API_KEY    || '',
    LLM_PROVIDER:   p.LLM_PROVIDER   || 'openai',
    LLM_MODEL:      p.LLM_MODEL      || 'gpt-4o',
    SPREADSHEET_ID: p.SPREADSHEET_ID || '',
    SENDER_NAME:    p.SENDER_NAME    || '徐廷宇',
    SENDER_TITLE:   p.SENDER_TITLE   || '商業經理',
    SENDER_PHONE:   p.SENDER_PHONE   || '',
    PDF_LINK:       p.PDF_LINK       || '',

    // ── Runtime config (Settings sheet wins) ────────────────────────────────
    MONITOR_INTERVAL_HOURS: parseInt(get('MONITOR_INTERVAL_HOURS', '2')),
    WEEKLY_TARGET:          parseInt(get('WEEKLY_TARGET', '20')),
    MEETING_START_HOUR_UK:  parseInt(get('MEETING_START_HOUR_UK', '7')),
    MEETING_END_HOUR_UK:    parseInt(get('MEETING_END_HOUR_UK', '11')),
    DAYS_AHEAD_MIN:         parseInt(get('DAYS_AHEAD_MIN', '3')),
    DAYS_AHEAD_MAX:         parseInt(get('DAYS_AHEAD_MAX', '14')),
    NOTIFY_ERIC:    get('NOTIFY_ERIC',   'tingyuhsu45@gmail.com'),
    NOTIFY_CHANEL:  get('NOTIFY_CHANEL', 'chanelhwung94@gmail.com'),

    // ── Agent prompts (Settings sheet, with hardcoded fallback) ─────────────
    FINDER_PROMPT:         get('FINDER_PROMPT',         DEFAULT_PROMPTS.FINDER_PROMPT),
    READER_SYSTEM_PROMPT:  get('READER_SYSTEM_PROMPT',  DEFAULT_PROMPTS.READER_SYSTEM_PROMPT),
    SCHEDULER_PROMPT:      get('SCHEDULER_PROMPT',      DEFAULT_PROMPTS.SCHEDULER_PROMPT),

    // ── Search queries ───────────────────────────────────────────────────────
    SEARCH_QUERIES: searchQueries.length > 0 ? searchQueries : [
      '台灣中型企業 企業社會責任 贊助 聯絡信箱 官方網站',
      '台灣中小企業 官方網站 企業聯絡 電子郵件',
      'Taiwan mid-size company sponsorship CSR contact email site:com.tw',
      '台灣科技公司 中小企業 聯絡我們 電子郵件',
    ],
  };
}

/**
 * Read the Settings sheet — returns a flat key→value map.
 * Skips rows where key starts with '===' (section headers).
 */
function getSettingsMap_() {
  try {
    const sheet = getSheetByName_(SHEET.SETTINGS);
    if (!sheet) return {};
    const rows = sheet.getDataRange().getValues().slice(1); // skip header
    const out = {};
    rows.forEach(row => {
      const key = (row[0] || '').toString().trim();
      if (!key || key.startsWith('===')) return; // section header or blank
      const val = (row[1] !== undefined && row[1] !== '') ? row[1].toString().trim() : null;
      if (val !== null) out[key] = val;
    });
    return out;
  } catch (err) {
    console.warn('getSettingsMap_: could not read Settings sheet —', err);
    return {};
  }
}

/** Low-level: open a sheet by name using SPREADSHEET_ID from Script Properties. */
function getSheetByName_(name) {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';
  if (!id) throw new Error('SPREADSHEET_ID not set in Script Properties. Run setScriptProperties() first.');
  const ss = SpreadsheetApp.openById(id);
  return ss.getSheetByName(name);
}

// ── One-time setup: seed Script Properties ───────────────────────────────────

/**
 * Run ONCE from the Apps Script editor.
 * Paste your real API keys before running.
 */
function setScriptProperties() {
  PropertiesService.getScriptProperties().setProperties({
    USER_EMAIL:     'youthimpacttw@gmail.com',
    TAVILY_API_KEY: 'YOUR_TAVILY_API_KEY',   // paste real key
    LLM_API_KEY:    'YOUR_OPENAI_API_KEY',   // paste real key
    LLM_PROVIDER:   'openai',
    LLM_MODEL:      'gpt-4o',
    SENDER_NAME:    '徐廷宇',
    SENDER_TITLE:   '商業經理',
    SENDER_PHONE:   '',
    PDF_LINK:       'https://drive.google.com/file/d/1J77LPg8EnuTR1dohNaTmlsElUal4Hzpv/view?usp=sharing',
    SPREADSHEET_ID: '',   // filled automatically after runSetup()
  });
  console.log('Script properties set. Now run runSetup() to create the spreadsheet.');
}
