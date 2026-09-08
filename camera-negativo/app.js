/* ————————————————————————————————————————————————————————————
   Câmera Negativo — a câmera do aparelho com as cores invertidas,
   na tela e na foto salva. Nada é enviado para lugar nenhum:
   a imagem nasce e morre dentro do aparelho.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.3.0';   // precisa casar com a VERSAO do sw.js
const CHAVE = 'camera-negativo:v1';
const LIMITE_CARRETEL = 24;   // fotos guardadas na memória da sessão
const ZOOM_MAX = 6;           // além disso o recorte não tem mais pixel para dar

const el = id => document.getElementById(id);

const video = el('video');
const recado = el('recado');
const recadoTexto = el('recado-texto');
const painelFoto = el('painel-foto');
const painelCarretel = el('painel-carretel');
const painelAjustes = el('painel-ajustes');
const paineis = [painelFoto, painelCarretel, painelAjustes];
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

/* ——— estado guardado ——— */
const padrao = () => ({
  filtro: 'negativo',
  zoom: 1,
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

  // O zoom digital vira recorte central, no mesmo formato do quadro:
  // a foto guarda um pouco mais das laterais do que cabe no visor,
  // nunca menos, e sai no tamanho real dos pixels — sem esticar nada.
  const z = Math.max(1, zoomDigital);
  const rl = Math.max(16, Math.round(larg / z));
  const ra = Math.max(16, Math.round(alt / z));
  const rx = Math.round((larg - rl) / 2);
  const ry = Math.round((alt - ra) / 2);

  const tela = document.createElement('canvas');
  tela.width = rl;
  tela.height = ra;
  const ctx = tela.getContext('2d');

  // A foto espelhada acompanha o visor: o que se vê é o que sai.
  if (dados.frontal && dados.espelhar) {
    ctx.translate(rl, 0);
    ctx.scale(-1, 1);
  }

  const f = filtroAtual();
  const receita = receitaCss(f);
  const filtroNativo = ('filter' in ctx) && receita !== 'none';
  if (filtroNativo) ctx.filter = receita;

  ctx.drawImage(video, rx, ry, rl, ra, 0, 0, rl, ra);

  ctx.filter = 'none';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!filtroNativo && receita !== 'none') aplicarNaMao(ctx, rl, ra, f);

  piscar();

  const blob = await new Promise(ok => tela.toBlob(ok, 'image/jpeg', 0.92));
  if (!blob) return mostrarAviso('Não deu para salvar esta foto.');

  guardarFoto(blob, f);
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

function guardarFoto(blob, f) {
  const quando = new Date();
  const foto = {
    id: 'f' + Date.now().toString(36),
    blob,
    url: URL.createObjectURL(blob),
    nome: 'negativo-' + carimbo(quando) + '.jpg',
    quando,
    filtro: f.nome,
    zoom: dados.zoom
  };
  carretel.unshift(foto);

  while (carretel.length > LIMITE_CARRETEL) {
    URL.revokeObjectURL(carretel.pop().url);
  }

  desenharCarretel();
  mostrarAviso('Foto tirada — toque na miniatura para salvar.');
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
  el('previa-legenda').textContent = foto.filtro + comZoom + ' · ' + hora(foto.quando) +
    ' · ' + foto.nome;
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
                           ['ajuste-clarao', 'clarao']]) {
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
el('versao').textContent = 'v' + VERSAO;
el('versao-topo').textContent = 'v' + VERSAO;

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
