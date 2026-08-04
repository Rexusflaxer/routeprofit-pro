import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ContactRound,
  Loader2,
  MapPin,
  Search,
  TriangleAlert,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AddressAutocomplete from "@/components/ui-custom/AddressAutocomplete";
import { wizardRevealMotion, wizardStepMotion } from "@/components/ui-custom/wizardMotion";
import { parseAddressLabel } from "@/lib/addressFormatting";
import {
  CONTACT_ROLE_LABELS,
  formatAddress,
  getCompanyName,
  listEntity,
} from "./customerDossierUtils";

const STEPS = [
  { key: "identity", label: "Identiteit" },
  { key: "account", label: "Bedrijfsrelatie" },
  { key: "addresses", label: "Adressen" },
  { key: "contact", label: "Contact" },
  { key: "review", label: "Controle" },
];

const EMPTY_ADDRESS = {
  street_name: "",
  house_number: "",
  house_number_addition: "",
  postal_code: "",
  city: "",
  country_name: "Nederland",
};

function normalized(value) {
  return String(value || "").trim().toLocaleLowerCase("nl-NL").replace(/\s+/g, " ");
}

function hasAddressData(address = {}) {
  return ["street_name", "house_number", "house_number_addition", "postal_code", "city"]
    .some(field => String(address[field] || "").trim());
}

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

