import { TextDecoder, TextEncoder } from "node:util";
import { ReadableStream } from "node:stream/web";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchObjectParcelCandidatesDirect } from "@/components/objects/objectMapParcelTransport";

const object = { id: "object-1", latitude: 52.1005, longitude: 4.3005, geocoding_status: "verified" };
const ring = [[4.3, 52.1], [4.301, 52.1], [4.301, 52.101], [4.3, 52.101], [4.3, 52.1]];
const feature = (overrides = {}) => ({
  type: "Feature", id: "6693300c-9f8c-565f-bf82-c3eaf4c780e7",
  properties: { kadastrale_gemeente_waarde: "Heerde", sectie: "A", perceelnummer: 934,
    identificatie_lokaal_id: "81100093470000", owner_name: "must not survive", arbitrary_url: "https://not-pdok.example" },
  geometry: { type: "Polygon", coordinates: [ring] }, ...overrides,
});
const collection = (...features) => ({ type: "FeatureCollection", features });
const json = value => new Response(JSON.stringify(value), { headers: { "content-type": "application/geo+json" } });
const run = (fetchImpl, overrides = {}) => fetchObjectParcelCandidatesDirect({ object, fetchImpl, ...overrides });
beforeAll(() => {
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
  globalThis.Uint8Array = new TextEncoder().encode("").constructor;
});
afterEach(() => vi.useRealTimers());

