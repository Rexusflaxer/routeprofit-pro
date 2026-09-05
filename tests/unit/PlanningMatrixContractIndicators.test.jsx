import React from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PlanningBoard from "@/components/planning/PlanningBoard";
import {
  customerTaskContractIndicatorState,
  employmentContractIndicatorState,
} from "@/components/planning/PlanningMatrix";

const serviceDay = new Date(2026, 8, 7, 12);
const resolvedCustomerRoute = {
  selling_company_id: "company-a",
  customer_contract_id: "customer-contract-1",
  customer_contract_line_id: "contract-line-1",
  commercial_routing_status: "resolved",
  commercial_routing_snapshot: {
    schema_version: 1,
    status: "resolved",
    candidate_count: 1,
    customer_id: "customer-1",
    object_id: "object-1",
    task_type_key: "reception",
    service_date: "2026-09-07",
    end_date: "2026-09-07",
    selling_company_id: "company-a",
    customer_contract_id: "customer-contract-1",
    customer_contract_version: 3,
    customer_contract_line_id: "contract-line-1",
    customer_contract_line_version: 2,
  },
};

function occurrence(overrides = {}) {
  return {
    id: "occurrence-contract-routing",
    object_task_definition_id: "definition-contract-routing",
    revision: 1,
    lifecycle_status: "active",
    service_date: "2026-09-07",
    end_date: "2026-09-07",
    window_start_time: "06:30",
    window_end_time: "18:00",
    required_minutes: 690,
    execution_mode: "continuous",
    task_name_snapshot: "Receptiedienst",
    task_type: "reception",
    task_type_key: "reception",
    customer_id: "customer-1",
    object_id: "object-1",
    ...overrides,
  };
}

function plannedRecords({ occurrenceOverrides = {}, assignmentOverrides = {} } = {}) {
  const taskOccurrence = occurrence(occurrenceOverrides);
  const shift = {
    id: "shift-contract-routing",
    name: "Receptiedienst",
    source_type: "task",
    source_id: taskOccurrence.id,
    service_date: taskOccurrence.service_date,
    start_time: "06:30",
    end_time: "18:00",
    required_count: 1,
    status: "draft",
    object_id: taskOccurrence.object_id,
    object_ids: [taskOccurrence.object_id],
    selling_company_id: taskOccurrence.selling_company_id || null,
    customer_contract_id: taskOccurrence.customer_contract_id || null,
    customer_contract_line_id: taskOccurrence.customer_contract_line_id || null,
  };
  const segment = {
    id: "segment-contract-routing",
    shift_id: shift.id,
    task_occurrence_id: taskOccurrence.id,
    object_id: taskOccurrence.object_id,
    start_date: taskOccurrence.service_date,
    end_date: taskOccurrence.end_date,
    start_time: "06:30",
    end_time: "18:00",
    status: "draft",
    customer_id: taskOccurrence.customer_id || null,
    task_type: taskOccurrence.task_type,
    task_type_key: taskOccurrence.task_type_key,
    selling_company_id: taskOccurrence.selling_company_id || null,
    customer_contract_id: taskOccurrence.customer_contract_id || null,
    customer_contract_line_id: taskOccurrence.customer_contract_line_id || null,
    commercial_routing_status: taskOccurrence.commercial_routing_status || null,
    commercial_routing_snapshot: taskOccurrence.commercial_routing_snapshot || null,
  };
  const assignment = {
    id: "assignment-contract-routing",
    planning_shift_id: shift.id,
    shift_id: shift.id,
    personnel_id: "personnel-1",
    personnel_name: "Anna Beveiliger",
    slot_index: 0,
    status: "draft",
    warning_snapshot: [],
    ...assignmentOverrides,
  };
  return { taskOccurrence, shift, segment, assignment };
}

