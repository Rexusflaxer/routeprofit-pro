import { describe, expect, it } from "vitest";
import {
  contactMatchesObject,
  formatContactObjectScope,
  resolveContactObjectScope,
} from "../../src/components/customers/customerContactScope.js";

const objects = [
  { id: "object-1", name: "Hoofdkantoor" },
  { id: "object-2", name: "Distributiecentrum" },
  { id: "object-3", object_code: "OBJ-003" },
];

describe("customerContactScope", () => {
  it("behandelt een actieve rol zonder objecten als klantbreed", () => {
    const roles = [{
      contact_id: "contact-1",
      role: "operational",
      object_ids: [],
      status: "active",
    }];

    expect(resolveContactObjectScope(roles, "contact-1")).toEqual({
      mode: "all",
      isAllObjects: true,
      objectIds: [],
      source: "role",
    });
    expect(contactMatchesObject(roles, "contact-1", "object-2")).toBe(true);
    expect(formatContactObjectScope(roles, "contact-1", objects)).toBe("Alle objecten");
  });

  it("voegt expliciete objectscopes samen en dedupliceert IDs", () => {
    const roles = [
      {
        contact_id: "contact-1",
        role: "reports",
        object_ids: ["object-1", "object-2", "object-1"],
        status: "active",
      },
      {
        contact_id: "contact-1",
        role: "planning",
        object_ids: ["object-2", "object-3"],
        status: "active",
      },
    ];

    expect(resolveContactObjectScope(roles, "contact-1")).toEqual({
      mode: "selected",
      isAllObjects: false,
      objectIds: ["object-1", "object-2", "object-3"],
      source: "role",
    });
    expect(contactMatchesObject(roles, "contact-1", "all")).toBe(true);
    expect(contactMatchesObject(roles, "contact-1", "object-2")).toBe(true);
    expect(contactMatchesObject(roles, "contact-1", "object-4")).toBe(false);
    expect(formatContactObjectScope(roles, "contact-1", objects)).toBe(
      "Hoofdkantoor, Distributiecentrum, OBJ-003",
    );
  });

  it("laat ingetrokken rollen niet stil terugvallen naar klantbrede bevoegdheid", () => {
    const roles = [
      {
        contact_id: "contact-1",
        role: "reports",
        object_ids: ["object-1"],
        status: "archived",
      },
      {
        contact_id: "contact-1",
        role: "planning",
        object_ids: ["object-2"],
        status: "inactive",
      },
      {
        contact_id: "contact-2",
        role: "operational",
        object_ids: ["object-3"],
        status: "active",
      },
    ];

    expect(resolveContactObjectScope(roles, "contact-1")).toEqual({
      mode: "none",
      isAllObjects: false,
      objectIds: [],
      source: "inactive",
    });
    expect(contactMatchesObject(roles, "contact-1", "all")).toBe(true);
    expect(contactMatchesObject(roles, "contact-1", "object-3")).toBe(false);
    expect(formatContactObjectScope(roles, "contact-1", objects)).toBe(
      "Geen actieve objectbevoegdheid",
    );
  });

  it("behandelt een werkelijk legacy contact zonder rolrecords als klantbreed", () => {
    expect(resolveContactObjectScope([], "contact-1")).toEqual({
      mode: "all",
      isAllObjects: true,
      objectIds: [],
      source: "legacy",
    });
    expect(contactMatchesObject([], "contact-1", "object-3")).toBe(true);
  });

  it("laat een klantbrede actieve rol prevaleren boven specifieke rollen", () => {
    const roles = [
      {
        contact_id: "contact-1",
        role: "reports",
        object_ids: ["object-1"],
        status: "active",
      },
      {
        contact_id: "contact-1",
        role: "billing",
        object_ids: [],
        status: "active",
      },
      {
        contact_id: "contact-1",
        role: "planning",
        object_ids: ["object-2"],
        status: "inactive",
      },
    ];

    expect(resolveContactObjectScope(roles, "contact-1")).toEqual({
      mode: "all",
      isAllObjects: true,
      objectIds: [],
      source: "role",
    });
    expect(contactMatchesObject(roles, "contact-1", "object-3")).toBe(true);
  });

  it("geeft een leesbare fallback voor een verdwenen objectkoppeling", () => {
    const roles = [{
      contact_id: "contact-1",
      role: "reports",
      object_ids: ["missing-object"],
      status: "active",
    }];

    expect(formatContactObjectScope(roles, "contact-1", objects)).toBe(
      "Onbekend object (missing-object)",
    );
  });
});
