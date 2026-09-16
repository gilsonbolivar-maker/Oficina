/* ————————————————————————————————————————————————————————————
   Busca: acha o trecho e mostra de onde ele veio.
   Não reescreve nem resume nada — o texto exibido é o da IO.
   ———————————————————————————————————————————————————————————— */
'use strict';

const Busca = (() => {
  let unidades = [];   // tudo o que pode ser encontrado, já normalizado

  const limpar = s => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // tira acento
    .replace(/[^\w\s/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  /** Monta o índice: siglas, passos, instruções e trechos das seções. */
  function indexar(base) {
    unidades = [];
    const juntar = u => { u.busca = limpar([u.chave, u.texto, u.io, u.extra].join(' ')); unidades.push(u); };

    base.siglas.forEach(s => juntar({
      tipo: 'sigla', peso: 11, chave: s.sigla, texto: s.definicao,
      io: s.io, rotulo: s.sigla, corpo: s.definicao, fonte: s.io + ' · Definições e Siglas'
    }));

    base.ios.forEach(d => {
      juntar({
        tipo: 'io', peso: 13, chave: d.codigo, texto: d.titulo, io: d.codigo, extra: d.area,
        rotulo: d.codigo, corpo: d.titulo,
        fonte: `rev. ${d.revisao} · ${d.data} · ${d.n_paginas} páginas`
      });

      (d.procedimentos || []).forEach((pr, ip) => pr.passos.forEach(p => juntar({
        tipo: 'passo', peso: 6, chave: '', texto: p.acao + ' ' + (p.obs || ''),
        io: d.codigo, extra: d.titulo + ' ' + pr.titulo,
        rotulo: `Passo ${p.n || '–'}`, corpo: p.acao, obs: p.obs,
        fonte: `${d.codigo} · ${pr.titulo} · pág. ${pr.pagina}`,
        ir: { io: d.codigo, procedimento: ip }
      })));

      (d.secoes || []).forEach(s => {
        (s.texto || '').split(/\n(?=\s*\d{1,2}(?:\.\d{1,3})+\s)|\n{2,}/)
          .map(t => t.replace(/\s+/g, ' ').trim())
          .filter(t => t.length > 40)
          .forEach(t => juntar({
            tipo: 'trecho', peso: 3, chave: '', texto: t,
            io: d.codigo, extra: d.titulo + ' ' + s.titulo,
            rotulo: `${s.n}. ${s.titulo}`, corpo: t,
            fonte: `${d.codigo} · ${s.n}. ${s.titulo}`,
            ir: { io: d.codigo, secao: s.n }
          }));
      });
    });
    return unidades.length;
  }

  /** Pontua cada unidade: exige todos os termos e privilegia código/sigla. */
  function procurar(texto, limite = 60) {
    const termos = limpar(texto).split(' ').filter(t => t.length > 1);
    if (!termos.length) return [];
    const achados = [];
    for (const u of unidades) {
      let nota = 0, todos = true;
      for (const t of termos) {
        const pos = u.busca.indexOf(t);
        if (pos < 0) { todos = false; break; }
        nota += u.peso;
        if (limpar(u.chave) === t) nota += 40;                        // código/sigla exatos
        else if (limpar(u.chave).startsWith(t)) nota += 14;
        if (pos === 0 || u.busca[pos - 1] === ' ') nota += 3;          // início de palavra
      }
      if (!todos) continue;
      nota += Math.max(0, 6 - u.corpo.length / 260);                   // resposta curta primeiro
      if (u.tipo === 'io' && termos.every(t => u.busca.indexOf(t) >= 0)) nota += 12;  // o documento do assunto na frente
      achados.push({ u, nota });
    }
    achados.sort((a, b) => b.nota - a.nota);
    return achados.slice(0, limite).map(a => Object.assign({ nota: a.nota }, a.u));
  }

  /** Versão normalizada que mantém o mesmo comprimento do original,
      para que as posições encontradas sirvam para marcar o texto exibido. */
  const alinhar = s => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s/.-]/g, ' ');

  /** Destaca os termos no texto exibido, sem alterar o conteúdo. */
  function destacar(texto, consulta) {
    const termos = limpar(consulta).split(' ').filter(t => t.length > 1);
    if (!termos.length) return escapar(texto);
    const alvo = alinhar(texto);
    const marcas = [];
    termos.forEach(t => {
      let de = alvo.indexOf(t);
      while (de >= 0) { marcas.push([de, de + t.length]); de = alvo.indexOf(t, de + t.length); }
    });
    if (!marcas.length) return escapar(texto);
    marcas.sort((a, b) => a[0] - b[0]);
    let saida = '', fim = 0;
    for (const [a, b] of marcas) {
      if (a < fim) continue;
      saida += escapar(texto.slice(fim, a)) + '<mark>' + escapar(texto.slice(a, b)) + '</mark>';
      fim = b;
    }
    return saida + escapar(texto.slice(fim));
  }

  /** O texto vem de um PDF qualquer: nunca o injete cru no HTML. */
  const escapar = s => (s || '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  return { indexar, procurar, destacar, limpar, escapar };
})();
