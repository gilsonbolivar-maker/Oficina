/* ————————————————————————————————————————————————————————————
   Service worker da Escola.

   Diferente do Caderno de propósito: aqui a rede vem primeiro.
   Assim, uma mudança publicada aparece na hora ao recarregar —
   sem cache velho atrapalhando a aula. O cache só entra em cena
   quando não há internet.
   ———————————————————————————————————————————————————————————— */
'use strict';

const CACHE = 'escola';

const ARQUIVOS = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'icones/icone-180.png',
  'icones/icone-192.png',
  'icones/icone-512.png',
  'icones/icone-maskable-512.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARQUIVOS.map(a => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  ev.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
