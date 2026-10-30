/* ————————————————————————————————————————————————————————————
   Service worker: deixa o PixelMusic abrir sem rede. As músicas em si
   não passam por aqui — vêm direto da pasta escolhida no aparelho.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.2.0';   // precisa casar com a VERSAO do app.js
const CACHE_APP = 'pixelmusic-app-' + VERSAO;

const ARQUIVOS = [
  '.',
  'index.html',
  'app.css',
  'app.js',
  'manifest.webmanifest',
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
        nomes.filter(n => n.startsWith('pixelmusic-app-') && n !== CACHE_APP)
             .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

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
