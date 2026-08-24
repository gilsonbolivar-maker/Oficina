/* ————————————————————————————————————————————————————————————
   Escala de Férias do Grupo A — três períodos por colega, quadro do
   mês com as folgas da escala de turnos, coincidências e mapa do ano.
   ———————————————————————————————————————————————————————————— */
'use strict';

(() => {

const CHAVE_DADOS = 'tabela-de-ferias:dados';
const CHAVE_ANO = 'tabela-de-ferias:ano';

/* Grupo inicial. Os nomes são editáveis na própria tabela — isto é só o
   ponto de partida de quem abre o app pela primeira vez. */
const GRUPO = [
  'Gilson Bolivar',
  'Marivaldo Brito',
  'Amauri Bernardes',
  'Karla Neves',
  'Fernanda Lima',
  'Celia Fernandes',
  'Tiago Fraga',
  'Heleno Brito',
  'Bruno Enzo',
  'Erlan Coutinho',
  'Etelvino Loureço',
  'Hemerson',
  'Alvaro Lima'
];

const DIAS_CLT = 30;      // teto de dias de férias por período aquisitivo
const PERIODOS = 3;       // cada colega escolhe até três períodos
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_INTEIRO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                       'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const SEMANA_INTEIRO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/* Escala de turnos da INB: ciclo de 35 dias, aqui só a coluna do Grupo A,
   tirada do app Escala de Turnos. 'F' é folga; 0, 8 e 16 são as horas em que
   o turno começa. O dia de índice 0 é 02/08/2026, e o ciclo se repete. */
const ESCALA_A = [
  '16', 'F', '0', '0', 'F', 'F', 'F', 'F', '8', '8', '16', '16', 'F', '0', '0', '0', 'F', 'F',
  'F', '8', '8', '8', '16', '16', 'F', '0', '0', 'F', 'F', 'F', 'F', '8', '8', '16', '16'
];
const ESCALA_BASE = new Date(2026, 7, 2);

const $ = id => document.getElementById(id);

const el = {
  estado: $('estado'),
  ano: $('ano'),
  anoTitulo: $('ano-titulo'),
  lista: $('lista'),
  novoColega: $('btn-colega'),
  pdf: $('btn-pdf'),
  csv: $('btn-csv'),
  salvar: $('btn-salvar'),
  abrir: $('btn-abrir'),
  arquivo: $('arquivo'),
  coincidencias: $('coincidencias'),
  listaCoincidencias: $('lista-coincidencias'),
  meses: $('meses'),
  faixas: $('faixas'),
  anoVazio: $('ano-vazio'),
  toast: $('toast'),
  modeloPessoa: $('modelo-pessoa'),
  modeloPeriodo: $('modelo-periodo')
};

/* ————————————————— armazenamento ————————————————— */

function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : padrao;
  } catch (e) {
    return padrao;
  }
}

function gravar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* modo privado */ }
}

let temporizadorGravacao = 0;
function agendarGravacao() {
  clearTimeout(temporizadorGravacao);
  temporizadorGravacao = setTimeout(() => gravar(CHAVE_DADOS, pessoas), 400);
}

/* ————————————————— datas ————————————————— */

const DIA = 86400000;

/* Meio-dia evita que fuso horário empurre a data para o dia anterior. */
function data(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? null : d;
}

function diasEntre(inicioIso, fimIso) {
  const a = data(inicioIso), b = data(fimIso);
  if (!a || !b) return 0;
  return Math.round((b - a) / DIA) + 1;
}

