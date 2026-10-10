/** Read-only, bounded adapters for public Dutch building references.
 * Source geometry is requested in RD metres. The geographic polynomial is only
 * used for source discovery/map display; imported dimensions keep source RD.
 */
export type Point = { x: number; y: number };
export type GeographicGeometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
export type ReferenceGeo = { crs: 'EPSG:28992'; origin: Point; rotation: 0; verticalDatum: 'NAP'; axis: 'x-east-y-north' };
export type PublicBuildingSelection = { selectionKey: string; bagId?: string; bagFeatureId?: string; selectedPoint?: [number, number]; selectedGeometry?: GeographicGeometry };
export type PublicBuildingCandidate = {
  id: string; source: 'bag' | 'bgt'; sourceId: string; bagId?: string; label: string;
  structureType: 'building' | 'open_shed' | 'canopy' | 'installation' | 'unknown';
  matching: 'exact_bag' | 'contains_point' | 'nearby' | 'overlap';
  geometry: GeographicGeometry; polygons: Point[][][]; geoReference: ReferenceGeo;
  provenance: { retrievedAt: string; license: string; attribution: string; url: string; version?: string; registeredAt?: string; sourceType?: string; relativeHeight?: number };
  requiresConfirmation: true; distanceMetres: number;
};
export type PublicAerialReference = {
  url: string; bboxRD: [number, number, number, number]; width: number; height: number;
  origin: Point; metresPerPixel: number; geoReference: ReferenceGeo; year: 2026;
  attribution: string; license: string;
};
export type PublicBuildingDiscovery = { candidates: PublicBuildingCandidate[]; aerial: PublicAerialReference | null; warnings: string[]; checkedAt: string; status: 'ready' | 'partial' | 'unavailable' };
export type PublicSourceOptions = { fetch?: typeof globalThis.fetch; now?: Date | string; timeoutMs?: number };
type RequestOptions = PublicSourceOptions & { deadline?: number };
const BAG = 'https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items';
const BGT = 'https://api.pdok.nl/kadaster/bgt/ogc/v1/collections/';
const WMS = 'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0';
const RD = 'http://www.opengis.net/def/crs/EPSG/0/28992';
const MAX_JSON = 2 * 1024 * 1024;
const MAX_IMAGE = 4 * 1024 * 1024;
const round = (v: number) => Math.round(v * 1000) / 1000;
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validLonLat = (p: unknown): p is [number, number] => Array.isArray(p) && p.length >= 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1]) && p[0] >= 3 && p[0] <= 7.5 && p[1] >= 50.5 && p[1] <= 53.7;
const validRD = (p: unknown): p is [number, number] => Array.isArray(p) && p.length >= 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1]) && p[0] >= -10000 && p[0] <= 310000 && p[1] >= 290000 && p[1] <= 630000;

