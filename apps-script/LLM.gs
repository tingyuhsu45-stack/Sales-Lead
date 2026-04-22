/**
 * YIT PR Agent v2 — LLM Service
 * ================================
 * Thin wrapper for OpenAI / Anthropic / Google Gemini via UrlFetchApp.
 * Provider is set by LLM_PROVIDER in Script Properties.
 */

/**
 * Call the configured LLM with a system prompt + user message.
 * @param {string} system  System prompt
 * @param {string} user    User message
 * @returns {string} The model's reply text
 */
function llmComplete(system, user) {
  const cfg = getConfig();
  switch ((cfg.LLM_PROVIDER || 'openai').toLowerCase()) {
    case 'openai':    return llmOpenAI_(cfg, system, user);
    case 'anthropic': return llmAnthropic_(cfg, system, user);
    case 'google':    return llmGemini_(cfg, system, user);
    default:
      throw new Error(`Unknown LLM_PROVIDER "${cfg.LLM_PROVIDER}". Use: openai | anthropic | google`);
  }
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

function llmOpenAI_(cfg, system, user) {
  const resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${cfg.LLM_API_KEY}` },
    payload: JSON.stringify({
      model: cfg.LLM_MODEL || 'gpt-4o',
      max_tokens: 1500,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user   },
      ],
    }),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(resp.getContentText());
  if (!data.choices) throw new Error(`OpenAI error: ${resp.getContentText()}`);
  return data.choices[0].message.content;
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

function llmAnthropic_(cfg, system, user) {
  const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': cfg.LLM_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: cfg.LLM_MODEL || 'claude-opus-4-5',
      max_tokens: 1500,
      system: system,
      messages: [{ role: 'user', content: user }],
    }),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(resp.getContentText());
  if (!data.content) throw new Error(`Anthropic error: ${resp.getContentText()}`);
  return data.content[0].text;
}

// ── Google Gemini ─────────────────────────────────────────────────────────────

function llmGemini_(cfg, system, user) {
  const model = cfg.LLM_MODEL || 'gemini-1.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.LLM_API_KEY}`;
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
    }),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(resp.getContentText());
  if (!data.candidates) throw new Error(`Gemini error: ${resp.getContentText()}`);
  return data.candidates[0].content.parts[0].text;
}
