import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ObjectInstallationWizard from "@/components/objects/ObjectInstallationWizard";
import {
  AJAX_CONTROL_DEVICE_OPTIONS,
  AJAX_MANUAL_VERSION,
} from "@/components/objects/objectInstallationManuals";

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
  credential_types: ["arming_code"],
};

function getAlarmTypeButton() {
  return screen.getAllByRole("button").find(button => button.textContent.startsWith("Alarminstallatie"));
}

async function openCredentialStep() {
  fireEvent.click(getAlarmTypeButton());
  await screen.findByText("Van welk merk is de installatie?");
  fireEvent.click(screen.getByRole("button", { name: /Ajax Systems/i }));
  await screen.findByText("Hoe wordt het Ajax-systeem op dit object bediend?");
  const touchScreen = screen.getByRole("button", { name: "KeyPad TouchScreen" });
  expect(touchScreen).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(touchScreen);
  await screen.findByRole("heading", { name: "Schakelcodes" });
}

describe("ObjectInstallationWizard", () => {
  it("laat een bestaande code expliciet intrekken zonder de code terug te lezen", async () => {
    const onSave = vi.fn();
    render(<ObjectInstallationWizard installation={existingInstallation} onSave={onSave} onCancel={vi.fn()} />);

    await openCredentialStep();
    expect(screen.getByLabelText("Inschakelcode")).toHaveAttribute("placeholder", "Bestaande code behouden");

    fireEvent.click(screen.getByRole("button", { name: "Inschakelcode intrekken" }));
    expect(screen.getByLabelText("Inschakelcode")).toBeDisabled();
    expect(screen.getByText(/veilig ingetrokken en als wijziging gelogd/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wijzigingen opslaan" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      brand: "Ajax Systems",
      control_device_key: "keypad-touchscreen-jeweller",
      control_device_name: "KeyPad TouchScreen Jeweller",
      manual_key: "ajax:touchscreen-keypad:nl",
      manual_version: AJAX_MANUAL_VERSION,
      credentials: {},
      credentials_to_revoke: ["arming_code"],
    }));
  });

  it("kan het intrekken vóór opslaan weer ongedaan maken", async () => {
    const onSave = vi.fn();
    render(<ObjectInstallationWizard installation={existingInstallation} onSave={onSave} onCancel={vi.fn()} />);

    await openCredentialStep();
    fireEvent.click(screen.getByRole("button", { name: "Inschakelcode intrekken" }));
    fireEvent.click(screen.getByRole("button", { name: "Intrekken ongedaan maken" }));
    expect(screen.getByLabelText("Inschakelcode")).not.toBeDisabled();

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
    await screen.findByRole("heading", { name: "Schakelcodes" });
    fireEvent.click(screen.getByRole("button", { name: "Installatie toevoegen" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brand: "Honeywell" }));
  });

  it("koppelt een nieuw Ajax-systeem aan het gekozen paneel en de vaste handleidingversie", async () => {
    const onSave = vi.fn();
    render(<ObjectInstallationWizard onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(getAlarmTypeButton());
    await screen.findByText("Van welk merk is de installatie?");
    fireEvent.click(screen.getByRole("button", { name: /Ajax Systems/i }));
    await screen.findByText("Hoe wordt het Ajax-systeem op dit object bediend?");
    fireEvent.click(screen.getByRole("button", { name: "KeyPad" }));
    await screen.findByRole("heading", { name: "Schakelcodes" });
    const progress = screen.getByRole("list", { name: "Voortgang installatie toevoegen" });
    for (const label of ["Soort", "Merk", "Bediening", "Schakelcodes"]) expect(progress).toHaveTextContent(label);
    fireEvent.click(screen.getByRole("button", { name: "Installatie toevoegen" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      brand: "Ajax Systems",
      control_device_key: "keypad",
      control_device_name: "KeyPad",
      manual_key: "ajax:numeric-keypad:nl",
      manual_version: AJAX_MANUAL_VERSION,
    }));
  });

  it("toont vijf unieke Ajax-bedieningswijzen met grotere productfoto plus appbediening", async () => {
    render(<ObjectInstallationWizard onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(getAlarmTypeButton());
    await screen.findByText("Van welk merk is de installatie?");
    fireEvent.click(screen.getByRole("button", { name: /Ajax Systems/i }));
    await screen.findByText("Hoe wordt het Ajax-systeem op dit object bediend?");

    const physicalOptions = AJAX_CONTROL_DEVICE_OPTIONS.filter(candidate => candidate.imageSrc);
    expect(physicalOptions).toHaveLength(5);
    expect(AJAX_CONTROL_DEVICE_OPTIONS).toHaveLength(6);
    expect(physicalOptions.map(option => option.label)).toEqual([
      "KeyPad",
      "KeyPad Plus",
      "KeyPad Combi",
      "KeyPad TouchScreen",
      "KeyPad Outdoor",
    ]);

    for (const option of physicalOptions) {
      const button = screen.getByRole("button", { name: option.label });
      expect(button.querySelector("img")).toHaveAttribute("src", option.imageSrc);
      expect(button.querySelector("img")).toHaveStyle({ transform: `scale(${option.imageScale})` });
      expect(option.imageScale).toBeGreaterThanOrEqual(1.4);
      expect(button.textContent).not.toMatch(/Jeweller|Fibra|G3|bedraad|draadloos|wit|white/i);
    }

    expect(screen.queryByRole("button", { name: /Jeweller|Fibra|G3/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Geen vast bedienpaneel" }).querySelector("img")).toBeNull();
  });

  it("selecteert voor een opgeslagen hardwarevariant de bijbehorende generieke bedieningswijze", async () => {
    render(<ObjectInstallationWizard installation={existingInstallation} onSave={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(getAlarmTypeButton());
    await screen.findByText("Van welk merk is de installatie?");
    fireEvent.click(screen.getByRole("button", { name: /Ajax Systems/i }));
    await screen.findByText("Hoe wordt het Ajax-systeem op dit object bediend?");

    expect(screen.getByRole("button", { name: "KeyPad TouchScreen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "KeyPad TouchScreen Jeweller" })).not.toBeInTheDocument();
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
