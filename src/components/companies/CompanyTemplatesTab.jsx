import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";
import { uploadManagedFile } from "@/lib/managedFiles";
import {
  Archive,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit,
  Eye,
  Plus,
  Save,
  Upload,
  X,
} from "lucide-react";

const TEMPLATE_STATUS = {
  draft: "Concept",
  review: "Review",
  published: "Gepubliceerd",
  archived: "Gearchiveerd",
};

const TEMPLATE_STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  review: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  archived: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const CONTRACT_FORM_SCOPES = [
  { value: "any", label: "Alle contractvormen" },
  { value: "bepaalde_tijd", label: "Bepaalde tijd" },
  { value: "onbepaalde_tijd", label: "Onbepaalde tijd" },
  { value: "oproep", label: "Oproep / min-max" },
  { value: "stage", label: "Stage" },
  { value: "zzp", label: "ZZP / opdracht" },
];

const EMPLOYMENT_MODEL_SCOPES = [
  { value: "any", label: "Alle urenmodellen" },
  { value: "fulltime", label: "Fulltime" },
  { value: "parttime_fixed", label: "Parttime vast" },
  { value: "parttime_growth", label: "Parttime groeimodel" },
  { value: "call_agreement", label: "Oproep / nuluren" },
  { value: "min_max", label: "Min-max" },
  { value: "internship", label: "Stage" },
  { value: "zzp", label: "ZZP / opdracht" },
];

const PROBATION_SCOPES = [
  { value: "any", label: "Met en zonder proeftijd" },
  { value: "with_probation", label: "Alleen met proeftijd" },
  { value: "without_probation", label: "Alleen zonder proeftijd" },
  { value: "not_applicable", label: "Niet van toepassing" },
];

const DURATION_TYPE_SCOPES = [
  { value: "any", label: "Bepaalde en onbepaalde tijd" },
  { value: "fixed", label: "Alleen bepaalde tijd" },
  { value: "indefinite", label: "Alleen onbepaalde tijd" },
];

const CAO_OPTIONS = [
  { value: "cao_particuliere_beveiliging", label: "CAO Particuliere Beveiliging" },
  { value: "cao_evenementen_horecabeveiliging", label: "CAO Evenementen- en Horecabeveiliging" },
  { value: "cao_verkeersregelaars", label: "CAO Verkeersregelaars" },
  { value: "cao_veiligheidsdomein", label: "CAO Veiligheidsdomein" },
  { value: "none", label: "Geen vaste CAO" },
];

const DEFAULT_TEMPLATE_BODY = [
  "Arbeidsovereenkomst",
  "",
  "Ondergetekenden:",
  "{{bedrijf.naam}}, hierna te noemen werkgever;",
  "en {{medewerker.naam}}, hierna te noemen werknemer;",
  "",
  "Artikel 1 - Indiensttreding en functie",
  "Werknemer treedt per {{contract.startdatum}} in dienst als {{contract.functie}}.",
  "",
  "Artikel 2 - CAO en beloning",
  "Op deze overeenkomst is {{contract.cao}} van toepassing. De indeling is schaal {{contract.schaal}}, periodiek {{contract.periodiek}}.",
  "",
  "Artikel 3 - Arbeidsduur",
  "De contractvorm is {{contract.contractvorm}} met {{contract.uren_per_week}} uur per week, tenzij schriftelijk anders overeengekomen.",
].join("\n");

const LETTERHEAD_TABLE_GRID = "grid grid-cols-[minmax(220px,1.5fr)_minmax(110px,130px)_minmax(100px,120px)_minmax(140px,180px)_minmax(160px,max-content)] gap-3 xl:gap-4";
const TEMPLATE_TABLE_GRID = "grid grid-cols-[minmax(240px,1.4fr)_minmax(72px,92px)_minmax(120px,150px)_minmax(220px,1fr)_minmax(140px,180px)_minmax(168px,max-content)] gap-3 xl:gap-4";
const LETTERHEAD_STEPS = ["Gegevens", "Upload", "Controle"];
const TEMPLATE_STEPS = ["Scope", "Inhoud", "Controle"];

