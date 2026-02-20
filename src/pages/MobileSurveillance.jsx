import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { MapPin, Route, Users } from "lucide-react";

const TILES = [
  {
    label: "Klanten",
    description: "Beheer particulieren en bedrijven",
    icon: Users,
    color: "from-amber-500 to-amber-700",
    page: "Customers",
  },
  {
    label: "Objecten",
    description: "Bekijk en beheer alle surveillanceobjecten",
    icon: MapPin,
    page: "Objects",
    color: "from-blue-600 to-blue-700",
  },
  {
    label: "Routes",
    description: "Bekijk en beheer alle routes",
    icon: Route,
    color: "from-slate-700 to-slate-900",
    page: "Routes",
  },
];

export default function MobileSurveillance() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mobiele Surveillance</h1>
        <p className="text-slate-500 text-sm mt-1">Selecteer een categorie</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {TILES.map(({ label, description, icon: Icon, page, color }) => (
          <Link key={page} to={createPageUrl(page)}>
            <div className={`bg-gradient-to-br ${color} text-white rounded-2xl p-8 flex flex-col gap-4 shadow-lg hover:scale-[1.02] transition-transform cursor-pointer`}>
              <Icon className="w-10 h-10 opacity-90" />
              <div>
                <p className="text-xl font-bold">{label}</p>
                <p className="text-sm opacity-75 mt-1">{description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}