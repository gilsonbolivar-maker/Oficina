/* ————————————————————————————————————————————————————————————
   Tabela de Férias — pedidos da equipe: períodos, contagem de
   dias, coincidências e o mapa do ano.
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

const DIAS_CLT = 30;   // teto de dias de férias por período aquisitivo
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const $ = id => document.getElementById(id);

const el = {
  estado: $('estado'),
  ano: $('ano'),
  anoTitulo: $('ano-titulo'),
  lista: $('lista'),
  novoColega: $('btn-colega'),
  imprimir: $('btn-imprimir'),
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

/* ————————————————— estado ————————————————— */

function novoId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function pessoaVazia(nome) {
  return { id: novoId(), nome: nome || '', periodos: [{ inicio: '', fim: '' }], obs: '' };
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
    periodos: Array.isArray(p.periodos) && p.periodos.length
      ? p.periodos.map(f => ({
          inicio: typeof f.inicio === 'string' ? f.inicio : '',
          fim: typeof f.fim === 'string' ? f.fim : ''
        }))
      : [{ inicio: '', fim: '' }]
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

  li.querySelector('.periodo-remover').addEventListener('click', () => {
    pessoa.periodos.splice(indice, 1);
    if (!pessoa.periodos.length) pessoa.periodos.push({ inicio: '', fim: '' });
    montarLista();
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

  artigo.querySelector('.periodo-novo').addEventListener('click', () => {
    pessoa.periodos.push({ inicio: '', fim: '' });
    montarLista();
    const campos = el.lista.querySelectorAll(`[data-pessoa="${pessoa.id}"] .inicio`);
    if (campos.length) campos[campos.length - 1].focus();
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

el.imprimir.addEventListener('click', () => window.print());

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
