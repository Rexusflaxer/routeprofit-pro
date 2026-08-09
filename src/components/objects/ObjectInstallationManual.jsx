import React from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  Info,
  LockKeyhole,
  MoonStar,
  Pencil,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { installationTypeLabel } from "./objectInstallationConfig";
import { HANDBOOK_ASSETS } from "./handbookContent";
import { findAjaxControlDevice, resolveInstallationManual } from "./objectInstallationManuals";

const AJAX_LOGO = "/installation-brand-logos/alarm-system/ajax-systems.png";

const MANUAL_IMAGE_BY_KIND = {
  numeric: "ajax:image:keypad:functional",
  "numeric-reader": "ajax:image:keypad-plus:functional",
  touchscreen: "ajax:image:touchscreen:functional",
  outdoor: "ajax:image:outdoor:functional",
  app: "ajax:image:app:arm",
};

const CORE_ICONS_BY_FAMILY = {
  numeric: [
    ["ajax:icon:armed", "Inschakelen"],
    ["ajax:icon:disarmed", "Uitschakelen"],
    ["ajax:icon:night-mode", "Nachtmodus"],
    ["ajax:icon:function", "Functie / *"],
    ["ajax:icon:reset", "Wissen"],
  ],
  "numeric-reader": [
    ["ajax:icon:armed", "Inschakelen"],
    ["ajax:icon:disarmed", "Uitschakelen"],
    ["ajax:icon:night-mode", "Nachtmodus"],
    ["ajax:icon:function", "Functie / *"],
    ["ajax:icon:pass-tag", "Pass of Tag"],
  ],
  "numeric-reader-buzzer": [
    ["ajax:icon:armed", "Inschakelen"],
    ["ajax:icon:disarmed", "Uitschakelen"],
    ["ajax:icon:night-mode", "Nachtmodus"],
    ["ajax:icon:function", "Functie / *"],
    ["ajax:icon:pass-tag", "Pass of Tag"],
  ],
  touchscreen: [
    ["ajax:icon:control", "Bediening"],
    ["ajax:icon:armed", "Inschakelen"],
    ["ajax:icon:disarmed", "Uitschakelen"],
    ["ajax:icon:night-mode", "Nachtmodus"],
    ["ajax:icon:pass-tag", "Pass of Tag"],
  ],
  outdoor: [
    ["ajax:icon:function", "Functie / *"],
    ["ajax:icon:pass-tag", "Pass of Tag"],
    ["ajax:icon:reset", "Wissen"],
  ],
  app: [
    ["ajax:icon:control", "Bediening"],
    ["ajax:icon:armed", "Inschakelen"],
    ["ajax:icon:disarmed", "Uitschakelen"],
    ["ajax:icon:night-mode", "Nachtmodus"],
    ["ajax:icon:settings", "Instellingen"],
  ],
};

const formatReviewDate = value => new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "long",
  timeZone: "Europe/Amsterdam",
}).format(new Date(`${value}T12:00:00`));

function officialAsset(key) {
  return key ? HANDBOOK_ASSETS[key] || null : null;
}

function manualImageKey(manual, product) {
  if (product?.family === "numeric-reader-buzzer") return "ajax:image:keypad-combi:functional";
  if (product?.family === "numeric-reader") return "ajax:image:keypad-plus:functional";
  if (product?.family === "numeric") return "ajax:image:keypad:functional";
  return MANUAL_IMAGE_BY_KIND[manual.schematic] || null;
}

function tokenIconKey(value) {
  const normalized = String(value || "").toLocaleLowerCase("nl-NL");
  if (normalized === "inschakelen") return "ajax:icon:armed";
  if (normalized === "uitschakelen") return "ajax:icon:disarmed";
  if (normalized === "nachtmodus") return "ajax:icon:night-mode";
  if (normalized === "*" || normalized.includes("functietoets")) return "ajax:icon:function";
  if (normalized === "bediening") return "ajax:icon:control";
  if (normalized === "instellingen") return "ajax:icon:settings";
  if (normalized.includes("pass/tag") || normalized.includes("pass of tag")) return "ajax:icon:pass-tag";
  return null;
}

