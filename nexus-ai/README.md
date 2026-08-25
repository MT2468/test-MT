# Nexus AI

Nexus AI is a Python-first, multimodel AI workspace that combines chat, agent orchestration, research, code execution, image generation, memory and artifact creation in one interface.

## Included in v1

- FastAPI backend with a provider router for OpenAI, Anthropic, Gemini, Grok and Perplexity.
- Auto model routing with Economy, Balanced and Maximum modes.
- Parallel specialist agents and a synthesis step.
- Deep Research workflow built on the same agent engine.
- Persistent SQLite memory with semantic-style text retrieval.
- Isolated Python runner with timeout and output limits.
- Image generation through the configured OpenAI-compatible image endpoint.
- Work Mode exports: DOCX, PPTX, XLSX and PDF.
- Single-page responsive web UI with Chat, Research, Agents, Code, Images, Work, Voice and Memory.
- Docker and GitHub Actions CI.

## Run locally

```bash
cd nexus-ai
cp .env.example .env
# add at least one provider API key
python -m venv .venv
. .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -e .
uvicorn backend.app.main:app --reload --port 8000
```

Open http://localhost:8000.

## Docker

```bash
docker compose up --build
```

## Provider configuration

The application never commits API keys. Put keys in `.env`. `OPENAI_API_KEY` is enough for the default path. Other providers are optional and become available automatically when their keys exist.

## Architecture

`Router -> specialist agent(s) -> provider -> tools/memory -> synthesis -> UI`

The UI intentionally exposes the same system as different workspaces instead of pretending every task is only chat.

## Safety

The code runner does not execute arbitrary shell commands. It launches Python in isolated mode, with timeout/output limits and a temporary working directory. Production deployments should still place it inside a container or stronger sandbox.
