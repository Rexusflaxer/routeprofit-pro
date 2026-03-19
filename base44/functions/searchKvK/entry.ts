import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { query } = await req.json();
    if (!query || query.trim().length < 2) return Response.json({ results: [] });

    const apiKey = Deno.env.get("KVK_API_KEY");

    // Use KvK test API (sandbox) when no API key is set
    const baseUrl = apiKey
      ? "https://api.kvk.nl/api/v2/zoeken"
      : "https://api.kvk.nl/test/api/v2/zoeken";

    const headers = { "Accept": "application/json" };
    if (apiKey) headers["apikey"] = apiKey;

    const isKvkNumber = /^\d+$/.test(query.trim());
    const params = new URLSearchParams({ resultatenPerPagina: "10" });
    if (isKvkNumber) {
      params.set("kvkNummer", query.trim());
    } else {
      params.set("naam", query.trim());
    }

    const response = await fetch(`${baseUrl}?${params.toString()}`, { headers });

    if (!response.ok) {
      const text = await response.text();
      console.error("KvK API error:", response.status, text);
      return Response.json({ error: `KvK API fout: ${response.status}`, details: text }, { status: 502 });
    }

    const data = await response.json();
    const resultaten = data.resultaten || [];

    const results = resultaten.map(item => {
      // Address can be in different structures depending on API version
      const binnenlands = item.adres?.binnenlandsAdres || item.adressen?.[0]?.binnenlandsAdres || {};
      const adresParts = [
        binnenlands.straatnaam,
        binnenlands.huisnummer,
        binnenlands.postcode,
        binnenlands.plaats,
      ].filter(Boolean);

      return {
        kvkNummer: item.kvkNummer,
        naam: item.naam || item.handelsnaam,
        adres: adresParts.join(" "),
        type: item.type,
        actief: item.actief,
      };
    });

    return Response.json({ results });
  } catch (error) {
    console.error("searchKvK error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});