import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
TAVILY_API_KEY = os.environ["TAVILY_API_KEY"]
GOOGLE_CREDENTIALS_FILE = os.environ.get("GOOGLE_CREDENTIALS_FILE", "credentials/oauth_credentials.json")
GOOGLE_TOKEN_FILE = os.environ.get("GOOGLE_TOKEN_FILE", "credentials/token.json")
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "")
LEADS_SHEET_NAME = os.environ.get("LEADS_SHEET_NAME", "YIT_Lead_Gen_Leads")
EXISTING_CONTACTS_SHEET_NAME = os.environ.get("EXISTING_CONTACTS_SHEET_NAME", "贊助廠商名單")
HUMAN_REVIEW_SHEET_NAME = os.environ.get("HUMAN_REVIEW_SHEET_NAME", "Needs Human Review")
USER_EMAIL = os.environ["USER_EMAIL"]
TIMEZONE_UK = os.environ.get("TIMEZONE_UK", "Europe/London")
MEETING_START_HOUR_UK = int(os.environ.get("MEETING_START_HOUR_UK", "7"))
MEETING_END_HOUR_UK = int(os.environ.get("MEETING_END_HOUR_UK", "11"))
WEEKLY_TARGET = int(os.environ.get("WEEKLY_TARGET", "20"))

# Sender identity for email template
SENDER_NAME = os.environ.get("SENDER_NAME", "徐廷宇")
SENDER_TITLE = os.environ.get("SENDER_TITLE", "營運經理")
SENDER_PHONE = os.environ.get("SENDER_PHONE", "")
PDF_LINK = os.environ.get(
    "PDF_LINK",
    "https://drive.google.com/file/d/1J77LPg8EnuTR1dohNaTmlsElUal4Hzpv/view?usp=sharing",
)

# Google Sheets column indices (0-based) for YIT_Lead_Gen_Leads
COL_COMPANY_NAME = 0
COL_EMAIL = 1
COL_WEBSITE = 2
COL_STATUS = 3
COL_DATE_FOUND = 4
COL_EMAIL_SENT_DATE = 5
COL_RESPONSE_DATE = 6
COL_REPLY_STATUS = 7
COL_MEETING_DATETIME = 8
COL_REVIEW_REASON = 9
COL_NOTES = 10

# Status values
STATUS_FOUND = "found"
STATUS_NEEDS_REVIEW = "needs_human_review"
STATUS_EMAIL_SENT = "email_sent"
STATUS_RESPONSE_RECEIVED = "response_received"
STATUS_REPLY_DRAFTED = "reply_drafted_awaiting_approval"
STATUS_REPLY_SENT = "reply_sent"
STATUS_MEETING_SCHEDULED = "meeting_scheduled"
STATUS_CONTACTED = "contacted"
STATUS_REJECTED = "rejected"

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]
