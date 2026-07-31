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
  it("toont uitsluitend logo, objectnaam, grote objectcode, adres en objecttype", () => {
    render(<ObjectProfileHeader {...props()} />);

    expect(screen.getByText("Hoofdkantoor")).toBeInTheDocument();
    expect(screen.getByText("OBJ-001")).toHaveClass("text-lg", "font-mono");
    expect(screen.getByText("Coolsingel 1, Rotterdam")).toBeInTheDocument();
    expect(screen.getByText("Kantoor / bedrijfspand")).toBeInTheDocument();
    expect(screen.getByText("Logo")).toBeInTheDocument();
    expect(screen.queryByText("Actief")).not.toBeInTheDocument();
    expect(screen.queryByText(/aandachtspunt/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/operationele taak/i)).not.toBeInTheDocument();
  });

  it("bewerkt de profielkaart inline en houdt de objectcode alleen-lezen", () => {
    const onChange = vi.fn();
    const onAddressQueryChange = vi.fn();
    const onSave = vi.fn();
    render(<ObjectProfileHeader {...props({ editing: true, form: { ...object }, onChange, onAddressQueryChange, onSave })} />);

    fireEvent.change(screen.getByLabelText("Objectnaam"), { target: { value: "Nieuw hoofdkantoor" } });
    fireEvent.change(screen.getByLabelText("Adres"), { target: { value: "Nieuweweg 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));

    expect(onChange).toHaveBeenCalledWith("name", "Nieuw hoofdkantoor");
    expect(onAddressQueryChange).toHaveBeenCalledWith("Nieuweweg 1");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/Objectcode/i)).not.toBeInTheDocument();
    expect(screen.getByText("OBJ-001")).toBeInTheDocument();
  });
});
