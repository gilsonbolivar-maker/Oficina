/* ————————————————————————————————————————————————————————————
   PixelMusic — lê uma pasta de música escolhida no aparelho e toca
   as faixas, com equalizador e reforço de grave (Web Audio API),
   Media Session (controles na notificação do navegador) e uma ponte
   opcional para o app Android (window.PixelMusicNativo).
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.2.2';   // precisa casar com a VERSAO do sw.js

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
const btnEq = document.getElementById('btn-eq');
const painelEq = document.getElementById('painel-eq');
const eqBandas = document.getElementById('eq-bandas');
const btnEqResetar = document.getElementById('btn-eq-resetar');
const sliderGrave = document.getElementById('slider-grave');
const valorGrave = document.getElementById('valor-grave');

let faixas = [];        // [{nome, arquivo, url}]
let indiceAtual = -1;
let aleatorio = false;
let repetir = false;
let arrastandoBarra = false;

/* ——— escolher a pasta ———
   Dentro do APK, o seletor de pasta da WebView do Android não abre um
   seletor de pasta de verdade (só deixa escolher um arquivo por vez), então
   o botão usa o seletor nativo do Android (window.PixelMusicNativo) quando
   ele existe. No navegador comum, continua usando o <input webkitdirectory>. */

btnEscolher.addEventListener('click', () => {
  if (window.PixelMusicNativo && typeof window.PixelMusicNativo.escolherPasta === 'function') {
    window.PixelMusicNativo.escolherPasta();
  } else {
    entradaPasta.click();
  }
});

window.pixelmusicPastaEscolhida = function (lista) {
  if (lista == null) return;   // usuário cancelou o seletor
  if (!Array.isArray(lista) || lista.length === 0) {
    estado.textContent = 'Nenhuma música encontrada nessa pasta';
    return;
  }
  lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  faixas.forEach(f => { try { URL.revokeObjectURL(f.url); } catch (e) {} });
  faixas = lista.map(item => ({
    nome: nomeSemExtensao(item.nome),
    url: 'pixelmusic-nativo/' + item.id
  }));
  montarLista();
  estado.textContent = faixas.length + (faixas.length === 1 ? ' música encontrada — toque pra tocar' : ' músicas encontradas — toque numa pra tocar');
  vazio.hidden = true;
  listaFaixas.hidden = false;
  // Sem tocarIndice(0) aqui de propósito: isso chega da ponte nativa, fora
  // de um toque real do usuário, e o equalizador (Web Audio API) exige um
  // gesto de verdade pra começar a tocar som — sem isso, o áudio "toca"
  // mas fica mudo. O toque na faixa logo abaixo já é esse gesto.
};

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

/* ——— pasta salva (só dentro do APK) ———
   O app Android guarda a permissão da pasta (Storage Access Framework) e,
   ao abrir de novo, lista sozinho as músicas por aqui — sem passar pelo
   seletor de arquivos. No navegador comum window.PixelMusicNativo não
   existe, então isso não faz nada e a pasta continua sendo pedida sempre. */

function restaurarPastaSalva() {
  if (!window.PixelMusicNativo || typeof window.PixelMusicNativo.listarPastaSalva !== 'function') return;
  let lista;
  try {
    lista = JSON.parse(window.PixelMusicNativo.listarPastaSalva() || '[]');
  } catch (e) {
    return;
  }
  if (!Array.isArray(lista) || lista.length === 0) return;

  lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  faixas = lista.map(item => ({
    nome: nomeSemExtensao(item.nome),
    url: 'pixelmusic-nativo/' + item.id
  }));
  montarLista();
  estado.textContent = faixas.length + (faixas.length === 1 ? ' música na pasta salva' : ' músicas na pasta salva');
  vazio.hidden = true;
  listaFaixas.hidden = false;
}

restaurarPastaSalva();

/* ——— tocar ——— */

function tocarIndice(i) {
  if (i < 0 || i >= faixas.length) return;
  indiceAtual = i;
  const f = faixas[i];
  audio.src = f.url;
  iniciarAudioGrafo();
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
      artist: 'PixelMusic',
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
  iniciarAudioGrafo();
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

/* ——— equalizador e reforço de grave (Web Audio API) ———
   A cadeia só é montada na primeira vez que o usuário toca (precisa de um
   gesto para o AudioContext funcionar). Antes disso o <audio> toca normal. */

const FREQUENCIAS_EQ = [60, 230, 910, 3600, 14000];
const CHAVE_EQ = 'pixelmusic:eq';

let contextoAudio = null;
let filtrosBanda = [];
let filtroGrave = null;
let grafoMontado = false;

let ajustesEq = carregarAjustesEq();

function carregarAjustesEq() {
  const padrao = { bandas: FREQUENCIAS_EQ.map(() => 0), grave: 0 };
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_EQ));
    if (salvo && Array.isArray(salvo.bandas) && salvo.bandas.length === FREQUENCIAS_EQ.length) {
      return { bandas: salvo.bandas.map(Number), grave: Number(salvo.grave) || 0 };
    }
  } catch (e) { /* modo privado ou nada salvo */ }
  return padrao;
}

