import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui-custom/AddressAutocomplete", () => ({
  default: ({ onQueryChange, onAddressSelect }) => (
    <div>
      <input aria-label="Objectadres" onChange={event => onQueryChange?.(event.target.value)} />
      <button
        type="button"
        onClick={() => onAddressSelect?.({
          street_name: "Reactorweg",
          house_number: "1",
          house_number_addition: "",
          postal_code: "3542AD",
          city: "Utrecht",
          country: "Nederland",
          latitude: 52.116,
          longitude: 5.063,
          geocoding_status: "verified",
          bag_address_id: "bag-1",
        })}
      >
        Geverifieerd adres kiezen
      </button>
    </div>
  ),
}));

import CustomerObjectWizard from "@/components/customers/CustomerObjectWizard";

async function completeIdentity({ name = "Distributiecentrum Utrecht", type = /Industrie \/ logistiek/i } = {}) {
  fireEvent.change(screen.getByLabelText(/Objectnaam/i), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: type }));
  fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
  await screen.findByLabelText("Objectadres");
}

describe("CustomerObjectWizard", () => {
  it("stelt alleen basisvragen en levert een gecontroleerd conceptobject op", async () => {
    const onSave = vi.fn();
    render(
      <CustomerObjectWizard
        customerName="Acme Beveiliging"
        objects={[{ id: "object-1", object_code: "OBJ-001", name: "Hoofdkantoor", address: "Coolsingel 1" }]}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Acme Beveiliging")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Objectcode/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Regio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Alarmcode/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sleutel/i)).not.toBeInTheDocument();

    await completeIdentity();
    expect(await screen.findByText(/Waar bevindt het object zich/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Objectadres"), { target: { value: "Reactorweg 1 Utrecht" } });
    fireEvent.click(screen.getByRole("button", { name: /Geverifieerd adres kiezen/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    expect(await screen.findByText(/Controleer het conceptobject/i)).toBeInTheDocument();
    expect(screen.getByText(/Waarschuwingsadressen en wijzigingen beheer je daarna/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Object aanmaken/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: "Distributiecentrum Utrecht",
      object_type: "industrial_logistics",
      address: "Reactorweg 1, 3542AD Utrecht",
      latitude: 52.116,
      longitude: 5.063,
      geocoding_status: "verified",
      bag_address_id: "bag-1",
      duplicate_reviewed: false,
    }));
  });

  it("kan een handmatig adres als concept bewaren zonder extra operationele vragen", async () => {
    const onSave = vi.fn();
    render(<CustomerObjectWizard customerName="Acme" objects={[]} onSave={onSave} onCancel={vi.fn()} />);

    await completeIdentity({ name: "Tijdelijk evenement", type: /Evenement \/ tijdelijk/i });
    fireEvent.change(screen.getByLabelText("Objectadres"), { target: { value: "Terrein naast Haven 2" } });
    expect(screen.getByText(/Kaartlocatie nog controleren/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Object aanmaken/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      address: "Terrein naast Haven 2",
      geocoding_status: "unverified",
      latitude: null,
      longitude: null,
    }));
  });

  it("vereist bevestiging wanneer naam of adres op een bestaand object lijkt", async () => {
    const onSave = vi.fn();
    render(
      <CustomerObjectWizard
        customerName="Acme"
        objects={[{ id: "object-existing", object_code: "LOC-9", name: "Hoofdkantoor", address: "Coolsingel 1 Rotterdam" }]}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    await completeIdentity({ name: "Hoofdkantoor", type: /Kantoor \/ bedrijfspand/i });
    fireEvent.change(screen.getByLabelText("Objectadres"), { target: { value: "Nieuweweg 1 Rotterdam" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    expect(await screen.findByText(/Mogelijk dubbel object/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Object aanmaken/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Object aanmaken/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ duplicate_reviewed: true }));
  });

  it("toont backendfouten met requestreferentie zonder de wizard te sluiten", () => {
    const error = Object.assign(new Error("Objectcode is al in gebruik."), { requestId: "request-object-123" });
    render(<CustomerObjectWizard customerName="Acme" onSave={vi.fn()} onCancel={vi.fn()} error={error} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Objectcode is al in gebruik.");
    expect(screen.getByRole("alert")).toHaveTextContent("Referentie: request-object-123");
  });
});
