import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Copy,
  Eye,
  FileText,
  Layers,
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

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

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
  const [letterheadForm, setLetterheadForm] = useState(() => initialLetterhead(companyId));
  const [templateForm, setTemplateForm] = useState(() => initialTemplate(companyId));
  const [editingLetterheadId, setEditingLetterheadId] = useState(null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [message, setMessage] = useState(null);

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

  const createNewTemplateVersion = (record) => {
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
  };

  return (
    <div className="p-5 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Sjablonen</p>
        <h3 className="mt-1 text-lg font-semibold text-foreground">Briefpapier en contracttemplates</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Gepubliceerde templates worden gebruikt bij het aanmaken van arbeidscontracten. Oude contracten blijven altijd een eigen PDF-snapshot houden.
        </p>
      </div>

      {message && (
        <div className={`rounded-lg border p-3 text-sm ${message.type === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
          {message.text}
        </div>
      )}

      {subTab === "letterhead" && (
      <section className="rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="font-semibold text-foreground">Briefpapier</p>
            <p className="text-xs text-muted-foreground">Meerdere varianten per bedrijf, waarvan een standaardvariant.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => {
            setEditingLetterheadId(null);
            setLetterheadForm(initialLetterhead(companyId));
          }}>
            <Plus className="mr-1 h-4 w-4" /> Nieuw briefpapier
          </Button>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_420px]">
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(180px,1fr)_120px_140px_120px_96px] bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <div>Naam</div>
              <div>Status</div>
              <div>Standaard</div>
              <div>Door</div>
              <div />
            </div>
            {allLetterheads.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nog geen briefpapier ingesteld.</div>}
            {allLetterheads.map(item => (
              <div key={item.id} className="grid grid-cols-[minmax(180px,1fr)_120px_140px_120px_96px] items-center border-t border-border px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{item.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.description || item.download_filename || "-"}</p>
                </div>
                <div>{item.status === "archived" ? statusBadge("archived") : <Badge className="bg-emerald-100 text-emerald-700 text-xs">Actief</Badge>}</div>
                <div className="text-muted-foreground">{item.is_default ? "Ja" : "Nee"}</div>
                <div className="truncate text-muted-foreground">{getAuditActorLabel(item, auditActors)}</div>
                <div className="flex justify-end gap-1">
                  {(item.file_id || item.file_url) && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setPreviewFile({
                      managedFileId: item.file_id,
                      fileUrl: item.file_url,
                      filename: item.download_filename,
                      title: item.name,
                    })}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  {!item.legacy && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => archiveLetterhead(item)}>
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{editingLetterheadId ? "Briefpapier bewerken" : "Briefpapier toevoegen"}</p>
              {editingLetterheadId && (
                <Button type="button" variant="ghost" size="icon" onClick={() => {
                  setEditingLetterheadId(null);
                  setLetterheadForm(initialLetterhead(companyId));
                }}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="space-y-1">
              <Label>Naam</Label>
              <Input value={letterheadForm.name} onChange={event => setLetterheadForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Bijv. Standaard LOQ briefpapier" />
            </div>
            <div className="space-y-1">
              <Label>Omschrijving</Label>
              <Input value={letterheadForm.description} onChange={event => setLetterheadForm(prev => ({ ...prev, description: event.target.value }))} placeholder="Optioneel" />
            </div>
            <label className="flex min-h-[110px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center hover:bg-muted/40">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="mt-2 text-sm font-medium">{letterheadForm.file?.name || "Upload PDF of afbeelding"}</span>
              <input
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={event => setLetterheadForm(prev => ({ ...prev, file: event.target.files?.[0] || null }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!letterheadForm.is_default}
                onChange={event => setLetterheadForm(prev => ({ ...prev, is_default: event.target.checked }))}
              />
              Standaard briefpapier
            </label>
            <Button type="button" onClick={() => saveLetterheadMutation.mutate()} disabled={saveLetterheadMutation.isPending}>
              <Save className="mr-1 h-4 w-4" /> {saveLetterheadMutation.isPending ? "Opslaan..." : "Briefpapier opslaan"}
            </Button>
          </div>
        </div>
      </section>
      )}

      {subTab === "contract_templates" && (
      <section className="rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="font-semibold text-foreground">Contracttemplates</p>
            <p className="text-xs text-muted-foreground">Concept, review en gepubliceerde versies. Een gepubliceerde template aanpassen maakt automatisch een nieuwe versie.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => {
            setEditingTemplateId(null);
            setTemplateForm(initialTemplate(companyId));
          }}>
            <Plus className="mr-1 h-4 w-4" /> Nieuwe template
          </Button>
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-[1fr_520px]">
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(220px,1.3fr)_90px_120px_180px_120px_120px] bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <div>Template</div>
              <div>Versie</div>
              <div>Status</div>
              <div>Scope</div>
              <div>Door</div>
              <div />
            </div>
            {templates.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nog geen contracttemplates aangemaakt.</div>}
            {templates.map(item => (
              <div key={item.id} className="grid grid-cols-[minmax(220px,1.3fr)_90px_120px_180px_120px_120px] items-center border-t border-border px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{item.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.description || "-"}</p>
                </div>
                <div className="text-muted-foreground">v{item.version || 1}</div>
                <div>{statusBadge(item.status)}</div>
                <div className="min-w-0 text-muted-foreground">
                  <p className="truncate">{CONTRACT_FORM_SCOPES.find(scope => scope.value === (item.contract_form_scope || "any"))?.label || "Alle contractvormen"}</p>
                  <p className="truncate text-xs">{EMPLOYMENT_MODEL_SCOPES.find(scope => scope.value === (item.employment_model_scope || "any"))?.label || "Alle urenmodellen"}</p>
                </div>
                <div className="truncate text-muted-foreground">{getAuditActorLabel(item, auditActors)}</div>
                <div className="flex justify-end gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => {
                    setEditingTemplateId(item.id);
                    setTemplateForm({
                      company_id: companyId,
                      name: item.name || "",
                      description: item.description || "",
                      template_type: item.template_type || "employment_contract",
                      contract_form_scope: item.contract_form_scope || "any",
                      employment_model_scope: item.employment_model_scope || "any",
                      probation_scope: item.probation_scope || "any",
                      duration_type_scope: item.duration_type_scope || "any",
                      duration_options_text: toArrayText(item.duration_options),
                      visible_in_contract_wizard: item.visible_in_contract_wizard !== false,
                      cao_key: item.cao_key || "none",
                      function_type: item.function_type || "",
                      default_letterhead_id: item.default_letterhead_id || "none",
                      version: item.version || 1,
                      status: item.status || "draft",
                      body: item.body || DEFAULT_TEMPLATE_BODY,
                    });
                  }}>
                    <FileText className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => createNewTemplateVersion(item)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  {item.status !== "archived" && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => archiveTemplate(item)}>
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">{editingTemplateId ? "Template bewerken" : "Template opstellen"}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Naam</Label>
                <Input value={templateForm.name} onChange={event => setTemplateForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Arbeidsovereenkomst bepaalde tijd" />
              </div>
              <div className="space-y-1">
                <Label>Versie</Label>
                <Input type="number" min="1" value={templateForm.version} onChange={event => setTemplateForm(prev => ({ ...prev, version: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={templateForm.status} onValueChange={value => setTemplateForm(prev => ({ ...prev, status: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Concept</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="published">Gepubliceerd</SelectItem>
                    <SelectItem value="archived">Gearchiveerd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Contractvorm</Label>
                <Select value={templateForm.contract_form_scope || "any"} onValueChange={value => setTemplateForm(prev => ({ ...prev, contract_form_scope: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTRACT_FORM_SCOPES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Urenmodel</Label>
                <Select value={templateForm.employment_model_scope || "any"} onValueChange={value => setTemplateForm(prev => ({ ...prev, employment_model_scope: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_MODEL_SCOPES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Proeftijd</Label>
                <Select value={templateForm.probation_scope || "any"} onValueChange={value => setTemplateForm(prev => ({ ...prev, probation_scope: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROBATION_SCOPES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Duursoort</Label>
                <Select value={templateForm.duration_type_scope || "any"} onValueChange={value => setTemplateForm(prev => ({ ...prev, duration_type_scope: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATION_TYPE_SCOPES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>CAO</Label>
                <Select value={templateForm.cao_key || "none"} onValueChange={value => setTemplateForm(prev => ({ ...prev, cao_key: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CAO_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
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
            <div className="space-y-1">
              <Label>Omschrijving</Label>
              <Input value={templateForm.description} onChange={event => setTemplateForm(prev => ({ ...prev, description: event.target.value }))} placeholder="Interne toelichting" />
            </div>
            <div className="space-y-1">
              <Label>Duurkeuzes</Label>
              <Input
                value={templateForm.duration_options_text || ""}
                onChange={event => setTemplateForm(prev => ({ ...prev, duration_options_text: event.target.value }))}
                placeholder="Optioneel, bijv. 6_months, 1_year, free"
              />
              <p className="text-xs text-muted-foreground">Laat leeg als de template bij alle duurkeuzes binnen de gekozen duursoort hoort.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={templateForm.visible_in_contract_wizard !== false}
                onChange={event => setTemplateForm(prev => ({ ...prev, visible_in_contract_wizard: event.target.checked }))}
              />
              Zichtbaar in medewerker-contractwizard
            </label>
            <div className="space-y-1">
              <Label>Template-inhoud</Label>
              <Textarea rows={14} value={templateForm.body} onChange={event => setTemplateForm(prev => ({ ...prev, body: event.target.value }))} />
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Placeholders</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {placeholders.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Geen placeholders gevonden.</span>
                ) : placeholders.map(placeholder => (
                  <Badge key={placeholder} variant="outline" className="text-xs">{placeholder}</Badge>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => saveTemplateMutation.mutate("draft")} disabled={saveTemplateMutation.isPending}>
                <Save className="mr-1 h-4 w-4" /> Concept opslaan
              </Button>
              <Button type="button" variant="outline" onClick={() => saveTemplateMutation.mutate("review")} disabled={saveTemplateMutation.isPending}>
                Review
              </Button>
              <Button type="button" onClick={() => saveTemplateMutation.mutate("published")} disabled={saveTemplateMutation.isPending}>
                <CheckCircle className="mr-1 h-4 w-4" /> Publiceren
              </Button>
            </div>
          </div>
        </div>
      </section>
      )}

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