// Cliente Supabase falso: reproduz só o que o app.js usa, para testar
// a lógica da interface sem um projeto real.
const salas = [
  { id: 'geral', titulo: 'Geral', subtitulo: 'Quem está por aqui', ordem: 1 },
  { id: 'recados', titulo: 'Recados', subtitulo: 'Deixe um recado', ordem: 2 },
  { id: 'cafe', titulo: 'Café', subtitulo: 'Papo leve, sem pressa', ordem: 3 },
];
const mensagens = [
  { id: 1, sala_id: 'geral', autor_id: 'outro', autor_apelido: 'Maria <b>teste</b>',
    corpo: 'Bom dia! <img src=x onerror=alert(1)>', criado_em: new Date(Date.now() - 86400000).toISOString() },
  { id: 2, sala_id: 'geral', autor_id: 'outro', autor_apelido: 'Maria <b>teste</b>',
    corpo: 'Alguém por aí?', criado_em: new Date(Date.now() - 3600000).toISOString() },
  { id: 3, sala_id: 'recados', autor_id: 'outro', autor_apelido: 'João',
    corpo: 'Passei aqui.', criado_em: new Date().toISOString() },
];
let proximoId = 100;
// O banco de verdade sobrevive ao recarregar; aqui o localStorage faz esse papel.
const GUARDA = 'mock:perfil';
let perfil = JSON.parse(localStorage.getItem(GUARDA) || 'null');
const gravarPerfil = p => { perfil = p; p ? localStorage.setItem(GUARDA, JSON.stringify(p)) : localStorage.removeItem(GUARDA); };
// Salas privadas que existem no "banco" mas a pessoa só vê depois de
// entrar pelo convite — como faria a regra de RLS de verdade.
const CONVITE_TURMA = 'b'.repeat(64);
const escondidas = [
  { id: 'turma', titulo: 'Turma', subtitulo: '', ordem: 0, tipo: 'privada',
    dono_id: 'outro', convite: CONVITE_TURMA,
    membros: [{ perfil_id: 'outro', perfis: { apelido: 'Ana' } }] },
  // Conversa secreta que a "Ana" (admin) gerou; o link vale uma vez.
  { id: 'secreta-ana', titulo: 'Conversa', subtitulo: '', ordem: 0, tipo: 'individual',
    dono_id: 'outro', convite: 'd'.repeat(64),
    membros: [{ perfil_id: 'outro', perfis: { apelido: 'Ana' } }] },
];
let codigos = 0;
// window.__cfg (posto antes do app carregar) diz como a portaria trata
// quem chega: { situacaoNova, adminNovo, pessoas }.
const cfg = window.__cfg || {};
const pessoas = (cfg.pessoas || []).map(p => ({ ...p }));
let chatAberto = !cfg.chatFechado;
window.__mock = { mensagens, salas, escondidas, CONVITE_TURMA, pessoas,
  get perfil() { return perfil; }, canais: [], presentes: [], rpcs: [],
  // Faz o papel da administração mudando a situação desta pessoa.
  mudarSituacao(situacao) {
    gravarPerfil({ ...perfil, situacao });
    avisarTabela('perfis', { ...perfil });
  },
  // Faz o papel da administração ligando e desligando o chat.
  mudarChat(aberto) {
    chatAberto = aberto;
    avisarTabela('ajustes', { id: 1, aberto });
  },
  get chatAberto() { return chatAberto; },
};

const eu = () => ({ perfil_id: 'eu-123', perfis: { apelido: perfil?.apelido } });

function avisarTabela(tabela, linha) {
  for (const c of window.__mock.canais.filter(c => c.nome === 'alo-perfis')) {
    for (const o of c.ouvintes.filter(o => o.filtro?.table === tabela)) {
      o.cb({ eventType: 'UPDATE', new: linha });
    }
  }
}

function builder(resolver) {
  const b = {};
  for (const m of ['select','eq','order','limit','insert','delete','update']) {
    b[m] = (...args) => { b['_' + m] = args; return b; };
  }
  b._eqs = [];
  const eq = b.eq;
  b.eq = (...args) => { b._eqs.push(args); return eq(...args); };
  b.maybeSingle = () => resolver(b, 'maybeSingle');
  b.single = () => resolver(b, 'single');
  b.then = (ok, err) => Promise.resolve(resolver(b, 'lista')).then(ok, err);
  return b;
}

