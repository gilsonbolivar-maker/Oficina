/* ————————————————————————————————————————————————————————————
   Câmera Negativo — a câmera do aparelho com as cores invertidas,
   na tela e na foto salva. Nada é enviado para lugar nenhum:
   a imagem nasce e morre dentro do aparelho.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.6.0';   // precisa casar com a VERSAO do sw.js
const CHAVE = 'camera-negativo:v1';
const LIMITE_CARRETEL = 24;   // fotos guardadas na memória da sessão
const ZOOM_MAX = 6;           // além disso o recorte não tem mais pixel para dar

// Largura de trabalho de cada modo: a lupa precisa de pixel para ler texto,
// a vibração precisa de velocidade — ninguém lê um borrão em 4K a 30 quadros.
const LARGURA_LUPA = 1280;
const LARGURA_VIBRACAO = 640;
const LARGURA_CONTRASTE = 960;
const LARGURA_NOITE = 960;

const el = id => document.getElementById(id);

const video = el('video');
const tela = el('tela');
const recado = el('recado');
const recadoTexto = el('recado-texto');
const painelFoto = el('painel-foto');
const painelCarretel = el('painel-carretel');
const painelAjustes = el('painel-ajustes');
const painelModos = el('painel-modos');
const paineis = [painelFoto, painelCarretel, painelAjustes, painelModos];
const fundoPainel = el('fundo-painel');
const avisoEl = el('aviso');

/* ——— filtros ————————————————————————————————————————————————
   Cada filtro é uma receita em três passos, na mesma ordem em que o
   navegador aplicaria: cinza, inverter, contraste. A receita vale tanto
   para o CSS do vídeo quanto para o desenho da foto no canvas — é isso
   que faz a foto sair igual ao que se vê no visor.
   ———————————————————————————————————————————————————————————— */
const FILTROS = [
  { id: 'negativo',    nome: 'Negativo',      cinza: 0, inverter: 1, contraste: 1 },
  { id: 'negativo-pb', nome: 'Negativo P&B',  cinza: 1, inverter: 1, contraste: 1 },
  { id: 'raio-x',      nome: 'Raio-X',        cinza: 1, inverter: 1, contraste: 1.6 },
  { id: 'pb',          nome: 'P&B',           cinza: 1, inverter: 0, contraste: 1 },
  { id: 'normal',      nome: 'Normal',        cinza: 0, inverter: 0, contraste: 1 }
];

/* ——— modos ————————————————————————————————————————————————
   A câmera tem quatro jeitos de olhar. "Foto" é a câmera de sempre;
   os outros três processam quadro a quadro para mostrar o que o olho
   sozinho não alcança — ruído somado, movimento amplificado, e o que
   mudou desde a última ronda.
   ———————————————————————————————————————————————————————————— */
const MODOS = [
  { id: 'foto',     nome: 'Foto',     processa: false, cor: true },
  { id: 'lupa',     nome: 'Lupa',     processa: true,  cor: true },
  // A vibração já pinta o movimento de laranja e azul: inverter por cima
  // trocaria o sentido das cores e só atrapalharia a leitura.
  { id: 'vibracao', nome: 'Vibração', processa: true,  cor: false },
  // A paleta do modo Noite já é a escolha de cor: um filtro por cima
  // viraria o verde em magenta e só confundiria.
  { id: 'noite',     nome: 'Noite',     processa: true, cor: false },
  { id: 'contraste', nome: 'Contraste', processa: true, cor: true },
  { id: 'comparar', nome: 'Comparar', processa: false, cor: true }
];

// Três jeitos de esticar o contraste, do mais fiel ao mais radical.
const CONTRASTES = [
  { id: 'auto',    nome: 'Auto' },
  { id: 'extremo', nome: 'Extremo' },
  { id: 'traco',   nome: 'Traço' }
];

/* ——— estado guardado ——— */
const padrao = () => ({
  modo: 'foto',
  filtro: 'negativo',
  zoom: 1,
  quadros: 8,        // quantos quadros a lupa soma
  ganho: 20,         // quanto a vibração amplifica
  fantasma: 45,      // opacidade da referência, em %
  nitidez: true,     // realce de bordas na lupa
  contraste: 'auto', // auto | extremo | traco
  forcaContraste: 85,
  paleta: 'verde',   // cinza | verde | cor
  ganhoNoite: 6,
  noiteQuadros: 8,
  forca: 100,        // % da inversão
  tempo: 0,          // segundos do temporizador
  frontal: false,
  espelhar: true,
  grade: false,
  clarao: true
});

let dados = carregar();

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return padrao();
    const lido = Object.assign(padrao(), JSON.parse(bruto));
    if (!FILTROS.some(f => f.id === lido.filtro)) lido.filtro = 'negativo';
    lido.zoom = Math.min(ZOOM_MAX, Math.max(1, Number(lido.zoom) || 1));
    if (!MODOS.some(m => m.id === lido.modo)) lido.modo = 'foto';
    if (!CONTRASTES.some(c => c.id === lido.contraste)) lido.contraste = 'auto';
    if (!['cinza', 'verde', 'cor'].includes(lido.paleta)) lido.paleta = 'verde';
    return lido;
  } catch (e) {
    return padrao();
  }
}

function gravar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch (e) {
    // Modo privado ou armazenamento cheio: os ajustes só não sobrevivem ao fechar.
  }
}

function filtroAtual() {
  return FILTROS.find(f => f.id === dados.filtro) || FILTROS[0];
}

// Quanto da inversão realmente entra, já com a força do ajuste.
function inversaoEfetiva(f) {
  return f.inverter * (dados.forca / 100);
}

function receitaCss(f) {
  const partes = [];
  if (f.cinza) partes.push('grayscale(' + f.cinza + ')');
  const inv = inversaoEfetiva(f);
  if (inv) partes.push('invert(' + inv.toFixed(3) + ')');
  if (f.contraste !== 1) partes.push('contrast(' + f.contraste + ')');
  return partes.length ? partes.join(' ') : 'none';
}

/* ——— câmera ————————————————————————————————————————————————— */
let fluxo = null;
let trilha = null;
let lanternaLigada = false;

async function ligarCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return mostrarRecado('Este navegador não abre a câmera. Tente o Safari (iPhone/iPad) ' +
      'ou o Chrome.', false);
  }
  if (!window.isSecureContext) {
    return mostrarRecado('A câmera só funciona em endereço seguro (https). Abra o app ' +
      'pelo link https:// da Oficina.', false);
  }

  desligarCamera();
  mostrarRecado('Abrindo a câmera…', false);

  try {
    fluxo = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: dados.frontal ? 'user' : 'environment',
        width: { ideal: 3840 },
        height: { ideal: 2160 }
      },
      audio: false
    });
  } catch (erro) {
    return mostrarRecado(explicarErro(erro), true);
  }

  video.srcObject = fluxo;
  trilha = fluxo.getVideoTracks()[0] || null;
  lanternaLigada = false;

  try {
    await video.play();
  } catch (e) {
    // Alguns navegadores só tocam depois de um toque; o botão continua ali.
  }

  esconderRecado();
  el('btn-foto').disabled = false;
  prepararLanterna();
  prepararZoom();
  aplicarAparencia();
  aplicarZoom();
  tocarLaco();
}

function desligarCamera() {
  if (fluxo) fluxo.getTracks().forEach(t => t.stop());
  fluxo = null;
  trilha = null;
  zoomNativo = null;
  lanternaLigada = false;
  video.srcObject = null;
  el('btn-foto').disabled = true;
  el('btn-lanterna').hidden = true;
  el('btn-lanterna').setAttribute('aria-pressed', 'false');
  tocarLaco();
}

