import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Save, X } from "lucide-react";
import WizardStep1Company from "./wizard/WizardStep1Company";
import WizardStep2NAW from "./wizard/WizardStep2NAW";
import WizardStep3Payroll from "./wizard/WizardStep3Payroll";
import WizardStep4Identity from "./wizard/WizardStep4Identity";
import WizardStep5Compliance from "./wizard/WizardStep5Compliance";
import WizardStep6Mobility from "./wizard/WizardStep6Mobility";
import WizardStep7ICE from "./wizard/WizardStep7ICE";
import WizardStep8Review from "./wizard/WizardStep8Review";
import PersonnelAccessTab from "./PersonnelAccessTab";

const BASE_STEPS = [
  { label: "Bedrijf & rol" },
  { label: "NAW & contact" },
  { label: "Legitimatie & loonheffing" },
  { label: "Identiteitsdocument" },
  { label: "Compliance" },
  { label: "Mobiliteit & bank" },
  { label: "ICE & documenten" },
  { label: "Controle" },
];

export default function PersonnelWizard({ person, onClose }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  const STEPS = person ? [...BASE_STEPS, { label: "App-toegang" }] : BASE_STEPS;
  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => base44.entities.Company.list() });

  const [form, setForm] = useState(person || {
    name: "", status: "draft", function_type: "surveillant", employee_type: "loondienst",
    cao: "cao_particuliere_beveiliging", cao_scale: 3, cao_period: 0, is_active: true,
    country: "Nederland", wpbr_required: false,
  });
  const [sensitiveData, setSensitiveData] = useState({ bsn: "", identity_verified_at_hire: false, payroll_notes: "" });
  const [assignments, setAssignments] = useState([]);
  const [idDoc, setIdDoc] = useState({ category: "identity_document", document_type: "id_card", verification_status: "uploaded" });
  const [vogDoc, setVogDoc] = useState({ category: "vog", verification_status: "uploaded" });
  const [driversLicense, setDriversLicense] = useState({ category: "drivers_license", metadata: { categories: [] }, _enabled: false });
  const [bankAccount, setBankAccount] = useState({ iban: "", is_primary: true, verification_status: "pending_review" });
  const [iceContacts, setIceContacts] = useState([]);
  const [cvDoc, setCvDoc] = useState({ category: "cv" });
  const [qualifications, setQualifications] = useState([]);

  const onChange = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const onSensitiveChange = (field, value) => setSensitiveData(f => ({ ...f, [field]: value }));

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      let personnelId = person?.id;
      if (personnelId) {
        await base44.entities.Personnel.update(personnelId, data.personnel);
      } else {
        const created = await base44.entities.Personnel.create(data.personnel);
        personnelId = created.id;
      }

      // Save/update sensitive data
      const existing = await base44.entities.PersonnelSensitiveData.filter({ personnel_id: personnelId });
      if (existing.length > 0) {
        await base44.entities.PersonnelSensitiveData.update(existing[0].id, { ...data.sensitive, personnel_id: personnelId });
      } else {
        await base44.entities.PersonnelSensitiveData.create({ ...data.sensitive, personnel_id: personnelId });
      }

      // Save company assignments
      for (const a of data.assignments) {
        await base44.entities.PersonnelCompanyAssignment.create({ ...a, personnel_id: personnelId });
      }

      // Save documents
      const docs = [];
      if (data.idDoc.document_type) docs.push({ ...data.idDoc, personnel_id: personnelId });
      if (data.vogDoc.file_url || data.vogDoc.document_number) docs.push({ ...data.vogDoc, personnel_id: personnelId });
      if (data.driversLicense._enabled) {
        const { _enabled, ...lic } = data.driversLicense;
        docs.push({ ...lic, personnel_id: personnelId });
      }
      if (data.cvDoc.file_url) docs.push({ ...data.cvDoc, personnel_id: personnelId });
      for (const doc of docs) {
        if (doc.personnel_id) await base44.entities.PersonnelDocument.create(doc);
      }

      // Bank account
      if (data.bankAccount.iban) {
        const { _proof_file_url, ...ba } = data.bankAccount;
        await base44.entities.PersonnelBankAccount.create({ ...ba, personnel_id: personnelId });
      }

      // ICE contacts
      for (const c of data.iceContacts) {
        if (c.name) await base44.entities.PersonnelEmergencyContact.create({ ...c, personnel_id: personnelId });
      }

      // Qualifications
      for (const q of data.qualifications) {
        if (q.name) await base44.entities.PersonnelQualification.create({ ...q, personnel_id: personnelId });
      }

      return personnelId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel"] });
      onClose();
    },
  });

  const handleSave = () => {
    saveMutation.mutate({ personnel: form, sensitive: sensitiveData, assignments, idDoc, vogDoc, driversLicense, bankAccount, iceContacts, cvDoc, qualifications });
  };

  const stepContent = [
    <WizardStep1Company form={form} onChange={onChange} companies={companies} assignments={assignments}
      onAddAssignment={(companyId) => setAssignments(a => [...a, { company_id: companyId, relation_type: "employee", assignment_status: "active", is_primary: false }])}
      onRemoveAssignment={(i) => setAssignments(a => a.filter((_, idx) => idx !== i))}
    />,
    <WizardStep2NAW form={form} onChange={onChange} />,
    <WizardStep3Payroll form={form} onChange={onChange} sensitiveData={sensitiveData} onSensitiveChange={onSensitiveChange} personnelId={person?.id || null} />,
    <WizardStep4Identity sensitiveData={sensitiveData} onSensitiveChange={onSensitiveChange}
      idDoc={idDoc} onIdDocChange={(f, v) => setIdDoc(d => ({ ...d, [f]: v }))}
    />,
    <WizardStep5Compliance form={form} onChange={onChange} vogDoc={vogDoc}
      onVogDocChange={(f, v) => setVogDoc(d => ({ ...d, [f]: v }))}
      qualifications={qualifications}
      onQualAdd={(q) => setQualifications(a => [...a, q])}
      onQualChange={(i, f, v) => setQualifications(a => a.map((q, idx) => idx === i ? { ...q, [f]: v } : q))}
      onQualRemove={(i) => setQualifications(a => a.filter((_, idx) => idx !== i))}
    />,
    <WizardStep6Mobility
      driversLicense={driversLicense}
      onLicenseChange={(f, v) => setDriversLicense(d => ({ ...d, [f]: v }))}
      bankAccount={bankAccount}
      onBankChange={(f, v) => setBankAccount(d => ({ ...d, [f]: v }))}
    />,
    <WizardStep7ICE iceContacts={iceContacts}
      onAddContact={(c) => setIceContacts(a => [...a, c])}
      onChangeContact={(i, f, v) => setIceContacts(a => a.map((c, idx) => idx === i ? { ...c, [f]: v } : c))}
      onRemoveContact={(i) => setIceContacts(a => a.filter((_, idx) => idx !== i))}
      cvDoc={cvDoc} onCvChange={(f, v) => setCvDoc(d => ({ ...d, [f]: v }))}
    />,
    <WizardStep8Review form={form} sensitiveData={sensitiveData} idDoc={idDoc} bankAccount={bankAccount} iceContacts={iceContacts} vogDoc={vogDoc} />,
    ...(person ? [<PersonnelAccessTab personnel={person} />] : []),
    ];

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{person ? "Medewerker bewerken" : "Nieuwe medewerker"}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        {/* Stepper */}
        <div className="flex items-center gap-1 mt-4 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <React.Fragment key={i}>
              <button type="button" onClick={() => setStep(i)}
                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  i === step ? "bg-primary text-primary-foreground" :
                  i < step ? "bg-muted text-muted-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${i === step ? "bg-primary-foreground text-primary" : i < step ? "bg-emerald-500 text-white" : "bg-muted"}`}>
                  {i < step ? "✓" : i + 1}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <div className="w-3 h-px bg-border shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-6 min-h-[400px]">
        {stepContent[step]}
      </CardContent>
      <div className="flex items-center justify-between px-6 py-4 border-t border-border">
        <Button variant="outline" onClick={() => step > 0 ? setStep(s => s - 1) : onClose()}>
          <ChevronLeft className="w-4 h-4 mr-1" />{step === 0 ? "Annuleren" : "Vorige"}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4 mr-1" /> Opslaan
          </Button>
          {step < STEPS.length - 1 && (
            <Button onClick={() => setStep(s => s + 1)}>
              Volgende <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === STEPS.length - 1 && (
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Save className="w-4 h-4 mr-1" />{saveMutation.isPending ? "Opslaan..." : "Definitief opslaan"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}