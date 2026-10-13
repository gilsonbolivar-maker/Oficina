/* ————————————————————————————————————————————————————————————
   Alô — salas de conversa: abertas, privadas e a sós.

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

const VERSAO = '1.2.0';     // precisa casar com a VERSAO do sw.js
const HISTORICO = 80;        // mensagens carregadas ao abrir uma sala
const LIMITE_CORPO = 500;    // igual à constraint do banco
const CHAVE_CONFIG = 'alo:config';
const CHAVE_LIDO = 'alo:lido';
const CHAVE_SOM = 'alo:som';
const CHAVE_CONVITE = 'alo:convite';
const CHAVE_SECRETA = 'alo:secreta';
const CHAVE_LIMPO = 'alo:limpo';

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

// Versão sempre à vista: cada [data-versao] da página mostra a deste app.
for (const lugar of document.querySelectorAll('[data-versao]')) lugar.textContent = 'v' + VERSAO;

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
  som: lembrar(CHAVE_SOM, true),
  limpo: lembrar(CHAVE_LIMPO, {}),   // sala_id -> última mensagem escondida
  presentes: [],
  convite: null,          // código vindo de um link #convite=…
  secreta: null,          // código vindo de um link #secreta=…
  abrirPrimeiro: null,    // sala a abrir quando o app começar
  avisoGuardado: '',      // erro de convite para mostrar quando der
  chatAberto: true,
  appIniciado: false,
  pessoas: [],            // a fila da portaria (só para a administração)
  canalPerfis: null,
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
  for (const t of ['tela-config', 'tela-entrada', 'tela-espera', 'tela-app']) $(t).hidden = t !== qual;
}

/**
 * Assistente de instalação.
 *
 * Em vez de recusar a configuração com um "deu erro", cada passo do
 * Supabase é conferido em separado, porque cada um falha de um jeito
 * reconhecível: tabela que não existe é 42P01, entrada anônima desligada
 * vem como anonymous_provider_disabled. Saber qual dos quatro passos
 * faltou é o que evita recomeçar tudo do zero.
 */

/** Mostra o resultado da conferência, com o passo que falta em destaque. */
function contarResultado(tipo, titulo, detalhe, passo) {
  const caixa = $('resultado-config');
  caixa.className = 'resultado ' + tipo;
  caixa.replaceChildren();

  const h = el('p', 'resultado-titulo');
  h.textContent = titulo;
  caixa.append(h);

  if (detalhe) {
    const d = el('p', 'resultado-detalhe');
    d.textContent = detalhe;
    caixa.append(d);
  }

  caixa.hidden = false;
  caixa.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Acende o passo que precisa de atenção e apaga os outros.
  document.querySelectorAll('.passo').forEach((n, i) => {
    n.classList.toggle('passo-pendente', passo === i + 1);
  });
}

/**
 * Confere os quatro passos na ordem e devolve o primeiro que falhou.
 * Devolve null quando está tudo de pé.
 */
async function conferirInstalacao(config) {
  let createClient;
  try {
    createClient = await carregarBiblioteca();
  } catch (e) {
    return { passo: 0, titulo: 'Sem conexão com a internet',
      detalhe: 'Não consegui carregar a biblioteca do Supabase. ' + (e.message || '') };
  }

  let sb;
  try {
    sb = createClient(config.url, config.anonKey, { auth: { persistSession: true } });
  } catch {
    return { passo: 4, titulo: 'O endereço ou a chave não servem',
      detalhe: 'Confira se copiou o Project URL inteiro e a chave anon completa.' };
  }

  // Passo 3 — entrada sem senha.
  const { error: erroEntrada } = await sb.auth.signInAnonymously();
  if (erroEntrada) {
    const texto = (erroEntrada.message || '').toLowerCase();
    if (texto.includes('anonymous') || erroEntrada.code === 'anonymous_provider_disabled') {
      return { passo: 3, titulo: 'Falta o passo 3',
        detalhe: 'A entrada sem senha está desligada. Abra o passo 3, ligue ' +
                 '"Allow anonymous sign-ins", salve e confira de novo.' };
    }
    if (texto.includes('invalid') && texto.includes('key')) {
      return { passo: 4, titulo: 'A chave não confere',
        detalhe: 'Parece que a chave copiada não é a deste projeto. Copie de novo a chave anon.' };
    }
    return { passo: 4, titulo: 'Não consegui entrar no projeto',
      detalhe: erroEntrada.message || '' };
  }

  // Passo 2 — as tabelas.
  const { error: erroSalas } = await sb.from('salas').select('id').limit(1);
  if (erroSalas) {
    const codigo = erroSalas.code || '';
    if (codigo === '42P01' || codigo === 'PGRST205' || codigo === 'PGRST202') {
      return { passo: 2, titulo: 'Falta o passo 2',
        detalhe: 'As tabelas ainda não existem. Copie o texto do passo 2, ' +
                 'cole no Supabase e clique em Run.' };
    }
    return { passo: 2, titulo: 'As tabelas não responderam',
      detalhe: erroSalas.message || '' };
  }

  return null;
}

