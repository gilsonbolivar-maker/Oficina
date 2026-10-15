// Service worker do Tanque Agitador: rede primeiro, cache como reserva offline.
// Os arquivos do build têm hash no nome, então basta guardar o que já foi baixado.
const VERSAO = '1.0.0';
const CACHE = `tanque-agitador-${VERSAO}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes.filter((n) => n.startsWith('tanque-agitador-') && n !== CACHE).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
