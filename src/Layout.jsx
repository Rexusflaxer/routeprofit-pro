import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "./utils";
import {
  LayoutDashboard, Users, Settings, Menu, X, CarFront, Smartphone,
  Search, Route, MapPin, CalendarCheck,
  FileText, SlidersHorizontal,
  Database, ChevronDown, Building2, UserCircle, LogOut, Handshake, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeProvider, useTheme } from "next-themes";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

const LOGO_DARK = "/loq-logo-dark.png";
const LOGO_LIGHT = "/loq-logo-light.png";

const CONTEXT_SECTIONS = [
  {
    label: "Control Center",
    items: [
      { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
      { name: "Personeel", icon: Users, page: "Personnel" },
      { name: "LOQ Teamhub", icon: Handshake, page: "Teamhub" },
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

function ViewportSizeWarning({ className = "" }) {
  return (
    <div className={`rounded-md border border-sidebar-border bg-sidebar/95 px-3 py-2 text-sidebar-foreground shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur dark:shadow-[0_10px_30px_rgba(0,0,0,0.35)] ${className}`}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#1f7aff]/10 text-[#1f7aff]">
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold leading-tight">Venster te smal</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Niet alles past in beeld. Vergroot het venster om tabellen en knoppen volledig te zien.
          </p>
        </div>
      </div>
    </div>
  );
}

function UserProfileFooter({ onNavigate, collapsed = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 60_000,
  });

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = user?.full_name
    ? user.full_name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const handleNav = (path) => {
    setOpen(false);
    onNavigate?.();
    navigate(path);
  };

  return (
    <div ref={ref} className={`relative border-t border-sidebar-border ${collapsed ? "px-1.5" : "px-3"} py-2.5`}>
      <AnimatePresence>
        {open && (
          <motion.div
            className={`absolute bottom-full mb-1.5 z-50 rounded-lg border border-border bg-popover shadow-lg py-1 text-[13px] ${collapsed ? "left-1 right-1" : "left-3 right-3"}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <button
              onClick={() => handleNav("/EmployeePortal")}
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-accent rounded-md transition-colors text-foreground"
            >
              <UserCircle className="h-3.5 w-3.5 text-muted-foreground" />
              Mijn profiel
            </button>
            <button
              onClick={() => handleNav("/Companies")}
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-accent rounded-md transition-colors text-foreground"
            >
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Mijn bedrijven
            </button>
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => { setOpen(false); base44.auth.logout(); }}
              className="flex w-full items-center gap-2 px-3 py-2 hover:bg-accent rounded-md transition-colors text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
              Uitloggen
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex w-full items-center rounded-md px-1.5 py-1.5 hover:bg-sidebar-accent transition-colors ${collapsed ? "justify-center" : "gap-2.5"}`}
        title={collapsed ? (user?.full_name || "Profiel") : undefined}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1f7aff]/15 text-[#1f7aff] text-[11px] font-bold">
          {initials}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[13px] font-medium text-sidebar-foreground leading-tight">{user?.full_name || "Profiel"}</p>
              <p className="truncate text-[11px] text-muted-foreground leading-tight">{user?.email || ""}</p>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </>
        )}
      </button>
    </div>
  );
}

function ContextNavigation({ currentPageName, onNavigate, collapsed = false }) {
  return (
    <div className="flex h-full flex-col">
      <div className={`border-b border-sidebar-border py-3 ${collapsed ? "px-2" : "px-3"}`}>
        <Link to={createPageUrl("Dashboard")} onClick={onNavigate} className={`inline-flex items-center ${collapsed ? "w-full justify-center" : ""}`}>
          {collapsed ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#1f7aff] text-white text-[13px] font-bold">L</div>
          ) : (
            <LOQLogo className="h-7 w-auto max-w-[104px]" />
          )}
        </Link>
        {!collapsed && (
          <div className="mt-3 flex h-8 items-center gap-2 rounded-md border border-sidebar-border bg-background/70 px-2 text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            <span className="text-[12px]">Search</span>
          </div>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto py-3 ${collapsed ? "px-1.5" : "px-3"}`}>
        {CONTEXT_SECTIONS.map(section => (
          <section key={section.label} className={collapsed ? "mb-4" : "mb-4"}>
            {!collapsed && (
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase text-muted-foreground">{section.label}</p>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
            {collapsed && <div className="my-2 border-t border-sidebar-border/60" />}
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = isActive(currentPageName, item);
                return (
                  <Link
                    key={`${section.label}-${item.page}`}
                    to={createPageUrl(item.page)}
                    onClick={onNavigate}
                    title={collapsed ? item.name : undefined}
                    className={`flex h-8 items-center rounded-md text-[13px] transition-colors ${
                      collapsed ? "justify-center px-0" : "gap-2 px-2"
                    } ${
                      active
                        ? "bg-[#1f7aff]/10 text-[#1f7aff]"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {!collapsed && (
        <div className="hidden border-t border-sidebar-border px-3 py-2.5 lg:block 2xl:hidden">
          <ViewportSizeWarning />
        </div>
      )}

      <UserProfileFooter onNavigate={onNavigate} collapsed={collapsed} />
    </div>
  );
}

function AppShell({ children, currentPageName }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1024);
  const [autoHoverActive, setAutoHoverActive] = useState(false);
  const sidebarRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setCollapsed(false);
        setAutoHoverActive(false);
      } else {
        setCollapsed(true);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleMouseMove = (e) => {
    if (window.innerWidth >= 1024) return; // Only on narrow screens
    const nearLeftEdge = e.clientX < 80;
    
    if (nearLeftEdge && collapsed && !autoHoverActive) {
      setAutoHoverActive(true);
      setCollapsed(false);
    }
  };

  const handleMouseLeaveApp = () => {
    if (autoHoverActive && window.innerWidth < 1024) {
      setAutoHoverActive(false);
      setCollapsed(true);
    }
  };

  const handleMouseLeaveSidebar = () => {
    if (autoHoverActive && window.innerWidth < 1024) {
      setAutoHoverActive(false);
      setCollapsed(true);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground antialiased" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeaveApp}>
      <aside ref={sidebarRef} className={`fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-in-out lg:block ${collapsed ? "w-16" : "w-64"}`} onMouseLeave={handleMouseLeaveSidebar}>
        <ContextNavigation currentPageName={currentPageName} collapsed={collapsed} />
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

      <main className={`min-h-screen min-w-0 overflow-x-hidden transition-[padding] duration-200 ease-in-out ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}>
        <div className="px-4 py-3 sm:px-5 lg:px-6">
          {children}
        </div>
      </main>

      <div className="pointer-events-none fixed bottom-3 left-3 right-3 z-50 lg:hidden">
        <ViewportSizeWarning className="mx-auto max-w-sm" />
      </div>
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