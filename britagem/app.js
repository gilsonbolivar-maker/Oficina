/* ————————————————————————————————————————————————————————————
   Britagem — relatório de turno: paradas, detector de metal e
   leituras. Tudo é guardado no aparelho e funciona sem internet.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.4.0';   // precisa casar com a VERSAO do sw.js

const EQUIPAMENTOS = ['AA140', 'Rebritagem', 'Primário'];
const MOTIVOS = [
  'Moega baixa', 'Moega vazia', 'Moega cheia', 'Troca de turno', 'Jantar',
  'Afunilamento', 'Entupimento', 'Obstrução no chute', 'Elétrica',
  'Mecânica', 'Falha no detector de metal', 'Movimentar TP'
];
const TURNOS = ['A', 'B', 'C', 'D', 'E'];

/** 'A' vira "Turno A"; um nome escrito por extenso fica como foi digitado. */
const nomeTurno = t => (t && t.nome) ? (t.nome.length <= 2 ? 'Turno ' + t.nome : t.nome) : '';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const estado = {
  turnos: [],
  atual: null,     // id do turno aberto na tela
  prefs: {},
  form: null
};

/* ————————————————— tempo ————————————————— */

const agora = () => new Date().toISOString();

/** "2026-10-09T16:30:00" -> "16h30" */
function hhmm(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0');
}

/** "2026-10-09T16:30:00" -> "16:30", para o campo de hora. */
function paraCampo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** Hora digitada + a data do turno. Vira o dia seguinte quando o turno vira a noite. */
function doCampo(hora, turno) {
  if (!hora) return null;
  const [h, m] = hora.split(':').map(Number);
  const base = new Date(turno ? turno.inicio : agora());
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  if (turno && d.getTime() < base.getTime() - 3600000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

const minutos = (a, b) => (!a || !b) ? null : Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));

/**
 * Até quando contar o que ficou em aberto. Turno encerrado para no fim dele;
 * turno em andamento para em agora, com um teto de 16h para uma parada
 * esquecida aberta não virar um total de dias.
 */
function relogio(t) {
  if (!t) return agora();
  if (t.fim) return t.fim;
  const teto = new Date(new Date(t.inicio).getTime() + 16 * 3600000).toISOString();
  const a = agora();
  return a < teto ? a : teto;
}

/** 75 -> "1h15" · 47 -> "47min" */
function duracao(min) {
  if (min === null || min === undefined) return '—';
  if (min < 60) return min + 'min';
  const h = Math.floor(min / 60);
  const r = min % 60;
  return h + 'h' + (r ? String(r).padStart(2, '0') : '');
}

const hoje = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

function dataBonita(data) {
  const [a, m, d] = data.split('-');
  return d + '/' + m + '/' + a.slice(2);
}

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ————————————————— números ————————————————— */

/**
 * Lê o que foi digitado no campo decimal. O teclado do celular em
 * português oferece vírgula, então ela vale tanto quanto o ponto.
 * Devolve null para campo vazio e NaN para o que não é número.
 */
function lerNumero(texto) {
  const t = String(texto == null ? '' : texto).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  return Number(t);
}

/** 4193.1 -> "4193,1", para a tela sair na vírgula de sempre. */
function mostrarNumero(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return String(v).replace('.', ',');
}

/* ————————————————— guardar ————————————————— */

async function salvar() {
  try {
    await Dados.gravarTurnos(estado.turnos);
  } catch (e) {
    avisar('Não deu para guardar neste aparelho.');
  }
  desenhar();
}

const turnoAtual = () => estado.turnos.find(t => t.id === estado.atual) || null;

