/* ————————————————————————————————————————————————————————————
   Service worker: o app abre e consulta sem internet.
   A base de contatos não passa por aqui: ela fica no IndexedDB do aparelho.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.1.0';   // precisa casar com a VERSAO do app.js
const CACHE_APP = 'agenda-telefonica-' + VERSAO;

const ARQUIVOS = [
  '.',
  'index.html',
  'app.css',
  'app.js',
  'busca.js',
  'dados.js',
  'manifest.webmanifest',
  'icones/icone-180.png',
  'icones/icone-192.png',
  'icones/icone-512.png',
  'icones/icone-maskable-512.png'
];

self.addEventListener('install', ev => {
  // 'reload' ignora o cache do navegador: a versão nova vem inteira da rede.
  ev.waitUntil(
    caches.open(CACHE_APP)
      .then(c => c.addAll(ARQUIVOS.map(a => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(
        nomes.filter(n => n.startsWith('agenda-telefonica-') && n !== CACHE_APP)
             .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// A tela de Ajustes pede para a versão nova assumir sem esperar.
self.addEventListener('message', ev => {
  if (ev.data && ev.data.tipo === 'assumir') self.skipWaiting();
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // A página em si vem da rede quando dá: é o que traz a versão nova.
  // Sem rede, cai no que está guardado e o app abre igual.
  if (req.mode === 'navigate') {
    ev.respondWith(
      fetch(req)
        .then(resp => {
          const copia = resp.clone();
          caches.open(CACHE_APP).then(c => c.put(req, copia));
          return resp;
        })
        .catch(() => caches.match(req).then(g => g || caches.match('index.html')))
    );
    return;
  }

  // O resto responde do cache e atualiza por trás.
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
