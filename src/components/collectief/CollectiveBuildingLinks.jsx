import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Link2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CustomerObjectWizard from "@/components/customers/CustomerObjectWizard";
import { createCustomerObject } from "@/components/customers/customerObjectWorkflow";
import { createCustomerMutationKey, getCustomerName, invokeCustomerPlatformMutation } from "@/components/customers/customerDossierUtils";
import { objectMapInventoryRows } from "@/components/objects/ObjectMapOverview";
import { collectiveMutationRequest, getCollectiveDossier, listCollectiveDossiers } from "./collectiveDossierWorkflow";
import { CollectiveField, collectiveSelectClass } from "./CollectiefForm";

export function collectiveBuildingSourceKey(collectiveId, key) {
  return key?.startsWith("point:") ? `selection:${collectiveId}:${key.slice(6)}` : key;
}

/** Associations always use a saved source, never a draft polygon or client-provided geometry. */
export function collectiveBuildingAssociationPayload({ collective, buildingKey, object, mode = "join_collective", groupId, name }) {
  const sourceKey = collectiveBuildingSourceKey(collective.id, buildingKey);
  return {
    source_kind: "collective", source_id: collective.id, source_selection_key: sourceKey,
    association_type: mode, confirmed: true,
    expected_version: object ? Number(object.version || 1) : Number(collective.version || 1),
    ...(object ? { object_id: object.id, apply_to_object_map: true,
      target_selection_key: buildingKey.startsWith("point:") ? `selection:${object.id}:${buildingKey.slice(6)}` : sourceKey } : {}),
    ...(mode === "join_collective" ? { collective_id: collective.id } : groupId ? { collective_id: groupId } : { name: name.trim(), parent_collectief_id: collective.id }),
  };
}

