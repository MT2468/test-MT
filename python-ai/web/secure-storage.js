(()=>{'use strict';
const STORE='python-ai-definitive-v3';
const SECRET='python-ai-openai-key-session';
const rawGet=Storage.prototype.getItem;
const rawSet=Storage.prototype.setItem;

function scrub(raw){
  if(typeof raw!=='string'||!raw)return raw;
  try{
    const data=JSON.parse(raw);
    const key=data?.settings?.openaiKey;
    if(typeof key==='string'&&key){
      try{sessionStorage.setItem(SECRET,key)}catch{}
      data.settings.openaiKey='';
      return JSON.stringify(data);
    }
  }catch{}
  return raw;
}

try{
  const existing=rawGet.call(localStorage,STORE);
  if(existing){
    const cleaned=scrub(existing);
    if(cleaned!==existing)rawSet.call(localStorage,STORE,cleaned);
  }
}catch{}

Storage.prototype.setItem=function(key,value){
  if(this===localStorage&&key===STORE)value=scrub(String(value));
  return rawSet.call(this,key,value);
};

function configuredBase(){
  try{
    const data=JSON.parse(rawGet.call(localStorage,STORE)||'{}');
    const base=String(data?.settings?.openaiBase||'').trim();
    if(!base)return null;
    const u=new URL(base,location.href);
    let path=u.pathname.replace(/\/$/,'');
    if(!path.endsWith('/v1'))path+='/v1';
    return {origin:u.origin,path};
  }catch{return null}
}

function isConfiguredChatEndpoint(input){
  const cfg=configuredBase();
  if(!cfg)return false;
  try{
    const u=new URL(typeof input==='string'?input:input?.url||'',location.href);
    return u.origin===cfg.origin&&u.pathname===cfg.path+'/chat/completions';
  }catch{return false}
}

const realFetch=window.fetch.bind(window);
window.fetch=(input,init={})=>{
  if(!isConfiguredChatEndpoint(input))return realFetch(input,init);
  let key='';
  try{key=sessionStorage.getItem(SECRET)||''}catch{}
  if(!key)return realFetch(input,init);
  const headers=new Headers(init.headers||((typeof Request!=='undefined'&&input instanceof Request)?input.headers:undefined));
  if(!headers.has('Authorization'))headers.set('Authorization','Bearer '+key);
  return realFetch(input,{...init,headers});
};

window.PythonAISecureStorage={
  hasSessionKey(){try{return !!sessionStorage.getItem(SECRET)}catch{return false}},
  clearSessionKey(){try{sessionStorage.removeItem(SECRET)}catch{}}
};
})();
