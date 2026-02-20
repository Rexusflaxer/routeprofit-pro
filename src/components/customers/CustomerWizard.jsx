import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, User, Search, ArrowRight, ArrowLeft, Check, Loader2, X } from "lucide-react";

// Step 1: Kies type
function StepType({ onSelect, onCancel }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Nieuwe klant toevoegen</h2>
        <p className="text-slate-500 text-sm mt-1">Wat voor soort klant wilt u toevoegen?</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => onSelect("particulier")}
          className="group border-2 border-slate-200 hover:border-purple-400 hover:bg-purple-50 rounded-2xl p-8 flex flex-col items-center gap-4 transition-all duration-200 text-left"
        >
          <div className="w-16 h-16 rounded-2xl bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center transition-colors">
            <User className="w-8 h-8 text-purple-600" />
          </div>
          <div className="text-center">
            <p className="font-bold text-slate-900 text-lg">Particulier</p>
            <p className="text-slate-500 text-sm mt-1">Een privépersoon als klant</p>
          </div>
        </button>

        <button
          onClick={() => onSelect("bedrijf")}
          className="group border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 rounded-2xl p-8 flex flex-col items-center gap-4 transition-all duration-200 text-left"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center transition-colors">
            <Building2 className="w-8 h-8 text-blue-600" />
          </div>
          <div className="text-center">
            <p className="font-bold text-slate-900 text-lg">Bedrijf</p>
            <p className="text-slate-500 text-sm mt-1">Een organisatie of onderneming</p>
          </div>
        </button>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
      </div>
    </div>
  );
}

// Step 1b: KvK zoeken (alleen bij bedrijf)
function StepKvK({ onSelect, onSkip, onBack }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setSearched(false);
    try {
      const res = await base44.functions.invoke("searchKvK", { query: query.trim() });
      setResults(res.data.results || []);
      setSearched(true);
    } catch (e) {
      setError("Zoeken mislukt. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Bedrijf zoeken in KvK</h2>
        <p className="text-slate-500 text-sm mt-1">Zoek op bedrijfsnaam, KVK-nummer of adres</p>
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Bedrijfsnaam, KVK-nummer of adres..."
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={loading || !query.trim()} className="bg-slate-900 hover:bg-slate-800">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {searched && results.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-4">Geen resultaten gevonden. Probeer een andere zoekterm of sla het handelsregister over.</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => onSelect(r)}
              className="w-full text-left border border-slate-200 hover:border-blue-400 hover:bg-blue-50 rounded-xl px-4 py-3 transition-all group"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{r.naam}</p>
                  <div className="flex gap-3 mt-0.5">
                    {r.kvkNummer && <span className="text-xs text-slate-500">KVK: {r.kvkNummer}</span>}
                    {r.adres && <span className="text-xs text-slate-500">{r.adres}</span>}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center pt-2">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Terug</Button>
        <Button variant="outline" onClick={onSkip}>
          Handmatig invoeren <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// Step 2: Gegevens invullen
function StepDetails({ customerType, prefilled, onSave, onBack, saving }) {
  const [form, setForm] = useState({
    customer_type: customerType,
    name: prefilled?.naam || "",
    contact_person: "",
    email: "",
    phone: "",
    address: prefilled?.adres || "",
    kvk_number: prefilled?.kvkNummer || "",
    notes: "",
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          {customerType === "bedrijf" ? "Bedrijfsgegevens" : "Persoonsgegevens"}
        </h2>
        <p className="text-slate-500 text-sm mt-1">Vul de gegevens aan of controleer de vooraf ingevulde informatie</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {customerType === "bedrijf" ? "Bedrijfsnaam *" : "Naam *"}
            </Label>
            <Input
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder={customerType === "bedrijf" ? "Bijv. Beveiliging BV" : "Bijv. Jan Jansen"}
              required
            />
          </div>
          {customerType === "bedrijf" && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contactpersoon</Label>
              <Input
                value={form.contact_person}
                onChange={(e) => handleChange("contact_person", e.target.value)}
                placeholder="Naam contactpersoon"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">E-mailadres</Label>
            <Input type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)} placeholder="email@voorbeeld.nl" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Telefoonnummer</Label>
            <Input value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} placeholder="06-12345678" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Adres</Label>
            <Input value={form.address} onChange={(e) => handleChange("address", e.target.value)} placeholder="Straat 1, 1234 AB Stad" />
          </div>
          {customerType === "bedrijf" && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">KVK-nummer</Label>
              <Input value={form.kvk_number} onChange={(e) => handleChange("kvk_number", e.target.value)} placeholder="12345678" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Opmerkingen</Label>
          <Textarea value={form.notes} onChange={(e) => handleChange("notes", e.target.value)} rows={2} placeholder="Extra informatie..." />
        </div>

        <div className="flex justify-between items-center pt-2">
          <Button type="button" variant="outline" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Terug</Button>
          <Button type="submit" disabled={saving} className="bg-slate-900 hover:bg-slate-800">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
            Opslaan
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function CustomerWizard({ onSave, onCancel, saving }) {
  const [step, setStep] = useState("type"); // "type" | "kvk" | "details"
  const [customerType, setCustomerType] = useState(null);
  const [prefilled, setPrefilled] = useState(null);

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

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="p-6 sm:p-8">
        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[
            { key: "type", label: "Type" },
            ...(customerType === "bedrijf" ? [{ key: "kvk", label: "KvK" }] : []),
            { key: "details", label: "Gegevens" },
          ].map((s, i, arr) => (
            <React.Fragment key={s.key}>
              <div className={`flex items-center gap-1.5 ${step === s.key ? "text-slate-900 font-semibold" : arr.findIndex(x => x.key === step) > i ? "text-slate-400" : "text-slate-300"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === s.key ? "bg-slate-900 text-white" : arr.findIndex(x => x.key === step) > i ? "bg-slate-200 text-slate-600" : "bg-slate-100 text-slate-300"}`}>
                  {arr.findIndex(x => x.key === step) > i ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span className="text-xs hidden sm:inline">{s.label}</span>
              </div>
              {i < arr.length - 1 && <div className="flex-1 h-px bg-slate-200" />}
            </React.Fragment>
          ))}
        </div>

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
            prefilled={prefilled}
            onSave={onSave}
            onBack={() => customerType === "bedrijf" ? setStep("kvk") : setStep("type")}
            saving={saving}
          />
        )}
      </CardContent>
    </Card>
  );
}