function Section({ title, description, icon: Icon, children }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-muted/15 p-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ProgressIndicator({ currentStep }) {
  const currentIndex = STEPS.findIndex(step => step.key === currentStep);
  return (
    <div className="mb-7">
      <div className="flex items-center gap-1.5">
        {STEPS.map((step, index) => (
          <React.Fragment key={step.key}>
            <div className="flex min-w-0 items-center gap-1.5">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                  index === currentIndex
                    ? "border-primary bg-primary text-primary-foreground"
                    : index < currentIndex
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {index < currentIndex ? <Check className="h-3 w-3" /> : index + 1}
              </div>
              <span className={`hidden truncate text-xs sm:block ${index === currentIndex ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && <div className={`h-px flex-1 ${index < currentIndex ? "bg-primary/40" : "bg-border"}`} />}
          </React.Fragment>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground sm:hidden">
        Stap {currentIndex + 1} van {STEPS.length} · {STEPS[currentIndex]?.label}
      </p>
    </div>
  );
}

function WizardActions({ step, onBack, onNext, onCancel, saving, canContinue, finalStep }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
      {step === "identity" ? (
        <Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button>
      ) : (
        <Button type="button" variant="outline" onClick={onBack} disabled={saving}>
          <ArrowLeft className="h-4 w-4" /> Terug
        </Button>
      )}
      <Button type="button" onClick={onNext} disabled={!canContinue || saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : finalStep ? <Check className="h-4 w-4" /> : null}
        {saving ? "Klant aanmaken..." : finalStep ? "Klant aanmaken" : <>Volgende <ArrowRight className="h-4 w-4" /></>}
      </Button>
    </div>
  );
}

function KvkSearch({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setSearched(false);
    setError("");
    try {
      const response = await base44.functions.invoke("lookupService", { action: "search_kvk", query: query.trim() });
      if (response.data?.error) throw new Error(response.data.error);
      setResults(response.data?.results || []);
      setSearched(true);
    } catch (searchError) {
      setResults([]);
      setError(searchError?.message || "Zoeken is niet gelukt.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                search();
              }
            }}
            placeholder="Bedrijfsnaam of KvK-nummer"
            className="pl-9"
          />
        </div>
        <Button type="button" variant="outline" onClick={search} disabled={loading || query.trim().length < 2}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Zoeken"}
        </Button>
      </div>
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
      {searched && results.length === 0 && <p className="text-xs text-muted-foreground">Geen resultaten gevonden. Vul de gegevens handmatig in.</p>}
      {results.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-card">
          {results.map((result, index) => (
            <button
              key={`${result.kvkNummer || result.naam}-${index}`}
              type="button"
              onClick={() => {
                onSelect(result);
                setResults([]);
              }}
              className="grid w-full gap-1 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-muted/30 sm:grid-cols-[1fr_110px_1fr]"
            >
              <span className="truncate text-sm font-medium text-foreground">{result.naam || "Naam onbekend"}</span>
              <span className="text-xs text-muted-foreground">{result.kvkNummer || "Geen KvK"}</span>
              <span className="truncate text-xs text-muted-foreground">{result.adres || "Adres onbekend"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IdentityStep({ form, setForm, duplicates }) {
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const isCompany = form.customer_type === "bedrijf";
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Wie is de klant?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Leg de juridische partij vast. Objectlocaties worden later afzonderlijk gekoppeld.</p>
      </div>
      <Section title="Klanttype en identiteit" icon={Building2}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Klanttype" required>
            <Select value={form.customer_type} onValueChange={value => set("customer_type", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bedrijf">Bedrijf</SelectItem>
                <SelectItem value="particulier">Particulier</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label={isCompany ? "Weergavenaam" : "Naam"} required>
              <Input value={form.name} onChange={event => set("name", event.target.value)} autoFocus />
            </Field>
          </div>
        </div>
        {isCompany && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Juridische naam">
                <Input value={form.legal_name} onChange={event => set("legal_name", event.target.value)} />
              </Field>
              <Field label="Handelsnaam">
                <Input value={form.trade_name} onChange={event => set("trade_name", event.target.value)} />
              </Field>
              <Field label="KvK-nummer">
                <Input value={form.kvk_number} onChange={event => set("kvk_number", event.target.value)} />
              </Field>
              <Field label="Btw-nummer">
                <Input value={form.vat_number} onChange={event => set("vat_number", event.target.value)} />
              </Field>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">KvK zoeken</p>
              <KvkSearch onSelect={result => {
                const parsedAddress = parseAddressLabel(result.adres || "");
                setForm(current => ({
                  ...current,
                  name: result.handelsnaam || result.naam || current.name,
                  legal_name: result.naam || current.legal_name,
                  trade_name: result.handelsnaam || current.trade_name,
                  kvk_number: result.kvkNummer || current.kvk_number,
                  addresses: {
                    ...current.addresses,
                    visiting: {
                      ...current.addresses.visiting,
                      ...parsedAddress,
                      country_name: parsedAddress.country || current.addresses.visiting.country_name || "Nederland",
                    },
                  },
                }));
              }} />
            </div>
          </>
        )}
      </Section>
      {duplicates.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Mogelijk bestaande klant</p>
              <p className="mt-1 text-xs">Controleer eerst: {duplicates.slice(0, 3).map(item => item.name).join(", ")}.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountStep({ form, setForm, companies, personnel }) {
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Aan welke BV verkoopt LOQ?</h2>
        <p className="mt-1 text-sm text-muted-foreground">De bedrijfsrelatie bepaalt later contract-, tarief- en factuurcontext.</p>
      </div>
      <Section title="Primaire bedrijfsrelatie" icon={Building2}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Eigen bedrijf" required>
            <Select value={form.company_id} onValueChange={value => set("company_id", value)}>
              <SelectTrigger><SelectValue placeholder="Selecteer een bedrijf" /></SelectTrigger>
              <SelectContent>
                {companies.map(company => <SelectItem key={company.id} value={company.id}>{getCompanyName(company)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Debiteur-/relatienummer">
            <Input value={form.debtor_number} onChange={event => set("debtor_number", event.target.value)} placeholder="Mag later worden aangevuld" />
          </Field>
          <Field label="Accountmanager">
            <Select value={form.account_manager_id || "none"} onValueChange={value => set("account_manager_id", value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder="Niet toegewezen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Niet toegewezen</SelectItem>
                {personnel.map(person => (
                  <SelectItem key={person.id} value={person.id}>{person.name || [person.first_name, person.last_name].filter(Boolean).join(" ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Klantnummer">
            <Input value={form.customer_number} onChange={event => set("customer_number", event.target.value)} placeholder="Wordt anders later toegekend" />
          </Field>
        </div>
      </Section>
      {companies.length === 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Er is nog geen eigen bedrijf beschikbaar. Maak eerst een bedrijf aan voordat je een klant koppelt.
        </div>
      )}
    </div>
  );
}

function AddressFields({ value, onChange }) {
  return (
    <div className="space-y-4">
      <Field label="Adres zoeken">
        <AddressAutocomplete
          value={{ ...value, country: value.country_name }}
          onAddressSelect={selected => onChange({
            ...value,
            ...selected,
            country_name: selected.country || value.country_name || "Nederland",
          })}
        />
      </Field>
      <div className="grid gap-4 md:grid-cols-[1fr_110px_100px]">
        <Field label="Straat">
          <Input value={value.street_name || ""} onChange={event => onChange({ ...value, street_name: event.target.value })} />
        </Field>
        <Field label="Huisnummer">
          <Input value={value.house_number || ""} onChange={event => onChange({ ...value, house_number: event.target.value })} />
        </Field>
        <Field label="Toevoeging">
          <Input value={value.house_number_addition || ""} onChange={event => onChange({ ...value, house_number_addition: event.target.value })} />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-[150px_1fr_180px]">
        <Field label="Postcode">
          <Input value={value.postal_code || ""} onChange={event => onChange({ ...value, postal_code: event.target.value })} />
        </Field>
        <Field label="Plaats">
          <Input value={value.city || ""} onChange={event => onChange({ ...value, city: event.target.value })} />
        </Field>
        <Field label="Land">
          <Input value={value.country_name || ""} onChange={event => onChange({ ...value, country_name: event.target.value })} />
        </Field>
      </div>
    </div>
  );
}

function AddressesStep({ form, setForm }) {
  const updateAddress = (key, address) => setForm(current => ({
    ...current,
    addresses: { ...current.addresses, [key]: address },
  }));
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Welke adressen gebruikt de klant?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Deze stap is optioneel. Objectadressen worden niet als klantadres opgeslagen.</p>
      </div>
      <Section title="Bezoekadres" description="Hoofdlocatie van de juridische klant." icon={MapPin}>
        <AddressFields value={form.addresses.visiting} onChange={value => updateAddress("visiting", value)} />
      </Section>
      <Section title="Post- en factuuradres" description="Gebruik hetzelfde adres of leg een afwijkend adres vast.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
            <Checkbox checked={form.postal_same} onCheckedChange={value => set("postal_same", value === true)} />
            <span><span className="font-medium">Postadres is gelijk</span><span className="block text-xs text-muted-foreground">Maakt een aparte postadresregistratie.</span></span>
          </label>
          <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2.5 text-sm">
            <Checkbox checked={form.billing_same} onCheckedChange={value => set("billing_same", value === true)} />
            <span><span className="font-medium">Factuuradres is gelijk</span><span className="block text-xs text-muted-foreground">Kan later per bedrijfsrelatie afwijken.</span></span>
          </label>
        </div>
        {!form.postal_same && (
          <div className="space-y-3 border-t border-border pt-4">
            <h4 className="text-sm font-medium text-foreground">Afwijkend postadres</h4>
            <AddressFields value={form.addresses.postal} onChange={value => updateAddress("postal", value)} />
          </div>
        )}
        {!form.billing_same && (
          <div className="space-y-3 border-t border-border pt-4">
            <h4 className="text-sm font-medium text-foreground">Afwijkend factuuradres</h4>
            <AddressFields value={form.addresses.billing} onChange={value => updateAddress("billing", value)} />
          </div>
        )}
      </Section>
    </div>
  );
}

function ContactStep({ form, setForm }) {
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const toggleRole = role => setForm(current => {
    const roles = new Set(current.contact_roles);
    if (roles.has(role)) roles.delete(role);
    else roles.add(role);
    return { ...current, contact_roles: [...roles] };
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Wie is het eerste aanspreekpunt?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Deze stap is optioneel. Portaaltoegang wordt nooit automatisch verleend.</p>
      </div>
      <Section title="Primaire contactpersoon" icon={ContactRound}>
        <div className="grid gap-4 md:grid-cols-[1fr_120px_1fr]">
          <Field label="Voornaam">
            <Input value={form.contact_first_name} onChange={event => set("contact_first_name", event.target.value)} />
          </Field>
          <Field label="Tussenvoegsel">
            <Input value={form.contact_middle_name} onChange={event => set("contact_middle_name", event.target.value)} />
          </Field>
          <Field label="Achternaam">
            <Input value={form.contact_last_name} onChange={event => set("contact_last_name", event.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Functie">
            <Input value={form.contact_job_title} onChange={event => set("contact_job_title", event.target.value)} />
          </Field>
          <Field label="E-mailadres">
            <Input type="email" value={form.contact_email} onChange={event => set("contact_email", event.target.value)} />
          </Field>
          <Field label="Telefoonnummer">
            <Input value={form.contact_phone} onChange={event => set("contact_phone", event.target.value)} />
          </Field>
        </div>
      </Section>
      <Section title="Verantwoordelijkheden" description="Deze rollen sturen ontvangers en werkprocessen, niet automatisch de portaalrechten.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {["primary", "operational", "planning", "reports", "billing", "contract_signer", "warning", "portal_admin"].map(role => (
            <label key={role} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <Checkbox checked={form.contact_roles.includes(role)} onCheckedChange={() => toggleRole(role)} />
              {CONTACT_ROLE_LABELS[role]}
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}

function ReviewRow({ label, value, missing }) {
  return (
    <div className="grid gap-1 border-b border-border py-2.5 last:border-0 sm:grid-cols-[170px_1fr] sm:gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${missing ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function ReviewStep({ form, companies, personnel }) {
  const company = companies.find(item => item.id === form.company_id);
  const manager = personnel.find(item => item.id === form.account_manager_id);
  const contactName = [form.contact_first_name, form.contact_middle_name, form.contact_last_name].filter(Boolean).join(" ");
  const visit = form.addresses.visiting;
  const attention = [
    !contactName && "Hoofdcontact ontbreekt",
    !formatAddress(visit) || formatAddress(visit) === "—" ? "Bezoekadres ontbreekt" : null,
    !form.debtor_number && "Debiteurnummer ontbreekt",
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Controleer het klantdossier</h2>
        <p className="mt-1 text-sm text-muted-foreground">Na aanmaken opent direct het nieuwe dossier. Optionele gegevens kun je daar verder aanvullen.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Klant">
          <ReviewRow label="Naam" value={form.name || "Ontbreekt"} missing={!form.name} />
          <ReviewRow label="Type" value={form.customer_type === "bedrijf" ? "Bedrijf" : "Particulier"} />
          <ReviewRow label="KvK-nummer" value={form.kvk_number || "Niet vastgelegd"} missing={form.customer_type === "bedrijf" && !form.kvk_number} />
          <ReviewRow label="Klantnummer" value={form.customer_number || "Wordt later toegekend"} missing={!form.customer_number} />
        </Section>
        <Section title="Bedrijfsrelatie">
          <ReviewRow label="Eigen bedrijf" value={getCompanyName(company)} missing={!company} />
          <ReviewRow label="Debiteurnummer" value={form.debtor_number || "Niet vastgelegd"} missing={!form.debtor_number} />
          <ReviewRow label="Accountmanager" value={manager?.name || [manager?.first_name, manager?.last_name].filter(Boolean).join(" ") || "Niet toegewezen"} missing={!manager} />
        </Section>
        <Section title="Contact">
          <ReviewRow label="Hoofdcontact" value={contactName || "Nog niet vastgelegd"} missing={!contactName} />
          <ReviewRow label="E-mail" value={form.contact_email || "Niet vastgelegd"} missing={!form.contact_email} />
          <ReviewRow label="Telefoon" value={form.contact_phone || "Niet vastgelegd"} missing={!form.contact_phone} />
        </Section>
        <Section title="Adressen">
          <ReviewRow label="Bezoekadres" value={formatAddress(visit)} missing={formatAddress(visit) === "—"} />
          <ReviewRow label="Postadres" value={form.postal_same ? "Gelijk aan bezoekadres" : formatAddress(form.addresses.postal)} />
          <ReviewRow label="Factuuradres" value={form.billing_same ? "Gelijk aan bezoekadres" : formatAddress(form.addresses.billing)} />
        </Section>
      </div>
      {attention.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div><p className="font-medium">Na aanmaken aandacht nodig</p><p className="mt-1 text-xs">{attention.join(" · ")}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerWizard({ onSave, onCancel, saving, error }) {
  const [step, setStep] = useState("identity");
  const [form, setForm] = useState({
    customer_type: "bedrijf",
    name: "",
    legal_name: "",
    trade_name: "",
    kvk_number: "",
    vat_number: "",
    customer_number: "",
    company_id: "",
    debtor_number: "",
    account_manager_id: "",
    addresses: {
      visiting: { ...EMPTY_ADDRESS },
      postal: { ...EMPTY_ADDRESS },
      billing: { ...EMPTY_ADDRESS },
    },
    postal_same: true,
    billing_same: true,
    contact_first_name: "",
    contact_middle_name: "",
    contact_last_name: "",
    contact_job_title: "",
    contact_email: "",
    contact_phone: "",
    contact_roles: ["primary"],
    notes: "",
  });

  const companiesQuery = useQuery({
    queryKey: ["companies"],
    queryFn: () => listEntity("Company", "display_name"),
  });
  const personnelQuery = useQuery({
    queryKey: ["personnel"],
    queryFn: () => listEntity("Personnel", "name"),
  });
  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
  });
  const companies = companiesQuery.data || [];
  const personnel = personnelQuery.data || [];
  const duplicates = useMemo(() => {
    const name = normalized(form.name);
    const kvk = normalized(form.kvk_number);
    if (!name && !kvk) return [];
    return (customersQuery.data || []).filter(customer => (
      (name && normalized(customer.name || customer.trade_name || customer.legal_name) === name)
      || (kvk && normalized(customer.kvk_number) === kvk)
    ));
  }, [customersQuery.data, form.kvk_number, form.name]);

  const currentIndex = STEPS.findIndex(item => item.key === step);
  const canContinue = {
    identity: Boolean(form.name.trim()) && duplicates.length === 0,
    account: Boolean(form.company_id),
    addresses: true,
    contact: true,
    review: Boolean(form.name.trim() && form.company_id),
  }[step];

  const next = () => {
    if (!canContinue) return;
    if (step === "review") {
      const contactName = [form.contact_first_name, form.contact_middle_name, form.contact_last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const hasContact = Boolean(contactName || form.contact_email.trim() || form.contact_phone.trim());
      const visitingAddress = form.addresses.visiting;
      const hasVisitingAddress = Boolean(visitingAddress.street_name || visitingAddress.postal_code || visitingAddress.city);
      const addressRecords = [];
      if (hasVisitingAddress) {
        addressRecords.push({ ...visitingAddress, address_type: "visiting", is_primary: true });
        if (form.postal_same) addressRecords.push({ ...visitingAddress, address_type: "postal", is_primary: true });
        if (form.billing_same) addressRecords.push({ ...visitingAddress, address_type: "billing", is_primary: true });
      }
      if (!form.postal_same && hasAddressData(form.addresses.postal)) {
        addressRecords.push({ ...form.addresses.postal, address_type: "postal", is_primary: true });
      }
      if (!form.billing_same && hasAddressData(form.addresses.billing)) {
        addressRecords.push({ ...form.addresses.billing, address_type: "billing", is_primary: true });
      }

      onSave({
        customer: {
          customer_type: form.customer_type,
          name: form.name.trim(),
          legal_name: form.legal_name.trim() || null,
          trade_name: form.trade_name.trim() || null,
          normalized_name: normalized(form.name),
          customer_number: form.customer_number.trim() || null,
          kvk_number: form.customer_type === "bedrijf" ? form.kvk_number.trim() || null : null,
          vat_number: form.customer_type === "bedrijf" ? form.vat_number.trim() || null : null,
          preferred_language: "nl",
          status: "concept",
          onboarding_state: {
            status: "incomplete",
            missing: ["first_object", "contract_rate"],
          },
          contact_person: hasContact ? contactName || "Algemeen" : null,
          email: form.contact_email.trim() || null,
          phone: form.contact_phone.trim() || null,
          address: hasVisitingAddress ? formatAddress(visitingAddress) : null,
          notes: form.notes.trim() || null,
          version: 1,
        },
        account: {
          company_id: form.company_id,
          debtor_number: form.debtor_number.trim() || null,
          account_manager_id: form.account_manager_id || null,
          status: "active",
          is_primary: true,
          currency: "EUR",
          payment_term_days: 30,
          invoice_delivery_method: "email",
          finance_hold: false,
          version: 1,
        },
        addresses: addressRecords,
        contact: hasContact ? {
          display_name: contactName || "Algemeen",
          first_name: form.contact_first_name.trim() || null,
          middle_name: form.contact_middle_name.trim() || null,
          last_name: form.contact_last_name.trim() || null,
          job_title: form.contact_job_title.trim() || null,
          preferred_language: "nl",
          preferred_channel: form.contact_email ? "email" : form.contact_phone ? "phone" : null,
          is_primary: true,
          status: "active",
          version: 1,
          email: form.contact_email.trim() || null,
          phone: form.contact_phone.trim() || null,
          roles: form.contact_roles,
        } : null,
      });
      return;
    }
    setStep(STEPS[currentIndex + 1].key);
  };

  return (
    <motion.div {...wizardRevealMotion} className="overflow-hidden">
      <Card className="overflow-hidden border-border bg-card shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <ProgressIndicator currentStep={step} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} {...wizardStepMotion}>
            {step === "identity" && <IdentityStep form={form} setForm={setForm} duplicates={duplicates} />}
            {step === "account" && <AccountStep form={form} setForm={setForm} companies={companies} personnel={personnel} />}
            {step === "addresses" && <AddressesStep form={form} setForm={setForm} />}
            {step === "contact" && <ContactStep form={form} setForm={setForm} />}
            {step === "review" && <ReviewStep form={form} companies={companies} personnel={personnel} />}
          </motion.div>
        </AnimatePresence>
        {error && (
          <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error.message || "De klant kon niet worden aangemaakt."}
          </div>
        )}
        <WizardActions
          step={step}
          onBack={() => setStep(STEPS[currentIndex - 1].key)}
          onNext={next}
          onCancel={onCancel}
          saving={saving}
          canContinue={canContinue}
          finalStep={step === "review"}
        />
      </CardContent>
      </Card>
    </motion.div>
  );
}