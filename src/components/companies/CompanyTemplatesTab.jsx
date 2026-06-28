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
  ArrowDown,
  ArrowUp,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit,
  Eye,
  Image as ImageIcon,
  Layers,
  Minus,
  Plus,
  Save,
  Square,
  Upload,
  Trash2,
  Type,
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
const LETTERHEAD_STEPS = ["Upload", "Marges", "Controle"];
const TEMPLATE_STEPS = ["Scope", "Inhoud", "Controle"];
const LETTERHEAD_SOURCE_MODES = {
  upload: "upload",
  design: "design",
};
const LETTERHEAD_BACKGROUND_FITS = [
  { value: "contain", label: "Passend", description: "Hele upload blijft zichtbaar. Beste keuze bij afwijkende formaten." },
  { value: "cover", label: "Vullend", description: "Vult A4 volledig en snijdt randen af als het formaat afwijkt." },
  { value: "stretch", label: "Uitrekken", description: "Rekt de upload exact naar A4. Alleen gebruiken als de verhouding klopt." },
];
const DEFAULT_LETTERHEAD_MARGINS = {
  top: 25,
  right: 20,
  bottom: 25,
  left: 20,
};
const DEFAULT_LETTERHEAD_BACKGROUND_FIT = "contain";
const DESIGN_LAYER_DEFAULTS = {
  text: {
    type: "text",
    label: "Tekst",
    text: "Bedrijfsnaam",
    x: 16,
    y: 12,
    width: 48,
    height: 6,
    color: "#111827",
    font_size: 12,
    font_weight: 700,
    align: "left",
    opacity: 100,
  },
  rectangle: {
    type: "rectangle",
    label: "Vlak",
    x: 0,
    y: 0,
    width: 100,
    height: 9,
    background_color: "#1d4ed8",
    border_color: "#1d4ed8",
    border_width: 0,
    opacity: 100,
  },
  line: {
    type: "line",
    label: "Lijn",
    x: 10,
    y: 90,
    width: 80,
    height: 1,
    background_color: "#1d4ed8",
    opacity: 100,
  },
  image: {
    type: "image",
    label: "Afbeelding",
    x: 12,
    y: 10,
    width: 24,
    height: 10,
    object_fit: "contain",
    opacity: 100,
  },
};

function clampMargin(value, fallback = 20) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(90, Math.max(0, Math.round(number)));
}

function normalizeLetterheadMargins(source = {}) {
  const metadataMargins = source.metadata?.margins_mm || {};
  const documentSettingsMargins = source.document_settings?.margins_mm || {};
  return {
    top: clampMargin(source.margin_top_mm ?? documentSettingsMargins.top ?? metadataMargins.top, DEFAULT_LETTERHEAD_MARGINS.top),
    right: clampMargin(source.margin_right_mm ?? documentSettingsMargins.right ?? metadataMargins.right, DEFAULT_LETTERHEAD_MARGINS.right),
    bottom: clampMargin(source.margin_bottom_mm ?? documentSettingsMargins.bottom ?? metadataMargins.bottom, DEFAULT_LETTERHEAD_MARGINS.bottom),
    left: clampMargin(source.margin_left_mm ?? documentSettingsMargins.left ?? metadataMargins.left, DEFAULT_LETTERHEAD_MARGINS.left),
  };
}

function marginLabel(source) {
  const margins = normalizeLetterheadMargins(source);
  return `${margins.top}/${margins.right}/${margins.bottom}/${margins.left} mm`;
}

function fileLooksLikePdf(fileUrl = "", filename = "", fileType = "") {
  return String(fileType).toLowerCase().includes("pdf") || /\.pdf($|\?)/i.test(fileUrl) || /\.pdf$/i.test(filename);
}

function fileLooksLikeImage(fileUrl = "", filename = "", fileType = "") {
  return String(fileType).toLowerCase().startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|avif)($|\?)/i.test(fileUrl) || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(filename);
}

