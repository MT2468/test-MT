const VERSION = '0.2.0';
const SITE_PREFIX = 'https://mt2468.github.io/test-MT/python-ai/web/';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const AUDIT_KEY = 'pythonAiBrowserAudit';
const AUDIT_LIMIT = 200;

function trustedSender(sender) {
  const url = sender?.url || sender?.tab?.url || '';
  return url.startsWith(SITE_PREFIX);
}

function cleanTab(tab) {
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    active: !!tab.active,
    pinned: !!tab.pinned,
    title: tab.title || '',
    url: tab.url || ''
  };
}

function validateUrl(value) {
  const url = new URL(String(value || ''));
  if (!WEB_PROTOCOLS.has(url.protocol)) throw new Error('Somente URLs http/https são permitidas.');
  return url.href;
}

function summarizeArgs(action, args = {}) {
  if (action === 'tabs.open') return { url: String(args.url || '').slice(0, 500) };
  if (action === 'tabs.navigate') return { tabId: Number(args.tabId), url: String(args.url || '').slice(0, 500) };
  if (['tabs.activate', 'tabs.close', 'page.read'].includes(action)) return { tabId: args.tabId == null ? null : Number(args.tabId) };
  return {};
}

async function audit(action, status, args = {}, detail = '') {
  try {
    const stored = await chrome.storage.local.get(AUDIT_KEY);
    const entries = Array.isArray(stored[AUDIT_KEY]) ? stored[AUDIT_KEY] : [];
    entries.push({
      at: new Date().toISOString(),
      action,
      status,
      args: summarizeArgs(action, args),
      detail: String(detail || '').slice(0, 300)
    });
    if (entries.length > AUDIT_LIMIT) entries.splice(0, entries.length - AUDIT_LIMIT);
    await chrome.storage.local.set({ [AUDIT_KEY]: entries });
  } catch {
    // Falha de auditoria nunca deve quebrar a ação principal.
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Nenhuma aba ativa encontrada.');
  return tab;
}

async function handle(message, sender) {
  const action = String(message?.action || '');
  const args = message?.args || {};

  if (action === 'ping') {
    return {
      version: VERSION,
      capabilities: ['tabs.list', 'tabs.open', 'tabs.activate', 'tabs.navigate', 'tabs.close', 'page.read', 'audit.list'],
      consent: 'granular'
    };
  }

  if (!message?.approved) throw new Error('Ação não autorizada pelo usuário.');

  if (action === 'audit.list') {
    const stored = await chrome.storage.local.get(AUDIT_KEY);
    const entries = Array.isArray(stored[AUDIT_KEY]) ? stored[AUDIT_KEY] : [];
    return entries.slice(-50).reverse();
  }

  if (action === 'tabs.list') {
    const tabs = await chrome.tabs.query({});
    return tabs.map(cleanTab);
  }

  if (action === 'tabs.open') {
    const tab = await chrome.tabs.create({ url: validateUrl(args.url), active: args.active !== false });
    return cleanTab(tab);
  }

  if (action === 'tabs.activate') {
    const tabId = Number(args.tabId);
    if (!Number.isInteger(tabId)) throw new Error('tabId inválido.');
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
    return cleanTab(tab);
  }

  if (action === 'tabs.navigate') {
    const tabId = Number(args.tabId);
    if (!Number.isInteger(tabId)) throw new Error('tabId inválido.');
    const tab = await chrome.tabs.update(tabId, { url: validateUrl(args.url) });
    return cleanTab(tab);
  }

  if (action === 'tabs.close') {
    const tabId = Number(args.tabId);
    if (!Number.isInteger(tabId)) throw new Error('tabId inválido.');
    if (sender?.tab?.id === tabId) throw new Error('A Python AI não pode fechar a própria aba.');
    await chrome.tabs.remove(tabId);
    return { closed: true, tabId };
  }

  if (action === 'page.read') {
    const tab = args.tabId ? await chrome.tabs.get(Number(args.tabId)) : await activeTab();
    if (!tab?.id) throw new Error('Aba inválida.');
    const url = new URL(tab.url || 'about:blank');
    if (!WEB_PROTOCOLS.has(url.protocol)) throw new Error('Página protegida ou não suportada.');
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title,
        url: location.href,
        text: (document.body?.innerText || '').slice(0, 30000)
      })
    });
    return result;
  }

  throw new Error('Ação desconhecida: ' + action);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!trustedSender(sender)) {
    sendResponse({ ok: false, error: 'Origem não autorizada.' });
    return false;
  }

  const action = String(message?.action || '');
  const args = message?.args || {};

  handle(message, sender)
    .then(async data => {
      if (action !== 'ping' && action !== 'audit.list') await audit(action, 'ok', args);
      sendResponse({ ok: true, data });
    })
    .catch(async error => {
      if (action !== 'ping' && action !== 'audit.list') await audit(action, 'error', args, error?.message || String(error));
      sendResponse({ ok: false, error: error?.message || String(error) });
    });
  return true;
});
