import ast
import datetime as dt
import json
import operator
import os
import re
import sqlite3
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field

from context_builder import build_context_messages
from model_router import configured_targets, discover_models, public_routes, stream_with_fallback

DATA = Path(os.getenv('PYTHON_AI_DATA', './data')).resolve()
FILES = DATA / 'files'
DB = DATA / 'python_ai.db'
DATA.mkdir(parents=True, exist_ok=True)
FILES.mkdir(parents=True, exist_ok=True)

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
  created_at text not null,
  updated_at text
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
    memory_columns = {row['name'] for row in c.execute('pragma table_info(memories)').fetchall()}
    if 'updated_at' not in memory_columns:
        c.execute('alter table memories add column updated_at text')
    c.execute('update memories set updated_at=created_at where updated_at is null')
    c.commit()

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


app = FastAPI(title='Python AI API', version='3.3.0')
app.add_middleware(CORSMiddleware, allow_origins=CORS, allow_credentials=False, allow_methods=['*'], allow_headers=['*'])


class ChatRequest(BaseModel):
    messages: list[dict]
    model: str | None = Field(default=None, max_length=200)
    temperature: float = Field(default=.7, ge=0, le=2)
    conversation_id: str | None = Field(default=None, max_length=100)
    file_ids: list[str] = Field(default_factory=list, max_length=20)
    use_memory: bool = True


class MemoryRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    content: str = Field(min_length=1, max_length=20_000)


class ConversationRequest(BaseModel):
    title: str = Field(default='Novo chat', min_length=1, max_length=120)
    project_id: str | None = Field(default=None, max_length=120)


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    project_id: str | None = Field(default=None, max_length=120)


class MessageRequest(BaseModel):
    role: str = Field(pattern='^(user|assistant|system|tool)$')
    content: str = Field(min_length=1, max_length=200_000)


def load_chat_context(req: ChatRequest) -> tuple[list[dict], dict]:
    memories: list[dict] = []
    history: list[dict] = []
    selected_files: list[dict] = []

    with connect() as c:
        if req.use_memory:
            memories = [dict(r) for r in c.execute('select * from memories order by updated_at desc, created_at desc').fetchall()]

        if req.conversation_id:
            if not c.execute('select 1 from conversations where id=?', (req.conversation_id,)).fetchone():
                raise HTTPException(404, 'Conversa não encontrada')
            history = [dict(r) for r in c.execute(
                'select role,content,created_at from messages where conversation_id=? order by created_at',
                (req.conversation_id,),
            ).fetchall()]

        if req.file_ids:
            placeholders = ','.join('?' for _ in req.file_ids)
            selected_files = [dict(r) for r in c.execute(
                f'select id,name,text_content,created_at from files where id in ({placeholders})',
                tuple(req.file_ids),
            ).fetchall()]
            found = {row['id'] for row in selected_files}
            missing = [fid for fid in req.file_ids if fid not in found]
            if missing:
                raise HTTPException(404, 'Um ou mais arquivos selecionados não foram encontrados')

    return build_context_messages(req.messages, memories, selected_files, history)


async def stream_model(messages: list[dict], req: ChatRequest):
    async for provider, piece in stream_with_fallback(
        messages,
        temperature=req.temperature,
        model_override=req.model,
    ):
        yield provider, piece


@app.get('/api/health')
def health():
    routes = public_routes()
    return {
        'ok': True,
        'version': '3.3.0',
        'routes': routes,
        'primary_provider': routes[0]['name'] if routes else None,
        'primary_model': routes[0]['model'] if routes else None,
    }


@app.get('/api/models')
async def models():
    routes = configured_targets()
    if not routes:
        raise HTTPException(503, 'Nenhum provedor de IA configurado')

    result = []
    any_available = False
    for target in routes:
        public = target.public_dict()
        try:
            discovered = await discover_models(target)
            public['models'] = discovered
            public['available'] = True
            any_available = True
        except Exception as exc:
            public['models'] = []
            public['available'] = False
            public['error_type'] = type(exc).__name__
        result.append(public)

    return {'routes': result, 'any_available': any_available}


@app.post('/api/chat/stream')
async def chat(req: ChatRequest):
    prepared_messages, context_meta = load_chat_context(req)

    async def event_stream():
        active_provider = None
        try:
            yield 'data: ' + json.dumps({'context': context_meta}, ensure_ascii=False) + '\n\n'
            async for provider, piece in stream_model(prepared_messages, req):
                if provider != active_provider:
                    active_provider = provider
                    yield 'data: ' + json.dumps({'provider': provider}, ensure_ascii=False) + '\n\n'
                yield 'data: ' + json.dumps({'delta': piece}, ensure_ascii=False) + '\n\n'
            yield 'data: {"done":true}\n\n'
        except Exception as exc:
            yield 'data: ' + json.dumps({
                'error': 'Falha ao gerar resposta',
                'error_type': type(exc).__name__,
                'provider': active_provider,
            }, ensure_ascii=False) + '\n\n'
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


@app.patch('/api/conversations/{cid}')
def update_conversation(cid: str, body: ConversationUpdate):
    stamp = now()
    with connect() as c:
        row = c.execute('select created_at from conversations where id=?', (cid,)).fetchone()
        if not row:
            raise HTTPException(404, 'Conversa não encontrada')
        c.execute('update conversations set title=?, project_id=?, updated_at=? where id=?', (body.title, body.project_id, stamp, cid))
        c.commit()
    return {'id': cid, 'title': body.title, 'project_id': body.project_id, 'created_at': row['created_at'], 'updated_at': stamp}


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
            rows = c.execute('select * from memories where title like ? or content like ? order by updated_at desc, created_at desc', (pattern, pattern)).fetchall()
        else:
            rows = c.execute('select * from memories order by updated_at desc, created_at desc').fetchall()
        return [dict(r) for r in rows]


@app.post('/api/memories')
def create_memory(body: MemoryRequest):
    mid = str(uuid.uuid4())
    stamp = now()
    with connect() as c:
        c.execute('insert into memories(id,title,content,created_at,updated_at) values(?,?,?,?,?)', (mid, body.title, body.content, stamp, stamp))
        c.commit()
    return {'id': mid, 'title': body.title, 'content': body.content, 'created_at': stamp, 'updated_at': stamp}


@app.patch('/api/memories/{mid}')
def update_memory(mid: str, body: MemoryRequest):
    stamp = now()
    with connect() as c:
        row = c.execute('select created_at from memories where id=?', (mid,)).fetchone()
        if not row:
            raise HTTPException(404, 'Memória não encontrada')
        c.execute('update memories set title=?, content=?, updated_at=? where id=?', (body.title, body.content, stamp, mid))
        c.commit()
    return {'id': mid, 'title': body.title, 'content': body.content, 'created_at': row['created_at'], 'updated_at': stamp}


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
