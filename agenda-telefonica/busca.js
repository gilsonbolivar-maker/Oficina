/* ————————————————————————————————————————————————————————————
   Busca: monta um índice em memória e filtra por nome, ramal,
   matrícula, área ou unidade. Roda inteiro no aparelho.
   ———————————————————————————————————————————————————————————— */
'use strict';

const Busca = (() => {

  let registros = [];
  let AREAS = [];
  let UNIDADES = [];

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

  /** Recebe a base carregada e monta o índice em memória. */
  function montar(base) {
    AREAS = base.areas;
    UNIDADES = base.unidades;
    registros = base.contatos
      .map(c => {
        const [mat, nome, ia, iu, bruto, nums] = c;
        const area = AREAS[ia] || ['?', 'Área não informada'];
        const unidade = UNIDADES[iu] || 'Unidade não informada';
        return {
          matricula: mat,
          nome,
          sigla: area[0],
          area: area[1],
          unidade,
          iu,
          bruto: bruto || '',
          numeros: Array.isArray(nums) ? nums : [],
          texto: simples([nome, mat, area[0], area[1], unidade].join(' ')),
          chave: simples(nome),
          digitos: (Array.isArray(nums) ? nums : [])
            .map(n => n[1] + ' ' + digitos(n[2])).join(' ') + ' ' + digitos(bruto || '')
        };
      })
      .sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));
    registros.forEach((r, i) => { r.i = i; });
    return registros;
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
    filtrar,
    inicial,
    simples,
    digitos,
    get registros() { return registros; },
    get areas() { return AREAS; },
    get unidades() { return UNIDADES; }
  };
})();