function paraIso(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function dataBr(iso) {
  const d = data(iso);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR');
}

function curta(iso) {
  const d = data(iso);
  if (!d) return '';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

function diaDoAno(d) {
  return Math.round((d - new Date(d.getFullYear(), 0, 1)) / DIA);
}

function diasDoAno(ano) {
  return diaDoAno(new Date(ano, 11, 31)) + 1;
}

function plural(n, um, muitos) {
  return n + ' ' + (Math.abs(n) === 1 ? um : muitos);
}

/* Diferença em dias inteiros, sem depender de hora nem de fuso. */
function distancia(a, b) {
  return Math.floor((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
                     Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DIA);
}

/* ————————————————— escala de turnos ————————————————— */

function turnoDoDia(d) {
  const volta = ESCALA_A.length;
  return ESCALA_A[((distancia(ESCALA_BASE, d) % volta) + volta) % volta];
}

function ehFolga(d) {
  return turnoDoDia(d) === 'F';
}

function comoTurno(d) {
  const turno = turnoDoDia(d);
  return turno === 'F' ? 'Folga do Grupo A' : 'Turno das ' + turno.padStart(2, '0') + 'h';
}

/* ————————————————— estado ————————————————— */

function novoId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function periodosVazios() {
  return Array.from({ length: PERIODOS }, () => ({ inicio: '', fim: '' }));
}

function pessoaVazia(nome) {
  return { id: novoId(), nome: nome || '', periodos: periodosVazios(), obs: '' };
}

/* Todo mundo tem os três períodos disponíveis; tabelas antigas ganham os que faltam. */
function completar(periodos) {
  const lista = periodos.slice();
  while (lista.length < PERIODOS) lista.push({ inicio: '', fim: '' });
  return lista;
}

function grupoInicial() {
  return GRUPO.map(nome => pessoaVazia(nome));
}

function saneado(bruto) {
  if (!Array.isArray(bruto)) return null;
  const limpo = bruto.map(p => ({
    id: typeof p.id === 'string' ? p.id : novoId(),
    nome: typeof p.nome === 'string' ? p.nome.slice(0, 60) : '',
    obs: typeof p.obs === 'string' ? p.obs : '',
    periodos: completar(Array.isArray(p.periodos)
      ? p.periodos.map(f => ({
          inicio: typeof f.inicio === 'string' ? f.inicio : '',
          fim: typeof f.fim === 'string' ? f.fim : ''
        }))
      : [])
  }));
  return limpo.length ? limpo : null;
}

let pessoas = saneado(ler(CHAVE_DADOS, null)) || grupoInicial();
let ano = Number(ler(CHAVE_ANO, 0)) || new Date().getFullYear();

/* ————————————————— montagem da tabela ————————————————— */

function acharPessoa(id) {
  return pessoas.find(p => p.id === id);
}

function montarPeriodo(pessoa, periodo, indice) {
  const li = el.modeloPeriodo.content.firstElementChild.cloneNode(true);
  const inicio = li.querySelector('.inicio');
  const fim = li.querySelector('.fim');

  li.dataset.pessoa = pessoa.id;
  li.dataset.indice = String(indice);
  li.querySelector('.ordem').textContent = (indice + 1) + 'º';
  li.querySelector('.de span').textContent = (indice + 1) + 'º início';
  li.querySelector('.ate span').textContent = 'fim';
  inicio.value = periodo.inicio || '';
  fim.value = periodo.fim || '';

  inicio.addEventListener('input', () => {
    periodo.inicio = inicio.value;
    /* Fim em branco (ou antes do início) acompanha o início: 30 dias é o
       pedido mais comum, mas quem quiser menos é só trocar. */
    if (periodo.inicio && (!periodo.fim || data(periodo.fim) < data(periodo.inicio))) {
      const sugestao = new Date(data(periodo.inicio).getTime() + (DIAS_CLT - 1) * DIA);
      periodo.fim = paraIso(sugestao);
      fim.value = periodo.fim;
    }
    aoMudar();
  });
  fim.addEventListener('input', () => { periodo.fim = fim.value; aoMudar(); });

  /* Os três períodos ficam sempre na tela: limpar esvazia, não remove a linha. */
  li.querySelector('.periodo-limpar').addEventListener('click', () => {
    periodo.inicio = '';
    periodo.fim = '';
    inicio.value = '';
    fim.value = '';
    aoMudar();
  });

  return li;
}

function montarPessoa(pessoa) {
  const artigo = el.modeloPessoa.content.firstElementChild.cloneNode(true);
  const nome = artigo.querySelector('.nome');
  const obs = artigo.querySelector('.obs');
  const periodos = artigo.querySelector('.periodos');

  artigo.dataset.pessoa = pessoa.id;
  nome.value = pessoa.nome;
  obs.value = pessoa.obs;

  pessoa.periodos.forEach((periodo, i) => periodos.append(montarPeriodo(pessoa, periodo, i)));

  nome.addEventListener('input', () => { pessoa.nome = nome.value; aoMudar(); });
  obs.addEventListener('input', () => {
    pessoa.obs = obs.value;
    esticar(obs);
    agendarGravacao();
  });

  artigo.querySelector('.pessoa-remover').addEventListener('click', () => {
    const quem = pessoa.nome.trim() || 'este colega';
    if (!confirm(`Remover ${quem} da tabela?`)) return;
    pessoas = pessoas.filter(p => p !== pessoa);
    if (!pessoas.length) pessoas = [pessoaVazia('')];
    montarLista();
    aoMudar();
  });

  return artigo;
}

function montarLista() {
  el.lista.textContent = '';
  pessoas.forEach(pessoa => el.lista.append(montarPessoa(pessoa)));
  el.lista.querySelectorAll('.obs').forEach(esticar);
  atualizar();
}

/* O campo de observações cresce conforme o texto, sem barra de rolagem. */
function esticar(campo) {
  campo.style.height = 'auto';
  campo.style.height = Math.max(campo.scrollHeight, 38) + 'px';
}

/* ————————————————— cálculos ————————————————— */

/* Todos os períodos com data completa e coerente, já com os dias contados. */
function periodosValidos() {
  const lista = [];
  pessoas.forEach(pessoa => {
    pessoa.periodos.forEach((periodo, indice) => {
      if (!periodo.inicio || !periodo.fim) return;
      const dias = diasEntre(periodo.inicio, periodo.fim);
      if (dias < 1) return;
      lista.push({
        pessoa: pessoa,
        indice: indice,
        inicio: periodo.inicio,
        fim: periodo.fim,
        dias: dias,
        chave: pessoa.id + ':' + indice
      });
    });
  });
  return lista;
}

/* Dois períodos coincidem quando um começa antes de o outro acabar. */
function acharCoincidencias(lista) {
  const pares = [];
  const marcados = new Set();

  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j];
      if (a.pessoa === b.pessoa) continue;
      if (a.inicio > b.fim || b.inicio > a.fim) continue;

      const inicio = a.inicio > b.inicio ? a.inicio : b.inicio;
      const fim = a.fim < b.fim ? a.fim : b.fim;
      pares.push({ a: a, b: b, inicio: inicio, fim: fim, dias: diasEntre(inicio, fim) });
      marcados.add(a.chave);
      marcados.add(b.chave);
    }
  }
  pares.sort((x, y) => x.inicio.localeCompare(y.inicio));
  return { pares: pares, marcados: marcados };
}

