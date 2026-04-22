import pytest
from unittest.mock import MagicMock, patch
from src import config
from src.agents.meeting_scheduler import MeetingSchedulerAgent


def make_agent(mock_sheets, mock_gmail, mock_calendar):
    with patch("src.agents.meeting_scheduler.SheetsClient", return_value=mock_sheets), \
         patch("src.agents.meeting_scheduler.GmailClient", return_value=mock_gmail), \
         patch("src.agents.meeting_scheduler.CalendarClient", return_value=mock_calendar):
        return MeetingSchedulerAgent()


def test_proposes_slots_sends_options_to_user():
    mock_sheets = MagicMock()
    mock_gmail = MagicMock()
    mock_calendar = MagicMock()
    mock_calendar.get_free_slots.return_value = [
        {"start": "2026-04-08T09:00:00+01:00", "end": "2026-04-08T09:30:00+01:00"},
        {"start": "2026-04-08T10:00:00+01:00", "end": "2026-04-08T10:30:00+01:00"},
    ]

    agent = make_agent(mock_sheets, mock_gmail, mock_calendar)
    agent.propose_slots(company_name="公司甲", company_email="a@a.com", row_num=3)

    assert mock_gmail.send_email.called
    body = mock_gmail.send_email.call_args.kwargs["body"]
    assert "公司甲" in body
    assert "09:00" in body or "2026-04-08" in body


def test_no_slots_sends_unavailability_notice():
    mock_sheets = MagicMock()
    mock_gmail = MagicMock()
    mock_calendar = MagicMock()
    mock_calendar.get_free_slots.return_value = []

    agent = make_agent(mock_sheets, mock_gmail, mock_calendar)
    agent.propose_slots(company_name="公司甲", company_email="a@a.com", row_num=3)

    assert mock_gmail.send_email.called
    body = mock_gmail.send_email.call_args.kwargs["body"]
    # Body should mention the time window or hours — confirms it's the "no slots" message
    assert "07:00" in body or "2-7" in body or "UK" in body
    # Must NOT book any event
    mock_calendar.create_event.assert_not_called()


def test_book_meeting_creates_calendar_event():
    mock_sheets = MagicMock()
    mock_gmail = MagicMock()
    mock_calendar = MagicMock()
    mock_calendar.create_event.return_value = {
        "id": "evt123",
        "htmlLink": "https://calendar.google.com/event?eid=abc",
    }

    agent = make_agent(mock_sheets, mock_gmail, mock_calendar)
    agent.book_meeting(
        company_name="公司甲",
        company_email="a@a.com",
        row_num=3,
        start_iso="2026-04-08T09:00:00+01:00",
        end_iso="2026-04-08T09:30:00+01:00",
    )

    mock_calendar.create_event.assert_called_once_with(
        summary="Meeting with 公司甲 - Sponsorship Discussion",
        start_iso="2026-04-08T09:00:00+01:00",
        end_iso="2026-04-08T09:30:00+01:00",
        attendee_email="a@a.com",
    )


def test_book_meeting_updates_sheet_status_and_datetime():
    mock_sheets = MagicMock()
    mock_gmail = MagicMock()
    mock_calendar = MagicMock()
    mock_calendar.create_event.return_value = {"id": "evt", "htmlLink": "https://cal"}

    agent = make_agent(mock_sheets, mock_gmail, mock_calendar)
    agent.book_meeting(
        company_name="公司甲", company_email="a@a.com", row_num=3,
        start_iso="2026-04-08T09:00:00+01:00", end_iso="2026-04-08T09:30:00+01:00",
    )

    all_args = [c.args for c in mock_sheets.update_cell.call_args_list]
    updated_cols = [a[2] for a in all_args if len(a) >= 3]
    assert config.COL_STATUS in updated_cols
    assert config.COL_MEETING_DATETIME in updated_cols


def test_book_meeting_notifies_user():
    mock_sheets = MagicMock()
    mock_gmail = MagicMock()
    mock_calendar = MagicMock()
    mock_calendar.create_event.return_value = {"id": "evt", "htmlLink": "https://cal"}

    agent = make_agent(mock_sheets, mock_gmail, mock_calendar)
    agent.book_meeting(
        company_name="公司甲", company_email="a@a.com", row_num=3,
        start_iso="2026-04-08T09:00:00+01:00", end_iso="2026-04-08T09:30:00+01:00",
    )

    assert mock_gmail.send_email.called
    body = mock_gmail.send_email.call_args.kwargs["body"]
    assert "公司甲" in body
