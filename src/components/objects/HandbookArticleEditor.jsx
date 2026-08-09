import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ImagePlus, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import HandbookArticleRenderer from "./HandbookArticleRenderer";
import {
  HANDBOOK_ASSETS,
  HANDBOOK_BLOCK_LABELS,
  HANDBOOK_CONTENT_FORMAT,
  articleOptionLabel,
  categoryOptionLabel,
  legacyArticleBlocks,
  newHandbookBlock,
} from "./handbookContent";

const ADDABLE_BLOCK_TYPES = ["paragraph", "heading", "steps", "callout", "image", "button_sequence", "link", "divider"];
const OFFICIAL_ICONS = Object.entries(HANDBOOK_ASSETS).filter(([, asset]) => asset.kind === "icon");
const MAX_BLOCKS = 80;
const MAX_STEPS = 40;
const MAX_SEQUENCE_ITEMS = 20;

function FieldLabel({ children }) {
  return <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>;
}

function BlockActions({ index, total, onMove, onDelete }) {
  return <div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label="Blok omhoog"><ArrowUp className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === total - 1} onClick={() => onMove(index, index + 1)} aria-label="Blok omlaag"><ArrowDown className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(index)} aria-label="Blok verwijderen"><Trash2 className="h-3.5 w-3.5" /></Button></div>;
}

