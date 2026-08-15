import React from "react";
import { cn } from "@/lib/utils";

export default function PlanningEmployeePortraitOverlay({ photoUrl, embedded = false }) {
  if (!photoUrl) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-0 top-[10%] z-0 h-[46%] w-[40%] overflow-hidden [mask-image:radial-gradient(ellipse_at_100%_0%,black_0%,black_48%,transparent_84%)] [-webkit-mask-image:radial-gradient(ellipse_at_100%_0%,black_0%,black_48%,transparent_84%)]"
    >
      <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
      <span className={cn(
        "absolute inset-0 bg-[linear-gradient(145deg,#0F172A_0%,#11294A_58%,#16335C_100%)] opacity-80",
        embedded && "bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--accent))_100%)]",
      )} />
    </div>
  );
}