function explicarErro(erro) {
  const nome = erro && erro.name;
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'A câmera está bloqueada para este site. Libere em Ajustes do navegador ' +
      '(no iPhone: Ajustes › Safari › Câmera) e tente de novo.';
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
    return 'Não achei nenhuma câmera neste aparelho.';
  }
  if (nome === 'NotReadableError') {
    return 'A câmera está ocupada por outro app. Feche o outro app e tente de novo.';
  }
  return 'Não deu para abrir a câmera' + (nome ? ' (' + nome + ')' : '') + '.';
}

function mostrarRecado(texto, comBotao) {
  recadoTexto.textContent = texto;
  el('btn-ligar').hidden = !comBotao;
  recado.hidden = false;
  el('btn-foto').disabled = true;
}

function esconderRecado() {
  recado.hidden = true;
}

/* ——— lanterna (quando a câmera de trás permite) ——— */
function prepararLanterna() {
  const botao = el('btn-lanterna');
  const capacidades = trilha && trilha.getCapabilities ? trilha.getCapabilities() : null;
  botao.hidden = !(capacidades && 'torch' in capacidades);
  botao.setAttribute('aria-pressed', 'false');
}

el('btn-lanterna').addEventListener('click', async () => {
  if (!trilha) return;
  lanternaLigada = !lanternaLigada;
  try {
    await trilha.applyConstraints({ advanced: [{ torch: lanternaLigada }] });
    el('btn-lanterna').setAttribute('aria-pressed', String(lanternaLigada));
  } catch (e) {
    lanternaLigada = false;
    mostrarAviso('Esta câmera não deixa acender a lanterna.');
  }
});

/* ——— zoom ——————————————————————————————————————————————————
   Duas camadas: se a câmera tem zoom próprio (Android/Chrome), ele
   é usado primeiro, porque não custa nitidez. O que passar do que o
   hardware alcança — e tudo, no iPhone, onde o Safari não expõe zoom —
   é recorte central: o visor amplia por CSS e a foto é recortada no
   mesmo fator, então a imagem salva é ampliada de verdade, e não uma
   foto inteira que só parecia perto na tela.
   ———————————————————————————————————————————————————————————— */
let zoomNativo = null;      // faixa de zoom do hardware, quando existe
let zoomDigital = 1;        // o que sobrou para o recorte fazer

function prepararZoom() {
  const cap = trilha && trilha.getCapabilities ? trilha.getCapabilities() : null;
  const z = cap && cap.zoom;
  zoomNativo = (z && z.max > (z.min || 1)) ? z : null;
}

async function aplicarZoom() {
  const alvo = dados.zoom;
  let resto = alvo;

  if (zoomNativo && trilha) {
    // A faixa do hardware nem sempre começa em 1 (há câmeras que reportam 100–400).
    const base = zoomNativo.min || 1;
    const pedido = Math.min(zoomNativo.max, Math.max(base, alvo * base));
    try {
      await trilha.applyConstraints({ advanced: [{ zoom: pedido }] });
      resto = alvo / (pedido / base);
    } catch (e) {
      zoomNativo = null;   // prometeu e não cumpriu: fica tudo com o recorte
    }
  }

  zoomDigital = Math.max(1, resto);
  document.documentElement.style.setProperty('--zoom', zoomDigital.toFixed(3));
  mostrarZoom();
}

function mostrarZoom() {
  const texto = dados.zoom.toFixed(1) + '×';
  el('btn-zoom').textContent = texto;
  el('btn-zoom').classList.toggle('ativo', dados.zoom > 1);
  el('valor-zoom').textContent = texto;
  el('ajuste-zoom').value = Math.round(dados.zoom * 10);
}

function definirZoom(valor, avisar) {
  const antes = dados.zoom;
  dados.zoom = Math.min(ZOOM_MAX, Math.max(1, Number(valor) || 1));
  if (dados.zoom === antes) return;
  gravar();
  aplicarZoom();
  if (avisar) mostrarAviso('Zoom ' + dados.zoom.toFixed(1) + '×');
}

// Atalho no topo: 1× → 2× → 3× → 5× → 1×
el('btn-zoom').addEventListener('click', () => {
  const passos = [1, 2, 3, 5];
  const i = passos.findIndex(p => p > dados.zoom + 0.01);
  definirZoom(i === -1 ? 1 : passos[i], false);
});

el('ajuste-zoom').addEventListener('input', ev => definirZoom(Number(ev.target.value) / 10, false));

/* ——— pinça e dois toques no visor ——— */
const dedos = new Map();
let pincaInicial = 0;
let zoomInicial = 1;
let ultimoToque = 0;

const visor = el('visor');

visor.addEventListener('pointerdown', ev => {
  dedos.set(ev.pointerId, ev);
  if (dedos.size === 2) {
    pincaInicial = distanciaDedos();
    zoomInicial = dados.zoom;
  }
});

visor.addEventListener('pointermove', ev => {
  if (!dedos.has(ev.pointerId)) return;
  dedos.set(ev.pointerId, ev);
  if (dedos.size !== 2 || !pincaInicial) return;
  const agora = distanciaDedos();
  if (agora) definirZoom(zoomInicial * (agora / pincaInicial), false);
});

for (const fim of ['pointerup', 'pointercancel', 'pointerleave']) {
  visor.addEventListener(fim, ev => {
    const eraPinca = dedos.size === 2;
    dedos.delete(ev.pointerId);
    if (dedos.size < 2) pincaInicial = 0;
    if (eraPinca || ev.type !== 'pointerup') return;

    // Dois toques seguidos alternam entre 1× e 2×.
    const t = Date.now();
    if (t - ultimoToque < 320) {
      definirZoom(dados.zoom > 1.05 ? 1 : 2, true);
      ultimoToque = 0;
    } else {
      ultimoToque = t;
    }
  });
}

