import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workflow = vi.hoisted(() => ({
  createObjectModule: vi.fn(),
  createObjectModuleMutationKey: vi.fn(action => `${action}:test-key`),
  getObjectModule: vi.fn(),
  listObjectModules: vi.fn(),
  publishObjectModule: vi.fn(),
  saveObjectModuleDraft: vi.fn(),
  setObjectModuleStatus: vi.fn(),
}));

vi.mock("@/components/objects/objectModuleWorkflow", () => workflow);
vi.mock("@/components/objects/ObjectModuleConfigurationEditors", () => ({
  ObjectModuleFieldsEditor: () => <div>Veldeneditor</div>,
  ObjectModuleOverviewEditor: () => <div>Overzichteditor</div>,
  ObjectModuleVersionsView: () => <div>Versies</div>,
}));
vi.mock("@/components/objects/ObjectModuleAdvancedEditors", () => ({
  ObjectModuleCatalogEditor: () => <div>Cataloguseditor</div>,
  ObjectModulePrivacyEditor: () => <div>Privacyeditor</div>,
  ObjectModuleRulesEditor: () => <div>Regeleditor</div>,
}));
vi.mock("@/components/objects/ObjectModuleLivePreview", () => ({
  default: () => <div>Modulevoorbeeld</div>,
}));
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import ObjectModulesTab from "@/components/objects/ObjectModulesTab";
import ObjectModuleWorkspace from "@/components/objects/ObjectModuleWorkspace";

const object = {
  id: "object-1",
  customer_id: "customer-1",
  name: "Saturn Petcare",
  status: "active",
};

const activeModule = {
  id: "module-1",
  customer_id: object.customer_id,
  object_id: object.id,
  module_type: "item_issuance",
  name: "Middelenuitgifte",
  display_name: "Middelenuitgifte",
  status: "active",
  version: 4,
  current_published_revision_id: "revision-1",
  linked_plan_count: 0,
  current_revision_summary: { status: "published", readiness_status: "ready" },
};

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

describe("verplichte reden voor objectmodulestatus", () => {
  beforeEach(() => {
    Object.values(workflow).forEach(mock => mock.mockReset());
    workflow.createObjectModuleMutationKey.mockImplementation(action => `${action}:test-key`);
    workflow.setObjectModuleStatus.mockResolvedValue({ module: { ...activeModule, status: "suspended", version: 5 } });
  });

  it("vraagt vanuit de moduletabel om een reden voordat pauzeren wordt uitgevoerd", async () => {
    workflow.listObjectModules.mockResolvedValue({ items: [activeModule], total: 1 });
    render(<QueryClientProvider client={client()}><ObjectModulesTab object={object} /></QueryClientProvider>);

    fireEvent.click(await screen.findByRole("button", { name: "Middelenuitgifte pauzeren" }));
    expect(screen.getByRole("heading", { name: "Objectmodule pauzeren?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pauzeren" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Reden voor pauzeren"), { target: { value: "  Tijdelijk onderhoud aan de receptiewerkwijze  " } });
    fireEvent.click(screen.getByRole("button", { name: "Pauzeren" }));

    await waitFor(() => expect(workflow.setObjectModuleStatus).toHaveBeenCalledWith(expect.objectContaining({
      customerId: object.customer_id,
      objectId: object.id,
      module: activeModule,
      status: "suspended",
      reason: "Tijdelijk onderhoud aan de receptiewerkwijze",
      idempotencyKey: "status-suspended:test-key",
    })));
  });

  it("vraagt in de modulewerkruimte om een reden en stuurt die mee bij archiveren", async () => {
    workflow.getObjectModule.mockResolvedValue({
      module: activeModule,
      draft_revision: null,
      published_revision: { id: "revision-1", revision_number: 1, version: 1, status: "published", configuration: {} },
      revisions: [],
      plan_links: [],
      readiness: { ready_to_publish: true, blocking_issues: [], warnings: [] },
    });
    workflow.setObjectModuleStatus.mockResolvedValue({ module: { ...activeModule, status: "archived", version: 5 } });
    const onBack = vi.fn();
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/ObjectDetail?id=object-1&tab=modules&view=edit&row=module-1"]}>
          <ObjectModuleWorkspace object={object} moduleId="module-1" onBack={onBack} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.pointerDown(await screen.findByRole("button", { name: "Meer acties" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Archiveren" }));
    expect(screen.getByRole("heading", { name: "Objectmodule archiveren?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archiveren" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Reden voor archiveren"), { target: { value: "Proces vervangen door centrale registratie" } });
    fireEvent.click(screen.getByRole("button", { name: "Archiveren" }));

    await waitFor(() => expect(workflow.setObjectModuleStatus).toHaveBeenCalledWith(expect.objectContaining({
      customerId: object.customer_id,
      objectId: object.id,
      module: activeModule,
      status: "archived",
      reason: "Proces vervangen door centrale registratie",
      idempotencyKey: "status-archived:test-key",
    })));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });
});
