import ast,operator,json,os,re,sqlite3,uuid,datetime
from pathlib import Path
import httpx
from fastapi import FastAPI,UploadFile,File,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
DATA=Path(os.getenv('PYTHON_AI_DATA','./data'));DATA.mkdir(parents=True,exist_ok=True);FILES=DATA/'files';FILES.mkdir(exist_ok=True);DB=DATA/'python_ai.db'
PROVIDER=os.getenv('PYTHON_AI_PROVIDER','ollama');MODEL=os.getenv('PYTHON_AI_MODEL','llama3.2:3b');OLLAMA=os.getenv('PYTHON_AI_OLLAMA_URL','http://localhost:11434');OPENAI=os.getenv('PYTHON_AI_OPENAI_BASE','');KEY=os.getenv('PYTHON_AI_OPENAI_KEY','');CORS=os.getenv('PYTHON_AI_CORS_ORIGINS','https://mt2468.github.io,http://localhost:5173').split(',')
def db():c=sqlite3.connect(DB);c.row_factory=sqlite3.Row;return c
with db() as c:c.executescript('create table if not exists memories(id text primary key,title text,content text,created_at text);create table if not exists files(id text primary key,name text,path text,size integer,created_at text);')
OPS={ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv,ast.Mod:operator.mod,ast.Pow:operator.pow,ast.USub:operator.neg,ast.UAdd:operator.pos}
def ev(n):
    if isinstance(n,ast.Expression):return ev(n.body)
    if isinstance(n,ast.Constant) and isinstance(n.value,(int,float)):return n.value
    if isinstance(n,ast.BinOp) and type(n.op) in OPS:return OPS[type(n.op)](ev(n.left),ev(n.right))
    if isinstance(n,ast.UnaryOp) and type(n.op) in OPS:return OPS[type(n.op)](ev(n.operand))
    raise ValueError('Expressão não permitida')
def calc(s):return ev(ast.parse(s.replace('^','**'),mode='eval'))
app=FastAPI(title='Python AI API',version='2.0');app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in CORS],allow_methods=['*'],allow_headers=['*'])
class Chat(BaseModel):messages:list[dict];model:str|None=None;temperature:float=.7
class Memory(BaseModel):title:str;content:str
async def model_stream(req):
    if PROVIDER.lower()=='openai':
        base=OPENAI.rstrip('/');base=base if base.endswith('/v1') else base+'/v1';headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+KEY} if KEY else {})};payload={'model':req.model or MODEL,'messages':req.messages,'temperature':req.temperature,'stream':True}
        async with httpx.AsyncClient(timeout=180) as client:
            async with client.stream('POST',base+'/chat/completions',headers=headers,json=payload) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if line.startswith('data:') and (raw:=line[5:].strip()) not in ('','[DONE]'):
                        d=json.loads(raw);x=d.get('choices',[{}])[0].get('delta',{}).get('content','')
                        if x:yield x
    else:
        payload={'model':req.model or MODEL,'messages':req.messages,'stream':True,'options':{'temperature':req.temperature}}
        async with httpx.AsyncClient(timeout=180) as client:
            async with client.stream('POST',OLLAMA.rstrip('/')+'/api/chat',json=payload) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if line:
                        d=json.loads(line);x=d.get('message',{}).get('content','')
                        if x:yield x
@app.get('/api/health')
def health():return {'ok':True,'provider':PROVIDER,'model':MODEL}
@app.post('/api/chat/stream')
async def chat(req:Chat):
    async def gen():
        try:
            async for x in model_stream(req):yield 'data: '+json.dumps({'delta':x},ensure_ascii=False)+'\n\n'
            yield 'data: {"done":true}\n\n'
        except Exception as e:yield 'data: '+json.dumps({'error':str(e)},ensure_ascii=False)+'\n\n'
    return StreamingResponse(gen(),media_type='text/event-stream')
@app.get('/api/memories')
def memories():
    with db() as c:return [dict(x) for x in c.execute('select * from memories order by created_at desc')]
@app.post('/api/memories')
def memory(m:Memory):
    i=str(uuid.uuid4());now=datetime.datetime.now().isoformat()
    with db() as c:c.execute('insert into memories values(?,?,?,?)',(i,m.title,m.content,now));c.commit()
    return {'id':i}
@app.delete('/api/memories/{mid}')
def del_memory(mid:str):
    with db() as c:c.execute('delete from memories where id=?',(mid,));c.commit()
    return {'ok':True}
@app.post('/api/tools/calculator')
def calculator(body:dict):
    try:return {'result':calc(str(body.get('expression','')))}
    except Exception as e:raise HTTPException(400,str(e))
@app.get('/api/tools/time')
def clock():return {'result':datetime.datetime.now().astimezone().isoformat()}
@app.post('/api/files')
async def upload(file:UploadFile=File(...)):
    raw=await file.read()
    if len(raw)>10_000_000:raise HTTPException(413,'Limite de 10 MB')
    i=str(uuid.uuid4());safe=re.sub(r'[^A-Za-z0-9._-]','_',file.filename or 'arquivo');p=FILES/f'{i}_{safe}';p.write_bytes(raw);now=datetime.datetime.now().isoformat()
    with db() as c:c.execute('insert into files values(?,?,?,?,?)',(i,file.filename,str(p),len(raw),now));c.commit()
    return {'id':i,'name':file.filename,'size':len(raw)}
