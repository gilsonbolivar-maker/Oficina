/* ————————————————————————————————————————————————————————————
   Britagem — relatório de turno: paradas, detector de metal e
   leituras. Tudo é guardado no aparelho e funciona sem internet.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '4.3.0';   // precisa casar com a VERSAO do sw.js

// Versão sempre à vista: cada [data-versao] da página mostra a deste app.
for (const lugar of document.querySelectorAll('[data-versao]')) lugar.textContent = 'v' + VERSAO;

/* ————— tema: escuro (o padrão) ou claro —————
   O script no <head> do index.html já aplicou a escolha guardada antes de
   pintar; aqui ficam a troca na hora e o seletor "Tema: [Escuro] [Claro]". */
const CHAVE_TEMA = 'britagem:tema-v2';   // v2: o padrão passou a ser o claro
const HTML_TEMA =
  '<div class="seletor-tema" role="group" aria-label="Tema"><span>Tema:</span>' +
  '<button type="button" data-tema-opcao="escuro">Escuro</button>' +
  '<button type="button" data-tema-opcao="claro">Claro</button></div>';

function aplicarTema(tema) {
  tema = tema === 'escuro' ? 'escuro' : 'claro';
  document.documentElement.dataset.tema = tema;
  const cor = document.querySelector('meta[name="theme-color"]');
  if (cor) cor.content = tema === 'claro' ? '#fbf4ec' : '#0b1220';
  const barra = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (barra) barra.content = tema === 'claro' ? 'default' : 'black-translucent';
  try { localStorage.setItem(CHAVE_TEMA, tema); } catch (e) {}
  marcarTema();
}

/** Marca no(s) seletor(es) qual tema está valendo. */
function marcarTema() {
  const atual = document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro';
  for (const b of document.querySelectorAll('[data-tema-opcao]')) {
    b.setAttribute('aria-pressed', String(b.dataset.temaOpcao === atual));
  }
}

document.addEventListener('click', ev => {
  const b = ev.target.closest && ev.target.closest('[data-tema-opcao]');
  if (b) aplicarTema(b.dataset.temaOpcao);
});

/* No app Android (APK), a página ganha window.BritagemNativo: salva arquivos
   em Downloads (e oferece para enviar) e copia texto, o que a WebView não faz. */
const nativo = window.BritagemNativo || null;

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
    { chave: 'acido', rotulo: 'Ácido', complemento: 'consumido', unidade: 'm³', unidadeHora: 'm³/h', tipo: 'vazao' }
  ],
  extras: [],
  tags: null       // null = usa TAGS_PADRAO
};

/* As máquinas de cada sistema, com a tag do painel (Logicon/Cimtec).
   Na parada, a tag é opcional: diz qual máquina, dentro do sistema, parou. */
