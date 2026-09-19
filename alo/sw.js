/* ————————————————————————————————————————————————————————————
   Service worker do Alô.

   Rede primeiro, igual ao da Escola: uma correção publicada aparece
   assim que a pessoa recarrega, sem cache velho atrapalhando. O cache
   só serve para o app abrir sem internet e explicar que está offline.

   Só guarda o que é da própria origem. As mensagens vêm do Supabase,
   em outro domínio, e nunca são guardadas aqui.
   ———————————————————————————————————————————————————————————— */
'use strict';

const CACHE = 'alo-v1';

const ARQUIVOS = [
  '.',
  'index.html',
  'app.css',
  'app.js',
  'config.js',
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
  ev.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
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
