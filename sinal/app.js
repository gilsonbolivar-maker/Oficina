/* ————————————————————————————————————————————————————————————
   SINAL e PAINEL — o mesmo código, dois papéis (data-role no <body>).

   O PAINEL chama cada pessoa; cada pessoa (SINAL) chama o PAINEL.
   A mensagem passa por servidores MQTT públicos, mas vai CIFRADA:
   cada pessoa tem uma chave só dela com o PAINEL (vai no convite).
   Quem não tem a chave não lê, não descobre o tópico e não consegue
   mandar alarme falso — o que não abre com a chave é descartado.

     PAINEL ──(chave da Cida)──► servidor A e B ──► SINAL da Cida
            ◄── "chegou ✓" / "viu ✓✓" ─────────────┘

   Os dois servidores são usados AO MESMO TEMPO (publica e escuta nos
   dois); basta um funcionar para os dois lados. A mensagem repete até
   o outro lado responder "chegou".
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.2.0';   // precisa casar com a VERSAO do sw.js

const ROLE = document.body.dataset.role;          // 'painel' | 'sinal'
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // sem 0, 1, O e I
const enc = new TextEncoder();
const dec = new TextDecoder();
// window.SINAL_BROKERS existe só para os testes apontarem para um servidor local.
const BROKERS = window.SINAL_BROKERS || ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];
const PREFIXO = 'app-sinal/v2/';
const VALIDADE_MS = 15 * 60 * 1000;   // mensagem mais velha que isso é descartada
const REPETIR_MS = 4000;              // sem "chegou", manda de novo…
const TENTATIVAS = 4;                 // …até 4 vezes

const TONES = [
  ['urgente', 'É urgente', ['É', 'URGENTE'], 'Sirene', true],
  ['liga', 'Me liga', ['ME', 'LIGA'], 'Sino', false],
  ['preciso', 'Compareça', ['COMPAREÇA'], 'Apito', false],
  ['olha', 'Olha aqui', ['OLHA', 'AQUI'], 'Toque curto', false]
];

const $ = s => document.querySelector(s);
const app = $('#app');
const alarmEl = $('#alarm');

let audioCtx = null;
let ringing = null;
let bus = null;            // ligação com os servidores, enquanto escuta
let wakeLock = null;
let selected = '';
let alarmeAberto = null;   // { ref, chave } do alarme na tela, para o "viu"
const pendentes = new Map();   // id → { destino, nome, tentativas, timer, estado }

/* ————————————————— guardar no aparelho ————————————————— */

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(ROLE + '-' + key)) ?? fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(ROLE + '-' + key, JSON.stringify(value)); } catch {}
}
function clean(value, max) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function esc(value) {
  return String(value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
}
function aleatorio(n) {
  // 256 é múltiplo de 32: cada letra sai com a mesma chance.
  return [...crypto.getRandomValues(new Uint8Array(n))].map(b => ABC[b % 32]).join('');
}
function people() { return read('people', []); }
function savePeople(list) { write('people', list.slice(0, 20)); }
function myName() {
  const typed = clean(read('name', ''), 24);
  return ROLE === 'painel' ? (typed || 'PAINEL') : typed;
}

/* ————————————————— convite ————————————————— */

/** "H4K2P-ABCD…(26)" — o código da pessoa e a chave dela com o PAINEL. */
function lerConvite(texto) {
  const m = String(texto || '').toUpperCase().match(/([A-Z2-9]{5})-([A-Z2-9]{26})/);
  if (!m || ![...m[1] + m[2]].every(c => ABC.includes(c))) return null;
  return { code: m[1], chave: m[2] };
}
function linkConvite(p) {
  return new URL('../sinal/#c=' + p.code + '-' + p.chave, location.href).href;
}

/* ————————————————— cifra ————————————————— */

const chaves = new Map();   // chave do convite → { aes, paraSinal, paraPainel }

async function hashHex(texto) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function derivar(chave) {
  if (chaves.has(chave)) return chaves.get(chave);
  const base = await crypto.subtle.importKey('raw', enc.encode(chave), 'HKDF', false, ['deriveKey']);
  const aes = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('app-sinal/v2'), info: enc.encode('aes-gcm') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  // O tópico também sai da chave: quem olha o servidor não vê código nem nome.
  const d = {
    aes,
    paraSinal: PREFIXO + (await hashHex('para-sinal|' + chave)).slice(0, 32),
    paraPainel: PREFIXO + (await hashHex('para-painel|' + chave)).slice(0, 32)
  };
  chaves.set(chave, d);
  return d;
}
const b64 = u => btoa(String.fromCharCode(...u));
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function cifrar(chave, obj) {
  const { aes } = await derivar(chave);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(obj))));
  return JSON.stringify({ iv: b64(iv), ct: b64(ct) });
}
async function decifrar(chave, texto) {
  try {
    const { aes } = await derivar(chave);
    const { iv, ct } = JSON.parse(texto);
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, aes, deB64(ct));
    return JSON.parse(dec.decode(claro));
  } catch {
    return null;   // não abriu com a chave: não é de quem diz ser
  }
}

