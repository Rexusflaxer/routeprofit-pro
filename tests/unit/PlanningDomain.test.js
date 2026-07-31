import { describe, expect, it } from "vitest";
import {
  PLANNING_WARNING_CODES,
  addDays,
  buildCandidateRanking,
  formatMinutesAsHours,
  getAssignmentWarnings,
  getPlanningRange,
  getShiftDurationMinutes,
  getShiftInterval,
  parseDateKey,
  rangesOverlap,
  splitIntoWeeks,
  startOfWeek,
  toDateKey,
} from "@/components/planning/planningDomain";

const targetShift = {
  id: "shift-target",
  name: "Nachtdienst Museum",
  service_date: "2026-02-04",
  start_time: "22:00",
  end_time: "06:00",
  company_id: "company-1",
  customer_id: "customer-1",
  object_id: "object-1",
  object_name: "Stadsmuseum",
  required_qualification_types: ["beveiliger_2"],
};

const person = {
  id: "person-1",
  name: "Ada Agent",
  status: "active",
};

const validQualification = {
  id: "qualification-1",
  personnel_id: person.id,
  company_id: "company-1",
  qualification_type: "beveiliger_2",
  name: "Beveiliger 2",
  verification_status: "verified",
  valid_from: "2025-01-01",
  valid_until: "2027-12-31",
};

const validPass = {
  id: "pass-1",
  personnel_id: person.id,
  company_id: "company-1",
  pass_type: "green",
  status: "active",
  valid_from: "2025-01-01",
  valid_until: "2027-12-31",
};

const validContract = {
  id: "contract-1",
  personnel_id: person.id,
  company_id: "company-1",
  document_status: "active",
  contract_start_date: "2025-01-01",
  contract_end_date: "2027-12-31",
  contract_hours_per_week: 36,
};

function warningContext(overrides = {}) {
  return {
    personnel: person,
    shift: targetShift,
    qualifications: [validQualification],
    securityPasses: [validPass],
    contracts: [validContract],
    absences: [],
    restrictions: [],
    assignments: [],
    shifts: [],
    ...overrides,
  };
}

function warningCodes(warnings) {
  return warnings.map(item => item.code);
}

describe("lokale planningsdatums", () => {
  it("navigeert kalenderdagen veilig over de zomertijdovergang", () => {
    const transitionSunday = parseDateKey("2026-03-29");
    expect(toDateKey(transitionSunday)).toBe("2026-03-29");
    expect(toDateKey(addDays(transitionSunday, 1))).toBe("2026-03-30");
    expect(toDateKey(addDays(transitionSunday, -1))).toBe("2026-03-28");
  });

  it("bouwt maandag-gebaseerde dag-, week- en vierwekenranges", () => {
    expect(toDateKey(startOfWeek("2026-02-05"))).toBe("2026-02-02");

    const day = getPlanningRange("2026-02-05", "day");
    expect(day.days.map(toDateKey)).toEqual(["2026-02-05"]);
    expect(toDateKey(day.start)).toBe("2026-02-05");
    expect(toDateKey(day.end)).toBe("2026-02-05");

    const week = getPlanningRange("2026-02-05", "week");
    expect(week.days).toHaveLength(7);
    expect(toDateKey(week.start)).toBe("2026-02-02");
    expect(toDateKey(week.end)).toBe("2026-02-08");

    const fourWeeks = getPlanningRange("2026-02-05", "four_weeks");
    expect(fourWeeks.days).toHaveLength(28);
    expect(toDateKey(fourWeeks.end)).toBe("2026-03-01");
    expect(splitIntoWeeks(fourWeeks)).toHaveLength(4);
    expect(splitIntoWeeks(fourWeeks).every(days => days.length === 7)).toBe(true);
  });
});

describe("dienstintervallen", () => {
  it("behandelt een eindtijd voor de starttijd als een nachtdienst", () => {
    const interval = getShiftInterval(targetShift);
    expect(interval.valid).toBe(true);
    expect(interval.overnight).toBe(true);
    expect(toDateKey(interval.start)).toBe("2026-02-04");
    expect(toDateKey(interval.end)).toBe("2026-02-05");
    expect(getShiftDurationMinutes(targetShift)).toBe(8 * 60);
  });

  it("gebruikt halfopen ranges voor overlap", () => {
    const first = getShiftInterval({
      service_date: "2026-02-04",
      start_time: "10:00",
      end_time: "12:00",
    });
    const overlap = getShiftInterval({
      service_date: "2026-02-04",
      start_time: "11:30",
      end_time: "13:00",
    });
    const adjacent = getShiftInterval({
      service_date: "2026-02-04",
      start_time: "12:00",
      end_time: "13:00",
    });

    expect(rangesOverlap(first, overlap)).toBe(true);
    expect(rangesOverlap(first, adjacent)).toBe(false);
    expect(rangesOverlap(first.start, first.end, overlap.start, overlap.end)).toBe(true);
  });
});

