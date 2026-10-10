/* ————————————————————————————————————————————————————————————
   Guarda os turnos no aparelho (IndexedDB) e nada mais.
   O relatório nunca sai daqui: não há envio para servidor nenhum.
   ———————————————————————————————————————————————————————————— */
'use strict';

const Dados = (() => {
  const BANCO = 'britagem';
  const LOJA = 'guardado';
  let conexao = null;

  function abrir() {
    if (conexao) return Promise.resolve(conexao);
    return new Promise((ok, erro) => {
      const req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(LOJA);
      req.onsuccess = () => { conexao = req.result; ok(conexao); };
      req.onerror = () => erro(req.error);
    });
  }

  function transacao(modo, tarefa) {
    return abrir().then(db => new Promise((ok, erro) => {
      const tr = db.transaction(LOJA, modo);
      const req = tarefa(tr.objectStore(LOJA));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => erro(req.error);
    }));
  }

  const ler = chave => transacao('readonly', loja => loja.get(chave));
  const gravar = (chave, valor) => transacao('readwrite', loja => loja.put(valor, chave));

  return {
    lerTurnos: () => ler('turnos').then(t => Array.isArray(t) ? t : []).catch(() => []),
    gravarTurnos: turnos => gravar('turnos', turnos),
    lerPreferencias: () => ler('prefs').then(p => p || {}).catch(() => ({})),
    gravarPreferencias: p => gravar('prefs', p)
  };
})();
