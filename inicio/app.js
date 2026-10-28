/* ————————————————————————————————————————————————————————————
   Início 2: tela inicial com a cara do Pixel Nexo (roxo noturno e
   dourado, abas de fichário, barra de comando, gaveta e barra fixa),
   mas com os apps de verdade do celular. Guarda o foco do Foco Dev:
   tarefa com passos pequenos e bloco de foco que avisa no fim.
   A lista de apps vem do APK, pela ponte "InicioNativo". No
   navegador, mostra uma lista de exemplo.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '2.0.0';   // precisa casar com a VERSAO do sw.js
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
  bloco: 'inicio:bloco'
};

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

/* ——— Relógio ——— */

function atualizarRelogio() {
  const agora = new Date();
  $('hora').textContent = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('data').textContent = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

let relogio = null;
function agendarRelogio() {
  clearTimeout(relogio);
  atualizarRelogio();
  relogio = setTimeout(agendarRelogio, 60000 - (Date.now() % 60000) + 50);
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

function criarBotao(item, comTipo) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'app';
  b.setAttribute('aria-label', item.nome);
  b.append(criarIcone(item));
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
  if (alvo.closest('input, .abas, .comandos, .sugestoes')) return;
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

const COMANDOS = [
  { texto: 'foco 25', faz: () => comecarBloco(25) },
  { texto: 'foco 45', faz: () => comecarBloco(45) },
  { texto: 'tarefa …', faz: () => { campo.value = 'tarefa '; campo.focus(); sugerir(); } },
  { texto: 'gaveta', faz: abrirGaveta },
  { texto: 'oficina', faz: () => trocarAba('oficina') }
];

$('comandos').replaceChildren(...COMANDOS.map(c => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = c.texto;
  b.addEventListener('click', c.faz);
  return b;
}));

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
  const aba = ABAS.find(a => normalizar(a.nome) === normalizar(t));
  if (aba) { trocarAba(aba.id); return true; }
  return false;
}

function sugerir() {
  const texto = campo.value;
  if (!texto.trim()) return fecharSugestoes();
  const caixa = $('sugestoes');
  const achados = /^tarefa\s/i.test(texto) ? [] : resultados(texto);
  if (achados.length) {
    caixa.replaceChildren(...achados.map(i => criarBotao(i, true)));
  } else {
    const p = document.createElement('p');
    p.className = 'linha-vazia';
    p.textContent = /^tarefa\s/i.test(texto) ? 'Enter define a tarefa de agora.' : 'Nenhum app. Enter tenta como comando.';
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
  if (carregarApps()) desenhar();
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
  else if (!$('gaveta').hidden) fecharGaveta();
  else limparComando();
};

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { agendarRelogio(); andarBloco(); }
});

agendarRelogio();
desenharPassos();
andarBloco();
carregarApps();
if (!Array.isArray(barra)) barra = [];
desenhar();
atualizarAviso();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
