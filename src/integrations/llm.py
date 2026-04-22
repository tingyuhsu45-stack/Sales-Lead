"""
Unified LLM Client
==================
Wraps OpenAI (GPT), Anthropic (Claude), and Google (Gemini) behind one interface.

Configuration (in .env):
  LLM_PROVIDER = openai      # or: anthropic | google
  LLM_API_KEY  = sk-...      # key for whichever provider you chose
  LLM_MODEL    = gpt-4o      # model name for that provider

Provider → default model:
  openai    → gpt-4o
  anthropic → claude-sonnet-4-6
  google    → gemini-1.5-pro

Only the package for your chosen provider needs to be installed:
  openai:    pip install openai
  anthropic: pip install anthropic
  google:    pip install google-generativeai
"""
import logging

from src import config

logger = logging.getLogger(__name__)

# Sensible default models per provider
_DEFAULT_MODELS = {
    "openai": "gpt-4o",
    "anthropic": "claude-sonnet-4-6",
    "google": "gemini-1.5-pro",
}


class LLMClient:
    """Single chat-completion interface across all supported LLM providers."""

    def __init__(self) -> None:
        self._provider = config.LLM_PROVIDER.lower()
        self._api_key = config.LLM_API_KEY
        self._model = config.LLM_MODEL or _DEFAULT_MODELS.get(self._provider, "")

        if self._provider not in _DEFAULT_MODELS:
            raise ValueError(
                f"Unknown LLM provider: {self._provider!r}. "
                f"Supported: {', '.join(_DEFAULT_MODELS)}"
            )

        logger.info(f"LLMClient: provider={self._provider}, model={self._model}")

    def complete(self, system: str, user: str) -> str:
        """
        Send a system prompt + user message, return the response text.

        Args:
            system: Instructions / persona for the model (system prompt).
            user:   The actual message / task.

        Returns:
            The model's reply as a plain string.
        """
        if self._provider == "openai":
            return self._complete_openai(system, user)
        elif self._provider == "anthropic":
            return self._complete_anthropic(system, user)
        elif self._provider == "google":
            return self._complete_google(system, user)

    # ── Provider implementations ──────────────────────────────────────────────

    def _complete_openai(self, system: str, user: str) -> str:
        try:
            import openai
        except ImportError:
            raise ImportError(
                "OpenAI package not installed. Run: pip install openai"
            )
        client = openai.OpenAI(api_key=self._api_key)
        resp = client.chat.completions.create(
            model=self._model,
            max_tokens=1024,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return resp.choices[0].message.content

    def _complete_anthropic(self, system: str, user: str) -> str:
        try:
            import anthropic
        except ImportError:
            raise ImportError(
                "Anthropic package not installed. Run: pip install anthropic"
            )
        client = anthropic.Anthropic(api_key=self._api_key)
        resp = client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return resp.content[0].text

    def _complete_google(self, system: str, user: str) -> str:
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError(
                "Google Generative AI package not installed. "
                "Run: pip install google-generativeai"
            )
        genai.configure(api_key=self._api_key)
        model = genai.GenerativeModel(
            model_name=self._model,
            system_instruction=system,
        )
        resp = model.generate_content(user)
        return resp.text
