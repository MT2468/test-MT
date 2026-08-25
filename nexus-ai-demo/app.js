const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const KEYS = {
  chats: 'nexus_unified_chats_v2',
  memories: 'nexus_unified_memories_v2',
};

const state = {
  chats: {},
  currentChatId: null,
  attachments: [],
  models: [],
  mode: 'auto',
  busy: false,
  memories: [],
  signedIn: false,
  recorder: null,
  recordingChunks: [],
  recording: false,
  pyodide: null,
  lastModel: null,
};

const SYSTEM_BASE = `Você é Nexus AI, uma IA multimodal avançada que funciona em UM ÚNICO CHAT. Responda em português do Brasil quando o usuário usar português.

Você tem ferramentas reais. Use-as quando necessário, em vez de fingir que executou uma ação.
- Se o usuário pedir um arquivo para baixar, você DEVE chamar create_artifact e entregar o link retornado.
- Se pedir para executar/testar Python, chame run_python.
- Se pedir uma imagem, chame generate_image.
- Se pedir um vídeo, chame generate_video.
- Só chame remember_fact quando o usuário pedir explicitamente para lembrar algo. Nunca armazene senhas, tokens, segredos ou dados extremamente sensíveis.
- Quando pesquisa web estiver disponível e a pergunta depender de informação atual, use-a.
- Arquivos anexados aparecem como contexto multimodal. Leia-os de fato quando relevantes.
- Para programação, trabalhe como engenheiro sênior: entenda a tarefa, encontre riscos, proponha a arquitetura e produza código robusto. Quando puder validar algo com Python, valide.
- Para trabalho avançado, produza o conteúdo e o artefato final, não apenas instruções de como fazê-lo.
- Não afirme que criou, pesquisou, executou, salvou ou gerou algo se a ferramenta correspondente não retornou sucesso.

Quando uma ferramenta devolver uma URL, inclua essa URL de forma clara na resposta final. Links de arquivo podem expirar.`;

const MODE_PROMPTS = {
  auto: 'Escolha autonomamente a melhor combinação de raciocínio e ferramentas para concluir o pedido.',
  research: 'Priorize pesquisa atual, comparação de fontes, datas concretas, incertezas e resposta com evidências. Use web search quando disponível.',
  code: 'Priorize engenharia de software, planejamento, implementação, revisão e testes. Use run_python quando ele puder validar a solução.',
  create: 'Priorize criação de artefatos finais: imagens, vídeos, documentos, planilhas, apresentações, PDFs, HTML e outros arquivos conforme o pedido.',
  council: 'Este modo será orquestrado externamente por vários modelos. Produza uma resposta independente, rigorosa e crítica.',
};

const COMMANDS = [
  {cmd:'/research', icon:'⌕', label:'Pesquisa profunda', desc:'Ativa pesquisa web no mesmo chat', mode:'research'},
  {cmd:'/code', icon:'⌘', label:'Código', desc:'Ativa engenharia + Python', mode:'code'},
  {cmd:'/image', icon:'🖼️', label:'Gerar imagem', desc:'Ex.: /image uma cidade futurista', mode:'create'},
  {cmd:'/video', icon:'🎬', label:'Gerar vídeo', desc:'Ex.: /video um robô na chuva', mode:'create'},
  {cmd:'/file', icon:'📄', label:'Criar arquivo', desc:'Peça PDF, DOCX, XLSX, PPTX…', mode:'create'},
  {cmd:'/council', icon:'✦', label:'Model Council', desc:'Vários modelos + síntese', mode:'council'},
  {cmd:'/export', icon:'↗', label:'Exportar conversa', desc:'Cria Markdown e link direto', action:'export'},
  {cmd:'/clear', icon:'⌫', label:'Limpar conversa', desc:'Remove mensagens do chat atual', action:'clear'},
];

const TOOL_DEFS = [
  {
    type:'function',
    function:{
      name:'create_artifact',
      description:'Crie um arquivo real e receba um link direto. Use SEMPRE quando o usuário pedir arquivo/download. Suporta txt, md, html, json, csv, pdf, docx, xlsx e pptx. Para XLSX, structure_json pode ser uma matriz de linhas. Para PPTX, structure_json pode ser {"slides":[{"title":"...","bullets":["..."]}]}.',
      parameters:{
        type:'object',
        properties:{
          filename:{type:'string',description:'Nome do arquivo com ou sem extensão.'},
          format:{type:'string',enum:['txt','md','html','json','csv','pdf','docx','xlsx','pptx']},
          title:{type:'string'},
          content:{type:'string',description:'Conteúdo completo do arquivo.'},
          structure_json:{type:'string',description:'JSON opcional para estrutura de planilha ou slides.'}
        },
        required:['filename','format','content']
      }
    }
  },
  {
    type:'function',
    function:{
      name:'run_python',
      description:'Execute código Python real em um sandbox WebAssembly/Pyodide no navegador. Use para cálculos, testes, análise de dados simples ou validação de código Python.',
      parameters:{type:'object',properties:{code:{type:'string'}},required:['code']}
    }
  },
  {
    type:'function',
    function:{
      name:'generate_image',
      description:'Gere uma imagem real por IA e salve no cloud storage da conta Puter, retornando preview e link.',
      parameters:{
        type:'object',
        properties:{
          prompt:{type:'string'},
          aspect_ratio:{type:'string',enum:['1:1','16:9','9:16','4:3','3:4']},
          quality:{type:'string',enum:['low','medium','high','auto']}
        },
        required:['prompt']
      }
    }
  },
  {
    type:'function',
    function:{
      name:'generate_video',
      description:'Gere um clipe de vídeo real por IA e retorne preview e link. Use somente quando o usuário pedir vídeo.',
      parameters:{
        type:'object',
        properties:{prompt:{type:'string'},seconds:{type:'number',enum:[4,8,12]},orientation:{type:'string',enum:['landscape','portrait']}},
        required:['prompt']
      }
    }
  },
  {
    type:'function',
    function:{
      name:'remember_fact',
      description:'Guarde uma preferência ou fato durável somente quando o usuário pedir explicitamente para a Nexus lembrar. Não use para segredos ou dados sensíveis.',
      parameters:{type:'object',properties:{text:{type:'string'}},required:['text']}
    }
  }
];

