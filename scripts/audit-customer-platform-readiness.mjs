import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTITY_DIR = path.join(ROOT, "base44", "entities");
const FUNCTION_DIR = path.join(ROOT, "base44", "functions");

const REQUIRED_ENTITIES = [
  "Customer",
  "CustomerAccount",
  "CustomerAddress",
  "CustomerContact",
  "CustomerContactPoint",
  "CustomerContactRole",
  "CustomerRequest",
  "CustomerEvent",
  "CustomerQuote",
  "CustomerQuoteLine",
  "CustomerContract",
  "CustomerContractLine",
  "CustomerContractRate",
  "DocumentSignature",
  "BillingCandidate",
  "CommercialNumberSequence",
  "CommercialNumberReservation",
  "InvoiceRun",
  "SalesInvoice",
  "SalesInvoiceLine",
  "Payment",
  "PaymentAllocation",
  "PaymentReminder",
  "CompanyBillingSettings",
  "CustomerPortalInvitation",
  "CustomerPortalMembership",
  "CustomerPortalGrant",
  "CustomerPortalPublication",
  "CustomerPortalAuditLog",
  "CustomerSupportSession",
];

const REQUIRED_FUNCTIONS = [
  "customerPlatformApi",
  "customerPortalApi",
  "customerIntegrationWebhook",
  "commercialAutomation",
  "lookupService",
  "companyEmailService",
  "managedFileCrypto",
  "employeePortalApi",
  "mobileApi",
];

const CONSOLIDATED_FUNCTIONS = [
  "completeCompanyEmailOAuth",
  "createMobileRouteExecution",
  "employeeContext",
  "employeeInvitationAction",
  "lookupIbanBic",
  "lookupLicensePlate",
  "mobileMe",
  "mobileObjectFloorPlan",
  "mobileObjectsMap",
  "mobileReport",
  "mobileRouteAction",
  "mobileRoutePackage",
  "mobileSync",
  "searchAddress",
  "searchKvK",
  "sendCompanyEmail",
  "startCompanyEmailOAuth",
  "unwrapManagedFileKey",
  "wrapManagedFileKey",
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function schema(name) {
  const file = path.join(ENTITY_DIR, `${name}.jsonc`);
  assert.ok(fs.existsSync(file), `Entiteit ontbreekt: ${name}`);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(parsed.name, name, `Entiteitsnaam wijkt af in ${name}.jsonc`);
  return parsed;
}

function property(name, key) {
  const definition = schema(name).properties?.[key];
  assert.ok(definition, `${name}.${key} ontbreekt`);
  return definition;
}

function enumContains(name, key, values) {
  const definition = property(name, key);
  const actual = definition.enum || [];
  for (const value of values) {
    assert.ok(actual.includes(value), `${name}.${key} mist enumwaarde ${value}`);
  }
}

for (const entity of REQUIRED_ENTITIES) schema(entity);
for (const fn of REQUIRED_FUNCTIONS) {
  assert.ok(
    fs.existsSync(path.join(FUNCTION_DIR, fn, "entry.ts")),
    `Backendfunctie ontbreekt: ${fn}`,
  );
}

const functionCount = fs.readdirSync(FUNCTION_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(FUNCTION_DIR, entry.name, "entry.ts")))
  .length;
