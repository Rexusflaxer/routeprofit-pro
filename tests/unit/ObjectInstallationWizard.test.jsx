import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ObjectInstallationWizard from "@/components/objects/ObjectInstallationWizard";

const existingInstallation = {
  id: "installation-1",
  version: 4,
  installation_type: "alarm_system",
  name: "Hoofdcentrale",
  monitoring_connected: false,
  lifecycle_status: "active",
  operational_status: "operational",
  credential_types: ["switching_code"],
};

async function openCredentialStep() {
  fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
  await screen.findByText("Hoe herkennen we deze installatie?");
  fireEvent.click(screen.getByRole("button", { name: /Volgende/i }));
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
});