function telaConfig() {
  mostrarTela('tela-config');

  // Passo 2: o texto a copiar é o próprio supabase.sql publicado ao lado.
  $('botao-copiar-sql').addEventListener('click', async ev => {
    const botao = ev.currentTarget;
    const aviso = $('aviso-sql');
    botao.disabled = true;
    try {
      const resp = await fetch('supabase.sql');
      if (!resp.ok) throw new Error('não encontrei o arquivo');
      const texto = await resp.text();
      await navigator.clipboard.writeText(texto);
      botao.textContent = 'Copiado ✓';
      aviso.textContent = 'Agora clique em "Abrir onde colar", cole e clique em Run.';
      aviso.hidden = false;
      setTimeout(() => { botao.textContent = 'Copiar o texto'; botao.disabled = false; }, 2500);
    } catch {
      // Safari mais antigo recusa a área de transferência sem gesto direto.
      botao.disabled = false;
      aviso.textContent = 'Não consegui copiar sozinho. Abra o arquivo supabase.sql ' +
                          'no GitHub, selecione tudo e copie na mão.';
      aviso.hidden = false;
    }
  });

  // Passo 4: confere tudo antes de guardar, para não travar na tela seguinte.
  $('botao-config').addEventListener('click', async ev => {
    const botao = ev.currentTarget;
    const url = $('campo-url').value.trim().replace(/\/+$/, '');
    const chave = $('campo-chave').value.trim();

    if (!/^https:\/\/[^\s/]+$/.test(url)) {
      contarResultado('ruim', 'O endereço não parece certo',
        'Tem que ser parecido com https://abcdefgh.supabase.co — sem barra no fim.', 4);
      return;
    }
    if (chave.length < 20) {
      contarResultado('ruim', 'A chave parece incompleta',
        'Ela é bem longa. Copie o valor inteiro.', 4);
      return;
    }
    if (chave.includes('service_role') || chave.startsWith('sb_secret_')) {
      contarResultado('ruim', 'Essa é a chave errada',
        'Você colou a service_role, que dá acesso total. Use a chave anon.', 4);
      return;
    }

    botao.disabled = true;
    botao.textContent = 'Conferindo…';
    contarResultado('neutro', 'Conferindo os quatro passos…', '', 0);

    const falha = await conferirInstalacao({ url, anonKey: chave });

    botao.disabled = false;
    botao.textContent = 'Conferir e ligar';

    if (falha) {
      contarResultado('ruim', falha.titulo, falha.detalhe, falha.passo);
      return;
    }

    contarResultado('bom', 'Tudo certo — sua sala está de pé.', 'Abrindo…', 0);
    guardar(CHAVE_CONFIG, { url, anonKey: chave });
    setTimeout(() => location.reload(), 900);
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
    .from('perfis').select('id, apelido, situacao, admin').eq('id', id).maybeSingle();
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
    // Situação e admin quem decide é o banco: daqui só sai o apelido.
    const { data, error } = await estado.sb
      .from('perfis').insert({ id: idUsuario, apelido })
      .select('id, apelido, situacao, admin').single();
    botao.disabled = false;
    botao.textContent = 'Entrar';

    if (error) {
      erro.textContent = error.code === '23505'
        ? 'Esse apelido já é de outra pessoa. Tente outro.'
        : (error.message || 'Não consegui entrar.');
      erro.hidden = false;
      return;
    }
    await seguir(data);
  });
}

/* ——— Portaria: quem espera, quem entra ——————————————————————
   A regra mora no banco (supabase.sql): quem está pendente ou
   bloqueado não lê nem escreve nada. Aqui só se mostra a tela certa. */

/** Abre a tela que cabe à situação da pessoa. */
async function seguir(perfil) {
  estado.eu = perfil;
  // Link de conversa secreta: entra direto, sem esperar a portaria.
  if (estado.secreta && perfil.situacao !== 'bloqueado') {
    estado.eu = (await usarConversaSecreta()) || estado.eu;
  }
  ouvirPerfis();
  await carregarAjustes();
  if (podeEntrar()) await iniciarApp();
  else telaEspera(motivoDeFora());
}

/** Aprovado e, com o chat fechado, da administração. */
function podeEntrar() {
  return estado.eu.situacao === 'aprovado' && (estado.chatAberto || estado.eu.admin);
}

function motivoDeFora() {
  return estado.eu.situacao === 'aprovado' ? 'fechado' : estado.eu.situacao;
}

const TEXTOS_ESPERA = {
  pendente: ['Pedido enviado', eu =>
    `Olá, ${eu.apelido}. A administração vai ver o seu pedido para entrar. ` +
    'Assim que for aprovado, esta tela abre sozinha.'],
  bloqueado: ['Acesso não liberado', () => 'A administração do Alô não liberou a sua entrada.'],
  fechado: ['Chat fechado', () =>
    'O Alô está fechado agora. Quando abrir de novo, esta tela abre sozinha.']
};

function telaEspera(motivo) {
  mostrarTela('tela-espera');
  const [titulo, texto] = TEXTOS_ESPERA[motivo] || TEXTOS_ESPERA.pendente;
  $('espera-titulo').textContent = titulo;
  $('espera-texto').textContent = texto(estado.eu);
  $('erro-espera').textContent = estado.avisoGuardado;
  $('erro-espera').hidden = !estado.avisoGuardado;
  $('botao-conferir').hidden = motivo === 'bloqueado';
  $('botao-conferir').onclick = async () => {
    const podia = podeEntrar();
    const perfil = await buscarPerfil(estado.eu.id).catch(() => null);
    if (perfil) estado.eu = { ...estado.eu, ...perfil };
    await carregarAjustes();
    await reagir(podia);
  };
}

/* ——— Senha da administração ——————————————————————————————
   Cada aparelho é uma conta nova (até o ícone da Tela de Início tem
   armazenamento próprio). Com a senha, qualquer conta vira admin na
   hora — quem confere é o banco (entrar_com_senha), nunca o app. */

/**
 * Pede uma senha num painel próprio. `conferir(senha)` devolve o texto
 * do erro, ou nada se deu certo; o painel só fecha quando der certo.
 */
function pedirSenha({ titulo, ajuda, botao, repetir, conferir }) {
  return new Promise(resolver => {
    const painel = $('painel-senha');
    const campo = $('campo-senha');
    const campo2 = $('campo-senha-2');
    const erro = $('erro-senha');
    $('senha-titulo').textContent = titulo;
    $('senha-ajuda').textContent = ajuda;
    $('senha-ok').textContent = botao;
    campo.value = '';
    campo2.value = '';
    campo2.hidden = !repetir;
    campo.autocomplete = repetir ? 'new-password' : 'current-password';
    erro.hidden = true;

    const fechar = ok => { painel.close(); resolver(ok); };
    $('senha-cancelar').onclick = () => fechar(false);
    painel.oncancel = () => resolver(false);
    $('forma-senha').onsubmit = async ev => {
      ev.preventDefault();
      if (repetir && campo.value !== campo2.value) {
        erro.textContent = 'As duas senhas não são iguais.';
        erro.hidden = false;
        return;
      }
      $('senha-ok').disabled = true;
      const problema = await conferir(campo.value);
      $('senha-ok').disabled = false;
      if (problema) {
        erro.textContent = problema;
        erro.hidden = false;
        campo.select();
        return;
      }
      fechar(true);
    };
    painel.showModal();
    campo.focus();
  });
}

