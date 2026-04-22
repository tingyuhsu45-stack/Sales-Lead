import pytest
from unittest.mock import MagicMock, patch
from src.agents.company_finder import CompanyFinderAgent, CompanyRecord


def make_agent(mock_sheets, mock_search, mock_gmail):
    with patch("src.agents.company_finder.SheetsClient", return_value=mock_sheets), \
         patch("src.agents.company_finder.TavilyClient", return_value=mock_search), \
         patch("src.agents.company_finder.GmailClient", return_value=mock_gmail):
        return CompanyFinderAgent()


def test_deduplicates_against_existing_contacts():
    mock_sheets = MagicMock()
    mock_sheets.get_all_emails.return_value = {"existing@company.com"}
    mock_search = MagicMock()
    mock_gmail = MagicMock()
    agent = make_agent(mock_sheets, mock_search, mock_gmail)

    verified, review = agent._deduplicate([
        CompanyRecord(name="公司甲", email="existing@company.com", website="https://a.com")
    ])
    assert len(verified) == 0
    assert len(review) == 0  # duplicate — silently skipped


def test_routes_missing_email_to_human_review():
    mock_sheets = MagicMock()
    mock_sheets.get_all_emails.return_value = set()
    agent = make_agent(mock_sheets, MagicMock(), MagicMock())

    record = CompanyRecord(name="無Email公司", email="", website="https://noemail.com")
    verified, review = agent._deduplicate([record])
    assert len(verified) == 0
    assert len(review) == 1
    assert review[0].review_reason == "email not found"


def test_verified_record_has_name_and_email():
    mock_sheets = MagicMock()
    mock_sheets.get_all_emails.return_value = set()
    agent = make_agent(mock_sheets, MagicMock(), MagicMock())

    record = CompanyRecord(name="好公司", email="hello@good.com", website="https://good.com")
    verified, review = agent._deduplicate([record])
    assert len(verified) == 1
    assert len(review) == 0


def test_missing_name_goes_to_human_review():
    mock_sheets = MagicMock()
    mock_sheets.get_all_emails.return_value = set()
    agent = make_agent(mock_sheets, MagicMock(), MagicMock())

    record = CompanyRecord(name="", email="info@co.com", website="https://co.com")
    verified, review = agent._deduplicate([record])
    assert len(verified) == 0
    assert len(review) == 1
    assert review[0].review_reason == "name unverifiable"


def test_format_confirmation_email_lists_all_companies():
    mock_sheets = MagicMock()
    mock_sheets.get_all_emails.return_value = set()
    agent = make_agent(mock_sheets, MagicMock(), MagicMock())

    records = [
        CompanyRecord(name="公司甲", email="a@a.com", website="https://a.com"),
        CompanyRecord(name="公司乙", email="b@b.com", website="https://b.com"),
    ]
    subject, body = agent._format_confirmation_email(records, review=[])
    assert "公司甲" in body
    assert "公司乙" in body
    assert "a@a.com" in body
    assert "確認" in body or "confirm" in body.lower()


def test_format_confirmation_email_includes_review_section():
    mock_sheets = MagicMock()
    mock_sheets.get_all_emails.return_value = set()
    agent = make_agent(mock_sheets, MagicMock(), MagicMock())

    verified = [CompanyRecord(name="公司甲", email="a@a.com", website="https://a.com")]
    review = [CompanyRecord(name="無郵件公司", email="", website="https://x.com", review_reason="email not found")]
    subject, body = agent._format_confirmation_email(verified, review)
    assert "無郵件公司" in body
    assert "email not found" in body
