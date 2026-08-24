(()=>{'use strict';
const STATE_KEY='python-ai-definitive-v3';
const SYNC_KEY='python-ai-backend-sync-v1';
const nativeFetch=window.fetch.bind(window);
const safeJson=s=>{try{return JSON.parse(s)}catch{return null}};
const readState=()=>safeJson(localStorage.getItem(STATE_KEY)||'null');
const readSync=()=>safeJson(localStorage.getItem(SYNC_KEY)||'null')||{backends:{}};
const writeSync=data=>localStorage.setItem(SYNC_KEY,JSON.stringify(data));
const normalizeBase=url=>String(url||'').replace(/\/$/,'');
const apiUrl=(base,path)=>normalizeBase(base)+path;
const fingerprint=value=>{
  const text=typeof value==='string'?value:JSON.stringify(value);
  let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return (hash>>>0).toString(36);
};

function bucket(base){
  const all=readSync();
  const key=normalizeBase(base);
  all.backends[key] ||= {conversations:{},messages:{},memories:{},files:{},fingerprints:{memories:{},files:{}}};
  const data=all.backends[key];
  data.fingerprints ||= {memories:{},files:{}};
  data.fingerprints.memories ||= {};
  data.fingerprints.files ||= {};
  return {all,key,data};
}
function persist(ctx){writeSync(ctx.all)}
async function jsonFetch(url,options={}){
  const r=await nativeFetch(url,options);
  if(!r.ok)throw new Error(`Backend sync HTTP ${r.status}`);
  return r.status===204?{}:r.json();
}
async function removeRemote(base,collection,remoteId){
  return jsonFetch(apiUrl(base,`/api/${collection}/${encodeURIComponent(remoteId)}`),{method:'DELETE'});
}
async function reconcileDeleted(base,state,ctx){
  const specs=[
    ['conversations',state.conversations],
    ['memories',state.memories],
    ['files',state.files],
  ];
  let changed=false;
  for(const [collection,items] of specs){
    if(!Array.isArray(items))continue;
    const localIds=new Set(items.map(x=>x?.id).filter(Boolean));
    const mapping=ctx.data[collection]||{};
    for(const [localId,remoteId] of Object.entries(mapping)){
      if(localIds.has(localId))continue;
      try{
        await removeRemote(base,collection,remoteId);
        delete mapping[localId];
        if(ctx.data.fingerprints?.[collection])delete ctx.data.fingerprints[collection][localId];
        changed=true;
      }catch(e){
        console.warn(`[Python AI] exclusão remota pendente (${collection}):`,e.message);
      }
    }
  }
  if(Array.isArray(state.conversations)){
    const liveMessageIds=new Set();
    for(const conv of state.conversations){
      for(const message of conv?.messages||[])if(message?.id)liveMessageIds.add(message.id);
    }
    for(const localId of Object.keys(ctx.data.messages||{})){
      if(liveMessageIds.has(localId))continue;
      delete ctx.data.messages[localId];
      changed=true;
    }
  }
  if(changed)persist(ctx);
}
async function ensureConversation(base,state,ctx){
  const local=state.conversations?.find(c=>c.id===state.activeConversationId);
  if(!local)return null;
  if(ctx.data.conversations[local.id])return ctx.data.conversations[local.id];
  const remote=await jsonFetch(apiUrl(base,'/api/conversations'),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({title:(local.title||'Novo chat').slice(0,120),project_id:local.projectId||null})
  });
  ctx.data.conversations[local.id]=remote.id;persist(ctx);return remote.id;
}
async function syncMessages(base,state,ctx,remoteConversationId){
  const local=state.conversations?.find(c=>c.id===state.activeConversationId);
  if(!local||!remoteConversationId)return;
  for(const message of local.messages||[]){
    if(!message?.id||ctx.data.messages[message.id]||message.streaming||!message.content?.trim())continue;
    if(!['user','assistant'].includes(message.role))continue;
    const remote=await jsonFetch(apiUrl(base,`/api/conversations/${encodeURIComponent(remoteConversationId)}/messages`),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({role:message.role,content:message.content})
    });
    ctx.data.messages[message.id]=remote.id;persist(ctx);
  }
}
async function syncMemories(base,state,ctx){
  for(const memory of state.memories||[]){
    if(!memory?.id||!memory.title?.trim()||!memory.content?.trim())continue;
    const nextFingerprint=fingerprint([memory.title,memory.content]);
    let remoteId=ctx.data.memories[memory.id];
    const previousFingerprint=ctx.data.fingerprints.memories[memory.id];
    if(remoteId&&previousFingerprint&&previousFingerprint!==nextFingerprint){
      try{
        await removeRemote(base,'memories',remoteId);
        delete ctx.data.memories[memory.id];
        delete ctx.data.fingerprints.memories[memory.id];
        remoteId=null;
      }catch(e){console.warn('[Python AI] edição de memória pendente:',e.message);continue}
    }
    if(remoteId){
      if(!previousFingerprint){ctx.data.fingerprints.memories[memory.id]=nextFingerprint;persist(ctx)}
      continue;
    }
    try{
      const remote=await jsonFetch(apiUrl(base,'/api/memories'),{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title:memory.title.slice(0,120),content:memory.content.slice(0,20000)})
      });
      ctx.data.memories[memory.id]=remote.id;
      ctx.data.fingerprints.memories[memory.id]=nextFingerprint;
      persist(ctx);
    }catch(e){console.warn('[Python AI] memória não sincronizada:',e.message)}
  }
}
async function syncProjectFiles(base,state,ctx){
  const conversation=state.conversations?.find(c=>c.id===state.activeConversationId);
  const projectId=conversation?.projectId;
  if(!projectId)return [];
  const remoteIds=[];
  for(const file of state.files||[]){
    if(file.projectId!==projectId||!file.text?.trim())continue;
    const nextFingerprint=fingerprint([file.name,file.type,file.text]);
    let remoteId=ctx.data.files[file.id];
    const previousFingerprint=ctx.data.fingerprints.files[file.id];
    if(remoteId&&previousFingerprint&&previousFingerprint!==nextFingerprint){
      try{
        await removeRemote(base,'files',remoteId);
        delete ctx.data.files[file.id];
        delete ctx.data.fingerprints.files[file.id];
        remoteId=null;
      }catch(e){console.warn('[Python AI] edição de arquivo pendente:',e.message);continue}
    }
    if(!remoteId){
      try{
        const form=new FormData();
        form.append('file',new Blob([file.text],{type:file.type||'text/plain'}),file.name||'arquivo.txt');
        const remote=await jsonFetch(apiUrl(base,'/api/files'),{method:'POST',body:form});
        remoteId=remote.id;
        ctx.data.files[file.id]=remoteId;
        ctx.data.fingerprints.files[file.id]=nextFingerprint;
        persist(ctx);
      }catch(e){console.warn('[Python AI] arquivo não sincronizado:',e.message);continue}
    }else if(!previousFingerprint){
      ctx.data.fingerprints.files[file.id]=nextFingerprint;persist(ctx);
    }
    remoteIds.push(remoteId);
    if(remoteIds.length>=20)break;
  }
  return remoteIds;
}
async function enrichChatRequest(url,options){
  const state=readState();
  if(!state)return options;
  const body=safeJson(options?.body||'');
  if(!body||!Array.isArray(body.messages))return options;
  const parsed=new URL(url,location.href);
  const base=parsed.origin+parsed.pathname.replace(/\/api\/chat\/stream$/,'');
  const ctx=bucket(base);
  try{
    await reconcileDeleted(base,state,ctx);
    const conversationId=await ensureConversation(base,state,ctx);
    await syncMessages(base,state,ctx,conversationId);
    await syncMemories(base,state,ctx);
    const fileIds=await syncProjectFiles(base,state,ctx);
    const enriched={...body,conversation_id:conversationId||null,file_ids:fileIds,use_memory:true};
    return {...options,body:JSON.stringify(enriched)};
  }catch(e){
    console.warn('[Python AI] sincronização de contexto indisponível; usando requisição original:',e.message);
    return options;
  }
}
async function observeStream(response){
  try{
    const clone=response.clone();
    const text=await clone.text();
    for(const block of text.split('\n\n')){
      const line=block.split('\n').find(x=>x.startsWith('data:'));
      if(!line)continue;
      const data=safeJson(line.slice(5).trim());
      if(data?.context)window.PythonAIBackendSync.lastContext=data.context;
      if(data?.provider)window.PythonAIBackendSync.lastProvider=data.provider;
    }
    window.dispatchEvent(new CustomEvent('python-ai-backend-context',{detail:{context:window.PythonAIBackendSync.lastContext||null,provider:window.PythonAIBackendSync.lastProvider||null}}));
  }catch{}
}
window.PythonAIBackendSync={version:'1.2.0',lastContext:null,lastProvider:null,clear(){localStorage.removeItem(SYNC_KEY)}};
window.fetch=async function(input,options={}){
  const url=typeof input==='string'?input:input?.url||'';
  let next=options;
  if(/\/api\/chat\/stream(?:\?|$)/.test(url)&&String(options.method||'GET').toUpperCase()==='POST')next=await enrichChatRequest(url,options);
  const response=await nativeFetch(input,next);
  if(/\/api\/chat\/stream(?:\?|$)/.test(url)&&response.ok)observeStream(response);
  return response;
};
})();
