/* ————————————————————————————————————————————————————————————
   Início 2: tela inicial com a cara do Pixel Nexo (roxo noturno e
   dourado, abas de fichário, barra de comando, gaveta e barra fixa),
   mas com os apps de verdade do celular. Guarda o foco do Foco Dev:
   tarefa com passos pequenos e bloco de foco que avisa no fim. No
   topo, um mostrador no estilo de relógio: hora com segundos, sol,
   foco do dia, bateria, clima e bolhas (notificações, CI, rede).
   A lista de apps vem do APK, pela ponte "InicioNativo". No
   navegador, mostra uma lista de exemplo.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '2.5.1';   // precisa casar com a VERSAO do sw.js
for (const lugar of document.querySelectorAll('[data-versao]')) lugar.textContent = 'v' + VERSAO;

const nativo = window.InicioNativo || null;
// APK 1.0.0 não tem o aviso nativo: aí a própria página vibra e apita.
const temAvisoNativo = !!(nativo && typeof nativo.avisarEm === 'function');
const SITE = 'https://gilsonbolivar-maker.github.io/Oficina/';
const APK = 'https://github.com/gilsonbolivar-maker/Oficina/releases/download/inicio-apk/inicio.apk';
const MAX_BARRA = 5;

const CHAVE = {
  favoritos: 'inicio:favoritos',   // aba Início (a mesma chave da 1.x)
  barra: 'inicio:barra',
  abaDe: 'inicio:abas',            // aba escolhida à mão para cada app
  aba: 'inicio:aba-ativa',
  tarefa: 'inicio:tarefa',
  passos: 'inicio:passos',
  bloco: 'inicio:bloco',
  focoDias: 'inicio:foco-dias',    // { 'AAAA-MM-DD': minutos de foco }
  lugar: 'inicio:lugar',           // { lat, lon, nome, fonte: 'gps' | 'cidade' }
  clima: 'inicio:clima',           // última resposta da Open-Meteo, com a hora
  ci: 'inicio:ci',                 // último build da Oficina no GitHub
  tema: 'inicio:tema'              // 'nexo' (roxo e dourado), 'grafite' ou 'grafite3d' (os do Lovable)
};
const META_FOCO = 120;             // minutos de foco que enchem o anel
const ACTIONS = 'https://github.com/gilsonbolivar-maker/Oficina/actions';

/* ——— Ícones (traço, no estilo do Pixel Nexo) ——— */

const TRACOS = {
  estrela: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  codigo: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  ramo: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  brilho: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  asterisco: '<line x1="12" y1="3" x2="12" y2="21"/><line x1="4.2" y1="7.5" x2="19.8" y2="16.5"/><line x1="4.2" y1="16.5" x2="19.8" y2="7.5"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>',
  coracao: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  camadas: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  lapis: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  pasta: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  grade: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  conversa: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
  fabrica: '<path d="M2 20V9l6 4V9l6 4V4h6v16z"/><line x1="2" y1="20" x2="22" y2="20"/>',
  livro: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  alfinete: '<path d="M12 22s7-7.3 7-12a7 7 0 0 0-14 0c0 4.7 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  regua: '<path d="M3 17L17 3l4 4L7 21z"/><line x1="7" y1="13" x2="9" y2="15"/><line x1="10" y1="10" x2="12" y2="12"/><line x1="13" y1="7" x2="15" y2="9"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  peso: '<line x1="6" y1="6" x2="6" y2="18"/><line x1="18" y1="6" x2="18" y2="18"/><line x1="3" y1="9" x2="3" y2="15"/><line x1="21" y1="9" x2="21" y2="15"/><line x1="6" y1="12" x2="18" y2="12"/>',
  relogio: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><line x1="9" y1="2" x2="15" y2="2"/>',
  documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/>'
};

function svg(nome) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (TRACOS[nome] || TRACOS.grade) + '</svg>';
}

const DEGRADE = {
  verde: 'linear-gradient(135deg, #10b981, #0f5f4a)',
  azul: 'linear-gradient(135deg, #3b82f6, #3730a3)',
  laranja: 'linear-gradient(135deg, #f97316, #b45309)',
  rosa: 'linear-gradient(135deg, #ec4899, #9f1239)',
  violeta: 'linear-gradient(135deg, #8b5cf6, #5b21b6)',
  ciano: 'linear-gradient(135deg, #06b6d4, #0e7490)',
  ouro: 'linear-gradient(135deg, #f5b942, #b7791f)',
  grafite: 'linear-gradient(135deg, #52525b, #18181b)',
  noite: 'linear-gradient(135deg, #5b2a86, #23083b)'
};

/* ——— Abas do fichário ——— */

const ABAS = [
  { id: 'inicio', nome: 'Início', cor: '#f5b942', icone: 'estrela' },
  { id: 'dev', nome: 'Dev', cor: '#10b981', icone: 'terminal' },
  { id: 'trabalho', nome: 'Trabalho', cor: '#3b82f6', icone: 'pasta' },
  { id: 'social', nome: 'Social', cor: '#ec4899', icone: 'coracao' },
  { id: 'oficina', nome: 'Oficina', cor: '#a78bfa', icone: 'grade' }
];

// Cada app cai sozinho numa aba pelo nome do pacote; o toque longo muda.
const REGRAS = [
  ['', /io\.github\.gilsonbolivar\./],   // APKs da Oficina: já estão na aba Oficina
  ['dev', /com\.github|termux|anthropic|claude|openai|chatgpt|gemini|bard|lovable|vscode|replit|stackoverflow|netlify|supabase|figma|jetbrains|copilot|cursor|terminal|androidide|acode/],
  ['trabalho', /google\.android\.gm\b|gmail|calendar|agenda|apps\.docs|docs\.editors|keep|office|outlook|teams|linkedin|slack|zoom|meet|notion|trello|acrobat|adobe\.scan|camscanner/],
  ['social', /whatsapp|instagram|facebook|katana|orca|telegram|twitter|tiktok|musically|youtube|spotify|discord|threads|snapchat|pinterest|reddit|netflix|kwai|signal/]
];

// Atalhos do Foco Dev. Aparecem só quando o app do serviço não está instalado.
const LINKS = [
  { aba: 'dev', nome: 'Lovable', icone: 'coracao', fundo: 'rosa', url: 'https://lovable.dev' },
  { aba: 'dev', nome: 'ChatGPT', icone: 'alvo', fundo: 'verde', url: 'https://chat.openai.com', pacote: 'com.openai.chatgpt' },
  { aba: 'dev', nome: 'Claude', icone: 'asterisco', fundo: 'laranja', url: 'https://claude.ai', pacote: 'com.anthropic.claude' },
  { aba: 'dev', nome: 'Gemini', icone: 'brilho', fundo: 'azul', url: 'https://gemini.google.com', pacote: 'com.google.android.apps.bard' },
  { aba: 'dev', nome: 'GitHub', icone: 'ramo', fundo: 'grafite', url: 'https://github.com', pacote: 'com.github.android' },
  { aba: 'dev', nome: 'VS Code Web', icone: 'codigo', fundo: 'azul', url: 'https://vscode.dev' },
  { aba: 'dev', nome: 'Stack Overflow', icone: 'camadas', fundo: 'laranja', url: 'https://stackoverflow.com' },
  { aba: 'trabalho', nome: 'Notas', icone: 'lapis', fundo: 'ouro', url: 'https://keep.google.com', pacote: 'com.google.android.keep' },
  { aba: 'trabalho', nome: 'Agenda', icone: 'calendario', fundo: 'azul', url: 'https://calendar.google.com', pacote: 'com.google.android.calendar' }
];

// Apps da Oficina. Os que têm APK abrem o APK, se estiver instalado.
const OFICINA = [
  { pasta: '', nome: 'Oficina', icone: 'grade', fundo: 'ouro' },
  { pasta: 'alo', nome: 'Alô', icone: 'conversa', fundo: 'azul' },
  { pasta: 'britagem', nome: 'Britagem', icone: 'fabrica', fundo: 'laranja', pacote: 'io.github.gilsonbolivar.britagem' },
  { pasta: 'agenda-telefonica', nome: 'Agenda Telefônica', icone: 'livro', fundo: 'verde' },
  { pasta: 'alarme-gps', nome: 'Alarme GPS', icone: 'alfinete', fundo: 'rosa', pacote: 'io.github.gilsonbolivar.alarmegps' },
  { pasta: 'sinal', nome: 'SINAL', icone: 'sino', fundo: 'ouro', pacote: 'io.github.gilsonbolivar.sinal' },
  { pasta: 'sinal-painel', nome: 'PAINEL', icone: 'monitor', fundo: 'violeta', pacote: 'io.github.gilsonbolivar.painel' },
  { pasta: 'camera-medida', nome: 'Câmera Medida', icone: 'regua', fundo: 'ciano' },
  { pasta: 'camera-negativo', nome: 'Câmera Negativo', icone: 'camera', fundo: 'grafite' },
  { pasta: 'treino', nome: 'Treino', icone: 'peso', fundo: 'verde' },
  { pasta: 'mensagem-efemera', nome: 'Mensagem Efêmera', icone: 'relogio', fundo: 'rosa' },
  { pasta: 'ura-ios', nome: 'IOs da URA', icone: 'documento', fundo: 'azul' }
];

// Primeira vez: põe na barra e no Início os apps mais comuns, se existirem.
const PADRAO_BARRA = [/dialer|contacts|telefone|phone/, /whatsapp/, /camera/, /chrome|browser/, /anthropic|claude/];
const PADRAO_INICIO = [/dialer|telefone|phone/, /whatsapp/, /camera/, /chrome/, /photos|gallery|galeria/, /google\.android\.gm\b|gmail/, /anthropic|claude/, /settings|configura/];

