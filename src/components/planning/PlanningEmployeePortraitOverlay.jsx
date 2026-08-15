import React from "react";
import { cn } from "@/lib/utils";

export default function PlanningEmployeePortraitOverlay({ photoUrl, embedded = false }) {
  if (!photoUrl) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-0 top-0 z-0 h-[40%] w-[37%] overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,black_35%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_35%)]"
    >
      <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_0%,black_55%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_55%,transparent_100%)]">
        <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
        <span className={cn(
          "absolute inset-0 bg-[linear-gradient(145deg,#0F172A_0%,#11294A_58%,#16335C_100%)] opacity-80",
          embedded && "bg-[linear-gradient(145deg,hsl(var(--card))_0%,hsl(var(--accent))_100%)]",
        )} />
      </div>
    </div>
  );
}