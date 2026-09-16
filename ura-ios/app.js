/* ————————————————————————————————————————————————————————————
   IOs da URA — consulta e treino das Instruções Operacionais.
   Tudo roda no aparelho: a base fica no IndexedDB e não é enviada
   para lugar nenhum.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.0.0';   // precisa casar com a VERSAO do sw.js

const $ = s => document.querySelector(s);
const esc = s => Busca.escapar(s);

let base = null;
let progresso = { acertos: {}, erros: {} };
let feitos = {};          // passos marcados durante a execução
let telaAnterior = 'buscar';

/* ————————————————— navegação ————————————————— */

const TELAS = ['vazio', 'buscar', 'ios', 'treinar', 'ajustes', 'leitor'];

function mostrar(nome) {
  TELAS.forEach(t => { const el = $('#tela-' + t); if (el) el.hidden = t !== nome; });
  $('#abas').hidden = (nome === 'vazio');
  document.querySelectorAll('.aba').forEach(b => b.classList.toggle('ativa', b.dataset.tela === nome));
  if (nome === 'buscar') setTimeout(() => $('#busca').focus(), 60);
}

document.querySelectorAll('.aba').forEach(b => b.addEventListener('click', () => {
  const t = b.dataset.tela;
  if (t === 'ios') listarIOs();
  if (t === 'treinar') telaTreino();
  if (t === 'ajustes') telaAjustes();
  mostrar(t);
}));

$('#btn-voltar').addEventListener('click', () => mostrar(telaAnterior));

/* ————————————————— buscar ————————————————— */

const RÓTULOS = { sigla: 'Equipamentos e siglas', io: 'Instruções', passo: 'Passos', trecho: 'Trechos' };

let tempoBusca = null;
$('#busca').addEventListener('input', ev => {
  clearTimeout(tempoBusca);
  const texto = ev.target.value;
  tempoBusca = setTimeout(() => desenharBusca(texto), 120);
});

function desenharBusca(texto) {
  const caixa = $('#resultados');
  if (!texto.trim()) {
    caixa.innerHTML = `<p class="dica">Busque por <b>equipamento</b> (VL-, BA-, TQ-), <b>código</b> da IO,
      <b>área</b> (AA-330) ou pelo que precisa fazer (drenagem, retrolavagem).</p>`;
    return;
  }
  const achados = Busca.procurar(texto);
  if (!achados.length) {
    caixa.innerHTML = `<p class="dica">Nada encontrado para <b>${esc(texto)}</b>.
      O app só mostra o que está nas IOs carregadas — ele não inventa resposta.</p>`;
    return;
  }
  const grupos = {};
  achados.forEach(u => (grupos[u.tipo] = grupos[u.tipo] || []).push(u));
  // o grupo com o melhor resultado vem primeiro: quem busca um código quer a
  // instrução, quem busca a tag de um equipamento quer o equipamento
  const ordem = Object.keys(grupos).sort((a, b) => grupos[b][0].nota - grupos[a][0].nota);
  let html = '';
  ordem.forEach(tipo => {
    const lista = grupos[tipo];
    if (!lista) return;
    html += `<p class="grupo-titulo">${RÓTULOS[tipo]}</p>`;
    lista.slice(0, tipo === 'trecho' ? 8 : 14).forEach((u, i) => {
      const id = `${tipo}-${i}`;
      cache[id] = u;
      html += `<button class="cartao" type="button" data-ir="${id}">
        <span class="marca">${esc(u.rotulo)}</span>
        <div>${Busca.destacar(u.corpo, texto)}</div>
        ${u.obs ? `<div class="passo-obs fraco pequeno">${Busca.destacar(u.obs, texto)}</div>` : ''}
        <div class="fonte">${esc(u.fonte)}</div>
      </button>`;
    });
  });
  caixa.innerHTML = html;
  caixa.scrollTop = 0;
}

const cache = {};   // resultados da busca, para abrir a IO ao tocar

$('#resultados').addEventListener('click', ev => {
  const bt = ev.target.closest('[data-ir]');
  if (!bt) return;
  const u = cache[bt.dataset.ir];
  if (!u) return;
  const codigo = (u.ir && u.ir.io) || u.io;
  if (base.ios.some(d => d.codigo === codigo)) abrirIO(codigo, u.ir);
});

