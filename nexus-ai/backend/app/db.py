from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .config import settings

DB_PATH: Path = settings.data_dir / "nexus.db"


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    with connect() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                kind TEXT NOT NULL DEFAULT 'user',
                project TEXT NOT NULL DEFAULT 'general',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                project TEXT NOT NULL DEFAULT 'general',
                created_at TEXT NOT NULL
            );
            """
        )


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def add_message(role: str, content: str, project: str = "general") -> None:
    with connect() as con:
        con.execute(
            "INSERT INTO messages(role, content, project, created_at) VALUES (?, ?, ?, ?)",
            (role, content, project, now()),
        )


def add_memory(text: str, kind: str = "user", project: str = "general") -> int:
    with connect() as con:
        cur = con.execute(
            "INSERT INTO memories(text, kind, project, created_at) VALUES (?, ?, ?, ?)",
            (text.strip(), kind, project, now()),
        )
        return int(cur.lastrowid)


def list_memories(limit: int = 100) -> list[dict]:
    with connect() as con:
        rows = con.execute(
            "SELECT * FROM memories ORDER BY id DESC LIMIT ?", (max(1, min(limit, 500)),)
        ).fetchall()
    return [dict(r) for r in rows]


def search_memories(query: str, project: str = "general", limit: int = 8) -> list[dict]:
    words = [w.lower() for w in query.split() if len(w) > 2]
    rows = list_memories(300)
    scored: list[tuple[int, dict]] = []
    for row in rows:
        if row["project"] not in (project, "general"):
            continue
        text = row["text"].lower()
        score = sum(text.count(word) for word in words)
        if score:
            scored.append((score, row))
    scored.sort(key=lambda item: (item[0], item[1]["id"]), reverse=True)
    return [row for _, row in scored[:limit]]
