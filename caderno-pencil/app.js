/* ————————————————————————————————————————————————————————————
   Caderno Pencil — escreva à mão com a Apple Pencil (o Rabisco do
   iPadOS converte a letra em texto), depois copie e cole onde quiser.
   Tudo fica guardado no próprio aparelho.
   ———————————————————————————————————————————————————————————— */
'use strict';

const VERSAO = '1.5.0';   // precisa casar com a VERSAO do sw.js

// Versão sempre à vista: cada [data-versao] da página mostra a deste app.
for (const lugar of document.querySelectorAll('[data-versao]')) lugar.textContent = 'v' + VERSAO;
const CHAVE = 'caderno-pencil:v1';
const CHAVE_TEMA = 'caderno-pencil:tema';

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
  juntar: false
});

let dados = carregar();

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return padrao();
    const lido = JSON.parse(bruto);
    // O antigo "Modo noite" virou o tema Escuro (chave própria, lida no <head>).
    try { if (localStorage.getItem(CHAVE_TEMA)) delete lido.noite; } catch (e) {}
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
    tracos: [],
    criada: Date.now(),
    alterada: Date.now()
  };
  dados.notas.unshift(nota);
  dados.atual = nota.id;
  return nota;
}

function titulo(nota) {
  const primeira = (nota.texto || '').trim().split('\n')[0].trim();
  if (primeira) return primeira.slice(0, 60);
  return (nota.tracos && nota.tracos.length) ? 'Desenho' : 'Sem título';
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

  if (naAbaDesenho()) {
    const n = Desenho.quantos();
    estadoTexto.textContent = n
      ? n + (n === 1 ? ' traço' : ' traços')
      : 'Folha em branco';
    return;
  }

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
  Desenho.carregar(nota.tracos);
  gravar(true);
  atualizarEstado();
  desenharLista();
  if (naAbaDesenho()) return;
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
    const quantosTracos = (nota.tracos || []).length;
    meta.textContent = quando(nota.alterada)
      + ' · ' + contarPalavras(nota.texto) + ' palavras'
      + (quantosTracos ? ' · ' + quantosTracos + ' traços' : '');

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
Desenho.carregar((notaAtual() || {}).tracos);

let abaInicial = 'escrever';
try { if (localStorage.getItem(CHAVE_ABA) === 'desenhar') abaInicial = 'desenhar'; } catch (e) {}
mostrarAba(abaInicial);
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

/* ——— abas: Escrever e Desenhar ———
   A aba escolhida fica no <html data-aba>, que o CSS usa para mostrar a
   folha certa e trocar os botões do rodapé. */
const CHAVE_ABA = 'caderno-pencil:aba';
const naAbaDesenho = () => document.documentElement.dataset.aba === 'desenhar';

function mostrarAba(qual) {
  const desenhar = qual === 'desenhar';
  document.documentElement.dataset.aba = desenhar ? 'desenhar' : 'escrever';

  el('folha-texto').hidden = desenhar;
  el('folha-desenho').hidden = !desenhar;
  el('ferramentas').hidden = !desenhar;
  el('alca').hidden = desenhar;      // arrastar é coisa de texto

  for (const b of document.querySelectorAll('[data-aba-opcao]')) {
    b.setAttribute('aria-selected', String(b.dataset.abaOpcao === (desenhar ? 'desenhar' : 'escrever')));
  }

  if (desenhar) {
    // O canvas escondido não tem tamanho: acerta agora que está à vista.
    Desenho.acertarTamanho();
    el('dica-desenho').hidden = !Desenho.vazio();
  } else {
    areaTexto.focus();
  }

  try { localStorage.setItem(CHAVE_ABA, document.documentElement.dataset.aba); } catch (e) {}
  atualizarEstado();
}

for (const b of document.querySelectorAll('[data-aba-opcao]')) {
  b.addEventListener('click', () => mostrarAba(b.dataset.abaOpcao));
}

/* ——— desenho ——— */
Desenho.montar(el('tela-desenho'), () => {
  const nota = notaAtual() || novaNota('');
  nota.tracos = Desenho.pegar();
  nota.alterada = Date.now();
  el('dica-desenho').hidden = !Desenho.vazio();
  atualizarEstado();
  gravar();
});

for (const b of document.querySelectorAll('[data-ferramenta]')) {
  b.addEventListener('click', () => {
    Desenho.usar(b.dataset.ferramenta);
    for (const outro of document.querySelectorAll('[data-ferramenta]')) {
      outro.setAttribute('aria-pressed', String(outro === b));
    }
  });
}

function copiarDesenho() {
  if (Desenho.vazio()) { mostrarAviso('Não há nada desenhado ainda.'); return; }
  if (!navigator.clipboard || !window.ClipboardItem) {
    mostrarAviso('Este navegador não copia imagem. Use Enviar.');
    return;
  }
  // O Safari exige o ClipboardItem criado já no toque; a imagem vem depois.
  navigator.clipboard.write([new ClipboardItem({ 'image/png': Desenho.paraBlob() })])
    .then(() => mostrarAviso('Desenho copiado — é só colar'))
    .catch(() => mostrarAviso('Não deu para copiar o desenho. Use Enviar.'));
}

function enviarDesenho() {
  if (Desenho.vazio()) { mostrarAviso('Não há nada desenhado ainda.'); return; }
  Desenho.paraBlob().then(blob => {
    if (!blob) return;
    const arquivo = new File([blob], 'desenho.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      navigator.share({ files: [arquivo] }).catch(() => {});
    } else {
      mostrarAviso('Este navegador não envia imagem. Use Copiar.');
    }
  });
}

el('btn-copiar').addEventListener('click', () => {
  if (naAbaDesenho()) { copiarDesenho(); return; }
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
  if (naAbaDesenho()) { enviarDesenho(); return; }
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
  if (naAbaDesenho()) {
    if (!Desenho.desfazer()) mostrarAviso('Não há traço para desfazer.');
    return;
  }
  areaTexto.focus();
  try { document.execCommand('undo'); } catch (e) { /* sem desfazer nativo */ }
});

el('btn-nova').addEventListener('click', () => {
  const atual = notaAtual();
  const jaVazia = atual && !atual.texto.trim() && !(atual.tracos || []).length;
  if (jaVazia) { if (!naAbaDesenho()) areaTexto.focus(); return; }
  novaNota('');
  areaTexto.value = '';
  Desenho.carregar([]);
  gravar(true);
  desenharLista();
  atualizarEstado();
  if (naAbaDesenho()) el('dica-desenho').hidden = false;
  else areaTexto.focus();
  mostrarAviso('Folha nova');
});

/* Limpa a folha sem mexer nas outras notas: apaga só o texto desta.
   Pede confirmação porque o ↶ não desfaz uma troca feita por código. */
el('btn-limpar').addEventListener('click', () => {
  if (naAbaDesenho()) {
    if (Desenho.vazio()) { mostrarAviso('A folha já está vazia.'); return; }
    if (!confirm('Limpar o desenho? Os traços serão apagados.')) return;
    Desenho.limpar();
    mostrarAviso('Desenho limpo');
    return;
  }
  if (!areaTexto.value.trim()) { mostrarAviso('A folha já está vazia.'); return; }
  if (!confirm('Limpar a folha? O texto escrito será apagado.')) return;

  areaTexto.value = '';
  const nota = notaAtual() || novaNota('');
  nota.texto = '';
  nota.alterada = Date.now();
  gravar(true);
  desenharLista();
  atualizarEstado();
  areaTexto.focus();
  mostrarAviso('Folha limpa');
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

  el('valor-fonte').textContent = dados.fonte + ' px';
  el('valor-pauta').textContent = (dados.pauta / 10).toFixed(1).replace('.', ',') + '×';
  el('ajuste-fonte').value = dados.fonte;
  el('ajuste-pauta').value = dados.pauta;
  el('ajuste-linhas').checked = dados.linhas;
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
for (const [id, campo] of [['ajuste-linhas', 'linhas'], ['ajuste-juntar', 'juntar']]) {
  el(id).addEventListener('change', ev => {
    dados[campo] = ev.target.checked;
    aplicarAparencia();
    gravar(true);
  });
}

/* ——— tema: Escuro / Claro ——— */
// O <head> já pôs o tema salvo antes de pintar; aqui só a troca na hora.
const CORES_TEMA = { escuro: '#0b1220', claro: '#faf6ec' };
const botoesTema = document.querySelectorAll('[data-tema-opcao]');

function aplicarTema(tema) {
  if (!(tema in CORES_TEMA)) tema = 'claro';
  document.documentElement.dataset.tema = tema;
  const cor = document.querySelector('meta[name="theme-color"]');
  if (cor) cor.setAttribute('content', CORES_TEMA[tema]);
  for (const b of botoesTema) b.setAttribute('aria-pressed', String(b.dataset.temaOpcao === tema));

  // O botão do topo mostra para onde ele leva, não onde você está.
  const vaiPara = tema === 'escuro' ? 'claro' : 'escuro';
  el('icone-tema').textContent = vaiPara === 'escuro' ? '☾' : '☀';
  el('btn-tema').setAttribute('aria-label',
    vaiPara === 'escuro' ? 'Mudar para o tema Escuro' : 'Mudar para o tema Claro');

  Desenho.repintar();   // a tinta acompanha a cor do texto
}

function guardarTema(tema) {
  aplicarTema(tema);
  try { localStorage.setItem(CHAVE_TEMA, tema); } catch (e) {}
}

el('btn-tema').addEventListener('click', () => {
  guardarTema(document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro');
});

for (const b of botoesTema) {
  b.addEventListener('click', () => guardarTema(b.dataset.temaOpcao));
}
aplicarTema(document.documentElement.dataset.tema);

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
Desenho.carregar((notaAtual() || {}).tracos);

let abaInicial = 'escrever';
try { if (localStorage.getItem(CHAVE_ABA) === 'desenhar') abaInicial = 'desenhar'; } catch (e) {}
mostrarAba(abaInicial);
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
