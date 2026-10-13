/* ————————————————————————————————————————————————————————————
   Britagem — relatório de turno: paradas, detector de metal e
   leituras. Tudo é guardado no aparelho e funciona sem internet.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '3.1.5';   // precisa casar com a VERSAO do sw.js

// Versão sempre à vista: cada [data-versao] da página mostra a deste app.
for (const lugar of document.querySelectorAll('[data-versao]')) lugar.textContent = 'v' + VERSAO;

/* Área padrão, para quem ainda não carregou a configuração das áreas.
   Equipamento, motivo e medida de cada área real vêm do arquivo que fica
   no aparelho — o repositório é público e as IOs têm controle de cópias. */
const AREA_PADRAO = {
  id: 'padrao',
  nome: 'Turno',
  codigo: '',
  io: '',
  equipamentos: ['AA140', 'Primário', 'Rebritagem'],
  motivos: [
    'Moega baixa', 'Moega vazia', 'Moega cheia', 'Troca de turno', 'Jantar',
    'Afunilamento', 'Entupimento', 'Obstrução no chute', 'Elétrica',
    'Mecânica', 'Falha no detector de metal', 'Movimentar TP'
  ],
  medidas: [
    { chave: 'horimetro', rotulo: 'Horímetro', complemento: 'rodado', unidade: 'h' },
    { chave: 'balanca', rotulo: 'Balança', complemento: 'no turno', unidade: 't' },
    { chave: 'acido', rotulo: 'Ácido', complemento: 'consumido', unidade: '' }
  ],
  extras: []
};

const TURNOS = ['A', 'B', 'C', 'D', 'E'];