/* ————————————————— MQTT 3.1.1 mínimo, sobre WebSocket ————————————————— */

function encStr(s) {
  const b = enc.encode(s);
  const o = new Uint8Array(2 + b.length);
  o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o;
}
function remLen(n) {
  const o = [];
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0);
  return Uint8Array.from(o);
}
function concat(...parts) {
  const o = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let i = 0;
  for (const p of parts) { o.set(p, i); i += p.length; }
  return o;
}
function packet(first, body) { return concat(Uint8Array.of(first), remLen(body.length), body); }

/** Uma ligação com um servidor. Guarda pedaços de pacote entre um quadro e outro. */
function conexao(url, topicos, aoMudar, aoReceber) {
  let ws = null, parado = false, pronto = false, ping = null, espera = 2000, resto = new Uint8Array(0), pid = 1;
  const enviar = bytes => { if (ws && ws.readyState === 1) ws.send(bytes); };

  function inscrever(lista) {
    if (!lista.length) return;
    const corpo = concat(Uint8Array.of(pid >> 8, pid & 255), ...lista.map(t => concat(encStr(t), Uint8Array.of(0))));
    pid = pid % 65535 + 1;
    enviar(packet(0x82, corpo));
  }

  function tratar(tipo, flags, corpo) {
    if (tipo === 2) {                         // CONNACK
      if (corpo[1] !== 0) { ws.close(); return; }
      pronto = true; espera = 2000;
      inscrever(topicos);
      clearInterval(ping);
      ping = setInterval(() => enviar(Uint8Array.of(0xC0, 0)), 20000);
      aoMudar();
    } else if (tipo === 3) {                  // PUBLISH
      const tl = (corpo[0] << 8) | corpo[1];
      const topico = dec.decode(corpo.slice(2, 2 + tl));
      const qos = (flags >> 1) & 3;
      aoReceber(topico, dec.decode(corpo.slice(2 + tl + (qos ? 2 : 0))));
    }
  }

  function abrir() {
    if (parado) return;
    try { ws = new WebSocket(url, ['mqtt']); } catch { agendar(); return; }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      // Nível 4 (3.1.1), sessão limpa, keepalive 30 s. ID novo a cada ligação: duas abas não se derrubam.
      const vh = concat(encStr('MQTT'), Uint8Array.of(4, 2, 0, 30));
      enviar(packet(0x10, concat(vh, encStr('sinal-' + aleatorio(12).toLowerCase()))));
    };
    ws.onmessage = ev => {
      let u = concat(resto, new Uint8Array(ev.data));
      let i = 0;
      while (i < u.length) {
        let j = i + 1, mul = 1, len = 0, b;
        do {
          if (j >= u.length) { resto = u.slice(i); return; }
          b = u[j++]; len += (b & 127) * mul; mul *= 128;
        } while (b & 128);
        if (j + len > u.length) { resto = u.slice(i); return; }
        tratar(u[i] >> 4, u[i] & 15, u.slice(j, j + len));
        i = j + len;
      }
      resto = new Uint8Array(0);
    };
    ws.onclose = () => {
      const era = pronto;
      pronto = false; resto = new Uint8Array(0);
      clearInterval(ping);
      if (era) aoMudar();
      agendar();
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  function agendar() {
    if (parado) return;
    setTimeout(abrir, espera);
    espera = Math.min(espera * 2, 30000);
  }
  abrir();

  return {
    get pronto() { return pronto; },
    publicar(topico, texto) {
      if (!pronto) return false;
      enviar(packet(0x30, concat(encStr(topico), enc.encode(texto))));
      return true;
    },
    parar() { parado = true; clearInterval(ping); try { ws && ws.close(); } catch {} }
  };
}

/**
 * Escuta nos dois servidores ao mesmo tempo. `rotas` diz, para cada tópico
 * que se escuta, qual chave abre a mensagem e de quem ela é.
 */
function ligar(rotas, aoMensagem) {
  const vistos = new Set();
  const topicos = Object.keys(rotas);
  const conns = BROKERS.map(url => conexao(url, topicos, mostrarLigacao, receber));

  function mostrarLigacao() {
    const n = conns.filter(c => c.pronto).length;
    setLigacao(n ? 'Escuta ligada (' + n + ' de ' + conns.length + ' servidores). Deixe esta tela aberta.'
      : 'Sem ligação. Tentando de novo…', n > 0);
  }
  async function receber(topico, texto) {
    const rota = rotas[topico];
    if (!rota) return;
    const msg = await decifrar(rota.chave, texto);
    if (!msg || !msg.id || Math.abs(Date.now() - msg.ts) > VALIDADE_MS) return;
    // Repetição do mesmo alarme: não toca de novo, mas confirma de novo.
    const repetida = vistos.has(msg.id);
    vistos.add(msg.id);
    if (vistos.size > 500) vistos.delete(vistos.values().next().value);
    aoMensagem(msg, rota, repetida);
  }
  setLigacao('Conectando…', false);
  return {
    pronto: () => conns.some(c => c.pronto),
    async mandar(chave, topico, obj) {
      const texto = await cifrar(chave, obj);
      return conns.map(c => c.publicar(topico, texto)).some(Boolean);
    },
    parar() { conns.forEach(c => c.parar()); }
  };
}

/* ————————————————— escutar, mandar, confirmar ————————————————— */

/** Para onde vai e por onde volta, para cada pessoa (PAINEL) ou para o PAINEL (SINAL). */
async function montarRotas() {
  const rotas = {};
  if (ROLE === 'painel') {
    for (const p of people()) {
      const d = await derivar(p.chave);
      rotas[d.paraPainel] = { chave: p.chave, nome: p.name, code: p.code };
    }
  } else {
    const chave = read('chave', '');
    if (chave) rotas[(await derivar(chave)).paraSinal] = { chave, nome: 'PAINEL' };
  }
  return rotas;
}
async function destinoDe(chave) {
  const d = await derivar(chave);
  return ROLE === 'painel' ? d.paraSinal : d.paraPainel;
}

async function escutar() {
  unlock();
  pedirTelaAcesa();
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  if (bus) bus.parar();
  bus = ligar(await montarRotas(), recebeu);
}
function pararEscuta() {
  if (bus) bus.parar();
  bus = null;
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

async function recebeu(msg, rota, repetida) {
  if (msg.kind === 'alarme') {
    responder(rota.chave, { kind: 'chegou', ref: msg.id });
    if (!repetida) {
      // No PAINEL, o nome vem da lista dele, não do que a mensagem diz.
      showAlarm(msg, ROLE === 'painel' ? rota.nome : (clean(msg.who, 24) || 'PAINEL'));
      alarmeAberto = { ref: msg.id, chave: rota.chave };
    }
  } else if (msg.kind === 'chegou' || msg.kind === 'viu') {
    const p = pendentes.get(msg.ref);
    if (!p) return;
    clearInterval(p.timer);
    if (msg.kind === 'viu') p.estado = 'viu';
    else if (p.estado !== 'viu') p.estado = 'chegou';
    mostrarEnvio(p);
  }
}
async function responder(chave, extra) {
  if (!bus) return;
  bus.mandar(chave, await destinoDe(chave), Object.assign({ id: crypto.randomUUID(), ts: Date.now() }, extra));
}

async function mandarAlarme(chave, nomeDestino, tone) {
  const note = clean($('#recado') ? $('#recado').value : '', 80);
  const who = myName();
  if (!who) { setEnvio('Escreva o seu nome.'); return; }
  if (!bus || !bus.pronto()) { setEnvio('Ainda sem ligação com os servidores. Espere "Escuta ligada".'); return; }
  const msg = { id: crypto.randomUUID(), kind: 'alarme', tone, note, who, ts: Date.now() };
  const topico = await destinoDe(chave);
  const p = { id: msg.id, nome: nomeDestino, tentativas: 1, estado: 'enviando' };
  pendentes.set(msg.id, p);
  await bus.mandar(chave, topico, msg);
  mostrarEnvio(p);
  // QoS 0 não garante nada: repete até o outro lado dizer "chegou".
  p.timer = setInterval(async () => {
    if (p.estado !== 'enviando') { clearInterval(p.timer); return; }
    if (p.tentativas >= TENTATIVAS) {
      clearInterval(p.timer);
      p.estado = 'falhou';
      mostrarEnvio(p);
      return;
    }
    p.tentativas++;
    if (bus) await bus.mandar(chave, topico, Object.assign({}, msg, { ts: Date.now() }));
    mostrarEnvio(p);
  }, REPETIR_MS);
}

function mostrarEnvio(p) {
  const texto = {
    enviando: 'Enviando para ' + p.nome + '… (' + p.tentativas + 'ª tentativa)',
    chegou: 'Chegou ✓ — tocando no aparelho de ' + p.nome + '.',
    viu: p.nome + ' viu ✓✓',
    falhou: 'Não chegou. ' + p.nome + ' está com o app aberto e a tela acesa?'
  }[p.estado];
  setEnvio(texto, p.estado);
}
function setEnvio(texto, estado) {
  const el = $('#envio');
  if (!el) return;
  el.textContent = texto;
  el.dataset.estado = estado || '';
}
function setLigacao(texto, ok) {
  const el = $('#status');
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle('ok', !!ok);
}

/* ————————————————— tela acesa, som, alarme ————————————————— */

function pedirTelaAcesa() {
  if (!navigator.wakeLock) return;
  navigator.wakeLock.request('screen').then(w => { wakeLock = w; }).catch(() => {});
}
// O sistema solta a tela acesa quando o app sai da frente: pede de novo na volta.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && bus) pedirTelaAcesa();
});

