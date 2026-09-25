/* ————————————————————————————————————————————————————————————
   Guarda a base de contatos no aparelho (IndexedDB) e nada mais.
   O app publicado vem vazio: a lista é carregada por você, aqui,
   e nunca sai deste aparelho.
   ———————————————————————————————————————————————————————————— */
'use strict';

const Dados = (() => {
  const BANCO = 'agenda-telefonica';
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
  const apagar = chave => transacao('readwrite', loja => loja.delete(chave));

  /* ——— a base de contatos ——— */

  function validar(base) {
    if (!base || typeof base !== 'object') throw new Error('O arquivo não tem o formato esperado.');
    if (!Array.isArray(base.contatos) || !base.contatos.length) throw new Error('O arquivo não traz nenhum contato.');
    if (!Array.isArray(base.areas) || !Array.isArray(base.unidades)) throw new Error('Faltam as áreas ou as unidades no arquivo.');

    const c = base.contatos[0];
    if (!Array.isArray(c) || c.length < 6) {
      throw new Error('Os contatos não estão no formato [matrícula, nome, área, unidade, ramal, telefones].');
    }
    return {
      fonte: base.fonte || { titulo: 'Base carregada', data: '', total: base.contatos.length },
      unidades: base.unidades,
      areas: base.areas,
      contatos: base.contatos
    };
  }

  async function importarArquivo(arquivo) {
    const texto = await arquivo.text();
    let bruto;
    try {
      bruto = JSON.parse(texto);
    } catch (e) {
      throw new Error('Não consegui ler o arquivo: ele não é um JSON válido.');
    }
    const base = validar(bruto);
    base.importadoEm = new Date().toISOString();
    base.nomeArquivo = arquivo.name;
    await gravar('base', base);
    return base;
  }

  /* ——— o que você acrescenta à mão ———
     Fica numa chave separada da base: trocar ou apagar a lista importada
     não leva junto os contatos e números que você mesmo criou. */

  const EXTRAS_VAZIO = { novos: [], numeros: {}, edicoes: {} };

  function lerExtras() {
    return ler('extras').then(e => ({
      novos: (e && e.novos) || [],
      numeros: (e && e.numeros) || {},
      edicoes: (e && e.edicoes) || {}
    })).catch(() => EXTRAS_VAZIO);
  }

  return {
    lerBase: () => ler('base'),
    importarArquivo,
    removerBase: () => apagar('base'),
    baseVazia: () => gravar('base', {
      fonte: { titulo: 'Agenda própria', data: '', total: 0 },
      unidades: ['Sem unidade'],
      areas: [],
      contatos: [],
      importadoEm: new Date().toISOString(),
      nomeArquivo: ''
    }).then(() => ler('base')),
    lerExtras,
    gravarExtras: ex => gravar('extras', ex),
    removerExtras: () => apagar('extras')
  };
})();
