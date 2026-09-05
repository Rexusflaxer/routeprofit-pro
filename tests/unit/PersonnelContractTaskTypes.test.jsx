import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/base44Client", () => ({
  base44: {},
}));

import {
  normalizePersonnelContractTaskTypes,
  personnelContractTaskTypesForPersistence,
  PERSONNEL_CONTRACT_TASK_TYPES,
  PersonnelContractTaskTypeSelector,
} from "@/components/personnel/PersonnelContractsTab";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("taaksoorten van arbeidscontracten", () => {
  it("gebruikt exact de canonieke ObjectTaskDefinition-sleutels, behalve de niet-eenduidige generieke scope", () => {
    const schema = JSON.parse(fs.readFileSync(
      path.join(root, "base44/entities/ObjectTaskDefinition.jsonc"),
      "utf8",
    ));
    const canonicalTaskTypes = schema.properties.task_type.enum.filter(value => value !== "other");

    expect(PERSONNEL_CONTRACT_TASK_TYPES.map(option => option.value)).toEqual(canonicalTaskTypes);
    expect(PERSONNEL_CONTRACT_TASK_TYPES.every(option => option.label && option.description)).toBe(true);
  });

  it("normaliseert invoer naar unieke concrete taaksoorten en weigert other of onbekende waarden", () => {
    expect(normalizePersonnelContractTaskTypes([
      "reception",
      " other ",
      "reception",
      "mobile_control_round",
      "legacy_custom_task",
    ])).toEqual(["reception", "mobile_control_round"]);

    expect(normalizePersonnelContractTaskTypes("access_control, other, fire_watch"))
      .toEqual(["access_control", "fire_watch"]);
    expect(personnelContractTaskTypesForPersistence([
      "reception",
      "other",
      "legacy_custom_task",
    ])).toEqual(["reception", "other", "legacy_custom_task"]);
  });

  it("toont en bedient concrete Nederlandse keuzes en legt de beperking voor bestaande waarden uit", () => {
    const onToggle = vi.fn();
    render(
      <PersonnelContractTaskTypeSelector
        selectedValues={["reception"]}
        unsupportedValues={["other", "legacy_custom_task"]}
        onToggle={onToggle}
      />,
    );

    expect(screen.getByRole("button", { name: "Receptiedienst" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Brand- & sluitronde" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Andere taak" })).not.toBeInTheDocument();
    expect(screen.getByText(/Andere taak is nog niet beschikbaar als contractscope/i)).toBeInTheDocument();
    expect(screen.getByText(/Andere taak \(other\), legacy_custom_task.*blijven.*legacywaarde bewaard/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Brand- & sluitronde" }));
    expect(onToggle).toHaveBeenCalledWith("fire_closing_round");
  });
});
