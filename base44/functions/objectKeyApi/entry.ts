import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const text = (value: unknown) => String(value || '').trim();
const normalizeNumber = value => text(value).normalize('NFKC').toLocaleUpperCase('nl-NL');

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await req.json();
    const action = text(body.action);
    const objectId = text(body.object_id);
    const customerId = text(body.customer_id);
    const db = base44.asServiceRole.entities;

    const loadObjectData = async () => {
      const [sets, assignments, keys] = await Promise.all([
        db.ObjectKeySet.filter({ object_id: objectId }, 'set_number', 500),
        db.ObjectKeyAssignment.filter({ object_id: objectId }, '-created_date', 500),
        db.ObjectKey.filter({}, 'serial_number', 500),
      ]);
      const keyById = new Map(keys.map(key => [key.id, key]));
      const linkedIds = new Set(assignments.map(item => item.key_id));
      return {
        sets: sets.map(set => ({ ...set, keys: assignments.filter(item => item.key_set_id === set.id).map(item => ({ ...keyById.get(item.key_id), assignment_id: item.id, key_set_id: set.id })).filter(item => item.id) })),
        available_keys: keys.filter(key => !linkedIds.has(key.id)),
        brands: [...new Set(keys.map(key => text(key.brand)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl')),
      };
    };

    if (action === 'list') {
      if (!objectId) return Response.json({ error: 'Object-ID ontbreekt.' }, { status: 400 });
      return Response.json(await loadObjectData());
    }

    const resolveSet = async () => {
      const sets = await db.ObjectKeySet.filter({ object_id: objectId }, 'set_number', 500);
      const requestedId = text(body.key_set_id);
      if (requestedId) {
        const selected = sets.find(set => set.id === requestedId);
        if (!selected) throw new Error('De gekozen sleutelset bestaat niet meer.');
        return selected;
      }
      if (!sets.length || body.create_new_set === true) {
        const keyNumber = text(body.set_key_number);
        const normalized = normalizeNumber(keyNumber);
        if (!keyNumber) throw new Error('Vul het sleutelnummer van de nieuwe sleutelset in.');
        const duplicate = await db.ObjectKeySet.filter({ key_number_normalized: normalized }, '-created_date', 1);
        if (duplicate.length) throw new Error('Dit sleutelnummer bestaat al. Gebruik een uniek sleutelnummer voor de sleutelset.');
        const nextNumber = sets.reduce((max, set) => Math.max(max, Number(set.set_number || 0)), 0) + 1;
        return await db.ObjectKeySet.create({ customer_id: customerId, object_id: objectId, set_number: nextNumber, display_label: `Sleutelset ${nextNumber}`, key_number: keyNumber, key_number_normalized: normalized });
      }
      throw new Error('Kies een sleutelset.');
    };

    if (!objectId || !customerId) return Response.json({ error: 'Klant- en objectgegevens ontbreken.' }, { status: 400 });

    if (action === 'create') {
      if (!text(body.key_type) || !text(body.brand)) return Response.json({ error: 'Vul type en merk in.' }, { status: 400 });
      const set = await resolveSet();
      const key = await db.ObjectKey.create({ key_type: text(body.key_type), brand: text(body.brand), serial_number: text(body.serial_number) || null, status: text(body.status) || 'in_storage' });
      try {
        await db.ObjectKeyAssignment.create({ customer_id: customerId, object_id: objectId, key_id: key.id, key_set_id: set.id });
      } catch (error) {
        await db.ObjectKey.delete(key.id);
        throw error;
      }
      return Response.json({ key, key_set: set });
    }

    if (action === 'link') {
      const keyId = text(body.key_id);
      const key = await db.ObjectKey.get(keyId);
      if (!key) return Response.json({ error: 'De gekozen sleutel bestaat niet meer.' }, { status: 404 });
      const existing = await db.ObjectKeyAssignment.filter({ object_id: objectId, key_id: keyId }, '-created_date', 1);
      if (existing.length) return Response.json({ error: 'Deze sleutel is al aan dit object gekoppeld.' }, { status: 409 });
      const set = await resolveSet();
      await db.ObjectKeyAssignment.create({ customer_id: customerId, object_id: objectId, key_id: keyId, key_set_id: set.id });
      return Response.json({ key, key_set: set });
    }

    if (action === 'update') {
      const keyId = text(body.key_id);
      const set = await resolveSet();
      const key = await db.ObjectKey.update(keyId, { key_type: text(body.key_type), brand: text(body.brand), serial_number: text(body.serial_number) || null, status: text(body.status) || 'in_storage' });
      await db.ObjectKeyAssignment.update(text(body.assignment_id), { key_set_id: set.id });
      return Response.json({ key, key_set: set });
    }

    if (action === 'unlink') {
      const assignmentId = text(body.assignment_id);
      const keyId = text(body.key_id);
      await db.ObjectKeyAssignment.delete(assignmentId);
      const remaining = await db.ObjectKeyAssignment.filter({ key_id: keyId }, '-created_date', 1);
      if (!remaining.length) await db.ObjectKey.delete(keyId);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Onbekende actie.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'Sleutelbeheer is mislukt.' }, { status: 500 });
  }
}