assert.equal(functionCount, 49, `Base44-functiecapaciteit wijkt af: ${functionCount}/49`);
for (const functionName of CONSOLIDATED_FUNCTIONS) {
  assert.ok(
    !fs.existsSync(path.join(FUNCTION_DIR, functionName, "entry.ts")),
    `Oud functie-entrypoint is niet geconsolideerd: ${functionName}`,
  );
}
assert.ok(
  !fs.existsSync(path.join(FUNCTION_DIR, "_shared")),
  "Pure utilitybestanden mogen niet binnen base44/functions blijven staan",
);
for (const functionName of fs.readdirSync(FUNCTION_DIR)) {
  const entryFile = path.join(FUNCTION_DIR, functionName, "entry.ts");
  if (!fs.existsSync(entryFile)) continue;
  const source = fs.readFileSync(entryFile, "utf8");
  assert.doesNotMatch(
    source,
    /from\s+["']\.\.?\//,
    `${functionName}/entry.ts moet self-contained zijn voor Base44 deployment`,
  );
}

const entitySchemaFiles = fs.readdirSync(ENTITY_DIR)
  .filter(file => /\.jsonc?$/.test(file))
  .sort();
assert.equal(entitySchemaFiles.length, 92, "De verwachte 92 entiteitschemas moeten worden beveiligd");
const adminOnlyRule = { user_condition: { role: "admin" } };
for (const file of entitySchemaFiles) {
  const definition = JSON.parse(fs.readFileSync(path.join(ENTITY_DIR, file), "utf8"));
  for (const permission of ["create", "read", "update", "delete"]) {
    assert.deepEqual(
      definition.rls?.[permission],
      adminOnlyRule,
      `${file} mist admin-only RLS voor ${permission}`,
    );
  }
}

enumContains("Customer", "status", ["concept", "active", "on_hold", "archived"]);
enumContains("CustomerQuote", "status", [
  "draft",
  "review",
  "approved",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "withdrawn",
  "converted",
]);
enumContains("CustomerContract", "status", [
  "draft",
  "review",
  "approved",
  "sent_for_signature",
  "signed",
  "active",
  "suspended",
  "ended",
  "superseded",
  "archived",
]);
enumContains("BillingCandidate", "status", ["blocked", "ready", "invoiced", "cancelled"]);
enumContains("SalesInvoice", "document_type", ["invoice", "credit_note"]);
enumContains("SalesInvoice", "lifecycle_status", [
  "draft",
  "review",
  "approved",
  "issue_pending",
  "issued",
  "issue_failed",
  "cancelled",
]);
enumContains("SalesInvoice", "delivery_status", ["not_scheduled", "queued", "delivered", "failed"]);
enumContains("SalesInvoice", "payment_status", ["not_due", "open", "partially_paid", "paid", "overpaid", "overdue"]);
enumContains("CustomerPortalPublication", "status", [
  "draft",
  "review",
  "approved",
  "published",
  "withdrawn",
  "superseded",
]);

for (const field of ["subtotal_cents", "tax_total_cents", "total_cents"]) {
  property("SalesInvoice", field);
}
for (const field of ["idempotency_key", "provider_idempotency_key", "version"]) {
  property("SalesInvoice", field);
}
property("Customer", "creation_idempotency_key");
property("SurveillanceObject", "creation_idempotency_key");
property("SurveillanceObject", "version");
enumContains("SurveillanceObject", "status", ["concept", "active", "inactive", "archived"]);
for (const entity of ["CustomerQuote", "CustomerContract"]) {
  property(entity, "signature_lock_key");
  property(entity, "signature_lock_started_at");
}
for (const field of ["file_uri", "portal_visible", "customer_id", "company_id"]) {
  property("ManagedFile", field);
}

const appSource = read("src/App.jsx");
for (const route of ["/CustomerDetail", "/Commercial", "/Billing", "/CustomerPortal"]) {
  assert.ok(appSource.includes(`path="${route}"`), `Route ontbreekt: ${route}`);
}

const base44Client = read("src/api/base44Client.js");
assert.match(base44Client, /requiresAuth:\s*true/, "De app moet login vereisen");

const managedFiles = read("src/lib/managedFiles.js");
assert.match(managedFiles, /UploadPrivateFile/, "Klant- en commerciële bestanden moeten privé worden opgeslagen");

const customersPage = read("src/pages/Customers.jsx");
const customerDetailPage = read("src/pages/CustomerDetail.jsx");
const customerDossierUtils = read("src/components/customers/customerDossierUtils.js");
assert.match(
  customerDossierUtils,
  /functions\.invoke\(["']customerPlatformApi["']/,
  "De klantmutatiehelper moet customerPlatformApi aanroepen",
);
for (const [file, source] of [
  ["Customers.jsx", customersPage],
  ["CustomerDetail.jsx", customerDetailPage],
]) {
  assert.doesNotMatch(
    source,
    /base44\.entities\.(Customer|CustomerAccount|CustomerAddress|CustomerContact|CustomerContactPoint|CustomerContactRole|CustomerRequest|CustomerEvent|SurveillanceObject)\.(create|update|delete)\(/,
    `${file} mag klantmutaties niet rechtstreeks uitvoeren`,
  );
  assert.doesNotMatch(
    source,
    /\b(createEntity|updateEntity|deleteEntity)\(/,
    `${file} mag de generieke entityhelpers niet voor klantmutaties gebruiken`,
  );
  assert.ok(
    /functions\.invoke\(["']customerPlatformApi["']/.test(source)
      || /\binvokeCustomerPlatformMutation\(/.test(source),
    `${file} moet klantmutaties rechtstreeks of via de gecontroleerde helper naar customerPlatformApi sturen`,
  );
}

const portalPage = read("src/pages/CustomerPortal.jsx");
assert.doesNotMatch(
  portalPage,
  /base44\.entities\./,
  "CustomerPortal mag entiteiten niet rechtstreeks lezen",
);
assert.match(
  portalPage,
  /functions\.invoke\(["']customerPortalApi["']/,
  "CustomerPortal moet uitsluitend de portaal-API gebruiken",
);

const portalApi = read("base44/functions/customerPortalApi/entry.ts");
for (const blocked of ["gps", "employee", "internal", "alarm", "file_url", "file_uri", "exif"]) {
  assert.ok(portalApi.includes(`'${blocked}'`), `Portaalsanitizer mist ${blocked}`);
}
assert.match(portalApi, /expires_in:\s*SIGNED_URL_TTL_SECONDS/);
assert.match(portalApi, /SIGNED_URL_TTL_SECONDS\s*=\s*120/);

const integrationApi = read("base44/functions/customerIntegrationWebhook/entry.ts");
assert.match(integrationApi, /SIGNHOST_POSTBACK_SHARED_SECRET/);
assert.match(integrationApi, /STORECOVE_WEBHOOK_SECRET/);
assert.match(integrationApi, /idempotencyGuid|idempotency_guid/);

const customerPlatformApi = read("base44/functions/customerPlatformApi/entry.ts");
assert.match(
  customerPlatformApi,
  /export\s+default\s+handleCustomerPlatformRequest\s*;/,
  "customerPlatformApi moet een Base44-compatibele default request-handler exporteren",
);
assert.doesNotMatch(
  customerPlatformApi,
  /if\s*\(\s*import\.meta\.main\s*\)/,
  "customerPlatformApi mag runtime-registratie niet van import.meta.main laten afhangen",
);
for (const action of [
  "create_customer",
  "create_customer_object",
  "list_commercial",
  "list_billing",
  "create_quote",
  "create_contract",
  "create_billing_candidate",
  "issue_invoice",
  "migrate_legacy_customers",
]) {
assert.ok(customerPlatformApi.includes(`'${action}'`), `customerPlatformApi mist action ${action}`);
}
assert.match(customerPlatformApi, /\$inc/, "Factuurnummering moet een atomaire increment gebruiken");

const commercialAutomation = read("base44/functions/commercialAutomation/entry.ts");
assert.match(
  commercialAutomation,
  /export\s+default\s+handleCommercialAutomationRequest\s*;/,
  "commercialAutomation moet een Base44-compatibele default request-handler exporteren",
);
assert.doesNotMatch(
  commercialAutomation,
  /if\s*\(\s*import\.meta\.main\s*\)/,
  "commercialAutomation mag runtime-registratie niet van import.meta.main laten afhangen",
);
for (const action of [
  "run_due_work",
  "expire_quotes",
  "generate_billing_candidates",
  "schedule_reminders",
  "prepare_indexation",
  "collect_invoice_run",
]) {
  assert.ok(commercialAutomation.includes(`'${action}'`), `commercialAutomation mist actie ${action}`);
}
for (const guard of [
  "CUSTOMER_AUTOMATION_SECRET",
  "x-loq-automation-secret",
  "billing_activation_at",
  "actual_completed_at",
  "financial_review_status",
  "customer_billable",
]) {
  assert.ok(commercialAutomation.includes(guard), `commercialAutomation mist guard ${guard}`);
}
assert.match(commercialAutomation, /status:\s*'draft'/, "Automatische facturen en indexaties moeten als concept starten");
assert.match(commercialAutomation, /status:\s*errors\.length\s*\?\s*'partial_failed'\s*:\s*'review'/);
assert.doesNotMatch(commercialAutomation, /auto_issue:\s*true|auto_send:\s*true/);

console.log(`Klantplatform readiness: OK (${REQUIRED_ENTITIES.length} entiteiten, ${functionCount}/49 functies)`);
