import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Save, Building2, Monitor, Plus, Trash2, Calculator, Layers,
  Users, Shirt, BookOpen, Heart, Wrench, ShieldCheck, ChevronDown, ChevronUp, Car, Loader2
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { uid, toMonthlyAmount, PERIOD_OPTIONS, FUNCTION_GROUPS } from "./CostHelpers";
import SectionWrapper from "./SectionWrapper";
import FlexCostItem from "./FlexCostItem";
import PersonnelCostItem from "./PersonnelCostItem";
import CompanyCarSection from "./CompanyCarSection";

// --- FlexCostList: lijst van FlexCostItems ---
function FlexCostList({ items = [], onChange, addLabel = "Toevoegen", placeholder = "Omschrijving", quickAdd = [] }) {
  const add = () => onChange([...items, { id: uid(), name: "", amount: 0, period: "per_month", notes: "" }]);
  const update = (idx, val) => onChange(items.map((it, i) => i === idx ? val : it));
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const total = items.reduce((s, it) => s + toMonthlyAmount(it.amount || 0, it.period || "per_month"), 0);

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="grid grid-cols-12 gap-2 mb-1 px-0.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          <div className="col-span-4">{placeholder}</div>
          <div className="col-span-2">Bedrag</div>
          <div className="col-span-2">Periode</div>
          <div className="col-span-2">Per maand</div>
          <div className="col-span-1">Notitie</div>
          <div className="col-span-1" />
        </div>
      )}
      {items.map((item, idx) => (
        <FlexCostItem key={item.id || idx} item={item} onChange={val => update(idx, val)} onDelete={() => remove(idx)} placeholder={placeholder} />
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 text-xs" onClick={add}>
          <Plus className="w-3.5 h-3.5 mr-1" /> {addLabel}
        </Button>
        {items.length > 0 && <span className="text-xs font-semibold text-slate-700">Totaal: €{total.toFixed(2)}/mnd</span>}
      </div>
      {quickAdd.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {quickAdd.map(name => (
            <button key={name} type="button"
              className="text-xs px-2 py-1 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-slate-600 hover:text-slate-700 transition-colors"
              onClick={() => onChange([...items, { id: uid(), name, amount: 0, period: "per_month", notes: "" }])}>
              + {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PERSONNEL_QUICK_ADD = [
  "Bedrijfskleding", "PBM (persoonlijke beschermingsmiddelen)", "Opleidingen & certificeringen",
  "Telefoon / abonnement", "Gereedschap", "EHBO-kosten", "Keuringskosten",
];

// --- PersonnelCostSection: sectie met personeelsgebonden kosten ---
function PersonnelCostSection({ section, onChange, onDelete, personnelCounts, allPersonnel }) {
  const [open, setOpen] = useState(true);
  const isFixed = section.id === "default-personnel";
  const items = section.items || [];
  const secTotal = items.reduce((s, it) => {
    const mode = it.assign_mode || "group";
    let count;
    if (mode === "specific") {
      count = (it.specific_person_ids || []).length;
    } else {
      const fg = it.function_groups || ["all"];
      count = fg.includes("all")
        ? Object.values(personnelCounts).reduce((a, b) => a + b, 0)
        : fg.reduce((a, g) => a + (personnelCounts[g] || 0), 0);
    }
    return s + toMonthlyAmount((it.cost_per_person || 0) * count, it.period || "per_year");
  }, 0);

  const addItem = (name = "") => onChange({
    ...section,
    items: [...items, { id: uid(), name, cost_per_person: 0, period: "per_year", assign_mode: "group", function_groups: ["all"], specific_person_ids: [], notes: "", supplier: "" }]
  });
  const updateItem = (idx, val) => onChange({ ...section, items: items.map((it, i) => i === idx ? val : it) });
  const removeItem = (idx) => {
    if (items[idx]?.readonly) return;
    onChange({ ...section, items: items.filter((_, i) => i !== idx) });
  };

  // Quick-add opties: verberg al toegevoegde namen
  const usedNames = items.map(it => it.name);
  const quickAddOptions = isFixed
    ? PERSONNEL_QUICK_ADD.filter(n => !usedNames.includes(n))
    : [];

  return (
    <Card className="border-0 shadow-sm border-l-4 border-l-blue-400">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={() => setOpen(v => !v)}>
            <Users className="w-4 h-4 text-blue-500 flex-shrink-0" />
            {isFixed ? (
              <span className="font-semibold text-sm text-slate-800">{section.section_name}</span>
            ) : (
              <Input
                value={section.section_name || ""}
                onChange={e => onChange({ ...section, section_name: e.target.value })}
                onClick={e => e.stopPropagation()}
                className="font-semibold text-sm border-0 shadow-none p-0 h-auto focus-visible:ring-0 bg-transparent"
                placeholder="Sectienaam personeelskosten..."
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">€{secTotal.toFixed(2)}/mnd</span>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => setOpen(v => !v)}>
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            {!isFixed && (
              <Button type="button" size="icon" variant="ghost" className="text-red-400 hover:text-red-600 h-8 w-8" onClick={onDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 pt-0">
          {items.length > 0 && (
            <div className="grid grid-cols-12 gap-2 mb-1 px-0.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              <div className="col-span-3">Omschrijving</div>
              <div className="col-span-2">Kosten/persoon</div>
              <div className="col-span-2">Periode</div>
              <div className="col-span-2">Aantal</div>
              <div className="col-span-2">Per maand</div>
              <div className="col-span-1" />
            </div>
          )}
          {items.map((item, idx) => (
            <PersonnelCostItem
              key={item.id || idx}
              item={item}
              onChange={val => updateItem(idx, val)}
              onDelete={() => removeItem(idx)}
              personnelCounts={personnelCounts}
              allPersonnel={allPersonnel}
            />
          ))}
          {/* Vaste sectie: snelknoppen + vrij toevoegen */}
          {isFixed ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {quickAddOptions.map(name => (
                <button key={name} type="button"
                  className="text-xs px-2 py-1 rounded-lg border border-dashed border-blue-200 text-blue-400 hover:border-blue-500 hover:text-blue-600 transition-colors"
                  onClick={() => addItem(name)}>
                  + {name}
                </button>
              ))}
              <button type="button"
                className="text-xs px-2 py-1 rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-600 transition-colors"
                onClick={() => addItem("")}>
                + Overig toevoegen
              </button>
            </div>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800 text-xs" onClick={() => addItem("")}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Kostenpost toevoegen
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// --- Hoofd component ---
export default function CostSettingsForm({ settings, onSave, isSaving }) {
  const { data: offices = [] } = useQuery({ queryKey: ["offices"], queryFn: () => base44.entities.Office.list() });
  const { data: personnel = [] } = useQuery({ queryKey: ["personnel"], queryFn: () => base44.entities.Personnel.list() });

  // Tel medewerkers per functiegroep
  const personnelCounts = {
    surveillant: personnel.filter(p => p.function_type === "surveillant" && p.is_active !== false).length,
    binnendienst: personnel.filter(p => p.function_type === "binnendienst" && p.is_active !== false).length,
    management: 0,
    chauffeur: 0,
  };

  const DEFAULT_PERSONNEL_SECTION = {
    id: "default-personnel",
    section_name: "Personeelsgebonden kosten",
    items: [
      { id: "default-kleding", name: "Bedrijfskleding", cost_per_person: 0, period: "per_year", assign_mode: "group", function_groups: ["all"], specific_person_ids: [], notes: "", supplier: "", readonly: true },
    ],
  };

  const [form, setForm] = useState(null);

  // Initialiseer form zodra settings + offices geladen zijn
  useEffect(() => {
    const base = {
      label: "Standaard",
      housing_costs: [],
      software_costs: [],
      custom_cost_sections: [],
      personnel_cost_sections: [DEFAULT_PERSONNEL_SECTION],
      ...(settings || {}),
    };
    if (!base.personnel_cost_sections || base.personnel_cost_sections.length === 0) {
      base.personnel_cost_sections = [DEFAULT_PERSONNEL_SECTION];
    }
    // Sync offices in housing_costs
    if (offices.length > 0) {
      const existingIds = (base.housing_costs || []).map(h => h.office_id);
      const newEntries = offices.filter(o => !existingIds.includes(o.id)).map(o => ({
        office_id: o.id, office_name: o.name,
        rent_per_month: 0, utilities_per_month: 0, cleaning_per_month: 0, other_per_month: 0,
      }));
      const updated = (base.housing_costs || []).map(h => {
        const office = offices.find(o => o.id === h.office_id);
        return office ? { ...h, office_name: office.name } : h;
      });
      base.housing_costs = [...updated, ...newEntries];
    }
    setForm(base);
  }, [settings?.id, offices.length]);

  if (form === null) return null;

  const handleSave = () => { onSave(form); };

  const updateHousing = (idx, field, value) => {
    setForm(prev => ({ ...prev, housing_costs: prev.housing_costs.map((h, i) => i === idx ? { ...h, [field]: value } : h) }));
  };

  // Totalen
  const housingTotal = (form.housing_costs || []).reduce((s, h) =>
    s + (h.rent_per_month || 0) + (h.utilities_per_month || 0) + (h.cleaning_per_month || 0) + (h.other_per_month || 0), 0);
  const softwareTotal = (form.software_costs || []).reduce((s, i) => s + toMonthlyAmount(i.amount || 0, i.period || "per_month"), 0);
  const adminTotal = form.admin_salary_per_month || 0;
  const customSectionsTotal = (form.custom_cost_sections || []).reduce((s, sec) =>
    s + (sec.items || []).reduce((ss, it) => ss + toMonthlyAmount(it.amount || 0, it.period || "per_month"), 0), 0);
  const personnelSectionsTotal = (form.personnel_cost_sections || []).reduce((s, sec) =>
    s + (sec.items || []).reduce((ss, it) => {
      const fg = it.function_groups || ["all"];
      const count = fg.includes("all")
        ? Object.values(personnelCounts).reduce((a, b) => a + b, 0)
        : fg.reduce((a, g) => a + (personnelCounts[g] || 0), 0);
      return ss + toMonthlyAmount((it.cost_per_person || 0) * count, it.period || "per_year");
    }, 0), 0);
  const grandTotal = housingTotal + softwareTotal + customSectionsTotal + personnelSectionsTotal;

  const addCustomSection = () => setForm(prev => ({
    ...prev,
    custom_cost_sections: [...(prev.custom_cost_sections || []), { id: uid(), section_name: "Nieuwe sectie", items: [] }],
  }));

  const updateCustomSection = (idx, updated) => setForm(prev => ({
    ...prev,
    custom_cost_sections: prev.custom_cost_sections.map((s, i) => i === idx ? updated : s),
  }));

  const deleteCustomSection = (idx) => {
    if (!confirm("Sectie verwijderen?")) return;
    setForm(prev => ({ ...prev, custom_cost_sections: prev.custom_cost_sections.filter((_, i) => i !== idx) }));
  };

  const addPersonnelSection = () => setForm(prev => ({
    ...prev,
    personnel_cost_sections: [...(prev.personnel_cost_sections || []), {
      id: uid(), section_name: "Personeelskosten", items: []
    }],
  }));

  const updatePersonnelSection = (idx, updated) => setForm(prev => ({
    ...prev,
    personnel_cost_sections: prev.personnel_cost_sections.map((s, i) => i === idx ? updated : s),
  }));

  const deletePersonnelSection = (idx) => {
    if (!confirm("Sectie verwijderen?")) return;
    setForm(prev => ({ ...prev, personnel_cost_sections: prev.personnel_cost_sections.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="space-y-5">

      {/* Huisvestingskosten */}
      <SectionWrapper icon={Building2} title="Huisvestingskosten" total={housingTotal}>
        {(form.housing_costs || []).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">
            Voeg eerst kantoren toe via <strong>Instellingen</strong> om huisvestingskosten per kantoor in te vullen.
          </p>
        ) : (
          <div className="space-y-4">
            {(form.housing_costs || []).map((h, idx) => (
              <div key={h.office_id || idx} className="bg-slate-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />{h.office_name || `Kantoor ${idx + 1}`}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { field: "rent_per_month", label: "Huur / hypotheek" },
                    { field: "utilities_per_month", label: "Energie & water" },
                    { field: "cleaning_per_month", label: "Schoonmaak" },
                    { field: "other_per_month", label: "Overig" },
                  ].map(({ field, label }) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs text-slate-500">{label} (€/mnd)</Label>
                      <Input type="number" min="0" step="0.01" value={h[field] || ""}
                        onChange={e => updateHousing(idx, field, parseFloat(e.target.value) || 0)} placeholder="0" />
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
      </SectionWrapper>

      {/* Software */}
      <SectionWrapper icon={Monitor} title="Softwarekosten" total={softwareTotal}>
        <FlexCostList
          items={form.software_costs || []}
          onChange={items => setForm(prev => ({ ...prev, software_costs: items }))}
          addLabel="Software toevoegen"
          placeholder="Naam software"
          quickAdd={["Alarmsoftware", "Planning software", "Facturatie", "Microsoft 365", "GPS tracking", "HR systeem", "Boekhouding", "Tijdregistratie"]}
        />
      </SectionWrapper>

      {/* Auto's van de zaak (personeel) */}
      <CompanyCarSection personnel={personnel} />

      {/* Personeelsgebonden kostensecties */}
      {(form.personnel_cost_sections || []).map((section, idx) => (
        <PersonnelCostSection
          key={section.id || idx}
          section={section}
          onChange={updated => updatePersonnelSection(idx, updated)}
          onDelete={() => deletePersonnelSection(idx)}
          personnelCounts={personnelCounts}
          allPersonnel={personnel}
        />
      ))}

      {/* Personeelssectie toevoegen */}
      <button type="button" onClick={addPersonnelSection}
        className="w-full py-3 border-2 border-dashed border-blue-200 rounded-xl text-sm text-blue-400 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2">
        <Users className="w-4 h-4" /> Personeelsgebonden kostensectie toevoegen
        <span className="text-xs text-blue-300">(bijv. kleding, PBM, opleidingen)</span>
      </button>

      {/* Aangepaste secties */}
      {(form.custom_cost_sections || []).map((section, idx) => {
        const secTotal = (section.items || []).reduce((s, it) => s + toMonthlyAmount(it.amount || 0, it.period || "per_month"), 0);
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
              <FlexCostList
                items={section.items || []}
                onChange={items => updateCustomSection(idx, { ...section, items })}
                addLabel="Kostenpost toevoegen"
                placeholder="Omschrijving"
              />
            </CardContent>
          </Card>
        );
      })}

      {/* Vrije sectie toevoegen */}
      <button type="button" onClick={addCustomSection}
        className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600 transition-colors flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Vrije kostensectie toevoegen
        <span className="text-xs text-slate-400">(bijv. marketing, verzekeringen, telefonie)</span>
      </button>

      {/* Totaaloverzicht */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-slate-800 to-slate-900 text-white">
        <CardContent className="py-5">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-4 h-4 text-amber-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Totaaloverzicht overige kosten</p>
          </div>
          <div className="space-y-1.5 mb-4">
            {housingTotal > 0 && (
              <div className="flex justify-between text-sm text-slate-300"><span>Huisvesting</span><span>€{housingTotal.toFixed(2)}</span></div>
            )}
            {softwareTotal > 0 && (
              <div className="flex justify-between text-sm text-slate-300"><span>Software</span><span>€{softwareTotal.toFixed(2)}</span></div>
            )}
            {(form.personnel_cost_sections || []).map((sec, i) => {
              const t = (sec.items || []).reduce((s, it) => {
                const fg = it.function_groups || ["all"];
                const count = fg.includes("all")
                  ? Object.values(personnelCounts).reduce((a, b) => a + b, 0)
                  : fg.reduce((a, g) => a + (personnelCounts[g] || 0), 0);
                return s + toMonthlyAmount((it.cost_per_person || 0) * count, it.period || "per_year");
              }, 0);
              return t > 0 ? (
                <div key={i} className="flex justify-between text-sm text-slate-300">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3 text-blue-400" />{sec.section_name}</span>
                  <span>€{t.toFixed(2)}</span>
                </div>
              ) : null;
            })}
            {(form.custom_cost_sections || []).map((sec, i) => {
              const t = (sec.items || []).reduce((s, it) => s + toMonthlyAmount(it.amount || 0, it.period || "per_month"), 0);
              return t > 0 ? (
                <div key={i} className="flex justify-between text-sm text-slate-300">
                  <span>{sec.section_name}</span><span>€{t.toFixed(2)}</span>
                </div>
              ) : null;
            })}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-700 pt-4">
            <div>
              <p className="text-xs text-slate-400">Totaal/mnd</p>
              <p className="text-2xl font-bold">€{grandTotal.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Totaal/kwartaal</p>
              <p className="text-2xl font-bold">€{(grandTotal * 3).toFixed(0)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Totaal/jaar</p>
              <p className="text-2xl font-bold">€{(grandTotal * 12).toFixed(0)}</p>
            </div>

          </div>

        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="bg-slate-900 hover:bg-slate-800">
          {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          {isSaving ? "Opslaan..." : "Opslaan"}
        </Button>
      </div>
    </div>
  );
}