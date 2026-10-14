/* ————————————————————————————————————————————————————————————
   Alarme GPS — liga a tela, o armazenamento local, o rastreio de
   posição e a sirene.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '2.3.0';   // precisa casar com a VERSAO do sw.js

// Versão sempre à vista: cada [data-versao] da página mostra a deste app.
for (const lugar of document.querySelectorAll('[data-versao]')) lugar.textContent = 'v' + VERSAO;

// Tema Escuro / Claro: o <head> já aplicou o salvo; aqui fica a troca pelos Ajustes.
(() => {
  const CHAVE_TEMA = 'alarme-gps:tema';
  const COR_BARRA = { escuro: '#0b1220', claro: '#f3f5f9' };
  const botoes = document.querySelectorAll('[data-tema-opcao]');

  function aplicarTema(tema) {
    if (tema !== 'claro') tema = 'escuro';
    document.documentElement.dataset.tema = tema;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COR_BARRA[tema]);
    for (const b of botoes) b.setAttribute('aria-pressed', String(b.dataset.temaOpcao === tema));
  }

  aplicarTema(document.documentElement.dataset.tema);
  for (const b of botoes) {
    b.addEventListener('click', () => {
      aplicarTema(b.dataset.temaOpcao);
      try { localStorage.setItem(CHAVE_TEMA, b.dataset.temaOpcao); } catch (e) { /* modo privado */ }
    });
  }
})();

(() => {

const CHAVE_PONTOS = 'alarme-gps:pontos';
const CHAVE_CONFIG = 'alarme-gps:config';

const CACHE_MAPA = 'alarme-gps-mapa-salvo';
const RAIO_OFFLINE = 1600;      // metros guardados em volta do ponto
const ZOOM_OFFLINE = [13, 16];  // do bairro inteiro até a esquina
const TETO_TILES = 200;         // nunca virar download em massa dos servidores do OSM
const PAUSA = 120;              // ms entre pedidos, para pegar leve com o servidor

const $ = id => document.getElementById(id);

const el = {
  raiz: document.documentElement,
  estado: $('estado'),
  // lista
  pontos: $('pontos'),
  vazio: $('vazio'),
  novo: $('btn-novo'),
  // painel de vigilância
  painel: $('painel-vigia'),
  vNome: $('vigia-nome'),
  vDistancia: $('vigia-distancia'),
  vBarra: $('vigia-barra'),
  vRaio: $('vigia-raio'),
  vPrecisao: $('vigia-precisao'),
  vIdade: $('vigia-idade'),
  avisoTela: $('aviso-tela'),
  desarmar: $('btn-desarmar'),
  // ajustes
  optSom: $('opt-som'),
  optVibrar: $('opt-vibrar'),
  optAviso: $('opt-aviso'),
  optTela: $('opt-tela'),
  testar: $('btn-testar'),
  instalar: $('btn-instalar'),
  // editor
  mapa: $('mapa'),
  mapaTiles: $('mapa-tiles'),
  busca: $('busca'),
  buscar: $('btn-buscar'),
  resultados: $('resultados'),
  nome: $('nome'),
  raio: $('raio'),
  raioValor: $('raio-valor'),
  coords: $('coords'),
  guardarMapa: $('btn-guardar-mapa'),
  offlineInfo: $('offline-info'),
  limparMapas: $('btn-limpar-mapas'),
  mais: $('btn-mais'),
  menos: $('btn-menos'),
  aqui: $('btn-aqui'),
  salvar: $('btn-salvar'),
  cancelar: $('btn-cancelar'),
  // alarme
  alarme: $('alarme'),
  aNome: $('alarme-nome'),
  aTexto: $('alarme-texto'),
  parar: $('btn-parar'),
  toast: $('toast')
};

/* ————————————————— armazenamento ————————————————— */

function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : padrao;
  } catch (e) {
    return padrao;
  }
}

function gravar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* modo privado */ }
}

let pontos = ler(CHAVE_PONTOS, []);
let config = Object.assign(
  { som: true, vibrar: true, aviso: true, tela: true },
  ler(CHAVE_CONFIG, {})
);

