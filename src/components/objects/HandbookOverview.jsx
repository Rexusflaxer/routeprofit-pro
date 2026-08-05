import React from "react";
import { BookOpen, ChevronLeft, Folder, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import HandbookCategoryManager from "./HandbookCategoryManager";

export default function HandbookOverview({ articles, currentCategory, childCategories, onOpenCategory, onBack, onCreateCategory, categorySaving, search, onSearch, onCreate, onEdit, onDelete, archived, deleting }) {
  const hasContent = childCategories.length > 0 || articles.length > 0;
  return (
    <div className="min-h-[620px]">
      <div className="flex flex-col gap-3 border-b border-border/70 bg-card/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">{currentCategory && <Button variant="ghost" size="icon" onClick={onBack} aria-label="Terug"><ChevronLeft className="h-4 w-4" /></Button>}<div><h2 className="text-sm font-semibold">{currentCategory?.name || "Handboek"}</h2><p className="mt-0.5 text-xs text-muted-foreground">{articles.length} artikel{articles.length === 1 ? "" : "en"}</p></div></div>
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => onSearch(event.target.value)} placeholder="Zoek in het handboek..." className="h-9 pl-9 sm:w-72" /></div><HandbookCategoryManager parentCategoryId={currentCategory?.id} onCreate={onCreateCategory} saving={categorySaving} archived={archived} /><Button size="sm" onClick={onCreate} disabled={archived}><Plus className="h-4 w-4" /> Artikel schrijven</Button></div>
      </div>
      {hasContent ? <div>
        {childCategories.length > 0 && <div className="grid gap-2 border-b border-border/70 p-4 sm:grid-cols-2 lg:grid-cols-3">{childCategories.map(category => <button key={category.id} type="button" onClick={() => onOpenCategory(category.id)} className="flex items-center gap-3 rounded-lg border border-border/70 bg-card/45 p-3 text-left hover:bg-muted/30"><Folder className="h-4 w-4 text-primary" /><span className="truncate text-sm font-medium">{category.name}</span></button>)}</div>}
        {articles.length > 0 && <div className="divide-y divide-border/70">{articles.map(article => <article key={article.id} className="flex items-start gap-3 px-4 py-4 hover:bg-muted/20"><div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary"><BookOpen className="h-4 w-4" /></div><button type="button" onClick={() => onEdit(article.id)} className="min-w-0 flex-1 text-left"><h3 className="truncate text-sm font-semibold">{article.title}</h3><p className="mt-1 line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{article.content}</p></button>{!archived && <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => onEdit(article.id)} aria-label="Artikel bewerken"><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => onDelete(article)} disabled={deleting} aria-label="Artikel verwijderen" className="text-destructive"><Trash2 className="h-4 w-4" /></Button></div>}</article>)}</div>}
      </div> : <div className="flex min-h-[450px] flex-col items-center justify-center p-8 text-center"><BookOpen className="h-8 w-8 text-muted-foreground" /><h3 className="mt-3 text-sm font-medium">{search ? "Geen artikelen gevonden" : "Deze categorie is leeg"}</h3><p className="mt-1 text-xs text-muted-foreground">{search ? "Pas de zoekopdracht aan." : "Maak een categorie aan of schrijf een artikel."}</p></div>}
    </div>
  );
}