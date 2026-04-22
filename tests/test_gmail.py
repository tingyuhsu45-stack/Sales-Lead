import pytest
import base64
from unittest.mock import MagicMock, patch
from src.integrations.gmail import GmailClient


def make_client(mock_service):
    with patch("src.integrations.gmail.build_gmail_service", return_value=mock_service):
        return GmailClient()


def test_send_plain_email():
    mock_service = MagicMock()
    mock_service.users().messages().send().execute.return_value = {"id": "msg123"}
    client = make_client(mock_service)
    result = client.send_email(to="test@company.com", subject="Test", body="Hello")
    assert result == "msg123"


def test_send_html_email():
    mock_service = MagicMock()
    mock_service.users().messages().send().execute.return_value = {"id": "msg456"}
    client = make_client(mock_service)
    result = client.send_email(to="test@company.com", subject="Test", body="<p>Hello</p>", html=True)
    assert result == "msg456"


def test_search_messages_returns_ids():
    mock_service = MagicMock()
    mock_service.users().messages().list().execute.return_value = {
        "messages": [{"id": "abc"}, {"id": "def"}]
    }
    client = make_client(mock_service)
    ids = client.search_message_ids(query="subject:YIT")
    assert "abc" in ids
    assert "def" in ids


def test_search_messages_returns_empty_when_none():
    mock_service = MagicMock()
    mock_service.users().messages().list().execute.return_value = {}
    client = make_client(mock_service)
    ids = client.search_message_ids(query="subject:YIT")
    assert ids == []


def test_get_message_parses_sender_and_body():
    mock_service = MagicMock()
    raw_body = base64.urlsafe_b64encode(b"Hello from sponsor").decode()
    mock_service.users().messages().get().execute.return_value = {
        "id": "abc",
        "threadId": "thread1",
        "payload": {
            "headers": [
                {"name": "From", "value": "sponsor@company.com"},
                {"name": "Subject", "value": "Re: YIT"},
            ],
            "body": {"data": raw_body},
            "parts": [],
        },
    }
    client = make_client(mock_service)
    msg = client.get_message("abc")
    assert msg["from"] == "sponsor@company.com"
    assert msg["subject"] == "Re: YIT"
    assert "Hello from sponsor" in msg["body"]
    assert msg["thread_id"] == "thread1"


def test_get_message_extracts_body_from_parts():
    mock_service = MagicMock()
    raw_body = base64.urlsafe_b64encode(b"Body in parts").decode()
    mock_service.users().messages().get().execute.return_value = {
        "id": "xyz",
        "threadId": "t2",
        "payload": {
            "headers": [
                {"name": "From", "value": "a@b.com"},
                {"name": "Subject", "value": "Hello"},
            ],
            "body": {},
            "parts": [
                {"mimeType": "text/html", "body": {}},
                {"mimeType": "text/plain", "body": {"data": raw_body}},
            ],
        },
    }
    client = make_client(mock_service)
    msg = client.get_message("xyz")
    assert "Body in parts" in msg["body"]
