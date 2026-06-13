import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Check, Loader2, Search } from "lucide-react";

function SectionTitle({ title, description }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

function ProgressIndicator({ steps, currentStep }) {
  const currentIndex = Math.max(0, steps.findIndex((step) => step.key === currentStep));

  return (
    <div className="mb-8 flex items-center gap-2">
      {steps.map((step, index) => {
        const isActive = index === currentIndex;
        const isDone = index < currentIndex;

        return (
          <React.Fragment key={step.key}>
            <div className={`flex items-center gap-1.5 ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : isDone
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : index + 1}
              </div>
              <span className="hidden text-xs sm:inline">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`h-px flex-1 ${isDone ? "bg-primary/40" : "bg-border"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StepType({ onSelect, onCancel }) {
  const options = [
    {
      value: "bedrijf",
      title: "Bedrijf",
      description: "Een organisatie, instelling of onderneming met objecten, KvK-gegevens en contactpersonen.",
    },
    {
      value: "particulier",
      title: "Particulier",
      description: "Een privépersoon als opdrachtgever, zonder bedrijfs- of KvK-verplichting.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Nieuwe klant toevoegen</h2>
        <p className="mt-1 text-sm text-muted-foreground">Kies eerst het klanttype. Dit bepaalt welke velden in de volgende stap nodig zijn.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{option.title}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{option.description}</p>
              </div>
              <span className="mt-0.5 rounded border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {option.value === "bedrijf" ? "Zakelijk" : "Particulier"}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onCancel}>Annuleren</Button>
      </div>
    </div>
  );
}

function StepKvK({ onSelect, onSkip, onBack }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      setError("");
      return undefined;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError("");
      setSearched(false);
      try {
        const res = await base44.functions.invoke("searchKvK", { query: query.trim() });
        if (res.data?.error) {
          setError(`Zoeken mislukt: ${res.data.error}`);
          setResults([]);
        } else {
          setResults(res.data?.results || []);
          setSearched(true);
        }
      } catch {
        setError("Zoeken mislukt. Probeer het opnieuw.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Bedrijf zoeken in KvK</h2>
        <p className="mt-1 text-sm text-muted-foreground">Zoek op bedrijfsnaam of KvK-nummer, of ga direct door met handmatig invoeren.</p>
      </div>

      <div className="relative">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Typ een bedrijfsnaam of KvK-nummer..."
          className="pr-10"
          autoFocus
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {searched && results.length === 0 && !loading && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
          Geen resultaten gevonden. Probeer een andere zoekterm of voer de klant handmatig in.
        </div>
      )}

      {results.length > 0 && (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-card">
          <div className="grid grid-cols-[minmax(180px,1fr)_120px_minmax(180px,1fr)_96px] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>Bedrijf</span>
            <span>KvK</span>
            <span>Adres</span>
            <span className="text-right">Actie</span>
          </div>
          {results.map((result, index) => (
            <button
              key={`${result.kvkNummer || result.naam}-${index}`}
              type="button"
              onClick={() => onSelect(result)}
              className="grid w-full grid-cols-[minmax(180px,1fr)_120px_minmax(180px,1fr)_96px] gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/35"
            >
              <span className="truncate text-sm font-medium text-foreground">{result.naam || "Naam onbekend"}</span>
              <span className="truncate text-sm text-muted-foreground">{result.kvkNummer || "—"}</span>
              <span className="truncate text-sm text-muted-foreground">{result.adres || "—"}</span>
              <span className="text-right text-sm font-medium text-primary">Selecteer</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Terug
        </Button>
        <Button variant="outline" onClick={onSkip}>
          Handmatig invoeren <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function formatSuggestionAddress(suggestion) {
  if (suggestion.address) return suggestion.address;

  const street = [suggestion.street_name, suggestion.house_number].filter(Boolean).join(" ");
  return [street, suggestion.postal_code, suggestion.city].filter(Boolean).join(", ");
}

function AddressAutocomplete({ value, onChange }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingAddr, setLoadingAddr] = useState(false);
  const addrDebounce = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInput = (nextValue) => {
    onChange(nextValue);
    if (addrDebounce.current) clearTimeout(addrDebounce.current);
    if (!nextValue || nextValue.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    addrDebounce.current = setTimeout(async () => {
      setLoadingAddr(true);
      try {
        const res = await base44.functions.invoke("searchAddress", { query: nextValue });
        const nextSuggestions = res.data?.suggestions || [];
        setSuggestions(nextSuggestions);
        setShowSuggestions(nextSuggestions.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingAddr(false);
      }
    }, 350);
  };

  const handleSelect = (suggestion) => {
    onChange(formatSuggestionAddress(suggestion));
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <Input
          value={value}
          onChange={(event) => handleInput(event.target.value)}
          placeholder="Begin met typen: straat, postcode of stad..."
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          className="pr-10"
        />
        {loadingAddr && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
      </div>
      {showSuggestions && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          {suggestions.map((suggestion, index) => {
            const address = formatSuggestionAddress(suggestion);
            return (
              <button
                key={`${address}-${index}`}
                type="button"
                onMouseDown={() => handleSelect(suggestion)}
                className="w-full border-b border-border px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-accent hover:text-accent-foreground"
              >
                {address}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StepDetails({ customerType, customer, prefilled, onSave, onBack, onCancel, onTypeChange, saving }) {
  const [form, setForm] = useState({
    customer_type: customer?.customer_type || customerType || "bedrijf",
    name: customer?.name || prefilled?.naam || "",
    contact_person: customer?.contact_person || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    address: customer?.address || prefilled?.adres || "",
    kvk_number: customer?.kvk_number || prefilled?.kvkNummer || "",
    notes: customer?.notes || "",
  });

  const isEditing = Boolean(customer?.id);
  const isCompany = form.customer_type === "bedrijf";

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleCustomerTypeChange = (value) => {
    setForm((prev) => ({
      ...prev,
      customer_type: value,
      contact_person: value === "bedrijf" ? prev.contact_person : "",
      kvk_number: value === "bedrijf" ? prev.kvk_number : "",
    }));
    onTypeChange?.(value);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;

    onSave({
      customer_type: form.customer_type,
      name: form.name.trim(),
      contact_person: isCompany ? form.contact_person.trim() : "",
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      kvk_number: isCompany ? form.kvk_number.trim() : "",
      notes: form.notes.trim(),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {isEditing ? "Klant wijzigen" : isCompany ? "Bedrijfsgegevens" : "Persoonsgegevens"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEditing ? "Werk de klantgegevens bij in dezelfde structuur als de klantlijst." : "Vul de gegevens aan of controleer de vooraf ingevulde informatie."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-4 rounded-lg border border-border bg-muted/15 p-4">
          <SectionTitle title="Basisgegevens" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Klanttype</Label>
              <Select value={form.customer_type} onValueChange={handleCustomerTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Kies klanttype" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bedrijf">Bedrijf</SelectItem>
                  <SelectItem value="particulier">Particulier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isCompany ? "Bedrijfsnaam *" : "Naam *"}
              </Label>
              <Input
                value={form.name}
                onChange={(event) => handleChange("name", event.target.value)}
                placeholder={isCompany ? "Bijv. Beveiliging BV" : "Bijv. Jan Jansen"}
                required
              />
            </div>
          </div>

          {isCompany && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">KvK-nummer</Label>
                <Input value={form.kvk_number} onChange={(event) => handleChange("kvk_number", event.target.value)} placeholder="12345678" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contactpersoon</Label>
                <Input value={form.contact_person} onChange={(event) => handleChange("contact_person", event.target.value)} placeholder="Naam contactpersoon" />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-muted/15 p-4">
          <SectionTitle title="Contact en adres" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">E-mailadres</Label>
              <Input type="email" value={form.email} onChange={(event) => handleChange("email", event.target.value)} placeholder="email@voorbeeld.nl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Telefoonnummer</Label>
              <Input value={form.phone} onChange={(event) => handleChange("phone", event.target.value)} placeholder="06-12345678" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adres</Label>
            <AddressAutocomplete value={form.address} onChange={(value) => handleChange("address", value)} />
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-muted/15 p-4">
          <SectionTitle title="Notities" description="Interne informatie voor administratie of planning." />
          <Textarea value={form.notes} onChange={(event) => handleChange("notes", event.target.value)} rows={3} placeholder="Extra informatie..." />
        </section>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={isEditing ? onCancel : () => onBack(form.customer_type)}>
            <ArrowLeft className="h-4 w-4" /> {isEditing ? "Annuleren" : "Terug"}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isEditing ? "Wijzigingen opslaan" : "Opslaan"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function CustomerWizard({ customer, onSave, onCancel, saving }) {
  const isEditing = Boolean(customer?.id);
  const [step, setStep] = useState(isEditing ? "details" : "type");
  const [customerType, setCustomerType] = useState(customer?.customer_type || null);
  const [prefilled, setPrefilled] = useState(null);

  useEffect(() => {
    setStep(customer?.id ? "details" : "type");
    setCustomerType(customer?.customer_type || null);
    setPrefilled(null);
  }, [customer?.id, customer?.customer_type]);

  const handleTypeSelect = (type) => {
    setCustomerType(type);
    if (type === "bedrijf") {
      setStep("kvk");
    } else {
      setStep("details");
    }
  };

  const handleKvkSelect = (company) => {
    setPrefilled(company);
    setStep("details");
  };

  const handleKvkSkip = () => {
    setPrefilled(null);
    setStep("details");
  };

  const steps = isEditing
    ? [{ key: "details", label: "Gegevens" }]
    : [
        { key: "type", label: "Type" },
        ...(customerType === "bedrijf" ? [{ key: "kvk", label: "KvK" }] : []),
        { key: "details", label: "Gegevens" },
      ];

  return (
    <Card className="overflow-hidden border-border bg-card shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <ProgressIndicator steps={steps} currentStep={step} />

        {step === "type" && (
          <StepType onSelect={handleTypeSelect} onCancel={onCancel} />
        )}
        {step === "kvk" && (
          <StepKvK
            onSelect={handleKvkSelect}
            onSkip={handleKvkSkip}
            onBack={() => setStep("type")}
          />
        )}
        {step === "details" && (
          <StepDetails
            customerType={customerType}
            customer={customer}
            prefilled={prefilled}
            onSave={onSave}
            onCancel={onCancel}
            onBack={(currentType) => currentType === "bedrijf" ? setStep("kvk") : setStep("type")}
            onTypeChange={setCustomerType}
            saving={saving}
          />
        )}
      </CardContent>
    </Card>
  );
}
