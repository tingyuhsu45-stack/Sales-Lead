import pytest
from unittest.mock import MagicMock, patch, call
from src.agents.email_sender import EmailSenderAgent
from src import config


def make_agent(mock_sheets, mock_gmail):
    with patch("src.agents.email_sender.SheetsClient", return_value=mock_sheets), \
         patch("src.agents.email_sender.GmailClient", return_value=mock_gmail):
        return EmailSenderAgent()


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr("src.agents.email_sender.time.sleep", lambda _: None)


def test_sends_html_email_to_each_company():
    mock_sheets = MagicMock()
    mock_sheets.get_rows_by_status.return_value = [
        ["公司甲", "a@a.com", "https://a.com", "found", "2026-04-06"],
        ["公司乙", "b@b.com", "https://b.com", "found", "2026-04-06"],
    ]
    mock_sheets.find_row_by_email.side_effect = lambda s, e: (2, []) if e == "a@a.com" else (3, [])
    mock_gmail = MagicMock()
    mock_gmail.send_email.return_value = "msg1"

    agent = make_agent(mock_sheets, mock_gmail)
    agent.run()

    # Two cold emails + one summary notification = 3 total
    assert mock_gmail.send_email.call_count == 3
    # First two calls are to company addresses
    company_calls = [c for c in mock_gmail.send_email.call_args_list
                     if c.kwargs.get("to") != config.USER_EMAIL]
    assert len(company_calls) == 2
    assert company_calls[0].kwargs["to"] == "a@a.com"
    assert company_calls[0].kwargs.get("html") is True
    assert "公司甲" in company_calls[0].kwargs["subject"]


def test_updates_sheet_status_and_date_after_send():
    mock_sheets = MagicMock()
    mock_sheets.get_rows_by_status.return_value = [
        ["公司甲", "a@a.com", "https://a.com", "found", "2026-04-06"],
    ]
    mock_sheets.find_row_by_email.return_value = (2, [])
    mock_gmail = MagicMock()
    mock_gmail.send_email.return_value = "msg1"

    agent = make_agent(mock_sheets, mock_gmail)
    agent.run()

    assert mock_sheets.update_cell.called
    # update_cell(sheet, row, col, value) — col is args[2]
    all_args = [c.args for c in mock_sheets.update_cell.call_args_list]
    updated_cols = [a[2] for a in all_args if len(a) >= 3]
    assert config.COL_STATUS in updated_cols
    assert config.COL_EMAIL_SENT_DATE in updated_cols


def test_retries_failed_send_three_times_total():
    mock_sheets = MagicMock()
    mock_sheets.get_rows_by_status.return_value = [
        ["公司甲", "a@a.com", "https://a.com", "found", "2026-04-06"],
    ]
    mock_sheets.find_row_by_email.return_value = (2, [])
    mock_gmail = MagicMock()
    # Cold email always fails; summary succeeds
    mock_gmail.send_email.side_effect = [
        Exception("fail"), Exception("fail"), Exception("fail"),
        None,  # summary email succeeds
    ]

    agent = make_agent(mock_sheets, mock_gmail)
    agent.run()

    # 3 cold email attempts + 1 summary = 4
    assert mock_gmail.send_email.call_count == 4
    # No sheet update (send failed)
    mock_sheets.update_cell.assert_not_called()


def test_failed_companies_reported_in_summary():
    mock_sheets = MagicMock()
    mock_sheets.get_rows_by_status.return_value = [
        ["公司甲", "a@a.com", "https://a.com", "found", "2026-04-06"],
    ]
    mock_sheets.find_row_by_email.return_value = (2, [])
    mock_gmail = MagicMock()
    mock_gmail.send_email.side_effect = [
        Exception("fail"), Exception("fail"), Exception("fail"),
        None,
    ]

    agent = make_agent(mock_sheets, mock_gmail)
    agent.run()

    summary_call = mock_gmail.send_email.call_args_list[-1]
    assert "公司甲" in summary_call.kwargs["body"]
