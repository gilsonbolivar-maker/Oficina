/* ————————————————————————————————————————————————————————————
   Câmera Medida — lança linhas sobre a foto para avaliar o tamanho
   do objeto e a distância até ele.

   O navegador não lê o sensor de profundidade (LiDAR). A medida sai
   por referência: uma linha sobre algo de tamanho conhecido dá a
   escala (cm por pixel) para tudo o que estiver no mesmo plano. A
   distância até a câmera sai do ângulo de visão da lente.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.0.0';   // precisa casar com a VERSAO do sw.js

for (const lugar of document.querySelectorAll('[data-versao]')) lugar.textContent = 'v' + VERSAO;

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ————————————————— ajustes guardados ————————————————— */

const REFERENCIAS = [
  { id: 'cartao', nome: 'Cartão (8,56 cm)', cm: 8.56 },
  { id: 'a4-maior', nome: 'A4 lado maior (29,7 cm)', cm: 29.7 },
  { id: 'a4-menor', nome: 'A4 lado menor (21 cm)', cm: 21 },
  { id: 'moeda', nome: 'Moeda de R$ 1 (2,7 cm)', cm: 2.7 },
  { id: 'livre', nome: 'Outro tamanho…', cm: null }
];
const CHAVE_AJUSTES = 'camera-medida:ajustes';
const ajustes = Object.assign({ ref: 'cartao', livre: 30, fov: 67, grade: 'perspectiva' }, ler(CHAVE_AJUSTES));

function ler(chave) {
  try { return JSON.parse(localStorage.getItem(chave)) || {}; } catch (e) { return {}; }
}
function gravarAjustes() {
  try { localStorage.setItem(CHAVE_AJUSTES, JSON.stringify(ajustes)); } catch (e) { /* sem armazenamento */ }
}
function referenciaCm() {
  const r = REFERENCIAS.find(x => x.id === ajustes.ref) || REFERENCIAS[0];
  return r.cm != null ? r.cm : (ajustes.livre > 0 ? ajustes.livre : null);
}

/* ————————————————— números ————————————————— */

const num = (v, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
function lerNumero(txt) {
  const v = parseFloat(String(txt || '').trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}
/** 8.56 → "8,6 cm" · 154 → "1,54 m" */
function comprimento(cm) {
  return cm >= 100 ? num(cm / 100, 2) + ' m' : num(cm, cm < 10 ? 2 : 1) + ' cm';
}
function area(cm2) {
  return cm2 >= 10000 ? num(cm2 / 10000, 2) + ' m²' : num(cm2, 0) + ' cm²';
}
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

let avisoTimer = null;
function avisar(txt, ms = 2600) {
  const el = $('#aviso');
  el.textContent = txt;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ————————————————— estado ————————————————— */

const video = $('#video');
const foto = $('#foto');
const tela = $('#sobre');
const ctx = tela.getContext('2d');

const estado = {
  modo: 'vivo',            // 'vivo' (câmera) ou 'medir' (foto congelada)
  ferramenta: 'referencia',
  ref: null,               // { a, b } em pixels da foto
  linhas: [],              // [{ a, b }]
  rets: [],                // [{ a, b }] cantos opostos
  historico: [],           // o que desfazer, na ordem
  arrastando: null,        // { item, ponto } ou { novo, tipo }
  inclinacao: null         // { frente, lado } em graus, do sensor
};

/* ————————————————— câmera ————————————————— */

let fluxo = null;

async function ligarCamera() {
  $('#sem-camera').hidden = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    semCamera('Este navegador não abre a câmera. Use “Foto da galeria”.');
    return;
  }
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    video.srcObject = fluxo;
    await video.play().catch(() => {});
  } catch (e) {
    semCamera(e && e.name === 'NotAllowedError'
      ? 'A câmera foi negada. Libere nas permissões do navegador — ou use “Foto da galeria”.'
      : 'Não deu para abrir a câmera. Use “Foto da galeria”.');
  }
}
function semCamera(txt) {
  const el = $('#sem-camera');
  el.textContent = txt;
  el.hidden = false;
}
function desligarCamera() {
  if (fluxo) fluxo.getTracks().forEach(t => t.stop());
  fluxo = null;
}

/* ————————————————— nível (inclinação do aparelho) ————————————————— */

let pediuSensor = false;
async function pedirSensor() {
  if (pediuSensor) return;
  pediuSensor = true;
  try {
    // iPhone/iPad pedem licença, e só a partir de um toque.
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') return;
    }
  } catch (e) { return; }
  window.addEventListener('deviceorientation', ev => {
    if (ev.beta == null) return;
    // Em pé, de frente para o objeto, o beta fica perto de 90°.
    estado.inclinacao = { frente: ev.beta - 90, lado: ev.gamma };
    mostrarNivel();
  });
}
function mostrarNivel() {
  const n = $('#nivel');
  if (estado.modo !== 'vivo' || !estado.inclinacao) { n.hidden = true; return; }
  const f = Math.round(estado.inclinacao.frente), l = Math.round(estado.inclinacao.lado);
  const ok = Math.abs(f) <= 3 && Math.abs(l) <= 3;
  n.hidden = false;
  n.classList.toggle('ok', ok);
  $('#nivel-texto').textContent = ok ? 'Nivelado ✓' : 'Inclinação ' + f + '° · lado ' + l + '°';
}

