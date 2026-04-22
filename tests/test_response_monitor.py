import pytest
from unittest.mock import MagicMock, patch
from src.agents.response_monitor import ResponseMonitorAgent


def make_agent(mock_sheets, mock_gmail):
    with patch("src.agents.response_monitor.SheetsClient", return_value=mock_sheets), \
         patch("src.agents.response_monitor.GmailClient", return_value=mock_gmail):
        return ResponseMonitorAgent()


def _email_row(email="contact@company.com", status="email_sent"):
    return ["公司甲", email, "https://company.com", status, "2026-04-02", "2026-04-03", "", "", "", "", ""]


def test_matches_reply_by_exact_email():
    mock_sheets = MagicMock()
    mock_sheets.get_all_rows.return_value = [_email_row("sponsor@company.com")]
    mock_gmail = MagicMock()
    mock_gmail.search_message_ids.return_value = ["msg1"]
    mock_gmail.get_message.return_value = {
        "id": "msg1", "from": "sponsor@company.com",
        "subject": "Re: YIT", "body": "Interested!", "thread_id": "t1",
    }

    agent = make_agent(mock_sheets, mock_gmail)
    responses = agent._check_for_responses()
    assert len(responses) == 1
    assert responses[0]["company_name"] == "公司甲"


def test_matches_reply_by_domain_fallback():
    mock_sheets = MagicMock()
    mock_sheets.get_all_rows.return_value = [_email_row("contact@company.com")]
    mock_gmail = MagicMock()
    mock_gmail.search_message_ids.return_value = ["msg1"]
    mock_gmail.get_message.return_value = {
        "id": "msg1", "from": "boss@company.com",  # different address, same domain
        "subject": "Re: YIT", "body": "Interested!", "thread_id": "t1",
    }

    agent = make_agent(mock_sheets, mock_gmail)
    responses = agent._check_for_responses()
    assert len(responses) == 1
    assert responses[0]["company_name"] == "公司甲"


def test_unmatched_sender_routes_to_human_review():
    mock_sheets = MagicMock()
    mock_sheets.get_all_rows.return_value = [_email_row("contact@company.com")]
    mock_gmail = MagicMock()
    mock_gmail.search_message_ids.return_value = ["msg1"]
    mock_gmail.get_message.return_value = {
        "id": "msg1", "from": "unknown@other.com",
        "subject": "Re: YIT", "body": "Hello", "thread_id": "t1",
    }

    agent = make_agent(mock_sheets, mock_gmail)
    responses = agent._check_for_responses()
    assert len(responses) == 0
    mock_sheets.append_row.assert_called_once()  # Routed to human review


def test_no_messages_returns_empty():
    mock_sheets = MagicMock()
    mock_gmail = MagicMock()
    mock_gmail.search_message_ids.return_value = []

    agent = make_agent(mock_sheets, mock_gmail)
    responses = agent._check_for_responses()
    assert responses == []
    mock_sheets.get_all_rows.assert_not_called()


def test_marks_message_as_read_after_match():
    mock_sheets = MagicMock()
    mock_sheets.get_all_rows.return_value = [_email_row("a@a.com")]
    mock_gmail = MagicMock()
    mock_gmail.search_message_ids.return_value = ["msg1"]
    mock_gmail.get_message.return_value = {
        "id": "msg1", "from": "a@a.com",
        "subject": "Re: YIT", "body": "Yes!", "thread_id": "t1",
    }

    agent = make_agent(mock_sheets, mock_gmail)
    agent._check_for_responses()
    mock_gmail.mark_as_read.assert_called_once_with("msg1")