function uid(){
  return (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}
function nowISO(){ return new Date().toISOString(); }
function safeFileName(name='arquivo'){
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,90) || 'arquivo';
}
function extFor(format){ return format === 'md' ? '.md' : `.${format}`; }
function ensureExt(filename, format){
  const ext = extFor(format);
  return filename.toLowerCase().endsWith(ext) ? filename : filename.replace(/\.[a-z0-9]+$/i,'') + ext;
}
function escapeHTML(s=''){
  return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function markdown(text=''){
  try { return DOMPurify.sanitize(marked.parse(String(text), {breaks:true, gfm:true})); }
  catch { return escapeHTML(text).replace(/\n/g,'<br>'); }
}
function parseResponseText(resp){
  if (typeof resp === 'string') return resp;
  const content = resp?.message?.content ?? resp?.content ?? resp?.text ?? '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(x => x?.text || x?.content || '').filter(Boolean).join('\n');
  return content ? JSON.stringify(content,null,2) : '';
}
function toast(text,type=''){
  const d=document.createElement('div'); d.className=`toast ${type}`; d.textContent=text; $('#toasts').appendChild(d);
  setTimeout(()=>d.remove(),4200);
}
function setStatus(text){ $('#statusText').textContent=text; }
function autoSizePrompt(){
  const p=$('#prompt'); p.style.height='auto'; p.style.height=`${Math.min(p.scrollHeight,180)}px`;
}

function emptyChat(){
  return {id:uid(),title:'Novo chat',createdAt:nowISO(),updatedAt:nowISO(),messages:[]};
}
function currentChat(){ return state.chats[state.currentChatId]; }
function startNewChat(){
  const chat=emptyChat(); state.chats[chat.id]=chat; state.currentChatId=chat.id; state.attachments=[]; renderAll(); persistSoon(); closeDrawer(); $('#prompt').focus();
}
function titleFrom(text){
  return String(text).replace(/^\/\w+\s*/,'').trim().replace(/\s+/g,' ').slice(0,46) || 'Novo chat';
}

function localLoad(){
  try{
    const chats=JSON.parse(localStorage.getItem(KEYS.chats)||'null');
    const memories=JSON.parse(localStorage.getItem(KEYS.memories)||'null');
    if(chats && typeof chats==='object') state.chats=chats;
    if(Array.isArray(memories)) state.memories=memories;
  }catch{}
  const ids=Object.keys(state.chats);
  if(!ids.length){ const c=emptyChat();state.chats[c.id]=c;state.currentChatId=c.id; }
  else state.currentChatId=ids.sort((a,b)=>(state.chats[b].updatedAt||'').localeCompare(state.chats[a].updatedAt||''))[0];
}
async function cloudLoad(){
  if(!state.signedIn) return;
  try{
    const [chats,memories]=await Promise.all([puter.kv.get(KEYS.chats),puter.kv.get(KEYS.memories)]);
    if(chats && typeof chats==='object' && Object.keys(chats).length) state.chats=chats;
    if(Array.isArray(memories)) state.memories=memories;
    if(!state.chats[state.currentChatId]) state.currentChatId=Object.keys(state.chats)[0] || null;
    if(!state.currentChatId) startNewChat(); else renderAll();
  }catch(e){ console.warn('cloudLoad',e); }
}
let persistTimer;
function persistSoon(){
  clearTimeout(persistTimer); persistTimer=setTimeout(persist,250);
}
async function persist(){
  localStorage.setItem(KEYS.chats,JSON.stringify(state.chats));
  localStorage.setItem(KEYS.memories,JSON.stringify(state.memories));
  if(state.signedIn){
    try{ await Promise.all([puter.kv.set(KEYS.chats,state.chats),puter.kv.set(KEYS.memories,state.memories)]); }
    catch(e){ console.warn('cloud persist',e); }
  }
}

function renderAll(){ renderChatLists(); renderMessages(); renderAttachments(); updateModeUI(); }
function renderChatLists(){
  const chats=Object.values(state.chats).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  for(const sel of ['#chatList','#mobileChatList']){
    const host=$(sel); if(!host) continue; host.innerHTML='';
    for(const chat of chats){
      const b=document.createElement('button'); b.className='chat-row'+(chat.id===state.currentChatId?' active':'');
      b.innerHTML=`<div class="chat-row-title">${escapeHTML(chat.title||'Novo chat')}</div><div class="chat-row-meta">${new Date(chat.updatedAt||chat.createdAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>`;
      b.onclick=()=>{state.currentChatId=chat.id;state.attachments=[];renderAll();closeDrawer();}; host.appendChild(b);
    }
  }
}
function renderWelcome(){
  return `<div class="welcome"><div class="welcome-mark">X</div><h1>Uma conversa. Todas as ferramentas.</h1><p>Converse normalmente. A Nexus pode pesquisar a web, ler arquivos, executar Python, criar imagens, vídeos, documentos e links sem tirar você do chat.</p><div class="starter-grid">
    <button class="starter" data-starter="Pesquise as principais novidades de IA de hoje e resuma com fontes."><strong>⌕ Pesquisa atual</strong><span>Web + síntese</span></button>
    <button class="starter" data-starter="Crie um PDF bonito com um plano de estudos de 7 dias e me dê o link para baixar."><strong>📄 Arquivo pronto</strong><span>PDF + link</span></button>
    <button class="starter" data-starter="Crie uma imagem cinematográfica de uma metrópole futurista à noite."><strong>🖼️ Imagem</strong><span>Geração inline</span></button>
    <button class="starter" data-starter="Execute em Python uma simulação de 10000 lançamentos de dois dados e analise os resultados."><strong>⌘ Python</strong><span>Execução real</span></button>
  </div></div>`;
}
function renderMessages(){
  const host=$('#messages'); const chat=currentChat(); host.innerHTML='';
  if(!chat || !chat.messages.length){ host.innerHTML=renderWelcome(); $$('.starter').forEach(b=>b.onclick=()=>{$('#prompt').value=b.dataset.starter;autoSizePrompt();$('#sendButton').click();}); return; }
  for(const msg of chat.messages) host.appendChild(messageElement(msg));
  requestAnimationFrame(()=>{host.scrollTop=host.scrollHeight;});
}
function messageElement(msg){
  if(msg.role==='tool-event'){
    const d=document.createElement('div');d.className='tool-event';d.innerHTML=`<b>${escapeHTML(msg.name||'Ferramenta')}</b> · ${escapeHTML(msg.content||'')}`;return d;
  }
  const row=document.createElement('article'); row.className=`message ${msg.role==='user'?'user':'assistant'}`;
  if(msg.role!=='user'){
    const av=document.createElement('div');av.className='message-avatar';av.textContent='X';row.appendChild(av);
  }
  const card=document.createElement('div');card.className='message-card';
  if(msg.role!=='user') card.innerHTML=`<div class="message-role">Nexus AI</div>`;
  const content=document.createElement('div');content.className='message-content';
  if(msg.role==='user') content.textContent=msg.content||''; else content.innerHTML=markdown(msg.content||'');
  card.appendChild(content);
  if(msg.media?.length){
    for(const media of msg.media){
      if(media.kind==='image'){const img=document.createElement('img');img.src=media.src||media.url;img.alt=media.alt||'Imagem gerada';content.appendChild(img);}
      if(media.kind==='video'){const v=document.createElement('video');v.src=media.src||media.url;v.controls=true;v.playsInline=true;content.appendChild(v);}
    }
  }
  if(msg.artifacts?.length) for(const a of msg.artifacts) card.appendChild(artifactElement(a));
  const meta=document.createElement('div');meta.className='message-meta';
  if(msg.attachments?.length) for(const a of msg.attachments){const p=document.createElement('span');p.className='meta-pill';p.textContent=`📎 ${a.name}`;meta.appendChild(p);}
  if(msg.model){const p=document.createElement('span');p.className='meta-pill';p.textContent=msg.model;meta.appendChild(p);}
  if(msg.mode){const p=document.createElement('span');p.className='meta-pill';p.textContent=msg.mode;meta.appendChild(p);}
  if(msg.role!=='user'){
    const copy=document.createElement('button');copy.className='msg-action';copy.textContent='Copiar';copy.onclick=()=>navigator.clipboard?.writeText(msg.content||'').then(()=>toast('Resposta copiada','success'));meta.appendChild(copy);
    const speak=document.createElement('button');speak.className='msg-action';speak.textContent='Ouvir';speak.onclick=()=>speakText(msg.content||'');meta.appendChild(speak);
  }
  if(meta.childNodes.length) card.appendChild(meta);
  row.appendChild(card);return row;
}
function artifactElement(a){
  const box=document.createElement('div');box.className='artifact-card';
  box.innerHTML=`<div class="artifact-icon">${escapeHTML((a.format||'FILE').slice(0,4).toUpperCase())}</div><div class="artifact-info"><b>${escapeHTML(a.name||'arquivo')}</b><span>${escapeHTML(a.note||'Link válido por até 30 dias')}</span></div><div class="artifact-actions"></div>`;
  const actions=box.querySelector('.artifact-actions');
  const open=document.createElement('a');open.href=a.url;open.target='_blank';open.rel='noopener';open.textContent='Abrir';actions.appendChild(open);
  const copy=document.createElement('button');copy.textContent='Copiar link';copy.onclick=()=>navigator.clipboard?.writeText(a.url).then(()=>toast('Link copiado','success'));actions.appendChild(copy);
  return box;
}
function renderAttachments(){
  const host=$('#attachmentTray');host.innerHTML='';
  state.attachments.forEach((a,i)=>{const d=document.createElement('div');d.className='attachment-chip';d.innerHTML=`📎 <span>${escapeHTML(a.name)}</span>`;const x=document.createElement('button');x.textContent='×';x.onclick=()=>{state.attachments.splice(i,1);renderAttachments();};d.appendChild(x);host.appendChild(d);});
}
function showTyping(){
  const host=$('#messages');const row=document.createElement('article');row.id='typingRow';row.className='message assistant';row.innerHTML='<div class="message-avatar">X</div><div class="message-card"><div class="message-role">Nexus AI</div><div class="typing"><i></i><i></i><i></i></div></div>';host.appendChild(row);host.scrollTop=host.scrollHeight;
}
function hideTyping(){ $('#typingRow')?.remove(); }
function addToolEvent(name,content){
  const msg={role:'tool-event',name,content}; const el=messageElement(msg); $('#messages').appendChild(el); $('#messages').scrollTop=$('#messages').scrollHeight;
}

function setMode(mode){
  state.mode=mode; $$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('#toolSheet').classList.add('hidden');
}
function updateModeUI(){ $$('.mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode)); }

async function uploadFiles(files){
  if(!files?.length) return;
  setStatus('Enviando arquivos…');
  for(const file of files){
    try{
      const safe=safeFileName(file.name); const path=`upload-${state.currentChatId.slice(0,8)}-${Date.now()}-${safe}`;
      const item=await puter.fs.write(path,file,{overwrite:false,dedupeName:true});
      state.attachments.push({name:file.name,path:item?.path||item?.name||path,type:file.type||'',size:file.size});
    }catch(e){ toast(`Falha ao enviar ${file.name}: ${e.message||e}`,'error'); }
  }
  renderAttachments();setStatus('Online');
}

function modelInfo(id){ return state.models.find(m=>m.id===id || `${m.provider}/${m.id}`===id) || null; }
function findModel(candidates,providers=[]){
  for(const needle of candidates){
    const exact=state.models.find(m=>m.id===needle || `${m.provider}/${m.id}`===needle); if(exact)return exact;
    const fuzzy=state.models.find(m=>(m.id||'').toLowerCase().includes(needle.toLowerCase())); if(fuzzy)return fuzzy;
  }
  if(providers.length){const p=state.models.find(m=>providers.includes((m.provider||'').toLowerCase()));if(p)return p;}
  return state.models[0]||null;
}
function chooseAutoModel(text,mode){
  const reasoning=$('#reasoningSelect').value;
  if(mode==='research') return findModel(['gpt-5.6-sol','gpt-5.6-luna','gpt-5.4','gpt-5'],['openai']);
  if(mode==='code') return findModel(['claude-opus-4-8','claude-sonnet-4-6','gpt-5.6-sol','gpt-5.6-luna'],['claude','anthropic','openai']);
  if(reasoning==='maximum') return findModel(['gpt-5.6-sol','claude-opus-4-8','gpt-5.6-luna','claude-sonnet-4-6']);
  if(reasoning==='fast') return findModel(['gpt-5.6-luna','grok-4.1-fast','gemini-3.1-flash-lite','gemini-3.1-flash']);
  const hard=text.length>2500 || /arquitet|debug|analise profundamente|prova|complex|planeje|implemente/i.test(text);
  if(hard) return findModel(['gpt-5.6-sol','claude-opus-4-8','claude-sonnet-4-6','gpt-5.6-luna']);
  return findModel(['gpt-5.6-luna','gpt-5.6-terra','claude-sonnet-4-6','gemini-3.1-pro']);
}
function selectedModel(text,mode=state.mode){
  const value=$('#modelSelect').value;
  const m=value==='auto'?chooseAutoModel(text,mode):modelInfo(value);
  return m || {id:value==='auto'?'gpt-5.6-luna':value,provider:value.startsWith('claude')?'claude':'openai',name:value};
}
function webNeeded(text,mode){
  return mode==='research' || /\b(hoje|agora|atual|recent|últim|ultima|notícia|preço|cotação|pesquise|procure na web|internet)\b/i.test(text);
}
function memoryContext(){
  return state.memories.slice(0,12).map(m=>`- ${m.text}`).join('\n');
}
function buildSystem(mode){
  const reasoning=$('#reasoningSelect').value;
  const r=reasoning==='maximum'?'Revise criticamente antes de concluir e seja minuciosa.':reasoning==='fast'?'Priorize velocidade e concisão sem sacrificar correção.':'Equilibre profundidade, velocidade e custo.';
  const mem=memoryContext();
  return `${SYSTEM_BASE}\n\nModo atual: ${mode}. ${MODE_PROMPTS[mode]||MODE_PROMPTS.auto}\n${r}${mem?`\n\nMemórias explícitas do usuário:\n${mem}`:''}`;
}
function historyForAPI(mode=state.mode){
  const chat=currentChat(); const msgs=[{role:'system',content:buildSystem(mode)}];
  for(const m of (chat?.messages||[]).filter(x=>x.role==='user'||x.role==='assistant').slice(-24)){
    if(m.role==='user' && m.attachments?.length){
      msgs.push({role:'user',content:[...m.attachments.map(a=>({type:'file',puter_path:a.path})),{type:'text',text:m.content||''}]});
    }else msgs.push({role:m.role,content:m.content||''});
  }
  return msgs;
}

function apiModelId(model,useWeb){
  if(useWeb && (model.provider||'').toLowerCase()==='openai' && !model.id.includes('/')) return `openai/${model.id}`;
  return model.id;
}
async function rawChat(messages,model,{useWeb=false,allowTools=true}={}){
  const tools=[];
  if(useWeb && (model.provider||'').toLowerCase()==='openai') tools.push({type:'web_search'});
  if(allowTools) tools.push(...TOOL_DEFS);
  const opts={model:apiModelId(model,useWeb)}; if(tools.length)opts.tools=tools;
  try{return await puter.ai.chat(messages,false,opts);}
  catch(first){
    if(tools.length){
      console.warn('Retrying without tools',first);
      return await puter.ai.chat(messages,false,{model:model.id});
    }
    throw first;
  }
}
async function runToolLoop(messages,model,useWeb){
  let response=await rawChat(messages,model,{useWeb,allowTools:true});
  for(let round=0;round<5;round++){
    const calls=response?.message?.tool_calls||[]; if(!calls.length)return response;
    messages.push(response.message);
    for(const call of calls){
      const name=call?.function?.name; let args={};
      try{args=JSON.parse(call?.function?.arguments||'{}');}catch{}
      addToolEvent(name,toolHumanLabel(name));
      let result;
      try{result=await executeTool(name,args);}catch(e){result={ok:false,error:String(e?.message||e)};toast(`Ferramenta ${name}: ${result.error}`,'error');}
      messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
    }
    response=await rawChat(messages,model,{useWeb:false,allowTools:true});
  }
  return response;
}
function toolHumanLabel(name){
  return ({create_artifact:'Criando arquivo e link…',run_python:'Executando Python…',generate_image:'Gerando imagem…',generate_video:'Gerando vídeo…',remember_fact:'Salvando memória…'})[name]||'Executando…';
}
async function executeTool(name,args){
  if(name==='create_artifact')return createArtifact(args);
  if(name==='run_python')return runPython(args.code||'');
  if(name==='generate_image')return generateImage(args);
  if(name==='generate_video')return generateVideo(args);
  if(name==='remember_fact')return rememberFact(args.text||'');
  return {ok:false,error:`Ferramenta desconhecida: ${name}`};
}

async function ensureAuthState(){
  try{
    state.signedIn=!!puter.auth.isSignedIn();
    if(state.signedIn){const u=await puter.auth.getUser();$('#accountName').textContent=u.username||u.email||'Puter';$('#accountState').textContent='Cloud sync ativo';}
    else{$('#accountName').textContent='Puter';$('#accountState').textContent='Login será solicitado ao usar IA';}
  }catch{$('#accountState').textContent='Puter disponível';}
}
async function refreshAuthAfterCall(){
  const before=state.signedIn; await ensureAuthState(); if(!before&&state.signedIn){await cloudLoad();await persist();}
}

async function sendCurrent(){
  if(state.busy)return;
  const p=$('#prompt'); let text=p.value.trim(); if(!text && !state.attachments.length)return;
  if(text.startsWith('/')){
    const handled=await handleSlash(text); if(handled){p.value='';autoSizePrompt();return;}
  }
  state.busy=true;$('#sendButton').disabled=true;$('#plusButton').disabled=true;setStatus('Pensando…');
  const attachments=state.attachments.map(a=>({...a})); state.attachments=[];renderAttachments();
  const chat=currentChat(); const userMsg={role:'user',content:text||'Analise os arquivos anexados.',attachments,ts:nowISO()};
  if(chat.messages.length===0)chat.title=titleFrom(text||attachments[0]?.name||'Novo chat');chat.messages.push(userMsg);chat.updatedAt=nowISO();renderMessages();renderChatLists();persistSoon();p.value='';autoSizePrompt();showTyping();
  try{
    let answer,modelLabel,mode=state.mode;
    if(mode==='council'){
      const council=await runCouncil(userMsg);answer=council.text;modelLabel=council.modelLabel;
    }else{
      const model=selectedModel(text,mode);state.lastModel=model;const useWeb=webNeeded(text,mode);
      if(useWeb && (model.provider||'').toLowerCase()!=='openai') addToolEvent('Pesquisa','O modelo escolhido não expõe web_search; respondendo sem busca integrada.');
      else if(useWeb)addToolEvent('Pesquisa','Consultando a web atual…');
      const msgs=historyForAPI(mode);
      const response=await runToolLoop(msgs,model,useWeb);answer=parseResponseText(response)||'Concluído.';modelLabel=model.name||model.id;
      const images=response?.message?.images||[];
      if(images.length){
        const media=images.map(x=>({kind:'image',src:x?.image_url?.url})).filter(x=>x.src);
        chat.messages.push({role:'assistant',content:answer,media,model:modelLabel,mode,ts:nowISO()});chat.updatedAt=nowISO();hideTyping();renderMessages();persistSoon();return;
      }
    }
    chat.messages.push({role:'assistant',content:answer,model:modelLabel,mode,ts:nowISO()});chat.updatedAt=nowISO();
  }catch(e){
    chat.messages.push({role:'assistant',content:`Não consegui concluir esta chamada. ${e?.message||e}`,model:'erro',mode:state.mode,ts:nowISO()});toast('A chamada falhou. Veja a mensagem no chat.','error');
  }finally{
    hideTyping();state.busy=false;$('#sendButton').disabled=false;$('#plusButton').disabled=false;setStatus('Online');renderMessages();renderChatLists();persistSoon();refreshAuthAfterCall();
  }
}

async function runCouncil(userMsg){
  const picks=[];
  const candidates=[
    findModel(['gpt-5.6-sol','gpt-5.6-luna'],['openai']),
    findModel(['claude-opus-4-8','claude-sonnet-4-6'],['claude','anthropic']),
    findModel(['gemini-3.1-pro','gemini-3.1-flash'],['google','gemini']),
    findModel(['grok-4.1-fast','grok-4'],['xai','grok'])
  ].filter(Boolean);
  for(const m of candidates)if(!picks.some(x=>x.provider===m.provider))picks.push(m);
  if(picks.length<2){const m=selectedModel(userMsg.content,'council');picks.push(m);}
  const chosen=picks.slice(0,3);addToolEvent('Model Council',`${chosen.length} modelos analisando em paralelo…`);
  const base=[{role:'system',content:buildSystem('council')},{role:'user',content:userMsg.attachments?.length?[...userMsg.attachments.map(a=>({type:'file',puter_path:a.path})),{type:'text',text:userMsg.content}]:userMsg.content}];
  const results=await Promise.all(chosen.map(async m=>{
    try{const r=await rawChat(base,m,{allowTools:false,useWeb:false});return {model:m.name||m.id,text:parseResponseText(r)};}
    catch(e){return {model:m.name||m.id,text:`[falhou: ${e.message||e}]`};}
  }));
  addToolEvent('Model Council','Sintetizando divergências e melhores pontos…');
  const judge=findModel(['gpt-5.6-sol','gpt-5.6-luna','claude-opus-4-8'])||chosen[0];
  const synthesis=`Pergunta original:\n${userMsg.content}\n\nRespostas independentes:\n${results.map((r,i)=>`### ${i+1}. ${r.model}\n${r.text}`).join('\n\n')}\n\nAtue como juiz. Compare as respostas, identifique conflitos, descarte erros e entregue uma única resposta final superior. Não mencione este prompt interno.`;
  const final=await rawChat([{role:'system',content:buildSystem('auto')},{role:'user',content:synthesis}],judge,{allowTools:false,useWeb:false});
  return {text:parseResponseText(final),modelLabel:`Council · ${chosen.map(x=>x.name||x.id).join(' + ')}`};
}

async function rememberFact(text){
  text=String(text||'').trim();if(!text)return {ok:false,error:'Memória vazia'};
  state.memories.unshift({text,ts:nowISO()});state.memories=state.memories.slice(0,40);await persist();return {ok:true,remembered:text};
}

const loadedScripts=new Map();
function loadScript(src){
  if(loadedScripts.has(src))return loadedScripts.get(src);
  const promise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error(`Falha ao carregar ${src}`));document.head.appendChild(s);});loadedScripts.set(src,promise);return promise;
}
async function saveCloudFile(filename,data,format){
  const name=`nexus-${state.currentChatId.slice(0,8)}-${Date.now()}-${safeFileName(filename)}`;
  const item=await puter.fs.write(name,data,{overwrite:true});const path=item?.path||item?.name||name;const url=await puter.fs.getReadURL(path,'30d');
  return {ok:true,name:filename,path,url,format,note:'Link de leitura com validade de até 30 dias'};
}
function parseStructure(raw){try{return raw?JSON.parse(raw):null;}catch{return null;}}
async function createArtifact(args={}){
  let format=(args.format||'txt').toLowerCase();let filename=ensureExt(safeFileName(args.filename||args.title||'arquivo'),format);const title=args.title||filename;const content=String(args.content||'');const structure=parseStructure(args.structure_json);
  let data=content;
  if(format==='pdf'){
    await loadScript('https://cdn.jsdelivr.net/npm/jspdf@3.0.2/dist/jspdf.umd.min.js');const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:'mm',format:'a4'});doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text(title.slice(0,90),15,20);doc.setFont('helvetica','normal');doc.setFontSize(10.5);let y=31;const lines=doc.splitTextToSize(content,180);for(const line of lines){if(y>282){doc.addPage();y=18;}doc.text(line,15,y);y+=5.2;}data=doc.output('blob');
  }else if(format==='docx'){
    await loadScript('https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.umd.cjs');const {Document,Packer,Paragraph,TextRun,HeadingLevel}=window.docx;const children=[];for(const raw of content.split('\n')){const line=raw.trimEnd();if(!line){children.push(new Paragraph(''));continue;}if(line.startsWith('### '))children.push(new Paragraph({text:line.slice(4),heading:HeadingLevel.HEADING_3}));else if(line.startsWith('## '))children.push(new Paragraph({text:line.slice(3),heading:HeadingLevel.HEADING_2}));else if(line.startsWith('# '))children.push(new Paragraph({text:line.slice(2),heading:HeadingLevel.HEADING_1}));else if(/^[-*] /.test(line))children.push(new Paragraph({text:line.slice(2),bullet:{level:0}}));else children.push(new Paragraph({children:[new TextRun(line)]}));}const doc=new Document({title,sections:[{children}]});data=await Packer.toBlob(doc);
  }else if(format==='xlsx'){
    await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');let rows;if(Array.isArray(structure))rows=structure;else if(Array.isArray(structure?.rows))rows=structure.rows;else rows=content.split('\n').filter(Boolean).map(line=>line.includes('\t')?line.split('\t'):line.split(','));const ws=XLSX.utils.aoa_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Nexus AI');const arr=XLSX.write(wb,{bookType:'xlsx',type:'array'});data=new Blob([arr],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }else if(format==='pptx'){
    await loadScript('https://cdn.jsdelivr.net/gh/gitbrent/pptxgenjs/dist/pptxgen.bundle.js');const pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author='Nexus AI';pptx.subject=title;pptx.title=title;let slides=structure?.slides;if(!Array.isArray(slides)){const chunks=content.split(/\n(?=#{1,3}\s)/).filter(Boolean);slides=chunks.slice(0,12).map((chunk,i)=>{const lines=chunk.split('\n').filter(Boolean);return {title:(lines[0]||`${title} ${i+1}`).replace(/^#+\s*/,''),bullets:lines.slice(1).map(x=>x.replace(/^[-*]\s*/,''))};});if(!slides.length)slides=[{title,bullets:content.split('\n').filter(Boolean).slice(0,7)}];}for(const [i,s] of slides.slice(0,15).entries()){const slide=pptx.addSlide();slide.background={color:'08111F'};slide.addText(s.title||`${title} ${i+1}`,{x:.65,y:.55,w:11.8,h:.7,fontFace:'Aptos Display',fontSize:26,bold:true,color:'F3F7FF',margin:0});const bullets=(s.bullets||[]).slice(0,8).map(t=>({text:String(t),options:{bullet:{indent:18},breakLine:true}}));if(bullets.length)slide.addText(bullets,{x:.8,y:1.65,w:11.1,h:5.2,fontFace:'Aptos',fontSize:17,color:'C9D7EB',breakLine:true,margin:.05,paraSpaceAfterPt:10});slide.addShape(pptx.ShapeType.line,{x:.65,y:1.36,w:2.2,h:0,line:{color:'4F7CFF',width:3}});}data=await pptx.write({outputType:'blob'});
  }else if(format==='json'){
    try{data=JSON.stringify(JSON.parse(content),null,2);}catch{data=content;}
  }else if(format==='html'){
    data=/<!doctype|<html/i.test(content)?content:`<!doctype html><meta charset="utf-8"><title>${escapeHTML(title)}</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6}</style><body>${markdown(content)}</body>`;
  }
  const artifact=await saveCloudFile(filename,data,format);const chat=currentChat();chat.messages.push({role:'assistant',content:`Criei **${filename}** e deixei o arquivo disponível no link abaixo.`,artifacts:[artifact],model:'Nexus Work',mode:'create',ts:nowISO()});chat.updatedAt=nowISO();persistSoon();return artifact;
}

async function loadPyodideRuntime(){
  if(state.pyodide)return state.pyodide;addToolEvent('Python','Carregando runtime Pyodide pela primeira vez…');await loadScript('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');state.pyodide=await window.loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'});return state.pyodide;
}
async function runPython(code){
  code=String(code||'');if(code.length>30000)return {ok:false,error:'Código excede 30 mil caracteres.'};const py=await loadPyodideRuntime();let stdout='',stderr='';py.setStdout({batched:s=>{stdout+=s+'\n';}});py.setStderr({batched:s=>{stderr+=s+'\n';}});try{const value=await py.runPythonAsync(code);return {ok:true,stdout:stdout.slice(-16000),stderr:stderr.slice(-8000),result:value==null?'':String(value).slice(0,8000)};}catch(e){return {ok:false,stdout:stdout.slice(-16000),stderr:(stderr+'\n'+(e.message||e)).slice(-12000)};}
}
function ratioObject(r){const [w,h]=String(r||'1:1').split(':').map(Number);return {w:w||1,h:h||1};}
async function generateImage(args={}){
  const path=`nexus-image-${state.currentChatId.slice(0,8)}-${Date.now()}.png`;const img=await puter.ai.txt2img(args.prompt,{model:'gpt-image-2',quality:args.quality||'auto',ratio:ratioObject(args.aspect_ratio||'1:1'),puter_output_path:path});const url=await puter.fs.getReadURL(path,'30d');const artifact={ok:true,name:path,path,url,format:'png',note:'Imagem gerada · link válido por até 30 dias'};const chat=currentChat();chat.messages.push({role:'assistant',content:'Imagem gerada:',media:[{kind:'image',src:img.src,url}],artifacts:[artifact],model:'gpt-image-2',mode:'create',ts:nowISO()});chat.updatedAt=nowISO();persistSoon();return artifact;
}
async function generateVideo(args={}){
  const path=`nexus-video-${state.currentChatId.slice(0,8)}-${Date.now()}.mp4`;const seconds=[4,8,12].includes(Number(args.seconds))?Number(args.seconds):4;const size=args.orientation==='portrait'?'720x1280':'1280x720';const video=await puter.ai.txt2vid(args.prompt,{model:'sora-2',seconds,size,puter_output_path:path});const url=await puter.fs.getReadURL(path,'30d');const artifact={ok:true,name:path,path,url,format:'mp4',note:'Vídeo gerado · link válido por até 30 dias'};const chat=currentChat();chat.messages.push({role:'assistant',content:'Vídeo gerado:',media:[{kind:'video',src:video.src||url,url}],artifacts:[artifact],model:'sora-2',mode:'create',ts:nowISO()});chat.updatedAt=nowISO();persistSoon();return artifact;
}

async function speakText(text){
  try{setStatus('Gerando voz…');const audio=await puter.ai.txt2speech(String(text).slice(0,2900),{provider:'openai'});await audio.play();audio.onended=()=>setStatus('Online');}
  catch(e){setStatus('Online');toast(`Não foi possível reproduzir voz: ${e.message||e}`,'error');}
}
async function toggleVoiceRecording(){
  if(state.recording){state.recorder?.stop();return;}
  if(!navigator.mediaDevices?.getUserMedia){startSpeechRecognition();return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});state.recordingChunks=[];state.recorder=new MediaRecorder(stream);state.recorder.ondataavailable=e=>{if(e.data.size)state.recordingChunks.push(e.data);};state.recorder.onstop=async()=>{state.recording=false;$('#plusButton').textContent='＋';stream.getTracks().forEach(t=>t.stop());const blob=new Blob(state.recordingChunks,{type:state.recordingChunks[0]?.type||'audio/webm'});setStatus('Transcrevendo voz…');try{const r=await puter.ai.speech2txt(blob);const text=typeof r==='string'?r:(r?.text||'');$('#prompt').value=($('#prompt').value+' '+text).trim();autoSizePrompt();toast('Áudio transcrito','success');}catch(e){toast(`Falha na transcrição: ${e.message||e}`,'error');}finally{setStatus('Online');}};state.recorder.start();state.recording=true;$('#plusButton').textContent='■';toast('Gravando. Toque no botão ■ para parar.');
  }catch(e){toast(`Microfone indisponível: ${e.message||e}`,'error');startSpeechRecognition();}
}
function startSpeechRecognition(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast('Reconhecimento de voz não disponível neste navegador.','error');return;}const rec=new SR();rec.lang='pt-BR';rec.onresult=e=>{$('#prompt').value=($('#prompt').value+' '+e.results[0][0].transcript).trim();autoSizePrompt();};rec.start();
}

