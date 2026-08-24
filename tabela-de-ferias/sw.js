/* ————————————————————————————————————————————————————————————
   Service worker: a tabela abre sem rede depois da primeira visita.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = 'v2';
const CACHE = 'tabela-de-ferias-' + VERSAO;

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
    caches.open(CACHE)
      .then(c => c.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(n => n.startsWith('tabela-de-ferias-') && n !== CACHE)
             .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

/* Rede primeiro para pegar versão nova; cache quando não há sinal. */
self.addEventListener('fetch', ev => {
  const pedido = ev.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== location.origin) return;

  ev.respondWith(
    fetch(pedido)
      .then(resposta => {
        if (resposta && resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE).then(c => c.put(pedido, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(pedido, { ignoreSearch: true })
        .then(guardado => guardado || caches.match('index.html')))
  );
});
