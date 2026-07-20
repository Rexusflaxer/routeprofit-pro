import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

function nowIso() { return new Date().toISOString(); }
function unwrapFunctionData(response) { return response?.data || response || null; }
function unique(values) { return [...new Set((values || []).filter(Boolean).map(String))]; }

function normalizeRoutingStatus(resolution) {
  if (!resolution) return 'blocked';
  if (resolution.status === 'resolved' && resolution.planning_allowed === true) return 'resolved';
  if (resolution.status === 'blocked' || (resolution.blocking_reasons || []).length > 0) return 'blocked';
  if (resolution.status === 'manual_review_required' || resolution.manual_review_required === true) return 'manual_review_required';
  return 'blocked';
}

function buildTaskContext(taskExecution, sourceTask, object, sourceRoute, routeExecution) {
  const savedContext = taskExecution.contract_routing_snapshot?.service_context || {};
  const operatingCompanyId = savedContext.operating_company_id
    || taskExecution.operating_company_id
    || sourceTask.operating_company_id
    || object.default_operating_company_id
    || object.operating_company_id
    || routeExecution.operating_company_id
    || sourceRoute.operating_company_id
    || null;

  return {
    ...savedContext,
    service_date: routeExecution.service_date,
    operating_company_id: operatingCompanyId,
    company_id: operatingCompanyId,
    cao_key: savedContext.cao_key
      || taskExecution.contract_cao_key
      || sourceTask.cao_key
      || object.cao_key
      || sourceRoute.cao_key
      || null,
    function_type: savedContext.function_type
      || taskExecution.contract_function_key
      || sourceTask.service_function_type
      || object.default_service_function_type
      || null,
    task_type: savedContext.task_type || taskExecution.task_type || sourceTask.task_type || null,
    cao_function_group: savedContext.cao_function_group
      || sourceTask.required_cao_function_group
      || object.default_cao_function_group
      || null,
    cao_function_level: savedContext.cao_function_level
      || sourceTask.required_cao_function_level
      || object.default_cao_function_level
      || null,
    security_role_status: savedContext.security_role_status
      || sourceTask.required_security_role_status
      || object.default_security_role_status
      || null,
    performs_security_work: savedContext.performs_security_work
      ?? sourceTask.performs_security_work
      ?? object.default_performs_security_work
      ?? object.performs_security_work
      ?? null,
    security_work_percentage: savedContext.security_work_percentage
      ?? sourceTask.security_work_percentage
      ?? object.default_security_work_percentage
      ?? object.security_work_percentage
      ?? null,
    works_event_or_hospitality_security: savedContext.works_event_or_hospitality_security
      ?? sourceTask.works_event_or_hospitality_security
      ?? object.default_works_event_or_hospitality_security
      ?? object.works_event_or_hospitality_security
      ?? null,
    event_hospitality_cao_applies: savedContext.event_hospitality_cao_applies
      ?? sourceTask.event_hospitality_cao_applies
      ?? object.default_event_hospitality_cao_applies
      ?? object.event_hospitality_cao_applies
      ?? null,
    works_cash_value_logistics: savedContext.works_cash_value_logistics
      ?? sourceTask.works_cash_value_logistics
      ?? object.default_works_cash_value_logistics
      ?? object.works_cash_value_logistics
      ?? null,
    route_id: sourceRoute.id || routeExecution.source_route_id || routeExecution.route_id || null,
    task_id: sourceTask.id || taskExecution.original_task_id || null,
    object_id: object.id || taskExecution.object_id || sourceTask.object_id || null,
    contract_assignment_policy: 'strict_contract_match',
  };
}

