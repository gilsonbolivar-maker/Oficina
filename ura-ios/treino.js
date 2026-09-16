/* ————————————————————————————————————————————————————————————
   Treino: perguntas montadas a partir das próprias IOs.
   Toda pergunta mostra a instrução de onde a resposta saiu.
   ———————————————————————————————————————————————————————————— */
'use strict';

const Treino = (() => {
  const TAMANHO = 12;        // perguntas por rodada
  let rodada = null;

  const NOMES = {
    passo: 'Passos do procedimento',
    ordem: 'Ordem dos passos',
    sigla: 'Equipamentos e siglas',
    objetivo: 'Objetivo da IO',
    documento: 'Qual IO trata do quê',
    responsabilidade: 'Responsabilidades'
  };

  /** Perguntas disponíveis dentro do escopo escolhido. */
  function disponiveis(base, escopo) {
    return base.perguntas.filter(q =>
      (!escopo.io || q.fonte.io === escopo.io) &&
      (!escopo.tipo || q.tipo === escopo.tipo) &&
      (!escopo.area || (base.ios.find(d => d.codigo === q.fonte.io) || {}).area === escopo.area));
  }

  function embaralhar(lista) {
    const c = lista.slice();
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [c[i], c[j]] = [c[j], c[i]];
    }
    return c;
  }

  function comecar(base, escopo) {
    const fonte = disponiveis(base, escopo);
    if (!fonte.length) return null;
    rodada = {
      escopo,
      fila: embaralhar(fonte).slice(0, TAMANHO),
      indice: 0, acertos: 0, erros: 0,
      total: Math.min(TAMANHO, fonte.length),
      errouAgora: false
    };
    return rodada;
  }

  const atual = () => rodada && rodada.fila[rodada.indice];

  /** Responde a pergunta atual. Errada volta ao fim da fila, para rever. */
  function responder(escolha) {
    const q = atual();
    if (!q) return null;
    const certo = escolha === q.correta;
    if (certo) rodada.acertos++;
    else { rodada.erros++; rodada.fila.push(q); }
    rodada.errouAgora = !certo;
    return { certo, correta: q.correta, fonte: q.fonte };
  }

  function avancar() {
    if (!rodada) return false;
    rodada.indice++;
    return rodada.indice < rodada.fila.length;
  }

  /** Guarda acertos e erros por IO, para mostrar onde apertar o estudo. */
  function anotar(progresso, q, certo) {
    const chave = q.fonte.io;
    const lado = certo ? progresso.acertos : progresso.erros;
    lado[chave] = (lado[chave] || 0) + 1;
    return progresso;
  }

  return { comecar, atual, responder, avancar, anotar, disponiveis, NOMES,
           get rodada() { return rodada; } };
})();