const EXEMPLO = [
  ['Telefone', 'com.google.android.dialer'], ['WhatsApp', 'com.whatsapp'], ['Câmera', 'com.android.camera'],
  ['Chrome', 'com.android.chrome'], ['Galeria', 'com.miui.gallery'], ['Gmail', 'com.google.android.gm'],
  ['Agenda', 'com.google.android.calendar'], ['Drive', 'com.google.android.apps.docs'], ['Instagram', 'com.instagram.android'],
  ['YouTube', 'com.google.android.youtube'], ['Spotify', 'com.spotify.music'], ['GitHub', 'com.github.android'],
  ['Claude', 'com.anthropic.claude'], ['ChatGPT', 'com.openai.chatgpt'], ['Termux', 'com.termux'],
  ['Configurações', 'com.android.settings'], ['Banco Inter', 'br.com.intermedium'], ['Relógio', 'com.android.deskclock']
];

const $ = id => document.getElementById(id);

let apps = [];          // { id, nome, pacote }
let assinaturaApps = '';
let favoritos = ler(CHAVE.favoritos, []).filter(f => typeof f === 'string');
let barra = ler(CHAVE.barra, null);
let abaDe = ler(CHAVE.abaDe, {});
let abaAtiva = ABAS.some(a => a.id === ler(CHAVE.aba, '')) ? ler(CHAVE.aba, '') : 'inicio';
let itemDoMenu = null;

/* ——— Guardar no aparelho ——— */

function ler(chave, padrao) {
  try {
    const v = JSON.parse(localStorage.getItem(chave));
    return v === null ? padrao : v;
  } catch (e) { return padrao; }
}

function guardar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) {}
}

if (!abaDe || typeof abaDe !== 'object') abaDe = {};

/* ——— Relógio (com segundos, como o mostrador de um relógio) ——— */

let ultimoDia = '';
function atualizarRelogio() {
  const agora = new Date();
  $('hora').textContent = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('segundos').textContent = String(agora.getSeconds()).padStart(2, '0');
  const dia = agora.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
  if (dia + agora.getDate() !== ultimoDia) {
    ultimoDia = dia + agora.getDate();
    const b = document.createElement('b');
    b.textContent = dia;
    $('dia').replaceChildren(b, ' ' + agora.getDate());
    desenharFoco();   // virou o dia: o foco de hoje recomeça
  }
}

let relogio = null;
function agendarRelogio() {
  clearTimeout(relogio);
  atualizarRelogio();
  relogio = setTimeout(agendarRelogio, 1000 - (Date.now() % 1000) + 20);
}

/* ——— Apps ——— */

function carregarApps() {
  let lista = [];
  if (nativo) {
    try { lista = JSON.parse(nativo.apps()); } catch (e) { lista = []; }
  } else {
    lista = EXEMPLO.map(([nome, pacote]) => ({ id: pacote + '/.Principal', nome, pacote }));
  }
  lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  const assinatura = JSON.stringify(lista);
  if (assinatura === assinaturaApps) return false;
  assinaturaApps = assinatura;
  apps = lista;
  if (apps.length) {
    semear();
    podarDesinstalados();
  }
  return true;
}

function semear() {
  const acha = padroes => {
    const usados = new Set();
    const saida = [];
    for (const re of padroes) {
      const app = apps.find(a => !usados.has(a.id) && re.test((a.pacote + ' ' + a.nome).toLowerCase()));
      if (app) { usados.add(app.id); saida.push('app:' + app.id); }
    }
    return saida;
  };
  if (!Array.isArray(barra)) {
    barra = acha(PADRAO_BARRA).slice(0, MAX_BARRA);
    guardar(CHAVE.barra, barra);
  }
  if (!favoritos.length && ler('inicio:semeado', false) !== true) {
    favoritos = acha(PADRAO_INICIO);
    guardar(CHAVE.favoritos, favoritos);
  }
  guardar('inicio:semeado', true);
}

// App desinstalado sai do Início e da barra.
function podarDesinstalados() {
  if (!nativo) return;
  const ids = new Set(apps.map(a => 'app:' + a.id));
  const fica = f => !f.startsWith('app:') || ids.has(f);
  if (favoritos.some(f => !fica(f))) { favoritos = favoritos.filter(fica); guardar(CHAVE.favoritos, favoritos); }
  if (barra.some(f => !fica(f))) { barra = barra.filter(fica); guardar(CHAVE.barra, barra); }
}

const instalado = pacote => pacote && apps.find(a => a.pacote === pacote);

function abaDoApp(app) {
  if (Object.prototype.hasOwnProperty.call(abaDe, app.id)) return abaDe[app.id];
  const texto = (app.pacote + ' ' + app.nome).toLowerCase();
  for (const [aba, re] of REGRAS) if (re.test(texto)) return aba;
  return '';
}

function itens() {
  return [
    ...LINKS.map(l => ({ chave: 'atalho:' + l.nome, tipo: 'link', grupo: 'atalho', ...l })),
    ...OFICINA.map(o => ({ chave: 'oficina:' + o.pasta, tipo: 'link', grupo: 'Oficina', aba: 'oficina', ...o })),
    ...apps.map(a => ({ chave: 'app:' + a.id, tipo: 'app', ...a }))
  ];
}

function porChave() {
  return new Map(itens().map(i => [i.chave, i]));
}

function itensDaAba(id) {
  const mapa = porChave();
  if (id === 'inicio') return favoritos.map(f => mapa.get(f)).filter(Boolean);
  const daAba = apps.filter(a => abaDoApp(a) === id).map(a => mapa.get('app:' + a.id));
  const links = itens().filter(i => i.tipo === 'link' && i.aba === id && !(i.grupo === 'atalho' && instalado(i.pacote)));
  return id === 'oficina' ? [...links, ...daAba] : [...daAba, ...links];
}

function enderecoDe(item) {
  if (item.url) return item.url;
  const pasta = item.pasta ? item.pasta + '/' : '';
  return nativo ? SITE + pasta : '../' + pasta;
}

function abrir(item) {
  if (item.tipo === 'app') {
    if (nativo) nativo.abrir(item.id);
  } else {
    const app = nativo && instalado(item.pacote);
    if (app) nativo.abrir(app.id);
    else if (nativo) nativo.abrirLink(enderecoDe(item));
    else if (item.url) window.open(item.url, '_blank', 'noopener');
    else location.href = enderecoDe(item);
  }
  // Ao voltar para o Início, tudo já está fechado e limpo.
  setTimeout(() => { fecharGaveta(); limparComando(); }, 400);
}

/* ——— Ícones dos apps ——— */

const cacheIcones = new Map();
const filaIcones = [];
let filaAgendada = false;

const observador = 'IntersectionObserver' in window
  ? new IntersectionObserver(entradas => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        observador.unobserve(e.target);
        pedirIcone(e.target);
      }
    }, { rootMargin: '300px' })
  : null;

function pedirIcone(el) {
  const id = el.dataset.id;
  if (cacheIcones.has(id)) return pintarIcone(el, cacheIcones.get(id));
  filaIcones.push(el);
  if (!filaAgendada) { filaAgendada = true; setTimeout(processarFila, 0); }
}

// Poucos por vez, para a rolagem não travar.
function processarFila() {
  for (let n = 0; n < 4 && filaIcones.length; n++) {
    const el = filaIcones.shift();
    const id = el.dataset.id;
    if (!cacheIcones.has(id)) {
      let dado = '';
      try { dado = nativo.icone(id) || ''; } catch (e) {}
      cacheIcones.set(id, dado);
    }
    pintarIcone(el, cacheIcones.get(id));
  }
  if (filaIcones.length) setTimeout(processarFila, 0);
  else filaAgendada = false;
}

function pintarIcone(el, dado) {
  if (!dado) return;
  el.style.backgroundImage = 'url("' + dado + '")';
  el.classList.add('real');
  el.textContent = '';
}

// Sem ícone de verdade (navegador, ou enquanto carrega): letra sobre degradê.
function degradeDoNome(nome) {
  const nomes = Object.keys(DEGRADE);
  let h = 0;
  for (const c of nome) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return DEGRADE[nomes[h % nomes.length]];
}

function criarIcone(item) {
  const el = document.createElement('span');
  el.className = 'icone';
  if (item.tipo === 'link') {
    el.style.setProperty('--fundo-icone', DEGRADE[item.fundo] || DEGRADE.noite);
    el.innerHTML = svg(item.icone);
  } else {
    el.style.setProperty('--fundo-icone', degradeDoNome(item.nome));
    el.textContent = item.nome.slice(0, 1).toUpperCase();
    if (nativo) {
      el.dataset.id = item.id;
      if (observador) observador.observe(el); else pedirIcone(el);
    }
  }
  return el;
}

// Número de notificações em cima do ícone, como no launcher do celular.
function criarContador(item) {
  const pacote = item.tipo === 'app' ? item.pacote : item.pacote && instalado(item.pacote) && item.pacote;
  const n = pacote && notificacoes.apps[pacote];
  if (!n) return null;
  const c = document.createElement('span');
  c.className = 'contador';
  c.textContent = n > 99 ? '99+' : String(n);
  return c;
}

function criarBotao(item, comTipo) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'app';
  b.setAttribute('aria-label', item.nome);
  b.append(criarIcone(item));
  const contador = criarContador(item);
  if (contador) b.append(contador);
  const nome = document.createElement('span');
  nome.className = 'nome';
  nome.textContent = item.nome;
  b.append(nome);
  if (comTipo) {
    const tipo = document.createElement('span');
    tipo.className = 'tipo';
    tipo.textContent = item.tipo === 'app' ? 'app' : item.grupo === 'Oficina' ? 'oficina' : 'site';
    b.append(tipo);
  }
  ligarToque(b, item);
  return b;
}

/* ——— Fichário ——— */