function distanciaDedos() {
  const [a, b] = [...dedos.values()];
  if (!a || !b) return 0;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/* ——— o laço que processa os quadros ————————————————————————
   Lupa e Vibração desenham no canvas em vez de mostrar o vídeo. As
   duas trabalham sobre o mesmo recorte que o zoom já escolheu, em
   resolução reduzida para caber nos 30 quadros por segundo — e o
   filtro de cor continua por conta do CSS, igual ao vídeo.
   ———————————————————————————————————————————————————————————— */
const ctxTela = tela.getContext('2d', { willReadFrequently: true });

let laco = 0;              // id do requestAnimationFrame
let somados = 0;           // quadros já somados pela lupa
let acumulado = null;      // soma dos quadros (lupa)
let fundoLento = null;     // média que anda devagar (vibração)
let ultimoNivel = 0;

const trabalho = document.createElement('canvas');
const ctxTrabalho = trabalho.getContext('2d', { willReadFrequently: true });

function modoAtual() {
  return MODOS.find(m => m.id === dados.modo) || MODOS[0];
}

// Recorte que o zoom escolheu, reduzido ao tamanho de trabalho do modo.
function medidasDeTrabalho(larguraAlvo) {
  const larg = video.videoWidth, alt = video.videoHeight;
  if (!larg || !alt) return null;

  const z = Math.max(1, zoomDigital);
  const rl = Math.max(16, Math.round(larg / z));
  const ra = Math.max(16, Math.round(alt / z));
  const escala = Math.min(1, larguraAlvo / rl);
  return {
    rx: Math.round((larg - rl) / 2), ry: Math.round((alt - ra) / 2), rl, ra,
    w: Math.max(16, Math.round(rl * escala)),
    h: Math.max(16, Math.round(ra * escala))
  };
}

function zerarAcumuladores() {
  somados = 0;
  acumulado = null;
  fundoLento = null;
  faixaTons = null;
  somaNoturna = null;
  ultimoNivel = 0;
  atualizarMedidas();
}

function pegarQuadro(m) {
  if (trabalho.width !== m.w || trabalho.height !== m.h) {
    trabalho.width = m.w;
    trabalho.height = m.h;
    zerarAcumuladores();
  }
  ctxTrabalho.setTransform(1, 0, 0, 1, 0, 0);
  if (dados.frontal && dados.espelhar) {
    ctxTrabalho.translate(m.w, 0);
    ctxTrabalho.scale(-1, 1);
  }
  ctxTrabalho.drawImage(video, m.rx, m.ry, m.rl, m.ra, 0, 0, m.w, m.h);
  ctxTrabalho.setTransform(1, 0, 0, 1, 0, 0);
  return ctxTrabalho.getImageData(0, 0, m.w, m.h);
}

function prepararTela(m) {
  if (tela.width !== m.w || tela.height !== m.h) {
    tela.width = m.w;
    tela.height = m.h;
  }
}

/* ——— Lupa: soma quadros para matar o chuvisco ———
   Cada pixel do sensor tem ruído próprio, diferente a cada quadro; a
   média de N quadros divide esse ruído por raiz de N e o texto
   pequeno sai do chuvisco. Só vale com a cena parada: se o quadro
   mudar demais, a soma recomeça em vez de borrar tudo.            */
function passoLupa() {
  const m = medidasDeTrabalho(LARGURA_LUPA);
  if (!m) return;
  prepararTela(m);

  const quadro = pegarQuadro(m);
  const px = quadro.data;
  const n = m.w * m.h * 4;

  if (!acumulado || acumulado.length !== n) {
    acumulado = new Float32Array(n);
    somados = 0;
  }

  // Mudou muito? É a cena que mudou, não ruído: recomeça a soma.
  if (somados > 0 && mudouDemais(px, n)) somados = 0;

  if (somados === 0) acumulado.set(px);
  else for (let i = 0; i < n; i++) acumulado[i] += px[i];
  somados++;

  const teto = Math.max(2, dados.quadros);
  if (somados > teto) {
    // Janela cheia: vai soltando o peso do passado em vez de travar.
    for (let i = 0; i < n; i++) acumulado[i] -= acumulado[i] / teto;
    somados = teto;
  }

  const media = somados;
  for (let i = 0; i < n; i += 4) {
    px[i]     = acumulado[i] / media;
    px[i + 1] = acumulado[i + 1] / media;
    px[i + 2] = acumulado[i + 2] / media;
    px[i + 3] = 255;
  }

  ctxTela.putImageData(quadro, 0, 0);
  if (dados.nitidez) realcarBordas(m);
  atualizarMedidas();
}

let anterior = null;
function mudouDemais(px, n) {
  if (!anterior || anterior.length !== n) {
    anterior = new Uint8ClampedArray(px);
    return false;
  }
  let soma = 0, contados = 0;
  for (let i = 0; i < n; i += 64) {      // amostra: não precisa olhar tudo
    soma += Math.abs(px[i] - anterior[i]);
    contados++;
  }
  anterior.set(px);
  return (soma / contados) > 12;
}

// Unsharp leve: devolve a borda que a média arredondou.
function realcarBordas(m) {
  const imagem = ctxTela.getImageData(0, 0, m.w, m.h);
  const px = imagem.data;
  const copia = new Uint8ClampedArray(px);
  const w = m.w, h = m.h;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const meio = copia[i + c];
        const volta = copia[i - 4 + c] + copia[i + 4 + c] +
                      copia[i - w * 4 + c] + copia[i + w * 4 + c];
        const v = meio + (meio * 4 - volta) * 0.35;
        px[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  ctxTela.putImageData(imagem, 0, 0);
}

/* ——— Noite: junta a luz de vários quadros —————————————————
   No escuro o sensor até registra alguma luz, mas ela vem afogada no
   chuvisco — e o chuvisco é diferente a cada quadro, enquanto a cena é
   a mesma. Somando quadros, a cena se reforça e o ruído se cancela;
   só então o ganho vale a pena, porque amplia imagem em vez de
   amplificar chuvisco. Depois os tons são esticados e, se quiser, a
   imagem vai para o verde — onde o olho separa mais tons no escuro.
   ———————————————————————————————————————————————————————————— */
let somaNoturna = null;
let luzDaCena = 0;

function passoNoite() {
  const m = medidasDeTrabalho(LARGURA_NOITE);
  if (!m) return;
  prepararTela(m);

  const quadro = pegarQuadro(m);
  const px = quadro.data;
  const n = m.w * m.h * 4;
  const pontos = m.w * m.h;

  if (!somaNoturna || somaNoturna.length !== n) {
    somaNoturna = new Float32Array(n);
    somaNoturna.set(px);
  }

  // Média que anda: quanto mais quadros, mais limpa a imagem e mais ela
  // arrasta o que se mexe. Sem reinício por movimento — no escuro, o
  // próprio ruído dispararia o reinício a todo quadro.
  const alfa = 1 / Math.max(1, dados.noiteQuadros);
  let luz = 0;
  for (let p = 0; p < pontos; p++) {
    const i = p * 4;
    somaNoturna[i]     += (px[i]     - somaNoturna[i]) * alfa;
    somaNoturna[i + 1] += (px[i + 1] - somaNoturna[i + 1]) * alfa;
    somaNoturna[i + 2] += (px[i + 2] - somaNoturna[i + 2]) * alfa;
    luz += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  }
  luzDaCena = luzDaCena * 0.8 + (luz / pontos) * 0.2;

  const ganho = dados.ganhoNoite;
  for (let i = 0; i < n; i += 4) {
    px[i]     = limite(somaNoturna[i] * ganho);
    px[i + 1] = limite(somaNoturna[i + 1] * ganho);
    px[i + 2] = limite(somaNoturna[i + 2] * ganho);
  }

  // Com a luz já junta, esticar os tons custa pouco e rende muito.
  estirarTons(px, pontos, 1, false);

  if (dados.paleta !== 'cor') pintarPaleta(px, pontos, dados.paleta);

  ctxTela.putImageData(quadro, 0, 0);
  atualizarMedidas();
}

function pintarPaleta(px, pontos, paleta) {
  for (let p = 0; p < pontos; p++) {
    const i = p * 4;
    const v = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    if (paleta === 'verde') {
      px[i] = v * 0.18; px[i + 1] = v; px[i + 2] = v * 0.38;
    } else {
      px[i] = px[i + 1] = px[i + 2] = v;
    }
  }
}

/* ——— Contraste: usa a faixa de tons inteira ————————————————
   Uma etiqueta desbotada ou um display apagado ocupam um pedacinho
   da escala de brilho — digamos, tudo entre 90 e 130. "Auto" descobre
   esse pedaço e o estica até 0–255; "Extremo" ainda curva o meio para
   afastar claro de escuro; "Traço" larga o tom e compara cada ponto
   com a vizinhança, que é o que faz aparecer número gravado em metal
   mesmo com a luz batendo torta.
   ———————————————————————————————————————————————————————————— */
function passoContraste() {
  const m = medidasDeTrabalho(LARGURA_CONTRASTE);
  if (!m) return;
  prepararTela(m);

  const quadro = pegarQuadro(m);
  const px = quadro.data;
  const pontos = m.w * m.h;
  const mistura = dados.forcaContraste / 100;

  if (dados.contraste === 'traco') limiarLocal(px, m, mistura);
  else estirarTons(px, pontos, mistura, dados.contraste === 'extremo');

  ctxTela.putImageData(quadro, 0, 0);
  atualizarMedidas();
}

// Onde a cena começa e termina na escala de brilho, ignorando as pontas
// (2% de cada lado) para um reflexo ou um pixel queimado não mandarem.
let faixaTons = null;

function estirarTons(px, pontos, mistura, extremo) {
  const histograma = new Uint32Array(256);
  const passo = Math.max(1, Math.floor(pontos / 20000));   // amostra basta
  let amostras = 0;

  for (let p = 0; p < pontos; p += passo) {
    const i = p * 4;
    const luz = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) | 0;
    histograma[luz < 0 ? 0 : luz > 255 ? 255 : luz]++;
    amostras++;
  }

  const corte = Math.max(1, Math.round(amostras * 0.02));
  let baixo = 0, alto = 255, soma = 0;
  for (let v = 0; v < 256; v++) { soma += histograma[v]; if (soma >= corte) { baixo = v; break; } }
  soma = 0;
  for (let v = 255; v >= 0; v--) { soma += histograma[v]; if (soma >= corte) { alto = v; break; } }
  if (alto - baixo < 8) { alto = Math.min(255, baixo + 8); }

  // Suaviza a faixa no tempo: senão a imagem pulsa a cada quadro.
  if (!faixaTons) faixaTons = { baixo, alto };
  faixaTons.baixo += (baixo - faixaTons.baixo) * 0.25;
  faixaTons.alto += (alto - faixaTons.alto) * 0.25;

  const b = faixaTons.baixo;
  const escala = 255 / Math.max(8, faixaTons.alto - b);

  for (let p = 0; p < pontos; p++) {
    const i = p * 4;
    for (let c = 0; c < 3; c++) {
      let v = (px[i + c] - b) * escala;
      // Extremo: depois de esticar, abre ainda mais a partir do meio. O que
      // passa das pontas vira preto ou branco puro — é esse estouro que faz
      // aparecer o traço fraco que o tom médio escondia.
      if (extremo) v = (v - 128) * 2.4 + 128;
      px[i + c] = limite(px[i + c] + (v - px[i + c]) * mistura);
    }
  }
}

/* ——— Traço: preto no branco, comparando com a vizinhança ———
   A média de cada vizinhança sai de uma tabela de somas acumuladas
   (imagem integral): com ela, a média de qualquer janela custa quatro
   leituras, e não um laço por pixel — é o que cabe nos 30 quadros.  */
let somasAcumuladas = null;

function limiarLocal(px, m, mistura) {
  const w = m.w, h = m.h, pontos = w * h;
  const largura = w + 1;
  const precisa = largura * (h + 1);
  if (!somasAcumuladas || somasAcumuladas.length !== precisa) {
    somasAcumuladas = new Float64Array(precisa);
  }
  const soma = somasAcumuladas;

  const luzes = new Uint8ClampedArray(pontos);
  for (let p = 0; p < pontos; p++) {
    const i = p * 4;
    luzes[p] = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  }

  for (let y = 0; y < h; y++) {
    let linha = 0;
    for (let x = 0; x < w; x++) {
      linha += luzes[y * w + x];
      soma[(y + 1) * largura + x + 1] = soma[y * largura + x + 1] + linha;
    }
  }

  // A vizinhança precisa ser maior que a espessura do traço: se a janela
  // couber inteira dentro da letra, a média vira a própria letra e não
  // sobra diferença para medir.
  const raio = Math.max(8, Math.round(w / 24));

  // Em vez de cortar num limiar fixo, cada ponto é medido CONTRA a sua
  // vizinhança e a diferença é multiplicada. Assim tanto faz a luz estar
  // batendo torta, nem se o traço é mais claro ou mais escuro que o fundo:
  // some o fundo, fica o traço. Com força alta a conta satura sozinha e o
  // resultado vira quase preto no branco.
  const ganho = 2 + mistura * 18;

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - raio), y1 = Math.min(h - 1, y + raio);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - raio), x1 = Math.min(w - 1, x + raio);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const total = soma[(y1 + 1) * largura + x1 + 1] - soma[y0 * largura + x1 + 1]
                  - soma[(y1 + 1) * largura + x0] + soma[y0 * largura + x0];
      const p = y * w + x;
      const v = limite(128 + (luzes[p] - total / area) * ganho);
      const i = p * 4;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
  }
}