let avisoTimer = null;
function avisar(txt) {
  const el = $('#aviso');
  el.textContent = txt;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ————————————————— tempo rodando ————————————————— */

/**
 * Os intervalos em que aquele equipamento esteve funcionando: do começo do
 * turno até a primeira parada, entre uma parada e a seguinte, e da última
 * até o fim do turno. Paradas que se sobrepõem contam como uma só.
 */
function intervalosRodando(t, equip) {
  const fimTurno = relogio(t);
  const ps = t.paradas.filter(p => p.equip === equip)
    .slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

  const saida = [];
  let ponteiro = t.inicio;
  ps.forEach(p => {
    if (new Date(p.inicio) > new Date(ponteiro)) {
      saida.push({ inicio: ponteiro, fim: p.inicio });
    }
    const fim = p.fim || fimTurno;
    if (new Date(fim) > new Date(ponteiro)) ponteiro = fim;
  });
  if (new Date(fimTurno) > new Date(ponteiro)) {
    saida.push({ inicio: ponteiro, fim: fimTurno, correndo: !t.fim });
  }
  return saida;
}

/**
 * Tempo parado somado até esta parada, contando as que começaram antes
 * dela e ela mesma. Com `equip`, só daquele equipamento; sem, o turno todo.
 */
function acumuladoAte(t, p, equip) {
  return t.paradas
    .filter(x => (!equip || x.equip === equip) &&
      new Date(x.inicio) <= new Date(p.inicio))
    .reduce((soma, x) => soma + (minutos(x.inicio, x.fim || relogio(t)) || 0), 0);
}

/** Quanto aquele equipamento rodou antes desta parada começar. */
function rodouAntes(t, p) {
  const anteriores = t.paradas.filter(x => x.equip === p.equip && x !== p &&
    new Date(x.inicio) < new Date(p.inicio));
  let ponteiro = t.inicio;
  anteriores.forEach(x => {
    const fim = x.fim || relogio(t);
    if (new Date(fim) > new Date(ponteiro)) ponteiro = fim;
  });
  const m = minutos(ponteiro, p.inicio);
  return m && m > 0 ? m : null;
}

/* ————————————————— linha do tempo ————————————————— */

function fichaParada(p, t) {
  const min = minutos(p.inicio, p.fim || relogio(t));
  const aberta = !p.fim;
  const div = document.createElement('div');
  div.className = 'registro' + (aberta ? ' aberto' : '');
  div.innerHTML =
    '<div class="corpo">' +
      '<div class="linha1">' +
        '<span class="equip"></span>' +
        '<span class="horas"></span>' +
        (aberta ? '<span class="etiqueta aberta">em andamento</span>' : '') +
      '</div>' +
      '<span class="motivo"></span>' +
      '<span class="rodou"></span>' +
      '<span class="acumulado"></span>' +
      '<div class="acoes-linha">' +
        (aberta ? '<button class="botao principal" data-encerrar="1" type="button">Encerrar agora</button>' : '') +
        '<button class="botao" data-editar="1" type="button">Editar</button>' +
      '</div>' +
    '</div>' +
    '<span class="dur' + (aberta ? ' correndo' : '') + '"></span>';

  div.querySelector('.equip').textContent = p.equip;
  div.querySelector('.horas').textContent = hhmm(p.inicio) + ' → ' + (p.fim ? hhmm(p.fim) : '…');
  div.querySelector('.motivo').textContent = p.motivo || 'sem motivo anotado';
  const antes = rodouAntes(t, p);
  const campoRodou = div.querySelector('.rodou');
  if (antes) campoRodou.textContent = '▶ rodou ' + duracao(antes) + ' antes desta parada';
  else campoRodou.remove();

  const noEquip = acumuladoAte(t, p, p.equip);
  const noTurno = acumuladoAte(t, p);
  div.querySelector('.acumulado').textContent =
    'Σ parado até aqui: ' + p.equip + ' ' + duracao(noEquip) +
    (noTurno !== noEquip ? ' · turno ' + duracao(noTurno) : '');

  div.querySelector('.dur').textContent = duracao(min);

  const enc = div.querySelector('[data-encerrar]');
  if (enc) enc.addEventListener('click', async () => {
    p.fim = agora();
    await salvar();
    avisar('Parada encerrada: ' + duracao(minutos(p.inicio, p.fim)));
  });
  div.querySelector('[data-editar]').addEventListener('click', () => formParada(t, p));
  return div;
}

function fichaDetector(d, t) {
  const aberto = !d.fim;
  const div = document.createElement('div');
  div.className = 'registro' + (aberto ? ' aberto' : '');
  div.innerHTML =
    '<div class="corpo">' +
      '<div class="linha1">' +
        '<span class="equip">Detector DT 1101</span>' +
        '<span class="horas"></span>' +
        (d.achou === true ? '<span class="etiqueta sim">👍 metal encontrado</span>' :
         d.achou === false ? '<span class="etiqueta nao">👎 não encontrado</span>' :
         '<span class="etiqueta aberta">sem resultado</span>') +
      '</div>' +
      '<div class="acoes-linha">' +
        '<button class="botao" data-editar="1" type="button">Editar</button>' +
      '</div>' +
    '</div>' +
    '<span class="dur"></span>';
  div.querySelector('.horas').textContent = hhmm(d.inicio) + ' → ' + (d.fim ? hhmm(d.fim) : '…');
  div.querySelector('.dur').textContent = duracao(d.fim ? minutos(d.inicio, d.fim) : null);
  div.querySelector('[data-editar]').addEventListener('click', () => formDetector(t, d));
  return div;
}

function desenharTurno() {
  const t = turnoAtual();
  const alvo = $('#linha-tempo');
  alvo.innerHTML = '';
  if (!t) return;

  $('#turno-titulo').textContent = nomeTurno(t) + ' · ' + dataBonita(t.data);
  $('#turno-sub').textContent =
    'início ' + hhmm(t.inicio) +
    (t.fim ? ' · encerrado ' + hhmm(t.fim) : ' · em andamento') +
    (t.operador ? ' · ' + t.operador : '');

  // Quanto já parou, somado, sem precisar ir ao resumo.
  const c = contasDoTurno(t);
  const faixa = $('#acumulo');
  if (!t.paradas.length) {
    faixa.textContent = 'Nada parado até agora.';
    faixa.classList.remove('tem-parada');
  } else {
    faixa.classList.add('tem-parada');
    faixa.innerHTML =
      '<b>⏸ ' + duracao(c.totalParado) + ' parado</b>' +
      Object.keys(c.porEquip).sort()
        .map(e => '<span>' + e + ' ' + duracao(c.porEquip[e]) + '</span>').join('');
  }

  const abertas = t.paradas.filter(p => !p.fim);
  if (abertas.length) {
    const h = document.createElement('div');
    h.className = 'grupo';
    h.textContent = 'EM ANDAMENTO';
    alvo.appendChild(h);
    abertas.forEach(p => alvo.appendChild(fichaParada(p, t)));
  }

  const eventos = t.paradas.filter(p => p.fim).map(p => ({ q: 'p', o: p, hora: p.inicio }))
    .concat(t.detector.map(d => ({ q: 'd', o: d, hora: d.inicio })))
    .sort((a, b) => new Date(a.hora) - new Date(b.hora));

  if (!eventos.length && !abertas.length) {
    alvo.innerHTML = '<p class="vazio">Nada registrado ainda.<br>' +
      'Use os botões acima conforme as coisas forem acontecendo.</p>';
    return;
  }

  const h = document.createElement('div');
  h.className = 'grupo';
  h.textContent = 'REGISTRADO';
  alvo.appendChild(h);
  eventos.forEach(ev => alvo.appendChild(ev.q === 'p' ? fichaParada(ev.o, t) : fichaDetector(ev.o, t)));
}

/* ————————————————— leituras ————————————————— */

function desenharLeituras() {
  const t = turnoAtual();
  const alvo = $('#lista-leituras');
  alvo.innerHTML = '';
  if (!t) return;

  if (!t.leituras.length) {
    alvo.innerHTML = '<p class="vazio">Sem leituras ainda.<br>' +
      'Toque em <b>+ Leitura</b> para anotar horímetro, balança e ácido.</p>';
    return;
  }

  const ordenadas = t.leituras.slice().sort((a, b) => new Date(a.hora) - new Date(b.hora));
  const tab = document.createElement('table');
  tab.className = 'tabela';
  tab.innerHTML = '<thead><tr><th>Hora</th><th>Horímetro</th><th>Balança</th><th>Ácido</th><th></th></tr></thead>';
  const corpo = document.createElement('tbody');

  let anterior = null;
  ordenadas.forEach(l => {
    const tr = document.createElement('tr');
    if (l.parada) tr.className = 'parada';
    const delta = (anterior && !l.parada && !anterior.parada && l.horimetro != null && anterior.horimetro != null)
      ? (l.horimetro - anterior.horimetro)
      : null;

    tr.innerHTML =
      '<td></td>' +
      '<td></td>' +
      '<td></td>' +
      '<td></td>' +
      '<td><button type="button">editar</button></td>';
    const td = tr.querySelectorAll('td');
    td[0].textContent = hhmm(l.hora);
    if (l.parada) {
      td[1].colSpan = 3;
      td[1].textContent = l.obs || 'Parada.';
      td[2].remove(); td[3].remove();
    } else {
      td[1].innerHTML = mostrarNumero(l.horimetro) +
        (delta != null ? ' <span class="delta">+' + mostrarNumero(+delta.toFixed(2)) + '</span>' : '');
      td[2].textContent = mostrarNumero(l.balanca);
      td[3].textContent = mostrarNumero(l.acido);
    }
    tr.querySelector('button').addEventListener('click', () => formLeitura(t, l));
    corpo.appendChild(tr);
    if (!l.parada) anterior = l;
  });

  tab.appendChild(corpo);
  alvo.appendChild(tab);
}

/* ————————————————— resumo ————————————————— */

function contasDoTurno(t) {
  const porEquip = {};
  let totalParado = 0;
  t.paradas.forEach(p => {
    const m = minutos(p.inicio, p.fim || relogio(t)) || 0;
    porEquip[p.equip] = (porEquip[p.equip] || 0) + m;
    totalParado += m;
  });
  const leituras = t.leituras.filter(l => !l.parada && l.horimetro != null)
    .sort((a, b) => new Date(a.hora) - new Date(b.hora));
  const horimetro = leituras.length > 1
    ? +(leituras[leituras.length - 1].horimetro - leituras[0].horimetro).toFixed(2)
    : null;
  const acidos = t.leituras.filter(l => !l.parada && l.acido != null).map(l => l.acido);
  return {
    porEquip,
    totalParado,
    paradas: t.paradas.length,
    abertas: t.paradas.filter(p => !p.fim).length,
    acionamentos: t.detector.length,
    encontrados: t.detector.filter(d => d.achou === true).length,
    horimetro,
    acidoMedio: acidos.length ? +(acidos.reduce((a, b) => a + b, 0) / acidos.length).toFixed(2) : null,
    duracaoTurno: minutos(t.inicio, relogio(t))
  };
}

function desenharResumo() {
  const t = turnoAtual();
  const alvo = $('#area-resumo');
  alvo.innerHTML = '';
  if (!t) return;
  const c = contasDoTurno(t);

  const placar = document.createElement('div');
  placar.className = 'placar';
  placar.innerHTML =
    '<div><b>' + duracao(c.totalParado) + '</b><span>parado no total</span></div>' +
    '<div><b>' + c.paradas + '</b><span>paradas' + (c.abertas ? ' · ' + c.abertas + ' aberta(s)' : '') + '</span></div>' +
    '<div><b>' + c.acionamentos + '</b><span>acionamentos do detector</span></div>' +
    '<div><b>' + c.encontrados + '</b><span>com metal encontrado</span></div>';
  alvo.appendChild(placar);

  const cartao = document.createElement('div');
  cartao.className = 'cartao';
  cartao.innerHTML = '<h2>Tempo parado por equipamento</h2>';
  const linhas = Object.keys(c.porEquip).sort();
  if (!linhas.length) {
    cartao.innerHTML += '<p class="fraco">Nenhuma parada registrada.</p>';
  } else {
    const tb = document.createElement('table');
    tb.className = 'tabela';
    tb.innerHTML = '<tbody>' + linhas.map(e =>
      '<tr><td>' + e + '</td><td>' + duracao(c.porEquip[e]) + '</td></tr>').join('') +
      '<tr><td><b>Total</b></td><td><b>' + duracao(c.totalParado) + '</b></td></tr></tbody>';
    cartao.appendChild(tb);
  }
  alvo.appendChild(cartao);

  // Tempo rodando: o avesso das paradas, equipamento por equipamento.
  const equipamentos = Object.keys(c.porEquip).sort();
  if (equipamentos.length) {
    const rod = document.createElement('div');
    rod.className = 'cartao';
    rod.innerHTML = '<h2>Tempo rodando</h2>';
    equipamentos.forEach(e => {
      const faixas = intervalosRodando(t, e);
      const total = faixas.reduce((soma, f) => soma + (minutos(f.inicio, f.fim) || 0), 0);
      const disp = c.duracaoTurno ? Math.round(100 * total / c.duracaoTurno) : 0;

      const bloco = document.createElement('div');
      bloco.className = 'bloco-equip';
      bloco.innerHTML =
        '<div class="linha-equip"><b></b><span></span></div>' +
        '<table class="tabela"><tbody>' +
          (faixas.length
            ? faixas.map(f =>
                '<tr><td>' + hhmm(f.inicio) + ' → ' + (f.correndo ? 'agora' : hhmm(f.fim)) + '</td>' +
                '<td>' + duracao(minutos(f.inicio, f.fim)) + '</td></tr>').join('')
            : '<tr><td colspan="2" class="fraco">Não rodou em nenhum momento.</td></tr>') +
        '</tbody></table>';
      bloco.querySelector('b').textContent = e;
      bloco.querySelector('span').textContent =
        duracao(total) + ' rodando · ' + disp + '% do turno';
      rod.appendChild(bloco);
    });
    alvo.appendChild(rod);
  }

  const nums = document.createElement('div');
  nums.className = 'cartao';
  nums.innerHTML =
    '<h2>Números do turno</h2>' +
    '<table class="tabela"><tbody>' +
      '<tr><td>Duração do turno</td><td>' + duracao(c.duracaoTurno) + '</td></tr>' +
      '<tr><td>Horímetro rodado</td><td>' + mostrarNumero(c.horimetro) + '</td></tr>' +
      '<tr><td>Ácido médio</td><td>' + mostrarNumero(c.acidoMedio) + '</td></tr>' +
      '<tr><td>Produção</td><td>' + (t.producao != null ? mostrarNumero(t.producao) + ' t' : '—') + '</td></tr>' +
    '</tbody></table>' +
    '<div class="botoes"><button class="botao" id="editar-producao" type="button">Anotar produção</button></div>';
  alvo.appendChild(nums);

  const acoes = document.createElement('div');
  acoes.className = 'cartao';
  acoes.innerHTML =
    '<h2>Passar adiante</h2>' +
    '<p class="fraco">O relatório sai pronto para colar numa mensagem, ou como planilha.</p>' +
    '<div class="botoes">' +
      '<button class="botao principal" id="copiar-relatorio" type="button">Copiar relatório</button>' +
      '<button class="botao" id="baixar-csv" type="button">Baixar CSV</button>' +
      '<button class="botao" id="fechar-turno" type="button">' +
        (t.fim ? 'Reabrir turno' : 'Encerrar turno') + '</button>' +
    '</div>';
  alvo.appendChild(acoes);

  $('#editar-producao').addEventListener('click', () => formProducao(t));
  $('#copiar-relatorio').addEventListener('click', () => copiarRelatorio(t));
  $('#baixar-csv').addEventListener('click', () => baixarCsv(t));
  $('#fechar-turno').addEventListener('click', async () => {
    t.fim = t.fim ? null : agora();
    await salvar();
    avisar(t.fim ? 'Turno encerrado.' : 'Turno reaberto.');
  });
}

/* ————————————————— lista de turnos ————————————————— */

/** Versão à mostra, para dar para conferir se a atualização chegou. */
function cartaoVersao() {
  const c = document.createElement('div');
  c.className = 'cartao';
  c.innerHTML =
    '<h2>Versão do app</h2>' +
    '<p class="fraco" id="versao-app"></p>' +
    '<p class="fraco pequeno">Se uma melhoria foi publicada e o app continua igual,' +
    ' toque aqui: ele busca a versão nova e recarrega sozinho.</p>' +
    '<div class="botoes"><button class="botao" id="procurar-atualizacao" type="button">' +
    'Procurar atualização</button></div>';
  c.querySelector('#versao-app').textContent = 'Versão ' + VERSAO + '.';
  c.querySelector('#procurar-atualizacao').addEventListener('click', procurarAtualizacao);
  return c;
}

function desenharTurnos() {
  const alvo = $('#lista-turnos');
  alvo.innerHTML = '';
  if (!estado.turnos.length) {
    alvo.innerHTML = '<p class="vazio">Nenhum turno ainda.</p>';
    alvo.appendChild(cartaoVersao());
    return;
  }
  estado.turnos.slice().sort((a, b) => new Date(b.inicio) - new Date(a.inicio)).forEach(t => {
    const c = contasDoTurno(t);
    const b = document.createElement('button');
    b.className = 'item' + (t.id === estado.atual ? ' aberto' : '');
    b.type = 'button';
    b.innerHTML =
      '<span class="dados"><span class="nome"></span><span class="sub"></span></span>' +
      '<span class="ramal"></span>';
    b.querySelector('.nome').textContent = dataBonita(t.data) + ' · ' + nomeTurno(t);
    b.querySelector('.sub').textContent =
      c.paradas + ' paradas · ' + c.acionamentos + ' detector' +
      (t.fim ? '' : ' · em andamento');
    b.querySelector('.ramal').textContent = duracao(c.totalParado);
    b.addEventListener('click', () => {
      estado.atual = t.id;
      Dados.gravarPreferencias(Object.assign(estado.prefs, { atual: t.id }));
      trocarTela('turno');
      desenhar();
    });
    alvo.appendChild(b);
  });
  alvo.appendChild(cartaoVersao());
}

function desenhar() {
  if (!turnoAtual()) {
    $$('.tela').forEach(s => { s.hidden = s.id !== 'tela-vazio'; });
    $('#abas').hidden = true;
    $('#dica-vazio').textContent = (estado.turnos.length
      ? estado.turnos.length + ' turno(s) guardado(s) neste aparelho. '
      : '') + 'Versão ' + VERSAO + '.';
    return;
  }
  $('#tela-vazio').hidden = true;
  $('#abas').hidden = false;
  desenharTurno();
  desenharLeituras();
  desenharResumo();
  desenharTurnos();
}

/* ————————————————— formulários ————————————————— */

function abrirCaixa(titulo, corpo, aoSalvar, aoApagar) {
  const cx = $('#formulario');
  cx.innerHTML =
    '<h2></h2>' + corpo +
    '<p class="erro" id="f-erro" hidden></p>' +
    '<div class="acoes">' +
      '<button class="botao principal" id="f-salvar" type="button">Salvar</button>' +
      '<button class="botao" id="f-cancelar" type="button">Cancelar</button>' +
      (aoApagar ? '<button class="botao" id="f-apagar" type="button">Apagar</button>' : '') +
    '</div>';
  cx.querySelector('h2').textContent = titulo;
  cx.hidden = false;
  $('#fundo').hidden = false;

  cx.querySelectorAll('.escolhas').forEach(g => {
    g.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      g.querySelectorAll('button').forEach(x => x.classList.toggle('ativo', x === b));
      if (g.dataset.livre && b.dataset.valor === '__outro') {
        const campo = $('#' + g.dataset.livre);
        campo.closest('.campo').hidden = false;
        campo.focus();
      } else if (g.dataset.livre) {
        $('#' + g.dataset.livre).closest('.campo').hidden = true;
      }
    });
  });

  cx.querySelectorAll('[data-agora]').forEach(b => {
    b.addEventListener('click', () => { $('#' + b.dataset.agora).value = paraCampo(agora()); });
  });

  $('#f-salvar').addEventListener('click', aoSalvar);
  $('#f-cancelar').addEventListener('click', fecharCaixa);
  if (aoApagar) $('#f-apagar').addEventListener('click', aoApagar);
}

