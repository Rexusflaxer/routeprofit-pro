import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), key: vi.fn(), toast: vi.fn() }));
vi.mock("@/components/customers/customerDossierUtils", () => ({ invokeCustomerPlatformRead: mocks.read, invokeCustomerPlatformMutation: mocks.mutate, createCustomerMutationKey: mocks.key }));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import ObjectParticipationTab from "@/components/objects/ObjectParticipationTab";
import BuildingAssociationPanel from "@/components/objects/BuildingAssociationPanel";
import CustomerSharedObjects from "@/components/customers/CustomerSharedObjects";

const object = { id: "tenant-object", customer_id: "tenant-customer", name: "Kruizinga", status: "active", version: 4 };
const context = {
  primary_customer_id: "tenant-customer",
  customers: [{ id: "tenant-customer", name: "Kruizinga" }, { id: "manager-customer", name: "Van der Zeelaan" }, { id: "archived-customer", name: "Oude klant", status: "archived" }],
  collectives: [{ id: "estate", name: "Bedrijventerrein" }, { id: "group", name: "Bedrijfsverzamelgebouw" }], memberships: [], responsibilities: [],
};
const baseline = { expected_version: 4, selected_bag_feature_ids: [], building_selection_points: [] };
const form = { building_selection_mode: "manual", selected_bag_feature_ids: ["bag-1"], building_selection_points: [] };
const knownCollective = { selection_key: "bag:bag-1", shared_building_required: false, objects: [], collectives: [{ id: "estate", name: "Bedrijventerrein", collectief_type: "bedrijventerrein", source_selection_key: "bag:bag-1", member: false }] };
const sharedBuilding = { selection_key: "bag:bag-1", shared_building_required: true, objects: [{ id: "existing-object", name: "Eerste huurder", source_selection_key: "bag:bag-1" }], collectives: [] };

function mount(component) {
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{component}</QueryClientProvider></MemoryRouter>);
}

beforeEach(() => {
  mocks.read.mockImplementation(async ({ action }) => action === "get_object_collective_context" ? context : { matches: [] });
  mocks.mutate.mockResolvedValue({ collective_id: "estate", version: 5 });
  let index = 0;
  mocks.key.mockImplementation(() => `participation-key-${++index}`);
});

describe("object klantverantwoordelijkheid", () => {
  it("legt een extra verantwoordelijke klant vast zonder facturatie of toegangsrechten te activeren", async () => {
    mount(<ObjectParticipationTab object={object} />);
    fireEvent.click(await screen.findByRole("button", { name: "Klant koppelen" }));
    expect(screen.queryByRole("option", { name: "Kruizinga" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Oude klant" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Klant"), { target: { value: "manager-customer" } });
    fireEvent.change(screen.getByLabelText("Vanaf"), { target: { value: "2026-09-08" } });
    fireEvent.change(screen.getByLabelText("Tot en met"), { target: { value: "2026-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
    const payload = mocks.mutate.mock.calls[0][0];
    expect(payload).toMatchObject({ action: "upsert_object_customer_responsibility", object_id: "tenant-object", customer_id: "manager-customer", expected_version: 0, status: "active", role: "joint_responsible", starts_on: "2026-09-08", ends_on: "2026-12-31" });
    expect(payload).not.toHaveProperty("billing_enabled");
    expect(payload).not.toHaveProperty("report_access_enabled");
    expect(payload).not.toHaveProperty("key_access_enabled");
  });
  it("behoudt de gekozen klant en foutmelding bij een dubbele of conflicterende koppeling", async () => {
    mocks.mutate.mockRejectedValue(new Error("Deze klantkoppeling bestaat al; laad de actuele versie."));
    mount(<ObjectParticipationTab object={object} />);
    fireEvent.click(await screen.findByRole("button", { name: "Klant koppelen" }));
    fireEvent.change(screen.getByLabelText("Klant"), { target: { value: "manager-customer" } });
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Deze klantkoppeling bestaat al");
    expect(screen.getByLabelText("Klant")).toHaveValue("manager-customer");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
    expect(mocks.mutate.mock.calls[0][0].idempotency_key).toBe(mocks.mutate.mock.calls[1][0].idempotency_key);
  });
  it("houdt meerdere collectiefdeelnames mogelijk zonder de primaire klant te wijzigen", async () => {
    mocks.read.mockResolvedValue({ ...context, memberships: [{ id: "membership", collective_id: "estate", status: "active", version: 2 }] });
    mount(<ObjectParticipationTab object={object} />);
    fireEvent.click(await screen.findByRole("button", { name: "Collectief koppelen" }));
    fireEvent.change(screen.getByLabelText("Collectief"), { target: { value: "group" } });
    fireEvent.change(screen.getByLabelText("Vanaf"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "upsert_collective_membership", collective_id: "group", object_id: object.id, expected_version: 0, starts_on: "2026-10-01" })));
    expect(mocks.mutate.mock.calls[0][0]).not.toHaveProperty("customer_id");
  });
  it("wijzigt bestaande deelname met zijn eigen versie en behoudt identiteit", async () => {
    mocks.read.mockResolvedValue({ ...context, memberships: [{ id: "membership", collective_id: "estate", status: "active", version: 6 }] });
    mount(<ObjectParticipationTab object={object} />);
    fireEvent.click(await screen.findByRole("button", { name: "Wijzigen" }));
    expect(screen.getByLabelText("Collectief")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "inactive" } });
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ membership_id: "membership", expected_version: 6, status: "inactive" })));
  });
  it("maakt een gearchiveerd object niet opnieuw bewerkbaar", async () => {
    mount(<ObjectParticipationTab object={{ ...object, status: "archived" }} />);
    expect(await screen.findByRole("button", { name: "Klant koppelen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Collectief koppelen" })).toBeDisabled();
  });
});

