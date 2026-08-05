import React, { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function HandbookArticleEditor({ article, categories, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState({ title: article?.title || "", content: article?.content || "", category_id: article?.category_id || "" });
  const valid = form.title.trim() && form.content.trim();
  return (
    <form onSubmit={event => { event.preventDefault(); if (valid) onSave(form); }} className="min-h-[620px] p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4" /> Terug</Button>
        <div><h2 className="text-sm font-semibold">{article ? "Artikel bewerken" : "Nieuw artikel"}</h2><p className="text-xs text-muted-foreground">Schrijf een artikel voor het handboek van dit object.</p></div>
      </div>
      <div className="space-y-4">
        <div><label htmlFor="handbook-title" className="mb-1.5 block text-xs font-medium">Titel</label><Input id="handbook-title" value={form.title} maxLength={200} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Titel van het artikel" autoFocus /></div>
        <div><label htmlFor="handbook-category" className="mb-1.5 block text-xs font-medium">Categorie</label><select id="handbook-category" value={form.category_id} onChange={event => setForm(current => ({ ...current, category_id: event.target.value }))} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"><option value="">Geen categorie</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
        <div><label htmlFor="handbook-content" className="mb-1.5 block text-xs font-medium">Inhoud</label><Textarea id="handbook-content" value={form.content} maxLength={20000} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} placeholder="Schrijf hier het artikel..." className="min-h-[380px] resize-y leading-relaxed" /></div>
        {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error.message || "Opslaan is mislukt."}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button><Button type="submit" disabled={!valid || saving}><Save className="h-4 w-4" /> {saving ? "Opslaan..." : "Opslaan"}</Button></div>
      </div>
    </form>
  );
}