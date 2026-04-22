"""
YIT PR Agent — OAuth-only authorization helper.

Run this once if you want to authorize Google APIs separately from the full setup:
  python setup_auth.py

For first-time setup (creates spreadsheet too), use setup.py instead:
  python setup.py
"""
from src.integrations.sheets import get_credentials

if __name__ == "__main__":
    print("Opening browser for Google OAuth authorization...")
    creds = get_credentials()
    print("Authorization complete. Token saved to credentials/token.json")
    print("Scopes granted:")
    for scope in sorted(creds.scopes or []):
        print(f"  - {scope}")
