const PAGE_SOURCE = 'python-ai-web';
const BRIDGE_SOURCE = 'python-ai-browser-bridge';
const VERSION = '0.2.0';
let sessionApproved = false;

function post(type, payload = {}) {
  window.postMessage({ source: BRIDGE_SOURCE, type, ...payload }, location.origin);
}

function sessionApproval() {
  if (sessionApproved) return true;
  sessionApproved = window.confirm(
    'A Python AI quer conectar ao navegador nesta sessão. A conexão permite solicitar ações, mas leituras e alterações sensíveis continuarão exigindo confirmação específica. Deseja conectar?'
  );
  return sessionApproved;
}

function approvalFor(action, args = {}) {
  if (action === 'ping') return true;
  if (!sessionApproval()) return false;

  if (action === 'tabs.list' || action === 'audit.list') return true;

  if (action === 'page.read') {
    const target = Number.isInteger(Number(args.tabId)) && String(args.tabId) !== ''
      ? `a aba #${Number(args.tabId)}`
      : 'a aba ativa';
    return window.confirm(
      `A Python AI quer LER o texto de ${target}. Isso pode incluir conteúdo visível e potencialmente sensível da página. Permitir esta leitura?`
    );
  }

  if (action === 'tabs.open') {
    return window.confirm(`A Python AI quer ABRIR esta URL:\n\n${String(args.url || '')}\n\nPermitir?`);
  }

  if (action === 'tabs.activate') {
    return window.confirm(`A Python AI quer ATIVAR a aba #${Number(args.tabId)} e trazê-la para frente. Permitir?`);
  }

  if (action === 'tabs.navigate') {
    return window.confirm(
      `A Python AI quer NAVEGAR a aba #${Number(args.tabId)} para:\n\n${String(args.url || '')}\n\nPermitir?`
    );
  }

  if (action === 'tabs.close') {
    return window.confirm(`A Python AI quer FECHAR a aba #${Number(args.tabId)}. Confirma?`);
  }

  return false;
}

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin) return;
  const message = event.data;
  if (!message || message.source !== PAGE_SOURCE || message.type !== 'request') return;

  const requestId = message.requestId;
  const action = String(message.action || '');
  const args = message.args || {};
  const approved = approvalFor(action, args);
  if (!approved) {
    post('response', { requestId, ok: false, error: 'Ação recusada pelo usuário.' });
    return;
  }

  chrome.runtime.sendMessage({ action, args, approved }, response => {
    if (chrome.runtime.lastError) {
      post('response', { requestId, ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    post('response', { requestId, ...(response || { ok: false, error: 'Sem resposta da extensão.' }) });
  });
});

post('ready', { version: VERSION });
