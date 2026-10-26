/* Service worker do SINAL-PAINEL: o app abre sem internet (para mandar e
   receber, precisa de internet). Página vem da rede quando dá; o resto, do cache. */
'use strict';

const VERSAO = '1.7.0';   // precisa casar com a VERSAO do app.js
const CACHE_APP = 'sinal-painel-v' + VERSAO;
const ARQUIVOS = ['.', 'index.html', '../sinal/app.js', '../sinal/app.css', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE_APP)
    .then(c => c.addAll(ARQUIVOS.map(a => new Request(a, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(nomes => Promise.all(nomes.filter(n => n.startsWith('sinal-painel-v') && n !== CACHE_APP).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// Tocar na notificação traz o app para a frente.
self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    const aberta = lista.find(c => c.url.startsWith(self.registration.scope));
    return aberta ? aberta.focus() : self.clients.openWindow('.');
  }));
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    ev.respondWith(fetch(req)
      .then(resp => { const copia = resp.clone(); caches.open(CACHE_APP).then(c => c.put(req, copia)); return resp; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(g => g || caches.match('index.html'))));
    return;
  }
  ev.respondWith(caches.match(req).then(guardado => {
    const rede = fetch(req).then(resp => {
      if (resp && resp.ok) { const copia = resp.clone(); caches.open(CACHE_APP).then(c => c.put(req, copia)); }
      return resp;
    }).catch(() => guardado);
    return guardado || rede;
  }));
});
