import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SecurityPlanWizard from "@/components/objects/SecurityPlanWizard";

describe("SecurityPlanWizard per categorie", () => {
  it("start voor een vaste categorie bij Variant en bewaart de categorie-defaults in de payload", () => {
    const onSave = vi.fn();
    render(
      <SecurityPlanWizard
        initialTaskType="fire_closing_round"
        categoryLabel="Brand- & sluitronde"
        onCancel={vi.fn()}
        onSave={onSave}
        saving={false}
      />,
    );

    expect(screen.getByText("Geef deze variant een duidelijke naam")).toBeInTheDocument();
    expect(screen.queryByText("Wat voor taakvariant maakt u?")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Brand- & sluitronde toevoegen" })).toHaveTextContent("Variant");
    expect(screen.getByRole("button", { name: /^Ronde\b/i })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText(/^Variantnaam/), { target: { value: "Volledige vrijdagronde" } });
    fireEvent.click(screen.getByRole("button", { name: "Volgende" }));

    expect(screen.getByText("Leg de basis van de uitvoering vast")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Vaste geplande duur/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/^Geplande duur in minuten/)).toHaveValue(30);
    expect(screen.getByRole("button", { name: /Geen sectiekeuze/i })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Concept aanmaken" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      task_type: "fire_closing_round",
      custom_task_type: null,
      variant_name: "Volledige vrijdagronde",
      execution_mode: "round",
      duration_mode: "fixed",
      duration_minutes: 30,
      section_policy: "not_applicable",
    }));
  });

  it("vraagt binnen Anders eerst om een eigen taaktype", () => {
    render(
      <SecurityPlanWizard
        initialTaskType="other"
        categoryLabel="Anders"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        saving={false}
      />,
    );

    expect(screen.getByText("Hoe heet dit eigen taaktype?")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Eigen taaktype/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Volgende" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^Eigen taaktype/), { target: { value: "Terreinbegeleiding" } });
    expect(screen.getByRole("button", { name: "Volgende" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Volgende" }));

    expect(screen.getByText("Geef deze variant een duidelijke naam")).toBeInTheDocument();
  });
});