/* ————————————————— tela de desenho ————————————————— */

function ajustarTela() {
  const r = tela.getBoundingClientRect();
  const d = window.devicePixelRatio || 1;
  tela.width = Math.round(r.width * d);
  tela.height = Math.round(r.height * d);
  ctx.setTransform(d, 0, 0, d, 0, 0);
  desenhar();
}

/** Onde a foto aparece no palco (object-fit: contain). */
function caixaFoto() {
  const r = tela.getBoundingClientRect();
  const w = foto.naturalWidth || 1, h = foto.naturalHeight || 1;
  const k = Math.min(r.width / w, r.height / h);
  return { k, x: (r.width - w * k) / 2, y: (r.height - h * k) / 2, w, h, W: r.width, H: r.height };
}
const naTela = (p, c) => ({ x: c.x + p.x * c.k, y: c.y + p.y * c.k });
const naFoto = (p, c) => ({
  x: Math.max(0, Math.min(c.w, (p.x - c.x) / c.k)),
  y: Math.max(0, Math.min(c.h, (p.y - c.y) / c.k))
});

function desenhar() {
  const r = tela.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  if (estado.modo === 'vivo') desenharGrade(ctx, r.width, r.height);
  else desenharMedidas(ctx, caixaFoto(), 1);
}

/** As linhas lançadas sobre a câmera ao vivo. */
function desenharGrade(g, W, H) {
  g.save();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255, 176, 32, 0.75)';
  const cx = W / 2, cy = H / 2;
  if (ajustes.grade === 'perspectiva') {
    // Raios saindo do ponto de fuga (centro) e linhas de profundidade.
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const R = Math.hypot(W, H);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); g.stroke();
    }
    for (let i = 1; i <= 6; i++) {
      const f = Math.pow(i / 6, 1.6);
      const w = W * f, h = H * f;
      g.globalAlpha = 0.35 + 0.65 * (i / 6);
      g.strokeRect(cx - w / 2, cy - h / 2, w, h);
    }
    g.globalAlpha = 1;
  } else if (ajustes.grade === 'quadriculado') {
    const passo = Math.min(W, H) / 8;
    for (let x = cx % passo; x < W; x += passo) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = cy % passo; y < H; y += passo) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  }
  // Mira e linha do horizonte.
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx - 18, cy); g.lineTo(cx + 18, cy); g.moveTo(cx, cy - 18); g.lineTo(cx, cy + 18); g.stroke();
  g.restore();
}

/** Referência, linhas e retângulos, na escala da tela (k) ou da foto salva. */
function desenharMedidas(g, c, escala) {
  const esc = cmPorPixel();
  const p = pt => naTela(pt, c);
  const lw = 3 * escala, fonte = 15 * escala;

  if (estado.ref) {
    const a = p(estado.ref.a), b = p(estado.ref.b);
    tracar(g, a, b, '#38d6ff', lw, true, escala);
    rotulo(g, meio(a, b), 'REF ' + (referenciaCm() != null ? comprimento(referenciaCm()) : '?'), '#38d6ff', fonte, escala);
  }
  estado.linhas.forEach(l => {
    const a = p(l.a), b = p(l.b);
    tracar(g, a, b, '#ffb020', lw, false, escala);
    rotulo(g, meio(a, b), esc ? comprimento(dist(l.a, l.b) * esc) : 'defina a referência', '#ffb020', fonte, escala);
  });
  estado.rets.forEach(rt => {
    const a = p(rt.a), b = p(rt.b);
    g.save();
    g.strokeStyle = '#ffb020'; g.lineWidth = lw;
    g.fillStyle = 'rgba(255, 176, 32, 0.12)';
    g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    g.restore();
    [a, b, { x: a.x, y: b.y }, { x: b.x, y: a.y }].forEach(q => alca(g, q, '#ffb020', escala));
    const larg = Math.abs(rt.b.x - rt.a.x), alt = Math.abs(rt.b.y - rt.a.y);
    if (esc) {
      rotulo(g, { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) }, comprimento(larg * esc), '#ffb020', fonte, escala);
      rotulo(g, { x: Math.max(a.x, b.x), y: (a.y + b.y) / 2 }, comprimento(alt * esc), '#ffb020', fonte, escala);
      rotulo(g, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, area(larg * alt * esc * esc), '#ffffff', fonte * 0.9, escala);
    } else {
      rotulo(g, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'defina a referência', '#ffb020', fonte, escala);
    }
  });
}

