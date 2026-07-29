import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/api/base44Client", () => ({
  base44: {
    functions: { invoke },
  },
}));

import CustomerPlatformWorkspace from "@/components/customers/CustomerPlatformWorkspace";

function renderWorkspace(
  initialEntry = "/Commercial?view=quote&status=approved&page=2&sort=-updated_date",
  workspace = "commercial",
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <CustomerPlatformWorkspace workspace={workspace} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CustomerPlatformWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000001") });
    invoke.mockResolvedValue({
      data: {
        items: [{
          id: "quote-1",
          customer_id: "customer-1",
          customer_name: "Acme Beveiliging",
          quote_number: "OFF-2026-0042",
          title: "Mobiele surveillance",
          total_cents: 125_000,
          currency: "EUR",
          status: "approved",
        }],
        total: 26,
        page: 2,
        page_size: 25,
        feature_flags: { commercial_contracts: true },
      },
    });
  });

  it("leest de URL en vraagt de server gepagineerd om commerciële records", async () => {
    renderWorkspace();

    expect(await screen.findAllByText("OFF-2026-0042")).not.toHaveLength(0);
    expect(screen.getAllByText("Acme Beveiliging").length).toBeGreaterThan(0);
    expect(screen.getByText("26")).toBeInTheDocument();

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("customerPlatformApi", expect.objectContaining({
        action: "list_commercial",
        view: "quote",
        status: "approved",
        page: 2,
        page_size: 25,
        sort: "-updated_date",
      }));
    });
  });

  it("toont een feature-gate zonder een directe entityfallback te doen", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        items: [],
        total: 0,
        page: 1,
        page_size: 25,
        feature_flags: { commercial_contracts: false },
      },
    });
    renderWorkspace("/Commercial?view=contract");
    expect(await screen.findByText("Commercie is uitgeschakeld")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("maakt een conceptofferte met een stabiele mutatie-envelop", async () => {
    invoke.mockImplementation((_functionName, payload) => {
      if (payload.action === "create_quote") {
        return Promise.resolve({ data: { ok: true, quote: { id: "quote-new" } } });
      }
      return Promise.resolve({
        data: {
          items: [],
          total: 0,
          page: 1,
          page_size: 25,
          feature_flags: { commercial_contracts: true },
        },
      });
    });
    renderWorkspace("/Commercial?view=quote&customer_id=customer-1&customer_account_id=account-1&company_id=company-1");

    const createQuoteButton = await screen.findByRole("button", { name: /Nieuwe offerte/i });
    await waitFor(() => expect(createQuoteButton).toBeEnabled());
    fireEvent.click(createQuoteButton);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "Mobiele surveillance 2027" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Concept maken/i }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("customerPlatformApi", expect.objectContaining({
        action: "create_quote",
        idempotency_key: "create_quote:00000000-0000-4000-8000-000000000001",
        expected_version: 0,
        customer_id: "customer-1",
        data: expect.objectContaining({
          customer_account_id: "account-1",
          title: "Mobiele surveillance 2027",
        }),
      }));
    });
  });

  it("maakt van geselecteerde goedgekeurde regels alleen een conceptfactuur", async () => {
    const candidate = {
      id: "candidate-1",
      company_id: "company-1",
      customer_id: "customer-1",
      customer_account_id: "account-1",
      description: "Surveillanceronde",
      status: "approved",
      version: 4,
      total_cents: 12_500,
      currency: "EUR",
    };
    invoke.mockImplementation((_functionName, payload) => {
      if (payload.action === "create_invoice_draft") {
        return Promise.resolve({ data: { ok: true, invoice: { id: "invoice-1" } } });
      }
      return Promise.resolve({
        data: {
          items: payload.view === "candidate" ? [candidate] : [],
          total: payload.view === "candidate" ? 1 : 0,
          page: 1,
          page_size: 25,
          feature_flags: { billing_shadow: true },
        },
      });
    });
    renderWorkspace("/Billing?view=candidate&customer_id=customer-1&company_id=company-1", "billing");

    const candidateCheckboxes = await screen.findAllByRole("checkbox", { name: /Surveillanceronde selecteren/i });
    fireEvent.click(candidateCheckboxes[0]);
    fireEvent.click(screen.getByRole("button", { name: /Conceptfactuur maken/i }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("customerPlatformApi", {
        action: "create_invoice_draft",
        idempotency_key: "create_invoice_draft:00000000-0000-4000-8000-000000000001",
        expected_version: 0,
        billing_candidate_ids: ["candidate-1"],
        candidate_expected_versions: { "candidate-1": 4 },
      });
    });
    expect(invoke.mock.calls.some(([, payload]) => payload.action === "issue_invoice")).toBe(false);
  });
});
