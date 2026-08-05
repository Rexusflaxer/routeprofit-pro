import {
  Archive,
  Banknote,
  Building2,
  CalendarDays,
  ContactRound,
  FileText,
  Handshake,
  History,
  LayoutDashboard,
  MapPinned,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import {
  base44,
  base44LatestFunctions,
  hasPinnedFunctionsVersion,
} from "@/api/base44Client";

const OBJECT_MODULE_PLATFORM_ACTIONS = new Set([
  "list_object_modules",
  "get_object_module",
  "create_object_module",
  "save_object_module_draft",
  "publish_object_module",
  "set_object_module_status",
]);

export const CUSTOMER_TABS = [
  { key: "overview", label: "Overzicht", icon: LayoutDashboard },
  { key: "contacts", label: "Contacten", icon: ContactRound },
  { key: "objects", label: "Objecten", icon: MapPinned },
  { key: "commercial", label: "Commercieel", icon: Handshake },
  { key: "planning", label: "Planning & aanvragen", icon: CalendarDays },
  { key: "reports", label: "Rapportages", icon: FileText },
  { key: "billing", label: "Facturatie", icon: ReceiptText },
  { key: "documents", label: "Documenten", icon: Building2 },
  { key: "portal", label: "Klantportaal", icon: ShieldCheck },
  { key: "history", label: "Notities & historie", icon: MessageSquareText },
  { key: "manage", label: "Beheer", icon: Archive },
];

export const CUSTOMER_STATUS_LABELS = {
  concept: "Concept",
  draft: "Concept",
  onboarding: "Onboarding",
  active: "Actief",
  on_hold: "In de wacht",
  inactive: "Inactief",
  suspended: "Gepauzeerd",
  archived: "Gearchiveerd",
};

export const CUSTOMER_STATUS_CLASSES = {
  concept: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  draft: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  onboarding: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  on_hold: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  inactive: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  suspended: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  archived: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
};

export const RECORD_STATUS_LABELS = {
  draft: "Concept",
  concept: "Concept",
  review: "In beoordeling",
  pending_review: "In beoordeling",
  approved: "Goedgekeurd",
  sent: "Verzonden",
  sent_for_signature: "Ter ondertekening",
  signed: "Ondertekend",
  accepted: "Geaccepteerd",
  rejected: "Afgewezen",
  expired: "Verlopen",
  withdrawn: "Ingetrokken",
  converted: "Omgezet",
  active: "Actief",
  suspended: "Gepauzeerd",
  ended: "Beëindigd",
  superseded: "Vervangen",
  archived: "Gearchiveerd",
  submitted: "Ingediend",
  under_review: "In beoordeling",
  in_review: "In beoordeling",
  scheduled: "Ingepland",
  published: "Gepubliceerd",
  correction_requested: "Correctie gevraagd",
  completed: "Afgerond",
  blocked: "Geblokkeerd",
  ready: "Gereed",
  issued: "Uitgegeven",
  issue_pending: "Uitgifte gepland",
  not_scheduled: "Niet gepland",
  open: "Open",
  not_due: "Nog niet vervallen",
  overpaid: "Te veel betaald",
  written_off: "Afgeboekt",
  delivery_failed: "Aflevering mislukt",
  paid: "Betaald",
  partially_paid: "Deels betaald",
  overdue: "Vervallen",
  cancelled: "Geannuleerd",
  invited: "Uitgenodigd",
  pending: "In afwachting",
  revoked: "Ingetrokken",
  delivered: "Afgeleverd",
  failed: "Mislukt",
};

export const CUSTOMER_TYPE_LABELS = {
  bedrijf: "Bedrijf",
  particulier: "Particulier",
};

export const ADDRESS_TYPE_LABELS = {
  visiting: "Bezoekadres",
  visit: "Bezoekadres",
  postal: "Postadres",
  billing: "Factuuradres",
  invoice: "Factuuradres",
  registered: "Vestigingsadres",
  other: "Overig",
};

export const CONTACT_ROLE_LABELS = {
  primary: "Hoofdcontact",
  operational: "Operationeel",
  planning: "Planning",
  reports: "Rapportages",
  billing: "Facturatie",
  contract: "Contracten",
  emergency: "Waarschuwingsadres",
  warning: "Waarschuwingsadres",
  contract_signer: "Contractondertekenaar",
  portal_admin: "Portaalbeheerder",
  portal_user: "Portaalgebruiker",
  complaints: "Klachten",
  other: "Overig",
};

export const BILLING_ICON = Banknote;
export const HISTORY_ICON = History;

export async function listEntity(entityName, sort = "-created_date") {
  const entity = baseEntity(entityName);
  if (!entity?.list) return [];
  return sort ? entity.list(sort) : entity.list();
}

export async function filterEntity(entityName, filter, sort = "-created_date") {
  const entity = baseEntity(entityName);
  if (!entity?.filter) return [];
  return sort ? entity.filter(filter, sort) : entity.filter(filter);
}

export async function createEntity(entityName, payload) {
  const entity = baseEntity(entityName);
  if (!entity?.create) throw new Error(`${entityName} is nog niet beschikbaar.`);
  return entity.create(payload);
}

export async function updateEntity(entityName, id, payload) {
  const entity = baseEntity(entityName);
  if (!entity?.update) throw new Error(`${entityName} is nog niet beschikbaar.`);
  return entity.update(id, payload);
}

export function createCustomerMutationKey(action) {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Deze browser kan geen veilige mutatiesleutel maken. Vernieuw de pagina of gebruik een actuele browser.");
  }
  return `${action}:${globalThis.crypto.randomUUID()}`;
}