const employmentIndicatorContext = {
  shift: {
    id: "shift-contract-routing",
    service_date: "2026-09-07",
    end_date: "2026-09-07",
    object_id: "object-1",
    object_ids: ["object-1"],
    service_context_snapshot: {
      task_type_key: "reception",
      required_task_types: ["reception"],
    },
  },
};

function resolvedEmploymentDecision(overrides = {}) {
  return {
    service_date: "2026-09-07",
    object_id: "object-1",
    employment_routing_status: "resolved",
    contract_selection_policy: "personnel_interval_task_scope_unique",
    contract_resolution_status: "resolved",
    decision_inputs: { contract_resolution_validated: true },
    service_context_readiness: {
      has_canonical_task_context: true,
      required_task_type_keys: ["reception"],
    },
    contract_id: "personnel-contract-1",
    employing_company_id: "company-b",
    payroll_cao_key: "cao_particuliere_beveiliging",
    ...overrides,
  };
}

function renderBoard(overrides = {}) {
  const props = {
    perspective: "object",
    editable: true,
    view: "week",
    days: [serviceDay],
    weeks: [[serviceDay]],
    shifts: [],
    assignments: [],
    segments: [],
    occurrences: [occurrence()],
    personnel: [{ id: "personnel-1", name: "Anna Beveiliger", status: "active" }],
    objects: [{ id: "object-1", name: "Object 1", status: "active" }],
    routes: [],
    customers: [{ id: "customer-1", name: "Klant 1" }],
    selectedShiftId: null,
    onSelectOccurrence: vi.fn(),
    onSelectShift: vi.fn(),
    onUnassign: vi.fn(),
    onMove: vi.fn(),
    onCopy: vi.fn(),
    onEditComposition: vi.fn(),
    onCancelComposition: vi.fn(),
    taskOccurrenceCount: 1,
    isLoading: false,
    ...overrides,
  };
  return render(
    <DragDropContext onDragEnd={vi.fn()}>
      <PlanningBoard {...props} />
    </DragDropContext>,
  );
}

