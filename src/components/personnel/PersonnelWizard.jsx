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
import PersonnelContractsTab from "./PersonnelContractsTab";
import { attachManagedFilesToOwner, createManagedUploadSession, updateManagedFileSource } from "@/lib/managedFiles";

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

const NON_PROOF_SECURITY_ROLE_STATUSES = new Set(["unknown", "not_applicable"]);

function hasMeaningfulSecurityRoleStatus(value) {
  return !!value && !NON_PROOF_SECURITY_ROLE_STATUSES.has(value);
}

function getInitialContractMissingFields({
  companyId,
  caoKey,
  contractForm,
  underlyingContractForm,
  contractStartDate,
  functionType,
  caoFunctionGroup,
  caoFunctionLevel,
  securityRoleStatus
}) {
  const missing = [];
  if (!companyId) missing.push("company_id");
  if (!caoKey) missing.push("cao_key");
  if (!contractForm || contractForm === "unknown") missing.push("contract_form");
  if (contractForm === "oproep" && (!underlyingContractForm || underlyingContractForm === "unknown")) {
    missing.push("underlying_contract_form");
  }
  if (!contractStartDate) missing.push("contract_start_date");
  if (!functionType && !caoFunctionGroup && !caoFunctionLevel && !hasMeaningfulSecurityRoleStatus(securityRoleStatus)) {
    missing.push("function_type/cao_function_group/cao_function_level/security_role_status");
  }
  return missing;
}

function managedFileById(files = []) {
  return Object.fromEntries(files.filter(file => file?.id).map(file => [file.id, file]));
}

function withManagedDocumentPaths(doc, fileMap) {
  const next = { ...doc };
  if (next.file_id && fileMap[next.file_id]) {
    next.file_download_filename = fileMap[next.file_id].download_filename;
    next.file_logical_path = fileMap[next.file_id].logical_path;
  }
  if (next.front_file_id && fileMap[next.front_file_id]) {
    next.front_download_filename = fileMap[next.front_file_id].download_filename;
    next.front_logical_path = fileMap[next.front_file_id].logical_path;
  }
  if (next.back_file_id && fileMap[next.back_file_id]) {
    next.back_download_filename = fileMap[next.back_file_id].download_filename;
    next.back_logical_path = fileMap[next.back_file_id].logical_path;
  }
  return next;
}