function customerPlatformError(error, action) {
  const responseData = error?.response?.data;
  const payload = responseData?.data || responseData;
  const serverError = typeof payload === "string"
    ? payload.trim()
    : typeof payload?.error === "string"
      ? payload.error
      : payload?.error?.message || payload?.message;
  const normalized = new Error(serverError || error?.message || "De klantplatformactie is mislukt.");
  normalized.status = Number(error?.response?.status || error?.status) || null;
  normalized.details = payload?.details || payload?.error?.details || null;
  normalized.requestId = payload?.request_id || null;
  normalized.action = action || null;
  return normalized;
}

async function invokeCustomerPlatformWithClient(client, payload) {
  const response = await client.functions.invoke("customerPlatformApi", payload);
  const result = response?.data?.data || response?.data || {};
  if (result?.error) {
    throw customerPlatformError({ response: { data: result } }, payload?.action);
  }
  if (result?.ok === false) throw new Error(result.message || "De klantplatformactie is mislukt.");
  return result;
}

function normalizedCustomerPlatformError(error, action) {
  return error?.action || error?.requestId || error?.details
    ? error
    : customerPlatformError(error, action);
}

function shouldRetryLatestFunctions(error, payload) {
  return hasPinnedFunctionsVersion === true
    && base44LatestFunctions?.functions?.invoke
    && OBJECT_MODULE_PLATFORM_ACTIONS.has(payload?.action)
    && error?.status === 400
    && /^Onbekende actie\.?$/i.test(String(error?.message || "").trim());
}

async function invokeCustomerPlatformRequest(payload) {
  try {
    return await invokeCustomerPlatformWithClient(base44, payload);
  } catch (error) {
    const normalized = normalizedCustomerPlatformError(error, payload?.action);
    if (!shouldRetryLatestFunctions(normalized, payload)) throw normalized;
    try {
      // Mutaties reuse the exact same idempotency key. The pinned request was
      // rejected before dispatch, so retrying the latest snapshot is safe.
      return await invokeCustomerPlatformWithClient(base44LatestFunctions, payload);
    } catch (latestError) {
      const latest = normalizedCustomerPlatformError(latestError, payload?.action);
      if (latest.status === 400 && /^Onbekende actie\.?$/i.test(String(latest.message || "").trim())) {
        latest.message = "De objectmodule-backend is nog niet gepubliceerd. Publiceer de nieuwste Base44-versie en probeer opnieuw.";
        latest.details = { ...(latest.details || {}), code: "object_module_backend_outdated" };
      }
      throw latest;
    }
  }
}

export function invokeCustomerPlatformRead(payload) {
  return invokeCustomerPlatformRequest(payload);
}

export function invokeCustomerPlatformMutation(payload) {
  return invokeCustomerPlatformRequest(payload);
}

export function getRecordStatus(record) {
  return record?.status || record?.lifecycle_status || record?.review_status || record?.payment_status || "draft";
}

export function getCustomerStatus(customer) {
  return customer?.status || (customer?.is_active === false ? "inactive" : "active");
}

export function getCustomerName(customer) {
  return customer?.trade_name || customer?.name || customer?.legal_name || "Naamloze klant";
}

export function getCompanyName(company) {
  return company?.display_name || company?.trade_name || company?.legal_name || company?.name || "Onbekend bedrijf";
}

export function getContactName(contact) {
  const fullName = [
    contact?.first_name || contact?.given_name,
    contact?.middle_name || contact?.name_prefix,
    contact?.last_name || contact?.family_name,
  ].filter(Boolean).join(" ");
  return contact?.display_name || contact?.name || fullName || "Naam onbekend";
}

export function formatDate(value, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(value, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrencyCents(value, currency = "EUR") {
  if (value === null || value === undefined || value === "") return "—";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: currency || "EUR",
  }).format(numericValue / 100);
}

export function formatAddress(address) {
  if (!address) return "—";
  if (typeof address === "string") return address || "—";
  if (address.address_line || address.formatted_address || address.address) {
    return address.address_line || address.formatted_address || address.address;
  }
  const street = [
    address.street_name || address.street,
    address.house_number,
    address.house_number_addition,
  ].filter(Boolean).join(" ");
  const locality = [
    address.postal_code,
    address.city || address.locality,
  ].filter(Boolean).join(" ");
  const countryValue = address.country_name || address.country;
  const country = countryValue && countryValue !== "Nederland" ? countryValue : "";
  return [street, locality, country].filter(Boolean).join(", ") || "—";
}

export function contactPointValue(points, contactId, type) {
  return points.find(point =>
    point.contact_id === contactId
    && (point.point_type === type || point.type === type || point.channel_type === type || point.kind === type)
    && point.is_active !== false
  )?.value || "";
}

export function contactRoleKeys(roles, contactId) {
  return roles
    .filter(role => role.contact_id === contactId && role.status !== "archived")
    .map(role => role.role || role.role_key || role.type)
    .filter(Boolean);
}

export function matchesCustomerOwner(file, customerId) {
  return file?.customer_id === customerId
    || (file?.owner_type === "customer" && file?.owner_id === customerId);
}

export function objectAddress(object) {
  return object?.address || formatAddress(object);
}

export function initials(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "KL";
  return `${parts[0]?.[0] || ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : parts[0]?.[1] || ""}`.toUpperCase();
}

export function recordTitle(record, entityName = "") {
  return record?.title
    || record?.name
    || record?.subject
    || record?.quote_number
    || record?.contract_number
    || record?.invoice_number
    || record?.request_number
    || record?.document_number
    || entityName;
}

function baseEntity(entityName) {
  // The SDK exposes entities dynamically. Keeping this lookup in one place lets
  // dossier tabs stay unavailable-without-crashing during additive deployments.
  return base44?.entities?.[entityName] || null;
}