describe("Planning matrix contractkoppelingen", () => {
  it("toont een ontbrekend klantcontract direct op een open taak en verbergt dit na koppeling", () => {
    const missing = renderBoard();

    const indicator = screen.getByText("Klantcontract koppelen").closest("[data-contract-routing-indicator]");
    expect(indicator).toHaveAttribute("data-contract-routing-indicator", "customer");
    expect(indicator).toHaveAttribute("data-routing-state", "missing");

    missing.unmount();
    renderBoard({
      occurrences: [occurrence(resolvedCustomerRoute)],
    });
    expect(screen.queryByText("Klantcontract koppelen")).not.toBeInTheDocument();
  });

  it("laat een actueel occurrence-bewijs leiden boven oude commerciele shift- en segmentvelden", () => {
    const currentOccurrence = occurrence(resolvedCustomerRoute);
    const staleShift = {
      id: "shift-stale-commercial-snapshot",
      source_type: "task",
      customer_id: currentOccurrence.customer_id,
      object_id: currentOccurrence.object_id,
      commercial_routing_status: "missing_contract",
    };
    const staleSegment = {
      id: "segment-stale-commercial-snapshot",
      shift_id: staleShift.id,
      task_occurrence_id: currentOccurrence.id,
      object_task_definition_id: currentOccurrence.object_task_definition_id,
      customer_id: currentOccurrence.customer_id,
      object_id: currentOccurrence.object_id,
      task_type_key: currentOccurrence.task_type_key,
      start_date: currentOccurrence.service_date,
      end_date: currentOccurrence.end_date,
      status: "draft",
      commercial_routing_status: "missing_contract",
    };

    expect(customerTaskContractIndicatorState({
      occurrence: currentOccurrence,
      shift: staleShift,
      segments: [staleSegment],
    })).toBe("resolved");
  });

  it("houdt een operationele segmentafwijking zichtbaar ondanks een geldig contractbewijs", () => {
    const currentOccurrence = occurrence(resolvedCustomerRoute);
    expect(customerTaskContractIndicatorState({
      occurrence: currentOccurrence,
      segments: [{
        id: "segment-wrong-object",
        task_occurrence_id: currentOccurrence.id,
        object_task_definition_id: currentOccurrence.object_task_definition_id,
        customer_id: currentOccurrence.customer_id,
        object_id: "object-elsewhere",
        task_type_key: currentOccurrence.task_type_key,
        start_date: currentOccurrence.service_date,
        end_date: currentOccurrence.end_date,
        status: "draft",
        commercial_routing_status: "missing_contract",
      }],
    })).toBe("attention");
  });

  it("houdt een losse contractregel zonder contract en verkopend bedrijf zichtbaar onvolledig", () => {
    expect(customerTaskContractIndicatorState({
      occurrence: occurrence({ customer_contract_line_id: "contract-line-1" }),
    })).toBe("missing");
  });

  it("toont ook voor een route met klantcontext zonder bewezen contract een koppelsignaal", () => {
    expect(customerTaskContractIndicatorState({
      shift: {
        source_type: "route",
        customer_id: "customer-1",
        customer_ids: ["customer-1"],
      },
    })).toBe("missing");
  });

  it("vertrouwt een contractlijn niet wanneer de commerciele routeringsstatus nog ontbrekend is", () => {
    renderBoard({
      occurrences: [occurrence({
        customer_contract_line_id: "contract-line-1",
        commercial_routing_status: "missing_contract",
      })],
    });

    expect(screen.getByText("Klantcontract koppelen").closest("[data-contract-routing-indicator]"))
      .toHaveAttribute("data-routing-state", "missing");
  });

  it("vertrouwt een interne taak alleen met geldig not_applicable-bewijs", () => {
    renderBoard({
      occurrences: [occurrence({
        customer_id: null,
        customer_name_snapshot: null,
        commercial_routing_status: "not_applicable",
        commercial_routing_snapshot: {
          schema_version: 1,
          status: "not_applicable",
          reason: "explicit_internal_non_billable",
          customer_billable: false,
          candidate_count: 0,
          evidence_shift_ids: ["shift-internal"],
          evidence_segment_ids: ["segment-internal"],
        },
      })],
    });

    expect(screen.queryByText("Klantcontract koppelen")).not.toBeInTheDocument();
  });

  it("markeert een geplande interne taak zonder bewijs voor controle", () => {
    const { taskOccurrence, shift, segment, assignment } = plannedRecords({
      occurrenceOverrides: { customer_id: null },
    });
    renderBoard({
      occurrences: [taskOccurrence],
      shifts: [shift],
      segments: [segment],
      assignments: [assignment],
    });

    expect(screen.queryByText("Klantcontract koppelen")).not.toBeInTheDocument();
    expect(screen.getByText("Klantcontract controleren")).toBeInTheDocument();
  });

  it("toont de ontbrekende arbeidscontractbewijzen zonder de conceptdienst te blokkeren", () => {
    const { taskOccurrence, shift, segment, assignment } = plannedRecords({
      occurrenceOverrides: resolvedCustomerRoute,
    });
    renderBoard({
      occurrences: [taskOccurrence],
      shifts: [shift],
      segments: [segment],
      assignments: [assignment],
    });

    const indicator = screen.getByText("Arbeidscontract koppelen").closest("[data-contract-routing-indicator]");
    expect(indicator).toHaveAttribute("data-routing-state", "missing");
    expect(indicator).toHaveClass("bg-amber-100/95");
    expect(screen.getByRole("button", { name: "Anna Beveiliger" })).toBeEnabled();
    expect(screen.queryByText("Klantcontract koppelen")).not.toBeInTheDocument();
  });

  it("verbergt de arbeidscontractindicatie pas wanneer alle drie bewijzen aanwezig zijn", () => {
    const { taskOccurrence, shift, segment, assignment } = plannedRecords({
      occurrenceOverrides: resolvedCustomerRoute,
      assignmentOverrides: {
        personnel_contract_id: "personnel-contract-1",
        employing_company_id: "company-b",
        payroll_cao_key: "cao_particuliere_beveiliging",
        employment_routing_status: "resolved",
        contract_routing_snapshot: resolvedEmploymentDecision(),
      },
    });
    renderBoard({
      occurrences: [taskOccurrence],
      shifts: [shift],
      segments: [segment],
      assignments: [assignment],
    });

    expect(screen.queryByText("Arbeidscontract koppelen")).not.toBeInTheDocument();
    expect(screen.queryByText("Arbeidscontract controleren")).not.toBeInTheDocument();
  });

  it("houdt een resolved klantbewijs van een andere taak, object, datum of contractversie zichtbaar voor controle", () => {
    expect(customerTaskContractIndicatorState({
      occurrence: occurrence({
        ...resolvedCustomerRoute,
        commercial_routing_snapshot: {
          ...resolvedCustomerRoute.commercial_routing_snapshot,
          object_id: "object-elsewhere",
        },
      }),
    })).toBe("attention");
    expect(customerTaskContractIndicatorState({
      occurrence: occurrence({
        ...resolvedCustomerRoute,
        commercial_routing_snapshot: {
          ...resolvedCustomerRoute.commercial_routing_snapshot,
          task_type_key: "fire_watch",
        },
      }),
    })).toBe("attention");
    expect(customerTaskContractIndicatorState({
      occurrence: occurrence({
        ...resolvedCustomerRoute,
        commercial_routing_snapshot: {
          ...resolvedCustomerRoute.commercial_routing_snapshot,
          service_date: "2026-09-06",
          end_date: "2026-09-06",
        },
      }),
    })).toBe("attention");
    expect(customerTaskContractIndicatorState({
      occurrence: occurrence({
        ...resolvedCustomerRoute,
        commercial_routing_snapshot: {
          ...resolvedCustomerRoute.commercial_routing_snapshot,
          customer_contract_line_version: null,
        },
      }),
    })).toBe("attention");
  });

  it("houdt een resolved arbeidsbewijs van een andere taak, object of datum zichtbaar voor controle", () => {
    const assignment = {
      personnel_contract_id: "personnel-contract-1",
      employing_company_id: "company-b",
      payroll_cao_key: "cao_particuliere_beveiliging",
      employment_routing_status: "resolved",
    };
    expect(employmentContractIndicatorState({
      ...assignment,
      contract_routing_snapshot: resolvedEmploymentDecision({ object_id: "object-elsewhere" }),
    }, employmentIndicatorContext)).toBe("attention");
    expect(employmentContractIndicatorState({
      ...assignment,
      contract_routing_snapshot: resolvedEmploymentDecision({
        service_context_readiness: {
          has_canonical_task_context: true,
          required_task_type_keys: ["fire_watch"],
        },
      }),
    }, employmentIndicatorContext)).toBe("attention");
    expect(employmentContractIndicatorState({
      ...assignment,
      contract_routing_snapshot: resolvedEmploymentDecision({ service_date: "2026-09-06" }),
    }, employmentIndicatorContext)).toBe("attention");
  });

  it("houdt ambigue klant- en arbeidsroutering zichtbaar ernstiger dan ontbrekende koppelingen", () => {
    const { taskOccurrence, shift, segment, assignment } = plannedRecords({
      occurrenceOverrides: {
        commercial_routing_status: "ambiguous",
      },
      assignmentOverrides: {
        warning_snapshot: [{
          code: "contract_ambiguous",
          severity: "critical",
          title: "Arbeidscontract controleren",
          detail: "Meerdere arbeidscontracten dekken dezelfde taaksoort en datum.",
        }],
      },
    });
    renderBoard({
      occurrences: [taskOccurrence],
      shifts: [shift],
      segments: [segment],
      assignments: [assignment],
    });

    const customerIndicator = screen.getByText("Klantcontract controleren")
      .closest("[data-contract-routing-indicator]");
    const employmentIndicator = screen.getByText("Arbeidscontract controleren")
      .closest("[data-contract-routing-indicator]");
    expect(customerIndicator).toHaveAttribute("data-routing-state", "attention");
    expect(employmentIndicator).toHaveAttribute("data-routing-state", "attention");
    expect(customerIndicator).toHaveClass("bg-rose-100/95");
    expect(employmentIndicator).toHaveClass("bg-rose-100/95");
    expect(screen.queryByText("Klantcontract koppelen")).not.toBeInTheDocument();
    expect(screen.queryByText("Arbeidscontract koppelen")).not.toBeInTheDocument();
  });

  it("onderscheidt ontbrekende van geblokkeerde en geneste arbeidscontractroutering", () => {
    const completeEvidence = {
      personnel_contract_id: "contract-1",
      employing_company_id: "company-b",
      payroll_cao_key: "cao_particuliere_beveiliging",
      employment_routing_status: "resolved",
      contract_routing_snapshot: resolvedEmploymentDecision({
        contract_id: "contract-1",
      }),
    };
    expect(employmentContractIndicatorState({
      ...completeEvidence,
      employment_routing_status: "missing_contract",
    })).toBe("missing");
    expect(employmentContractIndicatorState({
      ...completeEvidence,
      employment_routing_status: "blocked",
    })).toBe("attention");
    expect(employmentContractIndicatorState({
      employment_routing_status: "not_final",
    })).toBe("attention");
    expect(employmentContractIndicatorState({
      ...completeEvidence,
      employment_routing_status: "stale",
    })).toBe("attention");
    expect(employmentContractIndicatorState({
      contract_routing_snapshot: {
        decisions: [{
          service_date: "2026-09-07",
          decision: { decision_status: "ambiguous" },
        }],
      },
    })).toBe("attention");
    expect(employmentContractIndicatorState({
      warning_snapshot: [{
        code: "contract_ambiguous",
        severity: "critical",
      }],
    })).toBe("attention");
    expect(employmentContractIndicatorState({
      warning_snapshot: [{
        code: "contract_missing",
        severity: "critical",
        title: "Arbeidscontract koppelen",
      }],
    })).toBe("missing");
    expect(employmentContractIndicatorState({
      employment_routing_status: "missing_contract",
      warning_snapshot: [{
        code: "contract_cao_blocking_2026_09_07_1",
        severity: "critical",
        message: "Geen actief arbeidscontract gevonden voor de volledige dienstperiode.",
      }],
    })).toBe("missing");
    expect(employmentContractIndicatorState({
      ...completeEvidence,
      commercial_routing_status: "ambiguous",
    }, employmentIndicatorContext)).toBe("resolved");
  });

  it.each(["missing_contract", "stale"])(
    "beoordeelt status %s vóór een ontbrekende customer_id",
    commercialRoutingStatus => {
      expect(customerTaskContractIndicatorState({
        occurrence: occurrence({
          customer_id: null,
          customer_name_snapshot: null,
          commercial_routing_status: commercialRoutingStatus,
        }),
      })).toBe(commercialRoutingStatus === "missing_contract" ? "missing" : "attention");
    },
  );

  it("vertrouwt losse commerciële IDs nooit zonder expliciet resolved-bewijs", () => {
    expect(customerTaskContractIndicatorState({
      occurrence: occurrence(resolvedCustomerRoute),
    })).toBe("resolved");
    expect(customerTaskContractIndicatorState({
      occurrence: occurrence({
        selling_company_id: "company-a",
        customer_contract_id: "customer-contract-1",
        customer_contract_line_id: "contract-line-1",
      }),
    })).toBe("attention");
  });
});