function unlock() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx.resume();
  } catch { return Promise.resolve(); }
}
function beep(tone) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
  if (tone === 'liga') { o.type = 'sine'; o.frequency.setValueAtTime(880, now); o.frequency.exponentialRampToValueAtTime(220, now + 0.6); }
  else if (tone === 'preciso') { o.type = 'square'; o.frequency.setValueAtTime(1400, now); }
  else if (tone === 'olha') { o.type = 'triangle'; o.frequency.setValueAtTime(660, now); }
  else { o.type = 'sawtooth'; o.frequency.setValueAtTime(480, now); o.frequency.linearRampToValueAtTime(920, now + 0.25); o.frequency.linearRampToValueAtTime(480, now + 0.5); }
  g.gain.exponentialRampToValueAtTime(0.0001, now + (tone === 'olha' ? 0.25 : 0.7));
  o.start(now); o.stop(now + 0.75);
}

function notificar(titulo, corpo) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  // No Chrome do Android, só o service worker pode mostrar notificação.
  const op = { body: corpo, icon: 'icon-192.png', tag: 'sinal', renotify: true };
  if (navigator.serviceWorker) {
    navigator.serviceWorker.ready.then(r => r.showNotification(titulo, op)).catch(() => {});
  } else {
    try { new Notification(titulo, op); } catch {}
  }
}

