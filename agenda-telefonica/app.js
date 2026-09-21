/* ————————————————————————————————————————————————————————————
   Agenda Telefônica — consulta e discagem offline.
   Nada sai do aparelho: a base vem junto com o app e os
   favoritos ficam no armazenamento local do navegador.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.0.0';   // precisa casar com a VERSAO do sw.js
const LOTE = 80;          // contatos desenhados por vez, para a rolagem não travar

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const estado = {
  base: null,        // a lista carregada pelo usuário, vinda do IndexedDB
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

/** "2433218000" -> "(24) 3321-8000". */
function formatar(d) {
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return d;
}

/** Linha de apoio: diz o que o toque vai discar de verdade. */
function detalheNumero(num) {
  if (num[0] !== 'r') return rotuloTipo(num[0]);
  if (estado.interno) return 'Ramal · disca só os 4 dígitos';
  return 'Ramal · disca ' + formatar(num[1]);
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
  b.querySelector('.sub').textContent = reg.sigla + ' · ' + reg.unidade;
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
    ? reg.numeros.map(n =>
        '<a class="telefone" href="tel:' + paraDiscar(n) + '">' +
          '<span class="dupla">' +
            '<span class="num">' + n[2] + '</span>' +
            '<span class="tipo">' + detalheNumero(n) + '</span>' +
          '</span>' +
          '<span class="ligar">📞</span>' +
        '</a>').join('')
    : '<p class="fraco pequeno">Sem telefone na lista original.</p>';

  ficha.innerHTML =
    '<div class="alca"></div>' +
    '<h2></h2>' +
    '<p class="meta"></p>' +
    telefones +
    '<div class="acoes">' +
      '<button class="botao" id="fav" type="button">' + (favorito ? '★ Favorito' : '☆ Favoritar') + '</button>' +
      '<button class="botao" id="copiar" type="button">Copiar</button>' +
      '<button class="botao principal" id="fechar" type="button">Fechar</button>' +
    '</div>';

  ficha.querySelector('h2').textContent = reg.nome;
  ficha.querySelector('.meta').innerHTML =
    '<b>' + reg.sigla + '</b> — ' + reg.area + '<br>' +
    reg.unidade + ' · matrícula ' + reg.matricula;

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
    linhas.push('NOTE:Matrícula ' + r.matricula + ' · Ramal ' + escaparVcf(r.bruto));
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
  $('#fundo').addEventListener('click', fecharFicha);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') fecharFicha(); });

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
  Busca.montar(base);

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
  $('#arquivo-troca').addEventListener('change', ev => carregar(ev.target.files[0], true));
  $('#apagar-base').addEventListener('click', async () => {
    if (!confirm('Apagar a lista de contatos deste aparelho? Os favoritos continuam guardados.')) return;
    await Dados.removerBase();
    estado.base = null;
    mostrarVazio();
  });
}

async function iniciar() {
  carregarPreferencias();
  ligarEventos();
  ligarEventosCarga();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  let base = null;
  try { base = await Dados.lerBase(); } catch (e) { /* IndexedDB bloqueado */ }
  if (base) abrirApp(base);
  else mostrarVazio();
}

iniciar();