function OfficialIcon({ assetKey, label, compact = false }) {
  const asset = officialAsset(assetKey);
  return (
    <span className={`inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/75 shadow-sm ${compact ? "min-h-10 px-2.5 py-1.5" : "min-h-11 px-3 py-2"}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5">
        {asset?.kind === "icon" ? <img src={asset.src} alt="" className="h-full w-full object-contain" /> : <span className="text-xs">?</span>}
      </span>
      <span className="text-xs font-semibold text-foreground">{label || asset?.alt || assetKey}</span>
    </span>
  );
}

function SequenceItem({ value }) {
  const iconKey = tokenIconKey(value);
  if (iconKey) return <OfficialIcon assetKey={iconKey} label={value} compact />;
  if (/^OK(?:\s|$)/i.test(String(value || ""))) return <span className="inline-flex min-h-10 items-center rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-bold tracking-wide text-white shadow-sm">{value}</span>;
  return <span className="inline-flex min-h-10 items-center rounded-xl border border-border/70 bg-background/75 px-3 py-2 font-mono text-xs font-semibold text-foreground shadow-sm">{value}</span>;
}

function inferredSequence(procedure, manual) {
  if (procedure.sequence?.length) return procedure.sequence;
  const prefix = ["touchscreen", "app"].includes(manual.schematic) ? ["Bediening"] : [];
  if (procedure.key === "arm-all") {
    if (manual.schematic === "outdoor") return ["Bevoegde code, Pass of Tag", "OK"];
    if (manual.schematic === "app" && /in- of uitschakelen/i.test(procedure.title)) return [...prefix, "Inschakelen", "of", "Uitschakelen"];
    return [...prefix, "Inschakelen"];
  }
  if (procedure.key === "disarm-all") return manual.schematic === "outdoor" ? ["Bevoegde code, Pass of Tag", "OK"] : [...prefix, "Uitschakelen"];
  if (procedure.key === "night-mode") return [...prefix, "Nachtmodus"];
  if (procedure.key === "secondary-mode") return ["OK lang indrukken", "Bevoegde code, Pass of Tag", "OK"];
  if (procedure.key === "groups") return [...prefix, "Groep / sectie", "Actie"];
  if (procedure.key === "one-time-deactivation") return ["Instellingen", "Eenmalige deactivering"];
  return [];
}

function procedureImages(procedure, manual) {
  if (procedure.key === "one-time-deactivation") return [
    "ajax:image:bypass:device",
    "ajax:image:bypass:settings",
    "ajax:image:bypass:choice",
    "ajax:image:bypass:result",
  ];
  if (manual.schematic === "touchscreen") {
    if (procedure.key === "night-mode") return ["ajax:image:touchscreen:night"];
    if (procedure.key === "groups") return ["ajax:image:touchscreen:groups"];
    if (["arm-all", "disarm-all"].includes(procedure.key)) return ["ajax:image:touchscreen:control"];
  }
  if (manual.schematic === "app") {
    if (procedure.key === "arm-all") return ["ajax:image:app:arm", "ajax:image:app:disarm"];
    if (procedure.key === "night-mode") return ["ajax:image:app:night"];
    if (procedure.key === "groups") return ["ajax:image:app:group"];
  }
  return [];
}

function ProcedureMedia({ keys, title }) {
  if (!keys.length) return null;
  return (
    <div className={`mt-4 grid gap-2 ${keys.length > 1 ? "sm:grid-cols-2" : ""}`}>
      {keys.map((key, index) => {
        const asset = officialAsset(key);
        if (asset?.kind !== "image") return null;
        return (
          <figure key={key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <img src={asset.src} alt={`${title}, officiële Ajax-afbeelding ${index + 1}`} className="max-h-[460px] w-full object-contain" loading="lazy" />
          </figure>
        );
      })}
    </div>
  );
}

function ProcedureCard({ procedure, index, manual }) {
  const sequence = inferredSequence(procedure, manual);
  const images = procedureImages(procedure, manual);
  return (
    <article className="rounded-2xl border border-border/70 bg-card/45 p-4 shadow-sm backdrop-blur-xl sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{procedure.title}</h3>
          {procedure.summary && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{procedure.summary}</p>}
          {sequence.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2" aria-label={`Toetsvolgorde: ${sequence.join(", ")}`}>{sequence.map((item, itemIndex) => <React.Fragment key={`${item}-${itemIndex}`}><SequenceItem value={item} />{itemIndex < sequence.length - 1 && <span className="text-xs text-muted-foreground">→</span>}</React.Fragment>)}</div>}
          <ol className="mt-4 space-y-2.5">{procedure.steps.map((step, stepIndex) => <li key={`${procedure.key}-${stepIndex}`} className="flex gap-2.5 text-xs leading-relaxed text-foreground"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/5 text-[9px] font-bold text-primary">{stepIndex + 1}</span><span>{step}</span></li>)}</ol>
          {procedure.note && <div className="mt-3 flex gap-2 rounded-xl border border-border/70 bg-muted/25 p-3 text-[11px] leading-relaxed text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>{procedure.note}</p></div>}
          {procedure.warning && <div className="mt-3 flex gap-2 rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>{procedure.warning}</p></div>}
          <ProcedureMedia keys={images} title={procedure.title} />
        </div>
      </div>
    </article>
  );
}

function OriginalPanelReference({ manual, product }) {
  const image = officialAsset(manualImageKey(manual, product));
  const icons = CORE_ICONS_BY_FAMILY[product?.family || manual.schematic] || [];
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/45 shadow-sm backdrop-blur-xl">
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
        <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {image?.kind === "image" ? <img src={image.src} alt={`Originele Ajax-afbeelding van ${manual.controlDevice}`} className="max-h-[680px] w-full object-contain" /> : product?.imageSrc ? <img src={product.imageSrc} alt={manual.controlDevice} className="mx-auto max-h-[520px] w-full object-contain p-4" /> : null}
          <figcaption className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">Originele Ajax-afbeelding uit de fabrikantshandleiding. Gebruik de vorm en symbolen om het juiste paneel te herkennen; de firmwareweergave kan afwijken.</figcaption>
        </figure>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Originele Ajax-pictogrammen</p>
          <div className="mt-3 grid gap-2">{icons.map(([key, label]) => <OfficialIcon key={key} assetKey={key} label={label} />)}</div>
        </div>
      </div>
    </section>
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
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{ajaxWithoutModel ? "Kies eerst de Ajax-bedieningswijze. Daarna koppelt LOQ automatisch de juiste gecontroleerde handleiding." : `Voor ${installation.brand || installationTypeLabel(installation)} is nog geen gecontroleerde LOQ-handleiding gepubliceerd.`}</p>
        {!disabled && <Button type="button" size="sm" className="mt-5" onClick={onEdit}><Pencil className="h-4 w-4" /> Installatie wijzigen</Button>}
      </div>
    </div>
  );
}

export default function ObjectInstallationManual({ object, installation, onBack, onEdit, disabled = false }) {
  const manual = resolveInstallationManual(installation);
  if (!manual) return <MissingManual installation={installation} onBack={onBack} onEdit={onEdit} disabled={disabled} />;
  const product = findAjaxControlDevice(installation.control_device_key);
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
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-primary/25 bg-primary/5 text-primary">Gecontroleerde LOQ-handleiding</Badge><Badge variant="outline">Versie {manual.version}</Badge></div><h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{manual.controlDevice}</h1><p className="mt-1 text-sm text-muted-foreground">{manual.title} · {installation.name} · {object.name}</p></div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs lg:min-w-[280px]"><div><dt className="text-muted-foreground">Bedieningsfamilie</dt><dd className="mt-0.5 font-medium">{product?.operationLabel || manual.protocol}</dd></div><div><dt className="text-muted-foreground">Gecontroleerd</dt><dd className="mt-0.5 font-medium">{formatReviewDate(manual.reviewedOn)}</dd></div><div><dt className="text-muted-foreground">Object</dt><dd className="mt-0.5 truncate font-medium">{object.object_code || object.name}</dd></div><div><dt className="text-muted-foreground">Paneellocatie</dt><dd className="mt-0.5 truncate font-medium">{installation.control_panel_location || "Niet vastgelegd"}</dd></div></dl>
        </div>
        <div className="flex gap-3 border-t border-amber-300/60 bg-amber-50/60 px-5 py-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Controleer altijd eerst het paneel en de objectstatus.</strong> Objectspecifieke instructies, meldkamerafspraken en bevoegdheden gaan voor op deze algemene bediening. Bij een alarm, sabotage, storing of onduidelijke status: stop en volg de calamiteitenprocedure.</p></div>
      </header>

      <div className="mt-5 space-y-5">
        <OriginalPanelReference manual={manual} product={product} />
        <section className="rounded-2xl border border-border/70 bg-card/45 p-4 shadow-sm backdrop-blur-xl"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="text-sm font-semibold">Veilig beginnen</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{manual.intro}</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><span className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/50 p-2 text-[11px]"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Juiste object en groep</span><span className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/50 p-2 text-[11px]"><LockKeyhole className="h-3.5 w-3.5 text-primary" /> Alleen eigen bevoegdheid</span><span className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/50 p-2 text-[11px]"><MoonStar className="h-3.5 w-3.5 text-indigo-600" /> Status bevestigen</span></div></div></div></section>
        <div className="grid gap-4 xl:grid-cols-2">{procedures.map((procedure, index) => <ProcedureCard key={procedure.key} procedure={procedure} index={index} manual={manual} />)}</div>
        <section className="rounded-2xl border border-border/70 bg-card/45 p-5 text-xs shadow-sm backdrop-blur-xl"><div className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4 text-primary" /><h2 className="font-semibold">Bron en beheer</h2></div><p className="mt-2 leading-relaxed text-muted-foreground">Deze Nederlandstalige LOQ-werkinstructie is gecontroleerd tegen de officiële Ajax-documentatie. De originele afbeeldingen en pictogrammen blijven eigendom van Ajax Systems. De instructie vervangt de fabrikantshandleiding niet.</p>{manual.supportedControlDevices.length > 1 && <p className="mt-2 rounded-lg border border-border/70 bg-muted/25 p-2.5 text-[11px] leading-relaxed text-muted-foreground">Gedeelde bedieningsflow voor: {manual.supportedControlDevices.join(", ")}.</p>}<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap"><a href={manual.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">Officiële handleiding van dit model <ExternalLink className="h-3.5 w-3.5" /></a><a href={manual.bypassProcedure.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">Ajax-uitleg eenmalige deactivering <ExternalLink className="h-3.5 w-3.5" /></a></div></section>
      </div>
    </div>
  );
}
