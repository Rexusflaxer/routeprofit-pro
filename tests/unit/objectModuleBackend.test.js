import fs from "node:fs";
import path from "node:path";
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "node:util";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const entryPath = path.join(root, "base44/functions/customerPlatformApi/entry.ts");
const source = fs.readFileSync(entryPath, "utf8");

let backend;

beforeAll(async () => {
  globalThis.TextEncoder = NodeTextEncoder;
  globalThis.TextDecoder = NodeTextDecoder;
  globalThis.Uint8Array = new NodeTextEncoder().encode("").constructor;
  const { transform } = await import("esbuild");
  const testableSource = source
    .replace(
      /^import \{ createClientFromRequest \} from 'npm:@base44\/sdk@[^']+';$/m,
      "const createClientFromRequest = () => ({});",
    )
    .concat(`\nexport {
      normalizedObjectModuleRevisionData,
      objectModuleReadiness,
      normalizedSecurityPlanModuleAssignments,
      objectModuleAuditResult,
      normalizedObjectModuleStatusReason,
      projectedObjectModuleStatus
    };`);
  const compiled = await transform(testableSource, { format: "esm", loader: "ts", target: "es2022" });
  backend = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
});

const moduleRecord = overrides => ({
  id: "module-items",
  customer_id: "customer-1",
  object_id: "object-1",
  module_type: "item_issuance",
  display_name: "Middelenuitgifte",
  status: "concept",
  version: 1,
  ...overrides,
});