function toArrayText(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function fromArrayText(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function extractPlaceholders(body) {
  const matches = String(body || "").match(/\{\{\s*[^}]+\s*\}\}/g) || [];
  return [...new Set(matches.map(item => item.replace(/[{}]/g, "").trim()))];
}

function statusBadge(status) {
  const key = status || "draft";
  return <Badge className={`${TEMPLATE_STATUS_STYLES[key] || TEMPLATE_STATUS_STYLES.draft} text-xs`}>{TEMPLATE_STATUS[key] || key}</Badge>;
}

function WizardSteps({ labels, step }) {
  return (
    <div className="mb-4 flex items-center gap-1">
      {labels.map((label, index) => {
        const position = index + 1;
        const complete = position < step;
        const current = position === step;
        return (
          <React.Fragment key={label}>
            <div className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
              current ? "bg-primary text-primary-foreground" :
              complete ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" :
              "text-muted-foreground"
            }`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                current ? "bg-primary-foreground text-primary" :
                complete ? "text-green-700 dark:text-green-300" :
                "border border-muted-foreground/30 text-muted-foreground"
              }`}>
                {complete ? (
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : position}
              </span>
              {label}
            </div>
            {index < labels.length - 1 && (
              <div className={`h-px flex-1 ${complete ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function initialTemplate(companyId) {
  return {
    company_id: companyId,
    name: "",
    description: "",
    template_type: "employment_contract",
    contract_form_scope: "any",
    employment_model_scope: "any",
    probation_scope: "any",
    duration_type_scope: "any",
    duration_options_text: "",
    visible_in_contract_wizard: true,
    cao_key: "none",
    function_type: "",
    default_letterhead_id: "none",
    version: 1,
    status: "draft",
    body: DEFAULT_TEMPLATE_BODY,
  };
}

function initialLetterhead(companyId) {
  return {
    company_id: companyId,
    name: "",
    description: "",
    is_default: false,
    status: "active",
    file: null,
  };
}

function legacyLetterhead(company) {
  if (!company?.letterhead_file_url) return null;
  return {
    id: "legacy-letterhead",
    company_id: company.id,
    name: "Standaard briefpapier",
    description: "Overgenomen uit het bestaande bedrijfsprofiel.",
    is_default: true,
    status: "active",
    file_url: company.letterhead_file_url,
    file_id: company.letterhead_file_id,
    download_filename: company.letterhead_download_filename,
    logical_path: company.letterhead_logical_path,
    legacy: true,
    metadata: { created_by_display: "Legacy" },
  };
}

export default function CompanyTemplatesTab({ companyId, company, subTab }) {
  const queryClient = useQueryClient();
  const letterheadWizardRef = useRef(null);
  const templateWizardRef = useRef(null);
  const [letterheadForm, setLetterheadForm] = useState(() => initialLetterhead(companyId));
  const [templateForm, setTemplateForm] = useState(() => initialTemplate(companyId));
  const [editingLetterheadId, setEditingLetterheadId] = useState(null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [letterheadWizardOpen, setLetterheadWizardOpen] = useState(false);
  const [templateWizardOpen, setTemplateWizardOpen] = useState(false);
  const [letterheadStep, setLetterheadStep] = useState(1);
  const [templateStep, setTemplateStep] = useState(1);
  const [previewFile, setPreviewFile] = useState(null);
  const [message, setMessage] = useState(null);

  const activeSubTab = subTab || "letterhead";

  const { data: currentUser = null } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: auditActors = [] } = useQuery({
    queryKey: ["personnel-audit-actors", "company-templates"],
    queryFn: () => base44.entities.Personnel.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: letterheads = [] } = useQuery({
    queryKey: ["company-letterheads", companyId],
    queryFn: () => base44.entities.CompanyLetterhead.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["company-contract-templates", companyId],
    queryFn: () => base44.entities.CompanyContractTemplate.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const allLetterheads = useMemo(() => {
    const legacy = letterheads.length === 0 ? legacyLetterhead(company) : null;
    return [legacy, ...letterheads].filter(Boolean);
  }, [company, letterheads]);

  const activeLetterheads = allLetterheads.filter(item => item.status !== "archived");
  const placeholders = extractPlaceholders(templateForm.body);
  const currentEditingLetterhead = editingLetterheadId
    ? letterheads.find(item => item.id === editingLetterheadId)
    : null;
  const letterheadHasExistingFile = Boolean(currentEditingLetterhead?.file_url || currentEditingLetterhead?.file_id);

  useEffect(() => {
    if (!letterheadWizardOpen) return undefined;
    const timer = setTimeout(() => {
      letterheadWizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 160);
    return () => clearTimeout(timer);
  }, [letterheadWizardOpen, letterheadStep]);

  useEffect(() => {
    if (!templateWizardOpen) return undefined;
    const timer = setTimeout(() => {
      templateWizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 160);
    return () => clearTimeout(timer);
  }, [templateWizardOpen, templateStep]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["company-letterheads", companyId] });
    queryClient.invalidateQueries({ queryKey: ["company-contract-templates", companyId] });
    queryClient.invalidateQueries({ queryKey: ["company-letterheads"] });
    queryClient.invalidateQueries({ queryKey: ["company-contract-templates"] });
  };

  const saveLetterheadMutation = useMutation({
    mutationFn: async () => {
      if (!letterheadForm.name.trim()) throw new Error("Vul een naam voor het briefpapier in.");
      if (!editingLetterheadId && !letterheadForm.file) throw new Error("Upload eerst het briefpapier.");

      const previous = editingLetterheadId ? letterheads.find(item => item.id === editingLetterheadId) || {} : {};
      const basePayload = {
        company_id: companyId,
        name: letterheadForm.name.trim(),
        description: letterheadForm.description || null,
        is_default: !!letterheadForm.is_default,
        status: "active",
        metadata: buildAuditMetadata(currentUser, editingLetterheadId ? "gewijzigd" : "toegevoegd", previous.metadata || {}, auditActors),
      };

      let payload = basePayload;
      if (letterheadForm.file) {
        const result = await uploadManagedFile({
          file: letterheadForm.file,
          ownerType: "company",
          ownerId: companyId,
          companyId,
          ownerLabel: company?.display_name || company?.legal_name || "Bedrijf",
          domain: "company_profile",
          category: "letterhead",
          sourceEntity: "CompanyLetterhead",
          sourceField: "file",
          documentLabel: `Briefpapier ${letterheadForm.name.trim()}`,
          isSensitive: false,
          uploadedBy: currentUser,
          auditActors,
          auditAction: editingLetterheadId ? "vernieuwd" : "toegevoegd",
          folderSegments: ["sjablonen", "briefpapier"],
        });
        payload = {
          ...payload,
          file_url: result.file_url,
          file_id: result.managed_file_id,
          download_filename: result.download_filename,
          logical_path: result.logical_path,
        };
      }

      const record = editingLetterheadId
        ? await base44.entities.CompanyLetterhead.update(editingLetterheadId, payload)
        : await base44.entities.CompanyLetterhead.create(payload);

      if (letterheadForm.is_default) {
        await Promise.all(letterheads
          .filter(item => item.id !== record.id && item.is_default)
          .map(item => base44.entities.CompanyLetterhead.update(item.id, { is_default: false })));
      }

      return record;
    },
    onSuccess: () => {
      setLetterheadForm(initialLetterhead(companyId));
      setEditingLetterheadId(null);
      setLetterheadWizardOpen(false);
      setLetterheadStep(1);
      setMessage({ type: "success", text: "Briefpapier opgeslagen." });
      refresh();
    },
    onError: error => setMessage({ type: "error", text: error?.message || "Briefpapier kon niet worden opgeslagen." }),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (statusOverride) => {
      if (!templateForm.name.trim()) throw new Error("Vul een naam voor de template in.");
      if (!templateForm.body.trim()) throw new Error("Vul de template-inhoud in.");
      const previous = editingTemplateId ? templates.find(item => item.id === editingTemplateId) || {} : {};
      const status = statusOverride || templateForm.status || "draft";
      const createNewVersion = editingTemplateId && previous.status === "published";
      const payload = {
        company_id: companyId,
        name: templateForm.name.trim(),
        description: templateForm.description || null,
        template_type: templateForm.template_type || "employment_contract",
        contract_form_scope: templateForm.contract_form_scope === "any" ? null : templateForm.contract_form_scope,
        employment_model_scope: templateForm.employment_model_scope === "any" ? null : templateForm.employment_model_scope,
        probation_scope: templateForm.probation_scope === "any" ? null : templateForm.probation_scope,
        duration_type_scope: templateForm.duration_type_scope === "any" ? null : templateForm.duration_type_scope,
        duration_options: fromArrayText(templateForm.duration_options_text),
        visible_in_contract_wizard: templateForm.visible_in_contract_wizard !== false,
        cao_key: templateForm.cao_key === "none" ? null : templateForm.cao_key,
        function_type: templateForm.function_type || null,
        default_letterhead_id: templateForm.default_letterhead_id === "none" ? null : templateForm.default_letterhead_id,
        version: createNewVersion ? Number(previous.version || 1) + 1 : Number(templateForm.version || 1),
        status,
        body: templateForm.body,
        placeholders,
        metadata: buildAuditMetadata(
          currentUser,
          createNewVersion ? "nieuwe versie" : (editingTemplateId ? "gewijzigd" : "toegevoegd"),
          createNewVersion ? {} : (previous.metadata || {}),
          auditActors
        ),
      };
      return editingTemplateId && !createNewVersion
        ? base44.entities.CompanyContractTemplate.update(editingTemplateId, payload)
        : base44.entities.CompanyContractTemplate.create(payload);
    },
    onSuccess: () => {
      setTemplateForm(initialTemplate(companyId));
      setEditingTemplateId(null);
      setTemplateWizardOpen(false);
      setTemplateStep(1);
      setMessage({ type: "success", text: "Contracttemplate opgeslagen." });
      refresh();
    },
    onError: error => setMessage({ type: "error", text: error?.message || "Template kon niet worden opgeslagen." }),
  });

  const archiveLetterhead = async (record) => {
    if (record.legacy) {
      setMessage({ type: "error", text: "Legacy-briefpapier kan hier niet worden gearchiveerd. Vervang het door nieuw briefpapier." });
      return;
    }
    await base44.entities.CompanyLetterhead.update(record.id, {
      status: "archived",
      is_default: false,
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", record.metadata || {}, auditActors),
    });
    refresh();
  };

  const archiveTemplate = async (record) => {
    await base44.entities.CompanyContractTemplate.update(record.id, {
      status: "archived",
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", record.metadata || {}, auditActors),
    });
    refresh();
  };

  const startNewLetterhead = () => {
    setMessage(null);
    setEditingLetterheadId(null);
    setLetterheadForm(initialLetterhead(companyId));
    setLetterheadStep(1);
    setLetterheadWizardOpen(true);
  };

  const startEditLetterhead = (record) => {
    if (record.legacy) {
      setMessage({ type: "error", text: "Legacy-briefpapier kan niet direct worden bewerkt. Maak een nieuwe standaardvariant aan." });
      return;
    }
    setMessage(null);
    setEditingLetterheadId(record.id);
    setLetterheadForm({
      company_id: companyId,
      name: record.name || "",
      description: record.description || "",
      is_default: !!record.is_default,
      status: record.status || "active",
      file: null,
    });
    setLetterheadStep(1);
    setLetterheadWizardOpen(true);
  };

  const cancelLetterheadWizard = () => {
    setLetterheadForm(initialLetterhead(companyId));
    setEditingLetterheadId(null);
    setLetterheadStep(1);
    setLetterheadWizardOpen(false);
  };

  const nextLetterheadStep = () => {
    if (letterheadStep === 1 && !letterheadForm.name.trim()) {
      setMessage({ type: "error", text: "Vul eerst een naam voor het briefpapier in." });
      return;
    }
    if (letterheadStep === 2 && !letterheadForm.file && !letterheadHasExistingFile) {
      setMessage({ type: "error", text: "Upload eerst het briefpapier." });
      return;
    }
    setMessage(null);
    setLetterheadStep(step => Math.min(step + 1, LETTERHEAD_STEPS.length));
  };

  const startNewTemplate = () => {
    setMessage(null);
    setEditingTemplateId(null);
    setTemplateForm(initialTemplate(companyId));
    setTemplateStep(1);
    setTemplateWizardOpen(true);
  };

  const startEditTemplate = (record) => {
    setMessage(null);
    setEditingTemplateId(record.id);
    setTemplateForm({
      company_id: companyId,
      name: record.name || "",
      description: record.description || "",
      template_type: record.template_type || "employment_contract",
      contract_form_scope: record.contract_form_scope || "any",
      employment_model_scope: record.employment_model_scope || "any",
      probation_scope: record.probation_scope || "any",
      duration_type_scope: record.duration_type_scope || "any",
      duration_options_text: toArrayText(record.duration_options),
      visible_in_contract_wizard: record.visible_in_contract_wizard !== false,
      cao_key: record.cao_key || "none",
      function_type: record.function_type || "",
      default_letterhead_id: record.default_letterhead_id || "none",
      version: record.version || 1,
      status: record.status || "draft",
      body: record.body || DEFAULT_TEMPLATE_BODY,
    });
    setTemplateStep(1);
    setTemplateWizardOpen(true);
  };

  const createNewTemplateVersion = (record) => {
    setMessage(null);
    setEditingTemplateId(null);
    setTemplateForm({
      company_id: companyId,
      name: record.name,
      description: record.description || "",
      template_type: record.template_type || "employment_contract",
      contract_form_scope: record.contract_form_scope || "any",
      employment_model_scope: record.employment_model_scope || "any",
      probation_scope: record.probation_scope || "any",
      duration_type_scope: record.duration_type_scope || "any",
      duration_options_text: toArrayText(record.duration_options),
      visible_in_contract_wizard: record.visible_in_contract_wizard !== false,
      cao_key: record.cao_key || "none",
      function_type: record.function_type || "",
      default_letterhead_id: record.default_letterhead_id || "none",
      version: Number(record.version || 1) + 1,
      status: "draft",
      body: record.body || DEFAULT_TEMPLATE_BODY,
    });
    setTemplateStep(1);
    setTemplateWizardOpen(true);
  };

  const cancelTemplateWizard = () => {
    setTemplateForm(initialTemplate(companyId));
    setEditingTemplateId(null);
    setTemplateStep(1);
    setTemplateWizardOpen(false);
  };

  const nextTemplateStep = () => {
    if (templateStep === 1 && !templateForm.name.trim()) {
      setMessage({ type: "error", text: "Vul eerst een naam voor de template in." });
      return;
    }
    if (templateStep === 2 && !templateForm.body.trim()) {
      setMessage({ type: "error", text: "Vul eerst de template-inhoud in." });
      return;
    }
    setMessage(null);
    setTemplateStep(step => Math.min(step + 1, TEMPLATE_STEPS.length));
  };

  const renderLetterheadWizard = () => (
    <AnimatePresence>
      {letterheadWizardOpen && (
        <motion.div
          ref={letterheadWizardRef}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-b border-primary/30 bg-muted/15"
        >
          <div className="p-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">
              {editingLetterheadId ? "Briefpapier bewerken" : "Briefpapier toevoegen"}
            </p>
            <WizardSteps labels={LETTERHEAD_STEPS} step={letterheadStep} />

            {letterheadStep === 1 && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label>Naam *</Label>
                  <Input
                    value={letterheadForm.name}
                    onChange={event => setLetterheadForm(prev => ({ ...prev, name: event.target.value }))}
                    placeholder="Bijv. Standaard briefpapier"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Omschrijving</Label>
                  <Input
                    value={letterheadForm.description}
                    onChange={event => setLetterheadForm(prev => ({ ...prev, description: event.target.value }))}
                    placeholder="Optioneel"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!letterheadForm.is_default}
                    onChange={event => setLetterheadForm(prev => ({ ...prev, is_default: event.target.checked }))}
                  />
                  Standaard briefpapier
                </label>
              </div>
            )}

            {letterheadStep === 2 && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/40 p-5 text-center hover:bg-background/70">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="mt-2 text-sm font-medium text-foreground">{letterheadForm.file?.name || "Upload PDF of afbeelding"}</span>
                  <span className="mt-1 text-xs text-muted-foreground">PDF, JPG of PNG</span>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={event => setLetterheadForm(prev => ({ ...prev, file: event.target.files?.[0] || null }))}
                  />
                </label>
                <div className="rounded-lg border border-border bg-background/40 p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Document</p>
                  <p className="mt-2">
                    {letterheadForm.file
                      ? letterheadForm.file.name
                      : letterheadHasExistingFile
                        ? currentEditingLetterhead?.download_filename || "Bestaand bestand blijft gekoppeld."
                        : "Nog geen bestand gekozen."}
                  </p>
                  {letterheadHasExistingFile && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setPreviewFile({
                        managedFileId: currentEditingLetterhead.file_id,
                        fileUrl: currentEditingLetterhead.file_url,
                        filename: currentEditingLetterhead.download_filename,
                        title: currentEditingLetterhead.name,
                      })}
                    >
                      <Eye className="mr-1 h-4 w-4" />
                      Huidig bestand bekijken
                    </Button>
                  )}
                </div>
              </div>
            )}

            {letterheadStep === 3 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Naam</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{letterheadForm.name || "-"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Standaard</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{letterheadForm.is_default ? "Ja" : "Nee"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-3 lg:col-span-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Upload</p>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">{letterheadForm.file?.name || currentEditingLetterhead?.download_filename || "-"}</p>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="ghost" onClick={cancelLetterheadWizard}>
                <X className="mr-1 h-4 w-4" />
                Annuleren
              </Button>
              <div className="flex gap-2">
                {letterheadStep > 1 && (
                  <Button type="button" variant="outline" onClick={() => setLetterheadStep(step => step - 1)}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Terug
                  </Button>
                )}
                {letterheadStep < LETTERHEAD_STEPS.length ? (
                  <Button type="button" onClick={nextLetterheadStep}>
                    Volgende
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={() => saveLetterheadMutation.mutate()} disabled={saveLetterheadMutation.isPending}>
                    <Save className="mr-1 h-4 w-4" />
                    {saveLetterheadMutation.isPending ? "Opslaan..." : "Briefpapier opslaan"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderLetterheadTab = () => (
    <div className="flex h-full min-h-[360px] flex-col">
      {renderLetterheadWizard()}
      <div className={`${LETTERHEAD_TABLE_GRID} items-center border-b border-border bg-muted/20 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span>Naam</span>
        <span>Status</span>
        <span>Standaard</span>
        <span>Door</span>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={startNewLetterhead} disabled={letterheadWizardOpen}>
            <Plus className="mr-1 h-4 w-4" />
            Nieuw briefpapier
          </Button>
        </div>
      </div>
      <div className="flex-1">
        {allLetterheads.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center px-5 py-8 text-center text-sm text-muted-foreground">
            Nog geen briefpapier ingesteld.
          </div>
        ) : allLetterheads.map(item => (
          <div
            key={item.id}
            className={`${LETTERHEAD_TABLE_GRID} items-start border-b border-border px-5 py-4 text-sm transition-colors hover:bg-accent/35`}
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{item.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.description || item.download_filename || "-"}</p>
            </div>
            <div>{item.status === "archived" ? statusBadge("archived") : <Badge className="border-0 bg-green-100 text-xs text-green-800 dark:bg-green-900/45 dark:text-green-200">Actief</Badge>}</div>
            <span className="text-sm text-muted-foreground">{item.is_default ? "Ja" : "Nee"}</span>
            <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(item, auditActors)}</span>
            <div className="flex justify-end gap-1">
              {(item.file_id || item.file_url) && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setPreviewFile({
                  managedFileId: item.file_id,
                  fileUrl: item.file_url,
                  filename: item.download_filename,
                  title: item.name,
                })}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              )}
              {!item.legacy && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEditLetterhead(item)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              )}
              {!item.legacy && item.status !== "archived" && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => archiveLetterhead(item)}>
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTemplateWizard = () => (
    <AnimatePresence>
      {templateWizardOpen && (
        <motion.div
          ref={templateWizardRef}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-b border-primary/30 bg-muted/15"
        >
          <div className="p-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">
              {editingTemplateId ? "Contracttemplate bewerken" : "Contracttemplate toevoegen"}
            </p>
            <WizardSteps labels={TEMPLATE_STEPS} step={templateStep} />

            {templateStep === 1 && (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2 xl:col-span-2">
                  <Label>Naam *</Label>
                  <Input
                    value={templateForm.name}
                    onChange={event => setTemplateForm(prev => ({ ...prev, name: event.target.value }))}
                    placeholder="Arbeidsovereenkomst bepaalde tijd"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Versie</Label>
                  <Input
                    type="number"
                    min="1"
                    value={templateForm.version}
                    onChange={event => setTemplateForm(prev => ({ ...prev, version: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contractvorm</Label>
                  <Select value={templateForm.contract_form_scope || "any"} onValueChange={value => setTemplateForm(prev => ({ ...prev, contract_form_scope: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTRACT_FORM_SCOPES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Urenmodel</Label>
                  <Select value={templateForm.employment_model_scope || "any"} onValueChange={value => setTemplateForm(prev => ({ ...prev, employment_model_scope: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_MODEL_SCOPES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Proeftijd</Label>
                  <Select value={templateForm.probation_scope || "any"} onValueChange={value => setTemplateForm(prev => ({ ...prev, probation_scope: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROBATION_SCOPES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duursoort</Label>
                  <Select value={templateForm.duration_type_scope || "any"} onValueChange={value => setTemplateForm(prev => ({ ...prev, duration_type_scope: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURATION_TYPE_SCOPES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>CAO</Label>
                  <Select value={templateForm.cao_key || "none"} onValueChange={value => setTemplateForm(prev => ({ ...prev, cao_key: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CAO_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Standaard briefpapier</Label>
                  <Select value={templateForm.default_letterhead_id || "none"} onValueChange={value => setTemplateForm(prev => ({ ...prev, default_letterhead_id: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Geen vaste keuze</SelectItem>
                      {activeLetterheads.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {templateStep === 2 && (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Omschrijving</Label>
                    <Input
                      value={templateForm.description}
                      onChange={event => setTemplateForm(prev => ({ ...prev, description: event.target.value }))}
                      placeholder="Interne toelichting"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duurkeuzes</Label>
                    <Input
                      value={templateForm.duration_options_text || ""}
                      onChange={event => setTemplateForm(prev => ({ ...prev, duration_options_text: event.target.value }))}
                      placeholder="Optioneel, bijv. 6_months, 1_year, free"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={templateForm.visible_in_contract_wizard !== false}
                      onChange={event => setTemplateForm(prev => ({ ...prev, visible_in_contract_wizard: event.target.checked }))}
                    />
                    Zichtbaar in medewerker-contractwizard
                  </label>
                  <div className="space-y-2">
                    <Label>Template-inhoud *</Label>
                    <Textarea
                      rows={16}
                      value={templateForm.body}
                      onChange={event => setTemplateForm(prev => ({ ...prev, body: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Placeholders</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {placeholders.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Geen placeholders gevonden.</span>
                    ) : placeholders.map(placeholder => (
                      <Badge key={placeholder} variant="outline" className="text-xs">{placeholder}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {templateStep === 3 && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Status</p>
                  <div className="mt-1">{statusBadge(templateForm.status)}</div>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Contractvorm</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{CONTRACT_FORM_SCOPES.find(scope => scope.value === (templateForm.contract_form_scope || "any"))?.label || "-"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Urenmodel</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{EMPLOYMENT_MODEL_SCOPES.find(scope => scope.value === (templateForm.employment_model_scope || "any"))?.label || "-"}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Placeholders</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{placeholders.length}</p>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="ghost" onClick={cancelTemplateWizard}>
                <X className="mr-1 h-4 w-4" />
                Annuleren
              </Button>
              <div className="flex flex-wrap justify-end gap-2">
                {templateStep > 1 && (
                  <Button type="button" variant="outline" onClick={() => setTemplateStep(step => step - 1)}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Terug
                  </Button>
                )}
                {templateStep < TEMPLATE_STEPS.length ? (
                  <Button type="button" onClick={nextTemplateStep}>
                    Volgende
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={() => saveTemplateMutation.mutate("draft")} disabled={saveTemplateMutation.isPending}>
                      <Save className="mr-1 h-4 w-4" />
                      Concept
                    </Button>
                    <Button type="button" variant="outline" onClick={() => saveTemplateMutation.mutate("review")} disabled={saveTemplateMutation.isPending}>
                      Review
                    </Button>
                    <Button type="button" onClick={() => saveTemplateMutation.mutate("published")} disabled={saveTemplateMutation.isPending}>
                      <CheckCircle className="mr-1 h-4 w-4" />
                      Publiceren
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderTemplateTab = () => (
    <div className="flex h-full min-h-[360px] flex-col">
      {renderTemplateWizard()}
      <div className={`${TEMPLATE_TABLE_GRID} items-center border-b border-border bg-muted/20 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span>Template</span>
        <span>Versie</span>
        <span>Status</span>
        <span>Scope</span>
        <span>Door</span>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={startNewTemplate} disabled={templateWizardOpen}>
            <Plus className="mr-1 h-4 w-4" />
            Nieuwe template
          </Button>
        </div>
      </div>
      <div className="flex-1">
        {templates.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center px-5 py-8 text-center text-sm text-muted-foreground">
            Nog geen contracttemplates aangemaakt.
          </div>
        ) : templates.map(item => (
          <div
            key={item.id}
            className={`${TEMPLATE_TABLE_GRID} items-start border-b border-border px-5 py-4 text-sm transition-colors hover:bg-accent/35`}
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{item.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.description || "-"}</p>
            </div>
            <span className="text-sm text-muted-foreground">v{item.version || 1}</span>
            <div>{statusBadge(item.status)}</div>
            <div className="min-w-0 text-sm text-muted-foreground">
              <p className="truncate">{CONTRACT_FORM_SCOPES.find(scope => scope.value === (item.contract_form_scope || "any"))?.label || "Alle contractvormen"}</p>
              <p className="mt-0.5 truncate text-xs">{EMPLOYMENT_MODEL_SCOPES.find(scope => scope.value === (item.employment_model_scope || "any"))?.label || "Alle urenmodellen"}</p>
            </div>
            <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(item, auditActors)}</span>
            <div className="flex justify-end gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEditTemplate(item)}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => createNewTemplateVersion(item)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              {item.status !== "archived" && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => archiveTemplate(item)}>
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      {message && (
        <div className={`border-b p-3 text-sm ${message.type === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
          {message.text}
        </div>
      )}

      {activeSubTab === "contract_templates" ? renderTemplateTab() : renderLetterheadTab()}

      <ManagedFilePreviewDialog
        open={!!previewFile}
        onOpenChange={(open) => !open && setPreviewFile(null)}
        managedFileId={previewFile?.managedFileId}
        fileUrl={previewFile?.fileUrl}
        filename={previewFile?.filename}
        title={previewFile?.title || "Briefpapier bekijken"}
      />
    </div>
  );
}
