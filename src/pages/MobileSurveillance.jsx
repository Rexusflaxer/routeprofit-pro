import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { CalendarCheck, ChevronRight, Grid3X3, MapPin, Route, Users, Layers } from "lucide-react";

const TILES = [
  {
    label: "Klanten",
    description: "Beheer particulieren en bedrijven",
    icon: Users,
    metric: "Relaties",
    page: "Customers",
  },
  {
    label: "Objecten",
    description: "Bekijk en beheer alle surveillanceobjecten",
    icon: MapPin,
    page: "Objects",
    metric: "Locaties",
  },
  {
    label: "Collectieven",
    description: "Bedrijventerreinen, verzamelgebouwen en regio's",
    icon: Layers,
    page: "Collectief",
    metric: "Gebieden",
  },
  {
    label: "Routes",
    description: "Bekijk en beheer alle routes",
    icon: Route,
    metric: "Blauwdruk",
    page: "Routes",
  },
  {
    label: "Uitvoering",
    description: "Start routes vanuit de kalenderplanning",
    icon: CalendarCheck,
    metric: "Live",
    page: "Uitvoering",
  },
];

export default function MobileSurveillance() {
  return (
    <div className="space-y-4 text-[13px]">
      <div className="flex min-h-11 items-center justify-between border-b border-border pb-3">
        <div>
          <h1 className="text-[15px] font-semibold leading-5 text-foreground">Surveillance</h1>
          <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">Objecten, rondes en uitvoering in een beheerweergave.</p>
        </div>
        <div className="hidden items-center rounded-md border border-border bg-card p-0.5 sm:flex">
          <button className="flex h-7 items-center gap-1.5 rounded bg-[#1f7aff]/10 px-2.5 text-xs font-medium text-[#1f7aff]">
            <Grid3X3 className="h-3.5 w-3.5" />
            Modules
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[minmax(180px,1fr)_180px_minmax(220px,1.2fr)_42px] border-b border-border px-4 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
            <span>Name</span>
            <span>Category</span>
            <span>Description</span>
            <span />
          </div>
          {TILES.map(({ label, description, icon: Icon, page, metric }) => (
            <Link
              key={page}
              to={createPageUrl(page)}
              className="grid grid-cols-[minmax(180px,1fr)_180px_minmax(220px,1.2fr)_42px] items-center border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="truncate font-medium text-foreground">{label}</span>
              </div>
              <span className="text-muted-foreground">{metric}</span>
              <span className="truncate text-muted-foreground">{description}</span>
              <div className="flex justify-end">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
