import React, { useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HandbookTree({ categories, articles, selectedArticleId, onSelectCategory, onOpenArticle, onDelete, onDeleteCategory, archived, deleting }) {
  const [expanded, setExpanded] = useState([]);
  const toggle = category => {
    setExpanded(current => current.includes(category.id) ? current.filter(id => id !== category.id) : [...current, category.id]);
    onSelectCategory(category.id);
  };
  const renderLevel = (parentId = null, depth = 0) => categories
    .filter(category => (category.parent_category_id || null) === parentId)
    .map(category => {
      const open = expanded.includes(category.id);
      const children = categories.some(item => (item.parent_category_id || null) === category.id);
      const categoryArticles = articles.filter(article => (article.category_id || null) === category.id);
      return <div key={category.id}>
        <div className="group flex items-center rounded-md hover:bg-muted/50">
          <button type="button" onClick={() => toggle(category)} className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pr-2 text-left text-sm font-medium" style={{ paddingLeft: `${8 + depth * 14}px` }}>
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""} ${!children && !categoryArticles.length ? "opacity-30" : ""}`} />
            <span className="truncate">{category.name}</span>
          </button>
          {!archived && <Button variant="ghost" size="icon" onClick={() => onDeleteCategory(category)} disabled={deleting} aria-label="Categorie verwijderen" className="h-7 w-7 shrink-0 text-destructive opacity-60 sm:opacity-0 sm:group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></Button>}
        </div>
        {open && <div>{renderLevel(category.id, depth + 1)}{categoryArticles.map(article => <div key={article.id} className={`group flex items-center rounded-md ${selectedArticleId === article.id ? "bg-primary/10 text-primary" : "hover:bg-muted/40"}`} style={{ paddingLeft: `${26 + depth * 14}px` }}><button type="button" onClick={() => onOpenArticle(article.id)} className="min-w-0 flex-1 truncate py-2 pr-1 text-left text-xs">{article.title}</button>{!archived && <Button variant="ghost" size="icon" onClick={() => onDelete(article)} disabled={deleting} aria-label="Artikel verwijderen" className="h-7 w-7 shrink-0 text-destructive opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></Button>}</div>)}</div>}
      </div>;
    });
  const uncategorized = articles.filter(article => !article.category_id);
  return <nav aria-label="Handboekcategorieën" className="space-y-0.5">{renderLevel()}{uncategorized.map(article => <button key={article.id} type="button" onClick={() => onOpenArticle(article.id)} className={`w-full truncate rounded-md px-2 py-2 text-left text-xs ${selectedArticleId === article.id ? "bg-primary/10 text-primary" : "hover:bg-muted/40"}`}>{article.title}</button>)}</nav>;
}