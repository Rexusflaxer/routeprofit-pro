import React, { useEffect, useMemo, useRef, useState } from "react";
import PageTransition from "@/components/ui-custom/PageTransition";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileText,
  Handshake,
  IdCard,
  MessageSquareText,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import PersonnelAccessTab from "@/components/personnel/PersonnelAccessTab";
import PersonnelContractsTab from "@/components/personnel/PersonnelContractsTab";
import PhotoCropUpload from "@/components/personnel/PhotoCropUpload";
import IdentityDocumentWizard from "@/components/personnel/IdentityDocumentWizard";
import PayrollTab from "@/components/personnel/PayrollTab";
import PersonnelBankTab from "@/components/personnel/PersonnelBankTab";
import PersonnelKorpschefTab from "@/components/personnel/PersonnelKorpschefTab";
import AddressAutocomplete from "@/components/ui-custom/AddressAutocomplete";
import { formatAddress, normalizeAddressParts } from "@/lib/addressFormatting";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";
import { FUNCTION_LABELS } from "@/lib/securityCaoCatalog";
import {
  buildKorpschefCompanyOptions,
  isKorpschefDocument,
} from "@/lib/korpschefRules";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  onboarding: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
  inactive: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
  archived: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
};
const STATUS_LABELS = {
  draft: "Concept", onboarding: "Onboarding", active: "Actief", inactive: "Inactief", archived: "Gearchiveerd",
};
const HR_COLORS = {
  complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
  needs_review: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
  incomplete: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
};
const HR_LABELS = { complete: "Volledig", needs_review: "Beoordeling", incomplete: "Onvolledig" };
const RELATIONSHIP_LABELS = { employee: "Loondienst", self_employed: "ZZP'er" };
const TEAMHUB_LINK_LABELS = {
  not_invited: "Lokaal profiel", invited: "Uitgenodigd", pending_acceptance: "Wacht op acceptatie",
  linked: "Gekoppeld", conflict_review: "Review nodig", revoked: "Koppeling ingetrokken", local_only: "Lokaal profiel",
};
const VERIFICATION_LABELS = {
  uploaded: "Geüpload", pending_review: "In beoordeling", verified: "Geverifieerd", rejected: "Afgekeurd", expired: "Verlopen",
};
const DOCUMENT_CATEGORIES = [
  { value: "identity_document", label: "Identiteitsdocument" },
  { value: "drivers_license", label: "Rijbewijs" },
  { value: "vog", label: "VOG" },
  { value: "cv", label: "CV" },
  { value: "bank_account_proof", label: "Bankbewijs" },
  { value: "payroll_tax_statement", label: "Loonheffingsverklaring" },
  { value: "diploma", label: "Diploma" },
  { value: "certificate", label: "Certificaat" },
  { value: "wpbr_permission", label: "WPBR-toestemming" },
  { value: "wpbr_badge", label: "Beveiligingspas document" },
  { value: "other", label: "Overig" },
];
const NL_PLACES = [
  "Aalsmeer","Aalten","Achtkarspelen","Alblasserdam","Albrandswaard","Alkmaar","Almelo","Almere","Alphen aan den Rijn",
  "Alphen-Chaam","Altena","Ameland","Amersfoort","Amstelveen","Amsterdam","Apeldoorn","Appingedam","Arnhem",
  "Assen","Asten","Baarle-Nassau","Baarn","Barendrecht","Barneveld","Beekdaelen","Beemster","Berg en Dal",
  "Bergeijk","Bergen (L)","Bergen (NH)","Bergen op Zoom","Berkelland","Bernheze","Best","Beuningen","Beverwijk",
  "Binnenmaas","Bloemendaal","Bodegraven-Reeuwijk","Boekel","Borger-Odoorn","Borne","Borsele","Boxmeer","Boxtel",
  "Breda","Brielle","Bronckhorst","Brummen","Brunssum","Bunnik","Bunschoten","Buren","Capelle aan den IJssel",
  "Castricum","Coevorden","Cranendonck","Cuijk","Culemborg","Dalfsen","Dantumadiel","De Bilt","De Friese Meren",
  "De Ronde Venen","De Wolden","Delft","Delfzijl","Den Helder","Deurne","Deventer","Diemen","Dinkelland",
  "Doesburg","Doetinchem","Dongen","Dordrecht","Drechterland","Drimmelen","Dronten","Druten","Duiven",
  "Echt-Susteren","Edam-Volendam","Ede","Eemnes","Eemsdelta","Eersel","Eindhoven","Elburg","Emmen",
  "Enkhuizen","Enschede","Epe","Ermelo","Etten-Leur","Geertruidenberg","Geldrop-Mierlo","Gemert-Bakel",
  "Gennep","Gilze en Rijen","Goeree-Overflakkee","Goes","Gorinchem","Gouda","Groningen","Gulpen-Wittem",
  "Haaksbergen","Haaren","Haarlem","Haarlemmermeer","Halderberge","Hardenberg","Harderwijk","Hardinxveld-Giessendam",
  "Harlingen","Hattem","Heemskerk","Heemstede","Heerde","Heerenveen","Heerhugowaard","Heerlen","Heeze-Leende",
  "Heiloo","Hellendoorn","Hellevoetsluis","Helmond","Hendrik-Ido-Ambacht","Hengelo","Het Hogeland","Heumen",
  "Hillegom","Hilvarenbeek","Hilversum","Hoeksche Waard","Hof van Twente","Hollands Kroon","Hoogeveen",
  "Hoorn","Horst aan de Maas","Houten","Huizen","Hulst","IJsselstein","Kaag en Braassem","Kampen",
  "Kapelle","Katwijk","Kerkrade","Koggenland","Krimpen aan den IJssel","Krimpenerwaard","Laarbeek",
  "Land van Cuijk","Landerd","Landgraaf","Landsmeer","Langedijk","Lansingerland","Laren","Leeuwarden",
  "Leiden","Leiderdorp","Leidschendam-Voorburg","Lelystad","Lingewaard","Lisse","Lochem","Loon op Zand",
  "Lopik","Loppersum","Losser","Maasdriel","Maasgouw","Maassluis","Maastricht","Medemblik","Meerssen",
  "Meierijstad","Meppel","Middelburg","Midden-Delfland","Midden-Groningen","Mill en Sint Hubert","Moerdijk",
  "Molenlanden","Montferland","Moordrecht","Morssinkhof","Muiden","Neder-Betuwe","Nederweert","Nieuwegein",
  "Nieuwkoop","Nijkerk","Nijmegen","Noord-Beveland","Noordenveld","Noordoostpolder","Noardeast-Fryslân",
  "Nuenen","Nunspeet","Oegstgeest","Oirschot","Oisterwijk","Oldambt","Oldebroek","Oldenzaal","Olst-Wijhe",
  "Ommen","Oost Gelre","Oosterhout","Ooststellingwerf","Oostzaan","Opmeer","Opsterland","Oss","Ouder-Amstel",
  "Oudewater","Overbetuwe","Papendrecht","Peel en Maas","Pekela","Pijnacker-Nootdorp","Purmerend","Putten",
  "Raalte","Reimerswaal","Renkum","Reusel-De Mierden","Rheden","Rhenen","Ridderkerk","Rijssen-Holten",
  "Rijswijk","Roerdalen","Roermond","Roosendaal","Rotterdam","Rozendaal","Rucphen","Schagen","Schinnen",
  "Schiedam","Schijndel","Simpelveld","Sint Anthonis","Sint-Michielsgestel","Sittard-Geleen","Sliedrecht",
  "Sluis","Smallingerland","Soest","Someren","Son en Breugel","Stadskanaal","Staphorst","Stede Broec",
  "Steenbergen","Steenwijkerland","Stein","Súdwest-Fryslân","Terneuzen","Teylingen","Tholen","Tiel",
  "Tilburg","Tubbergen","Twenterand","Tynaarlo","Tytsjerksteradiel","Uitgeest","Uithoorn","Urk","Utrecht",
  "Utrechtse Heuvelrug","Vaals","Valkenburg aan de Geul","Valkenswaard","Veendam","Veenendaal","Veere",
  "Veldhoven","Velsen","Venlo","Venray","Vijfheerenlanden","Vlaardingen","Vlieland","Vlissingen","Voerendaal",
  "Voorschoten","Voorst","Vught","Waadhoeke","Waalre","Waalwijk","Waddinxveen","Wageningen","Wassenaar",
  "Waterland","Weert","Weesp","West Betuwe","West Maas en Waal","Westerveld","Westervoort","Westerwolde",
  "Westland","Weststellingwerf","Westvoorne","Wierden","Wijchen","Wijdemeren","Wijk bij Duurstede",
  "Winterswijk","Woensdrecht","Woerden","Wormerland","Woudenberg","Zaanstad","Zaltbommel","Zandvoort",
  "Zeewolde","Zeist","Zevenaar","Zoetermeer","Zoeterwoude","Zuidplas","Zundert","Zutphen","Zwartewaterland","Zwolle",
].sort((a, b) => a.localeCompare(b, "nl"));

