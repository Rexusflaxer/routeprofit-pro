import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { updateManagedFileSource, uploadManagedFile } from "@/lib/managedFiles";
import HandbookArticleEditor from "./HandbookArticleEditor";
import HandbookArticleReader from "./HandbookArticleReader";
import HandbookLanding from "./HandbookLanding";
import HandbookOverview from "./HandbookOverview";
import { handbookArticleSearchText } from "./handbookContent";
import { useObjectModuleNavigationGuard } from "./useObjectModuleNavigationGuard";
import {
  archiveHandbookArticle,
  archiveHandbookCategory,
  createHandbookArticle,
  createHandbookCategory,
  createHandbookMutationKey,
  listObjectHandbook,
  syncInstallationHandbooks,
  updateHandbookArticle,
} from "./objectHandbookWorkflow";

function managedFileIds(blocks = []) {
  return new Set(blocks.map(block => block?.managed_file_id).filter(Boolean));
}

export default function ObjectHandbookTab({ object, view, selectedRow, selectedCategoryId, selectedInstallationId, searchTerm, onSearchChange, onSelectCategory, onOpenCreate, onOpenEdit, onOpenArticle, onCloseView, onRegisterNavigationGuard }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["object-card", object.id, "handbook"];
  const query = useQuery({ queryKey, queryFn: () => listObjectHandbook({ customerId: object.customer_id, objectId: object.id }), retry: 1 });
  const articles = query.data?.articles || [];
  const categories = query.data?.categories || [];
  const linkedInstallationCategory = selectedInstallationId
    ? categories.find(category => category.source_installation_id === selectedInstallationId && category.status === "active") || null
    : null;
  const currentCategory = categories.find(category => category.id === selectedCategoryId) || linkedInstallationCategory || null;
  const selected = articles.find(article => article.id === selectedRow) || null;
  const saveKeyRef = useRef(null);
  const categoryCreateKeyRef = useRef(null);
  const archiveKeysRef = useRef(new Map());
  const syncAttemptRef = useRef(null);
  const pendingUploadIdsRef = useRef(new Set());
  const activeUploadsRef = useRef(new Set());
  const editorDraftRef = useRef(null);
  const guardSaveRef = useRef(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [uploadInFlight, setUploadInFlight] = useState(0);
  const [hasPendingUploads, setHasPendingUploads] = useState(false);
  const [editBase, setEditBase] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const discardPendingUploads = useCallback(async () => {
    if (activeUploadsRef.current.size) await Promise.allSettled([...activeUploadsRef.current]);
    const ids = [...pendingUploadIdsRef.current];
    if (!ids.length) {
      setHasPendingUploads(false);
      return;
    }
    const results = await Promise.allSettled(ids.map(id => updateManagedFileSource(id, { status: "deleted", source_entity_id: null })));
    results.forEach((result, index) => { if (result.status === "fulfilled") pendingUploadIdsRef.current.delete(ids[index]); });
    const failed = results.filter(result => result.status === "rejected").length;
    setHasPendingUploads(pendingUploadIdsRef.current.size > 0);
    if (failed) {
      toast({ title: "Afbeelding opruimen mislukt", description: "De pagina blijft open zodat geen los privébestand achterblijft. Probeer opnieuw.", variant: "destructive" });
      throw new Error("Een tijdelijke handboekafbeelding kon niet worden opgeruimd");
    }
  }, [toast]);
  const settleManagedUploads = useCallback(async (article, form) => {
    if (!article?.id) return;
    const savedIds = managedFileIds(form?.supplement_blocks || article.supplement_blocks);
    const originalIds = managedFileIds(editBase?.supplement_blocks || selected?.supplement_blocks);
    const pendingIds = [...pendingUploadIdsRef.current];
    const operations = [
      ...pendingIds.map(id => savedIds.has(id)
        ? updateManagedFileSource(id, { source_entity: "ObjectHandbookArticle", source_entity_id: article.id, source_field: "supplement_blocks", status: "active" })
        : updateManagedFileSource(id, { status: "deleted", source_entity_id: null })),
      ...[...originalIds].filter(id => !savedIds.has(id)).map(id => updateManagedFileSource(id, { status: "superseded" })),
    ];
    const results = await Promise.allSettled(operations);
    pendingIds.forEach((id, index) => { if (results[index]?.status === "fulfilled") pendingUploadIdsRef.current.delete(id); });
    setHasPendingUploads(pendingUploadIdsRef.current.size > 0);
    if (results.some(result => result.status === "rejected")) {
      throw new Error("Het artikel is opgeslagen, maar een privéafbeelding kon nog niet definitief worden gekoppeld. Probeer Opslaan opnieuw.");
    }
  }, [editBase?.supplement_blocks, selected?.supplement_blocks]);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "installations"] }),
      queryClient.invalidateQueries({ queryKey: ["object-card", object.id, "logbook"] }),
    ]);
  };
  const save = useMutation({
    mutationFn: async form => {
      const baseArticle = editBase || selected;
      const result = baseArticle
        ? await updateHandbookArticle({ customerId: object.customer_id, objectId: object.id, article: baseArticle, form, idempotencyKey: saveKeyRef.current?.key })
        : await createHandbookArticle({ customerId: object.customer_id, objectId: object.id, form, idempotencyKey: saveKeyRef.current?.key });
      await settleManagedUploads(result.article, form);
      return result;
    },
    onSuccess: async result => {
      await refresh();
      saveKeyRef.current = null;
      setEditorDirty(false);
      setEditBase(null);
      toast({ title: (editBase || selected) ? "Handboekartikel opgeslagen" : "Handboekartikel toegevoegd" });
      if (!guardSaveRef.current) {
        if (result.article?.id) onOpenArticle(result.article.id, result.article.category_id || null);
        else onCloseView();
      }
    },
    onError: async error => { if (error.status === 409) await refresh(); },
  });
  const remove = useMutation({
    mutationFn: article => archiveHandbookArticle({ customerId: object.customer_id, objectId: object.id, article, idempotencyKey: archiveKeysRef.current.get(`article:${article.id}`) }),
    onSuccess: async (_, article) => { archiveKeysRef.current.delete(`article:${article.id}`); setArchiveTarget(null); await refresh(); onCloseView(); toast({ title: "Artikel gearchiveerd" }); },
    onError: async error => { if (error.status === 409) await refresh(); toast({ title: "Archiveren mislukt", description: error.message, variant: "destructive" }); },
  });
  const createCategory = useMutation({
    mutationFn: ({ done: _done, ...form }) => {
      const fingerprint = JSON.stringify([String(form.name || "").trim(), form.parent_category_id || null]);
      if (categoryCreateKeyRef.current?.fingerprint !== fingerprint) categoryCreateKeyRef.current = { fingerprint, key: createHandbookMutationKey("create_object_handbook_category") };
      return createHandbookCategory({ customerId: object.customer_id, objectId: object.id, form, idempotencyKey: categoryCreateKeyRef.current.key });
    },
    onSuccess: async (result, variables) => { categoryCreateKeyRef.current = null; await refresh(); variables.done?.(); if (result.handbook_category?.id && !["edit", "new"].includes(view)) onSelectCategory(result.handbook_category.id); },
    onError: error => toast({ title: "Categorie toevoegen mislukt", description: error.message, variant: "destructive" }),
  });
  const removeCategory = useMutation({
    mutationFn: category => archiveHandbookCategory({ customerId: object.customer_id, objectId: object.id, category, idempotencyKey: archiveKeysRef.current.get(`category:${category.id}`) }),
    onSuccess: async (_, category) => { archiveKeysRef.current.delete(`category:${category.id}`); setArchiveTarget(null); if (currentCategory?.id === category.id) onSelectCategory(null); await refresh(); },
    onError: async error => { if (error.status === 409) await refresh(); toast({ title: "Categorie verwijderen mislukt", description: error.message, variant: "destructive" }); },
  });
  const sync = useMutation({
    mutationFn: ({ token }) => syncInstallationHandbooks({ customerId: object.customer_id, objectId: object.id, syncToken: token, idempotencyKey: `sync_object_installation_handbooks:${object.id}:${token}` }),
    onSuccess: async result => { await refresh(); if (Number(result.created_articles || 0) + Number(result.updated_articles || 0) > 0) toast({ title: "Installatiehandleidingen bijgewerkt" }); },
  });

  useEffect(() => {
    saveKeyRef.current = null;
    editorDraftRef.current = null;
    save.reset();
  }, [selectedRow, view]);
  useEffect(() => {
    if (view !== "edit" || !selected) {
      setEditBase(null);
      return;
    }
    setEditBase(current => current?.id === selected.id ? current : selected);
  }, [selected, view]);
  useEffect(() => {
    const token = query.data?.sync_required ? query.data?.sync_token : null;
    if (!token || object.status === "archived" || sync.isPending || syncAttemptRef.current === token) return;
    syncAttemptRef.current = token;
    sync.mutate({ token });
  }, [object.status, query.data?.sync_required, query.data?.sync_token, sync.isPending]);
  useEffect(() => {
    if (!selectedRow || query.isLoading || query.isError || selected) return;
    onCloseView();
  }, [onCloseView, query.isError, query.isLoading, selected, selectedRow]);
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("nl-NL");
    return term ? articles.filter(article => handbookArticleSearchText(article, categories).toLocaleLowerCase("nl-NL").includes(term)) : articles;
  }, [articles, categories, searchTerm]);
  const uploadImage = async file => {
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file?.type)) throw new Error("Kies een JPEG-, PNG- of WebP-afbeelding.");
    if (!Number.isFinite(file?.size) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error("De afbeelding mag maximaal 10 MB groot zijn.");
    const uploadPromise = uploadManagedFile({
      file,
      ownerType: "object",
      ownerId: object.id,
      objectId: object.id,
      ownerLabel: object.name,
      domain: "operations",
      category: "handbook",
      sourceEntity: "ObjectHandbookArticle",
      sourceEntityId: selected?.id || null,
      sourceField: "supplement_blocks",
      documentLabel: "Handboekafbeelding",
      folderSegments: ["handboek", selected?.id || "concept"],
      privateStorage: true,
    });
    activeUploadsRef.current.add(uploadPromise);
    setUploadInFlight(activeUploadsRef.current.size);
    try {
      const uploaded = await uploadPromise;
      pendingUploadIdsRef.current.add(uploaded.managed_file_id);
      setHasPendingUploads(true);
      return uploaded;
    } finally {
      activeUploadsRef.current.delete(uploadPromise);
      setUploadInFlight(activeUploadsRef.current.size);
    }
  };
  const prepareArticleSave = useCallback(form => {
    const fingerprint = JSON.stringify(form);
    if (saveKeyRef.current?.fingerprint !== fingerprint) {
      saveKeyRef.current = {
        fingerprint,
        key: createHandbookMutationKey((editBase || selected) ? "update_object_handbook_article" : "create_object_handbook_article"),
      };
    }
    return form;
  }, [editBase, selected]);
  const submitArticle = form => save.mutate(prepareArticleSave(form));
  const saveEditorDraft = useCallback(async () => {
    const draft = editorDraftRef.current;
    if (!draft?.valid) {
      toast({ title: "Artikel nog niet compleet", description: "Vul de verplichte artikelonderdelen in voordat u opslaat.", variant: "destructive" });
      throw new Error("Het handboekartikel is nog niet compleet");
    }
    guardSaveRef.current = true;
    try {
      await save.mutateAsync(prepareArticleSave(draft.form));
    } finally {
      guardSaveRef.current = false;
    }
  }, [prepareArticleSave, save, toast]);
  const handleDraftChange = useCallback(draft => { editorDraftRef.current = draft; }, []);
  const navigation = useObjectModuleNavigationGuard({
    dirty: editorDirty || uploadInFlight > 0 || hasPendingUploads,
    moduleName: "dit handboekartikel",
    onSave: saveEditorDraft,
    onDiscard: discardPendingUploads,
    saving: save.isPending || uploadInFlight > 0,
    onRegisterNavigationGuard,
  });
  const requestNavigation = navigation.requestNavigation;
  const openArticleInContext = useCallback(id => {
    const article = articles.find(item => item.id === id);
    onOpenArticle(id, article?.category_id || null);
  }, [articles, onOpenArticle]);
  const deleteCategory = category => {
    const hasChildren = categories.some(item => (item.parent_category_id || null) === category.id);
    const hasArticles = articles.some(article => (article.category_id || null) === category.id);
    if (hasChildren || hasArticles) {
      toast({ title: "Categorie is niet leeg", description: "Verplaats of archiveer eerst de onderliggende categorieën en artikelen.", variant: "destructive" });
      return;
    }
    const key = `category:${category.id}`;
    if (!archiveKeysRef.current.has(key)) archiveKeysRef.current.set(key, createHandbookMutationKey("archive_object_handbook_category"));
    setArchiveTarget({ type: "category", record: category });
  };
  const deleteArticle = article => {
    if (article.read_only) return;
    const key = `article:${article.id}`;
    if (!archiveKeysRef.current.has(key)) archiveKeysRef.current.set(key, createHandbookMutationKey("archive_object_handbook_article"));
    setArchiveTarget({ type: "article", record: article });
  };

  if (query.isLoading) return <div className="flex min-h-[620px] items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Handboek laden...</div>;
  if (query.isError) return <div className="m-4 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4"><AlertCircle className="h-4 w-4 text-destructive" /><div className="flex-1 text-sm text-destructive">Het handboek kon niet worden geladen.<p className="mt-1 text-xs opacity-80">{query.error?.message}</p></div><Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" /> Opnieuw</Button></div>;

  const reading = selected && ["detail", "manual", "read"].includes(view);
  const editing = view === "new" || (selected && view === "edit");
  const content = reading
    ? <HandbookArticleReader article={selected} categories={categories} onBack={onCloseView} onEdit={() => onOpenEdit(selected.id)} onOpenArticle={openArticleInContext} onOpenCategory={onSelectCategory} disabled={object.status === "archived"} />
    : editing
      ? <HandbookArticleEditor key={view === "new" ? `new:${currentCategory?.protected ? "root" : currentCategory?.id || "root"}` : `${(editBase || selected)?.id}:${(editBase || selected)?.version}`} article={view === "new" ? null : editBase || selected} defaultCategoryId={currentCategory?.protected ? "" : currentCategory?.id || ""} categories={categories} articles={articles} onSave={submitArticle} onCancel={() => requestNavigation(onCloseView)} onOpenArticle={id => requestNavigation(() => openArticleInContext(id))} onOpenCategory={id => requestNavigation(() => onSelectCategory(id))} onUploadImage={uploadImage} onDirtyChange={setEditorDirty} onDraftChange={handleDraftChange} saving={save.isPending || uploadInFlight > 0} error={save.error} />
      : <HandbookLanding articles={filtered} categories={categories} currentCategory={currentCategory} search={searchTerm} onOpenArticle={openArticleInContext} onSelectCategory={onSelectCategory} />;

  return <div className="relative">
    {query.data?.migration_issues?.length > 0 && <div className="flex items-start gap-3 border-b border-amber-300/50 bg-amber-500/5 px-4 py-3 text-xs text-amber-950 dark:border-amber-900/70 dark:text-amber-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>Voor {query.data.migration_issues.map(issue => issue.name).join(", ")} ontbreekt nog het Ajax-bedienpaneel. Open de installatie en kies de juiste bedieningswijze voordat LOQ de handleidingen kan koppelen.</span></div>}
    {(sync.isPending || sync.isError) && <div className={`flex items-center gap-3 border-b px-4 py-3 text-xs ${sync.isError ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/20 bg-primary/5 text-muted-foreground"}`}><Sparkles className={`h-4 w-4 ${sync.isPending ? "animate-pulse text-primary" : ""}`} /><span className="flex-1">{sync.isPending ? "De toepasselijke installatiehandleidingen worden veilig in het handboek geplaatst..." : sync.error?.message || "De installatiehandleidingen konden niet worden bijgewerkt."}</span>{sync.isError && query.data?.sync_token && <Button type="button" size="sm" variant="outline" onClick={() => { syncAttemptRef.current = null; sync.mutate({ token: query.data.sync_token }); }}><RefreshCw className="h-3.5 w-3.5" /> Opnieuw</Button>}</div>}
    <HandbookOverview articles={filtered} categories={categories} currentCategory={currentCategory} selectedArticleId={selected?.id || null} onSelectCategory={id => requestNavigation(() => onSelectCategory(id))} onCreateCategory={(form, done) => createCategory.mutate({ ...form, done })} categorySaving={createCategory.isPending} onDeleteCategory={deleteCategory} categoryDeleting={removeCategory.isPending} search={searchTerm} onSearch={value => requestNavigation(() => onSearchChange(value))} onCreate={() => requestNavigation(onOpenCreate)} onOpenArticle={id => requestNavigation(() => openArticleInContext(id))} onEditArticle={id => requestNavigation(() => onOpenEdit(id))} onDelete={deleteArticle} archived={object.status === "archived"} deleting={remove.isPending}>{content}</HandbookOverview>
    {navigation.dialog}
    <AlertDialog open={Boolean(archiveTarget)} onOpenChange={open => { if (!open && !remove.isPending && !removeCategory.isPending) setArchiveTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{archiveTarget?.type === "category" ? "Categorie archiveren?" : "Handboekartikel archiveren?"}</AlertDialogTitle>
          <AlertDialogDescription>{archiveTarget?.type === "category" ? `“${archiveTarget.record?.name || "Deze categorie"}” verdwijnt uit de actieve handboekboom. De objecthistorie blijft bewaard.` : `“${archiveTarget?.record?.title || "Dit artikel"}” verdwijnt uit het actieve handboek. Interne verwijzingen moeten vooraf zijn verwijderd.`}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending || removeCategory.isPending}>Annuleren</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={remove.isPending || removeCategory.isPending} onClick={event => { event.preventDefault(); if (archiveTarget?.type === "category") removeCategory.mutate(archiveTarget.record); else if (archiveTarget?.record) remove.mutate(archiveTarget.record); }}>
            {(remove.isPending || removeCategory.isPending) && <Loader2 className="h-4 w-4 animate-spin" />} Archiveren
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
