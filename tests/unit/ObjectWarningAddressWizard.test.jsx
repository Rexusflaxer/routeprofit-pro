import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ObjectWarningAddressWizard from "@/components/objects/ObjectWarningAddressWizard";

describe("ObjectWarningAddressWizard", () => {
  it("vraagt compact om contact, relatie, telefoon en belvolgorde", async () => {
    const onSave = vi.fn();
    render(<ObjectWarningAddressWizard nextCallOrder={3} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Voornaam *"), { target: { value: "Sanne" } });
    fireEvent.change(screen.getByLabelText("Tussenvoegsel"), { target: { value: "de" } });
    fireEvent.change(screen.getByLabelText("Achternaam *"), { target: { value: "Vries" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    await screen.findByText("Wat is de relatie tot het object?");
    fireEvent.click(screen.getByRole("button", { name: /Sleutelhouder/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    await screen.findByText("Op welke nummers is deze persoon bereikbaar?");
    fireEvent.change(screen.getByLabelText("Primair telefoonnummer *"), { target: { value: "06 12345678" } });
    fireEvent.change(screen.getByLabelText("E-mailadres"), { target: { value: "sanne@example.nl" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    await screen.findByText("Wanneer en in welke volgorde mag er worden gebeld?");
    expect(screen.getByLabelText("Belvolgorde *")).toHaveValue(3);
    fireEvent.click(screen.getByRole("button", { name: "Waarschuwingsadres toevoegen" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      first_name: "Sanne",
      middle_name: "de",
      last_name: "Vries",
      primary_phone: "06 12345678",
      email: "sanne@example.nl",
      relationship_type: "keyholder",
      relationship_label: "Sleutelhouder",
      call_order: 3,
      availability_mode: "always",
      not_call_periods: [],
    }));
  });

  it("laat een afwijkende relatie en een niet-bellenperiode expliciet vastleggen", async () => {
    const onSave = vi.fn();
    render(<ObjectWarningAddressWizard onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Voornaam *"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Achternaam *"), { target: { value: "Jansen" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Wat is de relatie tot het object?");
    fireEvent.click(screen.getByRole("button", { name: /^Anders/i }));
    fireEvent.change(screen.getByLabelText("Andere relatie *"), { target: { value: "Technische achterwacht" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Op welke nummers is deze persoon bereikbaar?");
    fireEvent.change(screen.getByLabelText("Primair telefoonnummer *"), { target: { value: "010 1234567" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Wanneer en in welke volgorde mag er worden gebeld?");
    fireEvent.click(screen.getByRole("button", { name: /Niet-bellenperiode/i }));
    fireEvent.click(screen.getByRole("button", { name: "Wo" }));
    fireEvent.click(screen.getByRole("button", { name: "Waarschuwingsadres toevoegen" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      relationship_type: "other",
      relationship_label: "Technische achterwacht",
      availability_mode: "not_call_periods",
      not_call_periods: [{
        days: ["mon", "tue", "thu", "fri", "sat", "sun"],
        start_time: "22:00",
        end_time: "07:00",
      }],
    }));
  });

  it("laat de gebruiker niet verdergaan met een onbelbaar nummer", async () => {
    render(<ObjectWarningAddressWizard onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Voornaam *"), { target: { value: "Sanne" } });
    fireEvent.change(screen.getByLabelText("Achternaam *"), { target: { value: "Vries" } });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Wat is de relatie tot het object?");
    fireEvent.click(screen.getByRole("button", { name: /Sleutelhouder/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Op welke nummers is deze persoon bereikbaar?");

    fireEvent.change(screen.getByLabelText("Primair telefoonnummer *"), { target: { value: "abc" } });

    expect(screen.getByText(/7 tot 15 cijfers/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Volgende/i })).toBeDisabled();
  });
});
