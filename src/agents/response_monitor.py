"""
Response Monitor Agent

Runs every 2 hours. Checks Gmail for unread replies to YIT cold emails.
Matches senders to the YIT_Lead_Gen_Leads sheet by exact email first,
then by domain as fallback. Unmatched replies go to the human review sheet.
"""
import logging
import re
from datetime import date

from src import config
from src.integrations.gmail import GmailClient
from src.integrations.sheets import SheetsClient

logger = logging.getLogger(__name__)

# Gmail search query to find unread replies to YIT outreach
_REPLY_SEARCH_QUERY = 'subject:"YIT" is:unread newer_than:30d'


class ResponseMonitorAgent:
    def __init__(self) -> None:
        self._sheets = SheetsClient()
        self._gmail = GmailClient()

    # ── Public entry point ────────────────────────────────────────────────────

    def run(self) -> list[dict]:
        """Check Gmail, match responses to known companies, return matched list."""
        responses = self._check_for_responses()
        for resp in responses:
            self._update_sheet(resp)
            self._notify_user(resp)
        return responses

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _check_for_responses(self) -> list[dict]:
        message_ids = self._gmail.search_message_ids(query=_REPLY_SEARCH_QUERY)
        if not message_ids:
            return []

        sent_rows = self._sheets.get_all_rows(config.LEADS_SHEET_NAME)
        email_index = _build_email_index(sent_rows)
        domain_index = _build_domain_index(sent_rows)

        matched: list[dict] = []
        for msg_id in message_ids:
            msg = self._gmail.get_message(msg_id)
            sender_email = _extract_email(msg["from"])
            sender_domain = sender_email.split("@")[-1] if "@" in sender_email else ""

            row_num, row = None, None
            if sender_email in email_index:
                row_num, row = email_index[sender_email]
            elif sender_domain in domain_index:
                row_num, row = domain_index[sender_domain]

            if row is not None:
                matched.append({
                    "message_id": msg_id,
                    "company_name": row[config.COL_COMPANY_NAME] if len(row) > config.COL_COMPANY_NAME else "",
                    "company_email": row[config.COL_EMAIL] if len(row) > config.COL_EMAIL else sender_email,
                    "row_num": row_num,
                    "sender": msg["from"],
                    "subject": msg["subject"],
                    "body": msg["body"],
                })
                self._gmail.mark_as_read(msg_id)
            else:
                logger.warning(f"Unmatched sender: {msg['from']} — routing to human review")
                self._sheets.append_row(
                    config.HUMAN_REVIEW_SHEET_NAME,
                    ["", sender_email, "", config.STATUS_NEEDS_REVIEW,
                     date.today().isoformat(), "", "", "", "",
                     f"Unmatched reply from: {msg['from']} | Subject: {msg['subject']}", ""],
                )

        return matched

    def _update_sheet(self, response: dict) -> None:
        row_num = response["row_num"]
        today = date.today().isoformat()
        self._sheets.update_cell(
            config.LEADS_SHEET_NAME, row_num, config.COL_STATUS, config.STATUS_RESPONSE_RECEIVED
        )
        self._sheets.update_cell(
            config.LEADS_SHEET_NAME, row_num, config.COL_RESPONSE_DATE, today
        )

    def _notify_user(self, response: dict) -> None:
        subject = f"[YIT] 新回覆來自 {response['company_name']}"
        body = (
            f"收到來自 {response['company_name']} ({response['sender']}) 的回覆。\n\n"
            f"主旨: {response['subject']}\n\n"
            f"內容:\n{response['body']}\n\n"
            "── 系統正在草擬回覆，稍後會寄送草稿給您審核。"
        )
        self._gmail.send_email(to=config.USER_EMAIL, subject=subject, body=body)


# ── Module helpers ────────────────────────────────────────────────────────────

def _build_email_index(rows: list[list]) -> dict[str, tuple[int, list]]:
    """Map lowercase email → (1-based row number, row data)."""
    index: dict[str, tuple[int, list]] = {}
    for i, row in enumerate(rows):
        if len(row) > config.COL_EMAIL and row[config.COL_EMAIL].strip():
            index[row[config.COL_EMAIL].strip().lower()] = (i + 1, row)
    return index


def _build_domain_index(rows: list[list]) -> dict[str, tuple[int, list]]:
    """Map email domain → (1-based row number, row data) for domain-fallback matching."""
    index: dict[str, tuple[int, list]] = {}
    for i, row in enumerate(rows):
        if len(row) > config.COL_EMAIL and row[config.COL_EMAIL].strip() and "@" in row[config.COL_EMAIL]:
            domain = row[config.COL_EMAIL].split("@")[-1].lower()
            index[domain] = (i + 1, row)
    return index


def _extract_email(from_header: str) -> str:
    """Extract plain email address from 'Name <email>' or bare 'email' format."""
    match = re.search(r"<([^>]+)>", from_header)
    if match:
        return match.group(1).strip().lower()
    return from_header.strip().lower()
