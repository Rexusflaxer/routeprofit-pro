import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, X } from "lucide-react";
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
import { attachManagedFilesToOwner, buildManagedFileDescriptorUpdate, createManagedUploadSession, syncManagedFileDescriptor } from "@/lib/managedFiles";
import { prepareBankAccountSensitiveData, preparePersonnelSensitiveData } from "@/lib/sensitiveFields";

const BASE_STEPS = [
  { value: "profile", label: "Profiel" },
  { value: "naw", label: "NAW" },
  { value: "payroll", label: "Loonheffing/ZZP" },
  { value: "identity", label: "Identiteit" },
  { value: "compliance", label: "Compliance" },
  { value: "bank", label: "Bank & mobiliteit" },
  { value: "documents", label: "ICE/documenten" },
  { value: "review", label: "Controle" },
];

function buildDisplayName(personnel) {
  const first = personnel.call_name || personnel.first_name || personnel.legal_first_names || "";
  const prefix = personnel.name_prefix || "";
  const last = personnel.last_name || "";
  const composed = [first, prefix, last].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return composed || personnel.name || "";
}

function deriveRelationshipType(personnel) {
  return personnel.relationship_type || (personnel.employee_type === "zzp" ? "self_employed" : "employee");
}

function computeHrCompletenessStatus({ personnel, sensitiveData, idDoc, bankAccount, vogDoc }) {
  const required = [
    buildDisplayName(personnel),
    personnel.email,
    personnel.date_of_birth,
    personnel.street_name,
    personnel.postal_code,
    personnel.city
  ];

  if ((personnel.employee_type || "loondienst") === "loondienst") {
    required.push(
      String(sensitiveData.bsn || "").trim(),
      personnel.payroll_tax_statement_file_url || personnel.payroll_tax_statement_file_id || personnel.payroll_tax_statement_signed_at,
      idDoc.front_file_url || idDoc.front_file_id || idDoc.document_number,
      bankAccount.iban
    );
  } else {
    required.push(personnel.self_employed_company_name || buildDisplayName(personnel));
  }

  if (required.some(value => !value)) return "incomplete";

  const reviewStatuses = [
    idDoc.verification_status,
    vogDoc.verification_status,
    bankAccount.verification_status
  ].filter(Boolean);
  if (reviewStatuses.some(status => ["uploaded", "pending_review"].includes(status))) return "needs_review";

  return "complete";
}

function normalizePersonnelPayload(form, context) {
  const relationshipType = deriveRelationshipType(form);
  const name = buildDisplayName(form);
  return {
    ...form,
    name,
    function_type: form.function_type || null,
    employee_type: form.employee_type || (relationshipType === "self_employed" ? "zzp" : "loondienst"),
    relationship_type: relationshipType,
    profile_data_policy: form.profile_data_policy || (relationshipType === "self_employed" ? "profile_wins_after_acceptance" : "local_only"),
    profile_conflict_status: form.profile_conflict_status || "none",
    local_organization_copy_retained: form.local_organization_copy_retained !== false,
    status: form.status || "draft",
    hr_completeness_status: computeHrCompletenessStatus({ personnel: form, ...context })
  };
}

function normalizeAssignmentPayload(assignment, personnel) {
  const rest = { ...(assignment || {}) };
  delete rest.id;
  delete rest.created_date;
  delete rest.updated_date;
  delete rest.created_by;
  delete rest.updated_by;
  return {
    ...rest,
    company_id: rest.company_id || personnel.primary_company_id,
    relation_type: rest.relation_type || (personnel.employee_type === "zzp" ? "contractor" : "employee"),
    assignment_status: rest.assignment_status || "active",
    is_primary: rest.is_primary === true,
    available_for_planning: rest.available_for_planning !== false
  };
}

function normalizeAssignments(assignments, personnel) {
  const normalized = assignments
    .map(assignment => normalizeAssignmentPayload(assignment, personnel))
    .filter(assignment => assignment.company_id);
  if (!normalized.some(assignment => assignment.is_primary) && normalized[0]) normalized[0].is_primary = true;
  return normalized;
}

const ID_DOC_LABELS = {
  passport: "Paspoort",
  id_card: "Identiteitskaart",
  residence_permit: "Verblijfsdocument",
  other: "Identiteitsdocument"
};

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

function personnelOwnerLabel(personnel) {
  return personnel.name || `${personnel.first_name || ""} ${personnel.last_name || ""}`.trim() || "Medewerker";
}

function descriptorUpdate(input) {
  return buildManagedFileDescriptorUpdate(input);
}