function BlockEditor({ block, index, total, categories, articles, onChange, onMove, onDelete, onUploadImage, uploading }) {
  const fileRef = useRef(null);
  const patch = values => onChange(index, { ...block, ...values });
  const targetValue = block.target_id ? `${block.target_type}:${block.target_id}` : "";
  const categoryOptions = [...categories].sort((left, right) => categoryOptionLabel(categories, left).localeCompare(categoryOptionLabel(categories, right), "nl"));
  const articleOptions = [...articles].sort((left, right) => articleOptionLabel(categories, left).localeCompare(articleOptionLabel(categories, right), "nl"));
  return (
    <section className="rounded-2xl border border-border/70 bg-card/45 p-4 shadow-sm backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-semibold">{HANDBOOK_BLOCK_LABELS[block.type] || block.type}</p><BlockActions index={index} total={total} onMove={onMove} onDelete={onDelete} /></div>
      {block.type === "paragraph" && <Textarea value={block.text || ""} onChange={event => patch({ text: event.target.value })} placeholder="Schrijf een duidelijke alinea..." maxLength={6000} className="min-h-28 resize-y leading-relaxed" />}
      {block.type === "heading" && <div className="grid gap-3 sm:grid-cols-[1fr_120px]"><div><FieldLabel>Tussenkop</FieldLabel><Input value={block.text || ""} onChange={event => patch({ text: event.target.value })} maxLength={300} placeholder="Onderwerp" /></div><div><FieldLabel>Niveau</FieldLabel><select value={block.level || 2} onChange={event => patch({ level: Number(event.target.value) })} className="h-9 w-full rounded-md border border-input bg-background/70 px-3 text-sm"><option value={2}>Kop 2</option><option value={3}>Kop 3</option><option value={4}>Kop 4</option></select></div></div>}
      {block.type === "steps" && <div className="space-y-2">{(block.items || []).map((item, itemIndex) => <div key={`${block.id}-${itemIndex}`} className="flex gap-2"><span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">{itemIndex + 1}</span><Textarea value={item} onChange={event => patch({ items: block.items.map((value, position) => position === itemIndex ? event.target.value : value) })} className="min-h-16 flex-1 resize-y" maxLength={1200} placeholder="Beschrijf deze stap..." /><Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive" disabled={block.items.length === 1} onClick={() => patch({ items: block.items.filter((_, position) => position !== itemIndex) })}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}<Button type="button" variant="outline" size="sm" disabled={(block.items || []).length >= MAX_STEPS} onClick={() => patch({ items: [...(block.items || []), ""] })}><Plus className="h-3.5 w-3.5" /> {(block.items || []).length >= MAX_STEPS ? "Maximum van 40 stappen" : "Stap toevoegen"}</Button></div>}
      {block.type === "callout" && <div className="space-y-3"><div className="max-w-48"><FieldLabel>Soort</FieldLabel><select value={block.tone || "info"} onChange={event => patch({ tone: event.target.value })} className="h-9 w-full rounded-md border border-input bg-background/70 px-3 text-sm"><option value="info">Informatie</option><option value="warning">Let op</option><option value="danger">Waarschuwing</option><option value="success">Controle geslaagd</option></select></div><Textarea value={block.text || ""} onChange={event => patch({ text: event.target.value })} maxLength={6000} className="min-h-24 resize-y" placeholder="Schrijf het aandachtspunt..." /></div>}
      {block.type === "image" && <div className="space-y-3"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async event => { const file = event.target.files?.[0] || null; event.target.value = ""; if (file) await onUploadImage(index, file); }} /><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" /> {uploading ? "Uploaden..." : block.managed_file_id ? "Afbeelding vervangen" : "Afbeelding uploaden"}</Button>{block.managed_file_id && <span className="text-xs text-emerald-600">Veilig opgeslagen</span>}</div><p className="text-[11px] text-muted-foreground">JPEG, PNG of WebP · maximaal 10 MB · privé opgeslagen</p><div className="grid gap-3 sm:grid-cols-2"><div><FieldLabel>Alternatieve tekst *</FieldLabel><Input value={block.alt || ""} onChange={event => patch({ alt: event.target.value })} maxLength={300} placeholder="Wat is er op de afbeelding te zien?" /></div><div><FieldLabel>Bijschrift</FieldLabel><Input value={block.caption || ""} onChange={event => patch({ caption: event.target.value })} maxLength={500} placeholder="Optioneel bijschrift" /></div></div><div className="max-w-48"><FieldLabel>Weergave</FieldLabel><select value={block.layout || "wide"} onChange={event => patch({ layout: event.target.value })} className="h-9 w-full rounded-md border border-input bg-background/70 px-3 text-sm"><option value="wide">Breed</option><option value="contained">Ingepast</option><option value="inline">Compact</option></select></div></div>}
      {block.type === "button_sequence" && <div className="space-y-2">{(block.sequence || []).map((item, itemIndex) => <div key={`${block.id}-${itemIndex}`} className="grid gap-2 rounded-xl border border-border/60 bg-background/40 p-3 sm:grid-cols-[130px_1fr_1fr_auto]"><select value={item.type} onChange={event => { const type = event.target.value; patch({ sequence: block.sequence.map((value, position) => position === itemIndex ? { type, value: type === "icon" ? "ajax:icon:armed" : "", label: null } : value) }); }} className="h-9 rounded-md border border-input bg-background/70 px-2 text-sm"><option value="text">Tekst / code</option><option value="icon">Pictogram</option></select>{item.type === "icon" ? <select value={item.value} onChange={event => patch({ sequence: block.sequence.map((value, position) => position === itemIndex ? { ...value, value: event.target.value } : value) })} className="h-9 rounded-md border border-input bg-background/70 px-2 text-sm">{OFFICIAL_ICONS.map(([key, asset]) => <option key={key} value={key}>{asset.alt}</option>)}</select> : <Input value={item.value} onChange={event => patch({ sequence: block.sequence.map((value, position) => position === itemIndex ? { ...value, value: event.target.value } : value) })} placeholder="Bijv. Bevoegde code" maxLength={200} />}<Input value={item.label || ""} onChange={event => patch({ sequence: block.sequence.map((value, position) => position === itemIndex ? { ...value, label: event.target.value || null } : value) })} placeholder="Eigen label (optioneel)" maxLength={200} /><Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" disabled={block.sequence.length === 1} onClick={() => patch({ sequence: block.sequence.filter((_, position) => position !== itemIndex) })}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}<Button type="button" variant="outline" size="sm" disabled={(block.sequence || []).length >= MAX_SEQUENCE_ITEMS} onClick={() => patch({ sequence: [...(block.sequence || []), { type: "text", value: "", label: null }] })}><Plus className="h-3.5 w-3.5" /> {(block.sequence || []).length >= MAX_SEQUENCE_ITEMS ? "Maximum van 20 onderdelen" : "Onderdeel toevoegen"}</Button></div>}
      {block.type === "link" && <div className="space-y-3"><div><FieldLabel>Artikel of categorie *</FieldLabel><select value={targetValue} onChange={event => { const [target_type, ...parts] = event.target.value.split(":"); patch({ target_type, target_id: parts.join(":") || null, target_key: null }); }} className="h-9 w-full rounded-md border border-input bg-background/70 px-3 text-sm"><option value="">Kies een verwijzing</option><optgroup label="Categorieën">{categoryOptions.map(category => <option key={category.id} value={`category:${category.id}`}>{categoryOptionLabel(categories, category)}</option>)}</optgroup><optgroup label="Artikelen">{articleOptions.map(article => <option key={article.id} value={`article:${article.id}`}>{articleOptionLabel(categories, article)}</option>)}</optgroup></select></div><div className="grid gap-3 sm:grid-cols-2"><div><FieldLabel>Linktekst *</FieldLabel><Input value={block.label || ""} onChange={event => patch({ label: event.target.value })} maxLength={240} placeholder="Bijv. Bekijk de openingsprocedure" /></div><div><FieldLabel>Toelichting</FieldLabel><Input value={block.description || ""} onChange={event => patch({ description: event.target.value })} maxLength={500} placeholder="Waarom is dit relevant?" /></div></div></div>}
      {block.type === "divider" && <p className="text-xs text-muted-foreground">Deze scheidslijn maakt een zichtbaar onderscheid tussen twee onderdelen.</p>}
    </section>
  );
}

function validBlock(block) {
  if (["paragraph", "heading", "callout"].includes(block.type)) return Boolean(String(block.text || "").trim());
  if (block.type === "steps") return block.items?.length > 0 && block.items.every(item => String(item).trim());
  if (block.type === "image") return Boolean((block.managed_file_id || block.asset_key) && String(block.alt || "").trim());
  if (block.type === "button_sequence") return block.sequence?.length > 0 && block.sequence.every(item => item.value);
  if (block.type === "link") return Boolean(block.target_id && String(block.label || "").trim());
  return block.type === "divider";
}

export default function HandbookArticleEditor({ article, defaultCategoryId = "", categories, articles, onSave, onCancel, onOpenArticle, onOpenCategory, onUploadImage, onDirtyChange, onDraftChange, saving, error }) {
  const generated = article?.origin === "installation_template";
  const initialForm = useMemo(() => ({
    title: article?.title || "",
    summary: article?.summary || "",
    category_id: article?.category_id || defaultCategoryId || "",
    supplement_blocks: article ? legacyArticleBlocks(article) : [newHandbookBlock("paragraph")],
  }), [article, defaultCategoryId]);
  const initialSnapshot = useMemo(() => JSON.stringify(initialForm), [initialForm]);
  const [form, setForm] = useState(initialForm);
  const [blockType, setBlockType] = useState("paragraph");
  const [uploadingBlockId, setUploadingBlockId] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const dirty = JSON.stringify(form) !== initialSnapshot;
  const managedBlockCount = Array.isArray(article?.managed_blocks) ? article.managed_blocks.length : 0;
  const maxSupplementBlocks = Math.max(0, MAX_BLOCKS - managedBlockCount);
  const valid = Boolean(form.title.trim()) && form.supplement_blocks.length <= maxSupplementBlocks && form.supplement_blocks.every(validBlock) && (managedBlockCount + form.supplement_blocks.length > 0);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => { onDraftChange?.({ form: { ...form, content_format: HANDBOOK_CONTENT_FORMAT }, valid }); }, [form, onDraftChange, valid]);
  useEffect(() => () => onDraftChange?.(null), [onDraftChange]);
  const previewArticle = useMemo(() => ({ ...article, ...form, content_format: HANDBOOK_CONTENT_FORMAT, managed_blocks: article?.managed_blocks || [] }), [article, form]);
  const updateBlock = (index, nextBlock) => setForm(current => ({ ...current, supplement_blocks: current.supplement_blocks.map((block, position) => position === index ? nextBlock : block) }));
  const moveBlock = (from, to) => setForm(current => { const blocks = [...current.supplement_blocks]; const [moved] = blocks.splice(from, 1); blocks.splice(to, 0, moved); return { ...current, supplement_blocks: blocks }; });
  const deleteBlock = index => setForm(current => ({ ...current, supplement_blocks: current.supplement_blocks.filter((_, position) => position !== index) }));
  const uploadImage = async (index, file) => {
    const block = form.supplement_blocks[index];
    setUploadingBlockId(block.id);
    setUploadError(null);
    try {
      const uploaded = await onUploadImage(file);
      updateBlock(index, { ...block, managed_file_id: uploaded.managed_file_id, asset_key: null, alt: block.alt || file.name.replace(/\.[^.]+$/, "") });
    } catch (cause) {
      setUploadError(cause?.message || "De afbeelding kon niet veilig worden geupload.");
    } finally {
      setUploadingBlockId(null);
    }
  };
  return (
    <form onSubmit={event => { event.preventDefault(); if (valid) onSave({ ...form, content_format: HANDBOOK_CONTENT_FORMAT }); }} className="min-h-[620px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/35 px-4 py-3 backdrop-blur-xl sm:px-6"><Button type="button" variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4" /> Terug</Button><div className="flex gap-2"><Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button><Button type="submit" disabled={!valid || saving || Boolean(uploadingBlockId)}><Save className="h-4 w-4" /> {saving ? "Opslaan..." : "Opslaan"}</Button></div></div>
      <div className="grid min-h-[560px] xl:grid-cols-2">
        <div className="space-y-5 border-b border-border/70 p-4 sm:p-6 xl:border-b-0 xl:border-r">
          <div><h2 className="text-base font-semibold">{generated ? "Objectspecifieke aanvulling" : article ? "Artikel bewerken" : "Nieuw handboekartikel"}</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{generated ? "De gecontroleerde fabrikantstappen blijven beschermd. Voeg hieronder alleen instructies toe die specifiek zijn voor dit object." : "Bouw het artikel op uit overzichtelijke blokken. Rechts zie je direct hoe het artikel wordt weergegeven."}</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><FieldLabel>Titel</FieldLabel><Input value={form.title} maxLength={200} disabled={generated} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Titel van het artikel" autoFocus={!generated} /></div><div className="sm:col-span-2"><FieldLabel>Korte samenvatting</FieldLabel><Textarea value={form.summary} maxLength={500} disabled={generated} onChange={event => setForm(current => ({ ...current, summary: event.target.value }))} placeholder="Waar helpt dit artikel bij?" className="min-h-20 resize-y" /></div><div className="sm:col-span-2"><FieldLabel>Categorie</FieldLabel><select value={form.category_id} disabled={generated} onChange={event => setForm(current => ({ ...current, category_id: event.target.value }))} className="h-9 w-full rounded-md border border-input bg-background/70 px-3 text-sm"><option value="">Geen categorie</option>{categories.filter(category => generated || !category.protected).map(category => <option key={category.id} value={category.id}>{categoryOptionLabel(categories, category)}</option>)}</select></div></div>
          {generated && <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">De officiële Ajax-foto’s, pictogrammen en stappen worden centraal bijgewerkt. Eigen tekst, afbeeldingen en verwijzingen hieronder blijven bij een update behouden.</div>}
          <div className="space-y-3">{form.supplement_blocks.map((block, index) => <BlockEditor key={block.id} block={block} index={index} total={form.supplement_blocks.length} categories={categories} articles={articles.filter(item => item.id !== article?.id)} onChange={updateBlock} onMove={moveBlock} onDelete={deleteBlock} onUploadImage={uploadImage} uploading={uploadingBlockId === block.id} />)}</div>
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-muted/10 p-3 sm:flex-row"><select value={blockType} onChange={event => setBlockType(event.target.value)} disabled={form.supplement_blocks.length >= maxSupplementBlocks} className="h-9 flex-1 rounded-md border border-input bg-background/70 px-3 text-sm">{ADDABLE_BLOCK_TYPES.map(type => <option key={type} value={type}>{HANDBOOK_BLOCK_LABELS[type]}</option>)}</select><Button type="button" variant="outline" disabled={form.supplement_blocks.length >= maxSupplementBlocks} onClick={() => setForm(current => ({ ...current, supplement_blocks: [...current.supplement_blocks, newHandbookBlock(blockType)] }))}><Plus className="h-4 w-4" /> {form.supplement_blocks.length >= maxSupplementBlocks ? `Maximum van ${maxSupplementBlocks} aanvullingen` : "Onderdeel toevoegen"}</Button></div>
          {uploadError && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{uploadError}</p>}
          {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error.message || "Opslaan is mislukt."}</p>}
        </div>
        <aside className="bg-background/25 p-4 sm:p-6"><div className="sticky top-4"><p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Live voorbeeld</p><div className="rounded-2xl border border-border/70 bg-card/45 p-5 shadow-sm backdrop-blur-xl"><h1 className="text-xl font-semibold tracking-tight">{form.title || "Titel van het artikel"}</h1>{form.summary && <p className="mt-2 text-sm leading-6 text-muted-foreground">{form.summary}</p>}<div className="mt-6"><HandbookArticleRenderer article={previewArticle} onOpenArticle={onOpenArticle} onOpenCategory={onOpenCategory} /></div></div></div></aside>
      </div>
    </form>
  );
}
