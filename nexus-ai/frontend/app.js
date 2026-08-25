const view = document.querySelector('#view');
const title = document.querySelector('#view-title');
const subtitle = document.querySelector('#view-subtitle');
const mode = () => document.querySelector('#mode').value;
const model = () => document.querySelector('#model').value;

const api = async (url, options={}) => {
  const res = await fetch(url, {headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options});
  if(!res.ok) throw new Error((await res.json().catch(()=>({detail:res.statusText}))).detail || res.statusText);
  return res.json();
};
const esc = s => String(s ?? '').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const setBusy=(btn,busy,label='Working…')=>{if(!btn)return; if(busy){btn.dataset.old=btn.textContent;btn.textContent=label;btn.disabled=true}else{btn.textContent=btn.dataset.old||'Run';btn.disabled=false}};

async function health(){try{const h=await api('/api/health');document.querySelector('#health').textContent='● Backend online · '+Object.entries(h.providers).filter(([,v])=>v).map(([k])=>k).join(', ')||'no provider key'}catch{document.querySelector('#health').textContent='● Backend offline'}}

function chatView(){
  title.textContent='Chat'; subtitle.textContent='Multimodel conversation with memory and file context.';
  view.innerHTML=document.querySelector('#chat-template').innerHTML;
  const messages=document.querySelector('#messages'), prompt=document.querySelector('#prompt'), send=document.querySelector('#send');
  let attachment='';
  const add=(role,text,meta='')=>{const d=document.createElement('div');d.className='bubble '+(role==='Você'?'user':'ai');d.innerHTML='<strong>'+esc(role)+'</strong><br>'+esc(text)+'<span class="meta">'+esc(meta)+'</span>';messages.appendChild(d);messages.scrollTop=messages.scrollHeight;};
  document.querySelector('#file').onchange=async e=>{const file=e.target.files[0]; if(!file)return; const fd=new FormData();fd.append('file',file); const res=await fetch('/api/files/upload',{method:'POST',body:fd}); const data=await res.json(); attachment=data.text; document.querySelector('#file-context').textContent=`${data.name} · ${data.characters} chars loaded`;};
  const go=async()=>{let text=prompt.value.trim();if(!text)return; prompt.value=''; add('Você',text);setBusy(send,true,'Thinking…');try{const payload={message: attachment?`${text}\n\nAttached file context:\n${attachment}`:text,mode:mode(),model:model()};const r=await api('/api/chat',{method:'POST',body:JSON.stringify(payload)});add('Nexus AI',r.text,`${r.provider} · ${r.model} · ${r.reason}`);document.querySelector('#route-info').textContent=`${r.provider} / ${r.model}`}catch(e){add('Sistema','Erro: '+e.message)}finally{setBusy(send,false)}};
  send.onclick=go;prompt.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go()}});
}

function researchView(){
  title.textContent='Deep Research';subtitle.textContent='Parallel agents, critique and synthesis.';
  view.innerHTML=`<div class="cards"><div class="card wide"><h3>Research brief</h3><textarea id="topic" class="taskbox" placeholder="What should Nexus investigate deeply?"></textarea><div class="row"><span class="muted">Researcher + Planner + Reviewer</span><button id="research" class="primary">Research</button></div></div><div id="research-output" class="card wide"><h3>Result</h3><div class="output muted">No research run yet.</div></div></div>`;
  document.querySelector('#research').onclick=async e=>{const btn=e.currentTarget,topic=document.querySelector('#topic').value.trim();if(!topic)return;setBusy(btn,true,'Researching…');try{const r=await api('/api/research',{method:'POST',body:JSON.stringify({topic,mode:mode()})});document.querySelector('#research-output').innerHTML='<h3>Synthesis</h3><div class="output">'+esc(r.synthesis.text)+'</div><h3>Agent outputs</h3>'+r.agents.map(a=>`<div class="card"><b>${esc(a.agent)}</b><pre>${esc(a.text)}</pre></div>`).join('')}catch(err){document.querySelector('#research-output').innerHTML='<div class="output">'+esc(err.message)+'</div>'}finally{setBusy(btn,false)}};
}

