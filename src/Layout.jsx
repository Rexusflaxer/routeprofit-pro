import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import {
  LayoutDashboard, Users, Settings, Menu, X,
  CarFront, Smartphone, ClipboardList, Building2,
  Activity, CircleDot, Radio, ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeProvider, useTheme } from "next-themes";

const NAV_ITEMS = [
  { name: "Dashboard",            icon: LayoutDashboard, page: "Dashboard" },
  { name: "Bedrijven",            icon: Building2,       page: "Companies" },
  { name: "Surveillance",         icon: CarFront,        page: "MobileSurveillance" },
  { name: "Personeel",            icon: Users,           page: "Personnel" },
  { name: "Voertuigen",           icon: Settings,        page: "Vehicles" },
  { name: "Diensten",             icon: Smartphone,      page: "RouteExecutions" },
  { name: "Rapportages",          icon: ClipboardList,   page: "ReportTemplates" },
  { name: "Overig",               icon: Settings,        page: "CostSettings" },
  { name: "Instellingen",         icon: Settings,        page: "Settings" },
];

const LOGO_DARK = "/loq-logo-dark.png";
const LOGO_LIGHT = "/loq-logo-light.png";

function LOQLogo({ className = "h-6 w-auto" }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-6 w-12 bg-muted rounded animate-pulse" />;
  return (
    <img
      src={resolvedTheme === "dark" ? LOGO_LIGHT : LOGO_DARK}
      alt="LOQ"
      className={className}
    />
  );
}

function AppShell({ children, currentPageName }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigation = (
    <nav className="space-y-1">
      {NAV_ITEMS.map(item => {
        const isActive = currentPageName === item.page;
        return (
          <Link
            key={item.page}
            to={createPageUrl(item.page)}
            onClick={() => setMobileOpen(false)}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="border-b border-sidebar-border px-5 py-5">
          <Link to={createPageUrl("Dashboard")} className="inline-flex items-center">
            <LOQLogo className="h-7 w-auto" />
          </Link>
          <div className="mt-4 rounded-lg border border-sidebar-border bg-background/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Control Center</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Operationeel overzicht</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Activity className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
              <div className="rounded-md bg-card px-2 py-1.5">
                <CircleDot className="mx-auto mb-1 h-3.5 w-3.5 text-emerald-500" />
                Live
              </div>
              <div className="rounded-md bg-card px-2 py-1.5">
                <Radio className="mx-auto mb-1 h-3.5 w-3.5" />
                Sync
              </div>
              <div className="rounded-md bg-card px-2 py-1.5">
                <ShieldCheck className="mx-auto mb-1 h-3.5 w-3.5" />
                LOQ
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {navigation}
        </div>
        <div className="border-t border-sidebar-border p-4">
          <div className="rounded-lg bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            Objecten, diensten en rapportages in een helder overzicht.
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b border-sidebar-border bg-sidebar/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to={createPageUrl("Dashboard")} className="shrink-0">
            <LOQLogo className="h-6 w-auto" />
          </Link>
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {mobileOpen && (
          <div className="border-t border-sidebar-border bg-sidebar p-3">
            {navigation}
          </div>
        )}
      </header>

      <main className="min-h-screen lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AppShell currentPageName={currentPageName}>{children}</AppShell>
    </ThemeProvider>
  );
}
