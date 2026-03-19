import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Haal alle taken en objecten op
    const allTasks = await base44.asServiceRole.entities.Task.list();
    const allObjects = await base44.asServiceRole.entities.SurveillanceObject.list();
    const objectIds = new Set(allObjects.map(o => o.id));

    // Vind orphaned tasks (object_id niet meer in database)
    const orphanedTasks = allTasks.filter(t => !objectIds.has(t.object_id));

    // Verwijder alle orphaned tasks
    for (const task of orphanedTasks) {
      await base44.asServiceRole.entities.Task.delete(task.id);
    }

    return Response.json({ 
      success: true, 
      deletedCount: orphanedTasks.length,
      taskIds: orphanedTasks.map(t => t.id)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});