/* ——— Vibração: amplifica o que mal se mexe ———
   Um fundo que acompanha a cena devagar guarda "como as coisas
   estão paradas"; o que foge dele é movimento. Multiplicado, um
   tremor de um pixel vira uma faixa colorida bem visível.        */
function passoVibracao() {
  const m = medidasDeTrabalho(LARGURA_VIBRACAO);
  if (!m) return;
  prepararTela(m);

  const quadro = pegarQuadro(m);
  const px = quadro.data;
  const pontos = m.w * m.h;

  if (!fundoLento || fundoLento.length !== pontos) {
    fundoLento = new Float32Array(pontos);
    for (let p = 0; p < pontos; p++) {
      fundoLento[p] = 0.2126 * px[p * 4] + 0.7152 * px[p * 4 + 1] + 0.0722 * px[p * 4 + 2];
    }
  }

  const ganho = dados.ganho;
  let soma = 0;

  for (let p = 0; p < pontos; p++) {
    const i = p * 4;
    const luz = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    const desvio = luz - fundoLento[p];
    fundoLento[p] += desvio * 0.08;      // o fundo anda devagar atrás da cena
    soma += Math.abs(desvio);

    const base = luz * 0.45;             // cena apagada, realce por cima
    const forca = desvio * ganho;
    px[i]     = limite(base + (forca > 0 ? forca : 0));
    px[i + 1] = limite(base + Math.abs(forca) * 0.35);
    px[i + 2] = limite(base + (forca < 0 ? -forca : 0));
  }

  ctxTela.putImageData(quadro, 0, 0);

  // Nível suavizado, para o número não ficar pulando.
  const agora = Math.min(100, (soma / pontos) * 12);
  ultimoNivel = ultimoNivel * 0.85 + agora * 0.15;
  atualizarMedidas();
}

const limite = v => v < 0 ? 0 : v > 255 ? 255 : v;

function girar() {
  laco = 0;
  if (!modoAtual().processa || !fluxo) return;
  if (video.readyState >= 2) {
    if (dados.modo === 'lupa') passoLupa();
    else if (dados.modo === 'vibracao') passoVibracao();
    else if (dados.modo === 'contraste') passoContraste();
    else if (dados.modo === 'noite') passoNoite();
  }
  laco = requestAnimationFrame(girar);
}

function tocarLaco() {
  const processa = modoAtual().processa && Boolean(fluxo);
  tela.hidden = !processa;
  video.style.visibility = processa ? 'hidden' : '';
  if (processa && !laco) {
    zerarAcumuladores();
    laco = requestAnimationFrame(girar);
  }
  if (!processa && laco) {
    cancelAnimationFrame(laco);
    laco = 0;
  }
}

function atualizarMedidas() {
  if (dados.modo === 'lupa') {
    const alvo = Math.max(2, dados.quadros);
    el('medida-lupa').textContent = somados >= alvo
      ? 'estabilizado · ' + alvo + ' quadros somados'
      : 'somando ' + somados + ' de ' + alvo + '…';
    el('medida-lupa').classList.toggle('forte', somados >= alvo);
  }
  if (dados.modo === 'noite') {
    const pc = Math.round(luzDaCena / 255 * 100);
    el('medida-noite').textContent = pc < 1
      ? 'escuro demais — nem o sensor pega luz aqui'
      : pc < 6 ? 'luz muito baixa · ' + pc + '% — apoie o aparelho e some mais quadros'
      : pc < 20 ? 'pouca luz · ' + pc + '% — é aqui que o modo rende'
      : 'luz suficiente · ' + pc + '% — a câmera normal já dá conta';
    el('medida-noite').classList.toggle('forte', pc >= 1 && pc < 20);
  }
  if (dados.modo === 'contraste') {
    const c = CONTRASTES.find(x => x.id === dados.contraste);
    el('medida-contraste').textContent = dados.contraste === 'traco'
      ? 'Traço · compara cada ponto com a vizinhança'
      : faixaTons
        ? c.nome + ' · tons de ' + Math.round(faixaTons.baixo) + ' a ' +
          Math.round(faixaTons.alto) + ' esticados para 0–255'
        : c.nome + ' · medindo a cena…';
    el('medida-contraste').classList.toggle('forte', dados.forcaContraste > 0);
  }
  if (dados.modo === 'vibracao') {
    const n = Math.round(ultimoNivel);
    el('nivel-barra').style.width = Math.min(100, n) + '%';
    el('medida-vibracao').textContent = n < 3 ? 'parado'
      : n < 15 ? 'tremor leve · nível ' + n
      : n < 40 ? 'tremor claro · nível ' + n
      : 'movimento forte · nível ' + n;
    el('medida-vibracao').classList.toggle('forte', n >= 15);
  }
}

