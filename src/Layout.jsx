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

const LOGO_DARK  = "https://media.base44.com/images/public/698e307ed3aa4cab3729bbf1/028ef0527_LogoBlack.png";
const LOGO_LIGHT = "https://media.base44.com/images/public/698e307ed3aa4cab3729bbf1/fd21cdb86_LogoWit.png";

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

  return (
    <div className="min-h-screen bg-background">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-40 bg-sidebar border-b border-sidebar-border">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-14 gap-6">
            {/* Logo */}
            <Link to={createPageUrl("Dashboard")} className="shrink-0 mr-2">
              <LOQLogo className="h-6 w-auto" />
            </Link>

            {/* Desktop nav links */}
            <nav className="hidden lg:flex items-center gap-0.5 flex-1 overflow-x-auto">
              {NAV_ITEMS.map(item => {
                const isActive = currentPageName === item.page;
                return (
                  <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5 shrink-0" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            {/* Mobile hamburger */}
            <div className="flex lg:hidden ml-auto">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-sidebar-border bg-sidebar p-3 space-y-0.5">
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
        )}
      </header>

      {/* Main content */}
      <main className="min-h-screen">
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