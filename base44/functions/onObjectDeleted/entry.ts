import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();

    if (event.type !== 'delete') {
      return Response.json({ error: 'Only delete events are supported' }, { status: 400 });
    }

    // Haal alle taken op en verwijder die met dit object_id
    const allTasks = await base44.asServiceRole.entities.Task.list();
    const tasksToDelete = allTasks.filter(t => t.object_id === event.entity_id);

    // Verwijder alle taken voor dit object
    for (const task of tasksToDelete) {
      await base44.asServiceRole.entities.Task.delete(task.id);
    }

    return Response.json({ 
      success: true, 
      deletedTasksCount: tasksToDelete.length 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});