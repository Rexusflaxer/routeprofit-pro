import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Check, ChevronRight, ChevronLeft, Edit, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CAO_KEY_LABELS = {
  cao_particuliere_beveiliging: "CAO Particuliere Beveiliging",
  cao_evenementen_horecabeveiliging: "CAO Evenementen- en Horecabeveiliging",
  cao_verkeersregelaars: "CAO Verkeersregelaars",
  cao_veiligheidsdomein: "CAO Veiligheidsdomein",
};

const ACTIVITY_OPTIONS = [
  { value: "all", label: "Alle activiteiten" },
  { value: "surveillant", label: "Surveillant" },
  { value: "objectbeveiliger_receptionist", label: "Objectbeveiliger / Receptionist" },
  { value: "event_hospitality_security", label: "Evenementen- / Horecabeveiliging" },
  { value: "verkeersregelaar", label: "Verkeersregelaar" },
  { value: "cash_value_logistics", label: "Geld- en Waardetransport" },
];

const EMPTY_FORM = {
  cao_configuration_id: "",
  cao_key: null,
  is_primary: false,
  applies_to_activities: ["all"],
  valid_from: "",
  valid_until: "",
  notes: "",
};

// Step indicator
function WizardSteps({ step }) {
  const steps = ["CAO kiezen", "Geldigheid", "Bevestigen"];
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
  if (assignment.is_primary) return <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-0">Primair</Badge>;
  return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 border-0">Actief</Badge>;
}