function contextKey(context) {
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

function compactRoutingSnapshot(resolution, serviceContext, source, assignedBy) {
  return {
    status: normalizeRoutingStatus(resolution),
    source,
    resolved_at: nowIso(),
    resolved_by: assignedBy || null,
    personnel_id: resolution?.personnel_id || null,
    company_id: resolution?.company_id || serviceContext.operating_company_id || null,
    contract_id: resolution?.contract_id || resolution?.selected_contract?.id || null,
    cao_key: resolution?.cao_key || resolution?.selected_contract?.cao_key || serviceContext.cao_key || null,
    cao_configuration_id: resolution?.cao_configuration_id || null,
    planning_allowed: resolution?.planning_allowed === true,
    payroll_final_allowed: resolution?.payroll_final_allowed === true,
    manual_review_required: resolution?.manual_review_required === true,
    blocking_reasons: resolution?.blocking_reasons || [],
    manual_review_reasons: resolution?.manual_review_reasons || [],
    warnings: resolution?.warnings || [],
    selected_contract: resolution?.selected_contract ? {
      id: resolution.selected_contract.id,
      function_type: resolution.selected_contract.function_type || null,
      allowed_function_types: resolution.selected_contract.allowed_function_types || [],
      cao_key: resolution.selected_contract.cao_key || null,
      contract_start_date: resolution.selected_contract.contract_start_date || null,
      contract_end_date: resolution.selected_contract.contract_end_date || null,
      legal_validation_status: resolution.selected_contract.legal_validation_status || null,
    } : null,
    function_match: resolution?.function_match || null,
    service_context: serviceContext,
  };
}

async function resolveContexts(base44, personnelId, contexts, requestedContractId) {
  const byKey = new Map();
  contexts.forEach(context => byKey.set(contextKey(context), context));
  const entries = await Promise.all([...byKey.entries()].map(async ([key, context]) => {
    try {
      const response = await base44.asServiceRole.functions.invoke('resolvePersonnelContractForService', {
        personnel_id: personnelId,
        contract_id: requestedContractId || null,
        company_id: context.operating_company_id,
        operating_company_id: context.operating_company_id,
        route_id: context.route_id,
        task_id: context.task_id,
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
  return new Map(entries);
}

async function clearAssignment(base44, routeExecution, taskExecutions, user) {
  const clearedAt = nowIso();
  for (const task of taskExecutions) {
    const serviceContext = task.contract_routing_snapshot?.service_context || null;
    await base44.asServiceRole.entities.TaskExecution.update(task.id, {
      personnel_contract_id: null,
      contract_function_key: serviceContext?.function_type || task.contract_function_key || null,
      contract_cao_key: serviceContext?.cao_key || task.contract_cao_key || null,
      contract_routing_status: 'not_applicable',
      contract_routing_snapshot: {
        status: 'not_applicable',
        source: 'route_assignment_cleared',
        resolved_at: clearedAt,
        resolved_by: user?.email || user?.id || null,
        service_context: serviceContext,
      },
    });
  }
  return base44.asServiceRole.entities.RouteExecution.update(routeExecution.id, {
    employee_id: null,
    employee_name: null,
    personnel_contract_id: null,
    contract_function_key: null,
    contract_cao_key: null,
    contract_routing_status: 'not_applicable',
    contract_routing_snapshot: {
      status: 'not_applicable',
      source: 'route_assignment_cleared',
      resolved_at: clearedAt,
      resolved_by: user?.email || user?.id || null,
    },
    mobile_route_package_cache: null,
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const routeExecutionId = body.route_execution_id;
    const personnelId = body.personnel_id || body.employee_id || null;
    if (!routeExecutionId) return Response.json({ error: 'route_execution_id is verplicht.' }, { status: 400 });

    const routeExecution = await base44.asServiceRole.entities.RouteExecution.get(routeExecutionId).catch(() => null);
    if (!routeExecution) return Response.json({ error: 'Route-uitvoering niet gevonden.' }, { status: 404 });
    if (routeExecution.status !== 'planned') {
      return Response.json({ error: 'Personeel kan alleen worden gewijzigd zolang de route gepland en nog niet gedownload of gestart is.' }, { status: 409 });
    }

    const taskExecutions = await base44.asServiceRole.entities.TaskExecution.filter({ route_execution_id: routeExecutionId });
    if (!personnelId) {
      const clearedRoute = await clearAssignment(base44, routeExecution, taskExecutions, user);
      return Response.json({ success: true, assignment_status: 'cleared', route_execution: clearedRoute });
    }
    if (!routeExecution.service_date) {
      return Response.json({ error: 'Een concrete servicedatum is verplicht voordat een contract kan worden gekoppeld.' }, { status: 409 });
    }

    const [personnel, sourceRoutes, sourceTasks, objects] = await Promise.all([
      base44.asServiceRole.entities.Personnel.get(personnelId).catch(() => null),
      base44.asServiceRole.entities.Route.list(),
      base44.asServiceRole.entities.Task.list(),
      base44.asServiceRole.entities.SurveillanceObject.list(),
    ]);
    if (!personnel) return Response.json({ error: 'Medewerker niet gevonden.' }, { status: 404 });

    const sourceRoute = sourceRoutes.find(route => String(route.id) === String(routeExecution.source_route_id || routeExecution.route_id || '')) || {};
    const sourceTaskById = new Map(sourceTasks.map(task => [String(task.id), task]));
    const objectById = new Map(objects.map(object => [String(object.id), object]));
    const contexts = taskExecutions.map(taskExecution => {
      const sourceTask = sourceTaskById.get(String(taskExecution.original_task_id || '')) || {};
      const object = objectById.get(String(taskExecution.object_id || sourceTask.object_id || '')) || {};
      return buildTaskContext(taskExecution, sourceTask, object, sourceRoute, routeExecution);
    });
    if (contexts.length === 0) {
      contexts.push({
        service_date: routeExecution.service_date,
        operating_company_id: routeExecution.operating_company_id || sourceRoute.operating_company_id || null,
        company_id: routeExecution.operating_company_id || sourceRoute.operating_company_id || null,
        cao_key: routeExecution.contract_cao_key || sourceRoute.cao_key || null,
        function_type: routeExecution.contract_function_key || null,
        route_id: sourceRoute.id || routeExecution.source_route_id || routeExecution.route_id || null,
        contract_assignment_policy: 'strict_contract_match',
      });
    }

    const operatingCompanyIds = unique(contexts.map(context => context.operating_company_id));
    if (operatingCompanyIds.length !== 1) {
      return Response.json({
        success: false,
        assignment_status: 'blocked',
        error: operatingCompanyIds.length > 1
          ? 'Een route mag niet over meerdere juridische werkgevers worden verdeeld. Splits de route per bedrijf.'
          : 'Het uitvoerende bedrijf ontbreekt in de route- of taakcontext.',
        operating_company_ids: operatingCompanyIds,
      }, { status: 409 });
    }

    const resolutionByContext = await resolveContexts(base44, personnelId, contexts, body.contract_id || null);
    const failed = contexts.map(context => ({ context, resolution: resolutionByContext.get(contextKey(context)) }))
      .filter(item => normalizeRoutingStatus(item.resolution) !== 'resolved');
    if (failed.length > 0) {
      return Response.json({
        success: false,
        assignment_status: 'blocked',
        error: 'Deze medewerker kan voor een of meer taken niet juridisch en arbeidsvoorwaardelijk aan een contract worden gekoppeld.',
        details: failed.map(item => compactRoutingSnapshot(item.resolution, item.context, 'route_assignment_validation', user?.email || user?.id)),
      }, { status: 409 });
    }

    const resolutions = contexts.map(context => resolutionByContext.get(contextKey(context)));
    const contractIds = unique(resolutions.map(resolution => resolution?.contract_id || resolution?.selected_contract?.id));
    if (contractIds.length !== 1) {
      return Response.json({
        success: false,
        assignment_status: 'blocked',
        error: 'De taken in deze route leiden niet tot precies één arbeidscontract. Splits de route of herstel functie- en bedrijfscontext.',
        contract_ids: contractIds,
      }, { status: 409 });
    }

    const assignedBy = user?.email || user?.id || null;
    const snapshotsByKey = new Map(contexts.map(context => [
      contextKey(context),
      compactRoutingSnapshot(resolutionByContext.get(contextKey(context)), context, 'route_assignment', assignedBy),
    ]));
    const functionKeys = unique(contexts.map(context => context.function_type));
    const caoKeys = unique(resolutions.map(resolution => resolution?.cao_key || resolution?.selected_contract?.cao_key));
    const routeSnapshot = {
      status: 'resolved',
      source: 'route_assignment',
      resolved_at: nowIso(),
      resolved_by: assignedBy,
      personnel_id: personnelId,
      company_id: operatingCompanyIds[0],
      contract_id: contractIds[0],
      function_keys: functionKeys,
      cao_keys: caoKeys,
      task_contexts: [...new Map(contexts.map(context => [contextKey(context), snapshotsByKey.get(contextKey(context))])).values()],
    };

    for (let index = 0; index < taskExecutions.length; index += 1) {
      const task = taskExecutions[index];
      const context = contexts[index];
      const snapshot = snapshotsByKey.get(contextKey(context));
      await base44.asServiceRole.entities.TaskExecution.update(task.id, {
        operating_company_id: context.operating_company_id,
        personnel_contract_id: contractIds[0],
        contract_function_key: context.function_type || snapshot?.selected_contract?.function_type || null,
        contract_cao_key: snapshot?.cao_key || context.cao_key || null,
        contract_routing_status: 'resolved',
        contract_routing_snapshot: snapshot,
      });
    }

    const employeeName = personnel.name || personnel.full_name || personnel.display_name || [personnel.first_name, personnel.last_name].filter(Boolean).join(' ') || null;
    const updatedRoute = await base44.asServiceRole.entities.RouteExecution.update(routeExecution.id, {
      employee_id: personnelId,
      employee_name: employeeName,
      operating_company_id: operatingCompanyIds[0],
      personnel_contract_id: contractIds[0],
      contract_function_key: functionKeys.length === 1 ? functionKeys[0] : null,
      contract_cao_key: caoKeys.length === 1 ? caoKeys[0] : null,
      contract_routing_status: 'resolved',
      contract_routing_snapshot: routeSnapshot,
      mobile_route_package_cache: null,
    });

    return Response.json({
      success: true,
      assignment_status: 'resolved',
      route_execution: updatedRoute,
      personnel_contract_id: contractIds[0],
      function_keys: functionKeys,
      cao_keys: caoKeys,
      routing_snapshot: routeSnapshot,
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
