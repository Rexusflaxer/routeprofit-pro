import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, Loader2, ArrowLeft, Building, MapPin, X } from "lucide-react";

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

  // Exclude self from parent options
  const parentOptions = collectieven.filter(c => c.id !== collectief?.id);

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
              <Select value={form.customer_id} onValueChange={(v) => handleChange("customer_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer klant..." />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Adres & parent collectief */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Adres / Locatie</Label>
              <Input
                value={form.address}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="Bijv. Industrieweg 1, Enschede"
              />
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
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                {objects.map((obj, i) => (
                  <label
                    key={obj.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${i > 0 ? "border-t border-slate-100" : ""}`}
                  >
                    <Checkbox
                      checked={form.object_ids.includes(obj.id)}
                      onCheckedChange={() => toggleObject(obj.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {obj.object_code ? <span className="text-slate-400 mr-1">[{obj.object_code}]</span> : null}
                        {obj.name}
                      </p>
                      {obj.address && <p className="text-xs text-slate-400 truncate">{obj.address}</p>}
                    </div>
                  </label>
                ))}
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