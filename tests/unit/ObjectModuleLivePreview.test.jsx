import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ObjectModuleLivePreview, {
  evaluateItemIssuanceAccess,
  isObjectModulePreviewValuePresent,
  isObjectModuleWindowActive,
} from "@/components/objects/ObjectModuleLivePreview";
import { emptyObjectModuleConfiguration } from "@/components/objects/objectModuleConfig";

const moduleTitles = {
  visitor_registration: "Bezoeker aanmelden",
  item_issuance: "Middel uitgeven",
  mail_package_receipt: "Post of pakket ontvangen",
  lost_and_found: "Gevonden voorwerp registreren",
  object_calendar: "Afspraak of evenement plannen",
  action_points: "Actiepunt toevoegen",
};

function issuanceConfiguration() {
  return {
    ...emptyObjectModuleConfiguration("item_issuance"),
    reference_lists: [{
      id: "people",
      name: "Personeel en kamers",
      subject_type: "person",
      entries: [
        { id: "person-allowed", label: "A. Jansen", status: "active" },
        { id: "person-denied", label: "B. de Vries", status: "active" },
      ],
    }],
    catalog_items: [{
      id: "key-101",
      name: "Kamersleutel 101",
      code: "K101",
      tracking_mode: "serialized",
      quantity: 1,
      requires_authorization: true,
      eligibility_mode: "allow_list",
      allowed_reference_entry_ids: ["person-allowed", "person-denied"],
      denied_reference_entry_ids: [],
      availability_window_ids: ["office-hours"],
      status: "active",
    }],
    availability_windows: [{
      id: "office-hours",
      name: "Werkdagen",
      days: ["mon", "tue", "wed", "thu", "fri"],
      start_time: "08:00",
      end_time: "18:00",
    }],
    authorization_rules: [{
      id: "deny-person",
      name: "Geblokkeerde ontvanger",
      effect: "deny",
      catalog_item_ids: ["key-101"],
      subject_entry_ids: ["person-denied"],
      availability_window_ids: [],
      note: "Geen sleutelbevoegdheid.",
      status: "active",
    }],
  };
}

describe("ObjectModuleLivePreview", () => {
  it.each(Object.entries(moduleTitles))("toont voor %s het eigen operationele voorbeeld", (moduleType, title) => {
    render(<ObjectModuleLivePreview module={{ module_type: moduleType, display_name: title }} configuration={emptyObjectModuleConfiguration(moduleType)} />);

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(/Testmodus, niets opgeslagen/i)).toBeInTheDocument();
  });

  it("werkt direct mee met lokale niet-opgeslagen veldwijzigingen", () => {
    const module = { module_type: "visitor_registration", display_name: "Bezoekers" };
    const first = emptyObjectModuleConfiguration("visitor_registration");
    const { rerender } = render(<ObjectModuleLivePreview module={module} configuration={first} />);

    expect(screen.getByLabelText(/Naam bezoeker/)).toBeInTheDocument();

    const changed = {
      ...first,
      field_definitions: first.field_definitions.map(field => field.id === "visitor_name"
        ? { ...field, label: "Volledige naam gast" }
        : field.id === "company"
          ? { ...field, enabled: false }
          : field),
    };
    rerender(<ObjectModuleLivePreview module={module} configuration={changed} />);

    expect(screen.getByLabelText(/Volledige naam gast/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Bedrijf")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aanmelding testen" })).toBeDisabled();
    expect(screen.getByRole("note")).toHaveTextContent("Volledige naam gast");
    fireEvent.change(screen.getByLabelText(/Volledige naam gast/), { target: { value: "Jan Jansen" } });
    fireEvent.change(screen.getByLabelText(/Aankomsttijd/), { target: { value: "09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Aanmelding testen" }));
    expect(screen.getByRole("status")).toHaveTextContent("Deze simulatie is niet opgeslagen");
  });

  it("laat een gearchiveerde module nog als read-only configuratie testen", () => {
    render(<ObjectModuleLivePreview module={{ module_type: "visitor_registration", display_name: "Bezoekers", status: "archived" }} configuration={emptyObjectModuleConfiguration("visitor_registration")} />);

    fireEvent.change(screen.getByLabelText(/Naam bezoeker/), { target: { value: "Testbezoeker" } });
    fireEvent.change(screen.getByLabelText(/Aankomsttijd/), { target: { value: "10:00" } });
    expect(screen.getByRole("button", { name: "Aanmelding testen" })).toBeEnabled();
  });

  it("controleert verplichte tekst-, checkbox-, meerkeuze- en bewijsvelden", () => {
    expect(isObjectModulePreviewValuePresent({ required: true, field_type: "text" }, "  ")).toBe(false);
    expect(isObjectModulePreviewValuePresent({ required: true, field_type: "text" }, "ingevuld")).toBe(true);
    expect(isObjectModulePreviewValuePresent({ required: true, field_type: "checkbox" }, false)).toBe(false);
    expect(isObjectModulePreviewValuePresent({ required: true, field_type: "checkbox" }, true)).toBe(true);
    expect(isObjectModulePreviewValuePresent({ required: true, field_type: "multiselect" }, [])).toBe(false);
    expect(isObjectModulePreviewValuePresent({ required: true, field_type: "multiselect" }, ["optie"])).toBe(true);
    expect(isObjectModulePreviewValuePresent({ required: true, field_type: "photo" }, null)).toBe(false);
    expect(isObjectModulePreviewValuePresent({ required: true, field_type: "photo" }, "simulated")).toBe(true);
  });

  it("past bij middelenuitgifte tijd, directe toestemming en deny-wins toe", () => {
    const configuration = issuanceConfiguration();
    const mondayMorning = new Date(2026, 7, 3, 10, 0);
    const mondayEvening = new Date(2026, 7, 3, 20, 0);

    expect(evaluateItemIssuanceAccess({ configuration, itemId: "key-101", subjectId: "person-allowed", moment: mondayMorning })).toMatchObject({ allowed: true, code: "allowed" });
    expect(evaluateItemIssuanceAccess({ configuration, itemId: "key-101", subjectId: "person-denied", moment: mondayMorning })).toMatchObject({ allowed: false, code: "denied", detail: "Geen sleutelbevoegdheid." });
    expect(evaluateItemIssuanceAccess({ configuration, itemId: "key-101", subjectId: "person-allowed", moment: mondayEvening })).toMatchObject({ allowed: false, code: "outside_window" });
  });

  it("begrijpt tijdvensters die over middernacht doorlopen", () => {
    const overnight = { days: ["mon"], start_time: "22:00", end_time: "06:00" };

    expect(isObjectModuleWindowActive(overnight, new Date(2026, 7, 3, 23, 0))).toBe(true);
    expect(isObjectModuleWindowActive(overnight, new Date(2026, 7, 4, 2, 0))).toBe(true);
    expect(isObjectModuleWindowActive(overnight, new Date(2026, 7, 4, 7, 0))).toBe(false);
  });
});
