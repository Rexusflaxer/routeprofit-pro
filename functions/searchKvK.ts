import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { query } = await req.json();
    if (!query) return Response.json({ results: [] });

    const apiKey = Deno.env.get("KVK_API_KEY");

    // Use KvK test API (sandbox) or production
    const baseUrl = apiKey
      ? "https://api.kvk.nl/api/v2/zoeken"
      : "https://api.kvk.nl/test/api/v2/zoeken";

    const headers = { "Accept": "application/json" };
    if (apiKey) headers["apikey"] = apiKey;

    // Determine search parameter - numeric = KvK number, else name
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
      return Response.json({ error: `KvK API fout: ${response.status}`, details: text }, { status: 502 });
    }

    const data = await response.json();
    const results = (data.resultaten || []).map(item => ({
      kvkNummer: item.kvkNummer,
      naam: item.naam,
      adres: item.adres
        ? [
            item.adres.binnenlandsAdres?.straatnaam,
            item.adres.binnenlandsAdres?.huisnummer,
            item.adres.binnenlandsAdres?.postcode,
            item.adres.binnenlandsAdres?.plaats,
          ].filter(Boolean).join(" ")
        : "",
      type: item.type,
      actief: item.actief,
    }));

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});