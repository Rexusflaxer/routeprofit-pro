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
  "ObjectWarningAddress",
  "WarningAddressAvailabilityOverride",
  "ObjectKey",
  "ObjectKeyAssignment",
  "ObjectKeySet",
  "ObjectInstallation",
  "ObjectInstallationCredential",
  "ObjectHandbookCategory",
  "ObjectHandbookArticle",
  "ObjectOperationalModule",
  "ObjectOperationalModuleRevision",
  "ObjectSecurityPlan",
  "ObjectSecurityPlanRevision",
  "ObjectSection",
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
  "objectRelationshipsApi",
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
assert.equal(entitySchemaFiles.length, 119, "De verwachte 119 entiteitschemas moeten worden beveiligd");
const adminOnlyRule = { user_condition: { role: "admin" } };
const serviceOnlyObjectEntities = new Set([
  "ObjectWarningAddress.jsonc",
  "WarningAddressAvailabilityOverride.jsonc",
  "ObjectKey.jsonc",
  "ObjectKeyAssignment.jsonc",
  "ObjectKeySet.jsonc",
  "ObjectInstallation.jsonc",
  "ObjectInstallationCredential.jsonc",
  "ObjectHandbookCategory.jsonc",
  "ObjectHandbookArticle.jsonc",
  "ObjectOperationalModule.jsonc",
  "ObjectOperationalModuleRevision.jsonc",
  "ObjectRelationship.jsonc",
  "ObjectSecurityPlan.jsonc",
  "ObjectSecurityPlanRevision.jsonc",
  "ObjectSection.jsonc",
  "ThirdPartyOrganization.jsonc",
]);
const serviceWritePlanningEntities = new Set([
  "ObjectTaskDefinition.jsonc",
  "ObjectTaskScheduleRevision.jsonc",
  "ObjectTaskScheduleSeries.jsonc",
  "PlanningAssignment.jsonc",
  "PlanningAuditEvent.jsonc",
  "PlanningMutationCoordinator.jsonc",
  "PlanningPublication.jsonc",
  "PlanningShift.jsonc",
  "PlanningTaskSourceChange.jsonc",
  "PlanningTaskOccurrence.jsonc",
  "PlanningShiftTaskSegment.jsonc",
]);
for (const file of entitySchemaFiles) {
  const definition = JSON.parse(fs.readFileSync(path.join(ENTITY_DIR, file), "utf8"));
  for (const permission of ["create", "read", "update", "delete"]) {
    const immutableEvent = file === "CustomerEvent.jsonc" && ["update", "delete"].includes(permission);
    const serviceOnlyObjectEntity = serviceOnlyObjectEntities.has(file);
    const serviceWritePlanningEntity = serviceWritePlanningEntities.has(file);
    const expectedRule = serviceOnlyObjectEntity
      || immutableEvent
      || (serviceWritePlanningEntity && permission !== "read")
      ? false
      : adminOnlyRule;
    assert.deepEqual(
      definition.rls?.[permission],
      expectedRule,
      `${file} heeft een onjuiste RLS-regel voor ${permission}`,
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
property("Customer", "object_creation_reservation");
property("SurveillanceObject", "creation_idempotency_key");
property("SurveillanceObject", "version");
enumContains("SurveillanceObject", "status", ["concept", "active", "inactive", "archived"]);
for (const field of [
  "archived_at",
  "archived_by_user_id",
  "archive_reason",
  "logo_file_url",
  "logo_file_id",
  "logo_download_filename",
  "logo_logical_path",
  "creation_request_fingerprint",
  "creation_actor_user_id",
  "creation_mutation_target",
  "customer_platform_last_mutation_key_hash",
  "customer_platform_last_mutation_recovery",
  "customer_platform_mutation_key_hashes",
  "customer_platform_mutation_recoveries",
]) {
  property("SurveillanceObject", field);
}
const customerEventSchema = schema("CustomerEvent");
assert.equal(customerEventSchema.rls?.update, false, "CustomerEvent moet append-only zijn: update geblokkeerd");
assert.equal(customerEventSchema.rls?.delete, false, "CustomerEvent moet append-only zijn: delete geblokkeerd");
const warningAddressSchema = schema("ObjectWarningAddress");
assert.equal(warningAddressSchema.rls?.delete, false, "Waarschuwingsadressen mogen niet hard worden verwijderd");
for (const field of [
  "customer_id",
  "object_id",
  "contact_id",
  "primary_contact_point_id",
  "relationship_type",
  "call_order",
  "availability_mode",
  "status",
  "customer_platform_last_mutation_key_hash",
  "customer_platform_last_mutation_recovery",
  "customer_platform_mutation_key_hashes",
  "customer_platform_mutation_recoveries",
  "version",
]) {
  property("ObjectWarningAddress", field);
}
property("ObjectWarningAddress", "availability_override_heads");
for (const field of ["record_status", "supersedes_override_id", "creation_idempotency_key", "version"]) {
  property("WarningAddressAvailabilityOverride", field);
}
for (const entity of ["ObjectKey", "ObjectKeyAssignment", "ObjectKeySet", "ObjectInstallation"]) {
  assert.equal(schema(entity).rls?.delete, false, `${entity} mag niet hard worden verwijderd`);
  property(entity, "version");
}
for (const field of [
  "creation_request_fingerprint",
  "creation_actor_user_id",
  "creation_mutation_target",
  "customer_platform_last_mutation_key_hash",
  "customer_platform_last_mutation_recovery",
  "customer_platform_mutation_key_hashes",
  "customer_platform_mutation_recoveries",
]) {
  property("ObjectRelationship", field);
}
for (const field of [
  "active_credential_id",
  "credential_types",
  "control_device_key",
  "control_device_name",
  "manual_key",
  "manual_version",
  "creation_request_fingerprint",
  "customer_platform_last_mutation_key_hash",
  "customer_platform_last_mutation_recovery",
]) {
  property("ObjectInstallation", field);
}
for (const field of [
  "customer_id",
  "object_id",
  "name",
  "parent_category_id",
  "system_key",
  "origin",
  "protected",
  "sort_order",
  "version",
]) {
  property("ObjectHandbookCategory", field);
}
for (const field of [
  "customer_id",
  "object_id",
  "category_id",
  "title",
  "content_format",
  "managed_blocks",
  "supplement_blocks",
  "article_key",
  "source_installation_id",
  "source_manual_version",
  "read_only",
  "version",
]) {
  property("ObjectHandbookArticle", field);
}
for (const field of [
  "customer_id",
  "object_id",
  "module_type",
  "display_name",
  "status",
  "current_published_revision_id",
  "draft_revision_id",
  "suspension_reason",
  "archive_reason",
  "creation_idempotency_key",
  "customer_platform_mutation_recoveries",
  "version",
]) {
  property("ObjectOperationalModule", field);
}
for (const field of [
  "module_id",
  "revision_number",
  "status",
  "field_definitions",
  "reference_lists",
  "catalog_items",
  "availability_windows",
  "authorization_rules",
  "retention_days",
  "content_checksum",
  "version",
]) {
  property("ObjectOperationalModuleRevision", field);
}
for (const field of [
  "warning_address_mutation_lock",
  "warning_address_mutation_lock_version",
  "warning_address_order_ids",
  "warning_address_order_version",
  "warning_address_mutation_recoveries",
  "object_key_mutation_lock",
  "object_key_mutation_lock_version",
  "installation_mutation_lock",
  "installation_mutation_lock_version",
  "relationship_mutation_lock",
  "relationship_mutation_lock_version",
  "security_plan_mutation_lock",
  "security_plan_mutation_lock_version",
  "operational_module_mutation_lock",
  "operational_module_mutation_lock_version",
]) {
  property("SurveillanceObject", field);
}
for (const field of [
  "third_party_organization_mutation_lock",
  "third_party_organization_mutation_lock_version",
]) {
  property("Customer", field);
}
for (const entity of [
  "ObjectWarningAddress",
  "WarningAddressAvailabilityOverride",
  "ObjectKey",
  "ObjectKeyAssignment",
  "ObjectKeySet",
  "ObjectInstallation",
  "ObjectInstallationCredential",
  "ObjectHandbookCategory",
  "ObjectHandbookArticle",
  "ObjectOperationalModule",
  "ObjectOperationalModuleRevision",
  "ObjectRelationship",
  "ObjectSecurityPlan",
  "ObjectSecurityPlanRevision",
  "ObjectSection",
  "ThirdPartyOrganization",
]) {
  for (const permission of ["create", "read", "update", "delete"]) {
    assert.equal(schema(entity).rls?.[permission], false, `${entity}.${permission} moet uitsluitend via de service-role workflow lopen`);
  }
}
for (const field of [
  "customer_id",
  "object_id",
  "installation_id",
  "credential_type",
  "encrypted_value",
  "encryption_iv",
  "encryption_algorithm",
  "encryption_key_id",
  "status",
]) {
  property("ObjectInstallationCredential", field);
}
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
const objectModuleFrontend = [
  "ObjectWarningAddressesTable.jsx",
  "WarningAvailabilityTimelineDialog.jsx",
  "ObjectKeysTab.jsx",
  "useObjectKeys.js",
  "ObjectInstallationsTab.jsx",
  "ObjectRelationshipsTab.jsx",
  "ObjectSecurityPlanTab.jsx",
  "SecurityPlanWorkspace.jsx",
  "SecurityPlanModulesEditor.jsx",
  "ObjectModulesTab.jsx",
  "ObjectModuleWorkspace.jsx",
  "objectModuleWorkflow.js",
  "securityPlanWorkflow.js",
  "objectRelationshipWorkflow.js",
  "ObjectHandbookTab.jsx",
  "objectHandbookWorkflow.js",
].map(file => read(`src/components/objects/${file}`)).join("\n");
assert.doesNotMatch(
  objectModuleFrontend,
  /base44\.entities\.(ObjectWarningAddress|WarningAddressAvailabilityOverride|ObjectKey|ObjectKeyAssignment|ObjectKeySet|ObjectInstallation|ObjectInstallationCredential|ObjectHandbookCategory|ObjectHandbookArticle|ObjectOperationalModule|ObjectOperationalModuleRevision|ObjectRelationship|ObjectSecurityPlan|ObjectSecurityPlanRevision|ObjectSection|ThirdPartyOrganization)/,
  "Objectmodules mogen beveiligde entiteiten niet rechtstreeks lezen of muteren",
);
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
  "update_customer_object_identity",
  "update_customer_object_operations",
  "set_customer_object_status",
  "list_object_warning_addresses",
  "create_object_warning_address",
  "update_object_warning_address",
  "delete_object_warning_address",
  "upsert_warning_availability_overrides",
  "delete_warning_availability_override",
  "list_object_keys",
  "create_object_key",
  "update_object_key",
  "archive_object_key",
  "list_object_installations",
  "create_object_installation",
  "update_object_installation",
  "archive_object_installation",
  "list_object_handbook",
  "create_object_handbook_category",
  "update_object_handbook_category",
  "archive_object_handbook_category",
  "create_object_handbook_article",
  "update_object_handbook_article",
  "archive_object_handbook_article",
  "sync_object_installation_handbooks",
  "list_object_relationships",
  "create_object_relationship",
  "update_object_relationship",
  "archive_object_relationship",
  "list_object_modules",
  "get_object_module",
  "create_object_module",
  "save_object_module_draft",
  "publish_object_module",
  "set_object_module_status",
  "list_object_security_plans",
  "get_object_security_plan",
  "list_object_sections",
  "create_object_security_plan",
  "save_object_security_plan_draft",
  "duplicate_object_security_plan",
  "publish_object_security_plan",
  "archive_object_security_plan",
  "upsert_object_section",
  "archive_object_section",
  "migrate_legacy_object_security_plans",
  "list_object_logbook",
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
assert.match(
  customerPlatformApi,
  /safeObjectMutationSummary/,
  "Objectmutaties moeten een gesanitiseerde auditsamenvatting gebruiken",
);
assert.match(
  customerPlatformApi,
  /handleListObjectLogbook/,
  "De objectkaart moet een afzonderlijk objectbreed logboek aanbieden",
);
assert.match(
  customerPlatformApi,
  /actor_name:\s*actorName/,
  "Objectmutaties moeten de uitvoerende gebruiker leesbaar vastleggen",
);
assert.match(
  customerPlatformApi,
  /LOGBOOK_VALUE_FIELDS/,
  "Logboekwaarden moeten via een expliciete allowlist worden gesanitiseerd",
);
assert.match(customerPlatformApi, /key === 'credentials'/, "Installatiecodes moeten vóór de mutatiefingerprint worden geredigeerd");
assert.match(customerPlatformApi, /HKDF/, "Installatiecodes moeten een cryptografisch gescheiden encryptiedomein gebruiken");
assert.match(customerPlatformApi, /active_credential_id/, "Installatiecodes moeten via één actieve immutable credentialbundel worden geselecteerd");
assert.match(customerPlatformApi, /record_status:\s*'deleted'/, "Bereikbaarheidsverwijdering moet een append-only tombstone schrijven");
assert.doesNotMatch(
  customerPlatformApi,
  /getEntity\(base44, 'WarningAddressAvailabilityOverride'\)\.delete/,
  "Bereikbaarheidsuitzonderingen mogen niet hard worden verwijderd",
);
assert.doesNotMatch(
  customerPlatformApi,
  /handleUpdateCustomerObjectOperations[\s\S]*?return\s*\{\s*object:\s*updated\b/,
  "Operationele instructies mogen niet als volledig object in CustomerEvent.payload worden opgeslagen",
);
const objectOperationsWhitelist = customerPlatformApi.match(
  /const OBJECT_OPERATIONS_PATCH_FIELDS = \[([\s\S]*?)\];/,
)?.[1] || "";
for (const restrictedField of ["access_instruction", "alarm_instruction", "key_instruction"]) {
  assert.ok(
    !objectOperationsWhitelist.includes(restrictedField),
    `${restrictedField} mag niet via de gewone objectmutatie worden beheerd`,
  );
}
for (const recoveryContract of [
  "mutationRequestFingerprint",
  "mutationTarget",
  "customerObjectMutationMarkerReplay",
  "reserveCustomerObjectCreation",
  "releaseMatchingCustomerObjectCreation",
  "objectLifecycleStatus",
  "creation_request_fingerprint",
  "customer_platform_last_mutation_recovery",
  "customer_platform_mutation_recoveries",
  "warningAddressMutationMarkerReplay",
  "WARNING_ADDRESS_RECOVERY_LIMIT",
  "reserveObjectRelationshipMutation",
  "releaseObjectRelationshipMutation",
  "reserveThirdPartyOrganizationMutation",
  "releaseThirdPartyOrganizationMutation",
  "ensureThirdPartyOrganizationRelationType",
]) {
  assert.ok(customerPlatformApi.includes(recoveryContract), `Object-idempotency mist ${recoveryContract}`);
}
const objectWorkflow = read("src/components/objects/objectWorkflow.js");
for (const helper of [
  "updateCustomerObjectIdentity",
  "updateCustomerObjectOperations",
  "setCustomerObjectStatus",
]) {
  assert.ok(objectWorkflow.includes(`function ${helper}`), `Objectworkflow mist helper ${helper}`);
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

assert.equal(functionCount, 49, `Base44-functiecapaciteit wijkt af: ${functionCount}/49`);
console.log(`Klantplatform readiness: OK (${REQUIRED_ENTITIES.length} entiteiten, ${functionCount}/49 functies)`);