const TAGS_PADRAO = {
  'Primário': ['AL-1101', 'BR-1101', 'TP-1101', 'AL-1102.1', 'AL-1102.2', 'TP-1102', 'DT-1101', 'BR-1102'],
  'Rebritagem': ['TP-1103', 'PE-1101', 'TP-1104', 'TP-1105', 'TP-1106', 'TP-1107',
    'BR-1103', 'BR-1104', 'MG-1401', 'AE-1401', 'TP-1401']
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
  areaAba: null,   // a área aberta na tela do turno
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
  if (!turno) return d.toISOString();
  // Só a hora foi digitada: o dia é o da véspera, o do início ou o seguinte,
  // o que ficar mais perto de agora (ou do fim, num turno encerrado). Assim
  // 01h40 num turno das 22h cai no dia seguinte, e 01h40 num turno aberto
  // às 03h30 (ou com o início corrigido depois) fica no mesmo dia.
  const ref = new Date(relogio(turno)).getTime();
  const inicio = base.getTime();
  let melhor = null;
  [-1, 0, 1].forEach(dias => {
    const c = new Date(d);
    c.setDate(c.getDate() + dias);
    if (c.getTime() < inicio - 12 * 3600000) return;
    if (!melhor || Math.abs(c.getTime() - ref) < Math.abs(melhor.getTime() - ref)) melhor = c;
  });
  return (melhor || d).toISOString();
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

/**
 * Horímetro COEL 1/100: o visor tem 7 tambores e os dois últimos, em
 * vermelho, são centésimos de hora — "0422216" no visor é 4222,16 h.
 * Com vírgula ou ponto, vale como foi digitado; só com dígitos, igual ao
 * visor, os dois últimos viram os centésimos.
 */
function lerHorimetro(texto) {
  const t = String(texto == null ? '' : texto).trim().replace(/\s/g, '');
  if (/^\d+$/.test(t)) return +(Number(t) / 100).toFixed(2);
  return lerNumero(t);
}

/** Mostra embaixo do campo como o horímetro foi entendido: "= 4222,16 h". */
function previaHorimetro(campo) {
  const previa = document.createElement('span');
  previa.className = 'fraco pequeno previa-horimetro';
  campo.insertAdjacentElement('afterend', previa);
  const atualizar = () => {
    const v = lerHorimetro(campo.value);
    previa.textContent = (v == null || Number.isNaN(v)) ? '' : '= ' + mostrarNumero(v) + ' h';
  };
  campo.addEventListener('input', atualizar);
  atualizar();
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
const tagsDe = (t, equip) => ((areaDe(t).tags || TAGS_PADRAO)[equip] || []).slice();
/** "Primário · BR-1101", ou só "Primário" quando a máquina não foi dita. */
const nomeParada = p => p.equip + (p.tag ? ' · ' + p.tag : '');
/**
 * O ácido tem dois números: na leitura inicial e na final, o totalizador do
 * instrumento (m³) — a somatória é final − inicial, o consumido no turno;
 * na hora a hora, a vazão do momento (m³/h), que dá a média do turno.
 * Vale também para o ácido de uma área carregada de arquivo.
 */
const ehVazao = m => m.tipo === 'vazao' || m.chave === 'acido';
const medidasDe = t => areaDe(t).medidas.map(m => ehVazao(m)
  ? Object.assign({}, m, {
      tipo: 'vazao',
      unidade: (m.unidade || 'm³').replace(/\/h$/, ''),
      unidadeHora: m.unidadeHora || 'm³/h',
      complemento: 'consumido'
    })
  : m);
/** A unidade na hora a hora: a vazão (m³/h) para o ácido, a mesma para o resto. */
const unidadeHora = m => m.unidadeHora || m.unidade;

/** Média de uma vazão no turno: só as leituras de hora em hora (a inicial e a final são totalizador). */
function mediaVazao(t, chave) {
  const valores = t.leituras.filter(l => !l.parada)
    .filter(o => o && o[chave] != null).map(o => o[chave]);
  return valores.length ? +(valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2) : null;
}

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

/* ————————————————— cada área no seu bloco ————————————————— */

/**
 * Tudo de uma área (equipamento) no turno: janela, paradas dela, tempo parado
 * dentro da janela, intervalos rodando e disponibilidade. As áreas não se misturam.
 */
function dadosArea(t, e) {
  const j = janela(t, e);
  const paradas = t.paradas.filter(p => p.equip === e)
    .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const parado = paradas.reduce((s, p) => s + minutosNaJanela(p.inicio, p.fim || j.fim, j), 0);
  const faixas = intervalosRodando(t, e);
  const rodando = faixas.reduce((s, f) => s + (minutos(f.inicio, f.fim) || 0), 0);
  const emCampo = minutos(j.inicio, j.fim) || 0;
  return { nome: e, j, paradas, parado, faixas, rodando, emCampo,
    disp: emCampo ? Math.round(100 * rodando / emCampo) : 0 };
}

/** Áreas que entram no resumo e nos relatórios: as que tiveram janela própria ou parada. */
const areasComRegistro = t => equipamentosDoTurno(t)
  .filter(e => janela(t, e).propria || t.paradas.some(p => p.equip === e));

/** A área da aba aberta: a escolhida, ou a que tem parada aberta, ou a primeira. */
function areaDaAba(t) {
  const lista = equipamentosDoTurno(t);
  if (lista.includes(estado.areaAba)) return estado.areaAba;
  const comAberta = lista.find(e => t.paradas.some(p => p.equip === e && !p.fim));
  return comAberta || lista[0];
}

/** "Parada 01h40 · Retomada 02h34" */
const paradaRetomada = p => 'Parada ' + hhmm(p.inicio) + ' · Retomada ' + (p.fim ? hhmm(p.fim) : '—');

function textoJanela(j) {
  return !j.iniciou && !j.encerrou ? 'horário do turno: ' + hhmm(j.inicio) + ' → ' + (j.correndo ? 'agora' : hhmm(j.fim))
    : hhmm(j.inicio) + ' → ' + (j.correndo ? 'em andamento' : hhmm(j.fim));
}

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
        (aberta ? '<button class="botao principal" data-encerrar="1" type="button">Retomada agora</button>' : '') +
        '<button class="botao" data-editar="1" type="button">Editar</button>' +
      '</div>' +
    '</div>' +
    '<span class="dur' + (aberta ? ' correndo' : '') + '"></span>';

  if (p.tag) div.querySelector('.equip').textContent = p.tag;
  else div.querySelector('.equip').remove();
  div.querySelector('.horas').textContent = paradaRetomada(p);
  div.querySelector('.motivo').textContent = p.motivo || 'sem motivo anotado';
  const antes = rodouAntes(t, p);
  const campoRodou = div.querySelector('.rodou');
  if (antes) campoRodou.textContent = '▶ rodou ' + duracao(antes) + ' antes desta parada';
  else campoRodou.remove();

  div.querySelector('.acumulado').textContent =
    'Σ parado até aqui em ' + p.equip + ': ' + duracao(acumuladoAte(t, p, p.equip));

  div.querySelector('.dur').textContent = duracao(min);

  const enc = div.querySelector('[data-encerrar]');
  if (enc) enc.addEventListener('click', async () => {
    p.fim = agora();
    await salvar();
    avisar(p.equip + ': retomada às ' + hhmm(p.fim) + ' (' + duracao(minutos(p.inicio, p.fim)) + ' parado).');
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

/** O bloco de uma área na tela do turno: funcionamento, contas e as paradas dela. */
function cartaoArea(t, nome) {
  const d = dadosArea(t, nome);
  const j = d.j;
  const c = document.createElement('div');
  c.className = 'cartao bloco-area' + (j.correndo && j.iniciou ? ' rodando' : '') +
    (d.paradas.some(p => !p.fim) ? ' parada-aberta' : '');
  c.innerHTML =
    '<div class="cabeca-area">' +
      '<button class="nome-area" type="button"></button>' +
      '<button class="botao pequeno" data-acao="1" type="button"></button>' +
    '</div>' +
    '<p class="janela-area"></p>' +
    '<p class="contas-area"></p>';
  c.querySelector('.nome-area').textContent = nome;
  c.querySelector('.janela-area').textContent = 'Funcionamento: ' +
    (!j.iniciou ? 'não iniciou' : j.encerrou ? hhmm(j.inicio) + ' → ' + hhmm(j.fim)
      : 'desde ' + hhmm(j.inicio) + ' · ' + duracao(minutos(j.inicio, j.fim)));
  c.querySelector('.contas-area').textContent = (!j.propria && !d.paradas.length)
    ? 'Sem registro neste turno.'
    : '⏸ ' + duracao(d.parado) + ' parado · ▶ ' + duracao(d.rodando) + ' rodando (' + d.disp + '%)';

  const acao = c.querySelector('[data-acao]');
  acao.textContent = !j.iniciou ? 'Iniciar' : j.encerrou ? 'Reabrir' : 'Encerrar';
  acao.addEventListener('click', async () => {
    const eq = (t.equipamentos = t.equipamentos || {});
    const atual = (eq[nome] = eq[nome] || {});
    if (!j.iniciou) { atual.inicio = agora(); avisar(nome + ' iniciou às ' + hhmm(atual.inicio) + '.'); }
    else if (j.encerrou) { atual.fim = null; avisar(nome + ' reaberto.'); }
    else { atual.fim = agora(); avisar(nome + ' encerrado às ' + hhmm(atual.fim) + '.'); }
    await salvar();
  });
  c.querySelector('.nome-area').addEventListener('click', () => formJanela(t, nome));

  if (!d.paradas.length) {
    const v = document.createElement('p');
    v.className = 'fraco pequeno';
    v.textContent = 'Nenhuma parada.';
    c.appendChild(v);
  } else {
    d.paradas.forEach(p => c.appendChild(fichaParada(p, t)));
  }
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

  // Uma aba por área; só a área escolhida aparece.
  const atual = areaDaAba(t);
  const abas = document.createElement('div');
  abas.className = 'abas-area';
  abas.setAttribute('role', 'tablist');
  equipamentosDoTurno(t).forEach(e => {
    const j = janela(t, e);
    const aberta = t.paradas.some(p => p.equip === e && !p.fim);
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(e === atual));
    b.className = 'aba-area' + (e === atual ? ' ativa' : '') + (aberta ? ' parada' : j.correndo && j.iniciou ? ' rodando' : '');
    b.innerHTML = '<span class="ponto" aria-hidden="true"></span><span class="nome"></span>';
    b.querySelector('.nome').textContent = e;
    b.addEventListener('click', () => { estado.areaAba = e; desenharTurno(); });
    abas.appendChild(b);
  });
  alvo.appendChild(abas);
  alvo.appendChild(cartaoArea(t, atual));

  const dica = document.createElement('p');
  dica.className = 'fraco pequeno';
  dica.textContent = 'Toque no nome da área para corrigir o horário de funcionamento.';
  alvo.appendChild(dica);

  if (t.detector.length) {
    const det = document.createElement('div');
    det.className = 'cartao';
    det.innerHTML = '<h2>Detector DT 1101</h2>';
    t.detector.slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
      .forEach(d => det.appendChild(fichaDetector(d, t)));
    alvo.appendChild(det);
  }
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
  const bal = balancaNoTurno(t);
  const c = document.createElement('div');
  c.className = 'cartao somatoria';
  c.innerHTML = '<h2>Somatória do turno</h2>';

  // O resultado da balança: leitura final − leitura inicial.
  const res = document.createElement('div');
  res.className = 'resultado-balanca';
  res.innerHTML = '<span>Balança no turno <small>(leitura final − leitura inicial)</small></span><b></b>';
  res.querySelector('b').textContent = bal && bal.inicial != null ? comUnidade(bal.total, 't') : '—';
  if (bal && bal.inicial != null) {
    const conta = document.createElement('p');
    conta.className = 'fraco pequeno conta-balanca';
    conta.textContent = mostrarNumero(bal.final) + ' − ' + mostrarNumero(bal.inicial) + ' = ' + comUnidade(bal.total, 't');
    res.appendChild(conta);
  }
  c.appendChild(res);

  if (!temLeitura(t.inicial, t) || !temLeitura(t.final, t)) {
    c.innerHTML += '<p class="fraco">Anote a leitura inicial e a final para o app' +
      ' fazer a conta — é a diferença entre as duas.</p>';
    return c;
  }
  const tb = document.createElement('table');
  tb.className = 'tabela';
  tb.innerHTML = '<tbody>' + medidasDe(t).filter(m => m.chave !== 'balanca').map(m =>
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
      .map(m => '<th>' + m.rotulo + (unidadeHora(m) ? ' (' + unidadeHora(m) + ')' : '') + '</th>').join('') +
      '<th></th></tr></thead>';
    const corpo = document.createElement('tbody');

    let anterior = null;
    let somaBalanca = 0;
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
        if (l.balanca != null) {
          somaBalanca = +(somaBalanca + l.balanca).toFixed(2);
          td[2].innerHTML = mostrarNumero(l.balanca) +
            ' <span class="delta">Σ ' + mostrarNumero(somaBalanca) + '</span>';
        } else {
          td[2].textContent = '—';
        }
        td[3].textContent = mostrarNumero(l.acido);
      }
      tr.querySelector('button').addEventListener('click', () => formLeitura(t, l));
      corpo.appendChild(tr);
      if (!l.parada) anterior = l;
    });
    tab.appendChild(corpo);
    const acumulada = balancaAcumulada(t);
    if (acumulada != null) {
      const pe = document.createElement('tfoot');
      pe.innerHTML = '<tr class="acumulado"><td>Σ hora</td><td></td><td></td><td></td><td></td></tr>';
      pe.querySelectorAll('td')[2].textContent = comUnidade(acumulada, 't');
      tab.appendChild(pe);
    }
    horarias.appendChild(tab);
    if (acumulada != null) {
      const nota = document.createElement('p');
      nota.className = 'fraco pequeno';
      nota.textContent = 'Σ hora: só a soma das leituras hora a hora. O resultado da balança no turno ' +
        'é a leitura final − a leitura inicial (Somatória, abaixo).';
      horarias.appendChild(nota);
    }
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

/**
 * Balança acumulada: a soma das leituras hora a hora (o que passou em cada
 * hora). A inicial e a final ficam de fora — são o totalizador, não a hora.
 */
function balancaAcumulada(t) {
  const valores = t.leituras.filter(l => !l.parada && l.balanca != null).map(l => l.balanca);
  return valores.length ? +valores.reduce((a, b) => a + b, 0).toFixed(2) : null;
}

/**
 * Balança distribuída: a diferença dos totalizadores (final − inicial)
 * repartida entre as leituras hora a hora, na proporção de cada uma. O
 * arredondamento que sobra vai na última, para a soma fechar exato.
 * Devolve null sem as duas leituras do totalizador ou sem hora a hora.
 */
function distribuicaoBalanca(t) {
  const ini = t.inicial && t.inicial.balanca, fim = t.final && t.final.balanca;
  const lidas = t.leituras.filter(l => !l.parada && l.balanca != null)
    .sort((a, b) => new Date(a.hora) - new Date(b.hora));
  const soma = balancaAcumulada(t);
  if (ini == null || fim == null || !lidas.length || !soma) return null;
  const total = +(fim - ini).toFixed(2);
  const fator = total / soma;
  const valores = {};
  let parcial = 0;
  lidas.forEach((l, i) => {
    const v = i === lidas.length - 1 ? +(total - parcial).toFixed(2) : +(l.balanca * fator).toFixed(2);
    valores[l.id] = v;
    parcial = +(parcial + v).toFixed(2);
  });
  return { total, soma, fator, valores };
}

/**
 * Balança no turno: leitura final − leitura inicial da balança (aba Leituras).
 * Turno antigo, anotado só em "Anotar balança", usa o que foi anotado lá.
 */
function balancaNoTurno(t) {
  const ini = t.inicial && t.inicial.balanca, fim = t.final && t.final.balanca;
  if (ini != null && fim != null) {
    return { inicial: ini, final: fim, total: +(fim - ini).toFixed(2) };
  }
  if (t.toneladaInicial != null && t.toneladaFinal != null) {
    return { inicial: t.toneladaInicial, final: t.toneladaFinal, total: +(t.toneladaFinal - t.toneladaInicial).toFixed(2) };
  }
  return t.producao != null ? { inicial: null, final: null, total: t.producao } : null;
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

/** Ácido consumido: final − inicial do totalizador; só aparece com as duas leituras. */
function linhasAcido(t, c, soma) {
  return soma.acido != null ? [['Ácido consumido (final − inicial)', comUnidade(soma.acido, 'm³')]] : [];
}

const temLeitura = (o, t) => !!o && medidasDe(t).some(m => o[m.chave] != null);

/* ————————————————— resumo ————————————————— */

function contasDoTurno(t) {
  const porEquip = {};
  const porTag = {};
  let totalParado = 0;
  t.paradas.forEach(p => {
    const j = janela(t, p.equip);
    const m = minutosNaJanela(p.inicio, p.fim || j.fim, j);
    porEquip[p.equip] = (porEquip[p.equip] || 0) + m;
    if (p.tag) porTag[p.tag] = (porTag[p.tag] || 0) + m;
    totalParado += m;
  });
  const leituras = t.leituras.filter(l => !l.parada && l.horimetro != null)
    .sort((a, b) => new Date(a.hora) - new Date(b.hora));
  const horimetro = leituras.length > 1
    ? +(leituras[leituras.length - 1].horimetro - leituras[0].horimetro).toFixed(2)
    : null;
  return {
    porEquip,
    porTag,
    totalParado,
    paradas: t.paradas.length,
    abertas: t.paradas.filter(p => !p.fim).length,
    acionamentos: t.detector.length,
    encontrados: t.detector.filter(d => d.achou === true).length,
    horimetro,
    acidoMedio: mediaVazao(t, 'acido'),
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

  // Uma folha por área: as áreas não se misturam.
  const areas = areasComRegistro(t);
  if (!areas.length) {
    const v = document.createElement('div');
    v.className = 'cartao';
    v.innerHTML = '<p class="fraco">Nenhuma área iniciada nem parada registrada.</p>';
    alvo.appendChild(v);
  }
  areas.forEach(e => {
    const d = dadosArea(t, e);
    const k = document.createElement('div');
    k.className = 'cartao bloco-area';
    k.innerHTML =
      '<h2></h2>' +
      '<p class="fraco pequeno"></p>' +
      '<table class="tabela"><thead><tr><th>Parada</th><th>Retomada</th><th>Duração</th><th>Motivo</th></tr></thead><tbody>' +
        (d.paradas.length ? d.paradas.map(p =>
          '<tr><td>' + hhmm(p.inicio) + '</td><td>' + (p.fim ? hhmm(p.fim) : 'em andamento') + '</td><td>' +
            duracao(minutos(p.inicio, p.fim || relogio(t))) + '</td><td class="motivo-celula"></td></tr>').join('')
          : '<tr><td colspan="4" class="fraco">Nenhuma parada.</td></tr>') +
      '</tbody></table>' +
      '<table class="tabela"><tbody>' +
        '<tr><td>Em campo</td><td>' + duracao(d.emCampo) + '</td></tr>' +
        '<tr><td>Parado</td><td><b>' + duracao(d.parado) + '</b></td></tr>' +
        '<tr><td>Rodando</td><td><b>' + duracao(d.rodando) + '</b> (' + d.disp + '%)</td></tr>' +
      '</tbody></table>' +
      '<p class="fraco pequeno">Rodou: ' + (d.faixas.length ? d.faixas.map(f =>
        hhmm(f.inicio) + ' → ' + (f.correndo ? 'agora' : hhmm(f.fim)) + ' (' + duracao(minutos(f.inicio, f.fim)) + ')').join(' · ')
        : 'em nenhum momento') + '</p>';
    k.querySelector('h2').textContent = e;
    k.querySelectorAll('p')[0].textContent = 'Funcionamento: ' + textoJanela(d.j);
    k.querySelectorAll('.motivo-celula').forEach((td, n) => {
      const p = d.paradas[n];
      td.textContent = (p.tag ? p.tag + ' · ' : '') + (p.motivo || '—');
    });
    alvo.appendChild(k);
  });

  const soma = somatoria(t);
  const bal = balancaNoTurno(t);
  const nums = document.createElement('div');
  nums.className = 'cartao';
  nums.innerHTML =
    '<h2>Números do turno</h2>' +
    '<table class="tabela"><tbody>' +
      '<tr><td>Duração do turno</td><td>' + duracao(c.duracaoTurno) + '</td></tr>' +
      '<tr><td>Horímetro rodado</td><td>' +
        comUnidade(soma.horimetro != null ? soma.horimetro : c.horimetro, 'h') + '</td></tr>' +
      (balancaAcumulada(t) != null ? '<tr><td>Balança acumulada <span class="fraco">(soma hora a hora)</span></td><td>' +
        comUnidade(balancaAcumulada(t), 't') + '</td></tr>' : '') +
      '<tr><td>Ácido médio <span class="fraco">(hora a hora)</span></td><td>' + comUnidade(c.acidoMedio, 'm³/h') + '</td></tr>' +
      linhasAcido(t, c, soma).map(([r, v]) => '<tr><td>' + r + '</td><td>' + v + '</td></tr>').join('') +
      '<tr><td>Balança inicial <span class="fraco">(leitura)</span></td><td>' + comUnidade(bal ? bal.inicial : (t.inicial && t.inicial.balanca), 't') + '</td></tr>' +
      '<tr><td>Balança final <span class="fraco">(leitura)</span></td><td>' + comUnidade(bal ? bal.final : (t.final && t.final.balanca), 't') + '</td></tr>' +
      '<tr><td><b>Balança no turno</b> (final − inicial)</td><td><b>' + comUnidade(bal ? bal.total : null, 't') + '</b></td></tr>' +
    '</tbody></table>' +
    (bal && bal.inicial != null ? '' : '<p class="fraco pequeno">Anote a balança na leitura inicial e na final,' +
      ' na aba Leituras: a balança no turno é a final menos a inicial.</p>');
  alvo.appendChild(nums);

  // Caçambas: material bruto que entrou. Fica à parte da balança, que pesa
  // o material britado — os dois números não se somam.
  if ((t.cacambas || []).length) {
    const cac = document.createElement('div');
    cac.className = 'cartao';
    cac.innerHTML = '<h2>Caçambas <span class="fraco">(material bruto)</span></h2>' +
      '<table class="tabela"><tbody>' +
        '<tr><td>Basculadas</td><td>' + t.cacambas.length + '</td></tr>' +
        '<tr><td>Peso médio</td><td>' + comUnidade(pesoCacamba(t), 't') + '</td></tr>' +
        '<tr><td><b>Bruto estimado</b> (basculadas × peso)</td><td><b>' + comUnidade(toneladasCacambas(t), 't') + '</b></td></tr>' +
      '</tbody></table>' +
      '<p class="fraco pequeno">Material bruto, separado da balança (material britado).</p>';
    alvo.appendChild(cac);
  }

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
      '<button class="botao" id="baixar-pdf" type="button">PDF com hora a hora</button>' +
      '<button class="botao" id="baixar-pdf-distribuido" type="button">PDF balança distribuída</button>' +
      '<button class="botao" id="baixar-pdf-resumo" type="button">PDF resumo (sem hora a hora)</button>' +
      '<button class="botao" id="baixar-csv" type="button">Baixar CSV</button>' +
      '<button class="botao" id="fechar-turno" type="button">' +
        (t.fim ? 'Reabrir turno' : 'Encerrar turno') + '</button>' +
    '</div>';
  alvo.appendChild(acoes);

  $('#copiar-relatorio').addEventListener('click', () => copiarRelatorio(t));
  $('#baixar-pdf').addEventListener('click', () => baixarPdf(t, 'hora'));
  $('#baixar-pdf-resumo').addEventListener('click', () => baixarPdf(t, 'resumo'));
  $('#baixar-pdf-distribuido').addEventListener('click', () => {
    if (!distribuicaoBalanca(t)) {
      avisar('Para distribuir, anote a balança na leitura inicial, na final e na hora a hora.');
      return;
    }
    baixarPdf(t, 'distribuido');
  });
  $('#baixar-csv').addEventListener('click', () => baixarCsv(t));
  $('#fechar-turno').addEventListener('click', async () => {
    if (t.fim) {
      t.fim = null;
      await salvar();
      avisar('Turno reaberto.');
      return;
    }
    // A balança do turno sai das leituras: sem a final, pede a leitura final primeiro.
    if (!(t.final && t.final.balanca != null)) {
      avisar('Anote a leitura final (com a balança) antes de encerrar.');
      formExtremo(t, 'final');
      return;
    }
    if (!confirm('Encerrar o turno agora?')) return;
    t.fim = agora();
    await salvar();
    const bal = balancaNoTurno(t);
    avisar('Turno encerrado' + (bal ? ' · balança no turno ' + comUnidade(bal.total, 't') : '') + '.');
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

/** Aparência: o tema escuro (padrão) ou claro. Troca na hora. */
function cartaoAparencia() {
  const c = document.createElement('div');
  c.className = 'cartao';
  c.innerHTML = '<h2>Aparência</h2>' + HTML_TEMA;
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
  // No Android, pelo navegador, oferece o app instalável (APK).
  if (!nativo && /Android/i.test(navigator.userAgent)) {
    const apk = document.createElement('a');
    apk.className = 'botao';
    apk.href = 'https://github.com/gilsonbolivar-maker/Oficina/releases/download/britagem-apk/britagem.apk';
    apk.textContent = 'Baixar o app Android (APK)';
    c.querySelector('.botoes').appendChild(apk);
  }
  c.querySelector('#procurar-atualizacao').addEventListener('click', procurarAtualizacao);
  return c;
}

function desenharTurnos() {
  const alvo = $('#lista-turnos');
  alvo.innerHTML = '';
  if (!estado.turnos.length) {
    alvo.innerHTML = '<p class="vazio">Nenhum turno ainda.</p>';
    alvo.appendChild(cartaoAreas());
    alvo.appendChild(cartaoAparencia());
    alvo.appendChild(cartaoVersao());
    marcarTema();
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
  alvo.appendChild(cartaoAparencia());
  alvo.appendChild(cartaoVersao());
  marcarTema();
}

/* ————————————————— caçambas ————————————————— */

/** Peso médio de uma caçamba, em toneladas (dá para trocar por turno). */
const PESO_CACAMBA_PADRAO = 23;
const pesoCacamba = t => (t.pesoCacamba > 0 ? t.pesoCacamba : PESO_CACAMBA_PADRAO);
const cacambasDe = t => (t.cacambas || []).slice().sort((a, b) => new Date(a.hora) - new Date(b.hora));
const toneladasCacambas = t => +((t.cacambas || []).length * pesoCacamba(t)).toFixed(2);
const nomeCacambas = n => n === 1 ? 'caçamba' : 'caçambas';

function desenharCacambas() {
  const t = turnoAtual();
  const alvo = $('#lista-cacambas');
  alvo.innerHTML = '';
  if (!t) return;
  const lista = cacambasDe(t);
  $('#cacambas-total').textContent = lista.length;
  $('#cacambas-rotulo').textContent = nomeCacambas(lista.length);
  $('#cacambas-toneladas').textContent = '≈ ' + comUnidade(toneladasCacambas(t), 't') +
    '  (' + mostrarNumero(pesoCacamba(t)) + ' t cada)';
  $('#desfazer-cacamba').hidden = !lista.length;

  if (!lista.length) {
    alvo.innerHTML = '<div class="cartao"><p class="fraco">Toque em <b>＋ Caçamba basculou</b> cada vez' +
      ' que um caminhão bascular na moega. O app anota a hora.</p></div>';
    return;
  }

  // Quantas por hora do relógio.
  const porHora = {};
  lista.forEach(c => {
    const h = String(new Date(c.hora).getHours()).padStart(2, '0') + 'h';
    porHora[h] = (porHora[h] || 0) + 1;
  });
  const resumo = document.createElement('div');
  resumo.className = 'cartao';
  resumo.innerHTML = '<h2>Por hora</h2><table class="tabela"><tbody>' +
    Object.keys(porHora).map(h => '<tr><td>' + h + '</td><td>' + porHora[h] + ' ' + nomeCacambas(porHora[h]) +
      '</td><td>' + comUnidade(+(porHora[h] * pesoCacamba(t)).toFixed(2), 't') + '</td></tr>').join('') +
    '</tbody></table>';
  alvo.appendChild(resumo);

  const cartao = document.createElement('div');
  cartao.className = 'cartao';
  cartao.innerHTML = '<h2>Basculadas</h2>';
  const tab = document.createElement('table');
  tab.className = 'tabela';
  tab.innerHTML = '<thead><tr><th>Nº</th><th>Hora</th><th>Intervalo</th><th></th></tr></thead>';
  const corpo = document.createElement('tbody');
  lista.slice().reverse().forEach(c => {
    const n = lista.indexOf(c);
    const anterior = n > 0 ? lista[n - 1] : null;
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="num"></td><td></td><td class="fraco"></td>' +
      '<td><button type="button">editar</button></td>';
    const td = tr.querySelectorAll('td');
    td[0].textContent = n + 1;
    td[1].textContent = hhmm(c.hora);
    td[2].textContent = anterior ? '+' + duracao(minutos(anterior.hora, c.hora)) : '—';
    tr.querySelector('button').addEventListener('click', () => formCacamba(t, c));
    corpo.appendChild(tr);
  });
  tab.appendChild(corpo);
  cartao.appendChild(tab);
  alvo.appendChild(cartao);
}

async function contarCacamba() {
  const t = turnoAtual();
  if (!t) return;
  t.cacambas = t.cacambas || [];
  const c = { id: id(), hora: agora() };
  t.cacambas.push(c);
  await salvar();
  if (navigator.vibrate) navigator.vibrate(40);
  avisar('Caçamba ' + t.cacambas.length + ' às ' + hhmm(c.hora) + '.');
}

async function desfazerCacamba() {
  const t = turnoAtual();
  const lista = t ? cacambasDe(t) : [];
  if (!lista.length) return;
  const ultima = lista[lista.length - 1];
  if (!confirm('Apagar a caçamba ' + lista.length + ', das ' + hhmm(ultima.hora) + '?')) return;
  t.cacambas = t.cacambas.filter(c => c.id !== ultima.id);
  await salvar();
  avisar('Caçamba das ' + hhmm(ultima.hora) + ' apagada.');
}

function formCacamba(t, c) {
  const corpo =
    '<label class="campo">Hora que basculou<input id="f-hora" type="time" value="' + paraCampo(c.hora) + '">' +
      '<button class="agora" type="button" data-agora="f-hora">agora</button></label>';
  abrirCaixa('Caçamba ' + (cacambasDe(t).indexOf(c) + 1), corpo, async () => {
    const hora = doCampo($('#f-hora').value, t);
    if (!hora) { erro('Informe a hora.'); return; }
    c.hora = hora;
    fecharCaixa();
    await salvar();
    avisar('Caçamba atualizada.');
  }, async () => {
    t.cacambas = t.cacambas.filter(x => x.id !== c.id);
    fecharCaixa();
    await salvar();
    avisar('Caçamba apagada.');
  });
}

function formPesoCacamba(t) {
  const corpo =
    '<label class="campo">Peso médio de uma caçamba (t)' +
      '<input id="f-peso" type="text" inputmode="decimal" value="' + mostrarNumero(pesoCacamba(t)) + '"></label>' +
    '<p class="fraco pequeno">Vale para este turno. O padrão é ' + PESO_CACAMBA_PADRAO + ' t.</p>';
  abrirCaixa('Peso da caçamba', corpo, async () => {
    const v = lerNumero($('#f-peso').value);
    if (v == null || Number.isNaN(v) || v <= 0) { erro('Digite um peso maior que zero, em toneladas.'); return; }
    t.pesoCacamba = v;
    fecharCaixa();
    await salvar();
    avisar('Peso médio: ' + mostrarNumero(v) + ' t.');
  });
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
  desenharCacambas();
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
      p ? p.equip : (equipamentosDaArea(t).includes(areaDaAba(t)) ? areaDaAba(t) : equipamentosDaArea(t)[0]), 'f-equip-livre') +
    '<label class="campo"' + (p && !equipamentosDaArea(t).includes(p.equip) ? '' : ' hidden') + '>' +
      'Nome do equipamento' +
      '<input id="f-equip-livre" type="text" placeholder="ex.: Peneira 02, Correia TP 1407" value="' +
      (p && !equipamentosDaArea(t).includes(p.equip) ? p.equip : '') + '"></label>' +
    equipamentosDaArea(t).filter(e => tagsDe(t, e).length).map((e, i) =>
      '<div class="grupo-tag" data-equip="' + e.replace(/"/g, '&quot;') + '" hidden>' +
        '<p class="rotulo-grupo">Qual máquina? <span class="fraco">(opcional)</span></p>' +
        grupoEscolhas('g-tag-' + i, ['—'].concat(tagsDe(t, e)),
          p && p.equip === e && p.tag ? p.tag : '—') +
      '</div>').join('') +
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
    const grupoTag = $$('#formulario .grupo-tag').find(g => g.dataset.equip === equip);
    const tagEscolhida = grupoTag ? grupoTag.querySelector('button.ativo') : null;
    const tag = tagEscolhida && tagEscolhida.dataset.valor !== '—' ? tagEscolhida.dataset.valor : null;
    const inicio = doCampo($('#f-ini').value, t);
    if (!inicio) { erro('Informe a hora de início.'); return; }
    const fim = doCampo($('#f-fim').value, t);
    if (fim && new Date(fim) < new Date(inicio)) { erro('O fim está antes do início.'); return; }

    const dados = { equip, tag, motivo: $('#f-motivo').value.trim(), inicio, fim };
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

  // A lista de máquinas acompanha o sistema escolhido.
  const mostrarTags = () => {
    const equip = escolhido('#g-equip');
    $$('#formulario .grupo-tag').forEach(g => { g.hidden = g.dataset.equip !== equip; });
  };
  $('#g-equip').addEventListener('click', mostrarTags);
  mostrarTags();
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
        ' <span class="fraco pequeno">— como no visor (0422216) ou com vírgula (4222,16)</span>' +
        '<input id="f-horimetro" type="text" inputmode="decimal" enterkeyhint="next" value="' +
        (l && l.horimetro != null ? mostrarNumero(l.horimetro) : '') + '"></label>' +
      '<div class="dupla-campo">' +
        '<label class="campo">Balança (t)<input id="f-balanca" type="text" inputmode="decimal" enterkeyhint="next" value="' +
          (l && l.balanca != null ? mostrarNumero(l.balanca) : '') + '"></label>' +
        '<label class="campo">Ácido (m³/h)<input id="f-acido" type="text" inputmode="decimal" enterkeyhint="done" value="' +
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
      const ler = nome === 'horimetro' ? lerHorimetro : lerNumero;
      const v = parada ? null : ler($(campos[nome][0]).value);
      if (Number.isNaN(v)) {
        erro('O ' + campos[nome][1] + ' não é um número. Use só dígitos e vírgula.');
        return;
      }
      lidos[nome] = v;
    }
    // Horímetro só anda para a frente: menor que a leitura anterior é engano.
    const antes = t.leituras.filter(x => x !== l && !x.parada && x.horimetro != null &&
      new Date(x.hora) < new Date(hora)).sort((a, b) => new Date(a.hora) - new Date(b.hora)).pop();
    if (lidos.horimetro != null && antes && lidos.horimetro < antes.horimetro) {
      erro('O horímetro (' + mostrarNumero(lidos.horimetro) + ' h) está menor que a leitura anterior (' +
        mostrarNumero(antes.horimetro) + ' h). Confira os dígitos.');
      return;
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

  previaHorimetro($('#f-horimetro'));
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
    '<p class="fraco pequeno">Horímetro e balança: o número cheio do totalizador (o horímetro' +
    ' como no visor, 0422216, ou com vírgula). A somatória é a final menos a inicial.' +
    ' Ácido: o totalizador do instrumento, em m³ — final − inicial é o consumido.' +
    ' A vazão (m³/h) vai na leitura hora a hora.</p>';

  abrirCaixa(titulo, corpo, async () => {
    const dados = { hora: doCampo($('#f-hora').value, t) };
    for (const m of medidasDe(t)) {
      const v = (m.chave === 'horimetro' ? lerHorimetro : lerNumero)($('#f-' + m.chave).value);
      if (Number.isNaN(v)) {
        erro('O valor de ' + m.rotulo.toLowerCase() + ' não é um número. Use só dígitos e vírgula.');
        return;
      }
      dados[m.chave] = v;
    }
    if (qual === 'final' && t.inicial && t.inicial.acido != null && dados.acido != null &&
        dados.acido < t.inicial.acido) {
      erro('O ácido final está menor que o inicial (' + mostrarNumero(t.inicial.acido) +
        ' m³). Na inicial e na final vai o totalizador, não a vazão.');
      return;
    }
    if (qual === 'final' && t.inicial && t.inicial.horimetro != null && dados.horimetro != null &&
        dados.horimetro < t.inicial.horimetro) {
      erro('O horímetro final está menor que o inicial (' + mostrarNumero(t.inicial.horimetro) +
        ' h). Confira os dígitos.');
      return;
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
  if ($('#f-horimetro')) previaHorimetro($('#f-horimetro'));
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

  // Uma área por bloco, sem misturar.
  areasComRegistro(t).forEach(e => {
    const d = dadosArea(t, e);
    L.push('═══ ' + e.toUpperCase() + ' ═══');
    L.push('Funcionamento: ' + textoJanela(d.j) + ' (' + duracao(d.emCampo) + ' em campo)');
    if (d.paradas.length) {
      d.paradas.forEach(p => L.push('· ' + paradaRetomada(p) +
        '  (' + duracao(minutos(p.inicio, p.fim || relogio(t))) + ')' +
        (p.tag ? ' · ' + p.tag : '') + (p.motivo ? ' — ' + p.motivo : '')));
    } else {
      L.push('· Nenhuma parada.');
    }
    L.push('Parado: ' + duracao(d.parado) + ' · Rodando: ' + duracao(d.rodando) + ' (' + d.disp + '%)');
    L.push('');
  });
  if (t.paradas.length) {
    L.push('TOTAL PARADO NO TURNO: ' + duracao(c.totalParado));
    L.push('');
  }

  if ((t.cacambas || []).length) {
    L.push('CAÇAMBAS (material bruto): ' + t.cacambas.length + ' × ' + mostrarNumero(pesoCacamba(t)) + ' t ≈ ' +
      comUnidade(toneladasCacambas(t), 't'));
    L.push('· ' + cacambasDe(t).map((c, i) => (i + 1) + ') ' + hhmm(c.hora)).join('  '));
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
      .map(m => m.rotulo + (unidadeHora(m) ? ' ' + unidadeHora(m) : '')).join(' · ') + ')');
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

  if (balancaNoTurno(t)) L.push('BALANÇA NO TURNO (final − inicial): ' + comUnidade(balancaNoTurno(t).total, 't'));
  const horimetroRodado = soma.horimetro != null ? soma.horimetro : c.horimetro;
  if (horimetroRodado != null) L.push('Horímetro rodado: ' + comUnidade(horimetroRodado, 'h'));
  if (balancaAcumulada(t) != null) L.push('Balança acumulada (soma hora a hora): ' + comUnidade(balancaAcumulada(t), 't'));
  if (c.acidoMedio != null) L.push('Ácido médio (hora a hora): ' + comUnidade(c.acidoMedio, 'm³/h'));
  linhasAcido(t, c, soma).forEach(([r, v]) => L.push(r + ': ' + v));
  return L.join('\n');
}

/** Baixa o arquivo; no APK, entrega ao Android. */
function entregarArquivo(blob, nome, aviso) {
  if (nativo) {
    const leitor = new FileReader();
    leitor.onload = () => {
      const ok = nativo.salvar(nome, blob.type, String(leitor.result).split(',')[1] || '');
      avisar(ok ? aviso : 'Não deu para salvar o arquivo.');
    };
    leitor.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  avisar(aviso);
}

function copiarRelatorio(t) {
  const txt = relatorioTexto(t);
  if (nativo) {
    avisar(nativo.copiar(txt) ? 'Relatório copiado.' : 'Não deu para copiar.');
    return;
  }
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
/**
 * Os três PDFs do turno:
 *  'hora'       — com as leituras hora a hora como foram lidas;
 *  'distribuido'— com a balança hora a hora repartida pelos totalizadores;
 *  'resumo'     — sem a hora a hora.
 */
const MODOS_PDF = {
  hora: { nome: 'com hora a hora', arquivo: 'hora-a-hora' },
  distribuido: { nome: 'balança distribuída', arquivo: 'distribuido' },
  resumo: { nome: 'resumo', arquivo: 'resumo' }
};

function blocosDoRelatorio(t, modo = 'hora') {
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

  // Uma área por bloco, sem misturar.
  areasComRegistro(t).forEach(e => {
    const d = dadosArea(t, e);
    B.push({ tipo: 'h1', texto: e });
    B.push({ tipo: 'pequeno', texto: 'Funcionamento: ' + textoJanela(d.j) + ' · ' + duracao(d.emCampo) + ' em campo' });
    B.push({ tipo: 'tabela', colunas: [70, 70, 70, 289],
      cabecalho: ['Parada', 'Retomada', 'Duração', 'Motivo'],
      linhas: d.paradas.length
        ? d.paradas.map(p => [hhmm(p.inicio), p.fim ? hhmm(p.fim) : 'em andamento',
            duracao(minutos(p.inicio, p.fim || relogio(t))), (p.tag ? p.tag + ' · ' : '') + (p.motivo || '—')])
        : [['—', '—', '—', 'Nenhuma parada']] });
    B.push({ tipo: 'tabela', colunas: [250, 249],
      cabecalho: [e, 'Total'],
      linhas: [['Em campo', duracao(d.emCampo)], ['Parado', duracao(d.parado)],
        ['Rodando', duracao(d.rodando) + ' (' + d.disp + '%)']] });
    if (d.faixas.length) {
      B.push({ tipo: 'tabela', colunas: [250, 249],
        cabecalho: ['Rodou', 'Duração'],
        linhas: d.faixas.map(f => [hhmm(f.inicio) + ' a ' + (f.correndo ? 'agora' : hhmm(f.fim)),
          duracao(minutos(f.inicio, f.fim))]) });
    }
  });
  if (t.paradas.length) {
    B.push({ tipo: 'tabela', colunas: [250, 249], cabecalho: ['Turno', 'Total'],
      linhas: [['TOTAL PARADO NO TURNO', duracao(c.totalParado)]] });
  }

  if ((t.cacambas || []).length) {
    B.push({ tipo: 'h1', texto: 'Caçambas (material bruto)' });
    if (modo !== 'resumo') {
      const lista = cacambasDe(t);
      B.push({ tipo: 'tabela', colunas: [60, 120, 319],
        cabecalho: ['Nº', 'Basculou', 'Intervalo'],
        linhas: lista.map((c, i) => [String(i + 1), hhmm(c.hora),
          i ? '+' + duracao(minutos(lista[i - 1].hora, c.hora)) : '—']) });
    }
    B.push({ tipo: 'tabela', colunas: [250, 249], cabecalho: ['Caçambas', 'Total'],
      linhas: [['Basculadas', String(t.cacambas.length)],
        ['Peso médio', comUnidade(pesoCacamba(t), 't')],
        ['Bruto estimado (basculadas × peso)', comUnidade(toneladasCacambas(t), 't')]] });
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
  const dist = modo === 'distribuido' ? distribuicaoBalanca(t) : null;
  if (t.leituras.length && modo !== 'resumo') {
    const ordenadas = t.leituras.slice().sort((a, b) => new Date(a.hora) - new Date(b.hora));
    // No distribuído, a coluna da balança traz o valor distribuído.
    const cols = [];
    medidas.forEach(m => {
      if (dist && m.chave === 'balanca') {
        cols.push({ titulo: 'Balança distribuída (t)', valor: l => mostrarNumero(dist.valores[l.id]) });
      } else {
        cols.push({ titulo: m.rotulo + (unidadeHora(m) ? ' (' + unidadeHora(m) + ')' : ''), valor: l => mostrarNumero(l[m.chave]) });
      }
    });
    const larg = Math.floor(339 / cols.length);
    B.push({ tipo: 'h2', texto: 'Hora a hora' });
    const linhas = ordenadas.map(l => l.parada
      ? [hhmm(l.hora)].concat(cols.map(() => '—')).concat([l.obs || 'Parada.'])
      : [hhmm(l.hora)].concat(cols.map(c => c.valor(l))).concat([l.obs || '']));
    if (dist) {
      linhas.push(['TOTAL'].concat(medidas.map(m => m.chave === 'balanca' ? comUnidade(dist.total, 't') : '')).concat(['']));
    }
    B.push({ tipo: 'tabela', colunas: [70].concat(cols.map(() => larg)).concat([90]),
      cabecalho: ['Hora'].concat(cols.map(c => c.titulo)).concat(['Observação']),
      linhas });
  }


  const linhasFim = [['Duração do turno', duracao(c.duracaoTurno)]];
  const horimetroRodado = soma.horimetro != null ? soma.horimetro : c.horimetro;
  if (horimetroRodado != null) linhasFim.push(['Horímetro rodado', comUnidade(horimetroRodado, 'h')]);
  if (modo === 'hora' && balancaAcumulada(t) != null) {
    linhasFim.push(['Balança acumulada (soma hora a hora)', comUnidade(balancaAcumulada(t), 't')]);
  }
  if (dist) linhasFim.push(['Balança distribuída (soma)', comUnidade(dist.total, 't')]);
  if (c.acidoMedio != null) linhasFim.push(['Ácido médio (hora a hora)', comUnidade(c.acidoMedio, 'm³/h')]);
  linhasAcido(t, c, soma).forEach(l => linhasFim.push(l));
  if (balancaNoTurno(t)) linhasFim.push(['Balança no turno (final - inicial)', comUnidade(balancaNoTurno(t).total, 't')]);
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

function baixarPdf(t, modo = 'hora') {
  const area = areaDe(t);
  const blob = PDF.gerar(blocosDoRelatorio(t, modo),
    (area.codigo ? area.codigo + ' ' : '') + area.nome + ' · ' +
    dataBonita(t.data) + ' · ' + nomeTurno(t) + ' · ' + MODOS_PDF[modo].nome);
  entregarArquivo(blob, 'britagem-' + t.data + '-turno-' + t.nome.replace(/\W+/g, '') +
    '-' + MODOS_PDF[modo].arquivo + '.pdf', 'PDF baixado.');
}

function csvCampo(v) {
  // Número sai com vírgula: com o ';' separando colunas, é assim que o
  // Numbers e o Excel em português leem como número, não como texto.
  const s = typeof v === 'number' ? String(v).replace('.', ',')
    : (v === null || v === undefined ? '' : String(v));
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function baixarCsv(t) {
  const L = [['tipo', 'equipamento', 'tag', 'inicio', 'fim', 'minutos', 'acumulado_equip', 'acumulado_turno',
    'motivo', 'horimetro_h', 'balanca_t', 'acido', 'observacao']];
  t.paradas.slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio)).forEach(p =>
    L.push(['parada', p.equip, p.tag || '', hhmm(p.inicio), p.fim ? hhmm(p.fim) : '',
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
  if (balancaAcumulada(t) != null) {
    L.push(['balanca_acumulada', '', '', '', '', '', '', 'soma das leituras hora a hora',
      '', balancaAcumulada(t), '', '']);
  }

  cacambasDe(t).forEach((c, i) => {
    L.push(['cacamba', String(i + 1), hhmm(c.hora), '', '', '', '', 'basculou (material bruto)',
      '', '', '', comUnidade(pesoCacamba(t), 't')]);
  });
  if ((t.cacambas || []).length) {
    L.push(['cacambas_total', String(t.cacambas.length), '', '', '', '', '', 'bruto estimado: basculadas × peso médio',
      '', '', '', comUnidade(toneladasCacambas(t), 't')]);
  }

  // A produção vai na coluna da balança, que é de onde ela sai.
  areaDe(t).extras.forEach(e => {
    const v = (t.extras || {})[e.chave];
    if (v == null || v === '') return;
    L.push(['dado_do_turno', '', '', '', '', '', '', e.rotulo,
      '', '', '', e.tipo === 'numero' ? comUnidade(v, e.unidade || '') : v]);
  });
  if (balancaNoTurno(t) && !(temLeitura(t.inicial, t) && temLeitura(t.final, t))) {
    L.push(['balanca_no_turno', '', '', '', '', '', '', 'final menos inicial',
      '', balancaNoTurno(t).total, '', 'toneladas']);
  }

  // A coluna da tag só a parada preenche; nas demais linhas ela vai vazia.
  const texto = '﻿' + L.map((linha, i) => (i === 0 || linha[0] === 'parada' ? linha : [linha[0], linha[1], ''].concat(linha.slice(2))).map(csvCampo).join(';')).join('\r\n');
  const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
  entregarArquivo(blob, 'britagem-' + t.data + '-turno-' + t.nome.replace(/\W+/g, '') + '.csv', 'Planilha baixada.');
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
  $('#contar-cacamba').addEventListener('click', contarCacamba);
  $('#desfazer-cacamba').addEventListener('click', desfazerCacamba);
  $('#peso-cacamba').addEventListener('click', () => formPesoCacamba(turnoAtual()));
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
