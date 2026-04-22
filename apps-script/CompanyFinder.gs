/**
 * Agent 1 — Company Finder
 * ==========================
 * Searches web for 20 new Taiwanese mid-size companies per week.
 * Deduplicates against existing sheets.
 * Never fabricates emails — blank email → Needs Human Review.
 * Sends confirmed list to user for approval before any emails go out.
 */

// Search queries are now loaded from the Settings sheet at runtime.
// Edit them in your Google Sheet → Settings tab (SEARCH_QUERY_1 … SEARCH_QUERY_N).
// Fallback defaults live in Config.gs.

function runWeeklyFinder() {
  const cfg = getConfig();
  console.log('CompanyFinder: weekly run started');

  const existingEmails = getAllKnownEmails_(cfg);
  const candidates     = searchCompanies_(cfg, existingEmails);
  const { verified, needsReview } = deduplicateCompanies_(candidates, existingEmails, cfg.WEEKLY_TARGET);

  saveToSheets_(verified, needsReview, cfg);
  sendConfirmationEmail_(verified, needsReview, cfg);

  console.log(`CompanyFinder: ${verified.length} verified, ${needsReview.length} flagged for review`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAllKnownEmails_(cfg) {
  const known = new Set();
  [cfg.CONTACTS_SHEET, cfg.LEADS_SHEET].forEach(name => {
    try {
      sheetsGetAllEmails(name).forEach(e => known.add(e));
    } catch (err) {
      console.warn(`Could not read sheet '${name}': ${err}`);
    }
  });
  return known;
}

function searchCompanies_(cfg, excludeEmails) {
  const found     = [];
  const seenNames = new Set();

  for (const query of cfg.SEARCH_QUERIES) {
    if (found.length >= cfg.WEEKLY_TARGET * 2) break;
    try {
      const results = tavilySearch(query, 10);
      for (const r of results) {
        const record = parseSearchResult_(r);
        if (!record || seenNames.has(record.name)) continue;
        if (!record.email || !excludeEmails.has(record.email.toLowerCase())) {
          found.push(record);
          seenNames.add(record.name);
        }
      }
    } catch (err) {
      console.error(`Tavily search failed for "${query}": ${err}`);
    }
  }
  return found;
}

function parseSearchResult_(result) {
  const content = (result.content || '') + ' ' + (result.url || '');
  const email   = extractEmail(content);
  const name    = extractTCCompanyName(content);
  if (!name) return null;
  return { name, email, website: result.url || '' };
}

function deduplicateCompanies_(candidates, existingEmails, target) {
  const verified    = [];
  const needsReview = [];

  for (const r of candidates) {
    if (r.email && existingEmails.has(r.email.toLowerCase())) continue; // already known
    if (!r.email) {
      needsReview.push({ ...r, reviewReason: 'email not found' });
    } else if (!r.name) {
      needsReview.push({ ...r, reviewReason: 'name unverifiable' });
    } else {
      verified.push(r);
    }
  }
  return { verified: verified.slice(0, target), needsReview };
}

function saveToSheets_(verified, needsReview, cfg) {
  const today = todayString();
  verified.forEach(r =>
    sheetsAppendRow(cfg.LEADS_SHEET,
      [r.name, r.email, r.website, STATUS.FOUND, today, '', '', '', '', '', ''])
  );
  needsReview.forEach(r =>
    sheetsAppendRow(cfg.REVIEW_SHEET,
      [r.name, r.email, r.website, STATUS.NEEDS_REVIEW, today, '', '', '', '', r.reviewReason, ''])
  );
}

function sendConfirmationEmail_(verified, needsReview, cfg) {
  const subject = `[YIT] 每週贊助名單確認 — ${verified.length} 家公司待您審核`;
  const lines = [
    `本週找到 ${verified.length} 家驗證公司，${needsReview.length} 家需人工確認。`,
    '',
    '請回覆此郵件「確認」以授權發送冷郵件，或「跳過」跳過本週。',
    '（未在週三前回覆將自動跳過本週。）',
    '',
    '── 待發送名單 ──',
    ...verified.map((r, i) => `${i + 1}. ${r.name} | ${r.email} | ${r.website}`),
  ];

  if (needsReview.length) {
    lines.push('', '── 需人工確認（未寄信）──');
    needsReview.forEach(r => lines.push(`- ${r.name} | ${r.website} | 原因: ${r.reviewReason}`));
  }

  gmailSend(cfg.USER_EMAIL, subject, lines.join('\n'));
}
