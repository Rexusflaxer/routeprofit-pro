import { distance, wallPoint } from './geometry';
export type Point = { x: number; y: number };
export type Wall = { id: string; start: Point; end: Point; thickness: number };
export type Opening = { id: string; wallId: string; type: 'door' | 'window' | 'opening'; offset: number; width: number; hinge: 'left' | 'right'; swing: 'in' | 'out' };
export type Room = { id: string; label: string; polygon: Point[] };
export type PlanSymbol = { id: string; kind: string; position: Point; rotation: number; label: string; installationId?: string };
export type Route = { id: string; points: Point[]; label: string };
export type PrintSettings = { paper: 'A4' | 'A3'; orientation: 'portrait' | 'landscape'; scale: number; profile: 'evacuation' | 'installation'; title: string; address: string; drawingNumber: string; instructions: string; secondaryInstructions: string; language2: string; cropCenter?: Point; logoFileId?:string; viewpoints: { id: string; label: string; position: Point; rotation: number }[] };
export type Floor = { id: string; name: string; elevation: number; walls: Wall[]; rooms: Room[]; openings: Opening[]; symbols: PlanSymbol[]; routes: Route[]; background?: { fileId: string; width: number; height: number; origin: Point; metresPerPixel: number; opacity: number; calibrated: boolean }; print: PrintSettings };
export type BuildingGeoReference = { crs: 'EPSG:28992'; origin: Point; rotation: 0; verticalDatum: 'NAP'; axis: 'x-east-y-north' };
export type BuildingReference = { id: string; manifestFileId: string; manifestSha256: string; usedParts: ('footprint' | 'aerial' | 'roof')[]; floorId: string; wallIds: string[]; interpretation: 'closed_building' | 'open_structure'; measurementStatus: 'unchecked' | 'user_checked'; attributions: string[]; modelFileId?:string };
export type FloorPlanDocument = { schemaVersion: 1 | 2; id: string; title: string; unit: 'm'; floors: Floor[]; geoReference?: BuildingGeoReference; buildingReferences?: BuildingReference[] };
export type Issue = { severity: 'error' | 'warning'; floorId: string; elementId?: string; message: string };
export const uid = () => globalThis.crypto?.randomUUID?.() || `fp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export function createFloor(name = 'Begane grond'): Floor {
  return { id: uid(), name, elevation: 0, walls: [], rooms: [], openings: [], symbols: [], routes: [], print: { paper: 'A3', orientation: 'landscape', scale: 100, profile: 'evacuation', title: 'Ontruimingsplattegrond', address: '', drawingNumber: '', instructions: 'Bij brand: waarschuw de aanwezigen en bel 112.\nVerlaat het gebouw via de aangegeven vluchtroute.\nGebruik geen lift. Ga naar de verzamelplaats.', secondaryInstructions: '', language2: '', viewpoints: [] } };
}
export function createDocument(title = 'Gebouwplattegrond'): FloorPlanDocument { return { schemaVersion: 1, id: uid(), title, unit: 'm', floors: [createFloor()] }; }
export function cloneDocument<T>(value: T): T { return structuredClone(value); }
export function duplicateFloor(floor: Floor): Floor {
  const copy = cloneDocument(floor); copy.id = uid(); copy.name = `${floor.name.slice(0,110)} — kopie`;
  const wallIds = new Map<string, string>(); copy.walls.forEach(wall => { const next = uid(); wallIds.set(wall.id, next); wall.id = next; });
  copy.openings.forEach(opening => { opening.id = uid(); opening.wallId = wallIds.get(opening.wallId)!; });
  [...copy.rooms, ...copy.symbols, ...copy.routes, ...copy.print.viewpoints].forEach(item => { item.id = uid(); });
  return copy;
}
export function validateDocument(document: FloorPlanDocument): Issue[] {
  const issues: Issue[] = [];
  for (const floor of document.floors) {
    const add = (severity: Issue['severity'], message: string, elementId?: string) => issues.push({ severity, message, floorId: floor.id, elementId });
    if (!floor.walls.length) add('error', `${floor.name}: teken of bevestig eerst muren.`);
    if (floor.background && !floor.background.calibrated) add('error', `${floor.name}: bevestig de schaal van de onderlegger.`);
    if (document.buildingReferences?.some(reference => reference.floorId === floor.id && reference.measurementStatus === 'unchecked')) add('warning', `${floor.name}: de openbare buitenvorm bevat nog geen nagemeten maten.`);
    if (!Number.isFinite(floor.print.scale) || floor.print.scale <= 0) add('error', `${floor.name}: kies een geldige afdrukschaal.`);
    floor.walls.forEach(wall => { if (distance(wall.start, wall.end) < .1 || ![wall.start.x, wall.start.y, wall.end.x, wall.end.y, wall.thickness].every(Number.isFinite) || wall.thickness <= 0) add('error', 'Een muur heeft ongeldige afmetingen.', wall.id); });
    floor.openings.forEach(opening => { const wall = floor.walls.find(w => w.id === opening.wallId); if (!wall || opening.width <= 0 || opening.offset < 0 || opening.offset + opening.width > distance(wall.start, wall.end) + .001) add('error', 'Een deur of raam valt buiten de bijbehorende muur.', opening.id); });
    floor.rooms.forEach(room => { if (!room.label.trim()) add('warning', 'Geef deze ruimte een naam.', room.id); });
    floor.symbols.forEach(symbol => { if (!symbol.label.trim()) add('warning', 'Geef deze voorziening een label.', symbol.id); });
    floor.routes.forEach(route => {
      if (route.points.length < 2) add('error', 'Een vluchtroute heeft minstens twee punten nodig.', route.id);
      else { const end = route.points.at(-1)!; const exits = floor.symbols.filter(s => ['emergency_exit', 'assembly_point'].includes(s.kind)); const doors = floor.openings.filter(o => o.type === 'door').map(o => { const wall = floor.walls.find(w => w.id === o.wallId); return wall ? wallPoint(wall, o.offset + o.width / 2) : null; }).filter(Boolean) as Point[]; if (![...exits.map(s => s.position), ...doors].some(p => distance(p, end) <= 1)) add('warning', 'Een vluchtroute eindigt niet bij een uitgang of deur.', route.id); }
    });
    if (floor.print.profile === 'evacuation' && !floor.print.viewpoints.length && !floor.symbols.some(s => s.kind === 'you_are_here')) add('warning', `${floor.name}: voeg een locatieaanduiding toe.`);
    if (floor.print.profile === 'evacuation' && !floor.symbols.some(s => s.kind === 'emergency_exit')) add('warning', `${floor.name}: plaats minimaal één nooduitgang.`);
  }
  return issues;
}
export function historyPush(history: FloorPlanDocument[], value: FloorPlanDocument) { return [...history.slice(-79), cloneDocument(value)]; }
export const createId = uid;
