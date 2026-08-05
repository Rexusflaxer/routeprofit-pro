import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ObjectModuleWizard from "@/components/objects/ObjectModuleWizard";

describe("ObjectModuleWizard", () => {
  it("kiest een moduletype, stelt de standaardnaam voor en levert de korte createpayload", async () => {
    const onSave = vi.fn();
    render(<ObjectModuleWizard onCancel={vi.fn()} onSave={onSave} />);

    expect(screen.getByRole("list", { name: "Stappen voor objectmodule" })).toHaveTextContent("Module");
    fireEvent.click(screen.getByRole("button", { name: /Middelenuitgifte/i }));

    await waitFor(() => expect(screen.getByText("Geef de module een herkenbare naam")).toBeInTheDocument());
    expect(screen.getByLabelText(/^Modulenaam/)).toHaveValue("Middelenuitgifte");
    fireEvent.change(screen.getByLabelText(/^Modulenaam/), { target: { value: "Sleutel- en middelenuitgifte receptie" } });
    fireEvent.click(screen.getByRole("button", { name: "Module toevoegen" }));

    expect(onSave).toHaveBeenCalledWith({
      module_type: "item_issuance",
      name: "Sleutel- en middelenuitgifte receptie",
    });
  });

  it("voorkomt een tweede module van hetzelfde type", () => {
    render(<ObjectModuleWizard existingTypes={["visitor_registration"]} onCancel={vi.fn()} onSave={vi.fn()} />);

    const visitors = screen.getByRole("button", { name: /Bezoekersregistratie.*Al toegevoegd/i });
    expect(visitors).toBeDisabled();
    expect(screen.getByRole("button", { name: /Objectagenda/i })).toBeEnabled();
  });

  it("kan vanuit de naamstap terug naar de modulekeuze", () => {
    render(<ObjectModuleWizard onCancel={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Actiepunten/i }));
    fireEvent.click(screen.getByRole("button", { name: "Terug" }));
    expect(screen.getByText("Welke gedeelde module wil je gebruiken?")).toBeInTheDocument();
  });
});