function personnelPhotoDescriptorInput({ personnel, personnelId, primaryCompanyId, uploadSessionId }) {
  return {
    filename: personnel.photo_download_filename || "pasfoto.jpg",
    ownerType: "personnel",
    ownerId: personnelId,
    companyId: primaryCompanyId,
    uploadSessionId,
    ownerLabel: personnelOwnerLabel(personnel),
    domain: "identity",
    category: "personnel_photo",
    documentLabel: "Pasfoto",
    folderSegments: ["identity", "photo"]
  };
}

function payrollTaxStatementDescriptorInput({ personnel, personnelId, primaryCompanyId, uploadSessionId }) {
  return {
    filename: personnel.payroll_tax_statement_download_filename || "loonheffingsverklaring.pdf",
    ownerType: "personnel",
    ownerId: personnelId,
    companyId: primaryCompanyId,
    uploadSessionId,
    ownerLabel: personnelOwnerLabel(personnel),
    domain: "payroll",
    category: "payroll_tax_statement",
    documentLabel: "Loonheffingsverklaring",
    effectiveDate: personnel.payroll_tax_statement_signed_at || null,
    folderSegments: ["payroll", "loonheffingsverklaring"]
  };
}

function personnelDocumentFileDescriptorInput({ doc, side = null, personnel, personnelId, primaryCompanyId, uploadSessionId }) {
  const ownerLabel = personnelOwnerLabel(personnel);

  if (doc.category === "identity_document") {
    const sideLabel = side === "front" ? "voorzijde" : "achterzijde";
    const docLabel = ID_DOC_LABELS[doc.document_type] || "Identiteitsdocument";
    return {
      filename: side === "front" ? doc.front_download_filename || "identiteitsdocument-voorzijde.pdf" : doc.back_download_filename || "identiteitsdocument-achterzijde.pdf",
      ownerType: "personnel",
      ownerId: personnelId,
      companyId: primaryCompanyId,
      uploadSessionId,
      ownerLabel,
      domain: "identity",
      category: `identity_document_${side}`,
      documentLabel: `${docLabel} ${sideLabel}`,
      documentNumber: doc.document_number || null,
      validFrom: doc.valid_from || null,
      validUntil: doc.valid_until || null,
      folderSegments: ["identity", doc.document_type || "identity-document", side]
    };
  }

  if (doc.category === "vog") {
    return {
      filename: doc.file_download_filename || "vog.pdf",
      ownerType: "personnel",
      ownerId: personnelId,
      companyId: primaryCompanyId,
      uploadSessionId,
      ownerLabel,
      domain: "compliance",
      category: "vog",
      documentLabel: "VOG",
      documentNumber: doc.document_number || null,
      validFrom: doc.valid_from || null,
      validUntil: doc.valid_until || null,
      folderSegments: ["compliance", "vog"]
    };
  }

  if (doc.category === "cv") {
    return {
      filename: doc.file_download_filename || "cv.pdf",
      ownerType: "personnel",
      ownerId: personnelId,
      companyId: primaryCompanyId,
      uploadSessionId,
      ownerLabel,
      domain: "identity",
      category: "cv",
      documentLabel: "CV",
      folderSegments: ["identity", "cv"]
    };
  }

  return {
    filename: doc.file_download_filename || "document.pdf",
    ownerType: "personnel",
    ownerId: personnelId,
    companyId: primaryCompanyId,
    uploadSessionId,
    ownerLabel,
    domain: "identity",
    category: doc.category || "document",
    documentLabel: doc.name || doc.category || "Document",
    documentNumber: doc.document_number || null,
    validFrom: doc.valid_from || null,
    validUntil: doc.valid_until || null,
    folderSegments: [doc.category || "documents"]
  };
}

function bankProofDescriptorInput({ bankAccount, personnel, personnelId, primaryCompanyId, uploadSessionId }) {
  const iban = String(bankAccount.iban || "").replace(/\s/g, "");
  return {
    filename: bankAccount._proof_download_filename || "bewijs-bankrekening.pdf",
    ownerType: "personnel",
    ownerId: personnelId,
    companyId: primaryCompanyId,
    uploadSessionId,
    ownerLabel: personnelOwnerLabel(personnel),
    domain: "payroll",
    category: "bank_account_proof",
    documentLabel: "Bewijs bankrekening",
    documentNumber: iban ? `IBAN-${iban.slice(-4)}` : null,
    validFrom: bankAccount.valid_from || null,
    folderSegments: ["payroll", "bank"]
  };
}

