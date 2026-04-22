/**
 * YIT PR Agent v2 — Orchestrator
 * ================================
 *
 * FIRST-TIME SETUP (run each function once, in order):
 *   1. setScriptProperties()   — paste API keys + email into Config.gs first
 *   2. runSetup()              — creates the spreadsheet, all tabs, and triggers
 *
 * THEN:
 *   3. Fill in the YIT_Context tab in your Google Sheet
 *   4. Everything runs automatically from here
 *
 * MANUAL RUNS (any time from Apps Script editor):
 *   weeklyFinderJob()  — find new companies now (normally runs every Monday 09:00 UK)
 *   sendEmailsJob()    — send cold emails to all STATUS=found leads
 *   monitorJob()       — scan Gmail for sponsor replies now
 *   previewFreeSlots() — see available meeting slots
 *
 * STOP THE SYSTEM:
 *   deleteTriggers()   — disables all automatic runs
 *   — or: Apps Script Editor → Triggers (clock icon) → delete all
 *
 * CHANGE SETTINGS / PROMPTS:
 *   Open your Google Sheet → Settings tab → edit Column B
 *   Changes take effect on the next trigger run — no code edit needed.
 */

// ── Scheduled job entry points ────────────────────────────────────────────────

/**
 * Weekly job — find 20 new companies, email user for approval.
 * Trigger: every Monday 09:00 UK time.
 */
function weeklyFinderJob() {
  try {
    runWeeklyFinder();
  } catch (err) {
    console.error(`weeklyFinderJob failed: ${err}\n${err.stack}`);
    notifyError_('Company Finder', err);
  }
}

/**
 * Hourly trigger — respects MONITOR_INTERVAL_HOURS from Settings sheet.
 * Skips the run if not enough time has passed since the last scan.
 */
function monitorJob() {
  const cfg           = getConfig();
  const intervalHours = cfg.MONITOR_INTERVAL_HOURS || 2;
  const props         = PropertiesService.getScriptProperties();
  const lastRunStr    = props.getProperty('LAST_MONITOR_RUN');

  if (lastRunStr) {
    const hoursSinceLast = (Date.now() - new Date(lastRunStr).getTime()) / 3_600_000;
    if (hoursSinceLast < intervalHours - 0.05) {
      console.log(`monitorJob: skipping — ${hoursSinceLast.toFixed(2)}h since last run (interval: ${intervalHours}h)`);
      return;
    }
  }

  props.setProperty('LAST_MONITOR_RUN', new Date().toISOString());

  try {
    runEmailReader();
  } catch (err) {
    console.error(`monitorJob failed: ${err}\n${err.stack}`);
    notifyError_('Email Reader', err);
  }
}

/**
 * Manual trigger — send cold emails to all STATUS=found leads.
 * Run after reviewing the weekly finder approval email.
 */
function sendEmailsJob() {
  try {
    runEmailSender();
  } catch (err) {
    console.error(`sendEmailsJob failed: ${err}\n${err.stack}`);
    notifyError_('Email Sender', err);
  }
}

// ── Error notification ─────────────────────────────────────────────────────────

function notifyError_(agentName, err) {
  try {
    const email = PropertiesService.getScriptProperties().getProperty('USER_EMAIL');
    if (email) {
      GmailApp.sendEmail(
        email,
        `[YIT ERROR] ${agentName} failed`,
        `Agent: ${agentName}\nError: ${err}\n\nStack:\n${err.stack || '(no stack)'}`
      );
    }
  } catch (_) { /* never let error notification crash the system */ }
}
