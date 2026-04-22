from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from googleapiclient.discovery import build
from src import config
from src.integrations.sheets import get_credentials


def build_calendar_service():
    return build("calendar", "v3", credentials=get_credentials())


class CalendarClient:
    def __init__(self):
        self._service = build_calendar_service()
        self._tz = ZoneInfo(config.TIMEZONE_UK)

    def get_free_slots(
        self,
        days_ahead_min: int = 2,
        days_ahead_max: int = 7,
        slot_duration_minutes: int = 30,
        max_slots: int = 3,
    ) -> list[dict]:
        """Return up to max_slots free 30-min slots within Mon-Fri 7-11 AM UK window."""
        now = datetime.now(tz=self._tz)
        start_date = now.date() + timedelta(days=days_ahead_min)
        end_date = now.date() + timedelta(days=days_ahead_max)

        # Generate candidate slots: Mon-Fri only, within meeting hours
        candidates = []
        current = start_date
        while current <= end_date:
            if current.weekday() < 5:  # 0=Mon … 4=Fri
                for hour in range(config.MEETING_START_HOUR_UK, config.MEETING_END_HOUR_UK):
                    for minute in (0, 30):
                        slot_start = datetime(
                            current.year, current.month, current.day,
                            hour, minute, tzinfo=self._tz,
                        )
                        slot_end = slot_start + timedelta(minutes=slot_duration_minutes)
                        # Only keep if slot ends within the meeting window
                        if slot_end.hour <= config.MEETING_END_HOUR_UK and slot_end > now:
                            candidates.append({
                                "start": slot_start.isoformat(),
                                "end": slot_end.isoformat(),
                            })
            current += timedelta(days=1)

        if not candidates:
            return []

        # Query Google Calendar freebusy
        freebusy_result = (
            self._service.freebusy()
            .query(body={
                "timeMin": candidates[0]["start"],
                "timeMax": candidates[-1]["end"],
                "items": [{"id": "primary"}],
            })
            .execute()
        )
        busy_periods = freebusy_result["calendars"]["primary"].get("busy", [])

        # Filter out busy slots
        free_slots = []
        for slot in candidates:
            if len(free_slots) >= max_slots:
                break
            slot_start = datetime.fromisoformat(slot["start"])
            slot_end = datetime.fromisoformat(slot["end"])
            if not _overlaps_any(slot_start, slot_end, busy_periods):
                free_slots.append(slot)

        return free_slots

    def create_event(
        self,
        summary: str,
        start_iso: str,
        end_iso: str,
        attendee_email: str,
    ) -> dict:
        """Create a Google Calendar event with a Meet link and email invite. Returns event dict."""
        # Primary attendee + BCC contacts as optional attendees so they get the invite
        attendees = [{"email": attendee_email}]
        for bcc_email in config.BCC_EMAILS:
            attendees.append({"email": bcc_email, "optional": True})

        event_body = {
            "summary": summary,
            "start": {"dateTime": start_iso, "timeZone": config.TIMEZONE_UK},
            "end": {"dateTime": end_iso, "timeZone": config.TIMEZONE_UK},
            "attendees": attendees,
            "conferenceData": {
                "createRequest": {
                    "requestId": f"yit-{start_iso}",
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
        }
        return (
            self._service.events()
            .insert(
                calendarId="primary",
                body=event_body,
                conferenceDataVersion=1,
                sendUpdates="all",
            )
            .execute()
        )


def _overlaps_any(
    slot_start: datetime,
    slot_end: datetime,
    busy_periods: list[dict],
) -> bool:
    for period in busy_periods:
        busy_start = datetime.fromisoformat(period["start"])
        busy_end = datetime.fromisoformat(period["end"])
        if slot_start < busy_end and slot_end > busy_start:
            return True
    return False
