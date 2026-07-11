import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { AnimatePresence, motion } from "framer-motion";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { base44 } from "@/api/base44Client";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";
import { uploadManagedFile } from "@/lib/managedFiles";
import {
  WPBR_TYPE_LABELS,
  buildFunctionGroupsForWpbrLicenses,
  functionLabel,
  getActiveWpbrLicenses,
} from "@/lib/securityCaoCatalog";
import {
  CONTRACT_TEMPLATE_PLACEHOLDERS,
  PB_FULLTIME_STANDARD_TEMPLATE_ID,
  getStandardContractTemplatePreset,
} from "@/lib/contractTemplateCatalog";
import {
  contractBlockHtmlToPlainText,
  contractTemplateBodyFromBlocks,
  contractTemplateBlocksFromBody,
  contractTemplateFamilyKey,
  contractTemplateScopeKey,
  createEmptyContractTemplateBlock,
  durationOptionsForContractTemplate,
  groupContractTemplateVersions,
  nextContractTemplateVersion,
  normalizeContractTemplateBlocks,
  normalizeTemplateReference,
  paginateContractTemplateBlocks,
  sanitizeContractBlockHtml,
} from "@/lib/contractTemplateEditor";
import {
  extractContractTemplatePlaceholders,
  getMissingStandardTemplatePlaceholders,
  getTemplatePlaceholderDetails,
  getUnknownContractTemplatePlaceholders,
} from "@/lib/contractTemplateRenderer";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Bold,
  Braces,
  CheckCircle,
  ChevronDown,
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
  Italic,
  Layers,
  List,
  ListOrdered,
  Lock,
  Minus,
  Plus,
  Redo2,
  Save,
  Square,
  Strikethrough,
  Underline,
  Undo2,
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

const CAO_OPTIONS = [
  { value: "cao_particuliere_beveiliging", label: "CAO Particuliere Beveiliging" },
  { value: "cao_evenementen_horecabeveiliging", label: "CAO Evenementen- en Horecabeveiliging" },
  { value: "cao_verkeersregelaars", label: "CAO Verkeersregelaars" },
  { value: "cao_veiligheidsdomein", label: "CAO Veiligheidsdomein" },
  { value: "none", label: "Geen vaste CAO" },
];

const CAO_OPTION_LABELS = Object.fromEntries(CAO_OPTIONS.map(option => [option.value, option.label]));

const TEMPLATE_DOCUMENT_TYPES = [
  {
    value: "employment_contract",
    label: "Arbeidscontracten",
    description: "Arbeidsovereenkomsten voor medewerkers, gekoppeld aan de actieve CAO's van dit bedrijf.",
  },
  {
    value: "sales_contract",
    label: "Verkoopcontracten",
    description: "Contracttemplates voor klanten, opdrachtgevers en dienstverlening.",
  },
  {
    value: "subcontractor_framework_agreement",
    label: "Raamovereenkomsten onderaannemers",
    description: "Raamafspraken met onderaannemers of zelfstandige uitvoerende partijen.",
  },
];

const TEMPLATE_DOCUMENT_TYPE_LABELS = Object.fromEntries(TEMPLATE_DOCUMENT_TYPES.map(option => [option.value, option.label]));

const EMPLOYMENT_MODEL_LABELS = {
  fulltime: "Fulltime dienstverband",
  parttime_fixed: "Parttime dienstverband",
  parttime_growth: "Parttime groeimodel",
  call_agreement: "Oproepkracht",
  min_max: "Min-max",
  internship: "Stage",
  zzp: "ZZP / opdracht",
};

const TEMPLATE_CONTRACT_MODEL_OPTIONS = [
  {
    value: "fulltime_employment",
    label: "Fulltime dienstverband",
    description: "Voor medewerkers met een volledige arbeidsomvang.",
    contract_form: "any",
    duration_type: "any",
    employment_model: "fulltime",
    default_hours: 36,
  },
  {
    value: "parttime_employment",
    label: "Parttime dienstverband",
    description: "Voor medewerkers met een vaste parttime arbeidsomvang.",
    contract_form: "any",
    duration_type: "any",
    employment_model: "parttime_fixed",
  },
  {
    value: "parttime_growth",
    label: "Parttime groeimodel",
    description: "Voor parttime contracten waarbij groei in uren via de template wordt uitgewerkt.",
    contract_form: "any",
    duration_type: "any",
    employment_model: "parttime_growth",
  },
  {
    value: "min_max_employment",
    label: "Min-max",
    description: "Voor contracten met een minimum- en maximumomvang.",
    contract_form: "oproep",
    duration_type: "any",
    employment_model: "min_max",
  },
  {
    value: "call_employment",
    label: "Oproepkracht",
    description: "Voor oproepcontracten.",
    contract_form: "oproep",
    duration_type: "any",
    employment_model: "call_agreement",
  },
  {
    value: "internship",
    label: "Stage",
    description: "Voor stageovereenkomsten en leer-/praktijktrajecten.",
    contract_form: "stage",
    duration_type: "any",
    employment_model: "internship",
  },
];

