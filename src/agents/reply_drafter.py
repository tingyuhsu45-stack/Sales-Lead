"""
Reply Drafter Agent

Triggered when the Response Monitor detects an incoming sponsor email.
Uses Claude to draft a reply grounded exclusively in the YIT_Context sheet.

Anti-hallucination rules (hard):
- Only facts from YIT_Context sheet may appear in the draft
- If a question cannot be answered from context, insert [NEEDS HUMAN INPUT: ...]
- If YIT_Context is empty, send raw email to user and request manual reply
- Draft is NEVER sent automatically — always requires user approval
"""
import logging

from src import config
from src.integrations.gmail import GmailClient
from src.integrations.llm import LLMClient
from src.integrations.sheets import SheetsClient

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are drafting sponsorship reply emails on behalf of Youth Impact Taiwan (YIT).

STRICT RULES — never break these:
1. Only use facts from the YIT_CONTEXT provided. Never invent statistics, names, budgets, dates, or programs.
2. If the sponsor asks something you cannot answer from YIT_CONTEXT, insert exactly:
   [NEEDS HUMAN INPUT: <describe what was asked>]
   Do NOT guess or fill in made-up information.
3. Match the language of the sponsor's email exactly (Chinese → Chinese, English → English).
4. Keep the tone warm, professional, and aligned with a youth non-profit.
5. Never propose a specific meeting time — the scheduling system handles that.
6. End the email by thanking them and expressing enthusiasm for future collaboration.
7. Do not use markdown formatting — plain text only."""


class ReplyDrafterAgent:
    def __init__(self) -> None:
        self._sheets = SheetsClient()
        self._gmail = GmailClient()
        self._llm = LLMClient()

    # ── Public entry point ────────────────────────────────────────────────────

    def run(self, response: dict) -> None:
        """Draft a reply for one sponsor response and send to user for approval."""
        yit_context = self._get_yit_context()

        if not yit_context:
            logger.warning("YIT_Context is empty — sending raw email to user for manual reply")
            self._send_raw_fallback(response)
            return

        draft = self._generate_draft(
            company_name=response["company_name"],
            sponsor_body=response["body"],
            yit_context=yit_context,
        )
        self._send_draft_to_user(response, draft)
        self._update_sheet(response["row_num"])

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _get_yit_context(self) -> str:
        try:
            rows = self._sheets.get_all_rows("YIT_Context")
            if not rows:
                return ""
            return "\n".join(
                " | ".join(str(cell) for cell in row if cell)
                for row in rows if row
            )
        except Exception as exc:
            logger.error(f"Could not read YIT_Context sheet: {exc}")
            return ""

    def _generate_draft(
        self, company_name: str, sponsor_body: str, yit_context: str
    ) -> str:
        user_message = (
            f"Sponsor company: {company_name}\n\n"
            f"YIT_CONTEXT (ONLY facts you may use):\n{yit_context}\n\n"
            f"Sponsor's email:\n{sponsor_body}\n\n"
            "Draft a reply. If any question cannot be answered from YIT_CONTEXT, "
            "insert [NEEDS HUMAN INPUT: <what was asked>]."
        )
        return self._llm.complete(system=_SYSTEM_PROMPT, user=user_message)

    def _send_draft_to_user(self, response: dict, draft: str) -> None:
        subject = f"[YIT 草稿 — 待審核] 回覆 {response['company_name']}"
        body = (
            "⚠️ DRAFT — DO NOT SEND until you approve\n"
            "請審核以下草稿。確認後請直接寄給贊助商，或回覆「安排會議」以排定通話。\n\n"
            "══ 贊助商原始郵件 ══\n"
            f"寄件人: {response['sender']}\n"
            f"主旨: {response['subject']}\n\n"
            f"{response['body']}\n\n"
            "══ 草稿回覆 ══\n\n"
            f"{draft}"
        )
        self._gmail.send_email(to=config.USER_EMAIL, subject=subject, body=body)

    def _send_raw_fallback(self, response: dict) -> None:
        subject = f"[YIT 需手動回覆] {response['company_name']} 來信"
        body = (
            "YIT Context 資料表為空或無法讀取，系統無法自動草擬回覆。\n"
            "請手動回覆以下郵件。\n\n"
            "══ 贊助商原始郵件 ══\n"
            f"寄件人: {response['sender']}\n"
            f"主旨: {response['subject']}\n\n"
            f"{response['body']}"
        )
        self._gmail.send_email(to=config.USER_EMAIL, subject=subject, body=body)

    def _update_sheet(self, row_num: int) -> None:
        self._sheets.update_cell(
            config.LEADS_SHEET_NAME, row_num,
            config.COL_STATUS, config.STATUS_REPLY_DRAFTED,
        )
        self._sheets.update_cell(
            config.LEADS_SHEET_NAME, row_num,
            config.COL_REPLY_STATUS, "Awaiting approval",
        )
