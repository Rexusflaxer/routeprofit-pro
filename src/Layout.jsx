import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import {
  LayoutDashboard, Users, Settings, Menu, X, CarFront, Smartphone,
  ClipboardList, Building2, Search, Grid3X3, Route, MapPin, CalendarCheck,
  FileText, SlidersHorizontal, ShieldCheck, Radio, PanelLeft,
  Database, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeProvider, useTheme } from "next-themes";

const LOGO_DARK = "/loq-logo-dark.png";
const LOGO_LIGHT = "/loq-logo-light.png";

const PRIMARY_NAV = [
  { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard", pages: ["Dashboard"] },
  { name: "Surveillance", icon: Grid3X3, page: "MobileSurveillance", pages: ["MobileSurveillance", "Customers", "Objects", "Collectief", "Routes", "Uitvoering"] },
  { name: "Diensten", icon: Smartphone, page: "RouteExecutions", pages: ["RouteExecutions", "RouteExecutionDetails"] },
  { name: "Rapportages", icon: ClipboardList, page: "ReportTemplates", pages: ["ReportTemplates"] },
  { name: "Beheer", icon: Settings, page: "Settings", pages: ["Settings", "CostSettings", "Vehicles", "Personnel", "Companies", "CompanyDetail", "EmployeePortal"] },
];

const CONTEXT_SECTIONS = [
  {
    label: "Control Center",
    items: [
      { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
      { name: "Bedrijven", icon: Building2, page: "Companies" },
      { name: "Personeel", icon: Users, page: "Personnel" },
    ],
  },
  {
    label: "Mobiele surveillance",
    items: [
      { name: "Klanten", icon: Users, page: "Customers" },
      { name: "Objecten", icon: MapPin, page: "Objects" },
      { name: "Collectieven", icon: Database, page: "Collectief" },
      { name: "Routes", icon: Route, page: "Routes" },
      { name: "Uitvoering", icon: CalendarCheck, page: "Uitvoering" },
      { name: "Diensten", icon: Smartphone, page: "RouteExecutions" },
    ],
  },
  {
    label: "Configuratie",
    items: [
      { name: "Rapportages", icon: FileText, page: "ReportTemplates" },
      { name: "Voertuigen", icon: CarFront, page: "Vehicles" },
      { name: "Kosten", icon: SlidersHorizontal, page: "CostSettings" },
      { name: "Instellingen", icon: Settings, page: "Settings" },
    ],
  },
];

function LOQLogo({ className = "h-5 w-auto" }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-4 w-9 rounded-sm bg-muted" />;

  return (
    <img
      src={resolvedTheme === "dark" ? LOGO_LIGHT : LOGO_DARK}
      alt="LOQ"
      className={className}
    />
  );
}

function isActive(currentPageName, item) {
  return item.page === currentPageName || item.pages?.includes(currentPageName);
}

function RailNav({ currentPageName }) {
  return (
    <nav className="flex flex-1 flex-col items-center gap-1 px-1.5 py-3">
      {PRIMARY_NAV.map(item => {
        const active = isActive(currentPageName, item);
        return (
          <Link
            key={item.name}
            to={createPageUrl(item.page)}
            title={item.name}
            aria-label={item.name}
            className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
              active
                ? "bg-[#1f7aff]/12 text-[#1f7aff]"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <item.icon className="h-[18px] w-[18px]" />
          </Link>
        );
      })}
    </nav>
  );
}

function ContextNavigation({ currentPageName, onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2">
          <LOQLogo className="h-5 w-auto max-w-[74px]" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium leading-none text-foreground">LOQ</p>
            <p className="mt-1 text-[11px] leading-none text-muted-foreground">Control Center</p>
          </div>
        </div>
        <div className="mt-3 flex h-8 items-center gap-2 rounded-md border border-sidebar-border bg-background/70 px-2 text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <span className="text-[12px]">Search</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {CONTEXT_SECTIONS.map(section => (
          <section key={section.label} className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">{section.label}</p>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = currentPageName === item.page;
                return (
                  <Link
                    key={`${section.label}-${item.page}`}
                    to={createPageUrl(item.page)}
                    onClick={onNavigate}
                    className={`flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors ${
                      active
                        ? "bg-[#1f7aff]/10 text-[#1f7aff]"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        <section className="mt-5 border-t border-sidebar-border pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">Status</p>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="space-y-2 text-[12px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded border border-[#1f7aff] bg-[#1f7aff]/10" />
              <span>Live diensten</span>
              <span className="ml-auto text-foreground">0</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded border border-sidebar-border" />
              <span>Open taken</span>
              <span className="ml-auto text-foreground">0</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded border border-sidebar-border" />
              <span>Sync fouten</span>
              <span className="ml-auto text-foreground">0</span>
            </div>
          </div>
        </section>
      </div>

      <div className="border-t border-sidebar-border p-3">
        <div className="rounded-md bg-background/65 p-2.5 text-[12px] leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Site view</span>
          <br />
          Alle operationele data in een compacte beheerweergave.
        </div>
      </div>
    </div>
  );
}

function AppShell({ children, currentPageName }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground antialiased">
      <header className="fixed inset-x-0 top-0 z-50 hidden h-12 border-b border-border bg-[hsl(var(--topbar))] lg:flex">
        <div className="flex w-12 items-center justify-center border-r border-border">
          <Link to={createPageUrl("Dashboard")} aria-label="LOQ dashboard">
            <LOQLogo className="h-3.5 w-auto max-w-8" />
          </Link>
        </div>
        <div className="flex w-72 items-center gap-2 border-r border-border px-3">
          <PanelLeft className="h-4 w-4 text-muted-foreground" />
          <span className="text-[13px] font-medium text-[#1f7aff]">LOQ Network</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <span className="text-[13px] font-semibold text-muted-foreground">Control Center</span>
        </div>
        <div className="flex w-72 items-center justify-end gap-2 px-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground">
            <Radio className="h-3.5 w-3.5" />
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1f7aff] text-white">
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-12 z-40 hidden w-12 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <RailNav currentPageName={currentPageName} />
        <div className="flex flex-col items-center gap-1 border-t border-sidebar-border px-1.5 py-3">
          <Link
            to={createPageUrl("Settings")}
            title="Instellingen"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </aside>

      <aside className="fixed bottom-0 left-12 top-12 z-40 hidden w-72 border-r border-sidebar-border bg-sidebar lg:block">
        <ContextNavigation currentPageName={currentPageName} />
      </aside>

      <header className="sticky left-0 top-0 z-40 w-screen max-w-full border-b border-border bg-[hsl(var(--topbar))] lg:hidden">
        <div className="flex h-12 items-center justify-between gap-3 px-3">
          <div className="flex min-w-0 items-center gap-3">
            <LOQLogo className="h-5 w-auto max-w-[74px]" />
            <span className="truncate text-[13px] font-medium text-[#1f7aff]">LOQ Network</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-2 z-[60] shrink-0 lg:hidden"
            style={{ left: "min(346px, calc(100vw - 44px))" }}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
        {mobileOpen && (
          <div className="border-t border-border bg-sidebar">
            <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
              <ContextNavigation currentPageName={currentPageName} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}
      </header>

      <main className="min-h-screen min-w-0 overflow-x-hidden lg:pl-[20rem] lg:pt-12">
        <div className="px-4 py-3 sm:px-5 lg:px-6">
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
