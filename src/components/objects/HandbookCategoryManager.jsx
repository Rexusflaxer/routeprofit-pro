import React, { useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function HandbookCategoryManager({ parentCategoryId, onCreate, saving, archived }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const submit = event => {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate({ name, parent_category_id: parentCategoryId || null }, () => { setName(""); setOpen(false); });
  };
  if (archived) return null;
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(value => !value)}><FolderPlus className="h-4 w-4" /> Categorie aanmaken</Button>
      {open && <form onSubmit={submit} className="absolute right-0 top-full z-20 mt-2 w-72 space-y-2 rounded-lg border border-border/70 bg-popover/95 p-3 shadow-lg backdrop-blur-xl">
        <Input value={name} onChange={event => setName(event.target.value)} placeholder="Naam van categorie" maxLength={120} autoFocus />
        <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button><Button type="submit" size="sm" disabled={!name.trim() || saving}>{saving ? "Aanmaken..." : "Aanmaken"}</Button></div>
      </form>}
    </div>
  );
}