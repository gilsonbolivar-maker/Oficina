/* ————————————————————————————————————————————————————————————
   Alô — sala de conversa aberta.

   Roda direto no navegador, sem servidor próprio: o GitHub Pages
   entrega estes arquivos e o Supabase cuida de conta, banco e tempo
   real. Nenhum segredo mora aqui — o que protege as conversas são as
   regras de RLS descritas em supabase.sql, aplicadas pelo Postgres.

   Três coisas que este arquivo nunca faz, de propósito:
     1. dizer quem é o autor de uma mensagem (quem diz é o banco);
     2. contar quantas mensagens cabem por minuto (idem);
     3. montar HTML com texto de outra pessoa (só textContent).
   ———————————————————————————————————————————————————————————— */
'use strict';

/* ——— Ajustes ——————————————————————————————————————————————— */

const HISTORICO = 80;        // mensagens carregadas ao abrir uma sala
const LIMITE_CORPO = 500;    // igual à constraint do banco
const CHAVE_CONFIG = 'alo:config';
const CHAVE_LIDO = 'alo:lido';

const FONTES_LIB = [
  'https://esm.sh/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
];

/* ——— Atalhos ——————————————————————————————————————————————— */

const $ = id => document.getElementById(id);
const el = (tag, classe) => {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  return n;
};

/** Guarda em localStorage sem explodir no modo privativo do Safari. */
function guardar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem espaço: segue sem lembrar */ }
}

function lembrar(chave, padrao) {
  try {
    const cru = localStorage.getItem(chave);
    return cru ? JSON.parse(cru) : padrao;
  } catch { return padrao; }
}

const horaDe = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaDe = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' });

function rotuloDoDia(data) {
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
  if (mesmoDia(data, hoje)) return 'Hoje';
  if (mesmoDia(data, ontem)) return 'Ontem';
  return diaDe.format(data);
}

/** Iniciais para o avatar: "Ana Maria" → "AM". */
function iniciais(nome) {
  const partes = String(nome).trim().split(/\s+/).slice(0, 2);
  return partes.map(p => p[0] || '').join('').toUpperCase() || '?';
}

/** Cor estável por apelido — a mesma pessoa tem sempre a mesma cor. */
function corDe(nome) {
  let soma = 0;
  for (let i = 0; i < nome.length; i += 1) soma = (soma * 31 + nome.charCodeAt(i)) >>> 0;
  return `hsl(${soma % 360} 52% 30%)`;
}

/* ——— Estado ———————————————————————————————————————————————— */

const estado = {
  sb: null,          // cliente Supabase
  eu: null,          // { id, apelido }
  salas: [],
  salaAtual: null,
  mensagens: new Map(),   // sala_id -> array de mensagens
  carregadas: new Set(),  // salas cujo histórico já veio do banco
  vistos: new Set(),      // ids já na tela (evita duplicar com o tempo real)
  lido: lembrar(CHAVE_LIDO, {}),
  presentes: [],
  canalMensagens: null,
  canalPresenca: null
};

/* ——— Configuração ————————————————————————————————————————— */

function lerConfig() {
  const doArquivo = globalThis.ALO_CONFIG || {};
  if (doArquivo.url && doArquivo.anonKey) return doArquivo;
  const doNavegador = lembrar(CHAVE_CONFIG, null);
  if (doNavegador?.url && doNavegador?.anonKey) return doNavegador;
  return null;
}

function mostrarTela(qual) {
  for (const t of ['tela-config', 'tela-entrada', 'tela-app']) $(t).hidden = t !== qual;
}

function telaConfig() {
  mostrarTela('tela-config');
  const erro = $('erro-config');
  $('botao-config').addEventListener('click', () => {
    const url = $('campo-url').value.trim().replace(/\/+$/, '');
    const chave = $('campo-chave').value.trim();
    if (!/^https:\/\/[^\s/]+$/.test(url)) {
      erro.textContent = 'A URL deve ser parecida com https://abcdefgh.supabase.co';
      erro.hidden = false;
      return;
    }
    if (chave.length < 20) {
      erro.textContent = 'A chave anon parece incompleta.';
      erro.hidden = false;
      return;
    }
    guardar(CHAVE_CONFIG, { url, anonKey: chave });
    location.reload();
  });
}

