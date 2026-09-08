import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { invokeCustomerPlatformRead } from "@/components/customers/customerDossierUtils";
import { collectiveMutationRequest } from "@/components/collectief/collectiveDossierWorkflow";

export default function BuildingAssociationPanel({ object, form, baseline, enabled, serverMatches = [], onRemoveSelection, onLinked }) {
  const cache = useQueryClient();
  const retry = useRef(null);
  const seen = useRef(new Set());
  const [pending, setPending] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const selected = JSON.stringify({ selected_bag_feature_ids: form?.selected_bag_feature_ids || [], building_selection_points: form?.building_selection_points || [] });
  const hasNewSelection = form?.building_selection_mode === "manual" && (
    form.selected_bag_feature_ids.some(id => !(baseline?.selected_bag_feature_ids || []).includes(id))
    || form.building_selection_points.some(point => !(baseline?.building_selection_points || []).some(previous => previous.id === point.id))
  );
  useEffect(() => {
    if (!enabled || !hasNewSelection) { setPending(null); return; }
    const timer = setTimeout(() => setPending(JSON.parse(selected)), 220);
    return () => clearTimeout(timer);
  }, [enabled, hasNewSelection, selected]);
  const queryKey = ["building-associations", object.id, pending];
  const query = useQuery({ queryKey, enabled: Boolean(enabled && pending), retry: false,
    queryFn: () => invokeCustomerPlatformRead({ action: "list_building_associations", object_id: object.id, customer_id: object.customer_id, ...pending }) });
  const matches = [...new Map([...(query.data?.matches || []), ...serverMatches].map(match => [match.selection_key, match])).values()];
  const suggestions = matches.filter(match => match.shared_building_required || match.collectives?.some(collective => !collective.member));
  const signature = JSON.stringify(suggestions);
  useEffect(() => {
    if (!enabled || !suggestions.length || seen.current.has(signature)) return;
    seen.current.add(signature);
    setDialog({ mode: "suggestions" });
  }, [enabled, signature]);
  const choose = (match, mode, source) => { retry.current = null; setError(null); setName(source?.name ? `${source.name} · gedeeld gebouw` : "Bedrijfsverzamelgebouw"); setDialog({ mode, match, source }); };
  const confirm = async () => {
    if (busy || !dialog?.source) return;
    setBusy(true); setError(null);
    try {
      const source = dialog.source;
      await collectiveMutationRequest("confirm_building_association", {
        object_id: object.id, expected_version: Number(baseline?.expected_version ?? object.version ?? 1),
        confirmed: true, association_type: dialog.mode,
        source_kind: dialog.mode === "join_collective" ? "collective" : "object", source_id: source.id,
        source_selection_key: source.source_selection_key || dialog.match.selection_key,
        target_selection_key: dialog.match.selection_key,
        ...(dialog.mode === "join_collective" ? { collective_id: source.id } : {
          ...(dialog.match.shared_collective_id ? { collective_id: dialog.match.shared_collective_id } : { name }),
          ...(dialog.match.collectives?.find(row => row.collectief_type !== "bedrijfsverzamelgebouw")?.id
            ? { parent_collectief_id: dialog.match.collectives.find(row => row.collectief_type !== "bedrijfsverzamelgebouw").id } : {}),
        }),
      }, retry);
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["building-associations", object.id] }),
        cache.invalidateQueries({ queryKey: ["object-collective-context", object.id] }),
        cache.invalidateQueries({ queryKey: ["collective-dossiers"] }),
        cache.invalidateQueries({ queryKey: ["collective-dossier"] }),
        cache.invalidateQueries({ queryKey: ["nearby-building-selections", object.id] }),
      ]);
      onLinked?.(dialog.match.selection_key);
      setDialog(null);
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  if (!enabled) return null;
  return <>
    {(suggestions.length > 0 || query.isError) && <section className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm"><p className="font-medium">Gebouwkoppelingen controleren</p><p className="mt-1 text-xs text-muted-foreground">{query.isError ? query.error.message : "Dit gebouw komt ook voor in een ander dossier. Leg vast hoe de locaties bij elkaar horen."}</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => query.isError ? query.refetch() : setDialog({ mode: "suggestions" })}>{query.isError ? "Opnieuw controleren" : "Koppelingen bekijken"}</Button></section>}
    <Dialog open={Boolean(dialog)} onOpenChange={open => { if (!open && !busy) setDialog(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{dialog?.mode === "shared_building" ? "Gedeeld gebouw vastleggen" : dialog?.mode === "join_collective" ? "Object onderbrengen in collectief" : "Dit gebouw is al bekend"}</DialogTitle><DialogDescription>De fysieke koppeling verandert geen bestaande taken, facturen, sleutels of toegang tot rapportages.</DialogDescription></DialogHeader>
      {dialog?.mode === "suggestions" ? <div className="space-y-4">{suggestions.map(match => <div key={match.selection_key} className="space-y-3 rounded-xl border p-4">
        {match.shared_building_required && <><p className="text-sm font-medium">Dit gebouw wordt al gebruikt door {match.objects.map(row => row.name).join(", ")}.</p><p className="text-xs text-muted-foreground">Voor afzonderlijke objecten in één gebouw is een bedrijfsverzamelgebouw nodig. Gaat het om dezelfde locatie met gezamenlijke verantwoordelijkheid? Koppel dan de klant aan het bestaande object.</p>
          <Button type="button" size="sm" onClick={() => choose(match, "shared_building", match.objects[0])}>Bedrijfsverzamelgebouw instellen</Button>
          {match.objects.map(row => <Link key={row.id} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary underline" to={`/Objects?id=${encodeURIComponent(row.id)}&tab=participation`}>Klant koppelen aan bestaand object {row.name} (nieuw tabblad)</Link>)}
        </>}
        {match.collectives.filter(row => !row.member).map(row => <div key={row.id}><p className="mb-2 text-sm">Onderdeel van <strong>{row.name}</strong>. Dit object ook onderbrengen in dit collectief?</p><Button type="button" size="sm" variant="outline" onClick={() => choose(match, "join_collective", row)}>Koppelen aan {row.name}</Button></div>)}
        <Button type="button" variant="ghost" size="sm" onClick={() => { onRemoveSelection(match.selection_key); setDialog(null); }}>Gebouwselectie ongedaan maken</Button>
      </div>)}<Button type="button" variant="outline" onClick={() => setDialog(null)}>Later beslissen</Button></div> : <div className="space-y-4">
        {dialog?.mode === "shared_building" ? <div><Label htmlFor="shared-building-name">Naam bedrijfsverzamelgebouw</Label><Input id="shared-building-name" value={name} maxLength={180} onChange={event => { setName(event.target.value); retry.current = null; }} /></div> : <p className="text-sm">Onderbrengen bij <strong>{dialog?.source?.name}</strong>? De huidige klant en het objectdossier blijven behouden.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setDialog({ mode: "suggestions" })}>Terug</Button><Button type="button" disabled={busy || (dialog?.mode === "shared_building" && !name.trim())} onClick={confirm}>{busy ? "Koppelen…" : "Bevestigen"}</Button></div>
      </div>}
    </DialogContent></Dialog>
  </>;
}