function showAlarm(data, who) {
  const tone = TONES.find(t => t[0] === data.tone) || TONES[0];
  const note = clean(data.note, 80);
  alarmEl.hidden = false;
  alarmEl.querySelector('h1').textContent = note || tone[2].join(' ');
  alarmEl.querySelector('.from').textContent = who ? 'De ' + who : '';
  alarmEl.querySelector('.hint').textContent = note ? tone[1] : 'Toque em Entendi para parar.';
  if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 700]);
  clearInterval(ringing);
  beep(tone[0]);
  ringing = setInterval(() => {
    beep(tone[0]);
    if (navigator.vibrate) navigator.vibrate(300);
  }, tone[0] === 'olha' ? 700 : 800);
  notificar(who ? 'De ' + who : 'SINAL', note || tone[1]);
}
alarmEl.querySelector('button').onclick = () => {
  alarmEl.hidden = true;
  clearInterval(ringing);
  ringing = null;
  if (navigator.vibrate) navigator.vibrate(0);
  if (alarmeAberto) responder(alarmeAberto.chave, { kind: 'viu', ref: alarmeAberto.ref });
  alarmeAberto = null;
};

/* ————————————————— telas ————————————————— */

function field(id, label, opts) {
  const tag = opts.area ? 'textarea' : 'input';
  return '<label for="' + id + '">' + label + '</label><' + tag + ' id="' + id + '" class="' + (opts.code ? 'code' : '') +
    '" maxlength="' + opts.max + '" placeholder="' + (opts.ph || '') + '" autocomplete="off"' +
    (opts.area ? '' : ' enterkeyhint="done"') + '></' + tag + '>';
}
function toneButtons() {
  return '<div class="grid">' + TONES.map(t =>
    '<button class="tone' + (t[4] ? ' hot' : '') + '" data-tone="' + t[0] + '"><b>' + t[2].join('<br>') +
    '</b><small>' + t[3] + '</small></button>').join('') + '</div>';
}
function cabeca(eye, titulo) {
  return '<p class="eye">' + eye + '</p><h1>' + titulo + ' <small class="versao" data-versao></small></h1>';
}
function blocoEscuta() {
  return bus
    ? '<p id="status" class="muted">Conectando…</p><button class="btn ghost" id="desligar">Parar de escutar</button>'
    : '<button class="btn alert" id="ligar">Ligar e escutar</button>' +
      '<p class="muted">Sem ligar, o app não recebe nem manda. Deixe a tela aberta: com o celular bloqueado, o navegador não toca.</p>';
}
function ligarBotoesEscuta(redesenhar) {
  const l = $('#ligar');
  if (l) l.onclick = async () => { await escutar(); redesenhar(); };
  const d = $('#desligar');
  if (d) d.onclick = () => { pararEscuta(); redesenhar(); };
  if (bus) bus.pronto() ? setLigacao('Escuta ligada. Deixe esta tela aberta.', true) : setLigacao('Conectando…', false);
}