function createLayerId() {
  return `layer_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function clampPercent(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function clampLayerSize(value, fallback = 10) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(1, Math.round(number)));
}

function normalizeDesignLayer(layer = {}) {
  const defaults = DESIGN_LAYER_DEFAULTS[layer.type] || DESIGN_LAYER_DEFAULTS.text;
  return {
    ...defaults,
    ...layer,
    id: layer.id || createLayerId(),
    x: clampPercent(layer.x ?? defaults.x),
    y: clampPercent(layer.y ?? defaults.y),
    width: clampLayerSize(layer.width ?? defaults.width),
    height: clampLayerSize(layer.height ?? defaults.height),
    opacity: clampPercent(layer.opacity ?? defaults.opacity ?? 100, defaults.opacity ?? 100),
  };
}

function normalizeDesignLayers(source = {}) {
  const layers = source.design_layers || source.document_settings?.design_layers || source.metadata?.design_layers || [];
  return Array.isArray(layers) ? layers.map(normalizeDesignLayer) : [];
}

function normalizeSourceMode(source = {}) {
  const mode = source.source_mode || source.document_settings?.source_mode || source.metadata?.source_mode;
  return mode === LETTERHEAD_SOURCE_MODES.design ? LETTERHEAD_SOURCE_MODES.design : LETTERHEAD_SOURCE_MODES.upload;
}

function normalizeBackgroundFit(source = {}) {
  const fit = source.background_fit || source.document_settings?.background_fit || source.metadata?.background_fit;
  return LETTERHEAD_BACKGROUND_FITS.some(option => option.value === fit) ? fit : DEFAULT_LETTERHEAD_BACKGROUND_FIT;
}

function imageLooksA4(assetInfo) {
  if (!assetInfo?.width || !assetInfo?.height) return null;
  const ratio = assetInfo.width / assetInfo.height;
  const a4Ratio = 210 / 297;
  return Math.abs(ratio - a4Ratio) < 0.04;
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

function renderDesignLayer(layer) {
  const style = {
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${layer.width}%`,
    height: `${layer.height}%`,
    opacity: (layer.opacity ?? 100) / 100,
  };

  if (layer.type === "rectangle") {
    return (
      <div
        key={layer.id}
        className="absolute"
        style={{
          ...style,
          backgroundColor: layer.background_color || "#1d4ed8",
          border: `${layer.border_width || 0}px solid ${layer.border_color || layer.background_color || "#1d4ed8"}`,
        }}
      />
    );
  }

  if (layer.type === "line") {
    return (
      <div
        key={layer.id}
        className="absolute"
        style={{
          ...style,
          height: `${Math.max(1, Number(layer.height) || 1)}%`,
          backgroundColor: layer.background_color || "#1d4ed8",
        }}
      />
    );
  }

  if (layer.type === "image") {
    return (
      <div key={layer.id} className="absolute overflow-hidden" style={style}>
        {layer.src ? (
          <img
            src={layer.src}
            alt={layer.label || "Afbeelding"}
            className="h-full w-full"
            style={{ objectFit: layer.object_fit || "contain" }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-slate-300 text-[8px] text-slate-400">
            Afbeelding
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      key={layer.id}
      className="absolute overflow-hidden whitespace-pre-wrap leading-tight"
      style={{
        ...style,
        color: layer.color || "#111827",
        fontSize: `${layer.font_size || 12}px`,
        fontWeight: layer.font_weight || 400,
        textAlign: layer.align || "left",
      }}
    >
      {layer.text || "Tekst"}
    </div>
  );
}

function LetterheadPreview({
  source,
  filename,
  fileType,
  margins,
  mode = "margins",
  sourceMode = LETTERHEAD_SOURCE_MODES.upload,
  backgroundFit = DEFAULT_LETTERHEAD_BACKGROUND_FIT,
  designLayers = [],
  assetInfo = null,
}) {
  const top = (margins.top / 297) * 100;
  const right = (margins.right / 210) * 100;
  const bottom = (margins.bottom / 297) * 100;
  const left = (margins.left / 210) * 100;
  const isPdf = fileLooksLikePdf(source, filename, fileType);
  const isImage = fileLooksLikeImage(source, filename, fileType);
  const hasSource = Boolean(source);
  const looksA4 = imageLooksA4(assetInfo);
  const objectFit = backgroundFit === "stretch" ? "fill" : backgroundFit;

  return (
    <div className="rounded-lg border border-border bg-background/50 p-4">
      <div className="mx-auto w-full max-w-[430px]">
        <div className="relative mx-auto aspect-[210/297] overflow-hidden rounded-[2px] border border-slate-300 bg-white shadow-[0_14px_40px_rgba(0,0,0,0.18)]">
          {sourceMode === LETTERHEAD_SOURCE_MODES.upload && hasSource && isImage && (
            <img
              src={source}
              alt={filename || "Briefpapier"}
              className="absolute inset-0 h-full w-full"
              style={{ objectFit }}
            />
          )}
          {sourceMode === LETTERHEAD_SOURCE_MODES.upload && hasSource && isPdf && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white p-8 text-center">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                PDF-briefpapier geselecteerd
              </div>
              <p className="mt-2 max-w-[220px] text-[10px] leading-snug text-slate-400">
                De A4-pagina en marges blijven exact. Gebruik JPG of PNG als je het ontwerp pixelprecies in deze preview wilt zien.
              </p>
            </div>
          )}
          {hasSource && !isImage && !isPdf && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/20 p-6 text-center text-xs text-muted-foreground">
              {filename || "Bestand geselecteerd"}
            </div>
          )}
          {sourceMode === LETTERHEAD_SOURCE_MODES.design && designLayers.map(renderDesignLayer)}
          {sourceMode === LETTERHEAD_SOURCE_MODES.upload && !hasSource && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/20 p-6 text-center text-xs text-muted-foreground">
              Upload eerst een PDF, JPG of PNG.
            </div>
          )}
          {sourceMode === LETTERHEAD_SOURCE_MODES.design && designLayers.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/20 p-6 text-center text-xs text-muted-foreground">
              Voeg links lagen toe om briefpapier te ontwerpen.
            </div>
          )}
          <div
            className={`absolute rounded-[2px] border ${mode === "sample" ? "border-primary/45 bg-white/72" : "border-dashed border-primary/75 bg-primary/5"}`}
            style={{
              top: `${top}%`,
              right: `${right}%`,
              bottom: `${bottom}%`,
              left: `${left}%`,
            }}
          >
            {mode === "sample" ? (
              <div className="h-full overflow-hidden p-[7%] text-[8px] leading-snug text-slate-800 sm:text-[9px]">
                <p className="mb-3 text-[11px] font-bold text-slate-950">Arbeidsovereenkomst</p>
                <p className="mb-3">Ondergetekenden verklaren hierbij de arbeidsovereenkomst aan te gaan conform de gekozen contractvorm, CAO en functie-indeling.</p>
                <div className="space-y-1.5">
                  <div className="h-1.5 w-full rounded bg-slate-300" />
                  <div className="h-1.5 w-11/12 rounded bg-slate-300" />
                  <div className="h-1.5 w-10/12 rounded bg-slate-300" />
                  <div className="h-1.5 w-8/12 rounded bg-slate-300" />
                </div>
                <p className="mt-5 font-semibold">Artikel 1 - Functie en duur</p>
                <div className="mt-2 space-y-1.5">
                  <div className="h-1.5 w-full rounded bg-slate-200" />
                  <div className="h-1.5 w-full rounded bg-slate-200" />
                  <div className="h-1.5 w-9/12 rounded bg-slate-200" />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-3 text-center text-[10px] font-medium text-primary">
                Contentvlak
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Marges: {margins.top} / {margins.right} / {margins.bottom} / {margins.left} mm
        </p>
        {sourceMode === LETTERHEAD_SOURCE_MODES.upload && looksA4 === false && (
          <p className="mx-auto mt-2 max-w-[320px] text-center text-xs text-amber-600 dark:text-amber-300">
            De upload lijkt geen A4-verhouding te hebben. Kies bij voorkeur passend of upload een A4-bestand.
          </p>
        )}
      </div>
    </div>
  );
}

function MarginInput({ label, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min="0"
          max="90"
          value={value}
          onChange={event => onChange(clampMargin(event.target.value))}
          className="h-9"
        />
        <span className="text-xs text-muted-foreground">mm</span>
      </div>
    </div>
  );
}

function LayerIcon({ type }) {
  if (type === "rectangle") return <Square className="h-3.5 w-3.5" />;
  if (type === "line") return <Minus className="h-3.5 w-3.5" />;
  if (type === "image") return <ImageIcon className="h-3.5 w-3.5" />;
  return <Type className="h-3.5 w-3.5" />;
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
    is_default: false,
    status: "active",
    source_mode: LETTERHEAD_SOURCE_MODES.upload,
    background_fit: DEFAULT_LETTERHEAD_BACKGROUND_FIT,
    design_layers: [],
    file: null,
    margin_top_mm: DEFAULT_LETTERHEAD_MARGINS.top,
    margin_right_mm: DEFAULT_LETTERHEAD_MARGINS.right,
    margin_bottom_mm: DEFAULT_LETTERHEAD_MARGINS.bottom,
    margin_left_mm: DEFAULT_LETTERHEAD_MARGINS.left,
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
    margin_top_mm: DEFAULT_LETTERHEAD_MARGINS.top,
    margin_right_mm: DEFAULT_LETTERHEAD_MARGINS.right,
    margin_bottom_mm: DEFAULT_LETTERHEAD_MARGINS.bottom,
    margin_left_mm: DEFAULT_LETTERHEAD_MARGINS.left,
    source_mode: LETTERHEAD_SOURCE_MODES.upload,
    background_fit: DEFAULT_LETTERHEAD_BACKGROUND_FIT,
    design_layers: [],
    document_settings: {
      source_mode: LETTERHEAD_SOURCE_MODES.upload,
      background_fit: DEFAULT_LETTERHEAD_BACKGROUND_FIT,
      margins_mm: DEFAULT_LETTERHEAD_MARGINS,
      design_layers: [],
    },
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
  const [letterheadPreviewUrl, setLetterheadPreviewUrl] = useState("");
  const [letterheadAssetInfo, setLetterheadAssetInfo] = useState(null);

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
  const letterheadPreviewSource = letterheadPreviewUrl || currentEditingLetterhead?.file_url || "";
  const letterheadPreviewFilename = letterheadForm.file?.name || currentEditingLetterhead?.download_filename || "";
  const letterheadPreviewType = letterheadForm.file?.type || "";
  const letterheadMargins = normalizeLetterheadMargins(letterheadForm);
  const letterheadSourceMode = normalizeSourceMode(letterheadForm);
  const letterheadBackgroundFit = normalizeBackgroundFit(letterheadForm);
  const letterheadDesignLayers = normalizeDesignLayers(letterheadForm);
  const letterheadUsesUpload = letterheadSourceMode === LETTERHEAD_SOURCE_MODES.upload;

  useEffect(() => {
    if (!letterheadForm.file) {
      setLetterheadPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(letterheadForm.file);
    setLetterheadPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [letterheadForm.file]);

  useEffect(() => {
    setLetterheadAssetInfo(null);
    if (!letterheadPreviewSource || !fileLooksLikeImage(letterheadPreviewSource, letterheadPreviewFilename, letterheadPreviewType)) return undefined;
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (!cancelled) setLetterheadAssetInfo({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      if (!cancelled) setLetterheadAssetInfo(null);
    };
    image.src = letterheadPreviewSource;
    return () => {
      cancelled = true;
    };
  }, [letterheadPreviewSource, letterheadPreviewFilename, letterheadPreviewType]);

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
      const sourceMode = normalizeSourceMode(letterheadForm);
      const designLayers = normalizeDesignLayers(letterheadForm);
      if (sourceMode === LETTERHEAD_SOURCE_MODES.upload && !editingLetterheadId && !letterheadForm.file) throw new Error("Upload eerst het briefpapier.");
      if (sourceMode === LETTERHEAD_SOURCE_MODES.design && designLayers.length === 0) throw new Error("Voeg minimaal één laag toe aan het briefpapier.");

      const previous = editingLetterheadId ? letterheads.find(item => item.id === editingLetterheadId) || {} : {};
      const margins = normalizeLetterheadMargins(letterheadForm);
      const backgroundFit = normalizeBackgroundFit(letterheadForm);
      const storedDesignLayers = sourceMode === LETTERHEAD_SOURCE_MODES.design ? designLayers : [];
      const otherActiveLetterheads = letterheads.filter(item => item.id !== editingLetterheadId && item.status !== "archived");
      const hasOtherDefault = otherActiveLetterheads.some(item => item.is_default);
      const shouldBeDefault = editingLetterheadId
        ? Boolean(previous.is_default || (!hasOtherDefault && otherActiveLetterheads.length === 0))
        : !hasOtherDefault;
      const auditMetadata = buildAuditMetadata(currentUser, editingLetterheadId ? "gewijzigd" : "toegevoegd", previous.metadata || {}, auditActors);
      const basePayload = {
        company_id: companyId,
        name: letterheadForm.name.trim(),
        description: null,
        is_default: shouldBeDefault,
        status: "active",
        document_settings: {
          ...(previous.document_settings || {}),
          source_mode: sourceMode,
          background_fit: backgroundFit,
          margins_mm: margins,
          design_layers: storedDesignLayers,
        },
        metadata: {
          ...auditMetadata,
          source_mode: sourceMode,
          background_fit: backgroundFit,
          margins_mm: margins,
          design_layers: storedDesignLayers,
        },
        ...(sourceMode === LETTERHEAD_SOURCE_MODES.design
          ? {
              file_url: null,
              file_id: null,
              download_filename: null,
              logical_path: null,
            }
          : {}),
      };

      let payload = basePayload;
      if (sourceMode === LETTERHEAD_SOURCE_MODES.upload && letterheadForm.file) {
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

      if (shouldBeDefault) {
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
    const margins = normalizeLetterheadMargins(record);
    setLetterheadForm({
      company_id: companyId,
      name: record.name || "",
      is_default: !!record.is_default,
      status: record.status || "active",
      source_mode: normalizeSourceMode(record),
      background_fit: normalizeBackgroundFit(record),
      design_layers: normalizeDesignLayers(record),
      file: null,
      margin_top_mm: margins.top,
      margin_right_mm: margins.right,
      margin_bottom_mm: margins.bottom,
      margin_left_mm: margins.left,
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
    if (letterheadStep === 1) {
      if (!letterheadForm.name.trim()) {
        setMessage({ type: "error", text: "Vul eerst een naam voor het briefpapier in." });
        return;
      }
      if (letterheadUsesUpload && !letterheadForm.file && !letterheadHasExistingFile) {
        setMessage({ type: "error", text: "Upload eerst het briefpapier." });
        return;
      }
    }
    if (letterheadStep === 2) {
      if (letterheadUsesUpload && !letterheadPreviewSource) {
        setMessage({ type: "error", text: "Upload eerst het briefpapier." });
        return;
      }
      if (!letterheadUsesUpload && letterheadDesignLayers.length === 0) {
        setMessage({ type: "error", text: "Voeg minimaal één laag toe aan het briefpapier." });
        return;
      }
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

  const updateLetterheadLayer = (layerId, updates) => {
    setLetterheadForm(prev => ({
      ...prev,
      design_layers: normalizeDesignLayers(prev).map(layer => (
        layer.id === layerId ? normalizeDesignLayer({ ...layer, ...updates }) : layer
      )),
    }));
  };

  const addLetterheadLayer = (type) => {
    const layer = normalizeDesignLayer({ ...DESIGN_LAYER_DEFAULTS[type], id: createLayerId() });
    setLetterheadForm(prev => ({
      ...prev,
      source_mode: LETTERHEAD_SOURCE_MODES.design,
      design_layers: [...normalizeDesignLayers(prev), layer],
    }));
  };

  const addLetterheadImageLayer = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const layer = normalizeDesignLayer({
        ...DESIGN_LAYER_DEFAULTS.image,
        id: createLayerId(),
        label: file.name || "Afbeelding",
        src: reader.result,
      });
      setLetterheadForm(prev => ({
        ...prev,
        source_mode: LETTERHEAD_SOURCE_MODES.design,
        design_layers: [...normalizeDesignLayers(prev), layer],
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeLetterheadLayer = (layerId) => {
    setLetterheadForm(prev => ({
      ...prev,
      design_layers: normalizeDesignLayers(prev).filter(layer => layer.id !== layerId),
    }));
  };

  const moveLetterheadLayer = (layerId, direction) => {
    setLetterheadForm(prev => {
      const layers = normalizeDesignLayers(prev);
      const index = layers.findIndex(layer => layer.id === layerId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) return prev;
      const nextLayers = [...layers];
      const [layer] = nextLayers.splice(index, 1);
      nextLayers.splice(nextIndex, 0, layer);
      return { ...prev, design_layers: nextLayers };
    });
  };

  const renderLetterheadLayerEditor = (layer, index) => {
    const isText = layer.type === "text";
    const isShape = layer.type === "rectangle" || layer.type === "line";
    const isImage = layer.type === "image";

    return (
      <div key={layer.id} className="rounded-lg border border-border bg-background/45 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <LayerIcon type={layer.type} />
              {layer.label || DESIGN_LAYER_DEFAULTS[layer.type]?.label || "Laag"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Laag {index + 1}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => moveLetterheadLayer(layer.id, -1)}
              disabled={index === 0}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => moveLetterheadLayer(layer.id, 1)}
              disabled={index === letterheadDesignLayers.length - 1}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => removeLetterheadLayer(layer.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Naam laag</Label>
            <Input
              className="h-9"
              value={layer.label || ""}
              onChange={event => updateLetterheadLayer(layer.id, { label: event.target.value })}
            />
          </div>

          {isText && (
            <div className="space-y-1.5">
              <Label className="text-xs">Tekst</Label>
              <Textarea
                value={layer.text || ""}
                onChange={event => updateLetterheadLayer(layer.id, { text: event.target.value })}
                rows={3}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">X</Label>
              <Input
                type="number"
                min="0"
                max="100"
                className="h-9"
                value={layer.x}
                onChange={event => updateLetterheadLayer(layer.id, { x: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Y</Label>
              <Input
                type="number"
                min="0"
                max="100"
                className="h-9"
                value={layer.y}
                onChange={event => updateLetterheadLayer(layer.id, { y: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Breedte</Label>
              <Input
                type="number"
                min="1"
                max="100"
                className="h-9"
                value={layer.width}
                onChange={event => updateLetterheadLayer(layer.id, { width: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hoogte</Label>
              <Input
                type="number"
                min="1"
                max="100"
                className="h-9"
                value={layer.height}
                onChange={event => updateLetterheadLayer(layer.id, { height: event.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Dekking</Label>
              <Input
                type="number"
                min="0"
                max="100"
                className="h-9"
                value={layer.opacity}
                onChange={event => updateLetterheadLayer(layer.id, { opacity: event.target.value })}
              />
            </div>
            {isText && (
              <div className="space-y-1.5">
                <Label className="text-xs">Tekstgrootte</Label>
                <Input
                  type="number"
                  min="6"
                  max="48"
                  className="h-9"
                  value={layer.font_size || 12}
                  onChange={event => updateLetterheadLayer(layer.id, { font_size: Number(event.target.value) || 12 })}
                />
              </div>
            )}
            {isImage && (
              <div className="space-y-1.5">
                <Label className="text-xs">Passend maken</Label>
                <Select value={layer.object_fit || "contain"} onValueChange={value => updateLetterheadLayer(layer.id, { object_fit: value })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contain">Passend</SelectItem>
                    <SelectItem value="cover">Vullend</SelectItem>
                    <SelectItem value="fill">Uitrekken</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {(isText || isShape) && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{isText ? "Tekstkleur" : "Kleur"}</Label>
                <Input
                  type="color"
                  className="h-9 p-1"
                  value={isText ? (layer.color || "#111827") : (layer.background_color || "#1d4ed8")}
                  onChange={event => updateLetterheadLayer(layer.id, isText ? { color: event.target.value } : { background_color: event.target.value })}
                />
              </div>
              {isText && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Uitlijning</Label>
                  <Select value={layer.align || "left"} onValueChange={value => updateLetterheadLayer(layer.id, { align: value })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Links</SelectItem>
                      <SelectItem value="center">Midden</SelectItem>
                      <SelectItem value="right">Rechts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
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
              <div className="grid gap-4 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Naam *</Label>
                    <Input
                      value={letterheadForm.name}
                      onChange={event => setLetterheadForm(prev => ({ ...prev, name: event.target.value }))}
                      placeholder="Bijv. Standaard briefpapier"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Manier van maken</Label>
                    <div className="grid gap-2">
                      <button
                        type="button"
                        className={`rounded-lg border p-3 text-left transition-colors ${letterheadUsesUpload ? "border-primary bg-primary/10" : "border-border bg-background/35 hover:bg-background/70"}`}
                        onClick={() => setLetterheadForm(prev => ({ ...prev, source_mode: LETTERHEAD_SOURCE_MODES.upload }))}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Upload className="h-4 w-4" />
                          Bestaand briefpapier uploaden
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">Gebruik een A4-PDF, JPG of PNG als basis.</span>
                      </button>
                      <button
                        type="button"
                        className={`rounded-lg border p-3 text-left transition-colors ${!letterheadUsesUpload ? "border-primary bg-primary/10" : "border-border bg-background/35 hover:bg-background/70"}`}
                        onClick={() => setLetterheadForm(prev => ({ ...prev, source_mode: LETTERHEAD_SOURCE_MODES.design }))}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Layers className="h-4 w-4" />
                          Zelf briefpapier ontwerpen
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">Maak een ontwerp met lagen zoals tekst, vlakken, lijnen en logo.</span>
                      </button>
                    </div>
                  </div>
                  {letterheadHasExistingFile && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
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
                {letterheadUsesUpload ? (
                  <label className="flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/40 p-5 text-center transition-colors hover:bg-background/70">
                    <Upload className="h-7 w-7 text-muted-foreground" />
                    <span className="mt-2 text-sm font-medium text-foreground">
                      {letterheadForm.file?.name || (letterheadHasExistingFile ? "Vervang PDF of afbeelding" : "Upload PDF of afbeelding")}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">Gebruik bij voorkeur A4 staand. PDF, JPG of PNG.</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={event => setLetterheadForm(prev => ({ ...prev, file: event.target.files?.[0] || null }))}
                    />
                  </label>
                ) : (
                  <div className="flex min-h-[260px] flex-col justify-center rounded-lg border border-border bg-background/40 p-5">
                    <p className="text-sm font-semibold text-foreground">Ontwerp starten</p>
                    <p className="mt-1 text-sm text-muted-foreground">In de volgende stap kun je lagen toevoegen en direct op een A4-pagina controleren.</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <Button type="button" variant="outline" onClick={() => addLetterheadLayer("text")}>
                        <Type className="mr-1 h-4 w-4" />
                        Tekstlaag
                      </Button>
                      <Button type="button" variant="outline" onClick={() => addLetterheadLayer("rectangle")}>
                        <Square className="mr-1 h-4 w-4" />
                        Vlak
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {letterheadStep === 2 && (
              <div className="grid gap-5 xl:grid-cols-[minmax(360px,460px)_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-background/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Marges</p>
                    <p className="mt-1 text-xs text-muted-foreground">Stel in waar de contracttekst over het briefpapier heen mag komen.</p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <MarginInput
                        label="Boven"
                        value={letterheadMargins.top}
                        onChange={value => setLetterheadForm(prev => ({ ...prev, margin_top_mm: value }))}
                      />
                      <MarginInput
                        label="Rechts"
                        value={letterheadMargins.right}
                        onChange={value => setLetterheadForm(prev => ({ ...prev, margin_right_mm: value }))}
                      />
                      <MarginInput
                        label="Onder"
                        value={letterheadMargins.bottom}
                        onChange={value => setLetterheadForm(prev => ({ ...prev, margin_bottom_mm: value }))}
                      />
                      <MarginInput
                        label="Links"
                        value={letterheadMargins.left}
                        onChange={value => setLetterheadForm(prev => ({ ...prev, margin_left_mm: value }))}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setLetterheadForm(prev => ({
                        ...prev,
                        margin_top_mm: DEFAULT_LETTERHEAD_MARGINS.top,
                        margin_right_mm: DEFAULT_LETTERHEAD_MARGINS.right,
                        margin_bottom_mm: DEFAULT_LETTERHEAD_MARGINS.bottom,
                        margin_left_mm: DEFAULT_LETTERHEAD_MARGINS.left,
                      }))}
                    >
                      Marges resetten
                    </Button>
                  </div>

                  {letterheadUsesUpload ? (
                    <div className="rounded-lg border border-border bg-background/40 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uploadweergave</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        De pagina blijft altijd A4. Kies hoe een afwijkende upload op het A4-vel wordt geplaatst.
                      </p>
                      {letterheadAssetInfo && (
                        <p className={`mt-3 rounded-md border px-3 py-2 text-xs ${
                          imageLooksA4(letterheadAssetInfo)
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                            : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                        }`}>
                          Afbeelding: {letterheadAssetInfo.width} x {letterheadAssetInfo.height}px
                          {imageLooksA4(letterheadAssetInfo) === false ? " - verhouding wijkt af van A4." : " - verhouding lijkt A4."}
                        </p>
                      )}
                      <div className="mt-3 grid gap-2">
                        {LETTERHEAD_BACKGROUND_FITS.map(option => (
                          <button
                            key={option.value}
                            type="button"
                            className={`rounded-lg border p-3 text-left transition-colors ${
                              letterheadBackgroundFit === option.value
                                ? "border-primary bg-primary/10"
                                : "border-border bg-background/35 hover:bg-background/70"
                            }`}
                            onClick={() => setLetterheadForm(prev => ({ ...prev, background_fit: option.value }))}
                          >
                            <span className="text-sm font-semibold text-foreground">{option.label}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-background/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ontwerplagen</p>
                          <p className="mt-1 text-xs text-muted-foreground">Werk met lagen voor tekst, logo, lijnen en vlakken.</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => addLetterheadLayer("text")}>
                          <Type className="mr-1 h-4 w-4" />
                          Tekst
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => addLetterheadLayer("rectangle")}>
                          <Square className="mr-1 h-4 w-4" />
                          Vlak
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => addLetterheadLayer("line")}>
                          <Minus className="mr-1 h-4 w-4" />
                          Lijn
                        </Button>
                        <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                          <ImageIcon className="mr-1 h-4 w-4" />
                          Logo
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={event => {
                              addLetterheadImageLayer(event.target.files?.[0]);
                              event.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      <div className="mt-4 max-h-[540px] space-y-3 overflow-auto pr-1">
                        {letterheadDesignLayers.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                            Nog geen lagen. Voeg bijvoorbeeld een tekstlaag of logo toe.
                          </div>
                        ) : (
                          letterheadDesignLayers.map(renderLetterheadLayerEditor)
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <LetterheadPreview
                  source={letterheadPreviewSource}
                  filename={letterheadPreviewFilename}
                  fileType={letterheadPreviewType}
                  margins={letterheadMargins}
                  sourceMode={letterheadSourceMode}
                  backgroundFit={letterheadBackgroundFit}
                  designLayers={letterheadDesignLayers}
                  assetInfo={letterheadAssetInfo}
                />
              </div>
            )}

            {letterheadStep === 3 && (
              <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Naam</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{letterheadForm.name || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Type</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{letterheadUsesUpload ? "Upload" : "Zelf ontworpen"}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {letterheadUsesUpload
                        ? (letterheadForm.file?.name || currentEditingLetterhead?.download_filename || "-")
                        : `${letterheadDesignLayers.length} lagen`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Marges</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{marginLabel(letterheadForm)}</p>
                  </div>
                  {letterheadUsesUpload && (
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Weergave</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {LETTERHEAD_BACKGROUND_FITS.find(option => option.value === letterheadBackgroundFit)?.label || "Passend"}
                      </p>
                    </div>
                  )}
                </div>
                <LetterheadPreview
                  source={letterheadPreviewSource}
                  filename={letterheadPreviewFilename}
                  fileType={letterheadPreviewType}
                  margins={letterheadMargins}
                  mode="sample"
                  sourceMode={letterheadSourceMode}
                  backgroundFit={letterheadBackgroundFit}
                  designLayers={letterheadDesignLayers}
                  assetInfo={letterheadAssetInfo}
                />
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
        <span>Marges</span>
        <span>Status</span>
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
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.download_filename || "Briefpapier"}</p>
            </div>
            <span className="text-sm text-muted-foreground">{marginLabel(item)}</span>
            <div>{item.status === "archived" ? statusBadge("archived") : <Badge className="border-0 bg-green-100 text-xs text-green-800 dark:bg-green-900/45 dark:text-green-200">Actief</Badge>}</div>
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