/* ————————————————— lista de instruções ————————————————— */

function listarIOs() {
  const porArea = {};
  base.ios.forEach(d => (porArea[d.area] = porArea[d.area] || []).push(d));
  let html = '';
  Object.keys(porArea).sort().forEach(area => {
    html += `<p class="area-cabecalho">${esc(area)}</p>`;
    porArea[area].sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach(d => {
      html += `<button class="cartao" type="button" data-io="${esc(d.codigo)}">
        <span class="marca">${esc(d.codigo)}</span>
        <div>${esc(d.titulo)}</div>
        <div class="fonte">rev. ${esc(d.revisao)} · ${esc(d.data)} · ${d.n_paginas} páginas ·
          ${(d.procedimentos || []).length} procedimentos</div>
      </button>`;
    });
  });
  $('#lista-ios').innerHTML = html;
}

$('#lista-ios').addEventListener('click', ev => {
  const bt = ev.target.closest('[data-io]');
  if (bt) abrirIO(bt.dataset.io);
});

/* ————————————————— leitor da instrução ————————————————— */

function abrirIO(codigo, ir) {
  const d = base.ios.find(x => x.codigo === codigo);
  if (!d) return;
  const atual = TELAS.find(t => !$('#tela-' + t).hidden);
  if (atual && atual !== 'leitor') telaAnterior = atual;

  $('#leitor-codigo').textContent = d.codigo;
  $('#leitor-subtitulo').textContent = `${d.titulo} · rev. ${d.revisao} · ${d.data}`;

  let html = '';
  (d.procedimentos || []).forEach((pr, ip) => {
    html += `<details class="secao" ${ir && ir.procedimento === ip ? 'open' : ''}>
      <summary>${esc(pr.titulo)} <span class="fraco pequeno">· ${pr.passos.length} passos · pág. ${pr.pagina}</span></summary>
      <div class="conteudo passos" data-proc="${ip}">`;
    pr.passos.forEach((p, i) => {
      const chave = `${d.codigo}|${ip}|${i}`;
      html += `<div class="passo ${feitos[chave] ? 'feito' : ''}" data-chave="${esc(chave)}">
        <span class="n">${esc(p.n || '·')}</span>
        <div><div class="acao">${esc(p.acao)}</div>
        ${p.obs ? `<div class="obs">${esc(p.obs)}</div>` : ''}</div>
      </div>`;
    });
    html += `</div></details>`;
  });

  (d.secoes || []).forEach(s => {
    if (!s.texto) return;
    html += `<details class="secao" ${ir && ir.secao === s.n ? 'open' : ''}>
      <summary>${esc(s.n)}. ${esc(s.titulo)}</summary>
      <div class="conteudo">${esc(s.texto)}</div>
    </details>`;
  });

  if (d.nota) html += `<p class="fraco pequeno" style="margin-top:14px">⚠️ ${esc(d.nota)}</p>`;
  html += `<p class="fraco pequeno" style="margin-top:14px">
    Documento com controle de cópias. Confira sempre a revisão vigente antes de executar.</p>`;

  $('#leitor-corpo').innerHTML = html;
  $('#leitor-corpo').scrollTop = 0;
  mostrar('leitor');
  const aberto = $('#leitor-corpo details[open]');
  if (aberto) setTimeout(() => aberto.scrollIntoView({ block: 'start' }), 80);
}

/* marcar passo executado — some ao trocar de turno, é só apoio visual */
$('#leitor-corpo').addEventListener('click', ev => {
  const p = ev.target.closest('.passo');
  if (!p) return;
  const chave = p.dataset.chave;
  feitos[chave] = !feitos[chave];
  p.classList.toggle('feito', feitos[chave]);
  Dados.gravarFeitos(feitos);
});

/* ————————————————— treinar ————————————————— */

