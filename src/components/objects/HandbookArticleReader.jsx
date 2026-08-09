import React from "react";
import { ArrowLeft, BookOpenCheck, ExternalLink, LockKeyhole, Pencil, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import HandbookArticleRenderer from "./HandbookArticleRenderer";
import { categoryBreadcrumb } from "./handbookContent";

export default function HandbookArticleReader({ article, categories, onBack, onEdit, onOpenArticle, onOpenCategory, disabled }) {
  const breadcrumb = categoryBreadcrumb(categories, article.category_id);
  const generated = article.origin === "installation_template";
  return (
    <div className="min-h-[620px] bg-card/30">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/35 px-4 py-3 backdrop-blur-xl sm:px-6">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Handboek</Button>
        {!disabled && <Button type="button" variant="outline" size="sm" onClick={onEdit}><Pencil className="h-4 w-4" /> {generated ? "Objectspecifieke aanvulling" : "Artikel bewerken"}</Button>}
      </div>
      <article className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
        {breadcrumb.length > 0 && <nav aria-label="Kruimelpad" className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{breadcrumb.map((category, index) => <React.Fragment key={category.id}><button type="button" onClick={() => onOpenCategory(category.id)} className="hover:text-primary hover:underline">{category.name}</button>{index < breadcrumb.length - 1 && <span>/</span>}</React.Fragment>)}</nav>}
        <header className="mb-7 overflow-hidden rounded-2xl border border-border/70 bg-card/45 shadow-sm backdrop-blur-xl">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              {generated ? <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary"><Sparkles className="mr-1 h-3 w-3" /> Installatiehandleiding</Badge> : <Badge variant="outline"><BookOpenCheck className="mr-1 h-3 w-3" /> Handboekartikel</Badge>}
              {generated && <Badge variant="outline"><LockKeyhole className="mr-1 h-3 w-3" /> Fabrikantinstructie beschermd</Badge>}
              {article.source_manual_version && <Badge variant="outline">Versie {article.source_manual_version}</Badge>}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{article.title}</h1>
            {article.summary && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{article.summary}</p>}
          </div>
          {generated && <div className="border-t border-amber-300/60 bg-amber-500/5 px-5 py-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900/70 dark:text-amber-100">Objectspecifieke instructies, meldkamerafspraken en bevoegdheden gaan altijd voor op de algemene fabrikantbediening. Gebruik uitsluitend je eigen bevoegdheid en controleer na iedere handeling de werkelijke status.</div>}
        </header>
        <HandbookArticleRenderer article={article} onOpenArticle={onOpenArticle} onOpenCategory={onOpenCategory} />
        {Array.isArray(article.source_urls) && article.source_urls.length > 0 && <footer className="mt-8 rounded-2xl border border-border/70 bg-card/35 p-4 backdrop-blur-xl"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gecontroleerde fabrikantbronnen</p><div className="mt-2 flex flex-col gap-2">{article.source_urls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 break-all text-xs text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5 shrink-0" /> {url}</a>)}</div></footer>}
      </article>
    </div>
  );
}