function desenharAbas() {
  $('abas').replaceChildren(...ABAS.map(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aba';
    b.style.setProperty('--cor', a.cor);
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(a.id === abaAtiva));
    b.setAttribute('aria-label', a.nome);
    b.innerHTML = svg(a.icone);
    const nome = document.createElement('span');
    nome.className = 'nome-aba';
    nome.textContent = a.nome;
    b.append(nome);
    b.addEventListener('click', () => trocarAba(a.id));
    return b;
  }));
}

function trocarAba(id) {
  if (!ABAS.some(a => a.id === id)) return;
  abaAtiva = id;
  guardar(CHAVE.aba, id);
  desenharAbas();
  desenharPainel();
  $('painel').scrollTop = 0;
  const ativa = $('abas').querySelector('[aria-selected="true"]');
  if (ativa) ativa.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

function desenharPainel() {
  const lista = itensDaAba(abaAtiva);
  $('grade').replaceChildren(...lista.map(i => criarBotao(i)));
  const vazio = $('vazio');
  vazio.hidden = lista.length > 0;
  vazio.textContent = abaAtiva === 'inicio'
    ? 'Toque e segure um app e escolha “Fixar no Início”. Todos os apps ficam na gaveta ⌃.'
    : 'Nenhum app nesta aba. Na gaveta ⌃, toque e segure um app e escolha a aba.';
}

function desenharBarra() {
  const mapa = porChave();
  const lista = (barra || []).map(f => mapa.get(f)).filter(Boolean);
  if (!lista.length) {
    const dica = document.createElement('p');
    dica.className = 'dica';
    dica.textContent = 'Toque e segure um app e escolha “Pôr na barra”.';
    $('barra').replaceChildren(dica);
    return;
  }
  $('barra').replaceChildren(...lista.map(i => criarBotao(i)));
}

function desenhar() {
  desenharAbas();
  desenharPainel();
  desenharBarra();
  if (!$('gaveta').hidden) desenharGaveta();
  if ($('campo').value.trim()) sugerir();
}

/* ——— Gaveta: todos os apps de A a Z ——— */

const normalizar = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function desenharGaveta() {
  const termo = normalizar($('busca-gaveta').value);
  const lista = apps.filter(a => !termo || normalizar(a.nome).includes(termo));
  $('contagem').textContent = '· ' + apps.length;
  const mapa = porChave();
  const partes = [];
  let letra = '';
  let grade = null;
  for (const a of lista) {
    const inicial = normalizar(a.nome).slice(0, 1).toUpperCase() || '#';
    const l = /[A-Z]/.test(inicial) ? inicial : '#';
    if (l !== letra) {
      letra = l;
      const t = document.createElement('p');
      t.className = 'letra';
      t.textContent = l;
      grade = document.createElement('div');
      grade.className = 'grade';
      partes.push(t, grade);
    }
    grade.append(criarBotao(mapa.get('app:' + a.id)));
  }
  if (!partes.length) {
    const v = document.createElement('p');
    v.className = 'vazio';
    v.textContent = 'Nenhum app com “' + $('busca-gaveta').value.trim() + '”.';
    partes.push(v);
  }
  $('lista-gaveta').replaceChildren(...partes);
}

function abrirGaveta() {
  fecharSugestoes();
  $('gaveta').hidden = false;
  $('lista-gaveta').scrollTop = 0;
  desenharGaveta();
}

function fecharGaveta() {
  if ($('gaveta').hidden) return;
  $('gaveta').hidden = true;
  $('busca-gaveta').value = '';
  $('busca-gaveta').blur();
}

$('abrir-gaveta').addEventListener('click', abrirGaveta);
$('fechar-gaveta').addEventListener('click', fecharGaveta);
$('busca-gaveta').addEventListener('input', desenharGaveta);
$('busca-gaveta').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const termo = normalizar($('busca-gaveta').value);
  const a = termo && apps.find(x => normalizar(x.nome).includes(termo));
  if (a) abrir({ tipo: 'app', ...a });
});

/* ——— Gestos: subir abre a gaveta, descer fecha; de lado troca de aba ——— */

let gesto = null;
document.addEventListener('touchstart', e => {
  const t = e.touches[0];
  gesto = { x: t.clientX, y: t.clientY, alvo: e.target };
}, { passive: true });
document.addEventListener('touchend', e => {
  if (!gesto) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - gesto.x, dy = t.clientY - gesto.y;
  const alvo = gesto.alvo;
  gesto = null;
  if (!$('menu').hidden || !$('folha-foco').hidden) return;
  if (!$('gaveta').hidden) {
    if (dy > 90 && Math.abs(dx) < 70 && $('lista-gaveta').scrollTop <= 0) fecharGaveta();
    return;
  }
  if (alvo.closest('input, .abas, .sugestoes')) return;
  const noPainel = alvo.closest('.painel');
  if (noPainel && Math.abs(dx) > 70 && Math.abs(dy) < 50) {
    const i = ABAS.findIndex(a => a.id === abaAtiva);
    trocarAba(ABAS[(i + (dx < 0 ? 1 : -1) + ABAS.length) % ABAS.length].id);
    return;
  }
  if (!noPainel && dy < -70 && Math.abs(dx) < 60) abrirGaveta();
}, { passive: true });

/* ——— Barra de comando ——— */

const campo = $('campo');

// Aparecem quando a barra de comando está vazia e com o cursor.
const COMANDOS = [
  { texto: 'foco 25', ajuda: 'bloco de 25 min', faz: () => comecarBloco(25) },
  { texto: 'foco 45', ajuda: 'bloco de 45 min', faz: () => comecarBloco(45) },
  { texto: 'tarefa …', ajuda: 'define a tarefa de agora', faz: () => { campo.value = 'tarefa '; campo.focus(); sugerir(); } },
  { texto: 'clima', ajuda: 'atualiza o clima', faz: () => atualizarClima(true) },
  { texto: 'chuva', ajuda: 'satélite e radar, 30 × 30 km', faz: () => abrirCeu() },
  { texto: 'cidade …', ajuda: 'clima de uma cidade', faz: () => { campo.value = 'cidade '; campo.focus(); sugerir(); } },
  { texto: 'ci', ajuda: 'builds da Oficina', faz: () => abrirEndereco(ACTIONS) },
  { texto: 'gaveta', ajuda: 'todos os apps', faz: abrirGaveta },
  { texto: 'tema', ajuda: 'troca Nexo → Grafite → 3D', faz: () => trocarTema() },
  { texto: 'atualizar', ajuda: 'baixa a versão nova do Início', faz: () => atualizarInicio() }
];

function mostrarComandos() {
  $('sugestoes').replaceChildren(...COMANDOS.map(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'linha-comando';
    const t = document.createElement('b');
    t.textContent = c.texto;
    const a = document.createElement('span');
    a.textContent = c.ajuda;
    b.append(t, a);
    b.addEventListener('pointerdown', e => e.preventDefault());   // não perde o foco do campo
    b.addEventListener('click', () => {
      const continua = c.texto.endsWith('…');
      c.faz();
      if (!continua) limparComando();
    });
    return b;
  }));
  $('sugestoes').hidden = false;
}

function resultados(texto) {
  const termo = normalizar(texto);
  if (!termo) return [];
  const vistos = new Set();
  return itens()
    .filter(i => !(i.grupo === 'atalho' && instalado(i.pacote)))
    .map(i => ({ i, n: normalizar(i.nome) }))
    .filter(x => x.n.includes(termo) && !vistos.has(x.i.chave) && vistos.add(x.i.chave))
    .sort((a, b) => (b.n.startsWith(termo) - a.n.startsWith(termo)) ||
      a.i.nome.localeCompare(b.i.nome, 'pt-BR', { sensitivity: 'base' }))
    .slice(0, 30)
    .map(x => x.i);
}

// "foco 30", "tarefa revisar o PR", "gaveta", "dev"… Devolve true se era comando.
function executarComando(texto) {
  const t = texto.trim();
  let m = /^foco(?:\s+(\d{1,3}))?\s*m?$/i.exec(t);
  if (m) { comecarBloco(m[1] ? Number(m[1]) : bloco.min); return true; }
  m = /^tarefa\s+(.+)$/i.exec(t);
  if (m) { definirTarefa(m[1]); return true; }
  if (/^(gaveta|apps|todos)$/i.test(t)) { abrirGaveta(); return true; }
  if (/^pausar$/i.test(t)) { if (bloco.fim) alternarBloco(); return true; }
  m = /^cidade\s+(.+)$/i.exec(t);
  if (m) { buscarCidade(m[1]); return true; }
  if (/^(clima|tempo)$/i.test(t)) { atualizarClima(true); return true; }
  if (/^(chuva|radar|sat[eé]lite|c[eé]u)$/i.test(t)) { abrirCeu(); return true; }
  if (/^ci$/i.test(t)) { abrirEndereco(ACTIONS); return true; }
  if (/^atualiza/i.test(t)) { atualizarInicio(); return true; }
  m = /^tema(?:\s+(.+))?$/i.exec(t);
  if (m) { trocarTema(m[1] && normalizar(m[1])); return true; }
  if (/^notifica/i.test(t) && nativo && typeof nativo.pedirNotificacoes === 'function') { nativo.pedirNotificacoes(); return true; }
  const aba = ABAS.find(a => normalizar(a.nome) === normalizar(t));
  if (aba) { trocarAba(aba.id); return true; }
  return false;
}

function sugerir() {
  const texto = campo.value;
  if (!texto.trim()) return document.activeElement === campo ? mostrarComandos() : fecharSugestoes();
  const caixa = $('sugestoes');
  const especial = /^(tarefa|cidade)\s/i.test(texto);
  const achados = especial ? [] : resultados(texto);
  if (achados.length) {
    caixa.replaceChildren(...achados.map(i => criarBotao(i, true)));
  } else {
    const p = document.createElement('p');
    p.className = 'linha-vazia';
    p.textContent = /^tarefa\s/i.test(texto) ? 'Enter define a tarefa de agora.'
      : /^cidade\s/i.test(texto) ? 'Enter busca o clima dessa cidade.' : 'Nenhum app. Enter tenta como comando.';
    caixa.replaceChildren(p);
  }
  caixa.hidden = false;
}