export default function CollectiveBuildingLinks({ collective, configuration, dirty = false, disabled = false }) {
  const [buildingKey, setBuildingKey] = useState("");
  const [mode, setMode] = useState("object");
  const [objectId, setObjectId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [newObject, setNewObject] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const retryRef = useRef(null);
  const createRetryRef = useRef(null);
  const queryClient = useQueryClient();
  const dossierQuery = useQuery({ queryKey: ["collective-dossier", collective.id], queryFn: () => getCollectiveDossier(collective.id), enabled: !disabled });
  const collectivesQuery = useQuery({ queryKey: ["collective-dossiers"], queryFn: listCollectiveDossiers, enabled: !disabled });
  const dossier = dossierQuery.data || {};
  const customers = dossier.customers || [];
  const objects = [...(dossier.objects || []).filter(item => item.id !== newObject?.id), ...(newObject ? [newObject] : [])];
  const rows = configuration?.building_selection_mode === "manual" ? objectMapInventoryRows(configuration).filter(row => row.key.startsWith("bag:") || row.key.startsWith("point:")) : [];
  const selectedBuilding = rows.find(row => row.key === buildingKey);
  const selectedObject = objects.find(object => object.id === objectId);
  const groups = (collectivesQuery.data?.items || []).filter(item => item.collectief_type === "bedrijfsverzamelgebouw" && item.id !== collective.id && item.status !== "archived");
  const readError = dossierQuery.error || collectivesQuery.error;
  const mutation = useMutation({ mutationFn: payload => collectiveMutationRequest("confirm_building_association", payload, retryRef) });
  const createMutation = useMutation({ mutationFn: async form => {
    const signature = JSON.stringify({ customerId, form });
    if (createRetryRef.current?.signature !== signature) createRetryRef.current = { signature, key: createCustomerMutationKey("create_customer_object") };
    const result = await createCustomerObject({ customerId, form, idempotencyKey: createRetryRef.current.key, invoke: invokeCustomerPlatformMutation });
    setNewObject(result.object);
    setObjectId(result.object.id);
    setWizardOpen(false);
    setMode("object");
    setSuccess("Het klantobject is aangemaakt. Bevestig hieronder de gebouwkoppeling om het ook onder dit collectief te brengen.");
    await queryClient.invalidateQueries({ queryKey: ["objects"] });
    return result;
  } });
  const resetConfirmation = callback => { setConfirmed(false); setError(null); setSuccess(null); callback(); };
  const save = async event => {
    event.preventDefault();
    if (dirty || disabled || !confirmed || !selectedBuilding || mode === "object" && !selectedObject) return;
    setError(null);
    try {
      await mutation.mutateAsync(collectiveBuildingAssociationPayload({ collective, buildingKey, object: selectedObject, mode: mode === "group" ? "shared_building" : "join_collective", groupId, name: groupName }));
      retryRef.current = null;
      setConfirmed(false);
      setSuccess(mode === "group" ? "Het gebouw is gekoppeld aan het bedrijfsverzamelgebouw. Dit collectief heeft een eigen dossier." : "Het object en gebouw zijn gekoppeld aan dit collectief. De klant- en contractafspraken zijn behouden.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["collective-dossiers"] }),
        queryClient.invalidateQueries({ queryKey: ["collective-dossier"] }),
        queryClient.invalidateQueries({ queryKey: ["object-collective-context"] }),
        queryClient.invalidateQueries({ queryKey: ["building-associations"] }),
        queryClient.invalidateQueries({ queryKey: ["nearby-building-selections"] }),
        ...(selectedObject ? [queryClient.invalidateQueries({ queryKey: ["object-card", selectedObject.id, "map-configuration"] })] : []),
        queryClient.invalidateQueries({ queryKey: ["customer-shared-objects"] }),
        queryClient.invalidateQueries({ queryKey: ["objects"] }),
      ]);
    } catch (failure) { setError(failure); }
  };

  if (disabled) return null;
  return <section className="rounded-xl border border-border/70 bg-card/30 p-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" />Gebouw onderbrengen</h3>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">Koppel een klantobject aan een gebouw of maak hiervan een bedrijfsverzamelgebouw met een eigen dossier.</p>
    {dirty ? <p role="status" className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">Sla de kaart eerst op. Gebouwkoppelingen gebruiken uitsluitend de opgeslagen selectie.</p>
      : rows.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">Leg eerst een exacte gebouwselectie vast en sla de kaart op.</p>
        : <form className="mt-4 space-y-4" onSubmit={save}>
          <CollectiveField label="Opgeslagen gebouw" id="collective-building-source"><select id="collective-building-source" className={collectiveSelectClass} value={buildingKey} required onChange={event => resetConfirmation(() => setBuildingKey(event.target.value))}><option value="">Kies een gebouw</option>{rows.map(row => <option key={row.key} value={row.key}>{row.name}</option>)}</select></CollectiveField>
          <CollectiveField label="Wat wil je vastleggen?" id="collective-building-mode"><select id="collective-building-mode" className={collectiveSelectClass} value={mode} onChange={event => resetConfirmation(() => { setMode(event.target.value); setWizardOpen(false); })}><option value="object">Een klantobject in dit gebouw</option><option value="group">Een bedrijfsverzamelgebouw</option></select></CollectiveField>
          {mode === "object" ? <>
            <CollectiveField label="Bestaand klantobject" id="collective-building-object"><select id="collective-building-object" className={collectiveSelectClass} value={objectId} onChange={event => resetConfirmation(() => setObjectId(event.target.value))}><option value="">Kies een object</option>{objects.filter(object => object.status !== "archived").map(object => <option key={object.id} value={object.id}>{object.name} — {getCustomerName(customers.find(customer => customer.id === object.customer_id))}</option>)}</select></CollectiveField>
            <details className="rounded-md border border-border p-3"><summary className="cursor-pointer text-xs font-medium">Of maak een nieuw klantobject</summary><div className="mt-3 space-y-3"><CollectiveField label="Klant voor het nieuwe object" id="collective-building-customer"><select id="collective-building-customer" className={collectiveSelectClass} value={customerId} disabled={wizardOpen || createMutation.isPending} onChange={event => setCustomerId(event.target.value)}><option value="">Kies een klant</option>{customers.filter(customer => customer.status !== "archived").map(customer => <option key={customer.id} value={customer.id}>{getCustomerName(customer)}</option>)}</select></CollectiveField><Button type="button" size="sm" variant="outline" disabled={!customerId || !selectedBuilding || createMutation.isPending} onClick={() => { setWizardOpen(true); createMutation.reset(); }}><Plus className="h-4 w-4" />Nieuw object aanmaken</Button></div></details>
          </> : <>
            <CollectiveField label="Bedrijfsverzamelgebouw" id="collective-building-group"><select id="collective-building-group" className={collectiveSelectClass} value={groupId} onChange={event => resetConfirmation(() => setGroupId(event.target.value))}><option value="">Nieuw onderliggend collectief aanmaken</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></CollectiveField>
            {!groupId && <CollectiveField label="Naam bedrijfsverzamelgebouw" id="collective-building-name"><Input id="collective-building-name" required maxLength={180} value={groupName} onChange={event => resetConfirmation(() => setGroupName(event.target.value))} placeholder="Bijvoorbeeld Verzamelgebouw Noord" /></CollectiveField>}
            <CollectiveField label="Klantobject meenemen (optioneel)" id="collective-building-group-object" hint="Een eerder gekozen object kun je tegelijk onderbrengen. Bestaande objecten in ditzelfde gebouw blijven behouden en worden aan het gedeelde gebouw gekoppeld."><select id="collective-building-group-object" className={collectiveSelectClass} value={objectId} onChange={event => resetConfirmation(() => setObjectId(event.target.value))}><option value="">Alleen het gedeelde gebouw inrichten</option>{objects.filter(object => object.status !== "archived").map(object => <option key={object.id} value={object.id}>{object.name} — {getCustomerName(customers.find(customer => customer.id === object.customer_id))}</option>)}</select></CollectiveField>
          </>}
          <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{mode === "group" ? "Ik bevestig dat dit het gedeelde gebouw is. Bestaande objecten in dit gebouw en het eventueel gekozen klantobject worden in dit bedrijfsverzamelgebouw ondergebracht." : "Ik bevestig dat dit object in dit gebouw hoort. De opgeslagen gebouwselectie wordt aan het object toegevoegd; bestaande selecties blijven behouden."}</label>
          <p className="text-xs text-muted-foreground">Koppelen geeft geen automatische toegang tot rapportages of sleutels en wijzigt geen facturatie.</p>
          {(readError || error) && <p role="alert" className="text-xs text-destructive">{(error || readError).message}</p>}
          {success && <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>}
          <Button size="sm" disabled={!confirmed || !selectedBuilding || mode === "object" && !selectedObject || mode === "group" && !groupId && !groupName.trim() || mutation.isPending || createMutation.isPending || Boolean(readError)}>{mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "group" ? <Building2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}Koppeling bevestigen</Button>
        </form>}
    {wizardOpen && !dirty && <div className="mt-4 border-t border-border pt-4"><CustomerObjectWizard customerName={getCustomerName(customers.find(customer => customer.id === customerId))} objects={objects} onCancel={() => { if (!createMutation.isPending) setWizardOpen(false); }} onSave={form => createMutation.mutate(form)} saving={createMutation.isPending} error={createMutation.error} /></div>}
  </section>;
}
