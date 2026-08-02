import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui-custom/AddressAutocomplete", () => ({
  default: ({ onQueryChange }) => <input aria-label="Adres" onChange={event => onQueryChange(event.target.value)} />,
}));

import ObjectProfileHeader from "@/components/objects/ObjectProfileHeader";

const object = {
  id: "object-1",
  name: "Hoofdkantoor",
  object_code: "OBJ-001",
  external_object_code: "MKA-7788",
  address: "Coolsingel 1, Rotterdam",
  object_type: "office",
  status: "active",
};

function props(overrides = {}) {
  return {
    object,
    editing: false,
    form: object,
    onChange: vi.fn(),
    onAddressQueryChange: vi.fn(),
    onAddressSelect: vi.fn(),
    onUploadLogo: vi.fn(),
    onStartEdit: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
}

describe("ObjectProfileHeader", () => {
  it("toont logo, objectnaam, beide objectcodes, adres en objecttype zonder dossieremblemen", () => {
    render(<ObjectProfileHeader {...props()} />);

    expect(screen.getByText("Hoofdkantoor")).toBeInTheDocument();
    expect(screen.getByText("OBJ-001")).toHaveClass("text-lg", "font-mono");
    expect(screen.getByText("MKA-7788")).toBeInTheDocument();
    expect(screen.getByText("Coolsingel 1, Rotterdam")).toBeInTheDocument();
    expect(screen.getByText("Kantoor / bedrijfspand")).toBeInTheDocument();
    expect(screen.getByText("Logo")).toBeInTheDocument();
    expect(screen.queryByText("Actief")).not.toBeInTheDocument();
    expect(screen.queryByText(/aandachtspunt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/operationele taak/i)).not.toBeInTheDocument();
  });

  it("bewerkt de eigen en externe objectcode inline", () => {
    const onChange = vi.fn();
    const onAddressQueryChange = vi.fn();
    const onSave = vi.fn();
    render(<ObjectProfileHeader {...props({ editing: true, form: { ...object }, onChange, onAddressQueryChange, onSave })} />);

    fireEvent.change(screen.getByLabelText("Objectnaam"), { target: { value: "Nieuw hoofdkantoor" } });
    fireEvent.change(screen.getByLabelText(/^Objectcode/), { target: { value: "rtm-009" } });
    fireEvent.change(screen.getByLabelText("Externe objectcode"), { target: { value: "PARTNER-42" } });
    fireEvent.change(screen.getByLabelText("Adres"), { target: { value: "Nieuweweg 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));

    expect(onChange).toHaveBeenCalledWith("name", "Nieuw hoofdkantoor");
    expect(onChange).toHaveBeenCalledWith("object_code", "rtm-009");
    expect(onChange).toHaveBeenCalledWith("external_object_code", "PARTNER-42");
    expect(onAddressQueryChange).toHaveBeenCalledWith("Nieuweweg 1");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Uniek binnen LOQ/)).toBeInTheDocument();
    expect(screen.getByText(/Mag bij meerdere objecten gelijk zijn/)).toBeInTheDocument();
  });

  it("vereist een eigen objectcode voordat de profielkaart kan worden opgeslagen", () => {
    render(<ObjectProfileHeader {...props({ editing: true, form: { ...object, object_code: "" } })} />);

    expect(screen.getByRole("button", { name: "Opslaan" })).toBeDisabled();
  });
});