function fecharSugestoes() {
  $('sugestoes').hidden = true;
}

function limparComando() {
  campo.value = '';
  fecharSugestoes();
  campo.blur();
}

campo.addEventListener('input', sugerir);
campo.addEventListener('focus', sugerir);
campo.addEventListener('blur', () => setTimeout(() => { if (!campo.value.trim()) fecharSugestoes(); }, 150));
$('comando').addEventListener('submit', e => {
  e.preventDefault();
  const texto = campo.value;
  if (!texto.trim()) return;
  if (executarComando(texto)) { limparComando(); return; }
  const primeiro = resultados(texto)[0];
  if (primeiro) { limparComando(); abrir(primeiro); }
});

/* ——— Agora: tarefa, passos pequenos e bloco de foco ——— */

const campoTarefa = $('tarefa');
let passos = ler(CHAVE.passos, []).filter(p => p && typeof p.t === 'string');
campoTarefa.value = ler(CHAVE.tarefa, '');

function definirTarefa(texto) {
  campoTarefa.value = texto.trim();
  guardar(CHAVE.tarefa, campoTarefa.value);
  desenharAgora();
}

campoTarefa.addEventListener('input', () => { guardar(CHAVE.tarefa, campoTarefa.value); desenharAgora(); });
campoTarefa.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('novo-passo').focus(); }
});

function desenharPassos() {
  $('passos').replaceChildren(...passos.map((p, i) => {
    const li = document.createElement('li');
    if (p.d) li.className = 'feito';
    const rotulo = document.createElement('label');
    const caixa = document.createElement('input');
    caixa.type = 'checkbox';
    caixa.checked = !!p.d;
    caixa.addEventListener('change', () => {
      passos[i].d = caixa.checked;
      guardar(CHAVE.passos, passos);
      desenharPassos();
    });
    const texto = document.createElement('span');
    texto.textContent = p.t;
    rotulo.append(caixa, texto);
    const tirar = document.createElement('button');
    tirar.type = 'button';
    tirar.className = 'tirar';
    tirar.textContent = '×';
    tirar.setAttribute('aria-label', 'Remover passo');
    tirar.addEventListener('click', () => {
      passos.splice(i, 1);
      guardar(CHAVE.passos, passos);
      desenharPassos();
    });
    li.append(rotulo, tirar);
    return li;
  }));
}

$('form-passo').addEventListener('submit', e => {
  e.preventDefault();
  const novo = $('novo-passo');
  const t = novo.value.trim();
  if (t) {
    passos.push({ t, d: false });
    guardar(CHAVE.passos, passos);
    desenharPassos();
  }
  novo.value = '';
});

/* O bloco guarda a hora do fim, não um contador: assim o tempo segue certo
   mesmo com a página fechada, e o APK avisa na hora (vibra, toca e notifica). */

let bloco = ler(CHAVE.bloco, null);
if (!bloco || !Number.isFinite(bloco.min) || bloco.min < 1 || bloco.min > 180) bloco = { min: 25, fim: null, resto: 25 * 60 };
let tique = null;

function restante() {
  if (!bloco.fim) return bloco.resto;
  return Math.max(0, Math.ceil((bloco.fim - Date.now()) / 1000));
}

const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

function desenharAgora() {
  const s = restante();
  const terminou = !bloco.fim && bloco.resto === 0;
  const tarefa = campoTarefa.value.trim();
  $('agora-tarefa').textContent = tarefa || 'Toque para escolher uma tarefa';
  $('agora-tarefa').classList.toggle('vazia', !tarefa);
  $('agora-tempo').textContent = terminou ? 'feito ✓' : (bloco.fim ? '' : '▶ ') + mmss(s);
  $('agora').classList.toggle('correndo', !!bloco.fim);
  $('agora').classList.toggle('terminou', terminou);

  $('tempo').textContent = mmss(s);
  $('bloco-comecar').textContent = bloco.fim ? 'Pausar' : 'Começar';
  for (const b of document.querySelectorAll('.duracoes button')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.min) === bloco.min));
  }
  $('bloco-estado').hidden = !terminou;
  $('bloco-estado').textContent = terminou ? 'Bloco terminado. Respire.' : '';
}

function andarBloco() {
  clearInterval(tique);
  tique = null;
  if (bloco.fim) {
    if (restante() === 0) return terminarBloco();
    tique = setInterval(() => { if (restante() === 0) terminarBloco(); else desenharAgora(); }, 1000);
  }
  desenharAgora();
}

function terminarBloco() {
  clearInterval(tique);
  tique = null;
  const avisar = bloco.fim !== null;
  if (avisar) registrarFoco(bloco.min);
  bloco.fim = null;
  bloco.resto = 0;
  guardar(CHAVE.bloco, bloco);
  desenharAgora();
  if (avisar && !temAvisoNativo && !document.hidden) avisarNaPagina();
}

function avisarNaPagina() {
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch (e) {}
}

function cancelarAvisoNativo() {
  if (temAvisoNativo) { try { nativo.cancelarAviso(); } catch (e) {} }
}

function alternarBloco() {
  if (bloco.fim) {
    bloco.resto = restante();
    bloco.fim = null;
    cancelarAvisoNativo();
  } else {
    if (bloco.resto === 0) bloco.resto = bloco.min * 60;
    bloco.fim = Date.now() + bloco.resto * 1000;
    if (temAvisoNativo) {
      try { nativo.avisarEm(bloco.resto, campoTarefa.value.trim()); } catch (e) {}
    }
  }
  guardar(CHAVE.bloco, bloco);
  andarBloco();
}

function comecarBloco(min) {
  const m = Math.min(180, Math.max(1, Math.round(min)));
  bloco = { min: m, fim: null, resto: m * 60 };
  cancelarAvisoNativo();
  alternarBloco();
}

$('bloco-comecar').addEventListener('click', alternarBloco);
for (const b of document.querySelectorAll('.duracoes button')) {
  b.addEventListener('click', () => {
    const min = Number(b.dataset.min);
    bloco = { min, fim: null, resto: min * 60 };
    cancelarAvisoNativo();
    guardar(CHAVE.bloco, bloco);
    andarBloco();
  });
}

$('agora').addEventListener('click', () => {
  $('folha-foco').hidden = false;
  if (!campoTarefa.value) setTimeout(() => campoTarefa.focus(), 50);
});

/* ——— Folhas: fechar tocando fora ou em "Fechar" ——— */

for (const fundo of document.querySelectorAll('.fundo-folha')) {
  fundo.addEventListener('click', e => {
    if (e.target === fundo || e.target.hasAttribute('data-fecha')) fecharFolha(fundo);
  });
}

function fecharFolha(fundo) {
  fundo.hidden = true;
  if (fundo.id === 'folha-ceu') pararCeu();
  if (document.activeElement) document.activeElement.blur();
  if (fundo.id === 'menu') itemDoMenu = null;
}

/* ——— Toque e toque longo ——— */

function ligarToque(botao, item) {
  let espera = null, longo = false, x0 = 0, y0 = 0;
  const cancelar = () => { clearTimeout(espera); espera = null; };

  botao.addEventListener('pointerdown', e => {
    longo = false;
    x0 = e.clientX; y0 = e.clientY;
    cancelar();
    espera = setTimeout(() => {
      espera = null;
      longo = true;
      if (navigator.vibrate) navigator.vibrate(15);
      abrirMenu(item);
    }, 500);
  });
  botao.addEventListener('pointermove', e => {
    if (espera && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) cancelar();
  });
  for (const tipo of ['pointerup', 'pointercancel', 'pointerleave']) botao.addEventListener(tipo, cancelar);
  botao.addEventListener('contextmenu', e => e.preventDefault());
  botao.addEventListener('click', e => {
    if (longo) { e.preventDefault(); longo = false; return; }
    abrir(item);
  });
}

/* ——— Menu do toque longo ——— */

function abrirMenu(item) {
  itemDoMenu = item;
  $('menu-nome').textContent = item.nome;
  const noInicio = favoritos.includes(item.chave);
  const naBarra = (barra || []).includes(item.chave);
  $('menu-inicio').textContent = noInicio ? 'Tirar do Início' : 'Fixar no Início';
  $('menu-barra').textContent = naBarra ? 'Tirar da barra' : barra.length >= MAX_BARRA ? 'Barra cheia (' + MAX_BARRA + ')' : 'Pôr na barra';
  $('menu-barra').disabled = !naBarra && barra.length >= MAX_BARRA;

  const ehApp = item.tipo === 'app';
  $('menu-abas').previousElementSibling.hidden = !ehApp;
  $('menu-abas').hidden = !ehApp;
  if (ehApp) {
    const atual = abaDoApp(item);
    const opcoes = [...ABAS.filter(a => a.id !== 'inicio'), { id: '', nome: 'Nenhuma', cor: '#b3a3cc' }];
    $('menu-abas').replaceChildren(...opcoes.map(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.nome;
      b.style.setProperty('--cor', a.cor);
      b.setAttribute('aria-pressed', String(a.id === atual));
      b.addEventListener('click', () => {
        abaDe[item.id] = a.id;
        guardar(CHAVE.abaDe, abaDe);
        fecharFolha($('menu'));
        desenhar();
      });
      return b;
    }));
  }
  $('menu-info').hidden = !(nativo && ehApp);
  $('menu').hidden = false;
}

function alternarEm(lista, chave, limite) {
  const pos = lista.indexOf(chave);
  if (pos >= 0) lista.splice(pos, 1);
  else if (!limite || lista.length < limite) lista.push(chave);
}

