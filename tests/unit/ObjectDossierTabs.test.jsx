import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  contactPointFilter,
  customerEventFilter,
  managedFileFilter,
  mobileReportFilter,
  planningShiftFilter,
  portalPublicationFilter,
  taskExecutionFilter,
} = vi.hoisted(() => ({
  contactPointFilter: vi.fn(),
  customerEventFilter: vi.fn(),
  managedFileFilter: vi.fn(),
  mobileReportFilter: vi.fn(),
  planningShiftFilter: vi.fn(),
  portalPublicationFilter: vi.fn(),
  taskExecutionFilter: vi.fn(),
}));

vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      CustomerContactPoint: { filter: contactPointFilter },
      CustomerEvent: { filter: customerEventFilter },
      ManagedFile: { filter: managedFileFilter },
      MobileReport: { filter: mobileReportFilter },
      PlanningShift: { filter: planningShiftFilter },
      CustomerPortalPublication: { filter: portalPublicationFilter },
      TaskExecution: { filter: taskExecutionFilter },
    },
    functions: { invoke: vi.fn() },
  },
}));

import ObjectDossierTabs from "@/components/objects/ObjectDossierTabs";

const groupedShift = {
  id: "shift-collective-1",
  object_id: null,
  object_ids: ["object-1"],
  service_date: "2026-08-04",
  service_name_snapshot: "Routecollectief dienst",
  start_time: "20:00",
  end_time: "23:00",
  status: "published",
};

const object = {
  id: "object-1",
  customer_id: "customer-1",
  object_code: "OBJ-001",
  name: "Hoofdkantoor",
  object_type: "office",
  status: "active",
  address: "Coolsingel 1, Rotterdam",
  geocoding_status: "verified",
  latitude: 51.92,
  longitude: 4.48,
  parking_instruction: "Parkeer op vak 12.",
  alarm_instruction: "GEHEIME-CODE-1234",
};

function renderTabs(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const defaults = {
    object,
    customer: { id: "customer-1", trade_name: "Acme" },
    collectives: [],
    tasks: [],
    contractLines: [],
    scopedContacts: [],
    contactRoles: [],
    activeTab: "details",
    onTabChange: vi.fn(),
    view: "tasks",
    onViewChange: vi.fn(),
    searchTerm: "",
    onSearchChange: vi.fn(),
    selectedRow: null,
    onSelectRow: vi.fn(),
    navigate: vi.fn(),
    onEditIdentity: vi.fn(),
    onEditOperations: vi.fn(),
    onRequestStatus: vi.fn(),
    statusPending: false,
    ...props,
  };
  render(<QueryClientProvider client={client}><ObjectDossierTabs {...defaults} /></QueryClientProvider>);
  return defaults;
}

