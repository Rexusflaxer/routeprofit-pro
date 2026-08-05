import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workflow = vi.hoisted(() => ({
  getObjectSecurityPlan: vi.fn(),
  archiveObjectSection: vi.fn(),
  archiveObjectSecurityPlan: vi.fn(),
  duplicateObjectSecurityPlan: vi.fn(),
  publishObjectSecurityPlan: vi.fn(),
  saveObjectSecurityPlanDraft: vi.fn(),
  upsertObjectSection: vi.fn(),
}));

vi.mock("@/components/objects/securityPlanWorkflow", () => ({
  ...workflow,
  createSecurityPlanMutationKey: vi.fn(action => `${action}:test-key`),
}));

vi.mock("@/components/objects/SecurityPlanInstructionBuilder", () => ({
  default: () => <div>Instructiebouwer</div>,
}));

vi.mock("@/components/objects/SecurityPlanRouteEditor", () => ({
  default: () => <div>Route-editor</div>,
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import SecurityPlanWorkspace from "@/components/objects/SecurityPlanWorkspace";

const object = {
  id: "object-saturn",
  customer_id: "customer-saturn",
  name: "Saturn Petcare",
  status: "active",
};

function revision(status) {
  return {
    id: `revision-${status}`,
    security_plan_id: "plan-friday",
    revision_number: status === "draft" ? 3 : 2,
    status,
    summary: status === "draft" ? "Volledige vrijdagronde voor alle productiegebieden." : "Gepubliceerde vrijdagronde.",
    duration_mode: "fixed",
    duration_minutes: 75,
    section_policy: "not_applicable",
    default_section_ids: [],
    allowed_section_ids: [],
    instruction_blocks: [{
      id: "block-closing",
      sequence: 1,
      title: "Afsluiten",
      description: "",
      steps: [{
        id: "step-doors",
        sequence: 1,
        title: "Controleer buitendeuren",
        instruction: "Controleer alle buitendeuren en rapporteer afwijkingen.",
        action_type: "inspect",
        section_id: null,
        installation_id: null,
        floorplan_marker_id: null,
        required: true,
      }],
    }],
    floorplan_id: null,
    floorplan_revision: null,
    route_overlay: null,
    version: 1,
  };
}

function detailDto(mode) {
  const draft = mode === "draft" ? revision("draft") : null;
  const published = mode === "published" ? revision("published") : null;
  return {
    plan: {
      id: "plan-friday",
      customer_id: object.customer_id,
      object_id: object.id,
      task_type: "fire_closing_round",
      custom_task_type: null,
      variant_name: "Volledige vrijdagronde",
      execution_mode: "round",
      status: mode === "draft" ? "draft" : "published",
      draft_revision_id: draft?.id || null,
      current_published_revision_id: published?.id || null,
      latest_revision_number: draft?.revision_number || published?.revision_number,
      version: 4,
    },
    draft_revision: draft,
    published_revision: published,
    revision_history: published ? [published] : [],
    sections: [],
    floorplans: [],
    installations: [],
    readiness: { ready_to_publish: true, blocking_issues: [], warnings: [] },
    migration_required: false,
  };
}

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/ObjectDetail?id=object-saturn&tab=security-plan&view=edit&row=plan-friday"]}>
        <SecurityPlanWorkspace object={object} securityPlanId="plan-friday" onBack={vi.fn()} onOpenPlan={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SecurityPlanWorkspace", () => {
  beforeEach(() => {
    Object.values(workflow).forEach(mock => mock.mockReset());
  });

  it.each([
    ["conceptrevisie", "draft", "Volledige vrijdagronde voor alle productiegebieden."],
    ["gepubliceerde fallback", "published", "Gepubliceerde vrijdagronde."],
  ])("rendert een succesvol detail-DTO met %s", async (_label, mode, summary) => {
    workflow.getObjectSecurityPlan.mockResolvedValue(detailDto(mode));

    renderWorkspace();

    expect(await screen.findByRole("heading", { level: 2, name: "Volledige vrijdagronde" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Overzicht/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByDisplayValue("Volledige vrijdagronde")).toBeInTheDocument();
    expect(screen.getByDisplayValue(summary)).toBeInTheDocument();
    expect(screen.getByText("Brand- & sluitronde · Ronde · revisie 3", { exact: mode === "draft" })).toBeInTheDocument();
    expect(screen.getByText("De categorie staat vast zodat het plan in het juiste categorieoverzicht blijft.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Taaktype")).not.toBeInTheDocument();

    await waitFor(() => expect(workflow.getObjectSecurityPlan).toHaveBeenCalledWith({
      customerId: object.customer_id,
      objectId: object.id,
      securityPlanId: "plan-friday",
    }));
  });
});
