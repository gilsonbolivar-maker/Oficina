/* ————————————————————————————————————————————————————————————
   Agenda Telefônica — consulta e discagem offline.
   Nada sai do aparelho: a base vem junto com o app e os
   favoritos ficam no armazenamento local do navegador.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.2.0';   // precisa casar com a VERSAO do sw.js
const LOTE = 80;          // contatos desenhados por vez, para a rolagem não travar

// Guardado antes de tudo: diz se já havia uma versão no comando desta aba.
const TINHA_CONTROLADOR = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
let registroSW = null;

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const estado = {
  base: null,        // a lista carregada pelo usuário, vinda do IndexedDB
  extras: { novos: [], numeros: {}, edicoes: {} },   // o que você acrescentou ou mudou
  formulario: null,  // o que o formulário está editando no momento
  termo: '',
  unidade: null,     // índice em UNIDADES, ou null para todas
  interno: false,    // discar só os 4 dígitos do ramal
  favoritos: new Set(),
  lista: [],
  desenhados: 0
};

/* ————————————————— guardado no aparelho ————————————————— */

function carregarPreferencias() {
  try {
    const favs = JSON.parse(localStorage.getItem('agenda:favoritos') || '[]');
    estado.favoritos = new Set(favs);
    estado.interno = localStorage.getItem('agenda:interno') === '1';
  } catch (e) { /* armazenamento bloqueado: segue sem favoritos */ }
}

function salvarFavoritos() {
  try {
    localStorage.setItem('agenda:favoritos', JSON.stringify(Array.from(estado.favoritos)));
  } catch (e) { avisar('Não deu para guardar o favorito neste navegador.'); }
}

/* ————————————————— peças da tela ————————————————— */

