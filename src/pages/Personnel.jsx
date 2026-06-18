import React, { useEffect, useMemo, useState } from "react";
import PageTransition from "@/components/ui-custom/PageTransition";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  Building2,
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
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import PageHeader from "../components/ui-custom/PageHeader";
import EmptyState from "../components/ui-custom/EmptyState";
import CostCalculator from "../components/personnel/CostCalculator";
import PersonnelAccessTab from "../components/personnel/PersonnelAccessTab";
import PersonnelContractsTab from "../components/personnel/PersonnelContractsTab";
import { uploadManagedFile } from "@/lib/managedFiles";

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  onboarding: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
  inactive: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
  archived: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
};

const STATUS_LABELS = {
  draft: "Concept",
  onboarding: "Onboarding",
  active: "Actief",
  inactive: "Inactief",
  archived: "Gearchiveerd",
};

const HR_COLORS = {
  complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200",
  needs_review: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200",
  incomplete: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
};

const HR_LABELS = {
  complete: "Volledig",
  needs_review: "Beoordeling",
  incomplete: "Onvolledig",
};

const RELATIONSHIP_LABELS = {
  employee: "Loondienst",
  self_employed: "ZZP'er",
};

const TEAMHUB_LINK_LABELS = {
  not_invited: "Lokaal profiel",
  invited: "Uitgenodigd",
  pending_acceptance: "Wacht op acceptatie",
  linked: "Gekoppeld",
  conflict_review: "Review nodig",
  revoked: "Koppeling ingetrokken",
  local_only: "Lokaal profiel",
};

const FUNCTION_LABELS = {
  unknown: "Onbekend",
  objectbeveiliger: "Objectbeveiliger",
  receptie: "Receptie",
  surveillant: "Surveillant",
  alarmopvolging: "Alarmopvolging",
  binnendienst: "Binnendienst",
  klantrelatie: "Klantrelatie",
  planner: "Planner",
  centralist: "Centralist",
  verkeersregelaar: "Verkeersregelaar",
  brandwacht: "Brandwacht",
  installateur: "Installateur",
  rechercheur: "Rechercheur",
  host: "Host",
  other: "Overig",
};

const VERIFICATION_LABELS = {
  uploaded: "Geüpload",
  pending_review: "In beoordeling",
  verified: "Geverifieerd",
  rejected: "Afgekeurd",
  expired: "Verlopen",
};