async function compartilharConvite(p) {
  const link = linkConvite(p);
  // O link instala o SINAL e já leva o convite (no Android, o app instalado
  // enxerga o que o Chrome guardou). No iPhone, o código vai colado à mão.
  const texto = 'SINAL — convite de ' + myName() + ' para ' + p.name + '\n\n' +
    '📲 1. Instale o SINAL: abra o link no Chrome (ou Safari) e toque em "Instalar o SINAL":\n' + link +
    '\n\n🔑 2. Abra o SINAL instalado. Se o convite não vier preenchido, cole este código:\n' +
    p.code + '-' + p.chave +
    '\n\n3. Escreva seu nome, toque em Entrar e em Ligar e escutar.';
  if (navigator.share) {
    try { await navigator.share({ title: 'SINAL', text: texto }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(texto); alert('Convite copiado. Mande para ' + p.name + ' por mensagem.'); }
  catch { prompt('Copie o convite e mande para ' + p.name + ':', texto); }
}

function telaPainel() {
  const list = people();
  if (selected && !list.some(p => p.code === selected)) selected = '';
  if (!selected && list.length === 1) selected = list[0].code;
  const escolhido = list.find(p => p.code === selected);
  app.innerHTML = '<div class="app">' + cabeca('DOIS CELULARES', 'PAINEL') +
    '<p>Você recebe de qualquer pessoa da lista. Na hora de mandar, escolhe uma só.</p>' +
    field('nome', 'Seu nome no alerta', { max: 24, ph: 'PAINEL' }) +
    blocoEscuta() +
    '<h2>Pessoas</h2>' +
    '<div id="lista">' + (list.map(p =>
      '<div class="row"><button class="pick' + (p.code === selected ? ' on' : '') + '" data-pick="' + esc(p.code) + '">' +
        '<span>' + esc(p.name) + '</span><b>' + esc(p.code) + '</b></button>' +
        '<button class="mini" data-convite="' + esc(p.code) + '">Convite</button>' +
        '<button class="erase" data-del="' + esc(p.code) + '">Apagar</button></div>').join('') ||
      '<p class="muted">Ninguém ainda. Adicione abaixo e mande o convite.</p>') + '</div>' +
    field('pessoa', 'Nova pessoa', { max: 24, ph: 'Cida' }) +
    '<button class="btn surface" id="novo">Adicionar e mandar convite</button>' +
    (escolhido
      ? '<h2>Mandar para ' + esc(escolhido.name) + '</h2>' +
        field('recado', 'Cartão que a pessoa vê', { max: 80, ph: 'Escreva a mensagem (opcional)', area: true }) +
        toneButtons() + '<p id="envio" class="envio" aria-live="polite"></p>'
      : (list.length ? '<p class="muted" style="margin-top:1rem">Toque numa pessoa para mandar.</p>' : '')) +
    '</div>';
  preencherVersao();
  $('#nome').value = read('name', '');
  $('#nome').oninput = e => write('name', clean(e.target.value, 24));
  ligarBotoesEscuta(telaPainel);

  $('#novo').onclick = async () => {
    const name = clean($('#pessoa').value, 24);
    if (!name) { alert('Escreva o nome da pessoa.'); return; }
    const p = { name, code: aleatorio(5), chave: aleatorio(26) };
    savePeople([p].concat(people()));
    selected = p.code;
    if (bus) await escutar();   // passa a escutar a pessoa nova também
    telaPainel();
    compartilharConvite(p);
  };
  app.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { selected = b.dataset.pick; telaPainel(); });
  app.querySelectorAll('[data-convite]').forEach(b => b.onclick = () =>
    compartilharConvite(people().find(p => p.code === b.dataset.convite)));
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const person = people().find(p => p.code === b.dataset.del);
    if (!confirm('Apagar ' + (person ? person.name : 'esta pessoa') + '? O convite dela deixa de valer.')) return;
    savePeople(people().filter(p => p.code !== b.dataset.del));
    if (bus) await escutar();
    telaPainel();
  });
  app.querySelectorAll('[data-tone]').forEach(b => b.onclick = () => {
    unlock();
    if (escolhido) mandarAlarme(escolhido.chave, escolhido.name, b.dataset.tone);
  });
}