/* ——— trocar de modo ——— */
function definirModo(id) {
  if (!MODOS.some(m => m.id === id)) return;
  dados.modo = id;
  gravar();
  aplicarModo();
}

function aplicarModo() {
  const m = modoAtual();
  el('btn-modo').textContent = m.nome;
  el('btn-modo').classList.toggle('ativo', m.id !== 'foto');

  // Onde a cor já carrega informação, o filtro sai da frente.
  el('filtros').hidden = !m.cor;
  tela.style.filter = m.cor ? '' : 'none';

  el('controles-noite').hidden = m.id !== 'noite';
  el('controles-contraste').hidden = m.id !== 'contraste';
  el('controles-lupa').hidden = m.id !== 'lupa';
  el('controles-vibracao').hidden = m.id !== 'vibracao';
  el('controles-comparar').hidden = m.id !== 'comparar';

  document.querySelectorAll('[data-modo]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.modo === m.id));
  });

  mostrarContraste();
  mostrarNoite();
  ajustarCameraParaNoite();
  mostrarFantasma();
  tocarLaco();
  atualizarMedidas();
}

el('btn-modo').addEventListener('click', () => abrirPainel(painelModos));
document.querySelectorAll('[data-modo]').forEach(b => {
  b.addEventListener('click', () => {
    definirModo(b.dataset.modo);
    fecharPaineis();
    mostrarAviso('Modo ' + modoAtual().nome);
  });
});

el('ajuste-quadros').addEventListener('input', ev => {
  dados.quadros = Number(ev.target.value);
  el('valor-quadros').textContent = dados.quadros;
  gravar();
  zerarAcumuladores();
});
el('ajuste-ganho').addEventListener('input', ev => {
  dados.ganho = Number(ev.target.value);
  el('valor-ganho').textContent = dados.ganho + '×';
  gravar();
});

function mostrarContraste() {
  document.querySelectorAll('[data-contraste]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.contraste === dados.contraste));
  });
  el('valor-contraste').textContent = dados.forcaContraste + '%';
  el('ajuste-contraste').value = dados.forcaContraste;
}

document.querySelectorAll('[data-contraste]').forEach(b => {
  b.addEventListener('click', () => {
    dados.contraste = b.dataset.contraste;
    gravar();
    faixaTons = null;
    mostrarContraste();
    atualizarMedidas();
  });
});

el('ajuste-contraste').addEventListener('input', ev => {
  dados.forcaContraste = Number(ev.target.value);
  gravar();
  mostrarContraste();
});

function mostrarNoite() {
  document.querySelectorAll('[data-paleta]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.paleta === dados.paleta));
  });
  el('valor-ganho-noite').textContent = dados.ganhoNoite + '×';
  el('ajuste-ganho-noite').value = dados.ganhoNoite;
  el('valor-noite-quadros').textContent = dados.noiteQuadros;
  el('ajuste-noite-quadros').value = dados.noiteQuadros;
}

document.querySelectorAll('[data-paleta]').forEach(b => {
  b.addEventListener('click', () => {
    dados.paleta = b.dataset.paleta;
    gravar();
    mostrarNoite();
  });
});

el('ajuste-ganho-noite').addEventListener('input', ev => {
  dados.ganhoNoite = Number(ev.target.value);
  gravar();
  mostrarNoite();
});
el('ajuste-noite-quadros').addEventListener('input', ev => {
  dados.noiteQuadros = Number(ev.target.value);
  gravar();
  mostrarNoite();
});

/* ——— pedir ao hardware mais tempo de exposição ———
   Com menos quadros por segundo, cada quadro fica aberto mais tempo e
   entra mais luz — é o jeito de ganhar sensibilidade antes de qualquer
   conta. Nem toda câmera aceita; quando recusa, o modo segue só com a
   soma de quadros, que é o que o iPhone faz.                        */
let cameraNaNoite = false;

async function ajustarCameraParaNoite() {
  const querNoite = dados.modo === 'noite';
  if (!trilha || querNoite === cameraNaNoite) return;
  cameraNaNoite = querNoite;
  try {
    await trilha.applyConstraints(querNoite
      ? { frameRate: { ideal: 10, max: 15 } }
      : { frameRate: { ideal: 30 } });
  } catch (e) {
    // Câmera não deixa mexer no tempo de exposição: segue no software.
  }
}

/* ——— Comparar: a foto antiga por cima do visor ——— */
let referencia = null;

function mostrarFantasma() {
  const liga = dados.modo === 'comparar' && referencia;
  el('fantasma').hidden = !liga;
  if (liga) el('fantasma').src = referencia.url;
  document.documentElement.style.setProperty('--fantasma', dados.fantasma / 100);

  el('valor-fantasma').textContent = dados.fantasma + '%';
  el('ajuste-fantasma').value = dados.fantasma;
  el('medida-comparar').textContent = referencia
    ? 'Referência: ' + hora(referencia.quando) + ' — mire até as bordas sumirem.'
    : 'Sem referência — abra uma foto e toque em Referência.';
  el('medida-comparar').classList.toggle('forte', Boolean(referencia));
}

el('ajuste-fantasma').addEventListener('input', ev => {
  dados.fantasma = Number(ev.target.value);
  gravar();
  mostrarFantasma();
});

el('btn-referencia').addEventListener('click', () => {
  if (!fotoAberta) return;
  referencia = fotoAberta;
  definirModo('comparar');
  fecharPaineis();
  mostrarAviso('Referência marcada — mire e fotografe para ver o que mudou.');
});

/* ——— tirar a foto ————————————————————————————————————————————
   O visor é CSS, mas a foto precisa ser desenhada. Onde o navegador
   aceita ctx.filter (Safari 17+, Chrome, Firefox) é ele quem faz o
   trabalho; onde não aceita, a mesma conta é feita pixel a pixel.
   ———————————————————————————————————————————————————————————— */
let contando = 0;

el('btn-foto').addEventListener('click', () => {
  if (contando) return;
  if (!dados.tempo) return tirarFoto();

  let resta = dados.tempo;
  const marcador = el('contagem');
  marcador.hidden = false;
  marcador.textContent = resta;

  contando = setInterval(() => {
    resta -= 1;
    if (resta > 0) {
      marcador.textContent = resta;
      return;
    }
    clearInterval(contando);
    contando = 0;
    marcador.hidden = true;
    tirarFoto();
  }, 1000);
});

