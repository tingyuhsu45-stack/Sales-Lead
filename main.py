"""
YIT PR Agent Team — Orchestrator
=================================
Schedules and coordinates all agents:

  Weekly (Mon 09:00 UK):
    1. CompanyFinderAgent — finds 20 new Taiwanese companies, sends list to user for approval
    2. EmailSenderAgent   — sends cold HTML emails to STATUS_FOUND companies (after user confirms)

  Every 2 hours:
    3. ResponseMonitorAgent — scans Gmail for sponsor replies, matches to leads
    4. ReplyDrafterAgent    — drafts a Claude-powered reply for each new response (sent to user, never auto-sent)

Manual (user-triggered via MeetingSchedulerAgent):
    5. MeetingSchedulerAgent.propose_slots()  — emails user with available slots
    6. MeetingSchedulerAgent.book_meeting()   — creates calendar event after user confirms

Setup (run once before starting the scheduler):
    python setup.py
      - Authorises Google OAuth
      - Creates the Google Spreadsheet (all 4 tabs) and writes SPREADSHEET_ID to .env
      - User must supply credentials/oauth_credentials.json + fill in .env (API keys)
"""
import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from src.agents.company_finder import CompanyFinderAgent
from src.agents.email_sender import EmailSenderAgent
from src.agents.response_monitor import ResponseMonitorAgent
from src.agents.reply_drafter import ReplyDrafterAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ── Job functions ─────────────────────────────────────────────────────────────

def run_weekly_finder() -> None:
    """Find new companies and queue them; then send cold emails to approved leads."""
    logger.info("Weekly finder job starting")
    CompanyFinderAgent().run()
    logger.info("Weekly finder job complete")


def run_email_sender() -> None:
    """Send cold emails to all STATUS_FOUND leads (runs after user approves finder list)."""
    logger.info("Email sender job starting")
    EmailSenderAgent().run()
    logger.info("Email sender job complete")


def run_monitor() -> None:
    """Check Gmail for sponsor replies and draft responses for each one."""
    logger.info("Response monitor job starting")
    responses = ResponseMonitorAgent().run()
    if responses:
        drafter = ReplyDrafterAgent()
        for response in responses:
            drafter.run(response)
    logger.info("Response monitor job complete — %d response(s) drafted", len(responses) if responses else 0)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    scheduler = BlockingScheduler(timezone="Europe/London")

    # Weekly: find companies + send emails every Monday at 09:00 UK time
    scheduler.add_job(
        run_weekly_finder,
        CronTrigger(day_of_week="mon", hour=9, minute=0, timezone="Europe/London"),
        id="weekly_finder",
        name="Company Finder (weekly)",
        misfire_grace_time=3600,
    )

    # Every 2 hours: monitor Gmail for sponsor responses
    scheduler.add_job(
        run_monitor,
        "interval",
        hours=2,
        id="response_monitor",
        name="Response Monitor (2h)",
        misfire_grace_time=300,
    )

    logger.info("YIT PR Agent Team scheduler started. Press Ctrl+C to stop.")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")
