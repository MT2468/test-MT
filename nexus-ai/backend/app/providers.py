from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

import httpx

from .config import settings

SYSTEM = """You are Nexus AI, a capable multimodel assistant. Be precise, useful and transparent. When a task is complex, structure the result. Never claim a tool action happened unless it actually happened."""


@dataclass
class ModelChoice:
    provider: str
    model: str
    reason: str


class ProviderError(RuntimeError):
    pass


class Router:
    def available(self) -> dict[str, bool]:
        return {
            "openai": bool(settings.openai_key),
            "anthropic": bool(settings.anthropic_key),
            "gemini": bool(settings.gemini_key),
            "grok": bool(settings.grok_key),
            "perplexity": bool(settings.perplexity_key),
        }

    def choose(self, prompt: str, mode: str = "balanced", preferred: str = "auto") -> ModelChoice:
        if preferred != "auto":
            model_map = {
                "sol": ("openai", settings.openai_reasoning_model),
                "terra": ("openai", settings.openai_chat_model),
                "luna": ("openai", settings.openai_fast_model),
                "claude": ("anthropic", settings.anthropic_model),
                "gemini": ("gemini", settings.gemini_model),
                "grok": ("grok", settings.grok_model),
                "perplexity": ("perplexity", settings.perplexity_model),
            }
            provider, model = model_map.get(preferred, model_map["terra"])
            if self.available().get(provider):
                return ModelChoice(provider, model, "explicit selection")
        hard = len(prompt) > 2500 or any(
            word in prompt.lower()
            for word in ("architecture", "debug", "prove", "research", "analyze deeply", "complex")
        )
        if settings.openai_key:
            if mode == "economy":
                return ModelChoice("openai", settings.openai_fast_model, "economy route")
            if mode == "maximum" or hard:
                return ModelChoice("openai", settings.openai_reasoning_model, "high reasoning route")
            return ModelChoice("openai", settings.openai_chat_model, "balanced route")
        for provider, model in (
            ("anthropic", settings.anthropic_model),
            ("gemini", settings.gemini_model),
            ("grok", settings.grok_model),
            ("perplexity", settings.perplexity_model),
        ):
            if self.available()[provider]:
                return ModelChoice(provider, model, "available provider fallback")
        raise ProviderError("No model provider is configured. Add an API key in .env.")

    async def complete(
        self,
        prompt: str,
        *,
        mode: str = "balanced",
        preferred: str = "auto",
        system: str = SYSTEM,
    ) -> dict[str, Any]:
        choice = self.choose(prompt, mode, preferred)
        if choice.provider == "openai":
            text = await self._openai(prompt, system, choice.model)
        elif choice.provider == "anthropic":
            text = await self._anthropic(prompt, system, choice.model)
        elif choice.provider == "gemini":
            text = await self._gemini(prompt, system, choice.model)
        elif choice.provider == "grok":
            text = await self._openai_compatible(
                "https://api.x.ai/v1", settings.grok_key, choice.model, prompt, system
            )
        else:
            text = await self._openai_compatible(
                "https://api.perplexity.ai", settings.perplexity_key, choice.model, prompt, system
            )
        return {"text": text, "provider": choice.provider, "model": choice.model, "reason": choice.reason}

    async def _openai(self, prompt: str, system: str, model: str) -> str:
        headers = {"Authorization": f"Bearer {settings.openai_key}"}
        payload = {
            "model": model,
            "input": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        }
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post(f"{settings.openai_base}/responses", headers=headers, json=payload)
            res.raise_for_status()
            data = res.json()
        if data.get("output_text"):
            return data["output_text"]
        chunks: list[str] = []
        for item in data.get("output", []):
            for content in item.get("content", []):
                if content.get("text"):
                    chunks.append(content["text"])
        return "\n".join(chunks).strip()

    async def _anthropic(self, prompt: str, system: str, model: str) -> str:
        headers = {
            "x-api-key": settings.anthropic_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": model,
            "max_tokens": 4096,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
        }
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
            res.raise_for_status()
            data = res.json()
        return "\n".join(p.get("text", "") for p in data.get("content", [])).strip()

    async def _gemini(self, prompt: str, system: str, model: str) -> str:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        }
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post(url, params={"key": settings.gemini_key}, json=payload)
            res.raise_for_status()
            data = res.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return ""
        parts = candidates[0].get("content", {}).get("parts", [])
        return "\n".join(p.get("text", "") for p in parts).strip()

    async def _openai_compatible(
        self, base: str, key: str, model: str, prompt: str, system: str
    ) -> str:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        }
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json=payload,
            )
            res.raise_for_status()
            data = res.json()
        return data["choices"][0]["message"]["content"]

    async def image(self, prompt: str, size: str = "1024x1024") -> dict[str, str]:
        if not settings.openai_key:
            raise ProviderError("OPENAI_API_KEY is required for image generation in this build.")
        payload = {
            "model": settings.openai_image_model,
            "prompt": prompt,
            "size": size,
            "n": 1,
        }
        async with httpx.AsyncClient(timeout=180) as client:
            res = await client.post(
                f"{settings.openai_base}/images/generations",
                headers={"Authorization": f"Bearer {settings.openai_key}"},
                json=payload,
            )
            res.raise_for_status()
            data = res.json()["data"][0]
        if data.get("b64_json"):
            return {"data_url": "data:image/png;base64," + data["b64_json"]}
        if data.get("url"):
            return {"url": data["url"]}
        raise ProviderError("Image provider returned no image payload.")


router = Router()