async function entrarComoAdmin() {
  const entrou = await pedirSenha({
    titulo: 'Sou da administração',
    ajuda: 'Digite a senha da administração. Esta conta vira administradora na hora.',
    botao: 'Entrar',
    conferir: async senha => {
      const { data, error } = await estado.sb.rpc('entrar_com_senha', { p_senha: senha });
      if (error) return error.message || 'Não consegui conferir a senha.';
      return data ? '' : 'Senha errada.';
    }
  });
  if (!entrou) return;
  const perfil = await buscarPerfil(estado.eu.id).catch(() => null);
  if (perfil) await mudouMinhaSituacao(perfil);
}

async function definirSenha() {
  const salvou = await pedirSenha({
    titulo: 'Senha da administração',
    ajuda: 'Com ela, você vira admin em qualquer aparelho: escolha um apelido e, ' +
           'na tela de espera, toque em "Sou da administração". Pelo menos 8 caracteres.',
    botao: 'Salvar',
    repetir: true,
    conferir: async senha => {
      const { error } = await estado.sb.rpc('definir_senha_admin', { p_senha: senha });
      return error ? (error.message || 'Não consegui salvar a senha.') : '';
    }
  });
  if (!salvou) return;
  avisar('Senha da administração salva.', 'bom');
  await desenharSenha();
}

async function desenharSenha() {
  const { data } = await estado.sb.rpc('tem_senha_admin');
  $('estado-senha').textContent = data ? 'Senha da administração: definida' : 'Senha da administração: não definida';
  $('botao-senha').textContent = data ? 'Trocar' : 'Definir';
}

async function carregarAjustes() {
  const { data } = await estado.sb.from('ajustes').select('aberto').eq('id', 1).maybeSingle();
  estado.chatAberto = data?.aberto ?? true;
}

/** Alguma coisa mudou (situação ou chat): abre ou fecha a porta. */
async function reagir(podiaAntes) {
  if (!podeEntrar()) {
    // A presença não passa pelas regras do banco: sai dela por conta própria.
    estado.canalPresenca?.untrack?.();
    telaEspera(motivoDeFora());
    return;
  }
  if (podiaAntes) return;
  // Voltando de fora, recomeça do zero com tudo carregado de novo.
  if (estado.appIniciado) location.reload();
  else await iniciarApp();
}

async function mudouMinhaSituacao(perfil) {
  const podia = podeEntrar();
  estado.eu = { ...estado.eu, ...perfil };
  await reagir(podia);
}

async function mudouAjustes(ajustes) {
  const podia = podeEntrar();
  estado.chatAberto = ajustes.aberto;
  if (estado.eu.admin) desenharChaveChat();
  await reagir(podia);
}

/**
 * Um canal para os perfis. O banco só manda o que a pessoa pode ver:
 * quem espera recebe só o próprio perfil (e descobre que foi aprovado);
 * quem já entrou recebe todos (a administração vê a fila crescer).
 */
function ouvirPerfis() {
  if (estado.canalPerfis) return;
  estado.canalPerfis = estado.sb
    .channel('alo-perfis')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'perfis' },
      carga => {
        const perfil = carga.new;
        if (!perfil?.id) return;
        if (perfil.id === estado.eu.id) mudouMinhaSituacao(perfil);
        else if (estado.eu.admin) chegouNaPortaria(perfil, carga.eventType);
      })
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'ajustes' },
      carga => { if (carga.new) mudouAjustes(carga.new); })
    .subscribe();
}

/* ——— Administração —————————————————————————————————————————— */

function chegouNaPortaria(perfil, evento) {
  const i = estado.pessoas.findIndex(p => p.id === perfil.id);
  if (i >= 0) estado.pessoas[i] = { ...estado.pessoas[i], ...perfil };
  else estado.pessoas.unshift(perfil);
  desenharPortaria();

  if (evento === 'INSERT' && perfil.situacao === 'pendente') {
    tocarSom('privada');
    avisar(`${perfil.apelido} quer entrar. Toque em 🛡️ para aprovar.`, 'bom');
  }
}

async function carregarPessoas() {
  const { data, error } = await estado.sb
    .from('perfis')
    .select('id, apelido, situacao, admin, criado_em')
    .order('criado_em', { ascending: false });
  if (error) { avisar(error.message || 'Não consegui ver a portaria.'); return; }
  estado.pessoas = data || [];
  desenharPortaria();
}

const ACOES_PORTARIA = {
  pendente:  [['Aprovar', 'aprovado', 'principal'], ['Recusar', 'bloqueado', 'perigo']],
  aprovado:  [['Bloquear', 'bloqueado', 'perigo']],
  bloqueado: [['Desbloquear', 'aprovado', '']]
};

function desenharPortaria() {
  const listas = {
    pendente: $('lista-pendentes'),
    aprovado: $('lista-aprovados'),
    bloqueado: $('lista-bloqueados')
  };
  for (const lista of Object.values(listas)) lista.replaceChildren();

  for (const pessoa of estado.pessoas) {
    const item = el('li', 'gente-item');
    const marca = el('span', 'avatar');
    marca.textContent = iniciais(pessoa.apelido);
    marca.style.background = corDe(pessoa.apelido);
    const nome = el('span', 'nome');
    nome.textContent = pessoa.apelido;
    item.append(marca, nome);

    if (pessoa.admin) {
      const etiqueta = el('span', 'etiqueta');
      etiqueta.textContent = pessoa.id === estado.eu.id ? 'você · admin' : 'admin';
      item.append(etiqueta);
    } else {
      for (const [rotulo, situacao, classe] of ACOES_PORTARIA[pessoa.situacao] || []) {
        const botao = el('button', `acao ${classe}`.trim());
        botao.type = 'button';
        botao.textContent = rotulo;
        botao.addEventListener('click', () => decidirAcesso(pessoa, situacao));
        item.append(botao);
      }
    }
    listas[pessoa.situacao]?.append(item);
  }

  const pendentes = listas.pendente.children.length;
  $('conta-pendentes').textContent = String(pendentes);
  $('vazio-pendentes').hidden = pendentes > 0;
  $('vazio-bloqueados').hidden = listas.bloqueado.children.length > 0;
  $('selo-portaria').textContent = String(pendentes);
  $('selo-portaria').hidden = pendentes === 0;
}

