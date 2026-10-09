import { uid, type Wall } from './model';
import { length, toWorld, type PixelPoint, type WallCandidate } from './recognition';

/** getScreenCTM includes SVG preserveAspectRatio letterboxing and CSS transforms. */
export function imagePointFromClient(svg: SVGSVGElement, clientX: number, clientY: number, width: number, height: number, clamp = false): PixelPoint | null {
  try {
    const matrix = svg.getScreenCTM()?.inverse();
    if (!matrix) return null;
    const point = { x: matrix.a * clientX + matrix.c * clientY + matrix.e, y: matrix.b * clientX + matrix.d * clientY + matrix.f };
    if (!Number.isFinite(point.x + point.y)) return null;
    if (!clamp && (point.x < 0 || point.y < 0 || point.x > width || point.y > height)) return null;
    return { x: Math.max(0, Math.min(width, point.x)), y: Math.max(0, Math.min(height, point.y)) };
  } catch { return null; }
}

export function assertImageScale(width: number, height: number, scale: number) {
  if (![width, height, scale].every(Number.isFinite) || width < 1 || height < 1 || width > 20000 || height > 20000 || scale < .000001 || scale > 100 || width * scale > 100000 || height * scale > 100000) throw new Error('Deze schaal levert ongeldige afmetingen op. Controleer je meetpunten en de werkelijke afstand.');
}

export function confirmedWalls(candidates: WallCandidate[], width: number, height: number, scale: number): Wall[] {
  assertImageScale(width, height, scale);
  const selected = candidates.filter(candidate => candidate.selected);
  if (selected.length > 5000) throw new Error('Selecteer maximaal 5000 muurvoorstellen.');
  return selected.map(candidate => {
    if (![candidate.start.x, candidate.start.y, candidate.end.x, candidate.end.y, candidate.thickness].every(Number.isFinite) || candidate.thickness <= 0) throw new Error('Een muurvoorstel heeft ongeldige coördinaten of wanddikte. Pas dit voorstel aan of verwijder het.');
    if ([candidate.start, candidate.end].some(p => p.x < 0 || p.y < 0 || p.x > width || p.y > height)) throw new Error('Een muurvoorstel valt buiten de afbeelding. Sleep de eindpunten binnen de plattegrond.');
    if (length(candidate) * scale < .01) throw new Error('Een muurvoorstel is korter dan één centimeter. Pas dit voorstel aan of verwijder het.');
    const thickness = Math.max(.01, candidate.thickness * scale);
    if (thickness > 5) throw new Error('Een voorgestelde muur is dikker dan vijf meter. Controleer de wanddikte en schaal.');
    return { id: uid(), start: toWorld(candidate.start, height, scale), end: toWorld(candidate.end, height, scale), thickness };
  });
}

/** Explicit merge only for collinear, touching/overlapping proposals; never bridge a door gap. */
export function mergeWallCandidates(a: WallCandidate, b: WallCandidate): WallCandidate {
  const size = length(a), otherSize = length(b);
  if (size < 1 || otherSize < 1) throw new Error('Deze voorstellen zijn te kort om samen te voegen.');
  const direction = { x: (a.end.x - a.start.x) / size, y: (a.end.y - a.start.y) / size };
  const project = (p: PixelPoint) => (p.x - a.start.x) * direction.x + (p.y - a.start.y) * direction.y;
  const side = (p: PixelPoint) => Math.abs(-(p.x - a.start.x) * direction.y + (p.y - a.start.y) * direction.x);
  const tolerance = Math.max(1, Math.min(a.thickness, b.thickness) * .25);
  if ([b.start, b.end].some(p => side(p) > tolerance) || Math.abs(a.thickness - b.thickness) > Math.max(2, Math.min(a.thickness, b.thickness) * .35)) throw new Error('Voeg alleen rechte, aansluitende muren met vergelijkbare dikte samen.');
  const lo = Math.min(project(b.start), project(b.end)), hi = Math.max(project(b.start), project(b.end));
  if (lo > size + 1 || hi < -1) throw new Error('Tussen deze muren zit een opening. Die kan een deur zijn en wordt niet dichtgemaakt.');
  const at = (distance: number) => ({ x: a.start.x + direction.x * distance, y: a.start.y + direction.y * distance });
  return { id: `merged-${uid()}`, start: at(Math.min(0, lo)), end: at(Math.max(size, hi)), thickness: (a.thickness + b.thickness) / 2, confidence: 'review', selected: a.selected || b.selected };
}

export function createCancellableWorkerTask(factory: () => Worker, payload: unknown, transfer: Transferable[] = [], timeoutMs = 45000) {
  const task = factory();
  let settled = false;
  let rejectTask: (reason: Error) => void;
  let timer: ReturnType<typeof setTimeout>;
  const finish = () => { if (settled) return false; settled = true; clearTimeout(timer); task.onmessage = null; task.onerror = null; task.terminate(); return true; };
  const promise = new Promise<any>((resolve, reject) => {
    rejectTask = reject;
    timer = setTimeout(() => { if (finish()) reject(new Error('De analyse duurt te lang. Kies een kleinere uitsnede of trek handmatig over.')); }, timeoutMs);
    task.onmessage = ({ data }) => { if (finish()) data.error ? reject(new Error(data.error)) : resolve(data); };
    task.onerror = () => { if (finish()) reject(new Error('De lokale beeldanalyse kon niet worden gestart. De onderlegger blijft beschikbaar.')); };
    try { task.postMessage(payload, transfer); } catch (error) { if (finish()) reject(error); }
  });
  return { promise, cancel: () => { if (finish()) rejectTask(new DOMException('Analyse geannuleerd.', 'AbortError')); } };
}