export function geographicToRD([longitude, latitude]: [number, number]): Point {
  if (!validLonLat([longitude, latitude])) throw new Error('Gebouwlocatie valt buiten het ondersteunde brongebied.');
  const p = 0.36 * (latitude - 52.1551744), q = 0.36 * (longitude - 5.38720621);
  return {
    x: 155000 + 190094.945*q - 11832.228*p*q - 114.221*p*p*q - 32.391*q*q*q - 0.705*p - 2.34*p*p*p*q - 0.608*p*q*q*q - 0.008*q*q + 0.148*p*p*q*q*q,
    y: 463000 + 309056.544*p + 3638.893*q*q + 73.077*p*p - 157.984*p*q*q + 59.788*p*p*p + 0.433*q - 6.439*p*p*q*q - 0.032*p*q + 0.092*q*q*q*q - 0.054*p*q*q*q*q,
  };
}
export function rdToGeographic({ x, y }: Point): [number, number] {
  if (!validRD([x, y])) throw new Error('Ongeldige RD-brongeometrie.');
  const p = (x - 155000) * 1e-5, q = (y - 463000) * 1e-5;
  const latitude = 52.1551744 + (3235.65389*q - 32.58297*p*p - 0.2475*q*q - 0.84978*p*p*q - 0.0655*q*q*q - 0.01709*p*p*q*q - 0.00738*p + 0.0053*p**4 - 0.00039*p*p*q**3 + 0.00033*p**4*q - 0.00012*p*q) / 3600;
  const longitude = 5.38720621 + (5260.52916*p + 105.94684*p*q + 2.45656*p*q*q - 0.81885*p**3 + 0.05594*p*q**3 - 0.05607*p**3*q + 0.01199*q - 0.00256*p**3*q*q + 0.00128*p*q**4 + 0.00022*q*q - 0.00022*p*p + 0.00026*p**5) / 3600;
  return [longitude, latitude];
}
function polygonCoordinates(geometry: any): number[][][][] {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}
function validatePolygons(geometry: any, coordinateTest: (p: unknown) => boolean): number[][][][] {
  const polygons = polygonCoordinates(geometry);
  let vertices = 0;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > 50) throw new Error('Bronvorm is niet bruikbaar.');
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length || polygon.length > 50) throw new Error('Bronvorm is niet bruikbaar.');
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || !ring.every(coordinateTest)) throw new Error('Bronvorm is niet bruikbaar.');
      vertices += ring.length;
      if (vertices > 10000 || ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) throw new Error('Bronvorm is niet gesloten of te omvangrijk.');
      const area = ring.reduce((sum, p, i) => i ? sum + ring[i-1][0]*p[1] - p[0]*ring[i-1][1] : sum, 0);
      if (Math.abs(area) < 1e-14) throw new Error('Bronvorm heeft geen oppervlak.');
    }
  }
  return polygons;
}
function pointInRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside = !inside;
  }
  return inside;
}
export function containsReferencePoint(point: Point, polygons: Point[][][]): boolean {
  return polygons.some(polygon => pointInRing(point, polygon[0]) && !polygon.slice(1).some(ring => pointInRing(point, ring)));
}
function polygonsOverlap(a: Point[][][], b: Point[][][]): boolean {
  const bounds = (polygons:Point[][][]) => { const p=polygons.flat(2); return [Math.min(...p.map(v=>v.x)),Math.min(...p.map(v=>v.y)),Math.max(...p.map(v=>v.x)),Math.max(...p.map(v=>v.y))]; };
  const aa=bounds(a),bb=bounds(b);
  if (aa[0]>bb[2] || bb[0]>aa[2] || aa[1]>bb[3] || bb[1]>aa[3]) return false;
  if (a.some(p => p[0].some(v => containsReferencePoint(v,b))) || b.some(p => p[0].some(v => containsReferencePoint(v,a)))) return true;
  const cross = (p:Point,q:Point,r:Point) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  // Crossing strips can overlap even when neither outline contains a vertex.
  // Strict intersections exclude merely touching boundaries, which remain nearby.
  for (const pa of a) for (const pb of b) for (let i=1;i<pa[0].length;i++) for (let j=1;j<pb[0].length;j++) {
    const p=pa[0][i-1],q=pa[0][i],r=pb[0][j-1],t=pb[0][j];
    if (cross(p,q,r)*cross(p,q,t)<0 && cross(r,t,p)*cross(r,t,q)<0) return true;
  }
  return false;
}
function boundaryDistance(point: Point, polygons: Point[][][]): number {
  let distance = Infinity;
  for (const polygon of polygons) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
    const a = ring[i-1], b = ring[i], dx = b.x-a.x, dy = b.y-a.y;
    const t = Math.max(0, Math.min(1, ((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
    distance = Math.min(distance, Math.hypot(point.x-a.x-t*dx, point.y-a.y-t*dy));
  }
  return distance;
}
function boundedURL(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password || parsed.hash) throw new Error('Niet-toegestane bronverwijzing.');
  const allowed = parsed.origin === 'https://api.pdok.nl' && (
    /^\/kadaster\/bag\/ogc\/v2\/collections\/pand\/items(?:\/[a-zA-Z0-9-]{1,80})?$/.test(parsed.pathname) ||
    /^\/kadaster\/bgt\/ogc\/v1\/collections\/(pand|overigbouwwerk|gebouwinstallatie)\/items$/.test(parsed.pathname)
  );
  if (!allowed && !(parsed.origin === 'https://service.pdok.nl' && parsed.pathname === '/hwh/luchtfotorgb/wms/v1_0')) throw new Error('Niet-toegestane bronverwijzing.');
  return parsed;
}
async function boundedBytes(url: string, maxBytes: number, options: RequestOptions, expected: 'json' | 'jpeg'): Promise<Uint8Array> {
  boundedURL(url);
  const controller = new AbortController();
  const remaining = options.deadline === undefined ? 20000 : options.deadline - Date.now();
  if (remaining <= 0) throw new Error('De openbare bron reageert te langzaam.');
  const timer = setTimeout(() => controller.abort(), Math.min(remaining, 20000, Math.max(100, options.timeoutMs ?? 12000)));
  try {
    const response = await (options.fetch ?? globalThis.fetch)(url, { signal: controller.signal, redirect: 'manual', headers: { Accept: expected === 'jpeg' ? 'image/jpeg' : 'application/geo+json, application/json' } });
    if (!response.ok || response.redirected) throw new Error(`Openbare bron is tijdelijk niet beschikbaar (${response.status}).`);
    const type = response.headers.get('content-type') ?? '';
    if (expected === 'jpeg' ? !type.startsWith('image/jpeg') : !/json/i.test(type)) throw new Error('Onverwacht bronbestand.');
    const contentLength = Number(response.headers.get('content-length'));
    if (contentLength > maxBytes) throw new Error('Bronbestand is te groot.');
    if (!response.body) throw new Error('Leeg bronbestand.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > maxBytes) throw new Error('Bronbestand is te groot.');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally { clearTimeout(timer); }
}
async function json(url: string, options: PublicSourceOptions): Promise<any> {
  return JSON.parse(new TextDecoder().decode(await boundedBytes(url, MAX_JSON, options, 'json')));
}
async function features(url: string, options: PublicSourceOptions): Promise<any[]> {
  const first = boundedURL(url); let next: string | null = url; const result: any[] = []; const seen = new Set<string>();
  for (let page = 0; next && page < 8; page++) {
    if (seen.has(next)) throw new Error('Bronpaginering loopt vast.'); seen.add(next);
    const parsed = boundedURL(next);
    if (parsed.pathname !== first.pathname || parsed.origin !== first.origin) throw new Error('Bronpaginering verlaat de collectie.');
    for (const key of ['bbox', 'crs', 'datetime', 'identificatie']) if (first.searchParams.has(key) && parsed.searchParams.get(key) !== first.searchParams.get(key)) throw new Error('Bronpaginering wijzigt het zoekgebied.');
    const response = await json(next, options);
    if (response.type === 'Feature') return [response];
    if (!Array.isArray(response.features)) throw new Error('Onverwachte bronresultaten.');
    result.push(...response.features);
    if (result.length > 2000) throw new Error('Te veel bronvlakken in deze uitsnede.');
    const nextLinks = Array.isArray(response.links) ? response.links.filter((link: any) => link.rel === 'next') : [];
    if (nextLinks.length > 1) throw new Error('Onzekere bronpaginering.');
    next = nextLinks.length ? new URL(nextLinks[0].href, next).href : null;
  }
  if (next) throw new Error('De bronuitsnede kon niet volledig worden geladen.');
  return result;
}
function query(base: string, params: Record<string, string>): string {
  const url = new URL(base); for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value); return url.href;
}
export function isCurrentBgtFeature(feature: any, checkedAt: string): boolean {
  const p = feature?.properties ?? {}, at = Date.parse(checkedAt);
  if (p.status !== 'bestaand') return false;
  for (const key of ['eind_registratie', 'termination_date']) {
    if (p[key] != null && (!Number.isFinite(Date.parse(p[key])) || Date.parse(p[key]) <= at)) return false;
  }
  for (const key of ['tijdstip_registratie', 'creation_date']) if (p[key] != null && (!Number.isFinite(Date.parse(p[key])) || Date.parse(p[key]) > at)) return false;
  return true;
}
function structureType(collection: string, properties: any): PublicBuildingCandidate['structureType'] {
  if (collection === 'pand') return 'building';
  const type = `${properties.type ?? ''} ${properties.plus_type ?? ''}`.toLowerCase();
  if (type.includes('open loods') || type.includes('openloods')) return 'open_shed';
  if (type.includes('overkapping') || type.includes('luifel')) return 'canopy';
  return collection === 'gebouwinstallatie' ? 'installation' : 'unknown';
}
export function normalizePublicBuildingFeature(feature: any, context: {
  source: 'bag' | 'bgt'; collection: string; geoReference: ReferenceGeo; checkedAt: string;
  url: string; expectedBagId?: string; selectedPoint?: Point; selectedPolygons?: Point[][][];
}): PublicBuildingCandidate | null {
  const properties = feature?.properties ?? {};
  if (context.source === 'bgt' && !isCurrentBgtFeature(feature, context.checkedAt)) return null;
  if (context.source === 'bag' && !['Pand in gebruik', 'Pand in gebruik (niet ingemeten)', 'Verbouwing pand'].includes(properties.status)) return null;
  const rdPolygons = validatePolygons(feature.geometry, validRD);
  const origin = context.geoReference.origin;
  const polygons = rdPolygons.map(polygon => polygon.map(ring => ring.map(([x,y]) => ({ x: round(x-origin.x), y: round(y-origin.y) }))));
  if (polygons.flat(2).some(p => Math.abs(p.x) > 1000 || Math.abs(p.y) > 1000)) return null;
  const sourceId = String(feature.id ?? properties.lokaal_id ?? '');
  if (!sourceId || sourceId.length > 150) return null;
  const value = context.source === 'bag' ? properties.identificatie : properties.bag_pnd;
  const bagId = typeof value === 'string' && /^\d{16}$/.test(value) ? value : undefined;
  const exact = !!context.expectedBagId && bagId === context.expectedBagId;
  // With an authoritative BAG identity, nearby buildings never become alternatives.
  if (context.expectedBagId && !exact) return null;
  const point = context.selectedPoint ?? { x: 0, y: 0 };
  const contained = containsReferencePoint(point, polygons);
  const overlaps = !exact && !contained && !!context.selectedPolygons && polygonsOverlap(polygons, context.selectedPolygons);
  const distance = contained ? 0 : boundaryDistance(point, polygons);
  const type = structureType(context.collection, properties);
  const name = { building: 'Gebouw', open_shed: 'Open loods', canopy: 'Overkapping', installation: 'Gebouwinstallatie', unknown: 'Bouwwerk' }[type];
  const wgsPolygons = rdPolygons.map(polygon => polygon.map(ring => ring.map(([x,y]) => rdToGeographic({x,y}))));
  return {
    id: `${context.source}:${context.collection}:${sourceId}`, source: context.source, sourceId, ...(bagId ? {bagId} : {}),
    label: `${context.source === 'bgt' ? (properties.relatieve_hoogteligging === 0 ? 'BGT · maaiveld' : 'BGT · broncontour') : 'BAG · gebouwomtrek'} · ${name}`,
    structureType: type, matching: exact ? 'exact_bag' : contained ? 'contains_point' : overlaps ? 'overlap' : 'nearby',
    geometry: { type: 'MultiPolygon', coordinates: wgsPolygons }, polygons, geoReference: context.geoReference,
    provenance: { retrievedAt: context.checkedAt, license: context.source === 'bgt' ? 'CC0-1.0' : 'PDM-1.0', attribution: context.source === 'bgt' ? 'Kadaster / bronhouders BGT (PDOK)' : 'Kadaster BAG (PDOK)', url: context.url,
      ...(properties.version ? {version: String(properties.version).slice(0,150)} : {}),
      ...((properties.tijdstip_registratie ?? properties.documentdatum) ? {registeredAt: String(properties.tijdstip_registratie ?? properties.documentdatum).slice(0,80)} : {}),
      ...((properties.plus_type ?? properties.type) ? {sourceType: String(properties.plus_type ?? properties.type).slice(0,150)} : {}),
      ...(isFiniteNumber(properties.relatieve_hoogteligging) ? {relativeHeight: properties.relatieve_hoogteligging} : {}),
    }, requiresConfirmation: true, distanceMetres: round(distance),
  };
}
export function createPublicAerialReference(bboxRD: [number, number, number, number], geoReference: ReferenceGeo): PublicAerialReference {
  const [minX,minY,maxX,maxY] = bboxRD;
  if (!validRD([minX,minY]) || !validRD([maxX,maxY]) || maxX <= minX || maxY <= minY || maxX-minX > 1000 || maxY-minY > 1000) throw new Error('Ongeldige luchtfoto-uitsnede.');
  const metresPerPixel = Math.max(0.1, (maxX-minX)/1024, (maxY-minY)/1024);
  const width = Math.ceil((maxX-minX)/metresPerPixel - 1e-8), height = Math.ceil((maxY-minY)/metresPerPixel - 1e-8);
  // Expand the right/bottom edge less than one pixel to keep square metric pixels.
  const bounds: [number,number,number,number] = [minX, maxY-height*metresPerPixel, minX+width*metresPerPixel, maxY];
  return {
    url: query(WMS,{service:'WMS',version:'1.3.0',request:'GetMap',layers:'2026_orthoHR',styles:'',crs:'EPSG:28992',bbox:bounds.join(','),width:String(width),height:String(height),format:'image/jpeg',transparent:'false'}),
    bboxRD: bounds, width,height,origin:{x:round(minX-geoReference.origin.x),y:round(bounds[1]-geoReference.origin.y)},metresPerPixel,geoReference,year:2026,
    attribution:'Luchtfoto 2026 © Samenwerkingsverband Beeldmateriaal · CC BY 4.0 · creativecommons.org/licenses/by/4.0',license:'CC-BY-4.0',
  };
}
function jpegDimensions(bytes: Uint8Array): {width:number;height:number} {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length-2] !== 0xff || bytes[bytes.length-1] !== 0xd9) throw new Error('De luchtfoto bevat geen geldig JPEG-bestand.');
  let offset = 2;
  while (offset < bytes.length - 4) {
    if (bytes[offset++] !== 0xff) throw new Error('Ongeldige JPEG-segmenten.');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    const length = (bytes[offset] << 8) | bytes[offset+1];
    if (length < 2 || offset + length > bytes.length) throw new Error('Onvolledig JPEG-bestand.');
    if ([0xc0,0xc1,0xc2].includes(marker)) {
      if (length < 8) throw new Error('Ongeldige JPEG-afmetingen.');
      return {height:(bytes[offset+3]<<8)|bytes[offset+4],width:(bytes[offset+5]<<8)|bytes[offset+6]};
    }
    offset += length;
  }
  throw new Error('De luchtfoto bevat geen leesbare JPEG-afmetingen.');
}
export async function preparePublicAerial(aerial: PublicAerialReference, options: PublicSourceOptions = {}) {
  // Regenerate instead of trusting an incoming URL; this helper must not be an HTTP proxy.
  const canonical = createPublicAerialReference(aerial.bboxRD, aerial.geoReference);
  if (canonical.url !== aerial.url || aerial.width !== canonical.width || aerial.height !== canonical.height) throw new Error('Luchtfotoverwijzing is gewijzigd.');
  const bytes = await boundedBytes(canonical.url, MAX_IMAGE, options, 'jpeg');
  const dimensions = jpegDimensions(bytes);
  if (dimensions.width !== canonical.width || dimensions.height !== canonical.height) throw new Error('De luchtfoto heeft onverwachte afmetingen.');
  return {...canonical,bytes,mimeType:'image/jpeg' as const};
}
export async function discoverPublicBuildingReferences(selection: PublicBuildingSelection, options: PublicSourceOptions = {}): Promise<PublicBuildingDiscovery> {
  const checkedAt = new Date(options.now ?? Date.now()).toISOString();
  options = { ...options, deadline: Date.now() + 30000 } as RequestOptions;
  const warnings: string[] = []; const candidates: PublicBuildingCandidate[] = [];
  if (!selection.selectionKey || selection.selectionKey.length > 250) throw new Error('Selecteer eerst een opgeslagen gebouw.');
  const expectedBag = selection.bagId && /^\d{16}$/.test(selection.bagId) ? selection.bagId : undefined;
  let selectedRD: Point[][][] | undefined;
  if (selection.selectedGeometry) selectedRD = validatePolygons(selection.selectedGeometry, validLonLat).map(p => p.map(r => r.map(c => geographicToRD([c[0],c[1]]))));
  let anchor = validLonLat(selection.selectedPoint) ? geographicToRD(selection.selectedPoint) : undefined;
  if (!anchor && selectedRD) { const points = selectedRD.flat(2); anchor = {x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,y:(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2}; }
  let exactBagFeatures: any[] | undefined;
  let bagURL: string | undefined;
  if (expectedBag || selection.bagFeatureId) {
    if (!expectedBag && !/^[a-zA-Z0-9-]{1,80}$/.test(selection.bagFeatureId!)) throw new Error('Ongeldige BAG-verwijzing.');
    bagURL = query(expectedBag ? BAG : `${BAG}/${selection.bagFeatureId}`,{f:'json',crs:RD,...(expectedBag ? {identificatie:expectedBag,limit:'100'} : {})});
    try {
      exactBagFeatures = await features(bagURL, options);
      if (!anchor && exactBagFeatures.length === 1) { const coordinates = validatePolygons(exactBagFeatures[0].geometry,validRD).flat(2); anchor = {x:(Math.min(...coordinates.map(c=>c[0]))+Math.max(...coordinates.map(c=>c[0])))/2,y:(Math.min(...coordinates.map(c=>c[1]))+Math.max(...coordinates.map(c=>c[1])))/2}; }
    } catch { warnings.push('De BAG-bron kon niet worden geladen. Uw opgeslagen gebouw blijft behouden.'); }
  }
  if (!anchor) return {candidates,aerial:null,warnings:[...warnings,'Er is geen bruikbare locatie voor deze gebouwselectie.'],checkedAt,status:'unavailable'};
  anchor = {x:round(anchor.x),y:round(anchor.y)};
  const geoReference: ReferenceGeo = {crs:'EPSG:28992',origin:anchor,rotation:0,verticalDatum:'NAP',axis:'x-east-y-north'};
  const selectionPoints = selectedRD?.flat(2) ?? exactBagFeatures?.flatMap(f => {try {return validatePolygons(f.geometry,validRD).flat(2).map(([x,y])=>({x,y}));}catch{return [];}}) ?? [];
  let bboxRD: [number,number,number,number] = [anchor.x-40,anchor.y-40,anchor.x+40,anchor.y+40];
  if (selectionPoints.length) bboxRD = [Math.min(...selectionPoints.map(p=>p.x))-8,Math.min(...selectionPoints.map(p=>p.y))-8,Math.max(...selectionPoints.map(p=>p.x))+8,Math.max(...selectionPoints.map(p=>p.y))+8];
  if (bboxRD[2]-bboxRD[0]>1000 || bboxRD[3]-bboxRD[1]>1000) throw new Error('Selecteer één gebouw om openbare gegevens op te halen.');
  const corners = [[bboxRD[0],bboxRD[1]],[bboxRD[2],bboxRD[1]],[bboxRD[2],bboxRD[3]],[bboxRD[0],bboxRD[3]]].map(([x,y])=>rdToGeographic({x,y}));
  const bbox = [Math.min(...corners.map(c=>c[0])),Math.min(...corners.map(c=>c[1])),Math.max(...corners.map(c=>c[0])),Math.max(...corners.map(c=>c[1]))].join(',');
  const localSelected = selectedRD?.map(p=>p.map(r=>r.map(c=>({x:c.x-anchor!.x,y:c.y-anchor!.y}))));
  const resolvedBag = expectedBag ?? (exactBagFeatures?.length === 1 && /^\d{16}$/.test(exactBagFeatures[0]?.properties?.identificatie) ? exactBagFeatures[0].properties.identificatie : undefined);
  const sources = [
    {source:'bag' as const,collection:'pand',url:bagURL ?? query(BAG,{f:'json',limit:'250',bbox,crs:RD}),known:exactBagFeatures},
    ...['pand',...(!resolvedBag ? ['overigbouwwerk','gebouwinstallatie'] : [])].map(collection=>({source:'bgt' as const,collection,url:query(`${BGT}${collection}/items`,{f:'json',limit:'250',bbox,crs:RD,datetime:checkedAt}),known:undefined as any[] | undefined})),
  ];
  let failed = 0;
  await Promise.all(sources.map(async source=>{
    try {
      const records = source.known ?? await features(source.url,options);
      for (const feature of records) {
        try {
          const candidate = normalizePublicBuildingFeature(feature,{source:source.source,collection:source.collection,geoReference,checkedAt,url:source.url,expectedBagId:resolvedBag,selectedPolygons:localSelected});
          if (candidate) {
            candidates.push(candidate);
            if (candidate.source === 'bgt' && candidate.provenance.relativeHeight !== undefined && candidate.provenance.relativeHeight !== 0) warnings.push('Een BGT-voorstel ligt op een andere hoogtelaag. Controleer of dit de bedoelde begane grond is.');
          }
        } catch { warnings.push('Een onbruikbaar bronvlak is overgeslagen.'); }
      }
    } catch { failed++; warnings.push(`${source.source.toUpperCase()} ${source.collection === 'pand' ? 'gebouwen' : 'bouwwerken'} kon niet volledig worden geladen. Probeer later opnieuw.`); }
  }));
  const score = (c:PublicBuildingCandidate) => ({exact_bag:0,contains_point:1,overlap:2,nearby:3}[c.matching]*10000 + (c.source === 'bgt' ? 0 : 100) + c.distanceMetres);
  const unique = [...new Map(candidates.map(c=>[c.id,c])).values()].sort((a,b)=>score(a)-score(b)||a.id.localeCompare(b.id));
  if (unique.length > 40) warnings.push('Er zijn veel bronvlakken gevonden. Alleen de dichtstbijzijnde voorstellen worden getoond.');
  if (!unique.length) warnings.push('Geen geschikte buitenvorm gevonden. U kunt zelf tekenen of een bestaande tekening importeren.');
  const boundedCandidates: PublicBuildingCandidate[] = []; let totalVertices = 0;
  for (const candidate of unique.slice(0,40)) {
    const count = candidate.polygons.flat(2).length;
    if (count > 5000 || totalVertices + count > 10000) { warnings.push('Een te omvangrijke bronvorm is niet opgenomen. Gebruik een kleinere selectie of teken zelf.'); continue; }
    totalVertices += count; boundedCandidates.push(candidate);
  }
  return {candidates:boundedCandidates,aerial:createPublicAerialReference(bboxRD,geoReference),warnings:[...new Set(warnings)],checkedAt,status:failed ? (failed===sources.length ? 'unavailable' : 'partial') : 'ready'};
}
