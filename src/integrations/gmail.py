import base64
from email.mime.text import MIMEText
from googleapiclient.discovery import build
from src import config
from src.integrations.sheets import get_credentials


def build_gmail_service():
    return build("gmail", "v1", credentials=get_credentials())


class GmailClient:
    def __init__(self):
        self._service = build_gmail_service()

    def send_email(self, to: str, subject: str, body: str, html: bool = False) -> str:
        """Send an email. Set html=True for HTML body. Returns message ID."""
        mime_type = "html" if html else "plain"
        message = MIMEText(body, mime_type, "utf-8")
        message["to"] = to
        message["subject"] = subject
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        sent = (
            self._service.users()
            .messages()
            .send(userId="me", body={"raw": raw})
            .execute()
        )
        return sent["id"]

    def search_message_ids(self, query: str) -> list[str]:
        """Search Gmail with a query string and return matching message IDs."""
        result = (
            self._service.users()
            .messages()
            .list(userId="me", q=query)
            .execute()
        )
        return [m["id"] for m in result.get("messages", [])]

    def get_message(self, message_id: str) -> dict:
        """Fetch a message and return a dict with: id, thread_id, from, subject, body."""
        raw = (
            self._service.users()
            .messages()
            .get(userId="me", id=message_id, format="full")
            .execute()
        )
        payload = raw.get("payload", {})
        headers = {h["name"]: h["value"] for h in payload.get("headers", [])}
        body = _extract_body(payload)
        return {
            "id": raw["id"],
            "thread_id": raw.get("threadId", ""),
            "from": headers.get("From", ""),
            "subject": headers.get("Subject", ""),
            "body": body,
        }

    def mark_as_read(self, message_id: str) -> None:
        self._service.users().messages().modify(
            userId="me",
            id=message_id,
            body={"removeLabelIds": ["UNREAD"]},
        ).execute()


def _extract_body(payload: dict) -> str:
    """Recursively extract plain-text body from a Gmail message payload."""
    # Direct body data
    data = payload.get("body", {}).get("data", "")
    if data:
        return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    # Search parts for text/plain first, then any part
    for part in payload.get("parts", []):
        if part.get("mimeType") == "text/plain":
            part_data = part.get("body", {}).get("data", "")
            if part_data:
                return base64.urlsafe_b64decode(part_data).decode("utf-8", errors="replace")
    for part in payload.get("parts", []):
        result = _extract_body(part)
        if result:
            return result
    return ""