function fecharCaixa() {
  $('#formulario').hidden = true;
  $('#fundo').hidden = true;
}

function erro(txt) {
  const el = $('#f-erro');
  el.textContent = txt;
  el.hidden = false;
}

const escolhido = sel => {
  const b = $(sel + ' button.ativo');
  return b ? b.dataset.valor : null;
};

function grupoEscolhas(nome, valores, atual, campoLivre) {
  return '<div class="escolhas" id="' + nome + '"' +
    (campoLivre ? ' data-livre="' + campoLivre + '"' : '') + '>' +
    valores.map(v => '<button type="button" data-valor="' + v + '"' +
      (v === atual ? ' class="ativo"' : '') + '>' + v + '</button>').join('') +
    (campoLivre ? '<button type="button" data-valor="__outro"' +
      (atual && !valores.includes(atual) ? ' class="ativo"' : '') + '>Outro…</button>' : '') +
    '</div>';
}

/* ——— turno ——— */

function formTurno(t) {
  const corpo =
    '<div class="dupla-campo">' +
      '<label class="campo">Data<input id="f-data" type="date" value="' + (t ? t.data : hoje()) + '"></label>' +
      '<label class="campo">Início<input id="f-inicio" type="time" value="' +
        (t ? paraCampo(t.inicio) : paraCampo(agora())) + '"></label>' +
    '</div>' +
    '<p class="rotulo-grupo">Turno</p>' +
    grupoEscolhas('g-turno', TURNOS, t ? t.nome : (estado.prefs.turno || TURNOS[0]), 'f-turno-livre') +
    '<label class="campo"' + (t && !TURNOS.includes(t.nome) ? '' : ' hidden') + '>' +
      'Nome do turno' +
      '<input id="f-turno-livre" type="text" placeholder="como vocês chamam" value="' +
      (t && !TURNOS.includes(t.nome) ? t.nome : '') + '"></label>' +
    '<label class="campo">Operador (opcional)<input id="f-operador" type="text" value="' +
      (t ? (t.operador || '') : (estado.prefs.operador || '')) + '"></label>';

  abrirCaixa(t ? 'Editar turno' : 'Abrir turno', corpo, async () => {
    const data = $('#f-data').value;
    const hora = $('#f-inicio').value;
    if (!data || !hora) { erro('Informe a data e a hora de início.'); return; }
    let nome = escolhido('#g-turno');
    if (nome === '__outro' || !nome) nome = $('#f-turno-livre').value.trim();
    if (!nome) { erro('Diga qual é o turno.'); return; }

    const [h, m] = hora.split(':').map(Number);
    const d = new Date(data + 'T00:00:00');
    d.setHours(h, m, 0, 0);
    const operador = $('#f-operador').value.trim();

    if (t) {
      Object.assign(t, { data, nome, operador, inicio: d.toISOString() });
    } else {
      const novo = {
        id: id(), data, nome, operador, inicio: d.toISOString(), fim: null,
        producao: null, paradas: [], detector: [], leituras: []
      };
      estado.turnos.push(novo);
      estado.atual = novo.id;
      trocarTela('turno');
    }
    estado.prefs.turno = nome;
    estado.prefs.operador = operador;
    estado.prefs.atual = estado.atual;
    Dados.gravarPreferencias(estado.prefs);
    fecharCaixa();
    await salvar();
  }, t ? async () => {
    if (!confirm('Apagar o turno de ' + dataBonita(t.data) + ' com tudo que foi registrado nele?')) return;
    estado.turnos = estado.turnos.filter(x => x.id !== t.id);
    if (estado.atual === t.id) estado.atual = estado.turnos.length ? estado.turnos[estado.turnos.length - 1].id : null;
    fecharCaixa();
    await salvar();
    avisar('Turno apagado.');
  } : null);
}

