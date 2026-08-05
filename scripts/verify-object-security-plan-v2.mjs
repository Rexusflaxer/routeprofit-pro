import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entityDirectory = path.join(root, "base44/entities");
const apiPath = path.join(root, "base44/functions/customerPlatformApi/entry.ts");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function schema(name) {
  return JSON.parse(fs.readFileSync(path.join(entityDirectory, `${name}.jsonc`), "utf8"));
}

function enumOf(definition, property) {
  const values = definition.properties[property]?.enum;
  assert.ok(Array.isArray(values), `${definition.name}.${property} mist een enum`);
  return values;
}

function assertContainsAll(actual, expected, label) {
  for (const value of expected) {
    assert.ok(actual.includes(value), `${label} mist ${value}`);
  }
}

function propertyPaths(value, prefix = "") {
  if (!value || typeof value !== "object") return [];
  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const current = prefix ? `${prefix}.${key}` : key;
    paths.push(current, ...propertyPaths(child, current));
  }
  return paths;
}

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Bronblok mist ${start}`);
  assert.ok(endIndex > startIndex, `Bronblok mist eindmarkering ${end}`);
  return source.slice(startIndex, endIndex);
}

const plan = schema("ObjectSecurityPlan");
const revision = schema("ObjectSecurityPlanRevision");
const section = schema("ObjectSection");
const surveillanceObject = schema("SurveillanceObject");
const apiSource = fs.readFileSync(apiPath, "utf8");

for (const definition of [plan, revision, section]) {
  assert.deepEqual(definition.rls, {
    create: false,
    read: false,
    update: false,
    delete: false,
  }, `${definition.name} mag niet via directe entity-CRUD bereikbaar zijn`);
}

assertContainsAll(Object.keys(plan.properties), [
  "task_type",
  "custom_task_type",
  "variant_name",
  "execution_mode",
  "current_published_revision_id",
  "draft_revision_id",
  "latest_revision_number",
  "migration_source",
  "migration_review_required",
  "version",
], "ObjectSecurityPlan V2");

assertContainsAll(Object.keys(plan.properties), [
  "category",
  "title",
  "description",
  "scope_type",
  "duration_minutes",
  "instructions",
  "status",
], "ObjectSecurityPlan legacycompatibiliteit");
assertContainsAll(enumOf(plan, "status"), ["active", "draft", "published", "archived"], "ObjectSecurityPlan.status");

assert.deepEqual(enumOf(revision, "status"), ["draft", "published", "superseded"]);
assert.deepEqual(enumOf(revision, "duration_mode"), ["fixed", "schedule_defined", "none"]);
assert.deepEqual(enumOf(revision, "section_policy"), [
  "fixed",
  "default_with_controlled_override",
  "not_applicable",
]);
assertContainsAll(Object.keys(revision.properties), [
  "instruction_blocks",
  "floorplan_id",
  "floorplan_revision",
  "route_overlay",
  "content_checksum",
  "published_at",
  "published_by_user_id",
  "superseded_at",
  "superseded_by_revision_id",
  "migration_source",
  "migration_review_required",
  "version",
], "ObjectSecurityPlanRevision");

const blockSchema = revision.properties.instruction_blocks.items;
const stepSchema = blockSchema.properties.steps.items;
assert.equal(blockSchema.additionalProperties, false, "Instructieblokken moeten allowlisted zijn");
assert.equal(stepSchema.additionalProperties, false, "Instructiestappen moeten allowlisted zijn");
assert.equal(stepSchema.properties.section_id.type.includes("string"), true);
assert.equal(Object.hasOwn(stepSchema.properties, "section_ids"), false, "Een stap heeft maximaal één section_id");
assert.deepEqual(stepSchema.properties.action_type.enum, [
  "instruction",
  "inspect",
  "open",
  "close",
  "arm",
  "disarm",
  "register",
  "handover",
  "checkpoint",
  "other",
]);

const routeSchema = revision.properties.route_overlay;
assert.equal(routeSchema.additionalProperties, false, "Route-overlay moet allowlisted zijn");
assert.deepEqual(routeSchema.properties.schema_version.enum, ["loq-route-v1"]);
assert.deepEqual(routeSchema.properties.coordinate_space.enum, ["normalized"]);
assert.deepEqual(routeSchema.properties.markers.items.properties.marker_type.enum, [
  "checkpoint",
  "instruction",
  "start",
  "end",
  "other",
]);

assertContainsAll(Object.keys(section.properties), [
  "customer_id",
  "object_id",
  "code",
  "code_normalized",
  "name",
  "floorplan_id",
  "floorplan_revision",
  "geometry",
  "status",
  "version",
], "ObjectSection");
assert.equal(section.properties.geometry.additionalProperties, false);
assert.deepEqual(enumOf(section, "status"), ["active", "archived"]);
assertContainsAll(Object.keys(surveillanceObject.properties), [
  "security_plan_mutation_lock",
  "security_plan_mutation_lock_version",
], "SurveillanceObject beveiligingsplan-CAS");
assert.equal(surveillanceObject.properties.security_plan_mutation_lock_version.minimum, 0);

const forbiddenSchemaKeys = /(^|\.)(switch_code|alarm_code|access_code|pin|password|secret|credential|raw_file_url|file_url)$/i;
for (const definition of [plan, revision, section]) {
  const forbidden = propertyPaths(definition.properties).filter(value => forbiddenSchemaKeys.test(value));
  assert.deepEqual(forbidden, [], `${definition.name} lekt mogelijk geheime of ruwe bestandsvelden: ${forbidden.join(", ")}`);
}

const requiredReadActions = [
  "list_object_security_plans",
  "get_object_security_plan",
  "list_object_sections",
];
const requiredMutationActions = [
  "create_object_security_plan",
  "save_object_security_plan_draft",
  "duplicate_object_security_plan",
  "publish_object_security_plan",
  "archive_object_security_plan",
  "upsert_object_section",
  "archive_object_section",
  "migrate_legacy_object_security_plans",
];
for (const action of requiredReadActions) {
  const occurrences = apiSource.match(new RegExp(`['\"]${action}['\"]`, "g")) || [];
  if (occurrences.length < 2) {
    throw new Error(`customerPlatformApi mist READ_ACTIONS-registratie of dispatch voor ${action}`);
  }
}
for (const action of requiredMutationActions) {
  if (!new RegExp(`case ['\"]${action}['\"]`).test(apiSource)) {
    throw new Error(`customerPlatformApi mist action ${action}`);
  }
}
assert.match(apiSource, /migration_source\s*:\s*['"]legacy_object_security_plan['"]/);
assert.match(apiSource, /migration_review_required\s*:\s*true/);
assert.match(apiSource, /dry_run/);
assert.match(apiSource, /expected_version/);
assert.match(apiSource, /idempotency_key/);
assert.match(apiSource, /async function reserveSecurityPlanMutation\(/);
assert.match(apiSource, /async function releaseSecurityPlanMutation\(/);
assert.match(apiSource, /SECURITY_PLAN_MUTATION_LOCK_TTL_MS/);

const saveDraftSource = sourceBetween(
  apiSource,
  "async function handleSaveObjectSecurityPlanDraft(",
  "async function handleDuplicateObjectSecurityPlan(",
);
assert.match(saveDraftSource, /draft\.status\s*!==\s*['"]draft['"]/);
assert.match(saveDraftSource, /source_revision_id:\s*baseRevision\?\.id\s*\|\|\s*null/);
assert.doesNotMatch(saveDraftSource, /casUpdate\([^)]*baseRevision/s, "Een publicatie mag nooit als concept worden bijgewerkt");

const publishSource = sourceBetween(
  apiSource,
  "async function handlePublishObjectSecurityPlan(",
  "async function handleArchiveObjectSecurityPlan(",
);
assert.match(publishSource, /status:\s*['"]published['"]/);
assert.match(publishSource, /content_checksum:\s*checksum/);
assert.match(publishSource, /draft_revision_id:\s*null/);
assert.match(publishSource, /status:\s*['"]superseded['"]/);

const migrationSource = sourceBetween(
  apiSource,
  "async function handleMigrateLegacyObjectSecurityPlans(",
  "async function createMigrationIssue(",
);
assert.match(migrationSource, /const dryRun = body\.dry_run !== false/);
assert.match(migrationSource, /if \(dryRun\)/);
assert.match(migrationSource, /migration_source:\s*['"]legacy_object_security_plan['"]/);
assert.match(migrationSource, /migration_review_required:\s*true/);
assert.match(migrationSource, /status:\s*plan\.status === ['"]archived['"] \? ['"]archived['"] : ['"]draft['"]/);

const lastMutationResultIndex = apiSource.lastIndexOf("await recordMutationResult(");
assert.ok(lastMutationResultIndex > 0, "Generieke mutatieresultaatopslag ontbreekt");
const dryRunGuard = apiSource.slice(Math.max(0, lastMutationResultIndex - 700), lastMutationResultIndex);
assert.match(dryRunGuard, /migrate_legacy_customers/);
assert.match(
  dryRunGuard,
  /migrate_legacy_object_security_plans/,
  "Een security-plan dry-run mag ook geen generiek mutatierecord schrijven",
);
assert.match(dryRunGuard, /result\.dry_run/);

const frontendFiles = [
  "src/components/objects/ObjectSecurityPlanTab.jsx",
  "src/components/objects/useSecurityPlans.js",
]
  .filter(file => fs.existsSync(path.join(root, file)))
  .map(file => ({ file, source: read(file) }));
for (const { file, source } of frontendFiles) {
  assert.doesNotMatch(
    source,
    /base44\.entities\.(ObjectSecurityPlan|ObjectSecurityPlanRevision|ObjectSection)/,
    `${file} mag geen directe V2 entity-CRUD gebruiken`,
  );
}

const tabSource = read("src/components/objects/ObjectSecurityPlanTab.jsx");
assert.match(tabSource, /<LegacyMigrationBanner/);
assert.match(tabSource, /migrateLegacyObjectSecurityPlans\([^)]*dryRun:\s*true/s);
assert.match(tabSource, /migrateLegacyObjectSecurityPlans\([^)]*dryRun:\s*false/s);
assert.match(tabSource, /Ja, maak conceptrevisies/);

console.log("Beveiligingsplan V2 schema/API-verificatie: OK");
