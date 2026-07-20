import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function nowIso() { return new Date().toISOString(); }
function secondsFromTime(time) { if (!time) return null; const [h, m = 0] = String(time).split(':').map(Number); return Number.isFinite(h) ? h * 3600 + (Number.isFinite(m) ? m * 60 : 0) : null; }
function safeNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function taskName(task, index, count) { return count > 1 && index ? `${task.name || task.object_name || task.task_type} (${index}/${count})` : (task.name || task.object_name || task.task_type || 'Taak'); }
function unwrapFunctionData(response) { return response?.data || response || null; }
function unique(values) { return [...new Set((values || []).filter(Boolean).map(String))]; }

function normalizeRoutingStatus(resolution) {
  if (!resolution) return 'blocked';
  if (resolution.status === 'resolved' && resolution.planning_allowed === true) return 'resolved';
  if (resolution.status === 'blocked' || (resolution.blocking_reasons || []).length > 0) return 'blocked';
  if (resolution.status === 'manual_review_required' || resolution.manual_review_required === true) return 'manual_review_required';
  return 'blocked';
}

function compactRoutingSnapshot(resolution, serviceContext, source) {
  if (!resolution) return {
    status: 'blocked',
    source,
    service_context: serviceContext,
    blocking_reasons: ['Contractresolver gaf geen resultaat terug.'],
    resolved_at: nowIso(),
  };
  return {
    status: normalizeRoutingStatus(resolution),
    source,
    resolved_at: nowIso(),
    personnel_id: resolution.personnel_id || null,
    company_id: resolution.company_id || serviceContext.operating_company_id || null,
    contract_id: resolution.contract_id || null,
    cao_key: resolution.cao_key || resolution.selected_contract?.cao_key || serviceContext.cao_key || null,
    cao_configuration_id: resolution.cao_configuration_id || null,
    cao_version_label: resolution.cao_version_label || null,
    planning_allowed: resolution.planning_allowed === true,
    payroll_final_allowed: resolution.payroll_final_allowed === true,
    manual_review_required: resolution.manual_review_required === true,
    blocking_reasons: resolution.blocking_reasons || [],
    manual_review_reasons: resolution.manual_review_reasons || [],
    warnings: resolution.warnings || [],
    contract_selection_policy: resolution.contract_selection_policy || null,
    selected_contract: resolution.selected_contract ? {
      id: resolution.selected_contract.id,
      function_type: resolution.selected_contract.function_type || null,
      allowed_function_types: resolution.selected_contract.allowed_function_types || [],
      contract_start_date: resolution.selected_contract.contract_start_date || null,
      contract_end_date: resolution.selected_contract.statutory_conversion_applies === true
        ? (resolution.selected_contract.effective_contract_end_date || null)
        : (resolution.selected_contract.effective_contract_end_date
          ?? resolution.selected_contract.contract_end_date
          ?? null),
      legal_validation_status: resolution.selected_contract.legal_validation_status || null,
    } : null,
    function_match: resolution.function_match || null,
    qualification_check_status: resolution.qualification_check?.status || null,
    wpbr_permission_check_status: resolution.wpbr_permission_check?.status || null,
    service_context: serviceContext,
  };
}

function buildTaskContext(task, sourceTask, object, sourceRoute, route, serviceDate) {
  const operatingCompanyId = task.operating_company_id
    || sourceTask.operating_company_id
    || object.default_operating_company_id
    || object.operating_company_id
    || route.operating_company_id
    || sourceRoute.operating_company_id
    || null;
  return {
    service_date: serviceDate,
    operating_company_id: operatingCompanyId,
    company_id: operatingCompanyId,
    cao_key: task.cao_key || sourceTask.cao_key || object.cao_key || route.cao_key || sourceRoute.cao_key || null,
    function_type: task.service_function_type || sourceTask.service_function_type || object.default_service_function_type || null,
    task_type: task.task_type || sourceTask.task_type || null,
    cao_function_group: task.required_cao_function_group || sourceTask.required_cao_function_group || object.default_cao_function_group || null,
    cao_function_level: task.required_cao_function_level || sourceTask.required_cao_function_level || object.default_cao_function_level || null,
    security_role_status: task.required_security_role_status || sourceTask.required_security_role_status || object.default_security_role_status || null,
    performs_security_work: task.performs_security_work ?? sourceTask.performs_security_work ?? object.default_performs_security_work ?? object.performs_security_work ?? null,
    security_work_percentage: task.security_work_percentage ?? sourceTask.security_work_percentage ?? object.default_security_work_percentage ?? object.security_work_percentage ?? null,
    works_event_or_hospitality_security: task.works_event_or_hospitality_security ?? sourceTask.works_event_or_hospitality_security ?? object.default_works_event_or_hospitality_security ?? object.works_event_or_hospitality_security ?? null,
    event_hospitality_cao_applies: task.event_hospitality_cao_applies ?? sourceTask.event_hospitality_cao_applies ?? object.default_event_hospitality_cao_applies ?? object.event_hospitality_cao_applies ?? null,
    works_cash_value_logistics: task.works_cash_value_logistics ?? sourceTask.works_cash_value_logistics ?? object.default_works_cash_value_logistics ?? object.works_cash_value_logistics ?? null,
    object_id: task.object_id || sourceTask.object_id || object.id || null,
    contract_assignment_policy: 'strict_contract_match',
  };
}