/* ——— parada ——— */

function formParada(t, p) {
  const usados = Array.from(new Set(estado.turnos.flatMap(x => x.paradas.map(y => y.motivo)).filter(Boolean)));
  const sugestoes = Array.from(new Set(MOTIVOS.concat(usados)));
  const corpo =
    '<p class="rotulo-grupo">Equipamento</p>' +
    grupoEscolhas('g-equip', EQUIPAMENTOS, p ? p.equip : EQUIPAMENTOS[0], 'f-equip-livre') +
    '<label class="campo"' + (p && !EQUIPAMENTOS.includes(p.equip) ? '' : ' hidden') + '>' +
      'Nome do equipamento' +
      '<input id="f-equip-livre" type="text" placeholder="ex.: Peneira 02, Correia TP 1407" value="' +
      (p && !EQUIPAMENTOS.includes(p.equip) ? p.equip : '') + '"></label>' +
    '<label class="campo">Motivo' +
      '<input id="f-motivo" type="text" list="motivos-usados" value="' + (p ? (p.motivo || '') : '') + '">' +
      '<datalist id="motivos-usados">' +
        sugestoes.map(m => '<option value="' + m.replace(/"/g, '&quot;') + '">').join('') +
      '</datalist>' +
    '</label>' +
    '<div class="dupla-campo">' +
      '<label class="campo">Início<input id="f-ini" type="time" value="' +
        (p ? paraCampo(p.inicio) : paraCampo(agora())) + '">' +
        '<button class="agora" type="button" data-agora="f-ini">agora</button></label>' +
      '<label class="campo">Fim<input id="f-fim" type="time" value="' +
        (p && p.fim ? paraCampo(p.fim) : '') + '">' +
        '<button class="agora" type="button" data-agora="f-fim">agora</button></label>' +
    '</div>' +
    '<p class="fraco pequeno">Deixe o fim em branco enquanto a parada estiver acontecendo.</p>';

  abrirCaixa(p ? 'Editar parada' : 'Nova parada', corpo, async () => {
    let equip = escolhido('#g-equip');
    if (equip === '__outro' || !equip) equip = $('#f-equip-livre').value.trim();
    if (!equip) { erro('Diga qual equipamento parou.'); return; }
    const inicio = doCampo($('#f-ini').value, t);
    if (!inicio) { erro('Informe a hora de início.'); return; }
    const fim = doCampo($('#f-fim').value, t);
    if (fim && new Date(fim) < new Date(inicio)) { erro('O fim está antes do início.'); return; }

    const dados = { equip, motivo: $('#f-motivo').value.trim(), inicio, fim };
    if (p) Object.assign(p, dados);
    else t.paradas.push(Object.assign({ id: id() }, dados));
    fecharCaixa();
    await salvar();
    avisar(p ? 'Parada atualizada.' : 'Parada registrada.');
  }, p ? async () => {
    t.paradas = t.paradas.filter(x => x.id !== p.id);
    fecharCaixa();
    await salvar();
    avisar('Parada apagada.');
  } : null);
}

/* ——— detector ——— */

function formDetector(t, d) {
  const atual = d ? (d.achou === true ? 'Encontrou' : d.achou === false ? 'Não encontrou' : 'Sem resultado') : 'Sem resultado';
  const corpo =
    '<div class="dupla-campo">' +
      '<label class="campo">Acionou<input id="f-ini" type="time" value="' +
        (d ? paraCampo(d.inicio) : paraCampo(agora())) + '">' +
        '<button class="agora" type="button" data-agora="f-ini">agora</button></label>' +
      '<label class="campo">Liberou<input id="f-fim" type="time" value="' +
        (d && d.fim ? paraCampo(d.fim) : '') + '">' +
        '<button class="agora" type="button" data-agora="f-fim">agora</button></label>' +
    '</div>' +
    '<p class="rotulo-grupo">Resultado</p>' +
    grupoEscolhas('g-achou', ['Encontrou', 'Não encontrou', 'Sem resultado'], atual) +
    '<label class="campo">Observação (opcional)<input id="f-obs" type="text" value="' +
      (d ? (d.obs || '') : '') + '"></label>';

  abrirCaixa(d ? 'Editar detector' : 'Detector de metal', corpo, async () => {
    const inicio = doCampo($('#f-ini').value, t);
    if (!inicio) { erro('Informe a hora em que acionou.'); return; }
    const fim = doCampo($('#f-fim').value, t);
    if (fim && new Date(fim) < new Date(inicio)) { erro('A liberação está antes do acionamento.'); return; }
    const r = escolhido('#g-achou');
    const dados = {
      inicio, fim,
      achou: r === 'Encontrou' ? true : r === 'Não encontrou' ? false : null,
      obs: $('#f-obs').value.trim()
    };
    if (d) Object.assign(d, dados);
    else t.detector.push(Object.assign({ id: id() }, dados));
    fecharCaixa();
    await salvar();
    avisar(d ? 'Registro atualizado.' : 'Acionamento registrado.');
  }, d ? async () => {
    t.detector = t.detector.filter(x => x.id !== d.id);
    fecharCaixa();
    await salvar();
    avisar('Registro apagado.');
  } : null);
}

/* ——— leitura ——— */

function formLeitura(t, l) {
  const ultima = t.leituras.filter(x => !x.parada && x.horimetro != null)
    .sort((a, b) => new Date(a.hora) - new Date(b.hora)).pop();
  const corpo =
    '<label class="campo">Hora<input id="f-hora" type="time" value="' +
      (l ? paraCampo(l.hora) : paraCampo(agora())) + '">' +
      '<button class="agora" type="button" data-agora="f-hora">agora</button></label>' +
    '<label class="campo opcao-linha">' +
      '<input type="checkbox" id="f-parada"' + (l && l.parada ? ' checked' : '') + '> ' +
      'A usina estava parada nesta hora' +
    '</label>' +
    '<div id="campos-leitura">' +
      '<label class="campo">Horímetro' +
        (ultima ? ' <span class="fraco">(última: ' + mostrarNumero(ultima.horimetro) + ')</span>' : '') +
        '<input id="f-horimetro" type="text" inputmode="decimal" enterkeyhint="next" value="' +
        (l && l.horimetro != null ? mostrarNumero(l.horimetro) : '') + '"></label>' +
      '<div class="dupla-campo">' +
        '<label class="campo">Balança<input id="f-balanca" type="text" inputmode="decimal" enterkeyhint="next" value="' +
          (l && l.balanca != null ? mostrarNumero(l.balanca) : '') + '"></label>' +
        '<label class="campo">Ácido<input id="f-acido" type="text" inputmode="decimal" enterkeyhint="done" value="' +
          (l && l.acido != null ? mostrarNumero(l.acido) : '') + '"></label>' +
      '</div>' +
    '</div>' +
    '<label class="campo">Observação (opcional)<input id="f-obs" type="text" value="' +
      (l ? (l.obs || '') : '') + '"></label>';

  abrirCaixa(l ? 'Editar leitura' : 'Nova leitura', corpo, async () => {
    const hora = doCampo($('#f-hora').value, t);
    if (!hora) { erro('Informe a hora da leitura.'); return; }
    const parada = $('#f-parada').checked;
    const campos = {
      horimetro: ['#f-horimetro', 'horímetro'],
      balanca: ['#f-balanca', 'balança'],
      acido: ['#f-acido', 'ácido']
    };
    const lidos = {};
    for (const nome in campos) {
      const v = parada ? null : lerNumero($(campos[nome][0]).value);
      if (Number.isNaN(v)) {
        erro('O ' + campos[nome][1] + ' não é um número. Use só dígitos e vírgula.');
        return;
      }
      lidos[nome] = v;
    }
    const dados = Object.assign({ hora, parada, obs: $('#f-obs').value.trim() }, lidos);
    if (l) Object.assign(l, dados);
    else t.leituras.push(Object.assign({ id: id() }, dados));
    fecharCaixa();
    await salvar();
    avisar(l ? 'Leitura atualizada.' : 'Leitura anotada.');
  }, l ? async () => {
    t.leituras = t.leituras.filter(x => x.id !== l.id);
    fecharCaixa();
    await salvar();
    avisar('Leitura apagada.');
  } : null);

  const alterna = () => { $('#campos-leitura').hidden = $('#f-parada').checked; };
  $('#f-parada').addEventListener('change', alterna);
  alterna();
}

/* ——— produção ——— */

function formProducao(t) {
  const corpo = '<label class="campo">Produção do turno, em toneladas' +
    '<input id="f-producao" type="text" inputmode="decimal" enterkeyhint="done" value="' +
    (t.producao != null ? mostrarNumero(t.producao) : '') + '"></label>';
  abrirCaixa('Produção', corpo, async () => {
    const v = lerNumero($('#f-producao').value);
    if (Number.isNaN(v)) { erro('A produção não é um número. Use só dígitos e vírgula.'); return; }
    t.producao = v;
    fecharCaixa();
    await salvar();
    avisar('Produção anotada.');
  });
}

/* ————————————————— passar adiante ————————————————— */

function relatorioTexto(t) {
  const c = contasDoTurno(t);
  const L = [];
  L.push('BRITAGEM — ' + dataBonita(t.data) + ' · ' + nomeTurno(t) + (t.operador ? ' · ' + t.operador : ''));
  L.push('Início ' + hhmm(t.inicio) + (t.fim ? ' · fim ' + hhmm(t.fim) : ' · em andamento'));
  L.push('');

  if (t.paradas.length) {
    L.push('PARADAS');
    t.paradas.slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio)).forEach(p => {
      L.push('· ' + p.equip + '  ' + hhmm(p.inicio) + ' → ' + (p.fim ? hhmm(p.fim) : 'em andamento') +
        '  (' + duracao(minutos(p.inicio, p.fim || relogio(t))) + ')' + (p.motivo ? ' — ' + p.motivo : '') +
        '  [Σ ' + duracao(acumuladoAte(t, p)) + ']');
    });
    Object.keys(c.porEquip).sort().forEach(e => L.push('  ' + e + ': ' + duracao(c.porEquip[e])));
    L.push('  TOTAL PARADO: ' + duracao(c.totalParado));
    L.push('');

    L.push('TEMPO RODANDO');
    Object.keys(c.porEquip).sort().forEach(e => {
      const faixas = intervalosRodando(t, e);
      const total = faixas.reduce((soma, f) => soma + (minutos(f.inicio, f.fim) || 0), 0);
      const disp = c.duracaoTurno ? Math.round(100 * total / c.duracaoTurno) : 0;
      L.push('· ' + e + ': ' + duracao(total) + ' (' + disp + '% do turno)');
      faixas.forEach(f => L.push('    ' + hhmm(f.inicio) + ' → ' +
        (f.correndo ? 'agora' : hhmm(f.fim)) + '  (' + duracao(minutos(f.inicio, f.fim)) + ')'));
    });
    L.push('');
  }

  if (t.detector.length) {
    L.push('DETECTOR DE METAL (DT 1101)');
    t.detector.slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio)).forEach(d => {
      L.push('· ' + hhmm(d.inicio) + ' → ' + (d.fim ? hhmm(d.fim) : '…') + '  ' +
        (d.achou === true ? '👍 metal encontrado' : d.achou === false ? '👎 não encontrado' : 'sem resultado') +
        (d.obs ? ' — ' + d.obs : ''));
    });
    L.push('');
  }

  if (t.leituras.length) {
    L.push('LEITURAS  (hora · horímetro · balança · ácido)');
    Object.keys(contasDoTurno(t).porEquip).sort().forEach(e =>
    intervalosRodando(t, e).forEach(f =>
      L.push(['rodando', e, hhmm(f.inicio), f.correndo ? '' : hhmm(f.fim),
        minutos(f.inicio, f.fim), '', '', '', '', '', '', f.correndo ? 'em andamento' : ''])));
  t.leituras.slice().sort((a, b) => new Date(a.hora) - new Date(b.hora)).forEach(l => {
      L.push(l.parada
        ? '· ' + hhmm(l.hora) + '  ' + (l.obs || 'Parada.')
        : '· ' + hhmm(l.hora) + '  ' + mostrarNumero(l.horimetro) +
          '  ·  ' + mostrarNumero(l.balanca) +
          '  ·  ' + mostrarNumero(l.acido) + (l.obs ? '  — ' + l.obs : ''));
    });
    L.push('');
  }

  if (t.producao != null) L.push('PRODUÇÃO: ' + mostrarNumero(t.producao) + ' t');
  if (c.horimetro != null) L.push('Horímetro rodado: ' + mostrarNumero(c.horimetro));
  if (c.acidoMedio != null) L.push('Ácido médio: ' + mostrarNumero(c.acidoMedio));
  return L.join('\n');
}