async function tirarFoto() {
  const larg = video.videoWidth;
  const alt = video.videoHeight;
  if (!larg || !alt) return mostrarAviso('A câmera ainda está aquecendo, tente de novo.');

  // Nos modos que processam, a foto é o que o canvas já montou — o visor
  // deixou de ser o vídeo cru e a imagem salva acompanha. Nos outros, o
  // zoom digital vira recorte central do quadro, no tamanho real dos pixels.
  const processado = modoAtual().processa && tela.width > 0;

  let rl, ra, rx = 0, ry = 0;
  if (processado) {
    rl = tela.width;
    ra = tela.height;
  } else {
    const z = Math.max(1, zoomDigital);
    rl = Math.max(16, Math.round(larg / z));
    ra = Math.max(16, Math.round(alt / z));
    rx = Math.round((larg - rl) / 2);
    ry = Math.round((alt - ra) / 2);
  }

  const folha = document.createElement('canvas');
  folha.width = rl;
  folha.height = ra;
  const ctx = folha.getContext('2d');

  // A foto espelhada acompanha o visor: o que se vê é o que sai.
  // (No canvas processado o espelho já foi aplicado lá atrás.)
  if (!processado && dados.frontal && dados.espelhar) {
    ctx.translate(rl, 0);
    ctx.scale(-1, 1);
  }

  const f = filtroAtual();
  const receita = modoAtual().cor ? receitaCss(f) : 'none';
  const filtroNativo = ('filter' in ctx) && receita !== 'none';
  if (filtroNativo) ctx.filter = receita;

  if (processado) ctx.drawImage(tela, 0, 0);
  else ctx.drawImage(video, rx, ry, rl, ra, 0, 0, rl, ra);

  ctx.filter = 'none';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!filtroNativo && receita !== 'none') aplicarNaMao(ctx, rl, ra, f);

  piscar();

  const blob = await new Promise(ok => folha.toBlob(ok, 'image/jpeg', 0.92));
  if (!blob) return mostrarAviso('Não deu para salvar esta foto.');

  const foto = guardarFoto(blob, f);

  // No Comparar, a foto nova rende uma segunda imagem: o que mudou.
  if (dados.modo === 'comparar') {
    if (!referencia) {
      mostrarAviso('Foto tirada. Marque uma referência para ver o que mudou.');
      return;
    }
    try {
      const diferenca = await imagemDaDiferenca(referencia, foto);
      if (diferenca) {
        const marcada = guardarFoto(diferenca.blob, f, {
          rotulo: 'Diferença', mudanca: diferenca.mudanca
        });
        abrirFoto(marcada);
      }
    } catch (e) {
      mostrarAviso('Não deu para comparar com a referência.');
    }
  }
}

/* ——— o que mudou entre duas fotos ————————————————————————————
   A referência é redesenhada no tamanho da foto nova, as duas viram
   luminância e o que difere acima do ruído acende em vermelho sobre a
   cena apagada. Serve para ronda: mesma cena, dois horários.
   ———————————————————————————————————————————————————————————— */
const LIMIAR_MUDANCA = 18;   // abaixo disso é ruído de sensor, não mudança

function carregarImagem(endereco) {
  return new Promise((ok, falhou) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = falhou;
    img.src = endereco;
  });
}

async function imagemDaDiferenca(antes, depois) {
  const [a, b] = await Promise.all([carregarImagem(antes.url), carregarImagem(depois.url)]);
  const w = b.naturalWidth, h = b.naturalHeight;
  if (!w || !h) return null;

  const folhaA = document.createElement('canvas');
  folhaA.width = w; folhaA.height = h;
  folhaA.getContext('2d').drawImage(a, 0, 0, w, h);

  const folhaB = document.createElement('canvas');
  folhaB.width = w; folhaB.height = h;
  const ctxB = folhaB.getContext('2d', { willReadFrequently: true });
  ctxB.drawImage(b, 0, 0);

  const pa = folhaA.getContext('2d', { willReadFrequently: true })
                   .getImageData(0, 0, w, h).data;
  const saida = ctxB.getImageData(0, 0, w, h);
  const pb = saida.data;

  let mudados = 0;
  const pontos = w * h;

  for (let p = 0; p < pontos; p++) {
    const i = p * 4;
    const luzA = 0.2126 * pa[i] + 0.7152 * pa[i + 1] + 0.0722 * pa[i + 2];
    const luzB = 0.2126 * pb[i] + 0.7152 * pb[i + 1] + 0.0722 * pb[i + 2];
    const dif = Math.abs(luzA - luzB);
    const base = luzB * 0.4;

    if (dif > LIMIAR_MUDANCA) {
      mudados++;
      const forca = Math.min(255, (dif - LIMIAR_MUDANCA) * 3);
      pb[i]     = limite(base + forca);
      pb[i + 1] = limite(base + forca * 0.15);
      pb[i + 2] = limite(base + forca * 0.15);
    } else {
      pb[i] = pb[i + 1] = pb[i + 2] = base;
    }
  }

  ctxB.putImageData(saida, 0, 0);
  const blob = await new Promise(ok => folhaB.toBlob(ok, 'image/jpeg', 0.92));
  return blob ? { blob, mudanca: (mudados / pontos) * 100 } : null;
}

// A mesma receita do CSS, feita à mão: cinza → inverter → contraste.
function aplicarNaMao(ctx, larg, alt, f) {
  let imagem;
  try {
    imagem = ctx.getImageData(0, 0, larg, alt);
  } catch (e) {
    return;   // canvas "sujo": melhor a foto sem filtro do que foto nenhuma
  }
  const px = imagem.data;
  const inv = inversaoEfetiva(f);
  const k = f.contraste;

  for (let i = 0; i < px.length; i += 4) {
    let r = px[i], g = px[i + 1], b = px[i + 2];

    if (f.cinza) {
      const luz = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r += (luz - r) * f.cinza;
      g += (luz - g) * f.cinza;
      b += (luz - b) * f.cinza;
    }
    if (inv) {
      r += (255 - 2 * r) * inv;
      g += (255 - 2 * g) * inv;
      b += (255 - 2 * b) * inv;
    }
    if (k !== 1) {
      r = (r - 127.5) * k + 127.5;
      g = (g - 127.5) * k + 127.5;
      b = (b - 127.5) * k + 127.5;
    }

    px[i]     = r < 0 ? 0 : r > 255 ? 255 : r;
    px[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    px[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(imagem, 0, 0);
}

function piscar() {
  if (!dados.clarao) return;
  const brilho = el('clarao');
  brilho.classList.remove('piscar');
  void brilho.offsetWidth;   // reinicia a animação
  brilho.classList.add('piscar');
}

/* ——— carretel da sessão ————————————————————————————————————— */
const carretel = [];   // { id, blob, url, nome, quando }

function guardarFoto(blob, f, extra) {
  const quando = new Date();
  const foto = {
    id: 'f' + Date.now().toString(36),
    blob,
    url: URL.createObjectURL(blob),
    nome: 'negativo-' + carimbo(quando) + '.jpg',
    quando,
    filtro: modoAtual().cor ? f.nome : 'sem filtro',
    zoom: dados.zoom,
    modo: (extra && extra.rotulo) || modoAtual().nome,
    mudanca: extra && extra.mudanca
  };
  carretel.unshift(foto);

  while (carretel.length > LIMITE_CARRETEL) {
    URL.revokeObjectURL(carretel.pop().url);
  }

  desenharCarretel();
  if (!extra) mostrarAviso('Foto tirada — toque na miniatura para salvar.');
  return foto;
}

function carimbo(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
         p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function desenharCarretel() {
  const botao = el('btn-carretel');
  const contador = el('contador');
  const img = el('miniatura-img');

  botao.disabled = carretel.length === 0;
  contador.hidden = carretel.length === 0;
  contador.textContent = carretel.length;
  if (carretel.length) img.src = carretel[0].url;
  else img.removeAttribute('src');   // src vazio vira ícone de imagem quebrada
  img.hidden = carretel.length === 0;

  const lista = el('lista-carretel');
  lista.textContent = '';
  for (const foto of carretel) {
    const item = document.createElement('li');
    const alvo = document.createElement('button');
    alvo.type = 'button';
    alvo.setAttribute('aria-label', 'Abrir foto de ' + hora(foto.quando));
    const mini = document.createElement('img');
    mini.src = foto.url;
    mini.alt = '';
    alvo.append(mini);
    alvo.addEventListener('click', () => abrirFoto(foto));
    item.append(alvo);
    lista.append(item);
  }
  el('carretel-vazio').hidden = carretel.length > 0;
}

function hora(d) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ——— painel da foto ——— */
let fotoAberta = null;

function abrirFoto(foto) {
  fotoAberta = foto;
  el('previa-img').src = foto.url;
  const comZoom = foto.zoom > 1.05 ? ' · ' + foto.zoom.toFixed(1) + '×' : '';
  const comModo = foto.modo && foto.modo !== 'Foto' ? foto.modo + ' · ' : '';
  const comMudanca = typeof foto.mudanca === 'number'
    ? ' · ' + foto.mudanca.toFixed(1) + '% da imagem mudou' : '';
  el('previa-legenda').textContent = comModo + foto.filtro + comZoom + comMudanca +
    ' · ' + hora(foto.quando) + ' · ' + foto.nome;
  abrirPainel(painelFoto);
}

async function entregar(blob, nome, titulo) {
  const arquivo = new File([blob], nome, { type: blob.type });

  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: titulo });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // o usuário desistiu, não é erro
    }
  }

  // Sem folha de compartilhamento: baixa o arquivo.
  const endereco = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = endereco;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(endereco), 10000);
  mostrarAviso('Baixado: ' + nome);
}

