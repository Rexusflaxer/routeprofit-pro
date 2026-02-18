import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Building2, Monitor, Plus, Trash2, ChevronDown, ChevronUp, Calculator, Layers, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

// Hulpfunctie: genereer uniek id
const uid = () => Math.random().toString(36).slice(2, 9);

function SectionHeader({ icon: Icon, title, color = "text-amber-600", total, children }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOpen(v => !v)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className={`w-4 h-4 ${color}`} />
            {title}
          </CardTitle>
          <div className="flex items-center gap-3">
            {total !== undefined && (
              <span className="text-sm font-semibold text-slate-700">€{total.toFixed(2)}/mnd</span>
            )}
            {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>
      </CardHeader>
      {open && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  );
}

function CostLineItem({ item, onChange, onDelete, placeholder = "Naam" }) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <div className="col-span-5">
        <Input
          value={item.name || ""}
          onChange={e => onChange({ ...item, name: e.target.value })}
          placeholder={placeholder}
          className="text-sm"
        />
      </div>
      <div className="col-span-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">€</span>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={item.cost_per_month || ""}
            onChange={e => onChange({ ...item, cost_per_month: parseFloat(e.target.value) || 0 })}
            placeholder="0,00"
            className="pl-6 text-sm"
          />
        </div>
      </div>
      <div className="col-span-1 text-center">
        <span className="text-xs text-slate-400">/mnd</span>
      </div>
      <div className="col-span-2">
        <Input
          value={item.notes || ""}
          onChange={e => onChange({ ...item, notes: e.target.value })}
          placeholder="Notitie"
          className="text-sm text-slate-500"
        />
      </div>
      <div className="col-span-1 flex justify-end">
        <Button type="button" size="icon" variant="ghost" className="text-red-400 hover:text-red-600 h-8 w-8" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CostListSection({ items = [], onChange, addLabel = "Regel toevoegen", placeholder = "Naam" }) {
  const add = () => onChange([...items, { id: uid(), name: "", cost_per_month: 0, notes: "" }]);
  const update = (idx, val) => onChange(items.map((it, i) => i === idx ? val : it));
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const total = items.reduce((s, it) => s + (it.cost_per_month || 0), 0);

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="grid grid-cols-12 gap-2 mb-1 px-0.5">
          <div className="col-span-5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{placeholder}</div>
          <div className="col-span-3 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Bedrag</div>
          <div className="col-span-1" />
          <div className="col-span-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Notitie</div>
          <div className="col-span-1" />
        </div>
      )}
      {items.map((item, idx) => (
        <CostLineItem key={item.id || idx} item={item} onChange={val => update(idx, val)} onDelete={() => remove(idx)} placeholder={placeholder} />
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 text-xs" onClick={add}>
          <Plus className="w-3.5 h-3.5 mr-1" /> {addLabel}
        </Button>
        {items.length > 0 && (
          <span className="text-xs font-semibold text-slate-700">Totaal: €{total.toFixed(2)}/mnd</span>
        )}
      </div>
    </div>
  );
}

export default function CostSettingsForm({ settings, onSave }) {
  const { data: offices = [] } = useQuery({
    queryKey: ["offices"],
    queryFn: () => base44.entities.Office.list(),
  });

  const [form, setForm] = useState(() => ({
    label: "Standaard",
    housing_costs: [],
    software_costs: [],
    custom_cost_sections: [],
    admin_salary_per_month: 0,
    ...settings,
  }));

  // Sync offices into housing_costs wanneer offices laden
  useEffect(() => {
    if (offices.length === 0) return;
    setForm(prev => {
      const existingIds = (prev.housing_costs || []).map(h => h.office_id);
      const newEntries = offices
        .filter(o => !existingIds.includes(o.id))
        .map(o => ({
          office_id: o.id,
          office_name: o.name,
          rent_per_month: 0,
          utilities_per_month: 0,
          cleaning_per_month: 0,
          other_per_month: 0,
        }));
      // Update office names voor bestaande items
      const updated = (prev.housing_costs || []).map(h => {
        const office = offices.find(o => o.id === h.office_id);
        return office ? { ...h, office_name: office.name } : h;
      });
      return { ...prev, housing_costs: [...updated, ...newEntries] };
    });
  }, [offices]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const updateHousing = (idx, field, value) => {
    setForm(prev => ({
      ...prev,
      housing_costs: prev.housing_costs.map((h, i) => i === idx ? { ...h, [field]: value } : h),
    }));
  };

  const housingTotal = (form.housing_costs || []).reduce((s, h) =>
    s + (h.rent_per_month || 0) + (h.utilities_per_month || 0) + (h.cleaning_per_month || 0) + (h.other_per_month || 0), 0);

  const softwareTotal = (form.software_costs || []).reduce((s, i) => s + (i.cost_per_month || 0), 0);

  const adminTotal = form.admin_salary_per_month || 0;

  const customSectionsTotal = (form.custom_cost_sections || []).reduce((s, sec) =>
    s + (sec.items || []).reduce((ss, it) => ss + (it.cost_per_month || 0), 0), 0);

  const grandTotal = housingTotal + softwareTotal + adminTotal + customSectionsTotal;

  const addCustomSection = () => {
    setForm(prev => ({
      ...prev,
      custom_cost_sections: [...(prev.custom_cost_sections || []), {
        id: uid(),
        section_name: "Nieuwe sectie",
        items: [],
      }],
    }));
  };

  const updateCustomSection = (idx, updated) => {
    setForm(prev => ({
      ...prev,
      custom_cost_sections: prev.custom_cost_sections.map((s, i) => i === idx ? updated : s),
    }));
  };

  const deleteCustomSection = (idx) => {
    if (!confirm("Sectie verwijderen?")) return;
    setForm(prev => ({
      ...prev,
      custom_cost_sections: prev.custom_cost_sections.filter((_, i) => i !== idx),
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Huisvestingskosten */}
      <SectionHeader icon={Building2} title="Huisvestingskosten" total={housingTotal}>
        {(form.housing_costs || []).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Voeg eerst kantoren toe via <strong>Instellingen</strong> om huisvestingskosten per kantoor in te vullen.</p>
        ) : (
          <div className="space-y-4">
            {(form.housing_costs || []).map((h, idx) => (
              <div key={h.office_id || idx} className="bg-slate-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  {h.office_name || `Kantoor ${idx + 1}`}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { field: "rent_per_month", label: "Huur/hypotheek" },
                    { field: "utilities_per_month", label: "Energie & water" },
                    { field: "cleaning_per_month", label: "Schoonmaak" },
                    { field: "other_per_month", label: "Overig" },
                  ].map(({ field, label }) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs text-slate-500">{label} (€/mnd)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={h[field] || ""}
                        onChange={e => updateHousing(idx, field, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                <div className="text-right text-xs font-semibold text-slate-600">
                  Subtotaal: €{((h.rent_per_month || 0) + (h.utilities_per_month || 0) + (h.cleaning_per_month || 0) + (h.other_per_month || 0)).toFixed(2)}/mnd
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionHeader>

      {/* Administratief personeel */}
      <SectionHeader icon={Users} title="Administratief personeel" total={adminTotal}>
        <div className="space-y-1.5 max-w-xs">
          <Label className="text-xs text-slate-500">Totale salariskosten admin/binnendienst (€/mnd)</Label>
          <Input
            type="number"
            min="0"
            value={form.admin_salary_per_month || ""}
            onChange={e => setForm(prev => ({ ...prev, admin_salary_per_month: parseFloat(e.target.value) || 0 }))}
            placeholder="bijv. 3500"
          />
          <p className="text-[10px] text-slate-400">Inclusief werkgeverslasten voor binnendienst / management personeel</p>
        </div>
      </SectionHeader>

      {/* Software */}
      <SectionHeader icon={Monitor} title="Softwarekosten" total={softwareTotal}>
        <CostListSection
          items={form.software_costs || []}
          onChange={items => setForm(prev => ({ ...prev, software_costs: items }))}
          addLabel="Software toevoegen"
          placeholder="Naam software"
        />
        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
          {["Alarmsoftware", "Planning software", "Facturatie", "Microsoft 365", "GPS tracking", "HR systeem"].map(s => (
            <button
              key={s}
              type="button"
              className="text-xs px-2 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-slate-500 hover:text-slate-700 transition-colors text-left"
              onClick={() => setForm(prev => ({
                ...prev,
                software_costs: [...(prev.software_costs || []), { id: uid(), name: s, cost_per_month: 0, notes: "" }]
              }))}
            >
              + {s}
            </button>
          ))}
        </div>
      </SectionHeader>

      {/* Aangepaste secties */}
      {(form.custom_cost_sections || []).map((section, idx) => {
        const secTotal = (section.items || []).reduce((s, it) => s + (it.cost_per_month || 0), 0);
        return (
          <Card key={section.id || idx} className="border-0 shadow-sm border-l-4 border-l-amber-400">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <Layers className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <Input
                    value={section.section_name || ""}
                    onChange={e => updateCustomSection(idx, { ...section, section_name: e.target.value })}
                    className="font-semibold text-sm border-0 shadow-none p-0 h-auto focus-visible:ring-0 bg-transparent"
                    placeholder="Sectienaam..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">€{secTotal.toFixed(2)}/mnd</span>
                  <Button type="button" size="icon" variant="ghost" className="text-red-400 hover:text-red-600 h-8 w-8" onClick={() => deleteCustomSection(idx)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CostListSection
                items={section.items || []}
                onChange={items => updateCustomSection(idx, { ...section, items })}
                addLabel="Kostenpost toevoegen"
                placeholder="Omschrijving"
              />
            </CardContent>
          </Card>
        );
      })}

      {/* Sectie toevoegen knop */}
      <button
        type="button"
        onClick={addCustomSection}
        className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" /> Nieuwe kostensectie toevoegen
      </button>

      {/* Samenvatting */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-slate-800 to-slate-900 text-white">
        <CardContent className="py-5">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-4 h-4 text-amber-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Totaaloverzicht overige kosten</p>
          </div>
          <div className="space-y-2 mb-4">
            {housingTotal > 0 && (
              <div className="flex justify-between text-sm text-slate-300">
                <span>Huisvesting</span><span>€{housingTotal.toFixed(2)}</span>
              </div>
            )}
            {adminTotal > 0 && (
              <div className="flex justify-between text-sm text-slate-300">
                <span>Administratief personeel</span><span>€{adminTotal.toFixed(2)}</span>
              </div>
            )}
            {softwareTotal > 0 && (
              <div className="flex justify-between text-sm text-slate-300">
                <span>Software</span><span>€{softwareTotal.toFixed(2)}</span>
              </div>
            )}
            {(form.custom_cost_sections || []).filter(s => (s.items || []).some(it => it.cost_per_month > 0)).map((sec, idx) => {
              const t = (sec.items || []).reduce((s, it) => s + (it.cost_per_month || 0), 0);
              return (
                <div key={idx} className="flex justify-between text-sm text-slate-300">
                  <span>{sec.section_name || "Sectie"}</span><span>€{t.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 border-t border-slate-700 pt-4">
            <div>
              <p className="text-xs text-slate-400">Totaal/mnd</p>
              <p className="text-2xl font-bold">€{grandTotal.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Totaal/jaar</p>
              <p className="text-2xl font-bold">€{(grandTotal * 12).toFixed(0)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Per werkdag (÷22)</p>
              <p className="text-2xl font-bold">€{(grandTotal / 22).toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
          <Save className="w-4 h-4 mr-1" /> Opslaan
        </Button>
      </div>
    </form>
  );
}