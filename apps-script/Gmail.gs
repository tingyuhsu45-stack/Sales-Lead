/**
 * YIT PR Agent v2 — Gmail Service
 * =================================
 * Send emails, search threads, and create in-thread draft replies.
 */

// ── Send ──────────────────────────────────────────────────────────────────────

/**
 * Send an email via GmailApp.
 * @param {string}   to      Recipient
 * @param {string}   subject
 * @param {string}   body    Plain-text body
 * @param {Object}   opts    { html, bcc: string[] }
 */
function gmailSend(to, subject, body, opts = {}) {
  const options = { name: 'Youth Impact Taiwan' };
  if (opts.html) options.htmlBody = opts.html;
  if (opts.bcc && opts.bcc.length) options.bcc = opts.bcc.join(',');
  GmailApp.sendEmail(to, subject, body || '(HTML email)', options);
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search Gmail and return matching thread objects.
 * @param {string} query Gmail search query
 * @param {number} max   Maximum threads to return (default 50)
 */
function gmailSearch(query, max = 50) {
  return GmailApp.search(query, 0, max);
}

/** Mark a message as read. */
function gmailMarkAsRead(message) {
  message.markRead();
}

// ── Draft creation ────────────────────────────────────────────────────────────

/**
 * Create a Gmail draft reply using the built-in GmailApp (no REST API needed).
 * The draft appears in your Drafts folder addressed to the sponsor,
 * ready to review and send.
 *
 * @param {string} threadId    Gmail thread ID (kept for API compatibility, not used)
 * @param {string} toEmail     Recipient email (the sponsor)
 * @param {string} subject     Subject of the original email (Re: is prepended if needed)
 * @param {string} body        Plain-text body of the draft
 * @param {string} htmlBody    Optional HTML body
 */
function gmailCreateReplyDraft(threadId, toEmail, subject, body, htmlBody) {
  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  const options = { name: 'Youth Impact Taiwan' };
  if (htmlBody) options.htmlBody = htmlBody;

  const draft = GmailApp.createDraft(toEmail, replySubject, body, options);

  console.log(`Draft created → To: ${toEmail}, Subject: ${replySubject}, Draft ID: ${draft.getId()}`);
  return draft.getId();
}
