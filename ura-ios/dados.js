/* ————————————————————————————————————————————————————————————
   Guarda a base das IOs no aparelho (IndexedDB) e nada mais.
   O conteúdo nunca sai daqui: não há envio para servidor nenhum.
   ———————————————————————————————————————————————————————————— */
'use strict';

const Dados = (() => {
  const BANCO = 'ura-ios';
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

  /* ——— a base das instruções ——— */

  function validar(base) {
    if (!base || typeof base !== 'object') throw new Error('O arquivo não tem o formato esperado.');
    if (!Array.isArray(base.ios) || !base.ios.length) throw new Error('O arquivo não traz nenhuma instrução.');
    const falta = ['codigo', 'titulo'].filter(c => !(c in base.ios[0]));
    if (falta.length) throw new Error('Faltam campos nas instruções: ' + falta.join(', '));
    return {
      versao: base.versao || 1,
      gerado: base.gerado || '',
      ios: base.ios,
      siglas: base.siglas || [],
      perguntas: base.perguntas || []
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

  return {
    lerBase: () => ler('base'),
    importarArquivo,
    removerBase: () => apagar('base'),
    lerProgresso: () => ler('progresso').then(p => p || { acertos: {}, erros: {} }),
    gravarProgresso: p => gravar('progresso', p),
    lerFeitos: () => ler('feitos').then(f => f || {}),
    gravarFeitos: f => gravar('feitos', f)
  };
})();
