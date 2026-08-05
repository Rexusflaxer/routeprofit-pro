import { describe, expect, it } from "vitest";
import { objectModuleResourceDependencies } from "@/components/objects/ObjectModuleAdvancedEditors";

const configuration = {
  field_definitions: [{ id: "recipient", label: "Ontvanger", reference_list_id: "people" }],
  reference_lists: [{ id: "people", name: "Personen", entries: [{ id: "person-1", label: "A. Jansen" }] }],
  catalog_items: [{
    id: "key-101",
    name: "Kamersleutel 101",
    allowed_reference_entry_ids: ["person-1"],
    denied_reference_entry_ids: [],
    availability_window_ids: ["office-hours"],
  }],
  authorization_rules: [{
    id: "allow-key",
    name: "Sleutelbevoegdheid",
    catalog_item_ids: ["key-101"],
    subject_entry_ids: ["person-1"],
    availability_window_ids: ["office-hours"],
  }],
};

describe("objectModuleResourceDependencies", () => {
  it("toont alle afhankelijkheden voordat een keuzelijst of keuze wordt verwijderd", () => {
    expect(objectModuleResourceDependencies(configuration, "reference_list", "people")).toEqual([
      "veld ‘Ontvanger’",
      "middel ‘Kamersleutel 101’",
      "regel ‘Sleutelbevoegdheid’",
    ]);
    expect(objectModuleResourceDependencies(configuration, "reference_entry", "person-1")).toEqual([
      "middel ‘Kamersleutel 101’",
      "regel ‘Sleutelbevoegdheid’",
    ]);
  });

  it("blokkeert gekoppelde catalogusitems en tijdvensters maar niet losse bronnen", () => {
    expect(objectModuleResourceDependencies(configuration, "catalog_item", "key-101")).toEqual([
      "regel ‘Sleutelbevoegdheid’",
    ]);
    expect(objectModuleResourceDependencies(configuration, "availability_window", "office-hours")).toEqual([
      "middel ‘Kamersleutel 101’",
      "regel ‘Sleutelbevoegdheid’",
    ]);
    expect(objectModuleResourceDependencies(configuration, "catalog_item", "unused")).toEqual([]);
  });
});