function copiarRelatorio(t) {
  const txt = relatorioTexto(t);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(
      () => avisar('Relatório copiado.'),
      () => avisar('O navegador não deixou copiar.')
    );
  } else {
    avisar('O navegador não deixou copiar.');
  }
}

function csvCampo(v) {
  // Número sai com vírgula: com o ';' separando colunas, é assim que o
  // Numbers e o Excel em português leem como número, não como texto.
  const s = typeof v === 'number' ? String(v).replace('.', ',')
    : (v === null || v === undefined ? '' : String(v));
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function baixarCsv(t) {
  const L = [['tipo', 'equipamento', 'inicio', 'fim', 'minutos', 'acumulado_equip', 'acumulado_turno',
    'motivo', 'horimetro', 'balanca', 'acido', 'observacao']];
  t.paradas.slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio)).forEach(p =>
    L.push(['parada', p.equip, hhmm(p.inicio), p.fim ? hhmm(p.fim) : '',
      minutos(p.inicio, p.fim || relogio(t)),
      acumuladoAte(t, p, p.equip), acumuladoAte(t, p), p.motivo, '', '', '', '']));
  t.detector.slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio)).forEach(d =>
    L.push(['detector', 'DT 1101', hhmm(d.inicio), d.fim ? hhmm(d.fim) : '',
      minutos(d.inicio, d.fim), '', '',
      d.achou === true ? 'metal encontrado' : d.achou === false ? 'nao encontrado' : '', '', '', '', d.obs]));
  Object.keys(contasDoTurno(t).porEquip).sort().forEach(e =>
    intervalosRodando(t, e).forEach(f =>
      L.push(['rodando', e, hhmm(f.inicio), f.correndo ? '' : hhmm(f.fim),
        minutos(f.inicio, f.fim), '', '', '', '', '', '', f.correndo ? 'em andamento' : ''])));
  t.leituras.slice().sort((a, b) => new Date(a.hora) - new Date(b.hora)).forEach(l =>
    L.push(['leitura', '', hhmm(l.hora), '', '', '', '', l.parada ? 'parada' : '',
      l.horimetro, l.balanca, l.acido, l.obs]));
  if (t.producao != null) L.push(['producao', '', '', '', '', '', '', '', t.producao, 'toneladas']);

  const texto = '﻿' + L.map(linha => linha.map(csvCampo).join(';')).join('\r\n');
  const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'britagem-' + t.data + '-turno-' + t.nome.replace(/\W+/g, '') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  avisar('Planilha baixada.');
}