/* ——— Ligação com o Supabase ———————————————————————————————— */

async function carregarBiblioteca() {
  let ultimoErro;
  for (const fonte of FONTES_LIB) {
    try {
      const modulo = await import(fonte);
      if (modulo?.createClient) return modulo.createClient;
    } catch (e) { ultimoErro = e; }
  }
  throw new Error('Não consegui carregar a biblioteca do Supabase. ' +
    'Verifique a conexão. ' + (ultimoErro?.message || ''));
}

async function conectar(config) {
  const createClient = await carregarBiblioteca();
  estado.sb = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 8 } }
  });

  // Conta anônima: sem senha, mas com identidade verificada por token.
  // É ela que permite ao banco saber quem está falando.
  const { data: sessao } = await estado.sb.auth.getSession();
  if (!sessao?.session) {
    const { error } = await estado.sb.auth.signInAnonymously();
    if (error) {
      throw new Error(
        'Não consegui criar a sessão. Confira se "Anonymous sign-ins" está ' +
        'ligado em Authentication → Sign In / Providers. (' + error.message + ')'
      );
    }
  }

  const { data: usuario } = await estado.sb.auth.getUser();
  if (!usuario?.user) throw new Error('Sessão inválida.');
  return usuario.user.id;
}

/* ——— Entrada (apelido) ————————————————————————————————————— */

