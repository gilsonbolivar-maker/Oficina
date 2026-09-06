/* ————————————————————————————————————————————————————————————
   Caderno Pencil — escreva à mão com a Apple Pencil (o Rabisco do
   iPadOS converte a letra em texto), depois copie e cole onde quiser.
   Tudo fica guardado no próprio aparelho.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.2.0';   // precisa casar com a VERSAO do sw.js
const CHAVE = 'caderno-pencil:v1';

const el = id => document.getElementById(id);

const areaTexto = el('texto');
const estadoTexto = el('estado');
const listaNotas = el('lista-notas');
const notasVazio = el('notas-vazio');
const painelNotas = el('painel-notas');
const painelAjustes = el('painel-ajustes');
const painelEnviar = el('painel-enviar');
const paineis = [painelNotas, painelAjustes, painelEnviar];
const fundoPainel = el('fundo-painel');
const avisoEl = el('aviso');

/* ——— estado guardado ——— */
const padrao = () => ({
  notas: [],
  atual: null,
  fonte: 22,
  pauta: 22,      // décimos: 22 = 2,2× o tamanho da letra
  linhas: true,
  noite: false,
  juntar: false
});

let dados = carregar();

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return padrao();
    const lido = JSON.parse(bruto);
    return Object.assign(padrao(), lido, {
      notas: Array.isArray(lido.notas) ? lido.notas : []
    });
  } catch (e) {
    return padrao();
  }
}

let gravacaoPendente = 0;
let avisouGravacao = false;

function gravar(agora) {
  clearTimeout(gravacaoPendente);
  const escrever = () => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(dados));
    } catch (e) {
      // Navegador em modo privado, armazenamento bloqueado ou cheio: avisa uma vez só.
      if (avisouGravacao) return;
      avisouGravacao = true;
      mostrarAviso('Este navegador não está guardando as notas. Copie o texto antes de fechar.');
    }
  };
  if (agora) escrever();
  else gravacaoPendente = setTimeout(escrever, 400);
}

/* ——— notas ——— */
function notaAtual() {
  return dados.notas.find(n => n.id === dados.atual) || null;
}

function novaNota(texto) {
  const nota = {
    id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    texto: texto || '',
    criada: Date.now(),
    alterada: Date.now()
  };
  dados.notas.unshift(nota);
  dados.atual = nota.id;
  return nota;
}

function titulo(nota) {
  const primeira = (nota.texto || '').trim().split('\n')[0].trim();
  return primeira ? primeira.slice(0, 60) : 'Sem título';
}

function quando(ms) {
  const d = new Date(ms);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (mesmoDia) return 'hoje, ' + hora;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ', ' + hora;
}

function contarPalavras(texto) {
  const limpo = texto.trim();
  if (!limpo) return 0;
  return limpo.split(/\s+/).length;
}

function atualizarEstado(msg) {
  if (msg) { estadoTexto.textContent = msg; return; }
  const palavras = contarPalavras(areaTexto.value);
  if (!palavras) estadoTexto.textContent = 'Folha em branco';
  else estadoTexto.textContent = palavras + (palavras === 1 ? ' palavra' : ' palavras')
                               + ' · ' + areaTexto.value.length + ' caracteres';
}

function abrirNota(id) {
  const nota = dados.notas.find(n => n.id === id);
  if (!nota) return;
  dados.atual = id;
  areaTexto.value = nota.texto;
  gravar(true);
  atualizarEstado();
  desenharLista();
  areaTexto.focus();
  areaTexto.setSelectionRange(areaTexto.value.length, areaTexto.value.length);
}

function desenharLista() {
  listaNotas.textContent = '';
  const ordenadas = dados.notas.slice().sort((a, b) => b.alterada - a.alterada);
  notasVazio.hidden = ordenadas.length > 0;

  for (const nota of ordenadas) {
    const li = document.createElement('li');
    li.className = 'nota' + (nota.id === dados.atual ? ' atual' : '');
    li.tabIndex = 0;

    const h3 = document.createElement('h3');
    h3.textContent = titulo(nota);

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = quando(nota.alterada) + ' · ' + contarPalavras(nota.texto) + ' palavras';

    const apagar = document.createElement('button');
    apagar.className = 'apagar';
    apagar.type = 'button';
    apagar.textContent = '✕';
    apagar.setAttribute('aria-label', 'Apagar nota ' + titulo(nota));
    apagar.addEventListener('click', ev => {
      ev.stopPropagation();
      apagarNota(nota.id);
    });

    li.append(h3, meta, apagar);
    li.addEventListener('click', () => { abrirNota(nota.id); fecharPaineis(); });
    li.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { abrirNota(nota.id); fecharPaineis(); }
    });
    listaNotas.append(li);
  }
}

function apagarNota(id) {
  const nota = dados.notas.find(n => n.id === id);
  if (!nota) return;
  if (nota.texto.trim() && !confirm('Apagar “' + titulo(nota) + '”? Não dá para desfazer.')) return;

  dados.notas = dados.notas.filter(n => n.id !== id);
  if (dados.atual === id) {
    if (dados.notas.length) dados.atual = dados.notas.slice()
      .sort((a, b) => b.alterada - a.alterada)[0].id;
    else novaNota('');
    areaTexto.value = (notaAtual() || {}).texto || '';
  }
  gravar(true);
  desenharLista();
  atualizarEstado();
  mostrarAviso('Nota apagada');
}

