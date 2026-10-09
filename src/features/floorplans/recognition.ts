/** Local, conservative wall candidates. Coordinates here are image pixels (Y down). */
export type PixelPoint = { x: number; y: number };
export type Segment = { start: PixelPoint; end: PixelPoint; width?: number };
export type WallCandidate = Segment & { id: string; thickness: number; confidence: 'strong' | 'review'; selected: boolean };
export const length = (s: Segment) => Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y);
const dot = (a: PixelPoint, b: PixelPoint) => a.x * b.x + a.y * b.y;
const subtract = (a: PixelPoint, b: PixelPoint) => ({ x: a.x - b.x, y: a.y - b.y });
const distance = (a: PixelPoint, b: PixelPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function canonical(segment: Segment): Segment {
  return segment.start.x > segment.end.x || (segment.start.x === segment.end.x && segment.start.y > segment.end.y)
    ? { ...segment, start: segment.end, end: segment.start } : segment;
}

/** Never bridge a gap: a gap may be a door. Only pair substantially overlapping edges. */
export function proposeWalls(input: Segment[], imageWidth: number, imageHeight: number): WallCandidate[] {
  if (!Number.isFinite(imageWidth + imageHeight) || imageWidth <= 0 || imageHeight <= 0) throw new Error('Ongeldige afbeeldingsmaten.');
  if (input.length > 8000) throw new Error('Te veel lijnen. Snijd de afbeelding bij tot alleen de plattegrond.');
  const minLength = Math.max(14, Math.min(imageWidth, imageHeight) * .014);
  const maxThickness = Math.max(8, Math.min(imageWidth, imageHeight) * .025);
  const segments = input.filter(s => [s.start.x, s.start.y, s.end.x, s.end.y].every(Number.isFinite)
    && length(s) >= minLength).map(canonical).sort((a, b) => length(b) - length(a));
  const output: WallCandidate[] = [];
  const paired = new Set<number>();
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i], size = length(a);
    const u = { x: (a.end.x - a.start.x) / size, y: (a.end.y - a.start.y) / size };
    const n = { x: -u.y, y: u.x };
    let best: { index: number; lo: number; hi: number; separation: number; quality: number } | undefined;
    for (let j = i + 1; j < segments.length; j++) {
      const b = segments[j], bSize = length(b);
      const v = { x: (b.end.x - b.start.x) / bSize, y: (b.end.y - b.start.y) / bSize };
      if (Math.abs(dot(u, v)) < .998) continue;
      const delta = subtract(b.start, a.start), separation = dot(delta, n);
      if (Math.abs(separation) < 1.7 || Math.abs(separation) > maxThickness) continue;
      const secondSeparation = dot(subtract(b.end, a.start), n);
      if (Math.abs(secondSeparation - separation) > Math.max(2, Math.abs(separation) * .2)) continue;
      const projection = [dot(delta, u), dot(subtract(b.end, a.start), u)].sort((x, y) => x - y);
      const lo = Math.max(0, projection[0]), hi = Math.min(size, projection[1]);
      const overlap = hi - lo;
      if (overlap < minLength || overlap / Math.min(size, bSize) < .75) continue;
      const quality = overlap / Math.min(size, bSize) - Math.abs(separation) / (maxThickness * 8);
      if (!best || quality > best.quality) best = { index: j, lo, hi, separation, quality };
    }
    if (best) {
      paired.add(i); paired.add(best.index);
      const at = (t: number) => ({ x: a.start.x + u.x * t + n.x * best!.separation / 2, y: a.start.y + u.y * t + n.y * best!.separation / 2 });
      output.push({ id: `candidate-${i}`, start: at(best.lo), end: at(best.hi), thickness: Math.abs(best.separation), confidence: 'strong', selected: true });
    }
  }
  // Single strokes are useful, but always require explicit selection during review.
  segments.forEach((s, i) => {
    if (!paired.has(i) && length(s) >= minLength * 2) output.push({ ...s, id: `candidate-${i}`, thickness: Math.max(2, s.width || 3), confidence: 'review', selected: false });
  });
  const unique: WallCandidate[] = [];
  for (const candidate of output) {
    if (unique.some(old => distance(old.start, candidate.start) < 4 && distance(old.end, candidate.end) < 4)) continue;
    unique.push(candidate);
  }
  if (unique.length > 1600) throw new Error('De bron bevat te veel mogelijke muren. Kies een kleinere uitsnede.');
  return unique;
}

