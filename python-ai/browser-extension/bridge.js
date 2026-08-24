const PAGE_SOURCE = 'python-ai-web';
const BRIDGE_SOURCE = 'python-ai-browser-bridge';
let sessionApproved = false;

function post(type, payload = {}) {
  window.postMessage({ source: BRIDGE_SOURCE, type, ...payload }, location.origin);
}

function approvalFor(action) {
  if (action === 'ping') return true;
  if (!sessionApproved) {
    sessionApproved = window.confirm(
      'A Python AI quer controlar o navegador nesta sessão. Isso pode listar, abrir, ativar e navegar abas e ler o texto de páginas. Deseja permitir?'
    );
  }
  if (!sessionApproved) return false;
  if (action === 'tabs.close') {
    return window.confirm('A Python AI quer fechar uma aba. Confirma esta ação?');
  }
  return true;
}

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin) return;
  const message = event.data;
  if (!message || message.source !== PAGE_SOURCE || message.type !== 'request') return;

  const requestId = message.requestId;
  const action = String(message.action || '');
  const approved = approvalFor(action);
  if (!approved) {
    post('response', { requestId, ok: false, error: 'Ação recusada pelo usuário.' });
    return;
  }

  chrome.runtime.sendMessage({ action, args: message.args || {}, approved }, response => {
    if (chrome.runtime.lastError) {
      post('response', { requestId, ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    post('response', { requestId, ...(response || { ok: false, error: 'Sem resposta da extensão.' }) });
  });
});

post('ready', { version: '0.1.0' });
