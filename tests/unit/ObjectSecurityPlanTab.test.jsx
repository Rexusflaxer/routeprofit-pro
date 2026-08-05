import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workflow = vi.hoisted(() => ({
  createObjectSecurityPlan: vi.fn(),
  createSecurityPlanMutationKey: vi.fn(action => `${action}:test-key`),
  listObjectSecurityPlans: vi.fn(),
  migrateLegacyObjectSecurityPlans: vi.fn(),
}));

vi.mock("@/components/objects/securityPlanWorkflow", () => workflow);

vi.mock("@/components/objects/SecurityPlanWorkspace", () => ({
  default: () => <div>Planwerkruimte</div>,
}));

vi.mock("@/components/objects/SecurityPlanWizard", () => ({
  default: () => <div>Planwizard</div>,
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import ObjectSecurityPlanTab from "@/components/objects/ObjectSecurityPlanTab";
import { SECURITY_PLAN_TASK_TYPES } from "@/components/objects/securityPlanConfig";

const object = {
  id: "object-saturn",
  customer_id: "customer-saturn",
  name: "Saturn Petcare",
  status: "active",
};

const firePlan = {
  id: "plan-friday",
  object_id: object.id,
  customer_id: object.customer_id,
  task_type: "fire_closing_round",
  custom_task_type: null,
  variant_name: "Volledige vrijdagronde",
  execution_mode: "round",
  status: "published",
  has_publication: true,
  has_draft: false,
  latest_revision_number: 3,
  updated_date: "2026-08-05T08:00:00.000Z",
  current_revision_summary: {
    duration_mode: "fixed",
    duration_minutes: 75,
    section_policy: "fixed",
    default_section_count: 8,
    allowed_section_count: 8,
    has_route: true,
  },
};

const receptionPlan = {
  ...firePlan,
  id: "plan-reception",
  task_type: "reception",
  variant_name: "Receptie werkdagen",
  execution_mode: "continuous_post",
};

const categorySummary = SECURITY_PLAN_TASK_TYPES.map(category => ({
  task_type: category.key,
  total: category.key === "fire_closing_round" ? 137 : 0,
  published: category.key === "fire_closing_round" ? 81 : 0,
  draft: category.key === "fire_closing_round" ? 56 : 0,
  attention: category.key === "fire_closing_round" ? 2 : 0,
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Huidige URL">{`${location.pathname}${location.search}`}</output>;
}

function renderTab(initialEntry = "/ObjectDetail?id=object-saturn&tab=security-plan", overrides = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const props = {
    object,
    view: "",
    selectedRow: null,
    searchTerm: "",
    onSearchChange: vi.fn(),
    page: 1,
    onPageChange: vi.fn(),
    onOpenCreate: vi.fn(),
    onOpenEdit: vi.fn(),
    onCloseView: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <ObjectSecurityPlanTab {...props} />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("ObjectSecurityPlanTab categorie-UX", () => {
  beforeEach(() => {
    Object.values(workflow).forEach(mock => mock.mockReset());
    workflow.createSecurityPlanMutationKey.mockImplementation(action => `${action}:test-key`);
    workflow.listObjectSecurityPlans.mockImplementation(async ({ taskType }) => {
      if (taskType === "fire_closing_round") return { items: [firePlan], total: 1, page: 1, page_size: 50 };
      if (taskType === "reception") return { items: [receptionPlan], total: 1, page: 1, page_size: 50 };
      return {
        items: [firePlan, receptionPlan],
        total: 2,
        page: 1,
        page_size: 100,
        category_summary: categorySummary,
        migration_required_count: 0,
      };
    });
  });

  it("toont op de landing alle twaalf categoriekaarten met de server-side aantallen", async () => {
    renderTab();

    expect(await screen.findByText("Kies het soort beveiligingsplan")).toBeInTheDocument();
    const categoryButtons = SECURITY_PLAN_TASK_TYPES.map(category =>
      screen.getByRole("button", { name: `${category.label} openen` }),
    );

    expect(categoryButtons).toHaveLength(12);
    expect(screen.getByText("137 uitvoeringsplannen")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("opent een categorie via de URL en toont uitsluitend de tabel van die categorie", async () => {
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Brand- & sluitronde openen" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("Volledige vrijdagronde")).not.toHaveLength(0);
    expect(screen.queryByText("Receptie werkdagen")).not.toBeInTheDocument();
    expect(screen.queryByText("Kies het soort beveiligingsplan")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Huidige URL")).toHaveTextContent("plan_type=fire_closing_round");
    await waitFor(() => expect(workflow.listObjectSecurityPlans).toHaveBeenCalledWith(expect.objectContaining({
      customerId: object.customer_id,
      objectId: object.id,
      taskType: "fire_closing_round",
    })));
  });

  it("wist bij teruggaan de categoriegebonden URL-state en behoudt de objectcontext", async () => {
    renderTab("/ObjectDetail?id=object-saturn&tab=security-plan&plan_type=fire_closing_round&query=deur&plan_status=draft&page=4&view=list&row=plan-friday&plan_tab=route");

    fireEvent.click(await screen.findByRole("button", { name: /Alle categorieën/i }));

    await waitFor(() => expect(screen.getByLabelText("Huidige URL")).toHaveTextContent(
      "/ObjectDetail?id=object-saturn&tab=security-plan",
    ));
    const url = screen.getByLabelText("Huidige URL").textContent;
    expect(url).not.toContain("plan_type=");
    expect(url).not.toContain("query=");
    expect(url).not.toContain("plan_status=");
    expect(url).not.toContain("page=");
    expect(url).not.toContain("view=");
    expect(url).not.toContain("row=");
    expect(url).not.toContain("plan_tab=");
    expect(await screen.findByText("Kies het soort beveiligingsplan")).toBeInTheDocument();
  });

  it("stuurt een onbekende categorie nooit door naar de plan-API of werkruimte", async () => {
    renderTab(
      "/ObjectDetail?id=object-saturn&tab=security-plan&plan_type=onbekend&view=edit&row=plan-friday",
      { view: "edit", selectedRow: "plan-friday" },
    );

    expect(screen.queryByText("Planwerkruimte")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Huidige URL")).toHaveTextContent(
      "/ObjectDetail?id=object-saturn&tab=security-plan",
    ));
    expect(workflow.listObjectSecurityPlans).not.toHaveBeenCalledWith(expect.objectContaining({ taskType: "onbekend" }));
  });
});