function iniciais(nome) {
  const p = nome.trim().split(/\s+/);
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/** Número que o link tel: vai usar, respeitando o ajuste de ramal interno. */
function paraDiscar(num) {
  return estado.interno && num[0] === 'r' ? num[2] : num[1];
}

function rotuloTipo(tipo) {
  return { r: 'Ramal', c: 'Celular', f: 'Fixo', o: 'Contato' }[tipo] || 'Contato';
}

/** Linha de apoio: diz o que o toque vai discar de verdade. */
function detalheNumero(num) {
  if (num[0] !== 'r') return rotuloTipo(num[0]);
  if (estado.interno) return 'Ramal · disca só os 4 dígitos';
  return 'Ramal · disca ' + Busca.formatar(num[1]);
}

function cartaoContato(reg) {
  const b = document.createElement('button');
  b.className = 'item';
  b.type = 'button';
  b.dataset.i = reg.i;

  // Na lista vale mais o ramal curto; só cai no telefone cheio quando não há ramal.
  const primeiro = reg.numeros.find(n => n[0] === 'r') || reg.numeros[0];
  b.innerHTML =
    '<span class="avatar u' + (reg.iu % 8) + '"></span>' +
    '<span class="dados">' +
      '<span class="nome"></span>' +
      '<span class="sub"></span>' +
    '</span>' +
    (estado.favoritos.has(reg.matricula) ? '<span class="estrela">★</span>' : '') +
    '<span class="ramal"></span>';

  b.querySelector('.avatar').textContent = iniciais(reg.nome);
  b.querySelector('.nome').textContent = reg.nome;
  b.querySelector('.sub').textContent = reg.manual
    ? [reg.area, reg.unidade].filter(Boolean).join(' · ')
    : reg.sigla + ' · ' + reg.unidade;
  const cel = b.querySelector('.ramal');
  cel.textContent = primeiro ? primeiro[2] : '—';
  if (primeiro && primeiro[0] !== 'r') cel.classList.add('curto');
  return b;
}

/* ————————————————— lista de contatos ————————————————— */

function refazerLista() {
  estado.lista = Busca.filtrar(estado.termo, estado.unidade);
  estado.desenhados = 0;
  const alvo = $('#lista-contatos');
  alvo.innerHTML = '';
  alvo.scrollTop = 0;

  $('#contagem').textContent = estado.lista.length === 0
    ? 'Nenhum contato encontrado.'
    : estado.lista.length === 1
      ? '1 contato'
      : estado.lista.length + ' contatos';

  if (estado.lista.length === 0) {
    alvo.innerHTML = '<p class="vazio">Nada por aqui.<br>Tente outro nome, ramal ou sigla da área.</p>';
    return;
  }
  desenharMais();
}

function desenharMais() {
  const alvo = $('#lista-contatos');
  const fim = Math.min(estado.desenhados + LOTE, estado.lista.length);
  const frag = document.createDocumentFragment();
  let letraAtual = estado.desenhados === 0 ? '' : Busca.inicial(estado.lista[estado.desenhados - 1]);

  for (let k = estado.desenhados; k < fim; k++) {
    const reg = estado.lista[k];
    const letra = Busca.inicial(reg);
    if (letra !== letraAtual) {
      const h = document.createElement('div');
      h.className = 'letra';
      h.id = 'letra-' + letra;
      h.textContent = letra;
      frag.appendChild(h);
      letraAtual = letra;
    }
    frag.appendChild(cartaoContato(reg));
  }

  const sentinela = alvo.querySelector('.sentinela');
  if (sentinela) sentinela.remove();
  alvo.appendChild(frag);
  estado.desenhados = fim;

  if (fim < estado.lista.length) {
    const s = document.createElement('div');
    s.className = 'sentinela';
    s.style.height = '1px';
    alvo.appendChild(s);
    observador.observe(s);
  }
}

const observador = new IntersectionObserver(ent => {
  if (ent.some(e => e.isIntersecting)) desenharMais();
}, { root: null, rootMargin: '400px' });

/* ————————————————— favoritos ————————————————— */

function refazerFavoritos() {
  const alvo = $('#lista-favoritos');
  const favs = Busca.registros.filter(r => estado.favoritos.has(r.matricula));
  alvo.innerHTML = '';
  if (favs.length === 0) {
    alvo.innerHTML = '<p class="vazio">Sem favoritos ainda.<br>' +
      'Abra um contato e toque em <b>★ Favoritar</b> para deixá-lo à mão.</p>';
    return;
  }
  favs.forEach(r => alvo.appendChild(cartaoContato(r)));
}

/* ————————————————— áreas ————————————————— */

function refazerAreas(filtro) {
  const alvo = $('#lista-areas');
  const f = Busca.simples(filtro || '').trim();
  const contagem = new Map();
  Busca.registros.forEach(r => contagem.set(r.sigla, (contagem.get(r.sigla) || 0) + 1));

  alvo.innerHTML = '';
  Busca.areas
    .map(a => ({ sigla: a[0], nome: a[1], n: contagem.get(a[0]) || 0 }))
    .filter(a => !f || Busca.simples(a.sigla + ' ' + a.nome).includes(f))
    .sort((a, b) => a.sigla.localeCompare(b.sigla, 'pt-BR'))
    .forEach(a => {
      const b = document.createElement('button');
      b.className = 'item';
      b.type = 'button';
      b.innerHTML =
        '<span class="dados"><span class="nome"></span><span class="sub"></span></span>' +
        '<span class="ramal"></span>';
      b.querySelector('.nome').textContent = a.sigla;
      b.querySelector('.sub').textContent = a.nome;
      b.querySelector('.ramal').textContent = a.n;
      b.addEventListener('click', () => {
        estado.termo = a.sigla;
        estado.unidade = null;
        $('#busca').value = a.sigla;
        $('#limpar-busca').hidden = false;
        pintarFiltros();
        trocarTela('contatos');
        refazerLista();
      });
      alvo.appendChild(b);
    });

  if (!alvo.children.length) alvo.innerHTML = '<p class="vazio">Nenhuma área com esse nome.</p>';
}

/* ————————————————— ficha do contato ————————————————— */

function abrirFicha(i) {
  const reg = Busca.registros[i];
  const ficha = $('#ficha');
  const favorito = estado.favoritos.has(reg.matricula);

  const telefones = reg.numeros.length
    ? reg.numeros.map((n, k) =>
        '<div class="telefone">' +
          '<a class="dupla" href="tel:' + paraDiscar(n) + '">' +
            '<span class="num">' + n[2] + (n[3] ? ' <span class="marca-manual">•</span>' : '') + '</span>' +
            '<span class="tipo">' + detalheNumero(n) + '</span>' +
          '</a>' +
          '<a class="ligar" href="tel:' + paraDiscar(n) + '" aria-label="Ligar">📞</a>' +
          (n[3] ? '<button class="tirar" type="button" data-tirar="' + k + '" aria-label="Tirar este número">✕</button>' : '') +
        '</div>').join('')
    : '<p class="fraco pequeno">Sem telefone ainda.</p>';

  ficha.innerHTML =
    '<h2></h2>' +
    '<p class="meta"></p>' +
    telefones +
    '<div class="acoes">' +
      '<button class="botao" id="mais-numero" type="button">+ Número</button>' +
      '<button class="botao" id="editar" type="button">Editar</button>' +
      (reg.editado ? '<button class="botao" id="restaurar" type="button">Restaurar</button>' : '') +
      '<button class="botao" id="fav" type="button">' + (favorito ? '★ Favorito' : '☆ Favoritar') + '</button>' +
      '<button class="botao" id="copiar" type="button">Copiar</button>' +
      (reg.manual ? '<button class="botao" id="apagar-contato" type="button">Apagar</button>' : '') +
      '<button class="botao principal" id="fechar" type="button">Fechar</button>' +
    '</div>';

  ficha.querySelector('h2').textContent = reg.nome;
  const cabeca = reg.sigla && reg.sigla !== '—'
    ? '<b>' + reg.sigla + '</b>' + (reg.area ? ' — ' + reg.area : '')
    : '<b>' + (reg.area || 'Sem área') + '</b>';
  ficha.querySelector('.meta').innerHTML = reg.manual
    ? cabeca + '<br>' + (reg.unidade ? reg.unidade + ' · ' : '') + 'acrescentado por você'
    : cabeca + '<br>' + reg.unidade + ' · matrícula ' + reg.matricula +
      (reg.editado ? ' · <span class="marca-manual">alterado por você</span>' : '');

  ficha.querySelectorAll('[data-tirar]').forEach(b => {
    b.addEventListener('click', () => tirarNumero(reg, reg.numeros[Number(b.dataset.tirar)]));
  });

  ficha.querySelector('#mais-numero').addEventListener('click', () => {
    fecharFicha();
    abrirFormulario({ tipo: 'numero', reg });
  });

  ficha.querySelector('#editar').addEventListener('click', () => {
    fecharFicha();
    abrirFormulario({ tipo: 'editar', reg });
  });

  const restaurar = ficha.querySelector('#restaurar');
  if (restaurar) restaurar.addEventListener('click', () => restaurarContato(reg));

  const apagar = ficha.querySelector('#apagar-contato');
  if (apagar) apagar.addEventListener('click', () => apagarContato(reg));

  ficha.querySelector('#fav').addEventListener('click', () => {
    if (estado.favoritos.has(reg.matricula)) estado.favoritos.delete(reg.matricula);
    else estado.favoritos.add(reg.matricula);
    salvarFavoritos();
    abrirFicha(i);
    refazerFavoritos();
    refazerLista();
  });
  ficha.querySelector('#copiar').addEventListener('click', () => copiar(reg));
  ficha.querySelector('#fechar').addEventListener('click', fecharFicha);

  ficha.hidden = false;
  $('#fundo').hidden = false;
}

function fecharFicha() {
  $('#ficha').hidden = true;
  $('#fundo').hidden = true;
}

function copiar(reg) {
  const txt = [
    reg.nome,
    reg.sigla + ' — ' + reg.area,
    reg.unidade + ' · matrícula ' + reg.matricula,
    reg.numeros.map(n => rotuloTipo(n[0]) + ': ' + n[2]).join('\n')
  ].filter(Boolean).join('\n');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(
      () => avisar('Copiado.'),
      () => avisar('O navegador não deixou copiar.')
    );
  } else {
    avisar('O navegador não deixou copiar.');
  }
}