// window.__falha diz qual passo do Supabase está faltando, para testar
// o diagnóstico do assistente sem um projeto real.
export function createClient(url, key) {
  if (!url || !key) throw new Error('faltou config');
  return {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInAnonymously: async () => (window.__falha === 'anonimo'
        ? { data: null, error: { code: 'anonymous_provider_disabled',
            message: 'Anonymous sign-ins are disabled' } }
        : { data: {}, error: null }),
      getUser: async () => ({ data: { user: { id: 'eu-123' } } }),
      signOut: async () => ({}),
    },
    from(tabela) {
      return builder((b, modo) => {
        if (tabela === 'salas') {
          if (window.__falha === 'tabelas') {
            return { data: null, error: { code: '42P01',
              message: 'relation "public.salas" does not exist' } };
          }
          if (b._delete) {
            const i = salas.findIndex(s => s.id === b._eqs[0]?.[1]);
            if (i >= 0) salas.splice(i, 1);
            return { data: null, error: null };
          }
          // Quem veio por conversa secreta não enxerga as salas abertas.
          const visiveis = perfil?.reservado ? salas.filter(s => s.tipo && s.tipo !== 'publica') : salas;
          return { data: visiveis, error: null };
        }
        if (tabela === 'ajustes') return { data: { aberto: chatAberto }, error: null };
        if (tabela === 'membros' && b._delete) {
          const i = salas.findIndex(s => s.id === b._eqs[0]?.[1]);
          if (i >= 0) salas.splice(i, 1);   // quem sai deixa de enxergar a sala
          return { data: null, error: null };
        }
        if (tabela === 'perfis') {
          if (b._insert) {
            const { id, apelido } = b._insert[0];
            if (apelido.toLowerCase() === 'maria') return { data: null, error: { code: '23505', message: 'duplicado' } };
            gravarPerfil({ id, apelido, situacao: cfg.situacaoNova || 'aprovado', admin: !!cfg.adminNovo });
            return { data: perfil, error: null };
          }
          if (b._update) {
            const { apelido } = b._update[0];
            if (apelido.toLowerCase() === 'maria') return { data: null, error: { code: '23505', message: 'duplicado' } };
            gravarPerfil({ ...perfil, apelido });
            return { data: perfil, error: null };
          }
          if (modo === 'lista') return { data: [perfil, ...pessoas], error: null };
          if (b._delete) { gravarPerfil(null); return { data: null, error: null }; }
          return { data: perfil, error: null };
        }
        if (tabela === 'mensagens') {
          if (b._delete && b._eqs[0]?.[0] === 'sala_id') {
            const sala = b._eqs[0][1];
            const apagadas = mensagens.filter(m => m.sala_id === sala).map(m => ({ id: m.id }));
            for (let i = mensagens.length - 1; i >= 0; i -= 1) {
              if (mensagens[i].sala_id === sala) mensagens.splice(i, 1);
            }
            return { data: apagadas, error: null };
          }
          if (b._delete) {
            const id = b._eqs[0]?.[1];
            const i = mensagens.findIndex(m => m.id === id);
            if (i >= 0) mensagens.splice(i, 1);
            return { data: i >= 0 ? [{ id }] : [], error: null };
          }
          if (b._insert) {
            const { sala_id, corpo } = b._insert[0];
            if (corpo === 'RECUSAR') return { data: null, error: { message: 'Calma — um recado de cada vez.' } };
            const nova = { id: proximoId++, sala_id, autor_id: 'eu-123',
              autor_apelido: perfil.apelido, corpo, criado_em: new Date().toISOString() };
            mensagens.push(nova);
            return { data: nova, error: null };
          }
          const sala = b._eq?.[1];
          return { data: mensagens.filter(m => m.sala_id === sala).slice().reverse(), error: null };
        }
        return { data: null, error: null };
      });
    },
    async rpc(nome, args) {
      window.__mock.rpcs.push([nome, args]);
      if (nome === 'criar_sala') {
        const id = 'priv-' + (salas.length + 1);
        salas.push({ id, titulo: args.p_titulo, subtitulo: '', ordem: 0, tipo: 'privada',
          dono_id: 'eu-123', convite: String(++codigos).padStart(64, 'a'), membros: [eu()] });
        return { data: id, error: null };
      }
      if (nome === 'abrir_fechar_chat') {
        chatAberto = args.p_aberto;
        return { data: null, error: null };
      }
      if (nome === 'remover_membro') {
        const sala = salas.find(s => s.id === args.p_sala);
        sala.membros = sala.membros.filter(m => m.perfil_id !== args.p_perfil);
        sala.convite = String(++codigos).padStart(64, 'e');
        return { data: null, error: null };
      }
      if (nome === 'criar_conversa_secreta') {
        const id = 'secreta-' + (salas.length + 1);
        salas.push({ id, titulo: 'Conversa', subtitulo: '', ordem: 0, tipo: 'individual',
          dono_id: 'eu-123', convite: String(++codigos).padStart(64, 'f'), membros: [eu()] });
        return { data: id, error: null };
      }
      if (nome === 'aceitar_conversa_secreta') {
        const sala = [...salas, ...escondidas].find(s => s.tipo === 'individual' && s.convite === args.p_codigo);
        if (!sala) return { data: null, error: { message: 'Esse convite já foi usado ou não vale mais.' } };
        sala.membros.push(eu());
        sala.convite = null;
        if (!salas.includes(sala)) salas.push(sala);
        if (perfil.situacao === 'pendente') gravarPerfil({ ...perfil, situacao: 'aprovado', reservado: true });
        return { data: sala.id, error: null };
      }
      if (nome === 'decidir_acesso') {
        const pessoa = pessoas.find(p => p.id === args.p_perfil);
        if (!pessoa || pessoa.admin) return { data: null, error: { message: 'Essa pessoa não existe ou é da administração.' } };
        pessoa.situacao = args.p_situacao;
        return { data: null, error: null };
      }
      if (nome === 'trocar_convite') {
        const sala = salas.find(s => s.id === args.p_sala);
        sala.convite = String(++codigos).padStart(64, 'c');
        return { data: sala.convite, error: null };
      }
      if (nome === 'entrar_por_convite') {
        const sala = escondidas.find(s => s.convite === args.p_codigo);
        if (!sala) return { data: null, error: { message: 'Esse convite não vale mais.' } };
        if (!salas.includes(sala)) { sala.membros.push(eu()); salas.push(sala); }
        return { data: sala.id, error: null };
      }
      if (nome === 'abrir_conversa') {
        const id = 'dm:eu-123:' + args.p_outro;
        if (!salas.some(s => s.id === id)) {
          const outro = window.__mock.presentes.find(p => p.id === args.p_outro);
          salas.push({ id, titulo: 'Conversa', subtitulo: '', ordem: 0, tipo: 'individual',
            membros: [eu(), { perfil_id: args.p_outro, perfis: { apelido: outro?.apelido } }] });
        }
        return { data: id, error: null };
      }
      return { data: null, error: { message: 'rpc desconhecida' } };
    },
    channel(nome, opts) {
      const c = {
        nome, opts, ouvintes: [],
        on(tipo, filtro, cb) { c.ouvintes.push({ tipo, filtro, cb }); return c; },
        subscribe(cb) { setTimeout(() => cb && cb('SUBSCRIBED'), 10); return c; },
        track: async (p) => {
          c.rastreado = p;
          // O Realtime de verdade reemite 'sync' a cada mudança de presença.
          for (const o of c.ouvintes) if (o.tipo === 'presence') o.cb();
          return 'ok';
        },
        presenceState: () => ({
          'eu-123': [{ apelido: perfil?.apelido, sala: c.rastreado?.sala }],
          ...Object.fromEntries(window.__mock.presentes.map(p => [p.id, [p]])),
        }),
      };
      window.__mock.canais.push(c);
      return c;
    },
  };
}
