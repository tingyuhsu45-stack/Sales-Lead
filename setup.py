"""
YIT PR Agent — First-time setup script.

Run once before starting the system:
  1. Fill in USER_EMAIL, ANTHROPIC_API_KEY, TAVILY_API_KEY in .env
  2. Place OAuth credentials at credentials/oauth_credentials.json
     (Download from Google Cloud Console → APIs & Services → Credentials)
  3. python setup.py

The script will:
  - Open a browser window to authorize Google APIs (Gmail, Calendar, Sheets)
  - Create the Google Spreadsheet with all required tabs and headers
  - Write SPREADSHEET_ID back into your .env file automatically
"""
import os
import re
from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]

SHEET_TABS = {
    "YIT_Lead_Gen_Leads": [
        "Company Name (TC)", "Contact Email", "Website", "Status",
        "Date Found", "Email Sent Date", "Response Received Date",
        "Reply Status", "Meeting Date/Time", "Review Reason", "Notes"
    ],
    "贊助廠商名單": [
        "Company Name (TC)", "Contact Email", "Website", "Status",
        "Date Found", "Email Sent Date", "Notes"
    ],
    "Needs Human Review": [
        "Company Name (TC)", "Contact Email", "Website", "Status",
        "Date Found", "Email Sent Date", "Response Received Date",
        "Reply Status", "Meeting Date/Time", "Review Reason", "Notes"
    ],
    "YIT_Context": [
        "Category", "Content"
    ],
    "Settings": [
        "Key", "Value (edit this column)", "Description"
    ],
}

# Default values for the Settings tab (editable from the Google Sheet)
SETTINGS_DEFAULTS = [
    # Key                        Value                                                          Description
    ["MONITOR_INTERVAL_HOURS",   "2",                                                           "How often to scan Gmail for replies (hours). Min 1."],
    ["SEARCH_QUERY_1",           "台灣中型企業 企業社會責任 贊助 聯絡信箱 官方網站",                  "Tavily search query 1"],
    ["SEARCH_QUERY_2",           "台灣中小企業 官方網站 企業聯絡 電子郵件",                         "Tavily search query 2"],
    ["SEARCH_QUERY_3",           "Taiwan mid-size company sponsorship CSR contact email site:com.tw", "Tavily search query 3 (English)"],
    ["SEARCH_QUERY_4",           "台灣科技公司 中小企業 聯絡我們 電子郵件",                         "Tavily search query 4"],
    ["WEEKLY_TARGET",            "20",                                                          "Number of new companies to find per week"],
    ["MEETING_START_HOUR_UK",    "7",                                                           "Meeting window start UK time (7 = 14:00 Taiwan BST)"],
    ["MEETING_END_HOUR_UK",      "11",                                                          "Meeting window end UK time (11 = 18:00 Taiwan BST)"],
    ["DAYS_AHEAD_MIN",           "3",                                                           "Min days ahead when proposing meeting slots"],
    ["DAYS_AHEAD_MAX",           "7",                                                           "Max days ahead when proposing meeting slots"],
    ["BCC_EMAILS",               "tingyuhsu45@gmail.com,chanelhwung94@gmail.com",               "BCC on meeting emails (comma-separated)"],
]


def get_credentials(credentials_file: str, token_file: str) -> Credentials:
    creds = None
    if os.path.exists(token_file):
        creds = Credentials.from_authorized_user_file(token_file, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(credentials_file, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(token_file, "w") as f:
            f.write(creds.to_json())
    return creds


def create_spreadsheet(sheets_service) -> str:
    """Create YIT PR Agent spreadsheet with all tabs and headers. Returns spreadsheet ID."""
    spreadsheet = sheets_service.spreadsheets().create(body={
        "properties": {"title": "YIT PR Agent — Sponsorship Pipeline"},
        "sheets": [{"properties": {"title": name}} for name in SHEET_TABS],
    }).execute()
    spreadsheet_id = spreadsheet["spreadsheetId"]

    # Write column headers to each tab
    for tab_name, headers in SHEET_TABS.items():
        sheets_service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"{tab_name}!A1",
            valueInputOption="USER_ENTERED",
            body={"values": [headers]},
        ).execute()

    # Pre-populate the Settings tab with default values
    settings_rows = [SETTINGS_DEFAULTS[i] for i in range(len(SETTINGS_DEFAULTS))]
    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="Settings!A2",
        valueInputOption="USER_ENTERED",
        body={"values": settings_rows},
    ).execute()

    return spreadsheet_id


def write_spreadsheet_id_to_env(spreadsheet_id: str, env_file: str = ".env") -> None:
    """Write or update SPREADSHEET_ID in .env file."""
    if not os.path.exists(env_file):
        with open(env_file, "a") as f:
            f.write(f"\nSPREADSHEET_ID={spreadsheet_id}\n")
        return

    with open(env_file, "r", encoding="utf-8") as f:
        content = f.read()

    if "SPREADSHEET_ID=" in content:
        content = re.sub(r"SPREADSHEET_ID=.*", f"SPREADSHEET_ID={spreadsheet_id}", content)
    else:
        content += f"\nSPREADSHEET_ID={spreadsheet_id}\n"

    with open(env_file, "w", encoding="utf-8") as f:
        f.write(content)


def main():
    load_dotenv()
    credentials_file = os.environ.get("GOOGLE_CREDENTIALS_FILE", "credentials/oauth_credentials.json")
    token_file = os.environ.get("GOOGLE_TOKEN_FILE", "credentials/token.json")

    if not os.path.exists(credentials_file):
        print(f"\nERROR: OAuth credentials not found at: {credentials_file}")
        print("   Download from: Google Cloud Console > APIs & Services > Credentials")
        print("   Enable APIs: Gmail API, Google Calendar API, Google Sheets API, Google Drive API")
        print("   Create: OAuth 2.0 Client ID (Desktop app) > download JSON > save as above path")
        return

    print("\n[Step 1] Authorizing Google APIs (browser will open)...")
    creds = get_credentials(credentials_file, token_file)
    print(f"   OK: Token saved to {token_file}")

    print("\n[Step 2] Creating Google Spreadsheet with all tabs...")
    sheets_service = build("sheets", "v4", credentials=creds)
    spreadsheet_id = create_spreadsheet(sheets_service)
    print(f"   OK: Spreadsheet created")
    print(f"   URL: https://docs.google.com/spreadsheets/d/{spreadsheet_id}")

    print("\n[Step 3] Writing SPREADSHEET_ID to .env...")
    write_spreadsheet_id_to_env(spreadsheet_id)
    print("   OK: .env updated")

    print("\nSetup complete!")
    print("\nNext steps:")
    print("  1. Fill in the YIT_Context tab in your spreadsheet with YIT program info")
    print("  2. Run:  python main.py")
    print(f"\nSpreadsheet: https://docs.google.com/spreadsheets/d/{spreadsheet_id}")
    print("\nIMPORTANT: Fill in the YIT_Context tab before running -- the Reply Drafter")
    print("   needs this data to answer sponsor questions accurately.")


if __name__ == "__main__":
    main()
