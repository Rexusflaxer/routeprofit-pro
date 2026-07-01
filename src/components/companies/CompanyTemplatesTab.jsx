import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
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
  EyeOff,
  FilePlus2,
  GripVertical,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Lock,
  Minus,
  Plus,
  Save,
  Square,
  Upload,
  Trash2,
  Type,
  Unlock,
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

const CAO_OPTIONS = [
  { value: "cao_particuliere_beveiliging", label: "CAO Particuliere Beveiliging" },
  { value: "cao_evenementen_horecabeveiliging", label: "CAO Evenementen- en Horecabeveiliging" },
  { value: "cao_verkeersregelaars", label: "CAO Verkeersregelaars" },
  { value: "cao_veiligheidsdomein", label: "CAO Veiligheidsdomein" },
  { value: "none", label: "Geen vaste CAO" },
];

const CAO_OPTION_LABELS = Object.fromEntries(CAO_OPTIONS.map(option => [option.value, option.label]));

const CONTRACT_FORM_LABELS = {
  bepaalde_tijd: "Bepaalde tijd",
  onbepaalde_tijd: "Onbepaalde tijd",
  oproep: "Oproep",
  stage: "Stage",
  zzp: "ZZP / opdracht",
};

const EMPLOYMENT_MODEL_LABELS = {
  fulltime: "Fulltime",
  parttime_fixed: "Parttime vast",
  parttime_growth: "Parttime groeimodel",
  call_agreement: "Oproep / nuluren",
  min_max: "Min-max",
  internship: "Stage",
  zzp: "ZZP / opdracht",
};

const CONTRACT_MODEL_OPTIONS = [
  {
    value: "fulltime_fixed",
    label: "Fulltime dienstverband - bepaalde tijd",
    contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "fulltime",
    default_hours: 40,
  },
  {
    value: "fulltime_indefinite",
    label: "Fulltime dienstverband - onbepaalde tijd",
    contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "fulltime",
    default_hours: 40,
  },
  {
    value: "parttime_fixed",
    label: "Parttime vast - bepaalde tijd",
    contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "parttime_fixed",
  },
  {
    value: "parttime_indefinite",
    label: "Parttime vast - onbepaalde tijd",
    contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "parttime_fixed",
  },
  {
    value: "min_max_fixed",
    label: "Min-max - bepaalde tijd",
    contract_form: "oproep",
    underlying_contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "min_max",
  },
  {
    value: "min_max_indefinite",
    label: "Min-max - onbepaalde tijd",
    contract_form: "oproep",
    underlying_contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "min_max",
  },
  {
    value: "call_fixed",
    label: "Oproep / nuluren - bepaalde tijd",
    contract_form: "oproep",
    underlying_contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "call_agreement",
  },
  {
    value: "call_indefinite",
    label: "Oproep / nuluren - onbepaalde tijd",
    contract_form: "oproep",
    underlying_contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "call_agreement",
  },
  {
    value: "internship_fixed",
    label: "Stage - bepaalde tijd",
    contract_form: "stage",
    duration_type: "fixed",
    employment_model: "internship",
  },
  {
    value: "zzp_assignment",
    label: "Overeenkomst van opdracht (ZZP)",
    contract_form: "zzp",
    duration_type: "fixed",
    employment_model: "zzp",
  },
];

const CONTRACT_MODEL_LABELS = Object.fromEntries(CONTRACT_MODEL_OPTIONS.map(option => [option.value, option.label]));
const PROBATION_CHOICES = [
  { value: "with_probation", label: "Met proeftijd", description: "Gebruik dit sjabloon alleen wanneer een proeftijd is afgesproken." },
  { value: "without_probation", label: "Zonder proeftijd", description: "Gebruik dit sjabloon wanneer er geen proeftijd in het contract staat." },
  { value: "not_applicable", label: "Niet van toepassing", description: "Voor contractvormen waar proeftijd niet logisch of niet relevant is." },
];

const CLAUSE_SCOPE_OPTIONS = [
  {
    value: "employment_contracts",
    label: "Arbeidscontracten",
    description: "Clausules voor arbeidsovereenkomsten met medewerkers.",
  },
  {
    value: "customer_contracts",
    label: "Klantcontracten",
    description: "Afspraken met opdrachtgevers over dienstverlening, aansprakelijkheid en betaling.",
  },
  {
    value: "zzp_framework_agreements",
    label: "Raamovereenkomsten met zzp'ers",
    description: "Afspraken met zelfstandigen over opdracht, geheimhouding en zelfstandigheid.",
  },
  {
    value: "supplier_or_partner_agreements",
    label: "Leveranciers en partners",
    description: "Algemene zakelijke clausules voor leveranciers, onderaannemers en partners.",
  },
];

const CLAUSE_TYPE_CATALOG = {
  employment_contracts: [
    {
      value: "confidentiality",
      label: "Geheimhouding",
      description: "Beschermt bedrijfsinformatie, klantgegevens, roosters, tarieven en werkwijzen.",
      defaultSections: [
        "Werknemer houdt alle vertrouwelijke informatie geheim die hij of zij tijdens of door het dienstverband verkrijgt.",
        "Onder vertrouwelijke informatie vallen in ieder geval klantgegevens, beveiligingsinstructies, tarieven, procedures, planning, objectinformatie en interne documenten.",
        "Deze verplichting geldt tijdens het dienstverband en blijft ook na het einde daarvan bestaan.",
      ],
      snippets: [
        {
          label: "Definitie vertrouwelijke informatie",
          text: "Onder vertrouwelijke informatie wordt verstaan: alle informatie waarvan werknemer weet of redelijkerwijs behoort te begrijpen dat deze niet openbaar mag worden gemaakt.",
          help: "Maakt duidelijk welke informatie onder geheimhouding valt zonder elk document afzonderlijk te hoeven noemen.",
        },
        {
          label: "Duur na einde contract",
          text: "De geheimhoudingsplicht blijft na het einde van de overeenkomst onverminderd van kracht zolang de informatie niet rechtmatig openbaar is geworden.",
          help: "Legt vast dat geheimhouding niet automatisch stopt bij uitdiensttreding.",
        },
        {
          label: "Uitzondering wettelijke plicht",
          text: "Deze bepaling geldt niet voor zover openbaarmaking verplicht is op grond van wet, rechterlijke uitspraak of een bevoegd gegeven overheidsbevel.",
          help: "Voorkomt dat de clausule botst met een wettelijke verplichting om informatie te geven.",
        },
      ],
    },
    {
      value: "company_property",
      label: "Bedrijfsmiddelen",
      description: "Regelt gebruik en teruggave van sleutels, kleding, passen, telefoons en documenten.",
      defaultSections: [
        "Werknemer gebruikt bedrijfsmiddelen uitsluitend zorgvuldig en voor het uitvoeren van de overeengekomen werkzaamheden.",
        "Werknemer geeft bedrijfsmiddelen, sleutels, passen, kleding, apparatuur en documenten uiterlijk op verzoek of bij einde dienstverband terug.",
      ],
      snippets: [
        {
          label: "Meldplicht verlies",
          text: "Verlies, diefstal of beschadiging van bedrijfsmiddelen wordt direct gemeld bij werkgever.",
          help: "Helpt operationeel risico te beperken, vooral bij sleutels, toegangspassen en beveiligingsmiddelen.",
        },
      ],
    },
    {
      value: "relationship_non_solicit",
      label: "Relatiebeding",
      description: "Beperkt benaderen van klanten of relaties na einde contract; juridisch gevoelig.",
      defaultSections: [
        "Werknemer zal gedurende de overeenkomst en na afloop daarvan geen klanten of relaties van werkgever actief benaderen met het doel vergelijkbare diensten buiten werkgever om te verrichten.",
        "De reikwijdte, duur en noodzaak van deze bepaling worden in de overeenkomst concreet vastgelegd.",
      ],
      snippets: [
        {
          label: "Concrete relaties",
          text: "Deze bepaling ziet alleen op relaties waarmee werknemer in de laatste twaalf maanden van het dienstverband zakelijk contact heeft gehad.",
          help: "Een concretere afbakening is doorgaans beter verdedigbaar dan een brede algemene formulering.",
        },
        {
          label: "Juridische toets",
          text: "Deze bepaling wordt alleen toegepast voor zover zij schriftelijk en rechtsgeldig is overeengekomen en past binnen de geldende wettelijke eisen.",
          help: "Relatie- en concurrentiebedingen zijn arbeidsrechtelijk gevoelig. Laat dit altijd toetsen bij gebruik.",
        },
      ],
    },
  ],
  customer_contracts: [
    {
      value: "confidentiality",
      label: "Geheimhouding",
      description: "Beschermt bedrijfsinformatie, tarieven, beveiligingsplannen en klantinformatie.",
      defaultSections: [
        "Partijen houden alle vertrouwelijke informatie geheim die zij in het kader van de overeenkomst ontvangen.",
        "Vertrouwelijke informatie wordt uitsluitend gebruikt voor de uitvoering van de overeenkomst.",
        "De geheimhoudingsplicht blijft na beëindiging van de overeenkomst bestaan zolang de informatie vertrouwelijk is.",
      ],
      snippets: [
        {
          label: "Beperkte toegang",
          text: "Toegang tot vertrouwelijke informatie wordt beperkt tot personen die deze informatie nodig hebben voor de uitvoering van de overeenkomst.",
          help: "Past bij beveiligingswerk, waar objectinformatie en instructies beperkt gedeeld moeten worden.",
        },
      ],
    },
    {
      value: "liability",
      label: "Aansprakelijkheid",
      description: "Legt grenzen en uitzonderingen rond aansprakelijkheid vast.",
      defaultSections: [
        "Aansprakelijkheid is beperkt tot directe schade die het rechtstreekse gevolg is van een toerekenbare tekortkoming.",
        "Indirecte schade, gevolgschade en gederfde winst zijn uitgesloten, tenzij dwingend recht anders bepaalt.",
      ],
      snippets: [
        {
          label: "Verzekerde som",
          text: "Voor zover toegestaan is aansprakelijkheid beperkt tot het bedrag dat in het betreffende geval door de aansprakelijkheidsverzekering wordt uitgekeerd.",
          help: "Sluit de contractuele limiet aan op verzekeringsdekking. Controleer of de polis dit ondersteunt.",
        },
      ],
    },
    {
      value: "payment_terms",
      label: "Betaling en facturatie",
      description: "Regelt factuurtermijnen, bezwaar en incasso.",
      defaultSections: [
        "Facturen worden betaald binnen de overeengekomen betalingstermijn.",
        "Bezwaren tegen een factuur worden binnen redelijke termijn schriftelijk en gemotiveerd gemeld.",
      ],
      snippets: [
        {
          label: "Opschorting bij achterstand",
          text: "Bij betalingsachterstand mag opdrachtnemer de dienstverlening opschorten nadat opdrachtgever schriftelijk is aangemaand en een redelijke hersteltermijn heeft gekregen.",
          help: "Geeft een route voordat dienstverlening wordt gepauzeerd; belangrijk bij operationele beveiligingsdiensten.",
        },
      ],
    },
  ],
  zzp_framework_agreements: [
    {
      value: "assignment_scope",
      label: "Opdracht en zelfstandigheid",
      description: "Beschrijft de opdracht zonder gezagsverhouding te suggereren.",
      defaultSections: [
        "Opdrachtnemer voert de overeengekomen werkzaamheden zelfstandig uit binnen de kaders van de opdracht.",
        "Partijen beogen geen arbeidsovereenkomst aan te gaan.",
      ],
      snippets: [
        {
          label: "Eigen verantwoordelijkheid",
          text: "Opdrachtnemer is verantwoordelijk voor de wijze waarop de opdracht professioneel wordt uitgevoerd, met inachtneming van geldende wet- en regelgeving.",
          help: "Ondersteunt het onderscheid tussen opdracht en dienstverband, zonder operationele eisen te negeren.",
        },
      ],
    },
    {
      value: "confidentiality",
      label: "Geheimhouding",
      description: "Beschermt klant- en objectinformatie die een zzp'er tijdens opdrachten ontvangt.",
      defaultSections: [
        "Opdrachtnemer houdt vertrouwelijke informatie geheim en gebruikt deze uitsluitend voor de opdracht.",
        "De geheimhoudingsplicht blijft na beëindiging van de opdracht bestaan.",
      ],
      snippets: [
        {
          label: "Objectinformatie",
          text: "Objectinformatie, toegangsinstructies, sleutelprocedures en beveiligingsafspraken worden altijd als vertrouwelijk beschouwd.",
          help: "Maakt de beveiligingscontext concreet zonder alle objecten apart te benoemen.",
        },
      ],
    },
    {
      value: "replacement",
      label: "Vervanging",
      description: "Regelt of en hoe een zzp'er zich kan laten vervangen.",
      defaultSections: [
        "Vervanging is alleen mogelijk na voorafgaande afstemming, waarbij de vervanger moet voldoen aan de voor de opdracht geldende kwalificaties en wettelijke eisen.",
      ],
      snippets: [
        {
          label: "Kwalificaties vervanger",
          text: "Een vervanger beschikt over de vereiste diploma's, vergunningen, screening en ervaring die voor de opdracht noodzakelijk zijn.",
          help: "Belangrijk bij beveiligingswerk waar bevoegdheden en screening niet vrijblijvend zijn.",
        },
      ],
    },
  ],
  supplier_or_partner_agreements: [
    {
      value: "confidentiality",
      label: "Geheimhouding",
      description: "Algemene geheimhouding voor samenwerking met leveranciers of partners.",
      defaultSections: [
        "Partijen behandelen vertrouwelijke informatie strikt vertrouwelijk en delen deze niet met derden zonder voorafgaande toestemming.",
        "De informatie wordt uitsluitend gebruikt voor het doel waarvoor zij is verstrekt.",
      ],
      snippets: [
        {
          label: "Teruggave of vernietiging",
          text: "Na beëindiging van de samenwerking worden vertrouwelijke documenten op verzoek teruggegeven of vernietigd, voor zover bewaren niet wettelijk verplicht is.",
          help: "Regelt wat er met informatie gebeurt nadat de samenwerking stopt.",
        },
      ],
    },
  ],
};

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
const CLAUSE_TABLE_GRID = "grid grid-cols-[minmax(32px,44px)_minmax(220px,1fr)_minmax(120px,160px)_minmax(140px,180px)_minmax(144px,max-content)] gap-3 xl:gap-4";
const LETTERHEAD_STEPS = ["Upload", "Marges", "Controle"];
const TEMPLATE_STEPS = ["CAO", "Contract", "Proeftijd", "Briefpapier", "Inhoud", "Controle"];
const CLAUSE_STEPS = ["Onderdeel", "Clausule", "Uitwerken", "Controle"];
const CLAUSE_MARKER_PREFIX = "clausule:";
const LETTERHEAD_SOURCE_MODES = {
  upload: "upload",
  design: "design",
};
const PDFJS_CDN_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";
const PDFJS_WORKER_CDN_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
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
const LETTERHEAD_MIN_TEXT_WIDTH_MM = 45;
const LETTERHEAD_MIN_TEXT_HEIGHT_MM = 55;
const DEFAULT_LETTERHEAD_BACKGROUND_FIT = "contain";
const DEFAULT_LETTERHEAD_PAGE_BACKGROUND = "#ffffff";
const DEFAULT_LETTERHEAD_EDITOR_OPTIONS = {
  showGrid: true,
  snapToGrid: true,
  gridSize: 1,
};
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

