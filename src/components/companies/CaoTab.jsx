import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Check, ChevronRight, ChevronLeft, Edit, Trash2, AlertTriangle } from "lucide-react";
import CaoCustomFunctionsManager from "./CaoCustomFunctionsManager";
import { motion, AnimatePresence } from "framer-motion";

const CAO_KEY_LABELS = {
  cao_particuliere_beveiliging: "CAO Particuliere Beveiliging",
  cao_evenementen_horecabeveiliging: "CAO Evenementen- en Horecabeveiliging",
  cao_verkeersregelaars: "CAO Verkeersregelaars",
  cao_veiligheidsdomein: "CAO Veiligheidsdomein",
};

const FUNCTION_LABELS = {
  objectbeveiliger: "Objectbeveiliger",
  receptionist: "Receptionist",
  mobiel_surveillant: "Mobiel Surveillant",
  winkelsurveillant: "Winkelsurveillant",
  centralist: "Centralist",
  brandwacht: "Brandwacht",
  geld_waardetransporteur: "Geld- en waardetransporteur",
  planner: "Planner",
  binnendienst: "Algemeen binnendienst",
  hr_manager: "HR-Manager",
  sales_manager: "Sales Manager",
  evenementenbeveiliger: "Evenementenbeveiliger",
  horecabeveiliger: "Horecabeveiliger",
  verkeersregelaar: "Verkeersregelaar",
  toezichthouder: "Toezichthouder",
  handhaver: "Handhaver",
  boa: "BOA",
};

// Per CAO: welke functies zijn operationeel vs. binnendienst
const CAO_FUNCTION_GROUPS = {
  cao_particuliere_beveiliging: {
    operationeel: ["objectbeveiliger", "receptionist", "mobiel_surveillant", "winkelsurveillant", "centralist", "brandwacht", "geld_waardetransporteur", "evenementenbeveiliger"],
    binnendienst: ["binnendienst", "planner", "hr_manager", "sales_manager"],
  },
  cao_evenementen_horecabeveiliging: {
    operationeel: ["evenementenbeveiliger", "horecabeveiliger"],
    binnendienst: [],
  },
  cao_verkeersregelaars: {
    operationeel: ["verkeersregelaar"],
    binnendienst: [],
  },
  cao_veiligheidsdomein: {
    operationeel: ["toezichthouder", "handhaver", "boa"],
    binnendienst: [],
  },
};

const CAO_FUNCTION_CATALOG = {
  cao_particuliere_beveiliging: [
    "objectbeveiliger", "receptionist", "mobiel_surveillant", "winkelsurveillant",
    "centralist", "brandwacht", "geld_waardetransporteur", "evenementenbeveiliger", "binnendienst", "planner", "hr_manager", "sales_manager",
  ],
  cao_evenementen_horecabeveiliging: ["evenementenbeveiliger", "horecabeveiliger"],
  cao_verkeersregelaars: ["verkeersregelaar"],
  cao_veiligheidsdomein: ["toezichthouder", "handhaver", "boa"],
};

const DELETE_PASSWORD = "verwijder";

const EMPTY_FORM = {
  cao_configuration_id: null,
  cao_key: null,
  applies_to_activities: [],
  custom_function_defs: [], // [{ value, label, category, archived }]
  notes: "",
};

function uniqueStrings(values) {
  return [...new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))];
}

function functionLabel(value) {
  return FUNCTION_LABELS[value] || String(value || "").replace(/[_-]+/g, " ");
}

function defaultFunctionsForCao(caoKey) {
  return CAO_FUNCTION_CATALOG[caoKey] || [];
}

function normalizeFunctionSelection(values, caoKey) {
  return uniqueStrings(values).filter(value => value !== "all");
}

function caoOptionLabel(option) {
  if (!option) return "—";
  return option.label || option.display_name || CAO_KEY_LABELS[option.cao_key] || option.name || option.cao_key || "CAO";
}

