import React from "react";
import { Check, Edit, Loader2, Upload, X } from "lucide-react";
import AddressAutocomplete from "@/components/ui-custom/AddressAutocomplete";
import ObjectHeaderMap from "@/components/objects/ObjectHeaderMap";
import { OBJECT_TYPE_OPTIONS, objectTypeLabel } from "@/components/customers/customerObjectConfig";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ObjectProfileHeader({
  object,
  editing,
  form,
  onChange,
  onAddressQueryChange,
  onAddressSelect,
  onUploadLogo,
  onStartEdit,
  onCancel,
  onSave,
  saving = false,
  uploadingLogo = false,
  error = null,
}) {
  const data = editing ? form : object;
  const disabled = saving || uploadingLogo;
  const addressValue = {
    address: data?.address || "",
    formatted_address: data?.address || "",
    street_name: data?.street_name || "",
    house_number: data?.house_number || "",
    house_number_addition: data?.house_number_addition || "",
    postal_code: data?.postal_code || "",
    city: data?.city || "",
    country_name: data?.country_name || "Nederland",
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className={`relative flex flex-col gap-5 border-b border-border bg-muted/40 px-5 py-5 sm:px-6 lg:flex-row lg:items-start ${editing ? "" : "lg:pr-[38%]"}`}>
        <div className="relative z-10 flex min-w-0 flex-1 items-start gap-5">
          <div className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
            {data?.logo_file_url ? (
              <img src={data.logo_file_url} alt={`Logo van ${data.name || "object"}`} className="h-full w-full object-contain p-1" />
            ) : (
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Logo</span>
            )}
            {editing && (
              <label className={`absolute inset-0 flex cursor-pointer items-center justify-center rounded-xl bg-black/45 ${uploadingLogo ? "cursor-wait" : ""}`}>
                <input type="file" accept="image/*" className="hidden" disabled={disabled} onChange={event => event.target.files?.[0] && onUploadLogo(event.target.files[0])} />
                {uploadingLogo ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Upload className="h-5 w-5 text-white" />}
                <span className="sr-only">Objectlogo uploaden</span>
              </label>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="grid max-w-3xl gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="object-profile-name" className="text-xs text-muted-foreground">Objectnaam</Label>
                  <Input id="object-profile-name" value={data.name || ""} onChange={event => onChange("name", event.target.value)} className="h-9 text-lg font-bold" maxLength={160} autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="object-profile-code" className="text-xs text-muted-foreground">
                    Objectcode <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="object-profile-code"
                    value={data.object_code || ""}
                    onChange={event => onChange("object_code", event.target.value)}
                    placeholder="Bijv. RTM-001"
                    className="h-9 font-mono uppercase"
                    maxLength={50}
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                  />
                  <p className="text-[11px] leading-4 text-muted-foreground">Uniek binnen LOQ. Gebruik hier de eigen objectcodering.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="object-profile-external-code" className="text-xs text-muted-foreground">Externe objectcode</Label>
                  <Input
                    id="object-profile-external-code"
                    value={data.external_object_code || ""}
                    onChange={event => onChange("external_object_code", event.target.value)}
                    placeholder="Bijv. code van opdrachtgever of meldkamer"
                    className="h-9 font-mono"
                    maxLength={120}
                    spellCheck={false}
                  />
                  <p className="text-[11px] leading-4 text-muted-foreground">Mag bij meerdere objecten gelijk zijn en is ook doorzoekbaar.</p>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="object-profile-address" className="text-xs text-muted-foreground">Adres</Label>
                  <AddressAutocomplete
                    id="object-profile-address"
                    value={addressValue}
                    onQueryChange={onAddressQueryChange}
                    onAddressSelect={onAddressSelect}
                    placeholder="Zoek straat, huisnummer en plaats"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Objecttype</Label>
                  <Select value={data.object_type || ""} onValueChange={value => onChange("object_type", value)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Kies een objecttype" /></SelectTrigger>
                    <SelectContent>{OBJECT_TYPE_OPTIONS.map(option => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-foreground">{object.name || "Naamloos object"}</h1>
                <p className="mt-1 font-mono text-lg font-semibold tracking-wider text-foreground">{object.object_code || "Code wordt toegekend"}</p>
                {object.external_object_code && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    Externe code <span className="font-mono font-medium text-foreground">{object.external_object_code}</span>
                  </p>
                )}
                <p className="mt-3 truncate text-sm text-muted-foreground">{object.address || "Geen adres vastgelegd"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{objectTypeLabel(object.object_type)}</p>
              </div>
            )}
          </div>
        </div>

        <div className={`relative z-20 flex shrink-0 flex-wrap justify-end gap-2 ${editing ? "" : "lg:absolute lg:right-5 lg:top-5"}`}>
          {editing ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={disabled}><X className="h-4 w-4" /> Annuleren</Button>
              <Button type="button" size="sm" onClick={onSave} disabled={disabled || !data.name?.trim() || !data.object_code?.trim() || !data.address?.trim() || !data.object_type}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? "Opslaan..." : "Opslaan"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={onStartEdit} disabled={object.status === "archived"}><Edit className="h-4 w-4" /> Wijzigen</Button>
          )}
        </div>
        {!editing && <ObjectHeaderMap object={object} />}
      </div>
      {editing && error && (
        <div className="border-t border-border px-5 py-3 sm:px-6">
          <Alert variant="destructive">
            <AlertDescription>
              {error.message || "De objectgegevens konden niet worden opgeslagen."}
              {error.requestId && <span className="mt-1 block text-[11px]">Referentie: {error.requestId}</span>}
            </AlertDescription>
          </Alert>
        </div>
      )}
    </section>
  );
}