const COUNTRIES = [
  "Afghanistan","Albanië","Algerije","Andorra","Angola","Argentinië","Armenië","Australië","Oostenrijk",
  "Azerbeidzjan","Bangladesh","België","Bolivia","Bosnië-Herzegovina","Botswana","Brazilië","Bulgarije",
  "Burkina Faso","Burundi","Cambodja","Kameroen","Canada","Chili","China","Colombia","Congo","Costa Rica",
  "Kroatië","Cuba","Cyprus","Tsjechië","Denemarken","Dominicaanse Republiek","Ecuador","Egypte","Estland",
  "Ethiopië","Finland","Frankrijk","Georgië","Duitsland","Ghana","Griekenland","Guatemala","Haïti",
  "Honduras","Hongarije","IJsland","India","Indonesië","Iran","Irak","Ierland","Israël","Italië",
  "Ivoorkust","Jamaica","Japan","Jordanië","Kazachstan","Kenia","Kosovo","Koeweit","Letland","Libanon",
  "Libië","Litouwen","Luxemburg","Maleisië","Mali","Malta","Marokko","Mexico","Moldavië","Montenegro",
  "Mozambique","Myanmar","Namibië","Nepal","Nederland","Nicaragua","Nigeria","Noord-Korea","Noord-Macedonië",
  "Noorwegen","Oman","Pakistan","Panama","Paraguay","Peru","Filipijnen","Polen","Portugal","Qatar",
  "Roemenië","Rusland","Rwanda","Saoedi-Arabië","Senegal","Servië","Singapore","Slowakije","Slovenië",
  "Somalië","Zuid-Afrika","Zuid-Korea","Spanje","Sri Lanka","Soedan","Suriname","Zweden","Zwitserland",
  "Syrië","Tanzania","Thailand","Tunesië","Turkije","Oeganda","Oekraïne","Verenigd Koninkrijk",
  "Verenigde Arabische Emiraten","Verenigde Staten","Uruguay","Venezuela","Vietnam","Zambia","Zimbabwe",
].sort((a, b) => a.localeCompare(b, "nl"));

const NATIONALITIES = [
  "Nederlandse","Belgische","Duitse","Franse","Britse","Amerikaanse","Turkse","Marokkaanse","Algerijnse",
  "Tunesische","Spaanse","Italiaanse","Poolse","Roemeense","Oekraïense","Bulgaarse","Surinaamse",
  "Antilliaanse","Indonesische","Chinese","Indiaase","Pakistaanse","Syrische","Iraakse","Iraanse",
  "Afghaanse","Somalische","Eritrese","Ethiopische","Nigeriaanse","Ghanese","Zuid-Afrikaanse",
  "Braziliaanse","Mexicaanse","Colombiaanse","Peruaanse","Venezolaanse","Argentijnse","Chileense",
  "Russische","Kazachse","Azerbeidzjaanse","Armeense","Georgische","Moldavische","Wit-Russische",
  "Litouwse","Letse","Estse","Finse","Zweedse","Noorse","Deense","IJslandse","Ierse","Portugese",
  "Griekse","Hongaarse","Tsjechische","Slowaakse","Sloveense","Kroatische","Servische","Bosnische",
  "Montenegrijnse","Albanese","Macedonische","Kosovaarse","Luxemburgse","Zwitserse","Oostenrijkse",
  "Japanse","Koreaanse","Filipijnse","Vietnamese","Thaise","Maleisische","Singaporese","Cambodjaanse",
  "Myanmarese","Bengalese","Nepalese","Sri Lankaanse","Israëlische","Jordaanse","Libanese","Syrische",
  "Koeweitische","Saoedi-Arabische","Emiratische","Egyptische","Libische","Tunesische","Senegalese",
  "Rwandese","Burundische","Tanzaniaanse","Keniaanse","Ugandese","Mozambikaanse","Zambiaanse","Zimbabwaanse",
  "Namibische","Botswaanse","Congolese","Angolese","Camerounse","Ivoorkustse","Malische","Burkinese",
  "Guatemalteekse","Costa Ricaanse","Cubaanse","Jamaicaanse","Haïtiaanse","Dominicaanse","Uruguayaanse",
  "Paraguayaanse","Boliviaanse","Ecuadoriaanse","Panamaanse","Nicaraguaanse",
].sort((a, b) => a.localeCompare(b, "nl"));

const QUALIFICATION_TYPES = [
  { value: "beveiliger_2", label: "Beveiliger niveau 2" },
  { value: "beveiliger_3", label: "Beveiliger niveau 3" },
  { value: "verkeersregelaar", label: "Verkeersregelaar" },
  { value: "bhv", label: "BHV" },
  { value: "brandwacht", label: "Brandwacht" },
  { value: "alarminstallateur", label: "Alarminstallateur" },
  { value: "particulier_onderzoeker", label: "Particulier onderzoeker" },
  { value: "other", label: "Overig" },
];