/* ————————————————— o que você acrescenta à mão ————————————————— */

/** Grava os acréscimos e refaz o índice sem perder busca nem filtro. */
async function salvarExtras() {
  try {
    await Dados.gravarExtras(estado.extras);
  } catch (e) {
    avisar('Não deu para guardar neste navegador.');
  }
  Busca.montar(estado.base, estado.extras);
  montarFiltros();
  refazerLista();
  refazerFavoritos();
  refazerAreas($('#busca-area').value);
}

/** Lista onde os números daquele contato ficam guardados. */
function listaDeNumeros(reg) {
  if (reg.manual) {
    const c = estado.extras.novos.find(n => n.id === reg.matricula);
    return c ? c.numeros : null;
  }
  return estado.extras.numeros[reg.matricula] || null;
}

async function tirarNumero(reg, num) {
  const lista = listaDeNumeros(reg);
  if (!lista) return;
  const k = lista.findIndex(n => n[1] === num[1]);
  if (k < 0) return;
  lista.splice(k, 1);
  if (!reg.manual && !lista.length) delete estado.extras.numeros[reg.matricula];
  await salvarExtras();
  avisar('Número tirado.');
  const atual = Busca.registros.find(r => r.matricula === reg.matricula);
  if (atual) abrirFicha(atual.i);
  else fecharFicha();
}

