export function routeStopsFromData(route, tasks, objects) {
  const objectById = new Map(objects.map(object => [object.id, object]));
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const seen = new Set();

  const optimizedItems = route.cached_optimization?.tasks?.length
    ? route.cached_optimization.tasks
    : (route.cached_optimization?.optimized_order || []).filter(item => item.object_id && !item.is_start && !item.is_end);

  const sourceItems = optimizedItems.length
    ? optimizedItems.map(item => ({ task: taskById.get(item.task_id) || item, object: objectById.get(item.object_id), planned: item }))
    : (route.assigned_tasks || []).flatMap(assignment => {
      const task = taskById.get(assignment.task_id);
      if (!task) return [];
      const objectIds = task.object_id ? [task.object_id] : (task.selected_object_ids || []);
      return objectIds.map(objectId => ({ task, object: objectById.get(objectId), planned: null }));
    });

  return sourceItems
    .filter(({ object }) => object?.latitude && object?.longitude)
    .filter(({ object }) => {
      if (seen.has(object.id)) return false;
      seen.add(object.id);
      return true;
    })
    .map(({ task, object, planned }, index) => ({
      id: object.id,
      sequence: index + 1,
      name: object.name,
      address: object.address,
      latitude: Number(object.latitude),
      longitude: Number(object.longitude),
      task_type: planned?.task_type || task.task_type,
      arrival_time: planned?.arrival_time,
      departure_time: planned?.departure_time,
    }));
}

export function routeTaskCopiesFromData(route, tasks, objects) {
  return routeStopsFromData(route, tasks, objects).map(stop => ({
    id: stop.id,
    sequence: stop.sequence,
    name: stop.name,
    address: stop.address,
    task_type: stop.task_type,
    arrival_time: stop.arrival_time,
    departure_time: stop.departure_time,
  }));
}

export function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const toRad = value => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}