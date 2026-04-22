import os
import pytest
from unittest.mock import MagicMock

# Set required env vars before any src module is imported during collection
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("TAVILY_API_KEY", "test-tavily-key")
os.environ.setdefault("USER_EMAIL", "test@example.com")
os.environ.setdefault("SPREADSHEET_ID", "test-sheet-id")


@pytest.fixture
def mock_sheets_service():
    """Mock Google Sheets API service."""
    return MagicMock()


@pytest.fixture
def sample_leads_rows():
    return [
        ["公司甲", "contact@a.com", "https://a.com", "found", "2026-04-01", "", "", "", "", "", ""],
        ["公司乙", "contact@b.com", "https://b.com", "email_sent", "2026-04-01", "2026-04-02", "", "", "", "", ""],
    ]
