/* ————————————————————————————————————————————————————————————
   Busca: monta um índice em memória e filtra por nome, ramal,
   matrícula, área ou unidade. Roda inteiro no aparelho.
   ———————————————————————————————————————————————————————————— */
'use strict';

const Busca = (() => {

  let registros = [];
  let AREAS = [];
  let UNIDADES = [];

  // Faixa de ramal -> DDD e prefixo do PABX, conferidos na própria lista.
  const PABX = { '8': ['24', '3321'], '4': ['77', '3454'], '3': ['35', '2107'], '1': ['21', '3797'] };
  const DDD_UNIDADE = {
    'Resende': '24', 'Caetité': '77', 'Caldas': '35', 'Rio de Janeiro': '21',
    'São Paulo': '11', 'Fortaleza': '85', 'Itataia (Santa Quitéria)': '88', 'Buena': '22'
  };

  /** Tira acento e caixa: "Caetité" e "caetite" viram a mesma coisa. */
  function simples(txt) {
    return String(txt)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  /** Só os dígitos — serve para casar "3321 8000" com "8000". */
  function digitos(txt) {
    return String(txt).replace(/\D+/g, '');
  }

  /** Completa os campos de busca de um registro já montado. */
  function indexar(r) {
    r.texto = simples([r.nome, r.matricula, r.sigla, r.area, r.unidade].join(' '));
    r.chave = simples(r.nome);
    r.digitos = r.numeros.map(n => n[1] + ' ' + digitos(n[2])).join(' ') + ' ' + digitos(r.bruto);
    return r;
  }

  /**
   * Junta a base carregada com o que foi acrescentado à mão e monta o índice.
   * `extras` traz { novos: [contatos criados], numeros: { matrícula: [telefones] } }.
   */
  function montar(base, extras) {
    const ex = extras || { novos: [], numeros: {} };
    AREAS = base.areas.slice();
    UNIDADES = base.unidades.slice();

    /** Índice da unidade, criando a entrada se for uma unidade nova. */
    function indiceUnidade(nome) {
      const i = UNIDADES.indexOf(nome);
      if (i >= 0) return i;
      UNIDADES.push(nome);
      return UNIDADES.length - 1;
    }

    const daBase = base.contatos.map(c => {
      const [mat, nome, ia, iu, bruto, nums] = c;
      const area = AREAS[ia] || ['?', 'Área não informada'];
      const acrescentados = (ex.numeros && ex.numeros[mat]) || [];
      return indexar({
        matricula: mat,
        nome,
        sigla: area[0],
        area: area[1],
        unidade: UNIDADES[iu] || 'Unidade não informada',
        iu,
        bruto: bruto || '',
        numeros: (Array.isArray(nums) ? nums : []).concat(acrescentados),
        manual: false
      });
    });

    const criados = (ex.novos || []).map(c => indexar({
      matricula: c.id,
      nome: c.nome,
      sigla: c.sigla || '—',
      area: c.area || 'Acrescentado por você',
      unidade: c.unidade || '',
      iu: indiceUnidade(c.unidade || ''),
      bruto: '',
      numeros: c.numeros || [],
      manual: true
    }));

    registros = daBase.concat(criados)
      .sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));
    registros.forEach((r, i) => { r.i = i; });
    return registros;
  }

  /** "2433218000" -> "(24) 3321-8000". */
  function formatar(d) {
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    if (d.length === 9) return d.slice(0, 5) + '-' + d.slice(5);
    if (d.length === 8) return d.slice(0, 4) + '-' + d.slice(4);
    return d;
  }

  /**
   * Lê o que a pessoa digitou e devolve [tipo, número para discar, rótulo, 1].
   * O 1 no fim marca que o número foi acrescentado à mão.
   */
  function interpretar(texto, unidade) {
    const d = digitos(texto);
    if (!d) return null;
    const dddUnidade = DDD_UNIDADE[unidade] || '';

    if (d.length === 4) {
      const faixa = PABX[d[0]];
      return faixa ? ['r', faixa[0] + faixa[1] + d, d, 1] : ['r', d, d, 1];
    }
    if (d.length === 11) return ['c', d, formatar(d), 1];
    if (d.length === 10) return ['f', d, formatar(d), 1];
    if (d.length === 9 && d[0] === '9' && dddUnidade) {
      return ['c', dddUnidade + d, formatar(dddUnidade + d), 1];
    }
    if (d.length === 8 && dddUnidade) {
      return ['f', dddUnidade + d, formatar(dddUnidade + d), 1];
    }
    return ['o', d, texto.trim(), 1];
  }

  /** Primeira letra usada no agrupamento A–Z (o que não for letra cai em "#"). */
  function inicial(reg) {
    const l = reg.chave.charAt(0).toUpperCase();
    return l >= 'A' && l <= 'Z' ? l : '#';
  }

  /**
   * Filtra por termo e unidade.
   * Termos separados por espaço somam (todos precisam casar).
   */
  function filtrar(termo, unidade) {
    const base = unidade === null || unidade === undefined
      ? registros
      : registros.filter(r => r.iu === unidade);

    const t = simples(termo).trim();
    if (!t) return base;

    const partes = t.split(/\s+/);
    return base.filter(r => partes.every(p => {
      if (r.texto.includes(p)) return true;
      const d = p.replace(/\D+/g, '');
      return d.length >= 3 && r.digitos.includes(d);
    }));
  }

  return {
    montar,
    interpretar,
    formatar,
    filtrar,
    inicial,
    simples,
    digitos,
    get registros() { return registros; },
    get areas() { return AREAS; },
    get unidades() { return UNIDADES; }
  };
})();