/* ——— escrita ——— */
areaTexto.addEventListener('input', () => {
  const nota = notaAtual() || novaNota('');
  nota.texto = areaTexto.value;
  nota.alterada = Date.now();
  atualizarEstado();
  gravar();
});

/* ——— copiar e enviar ——— */
function textoParaSaida() {
  const inicio = areaTexto.selectionStart;
  const fim = areaTexto.selectionEnd;
  const selecao = inicio !== fim ? areaTexto.value.slice(inicio, fim) : '';
  let saida = selecao || areaTexto.value;
  if (!selecao && dados.juntar) {
    saida = saida.replace(/[ \t]*\n[ \t]*/g, ' ').replace(/ {2,}/g, ' ');
  }
  return { texto: saida.trim(), parcial: Boolean(selecao) };
}

function copiarPorSelecao(texto) {
  // Reserva para navegadores sem a API de área de transferência.
  const temp = document.createElement('textarea');
  temp.value = texto;
  temp.setAttribute('readonly', '');
  temp.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
  document.body.append(temp);
  temp.select();
  temp.setSelectionRange(0, texto.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  temp.remove();
  return ok;
}

el('btn-copiar').addEventListener('click', () => {
  const { texto, parcial } = textoParaSaida();
  if (!texto) { mostrarAviso('Não há nada escrito ainda.'); return; }
  const recado = parcial ? 'Trecho copiado — é só colar' : 'Texto copiado — é só colar';

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto)
      .then(() => mostrarAviso(recado))
      .catch(() => {
        mostrarAviso(copiarPorSelecao(texto) ? recado : 'Não deu para copiar.');
      });
  } else {
    mostrarAviso(copiarPorSelecao(texto) ? recado : 'Não deu para copiar.');
  }
});

el('btn-compartilhar').addEventListener('click', () => {
  const { texto } = textoParaSaida();
  if (!texto) { mostrarAviso('Não há nada escrito ainda.'); return; }
  abrirPainel(painelEnviar);
});

/* Cada destino abre o app correspondente já com o texto.
   O texto vai junto para a área de transferência: se o app abrir vazio
   (texto longo demais para o endereço), basta colar. */
const DESTINOS = {
  whatsapp: {
    nome: 'WhatsApp',
    endereco: t => 'whatsapp://send?text=' + encodeURIComponent(t)
  },
  email: {
    nome: 'e-mail',
    endereco: (t, assunto) => 'mailto:?subject=' + encodeURIComponent(assunto)
                            + '&body=' + encodeURIComponent(t)
  },
  mensagens: {
    nome: 'Mensagens',
    endereco: t => 'sms:&body=' + encodeURIComponent(t)
  }
};

for (const botao of document.querySelectorAll('.destino')) {
  botao.addEventListener('click', () => {
    const { texto } = textoParaSaida();
    if (!texto) { mostrarAviso('Não há nada escrito ainda.'); return; }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).catch(() => {});
    }

    const qual = botao.dataset.destino;

    if (qual === 'outros') {
      fecharPaineis();
      if (navigator.share) navigator.share({ text: texto }).catch(() => {});
      else mostrarAviso('Este navegador não abre a lista de apps.');
      return;
    }

    const destino = DESTINOS[qual];
    const assunto = (texto.split('\n')[0] || 'Nota do caderno').slice(0, 70);
    fecharPaineis();
    mostrarAviso('Abrindo o ' + destino.nome + '… o texto também foi copiado.');
    location.href = destino.endereco(texto, assunto);
  });
}

/* ——— alça: arrastar a nota para outro app ——— */
const alca = el('alca');

alca.addEventListener('dragstart', ev => {
  const { texto } = textoParaSaida();
  if (!texto) {
    ev.preventDefault();
    mostrarAviso('Não há nada escrito ainda.');
    return;
  }
  ev.dataTransfer.setData('text/plain', texto);
  ev.dataTransfer.effectAllowed = 'copy';
  alca.classList.add('arrastando');
});

alca.addEventListener('dragend', () => alca.classList.remove('arrastando'));

// Um toque só não arrasta nada: explica o gesto.
alca.addEventListener('click', () => {
  const { texto, parcial } = textoParaSaida();
  if (!texto) { mostrarAviso('Não há nada escrito ainda.'); return; }
  mostrarAviso(parcial
    ? 'Segure aqui e arraste o trecho até o outro app.'
    : 'Segure aqui e arraste a nota até o outro app.');
});

el('btn-desfazer').addEventListener('click', () => {
  areaTexto.focus();
  try { document.execCommand('undo'); } catch (e) { /* sem desfazer nativo */ }
});

