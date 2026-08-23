/* ————————————————————————————————————————————————————————————
   Mapa deslizante mínimo sobre tiles do OpenStreetMap.
   Sem dependências: só projeção Web Mercator e <img> posicionadas.
   O ponto escolhido é sempre o centro da tela (a mira fica fixa).
   ———————————————————————————————————————————————————————————— */
'use strict';

const Mapa = (() => {
  const TAM = 256;                       // lado do tile, em pixels
  const URL_TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ZOOM_MIN = 3;
  const ZOOM_MAX = 18;

  const escala = z => TAM * Math.pow(2, z);

  const endereco = (z, x, y) =>
    URL_TILE.replace('{z}', z).replace('{x}', x).replace('{y}', y);

  const lonParaX = (lon, z) => (lon + 180) / 360 * escala(z);

  const latParaY = (lat, z) => {
    const s = Math.sin(lat * Math.PI / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * escala(z);
  };

  const xParaLon = (x, z) => x / escala(z) * 360 - 180;

  const yParaLat = (y, z) => {
    const n = Math.PI - 2 * Math.PI * y / escala(z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };

  /** Metros por pixel de tela naquela latitude e zoom. */
  const metrosPorPixel = (lat, z) =>
    156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);

  function criar(caixa, camada, aoMudar) {
    let zoom = 15;
    let cx = lonParaX(-46.63, zoom);     // centro em pixels do mundo
    let cy = latParaY(-23.55, zoom);
    let raioMetros = 0;
    let eu = null;                       // { lat, lon }
    let pendente = false;

    const tiles = new Map();             // "z/x/y" -> <img>
    const elRaio = caixa.querySelector('.mapa-raio');
    const elEu = caixa.querySelector('.mapa-eu');

    /* ——— desenho ——— */

    function agendar() {
      if (pendente) return;
      pendente = true;
      requestAnimationFrame(() => { pendente = false; desenhar(); });
    }

    function desenhar() {
      const larg = caixa.clientWidth;
      const alt = caixa.clientHeight;
      if (!larg || !alt) return;

      const esq = cx - larg / 2;
      const topo = cy - alt / 2;
      const n = Math.pow(2, zoom);

      const tx0 = Math.floor(esq / TAM);
      const tx1 = Math.floor((esq + larg) / TAM);
      const ty0 = Math.max(0, Math.floor(topo / TAM));
      const ty1 = Math.min(n - 1, Math.floor((topo + alt) / TAM));

      const vivos = new Set();
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const wx = ((tx % n) + n) % n;             // o mundo dá a volta em x
          const chave = zoom + '/' + wx + '/' + ty + '/' + tx;
          vivos.add(chave);
          let img = tiles.get(chave);
          if (!img) {
            img = new Image();
            img.alt = '';
            img.decoding = 'async';
            img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
            img.src = endereco(zoom, wx, ty);
            camada.appendChild(img);
            tiles.set(chave, img);
          }
          img.style.transform =
            `translate(${Math.round(tx * TAM - esq)}px, ${Math.round(ty * TAM - topo)}px)`;
        }
      }
      for (const [chave, img] of tiles) {
        if (!vivos.has(chave)) { img.remove(); tiles.delete(chave); }
      }

      desenharRaio();
      desenharEu(esq, topo);
      if (aoMudar) aoMudar(centro(), zoom);
    }

    function desenharRaio() {
      if (!elRaio) return;
      if (!raioMetros) { elRaio.style.display = 'none'; return; }
      const d = 2 * raioMetros / metrosPorPixel(yParaLat(cy, zoom), zoom);
      elRaio.style.display = '';
      elRaio.style.width = d + 'px';
      elRaio.style.height = d + 'px';
    }

    function desenharEu(esq, topo) {
      if (!elEu) return;
      if (!eu) { elEu.hidden = true; return; }
      elEu.hidden = false;
      elEu.style.left = (lonParaX(eu.lon, zoom) - esq) + 'px';
      elEu.style.top = (latParaY(eu.lat, zoom) - topo) + 'px';
    }

    /* ——— gestos ——— */

    const dedos = new Map();
    let baseDistancia = 0;
    let arrastou = false;

    caixa.addEventListener('pointerdown', ev => {
      if (ev.target.closest('.mapa-botoes')) return;
      caixa.setPointerCapture(ev.pointerId);
      dedos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      arrastou = false;
      if (dedos.size === 2) baseDistancia = distanciaDedos();
    });

    caixa.addEventListener('pointermove', ev => {
      const antes = dedos.get(ev.pointerId);
      if (!antes) return;
      const dx = ev.clientX - antes.x;
      const dy = ev.clientY - antes.y;
      antes.x = ev.clientX;
      antes.y = ev.clientY;

      if (dedos.size === 1) {
        if (Math.abs(dx) + Math.abs(dy) > 2) arrastou = true;
        cx -= dx;
        cy -= dy;
        limitar();
        agendar();
      } else if (dedos.size === 2 && baseDistancia) {
        const agora = distanciaDedos();
        const razao = agora / baseDistancia;
        if (razao > 1.8) { aplicarZoom(1); baseDistancia = agora; }
        else if (razao < 0.55) { aplicarZoom(-1); baseDistancia = agora; }
      }
    });

    const soltar = ev => {
      dedos.delete(ev.pointerId);
      if (dedos.size < 2) baseDistancia = 0;
    };
    caixa.addEventListener('pointerup', soltar);
    caixa.addEventListener('pointercancel', soltar);

    // O Safari dispara gestos próprios na pinça; sem isso ele dá zoom na página.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(nome => {
      caixa.addEventListener(nome, ev => ev.preventDefault());
    });

    caixa.addEventListener('wheel', ev => {
      ev.preventDefault();
      aplicarZoom(ev.deltaY < 0 ? 1 : -1);
    }, { passive: false });

    let ultimoToque = 0;
    caixa.addEventListener('click', ev => {
      if (arrastou || ev.target.closest('.mapa-botoes')) return;
      const t = Date.now();
      if (t - ultimoToque < 320) aplicarZoom(1);
      ultimoToque = t;
    });

    function distanciaDedos() {
      const [a, b] = [...dedos.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function aplicarZoom(passo) {
      const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + passo));
      if (novo === zoom) return;
      const fator = Math.pow(2, novo - zoom);
      cx *= fator;
      cy *= fator;
      zoom = novo;
      limitar();
      agendar();
    }

    /** Impede que o mapa role para além dos polos. */
    function limitar() {
      const max = escala(zoom);
      cy = Math.min(max, Math.max(0, cy));
      cx = ((cx % max) + max) % max;
    }

    /** Ajusta o zoom para o círculo do raio caber na tela. */
    function enquadrarRaio(soAfastar) {
      const menor = Math.min(caixa.clientWidth, caixa.clientHeight);
      if (!raioMetros || !menor) return;
      const alvo = menor * 0.72;
      const lat = yParaLat(cy, zoom);
      let melhor = ZOOM_MIN;
      for (let z = ZOOM_MIN; z <= ZOOM_MAX; z++) {
        if (2 * raioMetros / metrosPorPixel(lat, z) <= alvo) melhor = z;
      }
      const novo = soAfastar ? Math.min(zoom, melhor) : melhor;
      if (novo !== zoom) aplicarZoom(novo - zoom);
    }

    function centro() {
      return { lat: yParaLat(cy, zoom), lon: xParaLon(cx, zoom) };
    }

    /* ——— API ——— */

    const api = {
      centro,
      get zoom() { return zoom; },
      irPara(lat, lon, z) {
        if (typeof z === 'number') zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
        cx = lonParaX(lon, zoom);
        cy = latParaY(lat, zoom);
        limitar();
        enquadrarRaio(true);
        agendar();
      },
      definirRaio(metros, enquadrar) {
        raioMetros = metros;
        if (enquadrar) enquadrarRaio(false);
        agendar();
      },
      enquadrarRaio,
      definirEu(lat, lon) { eu = { lat, lon }; agendar(); },
      aproximar() { aplicarZoom(1); },
      afastar() { aplicarZoom(-1); },
      redesenhar: agendar
    };

    new ResizeObserver(agendar).observe(caixa);
    agendar();
    return api;
  }

  /**
   * Endereços dos tiles que cobrem um quadrado de `metros` de raio em volta
   * do ponto, nos zooms pedidos — usado para guardar o mapa para uso offline.
   */
  function tilesDaArea(lat, lon, metros, zMin, zMax, limite) {
    const lista = [];
    for (let z = zMin; z <= zMax; z++) {
      const raioPx = metros / metrosPorPixel(lat, z);
      const px = lonParaX(lon, z);
      const py = latParaY(lat, z);
      const n = Math.pow(2, z);
      const doZoom = [];
      const y0 = Math.max(0, Math.floor((py - raioPx) / TAM));
      const y1 = Math.min(n - 1, Math.floor((py + raioPx) / TAM));
      for (let y = y0; y <= y1; y++) {
        for (let x = Math.floor((px - raioPx) / TAM); x <= Math.floor((px + raioPx) / TAM); x++) {
          doZoom.push(endereco(z, ((x % n) + n) % n, y));
        }
      }
      // zoom que não cabe inteiro no limite fica de fora: melhor faltar
      // detalhe do que baixar um pedaço solto.
      if (limite && lista.length + doZoom.length > limite) break;
      lista.push(...doZoom);
    }
    return lista;
  }

  /** Distância em metros entre dois pontos (fórmula de haversine). */
  function distancia(lat1, lon1, lat2, lon2) {
    const R = 6371008.8;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  return { criar, distancia, metrosPorPixel, tilesDaArea };
})();