async function buscarPerfil(id) {
  const { data, error } = await estado.sb
    .from('perfis').select('id, apelido').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

function telaEntrada(idUsuario) {
  mostrarTela('tela-entrada');
  const campo = $('campo-apelido');
  const botao = $('botao-entrar');
  const erro = $('erro-entrada');
  campo.focus();

  $('forma-entrada').addEventListener('submit', async ev => {
    ev.preventDefault();
    const apelido = campo.value.trim().replace(/\s+/g, ' ');
    erro.hidden = true;
    if (apelido.length < 2 || apelido.length > 24) {
      erro.textContent = 'O apelido precisa ter de 2 a 24 letras.';
      erro.hidden = false;
      return;
    }
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    const { data, error } = await estado.sb
      .from('perfis').insert({ id: idUsuario, apelido }).select().single();
    botao.disabled = false;
    botao.textContent = 'Entrar';

    if (error) {
      erro.textContent = error.code === '23505'
        ? 'Esse apelido já é de outra pessoa. Tente outro.'
        : (error.message || 'Não consegui entrar.');
      erro.hidden = false;
      return;
    }
    estado.eu = data;
    await iniciarApp();
  });
}

/* ——— Salas ————————————————————————————————————————————————— */

async function carregarSalas() {
  const { data, error } = await estado.sb
    .from('salas').select('id, titulo, subtitulo, ordem').order('ordem');
  if (error) throw error;
  estado.salas = data || [];
}

const MARCA_SALA = { geral: '#', recados: '✎', cafe: '☕' };

function desenharSalas() {
  const alvo = $('lista-salas');
  alvo.replaceChildren();

  for (const sala of estado.salas) {
    const botao = el('button', 'sala');
    botao.type = 'button';
    botao.setAttribute('aria-current', String(sala.id === estado.salaAtual));

    const marca = el('span', 'sala-marca');
    marca.textContent = MARCA_SALA[sala.id] || '#';

    const nome = el('span', 'sala-nome');
    nome.textContent = sala.titulo;

    botao.append(marca, nome);

    const naoLidas = contarNaoLidas(sala.id);
    if (naoLidas > 0 && sala.id !== estado.salaAtual) {
      const selo = el('span', 'nao-lidas');
      selo.textContent = naoLidas > 99 ? '99+' : String(naoLidas);
      botao.append(selo);
    }

    const ultimas = estado.mensagens.get(sala.id);
    const ultima = ultimas?.[ultimas.length - 1];
    const resumo = el('span', 'sala-ultima');
    resumo.textContent = ultima
      ? `${ultima.autor_apelido}: ${ultima.corpo}`
      : sala.subtitulo;
    botao.append(resumo);

    botao.addEventListener('click', () => abrirSala(sala.id));
    alvo.append(botao);
  }
}

function contarNaoLidas(salaId) {
  const lidas = estado.lido[salaId] || 0;
  const lista = estado.mensagens.get(salaId) || [];
  return lista.filter(m => m.id > lidas && m.autor_id !== estado.eu.id).length;
}

function marcarLida(salaId) {
  const lista = estado.mensagens.get(salaId) || [];
  const ultima = lista[lista.length - 1];
  if (!ultima) return;
  estado.lido[salaId] = ultima.id;
  guardar(CHAVE_LIDO, estado.lido);
}

/* ——— Mensagens ————————————————————————————————————————————— */

async function carregarMensagens(salaId) {
  const { data, error } = await estado.sb
    .from('mensagens')
    .select('id, sala_id, autor_id, autor_apelido, corpo, criado_em')
    .eq('sala_id', salaId)
    .order('id', { ascending: false })
    .limit(HISTORICO);
  if (error) throw error;
  const doBanco = (data || []).reverse();

  // Pode ter chegado algo pelo tempo real enquanto a busca corria.
  const soltas = (estado.mensagens.get(salaId) || [])
    .filter(m => !m.provisoria && !doBanco.some(b => b.id === m.id));

  const lista = [...doBanco, ...soltas].sort((a, b) => a.id - b.id);
  for (const m of lista) estado.vistos.add(m.id);
  estado.mensagens.set(salaId, lista);
  estado.carregadas.add(salaId);
}

/** Estamos com a rolagem no fim? Se sim, seguimos colados nela. */
function noFim(caixa) {
  return caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 80;
}

function desenharMensagens(manterRolagem = false) {
  const caixa = $('mensagens');
  const colado = manterRolagem ? noFim(caixa) : true;
  const lista = estado.mensagens.get(estado.salaAtual) || [];

  caixa.replaceChildren();

  if (lista.length === 0) {
    const vazio = el('p', 'vazio');
    vazio.textContent = 'Nada por aqui ainda. Dá o primeiro alô.';
    caixa.append(vazio);
    return;
  }

  let diaAnterior = '';
  let autorAnterior = '';

  for (const msg of lista) {
    const quando = new Date(msg.criado_em);
    const dia = rotuloDoDia(quando);

    if (dia !== diaAnterior) {
      const marco = el('div', 'dia');
      marco.textContent = dia;
      caixa.append(marco);
      diaAnterior = dia;
      autorAnterior = '';
    }

    const minha = msg.autor_id === estado.eu.id;
    const agrupada = msg.autor_apelido === autorAnterior;

    const balao = el('div', 'balao');
    if (minha) balao.classList.add('minha');
    if (agrupada) balao.classList.add('agrupada');
    if (msg.provisoria) balao.classList.add('enviando');

    if (!minha && !agrupada) {
      const autor = el('p', 'balao-autor');
      autor.textContent = msg.autor_apelido;   // textContent: nunca interpreta HTML
      balao.append(autor);
    }

    const corpo = el('p', 'balao-corpo');
    corpo.textContent = msg.corpo;             // idem — é aqui que o XSS morre
    balao.append(corpo);

    const hora = el('time', 'balao-hora');
    hora.dateTime = quando.toISOString();
    hora.textContent = msg.provisoria ? 'enviando…' : horaDe.format(quando);
    balao.append(hora);

    caixa.append(balao);
    autorAnterior = msg.autor_apelido;
  }

  if (colado) caixa.scrollTop = caixa.scrollHeight;
}

function guardarMensagem(msg) {
  if (estado.vistos.has(msg.id)) return false;
  estado.vistos.add(msg.id);
  const lista = estado.mensagens.get(msg.sala_id) || [];
  lista.push(msg);
  estado.mensagens.set(msg.sala_id, lista);
  return true;
}

async function abrirSala(salaId) {
  estado.salaAtual = salaId;
  const sala = estado.salas.find(s => s.id === salaId);
  $('titulo-sala').textContent = sala?.titulo || '';
  $('subtitulo-sala').textContent = sala?.subtitulo || '';
  $('tela-app').dataset.vista = 'conversa';

  if (!estado.carregadas.has(salaId)) {
    try { await carregarMensagens(salaId); }
    catch (e) { avisar(e.message); }
  }

  marcarLida(salaId);
  desenharMensagens();
  desenharSalas();
  desenharPresenca();

  if (estado.canalPresenca) {
    await estado.canalPresenca.track({ apelido: estado.eu.apelido, sala: salaId });
  }
}

/* ——— Envio ————————————————————————————————————————————————— */

function avisar(texto) {
  const aviso = $('aviso');
  if (!texto) { aviso.hidden = true; return; }
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(avisar.relogio);
  avisar.relogio = setTimeout(() => { aviso.hidden = true; }, 6000);
}

async function enviar() {
  const campo = $('campo-mensagem');
  const corpo = campo.value.trim();
  if (!corpo) return;
  if (corpo.length > LIMITE_CORPO) {
    avisar(`No máximo ${LIMITE_CORPO} caracteres.`);
    return;
  }

  const salaId = estado.salaAtual;
  campo.value = '';
  ajustarAltura();
  avisar('');

  // Balão provisório: a mensagem aparece na hora, e some se o banco recusar.
  const provisoria = {
    id: -Date.now(),
    sala_id: salaId,
    autor_id: estado.eu.id,
    autor_apelido: estado.eu.apelido,
    corpo,
    criado_em: new Date().toISOString(),
    provisoria: true
  };
  const lista = estado.mensagens.get(salaId) || [];
  lista.push(provisoria);
  estado.mensagens.set(salaId, lista);
  desenharMensagens();

  // Só sala e corpo saem daqui. Autor e horário quem carimba é o banco.
  const { data, error } = await estado.sb
    .from('mensagens')
    .insert({ sala_id: salaId, corpo })
    .select('id, sala_id, autor_id, autor_apelido, corpo, criado_em')
    .single();

  const atual = estado.mensagens.get(salaId) || [];
  const semProvisoria = atual.filter(m => m.id !== provisoria.id);

  if (error) {
    estado.mensagens.set(salaId, semProvisoria);
    desenharMensagens();
    campo.value = corpo;          // devolve o texto para não se perder
    ajustarAltura();
    avisar(error.message || 'Não consegui enviar.');
    return;
  }

  estado.mensagens.set(salaId, semProvisoria);
  if (guardarMensagem(data)) {
    estado.mensagens.get(salaId).sort((a, b) => a.id - b.id);
  }
  marcarLida(salaId);
  desenharMensagens();
  desenharSalas();
}

function ajustarAltura() {
  const campo = $('campo-mensagem');
  campo.style.height = 'auto';
  campo.style.height = Math.min(campo.scrollHeight, 140) + 'px';
}

/* ——— Tempo real ———————————————————————————————————————————— */

function sinalizar(ligado) {
  $('sinal').classList.toggle('ligado', ligado);
  $('sinal').title = ligado ? 'Conectado' : 'Reconectando…';
}

function ouvirMensagens() {
  // Um canal só para todas as salas: assim as não lidas das outras
  // continuam contando sem abrir mais conexões.
  estado.canalMensagens = estado.sb
    .channel('alo-mensagens')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'mensagens' },
      carga => {
        const msg = carga.new;
        if (!guardarMensagem(msg)) return;
        estado.mensagens.get(msg.sala_id).sort((a, b) => a.id - b.id);
        if (msg.sala_id === estado.salaAtual) {
          desenharMensagens(true);
          if (noFim($('mensagens'))) marcarLida(msg.sala_id);
        }
        desenharSalas();
      })
    .subscribe(situacao => sinalizar(situacao === 'SUBSCRIBED'));
}