function salvarAjustesEq() {
  try { localStorage.setItem(CHAVE_EQ, JSON.stringify(ajustesEq)); } catch (e) { /* modo privado */ }
}

function iniciarAudioGrafo() {
  if (grafoMontado) return;
  grafoMontado = true;
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    contextoAudio = new Contexto();
    const fonte = contextoAudio.createMediaElementSource(audio);

    filtrosBanda = FREQUENCIAS_EQ.map(freq => {
      const f = contextoAudio.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1;
      f.gain.value = 0;
      return f;
    });

    filtroGrave = contextoAudio.createBiquadFilter();
    filtroGrave.type = 'lowshelf';
    filtroGrave.frequency.value = 120;
    filtroGrave.gain.value = 0;

    let no = fonte;
    for (const f of filtrosBanda) { no.connect(f); no = f; }
    no.connect(filtroGrave);
    filtroGrave.connect(contextoAudio.destination);
  } catch (e) {
    grafoMontado = false;   // sem Web Audio: o <audio> continua tocando normalmente
    return;
  }
  aplicarAjustesEq();
}

function aplicarAjustesEq() {
  if (filtrosBanda.length) {
    ajustesEq.bandas.forEach((db, i) => { filtrosBanda[i].gain.value = db; });
  }
  if (filtroGrave) filtroGrave.gain.value = (ajustesEq.grave / 100) * 15;
}

function montarPainelEq() {
  eqBandas.innerHTML = '';
  FREQUENCIAS_EQ.forEach((freq, i) => {
    const div = document.createElement('div');
    div.className = 'eq-banda';
    const rotuloFreq = freq >= 1000 ? (freq / 1000) + 'k' : String(freq);
    div.innerHTML =
      '<span class="valor" data-valor>' + ajustesEq.bandas[i] + '</span>' +
      '<input type="range" min="-12" max="12" step="1" value="' + ajustesEq.bandas[i] + '">' +
      '<span class="rotulo">' + rotuloFreq + '</span>';
    const slider = div.querySelector('input');
    const valor = div.querySelector('[data-valor]');
    slider.addEventListener('input', () => {
      const db = Number(slider.value);
      ajustesEq.bandas[i] = db;
      valor.textContent = db;
      if (filtrosBanda[i]) filtrosBanda[i].gain.value = db;
      salvarAjustesEq();
    });
    eqBandas.appendChild(div);
  });

  sliderGrave.value = String(ajustesEq.grave);
  valorGrave.textContent = ajustesEq.grave + '%';
}

sliderGrave.addEventListener('input', () => {
  const pct = Number(sliderGrave.value);
  ajustesEq.grave = pct;
  valorGrave.textContent = pct + '%';
  if (filtroGrave) filtroGrave.gain.value = (pct / 100) * 15;
  salvarAjustesEq();
});

btnEq.addEventListener('click', () => {
  const abrir = painelEq.hidden;
  painelEq.hidden = !abrir;
  btnEq.setAttribute('aria-pressed', String(abrir));
});

btnEqResetar.addEventListener('click', () => {
  ajustesEq = { bandas: FREQUENCIAS_EQ.map(() => 0), grave: 0 };
  salvarAjustesEq();
  aplicarAjustesEq();
  montarPainelEq();
});

montarPainelEq();

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

/* ——— ponte com o app Android (window.PixelMusicNativo), se existir ———
   O APK hospeda uma notificação de mídia nativa; como as faixas tocam
   no <audio> da página, a notificação só repassa comandos para aqui. */

window.pixelmusicComando = function (acao) {
  if (acao === 'play') audio.play().catch(() => {});
  else if (acao === 'pause') audio.pause();
  else if (acao === 'proxima') proxima();
  else if (acao === 'anterior') anterior();
};

function avisarNativo() {
  if (!window.PixelMusicNativo || typeof window.PixelMusicNativo.atualizar !== 'function') return;
  const f = faixas[indiceAtual];
  try {
    window.PixelMusicNativo.atualizar(JSON.stringify({
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
