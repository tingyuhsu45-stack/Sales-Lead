"""
Cold Email Sender Agent

Triggered after the user confirms the weekly company list.
Sends the HTML cold email template to each company with rate limiting and retry.
Never sends without an explicit user-confirmed list.
"""
import logging
import time
from datetime import date

from src import config
from src.integrations.gmail import GmailClient
from src.integrations.sheets import SheetsClient
from src.templates import render_cold_email

logger = logging.getLogger(__name__)

MAX_RETRIES = 2          # Total attempts = 1 + MAX_RETRIES
SEND_DELAY_SECONDS = 30  # Pause between sends to avoid spam detection


class EmailSenderAgent:
    def __init__(self) -> None:
        self._sheets = SheetsClient()
        self._gmail = GmailClient()

    def run(self) -> None:
        """Send cold emails to all companies with status 'found' in YIT_Lead_Gen_Leads."""
        rows = self._sheets.get_rows_by_status(config.LEADS_SHEET_NAME, config.STATUS_FOUND)
        logger.info(f"EmailSenderAgent: {len(rows)} companies to email")

        sent: list[str] = []
        failed: list[str] = []

        for row in rows:
            company_name = row[config.COL_COMPANY_NAME]
            email = row[config.COL_EMAIL]

            if self._send_with_retry(company_name, email):
                self._mark_sent(email)
                sent.append(company_name)
                time.sleep(SEND_DELAY_SECONDS)
            else:
                failed.append(company_name)

        self._notify_user(sent, failed)

    def _send_with_retry(self, company_name: str, email: str) -> bool:
        subject, body = render_cold_email(company_name)
        for attempt in range(1 + MAX_RETRIES):
            try:
                self._gmail.send_email(to=email, subject=subject, body=body, html=True)
                logger.info(f"Sent cold email to {email}")
                return True
            except Exception as exc:
                logger.warning(f"Attempt {attempt + 1} failed for {email}: {exc}")
        logger.error(f"All attempts failed for {email}")
        return False

    def _mark_sent(self, email: str) -> None:
        result = self._sheets.find_row_by_email(config.LEADS_SHEET_NAME, email)
        if result is None:
            logger.warning(f"Could not find row for {email} to update status")
            return
        row_num, _ = result
        today = date.today().isoformat()
        self._sheets.update_cell(
            config.LEADS_SHEET_NAME, row_num, config.COL_STATUS, config.STATUS_EMAIL_SENT
        )
        self._sheets.update_cell(
            config.LEADS_SHEET_NAME, row_num, config.COL_EMAIL_SENT_DATE, today
        )

    def _notify_user(self, sent: list[str], failed: list[str]) -> None:
        subject = f"[YIT] 冷郵件發送完成 — {len(sent)} 封成功"
        lines = [f"已成功發送 {len(sent)} 封冷郵件。"]
        if failed:
            lines += [
                "",
                f"以下 {len(failed)} 家發送失敗（已重試 {MAX_RETRIES} 次），請手動處理：",
            ]
            lines += [f"- {name}" for name in failed]
        self._gmail.send_email(
            to=config.USER_EMAIL,
            subject=subject,
            body="\n".join(lines),
        )