export default function PersonnelWizard({ person, onClose }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [uploadSessionId] = useState(() => createManagedUploadSession("personnel"));

  const STEPS = person ? [...BASE_STEPS, { label: "Contracten" }, { label: "App-toegang" }] : BASE_STEPS;
  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => base44.entities.Company.list() });

  const [form, setForm] = useState(person || {
    name: "", status: "draft", function_type: null, employee_type: "loondienst",
    cao: null, cao_scale: null, cao_period: null, payroll_final_allowed: false, is_active: true,
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
      const isNewPersonnel = !personnelId;
      if (personnelId) {
        await base44.entities.Personnel.update(personnelId, data.personnel);
      } else {
        const created = await base44.entities.Personnel.create(data.personnel);
        personnelId = created.id;
      }

      const primaryAssignment = data.assignments.find(a => a.is_primary) || data.assignments[0] || null;
      const primaryCompanyId = data.personnel.primary_company_id || primaryAssignment?.company_id || null;
      const attachedFiles = await attachManagedFilesToOwner({
        uploadSessionId: data.uploadSessionId,
        ownerType: "personnel",
        ownerId: personnelId,
        companyId: primaryCompanyId,
        ownerLabel: data.personnel.name || `${data.personnel.first_name || ""} ${data.personnel.last_name || ""}`.trim() || "Medewerker"
      });
      const attachedById = managedFileById(attachedFiles);

      const personnelFilePatch = {};
      if (data.personnel.photo_file_id && attachedById[data.personnel.photo_file_id]) {
        personnelFilePatch.photo_download_filename = attachedById[data.personnel.photo_file_id].download_filename;
        personnelFilePatch.photo_logical_path = attachedById[data.personnel.photo_file_id].logical_path;
      }
      if (data.personnel.payroll_tax_statement_file_id && attachedById[data.personnel.payroll_tax_statement_file_id]) {
        personnelFilePatch.payroll_tax_statement_download_filename = attachedById[data.personnel.payroll_tax_statement_file_id].download_filename;
        personnelFilePatch.payroll_tax_statement_logical_path = attachedById[data.personnel.payroll_tax_statement_file_id].logical_path;
      }

      await Promise.all([
        data.personnel.photo_file_id ? updateManagedFileSource(data.personnel.photo_file_id, { owner_id: personnelId, company_id: primaryCompanyId, source_entity_id: personnelId }) : null,
        data.personnel.payroll_tax_statement_file_id ? updateManagedFileSource(data.personnel.payroll_tax_statement_file_id, { owner_id: personnelId, company_id: primaryCompanyId, source_entity_id: personnelId }) : null,
        Object.keys(personnelFilePatch).length ? base44.entities.Personnel.update(personnelId, personnelFilePatch) : null
      ].filter(Boolean));

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

      // Initial legal contract snapshot for future planning/payroll resolution.
      // Avoid duplicates on edit; dedicated contract management can update this later.
      if (isNewPersonnel && data.personnel.employee_type === "loondienst") {
        const existingContracts = await base44.entities.PersonnelContract.filter({ personnel_id: personnelId });
        if (existingContracts.length === 0) {
          const companyId = primaryCompanyId;
          const functionType = data.personnel.function_type || null;
          const caoFunctionGroup = data.personnel.cao_function_group || null;
          const caoFunctionLevel = data.personnel.cao_function_level || null;
          const securityRoleStatus = data.personnel.security_role_status || "unknown";
          const caoScopeProfile = data.personnel.cao_scope_profile || null;
          const caoKey = data.personnel.cao || null;
          const contractForm = data.personnel.contract_form || "unknown";
          const underlyingContractForm = data.personnel.underlying_contract_form || null;
          const contractStartDate = data.personnel.contract_start_date || null;
          const missingContractContextFields = getInitialContractMissingFields({
            companyId,
            caoKey,
            contractForm,
            underlyingContractForm,
            contractStartDate,
            functionType,
            caoFunctionGroup,
            caoFunctionLevel,
            securityRoleStatus
          });
          const contractContextReady = missingContractContextFields.length === 0;
          await base44.entities.PersonnelContract.create({
            personnel_id: personnelId,
            company_id: companyId,
            cao_key: caoKey,
            cao_configuration_id: null,
            contract_form: contractForm,
            underlying_contract_form: contractForm === "oproep" ? underlyingContractForm : null,
            contract_start_date: contractStartDate,
            contract_end_date: data.personnel.contract_end_date || null,
            probation_period_months: data.personnel.probation_period_months ?? null,
            probation_period_source_rule_id: data.personnel.probation_period_source_rule_id || null,
            probation_override_reason: data.personnel.probation_override_reason || null,
            security_role_status: securityRoleStatus,
            allowed_security_role_statuses: securityRoleStatus && securityRoleStatus !== "unknown" ? [securityRoleStatus] : [],
            performs_security_work: data.personnel.performs_security_work ?? null,
            security_work_percentage: data.personnel.security_work_percentage ?? null,
            works_airport_schiphol: data.personnel.works_airport_schiphol ?? null,
            works_cash_value_logistics: data.personnel.works_cash_value_logistics ?? null,
            works_event_or_hospitality_security: data.personnel.works_event_or_hospitality_security ?? null,
            event_hospitality_cao_applies: data.personnel.event_hospitality_cao_applies ?? null,
            function_type: functionType,
            allowed_function_types: functionType ? [functionType] : [],
            cao_function_group: caoFunctionGroup,
            allowed_cao_function_groups: caoFunctionGroup ? [caoFunctionGroup] : [],
            cao_function_level: caoFunctionLevel,
            allowed_cao_function_levels: caoFunctionLevel ? [caoFunctionLevel] : [],
            allowed_task_types: [],
            cao_scope_profile: caoScopeProfile,
            cao_applicability_manual_review_required: data.personnel.cao_applicability_manual_review_required ?? null,
            cao_applicable_rule_profile: data.personnel.cao_applicable_rule_profile || null,
            cao_applicability_source_rule_ids: data.personnel.cao_applicability_source_rule_ids || [],
            cao_applicability_warnings: data.personnel.cao_applicability_warnings || [],
            cao_excluded_rule_ids: data.personnel.cao_excluded_rule_ids || [],
            cao_excluded_articles: data.personnel.cao_excluded_articles || [],
            cao_excluded_chapters: data.personnel.cao_excluded_chapters || [],
            contract_hours_per_week: data.personnel.parttime_hours || null,
            contract_hours_per_pay_period: null,
            min_hours_per_week: data.personnel.min_hours || null,
            max_hours_per_week: data.personnel.max_hours || null,
            industry_seniority_pay_periods: data.personnel.industry_seniority_pay_periods ?? null,
            industry_start_date: data.personnel.industry_start_date || null,
            contract_context_status: contractContextReady ? "context_ready" : "draft_missing_context",
            contract_context_missing_fields: missingContractContextFields,
            contract_context_checked_at: new Date().toISOString(),
            cao_contract_rule_status: contractContextReady ? "unknown" : "blocked",
            planning_allowed: false,
            contract_final_allowed: false,
            payroll_final_allowed: false,
            is_current: contractContextReady,
            notes: contractContextReady
              ? "Automatisch aangemaakt vanuit personeelswizard als initiële contractfundering."
              : `Automatisch aangemaakt vanuit personeelswizard als conceptfundering. Ontbrekende contractcontext: ${missingContractContextFields.join(", ")}.`
          });
        }
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
        if (doc.personnel_id) {
          const normalizedDoc = withManagedDocumentPaths(doc, attachedById);
          const createdDoc = await base44.entities.PersonnelDocument.create(normalizedDoc);
          await Promise.all([
            normalizedDoc.file_id ? updateManagedFileSource(normalizedDoc.file_id, { owner_id: personnelId, company_id: primaryCompanyId, source_entity_id: createdDoc.id }) : null,
            normalizedDoc.front_file_id ? updateManagedFileSource(normalizedDoc.front_file_id, { owner_id: personnelId, company_id: primaryCompanyId, source_entity_id: createdDoc.id }) : null,
            normalizedDoc.back_file_id ? updateManagedFileSource(normalizedDoc.back_file_id, { owner_id: personnelId, company_id: primaryCompanyId, source_entity_id: createdDoc.id }) : null
          ].filter(Boolean));
        }
      }

      // Bank account
      if (data.bankAccount.iban) {
        const {
          _proof_file_url,
          _proof_file_id,
          _proof_download_filename,
          _proof_logical_path,
          ...ba
        } = data.bankAccount;
        let proofDocumentId = null;
        const proofManagedFile = _proof_file_id ? attachedById[_proof_file_id] : null;
        if (_proof_file_url || _proof_file_id) {
          const proofDoc = await base44.entities.PersonnelDocument.create({
            personnel_id: personnelId,
            company_id: primaryCompanyId,
            category: "bank_account_proof",
            file_url: _proof_file_url || null,
            file_id: _proof_file_id || null,
            file_download_filename: proofManagedFile?.download_filename || _proof_download_filename || null,
            file_logical_path: proofManagedFile?.logical_path || _proof_logical_path || null,
            verification_status: ba.verification_status || "pending_review",
            is_sensitive: true,
            metadata: {
              iban_last4: String(data.bankAccount.iban || "").replace(/\s/g, "").slice(-4)
            }
          });
          proofDocumentId = proofDoc.id;
          if (_proof_file_id) {
            await updateManagedFileSource(_proof_file_id, {
              owner_id: personnelId,
              company_id: primaryCompanyId,
              source_entity: "PersonnelDocument",
              source_entity_id: proofDoc.id
            });
          }
        }
        await base44.entities.PersonnelBankAccount.create({
          ...ba,
          personnel_id: personnelId,
          proof_document_id: proofDocumentId,
          proof_file_id: _proof_file_id || null,
          proof_download_filename: proofManagedFile?.download_filename || _proof_download_filename || null,
          proof_logical_path: proofManagedFile?.logical_path || _proof_logical_path || null
        });
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
    saveMutation.mutate({ personnel: form, sensitive: sensitiveData, assignments, idDoc, vogDoc, driversLicense, bankAccount, iceContacts, cvDoc, qualifications, uploadSessionId });
  };

  const stepContent = [
    <WizardStep1Company form={form} onChange={onChange} companies={companies} assignments={assignments}
      onAddAssignment={(companyId) => setAssignments(a => [...a, { company_id: companyId, relation_type: "employee", assignment_status: "active", is_primary: false }])}
      onRemoveAssignment={(i) => setAssignments(a => a.filter((_, idx) => idx !== i))}
    />,
    <WizardStep2NAW form={form} onChange={onChange} uploadSessionId={uploadSessionId} personnelId={person?.id || null} />,
    <WizardStep3Payroll form={form} onChange={onChange} sensitiveData={sensitiveData} onSensitiveChange={onSensitiveChange} personnelId={person?.id || null} uploadSessionId={uploadSessionId} />,
    <WizardStep4Identity sensitiveData={sensitiveData} onSensitiveChange={onSensitiveChange}
      idDoc={idDoc} onIdDocChange={(f, v) => setIdDoc(d => ({ ...d, [f]: v }))} form={form} personnelId={person?.id || null} uploadSessionId={uploadSessionId}
    />,
    <WizardStep5Compliance form={form} onChange={onChange} vogDoc={vogDoc}
      onVogDocChange={(f, v) => setVogDoc(d => ({ ...d, [f]: v }))}
      qualifications={qualifications}
      onQualAdd={(q) => setQualifications(a => [...a, q])}
      onQualChange={(i, f, v) => setQualifications(a => a.map((q, idx) => idx === i ? { ...q, [f]: v } : q))}
      onQualRemove={(i) => setQualifications(a => a.filter((_, idx) => idx !== i))}
      personnelId={person?.id || null}
      uploadSessionId={uploadSessionId}
    />,
    <WizardStep6Mobility
      driversLicense={driversLicense}
      onLicenseChange={(f, v) => setDriversLicense(d => ({ ...d, [f]: v }))}
      bankAccount={bankAccount}
      onBankChange={(f, v) => setBankAccount(d => ({ ...d, [f]: v }))}
      form={form}
      personnelId={person?.id || null}
      uploadSessionId={uploadSessionId}
    />,
    <WizardStep7ICE iceContacts={iceContacts}
      onAddContact={(c) => setIceContacts(a => [...a, c])}
      onChangeContact={(i, f, v) => setIceContacts(a => a.map((c, idx) => idx === i ? { ...c, [f]: v } : c))}
      onRemoveContact={(i) => setIceContacts(a => a.filter((_, idx) => idx !== i))}
      cvDoc={cvDoc} onCvChange={(f, v) => setCvDoc(d => ({ ...d, [f]: v }))} form={form} personnelId={person?.id || null} uploadSessionId={uploadSessionId}
    />,
    <WizardStep8Review form={form} sensitiveData={sensitiveData} idDoc={idDoc} bankAccount={bankAccount} iceContacts={iceContacts} vogDoc={vogDoc} />,
    ...(person ? [
      <PersonnelContractsTab personnel={person} companies={companies} />,
      <PersonnelAccessTab personnel={person} />
    ] : []),
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
