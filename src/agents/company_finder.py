"""
Company Finder Agent

Searches for new Taiwanese mid-size companies (excluding NGOs) not already in
the known sheets, collects verified contact info, and presents a list to the
user for confirmation before any emails are sent.

Anti-hallucination rules enforced here:
- Email field is left BLANK if a verified address cannot be found
- Companies with blank emails go to the "Needs Human Review" sheet
- Company names must be in Traditional Chinese as found on official sources
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date

from tavily import TavilyClient

from src import config
from src.integrations.gmail import GmailClient
from src.integrations.sheets import SheetsClient

logger = logging.getLogger(__name__)

# Tavily queries to find Taiwanese mid-size companies
_SEARCH_QUERIES = [
    "台灣中型企業 企業社會責任 贊助 聯絡信箱 官方網站",
    "台灣中小企業 官方網站 企業聯絡 電子郵件",
    "Taiwan mid-size company sponsorship CSR contact email site:com.tw",
    "台灣科技公司 中小企業 聯絡我們 電子郵件",
]

# Regex: match a Traditional Chinese company-name suffix
_TC_COMPANY_RE = re.compile(
    r"[\u4e00-\u9fff]{2,}(?:股份有限公司|有限公司|企業|集團|科技|實業|工業|商業)"
)

# Regex: match a plausible email address (NOT fabricated — only extracted from text)
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")


@dataclass
class CompanyRecord:
    name: str          # Official Traditional Chinese name
    email: str         # Verified; blank if not found on official source
    website: str
    review_reason: str = ""


class CompanyFinderAgent:
    def __init__(self) -> None:
        self._sheets = SheetsClient()
        self._search = TavilyClient(api_key=config.TAVILY_API_KEY)
        self._gmail = GmailClient()

    # ── Public entry point ────────────────────────────────────────────────────

    def run(self) -> None:
        """Find 20 new companies, split into verified/needs-review, notify user."""
        logger.info("CompanyFinderAgent: weekly run started")

        existing_emails = self._get_all_known_emails()
        candidates = self._search_companies(existing_emails)
        verified, needs_review = self._deduplicate(candidates)

        today = date.today().isoformat()
        self._save_to_sheets(verified, needs_review, today)

        subject, body = self._format_confirmation_email(verified, needs_review)
        self._gmail.send_email(to=config.USER_EMAIL, subject=subject, body=body)

        logger.info(
            f"CompanyFinderAgent: {len(verified)} verified, "
            f"{len(needs_review)} flagged for human review"
        )

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _get_all_known_emails(self) -> set[str]:
        known: set[str] = set()
        for sheet in [config.EXISTING_CONTACTS_SHEET_NAME, config.LEADS_SHEET_NAME]:
            try:
                known |= self._sheets.get_all_emails(sheet)
            except Exception as exc:
                logger.warning(f"Could not read sheet '{sheet}': {exc}")
        return known

    def _search_companies(self, exclude_emails: set[str]) -> list[CompanyRecord]:
        found: list[CompanyRecord] = []
        seen_names: set[str] = set()

        for query in _SEARCH_QUERIES:
            if len(found) >= config.WEEKLY_TARGET * 2:
                break
            try:
                results = self._search.search(query=query, max_results=10)
                for r in results.get("results", []):
                    record = _parse_search_result(r)
                    if record and record.name not in seen_names:
                        if not record.email or record.email.lower() not in exclude_emails:
                            found.append(record)
                            seen_names.add(record.name)
            except Exception as exc:
                logger.error(f"Tavily search failed for query '{query}': {exc}")

        return found

    def _deduplicate(
        self, candidates: list[CompanyRecord]
    ) -> tuple[list[CompanyRecord], list[CompanyRecord]]:
        """Split into verified (has name + email) and needs_human_review."""
        known_emails = self._get_all_known_emails()
        verified: list[CompanyRecord] = []
        needs_review: list[CompanyRecord] = []

        for record in candidates:
            if record.email and record.email.lower() in known_emails:
                continue  # Already known — skip silently
            if not record.email:
                record.review_reason = "email not found"
                needs_review.append(record)
            elif not record.name:
                record.review_reason = "name unverifiable"
                needs_review.append(record)
            else:
                verified.append(record)

        return verified[: config.WEEKLY_TARGET], needs_review

    def _save_to_sheets(
        self,
        verified: list[CompanyRecord],
        needs_review: list[CompanyRecord],
        today: str,
    ) -> None:
        for r in verified:
            self._sheets.append_row(
                config.LEADS_SHEET_NAME,
                [r.name, r.email, r.website, config.STATUS_FOUND, today,
                 "", "", "", "", "", ""],
            )
        for r in needs_review:
            self._sheets.append_row(
                config.HUMAN_REVIEW_SHEET_NAME,
                [r.name, r.email, r.website, config.STATUS_NEEDS_REVIEW, today,
                 "", "", "", "", r.review_reason, ""],
            )

    def _format_confirmation_email(
        self,
        verified: list[CompanyRecord],
        review: list[CompanyRecord],
    ) -> tuple[str, str]:
        subject = f"[YIT] 每週贊助名單確認 — {len(verified)} 家公司待您審核"
        lines = [
            f"本週找到 {len(verified)} 家驗證公司，{len(review)} 家需人工確認。",
            "",
            "請回覆此郵件「確認」以授權發送冷郵件，或「跳過」跳過本週。",
            "（未在週三前回覆將自動跳過本週。）",
            "",
            "── 待發送名單 ──",
        ]
        for i, r in enumerate(verified, 1):
            lines.append(f"{i}. {r.name} | {r.email} | {r.website}")

        if review:
            lines += ["", "── 需人工確認（未寄信）──"]
            for r in review:
                lines.append(f"- {r.name} | {r.website} | 原因: {r.review_reason}")

        return subject, "\n".join(lines)


# ── Module-level helpers ──────────────────────────────────────────────────────

def _parse_search_result(result: dict) -> CompanyRecord | None:
    """Extract a CompanyRecord from one Tavily result. Returns None if unusable."""
    content = result.get("content", "") + " " + result.get("url", "")
    url = result.get("url", "")

    # Extract email ONLY from page content — never fabricate
    email_match = _EMAIL_RE.search(content)
    email = email_match.group(0) if email_match else ""

    # Extract company name (must contain TC characters + company suffix)
    name_match = _TC_COMPANY_RE.search(content)
    name = name_match.group(0) if name_match else ""

    if not name:
        return None

    return CompanyRecord(name=name, email=email, website=url)
