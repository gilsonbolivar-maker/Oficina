/* ————————————————————————————————————————————————————————————
   Início: tela inicial calma para Android, unida ao Foco Dev.
   Uma tarefa por vez com passos pequenos, bloco de foco, modo
   foco, favoritos, atalhos (IA, Código, Organizar), os apps da
   Oficina e todos os apps do celular, com busca.
   A lista de apps vem do APK, pela ponte "InicioNativo". No
   navegador, mostra uma lista de exemplo.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.1.0';   // precisa casar com a VERSAO do sw.js
for (const lugar of document.querySelectorAll('[data-versao]')) lugar.textContent = 'v' + VERSAO;

const nativo = window.InicioNativo || null;
// APK 1.0.0 não tem o aviso nativo: aí a própria página vibra e apita.
const temAvisoNativo = !!(nativo && typeof nativo.avisarEm === 'function');
const SITE = 'https://gilsonbolivar-maker.github.io/Oficina/';
const APK = 'https://github.com/gilsonbolivar-maker/Oficina/releases/download/inicio-apk/inicio.apk';

const CHAVE = {
  favoritos: 'inicio:favoritos',
  foco: 'inicio:foco',
  tarefa: 'inicio:tarefa',
  passos: 'inicio:passos',
  bloco: 'inicio:bloco'
};

// Atalhos do Foco Dev. Se o app do serviço estiver instalado, abre o app.
const ATALHOS = [
  { grupo: 'IA', nome: 'Lovable', glifo: '❤', url: 'https://lovable.dev' },
  { grupo: 'IA', nome: 'ChatGPT', glifo: '◎', url: 'https://chat.openai.com', pacote: 'com.openai.chatgpt' },
  { grupo: 'IA', nome: 'Claude', glifo: '✳', url: 'https://claude.ai', pacote: 'com.anthropic.claude' },
  { grupo: 'IA', nome: 'Gemini', glifo: '✦', url: 'https://gemini.google.com', pacote: 'com.google.android.apps.bard' },
  { grupo: 'Código', nome: 'GitHub', glifo: '⌥', url: 'https://github.com', pacote: 'com.github.android' },
  { grupo: 'Código', nome: 'VS Code Web', glifo: '⌘', url: 'https://vscode.dev' },
  { grupo: 'Código', nome: 'Stack Overflow', glifo: '≡', url: 'https://stackoverflow.com' },
  { grupo: 'Organizar', nome: 'Notas', glifo: '✎', url: 'https://keep.google.com', pacote: 'com.google.android.keep' },
  { grupo: 'Organizar', nome: 'Agenda', glifo: '▦', url: 'https://calendar.google.com', pacote: 'com.google.android.calendar' }
];
const GRUPOS = ['IA', 'Código', 'Organizar'];

// Apps da Oficina. Os que têm APK abrem o APK, se estiver instalado.
const OFICINA = [
  { pasta: '', nome: 'Oficina', glifo: 'Of' },
  { pasta: 'alo', nome: 'Alô', glifo: 'Alô' },
  { pasta: 'britagem', nome: 'Britagem', glifo: 'Br', pacote: 'io.github.gilsonbolivar.britagem' },
  { pasta: 'agenda-telefonica', nome: 'Agenda Telefônica', glifo: 'Ag' },
  { pasta: 'alarme-gps', nome: 'Alarme GPS', glifo: 'GPS', pacote: 'io.github.gilsonbolivar.alarmegps' },
  { pasta: 'sinal', nome: 'SINAL', glifo: 'S', pacote: 'io.github.gilsonbolivar.sinal' },
  { pasta: 'sinal-painel', nome: 'PAINEL', glifo: 'P', pacote: 'io.github.gilsonbolivar.painel' },
  { pasta: 'camera-medida', nome: 'Câmera Medida', glifo: 'CM' },
  { pasta: 'camera-negativo', nome: 'Câmera Negativo', glifo: 'CN' },
  { pasta: 'treino', nome: 'Treino', glifo: 'Tr' },
  { pasta: 'mensagem-efemera', nome: 'Mensagem Efêmera', glifo: 'ME' },
  { pasta: 'ura-ios', nome: 'IOs da URA', glifo: 'IO' }
];

const EXEMPLO = ['Câmera', 'Chrome', 'Configurações', 'Contatos', 'Galeria', 'Gmail',
  'Mapas', 'Mensagens', 'Relógio', 'Telefone', 'WhatsApp', 'YouTube'];

const $ = id => document.getElementById(id);
const campoBusca = $('busca');

let apps = [];          // { id, nome, pacote }
let assinaturaApps = '';
let favoritos = ler(CHAVE.favoritos, []).filter(f => typeof f === 'string');
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

/* ——— Modo foco ——— */