function atualizar() {
  const lista = periodosValidos();
  const { pares, marcados } = acharCoincidencias(lista);

  /* dias de cada período e erros de preenchimento */
  el.lista.querySelectorAll('.periodo').forEach(li => {
    const pessoa = acharPessoa(li.dataset.pessoa);
    if (!pessoa) return;
    const periodo = pessoa.periodos[Number(li.dataset.indice)];
    if (!periodo) return;

    const campoDias = li.querySelector('.dias');
    const erro = li.querySelector('.erro');
    const dias = diasEntre(periodo.inicio, periodo.fim);
    const invalido = Boolean(periodo.inicio && periodo.fim && dias < 1);

    campoDias.textContent = periodo.inicio && periodo.fim && !invalido ? plural(dias, 'dia', 'dias') : '—';
    li.querySelector('.de .valor').textContent = dataBr(periodo.inicio);
    li.querySelector('.ate .valor').textContent = dataBr(periodo.fim);
    desenharQuadro(li, periodo, invalido);
    campoDias.classList.toggle('contado', Boolean(dias > 0 && !invalido));
    li.classList.toggle('invalido', invalido);
    li.classList.toggle('coincide', marcados.has(pessoa.id + ':' + Number(li.dataset.indice)));
    erro.hidden = !invalido;
    if (invalido) erro.textContent = 'O fim está antes do início.';
  });

  /* total de cada colega */
  el.lista.querySelectorAll('.pessoa').forEach(artigo => {
    const pessoa = acharPessoa(artigo.dataset.pessoa);
    if (!pessoa) return;
    const total = lista.filter(f => f.pessoa === pessoa).reduce((soma, f) => soma + f.dias, 0);
    const campo = artigo.querySelector('.total');
    campo.innerHTML = '<b>' + total + '</b> ' + (total === 1 ? 'dia' : 'dias');
    campo.classList.toggle('demais', total > DIAS_CLT);
    campo.classList.toggle('zero', total === 0);
    if (total > DIAS_CLT) campo.title = 'Acima dos ' + DIAS_CLT + ' dias de um período aquisitivo.';
    else campo.removeAttribute('title');
    artigo.classList.toggle('marcada', total > 0);
  });

  mostrarCoincidencias(pares);
  desenharAno(lista, marcados);
  mostrarEstado(lista);
}