const meio = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function tracar(g, a, b, cor, lw, tracejada, escala) {
  g.save();
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = lw + 3 * escala;
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  g.strokeStyle = cor; g.lineWidth = lw;
  if (tracejada) g.setLineDash([10 * escala, 7 * escala]);
  g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  g.setLineDash([]);
  // Marcas de ponta, perpendiculares, como numa trena.
  const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2, m = 9 * escala;
  [a, b].forEach(q => {
    g.beginPath();
    g.moveTo(q.x - Math.cos(ang) * m, q.y - Math.sin(ang) * m);
    g.lineTo(q.x + Math.cos(ang) * m, q.y + Math.sin(ang) * m);
    g.stroke();
  });
  g.restore();
  alca(g, a, cor, escala); alca(g, b, cor, escala);
}
function alca(g, q, cor, escala) {
  g.save();
  g.fillStyle = cor; g.strokeStyle = '#000'; g.lineWidth = 1.5 * escala;
  g.beginPath(); g.arc(q.x, q.y, 5 * escala, 0, Math.PI * 2); g.fill(); g.stroke();
  g.restore();
}
function rotulo(g, q, txt, cor, fonte, escala) {
  g.save();
  g.font = '600 ' + fonte + 'px -apple-system, system-ui, sans-serif';
  const w = g.measureText(txt).width + 12 * escala, h = fonte + 10 * escala;
  const x = q.x - w / 2, y = q.y - h - 6 * escala;
  g.fillStyle = 'rgba(0, 0, 0, 0.72)';
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, 6 * escala); else g.rect(x, y, w, h);
  g.fill();
  g.fillStyle = cor;
  g.textBaseline = 'middle';
  g.fillText(txt, x + 6 * escala, y + h / 2);
  g.restore();
}

/* ————————————————— contas ————————————————— */

/** Centímetros por pixel da foto, a partir da referência. */
function cmPorPixel() {
  const cm = referenciaCm();
  if (!estado.ref || !cm) return null;
  const px = dist(estado.ref.a, estado.ref.b);
  return px >= 4 ? cm / px : null;
}

/**
 * Distância estimada da câmera até o plano da referência:
 * d = tamanho real × (metade do lado maior em px) ÷ (tamanho em px × tan(ângulo/2)).
 */
function distanciaCm() {
  const cm = referenciaCm();
  if (!estado.ref || !cm || !(ajustes.fov > 5 && ajustes.fov < 170)) return null;
  const px = dist(estado.ref.a, estado.ref.b);
  const lado = Math.max(foto.naturalWidth, foto.naturalHeight);
  return px >= 4 ? cm * (lado / 2) / (px * Math.tan((ajustes.fov * Math.PI / 180) / 2)) : null;
}

function atualizarEstado() {
  const el = $('#estado');
  if (estado.modo === 'vivo') { el.textContent = 'Aponte para o objeto e fotografe'; return; }
  const d = distanciaCm();
  el.textContent = cmPorPixel()
    ? 'Escala definida' + (d ? ' · distância ≈ ' + comprimento(d) : '')
    : 'Defina a referência';
  const dicas = {
    referencia: 'Arraste sobre o objeto de tamanho conhecido (' +
      (referenciaCm() ? comprimento(referenciaCm()) : 'defina em ⚙') + ').',
    linha: 'Arraste do começo ao fim do que quer medir.',
    retangulo: 'Arraste de um canto ao canto oposto.'
  };
  $('#dica').textContent = dicas[estado.ferramenta] + ' Arraste uma ponta para ajustar.';
}

/* ————————————————— toque sobre a foto ————————————————— */