describe("begrensd rechtstreeks lezen van publieke PDOK-percelen", () => {
  it("vraagt alleen de vaste publieke bron op zonder sessiegegevens en normaliseert brondata", async () => {
    const fetchImpl = vi.fn(async () => json(collection(feature())));
    const result = await run(fetchImpl);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url.origin).toBe("https://api.pdok.nl");
    expect(url.pathname).toBe("/kadaster/brk-kadastrale-kaart/ogc/v1/collections/perceel/items");
    expect(url.searchParams.get("bbox")).toBe("4.2968440,52.0982384,4.3041560,52.1027616");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("crs")).toBe("http://www.opengis.net/def/crs/OGC/1.3/CRS84");
    expect(options).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
    expect(options.headers).toEqual({ accept: "application/geo+json, application/json" });
    expect(result).toMatchObject({ total: 1, skipped_invalid_count: 0, has_more: false, cursor: null, next_cursor: null,
      center: { longitude: object.longitude, latitude: object.latitude }, source: { id: "pdok_brk", crs: "OGC:CRS84" } });
    expect(result.candidates.features[0]).toMatchObject({ id: feature().id, geometry: { type: "Polygon", coordinates: [ring] },
      properties: { source: "pdok_brk", source_feature_id: feature().id, label: "Heerde A 934" } });
    expect(JSON.stringify(result)).not.toMatch(/must not survive|not-pdok\.example|owner_name/);
  });

  it.each([
    { latitude: null }, { longitude: "" }, { latitude: true }, { longitude: Infinity }, { latitude: 91 },
    { longitude: -181 }, { latitude: 0, longitude: 0 }, { geocoding_status: "pending" }, { id: "" },
  ])("weigert een ongeldige of onbevestigde objectlocatie vóór netwerkverkeer: %j", async patch => {
    const fetchImpl = vi.fn();
    await expect(run(fetchImpl, { object: { ...object, ...patch } })).rejects.toMatchObject({ status: 409,
      details: { code: "object_map_location_unverified", retryable: false } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ondersteunt gecontroleerde handmatige locatie en numerieke opslagstrings", async () => {
    await expect(run(async () => json(collection()), { object: { ...object, geocoding_status: "manual", latitude: "52.1005" } }))
      .resolves.toMatchObject({ total: 0 });
  });

  it.each([{ radiusMeters: 24 }, { radiusMeters: 501 }, { radiusMeters: 50.5 }, { limit: 0 }, { limit: 101 },
    { limit: "100" }, { cursor: "../../another" }, { cursor: "x".repeat(181) }, { cursor: ["id"] }])(
    "weigert onbegrensde/ongeldige aanvragen: %j", async overrides => {
      const fetchImpl = vi.fn();
      await expect(run(fetchImpl, overrides)).rejects.toMatchObject({ status: 400 });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("gebruikt uitsluitend een gevalideerde vervolgcursor, geen URL uit de bron", async () => {
    const fetchImpl = vi.fn(async url => {
      const next = new URL(url); next.searchParams.set("cursor", "E3oI|XFm3xA"); next.searchParams.sort();
      return json({ ...collection(feature()), links: [{ rel: "next", href: next.href }] });
    });
    const result = await run(fetchImpl, { cursor: "previous", limit: 50 });
    expect(result).toMatchObject({ cursor: "previous", next_cursor: "E3oI|XFm3xA", has_more: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    next => { next.hostname = "attacker.example"; },
    next => { next.pathname = "/different/collection"; },
    next => { next.username = "secret"; },
    next => { next.hash = "untrusted"; },
    next => { next.searchParams.set("bbox", "0,0,180,90"); },
    next => { next.searchParams.set("limit", "1000"); },
    next => { next.searchParams.delete("crs"); },
    next => { next.searchParams.set("extra", "anything"); },
    next => { next.searchParams.append("cursor", "other"); },
    next => { next.searchParams.set("cursor", "current"); },
    next => { next.searchParams.set("cursor", ""); },
  ])("weigert gewijzigde/onveilige paginaverwijzingen (%#)", async mutate => {
    const fetchImpl = vi.fn(async url => {
      const next = new URL(url); next.searchParams.set("cursor", "next"); mutate(next);
      return json({ ...collection(feature()), links: [{ rel: "next", href: next.href }] });
    });
    await expect(run(fetchImpl, { cursor: "current" })).rejects.toMatchObject({ status: 503,
      details: { code: "pdok_parcel_invalid_response", reason: "pagination", retryable: false } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("weigert meerdere vervolgverwijzingen", async () => {
    await expect(run(async url => {
      const next = new URL(url); next.searchParams.set("cursor", "next");
      return json({ ...collection(), links: [{ rel: "next", href: next.href }, { rel: "next", href: next.href }] });
    })).rejects.toMatchObject({ details: { reason: "pagination" } });
  });

  it.each([
    { type: "Feature", features: [] }, { type: "FeatureCollection", features: {} },
    { ...collection(), crs: { properties: { name: "EPSG:28992" } } },
    collection(...Array.from({ length: 101 }, () => feature())),
  ])("weigert een ongeldig bronantwoord of niet-WGS84 bron: %#", async value => {
    await expect(run(async () => json(value))).rejects.toMatchObject({ details: { code: "pdok_parcel_invalid_response", reason: "collection" } });
  });

  it("accepteert Polygon met binnenring en MultiPolygon", async () => {
    const hole = [[4.3002, 52.1002], [4.3008, 52.1002], [4.3008, 52.1008], [4.3002, 52.1008], [4.3002, 52.1002]];
    const result = await run(async () => json(collection(
      feature({ geometry: { type: "Polygon", coordinates: [ring, hole] } }),
      feature({ id: "second", geometry: { type: "MultiPolygon", coordinates: [[ring]] } }),
    )));
    expect(result.total).toBe(2);
    expect(result.candidates.features[0].geometry.coordinates).toHaveLength(2);
  });

  it.each([
    { type: "Point", coordinates: [4.3, 52.1] },
    { type: "Polygon", coordinates: [ring.slice(0, -1)] },
    { type: "Polygon", coordinates: [[ring[0], ring[1], ring[1], ring[2], ring[3], ring[0]]] },
    { type: "Polygon", coordinates: [[ring[0], ring[2], ring[1], ring[3], ring[0]]] },
    { type: "Polygon", coordinates: [ring.map(point => [point[0] + 1, point[1]])] },
    { type: "Polygon", coordinates: [ring.map(point => [String(point[0]), point[1]])] },
    { type: "Polygon", coordinates: [ring.map(point => [181, point[1]])] },
    { type: "Polygon", coordinates: [ring, ring.map(point => [point[0] + 0.01, point[1]])] },
    { type: "Polygon", coordinates: [Array.from({ length: 10_001 }, () => [4.3, 52.1])] },
  ])("slaat ongeldige geometrie over zonder geldige percelen te verliezen: %#", async geometry => {
    const result = await run(async () => json(collection(feature({ geometry }), feature({ id: "valid" }))));
    expect(result).toMatchObject({ total: 1, skipped_invalid_count: 1 });
    expect(result.candidates.features[0].id).toBe("valid");
  });

  it("weigert overlappende binnenringen en buitensporige featuremetadata", async () => {
    const hole = [[4.3002, 52.1002], [4.3008, 52.1002], [4.3008, 52.1008], [4.3002, 52.1008], [4.3002, 52.1002]];
    const result = await run(async () => json(collection(
      feature({ geometry: { type: "Polygon", coordinates: [ring, hole, hole] } }),
      feature({ properties: { oversized: "x".repeat(750_001) } }), feature({ id: "valid" }),
    )));
    expect(result).toMatchObject({ total: 1, skipped_invalid_count: 2 });
  });

  it("weigert te grote oppervlakte, ook verdeeld over polygonen", async () => {
    const large = [[4.26, 52.073], [4.34, 52.073], [4.34, 52.127], [4.26, 52.127], [4.26, 52.073]];
    const result = await run(async () => json(collection(feature({ geometry: { type: "MultiPolygon", coordinates: [[large], [large], [large], [large]] } }))));
    expect(result).toMatchObject({ total: 0, skipped_invalid_count: 1 });
  });

  it("stopt een opgegeven te grote response vóór het uitlezen", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    await expect(run(async () => new Response(body, { headers: { "content-length": "5000001" } })))
      .rejects.toMatchObject({ details: { reason: "oversized_response" } });
    expect(cancel).toHaveBeenCalled();
  });

  it.each([undefined, "1"])("begrensd stream-lezen stopt ook zonder/eenzijdige Content-Length (%s)", async contentLength => {
    let reads = 0;
    const cancel = vi.fn();
    const body = new ReadableStream({ pull(controller) { reads += 1; controller.enqueue(new Uint8Array(1_000_000)); }, cancel }, { highWaterMark: 0 });
    await expect(run(async () => new Response(body, { headers: contentLength ? { "content-length": contentLength } : {} })))
      .rejects.toMatchObject({ details: { reason: "oversized_response" } });
    expect(reads).toBe(6);
    expect(cancel).toHaveBeenCalled();
  });

  it("weigert kapotte JSON zonder ruwe broninhoud in de fout", async () => {
    const error = await run(async () => new Response("not-json 4.3005,52.1005 https://private.example")).catch(error => error);
    expect(error.details).toMatchObject({ code: "pdok_parcel_invalid_response", reason: "invalid_json" });
    expect(JSON.stringify({ ...error, message: error.message })).not.toMatch(/4\.3005|52\.1005|private\.example/);
  });

  it.each([{ bytes: [255] }, { bytes: [226, 130] }])("classificeert ongeldige/onvolledige UTF-8 als bronantwoordfout: %j", async ({ bytes }) => {
    await expect(run(async () => new Response(new Uint8Array(bytes))))
      .rejects.toMatchObject({ status: 503, details: { code: "pdok_parcel_invalid_response", reason: "invalid_encoding", retryable: false } });
  });

  it("bewaart meervoudige UTF-8 tekens over streamgrenzen", async () => {
    const parcel = feature({ properties: { kadastrale_gemeente_waarde: "Curaçao" } });
    const bytes = new TextEncoder().encode(JSON.stringify(collection(parcel)));
    let index = 0;
    const body = new ReadableStream({ pull(controller) {
      if (index === bytes.length) controller.close();
      else { controller.enqueue(bytes.slice(index, index + 1)); index += 1; }
    } });
    const result = await run(async () => new Response(body));
    expect(result.candidates.features[0].properties.label).toBe("Curaçao");
  });

  it.each([403, 429, 503])("geeft HTTP %i als veilige definitieve transportfout terug", async status => {
    await expect(run(async () => new Response("upstream private", { status }))).rejects.toMatchObject({ status: 503,
      details: { code: "pdok_parcel_unavailable", reason: "http", retryable: false } });
  });

  it("neemt geen gevoelige netwerkfoutdetails over", async () => {
    const error = await run(async () => { throw new Error("fetch https://secret?bbox=4.3,52.1"); }).catch(error => error);
    expect(error.details).toMatchObject({ reason: "network", retryable: false });
    expect(JSON.stringify({ ...error, message: error.message })).not.toMatch(/secret|bbox|4\.3/);
  });

  it("breekt netwerkverkeer na acht seconden af zonder automatische herhalingen", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(() => new Promise(() => {}));
    const result = run(fetchImpl).catch(error => error);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await result).toMatchObject({ details: { reason: "timeout", retryable: false } });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("breekt ook een stilgevallen responsestream af", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const result = run(async () => new Response(new ReadableStream({ cancel }))).catch(error => error);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await result).toMatchObject({ details: { reason: "timeout" } });
    expect(cancel).toHaveBeenCalled();
  });
});
