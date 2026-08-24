"""Safe multi-provider routing for Python AI.

The router intentionally falls back only before the first output token. Once a
provider has started streaming, switching providers could splice two different
answers together and corrupt tool/agent semantics.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import AsyncIterator

import httpx


@dataclass(frozen=True)
class ProviderTarget:
    name: str
    base_url: str
    model: str
    api_key: str = ""

    def public_dict(self) -> dict[str, str | bool]:
        return {
            "name": self.name,
            "base_url": self.base_url,
            "model": self.model,
            "has_api_key": bool(self.api_key),
        }


def _clean_base(value: str) -> str:
    return value.strip().rstrip("/")


def configured_targets() -> list[ProviderTarget]:
    """Build an ordered provider list from environment variables.

    Existing v3 variables remain valid. PYTHON_AI_PROVIDER_ORDER can opt into
    ordered fallback, e.g. ``ollama,openai`` or ``openai,ollama``.
    Unknown provider names are ignored rather than executed dynamically.
    """
    default_provider = os.getenv("PYTHON_AI_PROVIDER", "ollama").strip().lower()
    order_raw = os.getenv("PYTHON_AI_PROVIDER_ORDER", default_provider)
    order = [part.strip().lower() for part in order_raw.split(",") if part.strip()]
    if not order:
        order = [default_provider]

    default_model = os.getenv("PYTHON_AI_MODEL", "llama3.2:3b").strip()
    ollama_model = os.getenv("PYTHON_AI_OLLAMA_MODEL", default_model).strip()
    openai_model = os.getenv("PYTHON_AI_OPENAI_MODEL", default_model).strip()

    known = {
        "ollama": ProviderTarget(
            name="ollama",
            base_url=_clean_base(os.getenv("PYTHON_AI_OLLAMA_URL", "http://localhost:11434")),
            model=ollama_model,
        ),
        "openai": ProviderTarget(
            name="openai",
            base_url=_clean_base(os.getenv("PYTHON_AI_OPENAI_BASE", "")),
            model=openai_model,
            api_key=os.getenv("PYTHON_AI_OPENAI_KEY", ""),
        ),
    }

    result: list[ProviderTarget] = []
    seen: set[str] = set()
    for name in order:
        if name in seen or name not in known:
            continue
        target = known[name]
        if name == "openai" and not target.base_url:
            continue
        result.append(target)
        seen.add(name)
    return result


async def _stream_ollama(
    client: httpx.AsyncClient,
    target: ProviderTarget,
    messages: list[dict],
    temperature: float,
) -> AsyncIterator[str]:
    payload = {
        "model": target.model,
        "messages": messages,
        "stream": True,
        "options": {"temperature": temperature},
    }
    async with client.stream("POST", target.base_url + "/api/chat", json=payload) as response:
        response.raise_for_status()
        async for line in response.aiter_lines():
            if not line:
                continue
            data = json.loads(line)
            delta = data.get("message", {}).get("content", "")
            if delta:
                yield delta


async def _stream_openai(
    client: httpx.AsyncClient,
    target: ProviderTarget,
    messages: list[dict],
    temperature: float,
) -> AsyncIterator[str]:
    base = target.base_url if target.base_url.endswith("/v1") else target.base_url + "/v1"
    headers = {"Content-Type": "application/json"}
    if target.api_key:
        headers["Authorization"] = f"Bearer {target.api_key}"
    payload = {
        "model": target.model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    async with client.stream("POST", base + "/chat/completions", headers=headers, json=payload) as response:
        response.raise_for_status()
        async for line in response.aiter_lines():
            if not line.startswith("data:"):
                continue
            raw = line[5:].strip()
            if not raw or raw == "[DONE]":
                continue
            data = json.loads(raw)
            delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
            if delta:
                yield delta


async def stream_with_fallback(
    messages: list[dict],
    temperature: float = 0.7,
    targets: list[ProviderTarget] | None = None,
    timeout_seconds: float = 180.0,
) -> AsyncIterator[tuple[str, str]]:
    """Yield ``(provider_name, text_delta)`` with safe pre-token fallback.

    If a provider errors before yielding any content, the next configured
    provider is attempted. If it errors after output starts, the exception is
    propagated so two models are never blended into one response.
    """
    routes = list(targets if targets is not None else configured_targets())
    if not routes:
        raise RuntimeError("Nenhum provedor de IA configurado")

    failures: list[str] = []
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        for target in routes:
            emitted = False
            try:
                if target.name == "ollama":
                    source = _stream_ollama(client, target, messages, temperature)
                elif target.name == "openai":
                    source = _stream_openai(client, target, messages, temperature)
                else:
                    failures.append(f"{target.name}: provedor não suportado")
                    continue

                async for delta in source:
                    emitted = True
                    yield target.name, delta
                return
            except Exception as exc:
                if emitted:
                    raise RuntimeError(f"{target.name} falhou após iniciar o streaming: {exc}") from exc
                failures.append(f"{target.name}: {type(exc).__name__}: {exc}")

    raise RuntimeError("Todos os provedores falharam antes do primeiro token: " + " | ".join(failures))


async def discover_models(target: ProviderTarget, timeout_seconds: float = 10.0) -> list[str]:
    """List models without exposing credentials in errors or return values."""
    async with httpx.AsyncClient(timeout=timeout_seconds) as client:
        if target.name == "ollama":
            response = await client.get(target.base_url + "/api/tags")
            response.raise_for_status()
            return [m.get("name", "") for m in response.json().get("models", []) if m.get("name")]
        if target.name == "openai":
            base = target.base_url if target.base_url.endswith("/v1") else target.base_url + "/v1"
            headers = {"Authorization": f"Bearer {target.api_key}"} if target.api_key else {}
            response = await client.get(base + "/models", headers=headers)
            response.raise_for_status()
            return [m.get("id", "") for m in response.json().get("data", []) if m.get("id")]
        return []
