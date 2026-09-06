import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2, MapPin, ShieldCheck } from "lucide-react";
import AddressAutocomplete from "@/components/ui-custom/AddressAutocomplete";
import { OBJECT_TYPE_OPTIONS } from "@/components/customers/customerObjectConfig";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getObjectStatus,
  INSTRUCTION_FIELDS,
  OBJECT_STATUS_LABELS,
  objectHasCoordinates,
} from "./objectDossierConfig";
import { buildingAssignmentConflictFingerprint, isBuildingAssignmentOverlapError } from "./objectWorkflow";

function MutationError({ error }) {
  if (!error || isBuildingAssignmentOverlapError(error)) return null;
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        {error.message || "De wijziging kon niet worden opgeslagen."}
        {error.requestId ? <span className="mt-1 block text-[11px]">Request-ID: {error.requestId}</span> : null}
      </AlertDescription>
    </Alert>
  );
}

function BuildingOverlapConfirmation({ error, fingerprint, reason, onReasonChange }) {
  if (!isBuildingAssignmentOverlapError(error)) return null;
  const conflicts = Array.isArray(error?.details?.conflicts) ? error.details.conflicts : [];
  if (!fingerprint) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>De conflictbevestiging kon niet veilig worden voorbereid. Probeer de wijziging opnieuw; sluit en heropen dit venster als de melding blijft terugkomen.</AlertDescription>
      </Alert>
    );
  }
  return (
    <section className="space-y-3 rounded-lg border border-amber-300/60 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold">Gedeeld gebouw bevestigen</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{conflicts.length === 1 ? "Een gebouw is" : conflicts.length > 1 ? `${conflicts.length} gebouwen zijn` : "Een geselecteerd gebouw is"} al aan een ander actief object gekoppeld. Bevestig waarom dit object het gebouw ook mag gebruiken.</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="object-building-overlap-reason">Reden voor gedeeld gebouw *</Label>
        <Textarea id="object-building-overlap-reason" value={reason} onChange={event => onReasonChange(event.target.value.slice(0, 500))} rows={3} maxLength={500} placeholder="Bijvoorbeeld: meerdere huurders in hetzelfde bedrijfsverzamelgebouw." />
        {reason.length > 0 && reason.trim().length < 3 ? <p className="text-[11px] text-destructive">Vul minimaal 3 tekens in.</p> : <p className="text-right text-[11px] text-muted-foreground">{reason.length}/500</p>}
      </div>
    </section>
  );
}

function initialIdentity(object) {
  return {
    name: object?.name || "",
    object_type: object?.object_type || "",
    address: object?.address || "",
    street_name: object?.street_name || "",
    house_number: object?.house_number || "",
    house_number_addition: object?.house_number_addition || "",
    postal_code: object?.postal_code || "",
    city: object?.city || "",
    country_code: object?.country_code || "NL",
    country_name: object?.country_name || "Nederland",
    latitude: object?.latitude ?? null,
    longitude: object?.longitude ?? null,
    bag_address_id: object?.bag_address_id || null,
    geocoding_status: object?.geocoding_status || "unverified",
    region: object?.region || "",
  };
}

