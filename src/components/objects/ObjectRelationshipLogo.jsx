import React, { useState } from "react";

export default function ObjectRelationshipLogo({ organization, className = "h-11 w-24" }) {
  const [failed, setFailed] = useState(false);
  const initials = String(organization?.name || "OR").split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm ${className}`}>
      {organization?.logo_url && !failed
        ? <img src={organization.logo_url} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-contain" />
        : <span className="text-xs font-bold tracking-wide text-muted-foreground">{initials}</span>}
    </span>
  );
}