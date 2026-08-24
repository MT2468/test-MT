(() => {
  'use strict';

  const PAGE_SOURCE = 'python-ai-web';
  const BRIDGE_SOURCE = 'python-ai-browser-bridge';
  const pending = new Map();
  let connected = false;
  let bridgeInfo = null;

  function request(action, args = {}, timeout = 15000) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Python AI Browser Bridge não respondeu.'));
      }, timeout);
      pending.set(requestId, { resolve, reject, timer });
      window.postMessage({ source: PAGE_SOURCE, type: 'request', requestId, action, args }, location.origin);
    });
  }

  function setConnection(value, info = null) {
    connected = value;
    if (info) bridgeInfo = info;
    const status = document.querySelector('#pyBrowserStatus');
    if (status) {
      status.textContent = connected
        ? `Conectado${bridgeInfo?.version ? ` · v${bridgeInfo.version}` : ''}`
        : 'Extensão não conectada';
      status.dataset.connected = connected ? '1' : '0';
    }
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (!message || message.source !== BRIDGE_SOURCE) return;

    if (message.type === 'ready') {
      setConnection(true, { version: message.version });
      return;
    }

    if (message.type !== 'response' || !message.requestId) return;
    const item = pending.get(message.requestId);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(message.requestId);
    if (message.ok) item.resolve(message.data);
    else item.reject(new Error(message.error || 'Falha no Browser Bridge.'));
  });

  async function ping() {
    try {
      const info = await request('ping', {}, 1800);
      setConnection(true, info);
      return info;
    } catch {
      setConnection(false);
      return null;
    }
  }

  window.PythonAIBrowserBridge = {
    request,
    ping,
    isConnected: () => connected,
    getInfo: () => bridgeInfo,
    listTabs: () => request('tabs.list'),
    openTab: url => request('tabs.open', { url }),
    activateTab: tabId => request('tabs.activate', { tabId }),
    navigateTab: (tabId, url) => request('tabs.navigate', { tabId, url }),
    closeTab: tabId => request('tabs.close', { tabId }),
    readPage: tabId => request('page.read', tabId ? { tabId } : {})
  };

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function renderResult(value) {
    const box = document.querySelector('#pyBrowserResult');
    if (!box) return;
    if (Array.isArray(value)) {
      box.innerHTML = value.length
        ? value.map(tab => `<div class="pybb-tab"><b>#${tab.id}</b> ${escapeHtml(tab.title || 'Sem título')}<small>${escapeHtml(tab.url || '')}</small></div>`).join('')
        : '<div class="pybb-empty">Nenhuma aba encontrada.</div>';
      return;
    }
    if (value && typeof value === 'object') {
      if (typeof value.text === 'string') {
        box.innerHTML = `<b>${escapeHtml(value.title || 'Página')}</b><small>${escapeHtml(value.url || '')}</small><pre>${escapeHtml(value.text.slice(0, 12000))}</pre>`;
      } else {
        box.innerHTML = `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
      }
      return;
    }
    box.textContent = String(value ?? '');
  }

  async function run(action, args) {
    renderResult('Executando...');
    try {
      const result = await request(action, args || {});
      setConnection(true);
      renderResult(result);
    } catch (error) {
      if (/não respondeu/i.test(error.message)) setConnection(false);
      renderResult(`Erro: ${error.message}`);
    }
  }

  function mount() {
    if (document.querySelector('#pyBrowserLauncher')) return;

    const style = document.createElement('style');
    style.textContent = `
      #pyBrowserLauncher{position:fixed;right:18px;bottom:18px;z-index:99997;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px 13px;background:#171a21;color:#f5f7fb;font:600 13px system-ui;box-shadow:0 10px 34px rgba(0,0,0,.28);cursor:pointer}
      #pyBrowserPanel{position:fixed;right:18px;bottom:68px;z-index:99998;width:min(430px,calc(100vw - 28px));max-height:72vh;overflow:auto;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:#11141a;color:#f5f7fb;font:13px system-ui;box-shadow:0 18px 50px rgba(0,0,0,.38);padding:14px;display:none}
      #pyBrowserPanel.open{display:block} .pybb-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.pybb-head b{font-size:15px}.pybb-status{font-size:11px;opacity:.7}.pybb-status[data-connected="1"]{opacity:1}
      .pybb-row{display:flex;gap:7px;margin:8px 0;flex-wrap:wrap}.pybb-row input{min-width:0;flex:1;border:1px solid rgba(255,255,255,.15);border-radius:9px;background:#0b0d12;color:#fff;padding:8px}.pybb-row input.pybb-id{flex:0 0 86px}.pybb-row button{border:1px solid rgba(255,255,255,.14);border-radius:9px;background:#20242d;color:#fff;padding:8px 10px;cursor:pointer}.pybb-row button:hover{background:#292e39}
      #pyBrowserResult{margin-top:10px;border-top:1px solid rgba(255,255,255,.1);padding-top:10px;max-height:330px;overflow:auto}.pybb-tab{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.07);word-break:break-word}.pybb-tab small,#pyBrowserResult small{display:block;opacity:.62;margin-top:2px;word-break:break-all}#pyBrowserResult pre{white-space:pre-wrap;word-break:break-word;font:12px ui-monospace,monospace;line-height:1.45}.pybb-note{font-size:11px;line-height:1.45;opacity:.65}.pybb-empty{opacity:.65;padding:8px 0}
    `;
    document.head.appendChild(style);

    const launcher = document.createElement('button');
    launcher.id = 'pyBrowserLauncher';
    launcher.type = 'button';
    launcher.textContent = '🌐 Navegador';

    const panel = document.createElement('section');
    panel.id = 'pyBrowserPanel';
    panel.innerHTML = `
      <div class="pybb-head"><b>Python AI Browser Bridge</b><span id="pyBrowserStatus" class="pybb-status">Verificando...</span></div>
      <div class="pybb-row"><button id="pybbList">Listar abas</button><button id="pybbPing">Testar ponte</button></div>
      <div class="pybb-row"><input id="pybbUrl" placeholder="https://exemplo.com"><button id="pybbOpen">Abrir URL</button></div>
      <div class="pybb-row"><input id="pybbTabId" class="pybb-id" inputmode="numeric" placeholder="ID da aba"><button id="pybbRead">Ler</button><button id="pybbActivate">Ativar</button></div>
      <div class="pybb-row"><input id="pybbNavId" class="pybb-id" inputmode="numeric" placeholder="ID"><input id="pybbNavUrl" placeholder="Nova URL"><button id="pybbNavigate">Navegar</button></div>
      <div class="pybb-note">A extensão pede sua autorização antes de controlar o navegador. Fechar abas exige uma confirmação adicional. Páginas internas do navegador e protocolos fora de HTTP/HTTPS ficam bloqueados.</div>
      <div id="pyBrowserResult"><div class="pybb-empty">Aguardando comando.</div></div>
    `;

    launcher.addEventListener('click', () => panel.classList.toggle('open'));
    document.body.append(panel, launcher);

    document.querySelector('#pybbPing').onclick = async () => renderResult(await ping() || 'Extensão não encontrada.');
    document.querySelector('#pybbList').onclick = () => run('tabs.list');
    document.querySelector('#pybbOpen').onclick = () => run('tabs.open', { url: document.querySelector('#pybbUrl').value });
    document.querySelector('#pybbRead').onclick = () => run('page.read', { tabId: Number(document.querySelector('#pybbTabId').value) });
    document.querySelector('#pybbActivate').onclick = () => run('tabs.activate', { tabId: Number(document.querySelector('#pybbTabId').value) });
    document.querySelector('#pybbNavigate').onclick = () => run('tabs.navigate', {
      tabId: Number(document.querySelector('#pybbNavId').value),
      url: document.querySelector('#pybbNavUrl').value
    });

    ping();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
