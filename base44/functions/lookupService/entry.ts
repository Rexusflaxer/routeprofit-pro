// base44/functions/_shared/lookup/lookupIbanBic.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
async function handleLookupIbanBic(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }
    const { iban } = await req.json();
    if (!iban) {
      return Response.json({ error: "IBAN is required" }, { status: 400 });
    }
    const cleanIban = iban.replace(/\s/g, "").toUpperCase();
    const ibanPattern = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
    if (!ibanPattern.test(cleanIban)) {
      return Response.json({ error: "Invalid IBAN format", received: cleanIban, length: cleanIban.length }, { status: 400 });
    }
    let bic = null;
    let bankName = null;
    try {
      const countryCode = cleanIban.substring(0, 2);
      if (countryCode === "NL") {
        const bankCode = cleanIban.substring(4, 8);
        const dutchBankMap = {
          "ABNA": { bic: "ABNANL2A", name: "ABN AMRO" },
          "RABO": { bic: "RABONL2U", name: "Rabobank" },
          "INGB": { bic: "INGBNL2A", name: "ING" },
          "BUNQ": { bic: "BUNQNL2A", name: "bunq" },
          "ARSP": { bic: "ARSPNL2A", name: "Argenta" },
          "BHBLNL": { bic: "BHBLNL2R", name: "BHBl" },
          "GKCC": { bic: "GKCCNL2H", name: "Geldkoerier" },
          "AKAB": { bic: "AKABNL2H", name: "Akabe" },
          "KBASB": { bic: "KBASBL2X", name: "KBC" }
        };
        const mapping = dutchBankMap[bankCode];
        if (mapping) {
          bic = mapping.bic;
          bankName = mapping.name;
        }
      }
    } catch (err) {
      console.log("IBAN lookup fallback skipped:", err.message);
    }
    return Response.json({
      iban: cleanIban,
      bic: bic || null,
      bankName: bankName || null,
      status: bic ? "found" : "partial"
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/lookup/lookupLicensePlate.ts
import { createClientFromRequest as createClientFromRequest2 } from "npm:@base44/sdk@0.8.6";
async function handleLookupLicensePlate(req) {
  try {
    const base44 = createClientFromRequest2(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { licensePlate } = await req.json();
    if (!licensePlate) {
      return Response.json({ error: "License plate required" }, { status: 400 });
    }
    const normalized = licensePlate.toUpperCase().replace(/[-\s]/g, "");
    const url = `https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${normalized}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.length === 0) {
      return Response.json({
        found: false,
        message: "Kenteken niet gevonden"
      });
    }
    const vehicle = data[0];
    let fuelType = null;
    const brandstofOmschrijving = (vehicle.brandstof_omschrijving || "").toLowerCase();
    if (brandstofOmschrijving.includes("elektr")) {
      fuelType = "elektrisch";
    } else if (brandstofOmschrijving.includes("hybr")) {
      fuelType = "hybride";
    } else if (brandstofOmschrijving.includes("benzine")) {
      fuelType = "benzine";
    } else if (brandstofOmschrijving.includes("diesel")) {
      fuelType = "diesel";
    } else if (brandstofOmschrijving.includes("lpg")) {
      fuelType = "lpg";
    }
    return Response.json({
      found: true,
      brand: vehicle.merk || "",
      model: vehicle.handelsbenaming || "",
      year: vehicle.datum_eerste_toelating ? parseInt(vehicle.datum_eerste_toelating.substring(0, 4)) : null,
      fuel_type: fuelType
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/_shared/lookup/searchAddress.ts
import { createClientFromRequest as createClientFromRequest3 } from "npm:@base44/sdk@0.8.6";
const ADDRESS_SEARCH_PAGE_SIZE = 20;
const ADDRESS_SEARCH_MAX_PAGE_SIZE = 50;
const ADDRESS_SEARCH_MAX_OFFSET = 10000;
const ADDRESS_SEARCH_FIELDS = "id,type,weergavenaam,straatnaam,huisnummer,huisletter,huisnummertoevoeging,postcode,woonplaatsnaam,centroide_ll,nummeraanduiding_id,adresseerbaarobject_id";

function addressSearchUrl(query, limit, offset) {
  const url = new URL("https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest");
  url.search = new URLSearchParams({
    q: query,
    fq: "type:adres",
    rows: String(limit),
    start: String(offset),
    fl: ADDRESS_SEARCH_FIELDS,
    // Keep partial-address matching, but rank an exact address ahead of the
    // many suffixes of the same house number. Do this before pagination.
    qf: "exacte_match^20 suggest^0.5 huisnummer^0.5 huisletter^0.5 huisnummertoevoeging^0.5",
    sort: "score desc,sortering asc,weergavenaam asc,id asc",
  }).toString();
  return url;
}

function addressSearchCoordinates(point) {
  const match = typeof point === "string" && point.match(/^POINT\s*\(\s*([-+\d.eE]+)\s+([-+\d.eE]+)\s*\)$/i);
  const longitude = match ? Number(match[1]) : NaN;
  const latitude = match ? Number(match[2]) : NaN;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90
    || (longitude === 0 && latitude === 0)) return { latitude: null, longitude: null };
  return { latitude, longitude };
}

async function handleSearchAddress(req) {
  try {
    const base44 = createClientFromRequest3(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.query !== "string" || body.query.length > 300) {
      return Response.json({ error: "Gebruik een adreszoekopdracht van maximaal 300 tekens." }, { status: 400 });
    }
    const query = body.query.trim();
    const requestedLimit = body.limit ?? ADDRESS_SEARCH_PAGE_SIZE;
    const offset = body.offset ?? 0;
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || !Number.isInteger(offset) || offset < 0 || offset > ADDRESS_SEARCH_MAX_OFFSET) {
      return Response.json({ error: "Ongeldige adrespaginering." }, { status: 400 });
    }
    const limit = Math.min(ADDRESS_SEARCH_MAX_PAGE_SIZE, requestedLimit);
    if (query.length < 3) {
      return Response.json({ suggestions: [], total: 0, has_more: false, next_offset: null });
    }
    const response = await fetch(addressSearchUrl(query, limit, offset), { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("PDOK address search unavailable");
    const data = await response.json();
    const docs = data.response?.docs;
    const total = data.response?.numFound;
    if (!Array.isArray(docs) || !Number.isInteger(total) || total < 0 || docs.length > limit) {
      throw new Error("PDOK returned invalid address results");
    }
    const suggestions = docs.filter((doc) => doc?.type === "adres" && doc.weergavenaam).map((doc) => {
      return {
        id: doc.id || doc.nummeraanduiding_id || null,
        address: doc.weergavenaam || doc.straatnaam,
        street_name: doc.straatnaam || null,
        house_number: doc.huisnummer ? String(doc.huisnummer) : null,
        house_number_addition: [doc.huisletter, doc.huisnummertoevoeging].filter(Boolean).join("-") || null,
        postal_code: doc.postcode || null,
        city: doc.woonplaatsnaam || null,
        country: "Nederland",
        bag_address_id: doc.nummeraanduiding_id || doc.adresseerbaarobject_id || null,
        ...addressSearchCoordinates(doc.centroide_ll),
      };
    });
    // Offset counts raw provider records, even if a malformed record was
    // filtered out, so loading more cannot repeat a page indefinitely.
    const nextOffset = offset + docs.length;
    const hasMore = docs.length > 0 && nextOffset < total && nextOffset <= ADDRESS_SEARCH_MAX_OFFSET;
    return Response.json({ suggestions, total, has_more: hasMore, next_offset: hasMore ? nextOffset : null });
  } catch {
    return Response.json({ error: "Adressen konden niet worden geladen. Probeer het opnieuw of verfijn je zoekopdracht." }, { status: 503 });
  }
}

// base44/functions/_shared/lookup/searchKvk.ts
import { createClientFromRequest as createClientFromRequest4 } from "npm:@base44/sdk@0.8.6";
async function handleSearchKvk(req) {
  try {
    const base44 = createClientFromRequest4(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { query } = await req.json();
    if (!query || query.trim().length < 2) return Response.json({ results: [] });
    const apiKey = Deno.env.get("KVK_API_KEY");
    const baseUrl = apiKey ? "https://api.kvk.nl/api/v2/zoeken" : "https://api.kvk.nl/test/api/v2/zoeken";
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
    const results = resultaten.map((item) => {
      const binnenlands = item.adres?.binnenlandsAdres || item.adressen?.[0]?.binnenlandsAdres || {};
      const adresParts = [
        binnenlands.straatnaam,
        binnenlands.huisnummer,
        binnenlands.postcode,
        binnenlands.plaats
      ].filter(Boolean);
      return {
        kvkNummer: item.kvkNummer,
        naam: item.naam || item.handelsnaam,
        adres: adresParts.join(" "),
        type: item.type,
        actief: item.actief
      };
    });
    return Response.json({ results });
  } catch (error) {
    console.error("searchKvK error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/lookupService/entry.ts
var HANDLERS = {
  search_address: handleSearchAddress,
  search_kvk: handleSearchKvk,
  lookup_iban_bic: handleLookupIbanBic,
  lookup_license_plate: handleLookupLicensePlate
};
function json(data, status = 200) {
  return Response.json(data, { status });
}
Deno.serve(async (req) => {
  try {
    const body = await req.clone().json().catch(() => ({}));
    const action = String(body?.action || "");
    const handler = HANDLERS[action];
    if (!handler) {
      return json({
        error: "Onbekende lookupactie",
        allowed_actions: Object.keys(HANDLERS)
      }, 400);
    }
    return handler(req);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
