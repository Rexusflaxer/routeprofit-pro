import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ObjectInstallationTable from "@/components/objects/ObjectInstallationTable";

const ajaxInstallation = {
  id: "installation-ajax",
  installation_type: "alarm_system",
  name: "Ajax hoofdcentrale",
  brand: "Ajax Systems",
  control_device_key: "superior-keypad-fibra",
  control_device_name: "Superior KeyPad Fibra",
  manual_key: "ajax:numeric-keypad:nl",
  manual_version: "2026.08.2",
  monitoring_connected: false,
  credential_types: [],
  lifecycle_status: "active",
  operational_status: "operational",
};

describe("ObjectInstallationTable", () => {
  it("opent de handleiding via de rij en laat wijzigen de rijactie niet activeren", () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    render(<ObjectInstallationTable
      installations={[ajaxInstallation]}
      onOpen={onOpen}
      onEdit={onEdit}
      onArchive={vi.fn()}
      disabled={false}
    />);

    expect(screen.getAllByText("Gecontroleerde handleiding openen").length).toBeGreaterThan(0);
    const desktopName = screen.getAllByText("Ajax hoofdcentrale").find(node => node.closest("tr"));
    fireEvent.click(desktopName.closest("tr"));
    expect(onOpen).toHaveBeenCalledWith(ajaxInstallation);

    fireEvent.click(screen.getByRole("button", { name: "Ajax hoofdcentrale wijzigen" }));
    expect(onEdit).toHaveBeenCalledWith(ajaxInstallation);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("belooft bij een ander merk geen ingebouwde handleiding", () => {
    render(<ObjectInstallationTable
      installations={[{ ...ajaxInstallation, id: "installation-bosch", name: "Bosch centrale", brand: "Bosch", control_device_key: null, control_device_name: null, manual_key: null, manual_version: null }]}
      onOpen={vi.fn()}
      onEdit={vi.fn()}
      onArchive={vi.fn()}
      disabled={false}
    />);
    expect(screen.getAllByText("Installatie openen").length).toBeGreaterThan(0);
    expect(screen.queryByText("Gecontroleerde handleiding openen")).not.toBeInTheDocument();
  });
});
