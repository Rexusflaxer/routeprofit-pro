import React, { useEffect, useMemo, useRef } from "react";
import { AlertCircle, AlertTriangle, KeyRound, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomerMutationKey } from "@/components/customers/customerDossierUtils";
import ObjectKeyTable from "./ObjectKeyTable";
import ObjectKeyWizard from "./ObjectKeyWizard";
import useObjectKeys from "./useObjectKeys";

export default function ObjectKeysTab({ object, view, selectedRow, searchTerm, onSearchChange, onOpenCreate, onOpenEdit, onCloseView }) {
  const { query, save, remove } = useObjectKeys(object);
  const data = query.data || { sets: [], brands: [] };
  const allKeys = data.sets.flatMap(set => set.keys || []);
  const currentKey = view === "edit" ? allKeys.find(key => key.id === selectedRow) || null : null;
  const saveKeyRef = useRef(null);
  const deleteKeysRef = useRef(new Map());
  const filteredSets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return data.sets;
    return data.sets.map(set => {
      const setMatches = `${set.display_label} ${set.key_number}`.toLowerCase().includes(term);
      return { ...set, keys: setMatches ? set.keys : set.keys.filter(key => `${key.serial_number || ""} ${key.brand}`.toLowerCase().includes(term)) };
    }).filter(set => set.keys.length);
  }, [data.sets, searchTerm]);
  const archived = object.status === "archived";
  const showWizard = !archived && (view === "new" || Boolean(currentKey));

  useEffect(() => {
    saveKeyRef.current = null;
    save.reset();
  }, [selectedRow, view]);

  useEffect(() => {
    if (view === "edit" && !query.isLoading && !query.isError && !currentKey) onCloseView();
  }, [currentKey, onCloseView, query.isError, query.isLoading, view]);

  const saveKey = form => {
    if (!saveKeyRef.current) saveKeyRef.current = createCustomerMutationKey(currentKey ? "update_object_key" : "create_object_key");
    save.mutate({ current: currentKey, form, idempotencyKey: saveKeyRef.current }, {
      onSuccess: () => { saveKeyRef.current = null; onCloseView(); },
    });
  };
  const archiveKey = key => {
    const idempotencyKey = deleteKeysRef.current.get(key.assignment_id) || createCustomerMutationKey("archive_object_key");
    deleteKeysRef.current.set(key.assignment_id, idempotencyKey);
    remove.mutate({ key, idempotencyKey }, {
      onSuccess: () => deleteKeysRef.current.delete(key.assignment_id),
    });
  };

  return (
    <div className="flex min-h-[620px] flex-col bg-card/35 backdrop-blur-xl">
      {showWizard && <ObjectKeyWizard key={currentKey ? `${currentKey.id}-${currentKey.version}` : "new-key"} currentKey={currentKey} sets={data.sets} knownBrands={data.brands} onCancel={onCloseView} onSave={saveKey} saving={save.isPending} error={save.error} />}
      <div className="flex flex-col gap-3 border-b border-border/70 bg-card/25 px-4 py-3 backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between">
        <div><h2 className="text-sm font-semibold">Sleutels</h2><p className="mt-0.5 text-xs text-muted-foreground">{data.sets.length} sleutelset{data.sets.length === 1 ? "" : "s"} · {allKeys.length} toegangsmiddel{allKeys.length === 1 ? "" : "en"}</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchTerm} onChange={event => onSearchChange(event.target.value)} placeholder="Zoek op sleutel- of serienummer..." className="h-9 pl-9 pr-9" />{searchTerm && <button type="button" onClick={() => onSearchChange("")} aria-label="Zoekopdracht wissen" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}</div>
          {!showWizard && <Button size="sm" onClick={onOpenCreate} disabled={archived}><Plus className="h-4 w-4" /> Sleutel toevoegen</Button>}
        </div>
      </div>
      {data.integrity_issues?.length > 0 && <div className="mx-4 mt-4 flex gap-3 rounded-xl border border-amber-300/70 bg-amber-50/60 p-4 text-amber-900 backdrop-blur-xl dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="text-sm font-medium">Oudere sleutelgegevens vragen controle</p><p className="mt-1 text-xs opacity-80">{data.integrity_issues.length} koppeling{data.integrity_issues.length === 1 ? "" : "en"} is geblokkeerd of alleen-lezen omdat de historische klantgrens niet eenduidig is. Er is niets stil verwijderd.</p></div></div>}
      <div className="min-h-0 flex-1">
        {query.isLoading ? <div className="flex min-h-[360px] items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sleutelsets laden...</div>
          : query.isError ? <div className="m-4 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4"><AlertCircle className="h-4 w-4 text-destructive" /><div className="flex-1 text-sm text-destructive">De sleutelsets konden niet worden geladen.<p className="mt-1 text-xs opacity-80">{query.error?.message}</p></div><Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" /> Opnieuw</Button></div>
            : filteredSets.some(set => set.keys.length) ? <ObjectKeyTable sets={filteredSets} onEdit={key => !archived && !key.read_only && onOpenEdit(key.id)} onDelete={archiveKey} deleting={remove.isPending} disabled={archived || remove.isPending} />
              : <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><KeyRound className="mb-3 h-5 w-5 text-muted-foreground" /><p className="text-sm font-medium">{searchTerm ? "Geen sleutels gevonden" : "Nog geen sleutels"}</p><p className="mt-1 text-xs text-muted-foreground">{searchTerm ? "Pas de zoekopdracht aan." : data.sets.length ? "Voeg een toegangsmiddel toe aan een bestaande of nieuwe sleutelset." : "Voeg het eerste toegangsmiddel toe; de eerste set wordt in de wizard vastgelegd."}</p></div>}
      </div>
    </div>
  );
}
