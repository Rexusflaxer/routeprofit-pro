import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Check,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import AddressAutocomplete from "@/components/ui-custom/AddressAutocomplete";
import {
  CONTACT_ROLE_LABELS,
  getCompanyName,
} from "./customerDossierUtils";

function Field({ label, required, hint, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}{required ? " *" : ""}
      </Label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-muted/15 p-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function CustomerBasisDialog({ customer, open, onOpenChange, onSave, saving, error }) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm({
      customer_type: customer?.customer_type || "bedrijf",
      name: customer?.name || "",
      legal_name: customer?.legal_name || "",
      trade_name: customer?.trade_name || "",
      customer_number: customer?.customer_number || "",
      kvk_number: customer?.kvk_number || "",
      vat_number: customer?.vat_number || customer?.btw_number || "",
      language: customer?.preferred_language || customer?.language || "nl",
      status: customer?.status || "active",
    });
  }, [customer, open]);

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const submit = event => {
    event.preventDefault();
    if (!form.name?.trim()) return;
    onSave({
      customer_type: form.customer_type,
      name: form.name.trim(),
      legal_name: form.legal_name?.trim() || null,
      trade_name: form.trade_name?.trim() || null,
      kvk_number: form.customer_type === "bedrijf" ? form.kvk_number?.trim() || null : null,
      vat_number: form.customer_type === "bedrijf" ? form.vat_number?.trim() || null : null,
      language: form.language || "nl",
      status: form.status || "active",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Klantgegevens wijzigen</DialogTitle>
          <DialogDescription>
            Dit zijn de juridische basisgegevens. Contactkanalen en adressen beheer je afzonderlijk in het dossier.
          </DialogDescription>
        </DialogHeader>
        <form id="customer-basis-form" className="space-y-5" onSubmit={submit}>
          <Section title="Identiteit">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Klanttype" required>
                <Select value={form.customer_type || "bedrijf"} onValueChange={value => set("customer_type", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bedrijf">Bedrijf</SelectItem>
                    <SelectItem value="particulier">Particulier</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="md:col-span-2">
                <Field label={form.customer_type === "bedrijf" ? "Weergavenaam" : "Naam"} required>
                  <Input value={form.name || ""} onChange={event => set("name", event.target.value)} required />
                </Field>
              </div>
            </div>
            {form.customer_type === "bedrijf" && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Juridische naam">
                  <Input value={form.legal_name || ""} onChange={event => set("legal_name", event.target.value)} />
                </Field>
                <Field label="Handelsnaam">
                  <Input value={form.trade_name || ""} onChange={event => set("trade_name", event.target.value)} />
                </Field>
                <Field label="KvK-nummer">
                  <Input value={form.kvk_number || ""} onChange={event => set("kvk_number", event.target.value)} />
                </Field>
                <Field label="Btw-nummer">
                  <Input value={form.vat_number || ""} onChange={event => set("vat_number", event.target.value)} />
                </Field>
              </div>
            )}
          </Section>

          <Section title="Dossier">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Klantnummer" hint="Wordt server-side toegekend en kan hier niet handmatig worden overschreven.">
                <Input value={form.customer_number || "Wordt toegekend"} disabled />
              </Field>
              <Field label="Taal">
                <Select value={form.language || "nl"} onValueChange={value => set("language", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nl">Nederlands</SelectItem>
                    <SelectItem value="en">Engels</SelectItem>
                    <SelectItem value="de">Duits</SelectItem>
                    <SelectItem value="fr">Frans</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status || "active"} onValueChange={value => set("status", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concept">Concept</SelectItem>
                    <SelectItem value="on_hold">In de wacht</SelectItem>
                    <SelectItem value="active">Actief</SelectItem>
                    <SelectItem value="inactive">Inactief</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Interne notities worden als afzonderlijke tijdlijnrecords vastgelegd onder Notities & historie.
            </p>
          </Section>
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message || "Opslaan is niet gelukt."}
            </div>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuleren</Button>
          <Button type="submit" form="customer-basis-form" disabled={saving || !form.name?.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Wijzigingen opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_FORMS = {
  account: {
    company_id: "",
    debtor_number: "",
    account_manager_personnel_id: "",
    status: "active",
    payment_term_days: "30",
    invoice_delivery_method: "email",
    finance_hold: false,
    is_primary: false,
  },
  contact: {
    first_name: "",
    name_prefix: "",
    last_name: "",
    job_title: "",
    email: "",
    phone: "",
    roles: ["primary"],
    is_primary: false,
  },
  address: {
    customer_account_id: "",
    address_type: "visiting",
    label: "",
    street_name: "",
    house_number: "",
    house_number_addition: "",
    postal_code: "",
    city: "",
    country: "Nederland",
    is_primary: false,
  },
  request: {
    request_type: "new_service",
    title: "",
    description: "",
    priority: "normal",
    requested_for_date: "",
  },
};

const DIALOG_META = {
  account: {
    title: "Bedrijfsrelatie toevoegen",
    description: "Koppel de klant aan één van de eigen bedrijven en leg de financiële relatie vast.",
  },
  contact: {
    title: "Contactpersoon toevoegen",
    description: "Een contactpersoon kan meerdere verantwoordelijkheden en aparte contactkanalen hebben.",
  },
  address: {
    title: "Adres toevoegen",
    description: "Bezoek-, post- en factuuradressen blijven afzonderlijk beschikbaar.",
  },
  request: {
    title: "Aanvraag vastleggen",
    description: "Leg een klantvraag eerst als aanvraag vast; planning volgt na interne beoordeling.",
  },
};

export function CustomerRecordDialog({
  type,
  open,
  onOpenChange,
  onSave,
  saving,
  error,
  companies = [],
  personnel = [],
  accounts = [],
}) {
  const [form, setForm] = useState(EMPTY_FORMS[type] || {});
  const meta = DIALOG_META[type] || DIALOG_META.request;

  useEffect(() => {
    if (open) setForm({ ...(EMPTY_FORMS[type] || EMPTY_FORMS.request) });
  }, [open, type]);

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const isValid = useMemo(() => {
    if (type === "account") return Boolean(form.company_id);
    if (type === "contact") return Boolean(form.first_name?.trim() || form.last_name?.trim());
    if (type === "address") return Boolean(form.street_name?.trim() && form.city?.trim());
    return Boolean(form.title?.trim() && form.description?.trim());
  }, [form, type]);

  const submit = event => {
    event.preventDefault();
    if (!isValid) return;
    onSave(type, form);
  };

  const toggleRole = role => {
    setForm(current => {
      const roles = new Set(current.roles || []);
      if (roles.has(role)) roles.delete(role);
      else roles.add(role);
      return { ...current, roles: [...roles] };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>
        <form id="customer-record-form" className="space-y-5" onSubmit={submit}>
          {type === "account" && (
            <>
              <Section title="Relatie">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Eigen bedrijf" required>
                    <Select value={form.company_id || ""} onValueChange={value => set("company_id", value)}>
                      <SelectTrigger><SelectValue placeholder="Selecteer een bedrijf" /></SelectTrigger>
                      <SelectContent>
                        {companies.map(company => (
                          <SelectItem key={company.id} value={company.id}>{getCompanyName(company)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Debiteur-/relatienummer">
                    <Input value={form.debtor_number || ""} onChange={event => set("debtor_number", event.target.value)} />
                  </Field>
                  <Field label="Accountmanager">
                    <Select value={form.account_manager_personnel_id || "none"} onValueChange={value => set("account_manager_personnel_id", value === "none" ? "" : value)}>
                      <SelectTrigger><SelectValue placeholder="Niet toegewezen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Niet toegewezen</SelectItem>
                        {personnel.map(person => (
                          <SelectItem key={person.id} value={person.id}>{person.name || [person.first_name, person.last_name].filter(Boolean).join(" ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Status">
                    <Select value={form.status || "active"} onValueChange={value => set("status", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Actief</SelectItem>
                        <SelectItem value="on_hold">In de wacht</SelectItem>
                        <SelectItem value="ended">Beëindigd</SelectItem>
                        <SelectItem value="archived">Gearchiveerd</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </Section>
              <Section title="Facturatie">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Betalingstermijn">
                    <Select value={String(form.payment_term_days || 30)} onValueChange={value => set("payment_term_days", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[7, 14, 30, 45, 60].map(days => <SelectItem key={days} value={String(days)}>{days} dagen</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Aflevermethode">
                    <Select value={form.invoice_delivery_method || "email"} onValueChange={value => set("invoice_delivery_method", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="portal">Klantportaal</SelectItem>
                        <SelectItem value="peppol">Peppol</SelectItem>
                        <SelectItem value="email_and_portal">E-mail en portaal</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
                    <Checkbox checked={form.is_primary} onCheckedChange={value => set("is_primary", value === true)} />
                    <span><span className="font-medium">Primaire bedrijfsrelatie</span><span className="block text-xs text-muted-foreground">Wordt gebruikt als standaardcontext.</span></span>
                  </label>
                  <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
                    <Checkbox checked={form.finance_hold} onCheckedChange={value => set("finance_hold", value === true)} />
                    <span><span className="font-medium">Financiële blokkade</span><span className="block text-xs text-muted-foreground">Nieuwe uitgifte blijft geblokkeerd.</span></span>
                  </label>
                </div>
              </Section>
            </>
          )}

          {type === "contact" && (
            <>
              <Section title="Persoon">
                <div className="grid gap-4 md:grid-cols-[1fr_120px_1fr]">
                  <Field label="Voornaam">
                    <Input value={form.first_name || ""} onChange={event => set("first_name", event.target.value)} />
                  </Field>
                  <Field label="Tussenvoegsel">
                    <Input value={form.name_prefix || ""} onChange={event => set("name_prefix", event.target.value)} />
                  </Field>
                  <Field label="Achternaam">
                    <Input value={form.last_name || ""} onChange={event => set("last_name", event.target.value)} />
                  </Field>
                </div>
                <Field label="Functie">
                  <Input value={form.job_title || ""} onChange={event => set("job_title", event.target.value)} placeholder="Bijv. facilitair manager" />
                </Field>
              </Section>
              <Section title="Contactkanalen">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="E-mailadres">
                    <Input type="email" value={form.email || ""} onChange={event => set("email", event.target.value)} />
                  </Field>
                  <Field label="Telefoonnummer">
                    <Input value={form.phone || ""} onChange={event => set("phone", event.target.value)} />
                  </Field>
                </div>
              </Section>
              <Section title="Rollen" description="Rechten voor het klantportaal worden later apart toegekend.">
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(CONTACT_ROLE_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Checkbox checked={(form.roles || []).includes(key)} onCheckedChange={() => toggleRole(key)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.is_primary} onCheckedChange={value => set("is_primary", value === true)} />
                  Primaire contactpersoon
                </label>
              </Section>
            </>
          )}

          {type === "address" && (
            <>
              <Section title="Gebruik">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Adrestype" required>
                    <Select value={form.address_type || "visiting"} onValueChange={value => set("address_type", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="visiting">Bezoekadres</SelectItem>
                        <SelectItem value="postal">Postadres</SelectItem>
                        <SelectItem value="billing">Factuuradres</SelectItem>
                        <SelectItem value="registered">Vestigingsadres</SelectItem>
                        <SelectItem value="other">Overig</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Label">
                    <Input value={form.label || ""} onChange={event => set("label", event.target.value)} placeholder="Bijv. hoofdkantoor" />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Alleen voor bedrijfsrelatie">
                      <Select value={form.customer_account_id || "all"} onValueChange={value => set("customer_account_id", value === "all" ? "" : value)}>
                        <SelectTrigger><SelectValue placeholder="Klantbreed" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Klantbreed</SelectItem>
                          {accounts.map(account => (
                            <SelectItem key={account.id} value={account.id}>
                              {getCompanyName(companies.find(company => company.id === account.company_id))} · {account.debtor_number || account.account_number || "geen relatienummer"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </div>
              </Section>
              <Section title="Adres">
                <Field label="Adres zoeken">
                  <AddressAutocomplete
                    value={form}
                    onAddressSelect={address => setForm(current => ({ ...current, ...address }))}
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-[1fr_110px_100px]">
                  <Field label="Straat" required>
                    <Input value={form.street_name || ""} onChange={event => set("street_name", event.target.value)} />
                  </Field>
                  <Field label="Huisnummer" required>
                    <Input value={form.house_number || ""} onChange={event => set("house_number", event.target.value)} />
                  </Field>
                  <Field label="Toevoeging">
                    <Input value={form.house_number_addition || ""} onChange={event => set("house_number_addition", event.target.value)} />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-[160px_1fr_180px]">
                  <Field label="Postcode" required>
                    <Input value={form.postal_code || ""} onChange={event => set("postal_code", event.target.value)} />
                  </Field>
                  <Field label="Plaats" required>
                    <Input value={form.city || ""} onChange={event => set("city", event.target.value)} />
                  </Field>
                  <Field label="Land">
                    <Input value={form.country || ""} onChange={event => set("country", event.target.value)} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.is_primary} onCheckedChange={value => set("is_primary", value === true)} />
                  Primair adres voor dit type
                </label>
              </Section>
            </>
          )}

          {type === "request" && (
            <Section title="Aanvraag">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Type">
                  <Select value={form.request_type || "new_service"} onValueChange={value => set("request_type", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_service">Nieuwe dienstverlening</SelectItem>
                      <SelectItem value="schedule_change">Planning wijzigen</SelectItem>
                      <SelectItem value="object_change">Objectwijziging</SelectItem>
                      <SelectItem value="contact_change">Contactwijziging</SelectItem>
                      <SelectItem value="document_request">Documentverzoek</SelectItem>
                      <SelectItem value="complaint">Klacht</SelectItem>
                      <SelectItem value="billing_question">Factuurvraag</SelectItem>
                      <SelectItem value="other">Overig</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Prioriteit">
                  <Select value={form.priority || "normal"} onValueChange={value => set("priority", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Laag</SelectItem>
                      <SelectItem value="normal">Normaal</SelectItem>
                      <SelectItem value="high">Hoog</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Onderwerp" required>
                <Input value={form.title || ""} onChange={event => set("title", event.target.value)} />
              </Field>
              <Field label="Omschrijving" required>
                <Textarea value={form.description || ""} onChange={event => set("description", event.target.value)} rows={5} />
              </Field>
              <Field label="Gewenste datum">
                <Input type="date" value={form.requested_for_date || ""} onChange={event => set("requested_for_date", event.target.value)} />
              </Field>
            </Section>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message || "Opslaan is niet gelukt."}
            </div>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuleren</Button>
          <Button type="submit" form="customer-record-form" disabled={saving || !isValid}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerArchiveDialog({
  customer,
  open,
  onOpenChange,
  onConfirm,
  pending,
  restoring = false,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mb-1 flex items-center gap-2">
            {restoring ? <RotateCcw className="h-5 w-5 text-primary" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
            <AlertDialogTitle>{restoring ? "Klant herstellen?" : "Klant archiveren?"}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            {restoring
              ? `${customer?.name || "Deze klant"} wordt weer beschikbaar voor actieve processen. Bestaande historie en relaties blijven ongewijzigd.`
              : `${customer?.name || "Deze klant"} verdwijnt uit actieve selecties. Objecten, contracten, facturen, publicaties en historie blijven bewaard.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!restoring && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            Archiveren beëindigt of wijzigt geen lopende contracten. Controleer die afzonderlijk in het commerciële dossier.
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annuleren</AlertDialogCancel>
          <AlertDialogAction
            className={restoring ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            disabled={pending}
            onClick={event => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? "Bezig..." : restoring ? "Klant herstellen" : <><Archive className="mr-2 h-4 w-4" /> Archiveren</>}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
