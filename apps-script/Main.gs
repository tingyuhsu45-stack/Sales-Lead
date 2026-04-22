/**
 * YIT PR Agent — Orchestrator
 * ============================
 * Job functions called by time-based triggers.
 * setupTriggers() creates the schedule — run it once.
 *
 * SETUP (run once in this order from the Apps Script editor):
 *   1. Run setScriptProperties()   → configures all API keys and settings
 *   2. Run setupTriggers()          → creates Monday 9AM + every-2h triggers
 *   3. Done — system runs automatically on Google's servers
 *
 * TO STOP: Run deleteTriggers() or delete triggers from
 *   Apps Script Editor → Triggers (clock icon, left sidebar)
 *
 * TO MODIFY SETTINGS: Edit Script Properties in
 *   Apps Script Editor → Project Settings → Script Properties
 */

// ── Scheduled job functions ───────────────────────────────────────────────────

/**
 * Weekly job: find companies → save to sheet → email user for approval.
 * Triggered every Monday 09:00 UK time.
 */
function weeklyFinderJob() {
  try {
    runWeeklyFinder();
  } catch (err) {
    console.error(`weeklyFinderJob failed: ${err}\n${err.stack}`);
    notifyError_('Weekly Finder', err);
  }
}

/**
 * 2-hourly job: scan Gmail → draft replies for new responses.
 * Triggered every 2 hours.
 */
function monitorJob() {
  try {
    const responses = runMonitor();
    if (responses && responses.length) {
      responses.forEach(response => {
        try {
          runReplyDrafter(response);
        } catch (err) {
          console.error(`ReplyDrafter failed for ${response.companyName}: ${err}`);
        }
      });
    }
  } catch (err) {
    console.error(`monitorJob failed: ${err}\n${err.stack}`);
    notifyError_('Response Monitor', err);
  }
}

/**
 * Manual trigger: send cold emails to all STATUS.FOUND leads.
 * Run this after you reply "確認" to the weekly finder email.
 */
function sendEmailsJob() {
  try {
    runEmailSender();
  } catch (err) {
    console.error(`sendEmailsJob failed: ${err}\n${err.stack}`);
    notifyError_('Email Sender', err);
  }
}


// ── Trigger management ────────────────────────────────────────────────────────

/**
 * Creates the two automatic triggers. Run once from the Apps Script editor.
 * Safe to re-run — deletes existing triggers first.
 */
function setupTriggers() {
  deleteTriggers(); // clear any existing first

  // Weekly finder: every Monday at 09:00 in script timezone (Europe/London)
  ScriptApp.newTrigger('weeklyFinderJob')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  // Monitor: every 2 hours
  ScriptApp.newTrigger('monitorJob')
    .timeBased()
    .everyHours(2)
    .create();

  console.log('Triggers created:');
  console.log('  - weeklyFinderJob: every Monday at 09:00 UK time');
  console.log('  - monitorJob: every 2 hours');
}

/** Deletes all project triggers. Call this to stop the system. */
function deleteTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log('All triggers deleted.');
}

/** Lists current triggers (run from editor to inspect). */
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.length) {
    console.log('No triggers configured.');
    return;
  }
  triggers.forEach(t => {
    console.log(`  ${t.getHandlerFunction()} — ${t.getTriggerSource()} / ${t.getEventType()}`);
  });
}


// ── Error notification ────────────────────────────────────────────────────────

function notifyError_(agentName, err) {
  try {
    const cfg = getConfig();
    GmailApp.sendEmail(
      cfg.USER_EMAIL,
      `[YIT ERROR] ${agentName} failed`,
      `Agent: ${agentName}\nError: ${err}\n\nStack:\n${err.stack || '(no stack)'}`
    );
  } catch (_) {
    // Don't let error notification crash the script
  }
}
