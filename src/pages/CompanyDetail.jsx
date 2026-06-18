import React, { useEffect, useState, useRef } from "react";
import PageTransition from "@/components/ui-custom/PageTransition";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowLeft,
  Archive,
  Building2,
  Check,
  Edit,
  Handshake,
  Loader2,
  MapPin,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import SidebarPanel from "@/components/companies/CompanySidebarPanel";
import { uploadManagedFile, updateManagedFileSource } from "@/lib/managedFiles";

const ROLE_LABELS = {
  holding: "Holding", operating_company: "Werkmaatschappij",
  sole_proprietor: "Eenmanszaak", other: "Overig",
};

const LEGAL_FORMS = ["BV", "NV", "VOF", "CV", "Eenmanszaak", "Maatschap", "Stichting", "Coöperatie", "Anders"];
const NEW_COMPANY_PLACEHOLDER = "Nieuw bedrijf";
const STATUS_COLORS = {
  active: "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-300",
  inactive: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  archived: "bg-red-50 text-red-600 dark:bg-red-900 dark:text-red-300",
};

function InfoRow({ label, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-1">
      <span className="text-xs text-muted-foreground w-40 shrink-0 pt-1">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ViewText({ value, fallback = "—" }) {
  return <span className="text-sm text-foreground font-medium">{value || fallback}</span>;
}

function DeleteGuardLoadingState() {
  return (
    <div className="rounded-md border border-primary/25 bg-primary/5 p-4 text-sm">
      <div className="flex items-start gap-3">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <div className="absolute inset-0 rounded-md border border-primary/20 bg-background/80 shadow-sm" />
          <div className="absolute inset-0 rounded-md border-2 border-primary/15 border-t-primary animate-spin" />
          <Building2 className="relative h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">Verwijdercontrole wordt uitgevoerd</p>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            LOQ controleert gekoppelde administratie, documenten, planning en bewaartermijnen voordat definitief verwijderen mogelijk wordt.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {["Koppelingen", "Documenten", "Bewaartermijn"].map((label, index) => (
              <div
                key={label}
                className="h-8 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs font-medium text-muted-foreground animate-pulse"
                style={{ animationDelay: `${index * 120}ms` }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function editableCompanyForm(company, blankPlaceholder = false) {
  const shouldBlank = blankPlaceholder && company.display_name === NEW_COMPANY_PLACEHOLDER && company.legal_name === NEW_COMPANY_PLACEHOLDER;
  return {
    ...company,
    display_name: shouldBlank ? "" : company.display_name || "",
    legal_name: shouldBlank ? "" : company.legal_name || "",
    trade_name: company.trade_name || "",
    status: company.status || "active",
    company_role: company.company_role || "operating_company",
    country: company.country || "Nederland",
    activities: company.activities || [],
  };
}

function normalizeCompanyPayload(data) {
  const displayName = data.display_name?.trim() || NEW_COMPANY_PLACEHOLDER;
  const legalName = data.legal_name?.trim() || displayName;

  return {
    ...data,
    display_name: displayName,
    legal_name: legalName,
    trade_name: data.trade_name?.trim() || null,
    kvk_number: data.kvk_number?.trim() || null,
    rsin: data.rsin?.trim() || null,
    btw_number: data.btw_number?.trim() || null,
    legal_form: data.legal_form || null,
    holding_company_id: data.holding_company_id || null,
    primary_activity: data.primary_activity || null,
    activities: data.activities || [],
    street_name: data.street_name?.trim() || null,
    house_number: data.house_number?.trim() || null,
    house_number_addition: data.house_number_addition?.trim() || null,
    postal_code: data.postal_code?.trim() || null,
    city: data.city?.trim() || null,
    country: data.country?.trim() || "Nederland",
    phone: data.phone?.trim() || null,
    email: data.email?.trim() || null,
    website: data.website?.trim() || null,
    notes: data.notes?.trim() || null,
  };
}

function isEmptyDraftCompany(data = {}) {
  const textFields = [
    "display_name",
    "legal_name",
    "trade_name",
    "kvk_number",
    "rsin",
    "btw_number",
    "legal_form",
    "holding_company_id",
    "primary_activity",
    "street_name",
    "house_number",
    "house_number_addition",
    "postal_code",
    "city",
    "phone",
    "email",
    "website",
    "notes",
    "logo_file_url",
    "letterhead_file_url",
  ];

  return textFields.every(field => !String(data[field] || "").trim())
    && (data.country || "Nederland") === "Nederland"
    && (data.status || "active") === "active"
    && (data.company_role || "operating_company") === "operating_company"
    && !(data.activities || []).length;
}

// Conservative guard: Dutch administration is generally 7 years, but some records require 10 years.
const PERMANENT_DELETE_RETENTION_YEARS = 10;
const PERMANENT_DELETE_RETENTION_LABEL = `${PERMANENT_DELETE_RETENTION_YEARS} jaar`;
const ACTIVE_PERSONNEL_STATUSES = new Set(["draft", "onboarding", "active"]);
const ACTIVE_ASSIGNMENT_STATUSES = new Set(["pending", "active"]);
const ACTIVE_INVITATION_STATUSES = new Set(["pending"]);
const ACTIVE_EMAIL_STATUSES = new Set(["pending_oauth", "connected", "action_required"]);
const ACTIVE_BANK_STATUSES = new Set(["active", "pending"]);
const ACTIVE_INSURANCE_STATUSES = new Set(["active", "action_required"]);
const ACTIVE_DOCUMENT_STATUSES = new Set(["pending_review", "active", "suspended"]);
const ACTIVE_SECURITY_PASS_STATUSES = new Set(["requested", "approved", "active"]);
const COMPANY_DELETE_CHECK_PAUSE_MS = 140;
const COMPANY_DELETE_RECORD_DELETE_PAUSE_MS = 80;
const COMPANY_DELETE_RATE_LIMIT_RETRY_DELAYS_MS = [600, 1400, 3000, 6000];

const COMPANY_DELETE_DEPENDENCY_CHECKS = [
  { key: "personnel", label: "Medewerkers", entityName: "Personnel", filter: companyId => ({ primary_company_id: companyId }) },
  { key: "personnelContracts", label: "Arbeidscontracten", entityName: "PersonnelContract", filter: companyId => ({ company_id: companyId }) },
  { key: "personnelAssignments", label: "Bedrijfstoewijzingen", entityName: "PersonnelCompanyAssignment", filter: companyId => ({ company_id: companyId }) },
  { key: "routes", label: "Routes", entityName: "Route", filter: companyId => ({ operating_company_id: companyId }) },
  { key: "tasks", label: "Diensten", entityName: "Task", filter: companyId => ({ operating_company_id: companyId }) },
  { key: "caoAssignments", label: "CAO-koppelingen", entityName: "CompanyCaoAssignment", filter: companyId => ({ company_id: companyId }) },
  { key: "locationAssignments", label: "Vestigingen", entityName: "CompanyLocationAssignment", filter: companyId => ({ company_id: companyId }) },
  { key: "wpbrLicenses", label: "WPBR-vergunningen", entityName: "CompanyWpbrLicense", filter: companyId => ({ company_id: companyId }) },
  { key: "branchMemberships", label: "Brancheverenigingen", entityName: "CompanyBranchMembership", filter: companyId => ({ company_id: companyId }) },
  { key: "accreditations", label: "Erkenningen", entityName: "CompanyAccreditation", filter: companyId => ({ company_id: companyId }) },
  { key: "bankAccounts", label: "Bankrekeningen", entityName: "CompanyBankAccount", filter: companyId => ({ company_id: companyId }) },
  { key: "emailSettings", label: "E-mailkoppelingen", entityName: "CompanyEmailSettings", filter: companyId => ({ company_id: companyId }) },
  { key: "insurancePolicies", label: "Verzekeringen", entityName: "CompanyInsurancePolicy", filter: companyId => ({ company_id: companyId }) },
  { key: "managedFiles", label: "Documenten", entityName: "ManagedFile", filter: companyId => ({ company_id: companyId }) },
  { key: "employeeInvitations", label: "Medewerkeruitnodigingen", entityName: "EmployeeInvitation", filter: companyId => ({ company_id: companyId }) },
  { key: "payrollCalculationRuns", label: "Payroll-runs", entityName: "PayrollCalculationRun", filter: companyId => ({ company_id: companyId }) },
  { key: "personnelCaoEmploymentEvents", label: "CAO-dienstverbandhistorie", entityName: "PersonnelCaoEmploymentEvent", filter: companyId => ({ company_id: companyId }) },
  { key: "personnelDocuments", label: "Personeelsdocumenten", entityName: "PersonnelDocument", filter: companyId => ({ company_id: companyId }) },
  { key: "personnelQualifications", label: "Personeelskwalificaties", entityName: "PersonnelQualification", filter: companyId => ({ company_id: companyId }) },
  { key: "personnelSecurityPasses", label: "Beveiligingspassen", entityName: "PersonnelSecurityPass", filter: companyId => ({ company_id: companyId }) },
  { key: "employeeAccessAuditLogs", label: "Toegangsauditlogs", entityName: "EmployeeAccessAuditLog", filter: companyId => ({ company_id: companyId }), blocksOnFailure: false },
  { key: "managedFileAccessLogs", label: "Bestandsauditlogs", entityName: "ManagedFileAccessLog", filter: companyId => ({ company_id: companyId }), blocksOnFailure: false },
];

const COMPANY_DELETE_DEPENDENCY_ENTITIES = [
  ["managedFileAccessLogs", "ManagedFileAccessLog"],
  ["employeeAccessAuditLogs", "EmployeeAccessAuditLog"],
  ["employeeInvitations", "EmployeeInvitation"],
  ["payrollCalculationRuns", "PayrollCalculationRun"],
  ["personnelCaoEmploymentEvents", "PersonnelCaoEmploymentEvent"],
  ["personnelSecurityPasses", "PersonnelSecurityPass"],
  ["personnelQualifications", "PersonnelQualification"],
  ["personnelDocuments", "PersonnelDocument"],
  ["personnelAssignments", "PersonnelCompanyAssignment"],
  ["personnelContracts", "PersonnelContract"],
  ["personnel", "Personnel"],
  ["routes", "Route"],
  ["tasks", "Task"],
  ["caoAssignments", "CompanyCaoAssignment"],
  ["locationAssignments", "CompanyLocationAssignment"],
  ["wpbrLicenses", "CompanyWpbrLicense"],
  ["branchMemberships", "CompanyBranchMembership"],
  ["accreditations", "CompanyAccreditation"],
  ["bankAccounts", "CompanyBankAccount"],
  ["emailSettings", "CompanyEmailSettings"],
  ["insurancePolicies", "CompanyInsurancePolicy"],
  ["managedFiles", "ManagedFile"],
];

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function yearsAgo(years) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date;
}

function parseRecordDate(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value.length <= 10 ? `${value}T00:00:00` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasOpenDateRange(item, endField = "valid_until") {
  const endDate = item?.[endField];
  return !endDate || endDate >= getTodayDateString();
}

function latestRecordDate(record = {}) {
  const dateFields = [
    "updated_date",
    "created_date",
    "created_at",
    "valid_until",
    "contract_end_date",
    "service_date",
    "valid_from",
    "contract_start_date",
    "pay_period_end",
    "pay_period_start",
    "requested_at",
    "awarded_at",
    "provided_to_employer_date",
    "expires_at",
    "accepted_at",
    "declined_at",
    "connected_at",
    "revoked_at",
    "archived_at",
  ];

  return dateFields.reduce((latest, field) => {
    const parsed = parseRecordDate(record[field]);
    if (!parsed) return latest;
    return !latest || parsed > latest ? parsed : latest;
  }, null);
}

function recordMatchesCompany(record = {}, companyId) {
  return record.company_id === companyId ||
    record.operating_company_id === companyId ||
    record.primary_company_id === companyId ||
    record.tenant_container_key === `company:${companyId}` ||
    (Array.isArray(record.company_ids) && record.company_ids.includes(companyId));
}

function errorMessage(error) {
  return error?.response?.data?.message ||
    error?.message ||
    "Onbekende fout bij het ophalen van deze controle.";
}

function isRateLimitError(error) {
  const message = errorMessage(error).toLowerCase();
  return error?.response?.status === 429 ||
    error?.status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many requests");
}

function deleteGuardErrorMessage(error) {
  if (isRateLimitError(error)) {
    return "De Base44 API-limiet is tijdelijk bereikt tijdens de controle. Dit betekent niet dat er gekoppelde data is gevonden; de controle kon alleen tijdelijk niet worden afgerond. Wacht enkele seconden en open de verwijdercontrole opnieuw.";
  }
  return errorMessage(error);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runWithRateLimitRetry(operation) {
  let lastError = null;

  for (let attempt = 0; attempt <= COMPANY_DELETE_RATE_LIMIT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryDelay = COMPANY_DELETE_RATE_LIMIT_RETRY_DELAYS_MS[attempt];
      if (!isRateLimitError(error) || !retryDelay) {
        throw error;
      }
      await wait(retryDelay);
    }
  }

  throw lastError;
}

async function fetchCompanyDependency(check, companyId) {
  const entity = base44.entities[check.entityName];
  const baseFailure = {
    label: check.label,
    entityName: check.entityName,
    blocking: check.blocksOnFailure !== false,
  };

  if (!entity?.filter && !entity?.list) {
    return {
      key: check.key,
      items: [],
      failure: {
        ...baseFailure,
        detail: `${check.entityName} is niet beschikbaar in de app-client.`,
      },
    };
  }

  if (entity?.filter) {
    try {
      const items = await runWithRateLimitRetry(() => entity.filter(check.filter(companyId)));
      return { key: check.key, items: Array.isArray(items) ? items : [] };
    } catch (filterError) {
      if (isRateLimitError(filterError)) {
        throw filterError;
      }
      if (!entity?.list) {
        return {
          key: check.key,
          items: [],
          failure: {
            ...baseFailure,
            detail: errorMessage(filterError),
          },
        };
      }
    }
  }

  try {
    const items = await runWithRateLimitRetry(() => entity.list());
    return {
      key: check.key,
      items: (Array.isArray(items) ? items : []).filter(record => recordMatchesCompany(record, companyId)),
    };
  } catch (listError) {
    if (isRateLimitError(listError)) {
      throw listError;
    }
    return {
      key: check.key,
      items: [],
      failure: {
        ...baseFailure,
        detail: errorMessage(listError),
      },
    };
  }
}

function recordLabel(record = {}) {
  return record.display_name ||
    record.legal_name ||
    record.name ||
    record.title ||
    record.email ||
    record.normalized_email ||
    record.document_label ||
    record.file_download_filename ||
    record.download_filename ||
    record.logical_path ||
    record.license_number ||
    record.wpbr_license_number ||
    record.certificate_number ||
    record.policy_number ||
    record.iban_masked ||
    record.iban ||
    record.status ||
    (record.id ? `ID ${String(record.id).slice(-6)}` : "record");
}

function summarizeRecords(items = [], max = 3) {
  const examples = items.slice(0, max).map(item => {
    const date = latestRecordDate(item);
    const dateLabel = date ? date.toLocaleDateString("nl-NL") : "datum onbekend";
    return `${recordLabel(item)} (${dateLabel})`;
  });
  const remaining = Math.max(0, items.length - max);
  return remaining ? `${examples.join(", ")} en nog ${remaining}` : examples.join(", ");
}

function buildPermanentDeleteGuard(company, dependencies = {}) {
  const deps = {
    personnel: dependencies.personnel || [],
    personnelContracts: dependencies.personnelContracts || [],
    personnelAssignments: dependencies.personnelAssignments || [],
    routes: dependencies.routes || [],
    tasks: dependencies.tasks || [],
    caoAssignments: dependencies.caoAssignments || [],
    locationAssignments: dependencies.locationAssignments || [],
    wpbrLicenses: dependencies.wpbrLicenses || [],
    branchMemberships: dependencies.branchMemberships || [],
    accreditations: dependencies.accreditations || [],
    bankAccounts: dependencies.bankAccounts || [],
    emailSettings: dependencies.emailSettings || [],
    insurancePolicies: dependencies.insurancePolicies || [],
    managedFiles: dependencies.managedFiles || [],
    employeeAccessAuditLogs: dependencies.employeeAccessAuditLogs || [],
    employeeInvitations: dependencies.employeeInvitations || [],
    managedFileAccessLogs: dependencies.managedFileAccessLogs || [],
    payrollCalculationRuns: dependencies.payrollCalculationRuns || [],
    personnelCaoEmploymentEvents: dependencies.personnelCaoEmploymentEvents || [],
    personnelDocuments: dependencies.personnelDocuments || [],
    personnelQualifications: dependencies.personnelQualifications || [],
    personnelSecurityPasses: dependencies.personnelSecurityPasses || [],
  };
  const blockers = [];
  const warnings = [];
  const retentionThreshold = yearsAgo(PERMANENT_DELETE_RETENTION_YEARS);
  const today = getTodayDateString();

  (dependencies.__checkFailures || []).forEach(failure => {
    const item = {
      title: `${failure.label} niet gecontroleerd`,
      detail: failure.detail,
    };
    if (failure.blocking === false) {
      warnings.push(item);
    } else {
      blockers.push(item);
    }
  });

  if (company?.status !== "archived") {
    blockers.push({
      title: "Bedrijf staat niet in het archief",
      detail: "Verplaats het bedrijf eerst naar het archief voordat definitief verwijderen beoordeeld kan worden.",
    });
  }

  const groups = [
    {
      label: "Medewerkers",
      items: deps.personnel,
      activeItems: deps.personnel.filter(item => ACTIVE_PERSONNEL_STATUSES.has(item.status)),
    },
    {
      label: "Arbeidscontracten",
      items: deps.personnelContracts,
      activeItems: deps.personnelContracts.filter(item => hasOpenDateRange(item, "contract_end_date")),
    },
    {
      label: "Bedrijfstoewijzingen",
      items: deps.personnelAssignments,
      activeItems: deps.personnelAssignments.filter(item => ACTIVE_ASSIGNMENT_STATUSES.has(item.assignment_status) && hasOpenDateRange(item)),
    },
    {
      label: "Routes",
      items: deps.routes,
      activeItems: deps.routes.filter(item => item.status && item.status !== "vergrendeld"),
    },
    {
      label: "Diensten",
      items: deps.tasks,
      activeItems: [],
    },
    {
      label: "CAO-koppelingen",
      items: deps.caoAssignments,
      activeItems: deps.caoAssignments.filter(item => hasOpenDateRange(item)),
    },
    {
      label: "Vestigingen",
      items: deps.locationAssignments,
      activeItems: deps.locationAssignments.filter(item => hasOpenDateRange(item)),
    },
    {
      label: "WPBR-vergunningen",
      items: deps.wpbrLicenses,
      activeItems: deps.wpbrLicenses.filter(item => item.status === "active" && (!item.valid_until || item.valid_until >= today)),
    },
    {
      label: "Brancheverenigingen",
      items: deps.branchMemberships,
      activeItems: deps.branchMemberships.filter(item => ACTIVE_DOCUMENT_STATUSES.has(item.status) && hasOpenDateRange(item)),
    },
    {
      label: "Erkenningen",
      items: deps.accreditations,
      activeItems: deps.accreditations.filter(item => ACTIVE_DOCUMENT_STATUSES.has(item.status) && hasOpenDateRange(item)),
    },
    {
      label: "Bankrekeningen",
      items: deps.bankAccounts,
      activeItems: deps.bankAccounts.filter(item => ACTIVE_BANK_STATUSES.has(item.status) && hasOpenDateRange(item)),
    },
    {
      label: "E-mailkoppelingen",
      items: deps.emailSettings,
      activeItems: deps.emailSettings.filter(item => ACTIVE_EMAIL_STATUSES.has(item.status)),
    },
    {
      label: "Verzekeringen",
      items: deps.insurancePolicies,
      activeItems: deps.insurancePolicies.filter(item => ACTIVE_INSURANCE_STATUSES.has(item.status) && hasOpenDateRange(item)),
    },
    {
      label: "Documenten",
      items: deps.managedFiles,
      activeItems: [],
    },
    {
      label: "Medewerkeruitnodigingen",
      items: deps.employeeInvitations,
      activeItems: deps.employeeInvitations.filter(item => ACTIVE_INVITATION_STATUSES.has(item.status)),
    },
    {
      label: "Toegangsauditlogs",
      items: deps.employeeAccessAuditLogs,
      activeItems: [],
    },
    {
      label: "Bestandsauditlogs",
      items: deps.managedFileAccessLogs,
      activeItems: [],
    },
    {
      label: "Payroll-runs",
      items: deps.payrollCalculationRuns,
      activeItems: [],
    },
    {
      label: "CAO-dienstverbandhistorie",
      items: deps.personnelCaoEmploymentEvents,
      activeItems: [],
    },
    {
      label: "Personeelsdocumenten",
      items: deps.personnelDocuments,
      activeItems: [],
    },
    {
      label: "Personeelskwalificaties",
      items: deps.personnelQualifications,
      activeItems: [],
    },
    {
      label: "Beveiligingspassen",
      items: deps.personnelSecurityPasses,
      activeItems: deps.personnelSecurityPasses.filter(item => ACTIVE_SECURITY_PASS_STATUSES.has(item.status) && hasOpenDateRange(item)),
    },
  ];

  groups.forEach(group => {
    if (group.activeItems.length > 0) {
      blockers.push({
        title: `${group.label} nog actief`,
        detail: `${group.activeItems.length} gekoppelde record(s) zijn nog actief of openstaand. Bijvoorbeeld: ${summarizeRecords(group.activeItems)}.`,
      });
    }
  });

  groups.forEach(group => {
    const recentItems = group.items.filter(item => {
      const recordDate = latestRecordDate(item);
      return !recordDate || recordDate >= retentionThreshold;
    });
    if (recentItems.length > 0) {
      blockers.push({
        title: `${group.label} binnen bewaartermijn`,
        detail: `${recentItems.length} record(s) vallen binnen ${PERMANENT_DELETE_RETENTION_LABEL} of hebben geen betrouwbare datum. Bijvoorbeeld: ${summarizeRecords(recentItems)}.`,
      });
    }
  });

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings,
    linkedCount: groups.reduce((count, group) => count + group.items.length, 0),
  };
}

async function deleteCompanyDependencyRecords(dependencies = {}) {
  for (const [key, entityName] of COMPANY_DELETE_DEPENDENCY_ENTITIES) {
    const records = dependencies[key] || [];
    if (!records.length) continue;

    const entity = base44.entities[entityName];
    if (!entity?.delete) {
      throw new Error(`${entityName} kan niet automatisch worden opgeschoond. Definitief verwijderen is daarom gestopt.`);
    }

    for (const record of records.filter(item => item?.id)) {
      await runWithRateLimitRetry(() => entity.delete(record.id));
      await wait(COMPANY_DELETE_RECORD_DELETE_PAUSE_MS);
    }
  }
}

export default function CompanyDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const companyId = urlParams.get("id");
  const isNewProfileFlow = urlParams.get("new") === "1";
  const shouldOpenInEditMode = isNewProfileFlow || urlParams.get("edit") === "1";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [permanentDeleteDialogOpen, setPermanentDeleteDialogOpen] = useState(false);
  const addressTimeout = useRef(null);
  const initializedRequestedEdit = useRef(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressSugg, setShowAddressSugg] = useState(false);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: () => base44.entities.Company.list(),
  });

  const company = companies.find(c => c.id === companyId);
  const holdingCompany = company?.holding_company_id
    ? companies.find(c => c.id === company.holding_company_id)
    : null;

  const { data: caoConfigurations = [] } = useQuery({
    queryKey: ["cao-configuration-options-detail"],
    queryFn: async () => {
      const ids = company?.default_cao_configuration_id ? [company.default_cao_configuration_id] : [];
      if (!ids.length) return [];
      const { data } = await base44.functions.invoke("listCaoConfigurationOptions", { include_ids: ids });
      return data?.options || [];
    },
    enabled: !!company,
  });

  const {
    data: deletionDependencies,
    isLoading: deletionGuardLoading,
    isFetching: deletionGuardFetching,
    isError: deletionGuardHasError,
    error: deletionGuardError,
  } = useQuery({
    queryKey: ["company-permanent-delete-guard", companyId],
    queryFn: async () => {
      const results = [];

      for (const check of COMPANY_DELETE_DEPENDENCY_CHECKS) {
        results.push(await fetchCompanyDependency(check, companyId));
        await wait(COMPANY_DELETE_CHECK_PAUSE_MS);
      }

      return results.reduce((acc, result) => {
        acc[result.key] = result.items;
        if (result.failure) acc.__checkFailures.push(result.failure);
        return acc;
      }, { __checkFailures: [] });
    },
    enabled: !!companyId && company?.status === "archived" && permanentDeleteDialogOpen,
    retry: (failureCount, error) => isRateLimitError(error) && failureCount < 3,
    retryDelay: attemptIndex => Math.min(2000 * (attemptIndex + 1), 6000),
    refetchOnWindowFocus: false,
    staleTime: 15000,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.Company.update(companyId, normalizeCompanyPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setEditing(false);
      setForm(null);
      if (shouldOpenInEditMode) {
        navigate(`/CompanyDetail?id=${companyId}`, { replace: true });
      }
    },
  });

  const deleteDraftCompanyMutation = useMutation({
    mutationFn: () => base44.entities.Company.delete(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      navigate("/Companies", { replace: true });
    },
  });

  const archiveCompanyMutation = useMutation({
    mutationFn: () => base44.entities.Company.update(companyId, {
      status: "archived",
      teamhub_enabled: false,
      archived_at: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-permanent-delete-guard", companyId] });
      setArchiveDialogOpen(false);
    },
  });

  const restoreCompanyMutation = useMutation({
    mutationFn: () => base44.entities.Company.update(companyId, { status: "active", archived_at: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-permanent-delete-guard", companyId] });
    },
  });

  const permanentDeleteGuard = buildPermanentDeleteGuard(company, deletionDependencies);
  const deletionGuardChecking = company?.status === "archived" &&
    (deletionGuardLoading || deletionGuardFetching || !deletionDependencies);

  const permanentDeleteCompanyMutation = useMutation({
    mutationFn: async () => {
      if (deletionGuardChecking) {
        throw new Error("Wacht tot de verwijdercontrole klaar is.");
      }
      if (deletionGuardHasError) {
        throw new Error("De verwijdercontrole kon niet volledig worden uitgevoerd.");
      }
      const guard = buildPermanentDeleteGuard(company, deletionDependencies);
      if (!guard.allowed) {
        throw new Error("Dit bedrijf mag nog niet definitief verwijderd worden.");
      }
      await deleteCompanyDependencyRecords(deletionDependencies);
      return base44.entities.Company.delete(companyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-permanent-delete-guard", companyId] });
      setPermanentDeleteDialogOpen(false);
      navigate("/Companies", { replace: true });
    },
  });

  const startEdit = () => {
    setForm(editableCompanyForm(company));
    setEditing(true);
  };

  const cancelEdit = () => {
    if (isNewProfileFlow && isEmptyDraftCompany(form)) {
      deleteDraftCompanyMutation.mutate();
      return;
    }

    setEditing(false);
    setForm(null);
    if (shouldOpenInEditMode) {
      navigate(`/CompanyDetail?id=${companyId}`, { replace: true });
    }
  };

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  useEffect(() => {
    if (!company || !shouldOpenInEditMode || initializedRequestedEdit.current) return;

    setForm(editableCompanyForm(company, isNewProfileFlow));
    setEditing(true);
    initializedRequestedEdit.current = true;
  }, [company, isNewProfileFlow, shouldOpenInEditMode]);

  const handleAddressQuery = (val) => {
    set("street_name", val);
    if (addressTimeout.current) clearTimeout(addressTimeout.current);
    if (val.length >= 3) {
      addressTimeout.current = setTimeout(async () => {
        const { data } = await base44.functions.invoke("searchAddress", { query: val });
        setAddressSuggestions(data.suggestions || []);
        setShowAddressSugg(true);
      }, 300);
    } else setShowAddressSugg(false);
  };

  const selectAddress = (s) => {
    setForm(f => ({
      ...f,
      street_name: s.street_name || s.address,
      house_number: s.house_number || f.house_number,
      postal_code: s.postal_code || f.postal_code,
      city: s.city || f.city,
    }));
    setShowAddressSugg(false);
  };

  const uploadLogo = async (file) => {
    setUploadingLogo(true);
    try {
      const result = await uploadManagedFile({
        file,
        ownerType: "company",
        ownerId: companyId,
        companyId,
        ownerLabel: data.display_name || data.legal_name || "Bedrijf",
        domain: "branding",
        category: "company_logo",
        sourceEntity: "Company",
        sourceEntityId: companyId,
        sourceField: "logo_file_url",
        documentLabel: "Logo",
        isSensitive: false,
        folderSegments: ["branding", "logo"]
      });
      set("logo_file_url", result.file_url);
      set("logo_file_id", result.managed_file_id);
      set("logo_download_filename", result.download_filename);
      set("logo_logical_path", result.logical_path);
      await updateManagedFileSource(result.managed_file_id, { source_entity_id: companyId });
    } finally {
      setUploadingLogo(false);
    }
  };

  if (!company && companies.length > 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <p>Bedrijf niet gevonden.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/Companies")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Terug naar bedrijven
        </Button>
      </div>
    );
  }

  if (!company) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Laden...</div>;
  }

  const data = editing ? form : company;
  const isArchived = company.status === "archived";

  const address = [
    company.street_name && `${company.street_name} ${company.house_number || ""}${company.house_number_addition || ""}`.trim(),
    company.postal_code && company.city && `${company.postal_code} ${company.city}`,
    company.country !== "Nederland" ? company.country : null,
  ].filter(Boolean).join(", ");

  const caoName = caoConfigurations.find(c => c.id === company.default_cao_configuration_id);
  const holdingOptions = companies.filter(c => c.id !== companyId && c.company_role === "holding");

  return (
    <PageTransition>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/Companies")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Bedrijven
        </Button>
      </div>

      {/* Company card */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Top banner */}
        <div className="bg-muted/40 border-b border-border px-6 py-5 flex items-center gap-5">
          <div className="w-16 h-16 rounded-xl border border-border bg-white flex items-center justify-center overflow-hidden shrink-0 relative group">
            {data.logo_file_url
              ? <img src={data.logo_file_url} alt="logo" className="object-contain w-full h-full p-1" />
              : <Building2 className="w-8 h-8 text-muted-foreground/50" />
            }
            {editing && (
              <label className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer rounded-xl">
                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                <Upload className="w-5 h-5 text-white" />
              </label>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex flex-col gap-2 max-w-md">
                <div>
                  <span className="text-xs text-muted-foreground">Bedrijfsnaam</span>
                  <Input value={data.display_name || ""} onChange={e => set("display_name", e.target.value)} className="text-lg font-bold h-9 mt-0.5" placeholder="Bedrijfsnaam" />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Handelsnaam</span>
                  <Input value={data.legal_name || ""} onChange={e => set("legal_name", e.target.value)} className="text-sm h-8 mt-0.5" placeholder="Handelsnaam" />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-foreground">{company.display_name}</h1>
                  <Badge variant="outline" className="text-xs">{ROLE_LABELS[company.company_role] || company.company_role}</Badge>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[company.status] || ""}`}>
                    {company.status === "active" ? "Actief" : company.status === "inactive" ? "Inactief" : "Gearchiveerd"}
                  </span>
                  {company.teamhub_enabled && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Handshake className="h-3 w-3" /> Teamhub
                    </Badge>
                  )}
                </div>
                {company.legal_name && company.legal_name !== company.display_name && (
                  <p className="text-sm text-muted-foreground mt-0.5">Handelsnaam: {company.legal_name}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={cancelEdit} disabled={deleteDraftCompanyMutation.isPending}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
                <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                  <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : "Opslaan"}
                </Button>
              </>
            ) : (
              <>
                <Button onClick={startEdit} variant="outline">
                  <Edit className="w-4 h-4 mr-1" /> Wijzigen
                </Button>
                {isArchived ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => restoreCompanyMutation.mutate()}
                      disabled={restoreCompanyMutation.isPending}
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      {restoreCompanyMutation.isPending ? "Herstellen..." : "Herstellen"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setPermanentDeleteDialogOpen(true)}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Definitief verwijderen
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setArchiveDialogOpen(true)}
                  >
                    <Archive className="w-4 h-4 mr-1" /> Verplaatsen naar archief
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">

          {/* Juridisch */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Juridische gegevens</h3>
            <InfoRow label="KvK-nummer">
              {editing ? <Input value={data.kvk_number || ""} onChange={e => set("kvk_number", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.kvk_number} />}
            </InfoRow>
            <InfoRow label="RSIN">
              {editing ? <Input value={data.rsin || ""} onChange={e => set("rsin", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.rsin} />}
            </InfoRow>
            <InfoRow label="BTW-nummer">
              {editing ? <Input value={data.btw_number || ""} onChange={e => set("btw_number", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.btw_number} />}
            </InfoRow>
            <InfoRow label="Rechtsvorm">
              {editing
                ? <Select value={data.legal_form || ""} onValueChange={v => set("legal_form", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Kies..." /></SelectTrigger>
                    <SelectContent>{LEGAL_FORMS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                : <ViewText value={data.legal_form} />}
            </InfoRow>
            <InfoRow label="Rol">
              {editing
                ? <Select value={data.company_role || "operating_company"} onValueChange={v => set("company_role", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holding">Holding</SelectItem>
                      <SelectItem value="operating_company">Werkmaatschappij</SelectItem>
                      <SelectItem value="sole_proprietor">Eenmanszaak</SelectItem>
                      <SelectItem value="other">Overig</SelectItem>
                    </SelectContent>
                  </Select>
                : <ViewText value={ROLE_LABELS[data.company_role] || data.company_role} />}
            </InfoRow>
            {(holdingOptions.length > 0 || holdingCompany) && (
              <InfoRow label="Onder holding">
                {editing
                  ? <Select value={data.holding_company_id || "none"} onValueChange={v => set("holding_company_id", v === "none" ? null : v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Geen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Geen</SelectItem>
                        {holdingOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  : <ViewText value={holdingCompany?.display_name} />}
              </InfoRow>
            )}
          </div>

          {/* Contact & Adres */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact & Adres</h3>
            <InfoRow label="Straatnaam">
              {editing
                ? <div className="relative">
                    <Input value={data.street_name || ""} onChange={e => handleAddressQuery(e.target.value)} className="h-8 text-sm" autoComplete="off" />
                    {showAddressSugg && addressSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {addressSuggestions.map((s, i) => (
                          <button key={i} type="button" onClick={() => selectAddress(s)} className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex gap-2 text-foreground">
                            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />{s.address}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                : <ViewText value={data.street_name} />}
            </InfoRow>
            <InfoRow label="Huisnummer">
              {editing
                ? <div className="flex gap-2">
                    <Input value={data.house_number || ""} onChange={e => set("house_number", e.target.value)} className="h-8 text-sm w-24" placeholder="Nr." />
                    <Input value={data.house_number_addition || ""} onChange={e => set("house_number_addition", e.target.value)} className="h-8 text-sm w-20" placeholder="Toev." />
                  </div>
                : <ViewText value={[data.house_number, data.house_number_addition].filter(Boolean).join(" ")} />}
            </InfoRow>
            <InfoRow label="Postcode">
              {editing ? <Input value={data.postal_code || ""} onChange={e => set("postal_code", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.postal_code} />}
            </InfoRow>
            <InfoRow label="Plaats">
              {editing ? <Input value={data.city || ""} onChange={e => set("city", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.city} />}
            </InfoRow>
            <InfoRow label="Land">
              {editing ? <Input value={data.country || "Nederland"} onChange={e => set("country", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.country} />}
            </InfoRow>
            <InfoRow label="Telefoon">
              {editing ? <Input value={data.phone || ""} onChange={e => set("phone", e.target.value)} className="h-8 text-sm" /> : <ViewText value={data.phone} />}
            </InfoRow>
            <InfoRow label="E-mail">
              {editing
                ? <Input type="email" value={data.email || ""} onChange={e => set("email", e.target.value)} className="h-8 text-sm" />
                : data.email ? <a href={`mailto:${data.email}`} className="text-sm text-foreground font-medium hover:underline">{data.email}</a> : <ViewText value={null} />}
            </InfoRow>
            <InfoRow label="Website">
              {editing
                ? <Input value={data.website || ""} onChange={e => set("website", e.target.value)} className="h-8 text-sm" placeholder="https://" />
                : data.website ? <a href={data.website} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground font-medium hover:underline">{data.website}</a> : <ViewText value={null} />}
            </InfoRow>
          </div>

        </div>

        {/* Save bar at bottom when editing */}
        {editing && (
          <div className="border-t border-border bg-muted/30 px-6 py-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={deleteDraftCompanyMutation.isPending}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
            <Button size="sm" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
              <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : "Wijzigingen opslaan"}
            </Button>
          </div>
        )}
      </div>

      {/* WPBR & CAO sectie met sidebar-menu */}
      <SidebarPanel
        companyId={companyId}
        companies={companies}
        company={company}
      />

      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <AlertDialogTitle>Bedrijf naar archief verplaatsen?</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Dit bedrijf wordt niet definitief verwijderd. Het profiel gaat naar het archief en blijft gekoppeld aan bestaande medewerkers, klanten, contracten, documenten en historie. LOQ Teamhub wordt direct uitgeschakeld zodat het bedrijf niet meer zichtbaar is voor nieuwe aanvragen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
            Gebruik dit alleen wanneer het bedrijf niet meer actief gebruikt mag worden. Je kunt het bedrijf later openen vanuit de bedrijvenlijst en weer herstellen.
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveCompanyMutation.isPending}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={archiveCompanyMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                archiveCompanyMutation.mutate();
              }}
            >
              {archiveCompanyMutation.isPending ? "Archiveren..." : "Naar archief"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={permanentDeleteDialogOpen} onOpenChange={setPermanentDeleteDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <div className="mb-1 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              <AlertDialogTitle>Bedrijf definitief verwijderen?</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              Definitief verwijderen kan alleen vanuit het archief. De app controleert eerst of er actieve koppelingen zijn en of gekoppelde administratie, planning, documenten of logs jonger zijn dan {PERMANENT_DELETE_RETENTION_LABEL}. Een leeg archiefbedrijf kan direct worden verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deletionGuardHasError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              De controle op gekoppelde records kon niet worden uitgevoerd. Definitief verwijderen blijft daarom geblokkeerd. Reden: {deleteGuardErrorMessage(deletionGuardError)}
            </div>
          ) : deletionGuardChecking ? (
            <DeleteGuardLoadingState />
          ) : permanentDeleteGuard.allowed ? (
            <>
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900/70 dark:bg-green-950/30 dark:text-green-100">
                Er zijn geen actieve of bewaarplichtige koppelingen gevonden. Definitief verwijderen kan worden uitgevoerd.
              </div>
              {permanentDeleteGuard.warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-medium">Niet-blokkerende waarschuwingen</p>
                  <ul className="mt-2 space-y-1">
                    {permanentDeleteGuard.warnings.map((warning, index) => (
                      <li key={`${warning.title}-${index}`}>
                        <span className="font-medium">{warning.title}:</span> {warning.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium">Definitief verwijderen is geblokkeerd.</p>
              <ul className="mt-2 space-y-1">
                {permanentDeleteGuard.blockers.slice(0, 8).map((blocker, index) => (
                  <li key={`${blocker.title}-${index}`}>
                    <span className="font-medium">{blocker.title}:</span> {blocker.detail}
                  </li>
                ))}
              </ul>
              {permanentDeleteGuard.blockers.length > 8 && (
                <p className="mt-2 text-xs">
                  Nog {permanentDeleteGuard.blockers.length - 8} extra blokkade(s) gevonden.
                </p>
              )}
            </div>
          )}

          {permanentDeleteCompanyMutation.isError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {permanentDeleteCompanyMutation.error?.message || "Definitief verwijderen is niet gelukt."}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={permanentDeleteCompanyMutation.isPending}>Sluiten</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={deletionGuardHasError || deletionGuardChecking || !permanentDeleteGuard.allowed || permanentDeleteCompanyMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                permanentDeleteCompanyMutation.mutate();
              }}
            >
              {permanentDeleteCompanyMutation.isPending ? "Verwijderen..." : "Definitief verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}
