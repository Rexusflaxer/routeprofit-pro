import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/api/base44Client", () => ({
  base44: { functions: { invoke } },
}));

import AddressAutocomplete from "@/components/ui-custom/AddressAutocomplete";

describe("AddressAutocomplete", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("bewaart naast adresdelen ook de PDOK-coördinaten en BAG-identiteit", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue({
      data: {
        suggestions: [{
          address: "Reactorweg 1, 3542 AD Utrecht",
          street_name: "Reactorweg",
          house_number: "1",
          postal_code: "3542AD",
          city: "Utrecht",
          country: "Nederland",
          latitude: 52.116,
          longitude: 5.063,
          bag_address_id: "bag-1",
        }],
      },
    });
    const onAddressSelect = vi.fn();
    const onQueryChange = vi.fn();
    render(
      <>
        <label htmlFor="address">Objectadres</label>
        <AddressAutocomplete id="address" onAddressSelect={onAddressSelect} onQueryChange={onQueryChange} />
      </>,
    );

    fireEvent.change(screen.getByLabelText("Objectadres"), { target: { value: "Reactorweg 1" } });
    expect(onQueryChange).toHaveBeenCalledWith("Reactorweg 1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(301);
    });
    const suggestion = screen.getByRole("button", { name: /Reactorweg 1/i });
    fireEvent.mouseDown(suggestion);

    expect(onAddressSelect).toHaveBeenCalledWith(expect.objectContaining({
      street_name: "Reactorweg",
      house_number: "1",
      postal_code: "3542AD",
      city: "Utrecht",
      latitude: 52.116,
      longitude: 5.063,
      bag_address_id: "bag-1",
      geocoding_status: "verified",
    }), expect.objectContaining({ address: "Reactorweg 1, 3542 AD Utrecht" }));
  });
});
