/* ————————————————————————————————————————————————————————————
   Service worker: deixa o app abrir sem rede e guarda os tiles
   do mapa já vistos.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = 'v2';
const CACHE_APP = 'alarme-gps-app-' + VERSAO;
const CACHE_TILES = 'alarme-gps-tiles';
const CACHE_SALVO = 'alarme-gps-mapa-salvo';
const LIMITE_TILES = 400;

const ARQUIVOS = [
  '.',
  'index.html',
  'app.css',
  'app.js',
  'mapa.js',
  'alarme.js',
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
        nomes.filter(n => n.startsWith('alarme-gps-app-') && n !== CACHE_APP)
             .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Tiles do mapa: usa o que já está guardado e só busca o que falta.
  if (/tile\.openstreetmap\.org$/.test(url.hostname)) {
    ev.respondWith(servirTile(req));
    return;
  }

  // Busca de endereço sempre vai à rede.
  if (url.hostname.endsWith('nominatim.openstreetmap.org')) return;

  if (url.origin !== self.location.origin) return;

  // Arquivos do app: responde do cache e atualiza por trás.
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

async function servirTile(req) {
  // O mapa guardado de propósito vem primeiro e nunca é podado.
  const salvo = await caches.open(CACHE_SALVO);
  const daArea = await salvo.match(req, { ignoreVary: true });
  if (daArea) return daArea;

  const cache = await caches.open(CACHE_TILES);
  const guardado = await cache.match(req, { ignoreVary: true });
  if (guardado) return guardado;
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) {
      cache.put(req, resp.clone());
      podarTiles(cache);
    }
    return resp;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'sem rede' });
  }
}

async function podarTiles(cache) {
  const chaves = await cache.keys();
  if (chaves.length <= LIMITE_TILES) return;
  for (const chave of chaves.slice(0, chaves.length - LIMITE_TILES)) {
    cache.delete(chave);
  }
}

self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  ev.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
      for (const cliente of lista) {
        if ('focus' in cliente) return cliente.focus();
      }
      return self.clients.openWindow('.');
    })
  );
});
