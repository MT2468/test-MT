const VERSION = '0.1.0';
const SITE_PREFIX = 'https://mt2468.github.io/test-MT/python-ai/web/';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);

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

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Nenhuma aba ativa encontrada.');
  return tab;
}

async function handle(message, sender) {
  const action = String(message?.action || '');
  const args = message?.args || {};

  if (action === 'ping') {
    return { version: VERSION, capabilities: ['tabs.list', 'tabs.open', 'tabs.activate', 'tabs.navigate', 'tabs.close', 'page.read'] };
  }

  if (!message?.approved) throw new Error('Ação não autorizada pelo usuário.');

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

  handle(message, sender)
    .then(data => sendResponse({ ok: true, data }))
    .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
