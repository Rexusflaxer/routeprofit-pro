import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), key: vi.fn(), guard: vi.fn(), map: vi.fn() }));
vi.mock("@/api/base44Client", () => ({ base44: { functions: { invoke: vi.fn() } } }));
vi.mock("@/components/customers/customerDossierUtils", () => ({
  createCustomerMutationKey: mocks.key, invokeCustomerPlatformRead: mocks.read, invokeCustomerPlatformMutation: mocks.mutate,
  getCustomerName: customer => customer?.name || "Naamloze klant", formatDate: (value, fallback = "—") => value || fallback,
  formatDateTime: value => value || "—",
}));
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/objects/useObjectModuleNavigationGuard", () => ({ useObjectModuleNavigationGuard: options => { mocks.guard(options); return { dialog: null, requestNavigation: action => { if (!options.dirty) action(); } }; } }));
vi.mock("@/components/ui-custom/PageTransition", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("@/components/objects/ObjectMapTab", () => ({ default: props => { mocks.map(props); return <div>Collectieve kaart</div>; } }));
vi.mock("@/components/ui-custom/AddressAutocomplete", () => ({ default: ({ id, value, onQueryChange, onAddressSelect }) => <div><input id={id} value={value.address} onChange={event => onQueryChange(event.target.value)} /><button type="button" onClick={() => onAddressSelect({ street_name: "Dorpsstraat", house_number: "1", postal_code: "1234AB", city: "Dorp", latitude: 52, longitude: 5, geocoding_status: "verified" })}>Adres bevestigen</button></div> }));

import CollectiefPage from "@/pages/Collectief";
import CollectiefForm from "@/components/collectief/CollectiefForm";
import CollectiveRecordsTab, { collectiveRecordData } from "@/components/collectief/CollectiveRecordsTab";
import CollectiveMembersTab from "@/components/collectief/CollectiveMembersTab";
import {
  collectiveManagerId, collectiveMemberRows, collectiveMutationRequest,
  collectiveParentOptions, uniqueMemberCount,
} from "@/components/collectief/collectiveDossierWorkflow";
import CollectiveBuildingLinks, { collectiveBuildingAssociationPayload, collectiveBuildingSourceKey } from "@/components/collectief/CollectiveBuildingLinks";

const collective = { id: "estate", name: "Van der Zeelaan", collectief_type: "bedrijventerrein", manager_customer_id: null, version: 2 };
const customers = [{ id: "customer-1", name: "Beheerder" }, { id: "customer-2", name: "Kruizinga" }];
const objects = [{ id: "gate", name: "Portier", customer_id: "customer-1", version: 3 }, { id: "warehouse", name: "Kruizinga hal", customer_id: "customer-2", version: 7 }];
const dossier = { collective, customers, objects, memberships: [{ id: "member-1", object_id: "gate", collective_id: "estate", version: 1, status: "active" }], records: [], children: [], object_customers: [], logbook: [], building_links: [] };

function mount(children, path = "/Collectief") {
  return render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider></MemoryRouter>);
}

beforeEach(() => {
  mocks.read.mockImplementation(async ({ action }) => action === "list_collective_dossiers" ? { items: [collective], customers, objects } : dossier);
  mocks.mutate.mockResolvedValue({ collective_id: "estate", resource_id: "estate", version: 3 });
  let count = 0;
  mocks.key.mockImplementation(() => `mutation-${++count}`);
});

