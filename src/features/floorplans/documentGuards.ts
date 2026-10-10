import { z } from 'zod';
import type { FloorPlanDocument } from './model';

// Keep these constraints aligned with validateDesktopDocument on the server.
const text = (maximum = 250) => z.string().max(maximum).refine(value => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/);
const coordinate = z.number().finite().min(-100000).max(100000);
const point = z.object({ x: coordinate, y: coordinate }).strict();
const angle = z.number().finite().min(-3600).max(3600);
const wall = z.object({ id, start: point, end: point, thickness: z.number().finite().min(.01).max(5) }).strict()
  .refine(w => Math.hypot(w.start.x - w.end.x, w.start.y - w.end.y) >= .01);
const opening = z.object({ id, wallId: id, type: z.enum(['door', 'window', 'opening']), offset: z.number().finite().min(0).max(100000), width: z.number().finite().min(.05).max(50), hinge: z.enum(['left', 'right']), swing: z.enum(['in', 'out']) }).strict();
const room = z.object({ id, label: text(), polygon: z.array(point).min(3).max(500) }).strict().refine(room => Math.abs(room.polygon.reduce((sum, p, i) => { const next = room.polygon[(i + 1) % room.polygon.length]; return sum + p.x * next.y - next.x * p.y; }, 0)) / 2 >= .0001);
const symbol = z.object({ id, kind: z.enum(['camera', 'motion_detector', 'alarm_panel', 'access_control', 'smoke_detector', 'manual_call_point', 'fire_extinguisher', 'fire_hose', 'aed', 'emergency_exit', 'assembly_point', 'you_are_here', 'stairs', 'detector', 'fire_alarm', 'first_aid', 'emergency_light', 'lift', 'electrical']), position: point, rotation: angle, label: text(), installationId: id.optional() }).strict();
const route = z.object({ id, points: z.array(point).min(2).max(500), label: text() }).strict();
const background = z.object({ fileId: id, width: z.number().finite().min(1).max(20000), height: z.number().finite().min(1).max(20000), origin: point, metresPerPixel: z.number().finite().min(.000001).max(100), opacity: z.number().finite().min(0).max(1), calibrated: z.boolean() }).strict();
const print = z.object({ paper: z.enum(['A4', 'A3']), orientation: z.enum(['portrait', 'landscape']), scale: z.number().finite().min(1).max(10000), profile: z.enum(['evacuation', 'installation']), title: text(), address: text(500), drawingNumber: text(120), instructions: text(4000), secondaryInstructions: text(4000), language2: text(40), viewpoints: z.array(z.object({ id, label: text(), position: point, rotation: angle }).strict()).max(100), cropCenter: point.optional(), logoFileId: id.optional() }).strict();
const floor = z.object({ id, name: text(120).refine(name => !!name.trim()), elevation: z.number().finite().min(-1000).max(10000), walls: z.array(wall).max(5000), rooms: z.array(room).max(2000), openings: z.array(opening).max(4000), symbols: z.array(symbol).max(5000), routes: z.array(route).max(1000), background: background.optional(), print }).strict();
const geoReference = z.object({ crs: z.literal('EPSG:28992'), origin: z.object({x:z.number().finite().min(-1000000).max(1000000),y:z.number().finite().min(-1000000).max(1000000)}).strict(), rotation: z.literal(0), verticalDatum: z.literal('NAP'), axis: z.literal('x-east-y-north') }).strict();
const buildingReference = z.object({ id, manifestFileId:id, manifestSha256:z.string().regex(/^[a-f0-9]{64}$/), usedParts:z.array(z.enum(['footprint','aerial','roof'])).min(1).max(3), floorId:id, wallIds:z.array(id).max(5000), interpretation:z.enum(['closed_building','open_structure']), measurementStatus:z.enum(['unchecked','user_checked']), attributions:z.array(text(400)).max(8),modelFileId:id.optional() }).strict().refine(reference=>reference.usedParts.includes('roof')===Boolean(reference.modelFileId));
const documentFields = { id, title:text(), unit:z.literal('m'), floors:z.array(floor).min(1).max(30) };
export const floorPlanDocumentSchema = z.discriminatedUnion('schemaVersion', [
  z.object({...documentFields, schemaVersion:z.literal(1)}).strict(),
  z.object({...documentFields, schemaVersion:z.literal(2),geoReference:geoReference.optional(),buildingReferences:z.array(buildingReference).max(30).optional()}).strict(),
]).superRefine((doc, context) => {
  const ids = new Set<string>([doc.id]);
  let entries = doc.floors.length;
  for (const f of doc.floors) {
    for (const item of [f, ...f.walls, ...f.rooms, ...f.openings, ...f.symbols, ...f.routes, ...f.print.viewpoints]) {
      if (ids.has(item.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Alle tekenonderdelen moeten een uniek ID hebben.' });
      ids.add(item.id);
    }
    entries += f.walls.length + f.rooms.length + f.openings.length + f.symbols.length + f.routes.length + f.print.viewpoints.length;
    entries += f.rooms.reduce((n, r) => n + r.polygon.length, 0) + f.routes.reduce((n, r) => n + r.points.length, 0);
    const walls = new Map(f.walls.map(w => [w.id, w]));
    for (const opening of f.openings) {
      const wall = walls.get(opening.wallId);
      if (!wall || opening.offset + opening.width > Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) + .001) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Een deur of raam valt buiten de bijbehorende muur.' });
    }
  }
  if (doc.schemaVersion === 2 && doc.buildingReferences?.length) {
    if (!doc.geoReference) context.addIssue({code:z.ZodIssueCode.custom,message:'De geografische oorsprong ontbreekt.'});
    const references = new Set<string>();
    for (const reference of doc.buildingReferences) {
      if (references.has(reference.id) || new Set(reference.wallIds).size !== reference.wallIds.length || new Set(reference.usedParts).size !== reference.usedParts.length) context.addIssue({code:z.ZodIssueCode.custom,message:'De gebouwreferentie bevat dubbele onderdelen.'});
      references.add(reference.id);
    }
  }
  if (entries > 40000) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Het tekenbestand bevat te veel onderdelen.' });
  if (new TextEncoder().encode(JSON.stringify(doc)).length > 4 * 1024 * 1024) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Het tekenbestand mag maximaal 4 MiB groot zijn.' });
});
export function parseFloorPlanDocument(value: unknown): FloorPlanDocument | null {
  try {
    const json = JSON.stringify(value);
    if (!json || new TextEncoder().encode(json).length > 4 * 1024 * 1024) return null;
    const result = floorPlanDocumentSchema.safeParse(value);
    return result.success ? result.data as FloorPlanDocument : null;
  } catch { return null; }
}