describe("ObjectDossierTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactPointFilter.mockResolvedValue([]);
    customerEventFilter.mockResolvedValue([]);
    managedFileFilter.mockResolvedValue([]);
    mobileReportFilter.mockResolvedValue([]);
    planningShiftFilter.mockImplementation(async filter => filter.object_ids ? [groupedShift] : []);
    portalPublicationFilter.mockResolvedValue([]);
    taskExecutionFilter.mockResolvedValue([]);
  });

  it("gebruikt dezelfde responsieve dossiernavigatie en stuurt tabkeuzes naar de URL-eigenaar", () => {
    const props = renderTabs();

    expect(screen.getByText("Identiteit en locatie")).toBeInTheDocument();
    expect(screen.getByText("Coolsingel 1, Rotterdam")).toBeInTheDocument();
    const contactsTabs = screen.getAllByRole("tab", { name: "Contacten" });
    expect(contactsTabs).toHaveLength(2);

    fireEvent.click(contactsTabs[0]);
    expect(props.onTabChange).toHaveBeenCalledWith("contacts");

    const detailsTabs = screen.getAllByRole("tab", { name: "Objectgegevens" });
    fireEvent.keyDown(detailsTabs[0], { key: "ArrowRight" });
    expect(props.onTabChange).toHaveBeenCalledWith("contacts");
  });

  it("toont gewone instructies maar lekt beperkte inhoud niet in het taboverzicht", () => {
    renderTabs({ activeTab: "instructions" });

    expect(screen.getByText("Parkeer op vak 12.")).toBeInTheDocument();
    expect(screen.getByText("Alarminformatie")).toBeInTheDocument();
    expect(screen.queryByText("GEHEIME-CODE-1234")).not.toBeInTheDocument();
    expect(screen.getAllByText(/step-up-authenticatie en read-audit/i)).toHaveLength(3);
  });

  it("neemt route- en collectieftaken via PlanningShift.object_ids mee", async () => {
    renderTabs({ activeTab: "planning", view: "shifts" });

    expect(await screen.findAllByText("Routecollectief dienst")).not.toHaveLength(0);
    expect(planningShiftFilter).toHaveBeenCalledWith(
      { object_ids: { $all: ["object-1"] } },
      "service_date",
      250,
      0,
      expect.arrayContaining(["id", "object_ids", "service_date", "status"]),
    );
  });

  it("presenteert een taak zonder lifecycle niet ten onrechte als concept", () => {
    renderTabs({
      activeTab: "planning",
      view: "tasks",
      tasks: [{ id: "task-1", object_id: "object-1", task_type: "Controleronde", duration_minutes: 30 }],
      selectedRow: "task-1",
    });

    expect(screen.getAllByText("Controleronde").length).toBeGreaterThan(0);
    expect(screen.queryByText("Concept")).not.toBeInTheDocument();
  });

  it("toont alleen actieve rollen die klantbreed of voor het huidige object gelden", async () => {
    renderTabs({
      activeTab: "contacts",
      scopedContacts: [{ id: "contact-1", display_name: "Sanne de Vries", status: "active" }],
      contactRoles: [
        { id: "role-1", contact_id: "contact-1", role: "operational", status: "active", object_ids: ["object-1"] },
        { id: "role-2", contact_id: "contact-1", role: "billing", status: "active", object_ids: ["object-2"] },
        { id: "role-3", contact_id: "contact-1", role: "emergency", status: "inactive", object_ids: [] },
        { id: "role-4", contact_id: "contact-1", role: "reports", status: "active", valid_until: "2000-01-01", object_ids: ["object-1"] },
      ],
    });

    expect(await screen.findAllByText("Operationeel")).not.toHaveLength(0);
    expect(screen.queryByText("Facturatie")).not.toBeInTheDocument();
    expect(screen.queryByText("Waarschuwingsadres")).not.toBeInTheDocument();
    expect(screen.queryAllByText("Rapportages").filter(element => !element.closest('[role="tab"]'))).toHaveLength(0);
  });

  it("behandelt lege coördinaten niet als 0,0", () => {
    renderTabs({ object: { ...object, latitude: null, longitude: null } });

    expect(screen.getByText("Nog geen coördinaten vastgelegd")).toBeInTheDocument();
    expect(screen.queryByText("0.000000, 0.000000")).not.toBeInTheDocument();
  });

  it("blokkeert het wijzigen van objectgegevens bij een gearchiveerd object", () => {
    renderTabs({ object: { ...object, status: "archived" }, activeTab: "details" });

    expect(screen.getByRole("button", { name: "Wijzigen" })).toBeDisabled();
  });

  it("blokkeert het wijzigen van instructies bij een gearchiveerd object", () => {
    renderTabs({ object: { ...object, status: "archived" }, activeTab: "instructions" });

    expect(screen.getByRole("button", { name: "Instructies wijzigen" })).toBeDisabled();
  });

  it("toont alleen actieve contactpunten en vraagt een beperkte veldprojectie op", async () => {
    contactPointFilter.mockResolvedValue([
      { id: "point-1", contact_id: "contact-1", point_type: "email", value: "actief@acme.nl", status: "active" },
      { id: "point-2", contact_id: "contact-1", point_type: "phone", value: "010-0000000", status: "inactive" },
      { id: "point-3", contact_id: "contact-1", point_type: "mobile", value: "06-00000000", status: "archived" },
    ]);

    renderTabs({
      activeTab: "contacts",
      scopedContacts: [{ id: "contact-1", display_name: "Sanne de Vries", status: "active" }],
    });

    expect(await screen.findAllByText("actief@acme.nl")).not.toHaveLength(0);
    expect(screen.queryByText("010-0000000")).not.toBeInTheDocument();
    expect(screen.queryByText("06-00000000")).not.toBeInTheDocument();
    expect(contactPointFilter).toHaveBeenCalledWith(
      { customer_id: "customer-1" },
      "-updated_date",
      250,
      0,
      expect.arrayContaining(["id", "contact_id", "point_type", "value", "status"]),
    );
    expect(contactPointFilter.mock.calls[0][4]).not.toEqual(expect.arrayContaining(["valid_from", "valid_until"]));
  });

  it("sorteert directe en gegroepeerde toekomstige diensten samen en filtert het overzicht server-side", async () => {
    planningShiftFilter.mockImplementation(async filter => filter.object_id ? [{
      ...groupedShift,
      id: "shift-direct-1",
      object_id: "object-1",
      object_ids: [],
      service_date: "2999-08-05",
      service_name_snapshot: "Latere directe dienst",
    }] : [{ ...groupedShift, service_date: "2999-08-04", service_name_snapshot: "Eerste gegroepeerde dienst" }]);

    renderTabs({ activeTab: "overview" });

    expect(await screen.findByText("Eerste gegroepeerde dienst")).toBeInTheDocument();
    await waitFor(() => expect(planningShiftFilter).toHaveBeenCalledTimes(2));
    for (const [filter, sort, limit, skip, fields] of planningShiftFilter.mock.calls) {
      expect(filter).toEqual(expect.objectContaining({ status: "published", service_date: { $gte: expect.any(String) } }));
      expect(sort).toBe("service_date");
      expect(limit).toBe(12);
      expect(skip).toBe(0);
      expect(fields).toEqual(expect.arrayContaining(["object_id", "object_ids", "service_date", "status"]));
    }
  });

  it("vraagt rapporten, historie en documenten met veilige veldprojecties op", async () => {
    mobileReportFilter.mockResolvedValue([{ id: "report-1", object_id: "object-1", report_type: "Controlerapport", status: "submitted", created_at: "2026-07-31T12:00:00Z", photo_count: 0 }]);
    managedFileFilter.mockResolvedValue([{ id: "file-1", object_id: "object-1", display_filename: "Instructie.pdf", status: "active", uploaded_at: "2026-07-31T12:00:00Z" }]);
    customerEventFilter.mockResolvedValue([{ id: "event-1", object_id: "object-1", customer_id: "customer-1", event_type: "object.updated", action: "object.updated", summary: "Object bijgewerkt", occurred_at: "2026-07-31T12:00:00Z" }]);

    renderTabs({ activeTab: "overview" });
    await waitFor(() => expect(customerEventFilter).toHaveBeenCalled());
    const overviewReportFields = mobileReportFilter.mock.calls[0][4];
    expect(overviewReportFields).toEqual(expect.arrayContaining(["report_type", "status", "created_at", "photo_count"]));
    expect(overviewReportFields).not.toEqual(expect.arrayContaining(["report_text", "gps_latitude", "gps_longitude", "employee_id", "photos"]));
    const eventFields = customerEventFilter.mock.calls[0][4];
    expect(eventFields).toEqual(expect.arrayContaining(["summary", "action", "actor_name", "occurred_at"]));
    expect(eventFields).not.toEqual(expect.arrayContaining(["payload", "payload_checksum", "actor_user_id", "idempotency_key"]));

    renderTabs({ activeTab: "reports" });
    expect(await screen.findAllByText("Controlerapport")).not.toHaveLength(0);
    const reportFields = mobileReportFilter.mock.calls.at(-1)[4];
    expect(reportFields).toEqual(expect.arrayContaining(["report_type", "report_text", "photo_count"]));
    expect(reportFields).not.toEqual(expect.arrayContaining(["gps_latitude", "gps_longitude", "employee_id", "photos"]));

    renderTabs({ activeTab: "documents" });
    expect(await screen.findAllByText("Instructie.pdf")).not.toHaveLength(0);
    const fileFields = managedFileFilter.mock.calls.at(-1)[4];
    expect(fileFields).toEqual(expect.arrayContaining(["display_filename", "status", "uploaded_at"]));
    expect(fileFields).not.toEqual(expect.arrayContaining(["file_url", "file_uri", "encryption_key_id", "encrypted_data_key"]));
  });
});