export function calibratedScale(a: PixelPoint, b: PixelPoint, metres: number): number {
  const pixels = distance(a, b);
  if (!Number.isFinite(metres) || metres <= 0 || metres > 10000 || pixels < 5) throw new Error('Kies twee verschillende punten en vul een geldige afstand in meters in.');
  return metres / pixels;
}

export function toWorld(point: PixelPoint, imageHeight: number, metresPerPixel: number) {
  return { x: point.x * metresPerPixel, y: (imageHeight - point.y) * metresPerPixel };
}

export function splitCandidate(candidate: WallCandidate): WallCandidate[] {
  const mid = { x: (candidate.start.x + candidate.end.x) / 2, y: (candidate.start.y + candidate.end.y) / 2 };
  return [{ ...candidate, id: `${candidate.id}-a`, end: mid }, { ...candidate, id: `${candidate.id}-b`, start: mid }];
}

type Matrix = [number, number, number, number, number, number];
const multiply = (a: Matrix, b: Matrix): Matrix => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
const transform = (m: Matrix, x: number, y: number): PixelPoint => ({ x: m[0]*x+m[2]*y+m[4], y:m[1]*x+m[3]*y+m[5] });

/** Adapter for pinned PDF.js 5.4.624 compact DrawOPS; other versions safely use raster. */
export function pdfVectorSegments(list: { fnArray: number[]; argsArray: unknown[][] }, ops: Record<string, number>, viewport: Matrix, version: string): Segment[] {
  if (version !== '5.4.624') return [];
  const draw = { move: 0, line: 1, cubic: 2, quadratic: 3, close: 4 };
  let matrix: Matrix = [1,0,0,1,0,0], width = 1;
  const stack: { matrix: Matrix; width: number }[] = [], segments: Segment[] = [];
  for (let index = 0; index < list.fnArray.length; index++) {
    const op = list.fnArray[index], args = list.argsArray[index] as any[];
    if ([ops.clip, ops.eoClip, ops.beginGroup, ops.setGState, ops.beginMarkedContentProps].includes(op)) return [];
    if (op === ops.save) stack.push({ matrix: [...matrix], width });
    else if (op === ops.restore) { const previous = stack.pop(); if (!previous) return []; ({ matrix, width } = previous); }
    else if (op === ops.transform) matrix = multiply(matrix, args as Matrix);
    else if (op === ops.setLineWidth) width = Number(args[0]);
    else if (op === ops.constructPath) {
      const [paint, payload] = args;
      if (![ops.stroke, ops.closeStroke, ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke].includes(paint)) return [];
      const data = payload?.[0];
      if (!data || typeof data.length !== 'number') return [];
      const m = multiply(viewport, matrix);
      let current: PixelPoint | undefined, initial: PixelPoint | undefined;
      const path: Segment[] = [];
      let curved = false;
      for (let i = 0; i < data.length;) {
        const kind = data[i++];
        if (kind === draw.move) current = initial = transform(m, data[i++], data[i++]);
        else if (kind === draw.line) { const next = transform(m, data[i++], data[i++]); if (current) path.push({ start: current, end: next, width: width * Math.hypot(m[0], m[1]) }); current = next; }
        else if (kind === draw.close) { if (current && initial) path.push({start:current,end:initial}); current = initial; }
        else if (kind === draw.cubic) { i += 4; current = transform(m,data[i++],data[i++]); curved = true; }
        else if (kind === draw.quadratic) { i += 2; current = transform(m,data[i++],data[i++]); curved = true; }
        else return [];
      }
      if (!curved) segments.push(...path);
      if (segments.length > 8000) return [];
    }
  }
  return segments;
}
