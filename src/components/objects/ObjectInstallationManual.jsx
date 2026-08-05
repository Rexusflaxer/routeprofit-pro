import React from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  Info,
  Layers3,
  LockKeyhole,
  MoonStar,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { installationTypeLabel } from "./objectInstallationConfig";
import { resolveInstallationManual } from "./objectInstallationManuals";

const AJAX_LOGO = "/installation-brand-logos/alarm-system/ajax-systems.png";

const formatReviewDate = value => new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "long",
  timeZone: "Europe/Amsterdam",
}).format(new Date(`${value}T12:00:00`));

function ActionKey({ children, tone = "neutral" }) {
  const className = tone === "arm"
    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300"
    : tone === "disarm"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
      : tone === "night"
        ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/70 dark:bg-indigo-950/40 dark:text-indigo-300"
        : "border-border/70 bg-card/70 text-foreground";
  return <span className={`flex min-h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-[10px] font-semibold shadow-sm ${className}`}>{children}</span>;
}

function NumericSchematic({ reader = false }) {
  return (
    <div className="mx-auto w-full max-w-[250px] rounded-[24px] border border-slate-300 bg-slate-950 p-4 shadow-xl shadow-slate-950/10 dark:border-slate-700">
      <div className="mb-4 flex items-center justify-between"><span className="text-xs font-semibold tracking-widest text-white">AJAX</span><div className="flex gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" /><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /><span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /></div></div>
      <div className="grid grid-cols-3 gap-2">{[1, 2, 3, 4, 5, 6, 7, 8, 9, "*", 0, "C"].map(value => <span key={value} className="flex aspect-square items-center justify-center rounded-lg border border-white/10 bg-white/5 text-xs font-semibold text-white/85">{value}</span>)}</div>
      <div className="mt-3 grid grid-cols-3 gap-2"><ActionKey tone="arm">IN</ActionKey><ActionKey tone="disarm">UIT</ActionKey><ActionKey tone="night">NACHT</ActionKey></div>
      {reader && <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-2 text-[10px] font-medium text-white/70"><span className="h-3 w-3 rounded-full border border-white/60" /> PASS / TAG</div>}
    </div>
  );
}

function TouchscreenSchematic() {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-[26px] border border-slate-300 bg-slate-950 p-3 shadow-xl shadow-slate-950/10 dark:border-slate-700">
      <div className="rounded-[18px] bg-slate-100 p-3 dark:bg-slate-900">
        <div className="flex items-center justify-between"><span className="text-[10px] font-bold tracking-wider text-slate-800 dark:text-slate-100">BEDIENING</span><span className="h-2 w-2 rounded-full bg-emerald-500" /></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><span className="rounded-lg border border-slate-200 bg-white p-2 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Groep 1</span><span className="rounded-lg border border-slate-200 bg-white p-2 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Groep 2</span></div>
        <div className="mt-3 grid grid-cols-3 gap-1.5"><ActionKey tone="arm">IN</ActionKey><ActionKey tone="disarm">UIT</ActionKey><ActionKey tone="night">NACHT</ActionKey></div>
      </div>
      <p className="mt-2 text-center text-[9px] font-semibold tracking-widest text-white/70">AJAX</p>
    </div>
  );
}

function OutdoorSchematic() {
  return (
    <div className="mx-auto w-full max-w-[205px] rounded-[24px] border border-slate-300 bg-slate-100 p-4 shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900">
      <div className="grid grid-cols-3 gap-2">{[1, 2, 3, 4, 5, 6, 7, 8, 9, "F", 0, "⌫"].map(value => <span key={value} className="flex aspect-square items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-800 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">{value}</span>)}</div>
      <div className="mt-3 rounded-full border border-primary/30 bg-primary/10 py-2 text-center text-xs font-bold text-primary">OK</div>
      <p className="mt-3 text-center text-[9px] font-bold tracking-[0.2em] text-slate-500">AJAX · LEZER</p>
    </div>
  );
}