el('btn-salvar').addEventListener('click', () => {
  if (!fotoAberta) return;
  entregar(fotoAberta.blob, fotoAberta.nome, 'Foto em negativo');
});

el('btn-pdf').addEventListener('click', async () => {
  if (!fotoAberta) return;
  try {
    const pdf = await pdfDaFoto(fotoAberta);
    entregar(pdf, fotoAberta.nome.replace(/\.jpg$/, '.pdf'), 'Foto em negativo (PDF)');
  } catch (e) {
    mostrarAviso('Não deu para montar o PDF desta foto.');
  }
});

/* ——— transcrever ————————————————————————————————————————————
   O app não lê o texto da foto: ele entrega a foto pronta para quem
   lê — o Claude, uma conversa, um e-mail — junto com o pedido já
   escrito. O pedido também vai para a área de transferência, porque
   alguns apps levam só a imagem da folha de compartilhamento.
   ———————————————————————————————————————————————————————————— */
function pedidoDeTranscricao(foto) {
  const quando = foto.quando.toLocaleDateString('pt-BR') + ' ' + hora(foto.quando);
  return [
    'Transcreva em texto os campos desta foto.',
    '',
    '- um campo por linha, no formato TAG: valor unidade',
    '- agrupe por área/seção, na ordem em que aparecem',
    '- campo vazio: escreva "(sem leitura)" — não invente número',
    '- anote a cor do valor quando houver (verde, amarelo, vermelho)',
    '- diga o que não deu para ler, em vez de adivinhar',
    '- no fim, repita tudo separado por ponto e vírgula, para planilha',
    '',
    'Foto: Câmera Negativo · filtro ' + foto.filtro +
      (foto.zoom > 1.05 ? ' · zoom ' + foto.zoom.toFixed(1) + '×' : '') +
      ' · ' + quando
  ].join('\n');
}

el('btn-transcrever').addEventListener('click', async () => {
  if (!fotoAberta) return;
  const pedido = pedidoDeTranscricao(fotoAberta);

  // Copiar antes de compartilhar: depois da folha abrir, o toque do
  // usuário já não vale como permissão para mexer na área de transferência.
  let copiou = false;
  try {
    await navigator.clipboard.writeText(pedido);
    copiou = true;
  } catch (e) {
    // Sem permissão de área de transferência: o pedido ainda vai no compartilhamento.
  }

  const arquivo = new File([fotoAberta.blob], fotoAberta.nome, { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], text: pedido, title: 'Transcrever esta foto' });
      mostrarAviso(copiou ? 'Enviado. Se o app abrir só com a foto, cole o pedido.'
                          : 'Enviado — peça a transcrição no app escolhido.');
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // o usuário desistiu, não é erro
    }
  }

  // Sem folha de compartilhamento (computador): baixa a foto e deixa o pedido copiado.
  await entregar(fotoAberta.blob, fotoAberta.nome, 'Foto para transcrever');
  mostrarAviso(copiou ? 'Foto baixada e pedido copiado — cole junto com a imagem.'
                      : 'Foto baixada — envie junto o pedido de transcrição.');
});

/* ——— PDF ——————————————————————————————————————————————————————
   O JPEG entra inteiro no PDF, pelo filtro /DCTDecode: nada é
   recomprimido nem redesenhado, a folha carrega exatamente a foto que
   foi tirada. O arquivo é montado byte a byte aqui — sem biblioteca
   nenhuma, para o app continuar abrindo e funcionando sem internet.
   ———————————————————————————————————————————————————————————— */
const A4_CURTO = 595.28;    // pontos (72 por polegada)
const A4_LONGO = 841.89;
const MARGEM = 28;
const ALTURA_RODAPE = 18;

// Largura, altura e nº de componentes vêm do próprio cabeçalho do JPEG.
function lerJpeg(bytes) {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    const marca = bytes[i + 1];
    if (marca === 0xD8 || marca === 0x01 || (marca >= 0xD0 && marca <= 0xD7)) { i += 2; continue; }
    const tamanho = (bytes[i + 2] << 8) | bytes[i + 3];
    const quadro = marca >= 0xC0 && marca <= 0xCF &&
                   marca !== 0xC4 && marca !== 0xC8 && marca !== 0xCC;
    if (quadro) {
      return {
        altura: (bytes[i + 5] << 8) | bytes[i + 6],
        largura: (bytes[i + 7] << 8) | bytes[i + 8],
        componentes: bytes[i + 9]
      };
    }
    if (tamanho < 2) break;
    i += 2 + tamanho;
  }
  return null;
}

// O PDF guarda texto em bytes; Helvetica com WinAnsi cobre os acentos.
function bytesLatin1(texto) {
  const saida = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    saida[i] = c < 256 ? c : 63;   // 63 = '?'
  }
  return saida;
}

function escaparPdf(texto) {
  return texto.replace(/([\\()])/g, '\\$1');
}

