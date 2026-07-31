import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { entities, objectList, objectFilter } = vi.hoisted(() => {
  const emptyList = vi.fn(async () => []);
  const emptyFilter = vi.fn(async () => []);
  const object = {
    id: "object/1",
    customer_id: "customer-1",
    object_code: "OBJ-001",
    name: "Hoofdkantoor",
    object_type: "office",
    status: "active",
    address: "Coolsingel 1, Rotterdam",
    geocoding_status: "verified",
    latitude: 51.92,
    longitude: 4.48,
    version: 2,
  };
  const objectList = vi.fn(async () => [object]);
  const objectFilter = vi.fn(async query => [{
    ...object,
    id: query.id || object.id,
    name: query.id === "object-51" ? "Object eenenvijftig" : object.name,
  }]);
  return {
    objectList,
    objectFilter,
    entities: {
      SurveillanceObject: { list: objectList, filter: objectFilter },
      Customer: {
        get: vi.fn(async () => ({ id: "customer-1", trade_name: "Acme", status: "active" })),
        filter: vi.fn(async () => [{ id: "customer-1", trade_name: "Acme", status: "active" }]),
      },
      Task: { list: emptyList, filter: emptyFilter },
      Collectief: { list: emptyList, filter: emptyFilter },
      CustomerContact: { filter: emptyFilter },
      CustomerContactRole: { filter: emptyFilter },
      CustomerContractLine: { filter: emptyFilter },
      TaskExecution: { filter: emptyFilter },
      MobileReport: { filter: emptyFilter },
      ManagedFile: { filter: emptyFilter },
      CustomerEvent: { filter: emptyFilter },
      PlanningShift: { filter: emptyFilter },
    },
  };
});

vi.mock("@/api/base44Client", () => ({ base44: { entities, functions: { invoke: vi.fn() } } }));

import Objects from "@/pages/Objects";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

describe("objectnavigatie", () => {
  it("opent een tabelrij als herlaadbare objectdossier-deeplink", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/Objects"]}>
          <Routes>
            <Route path="/Objects" element={<><Objects /><LocationProbe /></>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByText("Hoofdkantoor"));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(
      "/Objects?id=object%2F1&tab=warning-addresses",
    ));
    expect(await screen.findAllByRole("tab", { name: "Waarschuwingsadressen" })).toHaveLength(2);
    expect(screen.getAllByRole("tab", { name: "Logboek" })).toHaveLength(2);
    expect(screen.getByText("OBJ-001")).toBeInTheDocument();
  });

  it("laadt een directe deeplink los van de eerste objecttabelpagina en zonder afgeschermde velden", async () => {
    objectList.mockClear();
    objectFilter.mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/Objects?id=object-51&tab=warning-addresses"]}>
          <Routes>
            <Route path="/Objects" element={<><Objects /><LocationProbe /></>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText("Object eenenvijftig")).length).toBeGreaterThan(0);
    expect(objectList).not.toHaveBeenCalled();
    const fields = objectFilter.mock.calls[0][4];
    expect(objectFilter).toHaveBeenCalledWith({ id: "object-51" }, "name", 1, 0, expect.any(Array));
    expect(fields).not.toContain("alarm_instruction");
    expect(fields).not.toContain("key_instruction");
    expect(fields).not.toContain("access_instruction");
    expect(fields).toEqual(expect.arrayContaining(["logo_file_url", "logo_file_id"]));
  });

  it("zoekt hoofdletterongevoelig met alleen de gedocumenteerde regex-operator", async () => {
    objectFilter.mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/Objects?query=Ac.Me"]}>
          <Routes>
            <Route path="/Objects" element={<Objects />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Hoofdkantoor");
    const [query] = objectFilter.mock.calls[0];
    expect(query.$or[0]).toEqual({ object_code: { $regex: "[aA][cC]\\.[mM][eE]" } });
    expect(JSON.stringify(query)).not.toContain("$options");
  });
});
