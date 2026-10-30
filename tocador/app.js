/* ————————————————————————————————————————————————————————————
   Tocador — lê uma pasta de música escolhida no aparelho e toca as
   faixas, com Media Session (controles na notificação do navegador)
   e uma ponte opcional para o app Android (window.TocadorNativo).
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.0.0';   // precisa casar com a VERSAO do sw.js

for (const lugar of document.querySelectorAll('[data-versao]')) lugar.textContent = 'v' + VERSAO;

const estado = document.getElementById('estado');
const entradaPasta = document.getElementById('entrada-pasta');
const btnEscolher = document.getElementById('btn-escolher');
const vazio = document.getElementById('vazio');
const listaFaixas = document.getElementById('lista-faixas');
const painelTocador = document.getElementById('painel-tocador');
const infoTitulo = document.getElementById('info-titulo');
const infoSub = document.getElementById('info-sub');
const tempoAtual = document.getElementById('tempo-atual');
const tempoTotal = document.getElementById('tempo-total');
const barraProgresso = document.getElementById('barra-progresso');
const btnTocar = document.getElementById('btn-tocar');
const btnAnterior = document.getElementById('btn-anterior');
const btnProxima = document.getElementById('btn-proxima');
const btnAleatorio = document.getElementById('btn-aleatorio');
const btnRepetir = document.getElementById('btn-repetir');
const audio = document.getElementById('audio');

let faixas = [];        // [{nome, arquivo, url}]
let indiceAtual = -1;
let aleatorio = false;
let repetir = false;
let arrastandoBarra = false;

/* ——— escolher a pasta ——— */

btnEscolher.addEventListener('click', () => entradaPasta.click());

entradaPasta.addEventListener('change', () => {
  const arquivos = Array.from(entradaPasta.files || []).filter(ehAudio);
  if (arquivos.length === 0) {
    estado.textContent = 'Nenhuma música encontrada nessa pasta';
    return;
  }
  arquivos.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  faixas.forEach(f => { try { URL.revokeObjectURL(f.url); } catch (e) {} });
  faixas = arquivos.map(arquivo => ({
    nome: nomeSemExtensao(arquivo.name),
    arquivo,
    url: URL.createObjectURL(arquivo)
  }));
  montarLista();
  estado.textContent = faixas.length + (faixas.length === 1 ? ' música encontrada' : ' músicas encontradas');
  vazio.hidden = true;
  listaFaixas.hidden = false;
  tocarIndice(0);
});

function ehAudio(arquivo) {
  if (arquivo.type && arquivo.type.startsWith('audio/')) return true;
  return /\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|wma)$/i.test(arquivo.name);
}

function nomeSemExtensao(nome) {
  return nome.replace(/\.[^.]+$/, '');
}

function montarLista() {
  listaFaixas.innerHTML = '';
  faixas.forEach((f, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="num">' + (i + 1) + '</span>' +
      '<span class="nome">' + escaparHtml(f.nome) + '</span>' +
      '<span class="marca" hidden>♪</span>';
    li.addEventListener('click', () => tocarIndice(i));
    listaFaixas.appendChild(li);
  });
}

function escaparHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ——— tocar ——— */

function tocarIndice(i) {
  if (i < 0 || i >= faixas.length) return;
  indiceAtual = i;
  const f = faixas[i];
  audio.src = f.url;
  audio.play().catch(() => {});
  atualizarDestaque();
  atualizarInfo();
}

function atualizarDestaque() {
  [...listaFaixas.children].forEach((li, i) => {
    const marcado = i === indiceAtual;
    li.setAttribute('aria-current', String(marcado));
    li.querySelector('.marca').hidden = !marcado;
  });
}

function atualizarInfo() {
  const f = faixas[indiceAtual];
  if (!f) return;
  infoTitulo.textContent = f.nome;
  infoSub.textContent = 'Faixa ' + (indiceAtual + 1) + ' de ' + faixas.length;
  painelTocador.hidden = false;

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: f.nome,
      artist: 'Tocador',
      album: ''
    });
  }
  avisarNativo();
}

function proxima() {
  if (faixas.length === 0) return;
  if (aleatorio) {
    tocarIndice(Math.floor(Math.random() * faixas.length));
  } else if (indiceAtual + 1 < faixas.length) {
    tocarIndice(indiceAtual + 1);
  } else if (repetir) {
    tocarIndice(0);
  }
}

function anterior() {
  if (faixas.length === 0) return;
  if (indiceAtual > 0) tocarIndice(indiceAtual - 1);
  else tocarIndice(0);
}

btnTocar.addEventListener('click', () => {
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
});
btnAnterior.addEventListener('click', anterior);
btnProxima.addEventListener('click', proxima);

btnAleatorio.addEventListener('click', () => {
  aleatorio = !aleatorio;
  btnAleatorio.setAttribute('aria-pressed', String(aleatorio));
});
btnRepetir.addEventListener('click', () => {
  repetir = !repetir;
  btnRepetir.setAttribute('aria-pressed', String(repetir));
  audio.loop = repetir && faixas.length === 1;
});

audio.addEventListener('play', () => { btnTocar.textContent = '⏸'; avisarNativo(); });
audio.addEventListener('pause', () => { btnTocar.textContent = '▶'; avisarNativo(); });
audio.addEventListener('ended', () => {
  if (repetir && faixas.length === 1) return;   // audio.loop já cuida disso
  proxima();
});

audio.addEventListener('loadedmetadata', () => {
  tempoTotal.textContent = formatarTempo(audio.duration);
  barraProgresso.max = String(audio.duration || 0);
});

audio.addEventListener('timeupdate', () => {
  if (arrastandoBarra) return;
  tempoAtual.textContent = formatarTempo(audio.currentTime);
  barraProgresso.value = String(audio.currentTime);
});

barraProgresso.addEventListener('input', () => { arrastandoBarra = true; });
barraProgresso.addEventListener('change', () => {
  audio.currentTime = Number(barraProgresso.value);
  arrastandoBarra = false;
});

function formatarTempo(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const seg = Math.floor(s % 60);
  return m + ':' + String(seg).padStart(2, '0');
}

/* ——— Media Session (controles do navegador/SO) ——— */

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => audio.play().catch(() => {}));
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', anterior);
  navigator.mediaSession.setActionHandler('nexttrack', proxima);
  navigator.mediaSession.setActionHandler('seekto', detalhe => {
    if (detalhe.fastSeek && 'fastSeek' in audio) audio.fastSeek(detalhe.seekTime);
    else audio.currentTime = detalhe.seekTime;
  });
}

/* ——— ponte com o app Android (window.TocadorNativo), se existir ———
   O APK hospeda uma notificação de mídia nativa; como as faixas tocam
   no <audio> da página, a notificação só repassa comandos para aqui. */

window.tocadorComando = function (acao) {
  if (acao === 'play') audio.play().catch(() => {});
  else if (acao === 'pause') audio.pause();
  else if (acao === 'next') proxima();
  else if (acao === 'previous') anterior();
};

function avisarNativo() {
  if (!window.TocadorNativo || typeof window.TocadorNativo.atualizar !== 'function') return;
  const f = faixas[indiceAtual];
  try {
    window.TocadorNativo.atualizar(JSON.stringify({
      titulo: f ? f.nome : '',
      tocando: !audio.paused,
      duracao: audio.duration || 0,
      posicao: audio.currentTime || 0
    }));
  } catch (e) { /* sem ponte nativa */ }
}

/* ——— service worker ——— */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
