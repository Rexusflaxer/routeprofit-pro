import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const schema = name => JSON.parse(read(`base44/entities/${name}.jsonc`));
const api = read("base44/functions/customerPlatformApi/entry.ts");

describe("beveiligde objectmodules backendgrenzen", () => {
  it("laat waarschuwingsadressen, sleutels en installaties alleen via service-role workflows lopen", () => {
    for (const entity of [
      "ObjectWarningAddress",
      "WarningAddressAvailabilityOverride",
      "ObjectKey",
      "ObjectKeyAssignment",
      "ObjectKeySet",
      "ObjectInstallation",
      "ObjectInstallationCredential",
    ]) {
      expect(schema(entity).rls).toEqual({ create: false, read: false, update: false, delete: false });
    }
  });

  it("activeert datumafwijkingen pas via één atomair gewijzigde head-projectie", () => {
    expect(schema("ObjectWarningAddress").properties).toHaveProperty("availability_override_heads");
    expect(api).toContain("availability_override_heads: nextHeads");
    expect(api).toContain("record_status: 'deleted'");
    expect(api).not.toMatch(/getEntity\(base44, 'WarningAddressAvailabilityOverride'\)\.delete/);
  });

  it("hydrateert alle actieve override-heads en bindt orphan-replay aan actor, target en payload", () => {
    const overrideProperties = schema("WarningAddressAvailabilityOverride").properties;
    expect(overrideProperties).toHaveProperty("creation_request_fingerprint");
    expect(overrideProperties).toHaveProperty("creation_payload_fingerprint");
    expect(overrideProperties).toHaveProperty("creation_actor_user_id");
    expect(overrideProperties).toHaveProperty("creation_mutation_target");
    expect(api).toContain("async function hydrateWarningAvailabilityOverrideHeads");
    expect(api).toContain("getRecord(base44, 'WarningAddressAvailabilityOverride', id)");
    expect(api).toContain("assertWarningOverrideCreationBinding");
  });

  it("serialiseert adres-, volgorde- en bereikbaarheidswijzigingen via één objectbreed slot", () => {
    const objectProperties = schema("SurveillanceObject").properties;
    expect(objectProperties).toHaveProperty("warning_address_mutation_lock");
    expect(objectProperties).toHaveProperty("warning_address_mutation_lock_version");
    expect(objectProperties).toHaveProperty("warning_address_order_ids");
    expect(objectProperties).toHaveProperty("warning_address_order_version");
    expect(objectProperties).toHaveProperty("warning_address_mutation_recoveries");
    expect(api).toContain("async function reserveWarningAddressMutation");
    expect(api).toContain("async function updateWarningAddressOrderUnderReservation");
    expect(api).toContain("reconcileWarningAddressOrderRecovery");
    const reorderHandler = api.slice(api.indexOf("async function handleReorderObjectWarningAddresses"), api.indexOf("function objectKeyMutationLockVersion"));
    expect(reorderHandler).toContain("expected_order_version");
    expect(reorderHandler).toContain("warningAddressOrderRecoveryPatch");
    expect(reorderHandler).not.toContain("bulkUpdate");
    expect(api).toContain("const warningOrderReplay = action === 'reorder_object_warning_addresses'");
    expect(api).toContain("async function handleWarningAvailabilityMutation");
    expect(api).toMatch(/case 'upsert_warning_availability_overrides':\s*case 'delete_warning_availability_override':\s*return handleWarningAvailabilityMutation/);
    const availabilityHandler = api.slice(
      api.indexOf("async function handleWarningAvailabilityMutation"),
      api.indexOf("async function deactivateWarningRoleIfUnused"),
    );
    expect(availabilityHandler).toContain("reserveWarningAddressMutation");
    expect(availabilityHandler).toContain("releaseWarningAddressMutation");
  });

  it("fingerprint codewaarden met een server-keyed HMAC en selecteert één versleutelde credentialbundel", () => {
    expect(api).toContain("key === 'credentials'");
    expect(api).toContain("credentialRequestHmac");
    expect(api).toContain("name: 'HMAC'");
    expect(api).toContain("CUSTOMER_PLATFORM_FINGERPRINT_HMAC_KEY_B64");
    expect(api).not.toContain("'[REDACTED]'");
    expect(api).toContain("name: 'HKDF'");
    expect(api).toContain("active_credential_id");
    expect(api).toContain("credential_type: 'bundle'");
    expect(schema("ObjectInstallationCredential").properties).toHaveProperty("encryption_key_source");
    expect(api).toContain("keySource === 'managed_file_hkdf'");
    expect(api).toContain("keySource === 'dedicated'");
    expect(api).toContain("OBJECT_INSTALLATION_MASTER_KEYS_JSON");
    expect(api).toContain("MANAGED_FILE_MASTER_KEYS_JSON");
    const safeProjection = api.slice(api.indexOf("function safeObjectInstallation"), api.indexOf("async function installationCredentialState"));
    expect(safeProjection).not.toContain("encrypted_value");
    expect(safeProjection).not.toContain("encryption_iv");
  });

  it("trekt installatiecodes expliciet in en ruimt alleen niet-actieve bundels na een wachttijd op", () => {
    const updateHandler = api.slice(api.indexOf("async function handleUpdateObjectInstallation"), api.indexOf("async function handleArchiveObjectInstallation"));
    expect(updateHandler).toContain("normalizedInstallationCredentialRevocations");
    expect(updateHandler).toContain("Beveiligde codes ingetrokken");
    expect(updateHandler).toContain("delete desiredValues[credentialType]");
    expect(api).toContain("INSTALLATION_CREDENTIAL_CLEANUP_GRACE_MS");
    expect(api).toContain("asString(installation.active_credential_id) === credential.id");
    expect(api).toContain("credential.status !== 'superseded'");
    expect(api).toContain("ObjectInstallationCredential').delete(credential.id)");
  });

  it("serialiseert alle installatiemutaties op één objectgebonden CAS-slot", () => {
    const objectSchema = schema("SurveillanceObject");
    expect(objectSchema.properties.installation_mutation_lock.type).toEqual(["object", "null"]);
    expect(objectSchema.properties.installation_mutation_lock_version).toMatchObject({
      type: "integer",
      minimum: 0,
      default: 0,
    });
    expect(api).toContain("async function reserveObjectInstallationMutation");
    expect(api).toContain("$inc: { installation_mutation_lock_version: 1 }");
    expect(api).toContain("return handleObjectInstallationMutation(base44, user, action");
  });

  it("voorkomt dat een gewone sleutelwijziging meerdere records half muteert", () => {
    const updateHandler = api.slice(api.indexOf("async function handleUpdateObjectKey"), api.indexOf("async function handleArchiveObjectKey"));
    expect(updateHandler).toContain("kan niet stil naar een andere set worden verplaatst");
    expect(updateHandler).not.toMatch(/casUpdate\(base44, 'ObjectKeyAssignment'/);
    expect(updateHandler).toContain("mutationRecoveryPatch");
  });

  it("serialiseert alle sleutelmutaties op één objectgebonden CAS-slot", () => {
    const objectSchema = schema("SurveillanceObject");
    expect(objectSchema.properties.object_key_mutation_lock.type).toEqual(["object", "null"]);
    expect(objectSchema.properties.object_key_mutation_lock_version).toMatchObject({
      type: "integer",
      minimum: 0,
      default: 0,
    });
    expect(api).toContain("async function reserveObjectKeyMutation");
    expect(api).toContain("$inc: { object_key_mutation_lock_version: 1 }");
    expect(api).toContain("return handleObjectKeyMutation(base44, user, action");
  });

  it("bindt sleutel-create recovery op ieder nieuw record en behoudt lege actieve sets", () => {
    for (const entity of ["ObjectKey", "ObjectKeyAssignment", "ObjectKeySet"]) {
      expect(schema(entity).properties).toHaveProperty("creation_request_fingerprint");
      expect(schema(entity).properties).toHaveProperty("creation_actor_user_id");
      expect(schema(entity).properties).toHaveProperty("creation_mutation_target");
    }
    expect(schema("ObjectKey").properties).toHaveProperty("creation_key_set_id");
    expect(api).toContain("key.creation_key_set_id !== set.id");
    const listHandler = api.slice(api.indexOf("async function handleListObjectKeys"), api.indexOf("async function requireScopedObjectKeyAssignment"));
    expect(listHandler).not.toContain(".filter((set: LooseRecord) => set.keys.length > 0)");
  });

  it("doorzoekt gevoelige sleutels en installaties niet via de algemene clientzoeker", () => {
    const searchConfig = read("src/components/search/globalSearchConfig.js");
    expect(searchConfig).not.toContain('entity: "ObjectKeySet"');
    expect(searchConfig).not.toContain('entity: "ObjectInstallation"');
  });
});
