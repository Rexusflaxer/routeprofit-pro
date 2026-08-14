import {
  base44,
  base44LatestFunctions,
  hasPinnedFunctionsVersion,
} from "@/api/base44Client";

export function unwrapPlanningResponse(response) {
  let value = response?.data ?? response ?? null;
  if (value?.data && Object.keys(value).length === 1) value = value.data;
  return value;
}

function normalizePlanningError(error) {
  const backend = error?.response?.data;
  const backendData = backend?.data || backend || {};
  const message = backendData?.error || backendData?.message || error?.message || "Planningactie mislukt.";
  return Object.assign(new Error(message), {
    status: Number(error?.response?.status || backendData?.status || error?.status || 500),
    details: backendData?.details || error?.details || null,
    requestId: backendData?.request_id || error?.requestId || null,
  });
}

function isUnknownPlanningAction(error) {
  return error?.status === 400
    && /^Onbekende planningactie\.?$/i.test(String(error?.message || "").trim());
}

function outdatedPlanningBackendError(error, action) {
  return Object.assign(
    new Error("De planningbackend is nog niet gepubliceerd. Publiceer de nieuwste Base44-versie en probeer opnieuw."),
    {
      status: 400,
      details: {
        ...(error?.details || {}),
        code: "planning_backend_outdated",
        action: action || null,
      },
      requestId: error?.requestId || null,
    },
  );
}

async function invokePlanningApiWithClient(client, request) {
  const response = await client.functions.invoke("planningApi", request);
  const data = unwrapPlanningResponse(response);
  if (data?.error) {
    throw Object.assign(new Error(data.error), {
      status: data.status || 400,
      details: data.details || null,
      requestId: data.request_id || null,
    });
  }
  return data;
}

export async function invokePlanningApi(payload, {
  ensureIdempotencyKey = true,
  preferLatestFunctions = false,
} = {}) {
  // Build this once so a retry against the latest function snapshot always
  // reuses the exact same idempotency key and payload.
  const request = ensureIdempotencyKey
    ? {
      ...payload,
      idempotency_key: payload.idempotency_key || globalThis.crypto?.randomUUID?.() || `planning-${Date.now()}-${Math.random()}`,
    }
    : { ...payload };

  // Object tasks can be created through the unpinned recovery client while a
  // Base44 App Preview still points at an older function snapshot. Bootstrap
  // must then use that same latest snapshot as well; an older bootstrap action
  // may exist but not understand the effective-dated task-series records.
  if (preferLatestFunctions && hasPinnedFunctionsVersion === true && base44LatestFunctions?.functions?.invoke) {
    try {
      return await invokePlanningApiWithClient(base44LatestFunctions, request);
    } catch (error) {
      const normalized = normalizePlanningError(error);
      if (isUnknownPlanningAction(normalized)) {
        throw outdatedPlanningBackendError(normalized, request.action);
      }
      throw normalized;
    }
  }

  try {
    return await invokePlanningApiWithClient(base44, request);
  } catch (error) {
    const normalized = normalizePlanningError(error);
    if (!isUnknownPlanningAction(normalized)) throw normalized;

    if (hasPinnedFunctionsVersion === true && base44LatestFunctions?.functions?.invoke) {
      try {
        // An unknown action is rejected before dispatch. Retrying this exact
        // request against the unpinned snapshot is therefore safe for writes.
        return await invokePlanningApiWithClient(base44LatestFunctions, request);
      } catch (latestError) {
        const latest = normalizePlanningError(latestError);
        if (!isUnknownPlanningAction(latest)) throw latest;
        throw outdatedPlanningBackendError(latest, request.action);
      }
    }

    throw outdatedPlanningBackendError(normalized, request.action);
  }
}