describe("objectmodule-backendcontract", () => {
  it("registreert alle frontendacties en een controleerbare API-contractversie", () => {
    for (const action of [
      "list_object_modules",
      "get_object_module",
      "create_object_module",
      "save_object_module_draft",
      "publish_object_module",
      "set_object_module_status",
    ]) {
      expect(source).toContain(`'${action}'`);
    }
    expect(source).toContain("const OBJECT_MODULE_API_CONTRACT_VERSION = '2026-08-05.2'");
    expect(source).toContain("api_contract_version: OBJECT_MODULE_API_CONTRACT_VERSION");
  });

  it("gebruikt hetzelfde objectslot als beveiligingsplanmutaties", () => {
    const handler = source.slice(
      source.indexOf("async function handleObjectModuleMutation("),
      source.indexOf("function normalizedSecurityPlanIdentity("),
    );

    expect(handler).toContain("reserveSecurityPlanMutation(");
    expect(handler).toContain("releaseSecurityPlanMutation(");
    expect(handler).not.toContain("reserveObjectModuleMutation(");
  });

  it("maakt voor ieder moduletype een veilig concept met begrensde standaardvelden", () => {
    for (const moduleType of [
      "visitor_registration",
      "item_issuance",
      "mail_package_receipt",
      "lost_and_found",
      "object_calendar",
      "action_points",
    ]) {
      const revision = backend.normalizedObjectModuleRevisionData({}, moduleType);
      expect(revision.schema_version).toBe("loq-object-module-v1");
      expect(revision.field_definitions.length).toBeGreaterThan(0);
      expect(revision.retention_days).toBeGreaterThan(0);
      expect(revision.responsible_role).toBe("object_manager");
      expect(revision.reference_lists).toEqual([]);
      expect(revision.catalog_items).toEqual([]);
    }
  });

  it("houdt middelenuitgifte geblokkeerd totdat catalogus en verplichte selectielijst zijn ingericht", () => {
    const revision = backend.normalizedObjectModuleRevisionData({}, "item_issuance");
    const readiness = backend.objectModuleReadiness(moduleRecord(), revision);

    expect(readiness.ready_to_publish).toBe(false);
    expect(readiness.blocking_issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      "catalog_empty",
      "selection_source_missing",
    ]));
  });

  it("laat essentiële velden niet optioneel maken of naar een ongeschikt invoertype omzetten", () => {
    const revision = backend.normalizedObjectModuleRevisionData({}, "item_issuance");
    revision.field_definitions = revision.field_definitions.map(field => field.id === "issued_to"
      ? { ...field, required: false, field_type: "checkbox" }
      : field);

    const readiness = backend.objectModuleReadiness(moduleRecord(), revision);

    expect(readiness.ready_to_publish).toBe(false);
    expect(readiness.blocking_issues).toContainEqual(expect.objectContaining({
      code: "required_field_invalid",
      field_id: "issued_to",
      required_type: "select",
    }));
  });

  it("valideert catalogus-, personen- en tijdreferenties server-side", () => {
    expect(() => backend.normalizedObjectModuleRevisionData({
      reference_lists: [{
        id: "people",
        name: "Personeel",
        subject_type: "person",
        entries: [{ id: "person-1", label: "Persoon 1" }],
      }],
      availability_windows: [{ id: "office-hours", name: "Werkdagen", days: ["mon", "tue"], start_time: "08:00", end_time: "18:00" }],
      catalog_items: [{
        id: "room-key",
        code: "K-101",
        name: "Kamersleutel 101",
        tracking_mode: "serialized",
        allowed_reference_entry_ids: ["unknown-person"],
        availability_window_ids: ["office-hours"],
      }],
    }, "item_issuance")).toThrow(/onbekend keuzelijstitem/i);
  });

  it("weigert dubbele modulekoppelingen in een beveiligingsplan", () => {
    expect(() => backend.normalizedSecurityPlanModuleAssignments([
      { id: "one", module_id: "module-items", access_mode: "read" },
      { id: "two", module_id: "module-items", access_mode: "register" },
    ])).toThrow(/maar een keer/i);
  });

  it("blokkeert een planlink naar een module buiten het object of zonder publicatie", () => {
    const plan = {
      customer_id: "customer-1",
      object_id: "object-1",
      task_type: "reception",
      variant_name: "Werkdagen",
      execution_mode: "continuous_post",
    };
    const revision = {
      duration_minutes: 480,
      section_policy: "not_applicable",
      default_section_ids: [],
      allowed_section_ids: [],
      instruction_blocks: [{
        id: "block-1",
        steps: [{ id: "step-1", title: "Start", instruction: "Start de receptie." }],
      }],
      module_assignments: [{ id: "link-1", module_id: "module-items", access_mode: "register" }],
      route_overlay: null,
    };

    const unavailable = backend.securityPlanStructuralReadiness(plan, revision, [], [], [], [
      moduleRecord({ object_id: "other-object", status: "active", current_published_revision_id: "module-revision-1" }),
    ]);
    expect(unavailable.blocking_issues).toContainEqual(expect.objectContaining({ code: "module_unavailable" }));

    const available = backend.securityPlanStructuralReadiness(plan, revision, [], [], [], [
      moduleRecord({ status: "active", current_published_revision_id: "module-revision-1" }),
    ]);
    expect(available.blocking_issues).not.toContainEqual(expect.objectContaining({ code: "module_unavailable" }));
  });

  it("beveiligt beide module-entiteiten tegen directe browser-CRUD", () => {
    for (const name of ["ObjectOperationalModule", "ObjectOperationalModuleRevision"]) {
      const schema = JSON.parse(fs.readFileSync(path.join(root, `base44/entities/${name}.jsonc`), "utf8"));
      expect(schema.name).toBe(name);
      expect(schema.rls).toEqual({ create: false, read: false, update: false, delete: false });
      if (name === "ObjectOperationalModule") {
        expect(schema.properties.suspension_reason?.maxLength).toBe(500);
        expect(schema.properties.archive_reason?.maxLength).toBe(500);
      }
    }
  });

  it("houdt namen uit keuzelijsten buiten het algemene objectlogboek", () => {
    const revision = backend.normalizedObjectModuleRevisionData({
      reference_lists: [{
        id: "people",
        name: "Personeel",
        subject_type: "person",
        entries: [{ id: "person-private", label: "Gevoelige Persoonsnaam" }],
      }],
    }, "visitor_registration");
    const audit = backend.objectModuleAuditResult(moduleRecord({ module_type: "visitor_registration" }), revision, "Module gewijzigd");

    expect(JSON.stringify(audit)).not.toContain("Gevoelige Persoonsnaam");
    expect(audit.revision.reference_entry_count).toBe(1);
    expect(audit.changes).toContainEqual(expect.objectContaining({
      field: "module_reference_entry_count",
      before: 0,
      after: 1,
    }));
  });

  it("vereist een begrensde reden voor pauzeren en archiveren", () => {
    expect(() => backend.normalizedObjectModuleStatusReason({ data: {} }, "suspended")).toThrow(/reden voor pauzeren.*verplicht/i);
    expect(() => backend.normalizedObjectModuleStatusReason({ data: { reason: " ".repeat(4) } }, "archived")).toThrow(/reden voor archiveren.*verplicht/i);
    expect(() => backend.normalizedObjectModuleStatusReason({ data: { reason: "x".repeat(501) } }, "archived")).toThrow(/maximaal 500/i);
    expect(backend.normalizedObjectModuleStatusReason({ data: { reason: "  Tijdelijk onderhoud  " } }, "suspended")).toBe("Tijdelijk onderhoud");
    expect(backend.normalizedObjectModuleStatusReason({ data: {} }, "active")).toBeNull();
  });

  it("bewaart statusredenen en levert uitsluitend de begrensde redenen als auditwijziging", () => {
    const suspended = backend.projectedObjectModuleStatus(
      moduleRecord({ status: "active", version: 4 }),
      "suspended",
      "user-1",
      "Tijdelijk onderhoud",
      "2026-08-05T12:00:00.000Z",
      5,
    );
    expect(suspended).toMatchObject({
      status: "suspended",
      suspension_reason: "Tijdelijk onderhoud",
      suspended_by_user_id: "user-1",
      suspended_at: "2026-08-05T12:00:00.000Z",
      version: 5,
    });

    const archived = backend.projectedObjectModuleStatus(
      suspended,
      "archived",
      "user-2",
      "Proces definitief vervangen",
      "2026-08-05T13:00:00.000Z",
      6,
    );
    const audit = backend.objectModuleAuditResult(archived, null, "Module gearchiveerd", suspended, null);
    expect(archived).toMatchObject({
      status: "archived",
      archive_reason: "Proces definitief vervangen",
      archived_by_user_id: "user-2",
      archived_at: "2026-08-05T13:00:00.000Z",
      version: 6,
    });
    expect(audit.module).toMatchObject({ archive_reason: "Proces definitief vervangen", suspension_reason: "Tijdelijk onderhoud" });
    expect(audit.changes).toContainEqual({
      field: "module_archive_reason",
      label: "Reden archiveren",
      before: null,
      after: "Proces definitief vervangen",
    });
  });
});