describe("toewijzingswaarschuwingen", () => {
  it("signaleert goedgekeurde afwezigheid", () => {
    const warnings = getAssignmentWarnings(warningContext({
      absences: [{
        personnel_id: person.id,
        absence_type: "leave",
        status: "approved",
        start_date: "2026-02-04",
        end_date: "2026-02-04",
      }],
    }));

    expect(warnings).toContainEqual(expect.objectContaining({
      code: PLANNING_WARNING_CODES.ABSENCE_ACTIVE,
      severity: "critical",
    }));
  });

  it("onderscheidt ontbrekende, verlopen en niet-gevalideerde kwalificaties", () => {
    const missing = getAssignmentWarnings(warningContext({ qualifications: [] }));
    expect(warningCodes(missing)).toContain(PLANNING_WARNING_CODES.QUALIFICATION_MISSING);

    const expired = getAssignmentWarnings(warningContext({
      qualifications: [{ ...validQualification, valid_until: "2026-02-03" }],
    }));
    expect(warningCodes(expired)).toContain(PLANNING_WARNING_CODES.QUALIFICATION_EXPIRED);

    const unverified = getAssignmentWarnings(warningContext({
      qualifications: [{ ...validQualification, verification_status: "pending_review" }],
    }));
    expect(warningCodes(unverified)).toContain(PLANNING_WARNING_CODES.QUALIFICATION_UNVERIFIED);
  });

  it("signaleert een ontbrekende en een verlopen beveiligingspas", () => {
    const missing = getAssignmentWarnings(warningContext({ securityPasses: [] }));
    expect(warningCodes(missing)).toContain(PLANNING_WARNING_CODES.SECURITY_PASS_MISSING);

    const expired = getAssignmentWarnings(warningContext({
      securityPasses: [{ ...validPass, status: "expired", valid_until: "2026-02-03" }],
    }));
    expect(warningCodes(expired)).toContain(PLANNING_WARNING_CODES.SECURITY_PASS_EXPIRED);
  });

  it("past restricties toe via scope-id en gebruikt anders het scopelabel", () => {
    const byId = getAssignmentWarnings(warningContext({
      restrictions: [{
        personnel_id: person.id,
        scope_type: "object",
        scope_id: "object-1",
        scope_label: "Oud label dat niet meer overeenkomt",
        may_work: false,
        status: "active",
        reason: "Geen objectautorisatie",
      }],
    }));
    expect(warningCodes(byId)).toContain(PLANNING_WARNING_CODES.RESTRICTION_BLOCKED);

    const byLabel = getAssignmentWarnings(warningContext({
      restrictions: [{
        personnel_id: person.id,
        scope_type: "object",
        scope_label: "Stadsmuseum",
        may_work: false,
        status: "active",
      }],
    }));
    expect(warningCodes(byLabel)).toContain(PLANNING_WARNING_CODES.RESTRICTION_BLOCKED);

    const idTakesPrecedence = getAssignmentWarnings(warningContext({
      restrictions: [{
        personnel_id: person.id,
        scope_type: "object",
        scope_id: "other-object",
        scope_label: "Stadsmuseum",
        may_work: false,
        status: "active",
      }],
    }));
    expect(warningCodes(idTakesPrecedence)).not.toContain(PLANNING_WARNING_CODES.RESTRICTION_BLOCKED);
  });

  it("signaleert dubbele inzet en te korte rust", () => {
    const shifts = [
      {
        id: "overlap",
        name: "Andere nachtdienst",
        service_date: "2026-02-04",
        start_time: "23:00",
        end_time: "01:00",
      },
      {
        id: "before",
        service_date: "2026-02-04",
        start_time: "14:00",
        end_time: "18:00",
      },
    ];
    const assignments = shifts.map(shift => ({
      id: `assignment-${shift.id}`,
      personnel_id: person.id,
      shift_id: shift.id,
      status: "published",
    }));

    const warnings = getAssignmentWarnings(warningContext({ shifts, assignments }));
    expect(warningCodes(warnings)).toContain(PLANNING_WARNING_CODES.DOUBLE_BOOKING);
    expect(warningCodes(warnings)).toContain(PLANNING_WARNING_CODES.INSUFFICIENT_REST);
  });

  it("signaleert ontbrekend contract en overschrijding van weekuren", () => {
    const noContract = getAssignmentWarnings(warningContext({ contracts: [] }));
    expect(warningCodes(noContract)).toContain(PLANNING_WARNING_CODES.CONTRACT_MISSING);

    const shifts = Array.from({ length: 4 }, (_, index) => ({
      id: `day-${index}`,
      service_date: `2026-02-0${2 + index}`,
      start_time: "08:00",
      end_time: "16:00",
    }));
    const assignments = shifts.map(shift => ({
      personnel_id: person.id,
      shift_id: shift.id,
      status: "published",
    }));
    const overHours = getAssignmentWarnings(warningContext({ shifts, assignments }));
    expect(warningCodes(overHours)).toContain(PLANNING_WARNING_CODES.CONTRACT_HOURS_EXCEEDED);
  });
});

describe("kandidaatvolgorde", () => {
  it("behoudt alle kandidaten en zet de kandidaat met de minste conflicten bovenaan", () => {
    const secondPerson = {
      id: "person-2",
      name: "Bram Zonder Papieren",
      status: "active",
    };
    const ranking = buildCandidateRanking({
      personnel: [secondPerson, person],
      shift: targetShift,
      qualifications: [validQualification],
      securityPasses: [validPass],
      contracts: [validContract],
      assignments: [],
      shifts: [],
    });

    expect(ranking).toHaveLength(2);
    expect(ranking[0]).toEqual(expect.objectContaining({
      personnel: person,
      criticalCount: 0,
      warningCount: 0,
      scheduledMinutes: 8 * 60,
      contractMinutes: 36 * 60,
    }));
    expect(ranking[1].personnel).toBe(secondPerson);
    expect(ranking[1].criticalCount).toBeGreaterThan(0);
    expect(ranking[0].score).toBeGreaterThan(ranking[1].score);
  });

  it("formatteert geplande minuten compact", () => {
    expect(formatMinutesAsHours(0)).toBe("0u");
    expect(formatMinutesAsHours(480)).toBe("8u");
    expect(formatMinutesAsHours(510)).toBe("8u 30m");
  });
});