function telaSinal() {
  // Abriu um convite novo com outro já em uso: pergunta antes de trocar.
  const novo = read('convite', '');
  if (novo && read('chave', '') && novo !== read('code', '') + '-' + read('chave', '')) {
    if (confirm('Abrir o convite novo? O atual deixa de ser usado neste aparelho.')) {
      pararEscuta();
      write('chave', ''); write('code', '');
    } else write('convite', '');
  }
  const chave = read('chave', '');
  if (!chave) {
    app.innerHTML = '<div class="app">' + cabeca('USUÁRIO', 'SINAL') +
      '<p>Você recebe o que o PAINEL mandar. Sua resposta volta só para o PAINEL.</p>' +
      field('nome', 'Seu nome', { max: 24, ph: 'Cida' }) +
      field('convite', 'Convite do PAINEL', { max: 400, ph: 'Cole aqui o link ou o código', area: true }) +
      '<p id="hint" class="muted"></p>' +
      '<button class="btn" id="entrar">Entrar</button>' +
      '<p class="muted">O convite chega por mensagem. Abrindo o link, ele já vem preenchido.</p></div>';
    preencherVersao();
    $('#convite').classList.add('convite');
    $('#nome').value = read('name', '');
    const pendente = read('convite', '');
    if (pendente) $('#convite').value = pendente;
    $('#entrar').onclick = () => {
      const name = clean($('#nome').value, 24);
      const c = lerConvite($('#convite').value);
      if (!name) { $('#hint').textContent = 'Escreva o seu nome. Assim o PAINEL sabe quem chamou.'; return; }
      if (!c) { $('#hint').textContent = 'Convite não reconhecido. Ele tem um código de 5 letras, um traço e mais 26 letras.'; return; }
      write('name', name); write('code', c.code); write('chave', c.chave); write('convite', '');
      telaSinal();
    };
    return;
  }
  app.innerHTML = '<div class="app">' + cabeca('USUÁRIO', 'SINAL') +
    '<p class="muted">Você é <b>' + esc(read('name', '')) + '</b> · código</p><p class="big">' + esc(read('code', '')) + '</p>' +
    blocoEscuta() +
    '<h2>Chamar o PAINEL</h2>' +
    field('recado', 'Cartão que o PAINEL vê', { max: 80, ph: 'Escreva a mensagem (opcional)', area: true }) +
    toneButtons() + '<p id="envio" class="envio" aria-live="polite"></p>' +
    '<button class="btn ghost" id="sair">Trocar de convite</button></div>';
  preencherVersao();
  ligarBotoesEscuta(telaSinal);
  app.querySelectorAll('[data-tone]').forEach(b => b.onclick = () => {
    unlock();
    mandarAlarme(read('chave', ''), 'o PAINEL', b.dataset.tone);
  });
  $('#sair').onclick = () => {
    if (!confirm('Sair deste convite? Para voltar, vai precisar do convite de novo.')) return;
    pararEscuta();
    write('chave', ''); write('code', '');
    telaSinal();
  };
}