/** 'A' vira "Turno A"; um nome escrito por extenso fica como foi digitado. */
const nomeTurno = t => (t && t.nome) ? (t.nome.length <= 2 ? 'Turno ' + t.nome : t.nome) : '';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const estado = {
  config: null,    // as áreas carregadas no aparelho
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

/** Todas as áreas disponíveis: as do arquivo, ou a padrão. */
const areasDisponiveis = () =>
  (estado.config && estado.config.areas.length) ? estado.config.areas : [AREA_PADRAO];

/** A área daquele turno, caindo na padrão quando não encontra. */
function areaDe(t) {
  if (!t) return AREA_PADRAO;
  const achada = areasDisponiveis().find(a => a.id === t.areaId);
  if (achada) return achada;
  // Turno antigo, sem área: fica com a padrão, mas guarda o nome gravado.
  return t.areaNome ? Object.assign({}, AREA_PADRAO, { nome: t.areaNome }) : AREA_PADRAO;
}

const equipamentosDaArea = t => areaDe(t).equipamentos.slice();
const motivosDaArea = t => areaDe(t).motivos.slice();
const medidasDe = t => areaDe(t).medidas;

let avisoTimer = null;
function avisar(txt) {
  const el = $('#aviso');
  el.textContent = txt;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ————————————————— janela de cada equipamento ————————————————— */

/**
 * AA140, Britagem e Rebritagem entram e saem em horas próprias, que não são
 * as do turno. A janela é esse horário de início e término; quando não foi
 * informada, vale a do turno, para o que já estava registrado continuar certo.
 */
function janela(t, equip) {
  const e = (t.equipamentos || {})[equip] || {};
  const inicio = e.inicio || t.inicio;
  const fimTurno = relogio(t);
  const fim = e.fim || fimTurno;
  return {
    inicio,
    fim: new Date(fim) < new Date(inicio) ? inicio : fim,
    propria: !!(e.inicio || e.fim),
    iniciou: !!e.inicio,
    encerrou: !!e.fim,
    correndo: !e.fim && !t.fim
  };
}

/** Minutos de [a,b] que caem dentro da janela — nada conta fora dela. */
function minutosNaJanela(a, b, j) {
  const ini = new Date(a) < new Date(j.inicio) ? j.inicio : a;
  const fim = new Date(b) > new Date(j.fim) ? j.fim : b;
  return new Date(fim) > new Date(ini) ? minutos(ini, fim) : 0;
}

/** Lista para a tela: os três de sempre, mais o que apareceu no turno. */
function equipamentosDoTurno(t) {
  const nomes = equipamentosDaArea(t);
  t.paradas.forEach(p => { if (!nomes.includes(p.equip)) nomes.push(p.equip); });
  Object.keys(t.equipamentos || {}).forEach(n => { if (!nomes.includes(n)) nomes.push(n); });
  return nomes;
}

/* ————————————————— tempo rodando ————————————————— */

/**
 * Os intervalos em que aquele equipamento esteve funcionando: do começo do
 * turno até a primeira parada, entre uma parada e a seguinte, e da última
 * até o fim do turno. Paradas que se sobrepõem contam como uma só.
 */
function intervalosRodando(t, equip) {
  const j = janela(t, equip);
  const ps = t.paradas.filter(p => p.equip === equip)
    .slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

  const saida = [];
  let ponteiro = j.inicio;
  ps.forEach(p => {
    const ini = new Date(p.inicio) < new Date(j.inicio) ? j.inicio : p.inicio;
    if (new Date(ini) > new Date(ponteiro)) {
      saida.push({ inicio: ponteiro, fim: ini });
    }
    const fim = p.fim || j.fim;
    if (new Date(fim) > new Date(ponteiro)) ponteiro = new Date(fim) > new Date(j.fim) ? j.fim : fim;
  });
  if (new Date(j.fim) > new Date(ponteiro)) {
    saida.push({ inicio: ponteiro, fim: j.fim, correndo: j.correndo });
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
    .reduce((soma, x) => {
      const j = janela(t, x.equip);
      return soma + minutosNaJanela(x.inicio, x.fim || j.fim, j);
    }, 0);
}

/** Quanto aquele equipamento rodou antes desta parada começar. */
function rodouAntes(t, p) {
  const j = janela(t, p.equip);
  const anteriores = t.paradas.filter(x => x.equip === p.equip && x !== p &&
    new Date(x.inicio) < new Date(p.inicio));
  let ponteiro = j.inicio;
  anteriores.forEach(x => {
    const fim = x.fim || j.fim;
    if (new Date(fim) > new Date(ponteiro)) ponteiro = fim;
  });
  const m = minutosNaJanela(ponteiro, p.inicio, j);
  return m > 0 ? m : null;
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

/** Cartão com a janela de cada equipamento, no alto da tela do turno. */
function cartaoEquipamentos(t) {
  const c = document.createElement('div');
  c.className = 'cartao equipamentos';
  c.innerHTML = '<h2>Funcionamento</h2>';

  equipamentosDoTurno(t).forEach(nome => {
    const j = janela(t, nome);
    const linha = document.createElement('div');
    linha.className = 'linha-janela' + (j.correndo && j.iniciou ? ' rodando' : '');
    linha.innerHTML =
      '<button class="nome-equip" type="button"></button>' +
      '<span class="quando"></span>' +
      '<button class="botao pequeno" data-acao="1" type="button"></button>';

    linha.querySelector('.nome-equip').textContent = nome;
    linha.querySelector('.quando').textContent =
      !j.iniciou ? 'não iniciou'
      : j.encerrou ? hhmm(j.inicio) + ' → ' + hhmm(j.fim)
      : 'desde ' + hhmm(j.inicio) + ' · ' + duracao(minutos(j.inicio, j.fim));

    const acao = linha.querySelector('[data-acao]');
    acao.textContent = !j.iniciou ? 'Iniciar' : j.encerrou ? 'Reabrir' : 'Encerrar';
    acao.addEventListener('click', async () => {
      const eq = (t.equipamentos = t.equipamentos || {});
      const atual = (eq[nome] = eq[nome] || {});
      if (!j.iniciou) { atual.inicio = agora(); avisar(nome + ' iniciou às ' + hhmm(atual.inicio) + '.'); }
      else if (j.encerrou) { atual.fim = null; avisar(nome + ' reaberto.'); }
      else { atual.fim = agora(); avisar(nome + ' encerrado às ' + hhmm(atual.fim) + '.'); }
      await salvar();
    });
    linha.querySelector('.nome-equip').addEventListener('click', () => formJanela(t, nome));
    c.appendChild(linha);
  });

  const dica = document.createElement('p');
  dica.className = 'fraco pequeno';
  dica.textContent = 'Cada equipamento tem a sua hora de entrar e sair. ' +
    'Toque no nome para corrigir os horários.';
  c.appendChild(dica);
  return c;
}

function desenharTurno() {
  const t = turnoAtual();
  const alvo = $('#linha-tempo');
  alvo.innerHTML = '';
  if (!t) return;

  const a = areaDe(t);
  $('#turno-titulo').textContent = a.nome + ' · ' + nomeTurno(t) + ' · ' + dataBonita(t.data);
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

  alvo.appendChild(cartaoEquipamentos(t));

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
    const vazio = document.createElement('p');
    vazio.className = 'vazio';
    vazio.innerHTML = 'Nenhuma parada registrada.<br>' +
      'Use os botões acima conforme as coisas forem acontecendo.';
    alvo.appendChild(vazio);
    return;
  }

  const h = document.createElement('div');
  h.className = 'grupo';
  h.textContent = 'REGISTRADO';
  alvo.appendChild(h);
  eventos.forEach(ev => alvo.appendChild(ev.q === 'p' ? fichaParada(ev.o, t) : fichaDetector(ev.o, t)));
}

/* ————————————————— leituras ————————————————— */

function cartaoExtremo(t, qual) {
  const o = t[qual] || {};
  const c = document.createElement('div');
  c.className = 'cartao';
  c.innerHTML =
    '<div class="cabeca"><h2></h2>' +
      '<button class="botao pequeno" type="button">' + (temLeitura(o, t) ? 'Editar' : 'Anotar') + '</button>' +
    '</div>' +
    (o.hora ? '<p class="fraco pequeno">às ' + hhmm(o.hora) + '</p>' : '') +
    '<table class="tabela"><tbody>' +
      medidasDe(t).map(m =>
        '<tr><td>' + m.rotulo + '</td><td>' + comUnidade(o[m.chave], m.unidade) + '</td></tr>').join('') +
    '</tbody></table>';
  c.querySelector('h2').textContent = qual === 'inicial' ? 'Leitura inicial' : 'Leitura final';
  c.querySelector('button').addEventListener('click', () => formExtremo(t, qual));
  return c;
}

function cartaoSomatoria(t) {
  const soma = somatoria(t);
  const c = document.createElement('div');
  c.className = 'cartao somatoria';
  c.innerHTML = '<h2>Somatória do turno</h2>';

  if (!temLeitura(t.inicial, t) || !temLeitura(t.final, t)) {
    c.innerHTML += '<p class="fraco">Anote a leitura inicial e a final para o app' +
      ' fazer a conta — é a diferença entre as duas.</p>';
    return c;
  }
  const tb = document.createElement('table');
  tb.className = 'tabela';
  tb.innerHTML = '<tbody>' + medidasDe(t).map(m =>
    '<tr><td>' + m.rotulo + ' ' + (m.complemento || '') + '</td>' +
    '<td class="total">' + comUnidade(soma[m.chave], m.unidade) + '</td></tr>').join('') + '</tbody>';
  c.appendChild(tb);

  const conta = document.createElement('p');
  conta.className = 'fraco pequeno';
  conta.textContent = 'final − inicial, medida por medida.';
  c.appendChild(conta);
  return c;
}

function desenharLeituras() {
  const t = turnoAtual();
  const alvo = $('#lista-leituras');
  alvo.innerHTML = '';
  if (!t) return;

  alvo.appendChild(cartaoExtremo(t, 'inicial'));

  const horarias = document.createElement('div');
  horarias.className = 'cartao';
  horarias.innerHTML = '<h2>Hora a hora</h2>';

  if (!t.leituras.length) {
    horarias.innerHTML += '<p class="fraco">Sem leituras ainda. Toque em' +
      ' <b>+ Leitura</b> para anotar horímetro, balança e ácido.</p>';
  } else {
    const ordenadas = t.leituras.slice().sort((a, b) => new Date(a.hora) - new Date(b.hora));
    const tab = document.createElement('table');
    tab.className = 'tabela';
    tab.innerHTML = '<thead><tr><th>Hora</th>' + medidasDe(t)
      .map(m => '<th>' + m.rotulo + (m.unidade ? ' (' + m.unidade + ')' : '') + '</th>').join('') +
      '<th></th></tr></thead>';
    const corpo = document.createElement('tbody');

    let anterior = null;
    ordenadas.forEach(l => {
      const tr = document.createElement('tr');
      if (l.parada) tr.className = 'parada';
      const delta = (anterior && !l.parada && !anterior.parada && l.horimetro != null && anterior.horimetro != null)
        ? (l.horimetro - anterior.horimetro)
        : null;

      tr.innerHTML = '<td></td><td></td><td></td><td></td>' +
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
    horarias.appendChild(tab);
  }
  alvo.appendChild(horarias);

  alvo.appendChild(cartaoExtremo(t, 'final'));
  alvo.appendChild(cartaoSomatoria(t));
}

/* ————————————————— leitura inicial e final ————————————————— */

/** Número com a unidade colada, quando a medida tem uma. */
function comUnidade(v, unidade) {
  const n = mostrarNumero(v);
  return (n === '—' || !unidade) ? n : n + ' ' + unidade;
}

/** Diferença entre o que o totalizador marcava no fim e no começo. */
function somatoria(t) {
  const ini = t.inicial || {};
  const fim = t.final || {};
  const out = {};
  medidasDe(t).forEach(m => {
    out[m.chave] = (ini[m.chave] != null && fim[m.chave] != null)
      ? +(fim[m.chave] - ini[m.chave]).toFixed(2)
      : null;
  });
  return out;
}

const temLeitura = (o, t) => !!o && medidasDe(t).some(m => o[m.chave] != null);

/* ————————————————— resumo ————————————————— */

function contasDoTurno(t) {
  const porEquip = {};
  let totalParado = 0;
  t.paradas.forEach(p => {
    const j = janela(t, p.equip);
    const m = minutosNaJanela(p.inicio, p.fim || j.fim, j);
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
      const j = janela(t, e);
      const faixas = intervalosRodando(t, e);
      const total = faixas.reduce((soma, f) => soma + (minutos(f.inicio, f.fim) || 0), 0);
      const emCampo = minutos(j.inicio, j.fim) || 0;
      const disp = emCampo ? Math.round(100 * total / emCampo) : 0;

      const bloco = document.createElement('div');
      bloco.className = 'bloco-equip';
      bloco.innerHTML =
        '<div class="linha-equip"><b></b><span></span></div>' +
        '<p class="fraco pequeno janela-equip">' +
          hhmm(j.inicio) + ' → ' + (j.correndo ? 'agora' : hhmm(j.fim)) +
          ' · ' + duracao(emCampo) + ' em campo' +
          (j.propria ? '' : ' (horário do turno)') +
        '</p>' +
        '<table class="tabela"><tbody>' +
          (faixas.length
            ? faixas.map(f =>
                '<tr><td>' + hhmm(f.inicio) + ' → ' + (f.correndo ? 'agora' : hhmm(f.fim)) + '</td>' +
                '<td>' + duracao(minutos(f.inicio, f.fim)) + '</td></tr>').join('')
            : '<tr><td colspan="2" class="fraco">Não rodou em nenhum momento.</td></tr>') +
        '</tbody></table>';
      bloco.querySelector('b').textContent = e;
      bloco.querySelector('span').textContent =
        duracao(total) + ' rodando · ' + disp + '%';
      rod.appendChild(bloco);
    });
    alvo.appendChild(rod);
  }

  const soma = somatoria(t);
  const completa = temLeitura(t.inicial, t) && temLeitura(t.final, t);
  const nums = document.createElement('div');
  nums.className = 'cartao';
  nums.innerHTML =
    '<h2>Números do turno</h2>' +
    '<table class="tabela"><tbody>' +
      '<tr><td>Duração do turno</td><td>' + duracao(c.duracaoTurno) + '</td></tr>' +
      '<tr><td>Horímetro rodado</td><td>' +
        comUnidade(soma.horimetro != null ? soma.horimetro : c.horimetro, 'h') + '</td></tr>' +
      (completa ? '<tr><td>Balança no turno</td><td>' + comUnidade(soma.balanca, 't') + '</td></tr>' : '') +
      (completa ? '<tr><td>Ácido consumido</td><td>' + mostrarNumero(soma.acido) + '</td></tr>' : '') +
      '<tr><td>Ácido médio por hora</td><td>' + mostrarNumero(c.acidoMedio) + '</td></tr>' +
      '<tr><td>Balança inicial</td><td>' + comUnidade(t.toneladaInicial, 't') + '</td></tr>' +
      '<tr><td>Balança final</td><td>' + comUnidade(t.toneladaFinal, 't') + '</td></tr>' +
      '<tr><td><b>Produção</b> (final − inicial)</td><td><b>' + comUnidade(t.producao, 't') + '</b></td></tr>' +
    '</tbody></table>' +
    (completa ? '' : '<p class="fraco pequeno">Anote a leitura inicial e a final,' +
      ' na aba Leituras, para o app somar o turno inteiro.</p>') +
    '<div class="botoes"><button class="botao" id="editar-producao" type="button">Anotar balança</button></div>';
  alvo.appendChild(nums);

  const extras = areaDe(t).extras;
  if (extras.length) {
    const ce = document.createElement('div');
    ce.className = 'cartao';
    ce.innerHTML = '<h2>' + areaDe(t).nome + ' — dados do turno</h2>' +
      '<table class="tabela"><tbody>' +
        extras.map(e => {
          const v = (t.extras || {})[e.chave];
          const mostrado = e.tipo === 'numero'
            ? comUnidade(v == null ? null : v, e.unidade || '')
            : (v || '—');
          return '<tr><td>' + e.rotulo + '</td><td>' + mostrado + '</td></tr>';
        }).join('') +
      '</tbody></table>' +
      '<div class="botoes"><button class="botao" id="editar-extras" type="button">Anotar</button></div>';
    alvo.appendChild(ce);
    $('#editar-extras').addEventListener('click', () => formExtras(t));
  }

  const acoes = document.createElement('div');
  acoes.className = 'cartao';
  acoes.innerHTML =
    '<h2>Passar adiante</h2>' +
    '<p class="fraco">O relatório sai pronto para colar numa mensagem, como PDF para' +
    ' arquivar ou imprimir, ou como planilha.</p>' +
    '<div class="botoes">' +
      '<button class="botao principal" id="copiar-relatorio" type="button">Copiar relatório</button>' +
      '<button class="botao" id="baixar-pdf" type="button">Baixar PDF</button>' +
      '<button class="botao" id="baixar-csv" type="button">Baixar CSV</button>' +
      '<button class="botao" id="fechar-turno" type="button">' +
        (t.fim ? 'Reabrir turno' : 'Encerrar turno') + '</button>' +
    '</div>';
  alvo.appendChild(acoes);

  $('#editar-producao').addEventListener('click', () => formToneladas(t, false));
  $('#copiar-relatorio').addEventListener('click', () => copiarRelatorio(t));
  $('#baixar-pdf').addEventListener('click', () => baixarPdf(t));
  $('#baixar-csv').addEventListener('click', () => baixarCsv(t));
  $('#fechar-turno').addEventListener('click', async () => {
    if (t.fim) {
      t.fim = null;
      await salvar();
      avisar('Turno reaberto.');
      return;
    }
    formToneladas(t, true);
  });
}

/* ————————————————— lista de turnos ————————————————— */

/** Cartão das áreas carregadas, na aba Turnos. */
function cartaoAreas() {
  const c = document.createElement('div');
  c.className = 'cartao';
  const cfg = estado.config;
  c.innerHTML =
    '<h2>Áreas</h2>' +
    '<p class="fraco" id="sobre-areas"></p>' +
    '<div class="botoes">' +
      '<label class="botao">' + (cfg ? 'Trocar arquivo' : 'Carregar áreas') +
        '<input type="file" id="arquivo-areas-2" hidden></label>' +
      (cfg ? '<button class="botao" id="apagar-areas" type="button">Apagar</button>' : '') +
    '</div>' +
    '<p class="fraco pequeno" id="estado-areas-2" role="status" aria-live="polite"></p>';

  c.querySelector('#sobre-areas').textContent = cfg
    ? cfg.areas.map(a => (a.codigo ? a.codigo + ' ' : '') + a.nome).join(' · ') +
      (cfg.nomeArquivo ? ' — arquivo ' + cfg.nomeArquivo : '')
    : 'Nenhuma área carregada. O app está usando a lista padrão.';

  c.querySelector('#arquivo-areas-2').addEventListener('change',
    ev => carregarAreas(ev.target.files[0], '#estado-areas-2'));
  const apagar = c.querySelector('#apagar-areas');
  if (apagar) apagar.addEventListener('click', async () => {
    if (!confirm('Apagar as áreas deste aparelho? Os turnos continuam guardados.')) return;
    await Dados.removerConfig();
    estado.config = null;
    desenhar();
    avisar('Áreas apagadas.');
  });
  return c;
}

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
    alvo.appendChild(cartaoAreas());
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
    b.querySelector('.nome').textContent =
      dataBonita(t.data) + ' · ' + nomeTurno(t) + ' · ' + areaDe(t).nome;
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
  alvo.appendChild(cartaoAreas());
  alvo.appendChild(cartaoVersao());
}

function desenhar() {
  if (!turnoAtual()) {
    $$('.tela').forEach(s => { s.hidden = s.id !== 'tela-vazio'; });
    $('#abas').hidden = true;
    $('#dica-vazio').textContent = (estado.turnos.length
      ? estado.turnos.length + ' turno(s) guardado(s) neste aparelho. '
      : '') +
      (estado.config ? estado.config.areas.length + ' área(s) carregada(s). ' : '') +
      'Versão ' + VERSAO + '.';
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
  const areas = areasDisponiveis();
  const areaAtual = t ? t.areaId : (estado.prefs.areaId || areas[0].id);
  const escolherArea = areas.length > 1 || (estado.config && estado.config.areas.length);

  const corpo =
    (escolherArea
      ? '<p class="rotulo-grupo">Área</p>' +
        '<div class="escolhas" id="g-area">' +
          areas.map(a => '<button type="button" data-valor="' + a.id + '"' +
            (a.id === areaAtual ? ' class="ativo"' : '') + '>' +
            (a.codigo ? a.codigo + ' · ' : '') + a.nome + '</button>').join('') +
        '</div>'
      : '') +
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

    const areaId = escolherArea ? (escolhido('#g-area') || areas[0].id) : areas[0].id;
    const areaNome = (areas.find(a => a.id === areaId) || areas[0]).nome;

    if (t) {
      Object.assign(t, { data, nome, operador, areaId, areaNome, inicio: d.toISOString() });
    } else {
      const novo = {
        id: id(), data, nome, operador, areaId, areaNome,
        inicio: d.toISOString(), fim: null,
        producao: null, toneladaInicial: null, toneladaFinal: null, paradas: [], detector: [], leituras: [], equipamentos: {}
      };
      estado.turnos.push(novo);
      estado.atual = novo.id;
      trocarTela('turno');
    }
    estado.prefs.turno = nome;
    estado.prefs.operador = operador;
    estado.prefs.areaId = areaId;
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

/* ——— janela do equipamento ——— */

function formJanela(t, nome) {
  const j = janela(t, nome);
  const e = (t.equipamentos || {})[nome] || {};
  const corpo =
    '<div class="dupla-campo">' +
      '<label class="campo">Início<input id="f-ini" type="time" value="' +
        (e.inicio ? paraCampo(e.inicio) : '') + '">' +
        '<button class="agora" type="button" data-agora="f-ini">agora</button></label>' +
      '<label class="campo">Término<input id="f-fim" type="time" value="' +
        (e.fim ? paraCampo(e.fim) : '') + '">' +
        '<button class="agora" type="button" data-agora="f-fim">agora</button></label>' +
    '</div>' +
    '<p class="fraco pequeno">Deixe em branco enquanto não começou ou enquanto' +
    ' ainda está rodando. Sem horário, vale o do turno (' + hhmm(t.inicio) + ').</p>';

  abrirCaixa('Funcionamento · ' + nome, corpo, async () => {
    const inicio = doCampo($('#f-ini').value, t);
    const fim = doCampo($('#f-fim').value, t);
    if (inicio && fim && new Date(fim) < new Date(inicio)) {
      erro('O término está antes do início.');
      return;
    }
    const eq = (t.equipamentos = t.equipamentos || {});
    if (!inicio && !fim) delete eq[nome];
    else eq[nome] = { inicio, fim };
    fecharCaixa();
    await salvar();
    avisar('Horário de ' + nome + ' guardado.');
  }, (e.inicio || e.fim) ? async () => {
    delete t.equipamentos[nome];
    fecharCaixa();
    await salvar();
    avisar('Horário de ' + nome + ' limpo.');
  } : null);
}

/* ——— parada ——— */

function formParada(t, p) {
  const usados = Array.from(new Set(estado.turnos
    .filter(x => x.areaId === t.areaId)
    .flatMap(x => x.paradas.map(y => y.motivo)).filter(Boolean)));
  const sugestoes = Array.from(new Set(motivosDaArea(t).concat(usados)));
  const corpo =
    '<p class="rotulo-grupo">Equipamento</p>' +
    grupoEscolhas('g-equip', equipamentosDaArea(t),
      p ? p.equip : equipamentosDaArea(t)[0], 'f-equip-livre') +
    '<label class="campo"' + (p && !equipamentosDaArea(t).includes(p.equip) ? '' : ' hidden') + '>' +
      'Nome do equipamento' +
      '<input id="f-equip-livre" type="text" placeholder="ex.: Peneira 02, Correia TP 1407" value="' +
      (p && !equipamentosDaArea(t).includes(p.equip) ? p.equip : '') + '"></label>' +
    '<label class="campo">Motivo' +
      '<input id="f-motivo" type="text" list="motivos-usados" value="' + (p ? (p.motivo || '') : '') + '">' +
      '<datalist id="motivos-usados">' +
        sugestoes.map(m => '<option value="' + m.replace(/"/g, '&quot;') + '">').join('') +
      '</datalist>' +
    '</label>' +
    '<div class="dupla-campo">' +
      '<label class="campo">Parada<input id="f-ini" type="time" value="' +
        (p ? paraCampo(p.inicio) : paraCampo(agora())) + '">' +
        '<button class="agora" type="button" data-agora="f-ini">agora</button></label>' +
      '<label class="campo">Retomada<input id="f-fim" type="time" value="' +
        (p && p.fim ? paraCampo(p.fim) : '') + '">' +
        '<button class="agora" type="button" data-agora="f-fim">agora</button></label>' +
    '</div>' +
    '<p class="fraco pequeno">Deixe a retomada em branco enquanto a parada estiver acontecendo.</p>';

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
      'Fora de operação' +
    '</label>' +
    '<div id="campos-leitura">' +
      '<label class="campo">Horímetro (h)' +
        (ultima ? ' <span class="fraco">(última: ' + mostrarNumero(ultima.horimetro) + ')</span>' : '') +
        '<input id="f-horimetro" type="text" inputmode="decimal" enterkeyhint="next" value="' +
        (l && l.horimetro != null ? mostrarNumero(l.horimetro) : '') + '"></label>' +
      '<div class="dupla-campo">' +
        '<label class="campo">Balança (t)<input id="f-balanca" type="text" inputmode="decimal" enterkeyhint="next" value="' +
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

/* ——— leitura inicial e final ——— */

function formExtremo(t, qual) {
  const o = t[qual] || {};
  const titulo = qual === 'inicial' ? 'Leitura inicial' : 'Leitura final';
  const corpo =
    '<label class="campo">Hora<input id="f-hora" type="time" value="' +
      (o.hora ? paraCampo(o.hora) : paraCampo(qual === 'inicial' ? t.inicio : agora())) + '">' +
      '<button class="agora" type="button" data-agora="f-hora">agora</button></label>' +
    medidasDe(t).map(m =>
      '<label class="campo">' + m.rotulo + (m.unidade ? ' (' + m.unidade + ')' : '') +
      '<input id="f-' + m.chave + '" type="text" inputmode="decimal" value="' +
      (o[m.chave] != null ? mostrarNumero(o[m.chave]) : '') + '"></label>').join('') +
    '<p class="fraco pequeno">É o número cheio do totalizador. A somatória do' +
    ' turno sai da diferença entre a final e a inicial.</p>';

  abrirCaixa(titulo, corpo, async () => {
    const dados = { hora: doCampo($('#f-hora').value, t) };
    for (const m of medidasDe(t)) {
      const v = lerNumero($('#f-' + m.chave).value);
      if (Number.isNaN(v)) {
        erro('O valor de ' + m.rotulo.toLowerCase() + ' não é um número. Use só dígitos e vírgula.');
        return;
      }
      dados[m.chave] = v;
    }
    t[qual] = dados;
    fecharCaixa();
    await salvar();
    avisar(titulo + ' guardada.');
  }, temLeitura(o, t) ? async () => {
    delete t[qual];
    fecharCaixa();
    await salvar();
    avisar(titulo + ' apagada.');
  } : null);
}

/* ——— campos próprios da área ——— */

function formExtras(t) {
  const extras = areaDe(t).extras;
  const atual = t.extras || {};
  const corpo = extras.map(e =>
    '<label class="campo">' + e.rotulo + (e.unidade ? ' (' + e.unidade + ')' : '') +
    '<input id="x-' + e.chave + '" type="text"' +
    (e.tipo === 'numero' ? ' inputmode="decimal"' : '') + ' value="' +
    (atual[e.chave] != null
      ? String(e.tipo === 'numero' ? mostrarNumero(atual[e.chave]) : atual[e.chave])
        .replace(/"/g, '&quot;')
      : '') + '">' +
    (e.dica ? '<small>' + e.dica + '</small>' : '') +
    '</label>').join('');

  abrirCaixa(areaDe(t).nome + ' — dados do turno', corpo, async () => {
    const dados = {};
    for (const e of extras) {
      const bruto = $('#x-' + e.chave).value.trim();
      if (e.tipo === 'numero') {
        const v = lerNumero(bruto);
        if (Number.isNaN(v)) {
          erro('O valor de ' + e.rotulo.toLowerCase() + ' não é um número.');
          return;
        }
        dados[e.chave] = v;
      } else {
        dados[e.chave] = bruto || null;
      }
    }
    t.extras = dados;
    fecharCaixa();
    await salvar();
    avisar('Dados do turno guardados.');
  });
}

/* ——— produção ——— */

function formProducao(t) {
  // A balança já pesa em tonelada: a diferença dela é a própria produção.
  const daBalanca = somatoria(t).balanca;
  const corpo =
    '<label class="campo">Produção do turno, em toneladas' +
    '<input id="f-producao" type="text" inputmode="decimal" enterkeyhint="done" value="' +
    (t.producao != null ? mostrarNumero(t.producao) : '') + '"></label>' +
    (daBalanca != null
      ? '<p class="fraco pequeno">A balança marcou <b>' + mostrarNumero(daBalanca) +
        ' t</b> entre a leitura inicial e a final.</p>' +
        '<div class="botoes"><button class="botao" id="f-usar-balanca" type="button">' +
        'Usar ' + mostrarNumero(daBalanca) + ' t</button></div>'
      : '<p class="fraco pequeno">Anotando a leitura inicial e a final da balança,' +
        ' o app sugere a produção sozinho.</p>');

  abrirCaixa('Produção', corpo, async () => {
    const v = lerNumero($('#f-producao').value);
    if (Number.isNaN(v)) { erro('A produção não é um número. Use só dígitos e vírgula.'); return; }
    t.producao = v;
    fecharCaixa();
    await salvar();
    avisar('Produção anotada.');
  });

  const usar = $('#f-usar-balanca');
  if (usar) usar.addEventListener('click', () => {
    $('#f-producao').value = mostrarNumero(daBalanca);
  });
}

/* ——— toneladas: produção = final − inicial ——— */

/** Tonelada final do turno anterior da mesma área, para sugerir a inicial. */
function toneladaAnterior(t) {
  const antes = estado.turnos
    .filter(x => x !== t && x.areaId === t.areaId && x.toneladaFinal != null &&
      new Date(x.inicio) < new Date(t.inicio))
    .sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
  return antes.length ? antes[0].toneladaFinal : null;
}

function calcularProducao(ini, fim) {
  return (ini != null && fim != null) ? +(fim - ini).toFixed(2) : null;
}

/**
 * Caixa das toneladas. Usada no "Anotar toneladas" e no "Encerrar turno":
 * mostra a produção na hora, enquanto a pessoa digita.
 */
function formToneladas(t, encerrar) {
  const sugIni = t.toneladaInicial != null ? t.toneladaInicial : toneladaAnterior(t);
  const valor = v => v != null ? mostrarNumero(v) : '';
  const corpo =
    '<div class="dupla-campo">' +
      '<label class="campo">Balança inicial' +
      '<input id="f-ton-ini" type="text" inputmode="decimal" enterkeyhint="next" value="' +
      valor(sugIni) + '"></label>' +
      '<label class="campo">Balança final' +
      '<input id="f-ton-fim" type="text" inputmode="decimal" enterkeyhint="done" value="' +
      valor(t.toneladaFinal) + '"></label>' +
    '</div>' +
    '<p class="campo">Produção (final − inicial): <b id="f-ton-prod">—</b></p>' +
    (t.toneladaInicial == null && sugIni != null
      ? '<p class="fraco pequeno">A inicial veio da final do turno anterior. Confira.</p>' : '') +
    (encerrar ? '<p class="fraco pequeno">Pode deixar em branco e anotar depois.</p>' : '');

  abrirCaixa(encerrar ? 'Encerrar turno' : 'Balança', corpo, async () => {
    const ini = lerNumero($('#f-ton-ini').value);
    const fim = lerNumero($('#f-ton-fim').value);
    if (Number.isNaN(ini) || Number.isNaN(fim)) {
      erro('Use só dígitos e vírgula na balança.'); return;
    }
    if (ini != null && fim != null && fim < ini) {
      erro('A balança final está menor que a inicial. Confira os números.'); return;
    }
    t.toneladaInicial = ini;
    t.toneladaFinal = fim;
    t.producao = calcularProducao(ini, fim);
    if (encerrar) t.fim = agora();
    fecharCaixa();
    await salvar();
    const prod = t.producao != null ? ' · produção ' + mostrarNumero(t.producao) + ' t' : '';
    avisar((encerrar ? 'Turno encerrado' : 'Balança anotada') + prod + '.');
  });

  const atualizar = () => {
    const p = calcularProducao(lerNumero($('#f-ton-ini').value), lerNumero($('#f-ton-fim').value));
    $('#f-ton-prod').textContent = (p == null || Number.isNaN(p)) ? '—' : mostrarNumero(p) + ' t';
  };
  $('#f-ton-ini').addEventListener('input', atualizar);
  $('#f-ton-fim').addEventListener('input', atualizar);
  atualizar();
  setTimeout(() => { const c = $(sugIni != null ? '#f-ton-fim' : '#f-ton-ini'); if (c) c.focus(); }, 50);
}

/* ————————————————— passar adiante ————————————————— */

function relatorioTexto(t) {
  const c = contasDoTurno(t);
  const L = [];
  const area = areaDe(t);
  L.push((area.codigo ? area.codigo + ' ' : '') + area.nome.toUpperCase() +
    ' — ' + dataBonita(t.data) + ' · ' + nomeTurno(t) + (t.operador ? ' · ' + t.operador : '') +
    (area.io ? '\n' + area.io : ''));
  L.push('Início ' + hhmm(t.inicio) + (t.fim ? ' · fim ' + hhmm(t.fim) : ' · em andamento'));
  L.push('');

  const comJanela = equipamentosDoTurno(t).filter(e => janela(t, e).propria);
  if (comJanela.length) {
    L.push('FUNCIONAMENTO');
    comJanela.forEach(e => {
      const j = janela(t, e);
      L.push('· ' + e + '  ' + (j.iniciou ? hhmm(j.inicio) : 'não iniciou') +
        (j.encerrou ? ' → ' + hhmm(j.fim) : j.iniciou ? ' → em andamento' : ''));
    });
    L.push('');
  }

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
      const j = janela(t, e);
      const faixas = intervalosRodando(t, e);
      const total = faixas.reduce((soma, f) => soma + (minutos(f.inicio, f.fim) || 0), 0);
      const emCampo = minutos(j.inicio, j.fim) || 0;
      const disp = emCampo ? Math.round(100 * total / emCampo) : 0;
      L.push('· ' + e + '  ' + hhmm(j.inicio) + ' → ' + (j.correndo ? 'agora' : hhmm(j.fim)) +
        ':  ' + duracao(total) + ' rodando de ' + duracao(emCampo) + ' (' + disp + '%)');
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
    L.push('LEITURAS  (hora · ' + medidasDe(t)
      .map(m => m.rotulo + (m.unidade ? ' ' + m.unidade : '')).join(' · ') + ')');
    t.leituras.slice().sort((a, b) => new Date(a.hora) - new Date(b.hora)).forEach(l => {
      L.push(l.parada
        ? '· ' + hhmm(l.hora) + '  ' + (l.obs || 'Parada.')
        : '· ' + hhmm(l.hora) + '  ' +
          medidasDe(t).map(m => mostrarNumero(l[m.chave])).join('  ·  ') +
          (l.obs ? '  — ' + l.obs : ''));
    });
    L.push('');
  }

  const soma = somatoria(t);
  if (temLeitura(t.inicial, t) || temLeitura(t.final, t)) {
    L.push('INICIAL E FINAL  (' + medidasDe(t)
      .map(m => m.rotulo + (m.unidade ? ' ' + m.unidade : '')).join(' · ') + ')');
    [['inicial', 'Inicial'], ['final', 'Final  ']].forEach(([chave, rotulo]) => {
      const o = t[chave];
      if (!temLeitura(o, t)) return;
      L.push('· ' + rotulo + (o.hora ? ' ' + hhmm(o.hora) : '') + '   ' +
        medidasDe(t).map(m => comUnidade(o[m.chave], m.unidade)).join('  ·  '));
    });
    if (temLeitura(t.inicial, t) && temLeitura(t.final, t)) {
      L.push('  SOMATÓRIA: ' + medidasDe(t).map(m =>
        m.rotulo + ' ' + (m.complemento || '') + ' ' +
        comUnidade(soma[m.chave], m.unidade)).join(' · '));
    }
    L.push('');
  }

  const extrasArea = areaDe(t).extras.filter(e => (t.extras || {})[e.chave] != null);
  if (extrasArea.length) {
    extrasArea.forEach(e => {
      const v = t.extras[e.chave];
      L.push(e.rotulo + ': ' + (e.tipo === 'numero' ? comUnidade(v, e.unidade || '') : v));
    });
  }

  if (t.producao != null) L.push('PRODUÇÃO: ' + mostrarNumero(t.producao) + ' t');
  const horimetroRodado = soma.horimetro != null ? soma.horimetro : c.horimetro;
  if (horimetroRodado != null) L.push('Horímetro rodado: ' + comUnidade(horimetroRodado, 'h'));
  if (c.acidoMedio != null) L.push('Ácido médio por hora: ' + mostrarNumero(c.acidoMedio));
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

/** O mesmo relatório, em PDF, montado bloco a bloco. */
function blocosDoRelatorio(t) {
  const c = contasDoTurno(t);
  const area = areaDe(t);
  const soma = somatoria(t);
  const B = [];

  B.push({ tipo: 'titulo', texto: (area.codigo ? area.codigo + ' · ' : '') + area.nome });
  B.push({ tipo: 'sub', texto:
    dataBonita(t.data) + ' · ' + nomeTurno(t) +
    (t.operador ? ' · ' + t.operador : '') +
    ' · início ' + hhmm(t.inicio) +
    (t.fim ? ' · fim ' + hhmm(t.fim) : ' · em andamento') +
    (area.io ? '\n' + area.io : '') });
  B.push({ tipo: 'linha' });

  const comJanela = equipamentosDoTurno(t).filter(e => janela(t, e).propria);
  if (comJanela.length) {
    B.push({ tipo: 'h1', texto: 'Funcionamento' });
    B.push({ tipo: 'tabela', colunas: [150, 110, 110, 129],
      cabecalho: ['Equipamento', 'Entrou', 'Saiu', 'Em campo'],
      linhas: comJanela.map(e => {
        const j = janela(t, e);
        return [e, j.iniciou ? hhmm(j.inicio) : 'não iniciou',
          j.encerrou ? hhmm(j.fim) : (j.iniciou ? 'em andamento' : '—'),
          duracao(minutos(j.inicio, j.fim))];
      }) });
  }

  if (t.paradas.length) {
    B.push({ tipo: 'h1', texto: 'Paradas' });
    B.push({ tipo: 'tabela', colunas: [96, 58, 58, 62, 225],
      cabecalho: ['Equipamento', 'Início', 'Fim', 'Duração', 'Motivo'],
      linhas: t.paradas.slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
        .map(p => [p.equip, hhmm(p.inicio), p.fim ? hhmm(p.fim) : '—',
          duracao(minutos(p.inicio, p.fim || relogio(t))), p.motivo || '—']) });
    B.push({ tipo: 'tabela', colunas: [250, 249],
      cabecalho: ['Tempo parado', 'Total'],
      linhas: Object.keys(c.porEquip).sort().map(e => [e, duracao(c.porEquip[e])])
        .concat([['TOTAL PARADO', duracao(c.totalParado)]]) });

    B.push({ tipo: 'h1', texto: 'Tempo rodando' });
    Object.keys(c.porEquip).sort().forEach(e => {
      const j = janela(t, e);
      const faixas = intervalosRodando(t, e);
      const total = faixas.reduce((acc, f) => acc + (minutos(f.inicio, f.fim) || 0), 0);
      const emCampo = minutos(j.inicio, j.fim) || 0;
      const disp = emCampo ? Math.round(100 * total / emCampo) : 0;
      B.push({ tipo: 'h2', texto: e + ' — ' + duracao(total) + ' rodando de ' +
        duracao(emCampo) + ' em campo (' + disp + '%)' });
      B.push({ tipo: 'tabela', colunas: [250, 249],
        cabecalho: ['Intervalo', 'Duração'],
        linhas: faixas.length
          ? faixas.map(f => [hhmm(f.inicio) + ' a ' + (f.correndo ? 'agora' : hhmm(f.fim)),
              duracao(minutos(f.inicio, f.fim))])
          : [['Não rodou em nenhum momento', '—']] });
    });
  }

  if (t.detector.length) {
    B.push({ tipo: 'h1', texto: 'Detector de metal (DT-1101)' });
    B.push({ tipo: 'tabela', colunas: [90, 90, 150, 169],
      cabecalho: ['Acionou', 'Liberou', 'Resultado', 'Observação'],
      linhas: t.detector.slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
        .map(d => [hhmm(d.inicio), d.fim ? hhmm(d.fim) : '—',
          d.achou === true ? 'Metal encontrado' : d.achou === false ? 'Não encontrado' : 'Sem resultado',
          d.obs || '']) });
  }

  const medidas = medidasDe(t);
  if (temLeitura(t.inicial, t) || temLeitura(t.final, t) || t.leituras.length) {
    B.push({ tipo: 'h1', texto: 'Leituras' });
  }
  if (temLeitura(t.inicial, t) || temLeitura(t.final, t)) {
    const colLeitura = [80].concat(medidas.map(() => Math.floor(419 / medidas.length)));
    const linhas = [];
    [['inicial', 'Inicial'], ['final', 'Final']].forEach(([chave, rotulo]) => {
      const o = t[chave];
      if (!temLeitura(o, t)) return;
      linhas.push([rotulo + (o.hora ? ' ' + hhmm(o.hora) : '')]
        .concat(medidas.map(m => comUnidade(o[m.chave], m.unidade))));
    });
    if (temLeitura(t.inicial, t) && temLeitura(t.final, t)) {
      linhas.push(['SOMATÓRIA'].concat(medidas.map(m => comUnidade(soma[m.chave], m.unidade))));
    }
    B.push({ tipo: 'tabela', colunas: colLeitura,
      cabecalho: [''].concat(medidas.map(m => m.rotulo + (m.unidade ? ' (' + m.unidade + ')' : ''))),
      linhas: linhas });
  }
  if (t.leituras.length) {
    const colHora = [70].concat(medidas.map(() => Math.floor(339 / medidas.length))).concat([90]);
    B.push({ tipo: 'h2', texto: 'Hora a hora' });
    B.push({ tipo: 'tabela', colunas: colHora,
      cabecalho: ['Hora'].concat(medidas.map(m => m.rotulo)).concat(['Observação']),
      linhas: t.leituras.slice().sort((a, b) => new Date(a.hora) - new Date(b.hora))
        .map(l => l.parada
          ? [hhmm(l.hora)].concat(medidas.map(() => '—')).concat([l.obs || 'Parada.'])
          : [hhmm(l.hora)].concat(medidas.map(m => mostrarNumero(l[m.chave]))).concat([l.obs || ''])) });
  }

  const linhasFim = [['Duração do turno', duracao(c.duracaoTurno)]];
  const horimetroRodado = soma.horimetro != null ? soma.horimetro : c.horimetro;
  if (horimetroRodado != null) linhasFim.push(['Horímetro rodado', comUnidade(horimetroRodado, 'h')]);
  if (c.acidoMedio != null) linhasFim.push(['Ácido médio por hora', mostrarNumero(c.acidoMedio)]);
  if (t.producao != null) linhasFim.push(['Produção', mostrarNumero(t.producao) + ' t']);
  area.extras.forEach(e => {
    const v = (t.extras || {})[e.chave];
    if (v == null || v === '') return;
    linhasFim.push([e.rotulo, e.tipo === 'numero' ? comUnidade(v, e.unidade || '') : String(v)]);
  });
  B.push({ tipo: 'h1', texto: 'Números do turno' });
  B.push({ tipo: 'tabela', colunas: [250, 249], cabecalho: ['', ''], linhas: linhasFim });
  B.push({ tipo: 'espaco', altura: 2 });

  B.push({ tipo: 'espaco', altura: 6 });
  B.push({ tipo: 'pequeno', texto:
    'Gerado pelo app Britagem ' + VERSAO + ' em ' + dataBonita(hoje()) + ' às ' + hhmm(agora()) +
    '. Registro de apoio: o lançamento oficial continua no Livro de Turno e no SCPC.' });
  return B;
}

function baixarPdf(t) {
  const area = areaDe(t);
  const blob = PDF.gerar(blocosDoRelatorio(t),
    (area.codigo ? area.codigo + ' ' : '') + area.nome + ' · ' +
    dataBonita(t.data) + ' · ' + nomeTurno(t));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'britagem-' + t.data + '-turno-' + t.nome.replace(/\W+/g, '') + '.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  avisar('PDF baixado.');
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
    'motivo', 'horimetro_h', 'balanca_t', 'acido', 'observacao']];
  t.paradas.slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio)).forEach(p =>
    L.push(['parada', p.equip, hhmm(p.inicio), p.fim ? hhmm(p.fim) : '',
      minutos(p.inicio, p.fim || relogio(t)),
      acumuladoAte(t, p, p.equip), acumuladoAte(t, p), p.motivo, '', '', '', '']));
  t.detector.slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio)).forEach(d =>
    L.push(['detector', 'DT 1101', hhmm(d.inicio), d.fim ? hhmm(d.fim) : '',
      minutos(d.inicio, d.fim), '', '',
      d.achou === true ? 'metal encontrado' : d.achou === false ? 'nao encontrado' : '', '', '', '', d.obs]));
  equipamentosDoTurno(t).filter(e => janela(t, e).propria).forEach(e => {
    const j = janela(t, e);
    L.push(['funcionamento', e, j.iniciou ? hhmm(j.inicio) : '', j.encerrou ? hhmm(j.fim) : '',
      minutos(j.inicio, j.fim), '', '', '', '', '', '', j.correndo ? 'em andamento' : '']);
  });
  Object.keys(contasDoTurno(t).porEquip).sort().forEach(e =>
    intervalosRodando(t, e).forEach(f =>
      L.push(['rodando', e, hhmm(f.inicio), f.correndo ? '' : hhmm(f.fim),
        minutos(f.inicio, f.fim), '', '', '', '', '', '', f.correndo ? 'em andamento' : ''])));
  t.leituras.slice().sort((a, b) => new Date(a.hora) - new Date(b.hora)).forEach(l =>
    L.push(['leitura', '', hhmm(l.hora), '', '', '', '', l.parada ? 'parada' : '',
      l.horimetro, l.balanca, l.acido, l.obs]));
  [['inicial', 'leitura inicial'], ['final', 'leitura final']].forEach(([chave, rotulo]) => {
    const o = t[chave];
    if (!temLeitura(o, t)) return;
    L.push([chave, '', o.hora ? hhmm(o.hora) : '', '', '', '', '', rotulo,
      o.horimetro, o.balanca, o.acido, '']);
  });
  if (temLeitura(t.inicial, t) && temLeitura(t.final, t)) {
    const soma = somatoria(t);
    L.push(['somatoria', '', '', '', '', '', '', 'final menos inicial',
      soma.horimetro, soma.balanca, soma.acido, '']);
  }
  // A produção vai na coluna da balança, que é de onde ela sai.
  areaDe(t).extras.forEach(e => {
    const v = (t.extras || {})[e.chave];
    if (v == null || v === '') return;
    L.push(['dado_do_turno', '', '', '', '', '', '', e.rotulo,
      '', '', '', e.tipo === 'numero' ? comUnidade(v, e.unidade || '') : v]);
  });
  if (t.producao != null) {
    L.push(['producao', '', '', '', '', '', '', 'informada por quem fez o turno',
      '', t.producao, '', 'toneladas']);
  }

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

async function carregarAreas(arquivo, onde) {
  if (!arquivo) return;
  const el = $(onde);
  el.textContent = 'Lendo o arquivo…';
  try {
    estado.config = await Dados.importarConfig(arquivo);
    el.textContent = '';
    desenhar();
    avisar(estado.config.areas.length + ' área(s) carregada(s).');
  } catch (e) {
    el.textContent = e.message;
  }
}

function ligarEventos() {
  $('#arquivo-areas').addEventListener('change',
    ev => carregarAreas(ev.target.files[0], '#estado-areas'));
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

/**
 * A versão 2.0.0 trouxe "Britagem" como equipamento, mas é o mesmo
 * Primário. Renomeia o que foi gravado naquele intervalo, uma vez só.
 */
function renomearBritagem(turnos) {
  let mexeu = false;
  turnos.forEach(t => {
    t.paradas.forEach(p => {
      if (p.equip === 'Britagem') { p.equip = 'Primário'; mexeu = true; }
    });
    const eq = t.equipamentos;
    if (eq && eq['Britagem']) {
      eq['Primário'] = Object.assign({}, eq['Primário'], eq['Britagem']);
      delete eq['Britagem'];
      mexeu = true;
    }
  });
  return mexeu;
}

async function iniciar() {
  ligarEventos();
  registrarSW();
  estado.config = await Dados.lerConfig();
  estado.turnos = await Dados.lerTurnos();
  if (renomearBritagem(estado.turnos)) {
    try { await Dados.gravarTurnos(estado.turnos); } catch (e) { /* segue assim mesmo */ }
  }
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