function telaTreino() {
  const areas = [...new Set(base.ios.map(d => d.area))].sort();
  const tipos = [...new Set(base.perguntas.map(q => q.tipo))];
  $('#area-treino').innerHTML = `
    <p class="fraco">Perguntas montadas a partir das IOs. Cada resposta mostra de qual instrução saiu.</p>
    <p class="grupo-titulo">Escolha o assunto</p>
    <button class="cartao" type="button" data-treino='{}'>
      <span class="marca">TUDO</span><div>Todas as instruções — ${base.perguntas.length} perguntas</div></button>
    ${areas.map(a => {
      const n = Treino.disponiveis(base, { area: a }).length;
      return n ? `<button class="cartao" type="button" data-treino='{"area":"${a}"}'>
        <span class="marca">${esc(a)}</span><div>${n} perguntas</div></button>` : '';
    }).join('')}
    <p class="grupo-titulo">Ou por tipo de pergunta</p>
    ${tipos.map(t => {
      const n = Treino.disponiveis(base, { tipo: t }).length;
      return `<button class="cartao" type="button" data-treino='{"tipo":"${t}"}'>
        <span class="marca">${esc((Treino.NOMES[t] || t).toUpperCase())}</span>
        <div>${n} perguntas</div></button>`;
    }).join('')}
    ${desempenho()}`;
}

function desempenho() {
  const ios = Object.keys({ ...progresso.acertos, ...progresso.erros });
  if (!ios.length) return '';
  const linhas = ios.map(io => {
    const a = progresso.acertos[io] || 0, e = progresso.erros[io] || 0;
    return { io, a, e, taxa: a / (a + e) };
  }).sort((x, y) => x.taxa - y.taxa).slice(0, 8);
  return `<p class="grupo-titulo">Onde você mais erra</p>` + linhas.map(l =>
    `<button class="cartao" type="button" data-treino='{"io":"${l.io}"}'>
      <span class="marca">${esc(l.io)}</span>
      <div>${Math.round(l.taxa * 100)}% de acerto — ${l.a} certas, ${l.e} erradas</div>
    </button>`).join('');
}

$('#area-treino').addEventListener('click', ev => {
  const bt = ev.target.closest('[data-treino]');
  if (bt) {
    const escopo = JSON.parse(bt.dataset.treino);
    if (Treino.comecar(base, escopo)) desenharPergunta();
    return;
  }
  const alt = ev.target.closest('[data-alt]');
  if (alt) return responderTreino(Number(alt.dataset.alt));
  if (ev.target.closest('[data-proxima]')) {
    if (Treino.avancar()) desenharPergunta(); else fimDaRodada();
  }
  if (ev.target.closest('[data-sair]')) telaTreino();
  if (ev.target.closest('[data-ver-io]')) abrirIO(ev.target.closest('[data-ver-io]').dataset.verIo);
});

function desenharPergunta() {
  const r = Treino.rodada, q = Treino.atual();
  if (!q) return fimDaRodada();
  $('#area-treino').innerHTML = `
    <div class="placar">
      <span>Pergunta <b>${r.indice + 1}</b> de ${r.fila.length}</span>
      <span>Certas <b>${r.acertos}</b></span>
      <span>Erradas <b>${r.erros}</b></span>
    </div>
    <div class="barra"><i style="width:${(r.indice / r.fila.length) * 100}%"></i></div>
    <h2>${esc(q.enunciado)}</h2>
    <div id="alternativas">
      ${q.alternativas.map((a, i) =>
        `<button class="alternativa" type="button" data-alt="${i}">${esc(a)}</button>`).join('')}
    </div>
    <button class="botao perigo" type="button" data-sair style="margin-top:10px">Encerrar rodada</button>`;
  $('#area-treino').scrollTop = 0;
}

