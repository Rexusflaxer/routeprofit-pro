import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, LockKeyhole, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categoryBreadcrumb } from "./handbookContent";

export default function HandbookTree({ categories, articles, currentCategoryId, selectedArticleId, expandAll = false, onSelectCategory, onOpenArticle, onEditArticle, onDelete, onDeleteCategory, archived, deleting }) {
  const initialExpanded = useMemo(() => {
    const selected = articles.find(article => article.id === selectedArticleId);
    return categoryBreadcrumb(categories, selected?.category_id || currentCategoryId).map(category => category.id);
  }, [articles, categories, currentCategoryId, selectedArticleId]);
  const [expanded, setExpanded] = useState(initialExpanded);
  useEffect(() => setExpanded(current => [...new Set([...current, ...initialExpanded, ...(expandAll ? categories.map(category => category.id) : [])])]), [categories, expandAll, initialExpanded]);
  const toggle = category => {
    setExpanded(current => current.includes(category.id) ? current.filter(id => id !== category.id) : [...current, category.id]);
    onSelectCategory(category.id);
  };
  const renderArticle = (article, depth) => <div key={article.id} className={`group flex items-center rounded-lg ${selectedArticleId === article.id ? "bg-primary/10 text-primary" : "hover:bg-muted/40"}`} style={{ paddingLeft: `${24 + depth * 14}px` }}><button type="button" onClick={() => onOpenArticle(article.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-1 text-left text-xs"><FileText className="h-3.5 w-3.5 shrink-0 opacity-60" /><span className="truncate">{article.title}</span>{article.read_only && <LockKeyhole className="h-3 w-3 shrink-0 opacity-50" />}</button>{!archived && <div className="flex shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"><Button variant="ghost" size="icon" onClick={() => onEditArticle(article.id)} disabled={deleting} aria-label="Artikel bewerken" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" onClick={() => onDelete(article)} disabled={deleting || article.read_only} aria-label="Artikel verwijderen" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></div>}</div>;
  const renderLevel = (parentId = null, depth = 0) => categories
    .filter(category => (category.parent_category_id || null) === parentId)
    .sort((left, right) => Number(left.sort_order || 1000) - Number(right.sort_order || 1000) || left.name.localeCompare(right.name, "nl"))
    .map(category => {
      const open = expanded.includes(category.id);
      const children = categories.some(item => (item.parent_category_id || null) === category.id);
      const categoryArticles = articles.filter(article => (article.category_id || null) === category.id).sort((left, right) => Number(left.sort_order || 1000) - Number(right.sort_order || 1000) || left.title.localeCompare(right.title, "nl"));
      return <div key={category.id}>
        <div className={`group flex items-center rounded-lg ${currentCategoryId === category.id ? "bg-muted/60" : "hover:bg-muted/40"}`}>
          <button type="button" onClick={() => toggle(category)} className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pr-2 text-left text-sm font-medium" style={{ paddingLeft: `${8 + depth * 14}px` }}>
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""} ${!children && !categoryArticles.length ? "opacity-30" : ""}`} />
            <span className="truncate">{category.name}</span>{category.protected && <LockKeyhole className="h-3 w-3 shrink-0 text-muted-foreground" />}
          </button>
          {!archived && !category.protected && <Button variant="ghost" size="icon" onClick={() => onDeleteCategory(category)} disabled={deleting} aria-label="Categorie verwijderen" className="h-7 w-7 shrink-0 text-destructive opacity-60 sm:opacity-0 sm:group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></Button>}
        </div>
        {open && <div>{renderLevel(category.id, depth + 1)}{categoryArticles.map(article => renderArticle(article, depth))}</div>}
      </div>;
    });
  const uncategorized = articles.filter(article => !article.category_id);
  return <nav aria-label="Handboekcategorieën" className="space-y-0.5">{renderLevel()}{uncategorized.map(article => renderArticle(article, 0))}</nav>;
}