function pontoDoToque(ev) {
  const r = tela.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

/** A ponta mais perto do toque (até 24 px), para ajustar em vez de criar. */
function pontaPerto(q, c) {
  let melhor = null, menor = 24;
  const itens = [];
  if (estado.ref) itens.push(estado.ref);
  estado.linhas.forEach(l => itens.push(l));
  estado.rets.forEach(r => itens.push(r));
  itens.forEach(item => ['a', 'b'].forEach(k => {
    const d = dist(q, naTela(item[k], c));
    if (d < menor) { menor = d; melhor = { item, ponto: k }; }
  }));
  return melhor;
}

tela.addEventListener('pointerdown', ev => {
  if (estado.modo !== 'medir') return;
  ev.preventDefault();
  tela.setPointerCapture(ev.pointerId);
  const c = caixaFoto();
  const q = pontoDoToque(ev);
  const perto = pontaPerto(q, c);
  if (perto) { estado.arrastando = perto; return; }
  const p = naFoto(q, c);
  const item = { a: p, b: { x: p.x, y: p.y } };
  estado.arrastando = { item, ponto: 'b', novo: estado.ferramenta };
  if (estado.ferramenta === 'referencia') estado.refAnterior = estado.ref, estado.ref = item;
  else if (estado.ferramenta === 'linha') estado.linhas.push(item);
  else estado.rets.push(item);
  desenhar();
});

tela.addEventListener('pointermove', ev => {
  const arr = estado.arrastando;
  if (!arr) return;
  ev.preventDefault();
  arr.item[arr.ponto] = naFoto(pontoDoToque(ev), caixaFoto());
  desenhar();
  atualizarEstado();
});

function soltar() {
  const arr = estado.arrastando;
  estado.arrastando = null;
  if (!arr || !arr.novo) { desenhar(); atualizarEstado(); return; }
  const c = caixaFoto();
  const curto = dist(arr.item.a, arr.item.b) * c.k < 10;
  if (arr.novo === 'referencia') {
    if (curto) estado.ref = estado.refAnterior || null;
    else {
      estado.historico.push({ tipo: 'referencia', anterior: estado.refAnterior || null });
      if (referenciaCm() == null) avisar('Defina o tamanho da referência em ⚙ Ajustes.');
      else avisar('Referência: ' + comprimento(referenciaCm()) + '. Agora meça com Linha ou Retângulo.');
    }
  } else {
    const lista = arr.novo === 'linha' ? estado.linhas : estado.rets;
    if (curto) lista.splice(lista.indexOf(arr.item), 1);
    else estado.historico.push({ tipo: arr.novo, item: arr.item });
  }
  estado.refAnterior = undefined;
  desenhar();
  atualizarEstado();
}
tela.addEventListener('pointerup', soltar);
tela.addEventListener('pointercancel', soltar);

function desfazer() {
  const ult = estado.historico.pop();
  if (!ult) { avisar('Nada para desfazer.'); return; }
  if (ult.tipo === 'referencia') estado.ref = ult.anterior;
  else {
    const lista = ult.tipo === 'linha' ? estado.linhas : estado.rets;
    const i = lista.indexOf(ult.item);
    if (i >= 0) lista.splice(i, 1);
  }
  desenhar();
  atualizarEstado();
}

/* ————————————————— foto ————————————————— */

function mostrarModo() {
  const vivo = estado.modo === 'vivo';
  video.hidden = !vivo;
  foto.hidden = vivo;
  $('#grupo-vivo').hidden = !vivo;
  $('#grupo-medir').hidden = vivo;
  mostrarNivel();
  ajustarTela();
  atualizarEstado();
}

function congelar(src) {
  foto.onload = () => {
    estado.modo = 'medir';
    estado.ref = null; estado.linhas = []; estado.rets = []; estado.historico = [];
    escolherFerramenta('referencia');
    desligarCamera();
    mostrarModo();
  };
  foto.onerror = () => avisar('Esse arquivo não é uma imagem que o navegador consiga abrir.', 3500);
  foto.src = src;
}

function fotografar() {
  pedirSensor();
  if (!video.videoWidth) { avisar('A câmera ainda não abriu.'); return; }
  const c = document.createElement('canvas');
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  congelar(c.toDataURL('image/jpeg', 0.92));
}

function abrirArquivo(arq) {
  if (!arq) return;
  const leitor = new FileReader();
  leitor.onload = () => congelar(leitor.result);
  leitor.onerror = () => avisar('Não deu para ler o arquivo.');
  leitor.readAsDataURL(arq);
}

function novaFoto() {
  estado.modo = 'vivo';
  foto.removeAttribute('src');
  mostrarModo();
  ligarCamera();
}

/** A foto em tamanho cheio, com as linhas e as medidas por cima. */
function salvar() {
  const w = foto.naturalWidth, h = foto.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(foto, 0, 0);
  const escala = Math.max(1, Math.max(w, h) / 900);
  desenharMedidas(g, { k: 1, x: 0, y: 0, w, h }, escala);
  // Rodapé com a escala e a distância.
  const d = distanciaCm();
  const txt = 'Câmera Medida ' + VERSAO + (cmPorPixel() ? ' · referência ' + comprimento(referenciaCm()) : '') +
    (d ? ' · distância ≈ ' + comprimento(d) : '');
  rotulo(g, { x: w / 2, y: h - 6 * escala }, txt, '#ffffff', 14 * escala, escala);
  c.toBlob(async blob => {
    if (!blob) { avisar('Não deu para gerar a imagem.'); return; }
    const nome = 'medida-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.jpg';
    const arquivo = new File([blob], nome, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      try { await navigator.share({ files: [arquivo], title: 'Medida' }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    avisar('Foto salva.');
  }, 'image/jpeg', 0.92);
}

/* ————————————————— ferramentas e ajustes ————————————————— */

function escolherFerramenta(f) {
  estado.ferramenta = f;
  $$('.modo').forEach(b => b.classList.toggle('ativo', b.dataset.modo === f));
  atualizarEstado();
}

const NOMES_GRADE = { perspectiva: 'perspectiva', quadriculado: 'quadriculado', nenhuma: 'nenhuma' };
function trocarGrade() {
  pedirSensor();
  const ordem = Object.keys(NOMES_GRADE);
  ajustes.grade = ordem[(ordem.indexOf(ajustes.grade) + 1) % ordem.length];
  gravarAjustes();
  $('#trocar-grade').textContent = 'Grade: ' + NOMES_GRADE[ajustes.grade];
  desenhar();
}

function montarAjustes() {
  const caixa = $('#referencias');
  caixa.innerHTML = '';
  REFERENCIAS.forEach(r => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opcao';
    b.textContent = r.nome;
    b.setAttribute('aria-pressed', String(ajustes.ref === r.id));
    b.addEventListener('click', () => {
      ajustes.ref = r.id;
      gravarAjustes();
      montarAjustes();
      desenhar(); atualizarEstado();
    });
    caixa.appendChild(b);
  });
  $('#campo-livre').hidden = ajustes.ref !== 'livre';
  $('#ref-livre').value = ajustes.livre ? String(ajustes.livre).replace('.', ',') : '';
  $('#fov').value = String(ajustes.fov).replace('.', ',');
}

$('#ref-livre').addEventListener('input', ev => {
  const v = lerNumero(ev.target.value);
  ajustes.livre = v > 0 ? v : null;
  gravarAjustes(); desenhar(); atualizarEstado();
});
$('#fov').addEventListener('input', ev => {
  const v = lerNumero(ev.target.value);
  if (v > 5 && v < 170) { ajustes.fov = v; gravarAjustes(); atualizarEstado(); }
});

function abrirAjustes() { montarAjustes(); $('#painel').hidden = false; $('#fundo').hidden = false; }
function fecharAjustes() { $('#painel').hidden = true; $('#fundo').hidden = true; }

/* ——— tema ——— */

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', tema === 'claro' ? '#f3f5f9' : '#0b1220');
  $$('[data-tema-opcao]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.temaOpcao === tema)));
  try { localStorage.setItem('camera-medida:tema', tema); } catch (e) { /* sem armazenamento */ }
}

/* ————————————————— partida ————————————————— */

$('#fotografar').addEventListener('click', fotografar);
$('#trocar-grade').addEventListener('click', trocarGrade);
$('#abrir-galeria').addEventListener('click', () => { pedirSensor(); $('#arquivo').click(); });
$('#arquivo').addEventListener('change', ev => { abrirArquivo(ev.target.files[0]); ev.target.value = ''; });
$$('.modo').forEach(b => b.addEventListener('click', () => escolherFerramenta(b.dataset.modo)));
$('#desfazer').addEventListener('click', desfazer);
$('#salvar').addEventListener('click', salvar);
$('#nova-foto').addEventListener('click', novaFoto);
$('#abrir-ajustes').addEventListener('click', abrirAjustes);
$('#fechar-ajustes').addEventListener('click', fecharAjustes);
$('#fundo').addEventListener('click', fecharAjustes);
$$('[data-tema-opcao]').forEach(b => b.addEventListener('click', () => aplicarTema(b.dataset.temaOpcao)));
window.addEventListener('resize', ajustarTela);

$('#trocar-grade').textContent = 'Grade: ' + NOMES_GRADE[ajustes.grade];
aplicarTema(document.documentElement.dataset.tema || 'escuro');
mostrarModo();
ligarCamera();

// Redesenha a grade quando o vídeo muda de tamanho.
video.addEventListener('loadedmetadata', ajustarTela);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* http local */ });
  });
}
