from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .agents import orchestrate
from .artifacts import create_artifact
from .config import settings
from .db import add_memory, add_message, init_db, list_memories, search_memories
from .files import extract_text
from .providers import ProviderError, router
from .sandbox import run_python

app = FastAPI(title="Nexus AI", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
init_db()


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=100_000)
    project: str = "general"
    mode: str = "balanced"
    model: str = "auto"


class ResearchRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=50_000)
    mode: str = "balanced"


class AgentRequest(BaseModel):
    task: str = Field(min_length=3, max_length=100_000)
    mode: str = "balanced"
    agents: list[str] | None = None


class CodeRequest(BaseModel):
    code: str = Field(max_length=40_000)
    timeout: int = 8


class MemoryRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    kind: str = "user"
    project: str = "general"


class ArtifactRequest(BaseModel):
    kind: str = "docx"
    title: str = Field(min_length=1, max_length=150)
    prompt: str = Field(min_length=1, max_length=50_000)
    mode: str = "balanced"


class ImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=20_000)
    size: str = "1024x1024"


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "providers": router.available(), "version": app.version}


@app.get("/api/models")
def models() -> dict:
    return {
        "available": router.available(),
        "choices": ["auto", "sol", "terra", "luna", "claude", "gemini", "grok", "perplexity"],
        "modes": ["economy", "balanced", "maximum"],
    }


@app.post("/api/chat")
async def chat(req: ChatRequest) -> dict:
    memories = search_memories(req.message, req.project)
    memory_context = "\n".join(f"- {m['text']}" for m in memories)
    prompt = req.message
    if memory_context:
        prompt = f"Relevant memory:\n{memory_context}\n\nUser message:\n{req.message}"
    try:
        result = await router.complete(prompt, mode=req.mode, preferred=req.model)
    except (ProviderError, httpx.HTTPError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    add_message("user", req.message, req.project)
    add_message("assistant", result["text"], req.project)
    return {**result, "memory_hits": memories}


@app.post("/api/research")
async def research(req: ResearchRequest) -> dict:
    research_task = (
        "Produce a deep research brief. Separate established facts, plausible inferences and unknowns. "
        "Identify what should be verified with live sources when no browsing tool is available. Topic: " + req.topic
    )
    return await orchestrate(research_task, req.mode, ["researcher", "planner", "reviewer"])


@app.post("/api/agents/orchestrate")
async def agents(req: AgentRequest) -> dict:
    return await orchestrate(req.task, req.mode, req.agents)


@app.post("/api/code/run")
async def code_run(req: CodeRequest) -> dict:
    return await run_python(req.code, req.timeout)


@app.get("/api/memory")
def memory_list(limit: int = 100) -> dict:
    return {"items": list_memories(limit)}


@app.post("/api/memory")
def memory_add(req: MemoryRequest) -> dict:
    return {"id": add_memory(req.text, req.kind, req.project), "ok": True}


@app.post("/api/files/upload")
async def upload(file: Annotated[UploadFile, File()]) -> dict:
    name = f"{uuid.uuid4().hex[:8]}-{Path(file.filename or 'upload').name}"
    path = settings.data_dir / "uploads" / name
    with path.open("wb") as target:
        shutil.copyfileobj(file.file, target)
    text = extract_text(path)
    return {"name": name, "text": text, "characters": len(text)}


@app.post("/api/artifacts")
async def artifacts(req: ArtifactRequest) -> dict:
    result = await router.complete(
        f"Create polished content for a {req.kind.upper()} artifact titled '{req.title}'.\n\n{req.prompt}",
        mode=req.mode,
    )
    path = create_artifact(req.kind.lower(), req.title, result["text"])
    return {
        "ok": True,
        "filename": path.name,
        "download": f"/api/artifacts/{path.name}",
        "model": result["model"],
    }


@app.get("/api/artifacts/{filename}")
def download_artifact(filename: str) -> FileResponse:
    path = settings.data_dir / "artifacts" / Path(filename).name
    if not path.exists():
        raise HTTPException(404, "Artifact not found")
    return FileResponse(path, filename=path.name)


@app.post("/api/images")
async def images(req: ImageRequest) -> dict:
    try:
        return await router.image(req.prompt, req.size)
    except (ProviderError, httpx.HTTPError) as exc:
        raise HTTPException(503, detail=str(exc)) from exc


frontend = Path(__file__).resolve().parents[2] / "frontend"
app.mount("/assets", StaticFiles(directory=frontend), name="assets")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(frontend / "index.html")
