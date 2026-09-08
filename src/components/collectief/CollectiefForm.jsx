import React, { useRef, useState } from "react";
import { Loader2, MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AddressAutocomplete from "@/components/ui-custom/AddressAutocomplete";
import { formatAddress } from "@/lib/addressFormatting";
import { trustedObjectCoordinatePair } from "@/lib/coordinates";
import { useObjectModuleNavigationGuard } from "@/components/objects/useObjectModuleNavigationGuard";
import { COLLECTIVE_TYPES, collectiveManagerId, collectiveParentOptions } from "./collectiveDossierWorkflow";
import CollectiveLocationPicker from "./CollectiveLocationPicker";

export const collectiveSelectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CollectiveField({ label, id, children, hint }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>;
}

export default function CollectiefForm({ collectief, customers = [], collectieven = [], onSave, onCancel, saving, error, onRegisterNavigationGuard }) {
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    name: collectief?.name || "", collectief_type: collectief?.collectief_type || "bedrijventerrein",
    manager_customer_id: collectiveManagerId(collectief), parent_collectief_id: collectief?.parent_collectief_id || "",
    address: collectief?.address || "", notes: collectief?.notes || "",
    street_name: collectief?.street_name || "", house_number: collectief?.house_number || "", house_number_addition: collectief?.house_number_addition || "",
    postal_code: collectief?.postal_code || "", city: collectief?.city || "", country_code: collectief?.country_code || "NL", country_name: collectief?.country_name || "Nederland",
    latitude: collectief?.latitude ?? null, longitude: collectief?.longitude ?? null,
    geocoding_status: collectief?.geocoding_status || "unverified", bag_address_id: collectief?.bag_address_id || null,
  }));
  const initialRef = useRef(JSON.stringify(form));
  const dirty = initialRef.current !== JSON.stringify(form);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const save = async () => {
    if (!form.name.trim()) throw new Error("Geef het collectief een naam.");
    const coordinates = trustedObjectCoordinatePair(form);
    await onSave({ ...form, latitude: coordinates?.[1] ?? null, longitude: coordinates?.[0] ?? null, geocoding_status: coordinates ? form.geocoding_status : "unverified", name: form.name.trim(), manager_customer_id: form.manager_customer_id || null, parent_collectief_id: form.parent_collectief_id || null });
  };
  const navigation = useObjectModuleNavigationGuard({ dirty, moduleName: "Collectief", saving, onSave: save, onDiscard: () => {}, onRegisterNavigationGuard });
  const coordinatesValid = Boolean(trustedObjectCoordinatePair(form));

  return <section className="rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-7">
    <h2 className="text-lg font-semibold">{collectief?.id ? "Collectief wijzigen" : "Nieuw collectief"}</h2>
    <p className="mt-1 text-sm text-muted-foreground">Een gezamenlijk gebied of gebouw. Deelnemers en dienstverlening richt je daarna in.</p>
    <form className="mt-6 space-y-5" onSubmit={event => { event.preventDefault(); if (!saving) void save().catch(() => {}); }}>
      <CollectiveField label="Naam *" id="collective-name"><Input id="collective-name" required maxLength={180} value={form.name} onChange={event => set("name", event.target.value)} placeholder="Bijvoorbeeld Bedrijventerrein Ir. van der Zeelaan" /></CollectiveField>
      <div className="grid gap-5 sm:grid-cols-2">
        <CollectiveField label="Type collectief" id="collective-type"><select id="collective-type" className={collectiveSelectClass} value={form.collectief_type} onChange={event => set("collectief_type", event.target.value)}>{Object.entries(COLLECTIVE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></CollectiveField>
        <CollectiveField label="Beherende klant (optioneel)" id="collective-manager" hint="Een woonwijk of gebied kan zonder beheerder bestaan. Dit wijzigt geen factuurafspraken."><select id="collective-manager" className={collectiveSelectClass} value={form.manager_customer_id} onChange={event => set("manager_customer_id", event.target.value)}><option value="">Geen beheerder</option>{customers.filter(customer => customer.status !== "archived" || customer.id === form.manager_customer_id).map(customer => <option key={customer.id} value={customer.id}>{customer.name || customer.trade_name}</option>)}</select></CollectiveField>
      </div>
      <CollectiveField label="Bovenliggend collectief (optioneel)" id="collective-parent" hint="Bijvoorbeeld een bedrijfsverzamelgebouw dat op een bedrijventerrein ligt."><select id="collective-parent" className={collectiveSelectClass} value={form.parent_collectief_id} onChange={event => set("parent_collectief_id", event.target.value)}><option value="">Zelfstandig collectief</option>{collectiveParentOptions(collectieven, collectief?.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></CollectiveField>
      <CollectiveField label="Adres of centrale locatie" id="collective-address" hint="Kies een gevonden adres, of wijs een gebied zonder adres direct op de kaart aan. Een huisnummer is voor collectieven niet verplicht.">
        <AddressAutocomplete id="collective-address" value={form} onQueryChange={address => setForm(current => ({ ...current, address, street_name: "", house_number: "", house_number_addition: "", postal_code: "", city: "", latitude: null, longitude: null, bag_address_id: null, geocoding_status: "unverified" }))} onAddressSelect={address => setForm(current => ({ ...current, ...address, address: formatAddress(address, { omitDefaultCountry: true }), country_name: address.country || "Nederland" }))} />
        <p className={`text-xs ${coordinatesValid ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{coordinatesValid ? "Kaartlocatie bevestigd." : "Nog geen bevestigde kaartlocatie. Je kunt het dossier alvast aanmaken."}</p>
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => setLocationPickerOpen(current => !current)}><MapPin className="h-4 w-4" />{locationPickerOpen ? "Kaart sluiten" : "Gebied op kaart aanwijzen"}</Button>
        {locationPickerOpen && <CollectiveLocationPicker location={form} referenceLocation={collectieven.find(item => item.id === form.parent_collectief_id)} onCancel={() => setLocationPickerOpen(false)} onConfirm={coordinates => { setForm(current => ({ ...current, ...coordinates })); setLocationPickerOpen(false); }} />}
      </CollectiveField>
      <CollectiveField label="Notities" id="collective-notes"><Textarea id="collective-notes" maxLength={12000} value={form.notes} onChange={event => set("notes", event.target.value)} rows={3} /></CollectiveField>
      {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message || "Opslaan is niet gelukt. Je invoer blijft behouden."}</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" disabled={saving} onClick={() => navigation.requestNavigation(onCancel)}>Annuleren</Button><Button type="submit" disabled={saving || !form.name.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {collectief?.id ? "Wijzigingen opslaan" : "Collectief aanmaken"}</Button></div>
    </form>{navigation.dialog}
  </section>;
}
