/**
 * YIT PR Agent v2 — Tavily Search Service
 * ==========================================
 * Web search via Tavily API.
 */

/**
 * Search the web via Tavily.
 * @param {string} query
 * @param {number} maxResults
 * @returns {Array<{url: string, content: string}>}
 */
function tavilySearch(query, maxResults = 10) {
  const cfg = getConfig();
  const resp = UrlFetchApp.fetch('https://api.tavily.com/search', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      api_key: cfg.TAVILY_API_KEY,
      query: query,
      max_results: maxResults,
      include_answer: false,
    }),
    muteHttpExceptions: true,
  });

  const data = JSON.parse(resp.getContentText());
  if (!data.results) {
    console.error(`Tavily error for query "${query}": ${resp.getContentText()}`);
    return [];
  }
  return data.results;
}

// ── Text extraction utilities ─────────────────────────────────────────────────

/** Extract the first email address from a string. Returns '' if none found. */
function extractEmail(text) {
  const match = (text || '').match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : '';
}

/** Extract first Traditional Chinese company name from text. */
function extractTCCompanyName(text) {
  const match = (text || '').match(
    /[\u4e00-\u9fff]{2,}(?:股份有限公司|有限公司|企業|集團|科技|實業|工業|商業|金融|保險|投資)/
  );
  return match ? match[0] : '';
}

/** Extract email domain. */
function emailDomain(email) {
  const parts = (email || '').split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

/** Check if an email looks like a personal/generic address (not company). */
function isGenericEmail(email) {
  const generic = ['gmail.com', 'yahoo.com', 'yahoo.com.tw', 'hotmail.com',
                   'outlook.com', 'icloud.com', 'me.com'];
  return generic.includes(emailDomain(email));
}
