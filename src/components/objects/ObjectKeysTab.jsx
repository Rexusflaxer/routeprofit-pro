import React, { useMemo } from "react";
import { AlertCircle, KeyRound, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ObjectKeyTable from "./ObjectKeyTable";
import ObjectKeyWizard from "./ObjectKeyWizard";
import useObjectKeys from "./useObjectKeys";

export default function ObjectKeysTab({ object, view, selectedRow, searchTerm, onSearchChange, onOpenCreate, onOpenEdit, onCloseView }) {
  const { query, save, remove } = useObjectKeys(object);
  const keys = query.data || [];
  const currentKey = view === "edit" ? keys.find(key => key.id === selectedRow) || null : null;
  const filtered = useMemo(() => { const term = searchTerm.trim().toLowerCase(); return term ? keys.filter(key => `${key.key_number} ${key.description}`.toLowerCase().includes(term)) : keys; }, [keys, searchTerm]);
  const archived = object.status === "archived";
  const showWizard = view === "new" || currentKey;
  const handleDelete = key => { if (window.confirm(`Sleutel ${key.key_number} verwijderen?`)) remove.mutate(key); };
  return (
    <div className="flex min-h-[620px] flex-col bg-card">
      {showWizard && <ObjectKeyWizard currentKey={currentKey} onCancel={onCloseView} onSave={form => save.mutate({ current: currentKey, form }, { onSuccess: onCloseView })} saving={save.isPending} error={save.error} />}
      <div className="flex flex-col gap-3 border-b border-border bg-muted/10 px-4 py-3 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-sm font-semibold">Sleutels</h2><p className="mt-0.5 text-xs text-muted-foreground">{filtered.length} van {keys.length} fysieke sleutel{keys.length === 1 ? "" : "s"}</p></div><div className="flex gap-2"><div className="relative w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchTerm} onChange={event => onSearchChange(event.target.value)} placeholder="Zoek op nummer of omschrijving..." className="h-9 pl-9 pr-9" />{searchTerm && <button type="button" onClick={() => onSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}</div>{!showWizard && <Button size="sm" onClick={onOpenCreate} disabled={archived}><Plus className="h-4 w-4" /> Sleutel toevoegen</Button>}</div></div>
      <div className="min-h-0 flex-1">{query.isLoading ? <div className="flex min-h-[360px] items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sleutels laden...</div> : query.isError ? <div className="m-4 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4"><AlertCircle className="h-4 w-4 text-destructive" /><div className="flex-1 text-sm text-destructive">De sleutels konden niet worden geladen.</div><Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" /> Opnieuw</Button></div> : filtered.length ? <ObjectKeyTable keys={filtered} onEdit={key => onOpenEdit(key.id)} onDelete={handleDelete} disabled={archived || remove.isPending} /> : <div className="flex min-h-[360px] flex-col items-center justify-center px-5 text-center"><KeyRound className="mb-3 h-5 w-5 text-muted-foreground" /><p className="text-sm font-medium">{searchTerm ? "Geen sleutels gevonden" : "Nog geen sleutels"}</p><p className="mt-1 text-xs text-muted-foreground">{searchTerm ? "Pas de zoekopdracht aan." : "Voeg de eerste fysieke sleutel van dit object toe."}</p></div>}</div>
    </div>
  );
}