function taskContextKey(context) {
  return JSON.stringify({
    service_date: context.service_date,
    operating_company_id: context.operating_company_id,
    cao_key: context.cao_key,
    function_type: context.function_type,
    task_type: context.task_type,
    cao_function_group: context.cao_function_group,
    cao_function_level: context.cao_function_level,
    security_role_status: context.security_role_status,
    performs_security_work: context.performs_security_work,
    security_work_percentage: context.security_work_percentage,
    works_event_or_hospitality_security: context.works_event_or_hospitality_security,
    event_hospitality_cao_applies: context.event_hospitality_cao_applies,
    works_cash_value_logistics: context.works_cash_value_logistics,
  });
}

function contextByKey(contexts, key) {
  return contexts.find(context => taskContextKey(context) === key) || {};
}

async function resolveTaskContexts(base44, employeeId, contexts) {
  const uniqueContexts = new Map();
  contexts.forEach(context => uniqueContexts.set(taskContextKey(context), context));
  const resolved = await Promise.all([...uniqueContexts.entries()].map(async ([key, context]) => {
    try {
      const response = await base44.asServiceRole.functions.invoke('resolvePersonnelContractForService', {
        personnel_id: employeeId,
        company_id: context.operating_company_id,
        operating_company_id: context.operating_company_id,
        object_id: context.object_id,
        service_date: context.service_date,
        service_context: context,
      });
      return [key, unwrapFunctionData(response)];
    } catch (error) {
      return [key, {
        status: 'blocked',
        planning_allowed: false,
        payroll_final_allowed: false,
        manual_review_required: true,
        blocking_reasons: [`Contractresolver fout: ${error?.message || String(error)}`],
      }];
    }
  }));
  return new Map(resolved);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    const body = await req.json();
    const plannedResult = body.plannedResult || body.result || body;
    const serviceDate = body.service_date || null;
    const optimizationJobId = body.optimization_job_id || body.local_job_id || null;
    const [objects, routeExecutions, sourceRoutes, sourceTasks] = await Promise.all([
      base44.asServiceRole.entities.SurveillanceObject.list(),
      base44.asServiceRole.entities.RouteExecution.list(),
      base44.asServiceRole.entities.Route.list(),
      base44.asServiceRole.entities.Task.list(),
    ]);
    const objectById = new Map(objects.map(object => [String(object.id), object]));
    const routeById = new Map(sourceRoutes.map(route => [String(route.id), route]));
    const taskById = new Map(sourceTasks.map(task => [String(task.id), task]));
    const created = [];
    const blocked = [];

    for (const route of plannedResult.routes || []) {
      const sourceRouteId = route.manual_route_id || route.route_id || route.id || null;
      const sourceRoute = routeById.get(String(sourceRouteId || '')) || {};
      const existing = routeExecutions.find(item => String(item.source_route_id || item.route_id || '') === String(sourceRouteId || '') && (serviceDate ? item.service_date === serviceDate : item.weekday === route.weekday));
      if (existing && ['active', 'completed'].includes(existing.status) && !body.force_overwrite) {
        blocked.push({ route_id: sourceRouteId, route_execution_id: existing.id, reason: 'Bestaande actieve of voltooide uitvoering wordt niet overschreven.' });
        continue;
      }
      const routeTasks = route.tasks || route.optimized_order || [];
      const taskContexts = routeTasks.map(task => {
        const sourceTask = taskById.get(String(task.original_task_id || task.task_id || '')) || {};
        const object = objectById.get(String(task.object_id || sourceTask.object_id || '')) || {};
        return buildTaskContext(task, sourceTask, object, sourceRoute, route, serviceDate);
      });
      const operatingCompanyIds = unique(taskContexts.map(context => context.operating_company_id));
      if (operatingCompanyIds.length > 1) {
        blocked.push({ route_id: sourceRouteId, reason: 'Een route kan niet over meerdere juridische werkgevers worden verdeeld.', operating_company_ids: operatingCompanyIds });
        continue;
      }
      const routeEmployeeId = route.employee_id || route.personnel_id || null;
      let routeRoutingStatus = routeEmployeeId ? 'manual_review_required' : 'not_applicable';
      let routeRoutingSnapshot = routeEmployeeId ? {
        status: 'manual_review_required',
        source: 'optimization_route_without_service_date',
        resolved_at: nowIso(),
        manual_review_reasons: ['Een concrete servicedatum is nodig voordat het arbeidscontract definitief aan de route kan worden gekoppeld.'],
      } : { status: 'not_applicable', source: 'optimization_route_without_employee', resolved_at: nowIso() };
      let resolutionByContext = new Map();
      if (routeEmployeeId && serviceDate) {
        resolutionByContext = await resolveTaskContexts(base44, routeEmployeeId, taskContexts);
        const failed = taskContexts.map(context => ({ context, resolution: resolutionByContext.get(taskContextKey(context)) }))
          .filter(item => normalizeRoutingStatus(item.resolution) !== 'resolved');
        if (failed.length > 0) {
          blocked.push({
            route_id: sourceRouteId,
            reason: 'Contract-, functie- of CAO-koppeling blokkeert deze personeelsinzet.',
            details: failed.map(item => compactRoutingSnapshot(item.resolution, item.context, 'optimization_task')),
          });
          continue;
        }
        const routeResolutions = taskContexts.map(context => resolutionByContext.get(taskContextKey(context)));
        const contractIds = unique(routeResolutions.map(resolution => resolution?.contract_id));
        if (contractIds.length !== 1) {
          blocked.push({ route_id: sourceRouteId, reason: 'De route leidt niet tot precies één arbeidscontract voor de toegewezen medewerker.', contract_ids: contractIds });
          continue;
        }
        routeRoutingStatus = 'resolved';
        routeRoutingSnapshot = {
          status: 'resolved',
          source: 'optimization_route',
          resolved_at: nowIso(),
          personnel_id: routeEmployeeId,
          company_id: operatingCompanyIds[0] || null,
          contract_id: contractIds[0],
          cao_keys: unique(routeResolutions.map(resolution => resolution?.cao_key || resolution?.selected_contract?.cao_key)),
          function_keys: unique([
            ...taskContexts.map(context => context.function_type),
            ...routeResolutions.map(resolution => resolution?.selected_contract?.function_type),
          ]),
          task_contexts: unique(taskContexts.map(taskContextKey)).map(key => compactRoutingSnapshot(resolutionByContext.get(key), contextByKey(taskContexts, key), 'optimization_task')),
        };
      }
      const routePayload = {
        route_id: sourceRouteId,
        route_name: route.manual_route_name || route.name || route.vehicle?.name || 'Route',
        source_route_id: sourceRouteId,
        weekday: Number(route.weekday || 1),
        service_date: serviceDate,
        employee_id: routeEmployeeId,
        employee_name: route.employee_name || route.personnel_name || null,
        operating_company_id: operatingCompanyIds[0] || route.operating_company_id || sourceRoute.operating_company_id || null,
        personnel_contract_id: routeRoutingSnapshot.contract_id || null,
        contract_function_key: routeRoutingSnapshot.function_keys?.length === 1 ? routeRoutingSnapshot.function_keys[0] : null,
        contract_cao_key: routeRoutingSnapshot.cao_keys?.length === 1 ? routeRoutingSnapshot.cao_keys[0] : null,
        contract_routing_status: routeRoutingStatus,
        contract_routing_snapshot: routeRoutingSnapshot,
        vehicle_id: route.vehicle?.id || route.vehicle_id || null,
        vehicle_license_plate: route.vehicle?.license_plate || route.license_plate || null,
        status: 'planned',
        shift_start_time: route.time_window_start || route.shift_start_time || '00:00',
        shift_end_time: route.time_window_end || route.shift_end_time || '00:00',
        start_location_name: route.start_location_name || null,
        start_latitude: safeNumber(route.start_latitude),
        start_longitude: safeNumber(route.start_longitude),
        end_location_name: route.end_location_name || null,
        end_latitude: safeNumber(route.end_latitude),
        end_longitude: safeNumber(route.end_longitude),
        total_planned_distance_km: route.stats?.total_distance_km ?? route.total_distance_km ?? null,
        total_planned_travel_minutes: route.stats?.total_travel_minutes ?? route.total_travel_minutes ?? null,
        total_planned_service_minutes: route.stats?.total_service_minutes ?? route.total_service_minutes ?? null,
        total_planned_route_minutes: route.stats?.total_route_minutes ?? route.total_route_minutes ?? null,
        generated_at: nowIso(),
        optimization_job_id: optimizationJobId,
        metadata: { source: 'optimization', contract_routing_status: routeRoutingStatus },
      };
      const routeExecution = existing ? await base44.asServiceRole.entities.RouteExecution.update(existing.id, routePayload) : await base44.asServiceRole.entities.RouteExecution.create(routePayload);
      const oldTasks = await base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: routeExecution.id });
      for (const oldTask of oldTasks.filter(task => !['arrived', 'started', 'completed'].includes(task.status))) await base44.asServiceRole.entities.TaskExecution.delete(oldTask.id);
      const taskPayloads = routeTasks.map((task, index) => {
        const sourceTask = taskById.get(String(task.original_task_id || task.task_id || '')) || {};
        const object = objectById.get(String(task.object_id || sourceTask.object_id || '')) || {};
        if (safeNumber(task.latitude ?? object.latitude) === null || safeNumber(task.longitude ?? object.longitude) === null) throw new Error(`Stop zonder coördinaten: ${task.name || task.task_id}`);
        const repeatCount = task.repeat_count ?? null;
        const repeatIndex = task.repeat_index ?? null;
        const serviceContext = buildTaskContext(task, sourceTask, object, sourceRoute, route, serviceDate);
        const resolution = routeEmployeeId && serviceDate ? resolutionByContext.get(taskContextKey(serviceContext)) : null;
        const routingSnapshot = routeEmployeeId
          ? (serviceDate
            ? compactRoutingSnapshot(resolution, serviceContext, 'optimization_task')
            : { ...routeRoutingSnapshot, service_context: serviceContext })
          : { status: 'not_applicable', source: 'optimization_task_without_employee', service_context: serviceContext, resolved_at: nowIso() };
        return {
          route_execution_id: routeExecution.id,
          source_route_id: sourceRouteId,
          original_task_id: String(task.original_task_id || task.task_id || sourceTask.id),
          object_id: String(task.object_id || sourceTask.object_id),
          sequence_index: Number(task.sequence_index ?? index + 1),
          task_name: taskName(task, repeatIndex, repeatCount),
          object_name: object.name || task.object_name || task.name || 'Object',
          task_type: task.task_type || 'Taak',
          operating_company_id: serviceContext.operating_company_id || null,
          personnel_contract_id: resolution?.contract_id || routeRoutingSnapshot.contract_id || null,
          contract_function_key: serviceContext.function_type || resolution?.selected_contract?.function_type || null,
          contract_cao_key: resolution?.cao_key || resolution?.selected_contract?.cao_key || serviceContext.cao_key || null,
          contract_routing_status: routeEmployeeId ? (serviceDate ? normalizeRoutingStatus(resolution) : 'manual_review_required') : 'not_applicable',
          contract_routing_snapshot: routingSnapshot,
          repeat_index: repeatIndex,
          repeat_count: repeatCount,
          split_index: task.split_index ?? null,
          split_count: task.split_count ?? null,
          custom_block_label: task.custom_block_label || null,
          status: 'pending',
          planned_arrival_time: task.planned_arrival_time || task.arrival_time || null,
          planned_start_time: task.planned_start_time || task.actual_start_time || null,
          planned_departure_time: task.planned_departure_time || task.departure_time || null,
          planned_arrival_seconds: secondsFromTime(task.planned_arrival_time || task.arrival_time),
          planned_departure_seconds: secondsFromTime(task.planned_departure_time || task.departure_time),
          duration_minutes: Number(task.duration_minutes || 0),
          travel_from_previous_minutes: task.travel_from_previous_minutes ?? task.travel_time_minutes ?? null,
          distance_from_previous_km: task.distance_from_previous_km ?? task.distance_km ?? null,
          travel_to_next_minutes: task.travel_to_next_minutes ?? null,
          distance_to_next_km: task.distance_to_next_km ?? null,
          latitude: safeNumber(task.latitude ?? object.latitude),
          longitude: safeNumber(task.longitude ?? object.longitude),
          address: task.address || object.address || null,
          locked_to_route: !!task.locked_to_route,
          locked_sequence: !!task.locked_sequence,
          route_pin_hard: !!task.locked_to_route,
          arrival_deadline_time: task.arrival_deadline_time || null,
          uses_arrival_deadline: !!task.uses_arrival_deadline,
          service_must_start_at: task.service_must_start_at || null,
          metadata: { optimizer_task_id: task.optimizer_task_id || null, contract_routing_status: routingSnapshot.status },
        };
      });
      if (taskPayloads.length) await base44.asServiceRole.entities.TaskExecution.bulkCreate(taskPayloads);
      created.push(routeExecution.id);
    }
    return Response.json({ created, blocked, server_time: nowIso() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
