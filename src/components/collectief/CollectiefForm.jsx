import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, Loader2, ArrowLeft, Building, MapPin, X, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";

const TYPE_OPTIONS = [
  { value: "regio_groep", label: "Regio / Groep", description: "Een geografische regio of logische groepering van objecten" },
  { value: "bedrijventerrein", label: "Bedrijventerrein", description: "Een terrein met meerdere bedrijven van verschillende klanten" },
  { value: "bedrijfsverzamelgebouw", label: "Bedrijfsverzamelgebouw", description: "Een gebouw met meerdere huurders/bedrijven" },
];

export default function CollectiefForm({ collectief, customers, objects, collectieven, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: collectief?.name || "",
    collectief_type: collectief?.collectief_type || "bedrijventerrein",
    customer_id: collectief?.customer_id || "",
    parent_collectief_id: collectief?.parent_collectief_id || "",
    object_ids: collectief?.object_ids || [],
    address: collectief?.address || "",
    notes: collectief?.notes || "",
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleObject = (id) => {
    setForm(prev => ({
      ...prev,
      object_ids: prev.object_ids.includes(id)
        ? prev.object_ids.filter(o => o !== id)
        : [...prev.object_ids, id],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.customer_id) return;
    const data = { ...form };
    if (!data.parent_collectief_id) delete data.parent_collectief_id;
    onSave(data);
  };

  const [objectSearch, setObjectSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  // Exclude self from parent options
  const parentOptions = collectieven.filter(c => c.id !== collectief?.id);

  // Object IDs die al in een ander collectief zitten (niet het huidige)
  const takenObjectIds = new Set(
    collectieven
      .filter(c => c.id !== collectief?.id)
      .flatMap(c => c.object_ids || [])
  );

  // Address autocomplete
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const addressDebounceRef = useRef(null);
  const addressWrapperRef = useRef(null);

  const handleAddressChange = (value) => {
    handleChange("address", value);
    clearTimeout(addressDebounceRef.current);
    if (value.length < 3) { setAddressSuggestions([]); setShowSuggestions(false); return; }
    addressDebounceRef.current = setTimeout(async () => {
      setAddressLoading(true);
      const res = await base44.functions.invoke("searchAddress", { query: value });
      setAddressSuggestions(res.data?.suggestions || []);
      setShowSuggestions(true);
      setAddressLoading(false);
    }, 400);
  };

  const selectAddress = (suggestion) => {
    handleChange("address", suggestion.address);
    setShowSuggestions(false);
    setAddressSuggestions([]);
  };

  useEffect(() => {
    const handleClick = (e) => {
      if (addressWrapperRef.current && !addressWrapperRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900">{collectief ? "Collectief bewerken" : "Nieuw collectief"}</h2>
          <p className="text-slate-500 text-sm mt-1">Koppel objecten en stel het type in</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Type selectie */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Type collectief *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleChange("collectief_type", opt.value)}
                  className={`text-left border-2 rounded-xl p-4 transition-all ${
                    form.collectief_type === opt.value
                      ? "border-slate-800 bg-slate-50"
                      : "border-slate-200 hover:border-slate-400"
                  }`}
                >
                  <p className="font-semibold text-sm text-slate-900">{opt.label}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-snug">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Naam & klant */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Naam *</Label>
              <Input
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Bijv. H2O Bedrijventerrein Noord"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Beheerder (klant) *</Label>
              <div className="space-y-2">
                <Input
                  placeholder="Zoek klant..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                  {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { handleChange("customer_id", c.id); setCustomerSearch(""); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors ${i > 0 ? "border-t border-slate-100" : ""} ${form.customer_id === c.id ? "bg-slate-100" : ""}`}
                    >
                      <span className="font-medium text-slate-900">{c.name}</span>
                    </button>
                  ))}
                </div>
                {form.customer_id && (
                  <div className="text-sm text-slate-600">Geselecteerd: <span className="font-medium">{customers.find(c => c.id === form.customer_id)?.name}</span></div>
                )}
              </div>
            </div>
          </div>

          {/* Adres & parent collectief */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2" ref={addressWrapperRef}>
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Adres / Locatie</Label>
              <div className="relative">
                <Input
                  value={form.address}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Bijv. Industrieweg 1, Enschede"
                  autoComplete="off"
                />
                {addressLoading && (
                  <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-slate-400" />
                )}
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {addressSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="w-full text-left flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
                        onMouseDown={() => selectAddress(s)}
                      >
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{s.address}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Valt onder collectief (optioneel)</Label>
              <Select
                value={form.parent_collectief_id || "none"}
                onValueChange={(v) => handleChange("parent_collectief_id", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Geen (top-niveau)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Geen (top-niveau)</SelectItem>
                  {parentOptions.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Objecten koppelen */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Objecten in dit collectief
              {form.object_ids.length > 0 && (
                <span className="ml-2 normal-case font-normal text-slate-400">({form.object_ids.length} geselecteerd)</span>
              )}
            </Label>
            {objects.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Geen objecten beschikbaar. Voeg eerst objecten toe.</p>
            ) : (
              <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={objectSearch}
                  onChange={e => setObjectSearch(e.target.value)}
                  placeholder="Zoek op naam, code of adres..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                {objects.filter(obj => {
                  const q = objectSearch.toLowerCase();
                  return !q || obj.name?.toLowerCase().includes(q) || obj.object_code?.toLowerCase().includes(q) || obj.address?.toLowerCase().includes(q);
                }).map((obj, i) => {
                  const isTaken = takenObjectIds.has(obj.id);
                  const takenBy = isTaken
                    ? collectieven.find(c => c.id !== collectief?.id && (c.object_ids || []).includes(obj.id))
                    : null;
                  return (
                    <label
                      key={obj.id}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${i > 0 ? "border-t border-slate-100" : ""} ${isTaken ? "opacity-50 cursor-not-allowed bg-slate-50" : "cursor-pointer hover:bg-slate-50"}`}
                    >
                      <Checkbox
                        checked={form.object_ids.includes(obj.id)}
                        onCheckedChange={() => !isTaken && toggleObject(obj.id)}
                        disabled={isTaken}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {obj.object_code ? <span className="text-slate-400 mr-1">[{obj.object_code}]</span> : null}
                          {obj.name}
                        </p>
                        {isTaken
                          ? <p className="text-xs text-amber-600">Al in gebruik: {takenBy?.name}</p>
                          : obj.address && <p className="text-xs text-slate-400 truncate">{obj.address}</p>
                        }
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            )}
          </div>

          {/* Notities */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Opmerkingen</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              rows={2}
              placeholder="Extra informatie over dit collectief..."
            />
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Annuleren
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim() || !form.customer_id} className="bg-slate-900 hover:bg-slate-800">
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              {collectief ? "Opslaan" : "Aanmaken"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}