$('menu-inicio').addEventListener('click', () => {
  alternarEm(favoritos, itemDoMenu.chave);
  guardar(CHAVE.favoritos, favoritos);
  fecharFolha($('menu'));
  desenhar();
});
$('menu-barra').addEventListener('click', () => {
  alternarEm(barra, itemDoMenu.chave, MAX_BARRA);
  guardar(CHAVE.barra, barra);
  fecharFolha($('menu'));
  desenhar();
});
$('menu-info').addEventListener('click', () => {
  nativo.info(itemDoMenu.id);
  fecharFolha($('menu'));
});

/* ——— Aviso: virar a tela inicial ——— */

function atualizarAviso() {
  const aviso = $('aviso');
  let ehInicio = true;
  if (nativo) { try { ehInicio = nativo.ehInicio(); } catch (e) {} }
  if (nativo && ehInicio) { aviso.hidden = true; return; }

  const texto = document.createElement('p');
  if (nativo) {
    texto.textContent = 'Escolha o Início como tela inicial do celular.';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = 'Escolher';
    botao.addEventListener('click', () => nativo.escolherInicio());
    aviso.replaceChildren(texto, botao);
  } else {
    texto.textContent = 'Para virar a tela inicial do Android, instale o APK.';
    const link = document.createElement('a');
    link.href = APK;
    link.textContent = 'Baixar';
    aviso.replaceChildren(texto, link);
  }
  aviso.hidden = false;
}

/* ——— Mostrador: foco do dia, bateria, clima, sol e bolhas ——— */

function abrirEndereco(url) {
  if (nativo) nativo.abrirLink(url); else window.open(url, '_blank', 'noopener');
}

const hojeISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

// Arco de 270°, aberto embaixo, como no mostrador do relógio.
const ARCO = 2 * Math.PI * 42 * 0.75;
const VOLTA = 2 * Math.PI * 42;
for (const c of document.querySelectorAll('.anel circle')) {
  c.setAttribute('transform', 'rotate(135 50 50)');
  c.setAttribute('stroke-dasharray', ARCO.toFixed(1) + ' ' + VOLTA.toFixed(1));
}

function registrarFoco(min) {
  const dias = ler(CHAVE.focoDias, {});
  dias[hojeISO()] = (dias[hojeISO()] || 0) + min;
  // Só os últimos 60 dias.
  const chaves = Object.keys(dias).sort();
  for (const k of chaves.slice(0, Math.max(0, chaves.length - 60))) delete dias[k];
  guardar(CHAVE.focoDias, dias);
  desenharFoco();
}

function desenharFoco() {
  const dias = ler(CHAVE.focoDias, {});
  const min = dias[hojeISO()] || 0;
  $('arco-foco').setAttribute('stroke-dasharray', (ARCO * Math.min(1, min / META_FOCO)).toFixed(1) + ' ' + VOLTA.toFixed(1));
  $('arco-foco').classList.toggle('vazio', min === 0);
  const v = $('foco-min');
  v.replaceChildren(String(min));
  const unidade = document.createElement('small');
  unidade.textContent = 'min';
  v.append(unidade);
  // Sequência: dias seguidos com foco, contando hoje (ou ontem, se hoje ainda não teve).
  let seq = 0;
  const d = new Date();
  if (!dias[hojeISO()]) d.setDate(d.getDate() - 1);
  for (;;) {
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (!dias[k]) break;
    seq++;
    d.setDate(d.getDate() - 1);
  }
  $('foco-k').textContent = seq >= 2 ? '🔥 ' + seq + 'd' : 'foco';
}

$('anel-foco').addEventListener('click', () => $('agora').click());

// Bateria em 16 traços. No APK vem com a temperatura; no navegador, sem ela.
const N_TRACOS = 16;
$('tracos').innerHTML = Array.from({ length: N_TRACOS }, (_, i) => {
  const ang = (135 + i * (270 / (N_TRACOS - 1))) * Math.PI / 180;
  const x1 = (50 + 34 * Math.cos(ang)).toFixed(1), y1 = (50 + 34 * Math.sin(ang)).toFixed(1);
  const x2 = (50 + 44 * Math.cos(ang)).toFixed(1), y2 = (50 + 44 * Math.sin(ang)).toFixed(1);
  return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
}).join('');

function desenharBateria(b) {
  const ok = b && Number.isFinite(b.nivel);
  $('anel-bateria').hidden = false;
  const v = $('bat-v');
  v.replaceChildren(ok ? String(b.nivel) : '--');
  const pct = document.createElement('small');
  pct.textContent = '%';
  v.append(pct);
  const k = [];
  if (ok && b.carregando) k.push('⚡');
  if (ok && b.temperatura) k.push(Math.round(b.temperatura) + '°');
  $('bat-k').textContent = k.join(' ') || 'bateria';
  const acesos = ok ? Math.round(N_TRACOS * b.nivel / 100) : 0;
  const baixa = ok && b.nivel <= 20;
  $('tracos').querySelectorAll('line').forEach((l, i) => {
    l.setAttribute('class', i < acesos ? (baixa ? 'tr-baixa' : 'tr-on') : 'tr-off');
  });
}

function lerBateria() {
  if (nativo && typeof nativo.bateria === 'function') {
    try { return desenharBateria(JSON.parse(nativo.bateria())); } catch (e) {}
  }
  if (navigator.getBattery) {
    navigator.getBattery().then(b => desenharBateria({ nivel: Math.round(b.level * 100), carregando: b.charging }))
      .catch(() => desenharBateria(null));
  } else {
    desenharBateria(null);
  }
}

/* Clima pela Open-Meteo (grátis, sem chave). O lugar vem do GPS (aproximado)
   ou do comando "cidade NOME". A resposta fica guardada: sem rede, mostra a
   última, e só busca de novo depois de 30 minutos. */

const VALIDADE_CLIMA = 30 * 60 * 1000;
let buscandoClima = false;

function iconeDoTempo(codigo, ehDia) {
  if (codigo === 0) return ehDia ? '☀️' : '🌙';
  if (codigo <= 2) return ehDia ? '⛅' : '☁️';
  if (codigo === 3) return '☁️';
  if (codigo <= 48) return '🌫️';
  if (codigo <= 67) return '🌧️';
  if (codigo <= 77) return '❄️';
  if (codigo <= 82) return '🌦️';
  return '⛈️';
}

function descricaoUV(uv) {
  return uv >= 11 ? 'extremo' : uv >= 8 ? 'muito alto' : uv >= 6 ? 'alto' : uv >= 3 ? 'moderado' : 'baixo';
}

function hhmm(iso) {
  return typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : '--:--';
}

function desenharClima() {
  const guardado = ler(CHAVE.clima, null);
  const lugar = ler(CHAVE.lugar, null);
  const d = guardado && guardado.dados;
  if (!d || !d.current || !d.daily) {
    $('clima-agora').textContent = buscandoClima ? 'Buscando o clima…' :
      lugar ? 'Sem clima agora. Toque para tentar de novo.' : 'Toque para ver o clima (usa a localização)';
    $('clima-colunas').hidden = true;
    return;
  }
  const c = d.current;
  // Chuva e UV: o valor da hora atual na previsão de hora em hora.
  let i = d.hourly && d.hourly.time ? d.hourly.time.findIndex(t => t.slice(0, 13) === String(c.time).slice(0, 13)) : -1;
  if (i < 0) i = 0;
  const chuva = d.hourly && d.hourly.precipitation_probability ? d.hourly.precipitation_probability[i] : null;
  const uv = d.hourly && d.hourly.uv_index ? d.hourly.uv_index[i] : null;

  const linha = document.createElement('span');
  const icone = document.createElement('b');
  icone.className = 'tempo-icone';
  icone.textContent = iconeDoTempo(c.weather_code, c.is_day !== 0);
  const rotulo = document.createElement('span');
  rotulo.className = 'rotulo-agora';
  rotulo.textContent = 'Agora';
  const mm = document.createElement('span');
  mm.className = 'mm';
  mm.textContent = Math.round(d.daily.temperature_2m_max[0]) + '° / ' + Math.round(d.daily.temperature_2m_min[0]) + '°';
  linha.append(icone, ' ', rotulo, ' ' + Math.round(c.temperature_2m) + '° ', mm);
  if (lugar && lugar.nome) {
    const onde = document.createElement('span');
    onde.className = 'onde';
    onde.textContent = lugar.nome;
    linha.append(onde);
  }
  $('clima-agora').replaceChildren(linha);

  const colunas = [
    ['sens', '🌡️', Math.round(c.apparent_temperature) + '°', 'sensação'],
    ['chuva', '💧', chuva == null ? '--' : chuva + '%', 'chuva'],
    ['uv', '☀️', uv == null ? '--' : String(Math.round(uv)), uv == null ? 'UV' : 'UV ' + descricaoUV(uv)],
    ['vento', '🌬️', String(Math.round(c.wind_speed_10m)), 'km/h']
  ];
  $('clima-colunas').replaceChildren(...colunas.map(([classe, ic, v, k]) => {
    const col = document.createElement('span');
    col.className = 'col ' + classe + (classe === 'uv' && uv >= 6 ? ' alerta' : '');
    const a = document.createElement('i');
    a.textContent = ic;
    const b = document.createElement('b');
    b.textContent = v;
    const s = document.createElement('small');
    s.textContent = k;
    col.append(a, b, s);
    return col;
  }));
  $('clima-colunas').hidden = false;

  const nascer = document.createElement('b');
  nascer.className = 'sol-n';
  nascer.textContent = '◓';
  $('nascer').replaceChildren(nascer, ' ' + hhmm(d.daily.sunrise[0]));
  const por = document.createElement('b');
  por.className = 'sol-p';
  por.textContent = '◒';
  $('por').replaceChildren(hhmm(d.daily.sunset[0]) + ' ', por);
}

