import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Check, ChevronRight, ChevronLeft, Edit, Trash2, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CAO_KEY_LABELS = {
  cao_particuliere_beveiliging: "CAO Particuliere Beveiliging",
  cao_evenementen_horecabeveiliging: "CAO Evenementen- en Horecabeveiliging",
  cao_verkeersregelaars: "CAO Verkeersregelaars",
  cao_veiligheidsdomein: "CAO Veiligheidsdomein",
};

const FUNCTION_LABELS = {
  objectbeveiliger: "Objectbeveiliger",
  receptie: "Receptie",
  surveillant: "Surveillant",
  winkelsurveillant: "Winkelsurveillant",
  centralist: "Centralist",
  brandwacht: "Brandwacht",
  geld_waardetransporteur: "Geld- en waardetransporteur",
  klantrelatie: "Klantrelatie",
  planner: "Planner",
  binnendienst: "Binnendienst",
  host: "Host / Hostess",
  evenementenbeveiliger: "Evenementenbeveiliger",
  horecabeveiliger: "Horecabeveiliger",
  verkeersregelaar: "Verkeersregelaar",
  toezichthouder: "Toezichthouder",
  handhaver: "Handhaver",
  boa: "BOA",
};

const CAO_FUNCTION_CATALOG = {
  cao_particuliere_beveiliging: [
    "objectbeveiliger",
    "receptie",
    "surveillant",
    "winkelsurveillant",
    "centralist",
    "brandwacht",
    "geld_waardetransporteur",
    "klantrelatie",
    "planner",
    "binnendienst",
    "host",
  ],
  cao_evenementen_horecabeveiliging: ["evenementenbeveiliger", "horecabeveiliger", "host"],
  cao_verkeersregelaars: ["verkeersregelaar"],
  cao_veiligheidsdomein: ["toezichthouder", "handhaver", "boa"],
};

const DELETE_PASSWORD = "verwijder";

const EMPTY_FORM = {
  cao_configuration_id: null,
  cao_key: null,
  applies_to_activities: [],
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
  const selected = uniqueStrings(values).filter(value => value !== "all");
  return selected.length > 0 ? selected : defaultFunctionsForCao(caoKey);
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
  const [customFunctionInput, setCustomFunctionInput] = useState("");

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

  const cancelWizard = () => { setShowWizard(false); setStep(1); setForm(EMPTY_FORM); setErrors({}); setEditingId(null); setCustomFunctionInput(""); };

  const startEdit = (a) => {
    const option = findCaoOption(caoOptions, a);
    setForm({
      cao_configuration_id: a.cao_key ? null : a.cao_configuration_id || null,
      cao_key: a.cao_key || option?.cao_key || null,
      applies_to_activities: normalizeFunctionSelection(a.applies_to_activities, a.cao_key || option?.cao_key || null),
      notes: a.notes || ""
    });
    setEditingId(a.id);
    setStep(1);
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
  const addCustomFunction = (value) => {
    const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!normalized) return;
    setForm((f) => ({
      ...f,
      applies_to_activities: uniqueStrings([...normalizeFunctionSelection(f.applies_to_activities, f.cao_key), normalized]),
    }));
  };
  const selectedCaoOption = findCaoOption(caoOptions, form);
  const assignmentToDelete = assignments.find(a => a.id === deleteId);
  const deleteLabel = assignmentToDelete ? caoOptionLabel(findCaoOption(caoOptions, assignmentToDelete) || assignmentToDelete) : "";
  const selectedFunctions = normalizeFunctionSelection(form.applies_to_activities, form.cao_key);
  const knownFunctions = defaultFunctionsForCao(form.cao_key);
  const customFunctions = selectedFunctions.filter(value => !knownFunctions.includes(value));

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
                      {caoOptions.map((c) => (
                        <button key={c.id} onClick={() => {
                          setForm((f) => ({
                            ...f,
                            cao_configuration_id: null,
                            cao_key: c.cao_key || null,
                            applies_to_activities: defaultFunctionsForCao(c.cao_key || null),
                          }));
                          setErrors({});
                        }}
                          className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${form.cao_key === c.cao_key ? "border-primary bg-accent" : "border-border bg-card"}`}>
                          <div>
                            <span className="text-sm font-semibold text-foreground">{caoOptionLabel(c)}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                    {errors.cao_key && <p className="text-xs text-destructive">{errors.cao_key}</p>}
                    <div className="flex justify-between pt-1">
                      <Button variant="ghost" size="sm" onClick={cancelWizard}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
                      <Button size="sm" onClick={() => { if (validateStep1()) setStep(2); }}>Volgende <ChevronRight className="w-4 h-4 ml-1" /></Button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">Functies voor deze CAO — <span className="text-muted-foreground font-normal">{caoOptionLabel(selectedCaoOption)}</span></p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {knownFunctions.map(value => (
                        <label key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${selectedFunctions.includes(value) ? "border-primary bg-accent text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/60"}`}>
                          <input type="checkbox" checked={selectedFunctions.includes(value)} onChange={() => toggleFunction(value)} className="rounded border-input" />
                          {functionLabel(value)}
                        </label>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground block">Extra functie toevoegen</label>
                      <div className="flex gap-2">
                        <Input
                          value={customFunctionInput}
                          onChange={(e) => setCustomFunctionInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCustomFunction(customFunctionInput);
                              setCustomFunctionInput("");
                            }
                          }}
                          placeholder="bijv. alarmopvolger"
                          className="h-8 text-sm"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          addCustomFunction(customFunctionInput);
                          setCustomFunctionInput("");
                        }}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Toevoegen
                        </Button>
                      </div>
                      {customFunctions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {customFunctions.map(value => (
                            <Badge key={value} variant="outline" className="gap-1 text-xs">
                              {functionLabel(value)}
                              <button type="button" onClick={() => toggleFunction(value)} className="ml-1 text-muted-foreground hover:text-foreground">
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between pt-1">
                      <Button variant="ghost" size="sm" onClick={() => { setStep(1); setErrors({}); }}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                      <Button size="sm" onClick={() => setStep(3)}>Volgende <ChevronRight className="w-4 h-4 ml-1" /></Button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">Controleer en bevestig</p>
                    <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">CAO</span><span className="font-medium">{caoOptionLabel(selectedCaoOption)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Functies</span><span className="font-medium text-right">{selectedFunctions.map(functionLabel).join(", ") || "—"}</span></div>
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
        {!showWizard && !deleteId && (
          <Button size="sm" variant="outline" onClick={() => setShowWizard(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal">
            <Plus className="w-3 h-3 mr-1" /> Nieuwe koppeling
          </Button>
        )}
      </div>

      {assignments.length === 0 && !showWizard && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nog geen CAO-koppeling geregistreerd.</p>
      )}
      <div className="divide-y divide-border">
        {assignments.map((a) => {
          const option = findCaoOption(caoOptions, a);
          return (
            <div key={a.id} className="flex items-center px-4 py-3 group hover:bg-accent/30 transition-colors">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">{caoOptionLabel(option || a)}</span>
              </div>
              <div className="w-24 shrink-0"><CaoStatusBadge assignment={a} /></div>
              <div className="w-64 shrink-0 text-xs text-muted-foreground truncate">
                {normalizeFunctionSelection(a.applies_to_activities, a.cao_key || option?.cao_key || null).map(functionLabel).join(", ")}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(a)} title="Bewerken"><Edit className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(a.id)} title="Verwijderen"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
