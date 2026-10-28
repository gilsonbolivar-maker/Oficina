/* ————————————————————————————————————————————————————————————
   Início: tela inicial para Android. Relógio, favoritos, os apps
   da Oficina e todos os apps do celular, com busca.
   A lista de apps vem do APK, pela ponte "InicioNativo". No
   navegador, mostra uma lista de exemplo.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.0.0';   // precisa casar com a VERSAO do sw.js
for (const lugar of document.querySelectorAll('[data-versao]')) lugar.textContent = 'v' + VERSAO;

const nativo = window.InicioNativo || null;
const SITE = 'https://gilsonbolivar-maker.github.io/Oficina/';
const APK = 'https://github.com/gilsonbolivar-maker/Oficina/releases/download/inicio-apk/inicio.apk';
const CHAVE_FAVORITOS = 'inicio:favoritos';

// Apps da Oficina. Os que têm APK abrem o APK, se estiver instalado.
const OFICINA = [
  { pasta: '', nome: 'Oficina', sigla: 'Of', cor: '#ffb020' },
  { pasta: 'alo', nome: 'Alô', sigla: 'Alô', cor: '#7cc4ff' },
  { pasta: 'britagem', nome: 'Britagem', sigla: 'Br', cor: '#f4a261', pacote: 'io.github.gilsonbolivar.britagem' },
  { pasta: 'agenda-telefonica', nome: 'Agenda', sigla: 'Ag', cor: '#6fdc9a' },
  { pasta: 'alarme-gps', nome: 'Alarme GPS', sigla: 'GPS', cor: '#ff7a6b', pacote: 'io.github.gilsonbolivar.alarmegps' },
  { pasta: 'sinal', nome: 'SINAL', sigla: 'S', cor: '#ffd166', pacote: 'io.github.gilsonbolivar.sinal' },
  { pasta: 'sinal-painel', nome: 'PAINEL', sigla: 'P', cor: '#e9c46a', pacote: 'io.github.gilsonbolivar.painel' },
  { pasta: 'camera-medida', nome: 'Câmera Medida', sigla: 'CM', cor: '#b39dff' },
  { pasta: 'camera-negativo', nome: 'Câmera Negativo', sigla: 'CN', cor: '#e8edf7' },
  { pasta: 'treino', nome: 'Treino', sigla: 'Tr', cor: '#9be15d' },
  { pasta: 'mensagem-efemera', nome: 'Mensagem Efêmera', sigla: 'ME', cor: '#ff9ecd' },
  { pasta: 'ura-ios', nome: 'IOs da URA', sigla: 'IO', cor: '#5ec8c8' }
];

const EXEMPLO = ['Câmera', 'Chrome', 'Configurações', 'Contatos', 'Galeria', 'Gmail',
  'Mapas', 'Mensagens', 'Relógio', 'Telefone', 'WhatsApp', 'YouTube'];

const $ = id => document.getElementById(id);
const campoBusca = $('busca');

let apps = [];          // { id, nome, pacote }
let assinaturaApps = '';
let favoritos = lerFavoritos();
let itemDoMenu = null;

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
    if (favoritos.length !== antes) salvarFavoritos();
  }
  return true;
}

function itens() {
  return [
    ...OFICINA.map(o => ({ chave: 'oficina:' + o.pasta, tipo: 'oficina', ...o })),
    ...apps.map(a => ({ chave: 'app:' + a.id, tipo: 'app', ...a }))
  ];
}

function abrir(item) {
  if (item.tipo === 'app') {
    if (nativo) nativo.abrir(item.id);
  } else {
    const instalado = item.pacote && apps.find(a => a.pacote === item.pacote);
    if (instalado && nativo) nativo.abrir(instalado.id);
    else if (nativo) nativo.abrirLink(SITE + (item.pasta ? item.pasta + '/' : ''));
    else location.href = '../' + (item.pasta ? item.pasta + '/' : '');
  }
  // Ao voltar para o Início, a busca já está limpa.
  setTimeout(limparBusca, 400);
}

/* ——— Favoritos ——— */

function lerFavoritos() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_FAVORITOS));
    return Array.isArray(lista) ? lista.filter(f => typeof f === 'string') : [];
  } catch (e) { return []; }
}

function salvarFavoritos() {
  try { localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify(favoritos)); } catch (e) {}
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

function corDoNome(nome) {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.codePointAt(0)) % 360;
  return 'hsl(' + h + ' 60% 70%)';
}

function criarIcone(item) {
  const el = document.createElement('span');
  el.className = 'icone sigla';
  if (item.tipo === 'oficina') {
    el.textContent = item.sigla;
    el.style.backgroundColor = item.cor;
  } else {
    el.textContent = item.nome.slice(0, 1).toUpperCase();
    el.style.backgroundColor = corDoNome(item.nome);
    if (nativo) {
      el.dataset.id = item.id;
      if (observador) observador.observe(el); else pedirIcone(el);
    }
  }
  return el;
}

/* ——— Desenho ——— */

function criarBotao(item, comTipo) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'app';
  b.append(criarIcone(item));
  const nome = document.createElement('span');
  nome.className = 'nome';
  nome.textContent = item.nome;
  b.append(nome);
  if (comTipo && item.tipo === 'oficina') {
    const tipo = document.createElement('span');
    tipo.className = 'tipo';
    tipo.textContent = 'Oficina';
    b.append(tipo);
  }
  ligarToque(b, item);
  return b;
}

function desenhar() {
  const porChave = new Map(itens().map(i => [i.chave, i]));

  const fav = favoritos.map(f => porChave.get(f)).filter(Boolean);
  $('favoritos').replaceChildren(...fav.map(i => criarBotao(i)));
  $('sem-favoritos').hidden = fav.length > 0;

  $('oficina').replaceChildren(...OFICINA.map(o => criarBotao(porChave.get('oficina:' + o.pasta))));

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
  salvarFavoritos();
  desenhar();
}

$('menu-fixar').addEventListener('click', () => {
  const pos = favoritos.indexOf(itemDoMenu.chave);
  if (pos >= 0) favoritos.splice(pos, 1); else favoritos.push(itemDoMenu.chave);
  salvarFavoritos();
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
  if (carregarApps()) desenhar();
};

// Botão de início apertado com o Início já na tela.
window.aoApertarInicio = () => {
  fecharMenu();
  limparBusca();
  campoBusca.blur();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Botão de voltar: fecha o que estiver aberto.
window.aoVoltarBotao = () => {
  if (!$('menu').hidden) fecharMenu();
  else if (campoBusca.value) limparBusca();
  else { campoBusca.blur(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
};

document.addEventListener('visibilitychange', () => { if (!document.hidden) agendarRelogio(); });

agendarRelogio();
carregarApps();
desenhar();
atualizarAviso();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