function findCaoOption(options, value) {
  if (!value) return null;
  const caoKey = value.cao_key || null;
  const configId = value.cao_configuration_id || null;
  return (options || []).find(option =>
    (caoKey && option.cao_key === caoKey) ||
    (configId && Array.isArray(option.configuration_ids) && option.configuration_ids.includes(configId))
  ) || null;
}

function WizardSteps({ step }) {
  const steps = ["CAO kiezen", "Functies", "Bevestigen"];
  const CheckIcon = () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
            i + 1 === step ? "bg-primary text-primary-foreground" :
            i + 1 < step ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" :
            "text-muted-foreground"}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i + 1 === step ? "bg-primary-foreground text-primary" :
              i + 1 < step ? "text-green-700 dark:text-green-300" :
              "border border-muted-foreground/30 text-muted-foreground"}`}>
              {i + 1 < step ? <CheckIcon /> : i + 1}
            </span>
            {s}
          </div>
          {i < steps.length - 1 && <div className={`h-px flex-1 ${i + 1 < step ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function CaoStatusBadge({ assignment }) {
  const today = new Date().toISOString().split("T")[0];
  const isExpired = assignment.valid_until && assignment.valid_until < today;
  const notStarted = assignment.valid_from && assignment.valid_from > today;
  if (isExpired) return <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Verlopen</Badge>;
  if (notStarted) return <Badge variant="outline" className="text-xs text-muted-foreground">Toekomstig</Badge>;
  return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 border-0">Actief</Badge>;
}

function DeleteConfirmBar({ label, onConfirm, onCancel, isPending }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) { setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`); return; }
    onConfirm();
  };
  return (
    <div className="border-b border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">CAO-koppeling verwijderen?</p>
          <p className="text-xs text-muted-foreground mt-0.5"><strong>{label}</strong> wordt verwijderd.</p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Typ <strong className="text-foreground font-mono">{DELETE_PASSWORD}</strong> om te bevestigen:</label>
        <div className="flex gap-2">
          <Input value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} placeholder={DELETE_PASSWORD} className={`h-8 text-sm font-mono max-w-[200px] ${error ? "border-destructive" : ""}`} onKeyDown={(e) => e.key === "Enter" && handleConfirm()} autoFocus />
          <Button variant="destructive" size="sm" onClick={handleConfirm} disabled={isPending}><Trash2 className="w-3.5 h-3.5 mr-1" />{isPending ? "Verwijderen..." : "Verwijderen"}</Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

export default function CaoTab({ companyId }) {
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [functionAddStep, setFunctionAddStep] = useState(1); // tracks internal step of CaoCustomFunctionsManager
  const [functionLabelDirty, setFunctionLabelDirty] = useState(false); // true when user has typed a name in the custom function input

  useEffect(() => {
    if (showWizard) {
      const timer = setTimeout(() => wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
      return () => clearTimeout(timer);
    }
  }, [step, showWizard]);

  const { data: assignments = [] } = useQuery({
    queryKey: ["cao-assignments", companyId],
    queryFn: () => base44.entities.CompanyCaoAssignment.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const selectedCaoConfigurationIds = uniqueStrings(assignments.map(a => a.cao_configuration_id));
  const { data: caoOptions = [] } = useQuery({
    queryKey: ["company-cao-key-options", selectedCaoConfigurationIds],
    queryFn: async () => {
      const { data } = await base44.functions.invoke("listCaoConfigurationOptions", {
        group_by_cao_key: true,
        include_ids: selectedCaoConfigurationIds,
      });
      return data?.options || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        company_id: companyId,
        cao_key: data.cao_key || null,
        cao_configuration_id: data.cao_configuration_id || null,
        applies_to_activities: normalizeFunctionSelection(data.applies_to_activities, data.cao_key),
        custom_function_defs: Array.isArray(data.custom_function_defs) ? data.custom_function_defs : [],
        valid_from: null,
        valid_until: null,
        notes: data.notes || null
      };
      return editingId ? base44.entities.CompanyCaoAssignment.update(editingId, payload) : base44.entities.CompanyCaoAssignment.create(payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cao-assignments", companyId] }); cancelWizard(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyCaoAssignment.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cao-assignments", companyId] }); setDeleteId(null); },
  });

  const cancelWizard = () => { setShowWizard(false); setStep(1); setForm(EMPTY_FORM); setErrors({}); setEditingId(null); };

  const startEdit = (a) => {
    const option = findCaoOption(caoOptions, a);
    setForm({
      cao_configuration_id: a.cao_key ? null : a.cao_configuration_id || null,
      cao_key: a.cao_key || option?.cao_key || null,
      applies_to_activities: normalizeFunctionSelection(a.applies_to_activities, a.cao_key || option?.cao_key || null),
      custom_function_defs: Array.isArray(a.custom_function_defs) ? a.custom_function_defs : [],
      notes: a.notes || ""
    });
    setEditingId(a.id);
    setStep(2);
    setShowWizard(true);
  };

  const validateStep1 = () => {
    const e = {};
    if (!form.cao_key) e.cao_key = "Verplicht";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));
  const toggleFunction = (value) => setForm((f) => {
    const current = normalizeFunctionSelection(f.applies_to_activities, f.cao_key);
    const next = current.includes(value)
      ? current.filter(item => item !== value)
      : [...current, value];
    return { ...f, applies_to_activities: next };
  });
  const selectedCaoOption = findCaoOption(caoOptions, form);
  const assignmentToDelete = assignments.find(a => a.id === deleteId);
  const deleteLabel = assignmentToDelete ? caoOptionLabel(findCaoOption(caoOptions, assignmentToDelete) || assignmentToDelete) : "";
  const selectedFunctions = normalizeFunctionSelection(form.applies_to_activities, form.cao_key);
  const knownFunctions = defaultFunctionsForCao(form.cao_key);

  // Custom function defs: active + archived
  const customFunctionDefs = Array.isArray(form.custom_function_defs) ? form.custom_function_defs : [];
  const activeCustomValues = customFunctionDefs.filter(f => !f.archived).map(f => f.value);
  const existingCustomCategories = [...new Set(customFunctionDefs.map(f => f.category).filter(Boolean))];

  const currentGroups = CAO_FUNCTION_GROUPS[form.cao_key];
  const predefinedCategories = currentGroups ? [
    ...(currentGroups.operationeel.length > 0 ? ["Operationele functies"] : []),
    ...(currentGroups.binnendienst.length > 0 ? ["Binnendienst functies"] : []),
  ] : [];

  const handleAddCustomFunction = (value, label, category) => {
    if (!value) return;
    setForm((f) => {
      const defs = Array.isArray(f.custom_function_defs) ? f.custom_function_defs : [];
      // Don't add duplicates
      if (defs.some(d => d.value === value)) return f;
      return {
        ...f,
        custom_function_defs: [...defs, { value, label, category, archived: false }],
        applies_to_activities: uniqueStrings([...normalizeFunctionSelection(f.applies_to_activities, f.cao_key), value]),
      };
    });
  };

  const handleArchiveCustomFunction = (value) => {
    setForm((f) => ({
      ...f,
      custom_function_defs: (f.custom_function_defs || []).map(d => d.value === value ? { ...d, archived: true } : d),
      applies_to_activities: normalizeFunctionSelection(f.applies_to_activities, f.cao_key).filter(v => v !== value),
    }));
  };

  const handleRestoreCustomFunction = (value) => {
    setForm((f) => ({
      ...f,
      custom_function_defs: (f.custom_function_defs || []).map(d => d.value === value ? { ...d, archived: false } : d),
    }));
  };

  const handleDeleteCustomFunction = (value) => {
    setForm((f) => ({
      ...f,
      custom_function_defs: (f.custom_function_defs || []).filter(d => d.value !== value),
      applies_to_activities: normalizeFunctionSelection(f.applies_to_activities, f.cao_key).filter(v => v !== value),
    }));
  };

  return (
    <div className="flex flex-col h-full">

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteId && assignmentToDelete && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            <DeleteConfirmBar label={deleteLabel} onConfirm={() => deleteMutation.mutate(deleteId)} onCancel={() => setDeleteId(null)} isPending={deleteMutation.isPending} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wizard */}
      <AnimatePresence>
        {showWizard && (
          <motion.div ref={wizardRef} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="border-b border-primary/30 bg-muted/20 p-5">
            {editingId && <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">CAO-koppeling bewerken</p>}
            <WizardSteps step={step} />
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>

                {step === 1 && (
                   <div className="space-y-3">
                     <p className="text-sm font-medium text-foreground">Kies de CAO</p>
                     <div className="grid grid-cols-1 gap-2">
                       {caoOptions.length === 0 && <p className="text-sm text-muted-foreground">Geen actieve CAO's beschikbaar.</p>}
                       {caoOptions.map((c) => {
                         const alreadyUsed = assignments.some(a => a.cao_key === c.cao_key && a.id !== editingId);
                         return (
                           <button key={c.id} disabled={alreadyUsed} onClick={() => {
                             if (alreadyUsed) return;
                             setForm((f) => ({
                               ...f,
                               cao_configuration_id: null,
                               cao_key: c.cao_key || null,
                               applies_to_activities: [],
                             }));
                             setErrors({});
                             setStep(2);
                           }}
                             className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all ${
                               alreadyUsed
                                 ? "border-border bg-muted/40 opacity-50 cursor-not-allowed"
                                 : `hover:border-primary hover:bg-accent active:scale-[0.99] ${form.cao_key === c.cao_key ? "border-primary bg-accent" : "border-border bg-card"}`
                             }`}>
                             <div>
                               <span className="text-sm font-semibold text-foreground">{caoOptionLabel(c)}</span>
                               {alreadyUsed && <span className="block text-xs text-muted-foreground mt-0.5">Al gekoppeld aan dit bedrijf</span>}
                             </div>
                             <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                           </button>
                         );
                       })}
                     </div>
                     {errors.cao_key && <p className="text-xs text-destructive">{errors.cao_key}</p>}
                     <div className="flex justify-end pt-1">
                       <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                     </div>
                   </div>
                 )}

                {step === 2 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">Functies voor deze CAO — <span className="text-muted-foreground font-normal">{caoOptionLabel(selectedCaoOption)}</span></p>
                    {(() => {
                      const groups = CAO_FUNCTION_GROUPS[form.cao_key];
                      if (groups && (groups.operationeel.length > 0 || groups.binnendienst.length > 0)) {
                        return (
                          <div className="space-y-4">
                            {groups.operationeel.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Operationele functies</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {groups.operationeel.map(value => (
                                    <label key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${selectedFunctions.includes(value) ? "border-primary bg-primary/10 text-foreground font-medium" : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent/50"}`}>
                                      <input type="checkbox" checked={selectedFunctions.includes(value)} onChange={() => toggleFunction(value)} className="rounded border-input" />
                                      {functionLabel(value)}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                            {groups.binnendienst.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Binnendienst functies</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {groups.binnendienst.map(value => (
                                    <label key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${selectedFunctions.includes(value) ? "border-primary bg-primary/10 text-foreground font-medium" : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent/50"}`}>
                                      <input type="checkbox" checked={selectedFunctions.includes(value)} onChange={() => toggleFunction(value)} className="rounded border-input" />
                                      {functionLabel(value)}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {knownFunctions.map(value => (
                            <label key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${selectedFunctions.includes(value) ? "border-primary bg-primary/10 text-foreground font-medium" : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent/50"}`}>
                              <input type="checkbox" checked={selectedFunctions.includes(value)} onChange={() => toggleFunction(value)} className="rounded border-input" />
                              {functionLabel(value)}
                            </label>
                          ))}
                        </div>
                      );
                    })()}
                    <CaoCustomFunctionsManager
                      customFunctions={customFunctionDefs}
                      onAdd={handleAddCustomFunction}
                      onArchive={handleArchiveCustomFunction}
                      onRestore={handleRestoreCustomFunction}
                      onDelete={handleDeleteCustomFunction}
                      existingCategories={existingCustomCategories}
                      predefinedCategories={predefinedCategories}
                      onStepChange={setFunctionAddStep}
                      onLabelChange={(val) => setFunctionLabelDirty(!!val.trim())}
                    />
                    {errors.applies_to_activities && (
                      <p className="text-xs text-destructive">{errors.applies_to_activities}</p>
                    )}
                    <div className="flex justify-between pt-1">
                      {editingId
                        ? <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                        : <Button variant="ghost" size="sm" onClick={() => { setStep(1); setErrors({}); }}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                      }
                      {functionAddStep === 1 && !functionLabelDirty && (
                        <Button size="sm" onClick={() => {
                          if (selectedFunctions.length === 0) {
                            setErrors(e => ({ ...e, applies_to_activities: "Selecteer minimaal 1 functie." }));
                            return;
                          }
                          setErrors(e => { const { applies_to_activities, ...rest } = e; return rest; });
                          setStep(3);
                        }}>Volgende <ChevronRight className="w-4 h-4 ml-1" /></Button>
                      )}
                    </div>
                  </div>
                )}

                {step === 3 && (
                   <div className="space-y-3">
                     <p className="text-sm font-medium text-foreground">Controleer en bevestig</p>
                     <div className="rounded-lg border border-border bg-card p-4 space-y-3 text-sm">
                       <div>
                         <span className="text-muted-foreground block mb-1">CAO</span>
                         <span className="font-medium">{caoOptionLabel(selectedCaoOption)}</span>
                       </div>
                       <div>
                         <span className="text-muted-foreground block mb-2">Functies</span>
                         <ul className="space-y-1 ml-2">
                           {selectedFunctions.map(value => (
                             <li key={value} className="text-sm font-medium text-foreground flex items-center gap-2">
                               <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                               {functionLabel(value)}
                             </li>
                           ))}
                         </ul>
                       </div>
                     </div>
                    <div className="flex justify-between pt-1">
                      <Button variant="ghost" size="sm" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                        <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                          <Check className="w-4 h-4 mr-1" />{saveMutation.isPending ? "Opslaan..." : (editingId ? "Wijzigingen opslaan" : "Koppeling opslaan")}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table header */}
      <div className="flex items-center px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex-1">CAO</span>
        <span className="w-24 shrink-0">Status</span>
        <span className="w-64 shrink-0">Functies</span>
        <div className="w-16 shrink-0 flex justify-end">
          {!showWizard && !deleteId && (
            <Button size="sm" variant="outline" onClick={() => setShowWizard(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
              <Plus className="w-3 h-3 mr-1" /> Nieuwe koppeling
            </Button>
          )}
        </div>
      </div>

      {assignments.length === 0 && !showWizard && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nog geen CAO-koppeling geregistreerd.</p>
      )}
      <div className="divide-y divide-border">
        {assignments.map((a) => {
          const option = findCaoOption(caoOptions, a);
          const functions = normalizeFunctionSelection(a.applies_to_activities, a.cao_key || option?.cao_key || null);
          const isExpanded = expandedId === a.id;
          return (
            <div key={a.id}>
              <div
                className="flex items-center px-4 py-3 group hover:bg-accent/30 transition-colors cursor-pointer overflow-hidden"
                onClick={() => setExpandedId(isExpanded ? null : a.id)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  <span className="text-sm font-medium text-foreground">{caoOptionLabel(option || a)}</span>
                </div>
                <div className="w-24 shrink-0"><CaoStatusBadge assignment={a} /></div>
                <div className="w-64 shrink-0 text-xs text-muted-foreground truncate">
                  {!isExpanded && functions.map(functionLabel).join(", ")}
                </div>
                <div className="w-16 shrink-0 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(a)} title="Bewerken"><Edit className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(a.id)} title="Verwijderen"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-10 pt-1 pb-3 flex flex-wrap gap-2">
                      {functions.map(value => (
                        <span key={value} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-foreground border border-border">
                          {functionLabel(value)}
                        </span>
                      ))}
                      {functions.length === 0 && <span className="text-xs text-muted-foreground">Geen functies geselecteerd</span>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}