const salvarPontos = () => gravar(CHAVE_PONTOS, pontos);
const salvarConfig = () => gravar(CHAVE_CONFIG, config);

/* ————————————————— estado da vigilância ————————————————— */

let vigiado = null;          // id do ponto sendo vigiado
let observador = null;       // id do watchPosition
let ultimaPos = null;
let distanciaInicial = null;
let jaAvisou = false;
let disparado = false;
let travaTela = null;
let relogio = null;
let mapa = null;
let editando = null;         // ponto em edição (ou rascunho novo)
let promessaInstalar = null;

/* No app Android (APK), a página ganha window.AlarmeNativo: a vigilância passa
   para um serviço do sistema, que segue o GPS e toca com a tela apagada. */
const nativo = window.AlarmeNativo || null;
let vigiaNativa = false;     // o serviço do Android está vigiando este ponto

/* ————————————————— utilidades ————————————————— */

function formatarDistancia(m) {
  if (!isFinite(m)) return '—';
  if (m < 1000) return Math.round(m) + ' m';
  if (m < 10000) return (m / 1000).toFixed(2).replace('.', ',') + ' km';
  return (m / 1000).toFixed(1).replace('.', ',') + ' km';
}

function formatarRaio(m) {
  return m < 1000 ? m + ' m' : (m / 1000).toFixed(m % 1000 ? 1 : 0).replace('.', ',') + ' km';
}

let toastTimer = null;
function avisar(texto, ms = 3200) {
  el.toast.textContent = texto;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
}

function definirEstado(texto, classe = '') {
  el.estado.textContent = texto;
  el.estado.className = 'estado ' + classe;
}

const pontoPorId = id => pontos.find(p => p.id === id) || null;

/* ————————————————— lista de pontos ————————————————— */