async function exportCurrentChat(){
  const chat=currentChat();if(!chat?.messages?.length){toast('Não há mensagens para exportar.','error');return;}
  const body=chat.messages.filter(m=>m.role==='user'||m.role==='assistant').map(m=>`## ${m.role==='user'?'Você':'Nexus AI'}\n\n${m.content||''}${m.artifacts?.length?'\n\n'+m.artifacts.map(a=>`- [${a.name}](${a.url})`).join('\n'):''}`).join('\n\n---\n\n');
  const artifact=await saveCloudFile(`${safeFileName(chat.title)}.md`,`# ${chat.title}\n\n${body}`,'md');chat.messages.push({role:'assistant',content:'Conversa exportada para Markdown.',artifacts:[artifact],model:'Nexus Export',mode:'auto',ts:nowISO()});chat.updatedAt=nowISO();renderMessages();persistSoon();return artifact;
}

async function handleSlash(text){
  const [cmd,...rest]=text.split(/\s+/);const arg=rest.join(' ').trim();
  if(cmd==='/export'){await exportCurrentChat();return true;}
  if(cmd==='/clear'){clearCurrent();return true;}
  if(cmd==='/research'){setMode('research');$('#prompt').value=arg;return !arg?true:false;}
  if(cmd==='/code'){setMode('code');$('#prompt').value=arg;return !arg?true:false;}
  if(cmd==='/council'){setMode('council');$('#prompt').value=arg;return !arg?true:false;}
  if(cmd==='/image'&&arg){state.busy=true;showTyping();try{await generateImage({prompt:arg,aspect_ratio:'1:1',quality:'auto'});}catch(e){toast(e.message||e,'error');}finally{state.busy=false;hideTyping();renderMessages();}return true;}
  if(cmd==='/video'&&arg){state.busy=true;showTyping();try{await generateVideo({prompt:arg,seconds:4,orientation:'landscape'});}catch(e){toast(e.message||e,'error');}finally{state.busy=false;hideTyping();renderMessages();}return true;}
  if(cmd==='/file'){setMode('create');$('#prompt').value=arg||'Crie um arquivo PDF completo sobre ';return !arg;}
  return false;
}
function clearCurrent(){
  const chat=currentChat();if(!chat)return;chat.messages=[];chat.title='Novo chat';chat.updatedAt=nowISO();state.attachments=[];renderAll();persistSoon();
}

