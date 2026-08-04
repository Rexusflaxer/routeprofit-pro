import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ObjectWarningAddressWizard from "@/components/objects/ObjectWarningAddressWizard";

function fillName(firstName = "Sanne", lastName = "Vries") {
  fireEvent.change(screen.getByLabelText(/Voornaam/), { target: { value: firstName } });
  fireEvent.change(screen.getByLabelText(/Achternaam/), { target: { value: lastName } });
  fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
}

describe("ObjectWarningAddressWizard", () => {
  it("vraagt compact om contact, relatie, telefoon, belvolgorde en een expliciet rooster", async () => {
    const onSave = vi.fn();
    render(<ObjectWarningAddressWizard nextCallOrder={3} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Voornaam/), { target: { value: "Sanne" } });
    fireEvent.change(screen.getByLabelText("Tussenvoegsel"), { target: { value: "de" } });
    fireEvent.change(screen.getByLabelText(/Achternaam/), { target: { value: "Vries" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    await screen.findByText("Wat is de relatie tot het object?");
    fireEvent.click(screen.getByRole("button", { name: /Sleutelhouder/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    await screen.findByText("Op welke nummers is deze persoon bereikbaar?");
    fireEvent.change(screen.getByLabelText(/Primair telefoonnummer/), { target: { value: "06 12345678" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    await screen.findByText("Wanneer is deze contactpersoon bereikbaar?");
    fireEvent.click(screen.getByRole("button", { name: "24/7 invullen" }));
    fireEvent.click(screen.getByRole("button", { name: "Waarschuwingsadres toevoegen" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      first_name: "Sanne",
      middle_name: "de",
      last_name: "Vries",
      primary_phone: "06 12345678",
      relationship_type: "keyholder",
      relationship_label: "Sleutelhouder",
      call_order: 3,
      availability_mode: "schedule",
      not_call_periods: [],
      availability_periods: expect.arrayContaining([
        { days: ["mon"], start_time: "00:00", end_time: "24:00", kind: "available" },
        { days: ["sun"], start_time: "00:00", end_time: "24:00", kind: "available" },
      ]),
    }));
  });

  it("laat een afwijkende relatie en een compact werkdagrooster expliciet vastleggen", async () => {
    const onSave = vi.fn();
    render(<ObjectWarningAddressWizard onSave={onSave} onCancel={vi.fn()} />);

    fillName("Alex", "Jansen");
    await screen.findByText("Wat is de relatie tot het object?");
    fireEvent.click(screen.getByRole("button", { name: /^Anders/i }));
    fireEvent.change(screen.getByLabelText(/Andere relatie/), { target: { value: "Technische achterwacht" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Op welke nummers is deze persoon bereikbaar?");
    fireEvent.change(screen.getByLabelText(/Primair telefoonnummer/), { target: { value: "010 1234567" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Wanneer is deze contactpersoon bereikbaar?");
    fireEvent.click(screen.getByRole("button", { name: "Werkdagen 08:00–18:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Waarschuwingsadres toevoegen" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      relationship_type: "other",
      relationship_label: "Technische achterwacht",
      availability_mode: "schedule",
      availability_periods: expect.arrayContaining([
        { days: ["mon"], start_time: "08:00", end_time: "18:00", kind: "available" },
        { days: ["fri"], start_time: "08:00", end_time: "18:00", kind: "available" },
      ]),
    }));
  });

  it("laat de gebruiker niet verdergaan met een onbelbaar nummer", async () => {
    render(<ObjectWarningAddressWizard onSave={vi.fn()} onCancel={vi.fn()} />);

    fillName();
    await screen.findByText("Wat is de relatie tot het object?");
    fireEvent.click(screen.getByRole("button", { name: /Sleutelhouder/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Op welke nummers is deze persoon bereikbaar?");

    fireEvent.change(screen.getByLabelText(/Primair telefoonnummer/), { target: { value: "abc" } });

    expect(screen.getByText(/7 tot 15 cijfers/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Volgende/i })).toBeDisabled();
  });
});