async function decidirAcesso(pessoa, situacao) {
  if (situacao === 'bloqueado' && pessoa.situacao === 'aprovado' &&
      !confirm(`Bloquear ${pessoa.apelido}? A pessoa deixa de ler e de escrever na hora.`)) return;

  const { error } = await estado.sb.rpc('decidir_acesso', { p_perfil: pessoa.id, p_situacao: situacao });
  if (error) { avisar(error.message || 'Não consegui mudar o acesso.'); return; }
  pessoa.situacao = situacao;
  desenharPortaria();
}

async function abrirPortaria() {
  await carregarPessoas();
  desenharChaveChat();
  await desenharSenha();
  $('painel-admin').showModal();
}

function desenharChaveChat() {
  $('estado-chat').textContent = estado.chatAberto ? 'Chat aberto' : 'Chat fechado';
  $('estado-chat').parentElement.classList.toggle('fechado', !estado.chatAberto);
  $('botao-chat').textContent = estado.chatAberto ? 'Fechar o chat' : 'Abrir o chat';
  $('faixa-fechada').hidden = estado.chatAberto;
}

async function alternarChat() {
  const abrir = !estado.chatAberto;
  if (!abrir && !confirm('Fechar o chat? Ninguém além da administração lê nem escreve ' +
                         'até você abrir de novo.')) return;
  const { error } = await estado.sb.rpc('abrir_fechar_chat', { p_aberto: abrir });
  if (error) { avisar(error.message || 'Não consegui mudar o chat.'); return; }
  estado.chatAberto = abrir;
  desenharChaveChat();
}

async function apagarMensagem(msg) {
  const qual = msg.autor_id === estado.eu.id ? 'a sua mensagem' : `a mensagem de ${msg.autor_apelido}`;
  if (!confirm(`Apagar ${qual}? Ela some para todo mundo.`)) return;

  // O select confirma que apagou mesmo: se a regra do banco não deixar,
  // o delete não dá erro, só não acha nada.
  const { data, error } = await estado.sb
    .from('mensagens').delete().eq('id', msg.id).select('id');
  if (error || !data?.length) {
    avisar(error?.message || 'Não deu para apagar essa mensagem.');
    return;
  }
  removerMensagem(msg.id);
}

function removerMensagem(id) {
  for (const [salaId, lista] of estado.mensagens) {
    const resto = lista.filter(m => m.id !== id);
    if (resto.length === lista.length) continue;
    estado.mensagens.set(salaId, resto);
    if (salaId === estado.salaAtual) desenharMensagens(true);
  }
  desenharSalas();
}

/* ——— Salas ————————————————————————————————————————————————— */

/*
 * Três tipos de sala, e o banco só devolve as que a pessoa pode ver:
 * as abertas (para todo mundo), as privadas de que ela é membro e as
 * conversas a sós em que ela é uma das duas pontas.
 */
async function carregarSalas() {
  const { data, error } = await estado.sb
    .from('salas')
    .select('id, titulo, subtitulo, ordem, tipo, dono_id, convite, membros(perfil_id, perfis(apelido))')
    .order('ordem');
  if (error) throw error;
  const porNome = (a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR');
  const salas = (data || []).map(prepararSala);
  estado.salas = [
    ...salas.filter(s => s.tipo === 'publica'),
    ...salas.filter(s => s.tipo === 'privada').sort(porNome),
    ...salas.filter(s => s.tipo === 'individual').sort(porNome)
  ];
}

/** Título e subtítulo de cada sala como a pessoa deve ver. */
function prepararSala(s) {
  const tipo = s.tipo || 'publica';
  const membros = (s.membros || []).map(m => ({ id: m.perfil_id, apelido: m.perfis?.apelido || '' }));
  let titulo = s.titulo;
  let subtitulo = s.subtitulo || '';

  if (tipo === 'individual') {
    // A conversa a sós se chama pelo nome da outra pessoa. A secreta
    // (que tem dono) se chama "Convite secreto" até alguém abrir o link.
    const outro = membros.find(m => m.id !== estado.eu.id);
    if (outro) {
      titulo = outro.apelido || 'Conversa';
      subtitulo = s.dono_id ? 'Conversa secreta' : 'Conversa a sós';
    } else if (s.convite) {
      titulo = 'Convite secreto';
      subtitulo = 'Ninguém abriu o link ainda';
    } else {
      titulo = 'Conversa';
      subtitulo = 'A outra pessoa saiu da conversa';
    }
  } else if (tipo === 'privada') {
    subtitulo = membros.length > 1
      ? `Sala privada · ${membros.length} pessoas`
      : 'Sala privada · só você, por enquanto';
  }
  return { ...s, tipo, membros, titulo, subtitulo };
}

async function recarregarSalas() {
  try {
    await carregarSalas();
  } catch (e) {
    avisar(e.message || 'Não consegui atualizar as salas.');
    return;
  }
  desenharSalas();
}

function salaAtual() {
  return estado.salas.find(s => s.id === estado.salaAtual);
}

const MARCA_SALA = { geral: '#', recados: '✎', cafe: '☕' };
const MARCA_TIPO = { privada: '🔒', individual: '👤' };

function desenharSalas() {
  const listas = {
    publica: $('lista-salas'),
    privada: $('lista-privadas'),
    individual: $('lista-conversas')
  };
  for (const lista of Object.values(listas)) lista.replaceChildren();

  for (const sala of estado.salas) listas[sala.tipo]?.append(botaoSala(sala));

  $('dica-privadas').hidden = listas.privada.children.length > 0;
  // A administração sempre vê o grupo: é nele que cria a conversa secreta.
  $('grupo-conversas').hidden = listas.individual.children.length === 0 && !estado.eu.admin;
}

function botaoSala(sala) {
  const botao = el('button', 'sala');
  botao.type = 'button';
  botao.setAttribute('aria-current', String(sala.id === estado.salaAtual));

  const marca = el('span', 'sala-marca');
  marca.textContent = MARCA_SALA[sala.id] ||
    (sala.tipo === 'individual' && sala.dono_id ? '🕶️' : MARCA_TIPO[sala.tipo]) || '#';

  const nome = el('span', 'sala-nome');
  nome.textContent = sala.titulo;

  botao.append(marca, nome);

  const naoLidas = contarNaoLidas(sala.id);
  if (naoLidas > 0 && sala.id !== estado.salaAtual) {
    const selo = el('span', 'nao-lidas');
    selo.textContent = naoLidas > 99 ? '99+' : String(naoLidas);
    botao.append(selo);
  }

  const ultimas = visiveis(sala.id);
  const ultima = ultimas[ultimas.length - 1];
  const resumo = el('span', 'sala-ultima');
  resumo.textContent = ultima
    ? `${ultima.autor_apelido}: ${ultima.corpo}`
    : sala.subtitulo;
  botao.append(resumo);

  botao.addEventListener('click', () => abrirSala(sala.id));
  return botao;
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
  const lista = visiveis(estado.salaAtual);

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

    const rodape = el('div', 'balao-rodape');
    // Cada um apaga o que disse; a administração apaga qualquer coisa.
    if (!msg.provisoria && (minha || estado.eu.admin)) {
      const apagar = el('button', 'balao-apagar');
      apagar.type = 'button';
      apagar.textContent = 'apagar';
      apagar.addEventListener('click', () => apagarMensagem(msg));
      rodape.append(apagar);
    }
    const hora = el('time', 'balao-hora');
    hora.dateTime = quando.toISOString();
    hora.textContent = msg.provisoria ? 'enviando…' : horaDe.format(quando);
    rodape.append(hora);
    balao.append(rodape);

    caixa.append(balao);
    autorAnterior = msg.autor_apelido;
  }

  if (colado) caixa.scrollTop = caixa.scrollHeight;
}