describe("bevestiging bij bekend kaartgebouw", () => {
  it("vraagt na een nieuwe gebouwselectie een bevestiging en schrijft niet bij later beslissen", async () => {
    mocks.read.mockResolvedValue({ matches: [knownCollective] });
    mount(<BuildingAssociationPanel object={object} form={form} baseline={baseline} enabled />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ action: "list_building_associations", object_id: object.id, selected_bag_feature_ids: ["bag-1"] }));
    fireEvent.click(screen.getByRole("button", { name: "Later beslissen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("koppelt een object pas aan het collectief na een aparte bevestiging", async () => {
    const linked = vi.fn();
    mount(<BuildingAssociationPanel object={object} form={form} baseline={baseline} enabled serverMatches={[knownCollective]} onLinked={linked} />);
    fireEvent.click(await screen.findByRole("button", { name: "Koppelen aan Bedrijventerrein" }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "confirm_building_association", expected_version: 4, object_id: object.id, source_kind: "collective", source_id: "estate", collective_id: "estate", association_type: "join_collective", confirmed: true })));
    await waitFor(() => expect(linked).toHaveBeenCalled());
  });
  it("biedt bij afzonderlijke huurders alleen expliciet gedeeld gebouw of bestaand object aan", async () => {
    mount(<BuildingAssociationPanel object={object} form={form} baseline={baseline} enabled serverMatches={[sharedBuilding]} />);
    expect(await screen.findByRole("button", { name: "Bedrijfsverzamelgebouw instellen" })).toBeInTheDocument();
    const existingObjectLink = screen.getByRole("link", { name: /Klant koppelen aan bestaand object Eerste huurder/ });
    expect(existingObjectLink).toHaveAttribute("href", "/Objects?id=existing-object&tab=participation");
    expect(existingObjectLink).toHaveAttribute("target", "_blank");
    fireEvent.click(screen.getByRole("button", { name: "Bedrijfsverzamelgebouw instellen" }));
    fireEvent.change(screen.getByLabelText("Naam bedrijfsverzamelgebouw"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Bevestigen" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Naam bedrijfsverzamelgebouw"), { target: { value: "Gedeeld Kantoor" } });
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ association_type: "shared_building", source_kind: "object", source_id: "existing-object", name: "Gedeeld Kantoor", confirmed: true })));
  });
  it("houdt dezelfde bevestigingssleutel bij retry en geeft bron- en doelpunt apart door", async () => {
    const match = { ...sharedBuilding, selection_key: "selection:tenant-object:newpoint", objects: [{ id: "existing-object", name: "Eerste huurder", source_selection_key: "selection:existing-object:oldpoint" }] };
    mocks.mutate.mockRejectedValue(new Error("Opslaan tijdelijk niet bereikbaar"));
    mount(<BuildingAssociationPanel object={object} form={form} baseline={baseline} enabled serverMatches={[match]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Bedrijfsverzamelgebouw instellen" }));
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({ source_selection_key: "selection:existing-object:oldpoint", target_selection_key: "selection:tenant-object:newpoint" });
    expect(mocks.mutate.mock.calls[0][0].idempotency_key).toBe(mocks.mutate.mock.calls[1][0].idempotency_key);
  });
  it("laat de problematische gebouwselectie verwijderen zonder dossiermutatie", async () => {
    const remove = vi.fn();
    mount(<BuildingAssociationPanel object={object} form={form} baseline={baseline} enabled serverMatches={[sharedBuilding]} onRemoveSelection={remove} />);
    fireEvent.click(await screen.findByRole("button", { name: "Gebouwselectie ongedaan maken" }));
    expect(remove).toHaveBeenCalledWith("bag:bag-1");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("doet geen suggestieverzoeken voor de ongewijzigde opgeslagen selectie", async () => {
    mount(<BuildingAssociationPanel object={object} form={form} baseline={{ ...baseline, selected_bag_feature_ids: ["bag-1"] }} enabled />);
    await new Promise(resolve => setTimeout(resolve, 260));
    expect(mocks.read).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("gedeelde objecten in klantdossier", () => {
  it("vraagt alleen de afzonderlijke verantwoordelijkheidslijst op, niet commerciële objectdekking", async () => {
    mocks.read.mockResolvedValue({ items: [{ id: object.id, name: object.name, responsibility_id: "responsibility", role: "joint_responsible", active_now: true, object_code: "OBJ-1" }] });
    const navigate = vi.fn();
    mount(<CustomerSharedObjects customerId="manager-customer" navigate={navigate} />);
    await screen.findByText("Ook verantwoordelijk voor");
    expect(mocks.read).toHaveBeenCalledWith({ action: "list_customer_shared_objects", customer_id: "manager-customer", include_inactive: true });
    expect(screen.getByText(/Facturatie en rapportagetoegang worden niet gedeeld/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Object bekijken" }));
    expect(navigate).toHaveBeenCalledWith("/Objects?id=tenant-object&tab=participation");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
