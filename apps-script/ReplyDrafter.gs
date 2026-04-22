/**
 * Agent 4 — Reply Drafter
 * ========================
 * Reads YIT_Context sheet and uses GPT to draft a reply grounded only
 * in that context. Sends draft to user for approval — never auto-sends.
 *
 * Anti-hallucination rules (enforced via system prompt):
 *  - Only facts from YIT_Context may appear in the draft
 *  - Unanswerable questions → [NEEDS HUMAN INPUT: ...]
 *  - Empty context → sends raw email to user for manual reply
 */

const REPLY_SYSTEM_PROMPT = `You are drafting sponsorship reply emails on behalf of Youth Impact Taiwan (YIT).

STRICT RULES — never break these:
1. Only use facts from the YIT_CONTEXT provided. Never invent statistics, names, budgets, dates, or programs.
2. If the sponsor asks something you cannot answer from YIT_CONTEXT, insert exactly:
   [NEEDS HUMAN INPUT: <describe what was asked>]
   Do NOT guess or fill in made-up information.
3. Match the language of the sponsor's email exactly (Chinese → Chinese, English → English).
4. Keep the tone warm, professional, and aligned with a youth non-profit.
5. Never propose a specific meeting time — the scheduling system handles that.
6. End the email by thanking them and expressing enthusiasm for future collaboration.
7. Do not use markdown formatting — plain text only.`;

function runReplyDrafter(responseData) {
  const cfg       = getConfig();
  const yitContext = sheetsGetYITContext();

  if (!yitContext.trim()) {
    console.warn('ReplyDrafter: YIT_Context is empty — sending raw email to user');
    sendRawFallback_(responseData, cfg);
    return;
  }

  const draft = generateDraft_(responseData, yitContext);
  sendDraftToUser_(responseData, draft, cfg);
  updateSheetStatus_(responseData.rowNum, cfg.LEADS_SHEET);

  console.log(`ReplyDrafter: draft sent to ${cfg.USER_EMAIL} for ${responseData.companyName}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateDraft_(response, yitContext) {
  const userMessage = [
    `Sponsor company: ${response.companyName}`,
    '',
    `YIT_CONTEXT (ONLY facts you may use):\n${yitContext}`,
    '',
    `Sponsor's email:\n${response.body}`,
    '',
    "Draft a reply. If any question cannot be answered from YIT_CONTEXT, insert [NEEDS HUMAN INPUT: <what was asked>].",
  ].join('\n');

  return llmComplete(REPLY_SYSTEM_PROMPT, userMessage);
}

function sendDraftToUser_(response, draft, cfg) {
  const subject = `[YIT 草稿 — 待審核] 回覆 ${response.companyName}`;
  const body = [
    '⚠️ DRAFT — DO NOT SEND until you approve',
    '請審核以下草稿。確認後請直接寄給贊助商，或回覆「安排會議」以排定通話。',
    '',
    '══ 贊助商原始郵件 ══',
    `寄件人: ${response.sender}`,
    `主旨: ${response.subject}`,
    '',
    response.body,
    '',
    '══ 草稿回覆 ══',
    '',
    draft,
  ].join('\n');

  gmailSend(cfg.USER_EMAIL, subject, body, { bcc: cfg.BCC_EMAILS });
}

function sendRawFallback_(response, cfg) {
  const subject = `[YIT 需手動回覆] ${response.companyName} 來信`;
  const body = [
    'YIT Context 資料表為空或無法讀取，系統無法自動草擬回覆。',
    '請手動回覆以下郵件。',
    '',
    '══ 贊助商原始郵件 ══',
    `寄件人: ${response.sender}`,
    `主旨: ${response.subject}`,
    '',
    response.body,
  ].join('\n');

  gmailSend(cfg.USER_EMAIL, subject, body, { bcc: cfg.BCC_EMAILS });
}

function updateSheetStatus_(rowNum, sheetName) {
  sheetsUpdateCell(sheetName, rowNum, COL.STATUS, STATUS.REPLY_DRAFTED);
  sheetsUpdateCell(sheetName, rowNum, COL.REPLY_STATUS, 'Awaiting approval');
}
