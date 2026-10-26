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

const VERSAO = '1.7.0';   // precisa casar com a VERSAO do sw.js

const ROLE = document.body.dataset.role;          // 'painel' | 'sinal'
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // sem 0, 1, O e I
const enc = new TextEncoder();
const dec = new TextDecoder();
// window.SINAL_BROKERS existe só para os testes apontarem para um servidor local.
const BROKERS = window.SINAL_BROKERS || ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];
const PREFIXO = 'app-sinal/v2/';
// window.SINAL_TEMPOS também só para os testes (encurta as esperas).
const T = Object.assign({
  validade: 60 * 60 * 1000,   // alarme guardado no servidor vale 1 hora
  repetir: 4000,              // sem "chegou", manda de novo a cada 4 s…
  tentativas: 4,              // …4 vezes; depois, a cada 30 s, até a validade
  repetirLongo: 30000,
  presenca: 30000,            // "estou aqui" a cada 30 s
  onlineAte: 75000            // sem notícia há mais que isso: fora do ar
}, window.SINAL_TEMPOS);

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
const pendentes = new Map();   // id → { chave, nome, topico, msg, estado, tentativas, timer, grupo }
const presenca = new Map();    // chave → { online, ts } do outro lado
let envioNaTela = null;        // o que a linha de envio está mostrando: id ou grupo
let anuncio = null;            // timer do "estou aqui"

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
    paraPainel: PREFIXO + (await hashHex('para-painel|' + chave)).slice(0, 32),
    presSinal: PREFIXO + (await hashHex('presenca-sinal|' + chave)).slice(0, 32),
    presPainel: PREFIXO + (await hashHex('presenca-painel|' + chave)).slice(0, 32)
  };
  chaves.set(chave, d);
  return d;
}
const b64 = u => {
  // Em pedaços: espalhar 100 mil bytes de uma vez estoura a pilha.
  let s = '';
  for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
  return btoa(s);
};
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
function conexao(url, topicos, aoMudar, aoReceber, aoPronto) {
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
      aoPronto();
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
    /** `reter`: o servidor guarda a última mensagem do tópico e entrega a quem chegar depois. */
    publicar(topico, texto, reter) {
      if (!pronto) return false;
      enviar(packet(reter ? 0x31 : 0x30, concat(encStr(topico), enc.encode(texto))));
      return true;
    },
    parar() { parado = true; clearInterval(ping); try { ws && ws.close(); } catch {} }
  };
}

/**
 * Escuta nos dois servidores ao mesmo tempo. `rotas` diz, para cada tópico
 * que se escuta, qual chave abre a mensagem e de quem ela é.
 */
function ligar(rotas, aoMensagem, aoPronto) {
  // Os vistos ficam guardados: o servidor entrega de novo a mensagem guardada a
  // cada vez que o app abre, e ela não pode tocar outra vez.
  const vistos = new Set(read('vistos', []));
  const topicos = Object.keys(rotas);
  const conns = BROKERS.map(url => conexao(url, topicos, mostrarLigacao, receber, aoPronto));

  function mostrarLigacao() {
    const n = conns.filter(c => c.pronto).length;
    setLigacao(n ? 'Escuta ligada (' + n + ' de ' + conns.length + ' servidores). Deixe esta tela aberta.'
      : 'Sem ligação. Tentando de novo…', n > 0);
  }
  async function receber(topico, texto) {
    const rota = rotas[topico];
    if (!rota || !texto) return;   // vazio = mensagem guardada que foi apagada
    const msg = await decifrar(rota.chave, texto);
    if (!msg || !msg.id) return;
    if (msg.kind === 'presenca' || msg.kind === 'lista') { aoMensagem(msg, rota, false); return; }
    if (Math.abs(Date.now() - msg.ts) > T.validade) return;
    // Pedaços de anexo não passam pela lista de vistos (seriam muitos).
    if (msg.kind === 'parte' || msg.kind === 'pedir') { aoMensagem(msg, rota, false); return; }
    // Repetição da mesma mensagem: não toca de novo, mas confirma de novo.
    const repetida = vistos.has(msg.id);
    if (!repetida) {
      vistos.add(msg.id);
      if (vistos.size > 300) vistos.delete(vistos.values().next().value);
      write('vistos', [...vistos]);
    }
    aoMensagem(msg, rota, repetida);
  }
  setLigacao('Conectando…', false);
  return {
    pronto: () => conns.some(c => c.pronto),
    async mandar(chave, topico, obj, reter) {
      const texto = await cifrar(chave, obj);
      return conns.map(c => c.publicar(topico, texto, reter)).some(Boolean);
    },
    /** Apaga a mensagem guardada no tópico (já chegou). */
    limpar(topico) { conns.forEach(c => c.publicar(topico, '', true)); },
    parar() { conns.forEach(c => c.parar()); }
  };
}

/* ————————————————— escutar, mandar, confirmar ————————————————— */

/** Para onde vai e por onde volta, para cada pessoa (PAINEL) ou para o PAINEL (SINAL). */
async function montarRotas() {
  const rotas = {};
  const por = async (chave, rota) => {
    const d = await derivar(chave);
    // Escuta as mensagens que vêm para mim e o "estou aqui" do outro lado.
    rotas[ROLE === 'painel' ? d.paraPainel : d.paraSinal] = rota;
    rotas[ROLE === 'painel' ? d.presSinal : d.presPainel] = rota;
  };
  if (ROLE === 'painel') {
    for (const p of people()) await por(p.chave, { chave: p.chave, nome: p.name, code: p.code });
    const mestra = read('mestra', '');
    if (mestra) rotas[await topicoSync(mestra)] = { chave: mestra, nome: 'PAINEL', sync: true };
  } else {
    const chave = read('chave', '');
    if (chave) await por(chave, { chave, nome: 'PAINEL' });
  }
  return rotas;
}
async function destinoDe(chave) {
  const d = await derivar(chave);
  return ROLE === 'painel' ? d.paraSinal : d.paraPainel;
}
/** As chaves com quem este aparelho conversa. */
const minhasChaves = () => ROLE === 'painel' ? people().map(p => p.chave) : [read('chave', '')].filter(Boolean);