function renderizarLista() {
  el.pontos.textContent = '';
  el.vazio.hidden = pontos.length > 0;

  for (const p of pontos) {
    const li = document.createElement('li');
    li.className = 'ponto' + (p.id === vigiado ? ' vigiado' : '');

    const info = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = p.nome;
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `avisa a ${formatarRaio(p.raio)} · ` +
      `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
    info.append(h, meta);

    const agora = document.createElement('span');
    agora.className = 'agora';
    if (ultimaPos) {
      const d = Mapa.distancia(ultimaPos.coords.latitude, ultimaPos.coords.longitude, p.lat, p.lon);
      agora.textContent = formatarDistancia(d);
    }

    const comandos = document.createElement('div');
    comandos.className = 'comandos';

    const bVigiar = document.createElement('button');
    bVigiar.type = 'button';
    bVigiar.className = 'botao ' + (p.id === vigiado ? 'perigo' : 'principal');
    bVigiar.textContent = p.id === vigiado ? 'Desarmar' : 'Vigiar';
    bVigiar.addEventListener('click', () => p.id === vigiado ? desarmar() : armar(p.id));

    const bEditar = document.createElement('button');
    bEditar.type = 'button';
    bEditar.className = 'botao discreto';
    bEditar.textContent = 'Editar';
    bEditar.addEventListener('click', () => abrirEditor(p));

    const bApagar = document.createElement('button');
    bApagar.type = 'button';
    bApagar.className = 'botao discreto';
    bApagar.textContent = 'Apagar';
    bApagar.addEventListener('click', () => {
      if (!confirm(`Apagar “${p.nome}”?`)) return;
      if (p.id === vigiado) desarmar();
      pontos = pontos.filter(x => x.id !== p.id);
      salvarPontos();
      renderizarLista();
    });

    comandos.append(bVigiar, bEditar, bApagar);
    li.append(info, agora, comandos);
    el.pontos.appendChild(li);
  }
}

/* ————————————————— vigilância ————————————————— */

function armar(id) {
  const p = pontoPorId(id);
  if (!p) return;
  if (!navigator.geolocation) {
    avisar('Este navegador não tem GPS disponível.');
    return;
  }

  Alarme.preparar();          // o toque do usuário libera o áudio
  Alarme.manterVivo(true);
  pedirNotificacao();

  vigiado = id;
  disparado = false;
  jaAvisou = false;
  distanciaInicial = null;

  if (observador !== null) navigator.geolocation.clearWatch(observador);
  observador = navigator.geolocation.watchPosition(aoPosicionar, aoErrarPosicao, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 30000
  });

  vigiaNativa = false;
  if (nativo) {
    try {
      vigiaNativa = nativo.vigiar(JSON.stringify({
        lat: p.lat, lon: p.lon, raio: p.raio, nome: p.nome,
        som: config.som, vibrar: config.vibrar, aviso: config.aviso
      }));
    } catch (e) { vigiaNativa = false; }
  }

  if (!vigiaNativa) segurarTela();
  clearInterval(relogio);
  relogio = setInterval(atualizarIdade, 1000);

  el.painel.hidden = false;
  el.vNome.textContent = p.nome;
  el.vRaio.textContent = formatarRaio(p.raio);
  el.vDistancia.textContent = '—';
  el.vBarra.style.width = '0%';
  definirEstado('Procurando o GPS…');
  renderizarLista();
  avisar(vigiaNativa
    ? 'Vigiando. Pode apagar a tela: o alarme toca mesmo assim.'
    : 'Vigiando. Deixe o app aberto na tela.');
}

function desarmar() {
  if (observador !== null) {
    navigator.geolocation.clearWatch(observador);
    observador = null;
  }
  clearInterval(relogio);
  relogio = null;
  if (vigiaNativa) { try { nativo.parar(); } catch (e) { /* ignora */ } }
  vigiaNativa = false;
  vigiado = null;
  disparado = false;
  distanciaInicial = null;
  Alarme.manterVivo(false);
  soltarTela();
  el.painel.hidden = true;
  definirEstado('Nenhum ponto vigiado');
  renderizarLista();
}

function aoPosicionar(pos) {
  ultimaPos = pos;
  if (mapa) mapa.definirEu(pos.coords.latitude, pos.coords.longitude);

  const p = pontoPorId(vigiado);
  if (!p) { renderizarLista(); return; }

  const d = Mapa.distancia(
    pos.coords.latitude, pos.coords.longitude, p.lat, p.lon);

  if (distanciaInicial === null) distanciaInicial = Math.max(d, p.raio + 1);

  el.vDistancia.textContent = formatarDistancia(d);
  el.vPrecisao.textContent = pos.coords.accuracy ? '±' + Math.round(pos.coords.accuracy) + ' m' : '—';
  const progresso = Math.max(0, Math.min(1,
    (distanciaInicial - d) / Math.max(1, distanciaInicial - p.raio)));
  el.vBarra.style.width = (progresso * 100).toFixed(1) + '%';
  definirEstado('Vigiando ' + p.nome, 'ativo');
  atualizarIdade();
  renderizarLista();

  if (!disparado && d <= p.raio) {
    disparar(p, d);
  } else if (!disparado && config.aviso && !jaAvisou && d <= p.raio * 2) {
    jaAvisou = true;
    Alarme.bipe();
    avisar('Está chegando: ' + formatarDistancia(d));
  } else if (d > p.raio * 2.5) {
    jaAvisou = false;
  }
}

function aoErrarPosicao(erro) {
  if (erro.code === erro.PERMISSION_DENIED) {
    definirEstado('Permissão de localização negada', 'erro');
    avisar('Libere a localização para este site nas permissões do navegador.', 5000);
    desarmar();
    return;
  }
  definirEstado(erro.code === erro.TIMEOUT ? 'Sem sinal de GPS…' : 'Posição indisponível…', 'erro');
}

function atualizarIdade() {
  if (!ultimaPos) { el.vIdade.textContent = '—'; return; }
  const s = Math.round((Date.now() - ultimaPos.timestamp) / 1000);
  el.vIdade.textContent = s < 60 ? `há ${s}s` : `há ${Math.round(s / 60)} min`;
  el.avisoTela.textContent = vigiaNativa
    ? 'O Android vigia mesmo com a tela apagada.'
    : s > 90
      ? 'O GPS parou de responder. A tela precisa ficar acesa e o app visível.'
      : (travaTela ? 'Tela travada acesa enquanto vigia.' : '');
}

/* ————————————————— disparo ————————————————— */

function disparar(p, d) {
  disparado = true;
  // Com o serviço do Android vigiando, o som é o alarme dele — não toca dois.
  if (!vigiaNativa) Alarme.tocar({ som: config.som, vibrar: config.vibrar });

  el.aNome.textContent = p.nome;
  el.aTexto.textContent = `Você está a ${formatarDistancia(d)} do ponto.`;
  el.alarme.hidden = false;
  definirEstado('ALARME — ' + p.nome, 'erro');
  notificar(p, d);
}

function pararAlarme() {
  Alarme.parar();
  el.alarme.hidden = true;
  if (disparado) {
    desarmar();
    avisar('Alarme desligado.');
  }
}

/**
 * O app Android chama isto ao voltar para a frente: o alarme pode ter tocado
 * (a página mostra a tela vermelha) ou ter sido parado pela notificação.
 */
window.aoVoltarDoNativo = () => {
  if (!vigiaNativa) return;
  let ativo = true, tocou = false;
  try { ativo = nativo.ativo(); tocou = nativo.disparado(); } catch (e) { return; }
  if (!ativo) {
    Alarme.parar();
    el.alarme.hidden = true;
    desarmar();
    return;
  }
  const p = pontoPorId(vigiado);
  if (tocou && !disparado && p) {
    disparado = true;
    el.aNome.textContent = p.nome;
    el.aTexto.textContent = 'Você chegou ao ponto.';
    el.alarme.hidden = false;
    definirEstado('ALARME — ' + p.nome, 'erro');
  }
};

function pedirNotificacao() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function notificar(p, d) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const corpo = `Você está a ${formatarDistancia(d)} do ponto.`;
  navigator.serviceWorker?.ready.then(reg => {
    reg.showNotification('Chegou: ' + p.nome, {
      body: corpo,
      icon: 'icones/icone-192.png',
      badge: 'icones/icone-192.png',
      tag: 'alarme-gps',
      renotify: true,
      requireInteraction: true,
      vibrate: [700, 250, 700, 250, 700]
    });
  }).catch(() => {
    try { new Notification('Chegou: ' + p.nome, { body: corpo }); } catch (e) { /* ignora */ }
  });
}

/* ————————————————— tela acesa ————————————————— */

async function segurarTela() {
  if (!config.tela || !('wakeLock' in navigator)) return;
  try {
    travaTela = await navigator.wakeLock.request('screen');
    travaTela.addEventListener('release', () => { travaTela = null; });
  } catch (e) {
    travaTela = null;
  }
}

function soltarTela() {
  if (travaTela) { travaTela.release().catch(() => {}); travaTela = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (vigiado) {
    segurarTela();
    Alarme.preparar();
  }
});

/* ————————————————— editor ————————————————— */

function abrirEditor(ponto) {
  editando = ponto || null;
  el.raiz.dataset.tela = 'editor';
  el.nome.value = ponto ? ponto.nome : '';
  el.raio.value = ponto ? ponto.raio : 300;
  el.busca.value = '';
  el.resultados.hidden = true;
  el.offlineInfo.className = 'offline-info';
  el.offlineInfo.textContent = 'Baixa o mapa num raio de 1,5 km para funcionar sem sinal.';
  atualizarRaio();

  if (!mapa) {
    mapa = Mapa.criar(el.mapa, el.mapaTiles, atualizarCoordenadas);
  }
  mapa.redesenhar();

  if (ponto) {
    mapa.irPara(ponto.lat, ponto.lon, 15);
  } else if (ultimaPos) {
    mapa.irPara(ultimaPos.coords.latitude, ultimaPos.coords.longitude, 15);
  } else {
    localizarAgora(true);
  }
}

function fecharEditor() {
  el.raiz.dataset.tela = 'lista';
  editando = null;
}

function atualizarCoordenadas(centro) {
  el.coords.textContent = `${centro.lat.toFixed(5)}, ${centro.lon.toFixed(5)}`;
}

function atualizarRaio(enquadrar) {
  const m = Number(el.raio.value);
  el.raioValor.textContent = formatarRaio(m);
  if (mapa) mapa.definirRaio(m, enquadrar === true);
}

function localizarAgora(silencioso) {
  if (!navigator.geolocation) return;
  if (!silencioso) avisar('Buscando sua posição…', 2000);
  navigator.geolocation.getCurrentPosition(pos => {
    ultimaPos = pos;
    if (mapa) {
      mapa.definirEu(pos.coords.latitude, pos.coords.longitude);
      mapa.irPara(pos.coords.latitude, pos.coords.longitude, 16);
    }
    renderizarLista();
  }, () => {
    if (!silencioso) avisar('Não consegui pegar sua posição agora.');
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
}

function guardarPonto() {
  const centro = mapa.centro();
  const raio = Number(el.raio.value);
  const nome = el.nome.value.trim() || 'Ponto ' + (pontos.length + 1);

  if (editando) {
    Object.assign(editando, { nome, raio, lat: centro.lat, lon: centro.lon });
  } else {
    pontos.push({
      id: 'p' + Date.now().toString(36),
      nome, raio,
      lat: centro.lat,
      lon: centro.lon,
      criadoEm: Date.now()
    });
  }
  salvarPontos();
  renderizarLista();
  fecharEditor();
  avisar('Ponto salvo.');
}

/* ————————————————— mapa guardado para uso offline ————————————————— */

const espera = ms => new Promise(r => setTimeout(r, ms));
let baixando = false;

/**
 * Baixa e guarda os pedaços do mapa em volta do ponto. São dezenas de
 * imagens, buscadas uma a uma e com pausa: o OpenStreetMap é servido por
 * doação e a política de uso não admite download em massa.
 */
async function guardarMapaDaArea() {
  if (!('caches' in window)) { avisar('Este navegador não guarda mapas.'); return; }
  if (baixando || !mapa) return;

  const centro = mapa.centro();
  const lista = Mapa.tilesDaArea(
    centro.lat, centro.lon, RAIO_OFFLINE, ZOOM_OFFLINE[0], ZOOM_OFFLINE[1], TETO_TILES);

  baixando = true;
  el.guardarMapa.disabled = true;
  el.offlineInfo.className = 'offline-info';
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});   // pede para o navegador não descartar
  }

  const cache = await caches.open(CACHE_MAPA);
  let guardados = 0;
  let falhas = 0;

  for (let i = 0; i < lista.length; i++) {
    el.offlineInfo.textContent = `Guardando ${i + 1} de ${lista.length}…`;
    try {
      if (await cache.match(lista[i])) { guardados++; continue; }
      const resp = await fetch(lista[i]);
      if (resp.ok) { await cache.put(lista[i], resp); guardados++; } else { falhas++; }
    } catch (e) {
      falhas++;
    }
    await espera(PAUSA);
  }

  baixando = false;
  el.guardarMapa.disabled = false;
  if (falhas) {
    el.offlineInfo.textContent =
      `Guardei ${guardados} de ${lista.length} pedaços. Tente de novo com sinal melhor.`;
  } else {
    el.offlineInfo.className = 'offline-info pronto';
    el.offlineInfo.textContent = `Pronto: ${guardados} pedaços do mapa disponíveis sem internet.`;
  }
  contarMapasGuardados();
}

async function contarMapasGuardados() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(CACHE_MAPA);
    const total = (await cache.keys()).length;
    el.limparMapas.hidden = total === 0;
    el.limparMapas.textContent = `Apagar mapas guardados (${total})`;
  } catch (e) { /* sem acesso ao cache */ }
}

async function apagarMapasGuardados() {
  if (!confirm('Apagar os mapas guardados para uso offline?')) return;
  await caches.delete(CACHE_MAPA);
  contarMapasGuardados();
  avisar('Mapas guardados apagados.');
}

/* ————————————————— busca de endereço ————————————————— */

async function buscarEndereco() {
  const termo = el.busca.value.trim();
  if (termo.length < 3) return;
  el.buscar.disabled = true;
  el.buscar.textContent = '…';
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=' +
      encodeURIComponent(termo);
    const resp = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    if (!resp.ok) throw new Error(resp.status);
    const lista = await resp.json();
    mostrarResultados(lista);
  } catch (e) {
    avisar('Busca indisponível — arraste o mapa até o ponto.');
  } finally {
    el.buscar.disabled = false;
    el.buscar.textContent = 'Buscar';
  }
}

function mostrarResultados(lista) {
  el.resultados.textContent = '';
  if (!lista.length) {
    avisar('Nada encontrado.');
    el.resultados.hidden = true;
    return;
  }
  for (const item of lista) {
    const li = document.createElement('li');
    li.textContent = item.display_name;
    li.addEventListener('click', () => {
      mapa.irPara(Number(item.lat), Number(item.lon), 16);
      el.resultados.hidden = true;
      if (!el.nome.value.trim()) {
        el.nome.value = item.display_name.split(',')[0];
      }
    });
    el.resultados.appendChild(li);
  }
  el.resultados.hidden = false;
}

/* ————————————————— ligações da interface ————————————————— */

el.novo.addEventListener('click', () => { Alarme.preparar(); abrirEditor(null); });
el.cancelar.addEventListener('click', fecharEditor);
el.salvar.addEventListener('click', guardarPonto);
el.desarmar.addEventListener('click', desarmar);
el.parar.addEventListener('click', pararAlarme);
el.raio.addEventListener('input', () => atualizarRaio(true));
el.mais.addEventListener('click', () => mapa.aproximar());
el.menos.addEventListener('click', () => mapa.afastar());
el.aqui.addEventListener('click', () => localizarAgora(false));
el.buscar.addEventListener('click', buscarEndereco);
el.guardarMapa.addEventListener('click', guardarMapaDaArea);
el.limparMapas.addEventListener('click', apagarMapasGuardados);
el.busca.addEventListener('keydown', ev => {
  if (ev.key === 'Enter') { ev.preventDefault(); el.busca.blur(); buscarEndereco(); }
});
el.testar.addEventListener('click', () => {
  Alarme.preparar();
  Alarme.tocar({ som: config.som, vibrar: config.vibrar });
  el.aNome.textContent = 'Teste';
  el.aTexto.textContent = 'É assim que o alarme vai tocar.';
  el.alarme.hidden = false;
});

// O iPhone e o iPad não têm a API de vibração: some com a opção por lá.
if (!navigator.vibrate) el.optVibrar.closest('.opcao').hidden = true;

const opcoes = [[el.optSom, 'som'], [el.optVibrar, 'vibrar'],
                [el.optAviso, 'aviso'], [el.optTela, 'tela']];
for (const [caixa, chave] of opcoes) {
  caixa.checked = config[chave];
  caixa.addEventListener('change', () => {
    config[chave] = caixa.checked;
    salvarConfig();
    if (chave === 'tela') caixa.checked ? segurarTela() : soltarTela();
  });
}

window.addEventListener('beforeunload', ev => {
  if (!vigiado) return;
  ev.preventDefault();
  ev.returnValue = '';
});

/* ————————————————— instalação e service worker ————————————————— */

window.addEventListener('beforeinstallprompt', ev => {
  ev.preventDefault();
  promessaInstalar = ev;
  el.instalar.hidden = false;
});

el.instalar.addEventListener('click', async () => {
  if (!promessaInstalar) return;
  promessaInstalar.prompt();
  await promessaInstalar.userChoice;
  promessaInstalar = null;
  el.instalar.hidden = true;
});

window.addEventListener('appinstalled', () => { el.instalar.hidden = true; });

// No Android, pelo navegador, oferece o APK, que vigia com a tela apagada.
if (!nativo && /Android/i.test(navigator.userAgent)) $('btn-apk').hidden = false;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* http:// local */ });
  });
}

/* ————————————————— arranque ————————————————— */

renderizarLista();
contarMapasGuardados();
definirEstado('Nenhum ponto vigiado');
if (pontos.length) localizarAgora(true);

})();
