import pytest
from unittest.mock import MagicMock, patch
from src.integrations.sheets import SheetsClient
from src import config


def make_client(mock_service):
    with patch("src.integrations.sheets.build_sheets_service", return_value=mock_service):
        return SheetsClient()


def test_get_all_emails_from_sheet(mock_sheets_service):
    mock_sheets_service.spreadsheets().values().get().execute.return_value = {
        "values": [
            ["公司甲", "a@a.com", "https://a.com", "found"],
            ["公司乙", "b@b.com", "https://b.com", "email_sent"],
        ]
    }
    client = make_client(mock_sheets_service)
    emails = client.get_all_emails(config.LEADS_SHEET_NAME)
    assert "a@a.com" in emails
    assert "b@b.com" in emails


def test_get_all_emails_ignores_blank_emails(mock_sheets_service):
    mock_sheets_service.spreadsheets().values().get().execute.return_value = {
        "values": [
            ["公司甲", "", "https://a.com", "needs_human_review"],
            ["公司乙", "b@b.com", "https://b.com", "found"],
        ]
    }
    client = make_client(mock_sheets_service)
    emails = client.get_all_emails(config.LEADS_SHEET_NAME)
    assert "" not in emails
    assert "b@b.com" in emails
    assert len(emails) == 1


def test_append_row(mock_sheets_service):
    client = make_client(mock_sheets_service)
    mock_sheets_service.spreadsheets().values().append().execute.return_value = {}
    mock_sheets_service.reset_mock()
    client.append_row(config.LEADS_SHEET_NAME, ["新公司", "new@co.com", "https://co.com", "found", "2026-04-06"])
    assert mock_sheets_service.spreadsheets().values().append.called


def test_update_cell(mock_sheets_service):
    client = make_client(mock_sheets_service)
    mock_sheets_service.spreadsheets().values().update().execute.return_value = {}
    mock_sheets_service.reset_mock()
    client.update_cell(config.LEADS_SHEET_NAME, row=2, col=config.COL_STATUS, value="email_sent")
    assert mock_sheets_service.spreadsheets().values().update.called


def test_get_rows_by_status(mock_sheets_service, sample_leads_rows):
    mock_sheets_service.spreadsheets().values().get().execute.return_value = {
        "values": sample_leads_rows
    }
    client = make_client(mock_sheets_service)
    rows = client.get_rows_by_status(config.LEADS_SHEET_NAME, "found")
    assert len(rows) == 1
    assert rows[0][0] == "公司甲"


def test_find_row_by_email_returns_correct_row(mock_sheets_service, sample_leads_rows):
    mock_sheets_service.spreadsheets().values().get().execute.return_value = {
        "values": sample_leads_rows
    }
    client = make_client(mock_sheets_service)
    result = client.find_row_by_email(config.LEADS_SHEET_NAME, "contact@a.com")
    assert result is not None
    row_num, row = result
    assert row_num == 1  # 1-based
    assert row[0] == "公司甲"


def test_find_row_by_email_returns_none_when_not_found(mock_sheets_service):
    mock_sheets_service.spreadsheets().values().get().execute.return_value = {
        "values": [["公司甲", "a@a.com", "https://a.com", "found"]]
    }
    client = make_client(mock_sheets_service)
    result = client.find_row_by_email(config.LEADS_SHEET_NAME, "nothere@x.com")
    assert result is None