function AppSchematic() {
  return (
    <div className="mx-auto w-full max-w-[175px] rounded-[30px] border border-slate-300 bg-slate-950 p-2.5 shadow-xl shadow-slate-950/10 dark:border-slate-700">
      <div className="min-h-[300px] rounded-[22px] bg-slate-100 p-3 dark:bg-slate-900">
        <div className="mx-auto h-1 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
        <p className="mt-5 text-[10px] font-bold text-slate-900 dark:text-slate-100">Objectbeveiliging</p>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"><p className="text-[9px] text-slate-500">Status</p><p className="mt-0.5 text-xs font-semibold text-emerald-600">Uitgeschakeld</p></div>
        <div className="mt-3 grid gap-2"><ActionKey tone="arm">INSCHAKELEN</ActionKey><ActionKey tone="night">NACHTMODUS</ActionKey></div>
        <div className="mt-5 flex justify-center"><Smartphone className="h-4 w-4 text-slate-400" /></div>
      </div>
    </div>
  );
}

function ManualSchematic({ kind }) {
  if (kind === "touchscreen") return <TouchscreenSchematic />;
  if (kind === "outdoor") return <OutdoorSchematic />;
  if (kind === "app") return <AppSchematic />;
  return <NumericSchematic reader={kind === "numeric-reader"} />;
}

