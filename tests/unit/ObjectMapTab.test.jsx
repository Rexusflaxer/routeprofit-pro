import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConfiguration, listCandidates, listParcels, updateConfiguration, guardState } = vi.hoisted(() => ({
  getConfiguration: vi.fn(),
  listCandidates: vi.fn(),
  listParcels: vi.fn(),
  updateConfiguration: vi.fn(),
  guardState: vi.fn(),
}));

vi.mock("@/components/objects/objectMapWorkflow", () => ({
  createObjectMapMutationKey: vi.fn(() => "map-mutation-key"),
  getObjectMapConfiguration: getConfiguration,
  listObjectBuildingCandidates: listCandidates,
  listObjectParcelCandidates: listParcels,
  updateObjectMapConfiguration: updateConfiguration,
}));
vi.mock("@/components/objects/useObjectModuleNavigationGuard", () => ({
  useObjectModuleNavigationGuard: options => {
    guardState(options);
    return { dialog: null };
  },
}));
vi.mock("@/components/objects/ObjectMapCanvas", () => ({
  default: props => <div data-testid="map-canvas">
    <button type="button" onClick={() => props.onToggleCandidate("bag-1")}>Pand op kaart selecteren</button>
    <button type="button" onClick={() => props.onAddDrawingPoint([[4.48, 51.92], [4.481, 51.92], [4.481, 51.921]][props.drawingPoints.length % 3])}>Hoekpunt op kaart plaatsen</button>
    <button type="button" onClick={() => props.onToggleBuildingPoint({ id: "user-point-1", source: "user_selected", provider: "mapbox", bag_status: "unlinked", longitude: 4.4815, latitude: 51.92 })}>Gebouw zonder BAG selecteren</button>
    <button type="button" onClick={() => props.onToggleParcel("parcel-1")}>Perceel op kaart selecteren</button>
    <output aria-label="Geselecteerde kaartpanden">{(props.selectedBagFeatureIds || []).join(",")}</output>
    <output aria-label="Kaartstatus">{JSON.stringify({ view: props.mapView, drawingPoints: props.drawingPoints, points: props.buildingSelectionPoints, terrain: props.terrain })}</output>
  </div>,
}));

import ObjectMapTab from "@/components/objects/ObjectMapTab";

const object = {
  id: "object-1",
  customer_id: "customer-1",
  name: "Hoofdgebouw",
  status: "active",
  geocoding_status: "verified",
  latitude: 51.92,
  longitude: 4.48,
};
const empty = { type: "FeatureCollection", features: [] };
const configuration = {
  object_id: "object-1",
  customer_id: "customer-1",
  expected_version: 4,
  building_selection_mode: "automatic",
  map_geometry_status: "unconfigured",
  map_geometry_revision: 0,
  selected_bag_feature_ids: [],
  building_polygon_geojson: empty,
  manual_building_geojson: empty,
  object_area_geojson: empty,
  show_on_mobile_map: false,
  conflicts: [],
};
const candidate = {
  type: "Feature",
  id: "bag-1",
  properties: { source: "pdok_bag", source_feature_id: "bag-1", source_identificatie: "012345", conflict_count: 0, conflicts: [] },
  geometry: { type: "Polygon", coordinates: [[[4.48, 51.92], [4.481, 51.92], [4.481, 51.921], [4.48, 51.92]]] },
};

function renderTab(currentObject = object) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter><ObjectMapTab object={currentObject} onRegisterNavigationGuard={vi.fn()} /></MemoryRouter></QueryClientProvider>);
  return { ...view, client };
}