function urlClima(lugar) {
  return 'https://api.open-meteo.com/v1/forecast?latitude=' + lugar.lat.toFixed(3) + '&longitude=' + lugar.lon.toFixed(3) +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day' +
    '&hourly=precipitation_probability,uv_index' +
    '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset' +
    '&timezone=auto&forecast_days=1';
}

async function buscarClima(lugar) {
  buscandoClima = true;
  desenharClima();
  try {
    const resp = await fetch(urlClima(lugar));
    if (!resp.ok) throw new Error('clima ' + resp.status);
    const dados = await resp.json();
    if (!dados.current || !dados.daily) throw new Error('clima incompleto');
    guardar(CHAVE.clima, { quando: Date.now(), dados });
  } catch (e) {
    // Sem rede: fica o último clima guardado.
  }
  buscandoClima = false;
  desenharClima();
}

function atualizarClima(forcar) {
  const guardado = ler(CHAVE.clima, null);
  const lugar = ler(CHAVE.lugar, null);
  const velho = !guardado || Date.now() - guardado.quando > VALIDADE_CLIMA;
  if (!forcar && !velho) return;
  if (lugar && lugar.fonte === 'cidade') return buscarClima(lugar);
  if (!navigator.geolocation) { if (lugar) buscarClima(lugar); return; }
  // Sem pedir de novo à toa: só na primeira vez ou quando a pessoa toca.
  if (!lugar && !forcar) return desenharClima();
  navigator.geolocation.getCurrentPosition(pos => {
    const novo = { lat: pos.coords.latitude, lon: pos.coords.longitude, nome: '', fonte: 'gps' };
    guardar(CHAVE.lugar, novo);
    buscarClima(novo);
  }, () => {
    if (lugar) buscarClima(lugar);
    else {
      $('clima-agora').textContent = 'Sem localização. Digite “cidade” e o nome na barra.';
      $('clima-colunas').hidden = true;
    }
  }, { enableHighAccuracy: false, maximumAge: 3 * 60 * 60 * 1000, timeout: 15000 });
}

async function buscarCidade(nome) {
  $('clima-agora').textContent = 'Procurando ' + nome.trim() + '…';
  try {
    const resp = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=' + encodeURIComponent(nome.trim()));
    const dados = await resp.json();
    const r = dados.results && dados.results[0];
    if (!r) throw new Error('não achou');
    const lugar = { lat: r.latitude, lon: r.longitude, nome: r.name, fonte: 'cidade' };
    guardar(CHAVE.lugar, lugar);
    buscarClima(lugar);
  } catch (e) {
    $('clima-agora').textContent = 'Não achei “' + nome.trim() + '”. Tente outro nome.';
    $('clima-colunas').hidden = true;
  }
}

// Com o lugar conhecido, o clima abre a janela do céu; sem ele, pede a localização.
$('clima').addEventListener('click', () => {
  if (ler(CHAVE.lugar, null)) abrirCeu();
  else atualizarClima(true);
});

/* Bolhas: notificações, CI da Oficina, rede e armazenamento. */

let notificacoes = { permitido: false, total: 0, apps: {} };
const temNotificacoesNativas = !!(nativo && typeof nativo.notificacoes === 'function');

function lerNotificacoes() {
  if (!temNotificacoesNativas) return false;
  let novo = notificacoes;
  try { novo = JSON.parse(nativo.notificacoes()); } catch (e) {}
  if (!novo.apps) novo.apps = {};
  const mudou = JSON.stringify(novo) !== JSON.stringify(notificacoes);
  notificacoes = novo;
  return mudou;
}

const VALIDADE_CI = 15 * 60 * 1000;
async function atualizarCI() {
  const guardado = ler(CHAVE.ci, null);
  if (guardado && Date.now() - guardado.quando < VALIDADE_CI) return;
  try {
    const resp = await fetch('https://api.github.com/repos/gilsonbolivar-maker/Oficina/actions/runs?branch=main&per_page=1');
    if (!resp.ok) throw new Error('ci ' + resp.status);
    const run = (await resp.json()).workflow_runs[0];
    guardar(CHAVE.ci, { quando: Date.now(), estado: run.status, resultado: run.conclusion, sha: run.head_sha.slice(0, 7) });
  } catch (e) {
    // Sem rede ou limite do GitHub: fica o último.
  }
  desenharBolhas();
}

function bolha(classe, icone, texto, aoTocar, rotulo) {
  const b = document.createElement(aoTocar ? 'button' : 'span');
  if (aoTocar) { b.type = 'button'; b.addEventListener('click', aoTocar); }
  b.className = 'bolha ' + classe;
  if (rotulo) b.setAttribute('aria-label', rotulo);
  const i = document.createElement('b');
  i.textContent = icone;
  b.append(i, ' ' + texto);
  return b;
}

function textoGB(bytes) {
  const gb = bytes / 1e9;
  return (gb >= 10 ? Math.round(gb) : gb.toFixed(1).replace('.', ',')) + ' GB';
}

function desenharBolhas() {
  const lista = [];
  if (temNotificacoesNativas) {
    lista.push(notificacoes.permitido
      ? bolha('zap', '💬', String(notificacoes.total), null, notificacoes.total + ' notificações')
      : bolha('zap fraca', '💬', 'ligar', () => nativo.pedirNotificacoes(), 'Ligar a contagem de notificações'));
  }
  const ci = ler(CHAVE.ci, null);
  if (ci) {
    const [icone, texto, classe] = ci.estado !== 'completed' ? ['◌', 'CI rodando', 'ci-rodando']
      : ci.resultado === 'success' ? ['✓', 'CI', 'ci-ok'] : ['✗', 'CI', 'ci-falhou'];
    lista.push(bolha(classe, icone, texto, () => abrirEndereco(ACTIONS), 'Builds da Oficina: ' + (ci.resultado || ci.estado)));
  }
  let rede = null;
  if (nativo && typeof nativo.rede === 'function') { try { rede = JSON.parse(nativo.rede()); } catch (e) {} }
  if (rede && rede.tipo) {
    const barras = rede.nivel >= 0 ? '▂▄▆█'.slice(0, Math.max(1, rede.nivel)) : '';
    lista.push(bolha('rede', barras || '•', rede.tipo === 'wifi' ? 'Wi-Fi' : rede.tipo === 'movel' ? 'Dados' : 'sem rede'));
  } else {
    lista.push(bolha('rede', navigator.onLine ? '▂▄▆' : '•', navigator.onLine ? 'online' : 'sem rede'));
  }
  if (nativo && typeof nativo.armazenamento === 'function') {
    try {
      const a = JSON.parse(nativo.armazenamento());
      if (a.livre) lista.push(bolha('disco', '💾', textoGB(a.livre), null, textoGB(a.livre) + ' livres de ' + textoGB(a.total)));
    } catch (e) {}
  }
  lista.push(bolha('tema', '🎨', '', () => trocarTema(), 'Tema ' + TEMAS[temaAtual()].nome + ': tocar troca'));
  lista.push(chipVersao);
  $('bolhas').replaceChildren(...lista);
}

const chipVersao = $('chip-versao');

/* ——— Temas: Nexo (roxo e dourado), Grafite e 3D (os redesigns do Lovable) ——— */

const TEMAS = {
  nexo: { nome: 'Nexo', barras: '#14042a' },
  grafite: { nome: 'Grafite', barras: '#0e1418' },
  grafite3d: { nome: '3D', barras: '#0e1418' }
};
const ORDEM_TEMAS = ['nexo', 'grafite', 'grafite3d'];
const APELIDOS_TEMA = { '3d': 'grafite3d', 'grafite 3d': 'grafite3d', roxo: 'nexo' };

const temaAtual = () => TEMAS[document.documentElement.dataset.tema] ? document.documentElement.dataset.tema : 'nexo';

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', TEMAS[tema].barras);
  // No APK, as barras do Android (relógio em cima, navegação embaixo) acompanham.
  if (nativo && typeof nativo.corDasBarras === 'function') {
    try { nativo.corDasBarras(TEMAS[tema].barras); } catch (e) {}
  }
}

function trocarTema(qual) {
  const pedido = APELIDOS_TEMA[qual] || qual;
  const tema = TEMAS[pedido] ? pedido : ORDEM_TEMAS[(ORDEM_TEMAS.indexOf(temaAtual()) + 1) % ORDEM_TEMAS.length];
  guardar(CHAVE.tema, tema);
  aplicarTema(tema);
  desenharBolhas();
}

/* No tema 3D, o mostrador inclina com o dedo e com o movimento do celular. */
const mostrador = document.querySelector('.mostrador');
const semMovimento = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let inclinacaoBase = null;

function inclinar(x, y) {
  if (temaAtual() !== 'grafite3d' || semMovimento) { mostrador.style.transform = ''; return; }
  mostrador.style.transform = x || y ? 'perspective(1100px) rotateX(' + x.toFixed(1) + 'deg) rotateY(' + y.toFixed(1) + 'deg)' : '';
}

mostrador.addEventListener('pointermove', e => {
  const r = mostrador.getBoundingClientRect();
  inclinar(-((e.clientY - r.top) / r.height - 0.5) * 7, ((e.clientX - r.left) / r.width - 0.5) * 7);
});
for (const tipo of ['pointerleave', 'pointerup', 'pointercancel']) mostrador.addEventListener(tipo, () => inclinar(0, 0));

window.addEventListener('deviceorientation', e => {
  if (temaAtual() !== 'grafite3d' || e.beta == null || document.hidden) return;
  // O jeito como a pessoa segura vira o "reto"; o mostrador segue a diferença, até 6°.
  if (!inclinacaoBase) inclinacaoBase = { b: e.beta, g: e.gamma };
  inclinacaoBase.b += (e.beta - inclinacaoBase.b) * 0.02;
  inclinacaoBase.g += (e.gamma - inclinacaoBase.g) * 0.02;
  const lim = v => Math.max(-6, Math.min(6, v));
  inclinar(lim((e.beta - inclinacaoBase.b) * 0.4), lim((e.gamma - inclinacaoBase.g) * 0.4));
});

