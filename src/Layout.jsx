import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import {
  LayoutDashboard, Users, Settings, Menu, X, CarFront, Smartphone,
  Building2, Search, Route, MapPin, CalendarCheck,
  FileText, SlidersHorizontal,
  Database, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeProvider, useTheme } from "next-themes";

const LOGO_DARK = "/loq-logo-dark.png";
const LOGO_LIGHT = "/loq-logo-light.png";

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

function ContextNavigation({ currentPageName, onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-3 py-3">
        <Link to={createPageUrl("Dashboard")} onClick={onNavigate} className="inline-flex items-center">
          <LOQLogo className="h-7 w-auto max-w-[104px]" />
        </Link>
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
                const active = isActive(currentPageName, item);
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
      </div>
    </div>
  );
}

function AppShell({ children, currentPageName }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground antialiased">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border bg-sidebar lg:block">
        <ContextNavigation currentPageName={currentPageName} />
      </aside>

      <header className="sticky left-0 top-0 z-40 w-screen max-w-full border-b border-border bg-[hsl(var(--topbar))] lg:hidden">
        <div className="flex h-12 items-center justify-between gap-3 px-3">
          <div className="flex min-w-0 items-center gap-3">
            <LOQLogo className="h-5 w-auto max-w-[74px]" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
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

      <main className="min-h-screen min-w-0 overflow-x-hidden lg:pl-64">
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