async function pdfDaFoto(foto) {
  const jpeg = new Uint8Array(await foto.blob.arrayBuffer());
  const info = lerJpeg(jpeg);
  if (!info || !info.largura || !info.altura) throw new Error('JPEG ilegível');

  const espaco = info.componentes === 1 ? '/DeviceGray'
               : info.componentes === 4 ? '/DeviceCMYK' : '/DeviceRGB';

  // A folha acompanha a foto: retrato para foto em pé, paisagem para deitada.
  const deitada = info.largura > info.altura;
  const pl = deitada ? A4_LONGO : A4_CURTO;
  const pa = deitada ? A4_CURTO : A4_LONGO;
  const areaL = pl - 2 * MARGEM;
  const areaA = pa - 2 * MARGEM - ALTURA_RODAPE;
  const escala = Math.min(areaL / info.largura, areaA / info.altura);
  const dl = info.largura * escala;
  const da = info.altura * escala;
  const dx = (pl - dl) / 2;
  const dy = MARGEM + ALTURA_RODAPE + (areaA - da) / 2;

  const quando = foto.quando;
  const legenda = 'Câmera Negativo · ' + foto.filtro +
    (foto.zoom > 1.05 ? ' · ' + foto.zoom.toFixed(1) + '×' : '') +
    ' · ' + quando.toLocaleDateString('pt-BR') + ' ' + hora(quando) +
    ' · ' + info.largura + '×' + info.altura + ' px';

  const conteudo =
    'q\n' + dl.toFixed(2) + ' 0 0 ' + da.toFixed(2) + ' ' +
    dx.toFixed(2) + ' ' + dy.toFixed(2) + ' cm\n/Im0 Do\nQ\n' +
    'BT /F1 8 Tf 0.35 0.35 0.35 rg ' + MARGEM + ' ' +
    (MARGEM * 0.7).toFixed(2) + ' Td (' + escaparPdf(legenda) + ') Tj ET\n';

  /* ——— montagem: cada objeto anota onde começou, para a tabela xref ——— */
  const partes = [];
  const inicios = [];
  let total = 0;

  const por = pedaco => {
    const b = typeof pedaco === 'string' ? bytesLatin1(pedaco) : pedaco;
    partes.push(b);
    total += b.length;
  };
  const objeto = (n, dicionario, fluxo) => {
    inicios[n] = total;
    por(n + ' 0 obj\n' + dicionario + '\n');
    if (fluxo !== undefined) {
      por('stream\n');
      por(fluxo);
      por('\nendstream\n');
    }
    por('endobj\n');
  };

  por('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objeto(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objeto(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
    pl.toFixed(2) + ' ' + pa.toFixed(2) + '] ' +
    '/Resources << /XObject << /Im0 4 0 R >> /Font << /F1 6 0 R >> >> ' +
    '/Contents 5 0 R >>');
  objeto(4, '<< /Type /XObject /Subtype /Image /Width ' + info.largura +
    ' /Height ' + info.altura + ' /ColorSpace ' + espaco +
    ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>', jpeg);
  objeto(5, '<< /Length ' + bytesLatin1(conteudo).length + ' >>', conteudo);
  objeto(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ' +
    '/Encoding /WinAnsiEncoding >>');

  const inicioXref = total;
  let xref = 'xref\n0 7\n0000000000 65535 f \n';
  for (let n = 1; n <= 6; n++) {
    xref += String(inicios[n]).padStart(10, '0') + ' 00000 n \n';
  }
  por(xref);
  por('trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n' + inicioXref + '\n%%EOF\n');

  return new Blob(partes, { type: 'application/pdf' });
}

el('btn-descartar').addEventListener('click', () => {
  if (!fotoAberta) return;
  const i = carretel.indexOf(fotoAberta);
  if (i >= 0) {
    URL.revokeObjectURL(carretel[i].url);
    carretel.splice(i, 1);
  }
  fotoAberta = null;
  el('previa-img').removeAttribute('src');
  desenharCarretel();
  fecharPaineis();
});

/* ——— filtros na tela ——— */
function desenharFiltros() {
  const barra = el('filtros');
  barra.textContent = '';
  for (const f of FILTROS) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'filtro';
    botao.textContent = f.nome;
    botao.setAttribute('aria-pressed', String(f.id === dados.filtro));
    botao.addEventListener('click', () => {
      dados.filtro = f.id;
      gravar();
      desenharFiltros();
      aplicarAparencia();
    });
    barra.append(botao);
  }
}

/* ——— trocar de câmera ——— */
el('btn-trocar').addEventListener('click', () => {
  dados.frontal = !dados.frontal;
  gravar();
  ligarCamera();
});

el('btn-ligar').addEventListener('click', ligarCamera);

/* ——— painéis ——— */
function abrirPainel(painel) {
  fecharPaineis();
  painel.hidden = false;
  fundoPainel.hidden = false;
}

function fecharPaineis() {
  paineis.forEach(p => { p.hidden = true; });
  fundoPainel.hidden = true;
}

el('btn-ajustes').addEventListener('click', () => abrirPainel(painelAjustes));
el('btn-carretel').addEventListener('click', () => abrirPainel(painelCarretel));
fundoPainel.addEventListener('click', fecharPaineis);
document.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fecharPaineis));
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') fecharPaineis();
});

/* ——— aparência e ajustes ——— */
function aplicarAparencia() {
  const raiz = document.documentElement;
  raiz.style.setProperty('--filtro', receitaCss(filtroAtual()));
  raiz.style.setProperty('--espelho', (dados.frontal && dados.espelhar) ? -1 : 1);

  el('grade').hidden = !dados.grade;
  el('estado').textContent = filtroAtual().nome +
    (dados.forca < 100 && filtroAtual().inverter ? ' · ' + dados.forca + '%' : '');

  mostrarZoom();
  el('valor-forca').textContent = dados.forca + '%';
  el('valor-tempo').textContent = dados.tempo ? dados.tempo + ' s' : 'desligado';
  el('ajuste-forca').value = dados.forca;
  el('ajuste-tempo').value = dados.tempo;
  el('ajuste-espelhar').checked = dados.espelhar;
  el('ajuste-grade').checked = dados.grade;
  el('ajuste-clarao').checked = dados.clarao;
  el('ajuste-nitidez').checked = dados.nitidez;
  el('valor-quadros').textContent = dados.quadros;
  el('ajuste-quadros').value = dados.quadros;
  el('valor-ganho').textContent = dados.ganho + '×';
  el('ajuste-ganho').value = dados.ganho;
}

el('ajuste-forca').addEventListener('input', ev => {
  dados.forca = Number(ev.target.value);
  aplicarAparencia();
  gravar();
});
el('ajuste-tempo').addEventListener('input', ev => {
  dados.tempo = Number(ev.target.value);
  aplicarAparencia();
  gravar();
});
for (const [id, campo] of [['ajuste-espelhar', 'espelhar'], ['ajuste-grade', 'grade'],
                           ['ajuste-clarao', 'clarao'], ['ajuste-nitidez', 'nitidez']]) {
  el(id).addEventListener('change', ev => {
    dados[campo] = ev.target.checked;
    aplicarAparencia();
    gravar();
  });
}

/* ——— aviso flutuante ——— */
let avisoPendente = 0;
function mostrarAviso(texto) {
  avisoEl.textContent = texto;
  avisoEl.hidden = false;
  clearTimeout(avisoPendente);
  avisoPendente = setTimeout(() => { avisoEl.hidden = true; }, 2600);
}

/* ——— início ——— */
desenharFiltros();
aplicarAparencia();
aplicarModo();
desenharCarretel();
mostrarRecado('Toque em Ligar a câmera e autorize o acesso.', true);
ligarCamera();

// Sai de cena: solta a câmera (a luzinha apaga). Volta: liga de novo.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') desligarCamera();
  else if (!fluxo) ligarCamera();
});
window.addEventListener('pagehide', desligarCamera);

/* ——— versão e atualização ——— */
document.querySelectorAll('[data-versao]').forEach(e => { e.textContent = 'v' + VERSAO; });

// A versão no visor também é atalho para os ajustes, onde está o resto.
el('versao-topo').addEventListener('click', () => abrirPainel(painelAjustes));

const estadoVersao = el('estado-versao');

function mostrarEstadoVersao(texto, nova) {
  estadoVersao.textContent = texto;
  estadoVersao.classList.toggle('nova', Boolean(nova));
  el('versao-topo').classList.toggle('nova', Boolean(nova));
}

if (!('serviceWorker' in navigator)) {
  mostrarEstadoVersao('Aberto pela internet — para funcionar offline, adicione à Tela de Início.');
} else {
  mostrarEstadoVersao('Esta é a versão instalada no aparelho.');

  // Sem controlador agora é primeira instalação, não atualização: nada a anunciar.
  const jaEstavaInstalado = Boolean(navigator.serviceWorker.controller);

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(registro => {
      registro.addEventListener('updatefound', () => {
        const chegando = registro.installing;
        if (!chegando) return;
        chegando.addEventListener('statechange', () => {
          if (chegando.state === 'activated' && jaEstavaInstalado) {
            mostrarEstadoVersao('Nova versão pronta — toque em Atualizar.', true);
            el('aviso-versao').hidden = false;
          }
        });
      });

      const procurar = () => registro.update().catch(() => {});
      procurar();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') procurar();
      });
    }).catch(() => {
      mostrarEstadoVersao('Não deu para preparar o modo offline neste navegador.');
    });
  });
}

el('btn-atualizar').addEventListener('click', () => location.reload());