function aoMudar() {
  atualizar();
  agendarGravacao();
}

function mostrarEstado(lista) {
  const comFerias = new Set(lista.map(f => f.pessoa.id)).size;
  const total = lista.reduce((soma, f) => soma + f.dias, 0);
  const partes = [plural(pessoas.length, 'colega', 'colegas')];
  if (comFerias) {
    partes.push(comFerias + ' com férias marcadas', plural(total, 'dia', 'dias'));
  } else {
    partes.push('nenhum pedido marcado');
  }
  el.estado.textContent = partes.join(' · ');
}

function mostrarCoincidencias(pares) {
  el.listaCoincidencias.textContent = '';
  el.coincidencias.hidden = !pares.length;

  pares.forEach(par => {
    const li = document.createElement('li');
    const nomeA = par.a.pessoa.nome.trim() || 'Sem nome';
    const nomeB = par.b.pessoa.nome.trim() || 'Sem nome';
    li.innerHTML = '<b>' + escapar(nomeA) + '</b> e <b>' + escapar(nomeB) + '</b> ' +
      '<span>— ' + curta(par.inicio) + ' a ' + curta(par.fim) + ', ' + plural(par.dias, 'dia', 'dias') + ' juntos</span>';
    el.listaCoincidencias.append(li);
  });
}

function escapar(texto) {
  return texto.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ————————————————— quadro do mês escolhido ————————————————— */

/* Um quadro por mês que o período atravessa: verde do primeiro ao último dia
   de férias, contorno nas folgas do Grupo A. Só é redesenhado quando as datas
   do período mudam. */
function desenharQuadro(li, periodo, invalido) {
  const quadro = li.querySelector('.quadro');
  const assinatura = (periodo.inicio || '') + '|' + (periodo.fim || '') + '|' + invalido;
  if (quadro.dataset.assinatura === assinatura) return;
  quadro.dataset.assinatura = assinatura;
  quadro.textContent = '';

  const inicio = data(periodo.inicio);
  if (!inicio || invalido) {
    quadro.hidden = true;
    return;
  }
  const fim = data(periodo.fim) || inicio;
  quadro.hidden = false;

  let folgas = 0;
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    if (ehFolga(d)) folgas++;
  }

  const meses = [];
  const passo = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  while (passo <= fim && meses.length < 4) {
    meses.push(new Date(passo));
    passo.setMonth(passo.getMonth() + 1);
  }
  meses.forEach(mes => quadro.append(montarMes(mes, inicio, fim)));

  const nota = document.createElement('p');
  nota.className = 'quadro-nota';
  nota.textContent = folgas
    ? plural(folgas, 'dia', 'dias') + ' do período já seriam folga do Grupo A.'
    : 'Nenhuma folga do Grupo A cai dentro do período.';
  quadro.append(nota);
}