function responderTreino(escolha) {
  const q = Treino.atual();
  const res = Treino.responder(escolha);
  if (!res) return;
  document.querySelectorAll('[data-alt]').forEach((b, i) => {
    b.disabled = true;
    if (i === res.correta) b.classList.add('certa');
    else if (i === escolha) b.classList.add('errada');
  });
  Dados.gravarProgresso(Treino.anotar(progresso, q, res.certo));
  const aviso = document.createElement('div');
  aviso.innerHTML = `
    <p class="${res.certo ? '' : 'fraco'}" style="margin-top:12px">
      ${res.certo ? '✅ Certo.' : '❌ A resposta correta está marcada em verde.'}
      <span class="fraco pequeno">Fonte: ${esc(res.fonte.io)} · ${esc(res.fonte.onde)}</span>
    </p>
    <button class="botao" type="button" data-ver-io="${esc(res.fonte.io)}">Abrir a ${esc(res.fonte.io)}</button>
    <button class="botao principal" type="button" data-proxima>Próxima</button>`;
  $('#alternativas').after(aviso);
}

function fimDaRodada() {
  const r = Treino.rodada;
  const total = r.acertos + r.erros;
  $('#area-treino').innerHTML = `
    <h2>Rodada encerrada</h2>
    <p>${r.acertos} certas e ${r.erros} erradas — ${Math.round((r.acertos / (total || 1)) * 100)}% de acerto.</p>
    <p class="fraco pequeno">As perguntas erradas voltaram para o fim da fila durante a rodada.</p>
    <button class="botao principal" type="button" data-sair>Escolher outro assunto</button>`;
}

/* ————————————————— ajustes ————————————————— */

function telaAjustes() {
  const nPassos = base.ios.reduce((s, d) => s + (d.procedimentos || [])
    .reduce((t, p) => t + p.passos.length, 0), 0);
  $('#area-ajustes').innerHTML = `
    <p class="grupo-titulo">Base carregada</p>
    <div class="cartao" style="cursor:default">
      <div><b>${base.ios.length}</b> instruções · <b>${nPassos}</b> passos ·
        <b>${base.siglas.length}</b> siglas · <b>${base.perguntas.length}</b> perguntas</div>
      <div class="fonte">${esc(base.nomeArquivo || 'base')} · gerada em ${esc(base.gerado || '—')}</div>
    </div>
    <p class="grupo-titulo">Trocar a base</p>
    <p class="fraco pequeno">Ao revisar uma IO, gere o arquivo de novo e carregue aqui. A base antiga é substituída.</p>
    <label class="botao">Escolher arquivo
      <input type="file" id="arquivo-troca" accept=".json,application/json" hidden></label>
    <p class="grupo-titulo">Apagar</p>
    <p class="fraco pequeno">Remove as instruções deste aparelho. O app volta à tela inicial.</p>
    <button class="botao perigo" type="button" id="btn-apagar">Apagar a base do aparelho</button>
    <p class="fraco pequeno" style="margin-top:22px">
      IOs da URA ${VERSAO}. Consulta e treino sobre documentos com controle de cópias:
      confira sempre a revisão vigente antes de executar qualquer procedimento.</p>`;

  $('#arquivo-troca').addEventListener('change', ev => carregar(ev.target.files[0], true));
  $('#btn-apagar').addEventListener('click', async () => {
    if (!confirm('Apagar as instruções deste aparelho?')) return;
    await Dados.removerBase();
    base = null;
    mostrar('vazio');
  });
}

/* ————————————————— carga da base ————————————————— */

$('#arquivo-inicial').addEventListener('change', ev => carregar(ev.target.files[0], false));

async function carregar(arquivo, jaEstava) {
  if (!arquivo) return;
  const estado = $('#estado-carga');
  if (estado) estado.textContent = 'Lendo o arquivo…';
  try {
    base = await Dados.importarArquivo(arquivo);
    Busca.indexar(base);
    if (estado) estado.textContent = '';
    if (jaEstava) telaAjustes();
    mostrar('buscar');
  } catch (e) {
    const recado = 'Não deu para carregar: ' + e.message;
    if (estado) estado.textContent = recado; else alert(recado);
  }
}

/* ————————————————— início ————————————————— */

(async function iniciar() {
  try {
    [base, progresso, feitos] = await Promise.all([
      Dados.lerBase(), Dados.lerProgresso(), Dados.lerFeitos()
    ]);
  } catch (e) {
    console.warn('sem acesso ao armazenamento', e);
  }
  if (base) { Busca.indexar(base); mostrar('buscar'); } else { mostrar('vazio'); }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('service worker', e));
  }
})();