async function restaurarContato(reg) {
  if (!confirm('Voltar ' + reg.nome + ' para como veio na lista? As mudanças que você fez nele se perdem.')) return;
  delete estado.extras.edicoes[reg.matricula];
  delete estado.extras.numeros[reg.matricula];
  await salvarExtras();
  avisar('Contato restaurado.');
  const atual = Busca.registros.find(r => r.matricula === reg.matricula);
  if (atual) abrirFicha(atual.i); else fecharFicha();
}

async function apagarContato(reg) {
  if (!confirm('Apagar ' + reg.nome + ' da agenda? Só sai deste aparelho.')) return;
  estado.extras.novos = estado.extras.novos.filter(n => n.id !== reg.matricula);
  estado.favoritos.delete(reg.matricula);
  salvarFavoritos();
  fecharFicha();
  await salvarExtras();
  avisar('Contato apagado.');
}

/* ————————————————— formulário ————————————————— */

function linhaNumero(valor) {
  const div = document.createElement('div');
  div.className = 'linha-numero';
  div.innerHTML =
    '<input type="tel" inputmode="tel" placeholder="Ramal, celular ou fixo" autocomplete="off">' +
    '<button class="tirar" type="button" aria-label="Tirar esta linha">✕</button>';
  div.querySelector('input').value = valor || '';
  div.querySelector('.tirar').addEventListener('click', () => {
    div.remove();
    if (!$('#f-numeros').children.length) $('#f-numeros').appendChild(linhaNumero(''));
  });
  return div;
}

function abrirFormulario(modo) {
  $('#ficha').hidden = true;
  estado.formulario = modo;
  const pessoa = $('#form-pessoa');
  const numeros = $('#f-numeros');
  numeros.innerHTML = '';
  $('#f-erro').hidden = true;

  // Unidades conhecidas, para o contato novo cair no mesmo filtro dos outros.
  const sel = $('#f-unidade');
  sel.innerHTML = '';
  Busca.unidades.forEach(u => {
    const o = document.createElement('option');
    o.value = u; o.textContent = u || 'Sem unidade';
    sel.appendChild(o);
  });

  // Siglas já existentes viram sugestão do campo de área.
  const dl = $('#areas-conhecidas');
  dl.innerHTML = '';
  Busca.areas.forEach(a => {
    const o = document.createElement('option');
    o.value = a[0]; o.label = a[1];
    dl.appendChild(o);
  });

  if (modo.tipo === 'numero') {
    pessoa.hidden = true;
    $('#form-titulo').textContent = 'Novo número · ' + modo.reg.nome;
    numeros.appendChild(linhaNumero(''));
  } else {
    pessoa.hidden = false;
    const editando = modo.tipo === 'editar';
    const reg = editando ? modo.reg : null;
    $('#form-titulo').textContent = editando ? 'Editar contato' : 'Novo contato';
    $('#f-nome').value = reg ? reg.nome : '';
    $('#f-area').value = reg ? (reg.sigla && reg.sigla !== '—' ? reg.sigla : reg.area) : '';
    if (reg && reg.unidade) {
      if (!Array.from(sel.options).some(o => o.value === reg.unidade)) {
        const o = document.createElement('option');
        o.value = reg.unidade; o.textContent = reg.unidade;
        sel.appendChild(o);
      }
      sel.value = reg.unidade;
    }
    ((reg && reg.numeros) || []).forEach(n => numeros.appendChild(linhaNumero(n[2])));
    if (!numeros.children.length) numeros.appendChild(linhaNumero(''));
  }

  $('#formulario').hidden = false;
  $('#fundo').hidden = false;
  if (modo.tipo === 'numero') numeros.querySelector('input').focus();
  else $('#f-nome').focus();
}