function agentsView(){
  title.textContent='Agent Orchestration';subtitle.textContent='Break one complex task into specialist perspectives.';
  view.innerHTML=`<div class="cards"><div class="card wide"><h3>Central task</h3><textarea id="task" class="taskbox" placeholder="Describe a complex task..."></textarea><button id="orchestrate" class="primary">Orchestrate</button></div><div id="agent-output" class="card wide"><div class="output muted">Agents are idle.</div></div></div>`;
  document.querySelector('#orchestrate').onclick=async e=>{const btn=e.currentTarget,task=document.querySelector('#task').value.trim();if(!task)return;setBusy(btn,true,'Running agents…');try{const r=await api('/api/agents/orchestrate',{method:'POST',body:JSON.stringify({task,mode:mode()})});document.querySelector('#agent-output').innerHTML='<h3>Unified answer</h3><div class="output">'+esc(r.synthesis.text)+'</div><div class="cards">'+r.agents.map(a=>`<div class="card"><h3>${esc(a.agent)}</h3><small>${esc(a.provider)} · ${esc(a.model)}</small><pre>${esc(a.text)}</pre></div>`).join('')+'</div>'}catch(err){document.querySelector('#agent-output').innerHTML='<div class="output">'+esc(err.message)+'</div>'}finally{setBusy(btn,false)}};
}

function codeView(){
  title.textContent='Nexus Code';subtitle.textContent='Plan, run and inspect Python safely.';
  view.innerHTML=`<div class="cards"><div class="card wide"><h3>Python sandbox</h3><textarea id="code" class="codebox">print("Hello from Nexus AI")\nfor i in range(3):\n    print(i)</textarea><div class="row"><span class="muted">python -I · temporary directory · timeout</span><button id="run-code" class="primary">Run code</button></div></div><div class="card wide"><h3>Output</h3><pre id="code-output" class="output"></pre></div></div>`;
  document.querySelector('#run-code').onclick=async e=>{const btn=e.currentTarget;setBusy(btn,true,'Running…');try{const r=await api('/api/code/run',{method:'POST',body:JSON.stringify({code:document.querySelector('#code').value,timeout:8})});document.querySelector('#code-output').textContent=(r.stdout||'')+(r.stderr?'\n'+r.stderr:'')+`\nexit=${r.exit_code}`}catch(err){document.querySelector('#code-output').textContent=err.message}finally{setBusy(btn,false)}};
}

function imageView(){
  title.textContent='Creative Studio';subtitle.textContent='Generate images through the configured image provider.';
  view.innerHTML=`<div class="cards"><div class="card wide"><h3>Prompt</h3><textarea id="image-prompt" class="taskbox" placeholder="Describe the image in detail..."></textarea><div class="row"><select id="size"><option>1024x1024</option><option>1536x1024</option><option>1024x1536</option></select><button id="generate-image" class="primary">Generate</button></div></div><div class="card wide" id="image-output"><div class="output muted">Your generated image will appear here.</div></div></div>`;
  document.querySelector('#generate-image').onclick=async e=>{const btn=e.currentTarget,prompt=document.querySelector('#image-prompt').value.trim();if(!prompt)return;setBusy(btn,true,'Generating…');try{const r=await api('/api/images',{method:'POST',body:JSON.stringify({prompt,size:document.querySelector('#size').value})});const src=r.data_url||r.url;document.querySelector('#image-output').innerHTML=`<img class="image-preview" src="${src}">`}catch(err){document.querySelector('#image-output').innerHTML='<div class="output">'+esc(err.message)+'</div>'}finally{setBusy(btn,false)}};
}

