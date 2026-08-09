import React, { useMemo } from "react";
import { BookOpenCheck, ChevronRight, FileText, FolderTree, SearchX, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { categoryBreadcrumb } from "./handbookContent";

function ArticleCard({ article, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(article.id)} className="group flex w-full items-start gap-3 rounded-2xl border border-border/70 bg-card/45 p-4 text-left shadow-sm transition hover:border-primary/35 hover:bg-primary/5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/70"><FileText className="h-4 w-4 text-primary" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-foreground group-hover:text-primary">{article.title}</span>{article.origin === "installation_template" && <Badge variant="outline" className="h-5 px-1.5 text-[9px]"><Sparkles className="mr-1 h-2.5 w-2.5" /> Installatie</Badge>}</span>
        {article.summary && <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{article.summary}</span>}
      </span>
      <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}

function CategoryCard({ category, count, onSelect }) {
  return (
    <button type="button" onClick={() => onSelect(category.id)} className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card/40 p-4 text-left shadow-sm transition hover:border-primary/35 hover:bg-primary/5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/70"><FolderTree className="h-4 w-4 text-primary" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold group-hover:text-primary">{category.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{count} direct artikel{count === 1 ? "" : "en"}</span></span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}

export default function HandbookLanding({ articles, categories, currentCategory, search, onOpenArticle, onSelectCategory }) {
  const searchActive = Boolean(search.trim());
  const childCategories = useMemo(() => categories
    .filter(category => (category.parent_category_id || null) === (currentCategory?.id || null))
    .sort((left, right) => Number(left.sort_order || 1000) - Number(right.sort_order || 1000) || left.name.localeCompare(right.name, "nl")), [categories, currentCategory?.id]);
  const visibleArticles = useMemo(() => (searchActive
    ? articles
    : articles.filter(article => (article.category_id || null) === (currentCategory?.id || null)))
    .sort((left, right) => Number(left.sort_order || 1000) - Number(right.sort_order || 1000) || left.title.localeCompare(right.title, "nl")), [articles, currentCategory?.id, searchActive]);
  const breadcrumb = currentCategory ? categoryBreadcrumb(categories, currentCategory.id) : [];
  const title = searchActive ? `Zoekresultaten voor “${search.trim()}”` : currentCategory?.name || "Objecthandboek";
  const description = searchActive
    ? `${visibleArticles.length} relevant${visibleArticles.length === 1 ? "" : "e"} artikel${visibleArticles.length === 1 ? "" : "en"} gevonden in alle categorieën.`
    : currentCategory
      ? "Open een artikel of ga verder naar een onderliggende categorie."
      : "Alle operationele instructies en automatisch gekoppelde installatiehandleidingen van dit object.";
  return (
    <div className="min-h-[520px] p-4 sm:p-6">
      {currentCategory && <nav aria-label="Kruimelpad" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><button type="button" onClick={() => onSelectCategory(null)} className="hover:text-primary hover:underline">Handboek</button><span>/</span>{breadcrumb.map((category, index) => <React.Fragment key={category.id}><button type="button" onClick={() => onSelectCategory(category.id)} className="hover:text-primary hover:underline">{category.name}</button>{index < breadcrumb.length - 1 && <span>/</span>}</React.Fragment>)}</nav>}
      <header className="mb-5"><div className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold tracking-tight">{title}</h2></div><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p></header>
      {!searchActive && childCategories.length > 0 && <section><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Subcategorieën</p><div className="grid gap-3 lg:grid-cols-2">{childCategories.map(category => <CategoryCard key={category.id} category={category} count={articles.filter(article => article.category_id === category.id).length} onSelect={onSelectCategory} />)}</div></section>}
      {visibleArticles.length > 0 && <section className={childCategories.length && !searchActive ? "mt-6" : ""}><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{searchActive ? "Gevonden artikelen" : "Artikelen"}</p><div className="grid gap-3 xl:grid-cols-2">{visibleArticles.map(article => <ArticleCard key={article.id} article={article} onOpen={onOpenArticle} />)}</div></section>}
      {!visibleArticles.length && (!childCategories.length || searchActive) && <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 p-8 text-center"><SearchX className="h-7 w-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{searchActive ? "Geen artikelen gevonden" : "Deze categorie is nog leeg"}</p><p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{searchActive ? "Probeer een andere zoekterm of wis de zoekopdracht." : "Voeg een artikel toe of kies een andere categorie in de navigatie."}</p></div>}
    </div>
  );
}
