import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ObjectInstallationWizard from "@/components/objects/ObjectInstallationWizard";

const existingInstallation = {
  id: "installation-1",
  version: 4,
  installation_type: "alarm_system",
  name: "Hoofdcentrale",
  brand: "Ajax",
  control_device_key: "keypad-touchscreen-jeweller",
  control_device_name: "KeyPad TouchScreen Jeweller",
  manual_key: "ajax:touchscreen-keypad:nl",
  manual_version: "2026.08.1",
  monitoring_connected: false,
  lifecycle_status: "active",
  operational_status: "operational",
  credential_types: ["switching_code"],
};

function getAlarmTypeButton() {
  return screen.getAllByRole("button").find(button => button.textContent.startsWith("Alarminstallatie"));
}

async function openCredentialStep() {
  fireEvent.click(getAlarmTypeButton());
  await screen.findByText("Van welk merk is de installatie?");
  fireEvent.click(screen.getByRole("button", { name: /Ajax Systems/i }));
  await screen.findByText("Welk Ajax-bedienpaneel wordt op dit object gebruikt?");
  fireEvent.click(screen.getByRole("button", { name: /KeyPad TouchScreen Jeweller/i }));
  await screen.findByText("Is de installatie doorgemeld en hoe wordt deze bediend?");
}

describe("ObjectInstallationWizard", () => {
  it("laat een bestaande code expliciet intrekken zonder de code terug te lezen", async () => {
    const onSave = vi.fn();
    render(<ObjectInstallationWizard installation={existingInstallation} onSave={onSave} onCancel={vi.fn()} />);

    await openCredentialStep();
    expect(screen.getByLabelText("Schakelcode")).toHaveAttribute("placeholder", "Bestaande code behouden");

    fireEvent.click(screen.getByRole("button", { name: "Schakelcode intrekken" }));
    expect(screen.getByLabelText("Schakelcode")).toBeDisabled();
    expect(screen.getByText(/veilig ingetrokken en als wijziging gelogd/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Wie beheert de installatie en wat is de actuele toestand?");
    fireEvent.click(screen.getByRole("button", { name: "Wijzigingen opslaan" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      brand: "Ajax Systems",
      control_device_key: "keypad-touchscreen-jeweller",
      control_device_name: "KeyPad TouchScreen Jeweller",
      manual_key: "ajax:touchscreen-keypad:nl",
      manual_version: "2026.08.1",
      credentials: {},
      credentials_to_revoke: ["switching_code"],
    }));
  });

  it("kan het intrekken vóór opslaan weer ongedaan maken", async () => {
    const onSave = vi.fn();
    render(<ObjectInstallationWizard installation={existingInstallation} onSave={onSave} onCancel={vi.fn()} />);

    await openCredentialStep();
    fireEvent.click(screen.getByRole("button", { name: "Schakelcode intrekken" }));
    fireEvent.click(screen.getByRole("button", { name: "Intrekken ongedaan maken" }));
    expect(screen.getByLabelText("Schakelcode")).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Wie beheert de installatie en wat is de actuele toestand?");
    fireEvent.click(screen.getByRole("button", { name: "Wijzigingen opslaan" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ credentials_to_revoke: [] }));
  });

  it("toont de officiële merknaam en selecteert een bestaande Ajax-alias", async () => {
    render(<ObjectInstallationWizard installation={existingInstallation} onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(getAlarmTypeButton());
    await screen.findByText("Van welk merk is de installatie?");

    const ajax = screen.getByRole("button", { name: /Ajax Systems/i });
    expect(ajax).toHaveAttribute("aria-pressed", "true");
    expect(ajax.querySelector("img")).toHaveAttribute("src", "/installation-brand-logos/alarm-system/ajax-systems.png");
    expect(screen.queryByRole("button", { name: /^Ajax$/i })).not.toBeInTheDocument();
  });

  it("zoekt op productlijn en bewaart uitsluitend de canonieke merknaam", async () => {
    const onSave = vi.fn();
    render(<ObjectInstallationWizard onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(getAlarmTypeButton());
    await screen.findByText("Van welk merk is de installatie?");
    fireEvent.change(screen.getByLabelText("Zoek merk of productlijn"), { target: { value: "Galaxy" } });

    expect(screen.getByRole("button", { name: /Honeywell/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ajax Systems/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Honeywell/i }));
    await screen.findByText("Is de installatie doorgemeld en hoe wordt deze bediend?");
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Wie beheert de installatie en wat is de actuele toestand?");
    fireEvent.click(screen.getByRole("button", { name: "Installatie toevoegen" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brand: "Honeywell" }));
  });

  it("koppelt een nieuw Ajax-systeem aan het gekozen paneel en de vaste handleidingversie", async () => {
    const onSave = vi.fn();
    render(<ObjectInstallationWizard onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(getAlarmTypeButton());
    await screen.findByText("Van welk merk is de installatie?");
    fireEvent.click(screen.getByRole("button", { name: /Ajax Systems/i }));
    await screen.findByText("Welk Ajax-bedienpaneel wordt op dit object gebruikt?");
    fireEvent.click(screen.getByRole("button", { name: /Superior KeyPad Fibra/i }));
    await screen.findByText("Is de installatie doorgemeld en hoe wordt deze bediend?");
    fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
    await screen.findByText("Wie beheert de installatie en wat is de actuele toestand?");
    expect(screen.getByText(/Handleiding: Superior KeyPad Fibra/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Installatie toevoegen" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      brand: "Ajax Systems",
      control_device_key: "superior-keypad-fibra",
      control_device_name: "Superior KeyPad Fibra",
      manual_key: "ajax:numeric-keypad:nl",
      manual_version: "2026.08.1",
    }));
  });

  it("behoudt een onbekend bestaand merk als handmatige invoer", async () => {
    render(<ObjectInstallationWizard installation={{ ...existingInstallation, brand: "Guardall" }} onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(getAlarmTypeButton());
    await screen.findByText("Van welk merk is de installatie?");

    expect(screen.getByLabelText("Merk")).toHaveValue("Guardall");
    expect(screen.getByRole("button", { name: "Volgende" })).toBeEnabled();
  });

  it("stuurt een handmatig ingevoerde bekende alias naar de officiële merkoptie", async () => {
    render(<ObjectInstallationWizard onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(getAlarmTypeButton());
    await screen.findByText("Van welk merk is de installatie?");
    fireEvent.click(screen.getByRole("button", { name: /Ander merk/i }));
    fireEvent.change(screen.getByLabelText("Merk"), { target: { value: "Honeywell Galaxy" } });

    expect(screen.getByText(/al bekend als Honeywell/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gebruik Honeywell/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volgende" })).toBeDisabled();
  });
});
