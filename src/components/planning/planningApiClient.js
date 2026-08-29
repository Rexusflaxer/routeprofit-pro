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
  const responseHeaders = error?.response?.headers;
  const retryAfter = responseHeaders?.get?.("retry-after")
    ?? responseHeaders?.["retry-after"]
    ?? backendData?.retry_after
    ?? backendData?.details?.retry_after
    ?? error?.retryAfter
    ?? null;
  return Object.assign(new Error(message), {
    status: Number(error?.response?.status || backendData?.status || error?.status || 500),
    details: backendData?.details || error?.details || null,
    requestId: backendData?.request_id || error?.requestId || null,
    retryAfter,
  });
}

const PLANNING_RATE_LIMIT_RETRY_DELAYS_MS = [450, 1_250];
const PLANNING_RESOURCE_BUSY_RETRY_DELAYS_MS = [250, 650, 1_200, 2_000, 3_000];

function isPlanningRateLimitError(error) {
  if (error?.details?.retry_safe === false) return false;
  const message = String(error?.message || "").toLowerCase();
  return Number(error?.status || 0) === 429
    || error?.details?.lease_release_exhausted === true
    || message.includes("rate limit")
    || message.includes("too many requests");
}

function isPlanningResourceBusyError(error) {
  if (error?.details?.retry_safe === false) return false;
  return Number(error?.status || 0) === 409
    && error?.details?.code === "PLANNING_RESOURCE_BUSY"
    && error?.details?.transient === true
    && Boolean(error?.details?.resource_type)
    && Boolean(error?.details?.reservation_expires_at);
}

function retryAfterDelayMs(value, now = Date.now()) {
  if (value == null || value === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(String(value));
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - now);
}

function wait(delayMs) {
  return new Promise(resolve => globalThis.setTimeout(resolve, delayMs));
}

async function invokePlanningApiWithRetry(client, request, {
  retryRateLimit = true,
  retryResourceBusy = true,
} = {}) {
  const action = String(request?.action || "");
  const lowPriorityAction = /^(prefetch_|list_|bootstrap_|repair_)/.test(action);
  const canRetryInteractiveWrite = Boolean(request?.idempotency_key) && !lowPriorityAction;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await invokePlanningApiWithClient(client, request);
    } catch (error) {
      const normalized = normalizePlanningError(error);
      const retryDelays = retryRateLimit && isPlanningRateLimitError(normalized)
        ? PLANNING_RATE_LIMIT_RETRY_DELAYS_MS
        : retryResourceBusy && isPlanningResourceBusyError(normalized)
          ? PLANNING_RESOURCE_BUSY_RETRY_DELAYS_MS
          : null;
      if (!canRetryInteractiveWrite || !retryDelays || attempt >= retryDelays.length) throw normalized;
      const retryAfterMs = isPlanningRateLimitError(normalized)
        ? retryAfterDelayMs(normalized.retryAfter)
        : null;
      const fallbackMs = retryDelays[attempt]
        + Math.floor(Math.random() * 150);
      await wait(retryAfterMs ?? fallbackMs);
    }
  }
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
  retryRateLimit = true,
  retryResourceBusy = true,
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
      return await invokePlanningApiWithRetry(base44LatestFunctions, request, {
        retryRateLimit,
        retryResourceBusy,
      });
    } catch (error) {
      const normalized = normalizePlanningError(error);
      if (isUnknownPlanningAction(normalized)) {
        throw outdatedPlanningBackendError(normalized, request.action);
      }
      throw normalized;
    }
  }

  try {
    return await invokePlanningApiWithRetry(base44, request, { retryRateLimit, retryResourceBusy });
  } catch (error) {
    const normalized = normalizePlanningError(error);
    if (!isUnknownPlanningAction(normalized)) throw normalized;

    if (hasPinnedFunctionsVersion === true && base44LatestFunctions?.functions?.invoke) {
      try {
        // An unknown action is rejected before dispatch. Retrying this exact
        // request against the unpinned snapshot is therefore safe for writes.
        return await invokePlanningApiWithRetry(base44LatestFunctions, request, {
          retryRateLimit,
          retryResourceBusy,
        });
      } catch (latestError) {
        const latest = normalizePlanningError(latestError);
        if (!isUnknownPlanningAction(latest)) throw latest;
        throw outdatedPlanningBackendError(latest, request.action);
      }
    }

    throw outdatedPlanningBackendError(normalized, request.action);
  }
}
