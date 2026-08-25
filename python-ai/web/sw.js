/*Enter file contents hereconst */  const CACHE_NAME = 'python-ai-definitive-v10';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './secure-storage.js',
  './backend-sync.js',
  './context-controls.js',
  './app.js',
  './enhancements.js',
  './browser-tools.js',
  './manifest.webmanifest',
  './icon.svg'
];
const NETWORK_TIMEOUT_MS = 5000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('python-ai-definitive-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    request.headers.has('range')
  ) {
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetchWithTimeout(request);

      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
        );
      }

      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;

      if (request.mode === 'navigate') {
        return (await caches.match('./index.html')) || Response.error();
      }

      return Response.error();
    }
  })());
});