/** Mensagens da sala, menos as que a pessoa limpou da própria tela. */
function visiveis(salaId) {
  const ate = estado.limpo[salaId] || 0;
  return (estado.mensagens.get(salaId) || []).filter(m => m.id < 0 || m.id > ate);
}

function guardarMensagem(msg) {
  if (estado.vistos.has(msg.id)) return false;
  estado.vistos.add(msg.id);
  const lista = estado.mensagens.get(msg.sala_id) || [];
  lista.push(msg);
  estado.mensagens.set(msg.sala_id, lista);
  return true;
}

/**
 * Abre a sala. `mostrar: false` só atualiza por trás, sem tirar a pessoa
 * da tela em que está — no telefone, a lista de salas continua na frente.
 */
async function abrirSala(salaId, { mostrar = true } = {}) {
  estado.salaAtual = salaId;
  const sala = estado.salas.find(s => s.id === salaId);
  $('titulo-sala').textContent = sala?.titulo || '';
  $('subtitulo-sala').textContent = sala?.subtitulo || '';
  if (mostrar) $('tela-app').dataset.vista = 'conversa';
  prepararOpcoes(sala);

  if (!estado.carregadas.has(salaId)) {
    try { await carregarMensagens(salaId); }
    catch (e) { avisar(e.message); }
  }

  marcarLida(salaId);
  desenharMensagens();
  desenharSalas();
  desenharPresenca();
  await anunciarPresenca();
}

/* ——— Envio ————————————————————————————————————————————————— */

function avisar(texto, tipo = 'ruim') {
  const aviso = $('aviso');
  if (!texto) { aviso.hidden = true; return; }
  aviso.textContent = texto;
  aviso.classList.toggle('bom', tipo === 'bom');
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
        // O banco só entrega o que a pessoa pode ler. Mensagem de sala que
        // ainda não está na lista é conversa nova: alguém chamou a sós.
        const sala = estado.salas.find(s => s.id === msg.sala_id);
        if (!sala) recarregarSalas();
        // O banco também devolve as nossas mensagens: essas não tocam.
        if (msg.autor_id !== estado.eu.id) tocarSom(sala?.tipo || 'individual');
        estado.mensagens.get(msg.sala_id).sort((a, b) => a.id - b.id);
        if (msg.sala_id === estado.salaAtual) {
          desenharMensagens(true);
          if (noFim($('mensagens'))) marcarLida(msg.sala_id);
        }
        desenharSalas();
      })
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'mensagens' },
      carga => { if (carga.old?.id) removerMensagem(carga.old.id); })
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
      if (situacao === 'SUBSCRIBED') await anunciarPresenca();
    });
}

/**
 * Conta aos outros onde estamos. Sala privada e conversa a sós ficam de
 * fora: a presença chega a todo mundo, e até o id de uma conversa a sós
 * diria quem está falando com quem.
 */
function anunciarPresenca() {
  if (!estado.canalPresenca) return undefined;   // reservado não entra na presença
  const sala = salaAtual();
  return estado.canalPresenca.track({
    apelido: estado.eu.apelido,
    sala: sala?.tipo === 'publica' ? sala.id : null
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

    if (pessoa.id === estado.eu.id) {
      item.append(marca, nome);
    } else {
      const botao = el('button', 'pessoa-botao');
      botao.type = 'button';
      botao.title = `Conversar a sós com ${pessoa.apelido}`;
      botao.append(marca, nome);
      botao.addEventListener('click', () => abrirConversa(pessoa.id));
      item.append(botao);
    }
    alvo.append(item);
  }
}

/* ——— Som ao receber mensagem ———————————————————————————————
   Gerado na hora com Web Audio: nenhum arquivo para baixar, e funciona
   sem internet. O Safari só libera som depois de um toque na página,
   por isso o áudio é destravado no primeiro toque ou tecla. */

let audio = null;
let ultimoSom = -Infinity;

function destravarSom() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch {
    audio = null;   // navegador sem Web Audio: segue em silêncio
  }
}

/**
 * Sala aberta: um toque. Privada ou a sós: dois, para dar para
 * distinguir sem olhar. Rajada de mensagens toca uma vez só.
 */
