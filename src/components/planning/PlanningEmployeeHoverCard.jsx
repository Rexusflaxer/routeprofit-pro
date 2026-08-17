import React from "react";

const CONTRACT_LABELS = {
  bepaalde_tijd: "Bepaalde tijd",
  onbepaalde_tijd: "Onbepaalde tijd",
  oproep: "Oproepcontract",
  stage: "Stage",
  uitzend: "Uitzendcontract",
  payroll: "Payroll",
  zzp: "ZZP",
};

function hours(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} uur` : "Niet vastgelegd";
}

export default function PlanningEmployeeHoverCard({ name, photoUrl, employee }) {
  const summary = employee?._planning_summary || {};
  const functionLabel = summary.functionLabel || employee?.cao_function_group || employee?.function_type || employee?.employee_type || "Niet vastgelegd";
  return (
    <div className="flex w-[340px] gap-3 p-1 text-popover-foreground">
      <div className="flex h-40 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
        {photoUrl ? <img src={photoUrl} alt={`Pasfoto van ${name}`} className="h-full w-full object-contain" /> : <span className="px-2 text-center text-[10px] text-muted-foreground">Geen pasfoto</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{functionLabel}</p>
        <dl className="mt-3 space-y-1.5 text-[11px]">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Ingepland in periode</dt><dd className="font-semibold">{hours(summary.scheduledHours)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Contract per week</dt><dd className="font-semibold">{hours(summary.contractHoursPerWeek)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Contract per loonperiode</dt><dd className="font-semibold">{hours(summary.contractHoursPerPayPeriod)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Contractvorm</dt><dd className="text-right font-semibold">{CONTRACT_LABELS[summary.contractForm] || "Niet vastgelegd"}</dd></div>
        </dl>
      </div>
    </div>
  );
}