function aplicarFoco(ligado) {
  if (ligado) document.documentElement.dataset.foco = '';
  else delete document.documentElement.dataset.foco;
  $('modo-foco').setAttribute('aria-pressed', String(ligado));
  $('modo-foco').textContent = ligado ? 'Mostrar tudo' : 'Modo foco';
  if (ligado) limparBusca();
}

$('modo-foco').addEventListener('click', () => {
  const ligado = !('foco' in document.documentElement.dataset);
  try { localStorage.setItem(CHAVE.foco, ligado ? '1' : '0'); } catch (e) {}
  aplicarFoco(ligado);
});

/* ——— Agora estou fazendo: uma tarefa, passos pequenos ——— */

const campoTarefa = $('tarefa');
let passos = ler(CHAVE.passos, []).filter(p => p && typeof p.t === 'string');
campoTarefa.value = ler(CHAVE.tarefa, '');

campoTarefa.addEventListener('input', () => guardar(CHAVE.tarefa, campoTarefa.value));
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
  const campo = $('novo-passo');
  const t = campo.value.trim();
  if (t) {
    passos.push({ t, d: false });
    guardar(CHAVE.passos, passos);
    desenharPassos();
  }
  campo.value = '';
});

/* ——— Bloco de foco ———
   Guarda a hora do fim, não um contador: assim o tempo segue certo mesmo
   com a página fechada, e o APK avisa na hora (vibra, toca e notifica). */

let bloco = ler(CHAVE.bloco, null);
if (!bloco || ![15, 25, 45].includes(bloco.min)) bloco = { min: 25, fim: null, resto: 25 * 60 };
let tique = null;

function restante() {
  if (!bloco.fim) return bloco.resto;
  return Math.max(0, Math.ceil((bloco.fim - Date.now()) / 1000));
}

function desenharBloco() {
  const s = restante();
  $('tempo').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  $('bloco-comecar').textContent = bloco.fim ? 'Pausar' : 'Começar';
  for (const b of document.querySelectorAll('.duracoes button')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.min) === bloco.min));
  }
  const terminou = !bloco.fim && bloco.resto === 0;
  document.querySelector('.bloco').classList.toggle('terminou', terminou);
  $('bloco-estado').hidden = !terminou;
  $('bloco-estado').textContent = terminou ? 'Bloco terminado. Respire.' : '';
}

function andarBloco() {
  clearInterval(tique);
  tique = null;
  if (bloco.fim) {
    if (restante() === 0) return terminarBloco();
    tique = setInterval(() => { if (restante() === 0) terminarBloco(); else desenharBloco(); }, 1000);
  }
  desenharBloco();
}

