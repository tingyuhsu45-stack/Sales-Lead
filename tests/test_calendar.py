import pytest
from unittest.mock import MagicMock, patch
from src.integrations.calendar import CalendarClient


def make_client(mock_service):
    with patch("src.integrations.calendar.build_calendar_service", return_value=mock_service):
        return CalendarClient()


def test_get_free_slots_returns_slots_within_window():
    mock_service = MagicMock()
    mock_service.freebusy().query().execute.return_value = {
        "calendars": {"primary": {"busy": []}}
    }
    client = make_client(mock_service)
    slots = client.get_free_slots(days_ahead_min=2, days_ahead_max=7, max_slots=3)
    assert len(slots) <= 3
    for slot in slots:
        assert "start" in slot
        assert "end" in slot


def test_get_free_slots_returns_no_more_than_max():
    mock_service = MagicMock()
    mock_service.freebusy().query().execute.return_value = {
        "calendars": {"primary": {"busy": []}}
    }
    client = make_client(mock_service)
    slots = client.get_free_slots(days_ahead_min=2, days_ahead_max=14, max_slots=2)
    assert len(slots) <= 2


def test_get_free_slots_excludes_busy_overlap():
    mock_service = MagicMock()
    # Mark a 4-hour block as busy — no 30-min slot should fall in this range
    mock_service.freebusy().query().execute.return_value = {
        "calendars": {
            "primary": {
                "busy": [
                    {
                        "start": "2020-01-01T07:00:00+00:00",
                        "end": "2020-01-01T11:00:00+00:00",
                    }
                ]
            }
        }
    }
    client = make_client(mock_service)
    slots = client.get_free_slots(days_ahead_min=2, days_ahead_max=7, max_slots=3)
    for slot in slots:
        assert "2020-01-01" not in slot["start"]


def test_create_event_calls_insert():
    mock_service = MagicMock()
    mock_service.events().insert().execute.return_value = {
        "id": "evt123",
        "htmlLink": "https://calendar.google.com/event?eid=abc",
    }
    client = make_client(mock_service)
    result = client.create_event(
        summary="Meeting with 台灣公司 - Sponsorship Discussion",
        start_iso="2026-04-08T09:00:00+01:00",
        end_iso="2026-04-08T09:30:00+01:00",
        attendee_email="sponsor@company.com",
    )
    assert result["id"] == "evt123"
    assert mock_service.events().insert.called