el('btn-nova').addEventListener('click', () => {
  const atual = notaAtual();
  if (atual && !atual.texto.trim()) { areaTexto.focus(); return; }
  novaNota('');
  areaTexto.value = '';
  gravar(true);
  desenharLista();
  atualizarEstado();
  areaTexto.focus();
  mostrarAviso('Folha nova');
});

el('btn-apagar').addEventListener('click', () => {
  if (dados.atual) apagarNota(dados.atual);
  fecharPaineis();
});

/* ——— painéis ——— */
function abrirPainel(painel) {
  for (const p of paineis) p.hidden = p !== painel;
  fundoPainel.hidden = false;
}

function fecharPaineis() {
  for (const p of paineis) p.hidden = true;
  fundoPainel.hidden = true;
}

el('btn-notas').addEventListener('click', () => { desenharLista(); abrirPainel(painelNotas); });
el('btn-ajustes').addEventListener('click', () => abrirPainel(painelAjustes));
fundoPainel.addEventListener('click', fecharPaineis);
for (const b of document.querySelectorAll('[data-fechar]')) {
  b.addEventListener('click', fecharPaineis);
}
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') fecharPaineis();
});

/* ——— aparência ——— */
function aplicarAparencia() {
  const raiz = document.documentElement;
  raiz.style.setProperty('--fonte', dados.fonte + 'px');
  raiz.style.setProperty('--linha', Math.round(dados.fonte * dados.pauta / 10) + 'px');
  raiz.dataset.pauta = dados.linhas ? 'on' : 'off';
  raiz.dataset.tema = dados.noite ? 'noite' : 'papel';

  const cor = document.querySelector('meta[name="theme-color"]');
  if (cor) cor.setAttribute('content', dados.noite ? '#0b1220' : '#faf6ec');

  el('valor-fonte').textContent = dados.fonte + ' px';
  el('valor-pauta').textContent = (dados.pauta / 10).toFixed(1).replace('.', ',') + '×';
  el('ajuste-fonte').value = dados.fonte;
  el('ajuste-pauta').value = dados.pauta;
  el('ajuste-linhas').checked = dados.linhas;
  el('ajuste-noite').checked = dados.noite;
  el('ajuste-juntar').checked = dados.juntar;
}

el('ajuste-fonte').addEventListener('input', ev => {
  dados.fonte = Number(ev.target.value);
  aplicarAparencia();
  gravar();
});
el('ajuste-pauta').addEventListener('input', ev => {
  dados.pauta = Number(ev.target.value);
  aplicarAparencia();
  gravar();
});
for (const [id, campo] of [['ajuste-linhas', 'linhas'], ['ajuste-noite', 'noite'],
                           ['ajuste-juntar', 'juntar']]) {
  el(id).addEventListener('change', ev => {
    dados[campo] = ev.target.checked;
    aplicarAparencia();
    gravar(true);
  });
}

/* ——— aviso flutuante ——— */
let avisoPendente = 0;
function mostrarAviso(texto) {
  avisoEl.textContent = texto;
  avisoEl.hidden = false;
  clearTimeout(avisoPendente);
  avisoPendente = setTimeout(() => { avisoEl.hidden = true; }, 2200);
}

/* ——— início ——— */
if (!notaAtual()) {
  if (dados.notas.length) {
    dados.atual = dados.notas.slice().sort((a, b) => b.alterada - a.alterada)[0].id;
  } else {
    novaNota('');
  }
}
areaTexto.value = (notaAtual() || {}).texto || '';
aplicarAparencia();
atualizarEstado();
desenharLista();

// Guarda na hora ao sair ou trocar de app.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') gravar(true);
});
window.addEventListener('pagehide', () => gravar(true));

/* ——— versão e atualização ——— */
el('versao').textContent = 'v' + VERSAO;

const estadoVersao = el('estado-versao');

function mostrarEstadoVersao(texto, nova) {
  estadoVersao.textContent = texto;
  estadoVersao.classList.toggle('nova', Boolean(nova));
}

if (!('serviceWorker' in navigator)) {
  mostrarEstadoVersao('Aberto pela internet — para funcionar offline, adicione à Tela de Início.');
} else {
  mostrarEstadoVersao('Esta é a versão instalada no aparelho.');

  // Sem controlador agora é primeira instalação, não atualização: nada a anunciar.
  const jaEstavaInstalado = Boolean(navigator.serviceWorker.controller);

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(registro => {
      // Um service worker novo instalando significa versão nova no ar.
      registro.addEventListener('updatefound', () => {
        const chegando = registro.installing;
        if (!chegando) return;
        chegando.addEventListener('statechange', () => {
          if (chegando.state === 'activated' && jaEstavaInstalado) {
            mostrarEstadoVersao('Nova versão pronta — toque em Atualizar.', true);
            el('aviso-versao').hidden = false;
          }
        });
      });

      // Procura atualização ao abrir e sempre que o app volta para a frente.
      const procurar = () => registro.update().catch(() => {});
      procurar();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') procurar();
      });
    }).catch(() => {
      mostrarEstadoVersao('Não deu para preparar o modo offline neste navegador.');
    });
  });
}

el('btn-atualizar').addEventListener('click', () => {
  gravar(true);
  location.reload();
});