/* ————————————————— navegação e partida ————————————————— */

function trocarTela(nome) {
  $$('.tela').forEach(s => { s.hidden = s.id !== 'tela-' + nome; });
  $$('.aba').forEach(a => a.classList.toggle('ativa', a.dataset.tela === nome));
}

function ligarEventos() {
  $('#abrir-turno').addEventListener('click', () => formTurno(null));
  $('#abrir-turno-2').addEventListener('click', () => formTurno(null));
  $('#editar-turno').addEventListener('click', () => formTurno(turnoAtual()));
  $('#nova-parada').addEventListener('click', () => formParada(turnoAtual(), null));
  $('#novo-detector').addEventListener('click', () => formDetector(turnoAtual(), null));
  $('#nova-leitura').addEventListener('click', () => formLeitura(turnoAtual(), null));
  $('#nova-leitura-2').addEventListener('click', () => formLeitura(turnoAtual(), null));
  $$('.aba').forEach(a => a.addEventListener('click', () => trocarTela(a.dataset.tela)));
  $('#fundo').addEventListener('click', fecharCaixa);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') fecharCaixa(); });
}

const TINHA_CONTROLADOR = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
let registroSW = null;

function registrarSW() {
  if (!('serviceWorker' in navigator)) return;

  // Quando a versão nova assume, a aba recarrega uma vez para pegar o
  // app novo. Na primeira instalação não recarrega: não há o que trocar.
  let recarregando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!TINHA_CONTROLADOR || recarregando) return;
    recarregando = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    // 'updateViaCache: none' obriga o navegador a buscar o sw.js na rede:
    // sem isso ele serve o antigo do cache e a atualização nunca chega.
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(reg => { registroSW = reg; return reg.update(); })
      .catch(() => {});
  });
}