async function escutar() {
  unlock();
  pedirTelaAcesa();
  write('escutar', true);
  if (bus) bus.parar();
  bus = ligar(await montarRotas(), recebeu, () => { anunciar(true); publicarLista(); });
  clearInterval(anuncio);
  anuncio = setInterval(() => anunciar(true), T.presenca);
}
/** `lembrar`: a pessoa tocou em "Parar" — o app não liga sozinho na próxima vez. */
function pararEscuta(lembrar) {
  anunciar(false);
  clearInterval(anuncio);
  const b = bus;
  bus = null;
  // Dá tempo do "saí" partir antes de fechar a ligação.
  if (b) setTimeout(() => b.parar(), 300);
  if (lembrar) write('escutar', false);
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

/* ——— quem está online ——— */

/** "Estou aqui" (ou "saí"), guardado no servidor: quem chega depois já sabe quando fui visto. */
async function anunciar(online) {
  const b = bus;
  if (!b) return;
  for (const chave of minhasChaves()) {
    const d = await derivar(chave);
    b.mandar(chave, ROLE === 'painel' ? d.presPainel : d.presSinal,
      { kind: 'presenca', online, id: crypto.randomUUID(), ts: Date.now() }, true);
  }
}
window.addEventListener('pagehide', () => { if (bus) anunciar(false); });

function textoPresenca(chave) {
  const p = presenca.get(chave);
  if (!p) return { texto: 'nunca conectou', classe: '' };
  const idade = Date.now() - p.ts;
  if (p.online && idade < T.onlineAte) return { texto: 'online', classe: 'on-line' };
  return { texto: 'visto ' + quando(p.ts), classe: '' };
}
function quando(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return 'há ' + min + ' min';
  const d = new Date(ts);
  const hoje = new Date().toDateString() === d.toDateString();
  return (hoje ? 'às ' : 'em ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ') + hora(ts);
}
const hora = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0'); };

function atualizarPresenca() {
  document.querySelectorAll('[data-pres]').forEach(el => {
    const chave = ROLE === 'painel'
      ? (people().find(p => p.code === el.dataset.pres) || {}).chave
      : read('chave', '');
    if (!chave) return;
    const t = textoPresenca(chave);
    el.textContent = (el.dataset.prefixo || '') + t.texto;
    el.classList.toggle('on-line', t.classe === 'on-line');
  });
}
setInterval(atualizarPresenca, 15000);

/*
 * O PAINEL lembra o "visto por último" de cada pessoa entre uma abertura e outra.
 * (O servidor também guarda, mas só quando a pessoa já anunciou alguma vez.)
 */
function guardarPresenca() {
  const o = {};
  presenca.forEach((v, k) => { o[k] = v; });
  write('presenca', o);
}
Object.entries(read('presenca', {})).forEach(([k, v]) => presenca.set(k, Object.assign(v, { online: false })));

/* ——— receber ——— */

async function recebeu(msg, rota, repetida) {
  if (rota.sync) { recebeuSync(msg, repetida); return; }
  const quem = ROLE === 'painel' ? rota.nome : (clean(msg.who, 24) || 'PAINEL');
  if (msg.kind === 'presenca') {
    const atual = presenca.get(rota.chave);
    if (!atual || msg.ts >= atual.ts) {
      presenca.set(rota.chave, { online: !!msg.online, ts: msg.ts });
      guardarPresenca();
      atualizarPresenca();
    }
    return;
  }
  // Toda mensagem que importa (alarme, resposta) é confirmada — mesmo repetida,
  // porque é o "chegou" que faz o outro lado parar de mandar e apagar a guardada.
  if (msg.kind === 'alarme' || msg.kind === 'resposta') responder(rota.chave, { kind: 'chegou', ref: msg.id });

  if (msg.kind === 'parte') { receberParte(msg, rota); return; }
  if (msg.kind === 'pedir') {
    const a = anexosEnviados.get(msg.anexo);
    if (a && a.chave === rota.chave && Array.isArray(msg.faltam)) enviarPartes(msg.anexo, msg.faltam.map(Number));
    return;
  }
  if (msg.kind === 'anexo-ok') {
    const p = [...pendentes.values()].find(x => x.anexo && x.anexo.id === msg.anexo);
    if (p) { p.anexo.ok = true; atualizarEnvio(p); }
    anexosEnviados.delete(msg.anexo);
    return;
  }

  if (msg.kind === 'alarme') {
    if (repetida) return;
    if (msg.anexo) receberFicha(msg, rota);
    // No PAINEL, o nome vem da lista dele, não do que a mensagem diz.
    showAlarm(msg, quem);
    prepararTelaAnexo(msg);
    alarmeAberto = { ref: msg.id, chave: rota.chave };
    registrar({ id: msg.id, dir: 'entrou', quem, tone: msg.tone, note: clean(msg.note, 80), ts: msg.criado || msg.ts, estado: 'recebido',
      anexo: msg.anexo ? { id: msg.anexo.id, nome: clean(msg.anexo.nome, 120), tamanho: +msg.anexo.tamanho || 0 } : undefined });
  } else if (msg.kind === 'chegou' || msg.kind === 'viu') {
    const p = pendentes.get(msg.ref);
    if (!p) { apagarGuardada(rota.chave); return; }
    avancar(p, msg.kind);
  } else if (msg.kind === 'resposta') {
    if (repetida) return;
    const texto = clean(msg.texto, 80);
    const p = pendentes.get(msg.ref);
    if (p) { p.resposta = texto; avancar(p, 'respondeu'); }
    else historicoAtualizar(msg.ref, { estado: 'respondeu', resposta: texto });
    mostrarResposta(quem, texto);
  }
}

/* ——— mandar, com confirmação e mensagem guardada ——— */

const ORDEM = ['enviando', 'guardada', 'falhou', 'chegou', 'viu', 'respondeu'];
/** Só avança: um "chegou" atrasado não apaga o "viu" nem a resposta. */
function avancar(p, estado) {
  if (ORDEM.indexOf(estado) <= ORDEM.indexOf(p.estado)) return;
  const esperava = p.estado === 'enviando' || p.estado === 'guardada';
  p.estado = estado;
  if (esperava && ORDEM.indexOf(estado) >= ORDEM.indexOf('chegou')) {
    clearTimeout(p.timer);
    apagarGuardada(p.chave);
  }
  atualizarEnvio(p);
}
/** Chegou: apaga a cópia guardada no servidor — se não houver outra esperando no mesmo caminho. */
async function apagarGuardada(chave) {
  if (!bus) return;
  const topico = await destinoDe(chave);
  const outra = [...pendentes.values()].some(p => p.topico === topico && (p.estado === 'enviando' || p.estado === 'guardada'));
  if (!outra) bus.limpar(topico);
}

/**
 * Manda e não desiste: guarda no servidor (quem abrir o app depois recebe),
 * repete a cada 4 s nas primeiras vezes e depois a cada 30 s, até chegar ou
 * até passar 1 hora.
 */
async function enviarImportante(chave, nome, msg, grupo) {
  const topico = await destinoDe(chave);
  const p = { id: msg.id, chave, nome, topico, msg, estado: 'enviando', tentativas: 1, grupo, desde: Date.now() };
  pendentes.set(msg.id, p);
  await bus.mandar(chave, topico, msg, true);
  repetir(p);
  return p;
}
function repetir(p) {
  clearTimeout(p.timer);
  p.timer = setTimeout(async () => {
    if (p.estado !== 'enviando' && p.estado !== 'guardada') return;
    if (Date.now() - p.desde > T.validade) { p.estado = 'falhou'; atualizarEnvio(p); return; }
    p.tentativas++;
    if (bus) await bus.mandar(p.chave, p.topico, Object.assign({}, p.msg, { ts: Date.now() }), true);
    if (p.estado === 'enviando') {
      // Depois da última tentativa rápida: avisa que ficou guardada no servidor.
      if (p.tentativas >= T.tentativas) p.estado = 'guardada';
      atualizarEnvio(p);
    }
    repetir(p);
  }, p.tentativas < T.tentativas ? T.repetir : T.repetirLongo);
}

async function responder(chave, extra) {
  if (!bus) return;
  bus.mandar(chave, await destinoDe(chave), Object.assign({ id: crypto.randomUUID(), ts: Date.now() }, extra));
}

/** `destinos`: [{ chave, nome }] — uma pessoa, ou todas (PAINEL). */
async function mandarAlarme(destinos, tone) {
  const note = clean($('#recado') ? $('#recado').value : '', 80);
  const who = myName();
  if (!who) { setEnvio('Escreva o seu nome.'); return; }
  if (!bus || !bus.pronto()) { setEnvio('Ainda sem ligação com os servidores. Espere "Escuta ligada".'); return; }
  const grupo = destinos.length > 1 ? crypto.randomUUID() : null;
  let preparado = null;
  if (anexoEscolhido) {
    setEnvio('Preparando o anexo…');
    try { preparado = await prepararAnexo(anexoEscolhido); }
    catch { setEnvio('Não consegui ler o arquivo. Escolha de novo.'); return; }
    anexoEscolhido = null;
    const s = $('#anexo-escolhido'); if (s) s.textContent = '';
  }
  for (const d of destinos) {
    const agora = Date.now();
    const msg = { id: crypto.randomUUID(), kind: 'alarme', tone, note, who, ts: agora, criado: agora };
    let anexo = null;
    if (preparado) {
      // Cada pessoa recebe o arquivo com um id próprio (o caminho é dela).
      anexo = Object.assign({ id: crypto.randomUUID() }, preparado.ficha);
      msg.anexo = anexo;
      anexosEnviados.set(anexo.id, { partes: preparado.partes, chave: d.chave, topico: await destinoDe(d.chave) });
      setTimeout(() => anexosEnviados.delete(anexo.id), T.validade);
    }
    registrar({ id: msg.id, dir: 'saiu', quem: d.nome, tone, note, ts: agora, estado: 'enviando', grupo,
      anexo: anexo ? { id: anexo.id, nome: anexo.nome, tamanho: anexo.tamanho } : undefined });
    const p = await enviarImportante(d.chave, d.nome, msg, grupo);
    if (anexo) {
      p.anexo = { id: anexo.id, nome: anexo.nome, prog: 0, ok: false };
      enviarPartes(anexo.id, null, pct => { p.anexo.prog = pct; atualizarEnvio(p); });
    }
    if (!grupo) envioNaTela = p.id;
  }
  if (grupo) envioNaTela = grupo;
  [...pendentes.values()].filter(p => p.id === envioNaTela || p.grupo === envioNaTela).forEach(atualizarEnvio);
}

const ESTADO_CURTO = {
  enviando: 'enviando…', guardada: '⏳ guardada — toca quando abrir o app', falhou: '✕ não chegou em 1 hora',
  chegou: '✓ chegou', viu: '✓✓ viu'
};
function atualizarEnvio(p) {
  if (p.msg.kind !== 'alarme') return;
  historicoAtualizar(p.id, { estado: p.estado, resposta: p.resposta });
  if (envioNaTela !== p.id && envioNaTela !== p.grupo) return;
  const anexoTxt = x => !x.anexo ? '' : x.anexo.ok ? ' · 📎 arquivo entregue ✓'
    : ' · 📎 ' + (x.anexo.prog < 100 ? 'enviando arquivo ' + x.anexo.prog + '%' : 'arquivo enviado, esperando confirmação');
  if (p.grupo) {
    const todos = [...pendentes.values()].filter(x => x.grupo === p.grupo);
    const prontos = todos.filter(x => ORDEM.indexOf(x.estado) >= ORDEM.indexOf('chegou')).length;
    setEnvioLista('Para todos — chegou em ' + prontos + ' de ' + todos.length, todos.map(x =>
      [x.nome, (x.estado === 'respondeu' ? '💬 “' + x.resposta + '”' : ESTADO_CURTO[x.estado]) + anexoTxt(x), x.estado]));
    return;
  }
  const texto = {
    enviando: 'Enviando para ' + p.nome + '… (' + p.tentativas + 'ª tentativa)',
    guardada: p.nome + ' ainda não abriu o app. A mensagem fica guardada e toca quando abrir (até 1 hora).',
    chegou: 'Chegou ✓ — tocando no aparelho de ' + p.nome + '.',
    viu: p.nome + ' viu ✓✓',
    respondeu: p.nome + ' respondeu: “' + (p.resposta || '') + '”',
    falhou: 'Não chegou em 1 hora. ' + p.nome + ' não abriu o app.'
  }[p.estado];
  setEnvio(texto + anexoTxt(p), p.estado);
}
function setEnvio(texto, estado) {
  const el = $('#envio');
  if (!el) return;
  el.textContent = texto;
  el.dataset.estado = estado || '';
}
function setEnvioLista(titulo, linhas) {
  const el = $('#envio');
  if (!el) return;
  el.dataset.estado = '';
  el.innerHTML = '<span>' + esc(titulo) + '</span><ul class="por-pessoa">' + linhas.map(([n, t, e]) =>
    '<li data-estado="' + e + '"><b>' + esc(n) + '</b> ' + esc(t) + '</li>').join('') + '</ul>';
}
/** Ao redesenhar a tela, a linha de envio volta a mostrar o último envio. */
function redesenharEnvio() {
  const p = [...pendentes.values()].find(x => x.id === envioNaTela || x.grupo === envioNaTela);
  if (p) atualizarEnvio(p);
}
function setLigacao(texto, ok) {
  const el = $('#status');
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle('ok', !!ok);
}

/* ——— histórico (só no aparelho) ——— */

const historico = () => read('historico', []);
let histAberto = false;
function registrar(e) {
  const h = historico().filter(x => x.id !== e.id);
  h.unshift(e);
  write('historico', h.slice(0, 200));
  desenharHistorico();
}
function historicoAtualizar(id, mudanca) {
  const h = historico();
  const e = h.find(x => x.id === id);
  if (!e) return;
  Object.keys(mudanca).forEach(k => { if (mudanca[k] !== undefined) e[k] = mudanca[k]; });
  write('historico', h);
  desenharHistorico();
}
function blocoHistorico() {
  return '<details class="historico" id="historico"' + (histAberto ? ' open' : '') + '><summary>Histórico</summary>' +
    '<ul id="hist-lista"></ul><button class="btn ghost" id="hist-limpar">Limpar histórico</button></details>' +
    '<p class="rodape-versao"><span data-versao></span> · <button class="link" id="atualizar">Procurar atualização</button></p>';
}
function desenharHistorico() {
  const ul = $('#hist-lista');
  if (!ul) return;
  const h = historico();
  const sum = $('#historico summary');
  if (sum) sum.textContent = 'Histórico (' + h.length + ')';
  const nomeTom = t => (TONES.find(x => x[0] === t) || TONES[0])[1];
  const fim = {
    enviando: 'enviando…', guardada: '⏳ guardada', falhou: '✕ não chegou', chegou: '✓ chegou',
    viu: '✓✓ viu', respondeu: '💬', recebido: '', visto: '✓ você viu'
  };
  ul.innerHTML = h.length ? h.slice(0, 60).map(e => {
    const dia = new Date(e.ts).toDateString() === new Date().toDateString() ? '' :
      new Date(e.ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ';
    const seta = e.dir === 'saiu' ? '➡ para ' : '⬅ de ';
    const resp = e.resposta
      ? (e.dir === 'saiu' ? ' 💬 “' + esc(e.resposta) + '”' : ' · você: “' + esc(e.resposta) + '”')
      : (e.dir === 'saiu' ? ' ' + (fim[e.estado] || '') : (e.estado === 'visto' ? ' ' + fim.visto : ''));
    const anexo = !e.anexo ? '' : e.dir === 'entrou'
      ? ' · <button class="link" data-hist-anexo="' + esc(e.anexo.id) + '">📎 ' + esc(e.anexo.nome) + '</button>'
      : ' · 📎 ' + esc(e.anexo.nome);
    return '<li class="' + e.dir + '"><small>' + dia + hora(e.ts) + '</small> ' + seta + '<b>' + esc(e.quem) + '</b> · ' +
      nomeTom(e.tone) + (e.note ? ' · “' + esc(e.note) + '”' : '') + anexo + '<span class="fim">' + resp + '</span></li>';
  }).join('') : '<li class="muted">Nada ainda.</li>';
  ul.querySelectorAll('[data-hist-anexo]').forEach(b => b.onclick = async () => {
    const r = recebendo.get(b.dataset.histAnexo);
    const a = r && r.blob ? { blob: r.blob, nome: r.meta.nome, tipo: r.meta.tipo } : await lerArquivo(b.dataset.histAnexo);
    if (!a) { alert('Este arquivo não está mais no aparelho (ficam os 20 últimos) ou não chegou inteiro.'); return; }
    abrirCom(a.blob, a.nome, a.tipo);
  });
}
/** A resposta que chegou: um cartão embaixo, com um toque curto (não é alarme). */
function mostrarResposta(quem, texto) {
  let el = $('#resposta-recebida');
  if (!el) {
    el = document.createElement('div');
    el.id = 'resposta-recebida';
    el.innerHTML = '<p class="eye">RESPOSTA</p><p class="quem"></p><p class="texto"></p><button class="btn">OK</button>';
    document.body.appendChild(el);
    el.querySelector('button').onclick = () => { el.hidden = true; };
  }
  el.querySelector('.quem').textContent = quem;
  el.querySelector('.texto').textContent = texto;
  el.hidden = false;
  beep('olha');
  setTimeout(() => beep('olha'), 300);
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  notificar('Resposta de ' + quem, texto);
}

function ligarHistorico() {
  const d = $('#historico');
  if (!d) return;
  d.addEventListener('toggle', () => { histAberto = d.open; });
  const at = $('#atualizar');
  if (at) at.onclick = async () => {
    at.textContent = 'Procurando…';
    await procurarVersao();
    // Se veio versão nova, o controllerchange recarrega; se não, recarrega igual.
    setTimeout(() => location.reload(), 2500);
  };
  $('#hist-limpar').onclick = () => {
    if (!confirm('Apagar o histórico deste aparelho?')) return;
    write('historico', []);
    desenharHistorico();
  };
  desenharHistorico();
}

/*
 * O navegador só deixa tocar som, vibrar e pedir notificação depois que a
 * pessoa toca na tela. A escuta liga sozinha ao abrir; o primeiro toque em
 * qualquer lugar libera o resto.
 */
const somLiberado = () => !!audioCtx && audioCtx.state === 'running';
function aoPrimeiroToque() {
  unlock().then(mostrarAvisoSom);
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}
document.addEventListener('pointerdown', aoPrimeiroToque, { capture: true });
function mostrarAvisoSom() {
  const el = $('#aviso-som');
  if (el) el.hidden = !bus || somLiberado();
}

/* ————————————————— anexos (arquivo até 2 MB) ————————————————— */

/*
 * O arquivo vai junto do alarme, em pedaços de 32 KB, cada um cifrado com a
 * mesma chave. O alarme leva a "ficha" (nome, tamanho, quantos pedaços e o
 * SHA-256); os pedaços vão logo depois. Quem recebe remonta, confere o
 * SHA-256 e responde "anexo-ok". Faltou pedaço (estava sem sinal, abriu o app
 * depois)? Pede só os que faltam — enquanto o app de quem mandou estiver aberto.
 */
const ANEXO_MAX = 2 * 1024 * 1024;
const PEDACO = 32 * 1024;
let anexoEscolhido = null;           // File escolhido para o próximo envio
const anexosEnviados = new Map();    // id → { partes: [b64], chave, topico, ate }
const recebendo = new Map();         // id → { meta, partes: Map, chave, ultimo, pedidos, pronto, timer }

const tamanhoBonito = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function sha256Hex(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Lê o arquivo escolhido e devolve os pedaços (base64) e a ficha. */
async function prepararAnexo(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const partes = [];
  for (let i = 0; i < bytes.length; i += PEDACO) partes.push(b64(bytes.subarray(i, i + PEDACO)));
  const ficha = {
    nome: clean(arquivo.name, 120) || 'arquivo', tipo: clean(arquivo.type, 100) || 'application/octet-stream',
    tamanho: bytes.length, partes: Math.max(partes.length, 1), sha: await sha256Hex(bytes)
  };
  if (!partes.length) partes.push('');
  return { ficha, partes };
}

/** Manda os pedaços (só os pedidos, se `quais`), devagar para não afogar o servidor. */
async function enviarPartes(id, quais, aoAndar) {
  const a = anexosEnviados.get(id);
  if (!a || !bus) return;
  const lista = quais || a.partes.map((_, n) => n);
  for (let i = 0; i < lista.length; i++) {
    const n = lista[i];
    if (!bus || a.partes[n] === undefined) return;
    await bus.mandar(a.chave, a.topico, { id: id + ':' + n, kind: 'parte', anexo: id, n, dados: a.partes[n], ts: Date.now() });
    if (aoAndar) aoAndar(Math.round(100 * (i + 1) / lista.length));
    await dormir(25);
  }
}

/* ——— quem recebe ——— */

function entradaRecebendo(id, chave) {
  let r = recebendo.get(id);
  if (!r) { r = { partes: new Map(), chave, ultimo: Date.now(), pedidos: 0, pronto: false }; recebendo.set(id, r); }
  return r;
}
function receberFicha(msg, rota) {
  const f = msg.anexo;
  if (!f || !f.id) return;
  const r = entradaRecebendo(f.id, rota.chave);
  r.meta = { id: f.id, nome: clean(f.nome, 120) || 'arquivo', tipo: clean(f.tipo, 100), tamanho: +f.tamanho || 0, partes: +f.partes || 1, sha: String(f.sha || '') };
  r.alarme = msg.id;
  r.ultimo = Date.now();
  vigiarPartes(f.id);
  conferirAnexo(f.id);
}
function receberParte(msg, rota) {
  const r = entradaRecebendo(msg.anexo, rota.chave);
  if (r.pronto) return;
  r.partes.set(+msg.n, String(msg.dados || ''));
  r.ultimo = Date.now();
  conferirAnexo(msg.anexo);
}
/** Faltando pedaço e nada chegando há 3 s: pede os que faltam (até 2 min). */
function vigiarPartes(id) {
  const r = recebendo.get(id);
  clearInterval(r.timer);
  r.timer = setInterval(() => {
    if (r.pronto || !r.meta) { clearInterval(r.timer); return; }
    if (Date.now() - r.ultimo < 3000) return;
    if (++r.pedidos > 40) { clearInterval(r.timer); mostrarAnexo(id); return; }
    const faltam = [];
    for (let n = 0; n < r.meta.partes && faltam.length < 200; n++) if (!r.partes.has(n)) faltam.push(n);
    r.ultimo = Date.now();
    responder(r.chave, { kind: 'pedir', anexo: id, faltam });
  }, 1500);
}
async function conferirAnexo(id) {
  const r = recebendo.get(id);
  if (!r || !r.meta || r.pronto) { if (r && r.meta) mostrarAnexo(id); return; }
  if (r.partes.size < r.meta.partes) { mostrarAnexo(id); return; }
  r.pronto = true;
  clearInterval(r.timer);
  const pedacos = [];
  for (let n = 0; n < r.meta.partes; n++) pedacos.push(deB64(r.partes.get(n) || ''));
  const bytes = concat(...pedacos);
  if (await sha256Hex(bytes) !== r.meta.sha) {
    // Veio estragado: descarta e pede tudo de novo.
    r.pronto = false; r.partes.clear(); r.ultimo = 0; vigiarPartes(id); return;
  }
  r.blob = new Blob([bytes], { type: r.meta.tipo || 'application/octet-stream' });
  r.partes.clear();
  guardarArquivo(r.meta, r.blob);
  responder(r.chave, { kind: 'anexo-ok', anexo: id });
  mostrarAnexo(id);
}

/** Na tela do alarme: o arquivo, o andamento e os botões. */
function mostrarAnexo(id) {
  const r = recebendo.get(id);
  const el = $('#anexo-recebido');
  if (!r || !r.meta || !el || el.dataset.anexo !== id) return;
  const pct = Math.floor(100 * r.partes.size / r.meta.partes);
  el.querySelector('.nome-anexo').textContent = '📎 ' + r.meta.nome + ' · ' + tamanhoBonito(r.meta.tamanho);
  const estado = el.querySelector('.estado-anexo');
  const botoes = el.querySelector('.botoes-anexo');
  const previa = el.querySelector('img');
  if (r.blob) {
    estado.textContent = '';
    botoes.hidden = false;
    if (/^image\//.test(r.meta.tipo)) { previa.src = URL.createObjectURL(r.blob); previa.hidden = false; }
  } else {
    estado.textContent = r.pedidos > 40 ? 'O arquivo não chegou inteiro. Peça para mandar de novo.' : 'Recebendo… ' + pct + '%';
    botoes.hidden = true;
    previa.hidden = true;
  }
}
function prepararTelaAnexo(msg) {
  const el = $('#anexo-recebido');
  if (!el) return;
  if (!msg.anexo || !msg.anexo.id) { el.hidden = true; el.dataset.anexo = ''; return; }
  el.hidden = false;
  el.dataset.anexo = msg.anexo.id;
  mostrarAnexo(msg.anexo.id);
}

/* Abrir/salvar: "Salvar" baixa o arquivo; "Abrir com…" usa o compartilhar do sistema (Android). */
function salvarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function abrirCom(blob, nome, tipo) {
  try {
    const f = new File([blob], nome, { type: tipo || blob.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: nome }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  window.open(URL.createObjectURL(blob), '_blank');
}

/* ——— arquivos recebidos ficam no aparelho (IndexedDB), para abrir pelo histórico ——— */

function bancoArquivos() {
  return new Promise((ok, falha) => {
    const req = indexedDB.open('sinal-anexos-' + ROLE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('arquivos', { keyPath: 'id' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}
async function guardarArquivo(meta, blob) {
  try {
    const db = await bancoArquivos();
    const tx = db.transaction('arquivos', 'readwrite');
    const loja = tx.objectStore('arquivos');
    loja.put({ id: meta.id, nome: meta.nome, tipo: meta.tipo, blob, ts: Date.now() });
    // Guarda os 20 mais novos.
    const todos = await new Promise(ok => { const q = loja.getAll(); q.onsuccess = () => ok(q.result); q.onerror = () => ok([]); });
    todos.sort((a, b) => b.ts - a.ts).slice(20).forEach(x => loja.delete(x.id));
  } catch {}
}
async function lerArquivo(id) {
  try {
    const db = await bancoArquivos();
    return await new Promise(ok => {
      const q = db.transaction('arquivos').objectStore('arquivos').get(id);
      q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null);
    });
  } catch { return null; }
}

/* ——— escolher o arquivo para mandar (sem `accept`: quem decide é o tamanho) ——— */

function blocoAnexar() {
  return '<div class="anexar"><button class="mini" type="button" id="anexar">📎 Anexar arquivo</button>' +
    '<span id="anexo-escolhido" class="muted"></span><input type="file" id="arquivo-anexo" hidden></div>';
}
function ligarAnexar() {
  const bt = $('#anexar');
  if (!bt) return;
  const input = $('#arquivo-anexo');
  const mostrar = () => {
    const s = $('#anexo-escolhido');
    s.innerHTML = anexoEscolhido
      ? esc(anexoEscolhido.name) + ' · ' + tamanhoBonito(anexoEscolhido.size) + ' <button class="link" id="tirar-anexo">tirar</button>' : '';
    const t = $('#tirar-anexo');
    if (t) t.onclick = () => { anexoEscolhido = null; mostrar(); };
  };
  bt.onclick = () => input.click();
  input.onchange = () => {
    const f = input.files[0];
    input.value = '';
    if (!f) return;
    if (f.size > ANEXO_MAX) { alert('O arquivo tem ' + tamanhoBonito(f.size) + '. O limite é 2 MB.'); return; }
    anexoEscolhido = f;
    mostrar();
  };
  mostrar();
}

/* ————————————————— o mesmo PAINEL em vários aparelhos ————————————————— */

/*
 * Os aparelhos do mesmo PAINEL dividem uma chave "mestra" (vai no link
 * #p=…). Com ela, todos escutam um tópico de sincronia, cifrado: a lista de
 * pessoas (com as chaves) fica guardada lá e quem muda a lista manda a nova,
 * com a hora — vale a mais nova. Quando um aparelho atende um alarme, avisa
 * os outros, que param de tocar.
 */
const topicoSync = async mestra => PREFIXO + (await hashHex('painel-sync|' + mestra)).slice(0, 32);
function lerCodigoPainel(texto) {
  const m = String(texto || '').toUpperCase().match(/PAINEL-([A-Z2-9]{26})/) || String(texto || '').toUpperCase().match(/^\s*([A-Z2-9]{26})\s*$/);
  return m && [...m[1]].every(c => ABC.includes(c)) ? m[1] : null;
}
function listaMudou() {
  write('lista-ts', Date.now());
  publicarLista();
}
async function publicarLista() {
  const mestra = read('mestra', '');
  const ts = read('lista-ts', 0);
  if (ROLE !== 'painel' || !mestra || !bus || !ts) return;
  bus.mandar(mestra, await topicoSync(mestra), { kind: 'lista', id: crypto.randomUUID(), ts, people: people() }, true);
}
async function avisarAtendido(ref) {
  const mestra = read('mestra', '');
  if (!mestra || !bus) return;
  bus.mandar(mestra, await topicoSync(mestra), { kind: 'atendido', id: crypto.randomUUID(), ts: Date.now(), ref });
}
async function recebeuSync(msg, repetida) {
  if (msg.kind === 'lista' && Array.isArray(msg.people) && msg.ts > read('lista-ts', 0)) {
    const lista = msg.people.filter(p => p && p.code && p.chave && p.name)
      .map(p => ({ name: clean(p.name, 24), code: String(p.code).slice(0, 5), chave: String(p.chave).slice(0, 26) }));
    savePeople(lista);
    write('lista-ts', msg.ts);
    await escutar();      // escuta as pessoas novas
    telaPainel();
  } else if (msg.kind === 'atendido' && !repetida && alarmeAberto && alarmeAberto.ref === msg.ref) {
    fecharAlarme(false);
    setEnvio('Atendido em outro aparelho do PAINEL.');
  }
}

function blocoAparelhos() {
  const mestra = read('mestra', '');
  return '<details class="historico aparelhos" id="aparelhos"' + (read('mestra-pendente', '') ? ' open' : '') + '>' +
    '<summary>Outros aparelhos</summary>' +
    (mestra
      ? '<p class="muted">Este PAINEL está ligado a outros aparelhos: a lista de pessoas é a mesma em todos, ' +
        'todos recebem os chamados e, quando um atende, os outros param de tocar.</p>' +
        '<button class="btn surface" id="mandar-mestra">Ligar mais um aparelho</button>' +
        '<button class="btn ghost" id="sair-mestra">Desligar este aparelho do grupo</button>'
      : '<p class="muted">Use o mesmo PAINEL no celular, no iPad e no computador.</p>' +
        '<button class="btn surface" id="mandar-mestra">Usar este PAINEL em outro aparelho</button>' +
        field('codigo-painel', 'Ou, neste aparelho, cole o código do PAINEL que já existe', { max: 200, ph: 'PAINEL-…' }) +
        '<button class="btn surface" id="conectar-mestra">Conectar a esse PAINEL</button>') +
    '</details>';
}
function ligarAparelhos() {
  const pend = read('mestra-pendente', '');
  if (pend && $('#codigo-painel')) $('#codigo-painel').value = 'PAINEL-' + pend;
  const mandar = $('#mandar-mestra');
  if (mandar) mandar.onclick = async () => {
    let mestra = read('mestra', '');
    if (!mestra) {
      mestra = aleatorio(26);
      write('mestra', mestra);
      write('lista-ts', Date.now());
      if (bus) await escutar();
      publicarLista();
    }
    const link = new URL('#p=' + mestra, location.href).href;
    const texto = 'PAINEL — para usar o mesmo PAINEL neste aparelho:\n\n' +
      '1. Abra o link (no Chrome ou Safari) e instale o PAINEL:\n' + link +
      '\n\n2. No PAINEL instalado, em "Outros aparelhos", cole este código e toque em Conectar:\nPAINEL-' + mestra +
      '\n\n⚠️ Quem tiver este código controla o PAINEL. Não repasse.';
    if (navigator.share) {
      try { await navigator.share({ title: 'PAINEL', text: texto }); telaPainel(); return; } catch (e) { if (e.name === 'AbortError') { telaPainel(); return; } }
    }
    try { await navigator.clipboard.writeText(texto); alert('Copiado. Mande para você mesmo e abra no outro aparelho.'); }
    catch { prompt('Copie e abra no outro aparelho:', texto); }
    telaPainel();
  };
  const conectar = $('#conectar-mestra');
  if (conectar) conectar.onclick = async () => {
    const m = lerCodigoPainel($('#codigo-painel').value);
    if (!m) { alert('Código não reconhecido. Ele começa com PAINEL- e tem mais 26 letras.'); return; }
    const n = people().length;
    if (n && !confirm('A lista deste aparelho (' + n + ' pessoa' + (n > 1 ? 's' : '') + ') será trocada pela do outro aparelho. Continuar?')) return;
    write('mestra', m); write('mestra-pendente', ''); write('lista-ts', 0);
    await escutar();
    telaPainel();
    setLigacao('Conectado. Buscando a lista do outro aparelho…', true);
  };
  const sair = $('#sair-mestra');
  if (sair) sair.onclick = async () => {
    if (!confirm('Desligar este aparelho do grupo? A lista fica aqui, mas para de sincronizar.')) return;
    write('mestra', '');
    if (bus) await escutar();
    telaPainel();
  };
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
  const livre = $('#resposta-livre');
  if (livre) livre.value = '';
  alarmEl.querySelector('h1').textContent = note || tone[2].join(' ');
  alarmEl.querySelector('.from').textContent = who ? 'De ' + who : '';
  // Mensagem que ficou guardada enquanto o app estava fechado: diz a hora em que foi mandada.
  const criado = data.criado || data.ts;
  const antiga = Date.now() - criado > 2 * 60 * 1000 ? ' · mandada ' + quando(criado) : '';
  alarmEl.querySelector('.hint').textContent = (note ? tone[1] : 'Toque em Entendi para parar.') + antiga;
  if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 700]);
  clearInterval(ringing);
  beep(tone[0]);
  ringing = setInterval(() => {
    beep(tone[0]);
    if (navigator.vibrate) navigator.vibrate(300);
  }, tone[0] === 'olha' ? 700 : 800);
  notificar(who ? 'De ' + who : 'SINAL', note || tone[1]);
}
/* Respostas rápidas na tela do alarme: tocar numa delas já fecha o alarme. */
const RESPOSTAS = ['Estou indo', 'Já ligo', 'Agora não posso', 'OK, entendi'];

function fecharAlarme(daqui = true) {
  if (daqui && alarmeAberto && ROLE === 'painel') avisarAtendido(alarmeAberto.ref);
  alarmEl.hidden = true;
  setTimeout(recarregarSePuder, 1500);
  clearInterval(ringing);
  ringing = null;
  if (navigator.vibrate) navigator.vibrate(0);
  const a = alarmeAberto;
  alarmeAberto = null;
  return a;
}
function enviarResposta(texto) {
  texto = clean(texto, 80);
  if (!texto) return;
  const a = fecharAlarme();
  if (!a) return;
  historicoAtualizar(a.ref, { resposta: texto });
  // A resposta também fica guardada e repete até chegar.
  if (bus) enviarImportante(a.chave, '', { id: crypto.randomUUID(), kind: 'resposta', ref: a.ref, texto, who: myName(), ts: Date.now() });
}
{
  const ax = document.createElement('div');
  ax.id = 'anexo-recebido';
  ax.className = 'anexo-recebido';
  ax.hidden = true;
  ax.innerHTML = '<p class="nome-anexo"></p><img alt="" hidden><p class="estado-anexo"></p>' +
    '<div class="botoes-anexo" hidden><button type="button" data-anexo-acao="abrir">Abrir com…</button>' +
    '<button type="button" data-anexo-acao="salvar">Salvar</button></div>';
  alarmEl.querySelector('.hint').after(ax);
  ax.querySelectorAll('[data-anexo-acao]').forEach(b => b.onclick = () => {
    const r = recebendo.get(ax.dataset.anexo);
    if (!r || !r.blob) return;
    // Mexer no arquivo cala o alarme.
    clearInterval(ringing); ringing = null; if (navigator.vibrate) navigator.vibrate(0);
    if (b.dataset.anexoAcao === 'salvar') salvarBlob(r.blob, r.meta.nome); else abrirCom(r.blob, r.meta.nome, r.meta.tipo);
  });

  const r = document.createElement('div');
  r.className = 'respostas';
  r.innerHTML = '<p class="eye">RESPONDER</p><div class="rapidas">' +
    RESPOSTAS.map(t => '<button type="button" data-resposta="' + esc(t) + '">' + esc(t) + '</button>').join('') +
    '</div><div class="livre"><input id="resposta-livre" maxlength="80" placeholder="Ou escreva…" autocomplete="off" enterkeyhint="send">' +
    '<button type="button" id="resposta-enviar">Enviar</button></div>';
  alarmEl.querySelector(':scope > .btn').before(r);
  r.querySelectorAll('[data-resposta]').forEach(b => b.onclick = () => enviarResposta(b.dataset.resposta));
  const livre = r.querySelector('#resposta-livre');
  r.querySelector('#resposta-enviar').onclick = () => enviarResposta(livre.value);
  livre.addEventListener('keydown', ev => { if (ev.key === 'Enter') enviarResposta(livre.value); });
  // Começar a escrever cala o alarme, para dar para pensar.
  livre.addEventListener('focus', () => { clearInterval(ringing); ringing = null; if (navigator.vibrate) navigator.vibrate(0); });
}
alarmEl.querySelector('.btn').onclick = () => {
  const a = fecharAlarme();
  if (!a) return;
  responder(a.chave, { kind: 'viu', ref: a.ref });
  historicoAtualizar(a.ref, { estado: 'visto' });
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
    ? '<p id="status" class="muted">Conectando…</p>' +
      '<p id="aviso-som" class="aviso-som" hidden>🔈 Toque em qualquer lugar da tela para liberar o som.</p>' +
      '<button class="btn ghost" id="desligar">Parar de escutar</button>'
    : '<button class="btn alert" id="ligar">Ligar e escutar</button>' +
      '<p class="muted">Sem ligar, o app não recebe nem manda. Deixe a tela aberta: com o celular bloqueado, o navegador não toca.</p>';
}
function ligarBotoesEscuta(redesenhar) {
  const l = $('#ligar');
  if (l) l.onclick = async () => { await escutar(); redesenhar(); };
  const d = $('#desligar');
  if (d) d.onclick = () => { pararEscuta(true); redesenhar(); };
  mostrarAvisoSom();
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
  if (selected === '*' && list.length < 2) selected = '';
  if (selected && selected !== '*' && !list.some(p => p.code === selected)) selected = '';
  if (!selected && list.length === 1) selected = list[0].code;
  const todos = selected === '*';
  const escolhido = todos ? { name: 'todos' } : list.find(p => p.code === selected);
  const destinos = todos ? list.map(p => ({ chave: p.chave, nome: p.name }))
    : escolhido ? [{ chave: escolhido.chave, nome: escolhido.name }] : [];
  app.innerHTML = '<div class="app">' + cabeca('DOIS CELULARES', 'PAINEL') +
    '<p>Você recebe de qualquer pessoa da lista. Na hora de mandar, escolhe uma pessoa — ou todas.</p>' +
    field('nome', 'Seu nome no alerta', { max: 24, ph: 'PAINEL' }) +
    blocoEscuta() +
    '<h2>Pessoas</h2>' +
    '<div id="lista">' + (list.length > 1
      ? '<div class="row"><button class="pick todos' + (todos ? ' on' : '') + '" data-pick="*">' +
          '<span>Todos<small>chama as ' + list.length + ' pessoas de uma vez</small></span><b>★</b></button></div>' : '') +
      (list.map(p =>
      '<div class="row"><button class="pick' + (p.code === selected ? ' on' : '') + '" data-pick="' + esc(p.code) + '">' +
        '<span>' + esc(p.name) + '<small class="pres" data-pres="' + esc(p.code) + '"></small></span><b>' + esc(p.code) + '</b></button>' +
        '<button class="mini" data-convite="' + esc(p.code) + '">Convite</button>' +
        '<button class="erase" data-del="' + esc(p.code) + '">Apagar</button></div>').join('') ||
      '<p class="muted">Ninguém ainda. Adicione abaixo e mande o convite.</p>') + '</div>' +
    field('pessoa', 'Nova pessoa', { max: 24, ph: 'Cida' }) +
    '<button class="btn surface" id="novo">Adicionar e mandar convite</button>' +
    (escolhido
      ? '<h2>Mandar para ' + esc(escolhido.name) + '</h2>' +
        field('recado', todos ? 'Cartão que todos veem' : 'Cartão que a pessoa vê', { max: 80, ph: 'Escreva a mensagem (opcional)', area: true }) +
        blocoAnexar() + toneButtons() + '<div id="envio" class="envio" aria-live="polite"></div>'
      : (list.length ? '<p class="muted" style="margin-top:1rem">Toque numa pessoa para mandar.</p>' : '')) +
    blocoAparelhos() +
    blocoHistorico() +
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
    listaMudou();
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
    listaMudou();
    if (bus) await escutar();
    telaPainel();
  });
  app.querySelectorAll('[data-tone]').forEach(b => b.onclick = () => {
    unlock();
    if (destinos.length) mandarAlarme(destinos, b.dataset.tone);
  });
  atualizarPresenca();
  redesenharEnvio();
  ligarHistorico();
  ligarAnexar();
  ligarAparelhos();
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
      escutar().then(telaSinal);
    };
    return;
  }
  app.innerHTML = '<div class="app">' + cabeca('USUÁRIO', 'SINAL') +
    '<p class="muted">Você é <b>' + esc(read('name', '')) + '</b> · código</p><p class="big">' + esc(read('code', '')) + '</p>' +
    blocoEscuta() +
    '<h2>Chamar o PAINEL</h2>' +
    '<p class="pres pres-painel" data-pres="painel" data-prefixo="PAINEL: "></p>' +
    field('recado', 'Cartão que o PAINEL vê', { max: 80, ph: 'Escreva a mensagem (opcional)', area: true }) +
    blocoAnexar() + toneButtons() + '<div id="envio" class="envio" aria-live="polite"></div>' +
    blocoHistorico() +
    '<button class="btn ghost" id="sair">Trocar de convite</button></div>';
  preencherVersao();
  ligarBotoesEscuta(telaSinal);
  app.querySelectorAll('[data-tone]').forEach(b => b.onclick = () => {
    unlock();
    mandarAlarme([{ chave: read('chave', ''), nome: 'o PAINEL' }], b.dataset.tone);
  });
  atualizarPresenca();
  redesenharEnvio();
  ligarHistorico();
  ligarAnexar();
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

// PAINEL aberto pelo link de outro aparelho (#p=…): guarda o código para conectar.
if (ROLE === 'painel' && location.hash.startsWith('#p=')) {
  const m = lerCodigoPainel(decodeURIComponent(location.hash.slice(3)));
  if (m) write('mestra-pendente', m);
  history.replaceState(null, '', location.pathname + location.search);
}

// Convite pelo link (#c=…): guarda e limpa o endereço, para não ficar na barra nem no histórico.
if (ROLE === 'sinal' && location.hash.startsWith('#c=')) {
  const c = lerConvite(decodeURIComponent(location.hash.slice(3)));
  if (c) write('convite', c.code + '-' + c.chave);
  history.replaceState(null, '', location.pathname + location.search);
}

/*
 * Atualizar: o Android deixa o app vivo em segundo plano por dias, então ele
 * procura versão nova ao voltar para a frente e a cada 30 min. Quando a nova
 * assume, recarrega sozinho (a escuta liga de novo ao abrir) — só espera se
 * houver um alarme na tela.
 */
let recarregar = false;
function recarregarSePuder() {
  if (!recarregar || !alarmEl.hidden) return;
  recarregar = false;
  location.reload();
}
function procurarVersao() {
  if (!navigator.serviceWorker) return Promise.resolve();
  return navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { recarregar = true; recarregarSePuder(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') procurarVersao(); });
  setInterval(procurarVersao, 30 * 60 * 1000);
}
preencherVersao();
faixaInstalar();
const desenharTela = () => (ROLE === 'painel' ? telaPainel() : telaSinal());
desenharTela();
// Liga a escuta sozinho ao abrir — a menos que a pessoa tenha tocado em "Parar de escutar".
if (read('escutar', true) && (ROLE === 'painel' || read('chave', ''))) escutar().then(desenharTela);
