import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from src import config


def get_credentials() -> Credentials:
    """Load or refresh Google OAuth credentials, prompting if necessary."""
    creds = None
    if os.path.exists(config.GOOGLE_TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(
            config.GOOGLE_TOKEN_FILE, config.GOOGLE_SCOPES
        )
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                config.GOOGLE_CREDENTIALS_FILE, config.GOOGLE_SCOPES
            )
            creds = flow.run_local_server(port=0)
        with open(config.GOOGLE_TOKEN_FILE, "w") as token:
            token.write(creds.to_json())
    return creds


def build_sheets_service():
    return build("sheets", "v4", credentials=get_credentials())


class SheetsClient:
    def __init__(self):
        self._service = build_sheets_service()
        self._spreadsheet_id = config.SPREADSHEET_ID

    def get_all_rows(self, sheet_name: str) -> list[list[str]]:
        result = (
            self._service.spreadsheets()
            .values()
            .get(spreadsheetId=self._spreadsheet_id, range=sheet_name)
            .execute()
        )
        return result.get("values", [])

    def get_all_emails(self, sheet_name: str) -> set[str]:
        rows = self.get_all_rows(sheet_name)
        emails = set()
        for row in rows:
            if len(row) > config.COL_EMAIL and row[config.COL_EMAIL].strip():
                emails.add(row[config.COL_EMAIL].strip().lower())
        return emails

    def get_rows_by_status(self, sheet_name: str, status: str) -> list[list[str]]:
        rows = self.get_all_rows(sheet_name)
        return [
            row for row in rows
            if len(row) > config.COL_STATUS and row[config.COL_STATUS] == status
        ]

    def append_row(self, sheet_name: str, values: list) -> None:
        body = {"values": [values]}
        self._service.spreadsheets().values().append(
            spreadsheetId=self._spreadsheet_id,
            range=sheet_name,
            valueInputOption="USER_ENTERED",
            body=body,
        ).execute()

    def update_cell(self, sheet_name: str, row: int, col: int, value: str) -> None:
        """Update a single cell. row is 1-based; col is 0-based column index."""
        col_letter = chr(ord("A") + col)
        cell_range = f"{sheet_name}!{col_letter}{row}"
        body = {"values": [[value]]}
        self._service.spreadsheets().values().update(
            spreadsheetId=self._spreadsheet_id,
            range=cell_range,
            valueInputOption="USER_ENTERED",
            body=body,
        ).execute()

    def find_row_by_email(self, sheet_name: str, email: str) -> tuple[int, list] | None:
        """Return (1-based row number, row data) for the first row matching email, or None."""
        rows = self.get_all_rows(sheet_name)
        for i, row in enumerate(rows):
            if len(row) > config.COL_EMAIL and row[config.COL_EMAIL].strip().lower() == email.lower():
                return i + 1, row
        return None