function tocarSom(tipo) {
  if (!estado.som || !audio || audio.state !== 'running') return;
  const agora = audio.currentTime;
  if (agora - ultimoSom < 1.2) return;
  ultimoSom = agora;

  const notas = tipo === 'publica' ? [880] : [660, 990];
  notas.forEach((freq, i) => {
    const inicio = agora + i * 0.13;
    const osc = audio.createOscillator();
    const volume = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    volume.gain.setValueAtTime(0.0001, inicio);
    volume.gain.exponentialRampToValueAtTime(0.25, inicio + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.28);
    osc.connect(volume).connect(audio.destination);
    osc.start(inicio);
    osc.stop(inicio + 0.3);
  });
}

function mostrarBotaoSom() {
  const botao = $('botao-som');
  botao.textContent = estado.som ? '🔔' : '🔕';
  botao.setAttribute('aria-pressed', String(estado.som));
  botao.title = estado.som ? 'Som ligado — tocar para desligar' : 'Som desligado — tocar para ligar';
}

async function alternarSom() {
  estado.som = !estado.som;
  guardar(CHAVE_SOM, estado.som);
  mostrarBotaoSom();
  if (!estado.som) return;
  // Ao ligar, toca uma amostra: confirma que o som saiu do aparelho.
  destravarSom();
  try { await audio?.resume(); } catch { /* sem som neste navegador */ }
  ultimoSom = -Infinity;
  tocarSom('publica');
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
    .from('perfis').update({ apelido }).eq('id', estado.eu.id)
    .select('id, apelido, situacao, admin').single();

  if (error) {
    avisar(error.code === '23505'
      ? 'Esse apelido já é de outra pessoa. Tente outro.'
      : (error.message || 'Não consegui trocar o apelido.'));
    return;
  }

  estado.eu = { ...estado.eu, ...data };
  $('meu-nome').textContent = estado.eu.apelido;
  $('meu-avatar').textContent = iniciais(estado.eu.apelido);
  $('meu-avatar').style.background = corDe(estado.eu.apelido);

  // O que já foi dito fica com o nome de quando foi dito.
  await anunciarPresenca();
  avisar('');
}

/* ——— Salas privadas e conversas a sós ————————————————————————
   Criar, entrar e abrir conversa passam por funções do banco
   (supabase.sql): é lá que se decide quem é membro, nunca aqui. */

async function criarSala() {
  const nome = prompt('Nome da sala privada:');
  if (nome === null) return;
  const titulo = nome.trim().replace(/\s+/g, ' ');
  if (titulo.length < 2 || titulo.length > 40) {
    avisar('O nome da sala precisa ter de 2 a 40 letras.');
    return;
  }
  const { data, error } = await estado.sb.rpc('criar_sala', { p_titulo: titulo });
  if (error) { avisar(error.message || 'Não consegui criar a sala.'); return; }
  await recarregarSalas();
  await abrirSala(data);
  avisar('Sala criada. Para chamar alguém, toque em ⋯ → Convidar pessoas.', 'bom');
}

async function abrirConversa(outroId) {
  const { data, error } = await estado.sb.rpc('abrir_conversa', { p_outro: outroId });
  if (error) { avisar(error.message || 'Não consegui abrir a conversa.'); return; }
  await recarregarSalas();
  await abrirSala(data);
}

/** Devolve a sala do convite, ou null se o convite não vale. */
async function entrarPorConvite(codigo) {
  const { data, error } = await estado.sb.rpc('entrar_por_convite', { p_codigo: codigo });
  if (error) { avisar(error.message || 'Não consegui usar o convite.'); return null; }
  await recarregarSalas();
  return data;
}

/**
 * Link de convite no endereço: #convite=… (sala privada) ou #secreta=…
 * (conversa secreta). Devolve { tipo, codigo } e tira do endereço.
 */
function lerLinkDoEndereco() {
  const achado = location.hash.match(/(convite|secreta)=([0-9a-f]{64})/);
  if (!achado) return null;
  // Tira do endereço para não reaparecer ao recarregar nem ir junto num
  // compartilhamento da página.
  history.replaceState(null, '', location.pathname + location.search);
  return { tipo: achado[1], codigo: achado[2] };
}

function linkDoConvite(sala) {
  const tipo = sala.tipo === 'individual' ? 'secreta' : 'convite';
  return `${location.origin}${location.pathname}#${tipo}=${sala.convite}`;
}

/* ——— Conversa secreta ————————————————————————————————————————
   A administração gera um link de uso único. Quem o abre fica só com
   aquela conversa: não vê as salas abertas nem quem está por aqui, e
   ninguém de fora vê que a pessoa existe (supabase.sql). */

async function criarConversaSecreta() {
  const { data, error } = await estado.sb.rpc('criar_conversa_secreta');
  if (error) { avisar(error.message || 'Não consegui criar a conversa.'); return; }
  await recarregarSalas();
  await abrirSala(data);
  avisar('Conversa secreta criada. Toque em ⋯ → Enviar o convite. O link vale uma vez só.', 'bom');
}

/** Usa o link #secreta=…; devolve o perfil já atualizado, ou null. */
async function usarConversaSecreta() {
  const codigo = estado.secreta;
  estado.secreta = null;
  guardar(CHAVE_SECRETA, null);
  const { data, error } = await estado.sb.rpc('aceitar_conversa_secreta', { p_codigo: codigo });
  if (error) {
    estado.avisoGuardado = error.message || 'Não consegui abrir a conversa.';
    return null;
  }
  estado.abrirPrimeiro = data;
  return buscarPerfil(estado.eu.id).catch(() => null);
}

function prepararOpcoes(sala) {
  fecharOpcoes();
  const tipo = sala?.tipo || 'publica';
  const souDono = tipo !== 'publica' && sala.dono_id === estado.eu.id;
  const individual = tipo === 'individual';

  $('opcao-convidar').hidden = !(tipo === 'privada' || (individual && souDono && sala.convite));
  $('opcao-convidar').textContent = individual ? 'Enviar o convite' : 'Convidar pessoas';
  $('opcao-novo-link').hidden = !(tipo === 'privada' && souDono);
  $('opcao-membros').hidden = tipo !== 'privada';
  // Quem criou não sai: apaga. Senão a sala ficaria sem ninguém para
  // trocar o link de convite. Quem veio por conversa secreta também não
  // sai: ficaria sem conversa nenhuma.
  $('opcao-sair').hidden = tipo === 'publica' || souDono || !!estado.eu.reservado;
  $('opcao-sair').textContent = individual ? 'Fechar a conversa' : 'Sair da sala';
  $('opcao-apagar').hidden = !souDono;
  $('opcao-apagar').textContent = individual ? 'Apagar a conversa' : 'Apagar a sala';
  $('opcao-apagar-tudo').hidden = !estado.eu.admin;

  const algum = [...$('opcoes-sala').children].some(b => !b.hidden);
  $('menu-sala').hidden = !sala || !algum;
}

