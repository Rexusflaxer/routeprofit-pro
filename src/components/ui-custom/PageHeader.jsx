import React from "react";

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-4 flex min-h-11 flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[15px] font-semibold leading-5 text-foreground">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-3xl break-words text-[12px] leading-5 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