function clampDraggedLetterheadMargin(edge, value, margins) {
  const rounded = clampMargin(value);
  if (edge === "left") return Math.min(rounded, Math.max(0, 210 - margins.right - LETTERHEAD_MIN_TEXT_WIDTH_MM));
  if (edge === "right") return Math.min(rounded, Math.max(0, 210 - margins.left - LETTERHEAD_MIN_TEXT_WIDTH_MM));
  if (edge === "top") return Math.min(rounded, Math.max(0, 297 - margins.bottom - LETTERHEAD_MIN_TEXT_HEIGHT_MM));
  if (edge === "bottom") return Math.min(rounded, Math.max(0, 297 - margins.top - LETTERHEAD_MIN_TEXT_HEIGHT_MM));
  return rounded;
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

async function loadPdfRenderer() {
  if (typeof window === "undefined") return null;
  if (window.__loqPdfRenderer) return window.__loqPdfRenderer;
  const pdfjs = await import(/* @vite-ignore */ PDFJS_CDN_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN_URL;
  window.__loqPdfRenderer = pdfjs;
  return pdfjs;
}

function createLayerId() {
  return `layer_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function roundOne(value) {
  return Math.round(Number(value) * 10) / 10;
}

function clampPercent(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return roundOne(Math.min(100, Math.max(0, number)));
}

function clampLayerSize(value, fallback = 10) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return roundOne(Math.min(100, Math.max(1, number)));
}

function clampLayerCoordinate(value, size = 1) {
  const number = Number(value);
  const max = Math.max(0, 100 - Number(size || 1));
  if (!Number.isFinite(number)) return 0;
  return roundOne(Math.min(max, Math.max(0, number)));
}

function snapPercent(value, enabled, gridSize = 1) {
  if (!enabled) return roundOne(value);
  const grid = Number(gridSize) > 0 ? Number(gridSize) : 1;
  return roundOne(Math.round(Number(value) / grid) * grid);
}

function snapLayerGeometry(geometry, enabled, gridSize = 1) {
  if (!enabled) return geometry;
  const width = clampLayerSize(snapPercent(geometry.width, true, gridSize), geometry.width);
  const height = clampLayerSize(snapPercent(geometry.height, true, gridSize), geometry.height);
  return {
    x: clampLayerCoordinate(snapPercent(geometry.x, true, gridSize), width),
    y: clampLayerCoordinate(snapPercent(geometry.y, true, gridSize), height),
    width,
    height,
  };
}

function getLayerGeometry(layer = {}) {
  const width = clampLayerSize(layer.width, 10);
  const height = clampLayerSize(layer.height, 10);
  return {
    x: clampLayerCoordinate(layer.x, width),
    y: clampLayerCoordinate(layer.y, height),
    width,
    height,
  };
}

function normalizeDesignLayer(layer = {}) {
  const defaults = DESIGN_LAYER_DEFAULTS[layer.type] || DESIGN_LAYER_DEFAULTS.text;
  const width = clampLayerSize(layer.width ?? defaults.width);
  const height = clampLayerSize(layer.height ?? defaults.height);
  return {
    ...defaults,
    ...layer,
    id: layer.id || createLayerId(),
    x: clampLayerCoordinate(layer.x ?? defaults.x, width),
    y: clampLayerCoordinate(layer.y ?? defaults.y, height),
    width,
    height,
    opacity: clampPercent(layer.opacity ?? defaults.opacity ?? 100, defaults.opacity ?? 100),
    visible: layer.visible !== false,
    locked: layer.locked === true,
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

function normalizePageBackground(source = {}) {
  const color = source.page_background_color || source.document_settings?.page_background_color || source.metadata?.page_background_color;
  return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : DEFAULT_LETTERHEAD_PAGE_BACKGROUND;
}

function imageLooksA4(assetInfo) {
  if (!assetInfo?.width || !assetInfo?.height) return null;
  const ratio = assetInfo.width / assetInfo.height;
  const a4Ratio = 210 / 297;
  return Math.abs(ratio - a4Ratio) < 0.04;
}

function getAssetRatioDescription(assetInfo) {
  if (!assetInfo?.width || !assetInfo?.height) return null;
  const ratio = assetInfo.width / assetInfo.height;
  if (imageLooksA4(assetInfo)) return "A4 staand";
  if (ratio > 1.05) return "Liggend of breed";
  if (ratio < 0.55) return "Smal staand";
  return "Afwijkende verhouding";
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

function uniqueStrings(values) {
  return [...new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))];
}

function clauseMarker(id) {
  return `{{${CLAUSE_MARKER_PREFIX}${id}}}`;
}

function extractClauseIds(body) {
  const matches = String(body || "").match(/\{\{\s*clausule:[^}]+\s*\}\}/g) || [];
  return uniqueStrings(matches.map(item => item.replace(/[{}]/g, "").trim().slice(CLAUSE_MARKER_PREFIX.length)));
}

function createClauseSectionId() {
  return `section_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeClauseSections(source = {}) {
  const rawSections = Array.isArray(source.sections) ? source.sections : [];
  const sections = rawSections
    .map(section => ({
      id: section.id || createClauseSectionId(),
      text: String(section.text || "").trim(),
    }))
    .filter(section => section.text);

  if (sections.length > 0) return sections;
  const fallbackBody = String(source.body || "").trim();
  const fallbackSource = fallbackBody.replace(/^Artikel\s+\d+\s*[-–—].*?\n+/i, "").trim();
  const fallbackSections = fallbackSource
    .split(/\n+\s*(?=(?:x|\d+)\.\d+\s+)/i)
    .map(text => text.replace(/^(?:x|\d+)\.\d+\s*/i, "").trim())
    .filter(Boolean);
  if (fallbackSections.length > 0 && /^(?:x|\d+)\.\d+\s+/i.test(fallbackSource)) {
    return fallbackSections.map(text => ({ id: createClauseSectionId(), text }));
  }
  return fallbackBody ? [{ id: createClauseSectionId(), text: fallbackSource || fallbackBody }] : [{ id: createClauseSectionId(), text: "" }];
}

function buildClauseBodyFromSections(sections = [], articleLabel = "x") {
  return normalizeClauseSections({ sections })
    .filter(section => section.text)
    .map((section, index) => `${articleLabel}.${index + 1} ${section.text}`)
    .join("\n\n");
}

function renumberArticleChunk(chunk = "", state) {
  return String(chunk || "").split(/(\r?\n)/).map(part => {
    if (/^\r?\n$/.test(part)) return part;
    let line = part;
    const headingMatch = line.match(/^(\s*)Artikel\s+(\d+)\b/i);
    if (headingMatch) {
      state.articleNumber += 1;
      state.currentOriginalArticle = headingMatch[2];
      state.currentRenderedArticle = state.articleNumber;
      line = line.replace(/^(\s*)Artikel\s+\d+\b/i, `$1Artikel ${state.currentRenderedArticle}`);
    }
    if (state.currentOriginalArticle && state.currentRenderedArticle) {
      line = line.replace(
        new RegExp(`^(\\s*)${state.currentOriginalArticle}\\.(\\d+)\\b`),
        `$1${state.currentRenderedArticle}.$2`,
      );
    }
    return line;
  }).join("");
}

function renderClauseWithArticleNumber(clause, articleNumber) {
  if (!clause) return "";
  const sections = normalizeClauseSections(clause).filter(section => section.text);
  const heading = `Artikel ${articleNumber} - ${clause.title || "Clausule"}`;
  if (sections.length === 0) return heading;
  return [heading, ...sections.map((section, index) => `${articleNumber}.${index + 1} ${section.text}`)].join("\n\n");
}

function expandClauseMarkers(body, clauses = []) {
  const clauseMap = new Map((clauses || []).map(clause => [clause.id, clause]));
  const source = String(body || "");
  const markerPattern = /\{\{\s*clausule:([^}]+)\s*\}\}/g;
  const state = { articleNumber: 0, currentOriginalArticle: null, currentRenderedArticle: null };
  let result = "";
  let cursor = 0;
  let match;

  while ((match = markerPattern.exec(source)) !== null) {
    result += renumberArticleChunk(source.slice(cursor, match.index), state);
    const id = String(match[1] || "").trim();
    const clause = clauseMap.get(id);
    if (clause) {
      state.articleNumber += 1;
      state.currentOriginalArticle = null;
      state.currentRenderedArticle = null;
      result += renderClauseWithArticleNumber(clause, state.articleNumber);
    } else {
      result += `[[Clausule niet gevonden: ${id}]]`;
    }
    cursor = markerPattern.lastIndex;
  }

  return result + renumberArticleChunk(source.slice(cursor), state);
}

function sortClauseIdsByConfiguredOrder(ids, clauses = []) {
  const order = new Map((clauses || []).map((clause, index) => [clause.id, Number(clause.sort_order ?? index)]));
  return uniqueStrings(ids).sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
}

function getContractModel(value) {
  return CONTRACT_MODEL_OPTIONS.find(option => option.value === value) || null;
}

function inferContractModelFromTemplate(record = {}) {
  if (record.metadata?.contract_model && getContractModel(record.metadata.contract_model)) {
    return record.metadata.contract_model;
  }
  return CONTRACT_MODEL_OPTIONS.find(option => {
    if (record.contract_form_scope && option.contract_form !== record.contract_form_scope) return false;
    if (record.employment_model_scope && option.employment_model !== record.employment_model_scope) return false;
    if (record.duration_type_scope && option.duration_type !== record.duration_type_scope) return false;
    if (record.metadata?.underlying_contract_form && option.underlying_contract_form !== record.metadata.underlying_contract_form) return false;
    return true;
  })?.value || "";
}

function contractModelMeta(option) {
  if (!option) return "";
  const parts = [
    CONTRACT_FORM_LABELS[option.contract_form] || option.contract_form,
    EMPLOYMENT_MODEL_LABELS[option.employment_model] || option.employment_model,
    option.duration_type === "indefinite" ? "Onbepaalde tijd" : "Bepaalde tijd",
  ];
  return uniqueStrings(parts).join(" · ");
}

function probationLabel(value) {
  return PROBATION_CHOICES.find(option => option.value === value)?.label || PROBATION_SCOPES.find(option => option.value === value)?.label || "-";
}

function getTemplateScopeLabel(item) {
  const modelLabel = CONTRACT_MODEL_LABELS[item.metadata?.contract_model];
  if (modelLabel) return modelLabel;
  const formLabel = CONTRACT_FORM_SCOPES.find(scope => scope.value === (item.contract_form_scope || "any"))?.label || "Alle contractvormen";
  const modelScopeLabel = EMPLOYMENT_MODEL_SCOPES.find(scope => scope.value === (item.employment_model_scope || "any"))?.label || "Alle urenmodellen";
  return `${formLabel} · ${modelScopeLabel}`;
}

function caoLabel(value) {
  if (!value) return "Geen CAO";
  return CAO_OPTION_LABELS[value] || value;
}

function clauseScopeLabel(value) {
  return CLAUSE_SCOPE_OPTIONS.find(option => option.value === value)?.label || "Nog geen onderdeel";
}

function clauseOptionsForScope(scope) {
  return CLAUSE_TYPE_CATALOG[scope] || [];
}

function clauseDefinition(scope, type) {
  return clauseOptionsForScope(scope).find(option => option.value === type) || null;
}

function clauseTypeLabel(scope, type) {
  return clauseDefinition(scope, type)?.label || "Nog geen clausule";
}

function inferClauseCatalog(record = {}) {
  if (record.scope && record.clause_type && clauseDefinition(record.scope, record.clause_type)) {
    return { scope: record.scope, type: record.clause_type };
  }

  const title = String(record.title || "").trim().toLowerCase();
  if (title) {
    for (const scopeOption of CLAUSE_SCOPE_OPTIONS) {
      const match = clauseOptionsForScope(scopeOption.value).find(option => {
        const label = option.label.toLowerCase();
        return title === label || title.includes(label) || label.includes(title);
      });
      if (match) return { scope: scopeOption.value, type: match.value };
    }
  }

  return {
    scope: record.scope || "",
    type: record.clause_type || "",
  };
}

function editableClauseSections(source = {}) {
  const rawSections = Array.isArray(source.sections) ? source.sections : [];
  const sections = rawSections.map(section => ({
    id: section.id || createClauseSectionId(),
    text: String(section.text || ""),
  }));
  if (sections.length > 0) return sections;
  return normalizeClauseSections(source);
}

function defaultClauseSections(definition) {
  const defaults = definition?.defaultSections || [""];
  return defaults.map(text => ({ id: createClauseSectionId(), text }));
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

function getDesignLayerStyle(layer) {
  const geometry = getLayerGeometry(layer);
  return {
    left: `${geometry.x}%`,
    top: `${geometry.y}%`,
    width: `${geometry.width}%`,
    height: `${geometry.height}%`,
    opacity: (layer.opacity ?? 100) / 100,
  };
}

function renderDesignLayerContent(layer) {
  if (layer.type === "rectangle") {
    return (
      <div
        className="h-full w-full"
        style={{
          backgroundColor: layer.background_color || "#1d4ed8",
          border: `${layer.border_width || 0}px solid ${layer.border_color || layer.background_color || "#1d4ed8"}`,
        }}
      />
    );
  }

  if (layer.type === "line") {
    return (
      <div
        className="h-full w-full"
        style={{ backgroundColor: layer.background_color || "#1d4ed8" }}
      />
    );
  }

  if (layer.type === "image") {
    return layer.src ? (
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
    );
  }

  return (
    <div
      className="h-full w-full overflow-hidden whitespace-pre-wrap leading-tight"
      style={{
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

function renderDesignLayer(layer) {
  if (layer.visible === false) return null;
  const style = {
    ...getDesignLayerStyle(layer),
    height: layer.type === "line" ? `${Math.max(1, Number(layer.height) || 1)}%` : `${getLayerGeometry(layer).height}%`,
  };

  return (
    <div key={layer.id} className="absolute overflow-hidden" style={style}>
      {renderDesignLayerContent(layer)}
    </div>
  );
}

const DESIGN_LAYER_RESIZE_HANDLES = [
  { key: "nw", className: "left-0 top-0 cursor-nwse-resize border-l-2 border-t-2" },
  { key: "ne", className: "right-0 top-0 cursor-nesw-resize border-r-2 border-t-2" },
  { key: "sw", className: "bottom-0 left-0 cursor-nesw-resize border-b-2 border-l-2" },
  { key: "se", className: "bottom-0 right-0 cursor-nwse-resize border-b-2 border-r-2" },
];

function resizeLayerGeometry(start, deltaX, deltaY, handle) {
  const minSize = 2;
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (handle.includes("e")) right = Math.min(100, Math.max(left + minSize, right + deltaX));
  if (handle.includes("s")) bottom = Math.min(100, Math.max(top + minSize, bottom + deltaY));
  if (handle.includes("w")) left = Math.max(0, Math.min(right - minSize, left + deltaX));
  if (handle.includes("n")) top = Math.max(0, Math.min(bottom - minSize, top + deltaY));

  return {
    x: roundOne(left),
    y: roundOne(top),
    width: roundOne(right - left),
    height: roundOne(bottom - top),
  };
}

function LetterheadPdfPagePreview({ source, filename }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    let pdfDocument = null;

    async function renderPdfPage() {
      if (!source) return;
      setStatus("loading");
      try {
        const pdfjs = await loadPdfRenderer();
        if (!pdfjs || cancelled) return;

        const loadingTask = pdfjs.getDocument({ url: source });
        pdfDocument = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdfDocument.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        const container = containerRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !container || !context) throw new Error("Canvas niet beschikbaar");

        const baseViewport = page.getViewport({ scale: 1 });
        const rect = container.getBoundingClientRect();
        const targetWidth = rect.width || 420;
        const targetHeight = rect.height || 594;
        const deviceScale = window.devicePixelRatio || 1;
        const cssScale = Math.min(targetWidth / baseViewport.width, targetHeight / baseViewport.height);
        const viewport = page.getViewport({ scale: Math.max(cssScale, 0.1) * deviceScale });

        renderTaskRef.current?.cancel?.();
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${Math.max(1, Math.floor(viewport.width / deviceScale))}px`;
        canvas.style.height = `${Math.max(1, Math.floor(viewport.height / deviceScale))}px`;
        context.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (!cancelled && error?.name !== "RenderingCancelledException") setStatus("error");
      }
    }

    renderPdfPage();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
      pdfDocument?.destroy?.();
    };
  }, [source]);

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        aria-label={filename || "PDF-briefpapier"}
        className={status === "ready" ? "block max-h-full max-w-full" : "hidden"}
      />
      {status === "loading" && (
        <div className="px-4 text-center text-[8px] font-medium text-slate-500">
          PDF-preview laden...
        </div>
      )}
      {status === "error" && (
        <div className="px-4 text-center text-[8px] font-medium text-slate-500">
          PDF-preview kan niet worden geladen.
        </div>
      )}
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
  pageBackgroundColor = DEFAULT_LETTERHEAD_PAGE_BACKGROUND,
  designLayers = [],
  assetInfo = null,
  interactive = false,
  selectedLayerId = null,
  onSelectLayer,
  onUpdateLayer,
  onChangeMargins,
  allowMarginDrag = false,
  showGrid = false,
  snapToGrid = false,
  gridSize = 1,
}) {
  const pageRef = useRef(null);
  const updateLayerRef = useRef(onUpdateLayer);
  const changeMarginsRef = useRef(onChangeMargins);
  const [interaction, setInteraction] = useState(null);
  const [marginInteraction, setMarginInteraction] = useState(null);
  const top = (margins.top / 297) * 100;
  const right = (margins.right / 210) * 100;
  const bottom = (margins.bottom / 297) * 100;
  const left = (margins.left / 210) * 100;
  const isPdf = fileLooksLikePdf(source, filename, fileType);
  const isImage = fileLooksLikeImage(source, filename, fileType);
  const hasSource = Boolean(source);
  const looksA4 = imageLooksA4(assetInfo);
  const objectFit = backgroundFit === "stretch" ? "fill" : backgroundFit;
  const canEditLayers = interactive && sourceMode === LETTERHEAD_SOURCE_MODES.design;
  const ratioDescription = getAssetRatioDescription(assetInfo);
  const visualGridSize = Math.max(0.5, Number(gridSize) || 1);

  useEffect(() => {
    updateLayerRef.current = onUpdateLayer;
  }, [onUpdateLayer]);

  useEffect(() => {
    changeMarginsRef.current = onChangeMargins;
  }, [onChangeMargins]);

  useEffect(() => {
    if (!marginInteraction) return undefined;

    const handlePointerMove = (event) => {
      if (!marginInteraction.pageWidth || !marginInteraction.pageHeight) return;
      const localX = Math.min(Math.max(event.clientX - marginInteraction.pageLeft, 0), marginInteraction.pageWidth);
      const localY = Math.min(Math.max(event.clientY - marginInteraction.pageTop, 0), marginInteraction.pageHeight);
      const horizontalMm = (localX / marginInteraction.pageWidth) * 210;
      const verticalMm = (localY / marginInteraction.pageHeight) * 297;
      let value = 0;
      if (marginInteraction.edge === "left") value = horizontalMm;
      if (marginInteraction.edge === "right") value = 210 - horizontalMm;
      if (marginInteraction.edge === "top") value = verticalMm;
      if (marginInteraction.edge === "bottom") value = 297 - verticalMm;
      changeMarginsRef.current?.({
        ...marginInteraction.startMargins,
        [marginInteraction.edge]: clampDraggedLetterheadMargin(marginInteraction.edge, value, marginInteraction.startMargins),
      });
    };

    const stopInteraction = () => setMarginInteraction(null);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopInteraction, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopInteraction);
    };
  }, [marginInteraction]);

  useEffect(() => {
    if (!interaction) return undefined;

    const handlePointerMove = (event) => {
      const deltaX = ((event.clientX - interaction.startClientX) / interaction.pageWidth) * 100;
      const deltaY = ((event.clientY - interaction.startClientY) / interaction.pageHeight) * 100;
      if (interaction.mode === "move") {
        const nextGeometry = snapLayerGeometry({
          ...interaction.startGeometry,
          x: interaction.startGeometry.x + deltaX,
          y: interaction.startGeometry.y + deltaY,
        }, snapToGrid, gridSize);
        updateLayerRef.current?.(interaction.layerId, {
          x: nextGeometry.x,
          y: nextGeometry.y,
        });
        return;
      }
      updateLayerRef.current?.(
        interaction.layerId,
        snapLayerGeometry(resizeLayerGeometry(interaction.startGeometry, deltaX, deltaY, interaction.handle), snapToGrid, gridSize)
      );
    };

    const stopInteraction = () => setInteraction(null);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopInteraction, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopInteraction);
    };
  }, [interaction, snapToGrid, gridSize]);

  const startLayerInteraction = (event, layer, mode, handle = null) => {
    if (!canEditLayers || layer.locked || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectLayer?.(layer.id);
    pageRef.current.focus({ preventScroll: true });
    setInteraction({
      layerId: layer.id,
      mode,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      pageWidth: rect.width,
      pageHeight: rect.height,
      startGeometry: getLayerGeometry(layer),
    });
  };

  const startMarginInteraction = (event, edge) => {
    if (!allowMarginDrag || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    event.preventDefault();
    event.stopPropagation();
    setMarginInteraction({
      edge,
      pageLeft: rect.left,
      pageTop: rect.top,
      pageWidth: rect.width,
      pageHeight: rect.height,
      startMargins: { ...margins },
    });
  };

  const handleCanvasKeyDown = (event) => {
    if (!canEditLayers || !selectedLayerId) return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const layer = designLayers.find(item => item.id === selectedLayerId);
    if (!layer || layer.locked || layer.visible === false) return;
    event.preventDefault();
    const amount = event.shiftKey ? 5 : (snapToGrid ? gridSize : 1);
    const geometry = getLayerGeometry(layer);
    const next = {
      ...geometry,
      x: geometry.x + (event.key === "ArrowRight" ? amount : event.key === "ArrowLeft" ? -amount : 0),
      y: geometry.y + (event.key === "ArrowDown" ? amount : event.key === "ArrowUp" ? -amount : 0),
    };
    const snapped = snapLayerGeometry(next, snapToGrid, gridSize);
    onUpdateLayer?.(layer.id, {
      x: clampLayerCoordinate(snapped.x, snapped.width),
      y: clampLayerCoordinate(snapped.y, snapped.height),
    });
  };

  const renderInteractiveLayer = (layer) => {
    if (layer.visible === false) return null;
    const selected = selectedLayerId === layer.id;
    const style = {
      ...getDesignLayerStyle(layer),
      height: layer.type === "line" ? `${Math.max(1, Number(layer.height) || 1)}%` : `${getLayerGeometry(layer).height}%`,
    };
    return (
      <div
        key={layer.id}
        className={`absolute overflow-visible ${selected ? "z-20" : "z-10"} ${layer.locked ? "cursor-default" : "cursor-move"} outline-none`}
        style={style}
        onPointerDown={event => {
          event.stopPropagation();
          onSelectLayer?.(layer.id);
          pageRef.current?.focus({ preventScroll: true });
          if (!layer.locked) startLayerInteraction(event, layer, "move");
        }}
      >
        <div className="h-full w-full overflow-hidden">
          {renderDesignLayerContent(layer)}
        </div>
        {selected && (
          <>
            <div className={`pointer-events-none absolute inset-0 border ${layer.locked ? "border-amber-500/90 ring-2 ring-amber-500/20" : "border-primary/90 ring-2 ring-primary/20"}`} />
            {!layer.locked && DESIGN_LAYER_RESIZE_HANDLES.map(handle => (
              <button
                key={handle.key}
                type="button"
                aria-label={`Laag ${handle.key} vergroten`}
                className={`absolute h-4 w-4 border-primary bg-transparent ${handle.className}`}
                onPointerDown={event => startLayerInteraction(event, layer, "resize", handle.key)}
              />
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">A4-preview met tekstmarges</span>
        <span>210 x 297 mm</span>
      </div>
      <div className="relative mx-auto w-full max-w-[720px] px-24 py-10 sm:px-28">
        <span className="absolute left-1/2 top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium text-sky-700 dark:text-sky-200">
          Boven {margins.top} mm
        </span>
        <span className="absolute right-2 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium text-sky-700 dark:text-sky-200">
          Rechts {margins.right} mm
        </span>
        <span className="absolute bottom-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium text-sky-700 dark:text-sky-200">
          Onder {margins.bottom} mm
        </span>
        <span className="absolute left-2 top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium text-sky-700 dark:text-sky-200">
          Links {margins.left} mm
        </span>
        <div className="mx-auto w-full max-w-[430px] rounded-xl bg-slate-950/5 p-3 dark:bg-black/25">
          <div
            ref={pageRef}
            className="relative mx-auto aspect-[210/297] overflow-hidden rounded-[2px] shadow-[0_18px_46px_rgba(15,23,42,0.18)] ring-1 ring-slate-950/15 dark:ring-white/15"
            style={{ backgroundColor: pageBackgroundColor }}
            tabIndex={canEditLayers ? 0 : undefined}
            onKeyDown={handleCanvasKeyDown}
            onPointerDown={event => {
              if (canEditLayers && event.target === event.currentTarget) {
                onSelectLayer?.(null);
                pageRef.current?.focus({ preventScroll: true });
              }
            }}
          >
            {sourceMode === LETTERHEAD_SOURCE_MODES.upload && hasSource && isImage && (
              <img
                src={source}
                alt={filename || "Briefpapier"}
                className="absolute inset-0 h-full w-full"
                style={{ objectFit }}
              />
            )}
            {sourceMode === LETTERHEAD_SOURCE_MODES.upload && hasSource && isPdf && (
              <LetterheadPdfPagePreview source={source} filename={filename} />
            )}
            {hasSource && !isImage && !isPdf && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                {filename || "Bestand geselecteerd"}
              </div>
            )}
            {sourceMode === LETTERHEAD_SOURCE_MODES.design && showGrid && (
              <div
                className="pointer-events-none absolute inset-0 z-[6] opacity-35"
                style={{
                  backgroundImage: "linear-gradient(to right, rgba(59,130,246,0.32) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,0.24) 1px, transparent 1px)",
                  backgroundSize: `${visualGridSize}% ${visualGridSize}%`,
                }}
              />
            )}
            {sourceMode === LETTERHEAD_SOURCE_MODES.design && (canEditLayers ? designLayers.map(renderInteractiveLayer) : designLayers.map(renderDesignLayer))}
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
              className={`absolute z-[2] rounded-[2px] border ${
                mode === "sample" || allowMarginDrag
                  ? "border-sky-500/40 bg-white/82 shadow-sm backdrop-blur-[1px] dark:bg-slate-950/78"
                  : "border-dashed border-sky-500/85 bg-sky-500/5"
              }`}
              style={{
                top: `${top}%`,
                right: `${right}%`,
                bottom: `${bottom}%`,
                left: `${left}%`,
              }}
            >
              {allowMarginDrag && (
                <>
                  <button
                    type="button"
                    aria-label="Bovenmarge slepen"
                    className="absolute -top-2 left-1/2 h-4 w-16 -translate-x-1/2 cursor-ns-resize rounded-full border border-sky-500 bg-sky-500/90 shadow-sm"
                    onPointerDown={event => startMarginInteraction(event, "top")}
                  />
                  <button
                    type="button"
                    aria-label="Ondermarge slepen"
                    className="absolute -bottom-2 left-1/2 h-4 w-16 -translate-x-1/2 cursor-ns-resize rounded-full border border-sky-500 bg-sky-500/90 shadow-sm"
                    onPointerDown={event => startMarginInteraction(event, "bottom")}
                  />
                  <button
                    type="button"
                    aria-label="Linkermarge slepen"
                    className="absolute -left-2 top-1/2 h-16 w-4 -translate-y-1/2 cursor-ew-resize rounded-full border border-sky-500 bg-sky-500/90 shadow-sm"
                    onPointerDown={event => startMarginInteraction(event, "left")}
                  />
                  <button
                    type="button"
                    aria-label="Rechtermarge slepen"
                    className="absolute -right-2 top-1/2 h-16 w-4 -translate-y-1/2 cursor-ew-resize rounded-full border border-sky-500 bg-sky-500/90 shadow-sm"
                    onPointerDown={event => startMarginInteraction(event, "right")}
                  />
                </>
              )}
              {mode === "sample" || allowMarginDrag ? (
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
                <div className="flex h-full items-center justify-center px-3 text-center">
                  <span className="rounded bg-background/85 px-2 py-1 text-[10px] font-medium text-sky-700 shadow-sm dark:bg-slate-950/85 dark:text-sky-300">
                    Tekstgebied
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {sourceMode === LETTERHEAD_SOURCE_MODES.upload && looksA4 === false && (
        <p className="mx-auto mt-2 max-w-[320px] text-center text-xs text-amber-600 dark:text-amber-300">
          De upload is {ratioDescription?.toLowerCase() || "geen A4-verhouding"}. Met Passend blijft alles zichtbaar; Vullend kan randen afsnijden.
        </p>
      )}
    </div>
  );
}

function LayerIcon({ type }) {
  if (type === "rectangle") return <Square className="h-3.5 w-3.5" />;
  if (type === "line") return <Minus className="h-3.5 w-3.5" />;
  if (type === "image") return <ImageIcon className="h-3.5 w-3.5" />;
  return <Type className="h-3.5 w-3.5" />;
}

function TemplateDocumentPreview({ body, templateName, letterhead, clauses }) {
  const margins = normalizeLetterheadMargins(letterhead || {});
  const sourceMode = letterhead ? normalizeSourceMode(letterhead) : LETTERHEAD_SOURCE_MODES.design;
  const backgroundFit = letterhead ? normalizeBackgroundFit(letterhead) : DEFAULT_LETTERHEAD_BACKGROUND_FIT;
  const pageBackgroundColor = letterhead ? normalizePageBackground(letterhead) : DEFAULT_LETTERHEAD_PAGE_BACKGROUND;
  const designLayers = letterhead ? normalizeDesignLayers(letterhead) : [];
  const source = letterhead?.file_url || "";
  const filename = letterhead?.download_filename || "";
  const top = (margins.top / 297) * 100;
  const right = (margins.right / 210) * 100;
  const bottom = (margins.bottom / 297) * 100;
  const left = (margins.left / 210) * 100;
  const objectFit = backgroundFit === "stretch" ? "fill" : backgroundFit;
  const isPdf = sourceMode === LETTERHEAD_SOURCE_MODES.upload && fileLooksLikePdf(source, filename);
  const isImage = sourceMode === LETTERHEAD_SOURCE_MODES.upload && fileLooksLikeImage(source, filename);
  const previewBody = expandClauseMarkers(body, clauses);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">PDF-preview</span>
        <span>{letterhead?.name || "Zonder briefpapier"}</span>
      </div>
      <div className="mx-auto w-full max-w-[420px] rounded-xl bg-slate-950/5 p-3 dark:bg-black/25">
        <div
          className="relative mx-auto aspect-[210/297] overflow-hidden rounded-[2px] shadow-[0_18px_46px_rgba(15,23,42,0.18)] ring-1 ring-slate-950/15 dark:ring-white/15"
          style={{ backgroundColor: pageBackgroundColor }}
        >
          {sourceMode === LETTERHEAD_SOURCE_MODES.upload && source && isImage && (
            <img src={source} alt={filename || "Briefpapier"} className="absolute inset-0 h-full w-full" style={{ objectFit }} />
          )}
          {sourceMode === LETTERHEAD_SOURCE_MODES.upload && source && isPdf && (
            <LetterheadPdfPagePreview source={source} filename={filename} />
          )}
          {sourceMode === LETTERHEAD_SOURCE_MODES.design && designLayers.map(renderDesignLayer)}
          <div
            className="absolute z-20 overflow-hidden bg-white/78 p-[4.5%] text-[7px] leading-snug text-slate-900 backdrop-blur-[0.5px] sm:text-[8px]"
            style={{
              top: `${top}%`,
              right: `${right}%`,
              bottom: `${bottom}%`,
              left: `${left}%`,
            }}
          >
            <p className="mb-2 text-[10px] font-bold leading-tight text-slate-950">{templateName || "Arbeidsovereenkomst"}</p>
            <div className="whitespace-pre-wrap">{previewBody || "Vul links de template-inhoud in."}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function initialTemplate(companyId) {
  return {
    company_id: companyId,
    name: "",
    description: "",
    template_type: "employment_contract",
    contract_model: "",
    contract_form_scope: "",
    employment_model_scope: "",
    probation_scope: "",
    duration_type_scope: "",
    duration_options_text: "",
    visible_in_contract_wizard: true,
    cao_key: "",
    function_type: "",
    default_letterhead_id: "none",
    version: 1,
    status: "draft",
    body: DEFAULT_TEMPLATE_BODY,
  };
}

function templateFormFromRecord(companyId, record) {
  return {
    company_id: companyId,
    name: record.name || "",
    description: record.description || "",
    template_type: record.template_type || "employment_contract",
    contract_model: inferContractModelFromTemplate(record),
    contract_form_scope: record.contract_form_scope || "any",
    employment_model_scope: record.employment_model_scope || "any",
    probation_scope: record.probation_scope || "any",
    duration_type_scope: record.duration_type_scope || "any",
    duration_options_text: toArrayText(record.duration_options),
    visible_in_contract_wizard: record.visible_in_contract_wizard !== false,
    cao_key: record.cao_key || "",
    function_type: record.function_type || "",
    default_letterhead_id: record.default_letterhead_id || "none",
    version: record.version || 1,
    status: record.status || "draft",
    body: record.body || DEFAULT_TEMPLATE_BODY,
  };
}

function initialClause(companyId, sortOrder = 0) {
  return {
    company_id: companyId,
    scope: "",
    clause_type: "",
    title: "",
    sections: [{ id: createClauseSectionId(), text: "" }],
    body: "",
    sort_order: sortOrder,
    status: "active",
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
    page_background_color: DEFAULT_LETTERHEAD_PAGE_BACKGROUND,
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
    page_background_color: DEFAULT_LETTERHEAD_PAGE_BACKGROUND,
    design_layers: [],
    document_settings: {
      source_mode: LETTERHEAD_SOURCE_MODES.upload,
      background_fit: DEFAULT_LETTERHEAD_BACKGROUND_FIT,
      page_background_color: DEFAULT_LETTERHEAD_PAGE_BACKGROUND,
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
  const templateBodyRef = useRef(null);
  const [letterheadForm, setLetterheadForm] = useState(() => initialLetterhead(companyId));
  const [templateForm, setTemplateForm] = useState(() => initialTemplate(companyId));
  const [clauseForm, setClauseForm] = useState(() => initialClause(companyId));
  const [editingLetterheadId, setEditingLetterheadId] = useState(null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [editingClauseId, setEditingClauseId] = useState(null);
  const [letterheadWizardOpen, setLetterheadWizardOpen] = useState(false);
  const [templateWizardOpen, setTemplateWizardOpen] = useState(false);
  const [clauseWizardOpen, setClauseWizardOpen] = useState(false);
  const [letterheadStep, setLetterheadStep] = useState(1);
  const [templateStep, setTemplateStep] = useState(1);
  const [clauseStep, setClauseStep] = useState(1);
  const [previewFile, setPreviewFile] = useState(null);
  const [message, setMessage] = useState(null);
  const [letterheadPreviewUrl, setLetterheadPreviewUrl] = useState("");
  const [letterheadAssetInfo, setLetterheadAssetInfo] = useState(null);
  const [selectedLetterheadLayerId, setSelectedLetterheadLayerId] = useState(null);
  const [selectedClauseSectionIndex, setSelectedClauseSectionIndex] = useState(0);
  const [letterheadEditorOptions, setLetterheadEditorOptions] = useState(DEFAULT_LETTERHEAD_EDITOR_OPTIONS);
  const [clausesReordering, setClausesReordering] = useState(false);

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

  const { data: clauses = [] } = useQuery({
    queryKey: ["company-contract-clauses", companyId],
    queryFn: () => base44.entities.CompanyContractClause.filter({ company_id: companyId }, "sort_order"),
    enabled: !!companyId,
  });

  const { data: caoAssignments = [] } = useQuery({
    queryKey: ["cao-assignments", companyId],
    queryFn: () => base44.entities.CompanyCaoAssignment.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const allLetterheads = useMemo(() => {
    const legacy = letterheads.length === 0 ? legacyLetterhead(company) : null;
    return [legacy, ...letterheads].filter(Boolean);
  }, [company, letterheads]);

  const activeLetterheads = allLetterheads.filter(item => item.status !== "archived");
  const activeClauses = useMemo(() => [...clauses]
    .filter(item => item.status !== "archived")
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.title || "").localeCompare(String(b.title || ""))),
  [clauses]);
  const currentClauseDefinition = useMemo(
    () => clauseDefinition(clauseForm.scope, clauseForm.clause_type),
    [clauseForm.scope, clauseForm.clause_type],
  );
  const clauseSections = useMemo(() => editableClauseSections(clauseForm), [clauseForm]);
  const clausePreviewBody = useMemo(() => buildClauseBodyFromSections(clauseSections), [clauseSections]);
  const templateClauseIds = useMemo(() => extractClauseIds(templateForm.body), [templateForm.body]);
  const selectedTemplateLetterhead = activeLetterheads.find(item => item.id === templateForm.default_letterhead_id) || null;
  const selectedContractModel = getContractModel(templateForm.contract_model);
  const companyCaoOptions = useMemo(() => uniqueStrings(caoAssignments.map(item => item.cao_key))
    .map(key => ({ value: key, label: caoLabel(key) })),
  [caoAssignments]);
  const placeholders = extractPlaceholders(expandClauseMarkers(templateForm.body, activeClauses))
    .filter(placeholder => !placeholder.startsWith(CLAUSE_MARKER_PREFIX));
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
  const letterheadPageBackground = normalizePageBackground(letterheadForm);
  const letterheadDesignLayers = normalizeDesignLayers(letterheadForm);
  const letterheadUsesUpload = letterheadSourceMode === LETTERHEAD_SOURCE_MODES.upload;
  const companyDisplayName = company?.trade_name || company?.name || company?.company_name || company?.legal_name || "Bedrijfsnaam";
  const letterheadPreviewIsPdf = letterheadUsesUpload && fileLooksLikePdf(letterheadPreviewSource, letterheadPreviewFilename, letterheadPreviewType);
  const letterheadPreviewIsImage = letterheadUsesUpload && fileLooksLikeImage(letterheadPreviewSource, letterheadPreviewFilename, letterheadPreviewType);
  const letterheadImageLooksA4 = letterheadPreviewIsImage && letterheadAssetInfo ? imageLooksA4(letterheadAssetInfo) : null;
  const showUploadFitOptions = letterheadPreviewIsImage && letterheadImageLooksA4 === false;

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

  useEffect(() => {
    if (!letterheadWizardOpen || letterheadSourceMode !== LETTERHEAD_SOURCE_MODES.design) {
      if (selectedLetterheadLayerId) setSelectedLetterheadLayerId(null);
      return;
    }
    if (selectedLetterheadLayerId && !letterheadDesignLayers.some(layer => layer.id === selectedLetterheadLayerId)) {
      setSelectedLetterheadLayerId(null);
    }
  }, [letterheadWizardOpen, letterheadSourceMode, letterheadDesignLayers, selectedLetterheadLayerId]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["company-letterheads", companyId] });
    queryClient.invalidateQueries({ queryKey: ["company-contract-templates", companyId] });
    queryClient.invalidateQueries({ queryKey: ["company-contract-clauses", companyId] });
    queryClient.invalidateQueries({ queryKey: ["company-letterheads"] });
    queryClient.invalidateQueries({ queryKey: ["company-contract-templates"] });
    queryClient.invalidateQueries({ queryKey: ["company-contract-clauses"] });
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
      const pageBackgroundColor = normalizePageBackground(letterheadForm);
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
          page_background_color: pageBackgroundColor,
          margins_mm: margins,
          design_layers: storedDesignLayers,
        },
        metadata: {
          ...auditMetadata,
          source_mode: sourceMode,
          background_fit: backgroundFit,
          page_background_color: pageBackgroundColor,
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
      if (!templateForm.cao_key) throw new Error("Kies eerst de CAO die voor dit bedrijf geldt.");
      const contractModel = getContractModel(templateForm.contract_model);
      if (!contractModel) throw new Error("Kies eerst een specifieke contractvorm.");
      if (!templateForm.probation_scope) throw new Error("Kies eerst of proeftijd van toepassing is.");
      if (!templateForm.body.trim()) throw new Error("Vul de template-inhoud in.");
      const previous = editingTemplateId ? templates.find(item => item.id === editingTemplateId) || {} : {};
      const status = statusOverride || templateForm.status || "draft";
      const createNewVersion = editingTemplateId && previous.status === "published";
      const clauseIds = sortClauseIdsByConfiguredOrder(extractClauseIds(templateForm.body), clauses);
      const auditMetadata = buildAuditMetadata(
        currentUser,
        createNewVersion ? "nieuwe versie" : (editingTemplateId ? "gewijzigd" : "toegevoegd"),
        createNewVersion ? {} : (previous.metadata || {}),
        auditActors
      );
      const payload = {
        company_id: companyId,
        name: templateForm.name.trim(),
        description: templateForm.description || null,
        template_type: templateForm.template_type || "employment_contract",
        contract_form_scope: contractModel.contract_form,
        employment_model_scope: contractModel.employment_model,
        probation_scope: templateForm.probation_scope,
        duration_type_scope: contractModel.duration_type,
        duration_options: fromArrayText(templateForm.duration_options_text),
        visible_in_contract_wizard: templateForm.visible_in_contract_wizard !== false,
        cao_key: templateForm.cao_key || null,
        function_type: templateForm.function_type || null,
        default_letterhead_id: templateForm.default_letterhead_id === "none" ? null : templateForm.default_letterhead_id,
        version: createNewVersion ? Number(previous.version || 1) + 1 : Number(templateForm.version || 1),
        status,
        body: templateForm.body,
        clause_ids: clauseIds,
        placeholders,
        metadata: {
          ...auditMetadata,
          contract_model: contractModel.value,
          underlying_contract_form: contractModel.underlying_contract_form || null,
        },
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

  const saveClauseMutation = useMutation({
    mutationFn: async () => {
      if (!clauseForm.scope) throw new Error("Kies eerst voor welk onderdeel deze clausule bedoeld is.");
      if (!clauseForm.clause_type) throw new Error("Kies eerst welk type clausule je wilt maken.");
      if (!clauseForm.title.trim()) throw new Error("Vul een titel voor de clausule in.");
      const sections = normalizeClauseSections(clauseForm).filter(section => section.text);
      if (sections.length === 0) throw new Error("Voeg minimaal één clausule-onderdeel toe.");
      const body = buildClauseBodyFromSections(sections);
      const previous = editingClauseId ? clauses.find(item => item.id === editingClauseId) || {} : {};
      const payload = {
        company_id: companyId,
        scope: clauseForm.scope,
        clause_type: clauseForm.clause_type,
        title: clauseForm.title.trim(),
        sections,
        body,
        sort_order: Number.isFinite(Number(clauseForm.sort_order)) ? Number(clauseForm.sort_order) : activeClauses.length,
        status: "active",
        placeholders: extractPlaceholders(body),
        metadata: {
          ...buildAuditMetadata(currentUser, editingClauseId ? "gewijzigd" : "toegevoegd", previous.metadata || {}, auditActors),
          scope_label: clauseScopeLabel(clauseForm.scope),
          clause_type_label: clauseTypeLabel(clauseForm.scope, clauseForm.clause_type),
        },
      };
      return editingClauseId
        ? base44.entities.CompanyContractClause.update(editingClauseId, payload)
        : base44.entities.CompanyContractClause.create(payload);
    },
    onSuccess: () => {
      setClauseForm(initialClause(companyId));
      setEditingClauseId(null);
      setClauseWizardOpen(false);
      setClauseStep(1);
      setSelectedClauseSectionIndex(0);
      setMessage({ type: "success", text: "Clausule opgeslagen." });
      refresh();
    },
    onError: error => setMessage({ type: "error", text: error?.message || "Clausule kon niet worden opgeslagen." }),
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

  const archiveClause = async (record) => {
    await base44.entities.CompanyContractClause.update(record.id, {
      status: "archived",
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", record.metadata || {}, auditActors),
    });
    refresh();
  };

  const startNewLetterhead = () => {
    setMessage(null);
    setEditingLetterheadId(null);
    setLetterheadForm(initialLetterhead(companyId));
    setLetterheadEditorOptions(DEFAULT_LETTERHEAD_EDITOR_OPTIONS);
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
      page_background_color: normalizePageBackground(record),
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
    setLetterheadEditorOptions(DEFAULT_LETTERHEAD_EDITOR_OPTIONS);
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
    const defaultLetterhead = activeLetterheads.find(item => item.is_default) || activeLetterheads[0];
    setTemplateForm({
      ...initialTemplate(companyId),
      default_letterhead_id: defaultLetterhead?.id || "none",
    });
    setTemplateStep(1);
    setTemplateWizardOpen(true);
  };

  const startEditTemplate = (record) => {
    setMessage(null);
    setEditingTemplateId(record.id);
    setTemplateForm(templateFormFromRecord(companyId, record));
    setTemplateStep(1);
    setTemplateWizardOpen(true);
  };

  const createNewTemplateVersion = (record) => {
    setMessage(null);
    setEditingTemplateId(null);
    setTemplateForm({
      ...templateFormFromRecord(companyId, record),
      version: Number(record.version || 1) + 1,
      status: "draft",
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
    if (templateStep === 1) {
      if (!templateForm.name.trim()) {
        setMessage({ type: "error", text: "Vul eerst een naam voor de template in." });
        return;
      }
      if (!templateForm.cao_key) {
        setMessage({ type: "error", text: "Kies eerst de CAO die voor dit bedrijf geldt." });
        return;
      }
    }
    if (templateStep === 2 && !getContractModel(templateForm.contract_model)) {
      setMessage({ type: "error", text: "Kies eerst een specifieke contractvorm." });
      return;
    }
    if (templateStep === 3 && !templateForm.probation_scope) {
      setMessage({ type: "error", text: "Kies eerst of proeftijd van toepassing is." });
      return;
    }
    if (templateStep === 5 && !templateForm.body.trim()) {
      setMessage({ type: "error", text: "Vul eerst de template-inhoud in." });
      return;
    }
    setMessage(null);
    setTemplateStep(step => Math.min(step + 1, TEMPLATE_STEPS.length));
  };

  const syncClauseSections = (updater) => {
    setClauseForm(prev => {
      const currentSections = editableClauseSections(prev);
      const nextSections = typeof updater === "function" ? updater(currentSections) : updater;
      const normalized = nextSections.length > 0 ? nextSections : [{ id: createClauseSectionId(), text: "" }];
      return {
        ...prev,
        sections: normalized,
        body: buildClauseBodyFromSections(normalized),
      };
    });
  };

  const selectClauseScope = (scope) => {
    setClauseForm(prev => ({
      ...prev,
      scope,
      clause_type: "",
      title: "",
      sections: [{ id: createClauseSectionId(), text: "" }],
      body: "",
    }));
    setSelectedClauseSectionIndex(0);
    setMessage(null);
    setClauseStep(2);
  };

  const selectClauseType = (type) => {
    const definition = clauseDefinition(clauseForm.scope, type);
    const sections = defaultClauseSections(definition);
    setClauseForm(prev => ({
      ...prev,
      clause_type: type,
      title: definition?.label || prev.title || "",
      sections,
      body: buildClauseBodyFromSections(sections),
    }));
    setSelectedClauseSectionIndex(0);
    setMessage(null);
    setClauseStep(3);
  };

  const nextClauseStep = () => {
    if (clauseStep === 1 && !clauseForm.scope) {
      setMessage({ type: "error", text: "Kies eerst het onderdeel waarvoor deze clausule bedoeld is." });
      return;
    }
    if (clauseStep === 2 && !clauseForm.clause_type) {
      setMessage({ type: "error", text: "Kies eerst het type clausule." });
      return;
    }
    if (clauseStep === 3) {
      if (!clauseForm.title.trim()) {
        setMessage({ type: "error", text: "Geef de clausule een duidelijke titel." });
        return;
      }
      if (normalizeClauseSections(clauseForm).filter(section => section.text).length === 0) {
        setMessage({ type: "error", text: "Voeg minimaal één onderdeel toe, bijvoorbeeld x.1." });
        return;
      }
    }
    setMessage(null);
    setClauseStep(step => Math.min(step + 1, CLAUSE_STEPS.length));
  };

  const updateClauseSection = (sectionId, text) => {
    syncClauseSections(sections => sections.map(section => (
      section.id === sectionId ? { ...section, text } : section
    )));
  };

  const addClauseSection = () => {
    syncClauseSections(sections => [...sections, { id: createClauseSectionId(), text: "" }]);
    setSelectedClauseSectionIndex(clauseSections.length);
  };

  const removeClauseSection = (sectionId) => {
    syncClauseSections(sections => {
      const nextSections = sections.filter(section => section.id !== sectionId);
      return nextSections.length > 0 ? nextSections : [{ id: createClauseSectionId(), text: "" }];
    });
    setSelectedClauseSectionIndex(index => Math.max(0, Math.min(index, clauseSections.length - 2)));
  };

  const moveClauseSection = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= clauseSections.length) return;
    syncClauseSections(sections => {
      const nextSections = Array.from(sections);
      const [moved] = nextSections.splice(index, 1);
      nextSections.splice(targetIndex, 0, moved);
      return nextSections;
    });
    setSelectedClauseSectionIndex(targetIndex);
  };

  const appendSnippetToSection = (snippet, targetIndex = selectedClauseSectionIndex) => {
    if (!snippet?.text) return;
    syncClauseSections(sections => {
      const safeIndex = Math.max(0, Math.min(targetIndex, sections.length - 1));
      return sections.map((section, index) => {
        if (index !== safeIndex) return section;
        const existing = String(section.text || "").trim();
        return {
          ...section,
          text: existing ? `${existing}\n\n${snippet.text}` : snippet.text,
        };
      });
    });
    setSelectedClauseSectionIndex(Math.max(0, Math.min(targetIndex, clauseSections.length - 1)));
  };

  const handleSnippetDragStart = (event, snippet) => {
    event.dataTransfer.setData("application/x-loq-clause-snippet", JSON.stringify(snippet));
    event.dataTransfer.setData("text/plain", snippet.text);
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleClauseSectionDrop = (event, sectionIndex) => {
    const rawSnippet = event.dataTransfer.getData("application/x-loq-clause-snippet");
    if (!rawSnippet) return;
    event.preventDefault();
    try {
      appendSnippetToSection(JSON.parse(rawSnippet), sectionIndex);
    } catch {
      appendSnippetToSection({ text: rawSnippet }, sectionIndex);
    }
  };

  const startNewClause = () => {
    const lastOrder = activeClauses.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0);
    setMessage(null);
    setEditingClauseId(null);
    setClauseForm(initialClause(companyId, lastOrder + 10));
    setClauseStep(1);
    setSelectedClauseSectionIndex(0);
    setClauseWizardOpen(true);
  };

  const startEditClause = (record) => {
    setMessage(null);
    setEditingClauseId(record.id);
    const inferred = inferClauseCatalog(record);
    setClauseForm({
      company_id: companyId,
      scope: inferred.scope,
      clause_type: inferred.type,
      title: record.title || "",
      sections: editableClauseSections(record),
      body: record.body || "",
      sort_order: Number(record.sort_order || 0),
      status: record.status || "active",
    });
    setClauseStep(inferred.scope && inferred.type ? 3 : 1);
    setSelectedClauseSectionIndex(0);
    setClauseWizardOpen(true);
  };

  const cancelClauseWizard = () => {
    setClauseForm(initialClause(companyId));
    setEditingClauseId(null);
    setClauseStep(1);
    setSelectedClauseSectionIndex(0);
    setClauseWizardOpen(false);
  };

  const insertClauseInTemplate = (clause) => {
    if (!clause?.id) return;
    if (templateClauseIds.includes(clause.id)) {
      setMessage({ type: "error", text: "Deze clausule staat al in de template." });
      return;
    }
    const marker = clauseMarker(clause.id);
    const textarea = templateBodyRef.current;
    setTemplateForm(prev => {
      const body = prev.body || "";
      const start = textarea?.selectionStart ?? body.length;
      const end = textarea?.selectionEnd ?? start;
      const prefix = body.slice(0, start);
      const suffix = body.slice(end);
      const before = prefix && !prefix.endsWith("\n") ? "\n\n" : "";
      const after = suffix && !suffix.startsWith("\n") ? "\n\n" : "";
      return { ...prev, body: `${prefix}${before}${marker}${after}${suffix}` };
    });
    if (typeof window !== "undefined") window.setTimeout(() => templateBodyRef.current?.focus(), 0);
    setMessage(null);
  };

  const handleClauseDragStart = (event, clause) => {
    event.dataTransfer.setData("application/x-loq-contract-clause-id", clause.id);
    event.dataTransfer.setData("text/plain", clauseMarker(clause.id));
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleTemplateBodyDrop = (event) => {
    const clauseId = event.dataTransfer.getData("application/x-loq-contract-clause-id");
    if (!clauseId) return;
    event.preventDefault();
    const clause = activeClauses.find(item => item.id === clauseId);
    insertClauseInTemplate(clause);
  };

  const handleClauseOrderDragEnd = async (result) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const ordered = Array.from(activeClauses);
    const [moved] = ordered.splice(result.source.index, 1);
    ordered.splice(result.destination.index, 0, moved);
    setClausesReordering(true);
    try {
      await Promise.all(ordered.map((item, index) => (
        base44.entities.CompanyContractClause.update(item.id, { sort_order: (index + 1) * 10 })
      )));
      refresh();
    } finally {
      setClausesReordering(false);
    }
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
    setSelectedLetterheadLayerId(layer.id);
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
      setSelectedLetterheadLayerId(layer.id);
    };
    reader.readAsDataURL(file);
  };

  const addLetterheadPreset = (preset) => {
    const companyInitials = companyDisplayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(part => part[0]?.toUpperCase())
      .join("") || "LOQ";
    let presetLayers = [];

    if (preset === "header") {
      presetLayers = [
        normalizeDesignLayer({
          type: "rectangle",
          label: "Kopbalk",
          x: 0,
          y: 0,
          width: 100,
          height: 7,
          background_color: "#0f172a",
          border_color: "#0f172a",
          opacity: 100,
        }),
        normalizeDesignLayer({
          type: "text",
          label: "Bedrijfsnaam koptekst",
          text: companyDisplayName,
          x: 10,
          y: 2,
          width: 55,
          height: 5,
          color: "#ffffff",
          font_size: 11,
          font_weight: 700,
        }),
        normalizeDesignLayer({
          type: "line",
          label: "Accentlijn",
          x: 0,
          y: 7.2,
          width: 100,
          height: 0.5,
          background_color: "#2563eb",
          opacity: 100,
        }),
      ];
    }

    if (preset === "footer") {
      presetLayers = [
        normalizeDesignLayer({
          type: "line",
          label: "Voettekst lijn",
          x: 10,
          y: 92,
          width: 80,
          height: 0.4,
          background_color: "#94a3b8",
          opacity: 100,
        }),
        normalizeDesignLayer({
          type: "text",
          label: "Voettekst",
          text: `${companyDisplayName} | {{bedrijf.email}} | {{bedrijf.telefoon}}`,
          x: 10,
          y: 94,
          width: 80,
          height: 4,
          color: "#475569",
          font_size: 7,
          align: "center",
          opacity: 100,
        }),
      ];
    }

    if (preset === "watermark") {
      presetLayers = [
        normalizeDesignLayer({
          type: "text",
          label: "Watermerk",
          text: companyInitials,
          x: 12,
          y: 35,
          width: 76,
          height: 16,
          color: "#0f172a",
          font_size: 42,
          font_weight: 700,
          align: "center",
          opacity: 8,
        }),
      ];
    }

    if (!presetLayers.length) return;
    setLetterheadForm(prev => ({
      ...prev,
      source_mode: LETTERHEAD_SOURCE_MODES.design,
      design_layers: [...normalizeDesignLayers(prev), ...presetLayers],
    }));
    setSelectedLetterheadLayerId(presetLayers[presetLayers.length - 1].id);
  };

  const removeLetterheadLayer = (layerId) => {
    setLetterheadForm(prev => ({
      ...prev,
      design_layers: normalizeDesignLayers(prev).filter(layer => layer.id !== layerId),
    }));
    if (selectedLetterheadLayerId === layerId) setSelectedLetterheadLayerId(null);
  };

  const duplicateLetterheadLayer = (layer) => {
    const duplicate = normalizeDesignLayer({
      ...layer,
      id: createLayerId(),
      label: `${layer.label || DESIGN_LAYER_DEFAULTS[layer.type]?.label || "Laag"} kopie`,
      x: clampLayerCoordinate(Number(layer.x || 0) + 3, layer.width),
      y: clampLayerCoordinate(Number(layer.y || 0) + 3, layer.height),
    });
    setLetterheadForm(prev => ({
      ...prev,
      source_mode: LETTERHEAD_SOURCE_MODES.design,
      design_layers: [...normalizeDesignLayers(prev), duplicate],
    }));
    setSelectedLetterheadLayerId(duplicate.id);
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

  const moveLetterheadLayerToEdge = (layerId, edge) => {
    setLetterheadForm(prev => {
      const layers = normalizeDesignLayers(prev);
      const index = layers.findIndex(layer => layer.id === layerId);
      if (index < 0) return prev;
      const nextLayers = [...layers];
      const [layer] = nextLayers.splice(index, 1);
      if (edge === "front") {
        nextLayers.push(layer);
      } else {
        nextLayers.unshift(layer);
      }
      return { ...prev, design_layers: nextLayers };
    });
  };

  const alignLetterheadLayer = (layerId, alignment, scope = "page") => {
    setLetterheadForm(prev => {
      const margins = normalizeLetterheadMargins(prev);
      const contentLeft = (margins.left / 210) * 100;
      const contentTop = (margins.top / 297) * 100;
      const contentRight = (margins.right / 210) * 100;
      const contentBottom = (margins.bottom / 297) * 100;
      const bounds = scope === "content"
        ? {
            x: contentLeft,
            y: contentTop,
            width: Math.max(1, 100 - contentLeft - contentRight),
            height: Math.max(1, 100 - contentTop - contentBottom),
          }
        : { x: 0, y: 0, width: 100, height: 100 };
      const nextLayers = normalizeDesignLayers(prev).map(layer => {
        if (layer.id !== layerId) return layer;
        const geometry = getLayerGeometry(layer);
        const updates = {};

        if (alignment === "left") updates.x = bounds.x;
        if (alignment === "centerX") updates.x = bounds.x + ((bounds.width - geometry.width) / 2);
        if (alignment === "right") updates.x = bounds.x + bounds.width - geometry.width;
        if (alignment === "top") updates.y = bounds.y;
        if (alignment === "centerY") updates.y = bounds.y + ((bounds.height - geometry.height) / 2);
        if (alignment === "bottom") updates.y = bounds.y + bounds.height - geometry.height;
        if (alignment === "contentWidth") {
          updates.x = bounds.x;
          updates.width = bounds.width;
        }

        return normalizeDesignLayer({ ...layer, ...updates });
      });
      return { ...prev, design_layers: nextLayers };
    });
  };

  const renderLetterheadLayerEditor = (layer, index) => {
    const isText = layer.type === "text";
    const isShape = layer.type === "rectangle" || layer.type === "line";
    const isImage = layer.type === "image";
    const layerVisible = layer.visible !== false;
    const layerLocked = layer.locked === true;

    return (
      <div
        key={layer.id}
        className={`rounded-lg border p-3 text-left transition-colors ${
          selectedLetterheadLayerId === layer.id
            ? "border-primary bg-primary/10"
            : "border-border bg-background/45"
        } ${layerVisible ? "" : "opacity-65"}`}
        onClick={() => setSelectedLetterheadLayerId(layer.id)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <LayerIcon type={layer.type} />
              {layer.label || DESIGN_LAYER_DEFAULTS[layer.type]?.label || "Laag"}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>Laag {index + 1}</span>
              {layerLocked && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Vergrendeld</Badge>}
              {!layerVisible && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Verborgen</Badge>}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={event => {
                event.stopPropagation();
                updateLetterheadLayer(layer.id, { visible: !layerVisible });
              }}
              title={layerVisible ? "Laag verbergen" : "Laag tonen"}
            >
              {layerVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={event => {
                event.stopPropagation();
                updateLetterheadLayer(layer.id, { locked: !layerLocked });
              }}
              title={layerLocked ? "Laag ontgrendelen" : "Laag vergrendelen"}
            >
              {layerLocked ? <Lock className="h-3.5 w-3.5 text-amber-500" /> : <Unlock className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={event => {
                event.stopPropagation();
                moveLetterheadLayer(layer.id, -1);
              }}
              disabled={index === 0}
              title="Een laag naar achter"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={event => {
                event.stopPropagation();
                moveLetterheadLayer(layer.id, 1);
              }}
              disabled={index === letterheadDesignLayers.length - 1}
              title="Een laag naar voren"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={event => {
                event.stopPropagation();
                duplicateLetterheadLayer(layer);
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={event => {
                event.stopPropagation();
                removeLetterheadLayer(layer.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={event => {
              event.stopPropagation();
              moveLetterheadLayerToEdge(layer.id, "back");
            }}
            disabled={index === 0}
          >
            Naar achtergrond
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={event => {
              event.stopPropagation();
              moveLetterheadLayerToEdge(layer.id, "front");
            }}
            disabled={index === letterheadDesignLayers.length - 1}
          >
            Naar voorgrond
          </Button>
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

          <div className="rounded-md border border-border/70 bg-muted/20 p-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Snel uitlijnen</p>
            <div className="grid grid-cols-3 gap-1">
              <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => alignLetterheadLayer(layer.id, "left")}>Links</Button>
              <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => alignLetterheadLayer(layer.id, "centerX")}>Midden</Button>
              <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => alignLetterheadLayer(layer.id, "right")}>Rechts</Button>
              <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => alignLetterheadLayer(layer.id, "top")}>Boven</Button>
              <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => alignLetterheadLayer(layer.id, "centerY")}>Verticaal</Button>
              <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => alignLetterheadLayer(layer.id, "bottom")}>Onder</Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 h-8 w-full text-xs"
              onClick={() => alignLetterheadLayer(layer.id, "contentWidth", "content")}
            >
              Breedte van tekstgebied
            </Button>
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
                      <Button type="button" variant="outline" onClick={() => addLetterheadLayer("line")}>
                        <Minus className="mr-1 h-4 w-4" />
                        Lijn
                      </Button>
                      <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
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
                  </div>
                )}
              </div>
            )}

            {letterheadStep === 2 && (
              letterheadUsesUpload ? (
                <div className="space-y-4">
                  <LetterheadPreview
                    source={letterheadPreviewSource}
                    filename={letterheadPreviewFilename}
                    fileType={letterheadPreviewType}
                    margins={letterheadMargins}
                    sourceMode={letterheadSourceMode}
                    backgroundFit={letterheadBackgroundFit}
                    pageBackgroundColor={letterheadPageBackground}
                    designLayers={letterheadDesignLayers}
                    assetInfo={letterheadAssetInfo}
                    onChangeMargins={nextMargins => setLetterheadForm(prev => ({
                      ...prev,
                      margin_top_mm: nextMargins.top,
                      margin_right_mm: nextMargins.right,
                      margin_bottom_mm: nextMargins.bottom,
                      margin_left_mm: nextMargins.left,
                    }))}
                    allowMarginDrag
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
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
                    {showUploadFitOptions && (
                      <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/25 bg-amber-500/10 p-3">
                        <div>
                          <p className="text-sm font-semibold text-amber-800 dark:text-amber-100">Afbeelding wijkt af van A4</p>
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                            Laat de upload passend staan als alles zichtbaar moet blijven. Kies vullend alleen wanneer randen afgesneden mogen worden.
                          </p>
                        </div>
                        <Select
                          value={letterheadBackgroundFit}
                          onValueChange={value => setLetterheadForm(prev => ({ ...prev, background_fit: value }))}
                        >
                          <SelectTrigger className="h-9 w-[170px] bg-background/80">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LETTERHEAD_BACKGROUND_FITS.map(option => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 xl:grid-cols-[minmax(360px,460px)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-background/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ontwerplagen</p>
                          <p className="mt-1 text-xs text-muted-foreground">Werk met lagen voor tekst, logo, lijnen en vlakken.</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Paginakleur</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">Achtergrond van het A4-briefpapier.</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="color"
                              className="h-9 w-14 p-1"
                              value={letterheadPageBackground}
                              onChange={event => setLetterheadForm(prev => ({ ...prev, page_background_color: event.target.value }))}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => setLetterheadForm(prev => ({ ...prev, page_background_color: DEFAULT_LETTERHEAD_PAGE_BACKGROUND }))}
                            >
                              Wit
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Canvas</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <Button
                            type="button"
                            variant={letterheadEditorOptions.showGrid ? "default" : "outline"}
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setLetterheadEditorOptions(prev => ({ ...prev, showGrid: !prev.showGrid }))}
                          >
                            Raster
                          </Button>
                          <Button
                            type="button"
                            variant={letterheadEditorOptions.snapToGrid ? "default" : "outline"}
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setLetterheadEditorOptions(prev => ({ ...prev, snapToGrid: !prev.snapToGrid }))}
                          >
                            Magnetisch
                          </Button>
                          <Select
                            value={String(letterheadEditorOptions.gridSize)}
                            onValueChange={value => setLetterheadEditorOptions(prev => ({ ...prev, gridSize: Number(value) || 1 }))}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0.5">Fijn raster</SelectItem>
                              <SelectItem value="1">Normaal raster</SelectItem>
                              <SelectItem value="2">Grof raster</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Sleep lagen op de pagina. Gebruik de pijltjestoetsen voor kleine correcties; Shift + pijl verplaatst sneller.
                        </p>
                      </div>
                      <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground">Snelle start</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => addLetterheadPreset("header")}>
                            Koptekst
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => addLetterheadPreset("footer")}>
                            Voettekst
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => addLetterheadPreset("watermark")}>
                            Watermerk
                          </Button>
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
                  </div>
                  <LetterheadPreview
                    source={letterheadPreviewSource}
                    filename={letterheadPreviewFilename}
                    fileType={letterheadPreviewType}
                    margins={letterheadMargins}
                    sourceMode={letterheadSourceMode}
                    backgroundFit={letterheadBackgroundFit}
                    pageBackgroundColor={letterheadPageBackground}
                    designLayers={letterheadDesignLayers}
                    assetInfo={letterheadAssetInfo}
                    interactive={letterheadSourceMode === LETTERHEAD_SOURCE_MODES.design}
                    selectedLayerId={selectedLetterheadLayerId}
                    onSelectLayer={setSelectedLetterheadLayerId}
                    onUpdateLayer={updateLetterheadLayer}
                    onChangeMargins={nextMargins => setLetterheadForm(prev => ({
                      ...prev,
                      margin_top_mm: nextMargins.top,
                      margin_right_mm: nextMargins.right,
                      margin_bottom_mm: nextMargins.bottom,
                      margin_left_mm: nextMargins.left,
                    }))}
                    allowMarginDrag
                    showGrid={letterheadEditorOptions.showGrid}
                    snapToGrid={letterheadEditorOptions.snapToGrid}
                    gridSize={letterheadEditorOptions.gridSize}
                  />
                </div>
              )
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
                  {!letterheadUsesUpload && (
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Achtergrond</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className="h-4 w-4 rounded border border-border"
                          style={{ backgroundColor: letterheadPageBackground }}
                        />
                        <span className="text-sm font-medium text-foreground">{letterheadPageBackground.toUpperCase()}</span>
                      </div>
                    </div>
                  )}
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
                  pageBackgroundColor={letterheadPageBackground}
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

  const renderTemplateWizard = () => {
    const probationOptions = ["internship", "zzp"].includes(selectedContractModel?.employment_model)
      ? PROBATION_CHOICES.filter(option => option.value === "not_applicable")
      : PROBATION_CHOICES.filter(option => option.value !== "not_applicable");

    return (
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
                <div className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_120px]">
                    <div className="space-y-2">
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
                  </div>
                  <div className="space-y-2">
                    <Label>Omschrijving</Label>
                    <Input
                      value={templateForm.description}
                      onChange={event => setTemplateForm(prev => ({ ...prev, description: event.target.value }))}
                      placeholder="Interne toelichting"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-foreground">Kies de CAO die voor dit bedrijf geldt</p>
                    {companyCaoOptions.length === 0 ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                        Voeg eerst een CAO-koppeling toe in de CAO-tab van dit bedrijfsprofiel.
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {companyCaoOptions.map(option => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setTemplateForm(prev => ({ ...prev, cao_key: option.value }))}
                            className={`rounded-lg border p-4 text-left transition-colors ${templateForm.cao_key === option.value ? "border-primary bg-primary/5" : "border-border bg-background/40 hover:bg-muted/40"}`}
                          >
                            <p className="font-semibold text-foreground">{option.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Beschikbaar via CAO-koppeling van dit bedrijf</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {templateStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Kies één specifiek contractmodel</p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {CONTRACT_MODEL_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTemplateForm(prev => ({
                          ...prev,
                          contract_model: option.value,
                          contract_form_scope: option.contract_form,
                          employment_model_scope: option.employment_model,
                          duration_type_scope: option.duration_type,
                          probation_scope: ["internship", "zzp"].includes(option.employment_model)
                            ? "not_applicable"
                            : (prev.probation_scope === "not_applicable" ? "" : prev.probation_scope),
                        }))}
                        className={`rounded-lg border p-4 text-left transition-colors ${templateForm.contract_model === option.value ? "border-primary bg-primary/5" : "border-border bg-background/40 hover:bg-muted/40"}`}
                      >
                        <p className="font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{contractModelMeta(option)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {templateStep === 3 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Proeftijd voor dit sjabloon</p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {probationOptions.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTemplateForm(prev => ({ ...prev, probation_scope: option.value }))}
                        className={`rounded-lg border p-4 text-left transition-colors ${templateForm.probation_scope === option.value ? "border-primary bg-primary/5" : "border-border bg-background/40 hover:bg-muted/40"}`}
                      >
                        <p className="font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {templateStep === 4 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Kies het briefpapier</p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setTemplateForm(prev => ({ ...prev, default_letterhead_id: "none" }))}
                      className={`rounded-lg border p-4 text-left transition-colors ${templateForm.default_letterhead_id === "none" ? "border-primary bg-primary/5" : "border-border bg-background/40 hover:bg-muted/40"}`}
                    >
                      <p className="font-semibold text-foreground">Geen briefpapier</p>
                      <p className="mt-1 text-xs text-muted-foreground">Gebruik alleen de contracttekst.</p>
                    </button>
                    {activeLetterheads.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTemplateForm(prev => ({ ...prev, default_letterhead_id: item.id }))}
                        className={`rounded-lg border p-4 text-left transition-colors ${templateForm.default_letterhead_id === item.id ? "border-primary bg-primary/5" : "border-border bg-background/40 hover:bg-muted/40"}`}
                      >
                        <p className="font-semibold text-foreground">{item.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.is_default ? "Standaardbriefpapier" : marginLabel(item)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {templateStep === 5 && (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                  <div className="space-y-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="space-y-2">
                        <Label>Duurkeuzes</Label>
                        <Input
                          value={templateForm.duration_options_text || ""}
                          onChange={event => setTemplateForm(prev => ({ ...prev, duration_options_text: event.target.value }))}
                          placeholder="Optioneel, bijv. 6_months, 1_year, free"
                        />
                      </div>
                      <label className="flex items-end gap-2 pb-2 text-sm">
                        <input
                          type="checkbox"
                          checked={templateForm.visible_in_contract_wizard !== false}
                          onChange={event => setTemplateForm(prev => ({ ...prev, visible_in_contract_wizard: event.target.checked }))}
                        />
                        Zichtbaar in contractwizard
                      </label>
                    </div>
                    <div className="space-y-2">
                      <Label>Template-inhoud *</Label>
                      <Textarea
                        ref={templateBodyRef}
                        rows={18}
                        value={templateForm.body}
                        onChange={event => setTemplateForm(prev => ({ ...prev, body: event.target.value }))}
                        onDragOver={event => {
                          if (Array.from(event.dataTransfer.types || []).includes("application/x-loq-contract-clause-id")) event.preventDefault();
                        }}
                        onDrop={handleTemplateBodyDrop}
                      />
                    </div>
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clausules</p>
                        <span className="text-xs text-muted-foreground">{templateClauseIds.length} ingevoegd</span>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {activeClauses.length === 0 ? (
                          <span className="text-sm text-muted-foreground">Maak eerst clausules aan in de clausuletab.</span>
                        ) : activeClauses.map(clause => {
                          const inserted = templateClauseIds.includes(clause.id);
                          return (
                            <div
                              key={clause.id}
                              draggable={!inserted}
                              onDragStart={event => handleClauseDragStart(event, clause)}
                              className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${inserted ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100" : "border-border bg-card"}`}
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium">{clause.title}</p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {clauseScopeLabel(clause.scope)} · {clauseTypeLabel(clause.scope, clause.clause_type)}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{inserted ? "Staat al in deze template" : "Sleep naar de tekst of voeg in op cursorpositie"}</p>
                              </div>
                              <Button type="button" variant="outline" size="sm" onClick={() => insertClauseInTemplate(clause)} disabled={inserted}>
                                <FilePlus2 className="mr-1 h-3.5 w-3.5" />
                                Invoegen
                              </Button>
                            </div>
                          );
                        })}
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
                  <TemplateDocumentPreview
                    body={templateForm.body}
                    templateName={templateForm.name}
                    letterhead={selectedTemplateLetterhead}
                    clauses={clauses}
                  />
                </div>
              )}

              {templateStep === 6 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">CAO</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{caoLabel(templateForm.cao_key)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Contractmodel</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{selectedContractModel?.label || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Proeftijd</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{probationLabel(templateForm.probation_scope)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Clausules</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{templateClauseIds.length}</p>
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
  };

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
              <p className="truncate">{getTemplateScopeLabel(item)}</p>
              <p className="mt-0.5 truncate text-xs">{caoLabel(item.cao_key)}</p>
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

  const renderClauseWizard = () => {
    const availableClauseTypes = clauseOptionsForScope(clauseForm.scope);
    const snippets = currentClauseDefinition?.snippets || [];
    const clausePlaceholders = extractPlaceholders(clausePreviewBody);

    return (
      <AnimatePresence>
        {clauseWizardOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-primary/30 bg-muted/15"
          >
            <div className="p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">
                {editingClauseId ? "Clausule bewerken" : "Clausule toevoegen"}
              </p>
              <WizardSteps labels={CLAUSE_STEPS} step={clauseStep} />

              {clauseStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Voor welk onderdeel is deze clausule bedoeld?</p>
                  <div className="grid grid-cols-1 gap-2">
                    {CLAUSE_SCOPE_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => selectClauseScope(option.value)}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${clauseForm.scope === option.value ? "border-primary bg-accent" : "border-border bg-card"}`}
                      >
                        <div><span className="text-sm font-semibold text-foreground">{option.label}</span><span className="text-xs text-muted-foreground ml-2">{option.description}</span></div>
                        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {clauseStep === 2 && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Kies de clausule voor {clauseScopeLabel(clauseForm.scope).toLowerCase()}</p>
                    <p className="mt-1 text-xs text-muted-foreground">De lijst is afgestemd op het gekozen onderdeel.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {availableClauseTypes.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => selectClauseType(option.value)}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${clauseForm.clause_type === option.value ? "border-primary bg-accent" : "border-border bg-card"}`}
                      >
                        <div><span className="text-sm font-semibold text-foreground">{option.label}</span><span className="text-xs text-muted-foreground ml-2">{option.description}</span></div>
                        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {clauseStep === 3 && (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_140px]">
                      <div className="space-y-2">
                        <Label>Titel *</Label>
                        <Input
                          value={clauseForm.title}
                          onChange={event => setClauseForm(prev => ({ ...prev, title: event.target.value }))}
                          placeholder={currentClauseDefinition?.label || "Bijv. Geheimhouding"}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Volgorde</Label>
                        <Input
                          type="number"
                          value={clauseForm.sort_order}
                          onChange={event => setClauseForm(prev => ({ ...prev, sort_order: event.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Onderdelen</p>
                          <p className="text-xs text-muted-foreground">Artikelnummer blijft tijdelijk x; de template maakt hier later automatisch 6.1, 6.2, enzovoort van.</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={addClauseSection}>
                          <Plus className="mr-1 h-4 w-4" />
                          Onderdeel
                        </Button>
                      </div>

                      {clauseSections.map((section, index) => (
                        <div
                          key={section.id}
                          className={`rounded-lg border p-3 transition-colors ${selectedClauseSectionIndex === index ? "border-primary bg-primary/5" : "border-border bg-background/40"}`}
                          onDragOver={event => {
                            if (Array.from(event.dataTransfer.types || []).includes("application/x-loq-clause-snippet")) event.preventDefault();
                          }}
                          onDrop={event => handleClauseSectionDrop(event, index)}
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              className="flex items-center gap-2 text-left"
                              onClick={() => setSelectedClauseSectionIndex(index)}
                            >
                              <Badge variant="outline" className="font-mono text-xs">x.{index + 1}</Badge>
                              <span className="text-xs text-muted-foreground">{index === 0 ? "Hoofdbepaling" : "Aanvullend onderdeel"}</span>
                            </button>
                            <div className="flex gap-1">
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveClauseSection(index, -1)} disabled={index === 0}>
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveClauseSection(index, 1)} disabled={index === clauseSections.length - 1}>
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeClauseSection(section.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <Textarea
                            rows={4}
                            value={section.text}
                            onFocus={() => setSelectedClauseSectionIndex(index)}
                            onChange={event => updateClauseSection(section.id, event.target.value)}
                            placeholder="Beschrijf dit onderdeel van de clausule."
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bouwblokken</p>
                        <Badge variant="outline" className="font-mono text-xs">x.{selectedClauseSectionIndex + 1}</Badge>
                      </div>
                      <div className="space-y-2">
                        {snippets.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Geen bouwblokken beschikbaar voor deze clausule.</p>
                        ) : snippets.map(snippet => (
                          <div
                            key={snippet.label}
                            draggable
                            onDragStart={event => handleSnippetDragStart(event, snippet)}
                            className="rounded-lg border border-border bg-card p-3 text-sm"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-foreground">{snippet.label}</p>
                                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{snippet.text}</p>
                              </div>
                              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" title={snippet.help} />
                            </div>
                            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => appendSnippetToSection(snippet)}>
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Toevoegen
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview</p>
                      <pre className="mt-3 max-h-[340px] overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
                        {clausePreviewBody || "Nog geen clausuletekst."}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {clauseStep === 4 && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Onderdeel</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{clauseScopeLabel(clauseForm.scope)}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Clausule</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{clauseTypeLabel(clauseForm.scope, clauseForm.clause_type)}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Onderdelen</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{normalizeClauseSections(clauseForm).filter(section => section.text).length}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Placeholders</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{clausePlaceholders.length}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clausuletekst</p>
                    <pre className="mt-3 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
                      {clausePreviewBody || "Nog geen clausuletekst."}
                    </pre>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Placeholders</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {clausePlaceholders.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Geen placeholders gevonden.</span>
                      ) : clausePlaceholders.map(placeholder => (
                        <Badge key={placeholder} variant="outline" className="text-xs">{placeholder}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" onClick={cancelClauseWizard}>
                  <X className="mr-1 h-4 w-4" />
                  Annuleren
                </Button>
                <div className="flex flex-wrap justify-end gap-2">
                  {clauseStep > 1 && (
                    <Button type="button" variant="outline" onClick={() => setClauseStep(step => step - 1)}>
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Terug
                    </Button>
                  )}
                  {clauseStep < CLAUSE_STEPS.length ? (
                    <Button type="button" onClick={nextClauseStep}>
                      Volgende
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button type="button" onClick={() => saveClauseMutation.mutate()} disabled={saveClauseMutation.isPending}>
                      <Save className="mr-1 h-4 w-4" />
                      {saveClauseMutation.isPending ? "Opslaan..." : "Clausule opslaan"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  const renderClauseTab = () => (
    <div className="flex h-full min-h-[360px] flex-col">
      {renderClauseWizard()}

      <div className={`${CLAUSE_TABLE_GRID} items-center border-b border-border bg-muted/20 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span></span>
        <span>Clausule</span>
        <span>Placeholders</span>
        <span>Door</span>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={startNewClause} disabled={clauseWizardOpen}>
            <Plus className="mr-1 h-4 w-4" />
            Nieuwe clausule
          </Button>
        </div>
      </div>

      <div className="flex-1">
        {activeClauses.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center px-5 py-8 text-center text-sm text-muted-foreground">
            Nog geen contractclausules aangemaakt.
          </div>
        ) : (
          <DragDropContext onDragEnd={handleClauseOrderDragEnd}>
            <Droppable droppableId="company-contract-clauses">
              {provided => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {activeClauses.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={clausesReordering}>
                      {dragProvided => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={`${CLAUSE_TABLE_GRID} items-start border-b border-border px-5 py-4 text-sm transition-colors hover:bg-accent/35`}
                        >
                          <button
                            type="button"
                            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                            {...(dragProvided.dragHandleProps || {})}
                            aria-label="Clausulevolgorde wijzigen"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{item.title}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {clauseScopeLabel(item.scope)} · {clauseTypeLabel(item.scope, item.clause_type)}
                            </p>
                            <p className="mt-0.5 line-clamp-2 font-mono text-xs text-muted-foreground">
                              {buildClauseBodyFromSections(normalizeClauseSections(item))}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {(item.placeholders || extractPlaceholders(item.body)).slice(0, 3).map(placeholder => (
                              <Badge key={placeholder} variant="outline" className="text-xs">{placeholder}</Badge>
                            ))}
                            {(item.placeholders || extractPlaceholders(item.body)).length > 3 && (
                              <Badge variant="outline" className="text-xs">+{(item.placeholders || extractPlaceholders(item.body)).length - 3}</Badge>
                            )}
                          </div>
                          <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(item, auditActors)}</span>
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEditClause(item)}>
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => archiveClause(item)}>
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
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

      {activeSubTab === "contract_templates" && renderTemplateTab()}
      {activeSubTab === "contract_clauses" && renderClauseTab()}
      {activeSubTab !== "contract_templates" && activeSubTab !== "contract_clauses" && renderLetterheadTab()}

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