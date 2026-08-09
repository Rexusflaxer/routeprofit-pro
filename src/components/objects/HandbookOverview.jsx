import React from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import HandbookCategoryManager from "./HandbookCategoryManager";
import HandbookTree from "./HandbookTree";

export default function HandbookOverview({ articles, categories, currentCategory, selectedArticleId, onSelectCategory, onCreateCategory, categorySaving, onDeleteCategory, categoryDeleting, search, onSearch, onCreate, onEdit, onDelete, archived, deleting, children }) {
  const hasContent = categories.length > 0 || articles.length > 0;
  return (
    <div className="min-h-[620px]">
      <div className="flex flex-col gap-3 border-b border-border/70 bg-card/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-sm font-semibold">Handboek</h2><p className="mt-0.5 text-xs text-muted-foreground">{articles.length} artikel{articles.length === 1 ? "" : "en"}</p></div>
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={event => onSearch(event.target.value)} placeholder="Zoek in het handboek..." className="h-9 pl-9 sm:w-72" /></div><HandbookCategoryManager parentCategoryId={currentCategory?.id} onCreate={onCreateCategory} saving={categorySaving} archived={archived} /><Button size="sm" onClick={onCreate} disabled={archived}><Plus className="h-4 w-4" /> Artikel schrijven</Button></div>
      </div>
      <div className="flex min-h-[520px] flex-col sm:flex-row">
        <aside className="w-full shrink-0 border-b border-border/70 bg-card/20 p-3 sm:w-64 sm:border-b-0 sm:border-r"><p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Categorieën</p>{hasContent ? <HandbookTree categories={categories} articles={articles} selectedArticleId={selectedArticleId} onSelectCategory={onSelectCategory} onOpenArticle={onEdit} onDelete={onDelete} onDeleteCategory={onDeleteCategory} archived={archived} deleting={deleting || categoryDeleting} /> : <p className="px-2 py-3 text-xs text-muted-foreground">Nog geen categorieën.</p>}</aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}