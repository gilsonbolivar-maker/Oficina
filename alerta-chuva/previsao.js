/* ————————————————————————————————————————————————————————————
   Busca a previsão no Open-Meteo e decide se vai chover. Usado pela
   página e pelo service worker (importScripts), para os dois darem
   sempre a mesma resposta.

   Também guarda o "estado compartilhado" (local, ajustes e se já
   avisou desta chuva) no Cache Storage: é o único armazenamento que
   a página e o service worker enxergam igual, sem IndexedDB.
   ———————————————————————————————————————————————————————————— */
'use strict';

const Previsao = (() => {
  const API = 'https://api.open-meteo.com/v1/forecast';
  const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  const CACHE_ESTADO = 'alerta-chuva-estado';
  const URL_ESTADO = 'estado.json';
  const MM_15 = 0.2;        // mm em 15 min a partir do qual conta como chuva
  const CHANCE_TALVEZ = 30; // abaixo do limiar, mas vale mostrar "pode chover"

  async function buscar(lat, lon) {
    const p = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: 'precipitation,weather_code',
      minutely_15: 'precipitation',
      hourly: 'precipitation_probability,precipitation,weather_code',
      forecast_minutely_15: '8',   // 2 horas
      forecast_hours: '13',
      timeformat: 'unixtime',
      timezone: 'auto'
    });
    const resp = await fetch(API + '?' + p, { cache: 'no-store' });
    if (!resp.ok) throw new Error('Open-Meteo respondeu ' + resp.status);
    return resp.json();
  }

  async function procurarCidade(nome) {
    const p = new URLSearchParams({ name: nome, count: '6', language: 'pt', format: 'json' });
    const resp = await fetch(GEO + '?' + p);
    if (!resp.ok) throw new Error('busca respondeu ' + resp.status);
    const dados = await resp.json();
    return (dados.results || []).map(r => ({
      nome: r.name,
      detalhe: [r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude
    }));
  }

  /**
   * Lê a resposta do Open-Meteo e devolve:
   *   alerta    — true quando bate com os ajustes (vai chover)
   *   nivel     — 'chuva' | 'talvez' | 'seco'
   *   quando    — instante (s) em que a chuva começa, ou null
   *   chanceMax — maior chance (%) dentro da janela
   *   horas     — [{ t, chance, mm }] das próximas 12 horas
   */
  function avaliar(dados, { janela, chance }, agora = Date.now() / 1000) {
    const fim = agora + janela * 3600;
    let quando = null;

    const atual = dados.current || {};
    if (atual.precipitation > 0) quando = agora;

    // Primeiras 2 horas, de 15 em 15 minutos: diz quando começa.
    const m = dados.minutely_15 || {};
    if (quando === null && m.time) {
      for (let i = 0; i < m.time.length; i++) {
        const t = m.time[i];
        if (t + 900 <= agora || t >= fim) continue;
        if ((m.precipitation[i] || 0) >= MM_15) { quando = Math.max(t, agora); break; }
      }
    }

    // Resto da janela, hora a hora, pela chance.
    const h = dados.hourly || {};
    const horas = [];
    let chanceMax = 0;
    for (let i = 0; i < (h.time || []).length; i++) {
      const t = h.time[i];
      if (t + 3600 <= agora) continue;
      const c = h.precipitation_probability ? (h.precipitation_probability[i] || 0) : 0;
      const mm = h.precipitation ? (h.precipitation[i] || 0) : 0;
      if (horas.length < 12) horas.push({ t, chance: c, mm });
      if (t >= fim) continue;
      chanceMax = Math.max(chanceMax, c);
      if (quando === null && c >= chance && mm > 0) quando = Math.max(t, agora);
    }

    const alerta = quando !== null;
    return {
      alerta,
      nivel: alerta ? 'chuva' : chanceMax >= CHANCE_TALVEZ ? 'talvez' : 'seco',
      quando,
      chanceMax,
      chovendo: atual.precipitation > 0,
      mmAgora: atual.precipitation || 0,
      codigo: atual.weather_code,
      fuso: dados.utc_offset_seconds || 0,
      horas
    };
  }

  /** Hora do local consultado (que pode ter outro fuso que o aparelho). */
  function horaLocal(t, fuso) {
    const d = new Date((t + fuso) * 1000);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  }

  /** Frase curta: "Chovendo agora", "Chuva em ~40 min", "Chuva por volta das 16:00". */
  function frase(r, agora = Date.now() / 1000) {
    if (!r.alerta) return '';
    if (r.chovendo) return 'Chovendo agora';
    const min = Math.round((r.quando - agora) / 60);
    if (min <= 5) return 'Chuva começando';
    if (min < 90) return `Chuva em ~${Math.round(min / 5) * 5} min`;
    return 'Chuva por volta das ' + horaLocal(r.quando, r.fuso);
  }

  async function lerEstado() {
    try {
      const c = await caches.open(CACHE_ESTADO);
      const r = await c.match(URL_ESTADO);
      return r ? await r.json() : {};
    } catch (e) {
      return {};
    }
  }

  async function gravarEstado(mudancas) {
    try {
      const atual = await lerEstado();
      const novo = Object.assign(atual, mudancas);
      const c = await caches.open(CACHE_ESTADO);
      await c.put(URL_ESTADO, new Response(JSON.stringify(novo), {
        headers: { 'Content-Type': 'application/json' }
      }));
      return novo;
    } catch (e) {
      return mudancas;
    }
  }

  return { buscar, procurarCidade, avaliar, horaLocal, frase, lerEstado, gravarEstado };
})();
