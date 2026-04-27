/**
 * YIT PR Agent v2 — Company Finder
 * ===================================
 * Every Monday: search for 20 new Taiwanese mid-size companies.
 * Saves them to LEADS (or Needs Human Review).
 * Emails the user a list for approval BEFORE any cold emails go out.
 *
 * The user replies "確認" to the approval email → run sendEmailsJob() manually
 * (or it runs automatically each Monday after the approval window).
 */

function runWeeklyFinder() {
  const cfg = getConfig();
  console.log('CompanyFinder: weekly run started');

  // 1. Collect all known emails to avoid duplicates
  const knownEmails = sheetsGetAllEmails(SHEET.LEADS);
  sheetsGetAllEmails(SHEET.REVIEW).forEach(e => knownEmails.add(e));

  // 2. Search and parse candidates
  const candidates = searchCompanies_(cfg, knownEmails);

  // 3. Split into verified vs needs-review
  const { verified, needsReview } = classifyCandidates_(candidates, knownEmails, cfg.WEEKLY_TARGET);

  // 4. Save to sheets
  verified.forEach(r => leadsAppend({
    name: r.name, email: r.email, website: r.website,
    status: STATUS.FOUND, source: 'Company Finder',
  }));
  needsReview.forEach(r => reviewAppend({
    name: r.name, email: r.email || '', website: r.website,
    reviewReason: r.reviewReason,
  }));

  // 5. Send approval email to user
  sendApprovalEmail_(verified, needsReview, cfg);

  console.log(`CompanyFinder: ${verified.length} verified, ${needsReview.length} flagged for review`);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function searchCompanies_(cfg, knownEmails) {
  const found     = [];
  const seenNames = new Set();

  for (const query of cfg.SEARCH_QUERIES) {
    if (found.length >= cfg.WEEKLY_TARGET * 2) break;
    try {
      const results = tavilySearch(query, 10);
      console.log(`  Query "${query.slice(0, 30)}..." → ${results.length} Tavily results`);

      let parsedCount = 0;
      for (const r of results) {
        const record = parseResult_(r, cfg);
        if (!record) {
          console.log(`    Skipped (no name extracted): ${r.url}`);
          continue;
        }
        if (seenNames.has(record.name)) continue;
        if (record.email && knownEmails.has(record.email.toLowerCase())) continue;
        found.push(record);
        seenNames.add(record.name);
        parsedCount++;
        console.log(`    Found: ${record.name} | ${record.email || 'no email'}`);
      }
      console.log(`  → ${parsedCount} usable companies from this query`);
    } catch (err) {
      console.error(`Tavily search failed for "${query}": ${err}`);
    }
  }
  return found;
}

function parseResult_(result, cfg) {
  const content = (result.content || '') + ' ' + (result.url || '');
  const name    = extractTCCompanyNameAI_(content, cfg);
  if (!name) return null;
  const email   = extractEmail(content);
  return {
    name,
    email: email && !isGenericEmail(email) ? email : '',
    website: result.url || '',
  };
}

/**
 * Use the LLM to extract a Traditional Chinese company name from text.
 * Falls back to regex if the LLM call fails.
 */
function extractTCCompanyNameAI_(content, cfg) {
  try {
    const system = `你是一個專門識別台灣繁體中文公司名稱的助理。
從以下文字中找出台灣公司的正式繁體中文全名（例如：「台積電股份有限公司」、「鴻海精密工業股份有限公司」）。
只輸出公司名稱，不要任何其他文字。如果找不到任何公司名稱，輸出空字串。`;
    const result = llmComplete(system, content.slice(0, 1200)).trim();
    if (result && result.length >= 2 && result !== '""' && result !== "''") {
      return result;
    }
  } catch (err) {
    console.warn(`extractTCCompanyNameAI_ LLM failed: ${err} — using regex fallback`);
  }
  return extractTCCompanyName(content);
}

function classifyCandidates_(candidates, knownEmails, target) {
  const verified    = [];
  const needsReview = [];

  for (const r of candidates) {
    if (r.email && knownEmails.has(r.email.toLowerCase())) continue; // double-check
    if (!r.email) {
      needsReview.push({ ...r, reviewReason: '未找到電子郵件' });
    } else {
      verified.push(r);
    }
    if (verified.length >= target) break;
  }

  // Any remaining candidates with no email also go to review
  candidates.slice(verified.length).forEach(r => {
    if (!r.email && !needsReview.find(x => x.name === r.name)) {
      needsReview.push({ ...r, reviewReason: '未找到電子郵件' });
    }
  });

  return { verified, needsReview };
}

function sendApprovalEmail_(verified, needsReview, cfg) {
  const subject = `[YIT] 每週贊助名單確認 — ${verified.length} 家公司待審核`;

  const lines = [
    `本週找到 ${verified.length} 家企業，${needsReview.length} 家需人工確認。`,
    '',
    '請確認後手動執行 sendEmailsJob() 以發送冷郵件，或等下週自動執行。',
    '（您可以在發送前直接編輯 LEADS 表格中的資料。）',
    '',
    '── 待發送名單 ──',
    ...verified.map((r, i) =>
      `${i + 1}. ${r.name} | ${r.email} | ${r.website}`
    ),
  ];

  if (needsReview.length) {
    lines.push('', '── 需人工確認（未寄信）──');
    needsReview.forEach(r =>
      lines.push(`- ${r.name} | ${r.website || '無網址'} | 原因: ${r.reviewReason}`)
    );
    lines.push('', '請至 "Needs Human Review" 表格補充電子郵件後，手動移至 LEADS 表格。');
  }

  lines.push(
    '',
    `查看表格: https://docs.google.com/spreadsheets/d/${cfg.SPREADSHEET_ID}`
  );

  gmailSend(cfg.USER_EMAIL, subject, lines.join('\n'));
  console.log(`CompanyFinder: approval email sent to ${cfg.USER_EMAIL}`);
}

// ── Diagnostic helpers (run manually from the editor) ─────────────────────────

/**
 * Run this first to check if Tavily is working and what it returns.
 * Look at the Execution log for results.
 */
function testTavilySearch() {
  const query = '台灣中型企業 企業社會責任 贊助 聯絡信箱 官方網站';
  console.log(`Testing Tavily with query: "${query}"`);
  const results = tavilySearch(query, 5);
  console.log(`Got ${results.length} results:`);
  results.forEach((r, i) => {
    console.log(`\n[${i+1}] URL: ${r.url}`);
    console.log(`    Content preview: ${(r.content || '').slice(0, 200)}`);
  });
}

/**
 * Run this to check if the LLM can extract company names from Tavily content.
 * Look at the Execution log for extracted names.
 */
function testNameExtraction() {
  const cfg = getConfig();
  const query = '台灣中型企業 企業社會責任 贊助 聯絡信箱 官方網站';
  const results = tavilySearch(query, 5);
  console.log(`Testing name extraction on ${results.length} results:`);
  results.forEach((r, i) => {
    const content = (r.content || '') + ' ' + (r.url || '');
    const nameAI    = extractTCCompanyNameAI_(content, cfg);
    const nameRegex = extractTCCompanyName(content);
    console.log(`[${i+1}] ${r.url}`);
    console.log(`     AI name:    "${nameAI}"`);
    console.log(`     Regex name: "${nameRegex}"`);
    console.log(`     Email:      "${extractEmail(content)}"`);
  });
}
