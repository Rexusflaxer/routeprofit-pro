import React, { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import HandbookArticleEditor from "./HandbookArticleEditor";
import HandbookOverview from "./HandbookOverview";
import { archiveHandbookArticle, createHandbookArticle, listHandbookArticles, updateHandbookArticle } from "./objectHandbookWorkflow";

export default function ObjectHandbookTab({ object, view, selectedRow, searchTerm, onSearchChange, onOpenCreate, onOpenEdit, onCloseView }) {
  const queryClient = useQueryClient();
  const queryKey = ["object-card", object.id, "handbook"];
  const query = useQuery({ queryKey, queryFn: () => listHandbookArticles(object.id), retry: 1 });
  const articles = query.data || [];
  const selected = view === "edit" ? articles.find(article => article.id === selectedRow) : null;
  const finish = async () => { await queryClient.invalidateQueries({ queryKey }); onCloseView(); };
  const save = useMutation({ mutationFn: form => selected ? updateHandbookArticle(selected, form) : createHandbookArticle(object, form), onSuccess: finish });
  const remove = useMutation({ mutationFn: archiveHandbookArticle, onSuccess: finish });
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("nl-NL");
    return term ? articles.filter(article => `${article.title} ${article.content}`.toLocaleLowerCase("nl-NL").includes(term)) : articles;
  }, [articles, searchTerm]);
  if (query.isLoading) return <div className="p-6 text-xs text-muted-foreground">Handboek laden...</div>;
  if (query.isError) return <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{query.error?.message || "Het handboek kon niet worden geladen."}</div>;
  if (view === "new" || selected) return <HandbookArticleEditor article={selected} onSave={form => save.mutate(form)} onCancel={onCloseView} saving={save.isPending} error={save.error} />;
  return <HandbookOverview articles={filtered} search={searchTerm} onSearch={onSearchChange} onCreate={onOpenCreate} onEdit={onOpenEdit} onDelete={article => window.confirm(`Artikel “${article.title}” verwijderen?`) && remove.mutate(article)} archived={object.status === "archived"} deleting={remove.isPending} />;
}