import React from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Filter,
  Rows3,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PERSPECTIVES = [
  { value: "object", label: "Objectweergave", icon: Rows3 },
  { value: "employee", label: "Medewerkerweergave", icon: Users },
];

const VIEWS = [
  { value: "week", label: "Week" },
  { value: "period", label: "Periode" },
];

function Segment({ options, value, onChange, ariaLabel }) {
  return (
    <div className="inline-flex h-8 items-center rounded-md border border-border bg-card p-0.5" role="group" aria-label={ariaLabel}>
      {options.map(option => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span className={Icon ? "hidden lg:inline" : ""}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function PlanningToolbar({
  perspective,
  onPerspectiveChange,
  view,
  onViewChange,
  rangeLabel,
  periodStart,
  periodEnd,
  periodDayCount,
  onPeriodStartChange,
  onPeriodEndChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  onPrevious,
  onToday,
  onNext,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  customerFilter,
  onCustomerFilterChange,
  customers,
  warningCount,
  onPublish,
  publishDisabled,
  isPublishing,
}) {
  const normalizedView = view === "period" || view === "custom" ? "period" : "week";
  const selectedPeriodStart = periodStart || customStart || "";
  const selectedPeriodEnd = periodEnd || customEnd || "";
  const changePeriodStart = onPeriodStartChange || onCustomStartChange;
  const changePeriodEnd = onPeriodEndChange || onCustomEndChange;

  return (
    <header className="shrink-0 border-b border-border bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex min-w-0 items-center gap-2">
        <div className="mr-1 flex min-w-[150px] items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CalendarRange className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-semibold leading-tight">Planning</h1>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">Week- en periodeplanning</p>
          </div>
        </div>

        <Segment
          options={PERSPECTIVES}
          value={perspective}
          onChange={onPerspectiveChange}
          ariaLabel="Planningperspectief"
        />
        <Segment
          options={VIEWS}
          value={normalizedView}
          onChange={onViewChange}
          ariaLabel="Periodeweergave"
        />

        <div className="inline-flex h-8 items-center rounded-md border border-border bg-card">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded" onClick={onPrevious} aria-label="Vorige periode">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <button
            type="button"
            onClick={onToday}
            className="min-w-[132px] px-2 text-center text-[12px] font-semibold capitalize text-foreground hover:text-primary"
            title="Ga naar vandaag"
          >
            {rangeLabel}
          </button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded" onClick={onNext} aria-label="Volgende periode">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {warningCount > 0 && (
          <div className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-300/70 bg-amber-50 px-2 text-[11px] font-semibold text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/35 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {warningCount}
          </div>
        )}

        <Button
          className={cn("h-8 shrink-0 gap-1.5 px-3 text-[12px]", warningCount === 0 && "ml-auto")}
          onClick={onPublish}
          disabled={publishDisabled || isPublishing}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {isPublishing ? "Publiceren…" : "Publiceren"}
        </Button>
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-2">
        {normalizedView === "period" && (
          <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-card p-1" aria-label="Aangepaste periode">
            <label className="flex items-center gap-1">
              <span className="pl-1 text-[10px] font-medium text-muted-foreground">Van</span>
              <Input
                type="date"
                value={selectedPeriodStart}
                max={selectedPeriodEnd || undefined}
                onChange={event => changePeriodStart?.(event.target.value)}
                className="h-7 w-[132px] border-0 bg-background px-2 text-[11px] shadow-none"
                aria-label="Begindatum periode"
              />
            </label>
            <label className="flex items-center gap-1">
              <span className="pl-1 text-[10px] font-medium text-muted-foreground">Tot</span>
              <Input
                type="date"
                value={selectedPeriodEnd}
                min={selectedPeriodStart || undefined}
                onChange={event => changePeriodEnd?.(event.target.value)}
                className="h-7 w-[132px] border-0 bg-background px-2 text-[11px] shadow-none"
                aria-label="Einddatum periode"
              />
            </label>
            {Number(periodDayCount) > 0 && <span className="pr-1 text-[9px] tabular-nums text-muted-foreground">{periodDayCount} dagen</span>}
          </div>
        )}

        <div className="relative min-w-[220px] max-w-[440px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Zoek dienst, object of medewerker"
            className="h-8 border-border bg-card pl-8 text-[12px]"
            aria-label="Zoek in planning"
          />
        </div>

        <Select value={customerFilter} onValueChange={onCustomerFilterChange}>
          <SelectTrigger className="h-8 w-[145px] bg-card text-[12px]" aria-label="Filter op klant">
            <SelectValue placeholder="Alle klanten" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle klanten</SelectItem>
            {customers.map(customer => (
              <SelectItem key={customer.id} value={String(customer.id)}>
                {customer.trade_name || customer.name || customer.legal_name || "Naamloze klant"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="h-8 w-[132px] bg-card text-[12px]" aria-label="Filter op planningsstatus">
            <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle planning</SelectItem>
            <SelectItem value="vacant">Open werk</SelectItem>
            <SelectItem value="draft">Conceptwijzigingen</SelectItem>
            <SelectItem value="warnings">Met waarschuwing</SelectItem>
            <SelectItem value="published">Gepubliceerd</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
