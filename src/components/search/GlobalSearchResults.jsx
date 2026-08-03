import React from "react";
import { ArrowUpRight, Search } from "lucide-react";

export default function GlobalSearchResults({ query, results, loading, onSelect }) {
  if (!query) return null;
  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Alle onderdelen doorzoeken...</p>;
  if (!results.length) return <div className="py-12 text-center"><Search className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Geen resultaten gevonden</p><p className="mt-1 text-xs text-muted-foreground">Probeer een andere zoekterm.</p></div>;
  const groups = [...new Set(results.map(result => result.category))];
  return <div className="max-h-[calc(100vh-190px)] space-y-5 overflow-y-auto px-1 pb-8 pt-5">
    {groups.map(group => <section key={group}><h2 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{group}</h2><div className="overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm">{results.filter(result => result.category === group).map((result, index) => <button key={result.id || `${result.href}-${index}`} type="button" onClick={() => onSelect(result.href)} className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/50"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{result.title}</span>{result.subtitle && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.subtitle}</span>}</span><ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></button>)}</div></section>)}
  </div>;
}