/* ——— Limpar mensagens ————————————————————————————————————————— */

/** Esconde, só neste aparelho, o que já está na sala. Não apaga nada. */
function limparMinhaTela() {
  fecharOpcoes();
  const lista = estado.mensagens.get(estado.salaAtual) || [];
  const ultima = lista.filter(m => m.id > 0).pop();
  if (!ultima) return;
  estado.limpo[estado.salaAtual] = ultima.id;
  guardar(CHAVE_LIMPO, estado.limpo);
  desenharMensagens();
  desenharSalas();
  avisar('Tela limpa. As mensagens continuam para os outros; as novas aparecem normalmente.', 'bom');
}

/** Administração: apaga tudo o que foi dito na sala, para todo mundo. */
async function apagarTodasAsMensagens() {
  fecharOpcoes();
  const sala = salaAtual();
  if (!sala) return;
  if (!confirm(`Apagar TODAS as mensagens de "${sala.titulo}" para todo mundo? Não dá para desfazer.`)) return;

  const { data, error } = await estado.sb
    .from('mensagens').delete().eq('sala_id', sala.id).select('id');
  if (error) { avisar(error.message || 'Não consegui apagar.'); return; }
  estado.mensagens.set(sala.id, []);
  desenharMensagens();
  desenharSalas();
  avisar(`${data?.length || 0} mensagens apagadas.`, 'bom');
}

/* ——— Pessoas de uma sala privada (C) —————————————————————————— */

function abrirMembros() {
  fecharOpcoes();
  const sala = salaAtual();
  if (!sala) return;
  desenharMembros(sala);
  $('painel-membros').showModal();
}

function desenharMembros(sala) {
  const souDono = sala.dono_id === estado.eu.id;
  $('membros-titulo').textContent = sala.titulo;
  const lista = $('lista-membros');
  lista.replaceChildren();

  for (const membro of sala.membros) {
    const item = el('li', 'gente-item');
    const marca = el('span', 'avatar');
    marca.textContent = iniciais(membro.apelido);
    marca.style.background = corDe(membro.apelido);
    const nome = el('span', 'nome');
    nome.textContent = membro.apelido;
    item.append(marca, nome);

    if (membro.id === sala.dono_id) {
      const etiqueta = el('span', 'etiqueta');
      etiqueta.textContent = 'criou a sala';
      item.append(etiqueta);
    } else if (souDono) {
      const botao = el('button', 'acao perigo');
      botao.type = 'button';
      botao.textContent = 'Tirar';
      botao.addEventListener('click', () => tirarMembro(sala, membro));
      item.append(botao);
    }
    lista.append(item);
  }

  $('membros-dica').textContent = souDono
    ? 'Quem você tirar perde o acesso na hora, e o link de convite é trocado junto.'
    : 'Só quem criou a sala pode tirar alguém.';
}

async function tirarMembro(sala, membro) {
  if (!confirm(`Tirar ${membro.apelido} de "${sala.titulo}"?`)) return;
  const { error } = await estado.sb.rpc('remover_membro', { p_sala: sala.id, p_perfil: membro.id });
  if (error) { avisar(error.message || 'Não consegui tirar a pessoa.'); return; }

  await recarregarSalas();
  const atual = salaAtual();
  if (atual) {
    desenharMembros(atual);
    $('subtitulo-sala').textContent = atual.subtitulo;
  }
  avisar(`${membro.apelido} saiu da sala. O link de convite foi trocado.`, 'bom');
}

function abrirOpcoes() {
  const aberto = $('opcoes-sala').hidden;
  $('opcoes-sala').hidden = !aberto;
  $('botao-opcoes').setAttribute('aria-expanded', String(aberto));
}

function fecharOpcoes() {
  $('opcoes-sala').hidden = true;
  $('botao-opcoes').setAttribute('aria-expanded', 'false');
}

async function convidar() {
  fecharOpcoes();
  const sala = salaAtual();
  if (!sala?.convite) return;
  const url = linkDoConvite(sala);
  const texto = sala.tipo === 'individual'
    ? 'Vamos conversar no Alô:'
    : `Entre na sala "${sala.titulo}" do Alô:`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Alô', text: texto, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;   // a pessoa desistiu
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    avisar(sala.tipo === 'individual'
      ? 'Link copiado. Mande só para a pessoa: ele vale uma vez.'
      : 'Link copiado. Mande só para quem você quer na sala.', 'bom');
  } catch {
    prompt('Copie o link do convite:', url);
  }
}

async function gerarLinkNovo() {
  fecharOpcoes();
  const sala = salaAtual();
  if (!sala) return;
  if (!confirm('O link de convite atual vai parar de funcionar. Gerar outro?')) return;
  const { data, error } = await estado.sb.rpc('trocar_convite', { p_sala: sala.id });
  if (error) { avisar(error.message || 'Não consegui gerar o link.'); return; }
  sala.convite = data;
  avisar('Link novo pronto. Quem já está na sala continua nela.', 'bom');
}

/** Tira a sala da tela depois de sair dela ou apagá-la. */
async function esquecerSala(salaId) {
  estado.salas = estado.salas.filter(s => s.id !== salaId);
  estado.mensagens.delete(salaId);
  estado.carregadas.delete(salaId);
  desenharSalas();
  await abrirSala(estado.salas[0]?.id || 'geral');
}

