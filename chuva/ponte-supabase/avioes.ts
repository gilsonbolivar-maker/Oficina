// Ponte de tráfego aéreo para o Mapa de Chuva (Oficina).
// Busca aviões perto de um ponto nas redes abertas de ADS-B e devolve com CORS liberado.
const FONTES = [
  (lat: string, lon: string, d: number) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${d}`,
  (lat: string, lon: string, d: number) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${d}`,
];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  const dist = Math.min(250, Math.max(5, Math.round(Number(u.searchParams.get("dist")) || 100)));
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response(JSON.stringify({ erro: "lat/lon inválidos" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  for (const f of FONTES) {
    try {
      const r = await fetch(f(lat.toFixed(3), lon.toFixed(3), dist), {
        headers: { "User-Agent": "Oficina-MapaDeChuva/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const j = await r.json();
      const ac = (j.ac || j.aircraft || []).filter((a: any) => a.lat != null && a.lon != null).map((a: any) => ({
        hex: a.hex, voo: (a.flight || "").trim(), reg: a.r || "", tipo: a.t || "",
        lat: a.lat, lon: a.lon,
        alt: a.alt_baro === "ground" ? "solo" : (a.alt_geom ?? a.alt_baro ?? null),   // pés
        vel: a.gs ?? null,        // nós
        rumo: a.track ?? a.true_heading ?? null,
      }));
      return new Response(JSON.stringify({ fonte: new URL(f("0","0",1)).host, total: ac.length, ac }), {
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=10" },
      });
    } catch (_) { /* tenta a próxima fonte */ }
  }
  return new Response(JSON.stringify({ erro: "fontes indisponíveis" }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
});
