import { base44 } from "@/api/base44Client";

export function unwrapPlanningResponse(response) {
  let value = response?.data ?? response ?? null;
  if (value?.data && Object.keys(value).length === 1) value = value.data;
  return value;
}

export async function invokePlanningApi(payload) {
  try {
    const request = {
      ...payload,
      idempotency_key: payload.idempotency_key || globalThis.crypto?.randomUUID?.() || `planning-${Date.now()}-${Math.random()}`,
    };
    const response = await base44.functions.invoke("planningApi", request);
    const data = unwrapPlanningResponse(response);
    if (data?.error) {
      throw Object.assign(new Error(data.error), {
        status: data.status || 400,
        details: data.details || null,
      });
    }
    return data;
  } catch (error) {
    const backend = error?.response?.data;
    const backendData = backend?.data || backend;
    const message = backendData?.error || backendData?.message || error?.message || "Planningactie mislukt.";
    throw Object.assign(new Error(message), {
      status: error?.response?.status || backendData?.status || error?.status || 500,
      details: backendData?.details || error?.details || null,
    });
  }
}