function ouvirPresenca() {
  // Presença fica na memória do Realtime: sem tabela, sem o DELETE que
  // antes rodava a cada batida de coração.
  estado.canalPresenca = estado.sb.channel('alo-presenca', {
    config: { presence: { key: estado.eu.id } }
  });

  estado.canalPresenca
    .on('presence', { event: 'sync' }, () => {
      const cru = estado.canalPresenca.presenceState();
      estado.presentes = Object.entries(cru)
        .map(([id, entradas]) => ({ id, ...entradas[0] }))
        .filter(p => p.apelido)
        .sort((a, b) => a.apelido.localeCompare(b.apelido, 'pt-BR'));
      desenharPresenca();
    })
    .subscribe(async situacao => {
      if (situacao === 'SUBSCRIBED') {
        await estado.canalPresenca.track({
          apelido: estado.eu.apelido,
          sala: estado.salaAtual
        });
      }
    });
}

function desenharPresenca() {
  const alvo = $('lista-presenca');
  alvo.replaceChildren();
  $('contagem-presenca').textContent = String(estado.presentes.length);

  for (const pessoa of estado.presentes) {
    const item = el('li', 'pessoa');
    const marca = el('span', 'avatar');
    marca.textContent = iniciais(pessoa.apelido);
    marca.style.background = corDe(pessoa.apelido);

    const nome = el('span');
    const sala = estado.salas.find(s => s.id === pessoa.sala);
    nome.textContent = sala
      ? `${pessoa.apelido} · ${sala.titulo}`
      : pessoa.apelido;

    item.append(marca, nome);
    alvo.append(item);
  }
}

