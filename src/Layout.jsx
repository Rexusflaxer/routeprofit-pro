import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { LayoutDashboard, MapPin, Users, Route, Settings, Shield, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
  { name: "Objecten", icon: MapPin, page: "Objects" },
  { name: "Personeel", icon: Users, page: "Personnel" },
  { name: "Voertuigen", icon: Settings, page: "Vehicles" },
  { name: "Routes", icon: Route, page: "Routes" },
  { name: "Kosten", icon: Settings, page: "CostSettings" },
  { name: "Instellingen", icon: Settings, page: "Settings" },
];

export default function Layout({ children, currentPageName }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
      `}</style>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col bg-white border-r border-slate-200">
        <div className="flex items-center gap-3 px-6 py-6 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow-lg">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 tracking-tight">RouteCalc</h1>
            <p className="text-[10px] text-slate-400 font-medium">Surveillance planner</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(item => {
            const isActive = currentPageName === item.page;
            return (
              <Link key={item.page} to={createPageUrl(item.page)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-slate-900 text-white shadow-md"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}>
                <item.icon className={`w-4 h-4 ${isActive ? "text-amber-400" : ""}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-slate-100">
          <p className="text-[10px] text-slate-300 text-center">Route & Kosten Calculator v1.0</p>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
            <Shield className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-sm font-bold text-slate-900">RouteCalc</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div className="absolute top-14 left-0 right-0 bg-white border-b border-slate-200 p-3 space-y-1" onClick={e => e.stopPropagation()}>
            {NAV_ITEMS.map(item => {
              const isActive = currentPageName === item.page;
              return (
                <Link key={item.page} to={createPageUrl(item.page)} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                  isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}>
                  <item.icon className={`w-4 h-4 ${isActive ? "text-amber-400" : ""}`} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="lg:ml-64 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}