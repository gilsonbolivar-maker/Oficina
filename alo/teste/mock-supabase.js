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
window.__mock = { mensagens, get perfil() { return perfil; }, canais: [] };

function builder(resolver) {
  const b = {};
  for (const m of ['select','eq','order','limit','insert','delete','update']) {
    b[m] = (...args) => { b['_' + m] = args; return b; };
  }
  b.maybeSingle = () => resolver(b, 'maybeSingle');
  b.single = () => resolver(b, 'single');
  b.then = (ok, err) => Promise.resolve(resolver(b, 'lista')).then(ok, err);
  return b;
}

export function createClient(url, key) {
  if (!url || !key) throw new Error('faltou config');
  return {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      signInAnonymously: async () => ({ data: {}, error: null }),
      getUser: async () => ({ data: { user: { id: 'eu-123' } } }),
      signOut: async () => ({}),
    },
    from(tabela) {
      return builder((b, modo) => {
        if (tabela === 'salas') return { data: salas, error: null };
        if (tabela === 'perfis') {
          if (b._insert) {
            const { id, apelido } = b._insert[0];
            if (apelido.toLowerCase() === 'maria') return { data: null, error: { code: '23505', message: 'duplicado' } };
            gravarPerfil({ id, apelido });
            return { data: perfil, error: null };
          }
          if (b._update) {
            const { apelido } = b._update[0];
            if (apelido.toLowerCase() === 'maria') return { data: null, error: { code: '23505', message: 'duplicado' } };
            gravarPerfil({ id: perfil.id, apelido });
            return { data: perfil, error: null };
          }
          if (b._delete) { gravarPerfil(null); return { data: null, error: null }; }
          return { data: perfil, error: null };
        }
        if (tabela === 'mensagens') {
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
        presenceState: () => ({ 'eu-123': [{ apelido: perfil?.apelido, sala: c.rastreado?.sala }] }),
      };
      window.__mock.canais.push(c);
      return c;
    },
  };
}
