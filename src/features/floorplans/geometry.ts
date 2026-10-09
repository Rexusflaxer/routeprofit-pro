import type { Floor, Point, Wall } from './model';
export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export function wallPoint(wall: Wall, offset: number): Point { const length = distance(wall.start, wall.end); return length ? { x: wall.start.x + (wall.end.x - wall.start.x) * offset / length, y: wall.start.y + (wall.end.y - wall.start.y) * offset / length } : { ...wall.start }; }
export function projectPoint(point: Point, wall: Wall) { const length = distance(wall.start, wall.end); const t = length ? Math.max(0, Math.min(1, ((point.x - wall.start.x) * (wall.end.x - wall.start.x) + (point.y - wall.start.y) * (wall.end.y - wall.start.y)) / length ** 2)) : 0; const position = wallPoint(wall, t * length); return { position, offset: t * length, distance: distance(point, position) }; }
export function nearestWall(floor: Floor, point: Point, tolerance = .6) { return floor.walls.map(wall => ({ wall, ...projectPoint(point, wall) })).filter(item => item.distance <= tolerance).sort((a, b) => a.distance - b.distance)[0]; }
export function snapPoint(point: Point, walls: Wall[], anchor?: Point, tolerance = .25): Point {
  const endpoints = walls.flatMap(w => [w.start, w.end]); const nearest = endpoints.find(p => distance(p, point) < tolerance);
  if (nearest) return { ...nearest };
  const snapped = { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 };
  if (anchor) { if (Math.abs(anchor.x - point.x) < tolerance) snapped.x = anchor.x; if (Math.abs(anchor.y - point.y) < tolerance) snapped.y = anchor.y; }
  return snapped;
}
function translateVertices(floor: Floor, vertices: Point[], delta: Point): Floor {
  const shifted = (point: Point) => vertices.some(p => distance(p,point)<.001) ? add(point,delta) : point;
  const walls = floor.walls.map(w => ({...w,start:shifted(w.start),end:shifted(w.end)}));
  if(walls.some(w=>distance(w.start,w.end)<.1))return floor;
  if(floor.openings.some(o=>{const wall=walls.find(w=>w.id===o.wallId);return !wall||distance(wall.start,wall.end)<o.width;}))return floor;
  return {...floor,walls,rooms:floor.rooms.map(r=>({...r,polygon:r.polygon.map(shifted)})),openings:floor.openings.map(o=>{const wall=walls.find(w=>w.id===o.wallId)!;return {...o,offset:Math.max(0,Math.min(o.offset,distance(wall.start,wall.end)-o.width))};})};
}
export function moveWall(floor: Floor, wallId: string, delta: Point): Floor {
 const wall=floor.walls.find(w=>w.id===wallId);return wall?translateVertices(floor,[wall.start,wall.end],delta):floor;
}
export function moveRoom(floor: Floor, roomId: string, delta: Point): Floor {
 const room=floor.rooms.find(r=>r.id===roomId);return room?translateVertices(floor,room.polygon,delta):floor;
}
export function resizeWall(floor: Floor, wallId: string, length: number): Floor {
  const wall = floor.walls.find(w => w.id === wallId); if (!wall || length < .1) return floor;
  const end = wallPoint(wall, length);
  return { ...floor, rooms: floor.rooms.map(r=>({...r,polygon:r.polygon.map(p=>distance(p,wall.end)<.001?end:p)})), walls: floor.walls.map(w => ({ ...w, start: w.id !== wallId && distance(w.start, wall.end) < .001 ? end : w.start, end: distance(w.end, wall.end) < .001 ? end : w.end })), openings: floor.openings.map(o => { if (o.wallId !== wallId) return o; const width = Math.min(o.width, length); return { ...o, width, offset: Math.max(0, Math.min(o.offset, length - width)) }; }) };
}
export function polygonArea(points: Point[]) { return Math.abs(points.reduce((total, p, i) => { const next = points[(i + 1) % points.length]; return total + p.x * next.y - next.x * p.y; }, 0)) / 2; }
export function centre(points: Point[]): Point { return points.length ? { x: points.reduce((a, p) => a + p.x, 0) / points.length, y: points.reduce((a, p) => a + p.y, 0) / points.length } : { x: 0, y: 0 }; }
export function floorBounds(floor: Floor, includeBackground = true) {
  const points = [...floor.walls.flatMap(w => [w.start, w.end]), ...floor.rooms.flatMap(r => r.polygon), ...floor.symbols.map(s => s.position), ...floor.routes.flatMap(r => r.points)];
  if (includeBackground && floor.background) { const b = floor.background; points.push(b.origin, { x: b.origin.x + b.width * b.metresPerPixel, y: b.origin.y + b.height * b.metresPerPixel }); }
  if (!points.length) return { minX: 0, maxX: 20, minY: 0, maxY: 14, width: 20, height: 14 };
  const minX = Math.min(...points.map(p => p.x)) - .6, maxX = Math.max(...points.map(p => p.x)) + .6, minY = Math.min(...points.map(p => p.y)) - .6, maxY = Math.max(...points.map(p => p.y)) + .6;
  return { minX, maxX, minY, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}