function workView(){
  title.textContent='Work Mode';subtitle.textContent='Turn a request into a downloadable artifact.';
  view.innerHTML=`<div class="cards"><div class="card wide"><h3>Create artifact</h3><input id="artifact-title" style="width:100%" placeholder="Title"><textarea id="artifact-prompt" class="taskbox" placeholder="Describe the work product you need..."></textarea><div class="row"><select id="kind"><option value="docx">DOCX</option><option value="pptx">PPTX</option><option value="xlsx">XLSX</option><option value="pdf">PDF</option><option value="md">Markdown</option></select><button id="artifact" class="primary">Create</button></div></div><div id="artifact-output" class="card wide"><div class="output muted">No artifact generated.</div></div></div>`;
  document.querySelector('#artifact').onclick=async e=>{const btn=e.currentTarget,title=document.querySelector('#artifact-title').value.trim(),prompt=document.querySelector('#artifact-prompt').value.trim();if(!title||!prompt)return;setBusy(btn,true,'Building…');try{const r=await api('/api/artifacts',{method:'POST',body:JSON.stringify({title,prompt,kind:document.querySelector('#kind').value,mode:mode()})});document.querySelector('#artifact-output').innerHTML=`<h3>${esc(r.filename)}</h3><p>Created with ${esc(r.model)}</p><a class="primary" href="${r.download}">Download artifact</a>`}catch(err){document.querySelector('#artifact-output').innerHTML='<div class="output">'+esc(err.message)+'</div>'}finally{setBusy(btn,false)}};
}

function voiceView(){
  title.textContent='Voice';subtitle.textContent='Browser speech input with Nexus responses spoken aloud.';
  view.innerHTML=`<div class="cards"><div class="card wide" style="text-align:center;padding:60px"><div class="orb">◉</div><h2 id="voice-state">Ready</h2><p class="muted">Uses the browser Speech Recognition and speechSynthesis APIs when available.</p><button id="voice" class="primary">Start listening</button><div id="voice-text" class="output" style="margin-top:20px;text-align:left"></div></div></div>`;
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;const btn=document.querySelector('#voice');if(!SpeechRecognition){btn.disabled=true;document.querySelector('#voice-state').textContent='Speech Recognition unavailable in this browser';return}const rec=new SpeechRecognition();rec.lang='pt-BR';rec.interimResults=false;rec.onstart=()=>document.querySelector('#voice-state').textContent='Listening…';rec.onend=()=>document.querySelector('#voice-state').textContent='Ready';rec.onresult=async e=>{const text=e.results[0][0].transcript;document.querySelector('#voice-text').textContent='Você: '+text+'\n\nNexus: thinking…';try{const r=await api('/api/chat',{method:'POST',body:JSON.stringify({message:text,mode:mode(),model:model()})});document.querySelector('#voice-text').textContent='Você: '+text+'\n\nNexus: '+r.text;const utter=new SpeechSynthesisUtterance(r.text);utter.lang='pt-BR';speechSynthesis.speak(utter)}catch(err){document.querySelector('#voice-text').textContent=err.message}};btn.onclick=()=>rec.start();
}

async function memoryView(){
  title.textContent='Memory & Projects';subtitle.textContent='Persistent context stored locally in SQLite.';
  view.innerHTML=`<div class="cards"><div class="card wide"><h3>Add memory</h3><textarea id="memory-text" class="taskbox" placeholder="Something Nexus should remember..."></textarea><button id="save-memory" class="primary">Remember</button></div><div id="memory-list" class="cards wide"></div></div>`;
  const load=async()=>{const r=await api('/api/memory');document.querySelector('#memory-list').innerHTML=r.items.length?r.items.map(m=>`<div class="card"><small>${esc(m.kind)} · ${esc(m.project)}</small><p>${esc(m.text)}</p><small>${esc(m.created_at)}</small></div>`).join(''):'<div class="card muted">No memories yet.</div>'};await load();document.querySelector('#save-memory').onclick=async()=>{const text=document.querySelector('#memory-text').value.trim();if(!text)return;await api('/api/memory',{method:'POST',body:JSON.stringify({text})});document.querySelector('#memory-text').value='';await load()};
}

const views={chat:chatView,research:researchView,agents:agentsView,code:codeView,images:imageView,work:workView,voice:voiceView,memory:memoryView};
document.querySelectorAll('#nav button').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');views[btn.dataset.view]()});
health();chatView();
