import fs from "node:fs";
import { TextDecoder, TextEncoder } from "node:util";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let api;
let fetchMock;
let auth;
beforeAll(async () => {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
  globalThis.Uint8Array = new TextEncoder().encode("").constructor;
  const { transform } = await import("esbuild");
  const source = fs.readFileSync(`${process.cwd()}/base44/functions/lookupService/entry.ts`, "utf8")
    .replace(/import \{ createClientFromRequest(?: as (\w+))? \} from "npm:@base44\/sdk@[^"\n]+";/g,
      (_match, alias) => `const ${alias || "createClientFromRequest"} = () => globalThis.__lookupAddressTestClient;`);
  const compiled = await transform(`let requestHandler;
    const Deno = { serve: handler => { requestHandler = handler; }, env: { get: () => undefined } };
    ${source}
    export { requestHandler, addressSearchUrl };`, { loader: "ts", format: "esm", target: "es2022" });
  api = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});
beforeEach(() => {
  auth = vi.fn().mockResolvedValue({ id: "user-1", role: "user" });
  vi.stubGlobal("__lookupAddressTestClient", { auth: { me: auth } });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const plainAddress = {
  id: "adr-704cde78a53e52bfef85181ebee109c5", type: "adres",
  weergavenaam: "Dr. Jan van Breemenlaan 2, 8191LA Wapenveld",
  straatnaam: "Dr. Jan van Breemenlaan", huisnummer: 2, postcode: "8191LA", woonplaatsnaam: "Wapenveld",
  centroide_ll: "POINT(6.05648356 52.41909212)", nummeraanduiding_id: "0246200000001915",
};
const withSuffix = (suffix = "2") => ({ ...plainAddress, id: `adr-suffix-${suffix}`, nummeraanduiding_id: `suffix-${suffix}`,
  weergavenaam: `Dr. Jan van Breemenlaan 2b-${suffix}, 8191LA Wapenveld`, huisletter: "b", huisnummertoevoeging: suffix });
const result = (docs = [plainAddress], total = docs.length) => Response.json({ response: { docs, numFound: total } });
function request(extra = {}, raw) {
  return api.requestHandler(new Request("https://app.example.test/lookupService", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify({ action: "search_address", query: "Dr. Jan van Breemenlaan 2", ...extra }),
  }));
}
const fetchedUrl = () => new URL(fetchMock.mock.calls[0][0]);

describe("PDOK adreszoeken via lookupService", () => {
  it("zoekt alleen adressen met exacte matches vóór toevoegingen en retourneert de kaartidentiteit", async () => {
    fetchMock.mockResolvedValue(result([plainAddress, withSuffix()], 75));
    const response = await request();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ total: 75, has_more: true, next_offset: 2 });
    expect(data.suggestions[0]).toMatchObject({ address: plainAddress.weergavenaam, house_number: "2", house_number_addition: null,
      postal_code: "8191LA", latitude: 52.41909212, longitude: 6.05648356, bag_address_id: "0246200000001915" });
    expect(data.suggestions[1]).toMatchObject({ house_number_addition: "b-2" });
    const url = fetchedUrl();
    expect(url.origin).toBe("https://api.pdok.nl");
    expect(url.pathname).toBe("/bzk/locatieserver/search/v3_1/suggest");
    expect(url.searchParams.get("fq")).toBe("type:adres");
    expect(url.searchParams.get("q")).toBe("Dr. Jan van Breemenlaan 2");
    expect(url.searchParams.get("rows")).toBe("20");
    expect(url.searchParams.get("qf")).toBe("exacte_match^20 suggest^0.5 huisnummer^0.5 huisletter^0.5 huisnummertoevoeging^0.5");
    expect(url.searchParams.get("sort")).toBe("score desc,sortering asc,weergavenaam asc,id asc");
    expect(url.searchParams.get("fl")).toContain("centroide_ll,nummeraanduiding_id");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("ondersteunt vervolgpagina's zonder terug te vallen op de eerste vijf", async () => {
    fetchMock.mockResolvedValue(result(Array.from({ length: 15 }, (_, i) => withSuffix(`${60 + i}`)), 75));
    const data = await (await request({ limit: 20, offset: 60 })).json();
    expect(fetchedUrl().searchParams.get("start")).toBe("60");
    expect(data.suggestions).toHaveLength(15);
    expect(data).toMatchObject({ total: 75, has_more: false, next_offset: null });
  });

  it("begrenst de paginagrootte en stopt bij de maximale offset", async () => {
    fetchMock.mockResolvedValue(result(Array.from({ length: 50 }, (_, i) => withSuffix(String(i))), 20000));
    const data = await (await request({ limit: 500, offset: 10000 })).json();
    expect(fetchedUrl().searchParams.get("rows")).toBe("50");
    expect(data).toMatchObject({ has_more: false, next_offset: null });
  });

  it.each([
    { limit: 0 }, { limit: -1 }, { limit: 1.5 }, { limit: "20" },
    { offset: -1 }, { offset: 1.5 }, { offset: 10001 }, { offset: "20" },
    { query: null }, { query: {} }, { query: "a".repeat(301) },
  ])("weigert ongeldige invoer zonder externe aanvraag (%j)", async body => {
    expect((await request(body)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verplicht een ingelogde gebruiker vóór het lezen van adressen", async () => {
    auth.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["", "  ", "ab"])("zoekt niet op een te korte zoektekst (%j)", async query => {
    const response = await request({ query });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [], total: 0, has_more: false, next_offset: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("houdt een lege respons apart van een storing", async () => {
    fetchMock.mockResolvedValue(result([]));
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [], total: 0, has_more: false, next_offset: null });
  });

  it.each([undefined, "POINT(0 0)", "POINT(6 100)", "POINT(181 52)", "POINT(no position)", "POINT(6.1 52.2) ignored"])("geeft ongeldige kaartposities niet als echte coördinaten door (%j)", async centroide => {
    fetchMock.mockResolvedValue(result([{ ...plainAddress, centroide_ll: centroide }]));
    const data = await (await request()).json();
    expect(data.suggestions[0]).toMatchObject({ latitude: null, longitude: null });
  });

  it("ondersteunt wetenschappelijke WKT-notatie met expliciete lengte/breedtevolgorde", async () => {
    fetchMock.mockResolvedValue(result([{ ...plainAddress, centroide_ll: "POINT ( 6.05648356e0 5.241909212e1 )" }]));
    expect((await (await request()).json()).suggestions[0]).toMatchObject({ latitude: 52.41909212, longitude: 6.05648356 });
  });

  it("telt gefilterde records mee in de paginavoortgang", async () => {
    fetchMock.mockResolvedValue(result([plainAddress, { type: "weg" }, null], 75));
    expect(await (await request()).json()).toMatchObject({ suggestions: [expect.objectContaining({ house_number: "2" })], next_offset: 3, has_more: true });
  });

  it.each([
    () => new Response("PDOK secret response", { status: 503 }),
    () => new Response("not json"),
    () => Response.json({ error: "provider error" }),
    () => Response.json({ response: { docs: {}, numFound: 2 } }),
    () => result([plainAddress], -1),
    () => result(Array.from({ length: 21 }, () => plainAddress)),
  ])("geeft een veilige herhaalbare fout voor mislukte providerrespons", async response => {
    fetchMock.mockImplementation(response);
    const res = await request();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Adressen konden niet worden geladen. Probeer het opnieuw of verfijn je zoekopdracht." });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("lekkage of een tweede aanvraag na een timeout wordt voorkomen", async () => {
    fetchMock.mockRejectedValue(new DOMException("internal timeout", "TimeoutError"));
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("internal");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("laat de overige lookupactie-registratie intact", async () => {
    const response = await request({ action: "unknown" });
    expect(response.status).toBe(400);
    expect((await response.json()).allowed_actions).toEqual(["search_address", "search_kvk", "lookup_iban_bic", "lookup_license_plate"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