function terminarBloco() {
  clearInterval(tique);
  tique = null;
  const avisar = bloco.fim !== null;
  bloco.fim = null;
  bloco.resto = 0;
  guardar(CHAVE.bloco, bloco);
  desenharBloco();
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

$('bloco-comecar').addEventListener('click', () => {
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
});

for (const b of document.querySelectorAll('.duracoes button')) {
  b.addEventListener('click', () => {
    const min = Number(b.dataset.min);
    bloco = { min, fim: null, resto: min * 60 };
    cancelarAvisoNativo();
    guardar(CHAVE.bloco, bloco);
    andarBloco();
  });
}

/* ——— Apps ——— */

function carregarApps() {
  let lista = [];
  if (nativo) {
    try { lista = JSON.parse(nativo.apps()); } catch (e) { lista = []; }
  } else {
    lista = EXEMPLO.map(nome => ({ id: 'exemplo/' + nome, nome, pacote: 'exemplo' }));
  }
  lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  const assinatura = JSON.stringify(lista);
  if (assinatura === assinaturaApps) return false;
  assinaturaApps = assinatura;
  apps = lista;

  // App desinstalado sai dos favoritos.
  if (nativo && apps.length) {
    const ids = new Set(apps.map(a => 'app:' + a.id));
    const antes = favoritos.length;
    favoritos = favoritos.filter(f => !f.startsWith('app:') || ids.has(f));
    if (favoritos.length !== antes) guardar(CHAVE.favoritos, favoritos);
  }
  return true;
}

function itens() {
  return [
    ...ATALHOS.map(a => ({ chave: 'atalho:' + a.nome, tipo: 'link', ...a })),
    ...OFICINA.map(o => ({ chave: 'oficina:' + o.pasta, tipo: 'link', grupo: 'Oficina', ...o })),
    ...apps.map(a => ({ chave: 'app:' + a.id, tipo: 'app', ...a }))
  ];
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
    const instalado = nativo && item.pacote && apps.find(a => a.pacote === item.pacote);
    if (instalado) nativo.abrir(instalado.id);
    else if (nativo) nativo.abrirLink(enderecoDe(item));
    else if (item.url) window.open(item.url, '_blank', 'noopener');
    else location.href = enderecoDe(item);
  }
  // Ao voltar para o Início, a busca já está limpa.
  setTimeout(limparBusca, 400);
}

/* ——— Ícones ——— */

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
  el.classList.add('carregado');
  el.textContent = '';
}

function criarIcone(item) {
  const el = document.createElement('span');
  el.className = 'icone';
  if (item.tipo === 'link') {
    el.classList.add('glifo');
    el.textContent = item.glifo;
  } else {
    el.textContent = item.nome.slice(0, 1).toUpperCase();
    if (nativo) {
      el.dataset.id = item.id;
      if (observador) observador.observe(el); else pedirIcone(el);
    }
  }
  return el;
}

/* ——— Desenho ——— */

function criarNome(item) {
  const nome = document.createElement('span');
  nome.className = 'nome';
  nome.textContent = item.nome;
  return nome;
}

// Ícone com nome embaixo (favoritos) ou ao lado (lista e busca).
function criarBotao(item, comTipo) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'app';
  b.append(criarIcone(item), criarNome(item));
  if (comTipo && item.tipo === 'link') {
    const tipo = document.createElement('span');
    tipo.className = 'tipo';
    tipo.textContent = item.grupo;
    b.append(tipo);
  }
  ligarToque(b, item);
  return b;
}

// Ladrilho do Foco Dev: símbolo verde-água sobre o cartão.
function criarLadrilho(item) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ladrilho';
  const glifo = document.createElement('span');
  glifo.className = 'glifo';
  glifo.textContent = item.glifo;
  b.append(glifo, criarNome(item));
  ligarToque(b, item);
  return b;
}

function desenhar() {
  const todos = itens();
  const porChave = new Map(todos.map(i => [i.chave, i]));

  const fav = favoritos.map(f => porChave.get(f)).filter(Boolean);
  $('favoritos').replaceChildren(...fav.map(i => criarBotao(i)));
  $('sem-favoritos').hidden = fav.length > 0;

  $('atalhos').replaceChildren(...GRUPOS.map(g => {
    const secao = document.createElement('section');
    const titulo = document.createElement('h2');
    titulo.textContent = g;
    const grade = document.createElement('div');
    grade.className = 'ladrilhos';
    grade.append(...todos.filter(i => i.tipo === 'link' && i.grupo === g).map(criarLadrilho));
    secao.append(titulo, grade);
    return secao;
  }));

  $('oficina').replaceChildren(...todos.filter(i => i.grupo === 'Oficina').map(criarLadrilho));

  $('todos').replaceChildren(...apps.map(a => criarBotao(porChave.get('app:' + a.id))));
  $('contagem').textContent = apps.length ? '· ' + apps.length : '';

  if (campoBusca.value) buscar();
}

