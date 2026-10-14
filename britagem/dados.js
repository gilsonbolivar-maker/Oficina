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

  /* ——— configuração das áreas ———
     Vem de um arquivo que você carrega no aparelho. O repositório é
     público e as IOs têm controle de cópias, então equipamento, motivo e
     medida de cada área ficam aqui, não no código. */

  function validarConfig(bruto) {
    if (!bruto || typeof bruto !== 'object') throw new Error('O arquivo não tem o formato esperado.');
    if (!Array.isArray(bruto.areas) || !bruto.areas.length) throw new Error('O arquivo não traz nenhuma área.');
    bruto.areas.forEach((a, i) => {
      if (!a.id || !a.nome) throw new Error('A área ' + (i + 1) + ' está sem id ou nome.');
      if (!Array.isArray(a.equipamentos)) a.equipamentos = [];
      if (!Array.isArray(a.motivos)) a.motivos = [];
      if (!Array.isArray(a.medidas)) a.medidas = [];
      if (!Array.isArray(a.extras)) a.extras = [];
    });
    return { fonte: bruto.fonte || {}, areas: bruto.areas };
  }

  async function importarConfig(arquivo) {
    const texto = await arquivo.text();
    let bruto;
    try {
      bruto = JSON.parse(texto);
    } catch (e) {
      throw new Error('Não consegui ler o arquivo: ele não é um JSON válido.');
    }
    const config = validarConfig(bruto);
    config.importadoEm = new Date().toISOString();
    config.nomeArquivo = arquivo.name;
    await gravar('config', config);
    return config;
  }

  return {
    lerConfig: () => ler('config').catch(() => null),
    importarConfig,
    removerConfig: () => transacao('readwrite', loja => loja.delete('config')),
    lerTurnos: () => ler('turnos').then(t => Array.isArray(t) ? t : []).catch(() => []),
    gravarTurnos: turnos => gravar('turnos', turnos),
    lerPreferencias: () => ler('prefs').then(p => p || {}).catch(() => ({})),
    gravarPreferencias: p => gravar('prefs', p)
  };
})();
