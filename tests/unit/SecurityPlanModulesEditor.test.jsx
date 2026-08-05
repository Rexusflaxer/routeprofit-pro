import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SecurityPlanModulesEditor from "@/components/objects/SecurityPlanModulesEditor";

const modules = [{
  id: "module-items",
  module_type: "item_issuance",
  display_name: "Middelenuitgifte Saturn",
  status: "active",
  current_published_revision_id: "module-revision-3",
}];

function Harness({ availableModules = modules, initialValue = [] }) {
  const [value, setValue] = useState(initialValue);
  return <><SecurityPlanModulesEditor modules={availableModules} value={value} onChange={setValue} /><output data-testid="assignments">{JSON.stringify(value)}</output></>;
}

describe("SecurityPlanModulesEditor", () => {
  it("koppelt een stabiele objectmodule zonder de moduleconfiguratie te kopieren", () => {
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Middelenuitgifte Saturn koppelen"));

    const assignments = JSON.parse(screen.getByTestId("assignments").textContent);
    expect(assignments).toEqual([expect.objectContaining({
      module_id: "module-items",
      module_revision_id: "module-revision-3",
      access_mode: "register",
      quick_action: false,
    })]);
    expect(assignments[0]).not.toHaveProperty("catalog_items");
    expect(screen.getByText(/gedeelde objectconfiguratie/i)).toBeInTheDocument();
  });

  it("toont een concrete route naar inrichting wanneer nog geen module actief is", () => {
    render(<SecurityPlanModulesEditor modules={[]} value={[]} onChange={() => {}} />);
    expect(screen.getByText("Nog geen actieve objectmodules")).toBeInTheDocument();
    expect(screen.getByText(/onder Modules een module toe/i)).toBeInTheDocument();
  });

  it("houdt een gekoppelde gepauzeerde module zichtbaar zodat de gebruiker haar kan ontkoppelen", () => {
    const suspended = [{ ...modules[0], status: "suspended" }];
    const assignment = [{
      id: "assignment-1",
      sequence: 1,
      module_id: "module-items",
      module_revision_id: "module-revision-3",
      access_mode: "register",
      quick_action: false,
      instruction: "",
    }];
    render(<Harness availableModules={suspended} initialValue={assignment} />);

    expect(screen.getByText("Gepauzeerd")).toBeInTheDocument();
    expect(screen.getByText(/Ontkoppel haar om het plan weer publiceerbaar te maken/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Middelenuitgifte Saturn koppelen"));
    expect(JSON.parse(screen.getByTestId("assignments").textContent)).toEqual([]);
  });
});