/* ——— Busca ——— */

const normalizar = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function resultados() {
  const termo = normalizar(campoBusca.value);
  return itens()
    .map(i => ({ i, n: normalizar(i.nome) }))
    .filter(x => x.n.includes(termo))
    .sort((a, b) => (b.n.startsWith(termo) - a.n.startsWith(termo)) ||
      a.i.nome.localeCompare(b.i.nome, 'pt-BR', { sensitivity: 'base' }))
    .map(x => x.i);
}

function buscar() {
  const tem = campoBusca.value.trim() !== '';
  $('inicio').hidden = tem;
  $('resultados').hidden = !tem;
  if (!tem) return;
  const achados = resultados();
  if (achados.length) {
    $('resultados').replaceChildren(...achados.map(i => criarBotao(i, true)));
  } else {
    const vazio = document.createElement('p');
    vazio.className = 'vazio';
    vazio.textContent = 'Nenhum app com “' + campoBusca.value.trim() + '”.';
    $('resultados').replaceChildren(vazio);
  }
}

function limparBusca() {
  if (!campoBusca.value) return;
  campoBusca.value = '';
  buscar();
}

campoBusca.addEventListener('input', buscar);
campoBusca.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const primeiro = campoBusca.value.trim() && resultados()[0];
  if (primeiro) { campoBusca.blur(); abrir(primeiro); }
});

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

/* ——— Menu ——— */

function abrirMenu(item) {
  itemDoMenu = item;
  const pos = favoritos.indexOf(item.chave);
  $('menu-nome').textContent = item.nome;
  $('menu-fixar').textContent = pos >= 0 ? 'Tirar dos favoritos' : 'Fixar nos favoritos';
  $('menu-esquerda').hidden = pos <= 0;
  $('menu-direita').hidden = pos < 0 || pos === favoritos.length - 1;
  $('menu-info').hidden = !(nativo && item.tipo === 'app');
  $('menu').hidden = false;
}

function fecharMenu() {
  $('menu').hidden = true;
  itemDoMenu = null;
}

function moverFavorito(passo) {
  const pos = favoritos.indexOf(itemDoMenu.chave);
  const destino = pos + passo;
  if (pos < 0 || destino < 0 || destino >= favoritos.length) return;
  [favoritos[pos], favoritos[destino]] = [favoritos[destino], favoritos[pos]];
  guardar(CHAVE.favoritos, favoritos);
  desenhar();
}

$('menu-fixar').addEventListener('click', () => {
  const pos = favoritos.indexOf(itemDoMenu.chave);
  if (pos >= 0) favoritos.splice(pos, 1); else favoritos.push(itemDoMenu.chave);
  guardar(CHAVE.favoritos, favoritos);
  fecharMenu();
  desenhar();
});
$('menu-esquerda').addEventListener('click', () => { moverFavorito(-1); fecharMenu(); });
$('menu-direita').addEventListener('click', () => { moverFavorito(1); fecharMenu(); });
$('menu-info').addEventListener('click', () => { nativo.info(itemDoMenu.id); fecharMenu(); });
$('menu-fechar').addEventListener('click', fecharMenu);
$('menu').addEventListener('click', e => { if (e.target === $('menu')) fecharMenu(); });

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

// Voltou para o Início (depois de abrir um app, por exemplo).
window.aoVoltar = () => {
  agendarRelogio();
  atualizarAviso();
  andarBloco();
  if (carregarApps()) desenhar();
};

// Botão de início apertado com o Início já na tela.
window.aoApertarInicio = () => {
  fecharMenu();
  limparBusca();
  document.activeElement && document.activeElement.blur();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Botão de voltar: fecha o que estiver aberto.
window.aoVoltarBotao = () => {
  if (!$('menu').hidden) fecharMenu();
  else if (campoBusca.value) limparBusca();
  else {
    document.activeElement && document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { agendarRelogio(); andarBloco(); }
});

aplicarFoco('foco' in document.documentElement.dataset);
agendarRelogio();
desenharPassos();
andarBloco();
carregarApps();
desenhar();
atualizarAviso();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