export default function CaoTab({ companyId }) {
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (showWizard) {
      const timer = setTimeout(() => {
        wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [step, showWizard]);

  const { data: assignments = [] } = useQuery({
    queryKey: ["cao-assignments", companyId],
    queryFn: () => base44.entities.CompanyCaoAssignment.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const { data: caoConfigurations = [] } = useQuery({
    queryKey: ["cao-configurations-active"],
    queryFn: () => base44.entities.CAOConfiguration.filter({ is_active: true }, "name"),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        company_id: companyId,
        valid_from: data.valid_from || null,
        valid_until: data.valid_until || null,
        notes: data.notes || null,
      };
      if (editingId) {
        return base44.entities.CompanyCaoAssignment.update(editingId, payload);
      }
      return base44.entities.CompanyCaoAssignment.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cao-assignments", companyId] });
      cancelWizard();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyCaoAssignment.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cao-assignments", companyId] }),
  });

  const cancelWizard = () => {
    setShowWizard(false);
    setStep(1);
    setForm(EMPTY_FORM);
    setErrors({});
    setEditingId(null);
  };

  const startEdit = (assignment) => {
    setForm({
      cao_configuration_id: assignment.cao_configuration_id || "",
      cao_key: assignment.cao_key || null,
      is_primary: assignment.is_primary || false,
      applies_to_activities: assignment.applies_to_activities || ["all"],
      valid_from: assignment.valid_from || "",
      valid_until: assignment.valid_until || "",
      notes: assignment.notes || "",
    });
    setEditingId(assignment.id);
    setStep(1);
    setShowWizard(true);
  };

  const validateStep1 = () => {
    const e = {};
    if (!form.cao_configuration_id) e.cao_configuration_id = "Verplicht";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const selectedConfig = caoConfigurations.find(c => c.id === form.cao_configuration_id);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">CAO-koppelingen</h3>
        {!showWizard && (
          <Button size="sm" variant="outline" onClick={() => setShowWizard(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nieuwe koppeling
          </Button>
        )}
      </div>

      {/* Wizard */}
      <AnimatePresence>
        {showWizard && (
          <motion.div
            ref={wizardRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-lg border border-primary/30 bg-muted/20 p-5 overflow-hidden"
          >
            <WizardSteps step={step} />

            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {/* Step 1: Kies CAO */}
                  {step === 1 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">Kies de CAO-configuratie</p>
                      <div className="grid grid-cols-1 gap-2">
                        {caoConfigurations.length === 0 && (
                          <p className="text-sm text-muted-foreground">Geen actieve CAO-configuraties beschikbaar.</p>
                        )}
                        {caoConfigurations.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              set("cao_configuration_id", c.id);
                              set("cao_key", c.cao_key || null);
                              setErrors({});
                            }}
                            className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${
                              form.cao_configuration_id === c.id ? "border-primary bg-accent" : "border-border bg-card"}`}
                          >
                            <div>
                              <span className="text-sm font-semibold text-foreground">{c.display_name || c.name}</span>
                              {c.version_label && <span className="text-xs text-muted-foreground ml-2">{c.version_label}</span>}
                              {c.valid_from && c.valid_until && (
                                <span className="text-xs text-muted-foreground ml-2">{c.valid_from} – {c.valid_until}</span>
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                          </button>
                        ))}
                      </div>
                      {errors.cao_configuration_id && <p className="text-xs text-destructive">{errors.cao_configuration_id}</p>}
                      <div className="flex items-center gap-3 pt-1">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.is_primary}
                            onChange={(e) => set("is_primary", e.target.checked)}
                            className="rounded border-input"
                          />
                          Primaire CAO voor dit bedrijf
                        </label>
                      </div>
                      <div className="flex justify-between pt-1">
                        <Button variant="ghost" size="sm" onClick={cancelWizard}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
                        <Button size="sm" onClick={() => { if (validateStep1()) setStep(2); }}>
                          Volgende <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Geldigheid & activiteiten */}
                  {step === 2 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">
                        Geldigheid — <span className="text-muted-foreground font-normal">{selectedConfig?.display_name || selectedConfig?.name}</span>
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Geldig vanaf</label>
                          <Input type="date" value={form.valid_from} onChange={(e) => set("valid_from", e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Geldig tot</label>
                          <Input type="date" value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} className="h-8 text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Van toepassing op</label>
                        <Select
                          value={(form.applies_to_activities || ["all"])[0] || "all"}
                          onValueChange={(v) => set("applies_to_activities", [v])}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ACTIVITY_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-between pt-1">
                        <Button variant="ghost" size="sm" onClick={() => { setStep(1); setErrors({}); }}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                        <Button size="sm" onClick={() => setStep(3)}>Volgende <ChevronRight className="w-4 h-4 ml-1" /></Button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Bevestigen */}
                  {step === 3 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">Controleer en bevestig</p>
                      <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">CAO</span>
                          <span className="font-medium">{selectedConfig?.display_name || selectedConfig?.name || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Primair</span>
                          <span>{form.is_primary ? "Ja" : "Nee"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Geldig vanaf</span>
                          <span>{form.valid_from || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Geldig tot</span>
                          <span>{form.valid_until || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Activiteiten</span>
                          <span>{ACTIVITY_OPTIONS.find(o => o.value === (form.applies_to_activities || ["all"])[0])?.label || "Alle"}</span>
                        </div>
                      </div>
                      <div className="flex justify-between pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                          <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                            <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : (editingId ? "Wijzigingen opslaan" : "Koppeling opslaan")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      {assignments.length === 0 && !showWizard ? (
        <p className="text-sm text-muted-foreground">Nog geen CAO-koppeling geregistreerd.</p>
      ) : assignments.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_5rem_1fr_4rem] px-4 py-2 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>CAO</span>
            <span>Status</span>
            <span>Geldigheid</span>
            <span></span>
          </div>
          <div className="divide-y divide-border">
            {assignments.map((a) => {
              const config = caoConfigurations.find(c => c.id === a.cao_configuration_id);
              return (
                <div key={a.id} className="grid grid-cols-[1fr_5rem_1fr_4rem] items-center px-4 py-3">
                  <div>
                    <span className="text-sm font-medium text-foreground">{config?.display_name || config?.name || a.cao_key || "—"}</span>
                    {config?.version_label && <span className="text-xs text-muted-foreground ml-2">{config.version_label}</span>}
                  </div>
                  <div><CaoStatusBadge assignment={a} /></div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {a.valid_from && <span>Vanaf: <strong className="text-foreground">{a.valid_from}</strong></span>}
                    {a.valid_until && <span>Tot: <strong className="text-foreground">{a.valid_until}</strong></span>}
                    {!a.valid_from && !a.valid_until && <span>Geen einddatum</span>}
                  </div>
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(a)} title="Bewerken">
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(a.id)} title="Verwijderen">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}