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

// ── Draft creation (in-thread reply) ─────────────────────────────────────────

/**
 * Create a Gmail draft as a reply within an existing thread.
 * Uses the Gmail REST API via UrlFetchApp (GmailApp does not support draft creation).
 *
 * @param {string} threadId    The Gmail thread ID
 * @param {string} toEmail     Recipient email (the sponsor)
 * @param {string} subject     Subject of the original email (Re: is prepended if needed)
 * @param {string} body        Plain-text body of the draft
 * @param {string} htmlBody    Optional HTML body
 */
function gmailCreateReplyDraft(threadId, toEmail, subject, body, htmlBody) {
  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  let mimeMessage;
  if (htmlBody) {
    // Multipart MIME for HTML + plain text fallback
    const boundary = 'boundary_yit_' + Utilities.getUuid();
    mimeMessage = [
      `To: ${toEmail}`,
      `Subject: ${replySubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlBody,
      ``,
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    mimeMessage = [
      `To: ${toEmail}`,
      `Subject: ${replySubject}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
    ].join('\r\n');
  }

  const base64 = Utilities.base64EncodeWebSafe(mimeMessage);
  const token  = ScriptApp.getOAuthToken();

  const response = UrlFetchApp.fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ message: { threadId, raw: base64 } }),
      muteHttpExceptions: true,
    }
  );

  const data = JSON.parse(response.getContentText());
  if (!data.id) {
    throw new Error(`Failed to create draft: ${response.getContentText()}`);
  }

  console.log(`Draft created in thread ${threadId}, draft ID: ${data.id}`);
  return data.id;
}