function fecharFormulario() {
  $('#formulario').hidden = true;
  $('#fundo').hidden = true;
  estado.formulario = null;
}

function erroFormulario(txt) {
  const el = $('#f-erro');
  el.textContent = txt;
  el.hidden = false;
}

async function salvarFormulario() {
  const modo = estado.formulario;
  if (!modo) return;

  const unidade = modo.tipo === 'numero' ? modo.reg.unidade : $('#f-unidade').value;
  const digitados = Array.from($('#f-numeros').querySelectorAll('input'))
    .map(i => i.value.trim()).filter(Boolean);
  const numeros = digitados.map(t => Busca.interpretar(t, unidade)).filter(Boolean);

  if (digitados.length && !numeros.length) {
    erroFormulario('Não reconheci nenhum número no que foi digitado.');
    return;
  }

  if (modo.tipo === 'numero') {
    if (!numeros.length) { erroFormulario('Digite o número.'); return; }
    const mat = modo.reg.matricula;
    if (modo.reg.manual) {
      const c = estado.extras.novos.find(n => n.id === mat);
      if (c) c.numeros = c.numeros.concat(numeros);
    } else {
      estado.extras.numeros[mat] = (estado.extras.numeros[mat] || []).concat(numeros);
    }
    fecharFormulario();
    await salvarExtras();
    avisar(numeros.length > 1 ? 'Números acrescentados.' : 'Número acrescentado.');
    const atual = Busca.registros.find(r => r.matricula === mat);
    if (atual) abrirFicha(atual.i);
    return;
  }

  const nome = $('#f-nome').value.trim();
  if (!nome) { erroFormulario('O nome é obrigatório.'); return; }

  // Se digitou uma sigla que já existe, o contato herda o nome completo da área.
  const texto = $('#f-area').value.trim();
  const conhecida = Busca.areas.find(a => a[0].toLowerCase() === texto.toLowerCase());
  const sigla = conhecida ? conhecida[0] : '—';
  const area = conhecida ? conhecida[1] : (texto || 'Acrescentado por você');

  // Dentro de um contato inteiro os números são a lista dele, não acréscimos
  // soltos: cai o sinal de "acrescentado" que marcaria cada um com o ponto.
  const limpos = numeros.map(n => n.slice(0, 3));

  if (modo.tipo !== 'editar') {
    estado.extras.novos.push({
      id: 'n' + Date.now().toString(36),
      nome, sigla, area, unidade, numeros: limpos
    });
  } else if (modo.reg.manual) {
    const c = estado.extras.novos.find(n => n.id === modo.reg.matricula);
    if (c) Object.assign(c, { nome, sigla, area, unidade, numeros: limpos });
  } else {
    // Contato da lista importada: guarda só a versão sua, por matrícula.
    estado.extras.edicoes[modo.reg.matricula] = { nome, sigla, area, unidade, numeros: limpos };
    delete estado.extras.numeros[modo.reg.matricula];   // já entraram na lista acima
  }

  fecharFormulario();
  await salvarExtras();
  avisar(modo.tipo === 'editar' ? 'Contato atualizado.' : 'Contato salvo.');

  if (modo.tipo === 'editar') {
    const atual = Busca.registros.find(r => r.matricula === modo.reg.matricula);
    if (atual) abrirFicha(atual.i);
  }
}

/* ————————————————— exportar vCard ————————————————— */

function escaparVcf(t) {
  return String(t).replace(/([\\,;])/g, '\\$1');
}

function gerarVcf(regs) {
  const linhas = [];
  regs.forEach(r => {
    linhas.push('BEGIN:VCARD', 'VERSION:3.0');
    linhas.push('FN:' + escaparVcf(r.nome));
    linhas.push('ORG:INB;' + escaparVcf(r.area));
    linhas.push('TITLE:' + escaparVcf(r.sigla + ' · ' + r.unidade));
    r.numeros.forEach(n => {
      const tipo = n[0] === 'c' ? 'CELL' : 'WORK';
      linhas.push('TEL;TYPE=' + tipo + ':' + n[1]);
    });
    if (!r.manual) linhas.push('NOTE:Matrícula ' + r.matricula + ' · Ramal ' + escaparVcf(r.bruto));
    linhas.push('END:VCARD');
  });
  return linhas.join('\r\n') + '\r\n';
}

