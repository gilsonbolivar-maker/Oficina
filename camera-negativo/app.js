/* ————————————————————————————————————————————————————————————
   Câmera Negativo — a câmera do aparelho com as cores invertidas,
   na tela e na foto salva. Nada é enviado para lugar nenhum:
   a imagem nasce e morre dentro do aparelho.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.0.1';   // precisa casar com a VERSAO do sw.js
const CHAVE = 'camera-negativo:v1';
const LIMITE_CARRETEL = 24;   // fotos guardadas na memória da sessão

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
        width: { ideal: 1920 },
        height: { ideal: 1080 }
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
  aplicarAparencia();
}

function desligarCamera() {
  if (fluxo) fluxo.getTracks().forEach(t => t.stop());
  fluxo = null;
  trilha = null;
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

  const tela = document.createElement('canvas');
  tela.width = larg;
  tela.height = alt;
  const ctx = tela.getContext('2d');

  // A foto espelhada acompanha o visor: o que se vê é o que sai.
  if (dados.frontal && dados.espelhar) {
    ctx.translate(larg, 0);
    ctx.scale(-1, 1);
  }

  const f = filtroAtual();
  const receita = receitaCss(f);
  const filtroNativo = ('filter' in ctx) && receita !== 'none';
  if (filtroNativo) ctx.filter = receita;

  ctx.drawImage(video, 0, 0, larg, alt);

  ctx.filter = 'none';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!filtroNativo && receita !== 'none') aplicarNaMao(ctx, larg, alt, f);

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
    filtro: f.nome
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
  el('previa-legenda').textContent = foto.filtro + ' · ' + hora(foto.quando) + ' · ' + foto.nome;
  abrirPainel(painelFoto);
}

el('btn-salvar').addEventListener('click', async () => {
  if (!fotoAberta) return;
  const arquivo = new File([fotoAberta.blob], fotoAberta.nome, { type: 'image/jpeg' });

  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: 'Foto em negativo' });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // o usuário desistiu, não é erro
    }
  }

  // Sem folha de compartilhamento: baixa o arquivo.
  const link = document.createElement('a');
  link.href = fotoAberta.url;
  link.download = fotoAberta.nome;
  document.body.append(link);
  link.click();
  link.remove();
  mostrarAviso('Foto baixada: ' + fotoAberta.nome);
});

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
