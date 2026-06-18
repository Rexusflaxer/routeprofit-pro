import React, { useEffect, useRef, useState } from "react";
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
  ArrowLeft,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ClipboardCheck,
  CreditCard,
  FileBadge,
  FileText,
  Handshake,
  MessageSquareText,
  Package,
  Pencil,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { uploadManagedFile } from "@/lib/managedFiles";
import PersonnelAccessTab from "@/components/personnel/PersonnelAccessTab";
import PersonnelContractsTab from "@/components/personnel/PersonnelContractsTab";
import CostCalculator from "@/components/personnel/CostCalculator";
import PhotoCropUpload from "@/components/personnel/PhotoCropUpload";

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
const FUNCTION_LABELS = {
  unknown: "Onbekend", objectbeveiliger: "Objectbeveiliger", receptie: "Receptie", surveillant: "Surveillant",
  alarmopvolging: "Alarmopvolging", binnendienst: "Binnendienst", klantrelatie: "Klantrelatie",
  planner: "Planner", centralist: "Centralist", verkeersregelaar: "Verkeersregelaar",
  brandwacht: "Brandwacht", installateur: "Installateur", rechercheur: "Rechercheur", host: "Host", other: "Overig",
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
  { key: "bank-mobility", label: "Bank & mobiliteit", icon: CreditCard },
  { key: "contracts", label: "Contracten/kosten", icon: BriefcaseBusiness },
  { key: "compliance", label: "Compliance", icon: ShieldCheck },
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

function AddressAutocomplete({ data, onAddressSelect }) {
  const currentAddress = [
    data.street_name && `${data.street_name} ${data.house_number || ""}${data.house_number_addition || ""}`.trim(),
    [data.postal_code, data.city].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");

  const [query, setQuery] = useState(currentAddress);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = React.useRef(null);

  const search = async (q) => {
    if (q.length < 3) { setSuggestions([]); return; }
    const token = {};
    abortRef.current = token;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("searchAddress", { query: q });
      if (abortRef.current !== token) return;
      const raw = res.data?.suggestions || res.data?.results || [];
      setSuggestions(raw.slice(0, 8));
      setOpen(true);
    } catch { setSuggestions([]); }
    finally { setLoading(false); }
  };

  const handleSelect = (s) => {
    // Parse suggestion into address parts
    const label = s.label || s.address || "";
    // Try to extract postcode + city from label
    const postcodeMatch = label.match(/\b(\d{4}\s?[A-Z]{2})\b/);
    const parts = label.split(",").map(p => p.trim());
    onAddressSelect({
      street_name: s.street || s.streetName || parts[0]?.replace(/\s+\d+.*$/, "").trim() || "",
      house_number: s.houseNumber || (parts[0]?.match(/\d+[a-zA-Z]?/))?.[0] || "",
      house_number_addition: s.houseNumberAddition || "",
      postal_code: postcodeMatch?.[1] || s.postalCode || s.postcode || "",
      city: s.city || s.municipality || parts[1] || "",
      country: s.country || "Nederland",
    });
    setQuery(label);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Zoek adres, bijv. Dorpsstraat 12 Amsterdam..."
        />
        {loading && <div className="absolute right-3 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />}
        {open && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-popover shadow-lg max-h-56 overflow-auto">
            {suggestions.map((s, i) => (
              <button key={i} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                onMouseDown={() => handleSelect(s)}>
                {s.label || s.address || JSON.stringify(s)}
              </button>
            ))}
          </div>
        )}
      </div>
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
      return base44.entities.Personnel.update(person.id, {
        ...form, name: displayName,
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
  const address = [
    data.street_name && `${data.street_name} ${data.house_number || ""}${data.house_number_addition || ""}`.trim(),
    [data.postal_code, data.city].filter(Boolean).join(" "),
    data.country && data.country !== "Nederland" ? data.country : null,
  ].filter(Boolean).join(", ");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Banner */}
      <div className="flex flex-col gap-5 border-b border-border bg-muted/40 px-6 py-5 sm:flex-row sm:items-center">
        <div className="group relative flex h-20 w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
          {data.photo_file_url
            ? <img src={data.photo_file_url} alt="" className="h-full w-full object-cover" />
            : <span className="text-xl font-semibold text-muted-foreground">{getDisplayName(data).slice(0, 1).toUpperCase()}</span>
          }
          {editing && (
            <PhotoCropUpload
              onUploaded={handlePhotoUploaded}
              uploading={uploadingPhoto}
              setUploading={setUploadingPhoto}
            />
          )}
        </div>
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
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">{buildFullName(data) || "Naam onbekend"}</h2>
                <BadgePill className={STATUS_COLORS[getStatus(data)] || STATUS_COLORS.draft}>{STATUS_LABELS[getStatus(data)] || getStatus(data)}</BadgePill>
                <BadgePill className={relationship === "self_employed" ? "bg-fuchsia-100 text-fuchsia-700" : "bg-blue-100 text-blue-700"}>{RELATIONSHIP_LABELS[relationship]}</BadgePill>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{data.email || data.phone || address || "Geen NAW-gegevens ingevuld"}</p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={onCancel} disabled={saveMutation.isPending || uploadingPhoto}><X className="mr-1 h-4 w-4" /> Annuleren</Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploadingPhoto}><Check className="mr-1 h-4 w-4" /> {saveMutation.isPending ? "Opslaan..." : "Opslaan"}</Button>
            </>
          ) : (
            <Button variant="outline" onClick={onEdit}><Pencil className="mr-1 h-4 w-4" /> Wijzigen</Button>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 gap-x-12 gap-y-6 p-6 lg:grid-cols-2">
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
          <ProfileInfoRow label="Adres" editing={editing} value={[
              data.street_name && `${data.street_name} ${data.house_number || ""}${data.house_number_addition || ""}`.trim(),
              [data.postal_code, data.city].filter(Boolean).join(" "),
              data.country && data.country !== "Nederland" ? data.country : null,
            ].filter(Boolean).join(", ")}>
            <AddressAutocomplete
              data={data}
              onAddressSelect={addr => { Object.entries(addr).forEach(([k, v]) => set(k, v)); }}
            />
          </ProfileInfoRow>
        </div>
      </div>

      {editing && (
        <div className="flex justify-end gap-2 border-t border-border bg-muted/20 px-6 py-3">
          <Button variant="outline" onClick={onCancel} disabled={saveMutation.isPending || uploadingPhoto}><X className="mr-1 h-4 w-4" /> Annuleren</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploadingPhoto}><Check className="mr-1 h-4 w-4" /> {saveMutation.isPending ? "Wijzigingen opslaan..." : "Wijzigingen opslaan"}</Button>
        </div>
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

function PayrollTab({ person, documents }) {
  const relationship = getRelationshipType(person);
  const payrollDocs = documents.filter(d => d.category === "payroll_tax_statement");
  if (relationship === "self_employed") return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <SectionPanel title="ZZP-bedrijfsgegevens" icon={BriefcaseBusiness}>
        <FieldRow label="Bedrijfsnaam">{person.self_employed_company_name}</FieldRow>
        <FieldRow label="KvK-nummer">{person.self_employed_kvk_number}</FieldRow>
        <FieldRow label="Btw-nummer">{person.self_employed_vat_number}</FieldRow>
        <FieldRow label="Aansprakelijkheid">{person.self_employed_liability_insurance}</FieldRow>
        <FieldRow label="Standaard uurtarief">{formatCurrency(person.zzp_hourly_rate_excl_vat)}</FieldRow>
      </SectionPanel>
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <SectionPanel title="Loonheffing" icon={Banknote}>
        <FieldRow label="Loonheffingskorting">{person.payroll_tax_credit_applies === true ? "Ja" : person.payroll_tax_credit_applies === false ? "Nee" : "Onbekend"}</FieldRow>
        <FieldRow label="Verklaring getekend op">{formatDate(person.payroll_tax_statement_signed_at)}</FieldRow>
        <FieldRow label="Verklaring bestand">{person.payroll_tax_statement_download_filename || (person.payroll_tax_statement_file_url ? "Aanwezig" : "-")}</FieldRow>
      </SectionPanel>
      <SectionPanel title="Loonheffingsdocumenten" icon={FileText}>
        <MiniTable emptyText="Nog geen loonheffingsdocumenten." rows={payrollDocs} columns={[
          { key: "document_type", label: "Type" }, { key: "document_number", label: "Nummer" },
          { key: "valid_from", label: "Datum", render: r => formatDate(r.valid_from) },
          { key: "verification_status", label: "Status", render: r => VERIFICATION_LABELS[r.verification_status] || r.verification_status },
        ]} />
      </SectionPanel>
    </div>
  );
}

// ─── Sidebar tabs panel ───────────────────────────────────────────────────────

function PersonnelSidebarTabs({ person, companies, dossier, onAddRecord }) {
  const [active, setActive] = useState("identity");
  const generalDocuments = dossier.documents.filter(d => !["identity_document","drivers_license","vog","cv","bank_account_proof","payroll_tax_statement"].includes(d.category));
  const identityDocs = dossier.documents.filter(d => d.category === "identity_document");
  const licenseDocs = dossier.documents.filter(d => d.category === "drivers_license");
  const cvDocs = dossier.documents.filter(d => d.category === "cv");
  const routeExecutions = dossier.routeExecutions?.filter(r => r.employee_id === person.id).slice(0, 8) || [];

  const renderTab = () => {
    switch (active) {
      case "overview": return <OverviewTab person={person} companies={companies} dossier={dossier} />;
      case "payroll": return <PayrollTab person={person} documents={dossier.documents} />;
      case "identity": return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionPanel title="Identiteit" icon={Users}>
            <FieldRow label="Geboortedatum">{formatDate(person.date_of_birth)}</FieldRow>
            <FieldRow label="Geboorteplaats">{person.place_of_birth}</FieldRow>
            <FieldRow label="Geboorteland">{person.country_of_birth}</FieldRow>
            <FieldRow label="Nationaliteit">{person.nationality}</FieldRow>
          </SectionPanel>
          <SectionPanel title="Legitimatiebewijzen" icon={FileBadge}>
            <MiniTable emptyText="Nog geen legitimatiebewijs." rows={identityDocs} columns={[
              { key: "document_type", label: "Type" }, { key: "document_number", label: "Nummer" },
              { key: "valid_until", label: "Geldig tot", render: r => formatDate(r.valid_until) },
              { key: "verification_status", label: "Status", render: r => VERIFICATION_LABELS[r.verification_status] || r.verification_status },
            ]} />
          </SectionPanel>
        </div>
      );
      case "documents": return (
        <SectionPanel title="Documenten" icon={FileText} action={<Button size="sm" variant="outline" onClick={() => onAddRecord("document")}><Plus className="mr-1 h-4 w-4" />Toevoegen</Button>}>
          <MiniTable emptyText="Nog geen documenten." rows={generalDocuments} columns={[
            { key: "category", label: "Categorie", render: r => DOCUMENT_CATEGORIES.find(c => c.value === r.category)?.label || r.category },
            { key: "document_type", label: "Type" }, { key: "document_number", label: "Nummer" },
            { key: "valid_until", label: "Geldig tot", render: r => formatDate(r.valid_until) },
            { key: "verification_status", label: "Status", render: r => <BadgePill className={r.verification_status === "verified" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>{VERIFICATION_LABELS[r.verification_status] || r.verification_status}</BadgePill> },
          ]} />
        </SectionPanel>
      );
      case "compliance": return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionPanel title="WPBR en beveiligingspassen" icon={ShieldCheck} action={<Button size="sm" variant="outline" onClick={() => onAddRecord("securityPass")}><Plus className="mr-1 h-4 w-4" />Pas</Button>}>
            <FieldRow label="WPBR vereist">{person.wpbr_required ? "Ja" : "Nee"}</FieldRow>
            <FieldRow label="WPBR status">{person.wpbr_status || "-"}</FieldRow>
            <FieldRow label="Toestemmingsnummer">{person.wpbr_permission_number || "-"}</FieldRow>
            <div className="mt-4"><MiniTable emptyText="Nog geen beveiligingspassen." rows={dossier.securityPasses} columns={[
              { key: "pass_type", label: "Pas" }, { key: "pass_number", label: "Nummer" },
              { key: "status", label: "Status" }, { key: "valid_until", label: "Geldig tot", render: r => formatDate(r.valid_until) },
            ]} /></div>
          </SectionPanel>
          <SectionPanel title="Diploma's en VOG" icon={FileBadge} action={<Button size="sm" variant="outline" onClick={() => onAddRecord("qualification")}><Plus className="mr-1 h-4 w-4" />Diploma</Button>}>
            <MiniTable emptyText="Nog geen diploma's." rows={dossier.qualifications} columns={[
              { key: "name", label: "Opleiding" }, { key: "issuer", label: "Uitgever" },
              { key: "valid_until", label: "Geldig tot", render: r => formatDate(r.valid_until) },
              { key: "verification_status", label: "Status", render: r => VERIFICATION_LABELS[r.verification_status] || r.verification_status },
            ]} />
          </SectionPanel>
        </div>
      );
      case "bank-mobility": return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionPanel title="Bankrekeningen" icon={Banknote}>
            <MiniTable emptyText="Nog geen bankrekening." rows={dossier.bankAccounts} columns={[
              { key: "iban", label: "IBAN", render: r => r.iban_masked || r.iban },
              { key: "account_holder_name", label: "Rekeninghouder" }, { key: "bank_name", label: "Bank" },
              { key: "valid_from", label: "Startdatum", render: r => formatDate(r.valid_from) },
              { key: "verification_status", label: "Status", render: r => VERIFICATION_LABELS[r.verification_status] || r.verification_status },
            ]} />
          </SectionPanel>
          <SectionPanel title="Rijbewijzen" icon={FileBadge}>
            <MiniTable emptyText="Nog geen rijbewijs." rows={licenseDocs} columns={[
              { key: "document_number", label: "Nummer" }, { key: "document_type", label: "Type" },
              { key: "valid_until", label: "Geldig tot", render: r => formatDate(r.valid_until) },
              { key: "verification_status", label: "Status", render: r => VERIFICATION_LABELS[r.verification_status] || r.verification_status },
            ]} />
          </SectionPanel>
        </div>
      );
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
            ]} />
          </SectionPanel>
        </div>
      );
      case "contracts": return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
          <PersonnelContractsTab personnel={person} companies={companies} />
          <SectionPanel title="Kostenberekening" icon={BriefcaseBusiness}><CostCalculator personnel={person} /></SectionPanel>
        </div>
      );
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
    <div className="mt-4 flex min-h-[200px] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="w-48 shrink-0 border-r border-border bg-muted/30 py-3">
        {PERSONNEL_TABS.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActive(item.key)}
            className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium transition-colors ${
              active === item.key
                ? "border-r-2 border-primary bg-background text-foreground"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 p-4">{renderTab()}</div>
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
    await base44.entities[config.entityName].create(payload);
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
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/Personnel")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Personeel
        </Button>
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