describe("ObjectMapTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfiguration.mockResolvedValue(configuration);
    listCandidates.mockResolvedValue({ items: [candidate], total: 1, source: "PDOK BAG", source_retrieved_at: "2026-09-06T09:00:00Z" });
    listParcels.mockResolvedValue({ items: [{ ...candidate, id: "parcel-1", properties: { source: "pdok_brk", source_feature_id: "parcel-1", label: "ROTTERDAM A 12" } }], source: "PDOK Kadastrale kaart" });
    updateConfiguration.mockResolvedValue({ ...configuration, expected_version: 5, building_selection_mode: "manual", selected_bag_feature_ids: ["bag-1"], map_geometry_status: "configured", map_geometry_revision: 1 });
  });

  it("selecteert een exact BAG-pand en past dit met de actuele versie toe", async () => {
    renderTab();
    expect(await screen.findByText("Automatische indicatie")).toBeInTheDocument();
    expect(screen.getByText("Automatisch voorgesteld · PDOK BAG")).toBeInTheDocument();
    const exactSelection = await screen.findByRole("button", { name: /Exact vastleggen/ });
    expect(exactSelection).not.toBeDisabled();
    fireEvent.click(exactSelection);

    expect(screen.getByText("Niet opgeslagen")).toBeInTheDocument();
    expect(guardState.mock.calls.at(-1)[0].dirty).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Opslaan en toepassen" }));

    await waitFor(() => expect(updateConfiguration).toHaveBeenCalledWith(expect.objectContaining({
      customerId: "customer-1",
      objectId: "object-1",
      expectedVersion: 4,
      idempotencyKey: "map-mutation-key",
      data: expect.objectContaining({
        building_selection_mode: "manual",
        selected_bag_feature_ids: ["bag-1"],
      }),
    })));
  });

  it("laat gebouwen selecteren terwijl BAG-kandidaten nog laden", async () => {
    let resolveCandidates;
    listCandidates.mockReturnValue(new Promise(resolve => { resolveCandidates = resolve; }));
    renderTab();

    const exactSelection = await screen.findByRole("button", { name: /Exact vastleggen/ });
    expect(exactSelection).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: /Gebouwcontour tekenen/ })).not.toBeInTheDocument();

    await act(async () => {
      resolveCandidates({ items: [candidate], total: 1, source: "PDOK BAG" });
    });
    await waitFor(() => expect(exactSelection).not.toBeDisabled());
  });

  it("laat gebouwen zonder BAG-koppeling selecteren bij BAG-uitval", async () => {
    listCandidates.mockRejectedValue(new Error("PDOK tijdelijk niet bereikbaar"));
    renderTab();

    expect(await screen.findByText("BAG-gebouwen konden niet worden geladen.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exact vastleggen/ })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Gebouw zonder BAG selecteren" }));
    expect(screen.getByText("Gebouw 1 · Zonder BAG-koppeling")).toBeInTheDocument();
    expect(screen.getByText("Niet opgeslagen")).toBeInTheDocument();
  });

  it("kan zonder BAG-kandidaten omschakelen naar eigen selecties", async () => {
    listCandidates.mockResolvedValue({ items: [], total: 0, source: "PDOK BAG" });
    renderTab();

    expect(await screen.findByText("0 BAG-kandidaten binnen 250 meter geladen")).toBeInTheDocument();
    const exactSelection = screen.getByRole("button", { name: /Exact vastleggen/ });
    expect(exactSelection).not.toBeDisabled();
    fireEvent.click(exactSelection);
    expect(screen.getByText("Niet opgeslagen")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bewust geen gebouwen markeren" }));
    expect(screen.getByText("Niet opgeslagen")).toBeInTheDocument();
    expect(screen.getByText("Er wordt bewust geen gebouw gemarkeerd. Klik op een pand op de kaart om het toe te voegen.")).toBeInTheDocument();
  });

  it("kan hetzelfde BAG-pand weer deselecteren zonder spookselectie", async () => {
    renderTab();
    const mapSelection = await screen.findByRole("button", { name: "Pand op kaart selecteren" });
    expect(screen.getByText("BAG-pand 012345")).toBeInTheDocument();
    fireEvent.click(mapSelection);

    expect(screen.queryByText("BAG-pand 012345")).not.toBeInTheDocument();
    expect(screen.getByText("Er wordt bewust geen gebouw gemarkeerd. Klik op een pand op de kaart om het toe te voegen.")).toBeInTheDocument();
    fireEvent.click(mapSelection);
    expect(screen.getByText("BAG-pand 012345")).toBeInTheDocument();
  });

  it("legt een bewuste lege handmatige selectie vast", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Bewust geen gebouwen markeren" }));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan en toepassen" }));

    await waitFor(() => expect(updateConfiguration).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ building_selection_mode: "manual", selected_bag_feature_ids: [] }),
    })));
  });

  it("vraagt bij een gedeeld pand verplicht om een reden", async () => {
    const overlap = Object.assign(new Error("Gebouw is al gekoppeld"), {
      status: 409,
      details: {
        code: "building_assignment_overlap_confirmation_required",
        conflict_fingerprint: "1".repeat(64),
        conflicts: [{ source_feature_id: "bag-1", objects: [{ object_id: "other-1", object_name: "Andere huurder" }] }],
      },
    });
    updateConfiguration.mockRejectedValueOnce(overlap).mockResolvedValueOnce({ ...configuration, expected_version: 5 });
    listCandidates.mockResolvedValue({
      items: [{ ...candidate, properties: { ...candidate.properties, conflict_count: 1, conflicts: [{ object_id: "other-1", object_name: "Andere huurder" }] } }],
      total: 1,
    });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /Exact vastleggen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan en toepassen" }));

    expect(await screen.findByRole("dialog", { name: "Gedeeld gebouw bevestigen" })).toBeInTheDocument();
    expect(updateConfiguration).toHaveBeenCalledTimes(1);
    expect(updateConfiguration.mock.calls[0][0].data.overlap_confirmation).toBeUndefined();
    fireEvent.change(screen.getByLabelText("Waarom wordt dit gebouw gedeeld? *"), { target: { value: "Twee huurders in hetzelfde pand" } });
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen en toepassen" }));
    await waitFor(() => expect(updateConfiguration).toHaveBeenCalledTimes(2));
    expect(updateConfiguration.mock.calls[1][0].data.overlap_confirmation).toEqual({
      confirmed: true,
      reason: "Twee huurders in hetzelfde pand",
      conflict_fingerprint: "1".repeat(64),
    });
  });

  it("herkent ook een overlap die pas bij opslaan door de server wordt gemeld", async () => {
    const overlap = Object.assign(new Error("Gebouw is al gekoppeld"), {
      status: 409,
      details: {
        code: "building_assignment_overlap_confirmation_required",
        conflict_fingerprint: "2".repeat(64),
        conflicts: [{ source_feature_id: "bag-1", objects: [{ object_id: "other-1", object_name: "Andere huurder" }] }],
      },
    });
    updateConfiguration.mockRejectedValueOnce(overlap).mockResolvedValueOnce({
      ...configuration,
      expected_version: 5,
      building_selection_mode: "manual",
      selected_bag_feature_ids: ["bag-1"],
      map_geometry_status: "configured",
      map_geometry_revision: 1,
    });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /Exact vastleggen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan en toepassen" }));

    expect(await screen.findByRole("dialog", { name: "Gedeeld gebouw bevestigen" })).toBeInTheDocument();
    expect(screen.queryByText("De kaart is ondertussen door iemand anders gewijzigd.")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Waarom wordt dit gebouw gedeeld? *"), { target: { value: "Gedeeld bedrijfsverzamelgebouw" } });
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen en toepassen" }));

    await waitFor(() => expect(updateConfiguration).toHaveBeenCalledTimes(2));
    expect(updateConfiguration.mock.calls[1][0].data.overlap_confirmation).toEqual({ confirmed: true, reason: "Gedeeld bedrijfsverzamelgebouw", conflict_fingerprint: "2".repeat(64) });
  });

  it("vraagt niet opnieuw om een overlapreden bij een latere zichtbaarheidswijziging", async () => {
    getConfiguration.mockResolvedValue({
      ...configuration,
      building_selection_mode: "manual",
      selected_bag_feature_ids: ["bag-1"],
      building_polygon_geojson: { type: "FeatureCollection", features: [candidate] },
      conflicts: [{ source_feature_id: "bag-1", objects: [{ object_id: "other-1", object_name: "Andere huurder" }] }],
    });
    listCandidates.mockResolvedValue({
      items: [{ ...candidate, properties: { ...candidate.properties, conflict_count: 1, conflicts: [{ object_id: "other-1", object_name: "Andere huurder" }] } }],
      total: 1,
    });
    renderTab();
    fireEvent.click(await screen.findByRole("switch", { name: "Object op mobiele kaart tonen" }));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan en toepassen" }));

    await waitFor(() => expect(updateConfiguration).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Gedeeld gebouw bevestigen" })).not.toBeInTheDocument();
    expect(updateConfiguration.mock.calls[0][0].data.overlap_confirmation).toBeUndefined();
  });

  it("maakt een ongecontroleerd adres alleen-lezen en vraagt geen BAG-kandidaten op", async () => {
    renderTab({ ...object, geocoding_status: "unverified", latitude: null, longitude: null });

    expect(await screen.findByText(/Controleer en bevestig eerst het objectadres/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opslaan en toepassen" })).toBeDisabled();
    expect(listCandidates).not.toHaveBeenCalled();
  });

  it.each([
    { latitude: null, longitude: null },
    { latitude: "", longitude: " " },
    { latitude: 0, longitude: "0" },
  ])("vertrouwt de status verified niet zonder echte coördinaten: %o", async coordinates => {
    renderTab({ ...object, geocoding_status: "verified", ...coordinates });

    expect(await screen.findByText(/Controleer en bevestig eerst het objectadres/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opslaan en toepassen" })).toBeDisabled();
    expect(listCandidates).not.toHaveBeenCalled();
  });

  it("beschouwt een handmatig bevestigde kaartpositie als geldig", async () => {
    renderTab({ ...object, geocoding_status: "manual" });

    await screen.findByText("Bepaling van gebouwen");
    expect(screen.getByRole("button", { name: /Automatisch bepalen/ })).not.toBeDisabled();
    expect(listCandidates).toHaveBeenCalled();
  });

  it("zet een legacy-object zonder zichtbaarheidveld niet onverwacht uit", async () => {
    getConfiguration.mockResolvedValue({ ...configuration, show_on_mobile_map: null });
    renderTab({ ...object, show_on_mobile_map: undefined });

    expect(await screen.findByRole("switch", { name: "Object op mobiele kaart tonen" })).toBeChecked();
  });

  it("blijft een opgeslagen BAG-pand tonen als kandidaten tijdelijk niet laden", async () => {
    getConfiguration.mockResolvedValue({
      ...configuration,
      building_selection_mode: "manual",
      selected_bag_feature_ids: ["bag-1"],
      building_polygon_geojson: { type: "FeatureCollection", features: [candidate] },
    });
    listCandidates.mockRejectedValue(new Error("PDOK tijdelijk niet bereikbaar"));
    renderTab();

    expect(await screen.findByText("BAG-gebouwen konden niet worden geladen.")).toBeInTheDocument();
    expect(screen.getByText("BAG-pand 012345")).toBeInTheDocument();
  });

  it("biedt bij een versieconflict een veilige herlaadactie", async () => {
    const conflict = Object.assign(new Error("Versieconflict"), { status: 409 });
    updateConfiguration.mockRejectedValue(conflict);
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /Exact vastleggen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan en toepassen" }));

    expect(await screen.findByText("De kaart is ondertussen door iemand anders gewijzigd.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actuele versie laden" })).toBeInTheDocument();
  });

  it("toont een echte laadfout en kan de eerste configuratie opnieuw ophalen", async () => {
    const loadError = new Error("Configuratieservice niet bereikbaar");
    getConfiguration
      .mockRejectedValueOnce(loadError)
      .mockRejectedValueOnce(loadError)
      .mockResolvedValue(configuration);
    renderTab();

    expect(await screen.findByText("Kaart en terrein konden niet worden geladen.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw" }));
    expect(await screen.findByText("Bepaling van gebouwen")).toBeInTheDocument();
  });

  it("behoudt gecachete kaartgegevens wanneer vernieuwen mislukt", async () => {
    const { client } = renderTab();
    await screen.findByText("Bepaling van gebouwen");
    getConfiguration.mockRejectedValue(new Error("Vernieuwen mislukt"));

    await act(async () => {
      await client.refetchQueries({ queryKey: ["object-card", "object-1", "map-configuration"] });
    });

    expect(await screen.findByText("De opgeslagen kaart blijft zichtbaar, maar vernieuwen is mislukt.")).toBeInTheDocument();
    expect(screen.getByText("Bepaling van gebouwen")).toBeInTheDocument();
  });

  it("overschrijft een vuil concept niet met een nieuwere gecachete versie", async () => {
    const { client } = renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /Exact vastleggen/ }));

    act(() => {
      client.setQueryData(["object-card", "object-1", "map-configuration"], {
        ...configuration,
        expected_version: 5,
        map_geometry_revision: 2,
      });
    });

    expect(await screen.findByText("De kaart is ondertussen door iemand anders gewijzigd.")).toBeInTheDocument();
    expect(screen.getByText("BAG-pand 012345")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opslaan en toepassen" })).toBeDisabled();
    let staleSaveError;
    await act(async () => {
      try {
        await guardState.mock.calls.at(-1)[0].onSave();
      } catch (error) {
        staleSaveError = error;
      }
    });
    expect(staleSaveError).toMatchObject({ message: expect.stringContaining("Laad eerst de actuele kaartconfiguratie") });
    expect(updateConfiguration).not.toHaveBeenCalled();
  });

  it("maakt een zichtbaar overlapbevestigingspad tijdens opslaan en navigeren", async () => {
    const overlap = Object.assign(new Error("Gebouw is al gekoppeld"), {
      status: 409,
      details: {
        code: "building_assignment_overlap_confirmation_required",
        conflict_fingerprint: "3".repeat(64),
        conflicts: [{ source_feature_id: "bag-1", objects: [{ object_id: "other-1", object_name: "Andere huurder" }] }],
      },
    });
    updateConfiguration.mockRejectedValueOnce(overlap).mockResolvedValueOnce({ ...configuration, expected_version: 5 });
    listCandidates.mockResolvedValue({
      items: [{ ...candidate, properties: { ...candidate.properties, conflict_count: 1, conflicts: [{ object_id: "other-1", object_name: "Andere huurder" }] } }],
      total: 1,
    });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /Exact vastleggen/ }));
    await waitFor(() => expect(guardState.mock.calls.at(-1)[0].dirty).toBe(true));

    let navigationSave;
    act(() => { navigationSave = guardState.mock.calls.at(-1)[0].onSave(); });
    expect(await screen.findByRole("dialog", { name: "Gedeeld gebouw bevestigen" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Waarom wordt dit gebouw gedeeld? *"), { target: { value: "Gedeeld pand" } });
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen en toepassen" }));
    await act(async () => { await navigationSave; });

    expect(updateConfiguration).toHaveBeenCalledWith(expect.objectContaining({
      expectedVersion: 4,
      data: expect.objectContaining({ overlap_confirmation: { confirmed: true, reason: "Gedeeld pand", conflict_fingerprint: "3".repeat(64) } }),
    }));
  });

  it("vereist minimaal drie tekens en wist de overlapreden bij annuleren", async () => {
    const overlap = Object.assign(new Error("Gebouw is al gekoppeld"), {
      status: 409,
      details: {
        code: "building_assignment_overlap_confirmation_required",
        conflict_fingerprint: "4".repeat(64),
        conflicts: [{ source_feature_id: "bag-1", objects: [{ object_id: "other-1", object_name: "Andere huurder" }] }],
      },
    });
    updateConfiguration.mockRejectedValue(overlap);
    listCandidates.mockResolvedValue({
      items: [{ ...candidate, properties: { ...candidate.properties, conflict_count: 1, conflicts: [{ object_id: "other-1", object_name: "Andere huurder" }] } }],
      total: 1,
    });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /Exact vastleggen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan en toepassen" }));
    const reason = await screen.findByLabelText("Waarom wordt dit gebouw gedeeld? *");
    fireEvent.change(reason, { target: { value: "ab" } });

    expect(screen.getByText("Vul minimaal 3 tekens in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bevestigen en toepassen" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Annuleren" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Gedeeld gebouw bevestigen" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Opslaan en toepassen" }));
    expect(await screen.findByLabelText("Waarom wordt dit gebouw gedeeld? *")).toHaveValue("");
  });

  it("bevestigt nooit een serveroverlap zonder conflictvingerafdruk", async () => {
    updateConfiguration.mockRejectedValue(Object.assign(new Error("Bevestiging ontbreekt"), {
      status: 409,
      details: { code: "building_assignment_overlap_confirmation_required" },
    }));
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: /Exact vastleggen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan en toepassen" }));

    expect(await screen.findByText("Kaart en terrein konden niet worden opgeslagen.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Gedeeld gebouw bevestigen" })).not.toBeInTheDocument();
    expect(updateConfiguration.mock.calls[0][0].data.overlap_confirmation).toBeUndefined();
  });

  it("beschouwt een lopend tekenvlak als niet-opgeslagen wijziging", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("tab", { name: "Terrein" }));
    fireEvent.click(screen.getByRole("button", { name: "Zelf tekenen" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoekpunt op kaart plaatsen" }));

    await waitFor(() => expect(guardState.mock.calls.at(-1)[0].dirty).toBe(true));
    expect(screen.getByText("Niet opgeslagen")).toBeInTheDocument();
    let draftSaveError;
    await act(async () => {
      try {
        await guardState.mock.calls.at(-1)[0].onSave();
      } catch (error) {
        draftSaveError = error;
      }
    });
    expect(draftSaveError).toMatchObject({ message: expect.stringContaining("Sluit of annuleer eerst het vlak") });
    expect(await screen.findByText("Maak het getekende vlak eerst af")).toBeInTheDocument();
    expect(updateConfiguration).not.toHaveBeenCalled();
  });

  it("slaat eigen gebouwselecties met herkomst op en kan ze opnieuw verwijderen", async () => {
    updateConfiguration.mockImplementation(async ({ data }) => ({ ...configuration, ...data, expected_version: 5 }));
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "Gebouw zonder BAG selecteren" }));
    expect(screen.getByText("Gebouw 1 · Zonder BAG-koppeling")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opslaan en toepassen" }));
    await waitFor(() => expect(updateConfiguration).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      building_selection_mode: "manual",
      building_selection_points: [{ id: "user-point-1", source: "user_selected", provider: "mapbox", bag_status: "unlinked", longitude: 4.4815, latitude: 51.92 }],
    }) })));
    await waitFor(() => expect(screen.queryByText("Niet opgeslagen")).not.toBeInTheDocument());
    expect(screen.getByText("Gebouw 1 · Zonder BAG-koppeling")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gebouw zonder BAG-koppeling 1 verwijderen" }));
    expect(screen.queryByText("Gebouw 1 · Zonder BAG-koppeling")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wijziging ongedaan maken" }));
    expect(screen.getByText("Gebouw 1 · Zonder BAG-koppeling")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Automatisch bepalen/ }));
    expect(JSON.parse(screen.getByLabelText("Kaartstatus").textContent).points).toEqual([]);
  });

  it("behoudt de terreintekening bij wisselen tussen kaart en luchtfoto", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("tab", { name: "Terrein" }));
    expect(screen.getByRole("button", { name: "Luchtfoto" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Zelf tekenen" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoekpunt op kaart plaatsen" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoekpunt op kaart plaatsen" }));
    fireEvent.click(screen.getByRole("button", { name: "Kaart" }));
    expect(JSON.parse(screen.getByLabelText("Kaartstatus").textContent)).toMatchObject({ view: "map", drawingPoints: [[4.48, 51.92], [4.481, 51.92]] });
    fireEvent.click(screen.getByRole("button", { name: "Luchtfoto" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoekpunt op kaart plaatsen" }));
    fireEvent.click(screen.getByRole("button", { name: "Vlak sluiten (3/3)" }));
    expect(JSON.parse(screen.getByLabelText("Kaartstatus").textContent).terrain.features).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Opslaan en toepassen" }));
    await waitFor(() => expect(updateConfiguration).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      object_area_geojson: expect.objectContaining({ features: [expect.objectContaining({ geometry: candidate.geometry })] }),
    }) })));
  });

  it("neemt een perceel over met herkomst, bewaart undo en kan het weer wissen", async () => {
    renderTab();
    fireEvent.click(await screen.findByRole("tab", { name: "Terrein" }));
    await waitFor(() => expect(listParcels).toHaveBeenCalledWith(expect.objectContaining({ customerId: "customer-1", objectId: "object-1" })));
    expect(await screen.findByText(/1 percelen rond het object geladen/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Perceel kiezen" }));
    fireEvent.click(screen.getByRole("button", { name: "Perceel op kaart selecteren" }));
    const state = () => JSON.parse(screen.getByLabelText("Kaartstatus").textContent);
    expect(state().terrain.features[0]).toMatchObject({ geometry: candidate.geometry, properties: { source: "user_drawn", derived_from: "pdok_brk", derived_from_id: "parcel-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Wijziging ongedaan maken" }));
    expect(state().terrain.features).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Wijziging opnieuw uitvoeren" }));
    expect(state().terrain.features).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Terreindeel 1 verwijderen" }));
    expect(state().terrain.features).toEqual([]);
  });

  it("houdt zelf tekenen beschikbaar bij een storing van de perceelbron", async () => {
    listParcels.mockRejectedValue(new Error("PDOK tijdelijk niet bereikbaar"));
    renderTab();
    fireEvent.click(await screen.findByRole("tab", { name: "Terrein" }));
    expect(await screen.findByText(/Perceelgrenzen konden niet worden geladen/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zelf tekenen" })).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: /Gebouwcontour tekenen/ })).not.toBeInTheDocument();
  });

  it("laadt vervolgcandidaten met een opaque cursor en dedupliceert de kaartlijst", async () => {
    const second = {
      ...candidate,
      id: "bag-2",
      properties: { ...candidate.properties, source_feature_id: "bag-2", source_identificatie: "067890" },
    };
    listCandidates.mockImplementation(async ({ cursor }) => cursor
      ? { items: [candidate, second], total: 2, cursor, next_cursor: null, has_more: false, source: "PDOK BAG" }
      : { items: [candidate], total: 1, next_cursor: "opaque-next", has_more: true, source: "PDOK BAG" });
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Meer gebouwen laden" }));
    await waitFor(() => expect(screen.getByText("2 BAG-kandidaten binnen 250 meter geladen")).toBeInTheDocument());
    expect(listCandidates).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "opaque-next" }));
  });
});
