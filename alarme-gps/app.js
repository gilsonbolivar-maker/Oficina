/* ————————————————————————————————————————————————————————————
   Alarme GPS — liga a tela, o armazenamento local, o rastreio de
   posição e a sirene.
   ———————————————————————————————————————————————————————————— */
'use strict';

(() => {

const CHAVE_PONTOS = 'alarme-gps:pontos';
const CHAVE_CONFIG = 'alarme-gps:config';

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

  segurarTela();
  clearInterval(relogio);
  relogio = setInterval(atualizarIdade, 1000);

  el.painel.hidden = false;
  el.vNome.textContent = p.nome;
  el.vRaio.textContent = formatarRaio(p.raio);
  el.vDistancia.textContent = '—';
  el.vBarra.style.width = '0%';
  definirEstado('Procurando o GPS…');
  renderizarLista();
  avisar('Vigiando. Deixe o app aberto na tela.');
}

function desarmar() {
  if (observador !== null) {
    navigator.geolocation.clearWatch(observador);
    observador = null;
  }
  clearInterval(relogio);
  relogio = null;
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
  el.avisoTela.textContent = s > 90
    ? 'O GPS parou de responder. A tela precisa ficar acesa e o app visível.'
    : (travaTela ? 'Tela travada acesa enquanto vigia.' : '');
}

/* ————————————————— disparo ————————————————— */

function disparar(p, d) {
  disparado = true;
  Alarme.tocar({ som: config.som, vibrar: config.vibrar });

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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* http:// local */ });
  });
}

/* ————————————————— arranque ————————————————— */

renderizarLista();
definirEstado('Nenhum ponto vigiado');
if (pontos.length) localizarAgora(true);

})();
