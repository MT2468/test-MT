import ast
import datetime as dt
import json
import operator
import os
import re
import sqlite3
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field

DATA = Path(os.getenv('PYTHON_AI_DATA', './data')).resolve()
FILES = DATA / 'files'
DB = DATA / 'python_ai.db'
DATA.mkdir(parents=True, exist_ok=True)
FILES.mkdir(parents=True, exist_ok=True)

PROVIDER = os.getenv('PYTHON_AI_PROVIDER', 'ollama').lower()
MODEL = os.getenv('PYTHON_AI_MODEL', 'llama3.2:3b')
OLLAMA = os.getenv('PYTHON_AI_OLLAMA_URL', 'http://localhost:11434').rstrip('/')
OPENAI = os.getenv('PYTHON_AI_OPENAI_BASE', '').rstrip('/')
OPENAI_KEY = os.getenv('PYTHON_AI_OPENAI_KEY', '')
CORS = [x.strip() for x in os.getenv('PYTHON_AI_CORS_ORIGINS', 'https://mt2468.github.io,http://localhost:8000,http://localhost:5173').split(',') if x.strip()]
MAX_UPLOAD = int(os.getenv('PYTHON_AI_MAX_UPLOAD', '10000000'))


def connect():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


SCHEMA = '''
create table if not exists conversations(
  id text primary key,
  title text not null,
  project_id text,
  created_at text not null,
  updated_at text not null
);
create table if not exists messages(
  id text primary key,
  conversation_id text not null,
  role text not null,
  content text not null,
  created_at text not null
);
create table if not exists memories(
  id text primary key,
  title text not null,
  content text not null,
  created_at text not null
);
create table if not exists files(
  id text primary key,
  name text not null,
  path text not null,
  size integer not null,
  mime text,
  text_content text,
  created_at text not null
);
'''
with connect() as c:
    c.executescript(SCHEMA)

OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def evaluate(node):
    if isinstance(node, ast.Expression):
        return evaluate(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in OPS:
        return OPS[type(node.op)](evaluate(node.left), evaluate(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in OPS:
        return OPS[type(node.op)](evaluate(node.operand))
    raise ValueError('Expressão não permitida')


def calculate(expr: str):
    return evaluate(ast.parse(expr.replace('^', '**'), mode='eval'))


def clean_name(name: str):
    return re.sub(r'[^A-Za-z0-9._-]', '_', name or 'arquivo')[:180]


def maybe_text(raw: bytes, name: str, mime: str | None):
    if len(raw) > 1_000_000:
        return None
    textual = bool(mime and (mime.startswith('text/') or mime in {'application/json', 'application/javascript'}))
    textual = textual or bool(re.search(r'\.(txt|md|json|csv|py|js|ts|html|css|xml|yaml|yml)$', name, re.I))
    if not textual:
        return None
    try:
        return raw.decode('utf-8')[:200_000]
    except UnicodeDecodeError:
        return raw.decode('utf-8', errors='replace')[:200_000]


app = FastAPI(title='Python AI API', version='3.0.0')
app.add_middleware(CORSMiddleware, allow_origins=CORS, allow_credentials=False, allow_methods=['*'], allow_headers=['*'])


class ChatRequest(BaseModel):
    messages: list[dict]
    model: str | None = None
    temperature: float = Field(default=.7, ge=0, le=2)


class MemoryRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=20_000)


class ConversationRequest(BaseModel):
    title: str = Field(default='Novo chat', min_length=1, max_length=120)
    project_id: str | None = None


class MessageRequest(BaseModel):
    role: str = Field(pattern='^(user|assistant|system|tool)$')
    content: str = Field(min_length=1, max_length=200_000)


async def stream_model(req: ChatRequest):
    if PROVIDER == 'openai':
        if not OPENAI:
            raise RuntimeError('PYTHON_AI_OPENAI_BASE não configurado')
        base = OPENAI if OPENAI.endswith('/v1') else OPENAI + '/v1'
        headers = {'Content-Type': 'application/json'}
        if OPENAI_KEY:
            headers['Authorization'] = f'Bearer {OPENAI_KEY}'
        payload = {'model': req.model or MODEL, 'messages': req.messages, 'temperature': req.temperature, 'stream': True}
        async with httpx.AsyncClient(timeout=180) as client:
            async with client.stream('POST', base + '/chat/completions', headers=headers, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith('data:'):
                        continue
                    raw = line[5:].strip()
                    if not raw or raw == '[DONE]':
                        continue
                    data = json.loads(raw)
                    delta = data.get('choices', [{}])[0].get('delta', {}).get('content', '')
                    if delta:
                        yield delta
    else:
        payload = {'model': req.model or MODEL, 'messages': req.messages, 'stream': True, 'options': {'temperature': req.temperature}}
        async with httpx.AsyncClient(timeout=180) as client:
            async with client.stream('POST', OLLAMA + '/api/chat', json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    delta = data.get('message', {}).get('content', '')
                    if delta:
                        yield delta


@app.get('/api/health')
def health():
    return {'ok': True, 'version': '3.0.0', 'provider': PROVIDER, 'model': MODEL, 'database': str(DB)}


@app.get('/api/models')
async def models():
    if PROVIDER == 'ollama':
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(OLLAMA + '/api/tags')
                r.raise_for_status()
                return {'provider': 'ollama', 'models': [m.get('name') for m in r.json().get('models', [])]}
        except Exception as exc:
            raise HTTPException(503, f'Ollama indisponível: {exc}')
    return {'provider': PROVIDER, 'models': [MODEL]}


@app.post('/api/chat/stream')
async def chat(req: ChatRequest):
    async def event_stream():
        try:
            async for piece in stream_model(req):
                yield 'data: ' + json.dumps({'delta': piece}, ensure_ascii=False) + '\n\n'
            yield 'data: {"done":true}\n\n'
        except Exception as exc:
            yield 'data: ' + json.dumps({'error': str(exc)}, ensure_ascii=False) + '\n\n'
    return StreamingResponse(event_stream(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache'})


@app.get('/api/conversations')
def list_conversations():
    with connect() as c:
        rows = c.execute('select * from conversations order by updated_at desc').fetchall()
        return [dict(r) for r in rows]


@app.post('/api/conversations')
def create_conversation(body: ConversationRequest):
    cid = str(uuid.uuid4())
    stamp = now()
    with connect() as c:
        c.execute('insert into conversations values(?,?,?,?,?)', (cid, body.title, body.project_id, stamp, stamp))
        c.commit()
    return {'id': cid, 'title': body.title, 'project_id': body.project_id, 'created_at': stamp, 'updated_at': stamp}


@app.get('/api/conversations/{cid}/messages')
def list_messages(cid: str):
    with connect() as c:
        exists = c.execute('select 1 from conversations where id=?', (cid,)).fetchone()
        if not exists:
            raise HTTPException(404, 'Conversa não encontrada')
        return [dict(r) for r in c.execute('select * from messages where conversation_id=? order by created_at', (cid,))]


@app.post('/api/conversations/{cid}/messages')
def add_message(cid: str, body: MessageRequest):
    mid = str(uuid.uuid4())
    stamp = now()
    with connect() as c:
        if not c.execute('select 1 from conversations where id=?', (cid,)).fetchone():
            raise HTTPException(404, 'Conversa não encontrada')
        c.execute('insert into messages values(?,?,?,?,?)', (mid, cid, body.role, body.content, stamp))
        c.execute('update conversations set updated_at=? where id=?', (stamp, cid))
        c.commit()
    return {'id': mid, 'conversation_id': cid, 'role': body.role, 'content': body.content, 'created_at': stamp}


@app.delete('/api/conversations/{cid}')
def delete_conversation(cid: str):
    with connect() as c:
        c.execute('delete from messages where conversation_id=?', (cid,))
        c.execute('delete from conversations where id=?', (cid,))
        c.commit()
    return {'ok': True}


@app.get('/api/memories')
def list_memories(q: str | None = None):
    with connect() as c:
        if q:
            pattern = '%' + q + '%'
            rows = c.execute('select * from memories where title like ? or content like ? order by created_at desc', (pattern, pattern)).fetchall()
        else:
            rows = c.execute('select * from memories order by created_at desc').fetchall()
        return [dict(r) for r in rows]


@app.post('/api/memories')
def create_memory(body: MemoryRequest):
    mid = str(uuid.uuid4())
    stamp = now()
    with connect() as c:
        c.execute('insert into memories values(?,?,?,?)', (mid, body.title, body.content, stamp))
        c.commit()
    return {'id': mid, 'title': body.title, 'content': body.content, 'created_at': stamp}


@app.delete('/api/memories/{mid}')
def delete_memory(mid: str):
    with connect() as c:
        c.execute('delete from memories where id=?', (mid,))
        c.commit()
    return {'ok': True}


@app.post('/api/tools/calculator')
def calculator(body: dict):
    try:
        return {'result': calculate(str(body.get('expression', '')))}
    except Exception as exc:
        raise HTTPException(400, str(exc))


@app.get('/api/tools/time')
def clock():
    return {'result': dt.datetime.now().astimezone().isoformat()}


@app.get('/api/files')
def list_files():
    with connect() as c:
        return [dict(r) for r in c.execute('select id,name,size,mime,created_at from files order by created_at desc')]


@app.post('/api/files')
async def upload(file: UploadFile = File(...)):
    raw = await file.read()
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, f'Limite de {MAX_UPLOAD} bytes')
    fid = str(uuid.uuid4())
    original = file.filename or 'arquivo'
    safe = clean_name(original)
    path = FILES / f'{fid}_{safe}'
    path.write_bytes(raw)
    text_content = maybe_text(raw, original, file.content_type)
    stamp = now()
    with connect() as c:
        c.execute('insert into files values(?,?,?,?,?,?,?)', (fid, original, str(path), len(raw), file.content_type, text_content, stamp))
        c.commit()
    return {'id': fid, 'name': original, 'size': len(raw), 'mime': file.content_type, 'text_indexed': bool(text_content)}


@app.get('/api/files/{fid}/text', response_class=PlainTextResponse)
def file_text(fid: str):
    with connect() as c:
        row = c.execute('select text_content from files where id=?', (fid,)).fetchone()
    if not row:
        raise HTTPException(404, 'Arquivo não encontrado')
    if row['text_content'] is None:
        raise HTTPException(415, 'Arquivo sem texto indexado')
    return row['text_content']


@app.delete('/api/files/{fid}')
def delete_file(fid: str):
    with connect() as c:
        row = c.execute('select path from files where id=?', (fid,)).fetchone()
        if not row:
            return {'ok': True}
        try:
            Path(row['path']).unlink(missing_ok=True)
        finally:
            c.execute('delete from files where id=?', (fid,))
            c.commit()
    return {'ok': True}