function montarMes(mes, inicio, fim) {
  const bloco = document.createElement('div');
  bloco.className = 'mes';

  const titulo = document.createElement('p');
  titulo.className = 'mes-nome';
  titulo.textContent = MESES_INTEIRO[mes.getMonth()] + ' de ' + mes.getFullYear();
  bloco.append(titulo);

  const grade = document.createElement('div');
  grade.className = 'grade-mes';

  SEMANA.forEach((letra, i) => {
    const cabeca = document.createElement('i');
    cabeca.textContent = letra;
    cabeca.title = SEMANA_INTEIRO[i];
    grade.append(cabeca);
  });

  const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  for (let i = 0; i < primeiro.getDay(); i++) {
    const vazio = document.createElement('span');
    vazio.className = 'dia fora';
    grade.append(vazio);
  }

  const hoje = new Date();
  for (let n = 1; n <= ultimo; n++) {
    const d = new Date(mes.getFullYear(), mes.getMonth(), n);
    const celula = document.createElement('span');
    const ferias = distancia(inicio, d) >= 0 && distancia(d, fim) >= 0;
    const folga = ehFolga(d);

    celula.className = 'dia' + (ferias ? ' ferias' : '') + (folga ? ' folga' : '') +
      (distancia(hoje, d) === 0 ? ' hoje' : '');
    celula.textContent = String(n);
    celula.title = dataBr(paraIso(d)) + ' · ' + comoTurno(d) + (ferias ? ' · férias' : '');
    grade.append(celula);
  }

  bloco.append(grade);
  return bloco;
}

/* ————————————————— mapa do ano ————————————————— */

function montarMeses() {
  el.meses.textContent = '';
  const total = diasDoAno(ano);
  MESES.forEach((mes, i) => {
    const dias = new Date(ano, i + 1, 0).getDate();
    const marca = document.createElement('i');
    marca.textContent = mes;
    marca.style.flex = String(dias / total);
    el.meses.append(marca);
  });
}

function grade() {
  const div = document.createElement('div');
  div.className = 'grade';
  const total = diasDoAno(ano);
  for (let i = 0; i < 12; i++) {
    const parte = document.createElement('i');
    parte.style.flex = String(new Date(ano, i + 1, 0).getDate() / total);
    div.append(parte);
  }
  return div;
}

function desenharAno(lista, marcados) {
  montarMeses();
  el.faixas.textContent = '';

  const total = diasDoAno(ano);
  const doAno = lista.filter(f => data(f.inicio).getFullYear() <= ano && data(f.fim).getFullYear() >= ano);
  const comFerias = pessoas.filter(p => doAno.some(f => f.pessoa === p));

  el.anoVazio.hidden = comFerias.length > 0;
  el.anoTitulo.textContent = ano;
  if (!comFerias.length) return;

  comFerias.forEach(pessoa => {
    const faixa = document.createElement('div');
    faixa.className = 'faixa';

    const quem = document.createElement('span');
    quem.className = 'quem';
    quem.textContent = pessoa.nome.trim() || 'Sem nome';

    const trilho = document.createElement('div');
    trilho.className = 'trilho';
    trilho.append(grade());

    doAno.filter(f => f.pessoa === pessoa).forEach(f => {
      /* recorta o período no ano mostrado */
      const inicio = data(f.inicio) < new Date(ano, 0, 1) ? new Date(ano, 0, 1) : data(f.inicio);
      const fim = data(f.fim) > new Date(ano, 11, 31) ? new Date(ano, 11, 31) : data(f.fim);
      const de = diaDoAno(inicio);
      const dias = diaDoAno(fim) - de + 1;

      const barra = document.createElement('span');
      barra.className = 'barra' + (marcados.has(f.chave) ? ' coincide' : '');
      barra.style.left = (de / total * 100) + '%';
      barra.style.width = (dias / total * 100) + '%';
      barra.textContent = dias >= 12 ? dias + 'd' : '';
      barra.title = dataBr(f.inicio) + ' a ' + dataBr(f.fim) + ' · ' + plural(f.dias, 'dia', 'dias');
      trilho.append(barra);
    });

    if (new Date().getFullYear() === ano) {
      const hoje = document.createElement('span');
      hoje.className = 'hoje';
      hoje.style.left = (diaDoAno(new Date()) / total * 100) + '%';
      hoje.title = 'Hoje';
      trilho.append(hoje);
    }

    faixa.append(quem, trilho);
    el.faixas.append(faixa);
  });
}

/* ————————————————— exportar e importar ————————————————— */