function toggleToolSheet(){ $('#commandMenu').classList.add('hidden');$('#toolSheet').classList.toggle('hidden'); }
function toolAction(action){
  $('#toolSheet').classList.add('hidden');
  if(action==='files')$('#fileInput').click();
  else if(action==='camera')$('#cameraInput').click();
  else if(action==='voice')toggleVoiceRecording();
  else if(action==='image'){setMode('create');$('#prompt').value='Crie uma imagem de ';$('#prompt').focus();autoSizePrompt();}
  else if(action==='video'){setMode('create');$('#prompt').value='Crie um vídeo de ';$('#prompt').focus();autoSizePrompt();}
  else if(action==='file'){setMode('create');$('#prompt').value='Crie um arquivo PDF completo sobre ';$('#prompt').focus();autoSizePrompt();}
  else if(action==='python'){setMode('code');$('#prompt').value='Execute este código Python e explique o resultado:\n\n';$('#prompt').focus();autoSizePrompt();}
  else if(action==='research'){setMode('research');$('#prompt').focus();}
  else if(action==='council'){setMode('council');$('#prompt').focus();}
  else if(action==='export')exportCurrentChat();
}
function renderCommandMenu(query=''){
  const menu=$('#commandMenu');const q=query.toLowerCase();const items=COMMANDS.filter(c=>c.cmd.includes(q)||c.label.toLowerCase().includes(q));if(!items.length){menu.classList.add('hidden');return;}menu.innerHTML='';items.forEach(c=>{const b=document.createElement('button');b.className='command-row';b.innerHTML=`<span>${c.icon}</span><div><b>${c.cmd} · ${c.label}</b><span>${c.desc}</span></div>`;b.onclick=async()=>{menu.classList.add('hidden');if(c.action==='export'){await exportCurrentChat();$('#prompt').value='';return;}if(c.action==='clear'){clearCurrent();$('#prompt').value='';return;}setMode(c.mode);$('#prompt').value=c.cmd+' ';$('#prompt').focus();autoSizePrompt();};menu.appendChild(b);});menu.classList.remove('hidden');
}