describe("collectieve dossierrelaties", () => {
  it("scheidt een expliciet managerloos collectief van de oude facturatieklant", () => {
    expect(collectiveManagerId({ customer_id: "billing-customer", manager_customer_id: null })).toBe("");
    expect(collectiveManagerId({ customer_id: "legacy-manager" })).toBe("legacy-manager");
  });
  it("sluit zichzelf en indirecte kinderen uit de bovenliggende collectieven uit", () => {
    const all = [{ id: "estate" }, { id: "building", parent_collectief_id: "estate" }, { id: "floor", parent_collectief_id: "building" }, { id: "other" }];
    expect(collectiveParentOptions(all, "estate").map(item => item.id)).toEqual(["other"]);
  });
  it("behoudt legacykoppelingen zonder nieuwe commerciële object_ids te construeren", () => {
    const input = { ...dossier, collective: { ...collective, object_ids: ["gate", "warehouse", "warehouse"] } };
    const rows = collectiveMemberRows(input);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.object_id === "warehouse")).toMatchObject({ legacy: true, customer: { name: "Kruizinga" } });
    expect(input.collective.object_ids).toEqual(["gate", "warehouse", "warehouse"]);
  });
  it("telt een object dat rechtstreeks en via een subcollectief deelneemt eenmaal", () => {
    const rows = collectiveMemberRows({ ...dossier, indirect_memberships: [{ id: "member-2", object_id: "gate", collective_id: "building", status: "active" }] }, { includeIndirect: true });
    expect(rows).toHaveLength(2);
    expect(uniqueMemberCount(rows)).toBe(1);
    expect(rows[1].indirect).toBe(true);
  });
  it("hergebruikt de idempotencykey bij retry, maar niet voor gewijzigde invoer", async () => {
    const retry = { current: null };
    await collectiveMutationRequest("create_collective_dossier", { name: "Wijk" }, retry);
    await collectiveMutationRequest("create_collective_dossier", { name: "Wijk" }, retry);
    await collectiveMutationRequest("create_collective_dossier", { name: "Andere wijk" }, retry);
    expect(mocks.mutate.mock.calls.map(([payload]) => payload.idempotency_key)).toEqual(["mutation-1", "mutation-1", "mutation-2"]);
  });
});