function baixar(nome, texto, tipo) {
  const blob = new Blob([texto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Ponto e vírgula e BOM: é assim que o Excel em português abre certo. */
function comoCsv() {
  const linhas = [['Colega', 'Período', 'Início', 'Fim', 'Dias', 'Observações']];
  pessoas.forEach(pessoa => {
    const marcados = pessoa.periodos.filter(f => f.inicio && f.fim && diasEntre(f.inicio, f.fim) > 0);
    if (!marcados.length) {
      linhas.push([pessoa.nome, '', '', '', '', pessoa.obs]);
      return;
    }
    marcados.forEach((f, i) => {
      linhas.push([
        pessoa.nome,
        String(i + 1),
        dataBr(f.inicio),
        dataBr(f.fim),
        String(diasEntre(f.inicio, f.fim)),
        i === 0 ? pessoa.obs : ''
      ]);
    });
  });

  const campo = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  return '﻿' + linhas.map(l => l.map(campo).join(';')).join('\r\n');
}

el.csv.addEventListener('click', () => {
  baixar('ferias-' + ano + '.csv', comoCsv(), 'text/csv;charset=utf-8');
  avisar('Planilha baixada.');
});

el.salvar.addEventListener('click', () => {
  const dados = { app: 'tabela-de-ferias', versao: 1, ano: ano, pessoas: pessoas };
  baixar('tabela-de-ferias-' + ano + '.json', JSON.stringify(dados, null, 2), 'application/json');
  avisar('Arquivo salvo. Envie para quem precisa da tabela.');
});

el.abrir.addEventListener('click', () => el.arquivo.click());

el.arquivo.addEventListener('change', async () => {
  const arquivo = el.arquivo.files && el.arquivo.files[0];
  el.arquivo.value = '';
  if (!arquivo) return;

  try {
    const dados = JSON.parse(await arquivo.text());
    const limpo = saneado(dados && dados.pessoas);
    if (!limpo) throw new Error('formato');
    if (!confirm('Substituir a tabela de agora pela do arquivo?')) return;

    pessoas = limpo;
    if (dados.ano) trocarAno(Number(dados.ano));
    montarLista();
    gravar(CHAVE_DADOS, pessoas);
    avisar('Tabela do arquivo carregada.');
  } catch (e) {
    avisar('Não deu para ler esse arquivo.');
  }
});

/* Não há como um site salvar PDF sozinho: o caminho é a janela de impressão,
   onde “Salvar como PDF” é um dos destinos. */
el.pdf.addEventListener('click', () => {
  avisar('Na janela que abrir, escolha “Salvar como PDF” no destino.');
  setTimeout(() => window.print(), 700);
});

/* ————————————————— comandos gerais ————————————————— */

el.novoColega.addEventListener('click', () => {
  pessoas.push(pessoaVazia(''));
  montarLista();
  agendarGravacao();
  const nomes = el.lista.querySelectorAll('.nome');
  nomes[nomes.length - 1].focus();
});

function montarAnos() {
  const atual = new Date().getFullYear();
  const anos = new Set([atual - 1, atual, atual + 1, atual + 2, ano]);
  el.ano.textContent = '';
  [...anos].sort().forEach(a => {
    const opcao = document.createElement('option');
    opcao.value = String(a);
    opcao.textContent = String(a);
    opcao.selected = a === ano;
    el.ano.append(opcao);
  });
}

function trocarAno(novo) {
  ano = novo;
  gravar(CHAVE_ANO, ano);
  montarAnos();
}

el.ano.addEventListener('change', () => {
  trocarAno(Number(el.ano.value));
  atualizar();
});

let temporizadorAviso = 0;
function avisar(texto) {
  el.toast.textContent = texto;
  el.toast.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { el.toast.hidden = true; }, 2600);
}

/* Fechar a página sem perder o que acabou de ser digitado. */
window.addEventListener('pagehide', () => {
  clearTimeout(temporizadorGravacao);
  gravar(CHAVE_DADOS, pessoas);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* http:// local */ });
  });
}

/* ————————————————— arranque ————————————————— */

montarAnos();
montarLista();

})();