/* ——— Atualizar o Início ———
   O Início fica sempre aberto, então só pegaria a página nova ao reiniciar.
   O chip da versão confere no site; se houver versão nova, apaga a cópia
   guardada pelo service worker e recarrega. A cada poucas horas ele confere
   sozinho e acende o chip quando há novidade. */

const CHAVE_VISTA = 'inicio:versao-nova';
let atualizando = false;

function maior(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

async function versaoNoSite() {
  const resp = await fetch('app.js', { cache: 'no-store' });
  if (!resp.ok) throw new Error('site ' + resp.status);
  const m = /const VERSAO = '([\d.]+)'/.exec(await resp.text());
  if (!m) throw new Error('sem versão');
  return m[1];
}

function marcarChip(texto, classe) {
  chipVersao.querySelector('[data-versao]').textContent = texto;
  chipVersao.className = 'chip-versao' + (classe ? ' ' + classe : '');
}

async function atualizarInicio() {
  if (atualizando) return;
  atualizando = true;
  marcarChip('procurando…', 'girando');
  try {
    const nova = await versaoNoSite();
    if (!maior(nova, VERSAO)) {
      marcarChip('v' + VERSAO + ' ✓ em dia', 'em-dia');
      setTimeout(() => marcarChip('v' + VERSAO), 2500);
      atualizando = false;
      return;
    }
    marcarChip('baixando v' + nova + '…', 'girando');
    // Busca de novo, sem o cache do navegador, e joga fora a cópia antiga.
    await Promise.all(['./', 'index.html', 'app.css', 'app.js', 'sw.js'].map(u => fetch(u, { cache: 'reload' }).catch(() => {})));
    if (window.caches) {
      for (const nome of await caches.keys()) if (nome.startsWith('inicio-app-')) await caches.delete(nome);
    }
    if (navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update().catch(() => {});
    }
    location.reload();
  } catch (e) {
    marcarChip('sem rede', 'falhou');
    setTimeout(() => marcarChip('v' + VERSAO), 2500);
    atualizando = false;
  }
}

async function conferirVersao() {
  const ultima = ler(CHAVE_VISTA, null);
  if (ultima && Date.now() - ultima.quando < 3 * 60 * 60 * 1000) {
    if (maior(ultima.versao, VERSAO)) marcarChip('↻ v' + ultima.versao + ' nova', 'nova');
    return;
  }
  try {
    const nova = await versaoNoSite();
    guardar(CHAVE_VISTA, { quando: Date.now(), versao: nova });
    if (maior(nova, VERSAO)) marcarChip('↻ v' + nova + ' nova', 'nova');
  } catch (e) { /* sem rede: tenta depois */ }
}

chipVersao.addEventListener('click', atualizarInicio);

window.aoMudarNotificacoes = () => {
  clearTimeout(window.aoMudarNotificacoes.espera);
  window.aoMudarNotificacoes.espera = setTimeout(() => {
    if (lerNotificacoes()) { desenharBolhas(); desenhar(); }
  }, 400);
};

function atualizarMostrador() {
  lerBateria();
  lerNotificacoes();
  desenharBolhas();
  desenharFoco();
  desenharClima();
  atualizarClima(false);
  atualizarCI();
  if (!atualizando) conferirVersao();
}

// Enquanto o Início está na tela, renova bateria e bolhas a cada minuto.
setInterval(() => { if (!document.hidden) { lerBateria(); desenharBolhas(); atualizarClima(false); atualizarCI(); } }, 60000);

/* ——— Céu agora: satélite infravermelho e radar num quadro em volta de você ———
   Três camadas, alinhadas pelo mesmo centro e pelos mesmos quilômetros:
   - mapa do OpenStreetMap, escurecido, para saber onde é cada coisa;
   - infravermelho do GOES-19 (NASA GIBS, banda 13, a cada 10 min, ~1 h de
     atraso): mostra o topo das nuvens; as mais frias são as que crescem e chovem;
   - radar do RainViewer (grátis até o zoom 7): a chuva que já está caindo.
   A última hora anima em quadros. Tudo pelo navegador, sem chave. */

const GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
const RAINVIEWER = 'https://api.rainviewer.com/public/weather-maps.json';
const ZOOM_RADAR = 7;              // o máximo que o RainViewer dá de graça
const LADOS_KM = [30, 60, 100];
const CHAVE_CEU_KM = 'inicio:ceu-km';

const ceu = {
  km: LADOS_KM.includes(ler(CHAVE_CEU_KM, 30)) ? ler(CHAVE_CEU_KM, 30) : 30,
  mostrarIR: true,
  mostrarRadar: true,
  tocando: true,
  chuva: null,     // { antes, agora }: fração do quadro com chuva no radar
  ir: [],          // { hora: Date, url }
  radar: [],       // { hora: Date, url }
  i: 0,
  timer: null,
  pedido: 0        // descarta respostas antigas quando o lugar ou o lado muda
};

const metrosPorGrau = 111320;
const hhmmLocal = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function avisoCeu(texto) {
  $('ceu-aviso').textContent = texto || '';
  $('ceu-aviso').hidden = !texto;
}

// Carrega uma imagem e responde se deu certo (sem travar se o servidor não responder).
function carregarImagem(url, limite = 20000) {
  return new Promise(resolve => {
    const img = new Image();
    const fim = ok => { clearTimeout(t); img.onload = img.onerror = null; resolve(ok); };
    const t = setTimeout(() => fim(false), limite);
    img.onload = () => fim(img.naturalWidth > 0);
    img.onerror = () => fim(false);
    img.src = url;
  });
}

// Mapa de fundo: as peças do OpenStreetMap que cobrem o quadro.
function desenharMapaCeu(lugar, lado) {
  const caixa = $('ceu-mapa');
  const latR = lugar.lat * Math.PI / 180;
  const metrosPorPixelDesejado = ceu.km * 1000 / lado;
  const mpp = z => 156543.03 * Math.cos(latR) / Math.pow(2, z);
  const z = Math.max(3, Math.min(15, Math.round(Math.log2(156543.03 * Math.cos(latR) / metrosPorPixelDesejado))));
  const escala = mpp(z) / metrosPorPixelDesejado;
  const n = Math.pow(2, z) * 256;
  const cx = (lugar.lon + 180) / 360 * n;
  const cy = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n;
  const meio = lado / 2 / escala;
  const pecas = [];
  for (let tx = Math.floor((cx - meio) / 256); tx <= Math.floor((cx + meio) / 256); tx++) {
    for (let ty = Math.floor((cy - meio) / 256); ty <= Math.floor((cy + meio) / 256); ty++) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = 'https://tile.openstreetmap.org/' + z + '/' + ((tx % (n / 256)) + n / 256) % (n / 256) + '/' + ty + '.png';
      img.style.left = ((tx * 256 - (cx - meio)) * escala) + 'px';
      img.style.top = ((ty * 256 - (cy - meio)) * escala) + 'px';
      img.style.width = img.style.height = (256 * escala) + 'px';
      pecas.push(img);
    }
  }
  caixa.replaceChildren(...pecas);
}

function urlIR(lugar, hora) {
  const meioKm = ceu.km / 2;
  const dLat = meioKm * 1000 / metrosPorGrau;
  const dLon = dLat / Math.cos(lugar.lat * Math.PI / 180);
  // WMS 1.3.0 em EPSG:4326: a caixa vai em latitude, longitude.
  const bbox = [lugar.lat - dLat, lugar.lon - dLon, lugar.lat + dLat, lugar.lon + dLon].map(v => v.toFixed(4)).join(',');
  return GIBS + '?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=GOES-East_ABI_Band13_Clean_Infrared' +
    '&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:4326&WIDTH=512&HEIGHT=512&BBOX=' + bbox +
    '&TIME=' + hora.toISOString().slice(0, 16) + ':00Z';
}

// Os 6 quadros mais novos que já existem. O GIBS chega com atraso, então
// procura a partir de 40 min atrás e vai voltando até achar.
async function buscarIR(lugar, pedido) {
  const dez = 10 * 60 * 1000;
  let base = Math.floor((Date.now() - 40 * 60 * 1000) / dez) * dez;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const horas = Array.from({ length: 6 }, (_, k) => new Date(base - (5 - k) * dez));
    const ok = await Promise.all(horas.map(h => carregarImagem(urlIR(lugar, h))));
    if (pedido !== ceu.pedido) return;
    const achados = horas.filter((_, k) => ok[k]).map(h => ({ hora: h, url: urlIR(lugar, h) }));
    if (achados.length >= 2) { ceu.ir = achados; return; }
    base -= 60 * 60 * 1000;
  }
  ceu.ir = [];
}

/* Quanto do quadro tem chuva no radar: conta os pontos coloridos dentro do
   pedaço que aparece na janela. Precisa que o servidor deixe ler a imagem
   (CORS); se não deixar, responde null e a janela só não diz nada. */
