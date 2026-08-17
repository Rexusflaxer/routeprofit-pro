import React, { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";

export default function PlanningHorizontalScrollbar({ targetRef }) {
  const [position, setPosition] = useState(0);
  const [maximum, setMaximum] = useState(0);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return undefined;

    const measure = () => {
      const nextMaximum = Math.max(0, target.scrollWidth - target.clientWidth);
      setMaximum(nextMaximum);
      setPosition(Math.min(target.scrollLeft, nextMaximum));
    };
    const handleScroll = () => setPosition(target.scrollLeft);
    const observer = new ResizeObserver(measure);

    observer.observe(target);
    if (target.firstElementChild) observer.observe(target.firstElementChild);
    target.addEventListener("scroll", handleScroll, { passive: true });
    measure();

    return () => {
      observer.disconnect();
      target.removeEventListener("scroll", handleScroll);
    };
  }, [targetRef]);

  if (maximum <= 0) return null;

  return (
    <div className="shrink-0 border-t border-border bg-card px-4 py-2" aria-label="Horizontaal door de planning schuiven">
      <Slider
        min={0}
        max={maximum}
        step={1}
        value={[Math.min(position, maximum)]}
        onValueChange={([nextPosition]) => {
          setPosition(nextPosition);
          targetRef.current?.scrollTo({ left: nextPosition, behavior: "auto" });
        }}
        aria-label="Planning naar links of rechts schuiven"
      />
    </div>
  );
}