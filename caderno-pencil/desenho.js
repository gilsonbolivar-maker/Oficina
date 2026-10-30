/* ————————————————————————————————————————————————————————————
   Folha de desenho: a tinta da Pencil, sem virar texto.

   Os traços são guardados como pontos, não como imagem: ocupa
   pouco espaço, o desfazer é imediato e o desenho é redesenhado
   nítido quando a tela muda de tamanho ou troca de tema.

   Os pontos ficam numa régua própria de 1000 unidades de largura
   (a altura acompanha a proporção da tela), então o mesmo desenho
   serve para o iPad em pé, deitado ou em janela.
   ———————————————————————————————————————————————————————————— */
'use strict';

const Desenho = (() => {
  const REGUA = 1000;          // unidades na largura da folha
  const GROSSURA = 3.4;        // espessura da caneta, em unidades
  const GROSSURA_BORRACHA = 26;

  let tela = null;             // <canvas>
  let ctx = null;
  let tracos = [];             // [{ ferramenta, pontos: [[x, y, pressao], …] }]
  let emCurso = null;
  let ferramenta = 'caneta';
  let aoMudar = () => {};
  let viuCaneta = false;       // depois da primeira Pencil, o dedo não desenha
  let largura = 0, altura = 0; // tamanho em pixels de CSS

  /* ——— tamanho e nitidez ——— */
  function ajustarTamanho() {
    if (!tela) return;
    const caixa = tela.getBoundingClientRect();
    if (!caixa.width || !caixa.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    largura = caixa.width;
    altura = caixa.height;
    tela.width = Math.round(largura * dpr);
    tela.height = Math.round(altura * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redesenhar();
  }

  const escala = () => largura / REGUA;

  function corDaTinta() {
    const valor = getComputedStyle(document.documentElement)
      .getPropertyValue('--texto').trim();
    return valor || '#1d1a14';
  }

  /* ——— desenhar ——— */
  function traçarSegmento(traco, de, ate) {
    const k = escala();
    const p = traco.pontos;
    const pressao = (p[ate][2] + p[de][2]) / 2;
    const base = traco.ferramenta === 'borracha' ? GROSSURA_BORRACHA : GROSSURA;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = base * k * (0.55 + pressao * 0.9);
    if (traco.ferramenta === 'borracha') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.strokeStyle = corDaTinta();
    }

    // Curva pelos pontos médios: tira o serrilhado do traço à mão.
    const a = p[de], b = p[ate];
    const meioA = de > 0
      ? [(p[de - 1][0] + a[0]) / 2, (p[de - 1][1] + a[1]) / 2]
      : [a[0], a[1]];
    const meioB = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

    ctx.beginPath();
    ctx.moveTo(meioA[0] * k, meioA[1] * k);
    ctx.quadraticCurveTo(a[0] * k, a[1] * k, meioB[0] * k, meioB[1] * k);
    ctx.stroke();
    ctx.restore();
  }

  function redesenhar() {
    if (!ctx) return;
    ctx.clearRect(0, 0, largura, altura);
    for (const traco of tracos) {
      if (traco.pontos.length === 1) {
        // Um toque só: um ponto redondo.
        const k = escala();
        const [x, y, pressao] = traco.pontos[0];
        const base = traco.ferramenta === 'borracha' ? GROSSURA_BORRACHA : GROSSURA;
        ctx.save();
        if (traco.ferramenta === 'borracha') ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = traco.ferramenta === 'borracha' ? 'rgba(0,0,0,1)' : corDaTinta();
        ctx.beginPath();
        ctx.arc(x * k, y * k, base * k * (0.55 + pressao * 0.9) / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      for (let i = 1; i < traco.pontos.length; i++) traçarSegmento(traco, i - 1, i);
    }
  }

  /* ——— o dedo e a Pencil ——— */
  function ponto(ev) {
    const caixa = tela.getBoundingClientRect();
    const k = REGUA / caixa.width;
    const pressao = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.5;
    return [
      Math.round((ev.clientX - caixa.left) * k * 10) / 10,
      Math.round((ev.clientY - caixa.top) * k * 10) / 10,
      Math.round(pressao * 100) / 100
    ];
  }

  function aceita(ev) {
    if (ev.pointerType === 'pen') { viuCaneta = true; return true; }
    // Depois que a Pencil apareceu, o dedo só rola a tela — é o apoio da mão.
    return !viuCaneta;
  }

  function comecar(ev) {
    if (!aceita(ev)) return;
    ev.preventDefault();
    tela.setPointerCapture(ev.pointerId);
    emCurso = { ferramenta, pontos: [ponto(ev)] };
    tracos.push(emCurso);
    redesenhar();
  }

  function seguir(ev) {
    if (!emCurso || ev.pointerId === undefined) return;
    ev.preventDefault();
    const eventos = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
    for (const e of eventos) {
      const novo = ponto(e);
      const ultimo = emCurso.pontos[emCurso.pontos.length - 1];
      if (Math.abs(novo[0] - ultimo[0]) < 1 && Math.abs(novo[1] - ultimo[1]) < 1) continue;
      emCurso.pontos.push(novo);
      traçarSegmento(emCurso, emCurso.pontos.length - 2, emCurso.pontos.length - 1);
    }
  }

  function terminar() {
    if (!emCurso) return;
    emCurso = null;
    redesenhar();
    aoMudar();
  }

  /* ——— o que o app usa ——— */
  return {
    montar(elemento, aoMudarCallback) {
      tela = elemento;
      ctx = tela.getContext('2d');
      aoMudar = aoMudarCallback || (() => {});

      tela.addEventListener('pointerdown', comecar);
      tela.addEventListener('pointermove', seguir);
      tela.addEventListener('pointerup', terminar);
      tela.addEventListener('pointercancel', terminar);
      tela.addEventListener('pointerleave', terminar);

      if (window.ResizeObserver) new ResizeObserver(ajustarTamanho).observe(tela);
      window.addEventListener('orientationchange', () => setTimeout(ajustarTamanho, 200));
      ajustarTamanho();
    },

    // Chamado quando a folha de desenho aparece: o canvas escondido não tem tamanho.
    acertarTamanho: ajustarTamanho,
    repintar: redesenhar,

    carregar(guardados) {
      tracos = Array.isArray(guardados) ? guardados.slice() : [];
      emCurso = null;
      redesenhar();
    },

    pegar: () => tracos,
    vazio: () => tracos.length === 0,
    quantos: () => tracos.length,

    usar(qual) { ferramenta = qual === 'borracha' ? 'borracha' : 'caneta'; },
    ferramentaAtual: () => ferramenta,

    desfazer() {
      if (!tracos.length) return false;
      tracos.pop();
      redesenhar();
      aoMudar();
      return true;
    },

    limpar() {
      if (!tracos.length) return false;
      tracos = [];
      redesenhar();
      aoMudar();
      return true;
    },

    /* Imagem para copiar ou enviar: fundo pintado, senão o PNG sai
       transparente e some em qualquer app de fundo claro. */
    paraBlob() {
      return new Promise(resolve => {
        if (!tela || !tracos.length) { resolve(null); return; }
        const copia = document.createElement('canvas');
        copia.width = tela.width;
        copia.height = tela.height;
        const c = copia.getContext('2d');
        c.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--fundo').trim() || '#ffffff';
        c.fillRect(0, 0, copia.width, copia.height);
        c.drawImage(tela, 0, 0);
        copia.toBlob(b => resolve(b), 'image/png');
      });
    }
  };
})();