function baixarVcf(regs, nome) {
  if (!regs.length) { avisar('Nada para exportar.'); return; }
  const blob = new Blob([gerarVcf(regs)], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  avisar(regs.length + ' contato(s) no arquivo.');
}

/* ————————————————— avisos ————————————————— */

let avisoTimer = null;
function avisar(txt) {
  const el = $('#aviso');
  el.textContent = txt;
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ————————————————— navegação ————————————————— */

function trocarTela(nome) {
  $$('.tela').forEach(t => { t.hidden = t.id !== 'tela-' + nome; });
  $$('.aba').forEach(a => a.classList.toggle('ativa', a.dataset.tela === nome));
  if (nome === 'favoritos') refazerFavoritos();
  if (nome === 'areas') refazerAreas($('#busca-area').value);
}

function pintarFiltros() {
  $$('#filtros-unidade .chip').forEach(c => {
    const v = c.dataset.unidade === '' ? null : Number(c.dataset.unidade);
    c.classList.toggle('ativo', v === estado.unidade);
  });
}

function montarFiltros() {
  const alvo = $('#filtros-unidade');
  const contagem = new Map();
  Busca.registros.forEach(r => contagem.set(r.iu, (contagem.get(r.iu) || 0) + 1));

  alvo.innerHTML = '';
  const chips = [{ rotulo: 'Todas', valor: '' }].concat(
    Busca.unidades.map((u, i) => ({ rotulo: u, valor: String(i), n: contagem.get(i) || 0 }))
         .filter(c => c.n > 0)
         .sort((a, b) => b.n - a.n)
  );

  chips.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.dataset.unidade = c.valor;
    b.textContent = c.n ? c.rotulo + ' ' + c.n : c.rotulo;
    b.addEventListener('click', () => {
      estado.unidade = c.valor === '' ? null : Number(c.valor);
      pintarFiltros();
      refazerLista();
    });
    alvo.appendChild(b);
  });
  pintarFiltros();
}

function montarIndice() {
  const alvo = $('#indice');
  if (alvo.children.length) return;
  const letras = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  letras.forEach(l => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l;
    b.addEventListener('click', () => irParaLetra(l));
    alvo.appendChild(b);
  });
}

function irParaLetra(letra) {
  // Desenha o que faltar até a letra pedida e então rola até o cabeçalho.
  let guarda = 0;
  while (estado.desenhados < estado.lista.length && guarda++ < 40) {
    if (estado.lista.slice(0, estado.desenhados).some(r => Busca.inicial(r) === letra)) break;
    desenharMais();
  }
  const alvo = document.getElementById('letra-' + letra);
  if (alvo) alvo.scrollIntoView({ block: 'start' });
  else avisar('Nenhum nome com ' + letra + ' nesta lista.');
}

/* ————————————————— partida ————————————————— */