/* ——— Trocar de apelido ————————————————————————————————————— */

async function trocarApelido() {
  const novo = prompt('Novo apelido:', estado.eu.apelido);
  if (novo === null) return;

  const apelido = novo.trim().replace(/\s+/g, ' ');
  if (apelido === estado.eu.apelido) return;
  if (apelido.length < 2 || apelido.length > 24) {
    avisar('O apelido precisa ter de 2 a 24 letras.');
    return;
  }

  const { data, error } = await estado.sb
    .from('perfis').update({ apelido }).eq('id', estado.eu.id).select().single();

  if (error) {
    avisar(error.code === '23505'
      ? 'Esse apelido já é de outra pessoa. Tente outro.'
      : (error.message || 'Não consegui trocar o apelido.'));
    return;
  }

  estado.eu = data;
  $('meu-nome').textContent = estado.eu.apelido;
  $('meu-avatar').textContent = iniciais(estado.eu.apelido);
  $('meu-avatar').style.background = corDe(estado.eu.apelido);

  // O que já foi dito fica com o nome de quando foi dito.
  if (estado.canalPresenca) {
    await estado.canalPresenca.track({ apelido: estado.eu.apelido, sala: estado.salaAtual });
  }
  avisar('');
}

/* ——— Montagem ——————————————————————————————————————————————— */

async function iniciarApp() {
  mostrarTela('tela-app');

  $('meu-nome').textContent = estado.eu.apelido;
  $('meu-avatar').textContent = iniciais(estado.eu.apelido);
  $('meu-avatar').style.background = corDe(estado.eu.apelido);

  await carregarSalas();
  ouvirMensagens();
  ouvirPresenca();
  await abrirSala(estado.salas[0]?.id || 'geral');

  const campo = $('campo-mensagem');
  campo.addEventListener('input', ajustarAltura);
  campo.addEventListener('keydown', ev => {
    // Enter envia; Shift+Enter quebra linha. No telefone, Enter quebra linha.
    const noTelefone = matchMedia('(max-width: 760px)').matches;
    if (ev.key === 'Enter' && !ev.shiftKey && !noTelefone) {
      ev.preventDefault();
      enviar();
    }
  });

  $('forma-envio').addEventListener('submit', ev => { ev.preventDefault(); enviar(); });
  $('mensagens').addEventListener('scroll', () => {
    if (noFim($('mensagens'))) { marcarLida(estado.salaAtual); desenharSalas(); }
  });

  $('botao-voltar').addEventListener('click', () => {
    $('tela-app').dataset.vista = 'salas';
  });

  $('botao-sair').addEventListener('click', trocarApelido);

  // Ao voltar para a aba, a conexão pode ter caído em segundo plano.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    estado.carregadas.delete(estado.salaAtual);
    estado.mensagens.delete(estado.salaAtual);
    abrirSala(estado.salaAtual);
  });
}

async function comecar() {
  const config = lerConfig();
  if (!config) { telaConfig(); return; }

  try {
    const idUsuario = await conectar(config);
    const perfil = await buscarPerfil(idUsuario);
    if (!perfil) { telaEntrada(idUsuario); return; }
    estado.eu = perfil;
    await iniciarApp();
  } catch (e) {
    mostrarTela('tela-entrada');
    const erro = $('erro-entrada');
    erro.textContent = e.message || String(e);
    erro.hidden = false;
    $('forma-entrada').hidden = true;
  }
}

comecar();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