export function ObjectIdentityDialog({ object, open, onOpenChange, onSave, saving, error }) {
  const [form, setForm] = useState(() => initialIdentity(object));

  useEffect(() => {
    if (open) setForm(initialIdentity(object));
  }, [object, open]);

  const addressValue = {
    address: form.address,
    formatted_address: form.address,
    street_name: form.street_name,
    house_number: form.house_number,
    house_number_addition: form.house_number_addition,
    postal_code: form.postal_code,
    city: form.city,
    country_name: form.country_name,
  };

  return (
    <Dialog open={open} onOpenChange={openValue => !saving && onOpenChange(openValue)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Objectgegevens wijzigen</DialogTitle>
          <DialogDescription>Werk de identiteit en gecontroleerde locatie bij. Operationele instructies staan in hun eigen tab.</DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={event => { event.preventDefault(); onSave(form); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="object-name">Objectnaam</Label>
              <Input id="object-name" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} maxLength={160} required />
            </div>
            <div className="space-y-2">
              <Label>Objecttype</Label>
              <Select value={form.object_type} onValueChange={value => setForm(current => ({ ...current, object_type: value }))}>
                <SelectTrigger><SelectValue placeholder="Kies een type" /></SelectTrigger>
                <SelectContent>
                  {OBJECT_TYPE_OPTIONS.map(option => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="object-region">Regio</Label>
              <Input id="object-region" value={form.region} onChange={event => setForm(current => ({ ...current, region: event.target.value }))} placeholder="Bijv. Noord-Holland" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="object-address">Adres</Label>
              <AddressAutocomplete
                id="object-address"
                placeholder="Zoek straat, huisnummer en plaats"
                value={addressValue}
                onQueryChange={address => setForm(current => ({
                  ...current,
                  address,
                  street_name: "",
                  house_number: "",
                  house_number_addition: "",
                  postal_code: "",
                  city: "",
                  latitude: null,
                  longitude: null,
                  bag_address_id: null,
                  geocoding_status: "unverified",
                }))}
                onAddressSelect={address => setForm(current => ({ ...current, ...address, address: address.formatted_address || address.address || [address.street_name, address.house_number, address.postal_code, address.city].filter(Boolean).join(" ") }))}
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> Kies een suggestie om de kaartpositie als geverifieerd vast te leggen.
              </p>
            </div>
          </div>
          <MutationError error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuleren</Button>
            <Button type="submit" disabled={saving || !form.name.trim() || !form.object_type || !form.address.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Opslaan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initialOperations(object) {
  const mapEligible = getObjectStatus(object) === "active"
    && objectHasCoordinates(object)
    && ["verified", "manual"].includes(object?.geocoding_status);
  return Object.fromEntries([
    ...INSTRUCTION_FIELDS.map(field => [field.key, object?.[field.key] || ""]),
    ["notes", object?.notes || ""],
    ["show_on_mobile_map", mapEligible && Boolean(object?.show_on_mobile_map)],
    ["mobile_map_priority", Number(object?.mobile_map_priority || 0)],
  ]);
}

export function ObjectOperationsDialog({ object, open, onOpenChange, onSave, saving, error }) {
  const [form, setForm] = useState(() => initialOperations(object));
  const [overlapReason, setOverlapReason] = useState("");
  const [overlapFingerprint, setOverlapFingerprint] = useState(null);
  const mapEligible = getObjectStatus(object) === "active"
    && objectHasCoordinates(object)
    && ["verified", "manual"].includes(object?.geocoding_status);

  useEffect(() => {
    if (open) {
      setForm(initialOperations(object));
      setOverlapReason("");
      setOverlapFingerprint(null);
    } else {
      setOverlapReason("");
      setOverlapFingerprint(null);
    }
  }, [object, open]);

  const overlapRequired = isBuildingAssignmentOverlapError(error);
  const overlapConfirmable = overlapRequired && Boolean(overlapFingerprint);
  useEffect(() => {
    setOverlapReason("");
    setOverlapFingerprint(buildingAssignmentConflictFingerprint(error));
  }, [error]);
  const updateForm = updater => {
    setForm(updater);
    setOverlapReason("");
    setOverlapFingerprint(null);
  };
  const submit = () => {
    if (overlapConfirmable) {
      onSave(form, { confirmed: true, reason: overlapReason.trim(), conflict_fingerprint: overlapFingerprint });
      return;
    }
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={openValue => !saving && onOpenChange(openValue)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Operationele inrichting</DialogTitle>
          <DialogDescription>Leg alleen blijvende objectinformatie vast. Tijdelijke dienstoverdracht en incidenten horen in afzonderlijke workflows.</DialogDescription>
        </DialogHeader>
        <form className="space-y-6" onSubmit={event => { event.preventDefault(); submit(); }}>
          <section className="space-y-4 rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div><h3 className="text-sm font-semibold">Operationele instructies</h3><p className="text-xs text-muted-foreground">Deze gegevens kunnen binnen een toegewezen taak beschikbaar worden gemaakt.</p></div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {INSTRUCTION_FIELDS.map(field => (
                <div key={field.key} className={`space-y-2 ${field.key === "object_notes" ? "md:col-span-2" : ""}`}>
                  <Label htmlFor={`instruction-${field.key}`}>{field.label}</Label>
                  <Textarea id={`instruction-${field.key}`} value={form[field.key]} onChange={event => updateForm(current => ({ ...current, [field.key]: event.target.value }))} rows={3} placeholder={field.description} />
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-[1fr_140px]">
            <div className="flex items-start justify-between gap-4 sm:col-span-2">
              <div><Label htmlFor="mobile-map">Zichtbaar op mobiele objectkaart</Label><p className="mt-1 text-xs text-muted-foreground">{mapEligible ? "De actieve en gecontroleerde locatie kan op de mobiele kaart worden getoond." : "Activeer het object en leg eerst een geverifieerde of handmatige kaartpositie vast."}</p></div>
              <Switch id="mobile-map" checked={mapEligible && form.show_on_mobile_map} disabled={!mapEligible} onCheckedChange={checked => updateForm(current => ({ ...current, show_on_mobile_map: checked }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="object-internal-notes">Interne beheernotitie</Label>
              <Textarea id="object-internal-notes" value={form.notes} onChange={event => updateForm(current => ({ ...current, notes: event.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile-priority">Kaartprioriteit</Label>
              <Input id="mobile-priority" type="number" min="-1000" max="1000" value={form.mobile_map_priority} onChange={event => updateForm(current => ({ ...current, mobile_map_priority: event.target.value }))} />
            </div>
          </section>

          <MutationError error={error} />
          <BuildingOverlapConfirmation error={error} fingerprint={overlapFingerprint} reason={overlapReason} onReasonChange={setOverlapReason} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuleren</Button>
            <Button type="submit" disabled={saving || (overlapConfirmable && overlapReason.trim().length < 3)}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} {overlapConfirmable ? "Bevestigen en opnieuw opslaan" : overlapRequired ? "Opnieuw proberen" : "Opslaan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ObjectStatusDialog({ object, targetStatus, open, onOpenChange, onConfirm, saving, error }) {
  const [reason, setReason] = useState("");
  const [overlapReason, setOverlapReason] = useState("");
  const [overlapFingerprint, setOverlapFingerprint] = useState(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setOverlapReason("");
      setOverlapFingerprint(null);
    } else {
      setOverlapReason("");
      setOverlapFingerprint(null);
    }
  }, [open, targetStatus]);

  const archiving = targetStatus === "archived";
  const overlapRequired = isBuildingAssignmentOverlapError(error);
  const overlapConfirmable = overlapRequired && Boolean(overlapFingerprint);
  useEffect(() => {
    setOverlapReason("");
    setOverlapFingerprint(buildingAssignmentConflictFingerprint(error));
  }, [error]);
  return (
    <Dialog open={open} onOpenChange={openValue => !saving && onOpenChange(openValue)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Object {OBJECT_STATUS_LABELS[targetStatus]?.toLowerCase() || "wijzigen"}</DialogTitle>
          <DialogDescription>
            {archiving
              ? "Archiveren markeert het object als niet-actief en bewaart taken, rapportages, documenten en auditgeschiedenis. Controleer toekomstige planning afzonderlijk."
              : `${object?.name || "Dit object"} krijgt de status ${OBJECT_STATUS_LABELS[targetStatus]?.toLowerCase() || targetStatus}.`}
          </DialogDescription>
        </DialogHeader>
        {archiving && (
          <div className="space-y-2">
            <Label htmlFor="archive-reason">Reden voor archiveren</Label>
            <Textarea id="archive-reason" value={reason} onChange={event => { setReason(event.target.value); setOverlapReason(""); setOverlapFingerprint(null); }} rows={3} required />
          </div>
        )}
        <MutationError error={error} />
        <BuildingOverlapConfirmation error={error} fingerprint={overlapFingerprint} reason={overlapReason} onReasonChange={setOverlapReason} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuleren</Button>
          <Button variant={archiving ? "destructive" : "default"} onClick={() => {
            if (overlapConfirmable) {
              onConfirm(reason, { confirmed: true, reason: overlapReason.trim(), conflict_fingerprint: overlapFingerprint });
              return;
            }
            onConfirm(reason);
          }} disabled={saving || (archiving && !reason.trim()) || (overlapConfirmable && overlapReason.trim().length < 3)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {overlapConfirmable ? "Bevestigen en opnieuw proberen" : overlapRequired ? "Opnieuw proberen" : "Bevestigen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
