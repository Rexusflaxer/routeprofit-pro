import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { records } = vi.hoisted(() => ({
  records: {
    objects: [],
    collectives: [],
    contractLines: [],
  },
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      SurveillanceObject: { filter: vi.fn(async () => records.objects) },
      Collectief: { filter: vi.fn(async () => records.collectives) },
      CustomerContractLine: { filter: vi.fn(async () => records.contractLines) },
    },
    functions: { invoke: vi.fn() },
  },
}));

import { ObjectsTab } from "@/components/customers/CustomerDossierTabs";

function ObjectsHarness({ navigate = vi.fn(), onAddObject = vi.fn(), wizardOpen = false }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  return (
    <ObjectsTab
      customer={{ id: "customer-1", trade_name: "Acme" }}
      customerId="customer-1"
      navigate={navigate}
      selectedRow={null}
      onSelectRow={vi.fn()}
      onAddObject={onAddObject}
      wizardOpen={wizardOpen}
      onCloseWizard={vi.fn()}
      onSaveObject={vi.fn()}
      objectSaving={false}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      statusFilter={statusFilter}
      onStatusChange={setStatusFilter}
    />
  );
}

function renderObjects(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ObjectsHarness {...props} />
    </QueryClientProvider>,
  );
}

describe("ObjectsTab", () => {
  beforeEach(() => {
    records.objects = [
      {
        id: "object/1",
        object_code: "OBJ-001",
        name: "Hoofdkantoor",
        object_type: "office",
        address: "Coolsingel 1, Rotterdam",
        region: "Rotterdam",
        status: "active",
        geocoding_status: "verified",
        latitude: 51.92,
        longitude: 4.48,
        updated_date: "2026-07-30T10:00:00.000Z",
      },
      {
        id: "object-2",
        object_code: "OBJ-002",
        name: "Distributiecentrum",
        object_type: "industrial_logistics",
        address: "Reactorweg 1, Utrecht",
        status: "concept",
        geocoding_status: "unverified",
        updated_date: "2026-07-31T10:00:00.000Z",
      },
    ];
    records.collectives = [{ id: "collective-1", name: "Route Zuid", object_ids: ["object/1"] }];
    records.contractLines = [{
      id: "line-1",
      customer_id: "customer-1",
      object_id: "object/1",
      scope_type: "object",
      name: "Mobiele surveillance",
      status: "active",
    }];
  });

  it("vervangt de oude kaarten door de bekende volledige objectentabel", async () => {
    const onAddObject = vi.fn();
    renderObjects({ onAddObject });

    const table = await screen.findByRole("table");
    expect(screen.queryByText("Aandacht nodig")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Collectieven$/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Object toevoegen" })).toBeInTheDocument();
    expect(within(table).getByText("Hoofdkantoor")).toBeInTheDocument();
    expect(within(table).getByText("Mobiele surveillance")).toBeInTheDocument();
    expect(within(table).getByText(/Locatie controleren/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Object toevoegen" }));
    expect(onAddObject).toHaveBeenCalledTimes(1);
  });

  it("zoekt en filtert de tabel zonder de objectcontext kwijt te raken", async () => {
    renderObjects();
    let table = await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("Objecten zoeken"), { target: { value: "utrecht" } });
    table = screen.getByRole("table");
    expect(within(table).getByText("Distributiecentrum")).toBeInTheDocument();
    expect(within(table).queryByText("Hoofdkantoor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Actief" }));
    expect(await screen.findByText("Geen objecten gevonden")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters wissen" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("opent een klikbare rij direct in de bestaande objectpagina", async () => {
    const navigate = vi.fn();
    renderObjects({ navigate });
    const table = await screen.findByRole("table");

    fireEvent.click(within(table).getByText("Hoofdkantoor"));

    expect(navigate).toHaveBeenCalledWith("/Objects?id=object%2F1&tab=warning-addresses");
  });

  it("biedt vanuit de lege tabel direct de basiswizard aan", async () => {
    records.objects = [];
    records.collectives = [];
    records.contractLines = [];
    const onAddObject = vi.fn();
    renderObjects({ onAddObject });

    expect(await screen.findByText("Nog geen objecten")).toBeInTheDocument();
    const actions = screen.getAllByRole("button", { name: "Object toevoegen" });
    fireEvent.click(actions.at(-1));
    expect(onAddObject).toHaveBeenCalledTimes(1);
  });
});
