import { describe, expect, it } from "vitest";
import {
  OBJECT_MODULE_CATALOG,
  emptyObjectModuleConfiguration,
  normalizeObjectModuleConfiguration,
  objectModuleReadiness,
} from "@/components/objects/objectModuleConfig";

describe("objectModuleConfig", () => {
  it("houdt de zes clientdefaults gelijk aan het opgeslagen fase-1 contract", () => {
    expect(OBJECT_MODULE_CATALOG).toHaveLength(6);
    for (const definition of OBJECT_MODULE_CATALOG) {
      const configuration = emptyObjectModuleConfiguration(definition.key);
      expect(configuration.summary).toBe("");
      expect(configuration.responsible_role).toBe("object_manager");
      expect(configuration.retention_days).toBe(definition.defaultRetentionDays);
      expect(configuration.field_definitions.length).toBeGreaterThan(0);
    }
    expect(OBJECT_MODULE_CATALOG.find(item => item.key === "action_points")?.defaultRetentionDays).toBe(365);
  });

  it("blokkeert ook lokaal wanneer een essentieel veld optioneel of van type veranderd is", () => {
    const configuration = emptyObjectModuleConfiguration("item_issuance");
    configuration.field_definitions = configuration.field_definitions.map(field => field.id === "issued_to"
      ? { ...field, required: false, field_type: "checkbox" }
      : field);

    const readiness = objectModuleReadiness({
      module_type: "item_issuance",
      display_name: "Middelenuitgifte",
    }, { configuration });

    expect(readiness.ready).toBe(false);
    expect(readiness.blocking).toContain("Uitgegeven aan moet verplicht blijven en het oorspronkelijke invoertype behouden.");
  });

  it("accepteert een bruikbare middelenconfiguratie met gedeelde ontvangerslijst", () => {
    const configuration = emptyObjectModuleConfiguration("item_issuance");
    configuration.reference_lists = [{
      id: "people",
      name: "Personeel",
      subject_type: "employee",
      description: "",
      entries: [{ id: "person-1", label: "Testpersoon", secondary_label: "", external_reference: "", status: "active" }],
      sequence: 1,
    }];
    configuration.field_definitions = configuration.field_definitions.map(field => field.id === "issued_to"
      ? { ...field, reference_list_id: "people" }
      : field);
    configuration.catalog_items = [{
      id: "key-101",
      name: "Kamersleutel 101",
      code: "K101",
      category: "Sleutels",
      description: "",
      tracking_mode: "serialized",
      quantity: 1,
      expected_return_minutes: 480,
      requires_authorization: false,
      eligibility_mode: "all",
      allowed_reference_entry_ids: [],
      denied_reference_entry_ids: [],
      availability_window_ids: [],
      status: "active",
      sequence: 1,
    }];

    const normalized = normalizeObjectModuleConfiguration("item_issuance", configuration);
    const readiness = objectModuleReadiness({
      module_type: "item_issuance",
      display_name: "Middelenuitgifte",
    }, { configuration: normalized });

    expect(readiness.ready).toBe(true);
    expect(readiness.blocking).toEqual([]);
  });
});