describe("collectief bewerken", () => {
  it("maakt een woonwijk zonder beheerder, zonder legacy klant of object_ids aan", async () => {
    const save = vi.fn().mockResolvedValue({});
    mount(<CollectiefForm customers={customers} collectieven={[]} onSave={save} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Naam *"), { target: { value: "Woonwijk Noord" } });
    fireEvent.change(screen.getByLabelText("Type collectief"), { target: { value: "woonwijk" } });
    fireEvent.click(screen.getByRole("button", { name: "Collectief aanmaken" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const payload = save.mock.calls[0][0];
    expect(payload).toMatchObject({ name: "Woonwijk Noord", collectief_type: "woonwijk", manager_customer_id: null, parent_collectief_id: null });
    expect(payload).not.toHaveProperty("customer_id");
    expect(payload).not.toHaveProperty("object_ids");
  });
  it("neemt bevestigde adrescoördinaten over en wist ze bij losse adreswijziging", () => {
    mount(<CollectiefForm customers={[]} collectieven={[]} onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Adres bevestigen" }));
    expect(screen.getByText("Kaartlocatie bevestigd.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Adres of centrale locatie"), { target: { value: "Andere plek" } });
    expect(screen.getByText(/Nog geen bevestigde kaartlocatie/)).toBeInTheDocument();
    expect(mocks.guard.mock.calls.at(-1)[0].dirty).toBe(true);
  });
  it("verliest onopgeslagen formuliervelden niet bij annuleren", () => {
    const cancel = vi.fn();
    mount(<CollectiefForm customers={[]} collectieven={[]} onSave={vi.fn()} onCancel={cancel} />);
    fireEvent.change(screen.getByLabelText("Naam *"), { target: { value: "Nieuw terrein" } });
    fireEvent.click(screen.getByRole("button", { name: "Annuleren" }));
    expect(cancel).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Naam *")).toHaveValue("Nieuw terrein");
  });
});

describe("collectiefkaart", () => {
  it("opent met een doorzoekbare tabel in plaats van oude kaarten", async () => {
    mount(<CollectiefPage />);
    expect(screen.getByRole("table", { name: "Collectieven" })).toBeInTheDocument();
    expect(await screen.findByText("Geen beheerder")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Zoek collectief" }), { target: { value: "nietgevonden" } });
    expect(screen.getByText("Geen collectieven gevonden")).toBeInTheDocument();
  });
  it("behoudt de tabel en toevoegknop terwijl de collectieven laden", () => {
    mocks.read.mockImplementation(() => new Promise(() => {}));
    mount(<CollectiefPage />);
    const table = screen.getByRole("table", { name: "Collectieven" });
    expect(table).toHaveAttribute("aria-busy", "true");
    expect(within(table).getByRole("columnheader", { name: "Collectief" })).toBeInTheDocument();
    expect(within(table).getByRole("status")).toHaveTextContent("Collectieven laden…");
    expect(screen.getByRole("button", { name: "Collectief toevoegen" })).toBeEnabled();
    expect(screen.queryByText("Nog geen collectieven")).not.toBeInTheDocument();
    expect(mocks.read).not.toHaveBeenCalledWith(expect.objectContaining({ action: "get_collective_dossier" }));
  });
  it("behoudt een lege overzichtstabel en kan daar een collectief toevoegen", async () => {
    mocks.read.mockResolvedValue({ items: [], customers, objects });
    mount(<CollectiefPage />);
    expect(await screen.findByText("Nog geen collectieven")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Collectieven" })).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("button", { name: "Collectief toevoegen" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collectief toevoegen" }));
    expect(screen.getByLabelText("Naam *")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Collectief aanmaken" })).toBeInTheDocument();
    expect(mocks.read).not.toHaveBeenCalledWith(expect.objectContaining({ action: "get_collective_dossier" }));
  });
  it("toont een herkenbare overzichtsfout in de tabel zonder een lege lijst voor te wenden", async () => {
    mocks.read.mockRejectedValueOnce(Object.assign(new Error("De dienst is tijdelijk niet bereikbaar."), { status: 503, requestId: "collective-list-reference" }));
    mount(<CollectiefPage />);
    const alert = await screen.findByRole("alert");
    expect(within(screen.getByRole("table", { name: "Collectieven" })).getByRole("alert")).toBe(alert);
    expect(alert).toHaveTextContent("De collectieven konden niet worden geladen.");
    expect(alert).toHaveTextContent("De dienst is tijdelijk niet bereikbaar.");
    expect(alert).toHaveTextContent("Status 503 · Referentie collective-list-reference");
    expect(screen.getByRole("button", { name: "Collectief toevoegen" })).toBeEnabled();
    expect(screen.queryByText("Nog geen collectieven")).not.toBeInTheDocument();
    expect(screen.queryByText("Het collectiefdossier kon niet worden geladen.")).not.toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Opnieuw laden" }));
    expect(await screen.findByRole("button", { name: "Van der Zeelaan" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("opent pas na een rijselectie het dossier en keert terug naar de collectievenlijst", async () => {
    mount(<CollectiefPage />);
    const collectiveButton = await screen.findByRole("button", { name: "Van der Zeelaan" });
    expect(mocks.read).not.toHaveBeenCalledWith(expect.objectContaining({ action: "get_collective_dossier" }));
    fireEvent.click(collectiveButton.closest("tr"));
    expect(await screen.findByRole("tab", { name: "Objecten & deelnemers" })).toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledWith({ action: "get_collective_dossier", collective_id: "estate" });
    fireEvent.click(screen.getByRole("button", { name: "Collectieven" }));
    expect(screen.getByRole("table", { name: "Collectieven" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collectief toevoegen" })).toBeEnabled();
    expect(screen.queryByRole("tab", { name: "Objecten & deelnemers" })).not.toBeInTheDocument();
  });
  it("onderscheidt een dossierfout en biedt een terugweg naar de overzichtstabel", async () => {
    mocks.read.mockImplementation(async ({ action }) => {
      if (action === "get_collective_dossier") throw Object.assign(new Error("Dit collectief bestaat niet."), { status: 404, requestId: "collective-detail-reference" });
      return { items: [collective], customers, objects };
    });
    mount(<CollectiefPage />, "/Collectief?id=missing");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Het collectiefdossier kon niet worden geladen.");
    expect(alert).toHaveTextContent("Status 404 · Referentie collective-detail-reference");
    expect(screen.queryByRole("table", { name: "Collectieven" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collectieven" }));
    expect(screen.getByRole("table", { name: "Collectieven" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Van der Zeelaan" })).toBeInTheDocument();
  });
  it("toont alle dossieronderdelen en geeft uitsluitend een collectiefcontext aan de kaart", async () => {
    mount(<CollectiefPage />, "/Collectief?id=estate");
    expect(await screen.findByRole("tab", { name: "Objecten & deelnemers" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(12);
    fireEvent.click(screen.getByRole("tab", { name: "Kaart & terrein" }));
    await screen.findByText("Collectieve kaart");
    expect(mocks.map.mock.calls.at(-1)[0]).toMatchObject({ collective });
    expect(mocks.map.mock.calls.at(-1)[0]).not.toHaveProperty("object");
  });
  it("laat objecten van andere klanten als deelnemer kiezen", async () => {
    const save = vi.fn().mockResolvedValue({});
    mount(<CollectiveMembersTab dossier={dossier} onSave={save} onCreateChild={vi.fn()} onOpenCollective={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Object koppelen" }));
    fireEvent.change(screen.getByLabelText("Klantobject *"), { target: { value: "warehouse" } });
    fireEvent.click(screen.getByRole("button", { name: "Deelname opslaan" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ object_id: "warehouse", status: "active", expected_version: 0 })));
    expect(save.mock.calls[0][0]).not.toHaveProperty("customer_id");
  });
  it("toont gezamenlijke verantwoordelijke klanten zonder dubbele objectrijen", () => {
    mount(<CollectiveMembersTab dossier={{ ...dossier, object_customers: [{ object_id: "gate", customer_id: "customer-2", status: "active" }] }} onSave={vi.fn()} onCreateChild={vi.fn()} onOpenCollective={vi.fn()} />);
    const table = screen.getByRole("table", { name: "Deelnemende klantobjecten" });
    expect(within(table).getByText("Beheerder, Kruizinga")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });
  it("slaat collectieve taken alleen als conceptconfiguratie op", async () => {
    const save = vi.fn().mockResolvedValue({});
    mount(<CollectiveRecordsTab section="tasks" dossier={dossier} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Toevoegen" }));
    fireEvent.change(screen.getByLabelText("Naam *"), { target: { value: "Gezamenlijke avondronde" } });
    fireEvent.click(screen.getByRole("button", { name: "Concepttaak opslaan" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ section: "tasks", status: "draft", expected_version: 0, data: expect.objectContaining({ target_scope: "collective" }) })));
    expect(screen.queryByRole("button", { name: /Publiceren|Activeren/ })).not.toBeInTheDocument();
  });
  it("kan doelselectie niet leeg als objecttaak opslaan", async () => {
    const save = vi.fn();
    mount(<CollectiveRecordsTab section="tasks" dossier={dossier} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Toevoegen" }));
    fireEvent.change(screen.getByLabelText("Naam *"), { target: { value: "Avondronde" } });
    fireEvent.change(screen.getByLabelText("Taak van toepassing op"), { target: { value: "objects" } });
    fireEvent.click(screen.getByRole("button", { name: "Concepttaak opslaan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kies ten minste één deelnemend object.");
    expect(save).not.toHaveBeenCalled();
  });
  it("houdt oude taken alleen leesbaar en los van nieuwe concepttaken", () => {
    mount(<CollectiveRecordsTab section="tasks" dossier={{ ...dossier, legacy_tasks: [{ id: "old-task", name: "Oude controleronde" }] }} onSave={vi.fn()} />);
    expect(screen.getByText("Oude controleronde")).toBeInTheDocument();
    expect(screen.getByText("Bestaand · alleen lezen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Oude controleronde wijzigen/ })).not.toBeInTheDocument();
  });
  it("kan een bewaarde concepttaak opnieuw opslaan zonder read-only operational veld terug te schrijven", async () => {
    const save = vi.fn().mockResolvedValue({});
    mount(<CollectiveRecordsTab section="tasks" dossier={{ ...dossier, records: [{ id: "task-config", section: "tasks", title: "Avondronde", status: "draft", version: 3, data: { operational: false, target_scope: "collective", days: [0], recurrence: "weekly" } }] }} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Avondronde wijzigen" }));
    expect(screen.getByLabelText("Zo")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Concepttaak opslaan" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].data).not.toHaveProperty("operational");
    expect(save.mock.calls[0][0].data.days).toEqual([0]);
  });
  it("verwijdert ongebruikte taakdoelen en lege optionele aantallen uit de payload", () => {
    expect(collectiveRecordData({ target_scope: "collective", target_object_ids: ["old-member"], target_building_ids: ["old-building"], operational: false }, "tasks")).toEqual({ target_scope: "collective", target_object_ids: [], target_building_ids: [] });
    expect(collectiveRecordData({ quantity: "", storage_location: "Kluis" }, "keys")).toEqual({ storage_location: "Kluis" });
  });
  it("toont opgeslagen dossierinhoud alleen-lezen zonder een mutatie", () => {
    const save = vi.fn();
    mount(<CollectiveRecordsTab section="handbook" dossier={{ ...dossier, records: [{ id: "article", section: "handbook", title: "Terrein toegang", data: { content: "Meld je eerst bij de portier." }, status: "active" }] }} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Terrein toegang bekijken" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Meld je eerst bij de portier.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});

describe("gebouwen vanuit collectief onderbrengen", () => {
  const savedBuilding = { building_selection_mode: "manual", selected_bag_feature_ids: ["bag-1"], building_labels: { "bag:bag-1": "Kantoor Noord" } };
  it("vertaalt eigen bronpunten naar een dossiergebonden identiteit", () => {
    expect(collectiveBuildingSourceKey("estate", "point:own-1")).toBe("selection:estate:own-1");
    expect(collectiveBuildingSourceKey("estate", "bag:bag-1")).toBe("bag:bag-1");
  });
  it("vraagt om expliciete server-side kaartovername zonder clientgeometrie", () => {
    const payload = collectiveBuildingAssociationPayload({ collective, buildingKey: "point:own-1", object: objects[1] });
    expect(payload).toMatchObject({ source_kind: "collective", source_id: "estate", source_selection_key: "selection:estate:own-1", target_selection_key: "selection:warehouse:own-1", object_id: "warehouse", expected_version: 7, confirmed: true, apply_to_object_map: true, collective_id: "estate" });
    expect(JSON.stringify(payload)).not.toMatch(/coordinates|geojson|latitude|longitude/);
  });
  it("kan een gebouw als bedrijfsverzamelgebouw inrichten zonder fictief object of klant", () => {
    const payload = collectiveBuildingAssociationPayload({ collective, buildingKey: "bag:bag-1", mode: "shared_building", name: " Verzamelgebouw Noord " });
    expect(payload).toMatchObject({ expected_version: 2, name: "Verzamelgebouw Noord", parent_collectief_id: "estate", association_type: "shared_building" });
    expect(payload).not.toHaveProperty("object_id");
    expect(payload).not.toHaveProperty("customer_id");
  });
  it("blokkeert alle gebouwkoppelingen zolang de kaart onopgeslagen wijzigingen heeft", async () => {
    mount(<CollectiveBuildingLinks collective={collective} configuration={savedBuilding} dirty />);
    expect(screen.getByRole("status")).toHaveTextContent("Sla de kaart eerst op");
    expect(screen.queryByRole("button", { name: "Koppeling bevestigen" })).not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("kan vanuit een opgeslagen collectiefgebouw expliciet een tweede object in een gedeeld gebouw onderbrengen", async () => {
    mount(<CollectiveBuildingLinks collective={collective} configuration={savedBuilding} />);
    fireEvent.change(screen.getByLabelText("Opgeslagen gebouw"), { target: { value: "bag:bag-1" } });
    fireEvent.change(screen.getByLabelText("Wat wil je vastleggen?"), { target: { value: "group" } });
    await screen.findByRole("option", { name: "Kruizinga hal — Kruizinga" });
    fireEvent.change(screen.getByLabelText("Naam bedrijfsverzamelgebouw"), { target: { value: "Kantoor Noord" } });
    fireEvent.change(screen.getByLabelText("Klantobject meenemen (optioneel)"), { target: { value: "warehouse" } });
    expect(screen.getByRole("button", { name: "Koppeling bevestigen" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Ik bevestig dat dit het gedeelde gebouw is/ }));
    fireEvent.click(screen.getByRole("button", { name: "Koppeling bevestigen" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "confirm_building_association", association_type: "shared_building", source_kind: "collective", source_id: "estate", object_id: "warehouse", apply_to_object_map: true, expected_version: 7, name: "Kantoor Noord", parent_collectief_id: "estate" })));
  });
  it("toont in alleen-lezen kaart geen wijzigingsknoppen of nieuwe associatieverzoeken", () => {
    mount(<CollectiveBuildingLinks collective={collective} configuration={savedBuilding} disabled />);
    expect(screen.queryByText("Gebouw onderbrengen")).not.toBeInTheDocument();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
