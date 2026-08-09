import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Link2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prepareManagedFilePreview, revokeManagedFilePreview } from "@/lib/managedFiles";
import { HANDBOOK_ASSETS, articleBlocks } from "./handbookContent";

const toneStyle = {
  info: { icon: Info, className: "border-blue-300/60 bg-blue-500/5 text-blue-950 dark:border-blue-900/70 dark:text-blue-100" },
  warning: { icon: AlertTriangle, className: "border-amber-300/70 bg-amber-500/5 text-amber-950 dark:border-amber-900/70 dark:text-amber-100" },
  danger: { icon: ShieldAlert, className: "border-rose-300/70 bg-rose-500/5 text-rose-950 dark:border-rose-900/70 dark:text-rose-100" },
  success: { icon: CheckCircle2, className: "border-emerald-300/60 bg-emerald-500/5 text-emerald-950 dark:border-emerald-900/70 dark:text-emerald-100" },
};

function ManagedHandbookImage({ block }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let current = null;
    setPreview(null);
    setError(null);
    if (!block.managed_file_id) return undefined;
    prepareManagedFilePreview({ managedFileId: block.managed_file_id, filename: block.alt || "Handboekafbeelding" })
      .then(result => {
        current = result;
        if (active) setPreview(result);
        else revokeManagedFilePreview(result);
      })
      .catch(cause => active && setError(cause));
    return () => {
      active = false;
      if (current) revokeManagedFilePreview(current);
    };
  }, [attempt, block.alt, block.managed_file_id]);
  if (error) return <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive"><span className="flex-1">Afbeelding kon niet veilig worden geladen.</span><Button type="button" variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw</Button></div>;
  if (!preview) return <div className="h-44 animate-pulse rounded-xl border border-border/70 bg-muted/20" aria-label="Afbeelding laden" />;
  return <img src={preview.url} alt={block.alt || "Handboekafbeelding"} className="max-h-[620px] w-full object-contain" />;
}

function HandbookImage({ block }) {
  const asset = block.asset_key ? HANDBOOK_ASSETS[block.asset_key] : null;
  const imageClass = block.layout === "contained" ? "mx-auto max-h-[520px] max-w-3xl object-contain" : "max-h-[680px] w-full object-contain";
  return (
    <figure className={`overflow-hidden rounded-2xl border border-border/70 bg-white shadow-sm ${block.layout === "inline" ? "max-w-xl" : ""}`}>
      <div className="flex min-h-36 items-center justify-center p-2 sm:p-4">
        {asset?.kind === "image"
          ? <img src={asset.src} alt={block.alt || asset.alt || "Ajax-handleidingafbeelding"} className={imageClass} loading="lazy" />
          : block.managed_file_id
            ? <ManagedHandbookImage block={block} />
            : <p className="p-8 text-xs text-muted-foreground">Afbeelding ontbreekt.</p>}
      </div>
      {block.caption && <figcaption className="border-t border-border/60 bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">{block.caption}</figcaption>}
    </figure>
  );
}

function SequenceItem({ item }) {
  if (item.type === "icon") {
    const asset = HANDBOOK_ASSETS[item.value];
    return (
      <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2 shadow-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5">
          {asset?.kind === "icon" ? <img src={asset.src} alt="" className="h-full w-full object-contain" /> : <span className="text-xs">?</span>}
        </span>
        <span className="text-xs font-semibold">{item.label || asset?.alt || item.value}</span>
      </span>
    );
  }
  if (/^OK(?:\s|$)/i.test(String(item.value || ""))) {
    return <span className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-bold tracking-wide text-white shadow-sm">{item.label || item.value}</span>;
  }
  return <span className="inline-flex min-h-11 items-center rounded-xl border border-border/70 bg-background/80 px-3 py-2 font-mono text-xs font-semibold shadow-sm">{item.label || item.value}</span>;
}

function HandbookBlock({ block, onOpenArticle, onOpenCategory }) {
  if (block.type === "heading") {
    const Tag = block.level === 4 ? "h4" : block.level === 3 ? "h3" : "h2";
    return <Tag className={`${Tag === "h2" ? "pt-2 text-lg" : "text-base"} font-semibold tracking-tight text-foreground`}>{block.text}</Tag>;
  }
  if (block.type === "paragraph") return <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{block.text}</p>;
  if (block.type === "steps") return <ol className="space-y-3">{(block.items || []).map((item, index) => <li key={`${block.id}-${index}`} className="flex gap-3 text-sm leading-6"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-[11px] font-bold text-primary">{index + 1}</span><span>{item}</span></li>)}</ol>;
  if (block.type === "image") return <HandbookImage block={block} />;
  if (block.type === "divider") return <hr className="border-border/70" />;
  if (block.type === "button_sequence") return <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/40 p-4 backdrop-blur-xl" aria-label="Toetsvolgorde">{(block.sequence || []).map((item, index) => <React.Fragment key={`${block.id}-${index}`}><SequenceItem item={item} />{index < block.sequence.length - 1 && <span className="text-sm text-muted-foreground">→</span>}</React.Fragment>)}</div>;
  if (block.type === "callout") {
    const style = toneStyle[block.tone] || toneStyle.info;
    const Icon = style.icon;
    return <aside className={`flex gap-3 rounded-2xl border p-4 text-sm leading-6 ${style.className}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><p className="whitespace-pre-wrap">{block.text}</p></aside>;
  }
  if (block.type === "link") {
    const open = () => block.target_type === "category" ? onOpenCategory?.(block.target_id) : onOpenArticle?.(block.target_id);
    return <button type="button" onClick={open} className="group flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card/45 p-4 text-left shadow-sm transition hover:border-primary/35 hover:bg-primary/5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/70"><Link2 className="h-4 w-4 text-primary" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground group-hover:text-primary">{block.label || "Open verwijzing"}</span>{block.description && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{block.description}</span>}</span><ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" /></button>;
  }
  return null;
}

export default function HandbookArticleRenderer({ article, onOpenArticle, onOpenCategory, previewBlocks = null }) {
  const blocks = previewBlocks || articleBlocks(article).all;
  if (!blocks.length) return <p className="text-sm text-muted-foreground">Dit artikel heeft nog geen inhoud.</p>;
  return <div className="space-y-5">{blocks.map(block => <HandbookBlock key={block.id} block={block} onOpenArticle={onOpenArticle} onOpenCategory={onOpenCategory} />)}</div>;
}