const SUBCONTRACTOR_STATUS_LABELS = {
  prospect: "Prospect",
  active: "Actief",
  paused: "Gepauzeerd",
  inactive: "Inactief",
  archived: "Gearchiveerd",
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

async function safeList(entityName, sort) {
  const entity = base44.entities[entityName];
  if (!entity?.list) return [];
  try {
    return await (sort ? entity.list(sort) : entity.list());
  } catch {
    return [];
  }
}

function formatDate(value, fallback = "-") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "-";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function getRelationshipType(personnel) {
  return personnel.relationship_type || (personnel.employee_type === "zzp" ? "self_employed" : "employee");
}

function getDisplayName(personnel) {
  return personnel.name || [personnel.call_name || personnel.first_name, personnel.name_prefix, personnel.last_name].filter(Boolean).join(" ") || "Naam onbekend";
}

function buildPersonnelDisplayName(personnel) {
  const first = personnel.call_name || personnel.first_name || personnel.legal_first_names || "";
  return [first, personnel.name_prefix, personnel.last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || personnel.name || "";
}

function isEmptyDraftPersonnel(personnel = {}) {
  if ((personnel.status || "draft") !== "draft") return false;
  const textFields = [
    "name",
    "initials",
    "legal_first_names",
    "first_name",
    "call_name",
    "name_prefix",
    "last_name",
    "email",
    "phone",
    "street_name",
    "house_number",
    "house_number_addition",
    "postal_code",
    "city",
    "date_of_birth",
    "place_of_birth",
    "country_of_birth",
    "nationality",
    "photo_file_url",
  ];
  return !textFields.some(field => String(personnel[field] || "").trim());
}

function getStatus(personnel) {
  return personnel.status || (personnel.is_active === false ? "inactive" : "active");
}

function getExpiryState(value) {
  if (!value) return null;
  const diffDays = (new Date(value) - new Date()) / 86400000;
  if (diffDays < 0) return { label: "Verlopen", className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200" };
  if (diffDays <= 30) return { label: "<30 dagen", className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200" };
  if (diffDays <= 90) return { label: "<90 dagen", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200" };
  return null;
}

function groupByPersonnel(items = []) {
  return items.reduce((acc, item) => {
    if (!item.personnel_id) return acc;
    acc[item.personnel_id] = acc[item.personnel_id] || [];
    acc[item.personnel_id].push(item);
    return acc;
  }, {});
}

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
            {columns.map(column => <TableHead key={column.key} className="text-xs">{column.label}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.id || index}>
              {columns.map(column => <TableCell key={column.key} className="text-sm">{column.render ? column.render(row) : row[column.key] || "-"}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
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

function PersonnelProfileCard({ person, editing, onEdit, onCancel, onSaved }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(person);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    setForm(person);
  }, [person]);

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const updateNamePart = (field, value) => {
    setForm(current => {
      const next = { ...current, [field]: value };
      return { ...next, name: buildPersonnelDisplayName(next) };
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const displayName = buildPersonnelDisplayName(form);
      return base44.entities.Personnel.update(person.id, {
        ...form,
        name: displayName,
        is_active: !["inactive", "archived"].includes(form.status || "active"),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel"] });
      onSaved?.();
    },
  });

  const uploadPhoto = async (file) => {
    setUploadingPhoto(true);
    try {
      const result = await uploadManagedFile({
        file,
        ownerType: "personnel",
        ownerId: person.id,
        companyId: form.primary_company_id || null,
        ownerLabel: buildPersonnelDisplayName(form) || "Medewerker",
        domain: "identity",
        category: "personnel_photo",
        sourceEntity: "Personnel",
        sourceEntityId: person.id,
        sourceField: "photo_file_url",
        documentLabel: "Pasfoto",
        isSensitive: true,
        folderSegments: ["identity", "photo"]
      });
      setForm(current => ({
        ...current,
        photo_file_url: result.file_url,
        photo_file_id: result.managed_file_id,
        photo_download_filename: result.download_filename,
        photo_logical_path: result.logical_path,
      }));
    } finally {
      setUploadingPhoto(false);
    }
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
      <div className="flex flex-col gap-5 border-b border-border bg-muted/40 px-6 py-5 sm:flex-row sm:items-center">
        <div className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
          {data.photo_file_url ? (
            <img src={data.photo_file_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-muted-foreground">{getDisplayName(data).slice(0, 1).toUpperCase()}</span>
          )}
          {editing && (
            <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/40 text-white">
              <input type="file" accept="image/*" className="hidden" onChange={event => event.target.files?.[0] && uploadPhoto(event.target.files[0])} />
              <Upload className="h-5 w-5" />
              <span className="sr-only">Pasfoto uploaden</span>
            </label>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="grid max-w-4xl grid-cols-1 gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Initialen</span>
                <Input value={data.initials || ""} onChange={event => set("initials", event.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Voornamen</span>
                <Input value={data.legal_first_names || ""} onChange={event => updateNamePart("legal_first_names", event.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Roepnaam</span>
                <Input value={data.first_name || data.call_name || ""} onChange={event => {
                  updateNamePart("first_name", event.target.value);
                  set("call_name", event.target.value);
                }} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Tussenvoegsel</span>
                <Input value={data.name_prefix || ""} onChange={event => updateNamePart("name_prefix", event.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <span className="text-xs text-muted-foreground">Achternaam</span>
                <Input value={data.last_name || ""} onChange={event => updateNamePart("last_name", event.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Relatie</span>
                <Select value={data.employee_type || "loondienst"} onValueChange={value => {
                  set("employee_type", value);
                  set("relationship_type", value === "zzp" ? "self_employed" : "employee");
                  set("profile_data_policy", "profile_wins_after_acceptance");
                }}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loondienst">Loondienst</SelectItem>
                    <SelectItem value="zzp">ZZP'er</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">{getDisplayName(data)}</h2>
                <BadgePill className={STATUS_COLORS[getStatus(data)] || STATUS_COLORS.draft}>
                  {STATUS_LABELS[getStatus(data)] || getStatus(data)}
                </BadgePill>
                <BadgePill className={relationship === "self_employed" ? "bg-fuchsia-100 text-fuchsia-700" : "bg-blue-100 text-blue-700"}>
                  {RELATIONSHIP_LABELS[relationship]}
                </BadgePill>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{data.email || data.phone || address || "Geen NAW-gegevens ingevuld"}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={onCancel} disabled={saveMutation.isPending || uploadingPhoto}>
                <X className="mr-1 h-4 w-4" /> Annuleren
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploadingPhoto}>
                <Check className="mr-1 h-4 w-4" /> {saveMutation.isPending ? "Opslaan..." : "Opslaan"}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 h-4 w-4" /> Wijzigen
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-12 gap-y-6 p-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Persoonlijke gegevens</h3>
          <ProfileInfoRow label="Geslacht" editing={editing} value={data.gender === "male" ? "Man" : data.gender === "female" ? "Vrouw" : data.gender === "other" ? "Anders" : "Onbekend"}>
            <Select value={data.gender || "unknown"} onValueChange={value => set("gender", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Man</SelectItem>
                <SelectItem value="female">Vrouw</SelectItem>
                <SelectItem value="other">Anders</SelectItem>
                <SelectItem value="unknown">Onbekend</SelectItem>
              </SelectContent>
            </Select>
          </ProfileInfoRow>
          <ProfileInfoRow label="Geboortedatum" editing={editing} value={formatDate(data.date_of_birth)}>
            <Input type="date" value={data.date_of_birth || ""} onChange={event => set("date_of_birth", event.target.value)} />
          </ProfileInfoRow>
          <ProfileInfoRow label="Geboorteplaats" editing={editing} value={data.place_of_birth}>
            <Input value={data.place_of_birth || ""} onChange={event => set("place_of_birth", event.target.value)} />
          </ProfileInfoRow>
          <ProfileInfoRow label="Geboorteland" editing={editing} value={data.country_of_birth}>
            <Input value={data.country_of_birth || ""} onChange={event => set("country_of_birth", event.target.value)} />
          </ProfileInfoRow>
          <ProfileInfoRow label="Nationaliteit" editing={editing} value={data.nationality}>
            <Input value={data.nationality || ""} onChange={event => set("nationality", event.target.value)} />
          </ProfileInfoRow>
        </div>

        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact & adres</h3>
          <ProfileInfoRow label="E-mail" editing={editing} value={data.email}>
            <Input type="email" value={data.email || ""} onChange={event => set("email", event.target.value)} />
          </ProfileInfoRow>
          <ProfileInfoRow label="Telefoon" editing={editing} value={data.phone}>
            <Input value={data.phone || ""} onChange={event => set("phone", event.target.value)} />
          </ProfileInfoRow>
          <ProfileInfoRow label="Straatnaam" editing={editing} value={data.street_name}>
            <Input value={data.street_name || ""} onChange={event => set("street_name", event.target.value)} />
          </ProfileInfoRow>
          <ProfileInfoRow label="Huisnummer" editing={editing} value={[data.house_number, data.house_number_addition].filter(Boolean).join(" ")}>
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <Input value={data.house_number || ""} onChange={event => set("house_number", event.target.value)} placeholder="Nr." />
              <Input value={data.house_number_addition || ""} onChange={event => set("house_number_addition", event.target.value)} placeholder="Toev." />
            </div>
          </ProfileInfoRow>
          <ProfileInfoRow label="Postcode" editing={editing} value={data.postal_code}>
            <Input value={data.postal_code || ""} onChange={event => set("postal_code", event.target.value)} />
          </ProfileInfoRow>
          <ProfileInfoRow label="Plaats" editing={editing} value={data.city}>
            <Input value={data.city || ""} onChange={event => set("city", event.target.value)} />
          </ProfileInfoRow>
          <ProfileInfoRow label="Land" editing={editing} value={data.country || "Nederland"}>
            <Input value={data.country || "Nederland"} onChange={event => set("country", event.target.value)} />
          </ProfileInfoRow>
        </div>
      </div>

      {editing && (
        <div className="flex justify-end gap-2 border-t border-border bg-muted/20 px-6 py-3">
          <Button variant="outline" onClick={onCancel} disabled={saveMutation.isPending || uploadingPhoto}>
            <X className="mr-1 h-4 w-4" /> Annuleren
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploadingPhoto}>
            <Check className="mr-1 h-4 w-4" /> {saveMutation.isPending ? "Wijzigingen opslaan..." : "Wijzigingen opslaan"}
          </Button>
        </div>
      )}
    </div>
  );
}

function getRecordConfig(type, personnel) {
  const id = personnel?.id;
  const today = new Date().toISOString().slice(0, 10);
  const configs = {
    document: {
      title: "Document toevoegen",
      entityName: "PersonnelDocument",
      queryKeys: ["personnel-documents"],
      initialValues: { category: "other", verification_status: "uploaded", is_sensitive: true },
      fields: [
        { name: "category", label: "Categorie", type: "select", options: DOCUMENT_CATEGORIES },
        { name: "document_type", label: "Type / omschrijving" },
        { name: "document_number", label: "Documentnummer" },
        { name: "valid_from", label: "Geldig van", type: "date" },
        { name: "valid_until", label: "Geldig tot", type: "date" },
        { name: "verification_status", label: "Status", type: "select", options: Object.entries(VERIFICATION_LABELS).map(([value, label]) => ({ value, label })) },
        { name: "notes", label: "Notities", type: "textarea" },
      ],
      buildPayload: values => ({ ...values, personnel_id: id }),
    },
    qualification: {
      title: "Diploma of certificaat toevoegen",
      entityName: "PersonnelQualification",
      queryKeys: ["personnel-qualifications"],
      initialValues: { qualification_type: "beveiliger_2", verification_status: "pending_review" },
      fields: [
        { name: "qualification_type", label: "Type", type: "select", options: QUALIFICATION_TYPES },
        { name: "name", label: "Naam" },
        { name: "issuer", label: "Uitgever" },
        { name: "certificate_number", label: "Certificaatnummer" },
        { name: "valid_from", label: "Geldig van", type: "date" },
        { name: "valid_until", label: "Geldig tot", type: "date" },
        { name: "verification_status", label: "Status", type: "select", options: Object.entries(VERIFICATION_LABELS).filter(([value]) => value !== "uploaded").map(([value, label]) => ({ value, label })) },
      ],
      buildPayload: values => ({ ...values, personnel_id: id }),
    },
    securityPass: {
      title: "Beveiligingspas toevoegen",
      entityName: "PersonnelSecurityPass",
      queryKeys: ["personnel-security-passes"],
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
      buildPayload: values => ({ ...values, personnel_id: id, company_id: personnel.primary_company_id || null }),
    },
    restriction: {
      title: "Planningrestrictie toevoegen",
      entityName: "PersonnelRestriction",
      queryKeys: ["personnel-restrictions"],
      initialValues: { scope_type: "object", may_work: false, status: "active" },
      fields: [
        { name: "scope_type", label: "Scope", type: "select", options: [{ value: "customer", label: "Klant" }, { value: "object", label: "Object" }, { value: "route", label: "Route" }, { value: "function_group", label: "Functiegroep" }, { value: "other", label: "Overig" }] },
        { name: "scope_label", label: "Klant/object/route" },
        { name: "may_work", label: "Mag werken", type: "boolean" },
        { name: "reason", label: "Reden", type: "textarea" },
        { name: "valid_from", label: "Geldig van", type: "date" },
        { name: "valid_until", label: "Geldig tot", type: "date" },
      ],
      buildPayload: values => ({ ...values, personnel_id: id }),
    },
    material: {
      title: "Materiaal toevoegen",
      entityName: "PersonnelMaterial",
      queryKeys: ["personnel-materials"],
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
      buildPayload: values => ({ ...values, quantity: Number(values.quantity || 1), personnel_id: id }),
    },
    note: {
      title: "Notitie toevoegen",
      entityName: "PersonnelNote",
      queryKeys: ["personnel-notes"],
      initialValues: { note_type: "general", is_private: true },
      fields: [
        { name: "note_type", label: "Type", type: "select", options: [{ value: "general", label: "Algemeen" }, { value: "planning", label: "Planning" }, { value: "compliance", label: "Compliance" }, { value: "hr", label: "HR" }, { value: "teamhub", label: "Teamhub" }, { value: "other", label: "Overig" }] },
        { name: "title", label: "Titel" },
        { name: "body", label: "Notitie", type: "textarea" },
        { name: "is_private", label: "Privé HR-notitie", type: "boolean" },
      ],
      buildPayload: values => ({ ...values, personnel_id: id, created_at: new Date().toISOString() }),
    },
    review: {
      title: "Gesprek toevoegen",
      entityName: "PersonnelPerformanceReview",
      queryKeys: ["personnel-reviews"],
      initialValues: { review_type: "performance_review", status: "planned", review_date: today },
      fields: [
        { name: "review_type", label: "Type", type: "select", options: [{ value: "performance_review", label: "Functioneringsgesprek" }, { value: "evaluation", label: "Evaluatie" }, { value: "incident_followup", label: "Incidentopvolging" }, { value: "coaching", label: "Coaching" }, { value: "other", label: "Overig" }] },
        { name: "review_date", label: "Datum", type: "date" },
        { name: "status", label: "Status", type: "select", options: [{ value: "planned", label: "Gepland" }, { value: "completed", label: "Afgerond" }, { value: "cancelled", label: "Geannuleerd" }] },
        { name: "subject", label: "Onderwerp" },
        { name: "summary", label: "Samenvatting", type: "textarea" },
      ],
      buildPayload: values => ({ ...values, personnel_id: id }),
    },
    absence: {
      title: "Verlof/ziekte registreren",
      entityName: "PersonnelAbsence",
      queryKeys: ["personnel-absences"],
      initialValues: { absence_type: "leave", status: "requested", start_date: today },
      fields: [
        { name: "absence_type", label: "Type", type: "select", options: [{ value: "leave", label: "Verlof" }, { value: "sick", label: "Ziekmelding" }, { value: "special_leave", label: "Buitengewoon verlof" }, { value: "unavailable", label: "Niet beschikbaar" }, { value: "other", label: "Overig" }] },
        { name: "start_date", label: "Startdatum", type: "date" },
        { name: "end_date", label: "Einddatum", type: "date" },
        { name: "days", label: "Dagen", type: "number" },
        { name: "status", label: "Status", type: "select", options: [{ value: "requested", label: "Aangevraagd" }, { value: "approved", label: "Goedgekeurd" }, { value: "rejected", label: "Afgewezen" }, { value: "active", label: "Actief" }, { value: "closed", label: "Gesloten" }] },
        { name: "notes", label: "Notities zonder medische details", type: "textarea" },
      ],
      buildPayload: values => ({ ...values, days: values.days ? Number(values.days) : null, personnel_id: id }),
    },
    emergencyContact: {
      title: "ICE-contact toevoegen",
      entityName: "PersonnelEmergencyContact",
      queryKeys: ["personnel-emergency-contacts"],
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
      buildPayload: values => ({ ...values, priority: Number(values.priority || 1), personnel_id: id }),
    },
  };
  return configs[type];
}

function RecordDialog({ config, open, onOpenChange, onSave }) {
  const [form, setForm] = useState(config?.initialValues || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && config) setForm(config.initialValues || {});
  }, [config, open]);

  if (!config) return null;

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const renderField = (field) => {
    if (field.type === "textarea") {
      return <Textarea value={form[field.name] || ""} onChange={event => set(field.name, event.target.value)} rows={4} />;
    }
    if (field.type === "select") {
      return (
        <Select value={String(form[field.name] ?? field.options?.[0]?.value ?? "")} onValueChange={value => set(field.name, value)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {field.options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (field.type === "boolean") {
      return (
        <Select value={form[field.name] === false ? "false" : "true"} onValueChange={value => set(field.name, value === "true")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Ja</SelectItem>
            <SelectItem value="false">Nee</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={field.type || "text"}
        value={form[field.name] ?? ""}
        onChange={event => set(field.name, event.target.value)}
        placeholder={field.placeholder || ""}
      />
    );
  };

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(config, config.buildPayload(form));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {config.fields.map(field => (
            <div key={field.name} className={field.type === "textarea" ? "space-y-1 sm:col-span-2" : "space-y-1"}>
              <Label>{field.label}</Label>
              {renderField(field)}
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

function SubcontractorDialog({ open, onOpenChange, subcontractor, onSave }) {
  const empty = {
    display_name: "",
    legal_name: "",
    status: "active",
    country: "Nederland",
    teamhub_link_status: "local_only",
  };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(subcontractor || empty);
  }, [open, subcontractor]);

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const submit = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{subcontractor ? "Onderaannemer bewerken" : "Onderaannemer toevoegen"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1 md:col-span-2">
            <Label>Bedrijfsnaam</Label>
            <Input value={form.display_name || ""} onChange={event => set("display_name", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={form.status || "active"} onValueChange={value => set("status", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SUBCONTRACTOR_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Juridische naam</Label>
            <Input value={form.legal_name || ""} onChange={event => set("legal_name", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>KvK</Label>
            <Input value={form.kvk_number || ""} onChange={event => set("kvk_number", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Btw-nummer</Label>
            <Input value={form.vat_number || ""} onChange={event => set("vat_number", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>ND-/WPBR-nummer</Label>
            <Input value={form.nd_number || ""} onChange={event => set("nd_number", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Vergunningsnummer</Label>
            <Input value={form.permit_number || ""} onChange={event => set("permit_number", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Vergunning geldig tot</Label>
            <Input type="date" value={form.permit_valid_until || ""} onChange={event => set("permit_valid_until", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Contactpersoon</Label>
            <Input value={form.contact_name || ""} onChange={event => set("contact_name", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>E-mail</Label>
            <Input type="email" value={form.contact_email || ""} onChange={event => set("contact_email", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Telefoon</Label>
            <Input value={form.contact_phone || ""} onChange={event => set("contact_phone", event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Standaard inhuurtarief</Label>
            <Input type="number" step="0.01" value={form.default_hourly_rate || ""} onChange={event => set("default_hourly_rate", event.target.value ? Number(event.target.value) : null)} />
          </div>
          <div className="space-y-1 md:col-span-3">
            <Label>Contract-/tariefnotities</Label>
            <Textarea value={form.contract_notes || ""} onChange={event => set("contract_notes", event.target.value)} rows={3} />
          </div>
          <div className="space-y-1 md:col-span-3">
            <Label>Interne notities</Label>
            <Textarea value={form.notes || ""} onChange={event => set("notes", event.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={saving || !form.display_name}>{saving ? "Opslaan..." : "Opslaan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PersonnelOverviewTab({ person, companies, documents, qualifications, bankAccounts, emergencyContacts, securityPasses }) {
  const company = companies.find(item => item.id === person.primary_company_id);
  const expiring = [
    ...documents.map(item => ({ label: DOCUMENT_CATEGORIES.find(category => category.value === item.category)?.label || item.category, date: item.valid_until })),
    ...qualifications.map(item => ({ label: item.name, date: item.valid_until })),
    ...securityPasses.map(item => ({ label: item.pass_number || "Beveiligingspas", date: item.valid_until })),
  ].filter(item => getExpiryState(item.date));
  const checklist = [
    { label: "Displaynaam", done: !!getDisplayName(person) },
    { label: "E-mail", done: !!person.email },
    { label: "Geboortedatum", done: !!person.date_of_birth },
    { label: "Adres", done: !!(person.street_name && person.postal_code && person.city) },
    { label: "Primair bedrijf", done: !!person.primary_company_id },
    { label: "Identiteitsdocument", done: documents.some(item => item.category === "identity_document") },
    { label: "Bankrekening", done: bankAccounts.length > 0 || person.employee_type === "zzp" },
    { label: "ICE-contact", done: emergencyContacts.length > 0 },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <SectionPanel title="Kernstatus" icon={ClipboardCheck}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="rounded-md border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">HR-dossier</p>
            <BadgePill className={HR_COLORS[person.hr_completeness_status || "incomplete"] || HR_COLORS.incomplete}>{HR_LABELS[person.hr_completeness_status || "incomplete"]}</BadgePill>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Relatie</p>
            <p className="text-sm font-medium">{RELATIONSHIP_LABELS[getRelationshipType(person)]}</p>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <p className="text-xs text-muted-foreground">Bedrijf</p>
            <p className="text-sm font-medium">{company?.display_name || "-"}</p>
          </div>
        </div>
      </SectionPanel>

      <SectionPanel title="Checklist" icon={BadgeCheck}>
        <div className="space-y-2">
          {checklist.map(item => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <span>{item.label}</span>
              <BadgePill className={item.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>
                {item.done ? "OK" : "Mist"}
              </BadgePill>
            </div>
          ))}
        </div>
      </SectionPanel>

      <SectionPanel title="Aandacht" icon={AlertTriangle}>
        {expiring.length === 0 ? (
          <SmallEmpty text="Geen verlopen of bijna verlopen items gevonden." />
        ) : (
          <div className="space-y-2">
            {expiring.slice(0, 6).map((item, index) => {
              const state = getExpiryState(item.date);
              return (
                <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <span>{item.label}</span>
                  <BadgePill className={state.className}>{state.label}</BadgePill>
                </div>
              );
            })}
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

function PersonnelPayrollTab({ person, documents }) {
  const relationship = getRelationshipType(person);
  const payrollDocs = documents.filter(item => item.category === "payroll_tax_statement");

  if (relationship === "self_employed") {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionPanel title="ZZP-bedrijfsgegevens" icon={BriefcaseBusiness}>
          <FieldRow label="Bedrijfsnaam">{person.self_employed_company_name}</FieldRow>
          <FieldRow label="KvK-nummer">{person.self_employed_kvk_number}</FieldRow>
          <FieldRow label="Btw-nummer">{person.self_employed_vat_number}</FieldRow>
          <FieldRow label="Aansprakelijkheid">{person.self_employed_liability_insurance}</FieldRow>
          <FieldRow label="Standaard uurtarief">{formatCurrency(person.zzp_hourly_rate_excl_vat)}</FieldRow>
        </SectionPanel>
        <SectionPanel title="Profieleigenaarschap" icon={ClipboardCheck}>
          <FieldRow label="Eigen account">Heeft voorrang na bevestigde koppeling</FieldRow>
          <FieldRow label="Lokale dossierdata">Blijft behouden voor review en historie</FieldRow>
          <FieldRow label="Koppelstatus">{TEAMHUB_LINK_LABELS[person.teamhub_link_status] || "Lokaal profiel"}</FieldRow>
        </SectionPanel>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <SectionPanel title="Loonheffing" icon={Banknote}>
        <FieldRow label="Loonheffingskorting">
          {person.payroll_tax_credit_applies === true ? "Ja" : person.payroll_tax_credit_applies === false ? "Nee" : "Onbekend"}
        </FieldRow>
        <FieldRow label="Verklaring getekend op">{formatDate(person.payroll_tax_statement_signed_at)}</FieldRow>
        <FieldRow label="Verklaring bestand">{person.payroll_tax_statement_download_filename || (person.payroll_tax_statement_file_url ? "Aanwezig" : "-")}</FieldRow>
      </SectionPanel>
      <SectionPanel title="Loonheffingsdocumenten" icon={FileText}>
        <MiniTable
          emptyText="Nog geen loonheffingsdocumenten vastgelegd."
          rows={payrollDocs}
          columns={[
            { key: "document_type", label: "Type" },
            { key: "document_number", label: "Nummer" },
            { key: "valid_from", label: "Datum", render: row => formatDate(row.valid_from) },
            { key: "verification_status", label: "Status", render: row => VERIFICATION_LABELS[row.verification_status] || row.verification_status },
          ]}
        />
      </SectionPanel>
    </div>
  );
}

function PersonnelIdentityTab({ person, documents }) {
  const identityDocs = documents.filter(item => item.category === "identity_document");
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <SectionPanel title="Identiteit" icon={Users}>
        <FieldRow label="Geboortedatum">{formatDate(person.date_of_birth)}</FieldRow>
        <FieldRow label="Geboorteplaats">{person.place_of_birth}</FieldRow>
        <FieldRow label="Geboorteland">{person.country_of_birth}</FieldRow>
        <FieldRow label="Nationaliteit">{person.nationality}</FieldRow>
      </SectionPanel>
      <SectionPanel title="Legitimatiebewijzen" icon={FileBadge}>
        <MiniTable
          emptyText="Nog geen legitimatiebewijs vastgelegd."
          rows={identityDocs}
          columns={[
            { key: "document_type", label: "Type" },
            { key: "document_number", label: "Nummer" },
            { key: "valid_until", label: "Geldig tot", render: row => formatDate(row.valid_until) },
            { key: "verification_status", label: "Status", render: row => VERIFICATION_LABELS[row.verification_status] || row.verification_status },
          ]}
        />
      </SectionPanel>
    </div>
  );
}

function PersonnelBankMobilityTab({ documents, bankAccounts }) {
  const licenseDocs = documents.filter(item => item.category === "drivers_license");
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <SectionPanel title="Bankrekeningen" icon={Banknote}>
        <MiniTable
          emptyText="Nog geen bankrekening geregistreerd."
          rows={bankAccounts}
          columns={[
            { key: "iban", label: "IBAN", render: row => row.iban_masked || row.iban },
            { key: "account_holder_name", label: "Rekeninghouder" },
            { key: "bank_name", label: "Bank" },
            { key: "valid_from", label: "Startdatum", render: row => formatDate(row.valid_from) },
            { key: "verification_status", label: "Status", render: row => VERIFICATION_LABELS[row.verification_status] || row.verification_status },
          ]}
        />
      </SectionPanel>
      <SectionPanel title="Rijbewijzen" icon={FileBadge}>
        <MiniTable
          emptyText="Nog geen rijbewijs geregistreerd."
          rows={licenseDocs}
          columns={[
            { key: "document_number", label: "Nummer" },
            { key: "document_type", label: "Type" },
            { key: "valid_until", label: "Geldig tot", render: row => formatDate(row.valid_until) },
            { key: "verification_status", label: "Status", render: row => VERIFICATION_LABELS[row.verification_status] || row.verification_status },
          ]}
        />
      </SectionPanel>
    </div>
  );
}

function PersonnelIceTab({ documents, emergencyContacts, onAddRecord }) {
  const cvDocs = documents.filter(item => item.category === "cv");
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <SectionPanel
        title="ICE-contactpersonen"
        icon={Users}
        action={<Button size="sm" variant="outline" onClick={() => onAddRecord("emergencyContact")}><Plus className="mr-1 h-4 w-4" />Contact</Button>}
      >
        <MiniTable
          emptyText="Nog geen noodcontacten toegevoegd."
          rows={emergencyContacts}
          columns={[
            { key: "name", label: "Naam" },
            { key: "relationship", label: "Relatie" },
            { key: "phone_1", label: "Telefoon 1" },
            { key: "phone_2", label: "Telefoon 2" },
            { key: "email", label: "E-mail" },
          ]}
        />
      </SectionPanel>
      <SectionPanel
        title="CV"
        icon={FileText}
        action={<Button size="sm" variant="outline" onClick={() => onAddRecord("document")}><Plus className="mr-1 h-4 w-4" />Document</Button>}
      >
        <MiniTable
          emptyText="Nog geen CV toegevoegd."
          rows={cvDocs}
          columns={[
            { key: "document_type", label: "Omschrijving" },
            { key: "valid_from", label: "Datum", render: row => formatDate(row.valid_from) },
            { key: "verification_status", label: "Status", render: row => VERIFICATION_LABELS[row.verification_status] || row.verification_status },
          ]}
        />
      </SectionPanel>
    </div>
  );
}

const PERSONNEL_DETAIL_MENU_ITEMS = [
  { key: "overview", label: "Overzicht", icon: ClipboardCheck },
  { key: "payroll", label: "Loonheffing", icon: Banknote },
  { key: "identity", label: "Identiteit", icon: BadgeCheck },
  { key: "documents", label: "Documenten", icon: FileText },
  { key: "compliance", label: "Compliance", icon: ShieldCheck },
  { key: "bank-mobility", label: "Bank & mobiliteit", icon: CreditCard },
  { key: "ice", label: "ICE", icon: Users },
  { key: "contracts", label: "Contracten/kosten", icon: BriefcaseBusiness },
  { key: "planning", label: "Planning/restricties", icon: CalendarDays },
  { key: "materials", label: "Materiaal", icon: Package },
  { key: "notes", label: "Notities/gesprekken", icon: MessageSquareText },
  { key: "teamhub", label: "App & Teamhub", icon: Handshake },
];

function PersonnelDetailTabs({ person, companies, dossier, onAddRecord }) {
  const [active, setActive] = useState("overview");
  const routeExecutions = dossier.routeExecutions.filter(item => item.employee_id === person.id).slice(0, 8);
  const generalDocuments = dossier.documents.filter(item => ![
    "identity_document",
    "drivers_license",
    "vog",
    "cv",
    "bank_account_proof",
    "payroll_tax_statement",
  ].includes(item.category));

  const renderActiveTab = () => {
    if (active === "overview") {
      return (
        <PersonnelOverviewTab
          person={person}
          companies={companies}
          documents={dossier.documents}
          qualifications={dossier.qualifications}
          bankAccounts={dossier.bankAccounts}
          emergencyContacts={dossier.emergencyContacts}
          securityPasses={dossier.securityPasses}
        />
      );
    }

    if (active === "payroll") {
      return <PersonnelPayrollTab person={person} documents={dossier.documents} />;
    }

    if (active === "identity") {
      return <PersonnelIdentityTab person={person} documents={dossier.documents} />;
    }

    if (active === "documents") {
      return (
        <SectionPanel
          title="Documenten"
          icon={FileText}
          action={<Button size="sm" variant="outline" onClick={() => onAddRecord("document")}><Plus className="mr-1 h-4 w-4" />Toevoegen</Button>}
        >
          <MiniTable
            emptyText="Nog geen documenten vastgelegd."
            rows={generalDocuments}
            columns={[
              { key: "category", label: "Categorie", render: row => DOCUMENT_CATEGORIES.find(item => item.value === row.category)?.label || row.category },
              { key: "document_type", label: "Type" },
              { key: "document_number", label: "Nummer" },
              { key: "valid_until", label: "Geldig tot", render: row => formatDate(row.valid_until) },
              { key: "verification_status", label: "Status", render: row => <BadgePill className={row.verification_status === "verified" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>{VERIFICATION_LABELS[row.verification_status] || row.verification_status}</BadgePill> },
            ]}
          />
        </SectionPanel>
      );
    }

    if (active === "compliance") {
      return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionPanel
            title="WPBR en beveiligingspassen"
            icon={ShieldCheck}
            action={<Button size="sm" variant="outline" onClick={() => onAddRecord("securityPass")}><Plus className="mr-1 h-4 w-4" />Pas</Button>}
          >
            <FieldRow label="WPBR vereist">{person.wpbr_required ? "Ja" : "Nee"}</FieldRow>
            <FieldRow label="WPBR status">{person.wpbr_status || "-"}</FieldRow>
            <FieldRow label="Autoriteit">{person.wpbr_authority || "-"}</FieldRow>
            <FieldRow label="Toestemmingsnummer">{person.wpbr_permission_number || "-"}</FieldRow>
            <div className="mt-4">
              <MiniTable
                emptyText="Nog geen beveiligingspassen geregistreerd."
                rows={dossier.securityPasses}
                columns={[
                  { key: "pass_type", label: "Pas" },
                  { key: "pass_number", label: "Nummer" },
                  { key: "status", label: "Status" },
                  { key: "valid_until", label: "Geldig tot", render: row => formatDate(row.valid_until) },
                ]}
              />
            </div>
          </SectionPanel>
          <SectionPanel
            title="Diploma's en VOG"
            icon={FileBadge}
            action={<Button size="sm" variant="outline" onClick={() => onAddRecord("qualification")}><Plus className="mr-1 h-4 w-4" />Diploma</Button>}
          >
            <MiniTable
              emptyText="Nog geen diploma's of certificaten vastgelegd."
              rows={dossier.qualifications}
              columns={[
                { key: "name", label: "Opleiding" },
                { key: "issuer", label: "Uitgever" },
                { key: "valid_until", label: "Geldig tot", render: row => formatDate(row.valid_until) },
                { key: "verification_status", label: "Status", render: row => VERIFICATION_LABELS[row.verification_status] || row.verification_status },
              ]}
            />
          </SectionPanel>
        </div>
      );
    }

    if (active === "bank-mobility") {
      return <PersonnelBankMobilityTab documents={dossier.documents} bankAccounts={dossier.bankAccounts} />;
    }

    if (active === "ice") {
      return <PersonnelIceTab documents={dossier.documents} emergencyContacts={dossier.emergencyContacts} onAddRecord={onAddRecord} />;
    }

    if (active === "contracts") {
      return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
          <PersonnelContractsTab personnel={person} companies={companies} />
          <SectionPanel title="Kostenberekening" icon={BriefcaseBusiness}>
            <CostCalculator personnel={person} />
          </SectionPanel>
        </div>
      );
    }

    if (active === "planning") {
      return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionPanel
            title="Klant/object restricties"
            icon={ClipboardCheck}
            action={<Button size="sm" variant="outline" onClick={() => onAddRecord("restriction")}><Plus className="mr-1 h-4 w-4" />Restrictie</Button>}
          >
            <MiniTable
              emptyText="Geen restricties ingesteld."
              rows={dossier.restrictions}
              columns={[
                { key: "scope_label", label: "Klant/object" },
                { key: "may_work", label: "Mag werken", render: row => row.may_work ? "Ja" : "Nee" },
                { key: "reason", label: "Reden" },
                { key: "valid_until", label: "Tot", render: row => formatDate(row.valid_until) },
              ]}
            />
          </SectionPanel>
          <SectionPanel
            title="Rooster, verlof en ziekte"
            icon={CalendarDays}
            action={<Button size="sm" variant="outline" onClick={() => onAddRecord("absence")}><Plus className="mr-1 h-4 w-4" />Afwezigheid</Button>}
          >
            <div className="mb-4">
              <MiniTable
                emptyText="Geen verlof- of ziekteregistraties."
                rows={dossier.absences}
                columns={[
                  { key: "absence_type", label: "Type" },
                  { key: "start_date", label: "Start", render: row => formatDate(row.start_date) },
                  { key: "end_date", label: "Einde", render: row => formatDate(row.end_date) },
                  { key: "status", label: "Status" },
                ]}
              />
            </div>
            <MiniTable
              emptyText="Nog geen recente route-uitvoeringen voor deze persoon."
              rows={routeExecutions}
              columns={[
                { key: "route_name", label: "Route" },
                { key: "service_date", label: "Datum", render: row => formatDate(row.service_date) },
                { key: "shift_start_time", label: "Start" },
                { key: "status", label: "Status" },
              ]}
            />
          </SectionPanel>
        </div>
      );
    }

    if (active === "materials") {
      return (
        <SectionPanel
          title="Materiaal"
          icon={Package}
          action={<Button size="sm" variant="outline" onClick={() => onAddRecord("material")}><Plus className="mr-1 h-4 w-4" />Toevoegen</Button>}
        >
          <MiniTable
            emptyText="Nog geen materiaal uitgegeven."
            rows={dossier.materials}
            columns={[
              { key: "material", label: "Materiaal" },
              { key: "quantity", label: "Aantal" },
              { key: "serial_number", label: "Serienummer" },
              { key: "issued_at", label: "Uitgegeven", render: row => formatDate(row.issued_at) },
              { key: "status", label: "Status" },
            ]}
          />
        </SectionPanel>
      );
    }

    if (active === "notes") {
      return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionPanel
            title="Notities"
            icon={MessageSquareText}
            action={<Button size="sm" variant="outline" onClick={() => onAddRecord("note")}><Plus className="mr-1 h-4 w-4" />Notitie</Button>}
          >
            <MiniTable
              emptyText="Nog geen notities."
              rows={dossier.notes}
              columns={[
                { key: "title", label: "Titel" },
                { key: "note_type", label: "Type" },
                { key: "body", label: "Notitie" },
                { key: "created_at", label: "Datum", render: row => formatDate(row.created_at) },
              ]}
            />
          </SectionPanel>
          <SectionPanel
            title="Functioneringsgesprekken"
            icon={ClipboardCheck}
            action={<Button size="sm" variant="outline" onClick={() => onAddRecord("review")}><Plus className="mr-1 h-4 w-4" />Gesprek</Button>}
          >
            <MiniTable
              emptyText="Nog geen gesprekken geregistreerd."
              rows={dossier.reviews}
              columns={[
                { key: "review_type", label: "Type" },
                { key: "review_date", label: "Datum", render: row => formatDate(row.review_date) },
                { key: "subject", label: "Onderwerp" },
                { key: "status", label: "Status" },
              ]}
            />
          </SectionPanel>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        <PersonnelAccessTab personnel={person} />
        <SectionPanel title="Koppelregels profiel" icon={Handshake}>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Het eigen account van de medewerker of ZZP'er heeft voorrang na bevestigde koppeling.</p>
            <p>Voor conflicten volgt eerst een review. Na bevestiging vervangen persoonlijke gegevens en conflicterende bestanden de lokale waarden.</p>
            <p>Lokale werkgeverdata blijft behouden. Bestanden zonder conflict, zoals oude verlopen legitimatiekopieen, worden toegevoegd aan het profiel.</p>
            <div className="rounded-md border border-border px-3 py-2">
              <FieldRow label="Koppelstatus">{TEAMHUB_LINK_LABELS[person.teamhub_link_status] || (person.linked_user_id ? "Gekoppeld" : "Lokaal profiel")}</FieldRow>
              <FieldRow label="Review bij conflicten">Vereist voor overschrijven</FieldRow>
              <FieldRow label="Niet-conflicterende documenten">Toevoegen aan profiel</FieldRow>
            </div>
          </div>
        </SectionPanel>
      </div>
    );
  };

  return (
    <div className="mt-4 flex min-h-[200px] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="w-48 shrink-0 border-r border-border bg-muted/30 py-3">
        {PERSONNEL_DETAIL_MENU_ITEMS.map(item => (
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
      <div className="min-w-0 flex-1 p-4">
        {renderActiveTab()}
      </div>
    </div>
  );
}

function PersonnelList({ personnel, companies, selectedId, onSelect, onEdit, onDelete, onCalculate }) {
  if (!personnel.length) {
    return <EmptyState icon={Users} title="Geen personen gevonden" description="Pas de filters aan of voeg een nieuwe persoon toe." />;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="flex items-center border-b border-border bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex-[2] min-w-0">Naam</span>
            <span className="flex-[1.5] min-w-0">Bedrijf</span>
            <span className="w-36 shrink-0">Functie</span>
            <span className="w-28 shrink-0">Relatie</span>
            <span className="w-28 shrink-0">HR</span>
            <span className="w-28 shrink-0">Status</span>
            <span className="w-28 shrink-0">App</span>
            <span className="w-28 shrink-0 text-right">Acties</span>
          </div>
          <div className="divide-y divide-border">
            {personnel.map(person => {
              const relationship = getRelationshipType(person);
              const company = companies.find(item => item.id === person.primary_company_id);
              const status = getStatus(person);
              const isSelected = selectedId === person.id;
              return (
                <div
                  key={person.id}
                  onClick={() => onSelect(person)}
                  className={`group flex cursor-pointer items-center px-4 py-3 transition-colors hover:bg-accent/50 ${isSelected ? "bg-muted/40" : ""}`}
                >
                  <div className="flex-[2] min-w-0 flex items-center gap-2">
                    {person.photo_file_url ? (
                      <img src={person.photo_file_url} alt="" className="h-7 w-7 shrink-0 rounded border border-border object-cover" />
                    ) : (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">
                        {getDisplayName(person).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{getDisplayName(person)}</p>
                      <p className="truncate text-xs text-muted-foreground">{person.email || person.phone || "Geen contactgegevens"}</p>
                    </div>
                  </div>
                  <span className="flex-[1.5] min-w-0 truncate text-sm text-muted-foreground">{company?.display_name || "—"}</span>
                  <span className="w-36 shrink-0 truncate text-sm">{FUNCTION_LABELS[person.function_type] || person.function_type || "—"}</span>
                  <span className="w-28 shrink-0">
                    <BadgePill className={relationship === "self_employed" ? "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-200" : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200"}>
                      {RELATIONSHIP_LABELS[relationship]}
                    </BadgePill>
                  </span>
                  <span className="w-28 shrink-0">
                    <BadgePill className={HR_COLORS[person.hr_completeness_status || "incomplete"] || HR_COLORS.incomplete}>
                      {HR_LABELS[person.hr_completeness_status || "incomplete"]}
                    </BadgePill>
                  </span>
                  <span className="w-28 shrink-0">
                    <BadgePill className={STATUS_COLORS[status] || STATUS_COLORS.draft}>{STATUS_LABELS[status] || status}</BadgePill>
                  </span>
                  <span className="w-28 shrink-0">
                    {person.linked_user_id ? (
                      <BadgePill className="bg-emerald-100 text-emerald-700" icon={UserCheck}>Gekoppeld</BadgePill>
                    ) : (
                      <BadgePill className="bg-slate-100 text-slate-600">Lokaal</BadgePill>
                    )}
                  </span>
                  <div className="w-28 shrink-0" onClick={event => event.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onCalculate(person)} title="Kosten">
                        <BriefcaseBusiness className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(person)} title="Bewerken">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(person)} title="Verwijderen">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubcontractorsPanel({ subcontractors, onCreate, onEdit, onDelete }) {
  if (!subcontractors.length) {
    return (
      <EmptyState
        icon={Building2}
        title="Geen onderaannemers"
        description="Leg beveiligingsbedrijven vast met ND-/vergunningsgegevens en contactpersonen."
        actionLabel="Onderaannemer toevoegen"
        onAction={onCreate}
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Bedrijf</TableHead>
            <TableHead>ND/WPBR</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Tarief</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Teamhub</TableHead>
            <TableHead className="text-right">Acties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subcontractors.map(item => {
            const expiry = getExpiryState(item.permit_valid_until);
            return (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="min-w-[240px]">
                    <p className="font-medium">{item.display_name}</p>
                    <p className="text-xs text-muted-foreground">{item.legal_name || item.kvk_number || "Lokale onderaannemer"}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1 text-sm">
                    <p>{item.nd_number || item.permit_number || "-"}</p>
                    {expiry && <BadgePill className={expiry.className}>{expiry.label}</BadgePill>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <p>{item.contact_name || "-"}</p>
                    <p className="text-xs text-muted-foreground">{item.contact_email || item.contact_phone || ""}</p>
                  </div>
                </TableCell>
                <TableCell>{formatCurrency(item.default_hourly_rate)}</TableCell>
                <TableCell>
                  <BadgePill className={item.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>
                    {SUBCONTRACTOR_STATUS_LABELS[item.status] || item.status}
                  </BadgePill>
                </TableCell>
                <TableCell>
                  <BadgePill className={item.teamhub_link_status === "linked" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>
                    {item.teamhub_link_status === "linked" ? "Gekoppeld" : "Lokaal"}
                  </BadgePill>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(item)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Personnel() {
  const queryClient = useQueryClient();
  const [selectedPersonnelId, setSelectedPersonnelId] = useState(null);
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [newDraftPersonnelId, setNewDraftPersonnelId] = useState(null);
  const [activeTopTab, setActiveTopTab] = useState("employees");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFunction, setFilterFunction] = useState("all");
  const [recordDialogType, setRecordDialogType] = useState(null);
  const [subcontractorDialogOpen, setSubcontractorDialogOpen] = useState(false);
  const [editingSubcontractor, setEditingSubcontractor] = useState(null);

  const { data: personnel = [] } = useQuery({ queryKey: ["personnel"], queryFn: () => base44.entities.Personnel.list() });
  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => base44.entities.Company.list() });
  const { data: subcontractors = [] } = useQuery({ queryKey: ["subcontractors"], queryFn: () => safeList("SubcontractorCompany", "-created_date") });
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

  const grouped = useMemo(() => ({
    documents: groupByPersonnel(documents),
    qualifications: groupByPersonnel(qualifications),
    bankAccounts: groupByPersonnel(bankAccounts),
    emergencyContacts: groupByPersonnel(emergencyContacts),
    securityPasses: groupByPersonnel(securityPasses),
    restrictions: groupByPersonnel(restrictions),
    materials: groupByPersonnel(materials),
    notes: groupByPersonnel(notes),
    reviews: groupByPersonnel(reviews),
    absences: groupByPersonnel(absences),
  }), [absences, bankAccounts, documents, emergencyContacts, materials, notes, qualifications, restrictions, reviews, securityPasses]);

  const counts = useMemo(() => {
    const employees = personnel.filter(item => getRelationshipType(item) === "employee").length;
    const zzp = personnel.filter(item => getRelationshipType(item) === "self_employed").length;
    return { all: personnel.length, employees, zzp, subcontractors: subcontractors.length };
  }, [personnel, subcontractors.length]);

  const visiblePersonnel = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return personnel.filter(person => {
      const relationship = getRelationshipType(person);
      if (activeTopTab === "employees" && relationship !== "employee") return false;
      if (activeTopTab === "self_employed" && relationship !== "self_employed") return false;
      const matchesSearch = !needle || [
        getDisplayName(person),
        person.email,
        person.phone,
        person.self_employed_company_name,
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(needle));
      const matchesStatus = filterStatus === "all" || getStatus(person) === filterStatus;
      const matchesFunction = filterFunction === "all" || (person.function_type || "unknown") === filterFunction;
      return matchesSearch && matchesStatus && matchesFunction;
    });
  }, [activeTopTab, filterFunction, filterStatus, personnel, search]);

  const selectedPersonnel = visiblePersonnel.find(item => item.id === selectedPersonnelId) || visiblePersonnel[0] || null;
  const selectedDossier = selectedPersonnel ? {
    documents: grouped.documents[selectedPersonnel.id] || [],
    qualifications: grouped.qualifications[selectedPersonnel.id] || [],
    bankAccounts: grouped.bankAccounts[selectedPersonnel.id] || [],
    emergencyContacts: grouped.emergencyContacts[selectedPersonnel.id] || [],
    securityPasses: grouped.securityPasses[selectedPersonnel.id] || [],
    restrictions: grouped.restrictions[selectedPersonnel.id] || [],
    materials: grouped.materials[selectedPersonnel.id] || [],
    notes: grouped.notes[selectedPersonnel.id] || [],
    reviews: grouped.reviews[selectedPersonnel.id] || [],
    absences: grouped.absences[selectedPersonnel.id] || [],
    routeExecutions,
  } : null;

  const deletePersonnelMutation = useMutation({
    mutationFn: (id) => base44.entities.Personnel.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel"] });
      setSelectedPersonnelId(null);
    },
  });

  const createPersonnelMutation = useMutation({
    mutationFn: (type = "employee") => {
      const isZzp = type === "self_employed";
      return base44.entities.Personnel.create({
        name: "",
        employee_type: isZzp ? "zzp" : "loondienst",
        relationship_type: isZzp ? "self_employed" : "employee",
        profile_data_policy: "profile_wins_after_acceptance",
        profile_conflict_status: "none",
        local_organization_copy_retained: true,
        status: "draft",
        hr_completeness_status: "incomplete",
        country: "Nederland",
        is_active: true,
      });
    },
    onSuccess: (created) => {
      if (created?.id) {
        queryClient.setQueryData(["personnel"], current => {
          const list = Array.isArray(current) ? current : [];
          if (list.some(item => item.id === created.id)) return list;
          return [created, ...list];
        });
      }
      queryClient.invalidateQueries({ queryKey: ["personnel"] });
      if (created?.id) {
        setSelectedPersonnelId(created.id);
        setEditingProfileId(created.id);
        setNewDraftPersonnelId(created.id);
      }
    },
  });

  const deleteEmptyDraftMutation = useMutation({
    mutationFn: (id) => base44.entities.Personnel.delete(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData(["personnel"], current => (Array.isArray(current) ? current.filter(item => item.id !== id) : current));
      queryClient.invalidateQueries({ queryKey: ["personnel"] });
      setSelectedPersonnelId(null);
      setEditingProfileId(null);
      setNewDraftPersonnelId(null);
    },
  });

  const saveSubcontractorMutation = useMutation({
    mutationFn: (data) => {
      if (data.id) return base44.entities.SubcontractorCompany.update(data.id, data);
      return base44.entities.SubcontractorCompany.create(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subcontractors"] }),
  });

  const deleteSubcontractorMutation = useMutation({
    mutationFn: (id) => base44.entities.SubcontractorCompany.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subcontractors"] }),
  });

  const recordConfig = selectedPersonnel ? getRecordConfig(recordDialogType, selectedPersonnel) : null;

  const createRecord = async (config, payload) => {
    await base44.entities[config.entityName].create(payload);
    config.queryKeys.forEach(queryKey => queryClient.invalidateQueries({ queryKey: [queryKey] }));
  };

  const openNew = (type = "employee") => createPersonnelMutation.mutate(type);

  const cancelProfileEdit = (person) => {
    if (newDraftPersonnelId === person?.id && isEmptyDraftPersonnel(person)) {
      deleteEmptyDraftMutation.mutate(person.id);
      return;
    }
    setEditingProfileId(null);
    if (newDraftPersonnelId === person?.id) setNewDraftPersonnelId(null);
  };

  const deletePersonnel = (person) => {
    if (confirm(`${getDisplayName(person)} verwijderen? Dossierdata blijft alleen behouden als deze elders gekoppeld is.`)) {
      deletePersonnelMutation.mutate(person.id);
    }
  };

  const filteredSubcontractors = subcontractors.filter(item => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [item.display_name, item.legal_name, item.nd_number, item.contact_name, item.contact_email]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(needle));
  });

  const topTabs = [
    { value: "all", label: "Alle", count: counts.all },
    { value: "employees", label: "Loondienst", count: counts.employees },
    { value: "self_employed", label: "ZZP'ers", count: counts.zzp },
    { value: "subcontractors", label: "Onderaannemers", count: counts.subcontractors },
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Personeel"
        subtitle="Loondienst, ZZP'ers, onderaannemers en lokale HR-dossiers"
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {activeTopTab === "subcontractors" && (
              <Button onClick={() => { setEditingSubcontractor(null); setSubcontractorDialogOpen(true); }}>
                <Plus className="mr-1 h-4 w-4" /> Onderaannemer
              </Button>
            )}
            {activeTopTab === "employees" && (
              <Button onClick={() => openNew("employee")} disabled={createPersonnelMutation.isPending}>
                <Plus className="mr-1 h-4 w-4" /> {createPersonnelMutation.isPending ? "Aanmaken..." : "Loondienst"}
              </Button>
            )}
            {activeTopTab === "self_employed" && (
              <Button onClick={() => openNew("self_employed")} disabled={createPersonnelMutation.isPending}>
                <Plus className="mr-1 h-4 w-4" /> {createPersonnelMutation.isPending ? "Aanmaken..." : "ZZP'er"}
              </Button>
            )}
          </div>
        }
      />

      <div className="space-y-4">
          <Tabs value={activeTopTab || "employees"} onValueChange={setActiveTopTab}>
            <div className="overflow-x-auto">
              <TabsList className="h-auto min-w-max justify-start">
                {topTabs.map(tab => (
                     <TabsTrigger key={tab.value} value={tab.value}>
                       {tab.label}
                       <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground">{tab.count}</span>
                     </TabsTrigger>
                   ))}
               </TabsList>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder={activeTopTab === "subcontractors" ? "Zoeken op bedrijf, ND-nummer of contact..." : "Zoeken op naam, e-mail of bedrijf..."} value={search} onChange={event => setSearch(event.target.value)} />
              </div>
              {activeTopTab !== "subcontractors" && (
                <>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle statussen</SelectItem>
                      <SelectItem value="active">Actief</SelectItem>
                      <SelectItem value="onboarding">Onboarding</SelectItem>
                      <SelectItem value="draft">Concept</SelectItem>
                      <SelectItem value="inactive">Inactief</SelectItem>
                      <SelectItem value="archived">Gearchiveerd</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterFunction} onValueChange={setFilterFunction}>
                    <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle functies</SelectItem>
                      {Object.entries(FUNCTION_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            <div className="mt-4">
              {activeTopTab === "subcontractors" ? (
              <SubcontractorsPanel
                subcontractors={filteredSubcontractors}
                onCreate={() => { setEditingSubcontractor(null); setSubcontractorDialogOpen(true); }}
                onEdit={item => { setEditingSubcontractor(item); setSubcontractorDialogOpen(true); }}
                onDelete={item => {
                  if (confirm(`${item.display_name} verwijderen?`)) deleteSubcontractorMutation.mutate(item.id);
                }}
              />
              ) : (
                <PersonnelList
                  personnel={visiblePersonnel}
                  companies={companies}
                  selectedId={selectedPersonnel?.id}
                  onSelect={person => setSelectedPersonnelId(person.id)}
                  onEdit={person => { setSelectedPersonnelId(person.id); setEditingProfileId(person.id); }}
                  onDelete={deletePersonnel}
                  onCalculate={person => { setSelectedPersonnelId(person.id); }}
                />
              )}
            </div>
          </Tabs>

          {activeTopTab !== "subcontractors" && selectedPersonnel && selectedDossier && (
            <div className="space-y-4">
              <PersonnelProfileCard
                person={selectedPersonnel}
                editing={editingProfileId === selectedPersonnel.id}
                onEdit={() => setEditingProfileId(selectedPersonnel.id)}
                onCancel={() => cancelProfileEdit(selectedPersonnel)}
                onSaved={() => {
                  setEditingProfileId(null);
                  if (newDraftPersonnelId === selectedPersonnel.id) setNewDraftPersonnelId(null);
                }}
              />
              <PersonnelDetailTabs
                person={selectedPersonnel}
                companies={companies}
                dossier={selectedDossier}
                onAddRecord={type => setRecordDialogType(type)}
              />
            </div>
          )}
        </div>

      <RecordDialog
        config={recordConfig}
        open={!!recordDialogType}
        onOpenChange={open => !open && setRecordDialogType(null)}
        onSave={createRecord}
      />

      <SubcontractorDialog
        open={subcontractorDialogOpen}
        onOpenChange={setSubcontractorDialogOpen}
        subcontractor={editingSubcontractor}
        onSave={async (payload) => {
          await saveSubcontractorMutation.mutateAsync(payload);
          setEditingSubcontractor(null);
        }}
      />
    </PageTransition>
  );
}