function chuvaNoQuadro(url, lugar) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const larguraKm = 40075.016 * Math.cos(lugar.lat * Math.PI / 180) / Math.pow(2, ZOOM_RADAR);
        const lado = Math.max(4, Math.round(img.naturalWidth * ceu.km / larguraKm));
        const x0 = Math.round((img.naturalWidth - lado) / 2);
        const c = document.createElement('canvas');
        c.width = c.height = lado;
        const g = c.getContext('2d');
        g.drawImage(img, x0, x0, lado, lado, 0, 0, lado, lado);
        const px = g.getImageData(0, 0, lado, lado).data;
        let coloridos = 0;
        for (let i = 3; i < px.length; i += 4) if (px[i] > 40) coloridos++;
        resolve(coloridos / (lado * lado));
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function buscarRadar(lugar, pedido) {
  try {
    const resp = await fetch(RAINVIEWER, { cache: 'no-store' });
    const dados = await resp.json();
    const passado = (dados.radar && dados.radar.past) || [];
    const quadros = passado.slice(-6).map(q => ({
      hora: new Date(q.time * 1000),
      url: dados.host + q.path + '/512/' + ZOOM_RADAR + '/' + lugar.lat.toFixed(4) + '/' + lugar.lon.toFixed(4) + '/2/1_1.png'
    }));
    const ok = await Promise.all(quadros.map(q => carregarImagem(q.url)));
    if (pedido !== ceu.pedido) return;
    ceu.radar = quadros.filter((_, k) => ok[k]);
    // Olha o quadro mais novo e o mais velho: houve chuva na última hora?
    ceu.chuva = null;
    if (ceu.radar.length) {
      const medidas = await Promise.all([ceu.radar[0], ceu.radar[ceu.radar.length - 1]].map(q => chuvaNoQuadro(q.url, lugar)));
      if (pedido !== ceu.pedido) return;
      if (medidas.every(m => m !== null)) ceu.chuva = { antes: medidas[0], agora: medidas[1] };
    }
  } catch (e) {
    if (pedido === ceu.pedido) ceu.radar = [];
  }
}

// Diz em palavras o que o radar e o satélite trouxeram.
function descreverCeu() {
  const linhas = [];
  if (!ceu.radar.length) linhas.push('<b>Radar</b>: não consegui baixar agora.');
  else if (!ceu.chuva) linhas.push('<b>Radar</b>: ' + ceu.radar.length + ' quadros da última hora.');
  else if (ceu.chuva.agora === 0 && ceu.chuva.antes === 0) {
    linhas.push('<b>Radar</b>: sem chuva em ' + ceu.km + ' × ' + ceu.km + ' km na última hora. Se estiver chovendo aí, a região pode não ter radar no RainViewer; tente 100 km.');
  } else {
    const pct = Math.max(1, Math.round(ceu.chuva.agora * 100));
    const tendencia = ceu.chuva.agora > ceu.chuva.antes * 1.2 ? 'aumentando' : ceu.chuva.agora < ceu.chuva.antes * 0.8 ? 'diminuindo' : 'estável';
    linhas.push(ceu.chuva.agora === 0 ? '<b>Radar</b>: choveu na última hora, mas parou.'
      : '<b>Radar</b>: chuva em ' + pct + '% do quadro, ' + tendencia + '.');
  }
  if (!ceu.ir.length) linhas.push('<b>Satélite</b>: sem imagem agora.');
  else if (!ceu.mostrarIR) linhas.push('<b>Satélite</b>: desligado; toque em Infravermelho para ver as nuvens.');
  $('ceu-estado').innerHTML = linhas.join('<br>');
  $('ceu-estado').hidden = false;
}

// O radar vem num quadro bem maior (zoom 7: ~295 km de lado); amplia e centraliza.
function posicionarRadar(lugar, lado) {
  const larguraKm = 40075.016 * Math.cos(lugar.lat * Math.PI / 180) / Math.pow(2, ZOOM_RADAR);
  const px = lado * larguraKm / ceu.km;
  const r = $('ceu-radar');
  r.style.width = r.style.height = px + 'px';
  r.style.left = r.style.top = ((lado - px) / 2) + 'px';
}

function mostrarQuadro() {
  const ir = ceu.ir.length ? ceu.ir[ceu.i % ceu.ir.length] : null;
  const radar = ceu.radar.length ? ceu.radar[ceu.i % ceu.radar.length] : null;
  $('ceu-ir').hidden = !(ceu.mostrarIR && ir);
  if (ir && ceu.mostrarIR) $('ceu-ir').src = ir.url;
  $('ceu-radar').hidden = !(ceu.mostrarRadar && radar);
  if (radar && ceu.mostrarRadar) $('ceu-radar').src = radar.url;
  const partes = [];
  if (ir && ceu.mostrarIR) partes.push('sat ' + hhmmLocal(ir.hora));
  if (radar && ceu.mostrarRadar) partes.push('radar ' + hhmmLocal(radar.hora));
  $('ceu-hora').textContent = partes.join(' · ');
}

function animarCeu() {
  clearInterval(ceu.timer);
  ceu.timer = null;
  mostrarQuadro();
  const n = Math.max(ceu.ir.length, ceu.radar.length);
  if (!ceu.tocando || n < 2) return;
  ceu.timer = setInterval(() => { ceu.i = (ceu.i + 1) % n; mostrarQuadro(); }, 700);
}

function pararCeu() {
  clearInterval(ceu.timer);
  ceu.timer = null;
  ceu.pedido++;
}

function marcarBotoesCeu() {
  $('ceu-liga-ir').setAttribute('aria-pressed', String(ceu.mostrarIR));
  $('ceu-liga-radar').setAttribute('aria-pressed', String(ceu.mostrarRadar));
  $('ceu-tocar').textContent = ceu.tocando ? 'pausar' : 'tocar';
  for (const b of document.querySelectorAll('.ceu-km button')) b.setAttribute('aria-pressed', String(Number(b.dataset.km) === ceu.km));
  $('ceu-lado').textContent = ceu.km + ' × ' + ceu.km + ' km';
}

async function carregarCeu() {
  const lugar = ler(CHAVE.lugar, null);
  marcarBotoesCeu();
  $('ceu-mapa').replaceChildren();
  $('ceu-ir').hidden = $('ceu-radar').hidden = true;
  $('ceu-hora').textContent = '';
  $('ceu-estado').hidden = true;
  if (!lugar) {
    avisoCeu('Sem localização. Toque fora, toque no clima para permitir, ou digite “cidade” e o nome na barra.');
    return;
  }
  const lado = $('ceu').clientWidth || 340;
  const dezKm = lado * 10 / ceu.km;
  $('ceu-grade').style.backgroundSize = dezKm + 'px ' + dezKm + 'px';
  $('ceu').style.setProperty('--dez-km', dezKm + 'px');
  desenharMapaCeu(lugar, lado);
  posicionarRadar(lugar, lado);
  avisoCeu('Buscando satélite e radar…');
  const pedido = ++ceu.pedido;
  ceu.ir = []; ceu.radar = []; ceu.i = 0;
  await Promise.all([buscarIR(lugar, pedido), buscarRadar(lugar, pedido)]);
  if (pedido !== ceu.pedido) return;
  const faltas = [];
  if (!ceu.ir.length) faltas.push('satélite');
  if (!ceu.radar.length) faltas.push('radar');
  avisoCeu(faltas.length === 2 ? 'Sem satélite e sem radar agora. Confira a internet e toque em “tocar” mais tarde.'
    : faltas.length ? 'Sem ' + faltas[0] + ' agora; mostrando o outro.' : '');
  if (faltas.length === 1) setTimeout(() => { if (pedido === ceu.pedido) avisoCeu(''); }, 3000);
  descreverCeu();
  animarCeu();
}

function abrirCeu() {
  fecharSugestoes();
  $('folha-ceu').hidden = false;
  // Espera a folha aparecer para medir o tamanho do quadro.
  requestAnimationFrame(() => carregarCeu());
}

$('ceu-liga-ir').addEventListener('click', () => { ceu.mostrarIR = !ceu.mostrarIR; marcarBotoesCeu(); mostrarQuadro(); if (!$('ceu-estado').hidden) descreverCeu(); });
$('ceu-liga-radar').addEventListener('click', () => { ceu.mostrarRadar = !ceu.mostrarRadar; marcarBotoesCeu(); mostrarQuadro(); });
$('ceu-tocar').addEventListener('click', () => {
  ceu.tocando = !ceu.tocando;
  marcarBotoesCeu();
  if (ceu.tocando && !ceu.ir.length && !ceu.radar.length) carregarCeu(); else animarCeu();
});
for (const b of document.querySelectorAll('.ceu-km button')) {
  b.addEventListener('click', () => {
    ceu.km = Number(b.dataset.km);
    guardar(CHAVE_CEU_KM, ceu.km);
    carregarCeu();
  });
}
// Com a janela aberta, busca de novo a cada 10 minutos.
setInterval(() => { if (!$('folha-ceu').hidden && !document.hidden) carregarCeu(); }, 10 * 60 * 1000);

/* ——— Chamadas do APK ——— */

function fecharTudo() {
  for (const fundo of document.querySelectorAll('.fundo-folha')) if (!fundo.hidden) fecharFolha(fundo);
  fecharGaveta();
  limparComando();
}

// Voltou para o Início (depois de abrir um app, por exemplo).
window.aoVoltar = () => {
  agendarRelogio();
  atualizarAviso();
  andarBloco();
  const notas = lerNotificacoes();
  if (carregarApps() || notas) desenhar();
  atualizarMostrador();
};

// Botão de início apertado com o Início já na tela.
window.aoApertarInicio = () => {
  fecharTudo();
  $('painel').scrollTo({ top: 0, behavior: 'smooth' });
};

// Botão de voltar: fecha o que estiver aberto, um de cada vez.
window.aoVoltarBotao = () => {
  if (!$('menu').hidden) fecharFolha($('menu'));
  else if (!$('folha-foco').hidden) fecharFolha($('folha-foco'));
  else if (!$('folha-ceu').hidden) fecharFolha($('folha-ceu'));
  else if (!$('gaveta').hidden) fecharGaveta();
  else limparComando();
};

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { agendarRelogio(); andarBloco(); atualizarMostrador(); }
});

agendarRelogio();
desenharPassos();
andarBloco();
carregarApps();
if (!Array.isArray(barra)) barra = [];
lerNotificacoes();
aplicarTema(temaAtual());
desenhar();
atualizarAviso();
atualizarMostrador();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
