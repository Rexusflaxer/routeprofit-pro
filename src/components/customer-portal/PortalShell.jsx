import React from "react";
import { Building2, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PortalShell({
  customer,
  user,
  tabs,
  activeTab,
  onTabChange,
  onLogout,
  children,
}) {
  return (
    <div className="min-h-screen bg-[#f5f7fa] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              LOQ klantportaal
            </p>
            <p className="truncate text-sm font-semibold">
              {customer?.name || "Klantomgeving"}
            </p>
          </div>
          <div className="ml-auto hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm font-medium">{user?.full_name || user?.name || "Gebruiker"}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Uitloggen">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] grid-cols-1 md:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white md:min-h-[calc(100vh-4rem)] md:border-b-0 md:border-r">
          <div className="flex gap-1 overflow-x-auto p-3 md:block md:space-y-1 md:p-4">
            <div className="mb-4 hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 md:flex">
              <Building2 className="h-4 w-4 text-slate-500" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{customer?.legal_name || customer?.name}</p>
                <p className="truncate text-[11px] text-slate-500">{customer?.customer_number || "Klant"}</p>
              </div>
            </div>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors md:w-full",
                    activeTab === tab.id
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </aside>
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
