/* ————————————————————————————————————————————————————————————
   Monta a base a partir dos PDFs das IOs, dentro do aparelho.

   Os PDFs são lidos aqui mesmo, pelo pdf.js guardado em vendor/ —
   nada vai para a internet. Cada PDF vira uma instrução: código,
   título, área, revisão, seções, procedimentos (as tabelas de passos)
   e o texto de cada página, para a busca.

   É leitura de texto, não interpretação: o que o PDF não traz como
   texto (página escaneada como imagem) não entra, e é avisado.
   ———————————————————————————————————————————————————————————— */
'use strict';

const ImportarPDF = (() => {
  let pdfjs = null;

  async function biblioteca() {
    if (pdfjs) return pdfjs;
    pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', location.href).href;
    return pdfjs;
  }

  /* ——— texto de cada página, em linhas ——— */

  /** Junta os pedaços de texto da página em linhas, de cima para baixo. */
  function linhasDaPagina(itens) {
    const pedacos = itens
      .filter(i => i.str && i.str.trim())
      .map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 }))
      .sort((a, b) => (b.y - a.y) || (a.x - b.x));

    const linhas = [];
    let atual = null;
    for (const p of pedacos) {
      if (!atual || Math.abs(atual.y - p.y) > 3) {
        atual = { y: p.y, partes: [p] };
        linhas.push(atual);
      } else {
        atual.partes.push(p);
      }
    }
    return linhas.map(l => {
      l.partes.sort((a, b) => a.x - b.x);
      let texto = '';
      let fim = null;
      for (const p of l.partes) {
        // Espaço só quando há distância entre os pedaços: o PDF às vezes
        // corta uma palavra em dois.
        if (fim !== null && p.x - fim > 1.5 && !texto.endsWith(' ')) texto += ' ';
        texto += p.s;
        fim = p.x + p.w;
      }
      return texto.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }

  /** Linha repetida em quase toda página (cabeçalho, rodapé) não é conteúdo. */
  function semCabecalhos(paginas) {
    if (paginas.length < 2) return paginas;
    const forma = l => l.replace(/\d+/g, '#').toLowerCase();
    const vezes = new Map();
    for (const linhas of paginas) {
      for (const f of new Set(linhas.map(forma))) vezes.set(f, (vezes.get(f) || 0) + 1);
    }
    const limite = Math.max(2, Math.ceil(paginas.length * 0.6));
    return paginas.map(linhas => linhas.filter(l => (vezes.get(forma(l)) || 0) < limite));
  }

  /* ——— cabeçalho da IO ——— */

  const nomeSemExtensao = n => n.replace(/\.[^.]+$/, '').trim();

  function acharCodigo(texto, arquivo) {
    const m = texto.match(/\bIO[\s_-]*([A-Z]{2,5})[\s_-]*([A-Z0-9]{1,4})[\s_-]*(\d{1,3})\b/);
    if (m) return `IO-${m[1]}-${m[2]}-${m[3]}`.toUpperCase();
    return nomeSemExtensao(arquivo).toUpperCase();
  }

  function acharArea(texto) {
    const m = texto.match(/\b([A-Z]{2,3})\s?-\s?(\d{3})\b/);
    return m ? `${m[1]}-${m[2]}` : 'SEM ÁREA';
  }

  function acharTitulo(linhas, area, arquivo) {
    // A linha com a área e um travessão costuma ser o título: "AA-000 - NOME".
    const comArea = linhas.find(l => l.includes(area) && /\s[-–]\s/.test(l) && l.length < 160);
    if (comArea) return comArea.slice(comArea.indexOf(area)).trim();
    const maiuscula = linhas.find(l => l.length > 12 && l.length < 140 && l === l.toUpperCase() && /[A-Z]{4}/.test(l));
    return maiuscula || nomeSemExtensao(arquivo);
  }

  function acharRevisao(texto) {
    const m = texto.match(/Revis[ãa]o\s*(?:n[º°o.]*)?\s*[:.-]?\s*(\d{1,3})/i);
    return m ? m[1].padStart(2, '0') : '—';
  }

  function acharData(texto) {
    const m = texto.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
    return m ? m[1] : '—';
  }

  /* ——— seções: "1 OBJETIVO", "2. APLICAÇÃO"… ——— */

  const TITULO_SECAO = /^(\d{1,2})\s*[.)-]?\s+([A-ZÀ-Ý][A-ZÀ-Ý0-9 ,/()–-]{2,70})$/;

  function secoes(todas) {
    const lista = [];
    let atual = null;
    for (const linha of todas) {
      const { texto } = linha;
      const m = texto.match(TITULO_SECAO);
      // Só aceita a próxima seção da sequência: "3 VÁLVULA" no meio de um
      // passo não vira seção se a última foi a 5.
      const esperada = lista.length + 1;
      if (m && Number(m[1]) === esperada) {
        atual = { n: m[1], titulo: m[2].trim(), linhas: [] };
        lista.push(atual);
        linha.ehTitulo = true;   // a tabela de passos termina aqui
      } else if (atual) {
        atual.linhas.push(texto);
      }
    }
    return lista.map(s => ({ n: s.n, titulo: s.titulo, texto: s.linhas.join('\n').trim() }));
  }

  /* ——— procedimentos: as tabelas de passos ——— */

  const TABELA = /^Tabela\s+\d+(?:\.\d+)*/i;
  const NUMERO = /^(\d{1,3})(?:\s*[.)\-–]?\s+(.+))?$/;
  const CABECALHO_TABELA = /^(passo|item|n[º°o]?\.?)\b.*\b(a[çc][ãa]o|descri[çc][ãa]o|atividade)/i;

  /** Recorta as tabelas de passos: do "Tabela x.y" até a próxima seção. */
  function blocosDeTabela(todas) {
    const blocos = [];
    let atual = null;
    for (const { texto, pagina, ehTitulo } of todas) {
      if (TABELA.test(texto)) {
        atual = { titulo: texto, pagina, linhas: [] };
        blocos.push(atual);
      } else if (ehTitulo) {
        atual = null;
      } else if (atual && !CABECALHO_TABELA.test(texto)) {
        atual.linhas.push(texto);
      }
    }
    return blocos;
  }

  /**
   * Separa os passos de uma tabela. O número de cada passo é a âncora; o
   * difícil é saber a que passo pertence cada linha de texto, porque o
   * número pode estar no alto da célula (Word) ou no meio dela:
   *
   *   no alto              no meio (passo de duas linhas)
   *   1 Comunicar…         1 Comunicar…
   *   2 Verificar…           Verificar…        ← linha de cima
   *     …continua          2                   ← o número sozinho
   *   3 Abrir…               …continua         ← linha de baixo
   *
   * Número sozinho numa linha só acontece quando ele está no meio. Aí as
   * linhas de cima e de baixo dele se espelham: tantas acima, tantas abaixo.
   */
  function passosDoBloco(bloco) {
    const { linhas } = bloco;
    const ancoras = [];
    let ultimo = 0;
    linhas.forEach((linha, i) => {
      const m = linha.match(NUMERO);
      if (m && Number(m[1]) > ultimo && Number(m[1]) <= ultimo + 3) {
        ancoras.push({ i, n: m[1], resto: (m[2] || '').trim() });
        ultimo = Number(m[1]);
      }
    });
    if (ancoras.length < 2) return [];

    const noMeio = ancoras.some(a => !a.resto);
    const partes = ancoras.map(() => []);

    if (!noMeio) {
      // Número no alto: o que vem antes do passo 1 ainda é o título da tabela.
      const antes = linhas.slice(0, ancoras[0].i).filter(l => l.length < 120);
      if (antes.length) bloco.titulo += ' ' + antes.join(' ');
      ancoras.forEach((a, k) => {
        const fim = k + 1 < ancoras.length ? ancoras[k + 1].i : linhas.length;
        partes[k].push(a.resto, ...linhas.slice(a.i + 1, fim));
      });
    } else {
      let livre = 0;
      ancoras.forEach((a, k) => {
        const limite = k + 1 < ancoras.length ? ancoras[k + 1].i : linhas.length;
        const acima = linhas.slice(livre, a.i);
        const ate = k + 1 < ancoras.length ? Math.min(a.i + 1 + acima.length, limite) : limite;
        partes[k].push(...acima, a.resto, ...linhas.slice(a.i + 1, ate));
        livre = ate;
      });
    }

    return ancoras.map((a, k) => ({
      n: a.n,
      acao: partes[k].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
      obs: ''
    })).filter(p => p.acao);
  }

  function procedimentos(todas) {
    return blocosDeTabela(todas)
      .map(bloco => ({ passos: passosDoBloco(bloco), titulo: bloco.titulo, pagina: bloco.pagina }))
      .filter(p => p.passos.length >= 2)
      .map(p => ({ titulo: p.titulo, pagina: p.pagina, passos: p.passos }));
  }

  /* ——— siglas da seção de definições ——— */

  function siglas(secs, codigo) {
    const sec = secs.find(s => /SIGLA|DEFINI/.test(s.titulo));
    if (!sec) return [];
    return sec.texto.split('\n')
      .map(l => l.match(/^([A-Z0-9][A-Z0-9/-]{1,15})\s*[-–:=]\s*(.{3,})$/))
      .filter(Boolean)
      .map(m => ({ sigla: m[1], definicao: m[2].trim(), io: codigo }));
  }

  /* ——— um PDF, uma instrução ——— */

  async function lerPDF(arquivo) {
    const lib = await biblioteca();
    const doc = await lib.getDocument({ data: await arquivo.arrayBuffer(), isEvalSupported: false }).promise;
    const brutas = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const pagina = await doc.getPage(n);
      brutas.push(linhasDaPagina((await pagina.getTextContent()).items));
    }
    await doc.destroy();

    const textoTodo = brutas.flat().join('\n');
    if (textoTodo.replace(/\s/g, '').length < 80) {
      throw new Error('o PDF não tem texto (parece escaneado como imagem)');
    }

    const limpas = semCabecalhos(brutas);
    const todas = limpas.flatMap((linhas, i) => linhas.map(texto => ({ texto, pagina: i + 1 })));
    const inicio = brutas.slice(0, 2).flat();
    const codigo = acharCodigo(inicio.join('\n'), arquivo.name);
    const area = acharArea(inicio.join('\n'));
    const secs = secoes(todas);
    const procs = procedimentos(todas);

    return {
      io: {
        codigo,
        titulo: acharTitulo(inicio, area, arquivo.name),
        area,
        revisao: acharRevisao(textoTodo),
        data: acharData(textoTodo),
        n_paginas: brutas.length,
        secoes: secs.filter(s => s.texto),
        procedimentos: procs,
        paginas: limpas.map((linhas, i) => ({ n: i + 1, texto: linhas.join('\n') })),
        nota: procs.length
          ? 'Passos lidos do texto do PDF: confira a ordem e o texto no documento.'
          : '',
        arquivo: arquivo.name
      },
      siglas: siglas(secs, codigo)
    };
  }

  /* ——— perguntas de treino, a partir do que foi lido ——— */

  function embaralhar(lista) {
    const c = lista.slice();
    for (let i = c.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [c[i], c[j]] = [c[j], c[i]];
    }
    return c;
  }

  const curto = t => (t.length > 160 ? t.slice(0, 157).trimEnd() + '…' : t);

  /** Pergunta com a certa e três erradas, sem repetir texto. */
  function pergunta(id, tipo, enunciado, certa, erradas, fonte) {
    const outras = [...new Set(erradas.map(curto))].filter(t => t !== curto(certa));
    if (outras.length < 3) return null;
    const alternativas = embaralhar([curto(certa), ...embaralhar(outras).slice(0, 3)]);
    return { id, tipo, enunciado, alternativas, correta: alternativas.indexOf(curto(certa)), fonte };
  }

  function perguntas(ios, todasSiglas) {
    const lista = [];
    for (const d of ios) {
      d.procedimentos.forEach((pr, ip) => {
        const acoes = pr.passos.map(p => p.acao);
        const onde = `${pr.titulo}, pág. ${pr.pagina}`;
        pr.passos.slice(0, 10).forEach((p, i) => {
          lista.push(pergunta(`${d.codigo}-p${ip}-${i}`, 'passo',
            `${pr.titulo} — qual é o passo ${p.n}?`, p.acao,
            acoes.filter((_, j) => j !== i), { io: d.codigo, onde }));
        });
        pr.passos.slice(0, 10).forEach((p, i) => {
          const seguinte = pr.passos[i + 1];
          if (!seguinte) return;
          lista.push(pergunta(`${d.codigo}-o${ip}-${i}`, 'ordem',
            `${pr.titulo} — o que vem logo depois de: “${curto(p.acao)}”?`, seguinte.acao,
            acoes.filter((_, j) => j !== i + 1 && j !== i), { io: d.codigo, onde }));
        });
      });
    }

    const definicoes = todasSiglas.map(s => s.definicao);
    todasSiglas.forEach((s, i) => lista.push(pergunta(`sigla-${i}-${s.sigla}`, 'sigla',
      `O que é ${s.sigla}?`, s.definicao, definicoes.filter(t => t !== s.definicao),
      { io: s.io, onde: 'Definições e Siglas' })));

    const objetivos = ios
      .map(d => ({ d, texto: (d.secoes.find(s => /OBJETIVO/.test(s.titulo)) || {}).texto }))
      .filter(o => o.texto);
    objetivos.forEach(({ d, texto }) => lista.push(pergunta(`${d.codigo}-objetivo`, 'objetivo',
      `Qual é o objetivo da ${d.codigo} (${d.titulo})?`, texto,
      objetivos.filter(o => o.d !== d).map(o => o.texto), { io: d.codigo, onde: 'Objetivo' })));

    return lista.filter(Boolean);
  }

  /**
   * Lê os PDFs e junta com a base que já existe: IO do mesmo código é
   * trocada pela nova; as outras ficam. `aviso(texto)` conta o andamento.
   */
  async function montar(arquivos, baseAtual, aviso = () => {}) {
    const lidas = [];
    const problemas = [];
    for (const [i, arquivo] of [...arquivos].entries()) {
      aviso(`Lendo ${i + 1} de ${arquivos.length}: ${arquivo.name}…`);
      try {
        lidas.push(await lerPDF(arquivo));
      } catch (e) {
        problemas.push(`${arquivo.name}: ${e.message || e}`);
      }
    }
    if (!lidas.length) {
      throw new Error('Nenhum PDF pôde ser lido.\n' + problemas.join('\n'));
    }

    const novos = new Set(lidas.map(l => l.io.codigo));
    const ficam = (baseAtual?.ios || []).filter(d => !novos.has(d.codigo));
    const ios = [...ficam, ...lidas.map(l => l.io)];
    const todasSiglas = [
      ...(baseAtual?.siglas || []).filter(s => !novos.has(s.io)),
      ...lidas.flatMap(l => l.siglas)
    ];
    // Perguntas que vieram de um arquivo pronto continuam; as das IOs
    // importadas agora são refeitas a partir do texto novo.
    const perguntasAntigas = (baseAtual?.perguntas || []).filter(q => !novos.has(q.fonte?.io));
    const geradas = perguntas(lidas.map(l => l.io), todasSiglas)
      .filter(q => novos.has(q.fonte.io));

    return {
      base: {
        versao: 1,
        gerado: new Date().toISOString().slice(0, 10),
        ios,
        siglas: todasSiglas,
        perguntas: [...perguntasAntigas, ...geradas],
        nomeArquivo: `${ios.length} PDFs importados`
      },
      lidas: lidas.map(l => l.io),
      problemas
    };
  }

  return { montar };
})();
