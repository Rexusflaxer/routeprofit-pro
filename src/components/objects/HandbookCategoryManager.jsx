import React, { useMemo, useState } from "react";
import { Folder, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function flatten(categories, parentId = null, depth = 0) {
  return categories.filter(item => (item.parent_category_id || null) === parentId).flatMap(item => [{ ...item, depth }, ...flatten(categories, item.id, depth + 1)]);
}

export default function HandbookCategoryManager({ categories, articles, onCreate, saving, archived }) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const rows = useMemo(() => flatten(categories), [categories]);
  const submit = event => { event.preventDefault(); if (!name.trim()) return; onCreate({ name, parent_category_id: parentId || null }, () => setName("")); };
  return (
    <section className="border-b border-border/70 bg-muted/10 p-4">
      <div className="mb-3 flex items-center gap-2"><Folder className="h-4 w-4 text-muted-foreground" /><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorieën</h3></div>
      {!archived && <form onSubmit={submit} className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input value={name} onChange={event => setName(event.target.value)} placeholder="Naam van categorie" maxLength={120} /><select value={parentId} onChange={event => setParentId(event.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-xs"><option value="">Hoofdcategorie</option>{rows.map(item => <option key={item.id} value={item.id}>{"— ".repeat(item.depth)}{item.name}</option>)}</select><Button type="submit" size="sm" disabled={!name.trim() || saving}><FolderPlus className="h-4 w-4" /> {saving ? "Aanmaken..." : "Categorie aanmaken"}</Button></form>}
      {rows.length ? <div className="flex flex-wrap gap-2">{rows.map(item => <div key={item.id} style={{ marginLeft: `${item.depth * 12}px` }} className="rounded-md border border-border/70 bg-card/60 px-2.5 py-1.5 text-xs"><span className="font-medium">{item.depth ? "↳ " : ""}{item.name}</span><span className="ml-2 text-muted-foreground">{articles.filter(article => article.category_id === item.id).length}</span></div>)}</div> : <p className="text-xs text-muted-foreground">Nog geen categorieën aangemaakt.</p>}
    </section>
  );
}