function preencherVersao() {
  document.querySelectorAll('[data-versao]').forEach(el => { el.textContent = 'v' + VERSAO; });
}

/* ————————————————— instalar ————————————————— */

/*
 * Faixa no topo que ajuda a instalar: com o botão do próprio Chrome quando ele
 * oferece, e explicando o que fazer quando não oferece (navegador de dentro do
 * WhatsApp, aba anônima, iPhone…). Some quando o app já está instalado.
 */
let pedidoInstalar = null;
const instaladoJa = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function faixaInstalar() {
  const el = $('#instalar');
  if (!el) return;
  if (instaladoJa()) { el.hidden = true; return; }
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const dentroDeApp = /; wv\)|WhatsApp|FBAN|FBAV|Instagram|Line\//.test(ua);
  const nome = ROLE === 'painel' ? 'PAINEL' : 'SINAL';
  let html;
  if (pedidoInstalar) {
    html = '<button class="btn alert" id="instalar-agora">Instalar o ' + nome + '</button>';
  } else if (dentroDeApp) {
    html = '<p><b>Abra no Chrome para instalar.</b> Este é o navegador de dentro de outro app. ' +
      'Toque em ⋮ e em <b>Abrir no Chrome</b> (ou <b>Abrir no navegador</b>).</p>';
  } else if (ios) {
    html = '<p><b>Para instalar:</b> no Safari, toque em Compartilhar ⬆️ e em <b>Adicionar à Tela de Início</b>.</p>';
  } else {
    html = '<p><b>Para instalar:</b> toque em ⋮ (canto de cima) e em <b>Instalar app</b> ou ' +
      '<b>Adicionar à tela inicial</b>. Se não aparecer, saia da aba anônima.</p>';
  }
  el.innerHTML = '<div class="faixa-instalar">' + html + '<button class="fechar-faixa" aria-label="Fechar">✕</button></div>';
  el.hidden = false;
  el.querySelector('.fechar-faixa').onclick = () => { el.hidden = true; };
  const b = $('#instalar-agora');
  if (b) b.onclick = async () => {
    const p = pedidoInstalar;
    pedidoInstalar = null;
    p.prompt();
    const escolha = await p.userChoice.catch(() => null);
    if (escolha && escolha.outcome === 'accepted') el.hidden = true;
    else faixaInstalar();
  };
}
// O Chrome avisa quando dá para instalar: guarda e mostra o botão.
window.addEventListener('beforeinstallprompt', ev => {
  ev.preventDefault();
  pedidoInstalar = ev;
  faixaInstalar();
});
window.addEventListener('appinstalled', () => { const el = $('#instalar'); if (el) el.hidden = true; });

/* ————————————————— início ————————————————— */

// Convite pelo link (#c=…): guarda e limpa o endereço, para não ficar na barra nem no histórico.
if (ROLE === 'sinal' && location.hash.startsWith('#c=')) {
  const c = lerConvite(decodeURIComponent(location.hash.slice(3)));
  if (c) write('convite', c.code + '-' + c.chave);
  history.replaceState(null, '', location.pathname + location.search);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Versão nova assumiu: recarrega uma vez, se não estiver escutando.
    if (recarregou || bus) return;
    recarregou = true;
    location.reload();
  });
}
preencherVersao();
faixaInstalar();
if (ROLE === 'painel') telaPainel(); else telaSinal();
