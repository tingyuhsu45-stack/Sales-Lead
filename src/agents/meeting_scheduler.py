"""
Meeting Scheduler Agent

Triggered when the user approves a sponsor meeting from the Reply Drafter notification.

Two entry points:
  propose_slots() — check calendar, email user with 2-3 available options
  book_meeting()  — create the calendar event and send invite (after user confirms)

Never books without explicit user confirmation.
"""
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from src import config
from src.integrations.calendar import CalendarClient
from src.integrations.gmail import GmailClient
from src.integrations.sheets import SheetsClient

logger = logging.getLogger(__name__)


class MeetingSchedulerAgent:
    def __init__(self) -> None:
        self._sheets = SheetsClient()
        self._gmail = GmailClient()
        self._calendar = CalendarClient()

    def propose_slots(
        self, company_name: str, company_email: str, row_num: int
    ) -> None:
        """Check calendar and email user with available slot options. Does NOT book."""
        slots = self._calendar.get_free_slots(
            days_ahead_min=config.MEETING_DAYS_AHEAD_MIN,
            days_ahead_max=config.MEETING_DAYS_AHEAD_MAX,
            max_slots=3,
        )

        if not slots:
            self._notify_no_slots(company_name)
            return

        subject = f"[YIT] 請確認與 {company_name} 的會議時間"
        lines = [
            f"贊助商 {company_name} 已表示有興趣，請選擇一個會議時段：",
            "",
        ]
        for i, slot in enumerate(slots, 1):
            lines.append(f"選項 {i}: {_format_slot(slot['start'])}")

        lines += [
            "",
            "請回覆選項編號（例如「選項 1」）或指定其他時間。",
            "確認後系統將自動建立行事曆邀請並通知對方。",
            "",
            f"贊助商 email: {company_email}",
            f"Sheet row: {row_num}",
            "",
            "── 可用時段（供系統使用）──",
        ]
        for slot in slots:
            lines.append(f"START={slot['start']} END={slot['end']}")

        self._gmail.send_email(
            to=config.USER_EMAIL,
            subject=subject,
            body="\n".join(lines),
            bcc=config.BCC_EMAILS,
        )

    def book_meeting(
        self,
        company_name: str,
        company_email: str,
        row_num: int,
        start_iso: str,
        end_iso: str,
    ) -> None:
        """Create calendar event and notify user. Only called after user confirms a slot."""
        event = self._calendar.create_event(
            summary=f"Meeting with {company_name} - Sponsorship Discussion",
            start_iso=start_iso,
            end_iso=end_iso,
            attendee_email=company_email,
        )

        # Update sheet
        self._sheets.update_cell(
            config.LEADS_SHEET_NAME, row_num,
            config.COL_STATUS, config.STATUS_MEETING_SCHEDULED,
        )
        self._sheets.update_cell(
            config.LEADS_SHEET_NAME, row_num,
            config.COL_MEETING_DATETIME, start_iso,
        )

        # Notify user
        subject = f"[YIT] 會議已確認 — {company_name}"
        body = (
            f"與 {company_name} 的會議已建立。\n\n"
            f"時間: {_format_slot(start_iso)}\n"
            f"贊助商 email: {company_email}\n"
            f"行事曆連結: {event.get('htmlLink', '(請查看 Google Calendar)')}"
        )
        self._gmail.send_email(to=config.USER_EMAIL, subject=subject, body=body, bcc=config.BCC_EMAILS)
        logger.info(f"Meeting scheduled with {company_name} at {start_iso}")

    def _notify_no_slots(self, company_name: str) -> None:
        # Compute meeting window in Taiwan time dynamically (handles BST/GMT shifts)
        tw = ZoneInfo(config.TIMEZONE_TW)
        now = datetime.now(tz=ZoneInfo(config.TIMEZONE_UK))
        start_tw = now.replace(hour=config.MEETING_START_HOUR_UK, minute=0, second=0, microsecond=0).astimezone(tw).hour
        end_tw = now.replace(hour=config.MEETING_END_HOUR_UK, minute=0, second=0, microsecond=0).astimezone(tw).hour

        subject = f"[YIT] 本週無空檔 — {company_name}"
        body = (
            f"系統在 {config.MEETING_DAYS_AHEAD_MIN}-{config.MEETING_DAYS_AHEAD_MAX} 天內找不到可用的會議時段"
            f"（週一至週五 {start_tw:02d}:00–{end_tw:02d}:00 台灣時間）。\n"
            f"請手動查看行事曆並與 {company_name} 協調時間。"
        )
        self._gmail.send_email(to=config.USER_EMAIL, subject=subject, body=body, bcc=config.BCC_EMAILS)


def _format_slot(iso: str) -> str:
    """Format an ISO datetime string to Taiwan time (UTC+8)."""
    dt = datetime.fromisoformat(iso).astimezone(ZoneInfo(config.TIMEZONE_TW))
    return dt.strftime("%Y-%m-%d %A %H:%M 台灣時間")
