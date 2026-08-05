import React, { useMemo, useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function flatten(categories, parentId = null, depth = 0) {
  return categories.filter(item => (item.parent_category_id || null) === parentId).flatMap(item => [{ ...item, depth }, ...flatten(categories, item.id, depth + 1)]);
}

export default function HandbookCategoryManager({ categories, onCreate, saving, archived }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const rows = useMemo(() => flatten(categories), [categories]);
  const submit = event => {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate({ name, parent_category_id: parentId || null }, () => { setName(""); setParentId(""); setOpen(false); });
  };
  if (archived) return null;
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(value => !value)}><FolderPlus className="h-4 w-4" /> Categorie aanmaken</Button>
      {open && <form onSubmit={submit} className="absolute right-0 top-full z-20 mt-2 w-72 space-y-2 rounded-lg border border-border/70 bg-popover/95 p-3 shadow-lg backdrop-blur-xl">
        <Input value={name} onChange={event => setName(event.target.value)} placeholder="Naam van categorie" maxLength={120} autoFocus />
        <select value={parentId} onChange={event => setParentId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-3 text-xs"><option value="">Hoofdcategorie</option>{rows.map(item => <option key={item.id} value={item.id}>{"— ".repeat(item.depth)}{item.name}</option>)}</select>
        <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button><Button type="submit" size="sm" disabled={!name.trim() || saving}>{saving ? "Aanmaken..." : "Aanmaken"}</Button></div>
      </form>}
    </div>
  );
}