import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listWarnings,
  listLogbook,
  createWarning,
  updateWarning,
} = vi.hoisted(() => ({
  listWarnings: vi.fn(),
  listLogbook: vi.fn(),
  createWarning: vi.fn(),
  updateWarning: vi.fn(),
}));

vi.mock("@/components/objects/objectWarningAddressWorkflow", () => ({
  createObjectWarningAddress: createWarning,
  createObjectWarningAddressKey: vi.fn(() => "warning-key"),
  listObjectLogbook: listLogbook,
  listObjectWarningAddresses: listWarnings,
  updateObjectWarningAddress: updateWarning,
  updateObjectWarningAddressKey: vi.fn(() => "warning-update-key"),
}));

import ObjectCardTabs from "@/components/objects/ObjectCardTabs";

const object = { id: "object-1", customer_id: "customer-1", status: "active" };
const warning = {
  id: "warning-1",
  customer_id: "customer-1",
  object_id: "object-1",
  contact_id: "contact-1",
  display_name: "Sanne de Vries",
  job_title: "Objectbeheerder",
  primary_phone: "06 12345678",
  secondary_phone: null,
  primary_contact_point_id: "point-1",
  secondary_contact_point_id: null,
  relationship_type: "keyholder",
  relationship_label: "Sleutelhouder",
  call_order: 1,
  availability_mode: "always",
  not_call_periods: [],
  status: "active",
  version: 2,
  updated_date: "2026-07-31T10:00:00Z",
};

function Harness({ onOpenCreate = vi.fn(), onOpenEdit = vi.fn() }) {
  const [activeTab, setActiveTab] = useState("warning-addresses");
  const [search, setSearch] = useState("");
  return (
    <ObjectCardTabs
      object={object}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      searchTerm={search}
      onSearchChange={setSearch}
      page={1}
      onPageChange={vi.fn()}
      view=""
      selectedRow={null}
      onOpenCreate={onOpenCreate}
      onOpenEdit={onOpenEdit}
      onCloseView={vi.fn()}
    />
  );
}

function renderHarness(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(<QueryClientProvider client={client}><Harness {...props} /></QueryClientProvider>);
}

describe("ObjectCardTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWarnings.mockResolvedValue({
      items: [warning],
      contact_options: [{ id: "contact-1", display_name: "Sanne de Vries", points: [{ id: "point-1", point_type: "phone", value: "06 12345678" }] }],
      next_call_order: 2,
    });
    listLogbook.mockResolvedValue({
      items: [{
        id: "event-1",
        occurred_at: "2026-07-31T10:00:00Z",
        action: "update_customer_object_identity",
        summary: "Objectgegevens gewijzigd",
        actor_name: "David Beheerder",
        category: "operations",
        changes: [
          { field: "name", label: "Objectnaam", before: "Oud", after: "Nieuw" },
          { field: "status", label: "Status", before: null, after: null },
        ],
      }],
      total: 1,
    });
  });

  it("toont de vaste objecttabs inclusief Kaart & terrein", async () => {
    renderHarness();

    expect(screen.getAllByRole("tab", { name: "Waarschuwingsadressen" })).toHaveLength(2);
    expect(screen.getAllByRole("tab", { name: "Logboek" })).toHaveLength(2);
    expect(screen.getAllByRole("tab", { name: "Kaart & terrein" })).toHaveLength(2);
    expect(screen.queryByRole("tab", { name: "Overzicht" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Planning & taken" })).not.toBeInTheDocument();
    expect((await screen.findAllByText("Sanne de Vries")).length).toBeGreaterThan(0);
  });

  it("houdt de waarschuwingsadressentabel vrij van logboek- en archiefacties", async () => {
    const onOpenCreate = vi.fn();
    const onOpenEdit = vi.fn();
    renderHarness({ onOpenCreate, onOpenEdit });

    const table = await screen.findByRole("table");
    expect(within(table).getByText("Sleutelhouder")).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: /logboek/i })).not.toBeInTheDocument();
    expect(within(table).queryByText(/archief/i)).not.toBeInTheDocument();

    fireEvent.click(within(table).getByRole("button", { name: "Sanne de Vries bewerken" }));
    expect(onOpenEdit).toHaveBeenCalledWith("warning-1");
    fireEvent.click(screen.getByRole("button", { name: "Waarschuwingsadres toevoegen" }));
    expect(onOpenCreate).toHaveBeenCalledTimes(1);
  });

  it("toont het objectbrede logboek in een eigen tabel met wijzigingen en actor", async () => {
    renderHarness();
    fireEvent.click(screen.getAllByRole("tab", { name: "Logboek" })[0]);

    await waitFor(() => expect(listLogbook).toHaveBeenCalledWith(expect.objectContaining({
      customerId: "customer-1",
      objectId: "object-1",
    })));
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Objectgegevens gewijzigd")).toBeInTheDocument();
    expect(within(table).getByText("Objectnaam: Oud → Nieuw")).toBeInTheDocument();
    expect(within(table).getByText("Status: Gewijzigd")).toBeInTheDocument();
    expect(within(table).getByText("David Beheerder")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Waarschuwingsadres toevoegen" })).not.toBeInTheDocument();
  });

  it("benoemt een laadfout specifiek en toont de technische referentie", async () => {
    const error = Object.assign(new Error("Klantplatformactie mislukt"), {
      status: 500,
      requestId: "request-warning-1",
    });
    listWarnings.mockRejectedValue(error);

    renderHarness();

    expect(await screen.findByText("De waarschuwingsadressen konden niet worden geladen.")).toBeInTheDocument();
    expect(screen.getByText("Klantplatformactie mislukt")).toBeInTheDocument();
    expect(screen.getByText("Status 500 · Referentie request-warning-1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Waarschuwingsadres toevoegen" })).not.toBeInTheDocument();
  });
});
