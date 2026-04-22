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
      for (const r of results) {
        const record = parseResult_(r);
        if (!record) continue;
        if (seenNames.has(record.name)) continue;
        if (record.email && knownEmails.has(record.email.toLowerCase())) continue;
        found.push(record);
        seenNames.add(record.name);
      }
    } catch (err) {
      console.error(`Tavily search failed for "${query}": ${err}`);
    }
  }
  return found;
}

function parseResult_(result) {
  const content = (result.content || '') + ' ' + (result.url || '');
  const name    = extractTCCompanyName(content);
  if (!name) return null;
  const email   = extractEmail(content);
  return {
    name,
    email: email && !isGenericEmail(email) ? email : '',
    website: result.url || '',
  };
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
