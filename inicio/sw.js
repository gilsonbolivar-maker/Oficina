/* ————————————————————————————————————————————————————————————
   Service worker: deixa o Início abrir sem rede.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '2.10.0';   // precisa casar com a VERSAO do app.js
const CACHE_APP = 'inicio-app-' + VERSAO;

const ARQUIVOS = [
  '.',
  'index.html',
  'app.css',
  'app.js',
  'manifest.webmanifest',
  'fontes/plus-jakarta-sans.woff2',
  'fontes/jetbrains-mono.woff2',
  'fontes/space-grotesk.woff2',
  'icones/icone-180.png',
  'icones/icone-192.png',
  'icones/icone-512.png',
  'icones/icone-maskable-512.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE_APP)
      .then(c => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(n => n.startsWith('inicio-app-') && n !== CACHE_APP)
             .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Responde do cache e atualiza por trás: a tela inicial abre na hora.
self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  ev.respondWith(
    caches.match(req).then(guardado => {
      const rede = fetch(req).then(resp => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE_APP).then(c => c.put(req, copia));
        }
        return resp;
      }).catch(() => guardado);
      return guardado || rede;
    })
  );
});