function applyCurrentDocumentDescriptor(doc, context) {
  const next = { ...doc };
  const targets = [];

  const addTarget = ({ fileId, side = null, sourceField, apply }) => {
    if (!fileId) return;
    const input = personnelDocumentFileDescriptorInput({ doc: next, side, ...context });
    const update = descriptorUpdate(input);
    apply(update);
    targets.push({ fileId, input, sourceField });
  };

  if (next.category === "identity_document") {
    addTarget({
      fileId: next.front_file_id,
      side: "front",
      sourceField: "front_file_url",
      apply: update => {
        next.front_download_filename = update.download_filename;
        next.front_logical_path = update.logical_path;
      }
    });
    addTarget({
      fileId: next.back_file_id,
      side: "back",
      sourceField: "back_file_url",
      apply: update => {
        next.back_download_filename = update.download_filename;
        next.back_logical_path = update.logical_path;
      }
    });
    return { doc: next, targets };
  }

  addTarget({
    fileId: next.file_id,
    sourceField: "file_url",
    apply: update => {
      next.file_download_filename = update.download_filename;
      next.file_logical_path = update.logical_path;
    }
  });

  return { doc: next, targets };
}

export default function PersonnelWizard({ person, initialValues = {}, onClose }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("profile");
  const [uploadSessionId] = useState(() => createManagedUploadSession("personnel"));

  const STEPS = person
    ? [...BASE_STEPS, { value: "contracts", label: "Contracten" }, { value: "access", label: "App-toegang" }]
    : BASE_STEPS;
  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => base44.entities.Company.list() });

  const [form, setForm] = useState(person || {
    name: "", status: "draft", function_type: null, employee_type: "loondienst",
    cao: null, cao_scale: null, cao_period: null, payroll_final_allowed: false, is_active: true,
    country: "Nederland", wpbr_required: false, relationship_type: "employee", profile_data_policy: "local_only",
    ...initialValues,
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

  useEffect(() => {
    let cancelled = false;
    async function loadExistingDossier() {
      if (!person?.id) return;
      const [existingSensitive, existingAssignments] = await Promise.all([
        base44.entities.PersonnelSensitiveData.filter({ personnel_id: person.id }).catch(() => []),
        base44.entities.PersonnelCompanyAssignment.filter({ personnel_id: person.id }).catch(() => []),
      ]);
      if (cancelled) return;
      if (existingSensitive[0]) setSensitiveData(existingSensitive[0]);
      setAssignments(existingAssignments);
    }
    loadExistingDossier();
    return () => { cancelled = true; };
  }, [person?.id]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      let personnelId = person?.id;
      if (personnelId) {
        await base44.entities.Personnel.update(personnelId, data.personnel);
      } else {
        const created = await base44.entities.Personnel.create(data.personnel);
        personnelId = created.id;
      }

      const primaryAssignment = data.assignments.find(a => a.is_primary) || data.assignments[0] || null;
      const primaryCompanyId = data.personnel.primary_company_id || primaryAssignment?.company_id || null;
      const ownerLabel = personnelOwnerLabel(data.personnel);
      const attachedFiles = await attachManagedFilesToOwner({
        uploadSessionId: data.uploadSessionId,
        ownerType: "personnel",
        ownerId: personnelId,
        companyId: primaryCompanyId,
        ownerLabel
      });
      const attachedById = managedFileById(attachedFiles);

      const personnelFilePatch = {};
      const personnelFileSyncs = [];
      if (data.personnel.photo_file_id) {
        const input = personnelPhotoDescriptorInput({ personnel: data.personnel, personnelId, primaryCompanyId, uploadSessionId: data.uploadSessionId });
        const update = descriptorUpdate(input);
        personnelFilePatch.photo_download_filename = update.download_filename;
        personnelFilePatch.photo_logical_path = update.logical_path;
        personnelFileSyncs.push({ fileId: data.personnel.photo_file_id, input, sourceField: "photo_file_url" });
      }
      if (data.personnel.payroll_tax_statement_file_id) {
        const input = payrollTaxStatementDescriptorInput({ personnel: data.personnel, personnelId, primaryCompanyId, uploadSessionId: data.uploadSessionId });
        const update = descriptorUpdate(input);
        personnelFilePatch.payroll_tax_statement_download_filename = update.download_filename;
        personnelFilePatch.payroll_tax_statement_logical_path = update.logical_path;
        personnelFileSyncs.push({ fileId: data.personnel.payroll_tax_statement_file_id, input, sourceField: "payroll_tax_statement_file_url" });
      }

      await Promise.all([
        ...personnelFileSyncs.map(target => syncManagedFileDescriptor(target.fileId, target.input, {
          owner_id: personnelId,
          company_id: primaryCompanyId,
          source_entity: "Personnel",
          source_entity_id: personnelId,
          source_field: target.sourceField
        })),
        Object.keys(personnelFilePatch).length ? base44.entities.Personnel.update(personnelId, personnelFilePatch) : null
      ].filter(Boolean));

      // Save/update sensitive data
      const existing = await base44.entities.PersonnelSensitiveData.filter({ personnel_id: personnelId });
      let sensitiveToSave = await preparePersonnelSensitiveData(data.sensitive, {
        owner_type: "personnel",
        owner_id: personnelId,
        company_id: primaryCompanyId,
        source_entity_id: personnelId
      });

      if (!String(data.sensitive.bsn || "").trim() && existing[0]) {
        sensitiveToSave = {
          ...sensitiveToSave,
          bsn: existing[0].bsn || null,
          bsn_masked: existing[0].bsn_masked || null,
          bsn_encrypted_payload: existing[0].bsn_encrypted_payload || null,
          sensitive_payload_version: existing[0].sensitive_payload_version || sensitiveToSave.sensitive_payload_version
        };
      }

      if (existing.length > 0) {
        await base44.entities.PersonnelSensitiveData.update(existing[0].id, { ...sensitiveToSave, personnel_id: personnelId });
      } else {
        await base44.entities.PersonnelSensitiveData.create({ ...sensitiveToSave, personnel_id: personnelId });
      }

      // Save company assignments as the current local assignment set.
      const existingAssignments = await base44.entities.PersonnelCompanyAssignment.filter({ personnel_id: personnelId }).catch(() => []);
      await Promise.all(existingAssignments.map(assignment => base44.entities.PersonnelCompanyAssignment.delete(assignment.id)));
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
        if (doc.personnel_id) {
          const normalizedDoc = withManagedDocumentPaths(doc, attachedById);
          const descriptorContext = { personnel: data.personnel, personnelId, primaryCompanyId, uploadSessionId: data.uploadSessionId };
          const { doc: documentToSave, targets } = applyCurrentDocumentDescriptor(normalizedDoc, descriptorContext);
          const createdDoc = await base44.entities.PersonnelDocument.create(documentToSave);
          await Promise.all([
            ...targets.map(target => syncManagedFileDescriptor(target.fileId, target.input, {
              owner_id: personnelId,
              company_id: primaryCompanyId,
              source_entity: "PersonnelDocument",
              source_entity_id: createdDoc.id,
              source_field: target.sourceField
            }))
          ].filter(Boolean));
        }
      }

      // Bank account
      if (data.bankAccount.iban) {
        const plainIban = data.bankAccount.iban;
        const preparedBankAccount = await prepareBankAccountSensitiveData(data.bankAccount, {
          owner_type: "personnel",
          owner_id: personnelId,
          company_id: primaryCompanyId,
          source_entity: "PersonnelBankAccount"
        });
        const {
          _proof_file_url,
          _proof_file_id,
          _proof_download_filename,
          _proof_logical_path,
          ...ba
        } = preparedBankAccount;
        let proofDocumentId = null;
        const proofManagedFile = _proof_file_id ? attachedById[_proof_file_id] : null;
        const proofInput = _proof_file_id ? bankProofDescriptorInput({ bankAccount: data.bankAccount, personnel: data.personnel, personnelId, primaryCompanyId, uploadSessionId: data.uploadSessionId }) : null;
        const proofUpdate = proofInput ? descriptorUpdate(proofInput) : null;
        if (_proof_file_url || _proof_file_id) {
          const proofDoc = await base44.entities.PersonnelDocument.create({
            personnel_id: personnelId,
            company_id: primaryCompanyId,
            category: "bank_account_proof",
            file_url: _proof_file_url || null,
            file_id: _proof_file_id || null,
            file_download_filename: proofUpdate?.download_filename || proofManagedFile?.download_filename || _proof_download_filename || null,
            file_logical_path: proofUpdate?.logical_path || proofManagedFile?.logical_path || _proof_logical_path || null,
            verification_status: ba.verification_status || "pending_review",
            is_sensitive: true,
            metadata: {
              iban_last4: String(plainIban || "").replace(/\s/g, "").slice(-4)
            }
          });
          proofDocumentId = proofDoc.id;
          if (_proof_file_id && proofInput) {
            await syncManagedFileDescriptor(_proof_file_id, proofInput, {
              owner_id: personnelId,
              company_id: primaryCompanyId,
              source_entity: "PersonnelDocument",
              source_entity_id: proofDoc.id,
              source_field: "file_url"
            });
          }
        }
        await base44.entities.PersonnelBankAccount.create({
          ...ba,
          personnel_id: personnelId,
          proof_document_id: proofDocumentId,
          proof_file_id: _proof_file_id || null,
          proof_download_filename: proofUpdate?.download_filename || proofManagedFile?.download_filename || _proof_download_filename || null,
          proof_logical_path: proofUpdate?.logical_path || proofManagedFile?.logical_path || _proof_logical_path || null
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
      queryClient.invalidateQueries({ queryKey: ["personnel-assignments"] });
      onClose();
    },
  });

  const handleSave = () => {
    const personnel = normalizePersonnelPayload(form, { sensitiveData, idDoc, bankAccount, vogDoc });
    const normalizedAssignments = normalizeAssignments(assignments, personnel);
    saveMutation.mutate({ personnel, sensitive: sensitiveData, assignments: normalizedAssignments, idDoc, vogDoc, driversLicense, bankAccount, iceContacts, cvDoc, qualifications, uploadSessionId });
  };

  const tabContent = {
    profile: <WizardStep1Company form={form} onChange={onChange} />,
    naw: <WizardStep2NAW form={form} onChange={onChange} uploadSessionId={uploadSessionId} personnelId={person?.id || null} />,
    payroll: <WizardStep3Payroll form={form} onChange={onChange} sensitiveData={sensitiveData} onSensitiveChange={onSensitiveChange} personnelId={person?.id || null} uploadSessionId={uploadSessionId} />,
    identity: <WizardStep4Identity sensitiveData={sensitiveData} onSensitiveChange={onSensitiveChange}
      idDoc={idDoc} onIdDocChange={(f, v) => setIdDoc(d => ({ ...d, [f]: v }))} form={form} personnelId={person?.id || null} uploadSessionId={uploadSessionId}
    />,
    compliance: <WizardStep5Compliance form={form} onChange={onChange} vogDoc={vogDoc}
      onVogDocChange={(f, v) => setVogDoc(d => ({ ...d, [f]: v }))}
      qualifications={qualifications}
      onQualAdd={(q) => setQualifications(a => [...a, q])}
      onQualChange={(i, f, v) => setQualifications(a => a.map((q, idx) => idx === i ? { ...q, [f]: v } : q))}
      onQualRemove={(i) => setQualifications(a => a.filter((_, idx) => idx !== i))}
      personnelId={person?.id || null}
      uploadSessionId={uploadSessionId}
    />,
    bank: <WizardStep6Mobility
      driversLicense={driversLicense}
      onLicenseChange={(f, v) => setDriversLicense(d => ({ ...d, [f]: v }))}
      bankAccount={bankAccount}
      onBankChange={(f, v) => setBankAccount(d => ({ ...d, [f]: v }))}
      form={form}
      personnelId={person?.id || null}
      uploadSessionId={uploadSessionId}
    />,
    documents: <WizardStep7ICE iceContacts={iceContacts}
      onAddContact={(c) => setIceContacts(a => [...a, c])}
      onChangeContact={(i, f, v) => setIceContacts(a => a.map((c, idx) => idx === i ? { ...c, [f]: v } : c))}
      onRemoveContact={(i) => setIceContacts(a => a.filter((_, idx) => idx !== i))}
      cvDoc={cvDoc} onCvChange={(f, v) => setCvDoc(d => ({ ...d, [f]: v }))} form={form} personnelId={person?.id || null} uploadSessionId={uploadSessionId}
    />,
    review: <WizardStep8Review form={form} sensitiveData={sensitiveData} idDoc={idDoc} bankAccount={bankAccount} iceContacts={iceContacts} vogDoc={vogDoc} />,
    ...(person ? {
      contracts: <PersonnelContractsTab personnel={person} companies={companies} />,
      access: <PersonnelAccessTab personnel={person} />
    } : {}),
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{person ? "Personeelsprofiel bewerken" : "Personeelsprofiel aanmaken"}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6 min-h-[400px]">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto pb-1">
            <TabsList className="h-auto min-w-max flex-wrap justify-start">
              {STEPS.map(tab => (
                <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>
          {STEPS.map(tab => (
            <TabsContent key={tab.value} value={tab.value} className="mt-5">
              {tabContent[tab.value]}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
      <div className="flex items-center justify-between px-6 py-4 border-t border-border">
        <Button variant="outline" onClick={onClose}>
          Annuleren
        </Button>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Save className="w-4 h-4 mr-1" />{saveMutation.isPending ? "Opslaan..." : "Opslaan"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