async function procurarAtualizacao() {
  if (!registroSW) { avisar('Atualização não disponível aqui.'); return; }
  avisar('Procurando versão nova…');
  try {
    await registroSW.update();
    const nova = registroSW.waiting || registroSW.installing;
    if (nova) {
      nova.postMessage({ tipo: 'assumir' });
      avisar('Versão nova encontrada. Recarregando…');
    } else {
      avisar('Você já está na versão ' + VERSAO + '.');
    }
  } catch (e) {
    avisar('Não deu para verificar agora.');
  }
}

async function iniciar() {
  ligarEventos();
  registrarSW();
  estado.turnos = await Dados.lerTurnos();
  estado.prefs = await Dados.lerPreferencias();
  const guardado = estado.turnos.find(t => t.id === estado.prefs.atual);
  const emAberto = estado.turnos.filter(t => !t.fim).sort((a, b) => new Date(b.inicio) - new Date(a.inicio))[0];
  estado.atual = (guardado || emAberto || estado.turnos[estado.turnos.length - 1] || {}).id || null;
  // Ao reabrir o app, a tela do turno é a que aparece.
  if (estado.atual) trocarTela('turno');
  desenhar();

  // Mantém o cronômetro das paradas em andamento vivo na tela.
  setInterval(() => { if (turnoAtual() && !$('#tela-turno').hidden) desenharTurno(); }, 30000);
}

iniciar();
