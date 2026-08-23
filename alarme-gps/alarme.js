/* ————————————————————————————————————————————————————————————
   A sirene é gerada pelo próprio navegador — nenhum arquivo de áudio
   para baixar, então o alarme funciona sem rede.

   Ela toca por um elemento <audio> alimentado por um WAV montado na
   hora. Isso importa no iPhone e no iPad: som feito só pela Web Audio
   API entra na categoria "ambiente" e o modo silencioso o cala, enquanto
   a reprodução de mídia continua sendo ouvida. A Web Audio fica como
   reserva, para os bipes curtos e caso o elemento seja bloqueado.
   ———————————————————————————————————————————————————————————— */
'use strict';

const Alarme = (() => {
  const TAXA = 22050;        // amostras por segundo
  const VOLTA = 4;           // duração da parte sonora, em segundos
  const MUDO = 0.25;         // trecho silencioso no início (veja liberar())

  let ctx = null;
  let mestre = null;
  let nos = null;            // osciladores da sirene de reserva
  let vivo = null;           // oscilador inaudível que segura o áudio acordado
  let pulso = null;          // repetição da vibração
  let elemento = null;       // <audio> com a sirene
  let liberado = false;
  let tocando = false;

  /* ————————————————— o WAV da sirene ————————————————— */

  /**
   * Sirene de 4 s que emenda sem costura: a frequência varre 720 ± 380 Hz
   * dez vezes e o volume pulsa oito vezes, tudo em ciclos inteiros.
   */
  function montarWav() {
    const nMudo = Math.round(TAXA * MUDO);
    const nSom = TAXA * VOLTA;
    const total = nMudo + nSom;
    const buffer = new ArrayBuffer(44 + total * 2);
    const dv = new DataView(buffer);

    const texto = (pos, s) => {
      for (let i = 0; i < s.length; i++) dv.setUint8(pos + i, s.charCodeAt(i));
    };
    const bytes = total * 2;
    texto(0, 'RIFF');
    dv.setUint32(4, 36 + bytes, true);
    texto(8, 'WAVE');
    texto(12, 'fmt ');
    dv.setUint32(16, 16, true);      // tamanho do bloco fmt
    dv.setUint16(20, 1, true);       // PCM
    dv.setUint16(22, 1, true);       // mono
    dv.setUint32(24, TAXA, true);
    dv.setUint32(28, TAXA * 2, true);
    dv.setUint16(32, 2, true);       // bytes por quadro
    dv.setUint16(34, 16, true);      // bits por amostra
    texto(36, 'data');
    dv.setUint32(40, bytes, true);

    let fase = 0;
    for (let i = 0; i < nSom; i++) {
      const t = i / TAXA;
      const freq = 720 + 380 * Math.sin(2 * Math.PI * 2.5 * t);
      fase += 2 * Math.PI * freq / TAXA;
      const senoide = Math.sin(fase);
      const onda = 0.55 * senoide + 0.45 * (senoide >= 0 ? 1 : -1);  // seno + quadrada, corta melhor
      const envelope = Math.sin(2 * Math.PI * 2 * t) >= 0 ? 1 : 0.24;
      const v = Math.max(-1, Math.min(1, onda * envelope));
      dv.setInt16(44 + (nMudo + i) * 2, Math.round(v * 32000), true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Prepara o <audio> e o "libera": o iOS só deixa tocar depois de um
   * play() partido de um toque do usuário. Como o WAV começa com um
   * quarto de segundo de silêncio, essa liberação não faz barulho.
   */
  function liberar() {
    if (!elemento) {
      elemento = new Audio(URL.createObjectURL(montarWav()));
      elemento.loop = true;
      elemento.preload = 'auto';
      elemento.setAttribute('playsinline', '');
      elemento.hidden = true;
      document.body.appendChild(elemento);   // no iOS, elemento solto pode ser recolhido
    }
    if (liberado) return;
    const p = elemento.play();
    if (p && p.then) {
      p.then(() => {
        if (tocando) return;               // já é o alarme de verdade tocando
        elemento.pause();
        elemento.currentTime = 0;
        liberado = true;
      }).catch(() => { /* ainda sem gesto do usuário */ });
    }
  }

  /* ————————————————— Web Audio (bipes e reserva) ————————————————— */

  function preparar() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        ctx = new AC();
        mestre = ctx.createGain();
        mestre.gain.value = 0;
        mestre.connect(ctx.destination);
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    liberar();
    return ctx;
  }

  /** Mantém o pipeline de áudio ativo durante a vigilância (som inaudível). */
  function manterVivo(ativar) {
    if (ativar) {
      if (!preparar() || vivo) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.frequency.value = 40;
      osc.connect(g).connect(ctx.destination);
      osc.start();
      vivo = { osc, g };
    } else if (vivo) {
      try { vivo.osc.stop(); } catch (e) { /* já parado */ }
      vivo.osc.disconnect();
      vivo.g.disconnect();
      vivo = null;
    }
  }

  /** Sirene de reserva, sintetizada, para quando o <audio> for bloqueado. */
  function sireneReserva() {
    if (!ctx || nos) return;
    const agora = ctx.currentTime;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const varredura = ctx.createOscillator();
    const ganhoVarredura = ctx.createGain();
    const envelope = ctx.createGain();
    const g2 = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 720;
    osc2.type = 'square';
    osc2.frequency.value = 361;
    varredura.type = 'triangle';
    varredura.frequency.value = 2.4;
    ganhoVarredura.gain.value = 380;
    g2.gain.value = 0.35;
    envelope.gain.value = 0.9;

    varredura.connect(ganhoVarredura);
    ganhoVarredura.connect(osc.frequency);
    ganhoVarredura.connect(osc2.frequency);
    osc.connect(envelope);
    osc2.connect(g2).connect(envelope);
    envelope.connect(mestre);

    mestre.gain.cancelScheduledValues(agora);
    mestre.gain.setValueAtTime(0.0001, agora);
    mestre.gain.exponentialRampToValueAtTime(0.9, agora + 0.25);

    [osc, osc2, varredura].forEach(n => n.start(agora));
    nos = [osc, osc2, varredura, ganhoVarredura, envelope, g2];
  }

  function pararReserva() {
    if (!ctx || !nos) { nos = null; return; }
    const agora = ctx.currentTime;
    mestre.gain.cancelScheduledValues(agora);
    mestre.gain.setValueAtTime(mestre.gain.value || 0.0001, agora);
    mestre.gain.exponentialRampToValueAtTime(0.0001, agora + 0.15);
    const antigos = nos;
    nos = null;
    setTimeout(() => {
      antigos.forEach(n => {
        try { if (n.stop) n.stop(); } catch (e) { /* já parado */ }
        n.disconnect();
      });
    }, 250);
  }

  /* ————————————————— controle ————————————————— */

  function tocar({ som = true, vibrar = true } = {}) {
    if (tocando) return;
    tocando = true;

    if (vibrar && navigator.vibrate) {
      const padrao = [700, 250, 700, 600];
      navigator.vibrate(padrao);
      pulso = setInterval(() => navigator.vibrate(padrao), 2250);
    }
    if (!som) return;

    preparar();
    if (!elemento) { sireneReserva(); return; }
    elemento.currentTime = 0;
    const p = elemento.play();
    if (p && p.catch) p.catch(() => sireneReserva());
  }

  function parar() {
    tocando = false;
    if (pulso) { clearInterval(pulso); pulso = null; }
    if (navigator.vibrate) navigator.vibrate(0);
    if (elemento) { elemento.pause(); elemento.currentTime = 0; }
    pararReserva();
  }

  /** Bipe curto — aviso de aproximação. */
  function bipe(vezes = 2) {
    if (!preparar()) return;
    const agora = ctx.currentTime;
    for (let i = 0; i < vezes; i++) {
      const t = agora + i * 0.28;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    }
    if (navigator.vibrate) navigator.vibrate([120, 90, 120]);
  }

  return {
    preparar,
    manterVivo,
    tocar,
    parar,
    bipe,
    get tocando() { return tocando; }
  };
})();