function ligarEventos() {
  $('#busca').addEventListener('input', ev => {
    estado.termo = ev.target.value;
    $('#limpar-busca').hidden = !estado.termo;
    refazerLista();
  });

  $('#limpar-busca').addEventListener('click', () => {
    estado.termo = '';
    $('#busca').value = '';
    $('#limpar-busca').hidden = true;
    $('#busca').focus();
    refazerLista();
  });

  $('#busca-area').addEventListener('input', ev => refazerAreas(ev.target.value));

  document.addEventListener('click', ev => {
    const item = ev.target.closest('#lista-contatos .item, #lista-favoritos .item');
    if (item) abrirFicha(Number(item.dataset.i));
  });

  $$('.aba').forEach(a => a.addEventListener('click', () => trocarTela(a.dataset.tela)));
  $('#fundo').addEventListener('click', () => { fecharFicha(); fecharFormulario(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { fecharFicha(); fecharFormulario(); }
  });

  $('#novo-contato').addEventListener('click', () => abrirFormulario({ tipo: 'novo' }));
  $('#f-mais-numero').addEventListener('click',
    () => $('#f-numeros').appendChild(linhaNumero('')));
  $('#f-salvar').addEventListener('click', salvarFormulario);
  $('#f-cancelar').addEventListener('click', fecharFormulario);

  const op = $('#op-interno');
  op.checked = estado.interno;
  op.addEventListener('change', () => {
    estado.interno = op.checked;
    try { localStorage.setItem('agenda:interno', op.checked ? '1' : '0'); } catch (e) {}
    avisar(op.checked ? 'Discando só o ramal.' : 'Discando o número completo.');
  });

  $('#vcf-tudo').addEventListener('click',
    () => baixarVcf(Busca.registros, 'agenda-inb.vcf'));
  $('#vcf-favoritos').addEventListener('click',
    () => baixarVcf(Busca.registros.filter(r => estado.favoritos.has(r.matricula)), 'agenda-favoritos.vcf'));
}

/** Lê o arquivo escolhido, guarda no aparelho e abre o app. */
async function carregar(arquivo, troca) {
  if (!arquivo) return;
  const estadoEl = $(troca ? '#estado-troca' : '#estado-carga');
  estadoEl.textContent = 'Lendo o arquivo…';
  try {
    const base = await Dados.importarArquivo(arquivo);
    estadoEl.textContent = '';
    abrirApp(base);
    if (troca) avisar('Lista atualizada: ' + base.contatos.length + ' contatos.');
  } catch (e) {
    estadoEl.textContent = e.message;
  }
}

/** Com a base em mãos, monta o índice e mostra as telas. */
function abrirApp(base) {
  estado.base = base;
  estado.termo = '';
  estado.unidade = null;
  Busca.montar(base, estado.extras);

  $('#busca').value = '';
  $('#limpar-busca').hidden = true;
  montarFiltros();
  montarIndice();

  const f = base.fonte || {};
  $('#sobre-fonte').textContent =
    (f.titulo || 'Base carregada') + ' — ' + base.contatos.length + ' contatos' +
    (f.data ? ', da lista de ' + f.data : '') +
    (base.nomeArquivo ? ' · arquivo ' + base.nomeArquivo : '') +
    '. Versão do app: ' + VERSAO + '.';

  $('#tela-vazio').hidden = true;
  $('#abas').hidden = false;
  trocarTela('contatos');
  refazerLista();
}

/** Sem base: só a tela de partida fica à mostra. */
function mostrarVazio() {
  $$('.tela').forEach(t => { t.hidden = t.id !== 'tela-vazio'; });
  $('#abas').hidden = true;
}

function ligarEventosCarga() {
  $('#arquivo-inicial').addEventListener('change', ev => carregar(ev.target.files[0], false));
  $('#comecar-vazio').addEventListener('click', async () => {
    abrirApp(await Dados.baseVazia());
    avisar('Agenda vazia. Toque em ＋ para acrescentar.');
  });
  $('#arquivo-troca').addEventListener('change', ev => carregar(ev.target.files[0], true));
  $('#procurar-atualizacao').addEventListener('click', procurarAtualizacao);
  $('#apagar-base').addEventListener('click', async () => {
    if (!confirm('Apagar a lista de contatos deste aparelho? Os favoritos continuam guardados.')) return;
    await Dados.removerBase();
    estado.base = null;
    mostrarVazio();
  });
}

/* ————————————————— atualização do app ————————————————— */

function registrarSW() {
  if (!('serviceWorker' in navigator)) return;

  // Quando a versão nova assume, a aba recarrega uma vez para pegar o
  // visual novo. Na primeira instalação não recarrega: não há o que trocar.
  let recarregando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!TINHA_CONTROLADOR || recarregando) return;
    recarregando = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    // 'updateViaCache: none' obriga o navegador a buscar o sw.js na rede:
    // sem isso ele pode servir o antigo do cache e a atualização nunca chega.
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
  carregarPreferencias();
  ligarEventos();
  ligarEventosCarga();
  registrarSW();
  $('#versao-app').textContent = 'Versão ' + VERSAO + '.';

  let base = null;
  try {
    base = await Dados.lerBase();
    estado.extras = await Dados.lerExtras();
  } catch (e) { /* IndexedDB bloqueado */ }
  if (base) abrirApp(base);
  else mostrarVazio();
}

iniciar();
