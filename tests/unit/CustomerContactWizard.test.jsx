import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CustomerContactWizard from "@/components/customers/CustomerContactWizard";

async function fillName({
  firstName = "  Noor  ",
  namePrefix = "  van  ",
  lastName = "  Dijk  ",
} = {}) {
  fireEvent.change(screen.getByLabelText(/Voornaam/i), { target: { value: firstName } });
  fireEvent.change(screen.getByLabelText(/Tussenvoegsel/i), { target: { value: namePrefix } });
  fireEvent.change(screen.getByLabelText(/Achternaam/i), { target: { value: lastName } });
  fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
  await screen.findByRole("button", { name: /^Directeur/i });
}

async function chooseFunction(name) {
  fireEvent.click(screen.getByRole("button", { name }));
  fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
  await screen.findByLabelText(/E-mailadres/i);
}

describe("CustomerContactWizard", () => {
  it("levert getrimde gegevens en een specifieke meerkeuze-objectscope op", async () => {
    const onSave = vi.fn();
    const objects = [
      { id: "object-1", object_code: "OBJ-01", name: "Hoofdkantoor", city: "Rotterdam" },
      { id: "object-2", object_code: "OBJ-02", name: "Distributiecentrum", city: "Utrecht" },
      { id: "object-3", object_code: "OBJ-03", name: "Parkeergarage", city: "Den Haag" },
    ];
    render(<CustomerContactWizard objects={objects} onSave={onSave} onCancel={vi.fn()} />);

    await fillName();
    await chooseFunction(/Financieel contactpersoon/i);

    fireEvent.change(screen.getByLabelText(/E-mailadres/i), {
      target: { value: "  noor@example.nl  " },
    });
    fireEvent.change(screen.getByLabelText(/Telefoonnummer/i), {
      target: { value: "  010-1234567  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    fireEvent.click(await screen.findByRole("button", { name: /Specifieke objecten/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /OBJ-01.*Hoofdkantoor/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /OBJ-03.*Parkeergarage/i }));
    fireEvent.click(screen.getByRole("button", { name: /Contact toevoegen/i }));

    expect(onSave).toHaveBeenCalledWith({
      first_name: "Noor",
      name_prefix: "van",
      last_name: "Dijk",
      job_title: "Financieel contactpersoon",
      email: "noor@example.nl",
      phone: "010-1234567",
      object_scope: "selected",
      object_ids: ["object-1", "object-3"],
    });
  });

  it("vervangt bij Anders de keuzekaarten door vrije invoer en kan terug", async () => {
    render(<CustomerContactWizard onSave={vi.fn()} onCancel={vi.fn()} />);

    await fillName({ firstName: "Sam", namePrefix: "", lastName: "Jansen" });
    fireEvent.click(screen.getByRole("button", { name: /^Anders/i }));

    expect(screen.getByLabelText(/Andere functie/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Directeur/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Terug naar functies/i }));
    expect(screen.getByRole("button", { name: /^Directeur/i })).toBeInTheDocument();
  });

  it("toont zonder objecten alleen Alle objecten en bewaart een handmatige functie", async () => {
    const onSave = vi.fn();
    render(<CustomerContactWizard objects={[]} onSave={onSave} onCancel={vi.fn()} />);

    await fillName({ firstName: "  Sam ", namePrefix: "", lastName: " Jansen  " });
    fireEvent.click(screen.getByRole("button", { name: /^Anders/i }));
    fireEvent.change(screen.getByLabelText(/Andere functie/i), {
      target: { value: "  Hoofd technische dienst  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByLabelText(/E-mailadres/i);

    fireEvent.change(screen.getByLabelText(/Telefoonnummer/i), {
      target: { value: "  06 12345678  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    expect(await screen.findByRole("button", { name: /Alle objecten/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Specifieke objecten/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Contact toevoegen/i }));

    expect(onSave).toHaveBeenCalledWith({
      first_name: "Sam",
      name_prefix: "",
      last_name: "Jansen",
      job_title: "Hoofd technische dienst",
      email: "",
      phone: "06 12345678",
      object_scope: "all",
      object_ids: [],
    });
  });

  it("blokkeert doorgaan zonder naam, functie of bereikbaarheidskanaal", async () => {
    render(<CustomerContactWizard onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Volgende/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Voornaam/i), { target: { value: "Noor" } });
    fireEvent.change(screen.getByLabelText(/Achternaam/i), { target: { value: "Dijk" } });
    expect(screen.getByRole("button", { name: /Volgende/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    await screen.findByRole("button", { name: /^Planner/i });
    expect(screen.getByRole("button", { name: /Volgende/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Planner/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));

    await screen.findByLabelText(/E-mailadres/i);
    expect(screen.getByRole("button", { name: /Volgende/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/E-mailadres/i), { target: { value: "ongeldig" } });
    expect(screen.getByRole("button", { name: /Volgende/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/E-mailadres/i), { target: { value: "noor@example.nl" } });
    expect(screen.getByRole("button", { name: /Volgende/i })).toBeEnabled();
  });

  it("toont het backendbericht en de requestreferentie bij een opslagfout", () => {
    const error = Object.assign(new Error("Objectscope kon niet worden opgeslagen."), {
      requestId: "request-123",
    });

    render(<CustomerContactWizard onSave={vi.fn()} onCancel={vi.fn()} error={error} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Objectscope kon niet worden opgeslagen.");
    expect(screen.getByRole("alert")).toHaveTextContent("Referentie: request-123");
  });
});
