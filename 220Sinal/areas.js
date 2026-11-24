/* Zap/220 com as áreas em abas: "Área 220" (este app) e "Área 410" (o Zap410,
   do repositório Zap.das.Areas, aberto num quadro por cima).
   Cada área continua sendo o seu app: pessoas, convites e alarmes não se
   misturam. As duas ficam escutando juntas; quando chega alarme na área que
   está escondida, a tela pula para ela e a aba pisca.
   Dentro do APK, só o Zap/220 usa o alarme do aparelho (tela apagada); o
   Zap410 escuta enquanto o app estiver aberto. */
'use strict';
(function () {
  if (window.top !== window) return;   // já dentro do Zap Painel: sem abas aqui
  const ZAP410 = '../../Zap.das.Areas/410/painel/';   // mesmo endereço (github.io): dá para vigiar o alarme
  const CHAVE = '220-areas-aba';

  const css = document.createElement('style');
  css.textContent =
    '#areas-abas{position:sticky;top:0;z-index:8;display:flex;gap:.4rem;padding:.4rem .6rem;background:var(--bg);border-bottom:1px solid var(--line)}' +
    '#areas-abas button{flex:1;min-height:2.8rem;border:1px solid var(--line);border-radius:.8rem;background:var(--surface);color:var(--muted);font-weight:650;position:relative}' +
    '#areas-abas button.on{background:var(--alert);border-color:var(--alert);color:#fff}' +
    '#areas-abas button.chamando:not(.on){color:var(--fg);animation:areas-pisca 1s infinite}' +
    '@keyframes areas-pisca{50%{background:#f3b0ac}}' +
    '#area-410{position:fixed;left:0;width:100%;border:0;z-index:7;background:var(--bg)}' +
    '#area-410.oculto{visibility:hidden;pointer-events:none}' +
    'body.na-410{overflow:hidden}';
  document.head.appendChild(css);

  const barra = document.createElement('div');
  barra.id = 'areas-abas';
  barra.setAttribute('role', 'tablist');
  barra.innerHTML = '<button type="button" data-area="220" role="tab">Área 220</button>' +
    '<button type="button" data-area="410" role="tab">Área 410</button>';
  document.body.insertBefore(barra, document.body.firstChild);

  const quadro = document.createElement('iframe');
  quadro.id = 'area-410';
  quadro.title = 'Zap410';
  quadro.allow = 'autoplay; wake-lock; clipboard-write; web-share';
  quadro.src = ZAP410;
  document.body.appendChild(quadro);

  const botoes = [...barra.querySelectorAll('button')];
  let atual = '220';
  try { if (localStorage.getItem(CHAVE) === '410') atual = '410'; } catch {}

  // Quadro é elemento "substituído": top/bottom não esticam, então a altura vai em px.
  function encaixar() {
    const topo = Math.max(0, barra.getBoundingClientRect().bottom);
    quadro.style.top = topo + 'px';
    quadro.style.height = Math.max(0, window.innerHeight - topo) + 'px';
  }
  function mostrar(area) {
    atual = area;
    try { localStorage.setItem(CHAVE, area); } catch {}
    botoes.forEach(b => {
      b.classList.toggle('on', b.dataset.area === area);
      if (b.dataset.area === area) b.classList.remove('chamando');
    });
    quadro.classList.toggle('oculto', area !== '410');
    document.body.classList.toggle('na-410', area === '410');
    if (area === '410') window.scrollTo(0, 0);
    encaixar();
  }
  botoes.forEach(b => b.onclick = () => mostrar(b.dataset.area));
  addEventListener('resize', encaixar);
  addEventListener('scroll', encaixar, { passive: true });
  mostrar(atual);

  function chamou(area) {
    if (atual === area) return;
    const b = botoes.find(x => x.dataset.area === area);
    mostrar(area);
    b.classList.add('chamando');
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  }

  // Alarme da 220 (aqui mesmo): volta para a aba da 220.
  const alarme220 = document.getElementById('alarm');
  if (alarme220) new MutationObserver(() => { if (!alarme220.hidden) chamou('220'); })
    .observe(alarme220, { attributes: true, attributeFilter: ['hidden'] });

  // Alarme da 410 (dentro do quadro). Se o quadro não puder ser lido, só não pula de aba.
  let vigia = null;
  quadro.addEventListener('load', function ligar() {
    if (vigia) vigia.disconnect();
    let el = null;
    try { el = quadro.contentDocument && quadro.contentDocument.getElementById('alarm'); } catch {}
    if (!el) { setTimeout(() => { try { if (quadro.contentDocument) ligar(); } catch {} }, 1500); return; }
    vigia = new MutationObserver(() => { if (!el.hidden) chamou('410'); });
    vigia.observe(el, { attributes: true, attributeFilter: ['hidden'] });
  });
})();
