import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import {
  LayoutDashboard, Users, Settings, Menu, X,
  CarFront, Smartphone, ClipboardList, Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeProvider, useTheme } from "next-themes";

const NAV_ITEMS = [
  { name: "Dashboard",             icon: LayoutDashboard, page: "Dashboard" },
  { name: "Bedrijven",             icon: Building2,       page: "Companies" },
  { name: "Mobiele Surveillance",  icon: CarFront,        page: "MobileSurveillance" },
  { name: "Personeel",             icon: Users,           page: "Personnel" },
  { name: "Voertuigen",            icon: Settings,        page: "Vehicles" },
  { name: "Mobiele diensten",      icon: Smartphone,      page: "RouteExecutions" },
  { name: "Rapportagetemplates",   icon: ClipboardList,   page: "ReportTemplates" },
  { name: "Overig",                icon: Settings,        page: "CostSettings" },
  { name: "Instellingen",          icon: Settings,        page: "Settings" },
];

/* LOQ logo: dark logo on light bg, light logo on dark bg */
const LOGO_DARK = "https://media.base44.com/images/public/698e307ed3aa4cab3729bbf1/028ef0527_LogoBlack.png";
const LOGO_LIGHT = "https://media.base44.com/images/public/698e307ed3aa4cab3729bbf1/fd21cdb86_LogoWit.png";

function LOQLogo({ className = "h-7 w-auto" }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-7 w-16 bg-muted rounded animate-pulse" />;
  return (
    <img
      src={resolvedTheme === "dark" ? LOGO_LIGHT : LOGO_DARK}
      alt="LOQ"
      className={className}
    />
  );
}

function SidebarContent({ currentPageName }) {
  return (
    <>
      <div className="flex items-center gap-3 px-6 py-6 border-b border-border">
        <LOQLogo className="h-7 w-auto" />
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = currentPageName === item.page;
          return (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-border">
        <p className="text-[10px] text-muted-foreground text-center tracking-wide">LOQ Backoffice</p>
      </div>
    </>
  );
}

function AppShell({ children, currentPageName }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col bg-sidebar border-r border-sidebar-border">
        <SidebarContent currentPageName={currentPageName} />
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-40 bg-sidebar border-b border-sidebar-border px-4 py-3 flex items-center justify-between">
        <LOQLogo className="h-6 w-auto" />
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div className="absolute top-14 left-0 right-0 bg-sidebar border-b border-sidebar-border p-3 space-y-0.5" onClick={e => e.stopPropagation()}>
            {NAV_ITEMS.map(item => {
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
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

export default function Layout({ children, currentPageName }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AppShell currentPageName={currentPageName}>{children}</AppShell>
    </ThemeProvider>
  );
}