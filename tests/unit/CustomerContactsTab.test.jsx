import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContactsTab } from "@/components/customers/CustomerDossierTabs";
import { CUSTOMER_TABS } from "@/components/customers/customerDossierUtils";

const objects = [
  { id: "object-1", object_code: "OBJ-01", name: "Hoofdkantoor" },
  { id: "object-2", object_code: "OBJ-02", name: "Distributiecentrum" },
  { id: "object-3", object_code: "OBJ-03", name: "Parkeergarage" },
];

const contacts = [
  {
    id: "contact-all",
    first_name: "Lisa",
    last_name: "Jansen",
    job_title: "Directeur",
    status: "active",
    is_primary: true,
    updated_date: "2026-07-29T10:00:00.000Z",
  },
  {
    id: "contact-13",
    first_name: "Noor",
    name_prefix: "van",
    last_name: "Dijk",
    job_title: "Financieel contactpersoon",
    status: "active",
    updated_date: "2026-07-29T11:00:00.000Z",
  },
  {
    id: "contact-2",
    first_name: "Sam",
    last_name: "Visser",
    job_title: "Objectbeheerder",
    status: "active",
    updated_date: "2026-07-29T12:00:00.000Z",
  },
];

const core = {
  contacts,
  contactPoints: [
    { id: "point-1", contact_id: "contact-all", point_type: "email", value: "lisa@example.nl" },
    { id: "point-2", contact_id: "contact-13", point_type: "phone", value: "06 11111111" },
    { id: "point-3", contact_id: "contact-2", point_type: "email", value: "sam@example.nl" },
  ],
  contactRoles: [
    { id: "role-all", contact_id: "contact-all", role: "operational", object_ids: [], status: "active" },
    { id: "role-13", contact_id: "contact-13", role: "operational", object_ids: ["object-1", "object-3"], status: "active" },
    { id: "role-2", contact_id: "contact-2", role: "operational", object_ids: ["object-2"], status: "active" },
  ],
};

function ContactsHarness({ availableObjects = objects, onAddContact = vi.fn() }) {
  const [activeObjectId, setActiveObjectId] = useState("all");
  return (
    <ContactsTab
      core={core}
      objects={availableObjects}
      activeObjectId={activeObjectId}
      onObjectChange={setActiveObjectId}
      onAddContact={onAddContact}
      wizardOpen={false}
      onCloseWizard={vi.fn()}
      onSaveContact={vi.fn()}
      contactSaving={false}
      selectedRow={null}
      onSelectRow={vi.fn()}
    />
  );
}

describe("ContactsTab", () => {
  it("heet Contacten, toont geen adressen en filtert per klantobject", () => {
    render(<ContactsHarness />);

    expect(CUSTOMER_TABS.find(tab => tab.key === "contacts")?.label).toBe("Contacten");
    expect(screen.queryByText("Adressen")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Contact toevoegen" })).toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map(tab => tab.textContent)).toEqual([
      "Alle",
      "Hoofdkantoor",
      "Distributiecentrum",
      "Parkeergarage",
    ]);

    let table = screen.getByRole("table");
    expect(within(table).getByText("Lisa Jansen")).toBeInTheDocument();
    expect(within(table).getByText("Noor van Dijk")).toBeInTheDocument();
    expect(within(table).getByText("Sam Visser")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Distributiecentrum" }));
    table = screen.getByRole("table");
    expect(within(table).getByText("Lisa Jansen")).toBeInTheDocument();
    expect(within(table).queryByText("Noor van Dijk")).not.toBeInTheDocument();
    expect(within(table).getByText("Sam Visser")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Parkeergarage" }));
    table = screen.getByRole("table");
    expect(within(table).getByText("Lisa Jansen")).toBeInTheDocument();
    expect(within(table).getByText("Noor van Dijk")).toBeInTheDocument();
    expect(within(table).queryByText("Sam Visser")).not.toBeInTheDocument();
  });

  it("toont zonder klantobjecten uitsluitend de tab Alle", () => {
    render(<ContactsHarness availableObjects={[]} />);

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "Alle" })).toHaveAttribute("aria-selected", "true");
  });

  it("start de contactwizard vanuit de primaire tabelactie", () => {
    const onAddContact = vi.fn();
    render(<ContactsHarness onAddContact={onAddContact} />);

    fireEvent.click(screen.getByRole("button", { name: "Contact toevoegen" }));

    expect(onAddContact).toHaveBeenCalledTimes(1);
  });
});
