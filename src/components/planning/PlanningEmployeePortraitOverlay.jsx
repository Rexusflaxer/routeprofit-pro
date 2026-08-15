import React from "react";
import { cn } from "@/lib/utils";

const PORTRAIT_HEIGHT = 92;

export default function PlanningEmployeePortraitOverlay({ photoUrl, embedded = false }) {
  const rootRef = React.useRef(null);
  const [fits, setFits] = React.useState(true);

  React.useLayoutEffect(() => {
    const host = rootRef.current?.parentElement;
    if (!host) return undefined;

    const updateVisibility = () => setFits(host.clientHeight >= PORTRAIT_HEIGHT);
    updateVisibility();
    const observer = new ResizeObserver(updateVisibility);
    observer.observe(host);
    return () => observer.disconnect();
  }, [photoUrl]);

  if (!photoUrl || !fits) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none absolute right-0 top-0 z-0 h-[92px] w-[37%] overflow-hidden [mask-image:linear-gradient(to_right,transparent_0%,black_35%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_35%)]"
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