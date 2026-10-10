/* ————————————————————————————————————————————————————————————
   Gerador de PDF em uma página de código, sem biblioteca nenhuma.
   É o que permite baixar o relatório do turno no modo avião: não há
   nada para buscar na rede. Usa Helvetica, que já vem em todo leitor
   de PDF, e a codificação WinAnsi, que cobre o português.
   ———————————————————————————————————————————————————————————— */
'use strict';

const PDF = (() => {

  // Largura de cada caractere (milésimos do corpo), do ASCII 32 ao 126.
  const LARG_N = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
    1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
    333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
    556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const LARG_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
    975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
    333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
    611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

  // O que não existe no WinAnsi vira algo que existe.
  const TROCAS = [
    [/[→➡]/g, '->'], [/[←]/g, '<-'],
    [/[‘’]/g, "'"], [/[“”]/g, '"'],
    [/[–—]/g, '-'], [/…/g, '...'],
    [/ /g, ' '], [/•/g, '·'], [/Σ/g, 'Total'],
    [/³/g, '3'], [/²/g, '2'],
    [/[₀-₉]/g, c => String(c.charCodeAt(0) - 0x2080)],
    [/👍/g, 'SIM'], [/👎/g, 'NAO'],
    [/[▶⏸⏹]/g, ''],
    [/[\u{1F000}-\u{1FAFF}☀-➿️]/gu, '']
  ];

  function limpar(txt) {
    let s = String(txt == null ? '' : txt);
    TROCAS.forEach(([de, para]) => { s = s.replace(de, para); });
    // Fora do Latin-1 não há glifo: some, para não virar caixa preta.
    return s.replace(/[^\u0000-ÿ]/g, '');
  }

  function largura(txt, corpo, negrito) {
    const tab = negrito ? LARG_B : LARG_N;
    let soma = 0;
    for (const ch of txt) {
      const c = ch.charCodeAt(0);
      soma += (c >= 32 && c <= 126) ? tab[c - 32] : 556;
    }
    return soma * corpo / 1000;
  }

  /** Quebra o texto na largura dada, respeitando as palavras. */
  function quebrar(txt, max, corpo, negrito) {
    const linhas = [];
    String(txt).split('\n').forEach(paragrafo => {
      let atual = '';
      paragrafo.split(' ').forEach(palavra => {
        const tentativa = atual ? atual + ' ' + palavra : palavra;
        if (largura(tentativa, corpo, negrito) <= max || !atual) atual = tentativa;
        else { linhas.push(atual); atual = palavra; }
      });
      linhas.push(atual);
    });
    return linhas;
  }

  function escapar(txt) {
    return txt.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  /**
   * Monta o PDF. `blocos` é uma lista de:
   *   { tipo: 'titulo' | 'sub' | 'h1' | 'h2' | 'p' | 'pequeno', texto }
   *   { tipo: 'tabela', colunas: [largura em pt], cabecalho: [], linhas: [[]] }
   *   { tipo: 'linha' }  { tipo: 'espaco', altura }
   */
  function gerar(blocos, rodapeTexto) {
    const L = 595.28, A = 841.89;          // A4 em pontos
    const MARGEM = 48, TOPO = A - 54, BASE = 64;
    const UTIL = L - 2 * MARGEM;

    const paginas = [];
    let fluxo = [], y = TOPO;

    const ESTILOS = {
      titulo:  { corpo: 20, negrito: true,  depois: 3,  cor: '0.04 0.07 0.13' },
      sub:     { corpo: 10, negrito: false, depois: 12, cor: '0.35 0.42 0.52' },
      h1:      { corpo: 13, negrito: true,  antes: 14, depois: 5, cor: '0.04 0.07 0.13' },
      h2:      { corpo: 10.5, negrito: true, antes: 9, depois: 3, cor: '0.71 0.45 0.00' },
      p:       { corpo: 9.5, negrito: false, depois: 4, cor: '0.09 0.13 0.18' },
      pequeno: { corpo: 8.3, negrito: false, depois: 3, cor: '0.35 0.42 0.52' }
    };

    function novaPagina() { paginas.push(fluxo); fluxo = []; y = TOPO; }
    function garantir(altura) { if (y - altura < BASE) novaPagina(); }

    function texto(str, x, corpo, negrito, cor) {
      fluxo.push('BT /' + (negrito ? 'F2' : 'F1') + ' ' + corpo + ' Tf ' +
        cor + ' rg 1 0 0 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Tm (' +
        escapar(str) + ') Tj ET');
    }

    function retangulo(x, yy, larg, alt, cor) {
      fluxo.push(cor + ' rg ' + x.toFixed(2) + ' ' + yy.toFixed(2) + ' ' +
        larg.toFixed(2) + ' ' + alt.toFixed(2) + ' re f');
    }

    blocos.forEach(b => {
      if (b.tipo === 'espaco') { y -= (b.altura || 8); return; }

      if (b.tipo === 'linha') {
        garantir(10);
        retangulo(MARGEM, y, UTIL, 0.7, '0.79 0.83 0.90');
        y -= 10;
        return;
      }

      if (b.tipo === 'tabela') {
        const corpo = 8.4, alturaLinha = 13, respiro = 4;
        const xs = [];
        let acc = MARGEM;
        b.colunas.forEach(c => { xs.push(acc); acc += c; });

        const temCabecalho = b.cabecalho.some(c => String(c).trim());
        const desenharCabecalho = () => {
          if (!temCabecalho) return;
          garantir(alturaLinha + 6);
          retangulo(MARGEM, y - 4, UTIL, alturaLinha + 2, '0.04 0.07 0.13');
          b.cabecalho.forEach((c, i) => {
            texto(limpar(c), xs[i] + respiro, corpo, true, '1 1 1');
          });
          y -= alturaLinha + 5;
        };
        desenharCabecalho();

        const PASSO = corpo + 2.6;
        b.linhas.forEach((linha, n) => {
          const celulas = linha.map((c, i) =>
            quebrar(limpar(c), b.colunas[i] - 2 * respiro, corpo, i === 0));
          const nLinhas = Math.max.apply(null, celulas.map(c => c.length));
          const altura = nLinhas * PASSO + 8;
          if (y - altura < BASE) { novaPagina(); desenharCabecalho(); }

          const base = y;                              // base da 1ª linha
          const ultimaBase = base - (nLinhas - 1) * PASSO;
          const filete = ultimaBase - 4.5;             // entre uma linha e a outra
          if (n % 2 === 1) {
            retangulo(MARGEM, filete, UTIL, (nLinhas - 1) * PASSO + 13.5, '0.95 0.96 0.98');
          }
          celulas.forEach((linhasCel, i) => {
            y = base;
            linhasCel.forEach(ln => {
              texto(ln, xs[i] + respiro, corpo, i === 0, '0.09 0.13 0.18');
              y -= PASSO;
            });
          });
          retangulo(MARGEM, filete, UTIL, 0.4, '0.86 0.89 0.94');
          y = ultimaBase - PASSO - 3;
        });
        y -= 6;
        return;
      }

      const e = ESTILOS[b.tipo] || ESTILOS.p;
      y -= (e.antes || 0);
      quebrar(limpar(b.texto), UTIL, e.corpo, e.negrito).forEach(ln => {
        garantir(e.corpo + 4);
        texto(ln, MARGEM, e.corpo, e.negrito, e.cor);
        y -= e.corpo + 3.5;
      });
      y -= (e.depois || 0);
    });
    paginas.push(fluxo);

    // ——— monta o arquivo ———
    const total = paginas.length;
    const conteudos = paginas.map((p, i) => {
      const rodape = 'BT /F1 7.5 Tf 0.45 0.52 0.62 rg 1 0 0 1 ' + MARGEM + ' 40 Tm (' +
        escapar(limpar(rodapeTexto || '')) + ') Tj ET' +
        'BT /F1 7.5 Tf 0.45 0.52 0.62 rg 1 0 0 1 ' +
        (L - MARGEM - largura('Pagina ' + (i + 1) + ' de ' + total, 7.5, false)).toFixed(2) +
        ' 40 Tm (Pagina ' + (i + 1) + ' de ' + total + ') Tj ET' +
        '0.79 0.83 0.90 rg ' + MARGEM + ' 52 ' + UTIL.toFixed(2) + ' 0.4 re f';
      return p.join('\n') + '\n' + rodape;
    });

    const objetos = [];
    const filhos = conteudos.map((_, i) => (4 + i * 2) + ' 0 R').join(' ');
    objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objetos[2] = '<< /Type /Pages /Kids [' + filhos + '] /Count ' + total + ' >>';
    objetos[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    conteudos.forEach((c, i) => {
      objetos[4 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + L + ' ' + A + ']' +
        ' /Resources << /Font << /F1 3 0 R /F2 ' + (4 + total * 2) + ' 0 R >> >>' +
        ' /Contents ' + (5 + i * 2) + ' 0 R >>';
      objetos[5 + i * 2] = { fluxo: c };
    });
    objetos[4 + total * 2] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    let saida = '%PDF-1.4\n';
    const posicoes = [];
    for (let i = 1; i < objetos.length; i++) {
      const o = objetos[i];
      if (o === undefined) continue;
      posicoes[i] = saida.length;
      saida += i + ' 0 obj\n';
      if (typeof o === 'string') saida += o + '\nendobj\n';
      else saida += '<< /Length ' + o.fluxo.length + ' >>\nstream\n' + o.fluxo + '\nendstream\nendobj\n';
    }
    const inicioXref = saida.length;
    const maior = objetos.length;
    saida += 'xref\n0 ' + maior + '\n0000000000 65535 f \n';
    for (let i = 1; i < maior; i++) {
      saida += (posicoes[i] === undefined ? 0 : posicoes[i]).toString().padStart(10, '0') + ' 00000 n \n';
    }
    saida += 'trailer\n<< /Size ' + maior + ' /Root 1 0 R >>\nstartxref\n' + inicioXref + '\n%%EOF';

    // Latin-1: cada caractere vira um byte, que é o que o WinAnsi espera.
    const bytes = new Uint8Array(saida.length);
    for (let i = 0; i < saida.length; i++) bytes[i] = saida.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: 'application/pdf' });
  }

  return { gerar };
})();