function openDrawer(){ $('#mobileDrawer').classList.add('open');$('#drawerBackdrop').classList.remove('hidden'); }
function closeDrawer(){ $('#mobileDrawer').classList.remove('open');$('#drawerBackdrop').classList.add('hidden'); }

async function loadModels(){
  try{
    state.models=await puter.ai.listModels();const sel=$('#modelSelect');const current=sel.value;sel.innerHTML='<option value="auto">Auto · melhor disponível</option>';
    const preferred=['gpt-5.6-sol','gpt-5.6-luna','claude-opus-4-8','claude-sonnet-4-6','gemini-3.1-pro','grok-4.1-fast'];
    const sorted=[...state.models].sort((a,b)=>{const ai=preferred.indexOf(a.id),bi=preferred.indexOf(b.id);if(ai>=0||bi>=0)return (ai<0?999:ai)-(bi<0?999:bi);return (a.name||a.id).localeCompare(b.name||b.id);});
    for(const m of sorted){const o=document.createElement('option');o.value=m.id;o.textContent=`${m.name||m.id} · ${m.provider||''}`;sel.appendChild(o);}if([...sel.options].some(o=>o.value===current))sel.value=current;
  }catch(e){console.warn('models',e);toast('Não foi possível carregar o catálogo de modelos.','error');}
}

