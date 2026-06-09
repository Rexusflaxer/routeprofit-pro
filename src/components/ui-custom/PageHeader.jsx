import React from "react";

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">LOQ Control Center</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