const LEGACY_CONTRACT_MODEL_OPTIONS = [
  {
    value: "fulltime_fixed",
    label: "Fulltime dienstverband",
    contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "fulltime",
    default_hours: 40,
  },
  {
    value: "fulltime_indefinite",
    label: "Fulltime dienstverband",
    contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "fulltime",
    default_hours: 40,
  },
  {
    value: "parttime_fixed",
    label: "Parttime dienstverband",
    contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "parttime_fixed",
  },
  {
    value: "parttime_indefinite",
    label: "Parttime dienstverband",
    contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "parttime_fixed",
  },
  {
    value: "min_max_fixed",
    label: "Min-max",
    contract_form: "oproep",
    underlying_contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "min_max",
  },
  {
    value: "min_max_indefinite",
    label: "Min-max",
    contract_form: "oproep",
    underlying_contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "min_max",
  },
  {
    value: "call_fixed",
    label: "Oproepkracht",
    contract_form: "oproep",
    underlying_contract_form: "bepaalde_tijd",
    duration_type: "fixed",
    employment_model: "call_agreement",
  },
  {
    value: "call_indefinite",
    label: "Oproepkracht",
    contract_form: "oproep",
    underlying_contract_form: "onbepaalde_tijd",
    duration_type: "indefinite",
    employment_model: "call_agreement",
  },
  {
    value: "internship_fixed",
    label: "Stage",
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

const CONTRACT_MODEL_OPTIONS = [...TEMPLATE_CONTRACT_MODEL_OPTIONS, ...LEGACY_CONTRACT_MODEL_OPTIONS];
const EMPLOYMENT_TEMPLATE_CONTRACT_MODELS = TEMPLATE_CONTRACT_MODEL_OPTIONS;
const CONTRACT_MODEL_LABELS = Object.fromEntries(CONTRACT_MODEL_OPTIONS.map(option => [option.value, option.label]));
const CLAUSE_SCOPE_OPTIONS = [
  {
    value: "employment_contracts",
    label: "Arbeidscontracten",
    description: "Clausules voor arbeidsovereenkomsten met medewerkers.",
  },
  {
    value: "customer_contracts",
    label: "Verkoopcontracten",
    description: "Klant- en verkoopafspraken over dienstverlening, aansprakelijkheid en betaling.",
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

const CLAUSE_SECURITY_CONTEXT_OPTIONS = [
  {
    value: "all_security",
    label: "Algemene beveiligingsfunctie",
    description: "Gebruik dit als de clausule voor meerdere vergunningtypen of algemene beveiligingsfuncties geldt.",
  },
  {
    value: "ND",
    label: "ND - Particuliere beveiligingsorganisatie",
    description: "Objectbeveiliging, mobiele surveillance, alarmopvolging en beveiliging voor derden.",
  },
  {
    value: "HND",
    label: "HND - Horecabeveiliging voor derden",
    description: "Horecabeveiliging, toegangscontrole, bezoekerscontact en incidentafhandeling bij opdrachtgevers.",
  },
  {
    value: "BD",
    label: "BD - Bedrijfsbeveiligingsdienst",
    description: "Beveiliging van de eigen onderneming, interne procedures en eigen bedrijfsinformatie.",
  },
  {
    value: "HBD",
    label: "HBD - Eigen horecaonderneming",
    description: "Beveiliging van de eigen horecaonderneming, huisregels, gasten en incidenten.",
  },
  {
    value: "PAC",
    label: "PAC - Particuliere alarmcentrale",
    description: "Alarmmeldingen, meldkamerprocedures, alarmcodes en klantinstructies.",
  },
  {
    value: "VTC",
    label: "VTC - Video toezicht centrale",
    description: "Livebeelden, camerabeelden, opvolgprotocollen, logging en privacy.",
  },
  {
    value: "PGW",
    label: "PGW - Geld- en waardentransport",
    description: "Routes, waarde-informatie, overdrachtslocaties, voertuigen en transportprocedures.",
  },
  {
    value: "POB",
    label: "POB - Particulier recherchebureau",
    description: "Onderzoeksdossiers, bronnen, observaties, rapportages en onderzoeksmethoden.",
  },
  {
    value: "not_applicable",
    label: "Niet van toepassing",
    description: "Gebruik dit voor kantoorfuncties of clausules zonder Wpbr-context.",
  },
];

const FUNCTION_PROFILE_OPTIONS = [
  { value: "security_general", label: "Algemene beveiligingsmedewerker" },
  { value: "object_security", label: "Objectbeveiliger / mobiel surveillant" },
  { value: "hospitality_security", label: "Horeca- of evenementenbeveiliger" },
  { value: "pac_operator", label: "Centralist PAC" },
  { value: "vtc_operator", label: "Centralist VTC" },
  { value: "cash_transport", label: "Geld- en waardetransporteur" },
  { value: "private_investigator", label: "Particulier onderzoeker" },
  { value: "intern", label: "Stagiair / medewerker in opleiding" },
  { value: "office", label: "Administratief / kantoorfunctie" },
];

const CLAUSE_RISK_LABELS = {
  green: "Standaard",
  orange: "Extra vragen",
  red: "Juridische review",
  blocked: "Blokkeren",
};

const CLAUSE_RISK_STYLES = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
  orange: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
  red: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200",
  blocked: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
};

const CLAUSE_TYPE_CATALOG = {
  employment_contracts: [
    {
      value: "wpbr_clearance",
      label: "Wpbr-toestemming en legitimatie",
      description: "Legt vast dat Wpbr-werk alleen mag met geldige toestemming, legitimatie en vakbekwaamheid.",
      risk: "green",
      required: true,
      appliesToPermits: ["all_security", "ND", "HND", "BD", "HBD", "PAC", "VTC", "PGW", "POB"],
      defaultSections: [
        "Werknemer mag beveiligings- en/of recherchewerkzaamheden uitsluitend verrichten indien en zolang werknemer beschikt over de voor de functie vereiste toestemming, legitimatie, diploma's, certificaten en eventuele ontheffingen op grond van de Wpbr en de daarop gebaseerde regelgeving.",
        "Werknemer informeert werkgever direct over feiten of omstandigheden die van invloed kunnen zijn op de toestemming, legitimatie, betrouwbaarheid, vakbekwaamheid of inzetbaarheid van werknemer.",
        "Indien de vereiste toestemming, legitimatie of vakbekwaamheid ontbreekt, vervalt of wordt ingetrokken, kan werkgever werknemer niet inzetten voor werkzaamheden waarvoor deze vereisten gelden.",
        "Werknemer draagt het verstrekte legitimatiebewijs tijdens de werkzaamheden bij zich en levert dit, samen met overige verstrekte middelen, direct in zodra werkgever daarom vraagt of zodra werknemer de werkzaamheden niet langer mag verrichten.",
        "Partijen beoordelen de gevolgen van het ontbreken of vervallen van toestemming met inachtneming van wet, cao en de omstandigheden van het geval.",
      ],
      snippets: [
        {
          label: "Geen automatische beeindiging",
          text: "Deze bepaling leidt niet automatisch tot beeindiging van de arbeidsovereenkomst. Werkgever volgt bij eventuele beeindiging de daarvoor geldende wettelijke en cao-route.",
          help: "Voorkomt een te harde ontbindende voorwaarde. Niet kunnen inzetten is iets anders dan automatisch einde contract.",
        },
        {
          label: "Meldplicht werknemer",
          text: "Werknemer meldt wijzigingen in betrouwbaarheid, strafrechtelijke omstandigheden, diploma's, certificaten of beschikbaarheid voor Wpbr-werkzaamheden direct bij {{meldpunt_wpbr}}.",
          help: "Handig als de organisatie een vast meldpunt of complianceverantwoordelijke heeft.",
        },
      ],
    },
    {
      value: "cao_rank",
      label: "CAO, functie-indeling en rangorde",
      description: "Voorkomt strijd tussen contract, cao en dwingend recht.",
      risk: "green",
      required: true,
      defaultSections: [
        "Op deze arbeidsovereenkomst is {{cao_naam}} van toepassing, voor zover werkgever en werknemer onder de werkingssfeer daarvan vallen.",
        "Werknemer treedt in dienst in de functie van {{functie_primaire_naam}} en wordt, voor zover van toepassing, ingedeeld in {{functiegroep_of_schaal}}.",
        "Indien een bepaling uit deze arbeidsovereenkomst strijdig is met dwingend recht of met een toepasselijke cao-bepaling waarvan niet ten nadele van werknemer mag worden afgeweken, geldt de bepaling die rechtens voorgaat.",
        "Arbeidsvoorwaarden die niet uitdrukkelijk in deze arbeidsovereenkomst zijn geregeld, worden toegepast overeenkomstig de toepasselijke cao, wetgeving en schriftelijk vastgestelde bedrijfsregelingen.",
      ],
      snippets: [
        {
          label: "CAO onbekend",
          text: "Indien nog niet zeker is welke cao of arbeidsvoorwaardenregeling van toepassing is, wordt deze arbeidsovereenkomst pas definitief gebruikt nadat de cao-context is gecontroleerd.",
          help: "Gebruik dit als de gebruiker twijfelt. De vergunning bepaalt niet automatisch welke cao geldt.",
        },
      ],
    },
    {
      value: "function_work_scope",
      label: "Functie, werkzaamheden en inzetgebied",
      description: "Maakt de hoofdfunctie concreet en voorkomt te brede functielijsten.",
      risk: "green",
      required: true,
      defaultSections: [
        "Werknemer treedt bij werkgever in dienst in de functie van {{functie_primaire_naam}}.",
        "De bij de functie behorende werkzaamheden bestaan in hoofdzaak uit {{functie_werkzaamheden_korte_omschrijving}}.",
        "Werknemer kan daarnaast worden ingezet voor andere redelijke werkzaamheden die passen binnen de functie, opleiding, ervaring, wettelijke bevoegdheden, Wpbr-toestemming, cao en bedrijfsvoering van werkgever.",
        "Werknemer wordt niet ingezet voor werkzaamheden waarvoor werknemer niet beschikt over de vereiste toestemming, legitimatie, diploma's, certificaten of vakbekwaamheid.",
        "Indien werknemer structureel andere werkzaamheden gaat verrichten dan in dit artikel genoemd, leggen partijen dit schriftelijk vast in een addendum of gewijzigde arbeidsovereenkomst.",
      ],
      snippets: [
        {
          label: "Meerdere functies",
          text: "Indien werknemer voor meerdere functies inzetbaar is, geldt {{functie_primaire_naam}} als hoofdfunctie. Aanvullende inzet is mogelijk voor {{nevenfuncties_lijst}}, voor zover werknemer daarvoor bevoegd, bekwaam en beschikbaar is en deze inzet past binnen wet en cao.",
          help: "Gebruik dit liever dan een lange algemene lijst met alle mogelijke functies.",
        },
        {
          label: "Wisselende objecten",
          text: "De werkzaamheden kunnen worden verricht op objecten, locaties of terreinen van werkgever, opdrachtgevers of relaties van werkgever binnen {{werkgebied}}, afhankelijk van planning en opdrachtbehoefte.",
          help: "Past bij objectbeveiliging, mobiele surveillance en wisselende opdrachtlocaties.",
        },
        {
          label: "Evenementen en horeca",
          text: "Bij evenementen- of horecawerkzaamheden kunnen de werkzaamheden worden verricht op wisselende evenementenlocaties, horecalocaties, verzamelplaatsen, briefinglocaties, opbouwlocaties en afbouwlocaties binnen {{werkgebied}}.",
          help: "Gebruik dit bij HND/HBD of evenementenbeveiliging.",
        },
        {
          label: "PAC/VTC centralist",
          text: "Indien werknemer werkzaamheden verricht als centralist, bestaan de werkzaamheden mede uit het ontvangen, beoordelen, registreren, doorzetten en opvolgen van meldingen volgens de geldende meldkamerprocedures, klantinstructies en wettelijke eisen.",
          help: "Specifiek voor PAC/VTC-functies.",
        },
        {
          label: "POB onderzoek",
          text: "Indien werknemer werkzaamheden verricht binnen een particulier recherchebureau, bestaan de werkzaamheden uitsluitend uit onderzoekstaken die werkgever rechtmatig heeft opgedragen en die passen binnen wet, gedragscode, privacyregels en instructies.",
          help: "Specifiek voor particulier recherchewerk.",
        },
      ],
    },
    {
      value: "confidentiality",
      label: "Geheimhouding, vertrouwelijke informatie en bedrijfsgeheimen",
      description: "Compacte basisclausule met verzameltermen, zodat meerdere functies geen lange waslijst veroorzaken.",
      risk: "green",
      required: true,
      appliesToPermits: ["all_security", "ND", "HND", "BD", "HBD", "PAC", "VTC", "PGW", "POB", "not_applicable"],
      defaultSections: [
        `Onder Vertrouwelijke Informatie wordt verstaan: alle informatie die werknemer tijdens of in verband met het dienstverband bij of voor {$bedrijf_naam} verkrijgt en waarvan werknemer weet of redelijkerwijs behoort te begrijpen dat deze vertrouwelijk, gevoelig, niet-openbaar of bedrijfsgevoelig is.`,
        `Onder Vertrouwelijke Informatie valt in ieder geval bedrijfsinformatie, klant- en opdrachtgeverinformatie, persoonsgegevens, beveiligingsinformatie, operationele instructies, systeem- en toegangsgegevens, financiele en commerciele informatie, interne documenten en alle overige informatie die door {$bedrijf_naam}, een opdrachtgever, {$leidinggevende} of een daartoe bevoegde persoon als vertrouwelijk is aangeduid.`,
        `Bij beveiligings-, meldkamer-, videotoezicht-, geld- en waardetransport-, horeca-/evenementenbeveiligings-, bedrijfsbeveiligings-, binnendienst- of recherchewerkzaamheden omvat Vertrouwelijke Informatie ook de daarbij behorende object-, melding-, beeld-, route-, waarde-, onderzoeks-, incident-, toegangs-, rooster-, plannings- en dossierinformatie.`,
        `Werknemer is verplicht alle Vertrouwelijke Informatie strikt geheim te houden. Werknemer mag Vertrouwelijke Informatie niet zonder voorafgaande schriftelijke toestemming van {$bedrijf_naam} of {$leidinggevende} direct of indirect verstrekken, tonen, bespreken, openbaar maken, kopieren, verspreiden, doorsturen, publiceren of anderszins toegankelijk maken voor derden.`,
        `Ook binnen {$bedrijf_naam} of binnen de organisatie van een opdrachtgever deelt werknemer Vertrouwelijke Informatie uitsluitend met personen die deze informatie noodzakelijkerwijs nodig hebben voor de uitvoering van hun taak. Werknemer past daarbij het need-to-know-principe toe.`,
        `Werknemer gebruikt Vertrouwelijke Informatie uitsluitend voor de behoorlijke uitvoering van de werkzaamheden voor {$bedrijf_naam}. Het is werknemer verboden Vertrouwelijke Informatie te gebruiken voor prive-doeleinden, eigen voordeel, werkzaamheden voor derden, benadering van klanten of relaties buiten {$bedrijf_naam} om, of enig ander doel dan de uitvoering van de arbeidsovereenkomst.`,
        `Werknemer verwerkt, bewaart, raadpleegt en verzendt Vertrouwelijke Informatie uitsluitend via de door {$bedrijf_naam} goedgekeurde systemen, accounts, communicatiemiddelen en opslaglocaties. Wachtwoorden, toegangscodes, sleutels, passen, accounts en andere toegangs- of beveiligingsmiddelen zijn strikt persoonlijk en geheim.`,
        `Werknemer meldt ieder vermoeden van verlies, diefstal, onbevoegde toegang, verkeerde verzending, datalek, beveiligingsincident of andere mogelijke schending van Vertrouwelijke Informatie direct bij {$meldpunt_geheimhouding}. Indien persoonsgegevens betrokken kunnen zijn, meldt werknemer dit ook direct bij {$meldpunt_privacy_datalekken}.`,
        `De geheimhoudingsplicht geldt niet voor zover werknemer wettelijk verplicht is Vertrouwelijke Informatie te verstrekken aan een rechter, toezichthouder, opsporingsinstantie of andere bevoegde instantie. Werknemer informeert {$bedrijf_naam} hierover vooraf, tenzij dit wettelijk niet is toegestaan.`,
        `Deze geheimhoudingsplicht verhindert werknemer niet om juridisch advies in te winnen, zich te wenden tot een vakbond, een bevoegde autoriteit of een aangewezen meldpunt, of een melding te doen van een vermoeden van een misstand, voor zover dit gebeurt binnen de grenzen van de wet en niet verder gaat dan noodzakelijk voor dat doel.`,
        `Bij beeindiging van het dienstverband, of eerder indien {$bedrijf_naam} daarom verzoekt, geeft werknemer alle Vertrouwelijke Informatie en alle dragers waarop deze informatie is vastgelegd direct aan {$bedrijf_naam} terug of verwijdert deze op instructie van {$bedrijf_naam}, voor zover dit rechtmatig en praktisch mogelijk is.`,
        `De verplichtingen uit dit artikel gelden gedurende het dienstverband en blijven ook na het einde van het dienstverband volledig van kracht, zolang de betreffende informatie niet rechtmatig openbaar is geworden of zolang {$bedrijf_naam}, een opdrachtgever, klant, relatie of derde een redelijk belang heeft bij geheimhouding daarvan. Voor bedrijfsgeheimen geldt deze verplichting zolang de informatie als bedrijfsgeheim of anderszins als vertrouwelijke bedrijfsinformatie kan worden beschermd.`,
        `Overtreding van dit artikel kan worden aangemerkt als een ernstige schending van de arbeidsovereenkomst en kan arbeidsrechtelijke gevolgen hebben. Afhankelijk van de aard en ernst van de overtreding kan {$bedrijf_naam}, met inachtneming van wet, {$cao_naam} en de omstandigheden van het geval, passende maatregelen nemen, waaronder een waarschuwing, tijdelijke ontzegging van toegang tot systemen of locaties, schorsing, beeindiging van de arbeidsovereenkomst, ontslag op staande voet indien sprake is van een dringende reden, een rechterlijk verbod of bevel en/of het verhalen van schade voor zover dit rechtens is toegestaan.`,
      ],
      snippets: [
        {
          label: "Extra gevoelige context",
          text: "Voor zover de functie toegang geeft tot bijzonder gevoelige meldkamer-, beeld-, waarde-, route-, onderzoeks- of dossierinformatie, wordt deze informatie steeds als strikt vertrouwelijk beschouwd.",
          help: "Alleen nodig als de gebruiker extra nadruk wil leggen bij PAC, VTC, PGW of POB. De standaardtekst dekt deze context al compact.",
        },
        {
          label: "Stagevariant",
          text: "Voor zover deze clausule wordt gebruikt in een stageovereenkomst, moet in dit artikel 'werknemer' worden gelezen als 'stagiair', 'dienstverband' als 'stage' en 'arbeidsovereenkomst' als 'stageovereenkomst', tenzij uit de context anders volgt.",
          help: "Gebruik dit wanneer de contractvorm stage is. Zo blijft de basisclausule bruikbaar zonder alles dubbel te schrijven.",
        },
      ],
    },
    {
      value: "privacy_data_security",
      label: "Privacy, persoonsgegevens en databeveiliging",
      description: "Regelt zorgvuldig gebruik van persoonsgegevens, camerabeelden, alarmgegevens en dossiers.",
      risk: "green",
      required: true,
      appliesToPermits: ["all_security", "ND", "HND", "BD", "HBD", "PAC", "VTC", "PGW", "POB"],
      defaultSections: [
        "Werknemer verwerkt persoonsgegevens en andere vertrouwelijke gegevens uitsluitend voor zover dit noodzakelijk is voor de uitvoering van de opgedragen werkzaamheden en uitsluitend volgens de instructies van werkgever.",
        "Werknemer gebruikt voor de verwerking van gegevens uitsluitend de door werkgever goedgekeurde systemen, accounts, communicatiemiddelen en opslaglocaties.",
        "Het is werknemer niet toegestaan persoonsgegevens, camerabeelden, alarmgegevens, onderzoeksgegevens, klantgegevens of objectinformatie zonder toestemming te kopieren, fotograferen, downloaden, door te sturen, extern op te slaan of via priveaccounts of priveapparatuur te verwerken.",
        "Werknemer houdt wachtwoorden, toegangsmiddelen en authenticatiemiddelen strikt persoonlijk en geheim en deelt deze niet met anderen.",
        "Werknemer meldt een vermoedelijke inbreuk op de beveiliging, verlies van gegevens, onbevoegde toegang, datalek of verkeerd verzonden informatie direct bij {{meldpunt_privacy_datalekken}}.",
        "Bij einde dienstverband of einde opdracht geeft werknemer alle gegevensdragers, documenten en toegangsmiddelen terug en verwijdert werknemer vertrouwelijke informatie van priveapparaten of priveomgevingen, voor zover dergelijke informatie daarop met toestemming van werkgever aanwezig was.",
      ],
      snippets: [
        {
          label: "Camerabeelden niet voor ander doel",
          text: "Camerabeelden en observatiegegevens worden alleen gebruikt voor het doel waarvoor zij rechtmatig zijn verkregen en niet zonder grondslag voor een ander doel.",
          help: "Belangrijk bij VTC, objectbeveiliging en controle van werknemers.",
        },
        {
          label: "Geen prive-opslag",
          text: "Werknemer gebruikt geen prive-e-mail, privecloud, messagingapps of eigen gegevensdragers voor opslag of verzending van vertrouwelijke informatie, tenzij werkgever dit vooraf schriftelijk heeft toegestaan.",
          help: "Voorkomt dat gevoelige gegevens buiten de beheerste bedrijfsomgeving terechtkomen.",
        },
      ],
    },
    {
      value: "company_property",
      label: "Bedrijfsmiddelen, uniform, sleutels en passen",
      description: "Regelt zorgvuldig gebruik, meldplicht en teruggave zonder te breed schadeverhaal.",
      risk: "green",
      required: true,
      defaultSections: [
        "Werkgever kan aan werknemer bedrijfsmiddelen verstrekken die nodig zijn voor de uitvoering van de werkzaamheden, waaronder uniformen, legitimatiebewijzen, sleutels, toegangspassen, communicatiemiddelen, apparatuur, documenten, voertuigen, software, accounts en digitale toegangsmiddelen.",
        "De verstrekte bedrijfsmiddelen blijven eigendom van werkgever of van de betreffende opdrachtgever, tenzij schriftelijk anders is overeengekomen.",
        "Werknemer gebruikt bedrijfsmiddelen zorgvuldig, uitsluitend voor zakelijke doeleinden en overeenkomstig de instructies van werkgever.",
        "Werknemer meldt verlies, diefstal, beschadiging, onbevoegd gebruik of mogelijke compromittering van bedrijfsmiddelen direct bij {{meldpunt_bedrijfsmiddelen}}.",
        "Werknemer geeft alle bedrijfsmiddelen direct terug zodra werkgever daarom vraagt, zodra de werkzaamheden waarvoor de middelen zijn verstrekt eindigen of bij einde dienstverband.",
        "Eventuele schade of kosten worden alleen op werknemer verhaald voor zover dit op grond van wet, cao en de omstandigheden van het geval is toegestaan.",
      ],
      snippets: [
        {
          label: "Sleutels en toegangscodes",
          text: "Sleutels, toegangspassen, codes en digitale toegangsrechten zijn strikt persoonlijk en mogen niet aan derden worden verstrekt of onbeheerd worden achtergelaten.",
          help: "Gebruik dit bij functies met fysieke of digitale toegangsrechten.",
        },
        {
          label: "Geen volledige schadeplicht",
          text: "Een eventuele inhouding of verrekening met loon vindt alleen plaats indien en voor zover dit wettelijk en cao-rechtelijk is toegestaan.",
          help: "Gebruik dit als de gebruiker schadeverhaal wil benoemen zonder een te harde bepaling.",
        },
      ],
    },
    {
      value: "company_rules",
      label: "Bedrijfsreglement en instructies",
      description: "Koppelt bedrijfsreglement, verzuimprotocol, objectinstructies en gedragscode aan het contract.",
      risk: "green",
      required: true,
      defaultSections: [
        "Het bedrijfsreglement, de gedragscode, het verzuimprotocol, het privacybeleid en eventuele veiligheids- en objectinstructies vormen onderdeel van de arbeidsovereenkomst, voor zover deze aan werknemer zijn verstrekt of op een voor werknemer toegankelijke wijze beschikbaar zijn gesteld.",
        "Werknemer is verplicht redelijke instructies, veiligheidsvoorschriften, uniformvoorschriften, legitimatievoorschriften, objectinstructies, meldprocedures en gedragsregels van werkgever en opdrachtgever na te leven.",
        "Bij strijd tussen deze arbeidsovereenkomst en een bedrijfsregeling geldt de arbeidsovereenkomst, tenzij wet of cao anders bepaalt of de bedrijfsregeling voor werknemer gunstiger is.",
        "Overtreding van de in dit artikel genoemde regels kan arbeidsrechtelijke gevolgen hebben, afhankelijk van de aard en ernst van de overtreding en met inachtneming van wet en cao.",
      ],
      snippets: [
        {
          label: "Ontvangstbevestiging",
          text: "Werknemer verklaart dat de in dit artikel genoemde regelingen voorafgaand aan of bij aanvang van het dienstverband aan hem of haar zijn verstrekt of digitaal toegankelijk zijn gemaakt.",
          help: "Handig om discussie over beschikbaarheid van reglementen te beperken.",
        },
      ],
    },
    {
      value: "integrity_reliable_work",
      label: "Integriteit en betrouwbare functievervulling",
      description: "Regelt betrouwbaarheid, instructies, alcohol/drugs, giften en meldplicht.",
      risk: "green",
      required: true,
      defaultSections: [
        "Werknemer voert de werkzaamheden zorgvuldig, integer en betrouwbaar uit en houdt zich aan de redelijke instructies, veiligheidsvoorschriften, objectinstructies, huisregels en procedures van werkgever en opdrachtgever.",
        "Werknemer verricht geen werkzaamheden onder invloed van alcohol, drugs of middelen die het bewustzijn, beoordelingsvermogen of reactievermogen kunnen beinvloeden.",
        "Werknemer meldt omstandigheden die de veilige, betrouwbare of wettelijk toegestane uitvoering van de werkzaamheden kunnen beinvloeden direct bij {{meldpunt_integriteit}}.",
        "Werknemer neemt geen giften, beloningen, voordelen of toezeggingen aan van opdrachtgevers, bezoekers, leveranciers of andere derden indien dit de onafhankelijkheid, betrouwbaarheid of belangen van werkgever of opdrachtgever kan schaden.",
        "Overtreding van deze bepaling kan arbeidsrechtelijke gevolgen hebben overeenkomstig wet, cao, personeelshandboek en de omstandigheden van het geval.",
      ],
      snippets: [
        {
          label: "Incidentmelding",
          text: "Werknemer meldt incidenten, onveilige situaties, belangenconflicten en integriteitsrisico's zo spoedig mogelijk via {{meldpunt_incidenten}}.",
          help: "Gebruik dit als de organisatie een formeel incidentkanaal heeft.",
        },
      ],
    },
    {
      value: "side_jobs",
      label: "Nevenwerkzaamheden",
      description: "Regelt nevenwerk zonder algemeen verbod; alleen beperken met objectieve reden.",
      risk: "orange",
      defaultSections: [
        "Werknemer mag naast het dienstverband betaalde of onbetaalde werkzaamheden verrichten, tenzij sprake is van een objectieve reden op grond waarvan werkgever de nevenwerkzaamheden mag beperken.",
        "Werknemer meldt voorgenomen nevenwerkzaamheden vooraf schriftelijk aan werkgever indien deze werkzaamheden kunnen leiden tot strijd met wettelijke voorschriften, veiligheidsrisico's, overtreding van arbeids- en rusttijden, belangenconflicten, aantasting van de goede uitvoering van de arbeidsovereenkomst of risico's voor vertrouwelijke informatie.",
        "Werkgever kan nevenwerkzaamheden alleen weigeren of daaraan voorwaarden verbinden indien daarvoor een objectieve reden bestaat. Werkgever deelt de reden schriftelijk aan werknemer mee.",
        "Werknemer verricht geen nevenwerkzaamheden waarbij vertrouwelijke informatie van werkgever of opdrachtgever wordt gebruikt of waarbij de betrouwbaarheid, onafhankelijkheid of inzetbaarheid van werknemer in het kader van Wpbr-werkzaamheden in gevaar komt.",
      ],
      snippets: [
        {
          label: "Objectieve reden kiezen",
          text: "Objectieve redenen kunnen onder meer zijn: gezondheid en veiligheid, bescherming van vertrouwelijke informatie, naleving van arbeidstijden, wettelijke voorschriften, integriteit of het voorkomen van belangenconflicten.",
          help: "Gebruik dit als toelichting wanneer werkgever nevenwerkzaamheden wil beperken.",
        },
      ],
    },
    {
      value: "business_integrity_protection",
      label: "Bescherming vertrouwelijke informatie en zakelijke integriteit",
      description: "Veiliger alternatief voor een breed relatie- of concurrentiebeding.",
      risk: "orange",
      defaultSections: [
        "Werknemer gebruikt klantgegevens, objectinformatie, tarieven, beveiligingsinstructies, roosters, alarmgegevens, camerabeelden en andere vertrouwelijke informatie uitsluitend voor de uitvoering van de werkzaamheden voor werkgever.",
        "Werknemer verricht tijdens het dienstverband geen werkzaamheden voor opdrachtgevers of relaties van werkgever buiten werkgever om, voor zover dit leidt tot belangenverstrengeling, schending van geheimhouding of strijd met goed werknemerschap.",
        "Na einde dienstverband blijft werknemer gebonden aan de geheimhoudingsplicht en mag werknemer vertrouwelijke informatie van werkgever of opdrachtgevers niet gebruiken voor eigen doeleinden of voor derden.",
        "Deze bepaling is niet bedoeld als concurrentiebeding en beperkt werknemer niet in de vrijheid om na einde dienstverband bij een andere werkgever in dienst te treden, tenzij afzonderlijk een rechtsgeldig beding is overeengekomen en dat beding in de betreffende situatie is toegestaan.",
      ],
      snippets: [
        {
          label: "Review bij relatiebeding",
          text: "Een afzonderlijk relatiebeding, concurrentiebeding of boetebeding wordt alleen opgenomen nadat is gecontroleerd of dit in de gekozen cao, contractvorm en functiecontext is toegestaan.",
          help: "Gebruik dit als de gebruiker toch richting een klassiek beding wil.",
        },
      ],
    },
    {
      value: "call_min_max_terms",
      label: "Oproep- en min-maxvoorwaarden",
      description: "Regelt oproepkanaal, referentiedagen, loon bij intrekking en aanbod vaste arbeidsomvang.",
      risk: "orange",
      defaultSections: [
        "Werkgever roept werknemer schriftelijk of elektronisch op via {{oproepkanaal}}.",
        "In de oproep vermeldt werkgever ten minste de datum, begin- en eindtijd, locatie en aard van de werkzaamheden.",
        "Werknemer is alleen verplicht gehoor te geven aan een oproep indien de oproep tijdig is gedaan volgens wet en cao.",
        "Indien werkgever een oproep binnen de toepasselijke oproeptermijn intrekt of wijzigt, behoudt werknemer recht op loon voor zover wet of cao dat bepaalt.",
        "De dagen en tijdstippen waarop werknemer verplicht kan worden te werken zijn: {{referentiedagen_en_tijdvakken}}.",
        "Werkgever doet werknemer na twaalf maanden een aanbod voor een vaste arbeidsomvang, voor zover en op de wijze zoals wet en cao dat voorschrijven.",
      ],
      snippets: [
        {
          label: "Toekomstige bandbreedte",
          text: "Controleer bij een contractdatum vanaf 1 januari 2027 of een nulurencontract nog is toegestaan of dat een bandbreedtecontract moet worden gebruikt.",
          help: "De regels voor oproepcontracten wijzigen. Deze waarschuwing moet zichtbaar blijven bij contractgeneratie.",
        },
      ],
    },
    {
      value: "study_costs",
      label: "Scholing en studiekosten",
      description: "Voorkomt dat verplichte scholing ten onrechte op werknemer wordt verhaald.",
      risk: "red",
      reviewRequired: true,
      defaultSections: [
        "Werkgever verstrekt de scholing die op grond van wet, cao of functie noodzakelijk is voor de uitvoering van de werkzaamheden overeenkomstig de daarvoor geldende regels.",
        "Voor scholing die werkgever op grond van wet of cao verplicht moet aanbieden, worden geen studiekosten of opleidingskosten op werknemer verhaald.",
        "Indien werknemer een niet-verplichte opleiding volgt op kosten van werkgever, kunnen partijen daarvoor een afzonderlijke schriftelijke studiekostenovereenkomst sluiten, mits deze voldoet aan wet en cao.",
        "In een eventuele studiekostenovereenkomst worden ten minste vastgelegd: de opleiding, de kosten, het belang van de opleiding, de terugbetalingsperiode, de afbouwregeling en de omstandigheden waarin geen terugbetaling verschuldigd is.",
      ],
      snippets: [
        {
          label: "Review vereist",
          text: "Gebruik deze clausule niet als terugbetalingsbeding voor opleidingen die noodzakelijk zijn voor de functie of verplicht zijn op grond van wet of cao.",
          help: "Studiekostenbedingen zijn gevoelig. Laat een concrete terugbetalingsregeling juridisch controleren.",
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

function isUnchangedLegacyEmploymentTemplateBody(body) {
  return String(body || "").trim() === DEFAULT_TEMPLATE_BODY.trim();
}

const SALES_TEMPLATE_BODY = [
  "Dienstverleningsovereenkomst",
  "",
  "Ondergetekenden:",
  "{{bedrijf.naam}}, hierna te noemen opdrachtnemer;",
  "en {{klant.naam}}, hierna te noemen opdrachtgever;",
  "",
  "Artikel 1 - Opdracht",
  "Opdrachtnemer verricht de overeengekomen diensten zoals beschreven in {{opdracht.omschrijving}}.",
  "",
  "Artikel 2 - Tarieven en betaling",
  "Opdrachtgever betaalt de overeengekomen vergoeding volgens de afspraken in deze overeenkomst of de bijbehorende offerte.",
  "",
  "Artikel 3 - Uitvoering",
  "Partijen werken samen op basis van duidelijke instructies, planning en bereikbaarheid.",
].join("\n");

const SUBCONTRACTOR_TEMPLATE_BODY = [
  "Raamovereenkomst onderaanneming",
  "",
  "Ondergetekenden:",
  "{{bedrijf.naam}}, hierna te noemen opdrachtgever;",
  "en {{onderaannemer.naam}}, hierna te noemen opdrachtnemer;",
  "",
  "Artikel 1 - Raamafspraken",
  "Deze raamovereenkomst bevat de algemene afspraken waaronder opdrachtgever opdrachten aan opdrachtnemer kan verstrekken.",
  "",
  "Artikel 2 - Zelfstandige uitvoering",
  "Opdrachtnemer voert opdrachten zelfstandig uit binnen de overeengekomen kaders en met inachtneming van wet- en regelgeving.",
  "",
  "Artikel 3 - Kwalificaties en naleving",
  "Opdrachtnemer zorgt ervoor dat ingezette personen beschikken over de vereiste kwalificaties, vergunningen, toestemmingen en ervaring.",
].join("\n");

const LETTERHEAD_TABLE_GRID = "grid grid-cols-[minmax(220px,1.5fr)_minmax(110px,130px)_minmax(100px,120px)_minmax(140px,180px)_minmax(160px,max-content)] gap-3 xl:gap-4";
const TEMPLATE_TABLE_GRID = "grid grid-cols-[minmax(240px,1.4fr)_minmax(72px,92px)_minmax(120px,150px)_minmax(220px,1fr)_minmax(140px,180px)_minmax(168px,max-content)] gap-3 xl:gap-4";
const CLAUSE_LIBRARY_GRID = "grid grid-cols-[minmax(44px,56px)_minmax(260px,1fr)_minmax(130px,160px)_minmax(150px,190px)_minmax(120px,150px)] gap-3 xl:gap-4";
const LETTERHEAD_STEPS = ["Upload", "Marges", "Controle"];
const EMPLOYMENT_TEMPLATE_STEPS = ["Documentsoort", "CAO", "Contractvorm", "Template", "Start", "Editor"];
const BUSINESS_TEMPLATE_STEPS = ["Documentsoort", "Template", "Start", "Editor"];
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

function extractPlaceholders(body) {
  return extractContractTemplatePlaceholders(body);
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

function normalizeTemplateType(value) {
  return value || "employment_contract";
}

function isEmploymentTemplateType(value) {
  return normalizeTemplateType(value) === "employment_contract";
}

function templateDocumentTypeLabel(value) {
  return TEMPLATE_DOCUMENT_TYPE_LABELS[normalizeTemplateType(value)] || "Contracttemplate";
}

function templateWizardSteps(form = {}) {
  if (!form.template_type) return ["Documentsoort", "Vervolg", "Editor"];
  return isEmploymentTemplateType(form.template_type) ? EMPLOYMENT_TEMPLATE_STEPS : BUSINESS_TEMPLATE_STEPS;
}

function templateSelectionStep(templateType) {
  return isEmploymentTemplateType(templateType) ? 4 : 2;
}

function templateSourceStep(templateType) {
  return isEmploymentTemplateType(templateType) ? 5 : 3;
}

function templateEditorStep(templateType) {
  return isEmploymentTemplateType(templateType) ? 6 : 4;
}

function getContractModel(value) {
  return CONTRACT_MODEL_OPTIONS.find(option => option.value === value) || null;
}

function normalizeTemplateContractModelValue(value) {
  const option = getContractModel(value);
  if (!option) return "";
  if (EMPLOYMENT_TEMPLATE_CONTRACT_MODELS.some(item => item.value === option.value)) return option.value;
  return EMPLOYMENT_TEMPLATE_CONTRACT_MODELS.find(item => item.employment_model === option.employment_model)?.value || option.value;
}

function contractModelOptionsForCao(caoKey) {
  if (!caoKey) return EMPLOYMENT_TEMPLATE_CONTRACT_MODELS;
  return EMPLOYMENT_TEMPLATE_CONTRACT_MODELS;
}

function inferContractModelFromTemplate(record = {}) {
  const metadataModel = normalizeTemplateContractModelValue(record.metadata?.contract_model);
  if (metadataModel) {
    return metadataModel;
  }
  const scopedModel = CONTRACT_MODEL_OPTIONS.find(option => {
    if (record.contract_form_scope && option.contract_form !== record.contract_form_scope) return false;
    if (record.employment_model_scope && option.employment_model !== record.employment_model_scope) return false;
    if (record.duration_type_scope && option.duration_type !== record.duration_type_scope) return false;
    if (record.metadata?.underlying_contract_form && option.underlying_contract_form !== record.metadata.underlying_contract_form) return false;
    return true;
  })?.value || "";
  return normalizeTemplateContractModelValue(scopedModel);
}

function contractModelMeta(option) {
  return option?.description || EMPLOYMENT_MODEL_LABELS[option?.employment_model] || "";
}

function getTemplateScopeLabel(item) {
  if (!isEmploymentTemplateType(item.template_type)) {
    return templateDocumentTypeLabel(item.template_type);
  }
  const modelLabel = CONTRACT_MODEL_LABELS[normalizeTemplateContractModelValue(item.metadata?.contract_model)]
    || EMPLOYMENT_MODEL_LABELS[item.employment_model_scope];
  if (modelLabel) return modelLabel;
  return "Arbeidscontract";
}

function defaultTemplateName(form = {}) {
  if (isEmploymentTemplateType(form.template_type)) {
    const modelLabel = CONTRACT_MODEL_LABELS[form.contract_model] || "arbeidsovereenkomst";
    return `${modelLabel} - ${caoLabel(form.cao_key)}`;
  }
  if (form.template_type === "sales_contract") return "Verkoopcontract";
  if (form.template_type === "subcontractor_framework_agreement") return "Raamovereenkomst onderaannemers";
  return "Contracttemplate";
}

function standardTemplateBody(form = {}) {
  if (form.template_type === "sales_contract") return SALES_TEMPLATE_BODY;
  if (form.template_type === "subcontractor_framework_agreement") return SUBCONTRACTOR_TEMPLATE_BODY;
  const preset = getStandardContractTemplatePreset(form);
  return preset?.body || "";
}

function templateMatchesBuilder(template = {}, form = {}) {
  if (!template || template.status === "archived") return false;
  const templateType = normalizeTemplateType(template.template_type);
  if (templateType !== normalizeTemplateType(form.template_type)) return false;
  if (!isEmploymentTemplateType(form.template_type)) return true;
  if (form.cao_key && template.cao_key && template.cao_key !== form.cao_key) return false;
  const model = getContractModel(form.contract_model);
  if (!model) return true;
  const formScope = template.contract_form_scope || "any";
  if (formScope !== "any" && formScope !== model.contract_form && formScope !== model.underlying_contract_form) return false;
  const modelScope = template.employment_model_scope || "any";
  if (modelScope !== "any" && modelScope !== model.employment_model) return false;
  const durationScope = template.duration_type_scope || "any";
  if (durationScope !== "any" && durationScope !== model.duration_type) return false;
  return true;
}

function caoLabel(value) {
  if (!value) return "Geen CAO";
  return CAO_OPTION_LABELS[value] || value;
}

function clauseScopeLabel(value) {
  return CLAUSE_SCOPE_OPTIONS.find(option => option.value === value)?.label || "Nog geen onderdeel";
}

function clauseSecurityContextLabel(value) {
  return CLAUSE_SECURITY_CONTEXT_OPTIONS.find(option => option.value === value)?.label || "Nog geen context";
}

function functionProfileLabel(value) {
  return FUNCTION_PROFILE_OPTIONS.find(option => option.value === value)?.label || "Nog geen functieprofiel";
}

function clauseRiskLabel(value) {
  return CLAUSE_RISK_LABELS[value] || CLAUSE_RISK_LABELS.green;
}

function clauseOptionsForScope(scope, licenseScope = "") {
  const options = CLAUSE_TYPE_CATALOG[scope] || [];
  if (!licenseScope || licenseScope === "not_applicable") return options;
  return options.filter(option => {
    if (!Array.isArray(option.appliesToPermits) || option.appliesToPermits.length === 0) return true;
    return option.appliesToPermits.includes(licenseScope) || option.appliesToPermits.includes("all_security");
  });
}

function clauseDefinition(scope, type, licenseScope = "") {
  return clauseOptionsForScope(scope, licenseScope).find(option => option.value === type)
    || (CLAUSE_TYPE_CATALOG[scope] || []).find(option => option.value === type)
    || null;
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

function clauseDefaultLicenseScope(scope) {
  return scope === "employment_contracts" ? "all_security" : "not_applicable";
}

function catalogClauseKey(scope, type) {
  return `${scope || "unknown"}:${type || "unknown"}`;
}

function findCatalogClauseVariant(clauses = [], scope, type) {
  return (clauses || []).find(item => {
    const inferred = inferClauseCatalog(item);
    return inferred.scope === scope && inferred.type === type;
  }) || null;
}

function clauseTemplateUsageCount(clause, templates = []) {
  if (!clause?.id) return 0;
  return (templates || []).filter(template => extractClauseIds(template.body).includes(clause.id)).length;
}

function clauseLibraryBody(definition, scope, variant = null) {
  const sections = variant
    ? normalizeClauseSections(variant)
    : defaultClauseSections(definition, clauseDefaultLicenseScope(scope));
  return buildClauseBodyFromSections(sections);
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

function contextualDefaultSections(definition, licenseScope) {
  const sections = [...(definition?.defaultSections || [""])];
  if (definition?.value === "privacy_data_security" && ["PAC", "VTC", "POB"].includes(licenseScope)) {
    sections.splice(1, 0, "Vanwege de gekozen vergunning gelden verhoogde eisen aan logging, toegangsbeperking, doelbinding en melding van mogelijke datalekken of onbevoegde kennisname.");
  }
  return sections;
}

function defaultClauseSections(definition, licenseScope = "") {
  const defaults = contextualDefaultSections(definition, licenseScope);
  return defaults.map(text => ({ id: createClauseSectionId(), text }));
}

function clauseValidationNotes(form = {}, definition = null) {
  const notes = [];
  if (definition?.required) {
    notes.push("Deze clausule is aanbevolen of verplicht voor veel beveiligingscontracten. Controleer of deze in de template is opgenomen.");
  }
  if (definition?.risk === "red" || definition?.reviewRequired) {
    notes.push("Deze clausule is juridisch gevoelig. Gebruik de tekst pas definitief na juridische controle.");
  }
  if (definition?.risk === "orange") {
    notes.push("Deze clausule vraagt extra controle op cao, contractvorm, functie en ingangsdatum.");
  }
  if (definition?.value === "call_min_max_terms") {
    notes.push("Controleer oproepkanaal, oproeptermijn, referentiedagen, loon bij intrekking en het aanbod vaste arbeidsomvang na twaalf maanden.");
    notes.push("Bij contracten vanaf 1 januari 2027 moet worden gecontroleerd of nuluren/min-max nog passend is of dat een bandbreedtecontract nodig is.");
  }
  if (definition?.value === "business_integrity_protection") {
    notes.push("Deze clausule is bedoeld als veilige bescherming van vertrouwelijke informatie en zakelijke integriteit, niet als klassiek concurrentiebeding.");
  }
  if (definition?.value === "study_costs") {
    notes.push("Gebruik deze clausule niet om verplichte scholing of noodzakelijke functieopleiding op werknemer te verhalen.");
  }
  if (definition?.value === "confidentiality") {
    notes.push("Gebruik de basisclausule één keer. De compacte verzamelterm dekt meerdere functies zonder lange opsomming per functie.");
    notes.push("Voeg alleen een extra gevoelige contextregel toe wanneer extra nadruk nodig is, bijvoorbeeld bij meldkamer-, beeld-, waarde-, route-, onderzoeks- of dossierinformatie.");
    notes.push("Laat de wettelijke uitzondering, juridisch advies/vakbond/bevoegde autoriteit en meldingsmogelijkheid voor misstanden in de tekst staan.");
    notes.push("Vermijd teksten zoals 'werknemer is altijd aansprakelijk voor alle schade'. Gebruik de standaard sanctietekst met verwijzing naar wet, cao en omstandigheden.");
  }
  return uniqueStrings(notes);
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

function TemplateBrowserChoice({ label, description, meta, selected = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${selected ? "border-primary bg-accent" : "border-border bg-card"}`}
    >
      <div className="min-w-0">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {description && <span className="ml-2 text-xs text-muted-foreground">{description}</span>}
        {meta && <span className="mt-1 block text-xs text-muted-foreground">{meta}</span>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
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

function TemplateDocumentPreview({ body, blocks, templateName, letterhead, clauses }) {
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
  const previewBlocks = normalizeContractTemplateBlocks(blocks, previewBody);
  const pages = paginateContractTemplateBlocks(previewBlocks);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 xl:sticky xl:top-3 xl:self-start">
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">PDF-preview</span>
        <span>{letterhead?.name || "Zonder briefpapier"} · {pages.length} pagina{pages.length === 1 ? "" : "'s"}</span>
      </div>
      <div className="max-h-[760px] space-y-4 overflow-y-auto rounded-lg bg-slate-950/5 p-3 dark:bg-black/25">
        {pages.map((page, pageIndex) => (
          <div
            key={`preview-page-${pageIndex + 1}`}
            className="relative mx-auto aspect-[210/297] w-full max-w-[420px] overflow-hidden rounded-[2px] shadow-[0_18px_46px_rgba(15,23,42,0.18)] ring-1 ring-slate-950/15 dark:ring-white/15"
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
              className="absolute z-20 overflow-hidden bg-white/78 p-[4.5%] text-[7px] leading-[1.35] text-slate-900 backdrop-blur-[0.5px] sm:text-[8px]"
              style={{
                top: `${top}%`,
                right: `${right}%`,
                bottom: `${bottom}%`,
                left: `${left}%`,
              }}
            >
              {pageIndex === 0 && (
                <p className="mb-2 text-[10px] font-bold leading-tight text-slate-950">{templateName || "Arbeidsovereenkomst"}</p>
              )}
              {page.length === 0 ? (
                <p>Voeg links een artikelblok toe.</p>
              ) : page.map(item => (
                <div key={item.id} className="mb-2 break-inside-avoid [page-break-inside:avoid]">
                  {item.heading && <p className="mb-1 font-bold text-slate-950">{item.heading}</p>}
                  <div
                    className="[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2 [&_h2]:font-bold [&_h3]:font-semibold [&_li]:mb-0.5 [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:mb-1 [&_ul]:ml-4 [&_ul]:list-disc"
                    dangerouslySetInnerHTML={{ __html: sanitizeContractBlockHtml(item.html) }}
                  />
                </div>
              ))}
            </div>
            <span className="absolute bottom-2 right-3 z-30 text-[7px] font-medium text-slate-500">{pageIndex + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function initialTemplate(companyId) {
  const body = DEFAULT_TEMPLATE_BODY;
  return {
    company_id: companyId,
    name: "",
    description: "",
    template_type: "",
    template_choice: "",
    template_source_mode: "",
    contract_model: "",
    contract_form_scope: "",
    employment_model_scope: "",
    probation_scope: "any",
    duration_type_scope: "",
    duration_options: [],
    visible_in_contract_wizard: true,
    cao_key: "",
    function_type: "",
    default_letterhead_id: "none",
    version: 1,
    status: "draft",
    body,
    editor_blocks: contractTemplateBlocksFromBody(body),
    is_new_version: false,
    version_source_id: null,
    version_family_key: "",
    standard_template_id: null,
    standard_template_version: null,
  };
}

function templateFormFromRecord(companyId, record) {
  const templateType = normalizeTemplateType(record.template_type);
  const contractModel = isEmploymentTemplateType(templateType) ? inferContractModelFromTemplate(record) : "";
  const standardPreset = getStandardContractTemplatePreset({
    template_type: templateType,
    cao_key: record.cao_key || "",
    contract_model: contractModel,
    employment_model_scope: record.employment_model_scope || "",
  });
  const upgradeLegacyBody = Boolean(standardPreset && isUnchangedLegacyEmploymentTemplateBody(record.body));
  const body = upgradeLegacyBody ? standardPreset.body : (record.body || DEFAULT_TEMPLATE_BODY);
  const editorBlocks = normalizeContractTemplateBlocks(record.editor_blocks || record.metadata?.editor_blocks, body);
  const durationOptions = Array.isArray(record.duration_options) && record.duration_options.length > 0
    ? record.duration_options
    : durationOptionsForContractTemplate({
      template_type: templateType,
      cao_key: record.cao_key || "",
      contract_model: contractModel,
    }).map(option => option.value);
  return {
    company_id: companyId,
    name: record.name || "",
    description: record.description || "",
    template_type: templateType,
    template_choice: "existing",
    template_source_mode: "existing",
    contract_model: contractModel,
    contract_form_scope: record.contract_form_scope || "any",
    employment_model_scope: record.employment_model_scope || "any",
    probation_scope: record.probation_scope || "any",
    duration_type_scope: record.duration_type_scope || "any",
    duration_options: durationOptions,
    visible_in_contract_wizard: record.visible_in_contract_wizard !== false,
    cao_key: record.cao_key || "",
    function_type: record.function_type || "",
    default_letterhead_id: record.default_letterhead_id || "none",
    version: record.version || 1,
    status: record.status || "draft",
    body: contractTemplateBodyFromBlocks(editorBlocks),
    editor_blocks: editorBlocks,
    is_new_version: false,
    version_source_id: null,
    version_family_key: contractTemplateFamilyKey({
      ...record,
      contract_model: contractModel,
    }),
    standard_template_id: upgradeLegacyBody ? standardPreset.id : (record.metadata?.standard_template_id || null),
    standard_template_version: upgradeLegacyBody ? standardPreset.version : (record.metadata?.standard_template_version || null),
  };
}

function initialClause(companyId, sortOrder = 0) {
  return {
    company_id: companyId,
    scope: "",
    clause_type: "",
    license_scope: "",
    function_profile: "",
    risk_level: "green",
    review_required: false,
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
  const templateRichEditorRef = useRef(null);
  const [letterheadForm, setLetterheadForm] = useState(() => initialLetterhead(companyId));
  const [templateForm, setTemplateForm] = useState(() => initialTemplate(companyId));
  const [clauseForm, setClauseForm] = useState(() => initialClause(companyId));
  const [editingLetterheadId, setEditingLetterheadId] = useState(null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [editingClauseId, setEditingClauseId] = useState(null);
  const [letterheadWizardOpen, setLetterheadWizardOpen] = useState(false);
  const [templateWizardOpen, setTemplateWizardOpen] = useState(false);
  const [clauseWizardOpen, setClauseWizardOpen] = useState(false);
  const [clauseDirectEditMode, setClauseDirectEditMode] = useState(false);
  const [clauseLibraryStep, setClauseLibraryStep] = useState(1);
  const [clauseDetailView, setClauseDetailView] = useState("structure");
  const [selectedVariationIndex, setSelectedVariationIndex] = useState(0);
  const [clauseLibraryScope, setClauseLibraryScope] = useState("employment_contracts");
  const [templateBrowserType, setTemplateBrowserType] = useState("");
  const [templateBrowserCaoKey, setTemplateBrowserCaoKey] = useState("");
  const [templateBrowserContractModel, setTemplateBrowserContractModel] = useState("");
  const [expandedTemplateFamilies, setExpandedTemplateFamilies] = useState([]);
  const [editingTemplateBlockId, setEditingTemplateBlockId] = useState(null);
  const [templateBlockDraft, setTemplateBlockDraft] = useState(null);
  const [placeholderSearch, setPlaceholderSearch] = useState("");
  const [selectedClauseKey, setSelectedClauseKey] = useState(() => (
    catalogClauseKey("employment_contracts", CLAUSE_TYPE_CATALOG.employment_contracts?.[0]?.value)
  ));
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

  const activeSubTab = subTab === "contract_clauses" ? "contract_templates" : (subTab || "letterhead");

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

  const { data: wpbrLicenses = [] } = useQuery({
    queryKey: ["wpbr-licenses", companyId],
    queryFn: () => base44.entities.CompanyWpbrLicense.filter({ company_id: companyId }, "-created_date"),
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
  const clauseLibraryDefinitions = useMemo(
    () => CLAUSE_TYPE_CATALOG[clauseLibraryScope] || [],
    [clauseLibraryScope],
  );
  const clauseLibraryItems = useMemo(() => clauseLibraryDefinitions.map((definition, index) => {
    const variant = findCatalogClauseVariant(activeClauses, clauseLibraryScope, definition.value);
    const body = clauseLibraryBody(definition, clauseLibraryScope, variant);
    const placeholdersForClause = variant?.placeholders?.length ? variant.placeholders : extractPlaceholders(body);
    const licenseScope = variant?.license_scope || clauseDefaultLicenseScope(clauseLibraryScope);

    return {
      key: catalogClauseKey(clauseLibraryScope, definition.value),
      scope: clauseLibraryScope,
      definition,
      variant,
      body,
      placeholders: placeholdersForClause,
      snippets: definition.snippets || [],
      validationNotes: clauseValidationNotes({ scope: clauseLibraryScope, clause_type: definition.value, license_scope: licenseScope }, definition),
      usageCount: clauseTemplateUsageCount(variant, templates),
      sortOrder: Number(variant?.sort_order || ((index + 1) * 10)),
    };
  }), [activeClauses, clauseLibraryDefinitions, clauseLibraryScope, templates]);
  const selectedClauseLibraryItem = clauseLibraryItems.find(item => item.key === selectedClauseKey) || clauseLibraryItems[0] || null;
  const customClauseItems = useMemo(() => activeClauses.filter(item => {
    const inferred = inferClauseCatalog(item);
    return !clauseDefinition(inferred.scope, inferred.type);
  }), [activeClauses]);
  const currentClauseDefinition = useMemo(
    () => clauseDefinition(clauseForm.scope, clauseForm.clause_type, clauseForm.license_scope),
    [clauseForm.scope, clauseForm.clause_type, clauseForm.license_scope],
  );
  const clauseSections = useMemo(() => editableClauseSections(clauseForm), [clauseForm]);
  const clausePreviewBody = useMemo(() => buildClauseBodyFromSections(clauseSections), [clauseSections]);
  const templateClauseIds = useMemo(() => extractClauseIds(templateForm.body), [templateForm.body]);
  const selectedTemplateLetterhead = activeLetterheads.find(item => item.id === templateForm.default_letterhead_id) || null;
  const selectedContractModel = getContractModel(templateForm.contract_model);
  const activeTemplates = useMemo(() => [...templates]
    .filter(item => item.status !== "archived")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")) || Number(b.version || 1) - Number(a.version || 1)),
  [templates]);
  const sortedTemplates = useMemo(() => [...templates]
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")) || Number(b.version || 1) - Number(a.version || 1)),
  [templates]);
  const matchingTemplateChoices = useMemo(
    () => groupContractTemplateVersions(activeTemplates.filter(item => templateMatchesBuilder(item, templateForm)))
      .map(group => group.versions[0])
      .filter(Boolean),
    [activeTemplates, templateForm],
  );
  const allTemplateVersionGroups = useMemo(() => groupContractTemplateVersions(sortedTemplates), [sortedTemplates]);
  const templateBrowserCategoryCounts = useMemo(() => TEMPLATE_DOCUMENT_TYPES.reduce((acc, option) => {
    acc[option.value] = allTemplateVersionGroups.filter(group => (
      normalizeTemplateType(group.versions[0]?.template_type) === option.value
    )).length;
    return acc;
  }, {}), [allTemplateVersionGroups]);
  const templateBrowserContractModelCounts = useMemo(() => EMPLOYMENT_TEMPLATE_CONTRACT_MODELS.reduce((acc, option) => {
    acc[option.value] = allTemplateVersionGroups.filter(group => (
      isEmploymentTemplateType(group.versions[0]?.template_type)
      && (!templateBrowserCaoKey || group.versions[0]?.cao_key === templateBrowserCaoKey)
      && inferContractModelFromTemplate(group.versions[0]) === option.value
    )).length;
    return acc;
  }, {}), [allTemplateVersionGroups, templateBrowserCaoKey]);
  const selectedTemplateBrowserType = TEMPLATE_DOCUMENT_TYPES.find(option => option.value === templateBrowserType) || null;
  const selectedTemplateBrowserContractModel = getContractModel(templateBrowserContractModel);
  const templateBrowserTableItems = useMemo(() => sortedTemplates.filter(item => {
    const templateType = normalizeTemplateType(item.template_type);
    if (!templateBrowserType || templateType !== templateBrowserType) return false;
    if (isEmploymentTemplateType(templateBrowserType)) {
      if (!templateBrowserCaoKey || !templateBrowserContractModel) return false;
      if (item.cao_key !== templateBrowserCaoKey) return false;
      return inferContractModelFromTemplate(item) === templateBrowserContractModel;
    }
    return true;
  }), [sortedTemplates, templateBrowserType, templateBrowserCaoKey, templateBrowserContractModel]);
  const templateBrowserVersionGroups = useMemo(
    () => groupContractTemplateVersions(templateBrowserTableItems),
    [templateBrowserTableItems],
  );
  const companyCaoOptions = useMemo(() => uniqueStrings(caoAssignments
    .filter(item => item.status !== "archived" && item.status !== "inactive")
    .map(item => item.cao_key))
    .map(key => ({ value: key, label: caoLabel(key) })),
  [caoAssignments]);
  const selectedTemplateBrowserCao = companyCaoOptions.find(option => option.value === templateBrowserCaoKey) || null;
  const activeWpbrLicenses = useMemo(() => getActiveWpbrLicenses(wpbrLicenses), [wpbrLicenses]);
  const primaryCompanyCaoKey = companyCaoOptions.length === 1 ? companyCaoOptions[0].value : (companyCaoOptions[0]?.value || null);
  const derivedClauseFunctionGroups = useMemo(
    () => buildFunctionGroupsForWpbrLicenses(wpbrLicenses, primaryCompanyCaoKey),
    [wpbrLicenses, primaryCompanyCaoKey],
  );
  const placeholderDetails = getTemplatePlaceholderDetails(templateForm.body)
    .filter(item => !item.key.startsWith(CLAUSE_MARKER_PREFIX));
  const unknownTemplatePlaceholders = getUnknownContractTemplatePlaceholders(templateForm.body);
  const selectedStandardTemplatePreset = getStandardContractTemplatePreset(templateForm);
  const standardTemplateSourceAvailable = Boolean(standardTemplateBody(templateForm));
  const availableTemplateDurationOptions = useMemo(
    () => durationOptionsForContractTemplate(templateForm),
    [templateForm.template_type, templateForm.contract_model, templateForm.cao_key],
  );
  const filteredPlaceholderDefinitions = useMemo(() => {
    const search = placeholderSearch.trim().toLocaleLowerCase("nl-NL");
    if (!search) return CONTRACT_TEMPLATE_PLACEHOLDERS;
    return CONTRACT_TEMPLATE_PLACEHOLDERS.filter(item => (
      item.key.toLocaleLowerCase("nl-NL").includes(search)
      || item.label.toLocaleLowerCase("nl-NL").includes(search)
      || item.source.toLocaleLowerCase("nl-NL").includes(search)
    ));
  }, [placeholderSearch]);
  const selectedTemplateDurationLabels = (templateForm.duration_options || [])
    .map(value => availableTemplateDurationOptions.find(option => option.value === value)?.label)
    .filter(Boolean);
  const currentTemplateFamilyVersions = templateForm.version_family_key
    ? templates.filter(item => contractTemplateFamilyKey(item) === templateForm.version_family_key)
    : [];
  const templateReferenceLocked = Boolean(templateForm.is_new_version || currentTemplateFamilyVersions.length > 1);
  const templateEditorModules = useMemo(() => ({
    toolbar: { container: "#template-block-toolbar" },
    history: { delay: 700, maxStack: 100, userOnly: true },
  }), []);
  const missingStandardTemplatePlaceholders = templateForm.standard_template_id === PB_FULLTIME_STANDARD_TEMPLATE_ID
    ? getMissingStandardTemplatePlaceholders(templateForm.body)
    : [];
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
    if (clauseLibraryItems.length === 0) return;
    if (!clauseLibraryItems.some(item => item.key === selectedClauseKey)) {
      setSelectedClauseKey(clauseLibraryItems[0].key);
    }
  }, [clauseLibraryItems, selectedClauseKey]);

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
      if (!templateForm.name.trim()) throw new Error("Vul een referentie voor de template in.");
      if (!templateForm.template_type) throw new Error("Kies eerst het soort contracttemplate.");
      const isEmploymentTemplate = isEmploymentTemplateType(templateForm.template_type);
      if (isEmploymentTemplate && !templateForm.cao_key) throw new Error("Kies eerst de CAO die voor dit bedrijf geldt.");
      const contractModel = isEmploymentTemplate ? getContractModel(templateForm.contract_model) : null;
      if (isEmploymentTemplate && !contractModel) throw new Error("Kies eerst een specifieke contractvorm.");
      if (isEmploymentTemplate && (!Array.isArray(templateForm.duration_options) || templateForm.duration_options.length === 0)) {
        throw new Error("Selecteer minimaal één duurkeuze voor deze template.");
      }
      const editorBlocks = normalizeContractTemplateBlocks(templateForm.editor_blocks, templateForm.body);
      const body = contractTemplateBodyFromBlocks(editorBlocks);
      if (!body.trim()) throw new Error("Voeg minimaal één gevuld artikelblok toe.");
      const persistedTemplates = await base44.entities.CompanyContractTemplate.filter({ company_id: companyId }, "-created_date");
      const currentTemplates = Array.isArray(persistedTemplates) ? persistedTemplates : templates;
      const previous = editingTemplateId ? currentTemplates.find(item => item.id === editingTemplateId) || {} : {};
      const templateFamilyKey = `${contractTemplateScopeKey({
        template_type: normalizeTemplateType(templateForm.template_type),
        cao_key: isEmploymentTemplate ? templateForm.cao_key : "",
        contract_model: contractModel?.value || "",
      })}::${normalizeTemplateReference(templateForm.name)}`;
      const originalFamilyKey = previous.id ? contractTemplateFamilyKey(previous) : templateForm.version_family_key;
      const duplicateReference = currentTemplates.find(item => (
        item.id !== editingTemplateId
        && contractTemplateFamilyKey(item) === templateFamilyKey
      ));
      const duplicateAllowed = Boolean(templateForm.is_new_version && originalFamilyKey === templateFamilyKey);
      const existingFamilyRename = Boolean(previous.id && originalFamilyKey === templateFamilyKey);
      if (duplicateReference && !duplicateAllowed && !existingFamilyRename) {
        throw new Error("Deze referentie bestaat al binnen dezelfde contractcategorie, CAO en contractvorm. Open de bestaande regel en maak daar een nieuwe versie aan.");
      }
      const status = statusOverride || templateForm.status || "draft";
      const unknownPlaceholders = getUnknownContractTemplatePlaceholders(body);
      if (status === "published" && templateForm.standard_template_id && unknownPlaceholders.length > 0) {
        throw new Error(`Publiceren is geblokkeerd: ${unknownPlaceholders.length} placeholder${unknownPlaceholders.length === 1 ? " is" : "s zijn"} niet gekoppeld aan de applicatie.`);
      }
      const missingRequiredPlaceholders = templateForm.standard_template_id === PB_FULLTIME_STANDARD_TEMPLATE_ID
        ? getMissingStandardTemplatePlaceholders(body)
        : [];
      if (status === "published" && missingRequiredPlaceholders.length > 0) {
        throw new Error(`Publiceren is geblokkeerd: essentiële placeholders ontbreken (${missingRequiredPlaceholders.join(", ")}).`);
      }
      const createNewVersion = Boolean(templateForm.is_new_version);
      const version = createNewVersion
        ? nextContractTemplateVersion(currentTemplates, templateFamilyKey)
        : Number(previous.version || templateForm.version || 1);
      const clauseIds = sortClauseIdsByConfiguredOrder(extractClauseIds(body), clauses);
      const appliedPreset = templateForm.standard_template_id
        ? getStandardContractTemplatePreset(templateForm)
        : null;
      const auditMetadata = buildAuditMetadata(
        currentUser,
        createNewVersion ? "nieuwe versie" : (editingTemplateId ? "gewijzigd" : "toegevoegd"),
        createNewVersion ? {} : (previous.metadata || {}),
        auditActors
      );
      const payload = {
        company_id: companyId,
        name: templateForm.name.trim(),
        reference_key: normalizeTemplateReference(templateForm.name),
        template_family_key: templateFamilyKey,
        version_source_id: createNewVersion ? (templateForm.version_source_id || null) : (previous.version_source_id || previous.metadata?.version_source_id || null),
        description: templateForm.description || null,
        template_type: normalizeTemplateType(templateForm.template_type),
        contract_form_scope: contractModel?.contract_form || "any",
        employment_model_scope: contractModel?.employment_model || "any",
        probation_scope: templateForm.probation_scope || "any",
        duration_type_scope: contractModel?.duration_type || "any",
        duration_options: isEmploymentTemplate ? templateForm.duration_options : null,
        visible_in_contract_wizard: isEmploymentTemplate ? templateForm.visible_in_contract_wizard !== false : false,
        cao_key: isEmploymentTemplate ? (templateForm.cao_key || null) : null,
        function_type: templateForm.function_type || null,
        default_letterhead_id: templateForm.default_letterhead_id === "none" ? null : templateForm.default_letterhead_id,
        version,
        status,
        body,
        editor_blocks: editorBlocks,
        clause_ids: clauseIds,
        placeholders: extractPlaceholders(expandClauseMarkers(body, activeClauses))
          .filter(placeholder => !placeholder.startsWith(CLAUSE_MARKER_PREFIX)),
        metadata: {
          ...auditMetadata,
          contract_model: contractModel?.value || null,
          underlying_contract_form: contractModel?.underlying_contract_form || null,
          template_document_type_label: templateDocumentTypeLabel(templateForm.template_type),
          standard_template_id: templateForm.standard_template_id || null,
          standard_template_version: templateForm.standard_template_version || null,
          standard_template_legal_basis: appliedPreset?.legal_basis || null,
          template_family_key: templateFamilyKey,
          version_source_id: createNewVersion ? (templateForm.version_source_id || null) : (previous.metadata?.version_source_id || null),
          editor_blocks: editorBlocks,
          template_editor_version: 1,
        },
      };
      return editingTemplateId && !createNewVersion
        ? base44.entities.CompanyContractTemplate.update(editingTemplateId, payload)
        : base44.entities.CompanyContractTemplate.create(payload);
    },
    onSuccess: () => {
      setTemplateForm(initialTemplate(companyId));
      setEditingTemplateId(null);
      setEditingTemplateBlockId(null);
      setTemplateBlockDraft(null);
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
        license_scope: clauseForm.license_scope || null,
        function_profile: clauseForm.function_profile || null,
        risk_level: clauseForm.risk_level || currentClauseDefinition?.risk || "green",
        review_required: Boolean(clauseForm.review_required || currentClauseDefinition?.reviewRequired || currentClauseDefinition?.risk === "red"),
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
          license_scope_label: clauseSecurityContextLabel(clauseForm.license_scope),
          function_profile_label: functionProfileLabel(clauseForm.function_profile),
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
      setClauseDirectEditMode(false);
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

  const closeTemplateWizardForBrowserNavigation = () => {
    setEditingTemplateId(null);
    setTemplateWizardOpen(false);
    setTemplateStep(1);
    setTemplateForm(initialTemplate(companyId));
  };

  const selectTemplateBrowserType = (templateType) => {
    setMessage(null);
    setTemplateBrowserType(templateType);
    setTemplateBrowserCaoKey("");
    setTemplateBrowserContractModel("");
    closeTemplateWizardForBrowserNavigation();
  };

  const selectTemplateBrowserCao = (caoKey) => {
    setMessage(null);
    setTemplateBrowserCaoKey(caoKey);
    setTemplateBrowserContractModel("");
    closeTemplateWizardForBrowserNavigation();
  };

  const selectTemplateBrowserContractModel = (modelValue) => {
    setMessage(null);
    setTemplateBrowserContractModel(modelValue);
    closeTemplateWizardForBrowserNavigation();
  };

  const backToTemplateBrowserCategories = () => {
    setMessage(null);
    setTemplateBrowserType("");
    setTemplateBrowserCaoKey("");
    setTemplateBrowserContractModel("");
    closeTemplateWizardForBrowserNavigation();
  };

  const backToTemplateBrowserCaos = () => {
    setMessage(null);
    setTemplateBrowserCaoKey("");
    setTemplateBrowserContractModel("");
    closeTemplateWizardForBrowserNavigation();
  };

  const backToTemplateBrowserContractModels = () => {
    setMessage(null);
    setTemplateBrowserContractModel("");
    closeTemplateWizardForBrowserNavigation();
  };

  const startNewTemplateFromBrowser = () => {
    if (!templateBrowserType) return;
    const isEmploymentTemplate = isEmploymentTemplateType(templateBrowserType);
    const contractModel = isEmploymentTemplate ? getContractModel(templateBrowserContractModel) : null;
    if (isEmploymentTemplate && !templateBrowserCaoKey) {
      setMessage({ type: "error", text: "Kies eerst de CAO voor dit arbeidscontract." });
      return;
    }
    if (isEmploymentTemplate && !contractModel) {
      setMessage({ type: "error", text: "Kies eerst het soort arbeidscontract." });
      return;
    }

    const defaultLetterhead = activeLetterheads.find(item => item.is_default) || activeLetterheads[0];
    const nextForm = {
      ...initialTemplate(companyId),
      default_letterhead_id: defaultLetterhead?.id || "none",
      template_type: templateBrowserType,
      template_choice: "new",
      visible_in_contract_wizard: isEmploymentTemplate,
    };

    let nextStep = templateSourceStep(templateBrowserType);
    if (isEmploymentTemplate) {
      nextForm.cao_key = templateBrowserCaoKey;
      nextForm.contract_model = contractModel.value;
      nextForm.contract_form_scope = contractModel.contract_form || "";
      nextForm.employment_model_scope = contractModel.employment_model || "";
      nextForm.duration_type_scope = contractModel.duration_type || "";
      nextForm.duration_options = durationOptionsForContractTemplate(nextForm).map(option => option.value);
    }

    setMessage(null);
    setEditingTemplateId(null);
    setTemplateForm(nextForm);
    setTemplateStep(nextStep);
    setTemplateWizardOpen(true);
  };

  const startEditTemplate = (record) => {
    if (["published", "archived"].includes(record.status)) {
      setMessage({
        type: "error",
        text: `Versie ${record.version || 1} is ${record.status === "published" ? "gepubliceerd" : "gearchiveerd"} en kan niet rechtstreeks worden gewijzigd. Maak via de versieregel een nieuwe versie aan.`,
      });
      return;
    }
    setMessage(null);
    setEditingTemplateId(record.id);
    const nextForm = templateFormFromRecord(companyId, record);
    setTemplateForm(nextForm);
    setEditingTemplateBlockId(null);
    setTemplateBlockDraft(null);
    setTemplateStep(templateEditorStep(nextForm.template_type));
    setTemplateWizardOpen(true);
  };

  const createNewTemplateVersion = (record) => {
    const familyKey = contractTemplateFamilyKey(record);
    const familyVersions = templates.filter(item => contractTemplateFamilyKey(item) === familyKey);
    const existingDraft = familyVersions
      .filter(item => ["draft", "review"].includes(item.status))
      .sort((a, b) => Number(b.version || 1) - Number(a.version || 1))[0];
    if (existingDraft) {
      setMessage({ type: "error", text: `Voor deze referentie bestaat al een open versie ${existingDraft.version || 1}. Die versie is geopend.` });
      setEditingTemplateId(existingDraft.id);
      const draftForm = templateFormFromRecord(companyId, existingDraft);
      setTemplateForm(draftForm);
      setEditingTemplateBlockId(null);
      setTemplateBlockDraft(null);
      setTemplateStep(templateEditorStep(draftForm.template_type));
      setTemplateWizardOpen(true);
      return;
    }
    setMessage(null);
    setEditingTemplateId(null);
    const nextForm = {
      ...templateFormFromRecord(companyId, record),
      template_choice: "new",
      template_source_mode: "existing",
      version: nextContractTemplateVersion(templates, familyKey),
      status: "draft",
      is_new_version: true,
      version_source_id: record.id,
      version_family_key: familyKey,
    };
    setTemplateForm(nextForm);
    setEditingTemplateBlockId(null);
    setTemplateBlockDraft(null);
    setTemplateStep(templateEditorStep(nextForm.template_type));
    setTemplateWizardOpen(true);
  };

  const cancelTemplateWizard = () => {
    setTemplateForm(initialTemplate(companyId));
    setEditingTemplateId(null);
    setEditingTemplateBlockId(null);
    setTemplateBlockDraft(null);
    setPlaceholderSearch("");
    setTemplateStep(1);
    setTemplateWizardOpen(false);
  };

  const selectTemplateDocumentType = (templateType) => {
    const defaultLetterhead = activeLetterheads.find(item => item.is_default) || activeLetterheads[0];
    setMessage(null);
    setEditingTemplateId(null);
    setTemplateForm(prev => ({
      ...initialTemplate(companyId),
      default_letterhead_id: prev.default_letterhead_id || defaultLetterhead?.id || "none",
      template_type: templateType,
      visible_in_contract_wizard: isEmploymentTemplateType(templateType),
      body: "",
    }));
    setTemplateStep(isEmploymentTemplateType(templateType) ? 2 : 2);
  };

  const selectTemplateCao = (caoKey) => {
    const continueNewTemplateFlow = templateForm.template_choice === "new" && templateForm.contract_model;
    setTemplateForm(prev => ({
      ...prev,
      cao_key: caoKey,
      contract_model: prev.contract_model || "",
      contract_form_scope: prev.contract_form_scope || "",
      employment_model_scope: prev.employment_model_scope || "",
      duration_type_scope: prev.duration_type_scope || "",
      template_choice: continueNewTemplateFlow ? "new" : "",
      template_source_mode: "",
      body: "",
      name: "",
      standard_template_id: null,
      standard_template_version: null,
    }));
    setMessage(null);
    if (continueNewTemplateFlow) {
      setTemplateStep(templateSourceStep(templateForm.template_type));
    }
  };

  const selectTemplateContractModel = (modelValue) => {
    const option = getContractModel(modelValue);
    setTemplateForm(prev => ({
      ...prev,
      contract_model: modelValue,
      contract_form_scope: option?.contract_form || "",
      employment_model_scope: option?.employment_model || "",
      duration_type_scope: option?.duration_type || "",
      probation_scope: "any",
      template_choice: "",
      template_source_mode: "",
      body: "",
      name: "",
      duration_options: durationOptionsForContractTemplate({
        ...prev,
        contract_model: modelValue,
      }).map(durationOption => durationOption.value),
      standard_template_id: null,
      standard_template_version: null,
    }));
    setMessage(null);
  };

  const chooseExistingTemplateForEditing = (record) => {
    if (["published", "archived"].includes(record.status)) {
      setMessage({ type: "error", text: "Deze versie is definitief. Maak vanuit de tabel een nieuwe versie aan om wijzigingen te doen." });
      return;
    }
    setMessage(null);
    setEditingTemplateId(record.id);
    const nextForm = templateFormFromRecord(companyId, record);
    setTemplateForm(nextForm);
    setEditingTemplateBlockId(null);
    setTemplateBlockDraft(null);
    setTemplateStep(templateEditorStep(nextForm.template_type));
  };

  const chooseNewTemplateForWizard = () => {
    const defaultLetterhead = activeLetterheads.find(item => item.is_default) || activeLetterheads[0];
    setMessage(null);
    setEditingTemplateId(null);
    setTemplateForm(prev => ({
      ...prev,
      template_choice: "new",
      template_source_mode: "",
      name: prev.name || defaultTemplateName(prev),
      version: 1,
      status: "draft",
      body: "",
      default_letterhead_id: prev.default_letterhead_id || defaultLetterhead?.id || "none",
    }));
    setTemplateStep(templateSourceStep(templateForm.template_type));
  };

  const applyTemplateSourceMode = (sourceMode) => {
    const preset = sourceMode === "standard" ? getStandardContractTemplatePreset(templateForm) : null;
    const body = sourceMode === "standard" ? standardTemplateBody(templateForm) : "";
    if (sourceMode === "standard" && !body) {
      setMessage({
        type: "error",
        text: "Voor deze combinatie is nog geen gecontroleerde standaardtemplate beschikbaar. Kies een lege template of een andere combinatie.",
      });
      return;
    }
    const editorBlocks = sourceMode === "standard"
      ? contractTemplateBlocksFromBody(body)
      : [createEmptyContractTemplateBlock()];
    setTemplateForm({
      ...templateForm,
      template_source_mode: sourceMode,
      name: templateForm.name || preset?.name || defaultTemplateName(templateForm),
      description: preset?.description || templateForm.description,
      body: contractTemplateBodyFromBlocks(editorBlocks),
      editor_blocks: editorBlocks,
      duration_options: isEmploymentTemplateType(templateForm.template_type)
        ? (templateForm.duration_options?.length > 0
          ? templateForm.duration_options
          : durationOptionsForContractTemplate(templateForm).map(option => option.value))
        : [],
      standard_template_id: preset?.id || null,
      standard_template_version: preset?.version || null,
    });
    setMessage(null);
    setTemplateStep(templateEditorStep(templateForm.template_type));
  };

  const updateTemplateBlocks = (updater) => {
    setTemplateForm(prev => {
      const current = normalizeContractTemplateBlocks(prev.editor_blocks, prev.body);
      const next = typeof updater === "function" ? updater(current) : updater;
      const normalized = normalizeContractTemplateBlocks(next, prev.body);
      return {
        ...prev,
        editor_blocks: normalized,
        body: contractTemplateBodyFromBlocks(normalized),
      };
    });
  };

  const openTemplateBlockEditor = (block) => {
    setMessage(null);
    setEditingTemplateBlockId(block.id);
    setTemplateBlockDraft({
      title: block.title || "",
      content_html: block.content_html || "<p><br></p>",
    });
    setPlaceholderSearch("");
  };

  const cancelTemplateBlockEditor = () => {
    setEditingTemplateBlockId(null);
    setTemplateBlockDraft(null);
    setPlaceholderSearch("");
  };

  const saveTemplateBlock = () => {
    if (!templateBlockDraft?.title?.trim()) {
      setMessage({ type: "error", text: "Vul een titel voor dit artikelblok in." });
      return;
    }
    const contentHtml = sanitizeContractBlockHtml(templateBlockDraft.content_html);
    if (!contractBlockHtmlToPlainText(contentHtml)) {
      setMessage({ type: "error", text: "Vul tekst voor dit artikelblok in." });
      return;
    }
    updateTemplateBlocks(blocks => blocks.map(block => (
      block.id === editingTemplateBlockId
        ? { ...block, title: templateBlockDraft.title.trim(), content_html: contentHtml }
        : block
    )));
    setEditingTemplateBlockId(null);
    setTemplateBlockDraft(null);
    setPlaceholderSearch("");
    setMessage(null);
  };

  const addTemplateArticleBlock = () => {
    const blocks = normalizeContractTemplateBlocks(templateForm.editor_blocks, templateForm.body);
    const articleNumber = blocks.filter(block => block.kind === "article").length + 1;
    const block = {
      ...createEmptyContractTemplateBlock(blocks.length),
      article_number: articleNumber,
      title: "Nieuw artikel",
      content_html: `<p>${articleNumber}.1 Nieuwe bepaling</p>`,
    };
    updateTemplateBlocks([...blocks, block]);
    openTemplateBlockEditor(block);
  };

  const deleteTemplateBlock = () => {
    const blocks = normalizeContractTemplateBlocks(templateForm.editor_blocks, templateForm.body);
    if (blocks.length <= 1) {
      setMessage({ type: "error", text: "Een template moet minimaal één artikelblok bevatten." });
      return;
    }
    updateTemplateBlocks(blocks.filter(block => block.id !== editingTemplateBlockId));
    cancelTemplateBlockEditor();
    setMessage({ type: "success", text: "Artikelblok verwijderd." });
  };

  const handleTemplateBlockDragEnd = ({ source, destination }) => {
    if (!destination || source.index === destination.index) return;
    updateTemplateBlocks(blocks => {
      const reordered = [...blocks];
      const [moved] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, moved);
      return reordered;
    });
  };

  const toggleTemplateDurationOption = (value) => {
    setTemplateForm(prev => {
      const selected = new Set(prev.duration_options || []);
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      return { ...prev, duration_options: [...selected] };
    });
  };

  const insertTemplatePlaceholder = (key) => {
    const editor = templateRichEditorRef.current?.getEditor?.();
    if (!editor) return;
    const range = editor.getSelection(true) || { index: editor.getLength() - 1, length: 0 };
    const placeholder = `{$${key}}`;
    editor.insertText(range.index, placeholder, "user");
    editor.setSelection(range.index + placeholder.length, 0, "silent");
    editor.focus();
  };

  const runTemplateEditorHistory = (action) => {
    const editor = templateRichEditorRef.current?.getEditor?.();
    if (!editor?.history?.[action]) return;
    editor.history[action]();
    editor.focus();
  };

  const toggleTemplateFamily = (familyKey) => {
    setExpandedTemplateFamilies(current => (
      current.includes(familyKey)
        ? current.filter(key => key !== familyKey)
        : [...current, familyKey]
    ));
  };

  const nextTemplateStep = () => {
    if (templateStep === 1) {
      if (!templateForm.template_type) {
        setMessage({ type: "error", text: "Kies eerst het soort contracttemplate." });
        return;
      }
      setMessage(null);
      setTemplateStep(isEmploymentTemplateType(templateForm.template_type) ? 2 : 2);
      return;
    }
    if (isEmploymentTemplateType(templateForm.template_type) && templateStep === 2) {
      if (!templateForm.cao_key) {
        setMessage({ type: "error", text: "Kies eerst de CAO die voor dit bedrijf geldt." });
        return;
      }
      setMessage(null);
      setTemplateStep(3);
      return;
    }
    if (isEmploymentTemplateType(templateForm.template_type) && templateStep === 3 && !getContractModel(templateForm.contract_model)) {
      setMessage({ type: "error", text: "Kies eerst een specifieke contractvorm." });
      return;
    }
    if (templateStep === templateSelectionStep(templateForm.template_type) && templateForm.template_choice !== "new") {
      setMessage({ type: "error", text: "Kies een bestaande template of maak een nieuwe template." });
      return;
    }
    if (templateStep === templateSourceStep(templateForm.template_type) && !templateForm.template_source_mode) {
      setMessage({ type: "error", text: "Kies of je met een standaardtemplate of lege template wilt starten." });
      return;
    }
    setMessage(null);
    setTemplateStep(step => Math.min(step + 1, templateWizardSteps(templateForm).length));
  };

  const previousTemplateStep = () => {
    const selectionStep = templateSelectionStep(templateForm.template_type);
    const sourceStep = templateSourceStep(templateForm.template_type);
    const editorStep = templateEditorStep(templateForm.template_type);
    if (templateStep === editorStep) {
      setTemplateStep(templateForm.template_source_mode === "existing" ? selectionStep : sourceStep);
      return;
    }
    if (templateStep === sourceStep) {
      setTemplateStep(selectionStep);
      return;
    }
    setTemplateStep(step => Math.max(1, step - 1));
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
      license_scope: scope === "employment_contracts" ? "all_security" : "not_applicable",
      function_profile: "",
      risk_level: "green",
      review_required: false,
      title: "",
      sections: [{ id: createClauseSectionId(), text: "" }],
      body: "",
    }));
    setSelectedClauseSectionIndex(0);
    setMessage(null);
    setClauseStep(2);
  };

  const selectClauseType = (type) => {
    const definition = clauseDefinition(clauseForm.scope, type, clauseForm.license_scope);
    const sections = defaultClauseSections(definition, clauseForm.license_scope);
    setClauseForm(prev => ({
      ...prev,
      clause_type: type,
      title: definition?.label || prev.title || "",
      risk_level: definition?.risk || "green",
      review_required: Boolean(definition?.reviewRequired || definition?.risk === "red"),
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

  const startEditClause = (record) => {
    setMessage(null);
    setEditingClauseId(record.id);
    const inferred = inferClauseCatalog(record);
    const canDirectEdit = Boolean(inferred.scope && inferred.type);
    setClauseForm({
      company_id: companyId,
      scope: inferred.scope,
      clause_type: inferred.type,
      license_scope: record.license_scope || "",
      function_profile: record.function_profile || "",
      risk_level: record.risk_level || "green",
      review_required: Boolean(record.review_required),
      title: record.title || "",
      sections: editableClauseSections(record),
      body: record.body || "",
      sort_order: Number(record.sort_order || 0),
      status: record.status || "active",
    });
    setClauseDirectEditMode(canDirectEdit);
    setClauseStep(canDirectEdit ? 3 : 1);
    setSelectedClauseSectionIndex(0);
    setClauseWizardOpen(true);
  };

  const startEditCatalogClause = (scope, definition) => {
    if (!definition) return;
    const variant = findCatalogClauseVariant(activeClauses, scope, definition.value);
    if (variant) {
      startEditClause(variant);
      return;
    }

    const licenseScope = clauseDefaultLicenseScope(scope);
    const sections = defaultClauseSections(definition, licenseScope);
    const lastOrder = activeClauses.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0);
    setMessage(null);
    setEditingClauseId(null);
    setClauseDirectEditMode(true);
    setClauseForm({
      ...initialClause(companyId, lastOrder + 10),
      scope,
      clause_type: definition.value,
      license_scope: licenseScope,
      title: definition.label || "",
      risk_level: definition.risk || "green",
      review_required: Boolean(definition.reviewRequired || definition.risk === "red"),
      sections,
      body: buildClauseBodyFromSections(sections),
    });
    setClauseStep(3);
    setSelectedClauseSectionIndex(0);
    setClauseWizardOpen(true);
  };

  const cancelClauseWizard = () => {
    setClauseForm(initialClause(companyId));
    setEditingClauseId(null);
    setClauseDirectEditMode(false);
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
                        <div className="min-w-0">
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
                          <div className="min-w-0">
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
    const isEmploymentTemplate = isEmploymentTemplateType(templateForm.template_type);
    const selectionStep = templateSelectionStep(templateForm.template_type);
    const sourceStep = templateSourceStep(templateForm.template_type);
    const editorStep = templateEditorStep(templateForm.template_type);
    const wizardPrefilled = templateForm.template_choice === "new" && templateStep >= sourceStep, wizardSteps = wizardPrefilled ? templateWizardSteps(templateForm).slice(sourceStep - 1) : templateWizardSteps(templateForm), displayStep = wizardPrefilled ? templateStep - sourceStep + 1 : templateStep;
    const contractModelOptions = contractModelOptionsForCao(templateForm.cao_key);
    const templateBlocks = normalizeContractTemplateBlocks(templateForm.editor_blocks, templateForm.body);
    const editingTemplateBlock = templateBlocks.find(block => block.id === editingTemplateBlockId) || null;
    let articleOrdinal = 0;
    const templateBlockRows = templateBlocks.map(block => {
      if (block.kind === "article") articleOrdinal += 1;
      return {
        ...block,
        display_label: block.kind === "article"
          ? `Artikel ${articleOrdinal}`
          : (block.kind === "closing" ? "Slot" : "Aanhef"),
      };
    });

    return (
      <AnimatePresence>
        {templateWizardOpen && (
          <motion.div
            ref={templateWizardRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-none border-0 border-b border-primary/30 bg-muted/20 p-5 overflow-hidden"
          >
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">
                {templateForm.is_new_version
                  ? "Nieuwe contracttemplateversie"
                  : (editingTemplateId ? "Contracttemplate bewerken" : "Contracttemplate maken")}
              </p>
              <WizardSteps labels={wizardSteps} step={Math.min(displayStep, wizardSteps.length)} />

              {templateStep === 1 && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Wat voor soort template wil je maken?</p>
                    <p className="mt-1 text-xs text-muted-foreground">Kies eerst de documentsoort. Daarna toont de wizard alleen de keuzes die daarbij horen.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {TEMPLATE_DOCUMENT_TYPES.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => selectTemplateDocumentType(option.value)}
                        className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${templateForm.template_type === option.value ? "border-primary bg-accent" : "border-border bg-card"}`}
                      >
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-foreground">{option.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{option.description}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isEmploymentTemplate && templateStep === 2 && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Kies de actieve CAO</p>
                    <p className="mt-1 text-xs text-muted-foreground">Alleen CAO's die bij dit bedrijfsprofiel zijn gekoppeld worden getoond.</p>
                  </div>
                  {companyCaoOptions.length === 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      Voeg eerst een CAO-koppeling toe in de CAO-tab van dit bedrijfsprofiel.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {companyCaoOptions.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => selectTemplateCao(option.value)}
                          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${templateForm.cao_key === option.value ? "border-primary bg-accent" : "border-border bg-card"}`}
                        >
                          <div>
                            <span className="text-sm font-semibold text-foreground">{option.label}</span>
                            <span className="ml-2 text-xs text-muted-foreground">Actief gekoppeld aan dit bedrijf</span>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isEmploymentTemplate && templateStep === 3 && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Kies de contractvorm</p>
                    <p className="mt-1 text-xs text-muted-foreground">De lijst is specifiek voor arbeidscontracten. Er is geen algemene optie meer.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {contractModelOptions.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => selectTemplateContractModel(option.value)}
                        className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${templateForm.contract_model === option.value ? "border-primary bg-accent" : "border-border bg-card"}`}
                      >
                        <div>
                          <span className="text-sm font-semibold text-foreground">{option.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{contractModelMeta(option)}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {templateStep === selectionStep && templateForm.template_type && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Kies een bestaande template of maak een nieuwe</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isEmploymentTemplate
                          ? `${caoLabel(templateForm.cao_key)} · ${selectedContractModel?.label || "Contractvorm"}`
                          : templateDocumentTypeLabel(templateForm.template_type)}
                      </p>
                    </div>
                    <Button type="button" onClick={chooseNewTemplateForWizard}>
                      <Plus className="mr-1 h-4 w-4" />
                      Nieuwe template
                    </Button>
                  </div>
                  {matchingTemplateChoices.length === 0 ? (
                    <div className="rounded-lg border border-border bg-background/40 p-5 text-sm text-muted-foreground">
                      Er is nog geen passende template. Maak een nieuwe template om te starten.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {matchingTemplateChoices.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => chooseExistingTemplateForEditing(item)}
                          className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/35"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{item.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{item.description || getTemplateScopeLabel(item)}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge variant="outline" className="text-xs">{templateDocumentTypeLabel(item.template_type)}</Badge>
                              {item.cao_key && <Badge variant="outline" className="text-xs">{caoLabel(item.cao_key)}</Badge>}
                              <Badge variant="outline" className="text-xs">v{item.version || 1}</Badge>
                              {statusBadge(item.status)}
                            </div>
                          </div>
                          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {templateStep === sourceStep && templateForm.template_choice === "new" && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Waarmee wil je starten?</p>
                    <p className="mt-1 text-xs text-muted-foreground">Kies een voorgevulde basis of begin met een lege editor.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => applyTemplateSourceMode("standard")}
                      disabled={!standardTemplateSourceAvailable}
                      className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border disabled:hover:bg-card"
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-foreground">Standaardtemplate invoegen</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {selectedStandardTemplatePreset
                            ? `${selectedStandardTemplatePreset.legal_basis.cao_version} · juridisch en technisch gekoppelde placeholders`
                            : standardTemplateSourceAvailable
                              ? "Start met een basisstructuur die past bij de gekozen documentsoort."
                              : "Voor deze combinatie is nog geen gecontroleerde standaardtemplate beschikbaar."}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTemplateSourceMode("empty")}
                      className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99]"
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-foreground">Lege template</span>
                        <span className="ml-2 text-xs text-muted-foreground">Begin met een leeg tekstveld en bouw de template volledig zelf op.</span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              )}

              {templateStep === editorStep && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-[260px] flex-1 space-y-2">
                      <Label>Referentie *</Label>
                      <Input
                        value={templateForm.name}
                        onChange={event => setTemplateForm(prev => ({ ...prev, name: event.target.value }))}
                        placeholder={defaultTemplateName(templateForm)}
                        readOnly={templateReferenceLocked}
                        aria-describedby={templateReferenceLocked ? "template-reference-lock-note" : undefined}
                      />
                      {templateReferenceLocked && (
                        <p id="template-reference-lock-note" className="text-xs text-muted-foreground">
                          De referentie blijft gelijk binnen een versiereeks.
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="h-9 px-3 text-xs">
                      Versie {templateForm.version || 1}
                    </Badge>
                  </div>

                  {templateForm.standard_template_id === PB_FULLTIME_STANDARD_TEMPLATE_ID && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/25 dark:text-emerald-100">
                      <span>CAO Particuliere Beveiliging · versie 3, juli 2026 · fulltime 144 uur per vier weken</span>
                      <Badge variant="outline" className="border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200">
                        Standaard v{templateForm.standard_template_version || 1}
                      </Badge>
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Briefpapier</Label>
                      <Select value={templateForm.default_letterhead_id || "none"} onValueChange={value => setTemplateForm(prev => ({ ...prev, default_letterhead_id: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Geen briefpapier</SelectItem>
                          {activeLetterheads.map(item => (
                            <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {isEmploymentTemplate && (
                      <div className="space-y-2">
                        <Label>Duurkeuzes *</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button type="button" variant="outline" className="h-10 w-full justify-between px-3 font-normal">
                              <span className="min-w-0 flex-1 truncate text-left">
                                <span className="hidden sm:inline">
                                  {selectedTemplateDurationLabels.length > 0
                                    ? `${selectedTemplateDurationLabels.length} geselecteerd: ${selectedTemplateDurationLabels.join(", ")}`
                                    : "Selecteer één of meerdere duurkeuzes"}
                                </span>
                                <span className="sm:hidden">
                                  {selectedTemplateDurationLabels.length > 0
                                    ? `${selectedTemplateDurationLabels.length} duurkeuzes geselecteerd`
                                    : "Selecteer duurkeuzes"}
                                </span>
                              </span>
                              <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-[420px] max-w-[calc(100vw-2rem)] p-2">
                            <div className="mb-2 flex items-center justify-between border-b border-border px-2 pb-2">
                              <span className="text-xs font-medium text-muted-foreground">Toepasbaar op deze contractvorm</span>
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setTemplateForm(prev => ({ ...prev, duration_options: availableTemplateDurationOptions.map(option => option.value) }))}
                                >
                                  Alles
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setTemplateForm(prev => ({ ...prev, duration_options: [] }))}
                                >
                                  Wissen
                                </Button>
                              </div>
                            </div>
                            <div className="max-h-[330px] space-y-1 overflow-y-auto">
                              {availableTemplateDurationOptions.map(option => {
                                const checked = (templateForm.duration_options || []).includes(option.value);
                                return (
                                  <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-accent">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={() => toggleTemplateDurationOption(option.value)}
                                      className="mt-0.5"
                                    />
                                    <span className="min-w-0">
                                      <span className="block text-sm font-medium text-foreground">{option.label}</span>
                                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{option.description}</span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </div>

                  {isEmploymentTemplate && (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={templateForm.visible_in_contract_wizard !== false}
                        onCheckedChange={checked => setTemplateForm(prev => ({ ...prev, visible_in_contract_wizard: checked === true }))}
                      />
                      Zichtbaar in personeelscontractwizard
                    </label>
                  )}

                  {editingTemplateBlock && templateBlockDraft ? (
                    <div className="space-y-4 border-t border-border pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={cancelTemplateBlockEditor}>
                            <ChevronLeft className="mr-1 h-4 w-4" />
                            Terug naar blokken
                          </Button>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{editingTemplateBlock.kind === "article" ? "Artikel bewerken" : "Blok bewerken"}</p>
                            <p className="text-xs text-muted-foreground">Wijzigingen verschijnen na opslaan direct in de preview.</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={cancelTemplateBlockEditor}>Annuleren</Button>
                          <Button type="button" size="sm" onClick={saveTemplateBlock}>
                            <Save className="mr-1 h-4 w-4" />
                            Blok opslaan
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Titel *</Label>
                        <Input
                          value={templateBlockDraft.title}
                          onChange={event => setTemplateBlockDraft(prev => ({ ...prev, title: event.target.value }))}
                          placeholder="Bijvoorbeeld Functie, werkzaamheden en werkplek"
                        />
                      </div>

                      <div className="overflow-hidden rounded-lg border border-border bg-background">
                        <div id="template-block-toolbar" className="ql-toolbar ql-snow flex min-h-11 flex-wrap items-center gap-1 border-0 border-b border-border bg-muted/20 px-2 py-1.5">
                          <span className="ql-formats">
                            <select className="ql-header" defaultValue="" aria-label="Tekststijl">
                              <option value="2">Kop</option>
                              <option value="3">Subkop</option>
                              <option value="">Paragraaf</option>
                            </select>
                          </span>
                          <span className="ql-formats">
                            <button type="button" className="ql-bold" aria-label="Vet"><Bold className="h-4 w-4" /></button>
                            <button type="button" className="ql-italic" aria-label="Cursief"><Italic className="h-4 w-4" /></button>
                            <button type="button" className="ql-underline" aria-label="Onderstrepen"><Underline className="h-4 w-4" /></button>
                            <button type="button" className="ql-strike" aria-label="Doorhalen"><Strikethrough className="h-4 w-4" /></button>
                          </span>
                          <span className="ql-formats">
                            <button type="button" className="ql-list" value="ordered" aria-label="Genummerde lijst"><ListOrdered className="h-4 w-4" /></button>
                            <button type="button" className="ql-list" value="bullet" aria-label="Opsomming"><List className="h-4 w-4" /></button>
                            <button type="button" className="ql-indent" value="-1" aria-label="Inspringing verkleinen" />
                            <button type="button" className="ql-indent" value="+1" aria-label="Inspringing vergroten" />
                          </span>
                          <span className="ql-formats">
                            <button type="button" className="ql-blockquote" aria-label="Citaat" />
                            <button type="button" className="ql-link" aria-label="Link" />
                            <button type="button" className="ql-clean" aria-label="Opmaak wissen" />
                          </span>
                          <span className="ml-auto flex items-center gap-1">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Ongedaan maken" onClick={() => runTemplateEditorHistory("undo")}>
                              <Undo2 className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Opnieuw" onClick={() => runTemplateEditorHistory("redo")}>
                              <Redo2 className="h-4 w-4" />
                            </Button>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button type="button" variant="outline" size="sm" className="h-8 !w-auto shrink-0 px-2">
                                  <Braces className="mr-1 h-4 w-4" />
                                  Placeholders
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-[390px] max-w-[calc(100vw-2rem)] p-3">
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">Placeholderbibliotheek</p>
                                    <p className="mt-1 text-xs text-muted-foreground">Klik om de placeholder op de cursorpositie in te voegen.</p>
                                  </div>
                                  <Input
                                    value={placeholderSearch}
                                    onChange={event => setPlaceholderSearch(event.target.value)}
                                    placeholder="Zoek op naam of gegevensbron"
                                  />
                                  <TooltipProvider delayDuration={250}>
                                    <div className="max-h-[320px] space-y-1 overflow-y-auto">
                                      {filteredPlaceholderDefinitions.map(item => (
                                        <Tooltip key={item.key}>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
                                              onClick={() => insertTemplatePlaceholder(item.key)}
                                            >
                                              <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium text-foreground">{item.label}</span>
                                                <span className="block truncate font-mono text-[11px] text-primary">{`{$${item.key}}`}</span>
                                              </span>
                                              <span className="shrink-0 text-[11px] text-muted-foreground">{item.source}</span>
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="left" className="max-w-[280px]">
                                            Wordt gevuld met {item.label.toLowerCase()} uit {item.source.toLowerCase()}.
                                          </TooltipContent>
                                        </Tooltip>
                                      ))}
                                      {filteredPlaceholderDefinitions.length === 0 && (
                                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">Geen placeholders gevonden.</p>
                                      )}
                                    </div>
                                  </TooltipProvider>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </span>
                        </div>
                        <ReactQuill
                          ref={templateRichEditorRef}
                          theme="snow"
                          value={templateBlockDraft.content_html}
                          onChange={value => setTemplateBlockDraft(prev => ({ ...prev, content_html: value }))}
                          modules={templateEditorModules}
                          className="[&_.ql-container]:min-h-[420px] [&_.ql-container]:border-0 [&_.ql-editor]:min-h-[420px] [&_.ql-editor]:text-sm [&_.ql-editor]:leading-7"
                        />
                      </div>

                      <div className="flex justify-between gap-2">
                        <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={deleteTemplateBlock}>
                          <Trash2 className="mr-1 h-4 w-4" />
                          Blok verwijderen
                        </Button>
                        <Button type="button" onClick={saveTemplateBlock}>
                          <Save className="mr-1 h-4 w-4" />
                          Blok opslaan
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-5 border-t border-border pt-4 xl:grid-cols-[minmax(320px,0.85fr)_minmax(420px,1.15fr)]">
                      <div className="min-w-0">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">Artikelblokken</p>
                            <p className="mt-1 text-xs text-muted-foreground">Sleep om de volgorde te wijzigen. Nummering wordt automatisch bijgewerkt.</p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={addTemplateArticleBlock}>
                            <Plus className="mr-1 h-4 w-4" />
                            Artikel
                          </Button>
                        </div>
                        <DragDropContext onDragEnd={handleTemplateBlockDragEnd}>
                          <Droppable droppableId="template-article-blocks">
                            {provided => (
                              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                                {templateBlockRows.map((block, index) => (
                                  <Draggable key={block.id} draggableId={block.id} index={index}>
                                    {dragProvided => (
                                      <div
                                        ref={dragProvided.innerRef}
                                        {...dragProvided.draggableProps}
                                        className="flex min-h-[76px] items-stretch overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/60 hover:bg-accent/25"
                                      >
                                        <button
                                          type="button"
                                          {...dragProvided.dragHandleProps}
                                          className="flex w-10 shrink-0 items-center justify-center border-r border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                                          aria-label={`${block.display_label} verslepen`}
                                          title="Verslepen"
                                        >
                                          <GripVertical className="h-4 w-4" />
                                        </button>
                                        <button type="button" className="min-w-0 flex-1 px-3 py-2.5 text-left" onClick={() => openTemplateBlockEditor(block)}>
                                          <span className="flex items-center gap-2">
                                            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-primary">{block.display_label}</span>
                                            <span className="truncate text-sm font-semibold text-foreground">{block.title}</span>
                                          </span>
                                          <span className="mt-1 block truncate text-xs text-muted-foreground">{contractBlockHtmlToPlainText(block.content_html) || "Nog geen tekst"}</span>
                                        </button>
                                        <button type="button" className="flex w-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground" onClick={() => openTemplateBlockEditor(block)} aria-label={`${block.display_label} bewerken`}>
                                          <Edit className="h-4 w-4" />
                                        </button>
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        </DragDropContext>

                        <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Controle</p>
                            <span className={`text-xs ${unknownTemplatePlaceholders.length > 0 || missingStandardTemplatePlaceholders.length > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                              {unknownTemplatePlaceholders.length > 0
                                ? `${unknownTemplatePlaceholders.length} niet gekoppeld`
                                : missingStandardTemplatePlaceholders.length > 0
                                  ? `${missingStandardTemplatePlaceholders.length} essentiële placeholders ontbreken`
                                  : "Alle placeholders gekoppeld"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{templateBlocks.length} blokken · {placeholderDetails.length} gebruikte placeholders</p>
                        </div>
                      </div>

                      <TemplateDocumentPreview
                        body={templateForm.body}
                        blocks={templateBlocks}
                        templateName={templateForm.name || defaultTemplateName(templateForm)}
                        letterhead={selectedTemplateLetterhead}
                        clauses={clauses}
                      />
                    </div>
                  )}

                  {!editingTemplateBlock && (
                    <div className="space-y-2">
                      <Label>Notitie</Label>
                      <Textarea
                        rows={3}
                        value={templateForm.description}
                        onChange={event => setTemplateForm(prev => ({ ...prev, description: event.target.value }))}
                        placeholder="Interne notitie voor beheerders; deze tekst komt niet in het contract."
                      />
                    </div>
                  )}
                </div>
              )}

              {!(templateStep === editorStep && editingTemplateBlock) && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" onClick={cancelTemplateWizard}>
                  <X className="mr-1 h-4 w-4" />
                  Annuleren
                </Button>
                <div className="flex flex-wrap justify-end gap-2">
                  {templateStep > (wizardPrefilled ? sourceStep : 1) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={previousTemplateStep}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Terug
                    </Button>
                  )}
                  {templateStep < editorStep ? (
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
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  const renderTemplateTable = () => {
    const isEmploymentBrowser = isEmploymentTemplateType(templateBrowserType);
    const title = isEmploymentBrowser
      ? selectedTemplateBrowserContractModel?.label || "Arbeidscontracten"
      : selectedTemplateBrowserType?.label || "Contracttemplates";
    const subtitle = isEmploymentBrowser
      ? `${selectedTemplateBrowserCao?.label || "CAO"} · ${contractModelMeta(selectedTemplateBrowserContractModel) || "Gekozen contractvorm"}`
      : selectedTemplateBrowserType?.description || "";

    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/15 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              onClick={isEmploymentBrowser ? backToTemplateBrowserContractModels : backToTemplateBrowserCategories}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Terug
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{title}</p>
              {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={startNewTemplateFromBrowser} disabled={templateWizardOpen}>
            <Plus className="mr-1 h-4 w-4" />
            Nieuwe template
          </Button>
        </div>

        <div className={`${TEMPLATE_TABLE_GRID} items-center border-b border-border bg-muted/20 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
          <span>Referentie</span>
          <span>Laatste versie</span>
          <span>Status</span>
          <span>Scope</span>
          <span>Door</span>
          <span className="text-right">Acties</span>
        </div>
        <div className="flex-1">
          {templateBrowserVersionGroups.length === 0 ? (
            <div className="flex min-h-[180px] items-center justify-center px-5 py-8 text-center text-sm text-muted-foreground">
              Nog geen templates voor {title.toLowerCase()} aangemaakt.
            </div>
          ) : templateBrowserVersionGroups.map(group => {
            const item = group.versions.find(version => version.status !== "archived") || group.versions[0];
            const expanded = expandedTemplateFamilies.includes(group.key);
            return (
              <Collapsible key={group.key} open={expanded} onOpenChange={() => toggleTemplateFamily(group.key)}>
                <div className={`${TEMPLATE_TABLE_GRID} items-start border-b border-border px-5 py-4 text-sm transition-colors hover:bg-accent/35`}>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{item.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.description || "Geen interne notitie"}</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>v{item.version || 1}</p>
                    <p className="mt-0.5 text-xs">{group.versions.length} versie{group.versions.length === 1 ? "" : "s"}</p>
                  </div>
                  <div>{statusBadge(item.status)}</div>
                  <div className="min-w-0 text-sm text-muted-foreground">
                    <p className="truncate">{getTemplateScopeLabel(item)}</p>
                    <p className="mt-0.5 truncate text-xs">
                      {isEmploymentTemplateType(item.template_type) ? caoLabel(item.cao_key) : "Niet gekoppeld aan CAO"}
                    </p>
                  </div>
                  <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(item, auditActors)}</span>
                  <div className="flex justify-end gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEditTemplate(item)} title="Laatste versie bewerken" aria-label="Laatste versie bewerken">
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => createNewTemplateVersion(item)} title="Nieuwe versie maken" aria-label="Nieuwe versie maken">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Versies tonen" aria-label="Versies tonen">
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="border-b border-border bg-muted/15 px-5 py-3">
                    <div className="rounded-lg border border-border bg-background">
                      {group.versions.map((version, index) => (
                        <div key={version.id} className={`grid grid-cols-1 items-center gap-2 px-3 py-2.5 text-sm md:grid-cols-[80px_minmax(0,1fr)_130px_150px_max-content] md:gap-3 ${index > 0 ? "border-t border-border" : ""}`}>
                          <span className="font-semibold text-foreground">v{version.version || 1}</span>
                          <span className="min-w-0 truncate text-muted-foreground">{version.description || "Geen interne notitie"}</span>
                          <span>{statusBadge(version.status)}</span>
                          <span className="truncate text-xs text-muted-foreground">{getAuditActorLabel(version, auditActors)}</span>
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-35"
                              onClick={() => startEditTemplate(version)}
                              disabled={["published", "archived"].includes(version.status)}
                              title={["published", "archived"].includes(version.status) ? "Definitieve versie; maak een nieuwe versie" : "Versie bewerken"}
                              aria-label={`Versie ${version.version || 1} bewerken`}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            {version.status !== "archived" && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => archiveTemplate(version)} title="Versie archiveren" aria-label={`Versie ${version.version || 1} archiveren`}>
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </>
    );
  };

  const renderTemplateTab = () => {
    const isEmploymentBrowser = isEmploymentTemplateType(templateBrowserType);
    const showTable = templateBrowserType && (!isEmploymentBrowser || (templateBrowserCaoKey && templateBrowserContractModel));

    return (
      <div className="flex h-full min-h-[360px] flex-col">
        {renderTemplateWizard()}

        {!templateBrowserType && (
          <div className="space-y-3 p-5">
            <div>
              <p className="text-sm font-medium text-foreground">Kies het soort contracttemplate</p>
              <p className="mt-1 text-xs text-muted-foreground">Selecteer eerst een categorie. Daarna tonen we alleen de templates die daarbij horen.</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {TEMPLATE_DOCUMENT_TYPES.map(option => (
                <TemplateBrowserChoice
                  key={option.value}
                  label={option.label}
                  description={option.description}
                  meta={`${templateBrowserCategoryCounts[option.value] || 0} template${templateBrowserCategoryCounts[option.value] === 1 ? "" : "s"}`}
                  onClick={() => selectTemplateBrowserType(option.value)}
                />
              ))}
            </div>
          </div>
        )}

        {templateBrowserType && isEmploymentBrowser && !templateBrowserCaoKey && (
          <div className="space-y-3 p-5">
            <div className="flex min-w-0 items-start gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                onClick={backToTemplateBrowserCategories}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Terug
              </Button>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Kies de CAO</p>
                <p className="mt-1 text-xs text-muted-foreground">Alleen CAO's die actief gekoppeld zijn aan dit bedrijf worden getoond.</p>
              </div>
            </div>
            {companyCaoOptions.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                Voeg eerst een CAO-koppeling toe in de CAO-tab van dit bedrijfsprofiel.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {companyCaoOptions.map(option => {
                  const count = allTemplateVersionGroups.filter(group => (
                    isEmploymentTemplateType(group.versions[0]?.template_type)
                    && group.versions[0]?.cao_key === option.value
                  )).length;
                  return (
                    <TemplateBrowserChoice
                      key={option.value}
                      label={option.label}
                      description="Actief gekoppeld aan dit bedrijf"
                      meta={`${count} template${count === 1 ? "" : "s"}`}
                      selected={templateBrowserCaoKey === option.value}
                      onClick={() => selectTemplateBrowserCao(option.value)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {isEmploymentBrowser && templateBrowserCaoKey && !templateBrowserContractModel && (
          <div className="space-y-3 p-5">
            <div className="flex min-w-0 items-start gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                onClick={backToTemplateBrowserCaos}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Terug
              </Button>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Kies het soort arbeidscontract</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedTemplateBrowserCao?.label || "Gekozen CAO"} · De looptijd, zoals bepaalde of onbepaalde tijd, wordt later met placeholders ingevuld.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {EMPLOYMENT_TEMPLATE_CONTRACT_MODELS.map(option => (
                <TemplateBrowserChoice
                  key={option.value}
                  label={option.label}
                  description={contractModelMeta(option)}
                  meta={`${templateBrowserContractModelCounts[option.value] || 0} template${templateBrowserContractModelCounts[option.value] === 1 ? "" : "s"}`}
                  selected={templateBrowserContractModel === option.value}
                  onClick={() => selectTemplateBrowserContractModel(option.value)}
                />
              ))}
            </div>
          </div>
        )}

        {showTable && renderTemplateTable()}
      </div>
    );
  };

  const renderClauseWizard = () => {
    const availableClauseTypes = clauseOptionsForScope(clauseForm.scope, clauseForm.license_scope);
    const snippets = currentClauseDefinition?.snippets || [];
    const clausePlaceholders = extractPlaceholders(clausePreviewBody);
    const riskLevel = clauseForm.risk_level || currentClauseDefinition?.risk || "green";
    const validationNotes = clauseValidationNotes(clauseForm, currentClauseDefinition);
    const editorTitle = clauseDirectEditMode
      ? (editingClauseId ? "Bedrijfsvariant bewerken" : "Bedrijfsvariant maken")
      : (editingClauseId ? "Clausule bewerken" : "Clausule toevoegen");

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
                {editorTitle}
              </p>
              {clauseDirectEditMode ? (
                <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">{clauseScopeLabel(clauseForm.scope)}</Badge>
                    <Badge variant="outline" className="text-xs">{clauseTypeLabel(clauseForm.scope, clauseForm.clause_type)}</Badge>
                    <Badge variant="outline" className={`text-xs ${CLAUSE_RISK_STYLES[riskLevel] || ""}`}>{clauseRiskLabel(riskLevel)}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Je past alleen de bedrijfsvariant aan. De standaardclausule blijft in de bibliotheek beschikbaar.
                  </p>
                </div>
              ) : (
                <WizardSteps labels={CLAUSE_STEPS} step={clauseStep} />
              )}

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
                    <p className="mt-1 text-xs text-muted-foreground">
                      De wizard gebruikt de bedrijfscontext automatisch. Bij arbeidscontracten hoeft de gebruiker alleen de clausule te kiezen; functie- en vergunningvariaties komen als bouwblokken terug bij het uitwerken.
                    </p>
                  </div>

                  {clauseForm.scope === "employment_contracts" && (
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Afgeleid uit bedrijfsprofiel</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {activeWpbrLicenses.length === 0 ? (
                          <Badge variant="outline" className="text-xs">Geen actieve WPBR-vergunning</Badge>
                        ) : activeWpbrLicenses.map(license => (
                          <Badge key={license.id || license.license_type} variant="outline" className="text-xs">
                            {WPBR_TYPE_LABELS[license.license_type] || license.license_type}
                          </Badge>
                        ))}
                        {companyCaoOptions.length === 0 ? (
                          <Badge variant="outline" className="text-xs">Geen CAO gekoppeld</Badge>
                        ) : companyCaoOptions.map(option => (
                          <Badge key={option.value} variant="outline" className="text-xs">{option.label}</Badge>
                        ))}
                      </div>
                      {derivedClauseFunctionGroups.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {derivedClauseFunctionGroups.slice(0, 4).map(group => (
                            <div key={group.key} className="text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground">{group.label}: </span>
                              {group.functions.slice(0, 6).map(functionLabel).join(", ")}
                              {group.functions.length > 6 ? ` +${group.functions.length - 6}` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2">
                    {availableClauseTypes.map(option => {
                      const optionRisk = option.risk || "green";
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => selectClauseType(option.value)}
                          className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${clauseForm.clause_type === option.value ? "border-primary bg-accent" : "border-border bg-card"}`}
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-foreground">{option.label}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{option.description}</span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {option.required && <Badge variant="outline" className="text-[10px]">Aanbevolen/verplicht</Badge>}
                              <Badge variant="outline" className={`text-[10px] ${CLAUSE_RISK_STYLES[optionRisk] || ""}`}>{clauseRiskLabel(optionRisk)}</Badge>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      );
                    })}
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
                          <p className="text-xs text-muted-foreground"></p>
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
                    <div className={`rounded-lg border p-3 text-sm ${CLAUSE_RISK_STYLES[riskLevel] || CLAUSE_RISK_STYLES.green}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{clauseRiskLabel(riskLevel)}</span>
                        {currentClauseDefinition?.required && <Badge variant="outline" className="text-[10px]">Aanbevolen/verplicht</Badge>}
                      </div>
                      <p className="mt-1 text-xs">
                        {riskLevel === "red"
                          ? "Deze clausule is juridisch gevoelig. Gebruik deze pas definitief na controle."
                          : riskLevel === "orange"
                            ? "Deze clausule vraagt extra context. Controleer of de gekozen functie, cao en contractvorm kloppen."
                            : "Deze clausule is bedoeld als standaardclausule voor de gekozen context."}
                      </p>
                    </div>
                    {validationNotes.length > 0 && (
                      <div className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Controlepunten</p>
                        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {validationNotes.map(note => (
                            <li key={note} className="flex gap-2">
                              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                              <span>{note}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Onderdeel</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{clauseScopeLabel(clauseForm.scope)}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Clausule</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{clauseTypeLabel(clauseForm.scope, clauseForm.clause_type)}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background/40 p-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Context</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{clauseSecurityContextLabel(clauseForm.license_scope)}</p>
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
                  {validationNotes.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      <p className="text-xs font-semibold uppercase tracking-wider">Controlepunten voordat deze clausule definitief wordt gebruikt</p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {validationNotes.map(note => (
                          <li key={note}>- {note}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" onClick={cancelClauseWizard}>
                  <X className="mr-1 h-4 w-4" />
                  Annuleren
                </Button>
                <div className="flex flex-wrap justify-end gap-2">
                  {!clauseDirectEditMode && clauseStep > 1 && (
                    <Button type="button" variant="outline" onClick={() => setClauseStep(step => step - 1)}>
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Terug
                    </Button>
                  )}
                  {clauseDirectEditMode && clauseStep === CLAUSE_STEPS.length && (
                    <Button type="button" variant="outline" onClick={() => setClauseStep(3)}>
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Terug naar tekst
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

  const renderClauseTab = () => {
    const scopeMeta = CLAUSE_SCOPE_OPTIONS.find(option => option.value === clauseLibraryScope);
    const selectedItem = selectedClauseLibraryItem;
    const selectedSections = selectedItem
      ? (selectedItem.variant
          ? normalizeClauseSections(selectedItem.variant)
          : defaultClauseSections(selectedItem.definition, clauseDefaultLicenseScope(selectedItem.scope)))
      : [];
    const variationInsertIndex = Math.min(2, selectedSections.length);
    const variationPositionLabel = variationInsertIndex > 0 && variationInsertIndex < selectedSections.length
      ? `Tussen x.${variationInsertIndex} en x.${variationInsertIndex + 1}`
      : `Na x.${Math.max(variationInsertIndex, 1)}`;
    const variationLabels = selectedItem?.snippets?.map(snippet => snippet.label).filter(Boolean) || [];
    const selectedVariations = selectedItem?.snippets || [];
    const activeVariationIndex = selectedVariations.length === 0
      ? 0
      : Math.min(selectedVariationIndex, selectedVariations.length - 1);
    const activeVariation = selectedVariations[activeVariationIndex] || null;
    const scopedCustomClauseItems = customClauseItems.filter(item => (inferClauseCatalog(item).scope || item.scope) === clauseLibraryScope);
    const selectedRiskLevel = selectedItem?.variant?.risk_level || selectedItem?.definition?.risk || "green";
    const clauseDetailTabs = [
      { value: "structure", label: "Opbouw" },
      { value: "variations", label: `Variaties${variationLabels.length ? ` (${variationLabels.length})` : ""}` },
      { value: "preview", label: "Preview" },
    ];

    const chooseScope = (scope) => {
      const firstDefinition = CLAUSE_TYPE_CATALOG[scope]?.[0];
      setClauseLibraryScope(scope);
      if (firstDefinition) setSelectedClauseKey(catalogClauseKey(scope, firstDefinition.value));
      setClauseLibraryStep(2);
      setClauseDetailView("structure");
      setSelectedVariationIndex(0);
      setMessage(null);
    };

    const chooseClause = (item) => {
      setSelectedClauseKey(item.key);
      setClauseLibraryStep(3);
      setClauseDetailView("structure");
      setSelectedVariationIndex(0);
      setMessage(null);
    };

    const renderClauseBlock = (section, index) => (
      <div key={section.id || index} className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">x.{index + 1}</Badge>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {index === 0 ? "Hoofdregel" : "Clausuleblok"}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px]">Vast blok</Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{section.text}</p>
      </div>
    );

    const renderVariationSlot = () => {
      if (!selectedItem?.snippets?.length) return null;
      return (
        <button
          type="button"
          onClick={() => {
            setSelectedVariationIndex(0);
            setClauseDetailView("variations");
          }}
          className="w-full rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 text-left transition-colors hover:border-primary hover:bg-primary/10"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary text-primary-foreground text-xs">Variatieslot</Badge>
                <Badge variant="outline" className="text-xs">{variationPositionLabel}</Badge>
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {variationLabels.length} optionele of automatische variatie{variationLabels.length === 1 ? "" : "s"} beschikbaar
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                De volledige teksten staan apart, zodat de clausule-opbouw overzichtelijk blijft.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-primary">
              Variaties bekijken
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {variationLabels.slice(0, 5).map(label => (
              <Badge key={label} variant="outline" className="bg-background/70 text-xs">{label}</Badge>
            ))}
            {variationLabels.length > 5 && (
              <Badge variant="outline" className="bg-background/70 text-xs">+{variationLabels.length - 5}</Badge>
            )}
          </div>
        </button>
      );
    };

    return (
      <div className="flex h-full min-h-[360px] flex-col">
        {renderClauseWizard()}

        <div className="border-b border-border bg-muted/15 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Clausulebibliotheek</p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">Clausules stap voor stap</h3>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Kies eerst een documentsoort, daarna een clausule en bekijk vervolgens ieder x.1, x.2 en x.3 blok apart.
              </p>
            </div>
            <div className="min-w-0 xl:w-[420px]">
              <WizardSteps labels={["Documentsoort", "Clausule", "Blokken"]} step={clauseLibraryStep} />
            </div>
          </div>
        </div>

        {clauseLibraryStep === 1 && (
          <div className="flex-1 p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold text-foreground">Waarvoor wil je clausules bekijken?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">De applicatie toont daarna alleen de clausules die bij dat documenttype horen.</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {CLAUSE_SCOPE_OPTIONS.map(option => {
                const standardCount = (CLAUSE_TYPE_CATALOG[option.value] || []).length;
                const variantCount = activeClauses.filter(item => inferClauseCatalog(item).scope === option.value).length;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => chooseScope(option.value)}
                    className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs">{standardCount} standaardclausule{standardCount === 1 ? "" : "s"}</Badge>
                      <Badge variant="outline" className="text-xs">{variantCount} bedrijfsvariant{variantCount === 1 ? "" : "en"}</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {clauseLibraryStep === 2 && (
          <div className="flex-1 min-h-0">
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => setClauseLibraryStep(1)}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Documentsoorten
                  </Button>
                  <p className="text-sm font-semibold text-foreground">{scopeMeta?.label || "Clausules"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{scopeMeta?.description}</p>
                </div>
                <Badge variant="outline" className="w-fit text-xs">
                  {clauseLibraryItems.length} standaardclausule{clauseLibraryItems.length === 1 ? "" : "s"}
                </Badge>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className={`${CLAUSE_LIBRARY_GRID} min-w-[900px] items-center border-b border-border bg-muted/20 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
                <span>Nr.</span>
                <span>Clausule</span>
                <span>Status</span>
                <span>Variaties</span>
                <span>Velden</span>
              </div>
              <div className="min-w-[900px]">
                {clauseLibraryItems.map((item, index) => {
                  const riskLevel = item.variant?.risk_level || item.definition.risk || "green";
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => chooseClause(item)}
                      className={`${CLAUSE_LIBRARY_GRID} w-full items-start border-b border-border bg-background px-5 py-4 text-left text-sm transition-colors hover:bg-accent/35`}
                    >
                      <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-foreground">{item.definition.label}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.definition.description}</span>
                        <span className="mt-2 flex flex-wrap gap-1">
                          {item.definition.required && <Badge variant="outline" className="text-[10px]">Basisclausule</Badge>}
                          <Badge variant="outline" className={`text-[10px] ${CLAUSE_RISK_STYLES[riskLevel] || ""}`}>{clauseRiskLabel(riskLevel)}</Badge>
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {item.variant ? (
                          <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200">Bedrijfsvariant</Badge>
                        ) : (
                          <Badge variant="outline">Standaard</Badge>
                        )}
                        {(item.variant?.review_required || item.definition.reviewRequired) && <Badge variant="outline">Review</Badge>}
                      </span>
                      <span className="min-w-0 text-xs text-muted-foreground">
                        <span className="block font-medium text-foreground">{item.snippets.length} bouwblok{item.snippets.length === 1 ? "" : "ken"}</span>
                        <span className="mt-0.5 line-clamp-2 block">
                          {item.snippets.length === 0 ? "Geen variaties" : item.snippets.slice(0, 3).map(snippet => snippet.label).join(", ")}
                          {item.snippets.length > 3 ? ` +${item.snippets.length - 3}` : ""}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <span className="block font-medium text-foreground">{item.placeholders.length} placeholder{item.placeholders.length === 1 ? "" : "s"}</span>
                        <span className="mt-0.5 block">{item.usageCount} template{item.usageCount === 1 ? "" : "s"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {scopedCustomClauseItems.length > 0 && (
              <div className="border-t border-border bg-muted/10 p-5">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-foreground">Eigen clausules buiten de standaardbibliotheek</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Deze bestaande clausules blijven beschikbaar, maar horen nog niet bij een standaardclausulefamilie.</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {scopedCustomClauseItems.map(item => (
                    <div key={item.id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{clauseScopeLabel(item.scope)} · {clauseTypeLabel(item.scope, item.clause_type)}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => startEditClause(item)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => archiveClause(item)}>
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{buildClauseBodyFromSections(normalizeClauseSections(item))}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {clauseLibraryStep === 3 && selectedItem && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => setClauseLibraryStep(2)}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Clausules
                  </Button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">{scopeMeta?.label}</Badge>
                    {selectedItem.variant ? (
                      <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200">Bedrijfsvariant actief</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Standaardtekst</Badge>
                    )}
                    <Badge variant="outline" className={`text-xs ${CLAUSE_RISK_STYLES[selectedRiskLevel] || ""}`}>{clauseRiskLabel(selectedRiskLevel)}</Badge>
                  </div>
                  <h4 className="mt-2 text-lg font-semibold text-foreground">{selectedItem.definition.label}</h4>
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{selectedItem.definition.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => startEditCatalogClause(selectedItem.scope, selectedItem.definition)} disabled={clauseWizardOpen}>
                    {selectedItem.variant ? <Edit className="mr-1 h-4 w-4" /> : <FilePlus2 className="mr-1 h-4 w-4" />}
                    {selectedItem.variant ? "Bedrijfsvariant bewerken" : "Bedrijfsvariant maken"}
                  </Button>
                  {selectedItem.variant && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        await archiveClause(selectedItem.variant);
                        setMessage({ type: "success", text: "Bedrijfsvariant gearchiveerd. De standaardclausule blijft beschikbaar." });
                      }}
                    >
                      <Archive className="mr-1 h-4 w-4" />
                      Terug naar standaard
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="border-b border-border bg-background px-5 py-3">
              <div className="flex flex-wrap gap-2">
                {clauseDetailTabs.map(tab => {
                  const active = clauseDetailView === tab.value;
                  const disabled = tab.value === "variations" && variationLabels.length === 0;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setClauseDetailView(tab.value)}
                      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary hover:bg-accent hover:text-foreground"
                      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              {clauseDetailView === "structure" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-sm font-semibold text-foreground">Clausule-opbouw</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      De vaste x-blokken blijven leesbaar. Variaties staan als compact slot op de plek waar ze later automatisch worden ingevoegd.
                    </p>
                  </div>

                  {selectedSections.slice(0, variationInsertIndex).map(renderClauseBlock)}
                  {renderVariationSlot()}
                  {selectedSections.slice(variationInsertIndex).map((section, index) => renderClauseBlock(section, index + variationInsertIndex))}
                </div>
              )}

              {clauseDetailView === "variations" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Variaties</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          De variaties zijn standaard ingeklapt. Bij contractgeneratie kiest de applicatie de passende variaties op basis van functies, contractvorm en bedrijfscontext.
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">{variationPositionLabel}</Badge>
                    </div>
                  </div>

                  {selectedVariations.length === 0 ? (
                    <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                      Deze clausule heeft geen aparte variaties.
                    </div>
                  ) : (
                    <div className="grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
                      <div className="max-h-[560px] overflow-auto rounded-lg border border-border bg-card p-2">
                        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beschikbare variaties</p>
                        <div className="space-y-1">
                          {selectedVariations.map((snippet, index) => {
                            const active = activeVariationIndex === index;
                            return (
                              <button
                                key={`${snippet.label}-${index}`}
                                type="button"
                                onClick={() => setSelectedVariationIndex(index)}
                                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                                  active
                                    ? "border-primary bg-primary/10"
                                    : "border-transparent hover:border-border hover:bg-accent/50"
                                }`}
                              >
                                <span className="block truncate text-sm font-semibold text-foreground">{snippet.label}</span>
                                <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{snippet.help || snippet.text}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-card p-4">
                        {activeVariation ? (
                          <>
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="text-xs">Variatie</Badge>
                                  <Badge variant="outline" className="text-xs">{variationPositionLabel}</Badge>
                                  <Badge variant="outline" className="text-xs">Automatisch toepasbaar</Badge>
                                </div>
                                <p className="mt-2 text-base font-semibold text-foreground">{activeVariation.label}</p>
                              </div>
                              <HelpCircle className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" title={activeVariation.help} />
                            </div>
                            {activeVariation.help && (
                              <div className="mb-4 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                                {activeVariation.help}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{activeVariation.text}</p>
                            <p className="mt-4 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                              Deze tekst hoeft de gebruiker hier niet handmatig te kiezen. Bij het maken van een contracttemplate kan de applicatie de juiste variatie bepalen op basis van functie(s), contractvorm en bedrijfscontext.
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Selecteer een variatie om de tekst te bekijken.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {clauseDetailView === "preview" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-sm font-semibold text-foreground">Preview</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Dit is de basisclausule zoals die nu is opgeslagen. Functie- en contractvariaties worden bij een concrete contracttemplate automatisch toegevoegd wanneer de context bekend is.
                    </p>
                  </div>
                  <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-4 text-sm leading-relaxed text-foreground">
                    {selectedItem.body || "Geen standaardtekst beschikbaar."}
                  </pre>
                </div>
              )}

              <aside className="space-y-4">
                {selectedItem.scope === "employment_contracts" && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Afgeleid uit bedrijfsprofiel</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeWpbrLicenses.length === 0 ? (
                        <Badge variant="outline" className="text-xs">Geen actieve WPBR-vergunning</Badge>
                      ) : activeWpbrLicenses.map(license => (
                        <Badge key={license.id || license.license_type} variant="outline" className="text-xs">
                          {WPBR_TYPE_LABELS[license.license_type] || license.license_type}
                        </Badge>
                      ))}
                      {companyCaoOptions.length === 0 ? (
                        <Badge variant="outline" className="text-xs">Geen CAO gekoppeld</Badge>
                      ) : companyCaoOptions.map(option => (
                        <Badge key={option.value} variant="outline" className="text-xs">{option.label}</Badge>
                      ))}
                    </div>
                    {derivedClauseFunctionGroups.length > 0 && (
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {derivedClauseFunctionGroups.slice(0, 3).map(group => (
                          <p key={group.key}>
                            <span className="font-semibold text-foreground">{group.label}: </span>
                            {group.functions.slice(0, 5).map(functionLabel).join(", ")}
                            {group.functions.length > 5 ? ` +${group.functions.length - 5}` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Placeholders</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {selectedItem.placeholders.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Geen placeholders gevonden.</span>
                    ) : selectedItem.placeholders.slice(0, 24).map(placeholder => (
                      <Badge key={placeholder} variant="outline" className="text-xs">{placeholder}</Badge>
                    ))}
                    {selectedItem.placeholders.length > 24 && (
                      <Badge variant="outline" className="text-xs">+{selectedItem.placeholders.length - 24}</Badge>
                    )}
                  </div>
                </div>

                {selectedItem.validationNotes.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                    <p className="text-xs font-semibold uppercase tracking-wider">Controlepunten</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {selectedItem.validationNotes.map(note => (
                        <li key={note} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </aside>
            </div>
          </div>
        )}
      </div>
    );
  };

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