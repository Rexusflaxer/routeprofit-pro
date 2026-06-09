import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { CalendarCheck, ChevronRight, MapPin, Route, Users, Layers } from "lucide-react";

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
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Object control</p>
        <h1 className="text-2xl font-semibold text-foreground">Surveillance</h1>
        <p className="mt-1 text-sm text-muted-foreground">Beheer objecten, rondes en uitvoering vanuit een compacte cockpit.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TILES.map(({ label, description, icon: Icon, page, metric }) => (
          <Link key={page} to={createPageUrl(page)}>
            <div className="group flex min-h-40 flex-col justify-between rounded-lg border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="rounded-lg bg-secondary p-3">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {metric}
                </span>
              </div>
              <div className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-foreground">{label}</p>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
              </div>
              <div className="mt-4 h-1 rounded-full bg-secondary">
                <div className="h-1 w-1/3 rounded-full bg-primary" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