function ProcedureCard({ procedure, index }) {
  return (
    <article className="rounded-xl border border-border/70 bg-card/45 p-4 shadow-sm backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{procedure.title}</h3>
          {procedure.summary && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{procedure.summary}</p>}
          {procedure.sequence?.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label={`Toetsvolgorde: ${procedure.sequence.join(", ")}`}>{procedure.sequence.map((item, itemIndex) => <React.Fragment key={`${item}-${itemIndex}`}><span className="rounded-md border border-border/70 bg-background/70 px-2 py-1 font-mono text-[10px] font-semibold text-foreground">{item}</span>{itemIndex < procedure.sequence.length - 1 && <span className="text-xs text-muted-foreground">→</span>}</React.Fragment>)}</div>}
          <ol className="mt-3 space-y-2">{procedure.steps.map((step, stepIndex) => <li key={step} className="flex gap-2 text-xs leading-relaxed text-foreground"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/5 text-[9px] font-bold text-primary">{stepIndex + 1}</span><span>{step}</span></li>)}</ol>
          {procedure.note && <div className="mt-3 flex gap-2 rounded-lg border border-border/70 bg-muted/25 p-2.5 text-[11px] leading-relaxed text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>{procedure.note}</p></div>}
          {procedure.warning && <div className="mt-3 flex gap-2 rounded-lg border border-amber-300/70 bg-amber-50/60 p-2.5 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>{procedure.warning}</p></div>}
        </div>
      </div>
    </article>
  );
}

function MissingManual({ installation, onBack, onEdit, disabled }) {
  const ajaxWithoutModel = installation.installation_type === "alarm_system" && ["ajax", "ajax systems"].includes(String(installation.brand || "").trim().toLowerCase());
  return (
    <div className="min-h-[620px] bg-card/35 p-4 backdrop-blur-xl sm:p-5">
      <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Installaties</Button>
      <div className="mx-auto mt-14 max-w-xl rounded-2xl border border-border/70 bg-card/50 p-7 text-center shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-border/70 bg-background/60"><BookOpenCheck className="h-5 w-5 text-muted-foreground" /></div>
        <h2 className="mt-4 text-base font-semibold">Nog geen ingebouwde handleiding beschikbaar</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{ajaxWithoutModel ? "Kies eerst het exacte Ajax-bedienpaneel. Daarna koppelt LOQ automatisch de juiste gecontroleerde handleiding." : `Voor ${installation.brand || installationTypeLabel(installation)} is in deze eerste oplevering nog geen gecontroleerde LOQ-handleiding gepubliceerd.`}</p>
        {!disabled && <Button type="button" size="sm" className="mt-5" onClick={onEdit}><Pencil className="h-4 w-4" /> Installatie wijzigen</Button>}
      </div>
    </div>
  );
}

export default function ObjectInstallationManual({ object, installation, onBack, onEdit, disabled = false }) {
  const manual = resolveInstallationManual(installation);
  if (!manual) return <MissingManual installation={installation} onBack={onBack} onEdit={onEdit} disabled={disabled} />;

  const procedures = [...manual.procedures, manual.bypassProcedure];
  return (
    <div className="min-h-[620px] bg-card/35 p-4 backdrop-blur-xl sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Installaties</Button>
        {!disabled && <Button type="button" variant="outline" size="sm" onClick={onEdit}><Pencil className="h-4 w-4" /> Installatie wijzigen</Button>}
      </div>

      <header className="overflow-hidden rounded-2xl border border-border/70 bg-card/50 shadow-sm backdrop-blur-xl">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm"><img src={AJAX_LOGO} alt="Ajax Systems" className="h-full w-full object-contain" /></span>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary">Ingebouwde LOQ-handleiding</Badge><Badge variant="outline">Versie {manual.version}</Badge></div><h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{manual.controlDevice}</h1><p className="mt-1 text-sm text-muted-foreground">{manual.title} · {installation.name} · {object.name}</p></div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs lg:min-w-[280px]"><div><dt className="text-muted-foreground">Protocol</dt><dd className="mt-0.5 font-medium">{manual.protocol}</dd></div><div><dt className="text-muted-foreground">Gecontroleerd</dt><dd className="mt-0.5 font-medium">{formatReviewDate(manual.reviewedOn)}</dd></div><div><dt className="text-muted-foreground">Object</dt><dd className="mt-0.5 truncate font-medium">{object.object_code || object.name}</dd></div><div><dt className="text-muted-foreground">Paneellocatie</dt><dd className="mt-0.5 truncate font-medium">{installation.control_panel_location || "Niet vastgelegd"}</dd></div></dl>
        </div>
        <div className="flex gap-3 border-t border-amber-300/60 bg-amber-50/60 px-5 py-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Controleer altijd eerst het paneel en de objectstatus.</strong> Objectspecifieke instructies, meldkamerafspraken en bevoegdheden gaan voor op deze algemene bediening. Bij een alarm, sabotage, storing of onduidelijke status: stop en volg de calamiteitenprocedure.</p></div>
      </header>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-4">
          <section className="rounded-xl border border-border/70 bg-card/45 p-4 shadow-sm backdrop-blur-xl"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="text-sm font-semibold">Veilig beginnen</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{manual.intro}</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><span className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/50 p-2 text-[11px]"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Juiste object en groep</span><span className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/50 p-2 text-[11px]"><LockKeyhole className="h-3.5 w-3.5 text-primary" /> Alleen eigen bevoegdheid</span><span className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/50 p-2 text-[11px]"><MoonStar className="h-3.5 w-3.5 text-indigo-600" /> Status bevestigen</span></div></div></div></section>
          <div className="space-y-3">{procedures.map((procedure, index) => <ProcedureCard key={procedure.key} procedure={procedure} index={index} />)}</div>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="rounded-xl border border-border/70 bg-card/45 p-4 shadow-sm backdrop-blur-xl"><div className="mb-4 flex items-center gap-2"><Layers3 className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Schematische bediening</h2></div><ManualSchematic kind={manual.schematic} /><p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Schematische weergave; plaatsing, symbolen en prompts kunnen per firmware en configuratie afwijken.</p></section>
          <section className="rounded-xl border border-border/70 bg-card/45 p-4 text-xs shadow-sm backdrop-blur-xl"><div className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-primary" /><h2 className="font-semibold">Bron en beheer</h2></div><p className="mt-2 leading-relaxed text-muted-foreground">Deze Nederlandstalige LOQ-werkinstructie is gecontroleerd tegen de officiële Ajax-documentatie. Zij is beknopt en vervangt de fabrikantshandleiding niet.</p>{manual.supportedControlDevices.length > 1 && <p className="mt-2 rounded-lg border border-border/70 bg-muted/25 p-2.5 text-[11px] leading-relaxed text-muted-foreground">Gedeelde bedieningsflow voor: {manual.supportedControlDevices.join(", ")}.</p>}<a href={manual.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 font-medium text-primary hover:underline">Officiële handleiding van dit model <ExternalLink className="h-3.5 w-3.5" /></a><a href={manual.bypassProcedure.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-medium text-primary hover:underline">Ajax-uitleg eenmalige deactivering <ExternalLink className="h-3.5 w-3.5" /></a></section>
        </aside>
      </div>
    </div>
  );
}
