/**
 * YIT PR Agent v2 — Sheets Service
 * ==================================
 * All Google Sheets read/write operations.
 * Always works on the spreadsheet from SPREADSHEET_ID in Script Properties.
 */

// ── Low-level helpers ─────────────────────────────────────────────────────────

/** Returns a sheet object by name, or throws if not found. */
function sheet_(name) {
  const s = getSheetByName_(name);
  if (!s) throw new Error(`Sheet "${name}" not found. Run runSetup() first.`);
  return s;
}

/** All data rows (row 1 = header, skipped). Each element is an array. */
function sheetsGetAllRows(sheetName) {
  const s = getSheetByName_(sheetName);
  if (!s) return [];
  const data = s.getDataRange().getValues();
  return data.length <= 1 ? [] : data.slice(1);
}

/** Set of all non-blank lowercase emails in COL.EMAIL. */
function sheetsGetAllEmails(sheetName) {
  const emails = new Set();
  sheetsGetAllRows(sheetName).forEach(row => {
    const e = (row[COL.EMAIL] || '').toString().trim().toLowerCase();
    if (e) emails.add(e);
  });
  return emails;
}

/** Rows where COL.STATUS === status. Returns [{row, rowNum}] (rowNum is 1-based sheet row). */
function sheetsGetRowsByStatus(sheetName, status) {
  return sheetsGetAllRows(sheetName)
    .map((row, i) => ({ row, rowNum: i + 2 }))
    .filter(({ row }) => (row[COL.STATUS] || '').toString() === status);
}

/** Find first row where COL.EMAIL matches (case-insensitive). Returns {row, rowNum} or null. */
function sheetsFindRowByEmail(sheetName, email) {
  const target = email.toLowerCase().trim();
  const rows = sheetsGetAllRows(sheetName);
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i][COL.EMAIL] || '').toString().toLowerCase().trim() === target) {
      return { row: rows[i], rowNum: i + 2 };
    }
  }
  return null;
}

/** Append a row of values. */
function sheetsAppendRow(sheetName, values) {
  const s = getSheetByName_(sheetName);
  if (s) s.appendRow(values);
}

/** Update a single cell. rowNum is 1-based. colIdx is 0-based. */
function sheetsUpdateCell(sheetName, rowNum, colIdx, value) {
  const s = getSheetByName_(sheetName);
  if (s) s.getRange(rowNum, colIdx + 1).setValue(value);
}

/** Update multiple cells in the same row. colValues = [[colIdx, value], ...] */
function sheetsUpdateCells(sheetName, rowNum, colValues) {
  const s = getSheetByName_(sheetName);
  if (!s) return;
  colValues.forEach(([colIdx, value]) => {
    s.getRange(rowNum, colIdx + 1).setValue(value);
  });
}

// ── YIT_Context ───────────────────────────────────────────────────────────────

/** Read the YIT_Context sheet and return formatted string for LLM context. */
function sheetsGetYITContext() {
  const s = getSheetByName_(SHEET.CONTEXT);
  if (!s) return '(YIT_Context sheet not found)';
  const rows = s.getDataRange().getValues().slice(1);
  return rows
    .filter(r => r.some(cell => cell))
    .map(r => r.filter(cell => cell !== '').join(': '))
    .join('\n') || '(YIT_Context is empty — please fill it in)';
}

// ── LEADS-specific helpers ────────────────────────────────────────────────────

/** Append a new lead to the LEADS sheet. */
function leadsAppend(company) {
  sheetsAppendRow(SHEET.LEADS, [
    company.name        || '',
    company.email       || '',
    company.website     || '',
    company.status      || STATUS.FOUND,
    company.dateAdded   || todayString(),
    '',   // Cold Email Sent
    '',   // Reply Date
    '',   // Draft Created
    '',   // Meeting Date/Time
    company.source      || 'Company Finder',
    '',   // Review Reason
    company.notes       || '',
  ]);
}

/** Append a row to Needs Human Review. */
function reviewAppend(company) {
  sheetsAppendRow(SHEET.REVIEW, [
    company.name         || '',
    company.email        || '',
    company.website      || '',
    STATUS.NEEDS_REVIEW,
    company.dateAdded    || todayString(),
    company.reviewReason || '',
    company.notes        || '',
  ]);
}