const PERSONNEL_TABS = [
  { key: "identity", label: "Identiteit", icon: BadgeCheck },
  { key: "payroll", label: "Loonheffing", icon: Banknote },
  { key: "bank", label: "Bank", icon: Banknote },
  { key: "contracts", label: "Contracten", icon: BriefcaseBusiness },
  { key: "korpschef", label: "Korpschef", icon: IdCard },
  { key: "documents", label: "Documenten", icon: FileText },
  { key: "planning", label: "Planning/restricties", icon: CalendarDays },
  { key: "ice", label: "ICE", icon: Users },
  { key: "materials", label: "Materiaal", icon: Package },
  { key: "notes", label: "Notities/gesprekken", icon: MessageSquareText },
  { key: "teamhub", label: "App & Teamhub", icon: Handshake },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function getRelationshipType(p) {
  return p.relationship_type || (p.employee_type === "zzp" ? "self_employed" : "employee");
}
function buildDisplayName(p) {
  const first = p.call_name || p.first_name || p.legal_first_names || "";
  return [first, p.name_prefix, p.last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || p.name || "";
}
function buildFullName(p) {
  const first = p.legal_first_names || p.first_name || p.call_name || "";
  return [first, p.name_prefix, p.last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || p.name || "";
}
function getDisplayName(p) {
  return p.name || buildDisplayName(p) || "Naam onbekend";
}
function getStatus(p) {
  return p.status || (p.is_active === false ? "inactive" : "active");
}
function formatDate(v, fallback = "-") {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function formatCurrency(v) {
  if (v === null || v === undefined || v === "") return "-";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(v || 0));
}
function getExpiryState(value) {
  if (!value) return null;
  const diffDays = (new Date(value) - new Date()) / 86400000;
  if (diffDays < 0) return { label: "Verlopen", className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200" };
  if (diffDays <= 30) return { label: "<30 dagen", className: "bg-orange-100 text-orange-700" };
  if (diffDays <= 90) return { label: "<90 dagen", className: "bg-amber-100 text-amber-700" };
  return null;
}
function isEmptyDraftPersonnel(p = {}) {
  if ((p.status || "draft") !== "draft") return false;
  const fields = ["name","initials","legal_first_names","first_name","call_name","name_prefix","last_name","email","phone","street_name","house_number","postal_code","city","date_of_birth","place_of_birth","nationality","photo_file_url"];
  return !fields.some(f => String(p[f] || "").trim());
}
async function safeList(entityName, sort) {
  const entity = base44.entities[entityName];
  if (!entity?.list) return [];
  try { return await (sort ? entity.list(sort) : entity.list()); } catch { return []; }
}
function groupByPersonnel(items = []) {
  return items.reduce((acc, item) => {
    if (!item.personnel_id) return acc;
    acc[item.personnel_id] = acc[item.personnel_id] || [];
    acc[item.personnel_id].push(item);
    return acc;
  }, {});
}

const IDENTITY_DOCUMENT_KINDS = [
  { key: "passport", label: "Paspoort", addLabel: "Paspoort" },
  { key: "id_card", label: "ID-kaart", addLabel: "ID-kaart" },
  { key: "drivers_license", label: "Rijbewijs", addLabel: "Rijbewijs" },
];
const DELETE_PASSWORD = "verwijder";
const IDENTITY_TABLE_GRID = "grid grid-cols-[minmax(160px,200px)_minmax(130px,170px)_minmax(96px,124px)_minmax(110px,140px)_minmax(110px,1fr)_minmax(280px,max-content)] gap-3";

function isIdentityLikeDocument(doc) {
  return doc?.category === "identity_document" || doc?.category === "drivers_license";
}

function identityDocumentKind(doc) {
  if (doc?.metadata?.doc_type) return doc.metadata.doc_type;
  if (doc?.category === "drivers_license") return "drivers_license";
  const type = String(doc?.document_type || "").toLowerCase();
  if (type.includes("rijbewijs")) return "drivers_license";
  if (type.includes("id-kaart") || type.includes("identiteitskaart")) return "id_card";
  if (type.includes("paspoort")) return "passport";
  return "passport";
}

function identityDocumentKindLabel(kind) {
  return IDENTITY_DOCUMENT_KINDS.find(item => item.key === kind)?.label || "Document";
}

function identityDocumentDisplayType(doc) {
  const value = String(doc?.document_type || "").trim();
  if (!value || /onbekend/i.test(value)) return identityDocumentKindLabel(identityDocumentKind(doc));
  return value;
}

function isArchivedIdentityDocument(doc) {
  return doc?.metadata?.archived === true;
}

function isExpiredIdentityDocument(doc) {
  const today = new Date().toISOString().split("T")[0];
  return (doc?.valid_until && doc.valid_until < today) || doc?.verification_status === "expired";
}

function IdentityStatusBadge({ doc, archived = false }) {
  if (archived || isArchivedIdentityDocument(doc)) {
    return <Badge className="text-xs bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border-0 whitespace-nowrap">Gearchiveerd</Badge>;
  }
  if (isExpiredIdentityDocument(doc)) {
    return <Badge className="text-xs bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-0 whitespace-nowrap">Actie vereist</Badge>;
  }
  if (doc?.verification_status === "verified") {
    return <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 border-0 whitespace-nowrap">Actief</Badge>;
  }
  if (doc?.verification_status === "pending_review") {
    return <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-0 whitespace-nowrap">In beoordeling</Badge>;
  }
  if (doc?.verification_status === "rejected") {
    return <Badge className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-0 whitespace-nowrap">Afgekeurd</Badge>;
  }
  return <Badge className="text-xs bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-0 whitespace-nowrap">Geüpload</Badge>;
}

function identityDocumentUrls(doc) {
  return {
    front: doc?.front_file_url || doc?.metadata?.front_file_url || doc?.file_url || "",
    back: doc?.back_file_url || doc?.metadata?.back_file_url || "",
  };
}

function hasIdentityDocumentUpload(doc) {
  const urls = identityDocumentUrls(doc);
  return Boolean(urls.front || urls.back);
}

function dateSortKey(value) {
  if (!value) return "";
  const text = String(value).trim();
  const dutchDate = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dutchDate) return `${dutchDate[3]}-${dutchDate[2]}-${dutchDate[1]}`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return text;
}

function identityActiveSortValue(doc) {
  return [
    dateSortKey(doc?.valid_until),
    String(doc?.updated_date || doc?.created_date || ""),
    String(doc?.id || ""),
  ].join("|");
}

function compareIdentityRestoreCandidates(a, b, restoreId) {
  const validUntilDiff = dateSortKey(b?.valid_until).localeCompare(dateSortKey(a?.valid_until));
  if (validUntilDiff !== 0) return validUntilDiff;

  const aIsRestore = a?.id === restoreId;
  const bIsRestore = b?.id === restoreId;
  if (aIsRestore && !bIsRestore) return 1;
  if (!aIsRestore && bIsRestore) return -1;

  return identityActiveSortValue(b).localeCompare(identityActiveSortValue(a));
}

function verificationStatusForActiveIdentityDocument(doc) {
  const today = new Date().toISOString().split("T")[0];
  return doc?.valid_until && dateSortKey(doc.valid_until) < today ? "expired" : "verified";
}

function splitIdentityDocumentsByActiveState(docs) {
  const activeByKind = new Map();
  const archived = [];

  for (const doc of docs) {
    if (isArchivedIdentityDocument(doc)) {
      archived.push(doc);
      continue;
    }

    const kind = identityDocumentKind(doc);
    if (!activeByKind.has(kind)) activeByKind.set(kind, []);
    activeByKind.get(kind).push(doc);
  }

  const active = [];
  const effectiveArchived = [];
  for (const group of activeByKind.values()) {
    const sorted = [...group].sort((a, b) => identityActiveSortValue(b).localeCompare(identityActiveSortValue(a)));
    active.push(sorted[0]);
    effectiveArchived.push(...sorted.slice(1));
  }

  return {
    active,
    archived: [...archived, ...effectiveArchived],
    effectiveArchived,
  };
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function BadgePill({ children, className = "", icon: Icon = null }) {
  return (
    <Badge className={`${className} text-xs gap-1 whitespace-nowrap`}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </Badge>
  );
}
function FieldRow({ label, children }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border/70 py-2 last:border-0 sm:grid-cols-[180px_1fr]">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children || "-"}</span>
    </div>
  );
}
function SectionPanel({ title, icon: Icon, action, children }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
function SmallEmpty({ text }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{text}</p>;
}
function MiniTable({ columns, rows, emptyText }) {
  if (!rows.length) return <SmallEmpty text={emptyText} />;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {columns.map(c => <TableHead key={c.key} className="text-xs">{c.label}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={row.id || i}>
              {columns.map(c => <TableCell key={c.key} className="text-sm">{c.render ? c.render(row) : row[c.key] || "-"}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
function CountrySelect({ value, onChange }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);

  React.useEffect(() => { setQuery(value || ""); }, [value]);

  const filtered = query.length > 0
    ? COUNTRIES.filter(c => c.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : COUNTRIES.slice(0, 8);

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Typ of selecteer een land..."
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-auto">
          {filtered.map(c => (
            <button key={c} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              onMouseDown={() => { setQuery(c); onChange(c); setOpen(false); }}>
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NationalitySelect({ value, onChange }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);

  React.useEffect(() => { setQuery(value || ""); }, [value]);

  const filtered = query.length > 0
    ? NATIONALITIES.filter(n => n.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : NATIONALITIES.slice(0, 8);

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Typ een nationaliteit..."
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-auto">
          {filtered.map(n => (
            <button key={n} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              onMouseDown={() => { setQuery(n); onChange(n); setOpen(false); }}>
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaceSearchInput({ value, onChange }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);

  React.useEffect(() => { setQuery(value || ""); }, [value]);

  const filtered = query.length > 0
    ? NL_PLACES.filter(p => p.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : NL_PLACES.slice(0, 8);

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Typ een plaatsnaam..."
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-auto">
          {filtered.map(p => (
            <button key={p} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              onMouseDown={() => { setQuery(p); onChange(p); setOpen(false); }}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileInfoRow({ label, editing, children, value }) {
  return (
    <div className="flex flex-col py-1 sm:flex-row sm:gap-4">
      <Label className="w-40 shrink-0 pt-1 text-xs text-muted-foreground">{label}</Label>
      <div className="flex-1">
        {editing ? children : <span className="text-sm font-medium text-foreground">{value || "—"}</span>}
      </div>
    </div>
  );
}

// ─── Record dialog config ─────────────────────────────────────────────────────

function getRecordConfig(type, personnel) {
  const id = personnel?.id;
  const today = new Date().toISOString().slice(0, 10);
  const configs = {
    document: {
      title: "Document toevoegen", entityName: "PersonnelDocument", queryKeys: ["personnel-documents"],
      initialValues: { category: "other", verification_status: "uploaded", is_sensitive: true },
      fields: [
        { name: "category", label: "Categorie", type: "select", options: DOCUMENT_CATEGORIES },
        { name: "document_type", label: "Type / omschrijving" },
        { name: "document_number", label: "Documentnummer" },
        { name: "valid_from", label: "Geldig van", type: "date" },
        { name: "valid_until", label: "Geldig tot", type: "date" },
        { name: "verification_status", label: "Status", type: "select", options: Object.entries(VERIFICATION_LABELS).map(([v, l]) => ({ value: v, label: l })) },
        { name: "notes", label: "Notities", type: "textarea" },
      ],
      buildPayload: v => ({ ...v, personnel_id: id }),
    },
    qualification: {
      title: "Diploma of certificaat toevoegen", entityName: "PersonnelQualification", queryKeys: ["personnel-qualifications"],
      initialValues: { qualification_type: "beveiliger_2", verification_status: "pending_review" },
      fields: [
        { name: "qualification_type", label: "Type", type: "select", options: QUALIFICATION_TYPES },
        { name: "name", label: "Naam" },
        { name: "issuer", label: "Uitgever" },
        { name: "certificate_number", label: "Certificaatnummer" },
        { name: "valid_from", label: "Geldig van", type: "date" },
        { name: "valid_until", label: "Geldig tot", type: "date" },
        { name: "verification_status", label: "Status", type: "select", options: Object.entries(VERIFICATION_LABELS).filter(([v]) => v !== "uploaded").map(([v, l]) => ({ value: v, label: l })) },
      ],
      buildPayload: v => ({ ...v, personnel_id: id }),
    },
    securityPass: {
      title: "Beveiligingspas toevoegen", entityName: "PersonnelSecurityPass", queryKeys: ["personnel-security-passes"],
      initialValues: { pass_type: "green", status: "requested" },
      fields: [
        { name: "pass_type", label: "Pas", type: "select", options: [{ value: "green", label: "Groene pas" }, { value: "grey", label: "Grijze pas" }, { value: "temporary", label: "Tijdelijk" }, { value: "other", label: "Overig" }] },
        { name: "status", label: "Status", type: "select", options: [{ value: "requested", label: "Aangevraagd" }, { value: "approved", label: "Goedgekeurd" }, { value: "active", label: "Actief" }, { value: "rejected", label: "Afgewezen" }, { value: "expired", label: "Verlopen" }] },
        { name: "pass_number", label: "Pasnummer" },
        { name: "requested_at", label: "Aangevraagd op", type: "date" },
        { name: "valid_from", label: "Geldig van", type: "date" },
        { name: "valid_until", label: "Geldig tot", type: "date" },
        { name: "authority", label: "Autoriteit" },
        { name: "notes", label: "Notities", type: "textarea" },
      ],
      buildPayload: v => ({ ...v, personnel_id: id, company_id: personnel.primary_company_id || null }),
    },
    restriction: {
      title: "Planningrestrictie toevoegen", entityName: "PersonnelRestriction", queryKeys: ["personnel-restrictions"],
      initialValues: { scope_type: "object", may_work: false, status: "active" },
      fields: [
        { name: "scope_type", label: "Scope", type: "select", options: [{ value: "customer", label: "Klant" }, { value: "object", label: "Object" }, { value: "route", label: "Route" }, { value: "function_group", label: "Functiegroep" }, { value: "other", label: "Overig" }] },
        { name: "scope_label", label: "Klant/object/route" },
        { name: "may_work", label: "Mag werken", type: "boolean" },
        { name: "reason", label: "Reden", type: "textarea" },
        { name: "valid_from", label: "Geldig van", type: "date" },
        { name: "valid_until", label: "Geldig tot", type: "date" },
      ],
      buildPayload: v => ({ ...v, personnel_id: id }),
    },
    material: {
      title: "Materiaal toevoegen", entityName: "PersonnelMaterial", queryKeys: ["personnel-materials"],
      initialValues: { quantity: 1, status: "issued", issued_at: today },
      fields: [
        { name: "material", label: "Materiaal" },
        { name: "quantity", label: "Aantal", type: "number" },
        { name: "serial_number", label: "Serienummer" },
        { name: "issued_at", label: "Uitgegeven op", type: "date" },
        { name: "returned_at", label: "Ingeleverd op", type: "date" },
        { name: "status", label: "Status", type: "select", options: [{ value: "issued", label: "Uitgegeven" }, { value: "returned", label: "Ingeleverd" }, { value: "lost", label: "Vermist" }, { value: "damaged", label: "Beschadigd" }] },
        { name: "notes", label: "Bijzonderheden", type: "textarea" },
      ],
      buildPayload: v => ({ ...v, quantity: Number(v.quantity || 1), personnel_id: id }),
    },
    note: {
      title: "Notitie toevoegen", entityName: "PersonnelNote", queryKeys: ["personnel-notes"],
      initialValues: { note_type: "general", is_private: true },
      fields: [
        { name: "note_type", label: "Type", type: "select", options: [{ value: "general", label: "Algemeen" }, { value: "planning", label: "Planning" }, { value: "compliance", label: "Compliance" }, { value: "hr", label: "HR" }, { value: "teamhub", label: "Teamhub" }, { value: "other", label: "Overig" }] },
        { name: "title", label: "Titel" },
        { name: "body", label: "Notitie", type: "textarea" },
        { name: "is_private", label: "Privé HR-notitie", type: "boolean" },
      ],
      buildPayload: v => ({ ...v, personnel_id: id, created_at: new Date().toISOString() }),
    },
    review: {
      title: "Gesprek toevoegen", entityName: "PersonnelPerformanceReview", queryKeys: ["personnel-reviews"],
      initialValues: { review_type: "performance_review", status: "planned", review_date: today },
      fields: [
        { name: "review_type", label: "Type", type: "select", options: [{ value: "performance_review", label: "Functioneringsgesprek" }, { value: "evaluation", label: "Evaluatie" }, { value: "incident_followup", label: "Incidentopvolging" }, { value: "coaching", label: "Coaching" }, { value: "other", label: "Overig" }] },
        { name: "review_date", label: "Datum", type: "date" },
        { name: "status", label: "Status", type: "select", options: [{ value: "planned", label: "Gepland" }, { value: "completed", label: "Afgerond" }, { value: "cancelled", label: "Geannuleerd" }] },
        { name: "subject", label: "Onderwerp" },
        { name: "summary", label: "Samenvatting", type: "textarea" },
      ],
      buildPayload: v => ({ ...v, personnel_id: id }),
    },
    absence: {
      title: "Verlof/ziekte registreren", entityName: "PersonnelAbsence", queryKeys: ["personnel-absences"],
      initialValues: { absence_type: "leave", status: "requested", start_date: today },
      fields: [
        { name: "absence_type", label: "Type", type: "select", options: [{ value: "leave", label: "Verlof" }, { value: "sick", label: "Ziekmelding" }, { value: "special_leave", label: "Buitengewoon verlof" }, { value: "unavailable", label: "Niet beschikbaar" }, { value: "other", label: "Overig" }] },
        { name: "start_date", label: "Startdatum", type: "date" },
        { name: "end_date", label: "Einddatum", type: "date" },
        { name: "days", label: "Dagen", type: "number" },
        { name: "status", label: "Status", type: "select", options: [{ value: "requested", label: "Aangevraagd" }, { value: "approved", label: "Goedgekeurd" }, { value: "rejected", label: "Afgewezen" }, { value: "active", label: "Actief" }, { value: "closed", label: "Gesloten" }] },
        { name: "notes", label: "Notities", type: "textarea" },
      ],
      buildPayload: v => ({ ...v, days: v.days ? Number(v.days) : null, personnel_id: id }),
    },
    emergencyContact: {
      title: "ICE-contact toevoegen", entityName: "PersonnelEmergencyContact", queryKeys: ["personnel-emergency-contacts"],
      initialValues: { priority: 1 },
      fields: [
        { name: "name", label: "Naam" },
        { name: "relationship", label: "Relatie" },
        { name: "phone_1", label: "Telefoon 1" },
        { name: "phone_2", label: "Telefoon 2" },
        { name: "email", label: "E-mail" },
        { name: "priority", label: "Prioriteit", type: "number" },
        { name: "notes", label: "Notities", type: "textarea" },
      ],
      buildPayload: v => ({ ...v, priority: Number(v.priority || 1), personnel_id: id }),
    },
  };
  return configs[type];
}

// ─── RecordDialog ─────────────────────────────────────────────────────────────

function RecordDialog({ config, open, onOpenChange, onSave }) {
  const [form, setForm] = useState(config?.initialValues || {});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open && config) setForm(config.initialValues || {}); }, [config, open]);
  if (!config) return null;
  const set = (f, v) => setForm(cur => ({ ...cur, [f]: v }));
  const renderField = (field) => {
    if (field.type === "textarea") return <Textarea value={form[field.name] || ""} onChange={e => set(field.name, e.target.value)} rows={4} />;
    if (field.type === "select") return (
      <Select value={String(form[field.name] ?? field.options?.[0]?.value ?? "")} onValueChange={v => set(field.name, v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{field.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    );
    if (field.type === "boolean") return (
      <Select value={form[field.name] === false ? "false" : "true"} onValueChange={v => set(field.name, v === "true")}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="true">Ja</SelectItem><SelectItem value="false">Nee</SelectItem></SelectContent>
      </Select>
    );
    return <Input type={field.type || "text"} value={form[field.name] ?? ""} onChange={e => set(field.name, e.target.value)} placeholder={field.placeholder || ""} />;
  };
  const submit = async () => {
    setSaving(true);
    try { await onSave(config, config.buildPayload(form)); onOpenChange(false); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{config.title}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {config.fields.map(f => (
            <div key={f.name} className={f.type === "textarea" ? "space-y-1 sm:col-span-2" : "space-y-1"}>
              <Label>{f.label}</Label>{renderField(f)}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Profile card ─────────────────────────────────────────────────────────────

function PersonnelProfileCard({ person, editing, onEdit, onCancel, onSaved }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(person);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  useEffect(() => { setForm(person); }, [person]);
  const set = (f, v) => setForm(cur => ({ ...cur, [f]: v }));
  const updateNamePart = (f, v) => setForm(cur => {
    const next = { ...cur, [f]: v };
    return { ...next, name: buildDisplayName(next) };
  });
  const saveMutation = useMutation({
    mutationFn: async () => {
      const displayName = buildDisplayName(form);
      const address = normalizeAddressParts(form);
      return base44.entities.Personnel.update(person.id, {
        ...form,
        ...address,
        name: displayName,
        is_active: !["inactive", "archived"].includes(form.status || "active"),
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["personnel"] }); onSaved?.(); },
  });
  const handlePhotoUploaded = (file_url) => {
    setForm(cur => ({ ...cur, photo_file_url: file_url }));
  };
  const data = editing ? form : person;
  const relationship = getRelationshipType(data);
  const address = formatAddress(data, { omitDefaultCountry: true });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Hero banner */}
      <div className="flex flex-col sm:flex-row">
        {/* Left: passport photo — 3.5 × 4.5 cm ratio (7:9) */}
        <div className="group relative shrink-0 overflow-hidden sm:w-[175px]" style={{ aspectRatio: "7/9" }}>
          {data.photo_file_url
            ? <img src={data.photo_file_url} alt="" className="h-full w-full object-cover object-top" />
            : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <span className="text-5xl font-bold text-muted-foreground/40">{getDisplayName(data).slice(0, 1).toUpperCase()}</span>
              </div>
            )
          }
          {editing && (
            <PhotoCropUpload
              onUploaded={handlePhotoUploaded}
              uploading={uploadingPhoto}
              setUploading={setUploadingPhoto}
            />
          )}
        </div>

        {/* Right: info banner */}
        <div className="flex min-w-0 flex-1 flex-col justify-between border-t border-border bg-gradient-to-br from-background to-muted/20 px-6 py-5 sm:border-l sm:border-t-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="grid max-w-4xl grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="space-y-1"><span className="text-xs text-muted-foreground">Initialen</span><Input value={data.initials || ""} onChange={e => set("initials", e.target.value)} className="h-8 text-sm" /></div>
                  <div className="space-y-1"><span className="text-xs text-muted-foreground">Voornamen</span><Input value={data.legal_first_names || ""} onChange={e => updateNamePart("legal_first_names", e.target.value)} className="h-8 text-sm" /></div>
                  <div className="space-y-1"><span className="text-xs text-muted-foreground">Roepnaam</span><Input value={data.first_name || data.call_name || ""} onChange={e => { updateNamePart("first_name", e.target.value); set("call_name", e.target.value); }} className="h-8 text-sm" /></div>
                  <div className="space-y-1"><span className="text-xs text-muted-foreground">Tussenvoegsel</span><Input value={data.name_prefix || ""} onChange={e => updateNamePart("name_prefix", e.target.value)} className="h-8 text-sm" /></div>
                  <div className="space-y-1 md:col-span-2"><span className="text-xs text-muted-foreground">Achternaam</span><Input value={data.last_name || ""} onChange={e => updateNamePart("last_name", e.target.value)} className="h-8 text-sm" /></div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {data.function_type && data.function_type !== "unknown" && (
                      <BadgePill className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{FUNCTION_LABELS[data.function_type] || data.function_type}</BadgePill>
                    )}
                  </div>
                  <h2 className="text-[1.6rem] font-bold tracking-tight text-foreground leading-tight">
                    {buildFullName(data) || "Naam onbekend"}
                  </h2>
                  {data.job_title_raw && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{data.job_title_raw}</p>
                  )}
                  <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                    {[
                      { label: "Roepnaam", value: data.call_name || data.first_name },
                      { label: "Initialen", value: data.initials },
                      { label: "E-mail", value: data.email },
                      { label: "Telefoon", value: data.phone },
                      { label: "Geslacht", value: data.gender === "male" ? "Man" : data.gender === "female" ? "Vrouw" : data.gender === "other" ? "Anders" : null },
                      { label: "Geboortedatum", value: formatDate(data.date_of_birth, null) },
                      { label: "Geboorteplaats", value: data.place_of_birth },
                      { label: "Geboorteland", value: data.country_of_birth },
                      { label: "Nationaliteit", value: data.nationality },
                      { label: "Adres", value: address || null },
                      { label: "Personeelsnr.", value: data.personnel_number ? `#${data.personnel_number}` : null },
                    ].filter(f => f.value).map(f => (
                      <div key={f.label} className="flex gap-2 py-0.5">
                        <span className="w-28 shrink-0 text-muted-foreground">{f.label}</span>
                        <span className="font-medium text-foreground">{f.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {editing ? (
                <>
                  <Button variant="outline" size="sm" onClick={onCancel} disabled={saveMutation.isPending || uploadingPhoto}><X className="mr-1 h-4 w-4" /> Annuleren</Button>
                  <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploadingPhoto}><Check className="mr-1 h-4 w-4" /> {saveMutation.isPending ? "Opslaan..." : "Opslaan"}</Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="mr-1 h-4 w-4" /> Wijzigen</Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Details (only shown in edit mode) */}
      {editing && (
        <>
          <div className="grid grid-cols-1 gap-x-12 gap-y-6 border-t border-border p-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Persoonlijke gegevens</h3>
              <ProfileInfoRow label="Geslacht" editing={editing} value={data.gender === "male" ? "Man" : data.gender === "female" ? "Vrouw" : data.gender === "other" ? "Anders" : "Onbekend"}>
                <Select value={data.gender || "unknown"} onValueChange={v => set("gender", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="male">Man</SelectItem><SelectItem value="female">Vrouw</SelectItem><SelectItem value="other">Anders</SelectItem><SelectItem value="unknown">Onbekend</SelectItem></SelectContent>
                </Select>
              </ProfileInfoRow>
              <ProfileInfoRow label="Geboortedatum" editing={editing} value={formatDate(data.date_of_birth)}><Input type="date" value={data.date_of_birth || ""} onChange={e => set("date_of_birth", e.target.value)} /></ProfileInfoRow>
              <ProfileInfoRow label="Geboorteplaats" editing={editing} value={data.place_of_birth}><PlaceSearchInput value={data.place_of_birth || ""} onChange={v => set("place_of_birth", v)} /></ProfileInfoRow>
              <ProfileInfoRow label="Geboorteland" editing={editing} value={data.country_of_birth}><CountrySelect value={data.country_of_birth || ""} onChange={v => set("country_of_birth", v)} /></ProfileInfoRow>
              <ProfileInfoRow label="Nationaliteit" editing={editing} value={data.nationality}><NationalitySelect value={data.nationality || ""} onChange={v => set("nationality", v)} /></ProfileInfoRow>
            </div>
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact & adres</h3>
              <ProfileInfoRow label="E-mail" editing={editing} value={data.email}><Input type="email" value={data.email || ""} onChange={e => set("email", e.target.value)} /></ProfileInfoRow>
              <ProfileInfoRow label="Telefoon" editing={editing} value={data.phone}>
                <div className="flex gap-2">
                  <Select
                    value={(data.phone || "").startsWith("+") ? (data.phone.match(/^(\+\d+)\s/)?.[1] || "+31") : "+31"}
                    onValueChange={code => {
                      const local = (data.phone || "").replace(/^\+\d+\s?/, "");
                      set("phone", `${code} ${local}`);
                    }}
                  >
                    <SelectTrigger className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {[
                        { code: "+31", label: "🇳🇱 +31" },
                        { code: "+32", label: "🇧🇪 +32" },
                        { code: "+49", label: "🇩🇪 +49" },
                        { code: "+33", label: "🇫🇷 +33" },
                        { code: "+44", label: "🇬🇧 +44" },
                        { code: "+1",  label: "🇺🇸 +1" },
                        { code: "+90", label: "🇹🇷 +90" },
                        { code: "+212", label: "🇲🇦 +212" },
                        { code: "+213", label: "🇩🇿 +213" },
                        { code: "+216", label: "🇹🇳 +216" },
                        { code: "+34", label: "🇪🇸 +34" },
                        { code: "+39", label: "🇮🇹 +39" },
                        { code: "+48", label: "🇵🇱 +48" },
                        { code: "+40", label: "🇷🇴 +40" },
                        { code: "+380", label: "🇺🇦 +380" },
                        { code: "+359", label: "🇧🇬 +359" },
                        { code: "+20", label: "🇪🇬 +20" },
                        { code: "+234", label: "🇳🇬 +234" },
                        { code: "+27", label: "🇿🇦 +27" },
                        { code: "+55", label: "🇧🇷 +55" },
                      ].map(({ code, label }) => (
                        <SelectItem key={code} value={code}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={(data.phone || "").replace(/^\+\d+\s?/, "")}
                    onChange={e => {
                      const code = (data.phone || "").startsWith("+") ? (data.phone.match(/^(\+\d+)\s/)?.[1] || "+31") : "+31";
                      set("phone", `${code} ${e.target.value}`);
                    }}
                    placeholder="612345678"
                    className="flex-1"
                  />
                </div>
              </ProfileInfoRow>
              <ProfileInfoRow label="Adres" editing={editing} value={address}>
                <AddressAutocomplete
                  value={data}
                  onAddressSelect={selectedAddress => setForm(current => ({ ...current, ...selectedAddress }))}
                />
              </ProfileInfoRow>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-muted/20 px-6 py-3">
            <Button variant="outline" onClick={onCancel} disabled={saveMutation.isPending || uploadingPhoto}><X className="mr-1 h-4 w-4" /> Annuleren</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploadingPhoto}><Check className="mr-1 h-4 w-4" /> {saveMutation.isPending ? "Wijzigingen opslaan..." : "Wijzigingen opslaan"}</Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab content components ───────────────────────────────────────────────────

function OverviewTab({ person, companies, dossier }) {
  const company = companies.find(c => c.id === person.primary_company_id);
  const expiring = [
    ...dossier.documents.map(d => ({ label: DOCUMENT_CATEGORIES.find(c => c.value === d.category)?.label || d.category, date: d.valid_until })),
    ...dossier.qualifications.map(q => ({ label: q.name, date: q.valid_until })),
    ...dossier.securityPasses.map(s => ({ label: s.pass_number || "Beveiligingspas", date: s.valid_until })),
  ].filter(d => getExpiryState(d.date));
  const checklist = [
    { label: "Displaynaam", done: !!getDisplayName(person) },
    { label: "E-mail", done: !!person.email },
    { label: "Geboortedatum", done: !!person.date_of_birth },
    { label: "Adres", done: !!(person.street_name && person.postal_code && person.city) },
    { label: "Primair bedrijf", done: !!person.primary_company_id },
    { label: "Identiteitsdocument", done: dossier.documents.some(d => d.category === "identity_document") },
    { label: "Bankrekening", done: dossier.bankAccounts.length > 0 || person.employee_type === "zzp" },
    { label: "ICE-contact", done: dossier.emergencyContacts.length > 0 },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <SectionPanel title="Kernstatus" icon={ClipboardCheck}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="rounded-md border border-border px-3 py-2"><p className="text-xs text-muted-foreground">HR-dossier</p><BadgePill className={HR_COLORS[person.hr_completeness_status || "incomplete"]}>{HR_LABELS[person.hr_completeness_status || "incomplete"]}</BadgePill></div>
          <div className="rounded-md border border-border px-3 py-2"><p className="text-xs text-muted-foreground">Relatie</p><p className="text-sm font-medium">{RELATIONSHIP_LABELS[getRelationshipType(person)]}</p></div>
          <div className="rounded-md border border-border px-3 py-2"><p className="text-xs text-muted-foreground">Bedrijf</p><p className="text-sm font-medium">{company?.display_name || "-"}</p></div>
        </div>
      </SectionPanel>
      <SectionPanel title="Checklist" icon={BadgeCheck}>
        <div className="space-y-2">
          {checklist.map(item => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <span>{item.label}</span>
              <BadgePill className={item.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>{item.done ? "OK" : "Mist"}</BadgePill>
            </div>
          ))}
        </div>
      </SectionPanel>
      <SectionPanel title="Aandacht" icon={AlertTriangle}>
        {expiring.length === 0
          ? <SmallEmpty text="Geen verlopen of bijna verlopen items gevonden." />
          : <div className="space-y-2">{expiring.slice(0, 6).map((item, i) => { const state = getExpiryState(item.date); return (<div key={i} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"><span>{item.label}</span><BadgePill className={state.className}>{state.label}</BadgePill></div>); })}</div>
        }
      </SectionPanel>
    </div>
  );
}

function IdentityDocumentPreviewDialog({ document, open, onOpenChange }) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const urls = identityDocumentUrls(document);
  const kind = identityDocumentKind(document);
  const images = [
    urls.front && {
      key: "front",
      label: kind === "passport" ? "Voorkant / houderpagina" : "Voorzijde",
      url: urls.front,
    },
    urls.back && {
      key: "back",
      label: kind === "passport" ? "Achterkant / BSN-pagina" : "Achterzijde",
      url: urls.back,
    },
  ].filter(Boolean);
  const currentIndex = Math.min(activeImageIndex, Math.max(images.length - 1, 0));
  const activeImage = images[currentIndex];

  useEffect(() => {
    if (open) setActiveImageIndex(0);
  }, [document?.id, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{identityDocumentDisplayType(document)}</DialogTitle>
        </DialogHeader>
        {images.length === 0 ? (
          <SmallEmpty text="Voor dit document is nog geen upload beschikbaar." />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{activeImage.label}</p>
              {images.length > 1 && (
                <span className="text-xs text-muted-foreground">{currentIndex + 1} van {images.length}</span>
              )}
            </div>
            <div className="flex max-h-[72vh] min-h-[360px] items-center justify-center overflow-auto rounded-lg border border-border bg-muted/20 p-3">
              <img src={activeImage.url} alt={activeImage.label} className="max-h-[72vh] w-auto max-w-full object-contain" />
            </div>
          </div>
        )}
        {images.length > 1 && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveImageIndex(index => Math.max(index - 1, 0))}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Vorige
            </Button>
            <Button
              type="button"
              onClick={() => setActiveImageIndex(index => Math.min(index + 1, images.length - 1))}
              disabled={currentIndex === images.length - 1}
            >
              Volgende <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IdentityDeleteConfirmDialog({ document, open, onOpenChange, onConfirm, isPending }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const kind = identityDocumentKind(document);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError("");
    }
  }, [open]);

  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) {
      setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`);
      return;
    }
    onConfirm?.(document);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Document definitief verwijderen?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {identityDocumentDisplayType(document)} {document?.document_number ? `#${document.document_number}` : ""} wordt verwijderd.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Deze actie is alleen bedoeld voor verkeerd toegevoegde archiefdocumenten.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Typ <strong className="font-mono text-foreground">{DELETE_PASSWORD}</strong> om te bevestigen
            </Label>
            <Input
              value={password}
              onChange={event => { setPassword(event.target.value); setError(""); }}
              onKeyDown={event => event.key === "Enter" && handleConfirm()}
              placeholder={DELETE_PASSWORD}
              className={`h-9 font-mono ${error ? "border-destructive" : ""}`}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Annuleren</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
            <Trash2 className="mr-1 h-4 w-4" /> {isPending ? "Verwijderen..." : "Verwijderen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IdentityDocumentRow({
  doc,
  archived = false,
  onPreview,
  onRenew,
  onArchive,
  onRestore,
  onDelete,
  auditActors = [],
  restorePending = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const expiry = getExpiryState(doc.valid_until);
  const canPreview = hasIdentityDocumentUpload(doc);
  const isExpired = !archived && isExpiredIdentityDocument(doc);
  const canArchive = !archived;
  const canRestore = archived;
  const canDelete = archived;
  const kind = identityDocumentKind(doc);

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  const openRow = () => {
    if (isExpired) {
      setMenuOpen(current => !current);
    } else if (canPreview) {
      onPreview?.(doc);
    }
  };

  return (
    <div
      className={`${IDENTITY_TABLE_GRID} relative items-center px-5 py-3 transition-colors ${
        isExpired || canPreview ? "cursor-pointer hover:bg-accent/35" : ""
      }`}
      onClick={openRow}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {identityDocumentDisplayType(doc)}
        </p>
      </div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{doc.document_number || "-"}</span>
      <div className="min-w-0">
        <IdentityStatusBadge doc={doc} archived={archived} />
      </div>
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-sm text-foreground">{formatDate(doc.valid_until)}</span>
        {expiry && !archived && <BadgePill className={expiry.className}>{expiry.label}</BadgePill>}
      </div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(doc, auditActors)}</span>
      <div className="flex justify-end gap-1">
        {canArchive && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={event => { event.stopPropagation(); onArchive?.(doc); }}
            title="Naar archief"
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
        {canRestore && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={event => { event.stopPropagation(); onRestore?.(doc); }}
            disabled={restorePending}
            title="Terugzetten naar actief"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={event => { event.stopPropagation(); onDelete?.(doc); }}
            title="Definitief verwijderen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {menuOpen && isExpired && (
        <div
          ref={menuRef}
          className="absolute right-4 top-11 z-50 min-w-[210px] overflow-hidden rounded-lg border border-border bg-popover py-1 text-sm shadow-lg"
          onClick={event => event.stopPropagation()}
        >
          {canPreview && (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
              onClick={() => { setMenuOpen(false); onPreview(doc); }}
            >
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              Document bekijken
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
            onClick={() => { setMenuOpen(false); onRenew(kind); }}
          >
            <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
            {identityDocumentKindLabel(kind)} vernieuwen
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sidebar tabs panel ───────────────────────────────────────────────────────

function PersonnelSidebarTabs({ person, companies, dossier, onAddRecord, auditActors = [] }) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState(PERSONNEL_TABS[0].key);
  const [identityWizard, setIdentityWizard] = useState(null);
  const [showIdentityArchive, setShowIdentityArchive] = useState(false);
  const [identityPreviewDoc, setIdentityPreviewDoc] = useState(null);
  const [identityDeleteDoc, setIdentityDeleteDoc] = useState(null);
  const [identityArchiveMessage, setIdentityArchiveMessage] = useState(null);

  useEffect(() => {
    if (!identityArchiveMessage) return undefined;
    const timer = setTimeout(() => setIdentityArchiveMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [identityArchiveMessage]);

  const { data: currentUser = null } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: wpbrLicenses = [] } = useQuery({
    queryKey: ["company-wpbr-licenses", "personnel-korpschef"],
    queryFn: () => safeList("CompanyWpbrLicense", "-created_date"),
  });

  const korpschefDocuments = useMemo(
    () => dossier.documents.filter(isKorpschefDocument),
    [dossier.documents]
  );
  const korpschefCompanyOptions = useMemo(
    () => buildKorpschefCompanyOptions(companies, wpbrLicenses),
    [companies, wpbrLicenses]
  );
  const showKorpschef = korpschefCompanyOptions.length > 0
    || korpschefDocuments.length > 0
    || dossier.securityPasses.length > 0;
  const visibleTabs = useMemo(
    () => PERSONNEL_TABS.filter(item => item.key !== "korpschef" || showKorpschef),
    [showKorpschef]
  );

  useEffect(() => {
    if (active === "korpschef" && !showKorpschef) setActive("identity");
  }, [active, showKorpschef]);

  const generalDocuments = dossier.documents.filter(d => ![
    "identity_document",
    "drivers_license",
    "vog",
    "cv",
    "bank_account_proof",
    "payroll_tax_statement",
    "wpbr_permission",
    "wpbr_badge",
  ].includes(d.category));
  const identityAllDocs = useMemo(() => dossier.documents.filter(isIdentityLikeDocument), [dossier.documents]);
  const identitySplit = useMemo(() => splitIdentityDocumentsByActiveState(identityAllDocs), [identityAllDocs]);
  const identityOrder = Object.fromEntries(IDENTITY_DOCUMENT_KINDS.map((item, index) => [item.key, index]));
  const sortIdentityDocs = docs => [...docs].sort((a, b) => {
    const kindDiff = (identityOrder[identityDocumentKind(a)] ?? 99) - (identityOrder[identityDocumentKind(b)] ?? 99);
    if (kindDiff !== 0) return kindDiff;
    return dateSortKey(b.valid_until).localeCompare(dateSortKey(a.valid_until));
  });
  const identityDocs = sortIdentityDocs(identitySplit.active);
  const identityArchived = sortIdentityDocs(identitySplit.archived);
  const hasActiveIdentity = identityDocs.some(d => ["passport", "id_card"].includes(identityDocumentKind(d)));
  const identityNeedsAttention = !hasActiveIdentity || identityDocs.some(d => getExpiryState(d.valid_until));
  const cvDocs = dossier.documents.filter(d => d.category === "cv");
  const routeExecutions = dossier.routeExecutions?.filter(r => r.employee_id === person.id).slice(0, 8) || [];
  const showIdentityWizard = Boolean(identityWizard);

  const openIdentityWizard = (archiveMode = false) => {
    setShowIdentityArchive(false);
    setIdentityArchiveMessage(null);
    setIdentityWizard({ archiveMode });
  };
  const identityDocsToAutoArchive = useMemo(
    () => identitySplit.effectiveArchived.filter(doc => doc.metadata?.archived !== true),
    [identitySplit]
  );
  const identityDocsToAutoArchiveSignature = identityDocsToAutoArchive
    .map(doc => `${doc.id}:${identityDocumentKind(doc)}:${doc.valid_until || ""}`)
    .join("|");

  const archiveIdentityMutation = useMutation({
    mutationFn: doc => base44.entities.PersonnelDocument.update(doc.id, {
      verification_status: "expired",
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
        ...(doc.metadata || {}),
        archived: true,
        archived_at: new Date().toISOString(),
      }, auditActors),
    }),
    onSuccess: (_data, doc) => {
      setIdentityArchiveMessage({
        type: "success",
        text: `${identityDocumentKindLabel(identityDocumentKind(doc))} is naar het archief gezet.`,
      });
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
    },
  });

  const restoreIdentityMutation = useMutation({
    mutationFn: async doc => {
      const kind = identityDocumentKind(doc);
      const allDocs = await base44.entities.PersonnelDocument.filter({ personnel_id: person.id }, "-created_date");
      const sameKindActiveDocs = allDocs
        .filter(item => item.id !== doc.id)
        .filter(isIdentityLikeDocument)
        .filter(item => identityDocumentKind(item) === kind)
        .filter(item => !isArchivedIdentityDocument(item));

      const winner = [doc, ...sameKindActiveDocs]
        .sort((a, b) => compareIdentityRestoreCandidates(a, b, doc.id))[0];

      if (winner?.id !== doc.id) {
        return {
          restored: false,
          kind,
          activeDoc: winner,
        };
      }

      const now = new Date().toISOString();
      await Promise.all(sameKindActiveDocs.map(activeDoc => base44.entities.PersonnelDocument.update(activeDoc.id, {
        verification_status: "expired",
        metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
          ...(activeDoc.metadata || {}),
          archived: true,
          archived_at: now,
          archived_reason: "Vervangen door teruggezet archiefdocument",
        }, auditActors),
      })));

      await base44.entities.PersonnelDocument.update(doc.id, {
        verification_status: verificationStatusForActiveIdentityDocument(doc),
        metadata: buildAuditMetadata(currentUser, "teruggezet", {
          ...(doc.metadata || {}),
          archived: false,
          archived_at: null,
          restored_from_archive_at: now,
        }, auditActors),
      });

      return {
        restored: true,
        kind,
        replacedCount: sameKindActiveDocs.length,
      };
    },
    onSuccess: result => {
      if (result?.restored) {
        setIdentityArchiveMessage({
          type: "success",
          text: result.replacedCount > 0
            ? `${identityDocumentKindLabel(result.kind)} is teruggezet naar actief. Het eerdere actieve document van hetzelfde type is naar het archief gezet.`
            : `${identityDocumentKindLabel(result.kind)} is teruggezet naar actieve documenten.`,
        });
      } else {
        setIdentityArchiveMessage({
          type: "warning",
          text: `Niet teruggezet: er is al een nieuwer of even lang geldig actief ${identityDocumentKindLabel(result.kind).toLowerCase()}. Dit document blijft in het archief.`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
      queryClient.invalidateQueries({ queryKey: ["personnel-documents", person.id] });
    },
  });

  const deleteIdentityMutation = useMutation({
    mutationFn: doc => base44.entities.PersonnelDocument.delete(doc.id),
    onSuccess: () => {
      setIdentityDeleteDoc(null);
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
    },
  });

  useEffect(() => {
    if (identityDocsToAutoArchive.length === 0) return undefined;

    let cancelled = false;
    Promise.all(identityDocsToAutoArchive.map(doc => base44.entities.PersonnelDocument.update(doc.id, {
      verification_status: "expired",
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
        ...(doc.metadata || {}),
        archived: true,
        archived_at: new Date().toISOString(),
      }, auditActors),
    }))).then(() => {
      if (!cancelled) queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
    }).catch(error => {
      console.error("Identity document auto-archive failed", error);
    });

    return () => {
      cancelled = true;
    };
  }, [auditActors, currentUser, identityDocsToAutoArchive, identityDocsToAutoArchiveSignature, queryClient]);

  const renderTab = () => {
    switch (active) {
      case null: return (
        <div className="flex h-full items-center justify-center text-center py-16">
          <div>
            <p className="text-sm text-muted-foreground">Selecteer een tabblad om het dossier te bekijken.</p>
          </div>
        </div>
      );
      case "overview": return <OverviewTab person={person} companies={companies} dossier={dossier} />;
      case "payroll": return <PayrollTab person={person} documents={dossier.documents} auditActors={auditActors} />;
      case "identity": return (
        <div className="flex flex-col h-full">
          <AnimatePresence>
            {showIdentityWizard && (
              <IdentityDocumentWizard
                personnelId={person.id}
                personnel={person}
                nationality={person.nationality}
                isArchiveEntry={identityWizard.archiveMode}
                auditActors={auditActors}
                onClose={() => setIdentityWizard(null)}
                onSaved={() => setIdentityWizard(null)}
              />
            )}
          </AnimatePresence>

          <div className={`${IDENTITY_TABLE_GRID} items-center border-b border-border bg-muted/30 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
            <span>Type / omschrijving</span>
            <span>Documentnummer</span>
            <span>Status</span>
            <span>Geldig tot</span>
            <span>Door</span>
            {!showIdentityWizard && (
              <div className="flex flex-nowrap items-center justify-end gap-2">
                {showIdentityArchive && <Badge className="shrink-0 bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 animate-pulse">Archief</Badge>}
                {showIdentityArchive ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setShowIdentityArchive(false)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                      <ArrowLeft className="w-3 h-3 mr-1" /> Actieve documenten
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openIdentityWizard(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                      <Plus className="w-3 h-3 mr-1" /> Voeg oud document in archief
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setShowIdentityArchive(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                      <Archive className="w-3 h-3 mr-1" /> Archief {identityArchived.length > 0 ? `(${identityArchived.length})` : ""}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openIdentityWizard()} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                      <Plus className="w-3 h-3 mr-1" /> Nieuw document
                    </Button>
                  </>
                )}
              </div>
            )}
            {showIdentityWizard && (
              <div className="flex justify-end">
                {showIdentityArchive && <Badge className="shrink-0 bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 animate-pulse">Archief</Badge>}
              </div>
            )}
          </div>

          {identityArchiveMessage && !showIdentityWizard && (
            <div className="px-5 pt-3">
              <div className={`flex items-start gap-3 rounded-md border px-3 py-2 text-xs ${
                identityArchiveMessage.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
              }`}>
                <span>{identityArchiveMessage.text}</span>
              </div>
            </div>
          )}

          {showIdentityArchive ? (
            identityArchived.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Geen documenten in het archief.</p>
            ) : (
              <div className="divide-y divide-border">
                {identityArchived.map(doc => (
                  <IdentityDocumentRow
                    key={doc.id}
                    doc={doc}
                    archived
                    onPreview={setIdentityPreviewDoc}
                    onRenew={() => openIdentityWizard()}
                    onArchive={archiveIdentityMutation.mutate}
                    onRestore={restoreIdentityMutation.mutate}
                    onDelete={setIdentityDeleteDoc}
                    auditActors={auditActors}
                    restorePending={restoreIdentityMutation.isPending}
                  />
                ))}
              </div>
            )
          ) : identityDocs.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nog geen legitimatiebewijs of rijbewijs geregistreerd.</p>
          ) : (
            <div className="divide-y divide-border">
              {identityDocs.map(doc => (
                <IdentityDocumentRow
                  key={doc.id}
                  doc={doc}
                  onPreview={setIdentityPreviewDoc}
                  onRenew={() => openIdentityWizard()}
                  onArchive={archiveIdentityMutation.mutate}
                  onDelete={setIdentityDeleteDoc}
                  auditActors={auditActors}
                />
              ))}
            </div>
          )}

          <IdentityDocumentPreviewDialog
            document={identityPreviewDoc}
            open={Boolean(identityPreviewDoc)}
            onOpenChange={open => { if (!open) setIdentityPreviewDoc(null); }}
          />
          <IdentityDeleteConfirmDialog
            document={identityDeleteDoc}
            open={Boolean(identityDeleteDoc)}
            onOpenChange={open => { if (!open) setIdentityDeleteDoc(null); }}
            onConfirm={doc => deleteIdentityMutation.mutate(doc)}
            isPending={deleteIdentityMutation.isPending}
          />

        </div>
      );
      case "documents": return (
        <SectionPanel title="Documenten" icon={FileText} action={<Button size="sm" variant="outline" onClick={() => onAddRecord("document")}><Plus className="mr-1 h-4 w-4" />Toevoegen</Button>}>
          <MiniTable emptyText="Nog geen documenten." rows={generalDocuments} columns={[
            { key: "category", label: "Categorie", render: r => DOCUMENT_CATEGORIES.find(c => c.value === r.category)?.label || r.category },
            { key: "document_type", label: "Type" }, { key: "document_number", label: "Nummer" },
            { key: "valid_until", label: "Geldig tot", render: r => formatDate(r.valid_until) },
            { key: "verification_status", label: "Status", render: r => <BadgePill className={r.verification_status === "verified" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>{VERIFICATION_LABELS[r.verification_status] || r.verification_status}</BadgePill> },
            { key: "audit_actor", label: "Door", render: r => getAuditActorLabel(r, auditActors) },
          ]} />
        </SectionPanel>
      );
      case "korpschef": return (
        <PersonnelKorpschefTab
          personnel={person}
          companies={companies}
          companyOptions={korpschefCompanyOptions}
          licenses={wpbrLicenses}
          documents={korpschefDocuments}
          securityPasses={dossier.securityPasses}
          auditActors={auditActors}
        />
      );
      case "bank": return <PersonnelBankTab person={person} bankAccounts={dossier.bankAccounts} auditActors={auditActors} />;
      case "ice": return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionPanel title="ICE-contactpersonen" icon={Users} action={<Button size="sm" variant="outline" onClick={() => onAddRecord("emergencyContact")}><Plus className="mr-1 h-4 w-4" />Contact</Button>}>
            <MiniTable emptyText="Nog geen noodcontacten." rows={dossier.emergencyContacts} columns={[
              { key: "name", label: "Naam" }, { key: "relationship", label: "Relatie" },
              { key: "phone_1", label: "Telefoon 1" }, { key: "email", label: "E-mail" },
            ]} />
          </SectionPanel>
          <SectionPanel title="CV" icon={FileText} action={<Button size="sm" variant="outline" onClick={() => onAddRecord("document")}><Plus className="mr-1 h-4 w-4" />Document</Button>}>
            <MiniTable emptyText="Nog geen CV." rows={cvDocs} columns={[
              { key: "document_type", label: "Omschrijving" },
              { key: "valid_from", label: "Datum", render: r => formatDate(r.valid_from) },
              { key: "verification_status", label: "Status", render: r => VERIFICATION_LABELS[r.verification_status] || r.verification_status },
              { key: "audit_actor", label: "Door", render: getAuditActorLabel },
            ]} />
          </SectionPanel>
        </div>
      );
      case "contracts": return <PersonnelContractsTab personnel={person} companies={companies} />;
      case "planning": return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionPanel title="Klant/object restricties" icon={ClipboardCheck} action={<Button size="sm" variant="outline" onClick={() => onAddRecord("restriction")}><Plus className="mr-1 h-4 w-4" />Restrictie</Button>}>
            <MiniTable emptyText="Geen restricties." rows={dossier.restrictions} columns={[
              { key: "scope_label", label: "Klant/object" }, { key: "may_work", label: "Mag werken", render: r => r.may_work ? "Ja" : "Nee" },
              { key: "reason", label: "Reden" }, { key: "valid_until", label: "Tot", render: r => formatDate(r.valid_until) },
            ]} />
          </SectionPanel>
          <SectionPanel title="Verlof en ziekte" icon={CalendarDays} action={<Button size="sm" variant="outline" onClick={() => onAddRecord("absence")}><Plus className="mr-1 h-4 w-4" />Afwezigheid</Button>}>
            <MiniTable emptyText="Geen verlof- of ziekteregistraties." rows={dossier.absences} columns={[
              { key: "absence_type", label: "Type" }, { key: "start_date", label: "Start", render: r => formatDate(r.start_date) },
              { key: "end_date", label: "Einde", render: r => formatDate(r.end_date) }, { key: "status", label: "Status" },
            ]} />
          </SectionPanel>
        </div>
      );
      case "materials": return (
        <SectionPanel title="Materiaal" icon={Package} action={<Button size="sm" variant="outline" onClick={() => onAddRecord("material")}><Plus className="mr-1 h-4 w-4" />Toevoegen</Button>}>
          <MiniTable emptyText="Nog geen materiaal uitgegeven." rows={dossier.materials} columns={[
            { key: "material", label: "Materiaal" }, { key: "quantity", label: "Aantal" },
            { key: "serial_number", label: "Serienummer" }, { key: "issued_at", label: "Uitgegeven", render: r => formatDate(r.issued_at) },
            { key: "status", label: "Status" },
          ]} />
        </SectionPanel>
      );
      case "notes": return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionPanel title="Notities" icon={MessageSquareText} action={<Button size="sm" variant="outline" onClick={() => onAddRecord("note")}><Plus className="mr-1 h-4 w-4" />Notitie</Button>}>
            <MiniTable emptyText="Nog geen notities." rows={dossier.notes} columns={[
              { key: "title", label: "Titel" }, { key: "note_type", label: "Type" },
              { key: "body", label: "Notitie" }, { key: "created_at", label: "Datum", render: r => formatDate(r.created_at) },
            ]} />
          </SectionPanel>
          <SectionPanel title="Functioneringsgesprekken" icon={ClipboardCheck} action={<Button size="sm" variant="outline" onClick={() => onAddRecord("review")}><Plus className="mr-1 h-4 w-4" />Gesprek</Button>}>
            <MiniTable emptyText="Nog geen gesprekken." rows={dossier.reviews} columns={[
              { key: "review_type", label: "Type" }, { key: "review_date", label: "Datum", render: r => formatDate(r.review_date) },
              { key: "subject", label: "Onderwerp" }, { key: "status", label: "Status" },
            ]} />
          </SectionPanel>
        </div>
      );
      default: return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
          <PersonnelAccessTab personnel={person} />
          <SectionPanel title="Koppelregels profiel" icon={Handshake}>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Het eigen account van de medewerker of ZZP'er heeft voorrang na bevestigde koppeling.</p>
              <div className="rounded-md border border-border px-3 py-2">
                <FieldRow label="Koppelstatus">{TEAMHUB_LINK_LABELS[person.teamhub_link_status] || (person.linked_user_id ? "Gekoppeld" : "Lokaal profiel")}</FieldRow>
                <FieldRow label="Review bij conflicten">Vereist voor overschrijven</FieldRow>
              </div>
            </div>
          </SectionPanel>
        </div>
      );
    }
  };

  return (
    <div className="mt-4 flex min-h-[200px] overflow-visible rounded-xl border border-border bg-card shadow-sm">
      <div className="w-52 shrink-0 border-r border-border bg-muted/20 py-2">
        <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Dossier</p>
        {visibleTabs.map(item => {
          const needsAttention = item.key === "identity" && identityNeedsAttention;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActive(item.key)}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] font-medium transition-all ${
                active === item.key
                  ? "border-r-2 border-primary bg-primary/5 text-primary"
                  : needsAttention
                    ? "border-r-2 border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-muted/40"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              <item.icon className={`h-3.5 w-3.5 shrink-0 ${active === item.key ? "text-primary" : needsAttention ? "text-amber-500" : ""}`} />
              <span className="flex-1">{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className={`min-w-0 flex-1 ${["identity", "payroll", "bank", "contracts", "korpschef"].includes(active) ? "" : "p-5 overflow-hidden"}`}>{renderTab()}</div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PersonnelDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const personnelId = urlParams.get("id");
  const isNewProfileFlow = urlParams.get("new") === "1";
  const shouldOpenInEditMode = isNewProfileFlow || urlParams.get("edit") === "1";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [recordDialogType, setRecordDialogType] = useState(null);
  const initializedEdit = React.useRef(false);

  const { data: allPersonnel = [] } = useQuery({ queryKey: ["personnel"], queryFn: () => base44.entities.Personnel.list() });
  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => base44.entities.Company.list() });
  const { data: documents = [] } = useQuery({ queryKey: ["personnel-documents"], queryFn: () => safeList("PersonnelDocument", "-created_date") });
  const { data: qualifications = [] } = useQuery({ queryKey: ["personnel-qualifications"], queryFn: () => safeList("PersonnelQualification", "-created_date") });
  const { data: bankAccounts = [] } = useQuery({ queryKey: ["personnel-bank-accounts"], queryFn: () => safeList("PersonnelBankAccount", "-created_date") });
  const { data: emergencyContacts = [] } = useQuery({ queryKey: ["personnel-emergency-contacts"], queryFn: () => safeList("PersonnelEmergencyContact", "-created_date") });
  const { data: securityPasses = [] } = useQuery({ queryKey: ["personnel-security-passes"], queryFn: () => safeList("PersonnelSecurityPass", "-created_date") });
  const { data: restrictions = [] } = useQuery({ queryKey: ["personnel-restrictions"], queryFn: () => safeList("PersonnelRestriction", "-created_date") });
  const { data: materials = [] } = useQuery({ queryKey: ["personnel-materials"], queryFn: () => safeList("PersonnelMaterial", "-created_date") });
  const { data: notes = [] } = useQuery({ queryKey: ["personnel-notes"], queryFn: () => safeList("PersonnelNote", "-created_date") });
  const { data: reviews = [] } = useQuery({ queryKey: ["personnel-reviews"], queryFn: () => safeList("PersonnelPerformanceReview", "-created_date") });
  const { data: absences = [] } = useQuery({ queryKey: ["personnel-absences"], queryFn: () => safeList("PersonnelAbsence", "-created_date") });
  const { data: routeExecutions = [] } = useQuery({ queryKey: ["route-executions"], queryFn: () => safeList("RouteExecution", "-service_date") });
  const { data: currentUser = null } = useQuery({ queryKey: ["current-user"], queryFn: () => base44.auth.me(), staleTime: 5 * 60 * 1000 });

  const person = allPersonnel.find(p => p.id === personnelId);

  const deleteEmptyDraftMutation = useMutation({
    mutationFn: (id) => base44.entities.Personnel.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel"] });
      navigate("/Personnel", { replace: true });
    },
  });

  useEffect(() => {
    if (!person || !shouldOpenInEditMode || initializedEdit.current) return;
    setEditing(true);
    initializedEdit.current = true;
  }, [person, shouldOpenInEditMode]);

  const cancelEdit = () => {
    if (isNewProfileFlow && isEmptyDraftPersonnel(person)) {
      deleteEmptyDraftMutation.mutate(personnelId);
      return;
    }
    setEditing(false);
    if (shouldOpenInEditMode) navigate(`/PersonnelDetail?id=${personnelId}`, { replace: true });
  };

  const createRecord = async (config, payload) => {
    const payloadWithAudit = config.entityName === "PersonnelDocument"
      ? { ...payload, metadata: buildAuditMetadata(currentUser, "toegevoegd", payload.metadata || {}, allPersonnel) }
      : payload;
    await base44.entities[config.entityName].create(payloadWithAudit);
    config.queryKeys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
  };

  if (!person && allPersonnel.length > 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <p>Medewerker niet gevonden.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/Personnel")}><ArrowLeft className="w-4 h-4 mr-1" /> Terug naar personeel</Button>
      </div>
    );
  }
  if (!person) return <div className="py-16 text-center text-muted-foreground text-sm">Laden...</div>;

  const byPersonnel = (arr) => arr.filter(item => item.personnel_id === personnelId);
  const dossier = {
    documents: byPersonnel(documents),
    qualifications: byPersonnel(qualifications),
    bankAccounts: byPersonnel(bankAccounts),
    emergencyContacts: byPersonnel(emergencyContacts),
    securityPasses: byPersonnel(securityPasses),
    restrictions: byPersonnel(restrictions),
    materials: byPersonnel(materials),
    notes: byPersonnel(notes),
    reviews: byPersonnel(reviews),
    absences: byPersonnel(absences),
    routeExecutions,
  };

  const recordConfig = getRecordConfig(recordDialogType, person);

  return (
    <PageTransition>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => navigate("/Personnel")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Personeel
        </Button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium text-foreground">{buildDisplayName(person) || "Nieuw profiel"}</span>
      </div>

      <PersonnelProfileCard
        person={person}
        editing={editing}
        onEdit={() => setEditing(true)}
        onCancel={cancelEdit}
        onSaved={() => {
          setEditing(false);
          if (isNewProfileFlow) navigate(`/PersonnelDetail?id=${personnelId}`, { replace: true });
        }}
      />

      <PersonnelSidebarTabs
        person={person}
        companies={companies}
        dossier={dossier}
        auditActors={allPersonnel}
        onAddRecord={type => setRecordDialogType(type)}
      />

      <RecordDialog
        config={recordConfig}
        open={!!recordDialogType}
        onOpenChange={open => !open && setRecordDialogType(null)}
        onSave={createRecord}
      />
    </PageTransition>
  );
}
