/* ————————————————————————————————————————————————————————————
   Sirene sintetizada na hora pela Web Audio API — nenhum arquivo
   de áudio para baixar, então o alarme funciona mesmo sem rede.
   ———————————————————————————————————————————————————————————— */
'use strict';

const Alarme = (() => {
  let ctx = null;
  let mestre = null;
  let nos = null;            // osciladores da sirene em execução
  let vivo = null;           // oscilador mudo que segura o áudio acordado
  let pulso = null;          // repetição da vibração
  let tocando = false;

  /** Cria (ou retoma) o contexto de áudio. Precisa vir de um toque do usuário. */
  function preparar() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      mestre = ctx.createGain();
      mestre.gain.value = 0;
      mestre.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
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

  /** Sirene contínua: frequência varrendo para cima e para baixo, com pulsação. */
  function tocar({ som = true, vibrar = true } = {}) {
    if (tocando) return;
    tocando = true;

    if (vibrar && navigator.vibrate) {
      const padrao = [700, 250, 700, 600];
      navigator.vibrate(padrao);
      pulso = setInterval(() => navigator.vibrate(padrao), 2250);
    }

    if (!som || !preparar()) return;

    const agora = ctx.currentTime;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const varredura = ctx.createOscillator();     // LFO da frequência
    const ganhoVarredura = ctx.createGain();
    const batida = ctx.createOscillator();        // LFO do volume
    const ganhoBatida = ctx.createGain();
    const base = ctx.createConstantSource();
    const envelope = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 720;
    osc2.type = 'square';
    osc2.frequency.value = 361;                   // uma oitava abaixo, dá corpo

    varredura.type = 'triangle';
    varredura.frequency.value = 2.4;
    ganhoVarredura.gain.value = 380;
    varredura.connect(ganhoVarredura);
    ganhoVarredura.connect(osc.frequency);
    ganhoVarredura.connect(osc2.frequency);

    batida.type = 'square';
    batida.frequency.value = 2.2;
    ganhoBatida.gain.value = 0.4;
    base.offset.value = 0.6;
    batida.connect(ganhoBatida);
    ganhoBatida.connect(envelope.gain);
    base.connect(envelope.gain);
    envelope.gain.value = 0;

    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    osc.connect(envelope);
    osc2.connect(g2).connect(envelope);
    envelope.connect(mestre);

    mestre.gain.cancelScheduledValues(agora);
    mestre.gain.setValueAtTime(0.0001, agora);
    mestre.gain.exponentialRampToValueAtTime(0.9, agora + 0.25);

    [osc, osc2, varredura, batida, base].forEach(n => n.start(agora));
    nos = [osc, osc2, varredura, batida, base, ganhoVarredura, ganhoBatida, envelope, g2];
  }

  function parar() {
    tocando = false;
    if (pulso) { clearInterval(pulso); pulso = null; }
    if (navigator.vibrate) navigator.vibrate(0);
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

  /** Bipe curto — usado no aviso de aproximação e no teste. */
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
