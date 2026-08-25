from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    env: str = os.getenv("NEXUS_ENV", "development")
    data_dir: Path = Path(os.getenv("NEXUS_DATA_DIR", "./data"))
    default_mode: str = os.getenv("NEXUS_DEFAULT_MODE", "balanced")
    openai_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_base: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    openai_chat_model: str = os.getenv("OPENAI_CHAT_MODEL", "gpt-5.6-terra")
    openai_reasoning_model: str = os.getenv("OPENAI_REASONING_MODEL", "gpt-5.6-sol")
    openai_fast_model: str = os.getenv("OPENAI_FAST_MODEL", "gpt-5.6-luna")
    openai_image_model: str = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1")
    anthropic_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
    gemini_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
    grok_key: str = os.getenv("GROK_API_KEY", "")
    grok_model: str = os.getenv("GROK_MODEL", "grok-4")
    perplexity_key: str = os.getenv("PERPLEXITY_API_KEY", "")
    perplexity_model: str = os.getenv("PERPLEXITY_MODEL", "sonar-pro")

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        (self.data_dir / "artifacts").mkdir(exist_ok=True)
        (self.data_dir / "uploads").mkdir(exist_ok=True)


settings = Settings()
settings.ensure_dirs()