async function sairDaSala() {
  fecharOpcoes();
  const sala = salaAtual();
  if (!sala) return;
  const pergunta = sala.tipo === 'individual'
    ? `Fechar a conversa com ${sala.titulo}? Ela volta quando um de vocês tocar no nome do outro.`
    : `Sair de "${sala.titulo}"? Para voltar, vai precisar de um convite.`;
  if (!confirm(pergunta)) return;

  const { error } = await estado.sb
    .from('membros').delete().eq('sala_id', sala.id).eq('perfil_id', estado.eu.id);
  if (error) { avisar(error.message || 'Não consegui sair.'); return; }
  await esquecerSala(sala.id);
}

async function apagarSala() {
  fecharOpcoes();
  const sala = salaAtual();
  if (!sala) return;
  if (!confirm(`Apagar "${sala.titulo}" e tudo o que foi dito nela? Não dá para desfazer.`)) return;

  const { error } = await estado.sb.from('salas').delete().eq('id', sala.id);
  if (error) { avisar(error.message || 'Não consegui apagar a sala.'); return; }
  await esquecerSala(sala.id);
}

/* ——— Montagem ——————————————————————————————————————————————— */

async function iniciarApp() {
  if (estado.appIniciado) return;
  estado.appIniciado = true;
  mostrarTela('tela-app');

  $('meu-nome').textContent = estado.eu.apelido;
  $('meu-avatar').textContent = iniciais(estado.eu.apelido);
  $('meu-avatar').style.background = corDe(estado.eu.apelido);

  // Quem veio por conversa secreta vê só a conversa: nada de salas
  // abertas, nem de quem está por aqui — e ninguém o vê na presença.
  $('tela-app').classList.toggle('modo-reservado', !!estado.eu.reservado);

  await carregarSalas();
  desenharSalas();
  ouvirMensagens();
  if (!estado.eu.reservado) ouvirPresenca();

  // Veio por um link (conversa secreta ou convite)? Abre direto nela.
  let pedida = estado.abrirPrimeiro;
  let primeira = pedida || estado.salas[0]?.id || 'geral';
  estado.abrirPrimeiro = null;
  if (estado.convite && !estado.eu.reservado) {
    pedida = await entrarPorConvite(estado.convite);
    primeira = pedida || primeira;
    estado.convite = null;
    guardar(CHAVE_CONVITE, null);
  }
  await abrirSala(primeira);
  // No telefone (e no iPad em pé), sem sala pedida, começa pela lista de
  // salas — a página inicial do app — e não dentro da Geral.
  if (!pedida && matchMedia('(max-width: 760px)').matches) {
    $('tela-app').dataset.vista = 'salas';
  }
  if (estado.avisoGuardado) { avisar(estado.avisoGuardado); estado.avisoGuardado = ''; }

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
  $('botao-nova-sala').addEventListener('click', criarSala);
  $('botao-som').addEventListener('click', alternarSom);
  $('opcao-membros').addEventListener('click', abrirMembros);
  $('opcao-limpar').addEventListener('click', limparMinhaTela);
  $('opcao-apagar-tudo').addEventListener('click', apagarTodasAsMensagens);
  $('botao-fechar-membros').addEventListener('click', () => $('painel-membros').close());
  if (estado.eu.admin) {
    $('botao-admin').hidden = false;
    $('botao-secreta').hidden = false;
    $('botao-admin').addEventListener('click', abrirPortaria);
    $('botao-secreta').addEventListener('click', criarConversaSecreta);
    $('botao-chat').addEventListener('click', alternarChat);
    $('botao-senha').addEventListener('click', definirSenha);
    $('botao-fechar-painel').addEventListener('click', () => $('painel-admin').close());
    desenharChaveChat();
    carregarPessoas();
  }
  mostrarBotaoSom();
  for (const evento of ['pointerdown', 'keydown']) {
    document.addEventListener(evento, destravarSom, { passive: true });
  }
  $('botao-opcoes').addEventListener('click', abrirOpcoes);
  $('opcao-convidar').addEventListener('click', convidar);
  $('opcao-novo-link').addEventListener('click', gerarLinkNovo);
  $('opcao-sair').addEventListener('click', sairDaSala);
  $('opcao-apagar').addEventListener('click', apagarSala);
  document.addEventListener('click', ev => {
    if (!$('menu-sala').contains(ev.target)) fecharOpcoes();
  });

  // Link de convite aberto com o app já aberto, na mesma aba.
  addEventListener('hashchange', async () => {
    const link = lerLinkDoEndereco();
    if (!link) return;
    let salaId = null;
    if (link.tipo === 'secreta') {
      estado.secreta = link.codigo;
      if (await usarConversaSecreta()) {
        await recarregarSalas();
        salaId = estado.abrirPrimeiro;
        estado.abrirPrimeiro = null;
      } else {
        avisar(estado.avisoGuardado);
        estado.avisoGuardado = '';
      }
    } else {
      salaId = await entrarPorConvite(link.codigo);
    }
    if (salaId) await abrirSala(salaId);
  });

  // Ao voltar para a aba, a conexão pode ter caído em segundo plano.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    estado.carregadas.delete(estado.salaAtual);
    estado.mensagens.delete(estado.salaAtual);
    // Pode ter chegado sala nova (convite aceito, conversa a sós) ou ido
    // embora alguma (apagada pelo dono).
    recarregarSalas().then(() => {
      const ainda = estado.salas.some(s => s.id === estado.salaAtual);
      abrirSala(ainda ? estado.salaAtual : (estado.salas[0]?.id || 'geral'), { mostrar: false });
    });
  });
}

async function comecar() {
  const config = lerConfig();
  if (!config) { telaConfig(); return; }
  // O convite fica guardado até ser usado: quem chega por um link
  // pode ter de escolher o apelido (ou esperar a portaria) antes.
  const link = lerLinkDoEndereco();
  if (link?.tipo === 'convite') guardar(CHAVE_CONVITE, link.codigo);
  if (link?.tipo === 'secreta') guardar(CHAVE_SECRETA, link.codigo);
  estado.convite = lembrar(CHAVE_CONVITE, null);
  estado.secreta = lembrar(CHAVE_SECRETA, null);
  $('botao-sou-admin').addEventListener('click', entrarComoAdmin);

  try {
    const idUsuario = await conectar(config);
    const perfil = await buscarPerfil(idUsuario);
    if (!perfil) { telaEntrada(idUsuario); return; }
    await seguir(perfil);
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