function bindUI(){
  $('#newChat').onclick=startNewChat;$('#mobileNewChat').onclick=startNewChat;$('#sendButton').onclick=sendCurrent;$('#plusButton').onclick=()=>state.recording?toggleVoiceRecording():toggleToolSheet();$('#fileInput').onchange=e=>uploadFiles([...e.target.files]).finally(()=>{e.target.value='';});$('#cameraInput').onchange=e=>uploadFiles([...e.target.files]).finally(()=>{e.target.value='';});
  $('#prompt').addEventListener('input',e=>{autoSizePrompt();const t=e.target.value;if(t.startsWith('/'))renderCommandMenu(t.split(/\s/)[0]);else $('#commandMenu').classList.add('hidden');});
  $('#prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendCurrent();}if(e.key==='Escape'){$('#toolSheet').classList.add('hidden');$('#commandMenu').classList.add('hidden');}});
  $$('.mode-btn').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$$('.tool-button').forEach(b=>b.onclick=()=>toolAction(b.dataset.action));
  $('#exportChat').onclick=exportCurrentChat;$('#mobileExport').onclick=exportCurrentChat;$('#clearChat').onclick=clearCurrent;$('#openDrawer').onclick=openDrawer;$('#closeDrawer').onclick=closeDrawer;$('#drawerBackdrop').onclick=closeDrawer;
  document.addEventListener('click',e=>{if(!$('#toolSheet').contains(e.target)&&!$('#plusButton').contains(e.target))$('#toolSheet').classList.add('hidden');});
}

async function init(){
  localLoad();bindUI();renderAll();autoSizePrompt();await ensureAuthState();if(state.signedIn)await cloudLoad();loadModels();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
init();
