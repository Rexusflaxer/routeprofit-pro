import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit,
  ExternalLink,
  Loader2,
  Mail,
  PauseCircle,
  Plus,
  Send,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

const PROVIDERS = [
  {
    key: "platform",
    label: "LOQ standaardmail",
    shortLabel: "LOQ",
    desc: "Gebruik LOQ-verzending wanneer er geen eigen mailbox is gekoppeld",
    authLabel: "LOQ Mail Service",
    scopes: [],
  },
  {
    key: "microsoft_365",
    label: "Office 365 (Microsoft)",
    shortLabel: "Microsoft 365",
    desc: "Koppel veilig met een Microsoft-account",
    authLabel: "OAuth - Microsoft",
    scopes: ["openid", "profile", "offline_access", "User.Read", "Mail.Send"],
  },
  {
    key: "google_workspace",
    label: "Google Workspace",
    shortLabel: "Google Workspace",
    desc: "Koppel veilig met een Google-account",
    authLabel: "OAuth - Google",
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.send"],
  },
  {
    key: "smtp",
    label: "Overige",
    shortLabel: "Overige",
    desc: "Gebruik een SMTP-relay of mailprovider buiten Microsoft/Google",
    authLabel: "SMTP",
    scopes: [],
  },
];

const PROVIDER_CARDS = PROVIDERS;

const LEGACY_OTHER_PROVIDER = {
  key: "other",
  label: "Overige",
  shortLabel: "Overige",
  desc: "Gebruik SMTP-gegevens van de mailprovider",
  authLabel: "SMTP",
  scopes: [],
};

const STATUS_LABELS = {
  draft: "Nog niet gekoppeld",
  pending_oauth: "Klaar voor koppeling",
  connected: "Verbonden",
  action_required: "Actie nodig",
  disabled: "Uitgeschakeld",
};

const STATUS_CLASSES = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  pending_oauth: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  connected: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  action_required: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  disabled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300",
};

const DELETE_PASSWORD = "verwijder";

const MAIL_CHANNELS = [
  {
    key: "invoices",
    label: "Facturen",
    description: "Facturen, betalingsherinneringen en financiele e-mails",
    enabledField: "use_for_invoices",
  },
  {
    key: "reports",
    label: "Rapportages",
    description: "Rapportages en formulieren naar klanten",
    enabledField: "use_for_reports",
  },
  {
    key: "operational",
    label: "Operationeel",
    description: "Planning, uitvoering en operationele meldingen",
    enabledField: "use_for_operational_mail",
  },
];

function getProvider(key) {
  if (key === "other") return LEGACY_OTHER_PROVIDER;
  return PROVIDERS.find(provider => provider.key === key) || PROVIDERS[0];
}

function getInitialForm(company) {
  return {
    company_id: company?.id || "",
    provider: "",
    status: "draft",
    from_name: company?.display_name || company?.legal_name || "",
    from_email: company?.email || "",
    reply_to_email: company?.email || "",
    bcc_email: "",
    use_for_invoices: false,
    use_for_operational_mail: false,
    use_for_reports: false,
    channel_delivery_status: {},
    delivery_hold_reason: "",
    action_required_reason: "",
    save_to_sent_items: true,
    require_manual_review_before_send: false,
    signature_text: "",
    invoice_subject_prefix: "",
    oauth_tenant_hint: "",
    oauth_account_id: "",
    oauth_scopes: getProvider("microsoft_365").scopes,
    token_secret_reference: "",
    smtp_host: "",
    smtp_port: 587,
    smtp_security: "starttls",
    smtp_username: "",
    smtp_secret_reference: "",
    connected_at: null,
    last_checked_at: null,
    last_send_test_at: null,
    last_error: "",
    notes: "",
  };
}

function getStatusForProvider(provider) {
  if (provider === "platform") return "connected";
  if (provider === "microsoft_365" || provider === "google_workspace") return "pending_oauth";
  if (provider === "smtp" || provider === "other") return "action_required";
  return "draft";
}

function getChannelHoldReason(status, providerKey) {
  if (status === "connected") return null;
  if (providerKey === "platform") return "Er is geen zakelijk e-mailadres ingesteld.";
  if (isOauthProvider(providerKey)) return "Rond de Microsoft- of Google-koppeling af voordat dit kanaal kan verzenden.";
  if (isSmtpProvider(providerKey)) return "Rond de SMTP-configuratie af voordat dit kanaal kan verzenden.";
  return "Deze verzendfunctie is nog niet klaar voor gebruik.";
}

function getConfiguredChannels(settings) {
  if (!settings) return [];
  const deliveryStatus = settings.channel_delivery_status || {};

  return MAIL_CHANNELS.filter(channel =>
    Boolean(settings[channel.enabledField] || deliveryStatus[channel.key]?.enabled)
  );
}

function getHeldChannels(settings) {
  if (!settings) return [];
  const deliveryStatus = settings.channel_delivery_status || {};

  return getConfiguredChannels(settings).filter(channel =>
    settings.status === "action_required" ||
    deliveryStatus[channel.key]?.status === "hold"
  );
}

function hasEmailAction(settings) {
  return settings?.status === "action_required" || getHeldChannels(settings).length > 0;
}

function buildChannelDeliveryStatus(form, nextStatus) {
  const existingStatus = form.channel_delivery_status || {};
  const providerKey = form.provider || "platform";
  const holdReason = getChannelHoldReason(nextStatus, providerKey);

  return MAIL_CHANNELS.reduce((result, channel) => {
    const existing = existingStatus[channel.key] || {};
    const enabled = Boolean(form[channel.enabledField] || existing.enabled);
    if (!enabled) return result;

    result[channel.key] = {
      ...existing,
      enabled: true,
      status: nextStatus === "connected" ? "ready" : "hold",
      hold_reason: nextStatus === "connected" ? null : holdReason,
      updated_at: new Date().toISOString(),
    };
    return result;
  }, {});
}

function buildDeletedMailHoldPayload(settings, companyId, impactedChannels) {
  const now = new Date().toISOString();
  const previousStatus = settings.channel_delivery_status || {};
  const channelDeliveryStatus = impactedChannels.reduce((result, channel) => {
    result[channel.key] = {
      ...(previousStatus[channel.key] || {}),
      enabled: true,
      status: "hold",
      hold_reason: "Het gekoppelde e-mailadres is verwijderd. Stel een nieuw e-mailadres in om verzending te hervatten.",
      previous_email: settings.from_email || null,
      blocked_at: now,
      updated_at: now,
    };
    return result;
  }, {});

  return {
    company_id: companyId,
    provider: "platform",
    status: "action_required",
    from_name: settings.from_name || null,
    from_email: null,
    reply_to_email: null,
    bcc_email: null,
    use_for_invoices: impactedChannels.some(channel => channel.enabledField === "use_for_invoices"),
    use_for_reports: impactedChannels.some(channel => channel.enabledField === "use_for_reports"),
    use_for_operational_mail: impactedChannels.some(channel => channel.enabledField === "use_for_operational_mail"),
    channel_delivery_status: channelDeliveryStatus,
    delivery_hold_reason: "Het gekoppelde e-mailadres is verwijderd.",
    action_required_reason: "Stel een nieuw zakelijk e-mailadres in om uitgaande verzending te hervatten.",
    save_to_sent_items: false,
    require_manual_review_before_send: false,
    signature_text: null,
    invoice_subject_prefix: null,
    oauth_tenant_hint: null,
    oauth_account_id: null,
    oauth_scopes: [],
    token_secret_reference: null,
    smtp_host: null,
    smtp_port: null,
    smtp_security: null,
    smtp_username: null,
    smtp_secret_reference: null,
    connected_at: null,
    last_checked_at: null,
    last_send_test_at: settings.last_send_test_at || null,
    last_error: "Uitgaande mail staat op hold omdat het mailadres is verwijderd.",
    notes: settings.notes || null,
  };
}

function isOauthProvider(provider) {
  return provider === "microsoft_365" || provider === "google_workspace";
}

function isSmtpProvider(provider) {
  return provider === "smtp" || provider === "other";
}

function getEmailDomain(email) {
  const value = String(email || "").trim();
  const [, domain] = value.split("@");
  return domain || "";
}

function normalizePayload(form, companyId) {
  const providerKey = form.provider || "platform";
  const provider = getProvider(providerKey);
  const isOauth = isOauthProvider(providerKey);
  const isSmtp = isSmtpProvider(providerKey);
  const formEmail = form.from_email?.trim() || null;
  const email = providerKey === "platform" ? null : formEmail;
  const domain = getEmailDomain(email);
  const status = form.status || getStatusForProvider(providerKey);
  const channelDeliveryStatus = buildChannelDeliveryStatus({ ...form, provider: providerKey }, status);
  const hasHeldChannels = Object.values(channelDeliveryStatus).some(channel => channel.status === "hold");

  return {
    company_id: companyId,
    provider: providerKey,
    status,
    from_name: form.from_name?.trim() || null,
    from_email: email,
    reply_to_email: providerKey === "platform"
      ? form.reply_to_email?.trim() || formEmail
      : email,
    bcc_email: null,
    use_for_invoices: Boolean(form.use_for_invoices),
    use_for_operational_mail: Boolean(form.use_for_operational_mail),
    use_for_reports: Boolean(form.use_for_reports),
    channel_delivery_status: channelDeliveryStatus,
    delivery_hold_reason: hasHeldChannels ? getChannelHoldReason(status, providerKey) : null,
    action_required_reason: status === "action_required" || hasHeldChannels
      ? "Rond de zakelijke e-mailkoppeling af om uitgaande verzending vrij te geven."
      : null,
    save_to_sent_items: providerKey !== "platform",
    require_manual_review_before_send: false,
    signature_text: null,
    invoice_subject_prefix: null,
    oauth_tenant_hint: isOauth ? form.oauth_tenant_hint?.trim() || domain || null : null,
    oauth_account_id: isOauth ? form.oauth_account_id?.trim() || email : null,
    oauth_scopes: isOauth ? provider.scopes || [] : [],
    token_secret_reference: form.token_secret_reference?.trim() || null,
    smtp_host: isSmtp ? form.smtp_host?.trim() || null : null,
    smtp_port: isSmtp ? Number(form.smtp_port) || null : null,
    smtp_security: isSmtp ? form.smtp_security || "starttls" : null,
    smtp_username: isSmtp ? form.smtp_username?.trim() || email : null,
    smtp_secret_reference: isSmtp ? form.smtp_secret_reference?.trim() || null : null,
    connected_at: form.connected_at || null,
    last_checked_at: form.last_checked_at || null,
    last_send_test_at: form.last_send_test_at || null,
    last_error: form.last_error?.trim() || null,
    notes: form.notes?.trim() || null,
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildTestMailPayload({ companyId, company, settings, recipient }) {
  const companyName = company?.display_name || company?.legal_name || "dit bedrijf";
  const senderLabel = settings?.provider === "platform"
    ? "LOQ standaardmail"
    : settings?.from_email || "de gekoppelde mailbox";
  const subject = `LOQ testmail - ${companyName}`;

  return {
    company_id: companyId,
    to: recipient,
    channel: "operational",
    subject,
    text: [
      `Dit is een testmail vanuit LOQ voor ${companyName}.`,
      "",
      `Afzender: ${senderLabel}`,
      "Als deze mail binnenkomt, werkt de uitgaande e-mailkoppeling.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h2 style="margin: 0 0 12px; font-size: 18px;">LOQ testmail</h2>
        <p>Dit is een testmail vanuit LOQ voor <strong>${escapeHtml(companyName)}</strong>.</p>
        <p style="margin: 16px 0; padding: 12px; border-radius: 8px; background: #f3f4f6;">
          Afzender: <strong>${escapeHtml(senderLabel)}</strong>
        </p>
        <p>Als deze mail binnenkomt, werkt de uitgaande e-mailkoppeling.</p>
      </div>
    `,
  };
}

function getConnectionSummary(settings) {
  if (!settings) return "Nog niet ingesteld";
  if (settings.provider === "platform") return "LOQ Mail Service";
  if (isSmtpProvider(settings.provider)) {
    return [settings.smtp_host, settings.smtp_port].filter(Boolean).join(":") || "SMTP niet volledig";
  }
  return settings.oauth_tenant_hint || getEmailDomain(settings.from_email) || "OAuth nog afronden";
}

const OAUTH_COMPLETED_STORAGE_KEY = "loq_email_oauth_completed";

function WizardSteps({ step }) {
  const steps = ["Provider", "Koppeling", "Afzender"];

  return (
    <div className="flex items-center gap-2">
      {steps.map((label, index) => {
        const number = index + 1;
        const isActive = number === step;
        const isDone = number < step;
        return (
          <React.Fragment key={label}>
            <div className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : isDone
                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                  : "text-muted-foreground"
            }`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                isActive
                  ? "bg-primary-foreground text-primary"
                  : isDone
                    ? "text-green-700 dark:text-green-300"
                    : "border border-muted-foreground/30 text-muted-foreground"
              }`}>
                {isDone ? <Check className="h-3 w-3" /> : number}
              </span>
              {label}
            </div>
            {index < steps.length - 1 && (
              <div className={`h-px flex-1 ${isDone ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-right text-sm font-medium text-foreground">{value || "-"}</span>
    </div>
  );
}

function ProviderVisual({ providerKey }) {
  if (providerKey === "platform") {
    return (
      <div className="flex h-9 w-12 items-center justify-center rounded-md border border-border bg-background px-1.5">
        <img src="/loq-logo-dark.png" alt="LOQ" className="h-4 w-auto object-contain dark:hidden" />
        <img src="/loq-logo-light.png" alt="LOQ" className="hidden h-4 w-auto object-contain dark:block" />
      </div>
    );
  }

  if (providerKey === "microsoft_365") {
    return (
      <div className="flex h-9 w-12 items-center justify-center rounded-md border border-border bg-background">
        <div className="grid h-5 w-5 grid-cols-2 gap-0.5">
          <span className="bg-[#f25022]" />
          <span className="bg-[#7fba00]" />
          <span className="bg-[#00a4ef]" />
          <span className="bg-[#ffb900]" />
        </div>
      </div>
    );
  }

  if (providerKey === "google_workspace") {
    return (
      <div className="flex h-9 w-12 items-center justify-center rounded-md border border-border bg-background">
        <div className="flex items-center text-2xl font-semibold leading-none tracking-normal">
          <span className="text-[#4285f4]">G</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-9 w-12 items-center justify-center rounded-md border border-border bg-background text-primary">
      <Mail className="h-5 w-5" />
    </div>
  );
}

function ProviderCard({ provider, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(provider.key)}
      className={`flex min-h-[142px] flex-col items-center justify-between rounded-lg border bg-card p-4 text-center transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${
        selected ? "border-primary ring-1 ring-primary" : "border-border"
      }`}
    >
      <div className="flex h-16 items-center justify-center">
        <ProviderVisual providerKey={provider.key} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{provider.label}</p>
        <p className="text-xs text-muted-foreground">{provider.desc}</p>
      </div>
      <span className={`mt-3 h-5 w-5 rounded-full border ${
        selected ? "border-primary bg-primary shadow-[inset_0_0_0_4px_hsl(var(--card))]" : "border-muted-foreground/50"
      }`} />
    </button>
  );
}

function ChannelBadges({ channels, muted = false }) {
  if (!channels.length) {
    return <span className="text-xs text-muted-foreground">Nog niet gekoppeld aan verzendfuncties</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {channels.map(channel => (
        <Badge
          key={channel.key}
          variant="outline"
          className={muted ? "text-muted-foreground" : "bg-muted text-foreground"}
        >
          {channel.label}
        </Badge>
      ))}
    </div>
  );
}

function DeleteEmailImpactBar({ emailSettings, impactedChannels, onConfirm, onCancel, isPending }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const hasImpact = impactedChannels.length > 0;

  const handleConfirm = () => {
    if (password !== DELETE_PASSWORD) {
      setError(`Typ "${DELETE_PASSWORD}" om te bevestigen`);
      return;
    }
    onConfirm();
  };

  return (
    <div className={`border-b p-4 ${hasImpact ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40" : "border-destructive/20 bg-destructive/5"}`}>
      <div className="mb-3 flex items-start gap-3">
        {hasImpact ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
        ) : (
          <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">E-mailinstelling verwijderen?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hasImpact ? (
              <>
                <strong>{emailSettings?.from_email || "Dit mailadres"}</strong> wordt gebruikt voor uitgaande functies. Als je doorgaat, worden deze functies op hold gezet en blijft de E-mailtab als actiepunt zichtbaar.
              </>
            ) : (
              <>
                <strong>{emailSettings?.from_email || "Dit mailadres"}</strong> wordt verwijderd. Er zijn nu geen verzendfuncties aan gekoppeld.
              </>
            )}
          </p>
          {hasImpact && (
            <div className="mt-2">
              <ChannelBadges channels={impactedChannels} />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-muted-foreground">
          Typ <strong className="font-mono text-foreground">{DELETE_PASSWORD}</strong> om te bevestigen:
        </label>
        <div className="flex flex-wrap gap-2">
          <Input
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError(""); }}
            placeholder={DELETE_PASSWORD}
            className={`h-8 max-w-[200px] font-mono text-sm ${error ? "border-destructive" : ""}`}
            onKeyDown={(event) => event.key === "Enter" && handleConfirm()}
            autoFocus
          />
          <Button variant={hasImpact ? "default" : "destructive"} size="sm" onClick={handleConfirm} disabled={isPending}>
            {hasImpact ? <PauseCircle className="mr-1.5 h-3.5 w-3.5" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
            {isPending ? "Verwerken..." : hasImpact ? "Verwijderen en op hold zetten" : "Verwijderen"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

export default function CompanyEmailTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => getInitialForm(company));
  const [step, setStep] = useState(1);
  const [showWizard, setShowWizard] = useState(false);
  const [errors, setErrors] = useState({});
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [testMailOpen, setTestMailOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testMailStatus, setTestMailStatus] = useState({ type: "idle", message: "" });

  const { data: settingsList = [], isLoading } = useQuery({
    queryKey: ["company-email-settings", companyId],
    queryFn: () => base44.entities.CompanyEmailSettings.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const settings = settingsList[0] || null;
  const savedProvider = settings ? getProvider(settings.provider) : null;
  const selectedProvider = form.provider ? getProvider(form.provider) : null;
  const displayStatus = settings?.status || "draft";
  const configuredChannels = getConfiguredChannels(settings);
  const heldChannels = getHeldChannels(settings);
  const emailNeedsAction = hasEmailAction(settings);

  useEffect(() => {
    if (!companyId) return;
    setForm({
      ...getInitialForm(company),
      ...(settings || {}),
      company_id: companyId,
      oauth_scopes: settings?.oauth_scopes?.length
        ? settings.oauth_scopes
        : getProvider(settings?.provider || "microsoft_365").scopes,
    });
    setErrors({});
  }, [company, companyId, settings]);

  useEffect(() => {
    setTestMailOpen(false);
    setTestRecipient("");
    setTestMailStatus({ type: "idle", message: "" });
  }, [companyId, settings?.id]);

  const set = (field, value) => {
    setForm(current => {
      const next = { ...current, [field]: value };
      if (field === "provider") {
        const provider = getProvider(value);
        next.oauth_scopes = provider.scopes;
        next.status = getStatusForProvider(value);
        if (!isSmtpProvider(value)) {
          next.smtp_host = "";
          next.smtp_username = "";
          next.smtp_secret_reference = "";
        }
        if (isSmtpProvider(value) && !next.smtp_username) {
          next.smtp_username = current.from_email || "";
        }
      }
      if (field === "from_email") {
        if (!current.reply_to_email || current.reply_to_email === current.from_email) {
          next.reply_to_email = value;
        }
        if (isOauthProvider(current.provider)) {
          next.oauth_tenant_hint = getEmailDomain(value);
          next.oauth_account_id = value;
        }
        if (isSmtpProvider(current.provider) && (!current.smtp_username || current.smtp_username === current.from_email)) {
          next.smtp_username = value;
        }
      }
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ data }) => {
      const payload = normalizePayload(data, companyId);
      const saved = settings?.id
        ? await base44.entities.CompanyEmailSettings.update(settings.id, payload)
        : await base44.entities.CompanyEmailSettings.create(payload);
      return { saved };
    },
    onSuccess: ({ saved }) => {
      if (saved) {
        queryClient.setQueryData(["company-email-settings", companyId], (old = []) => {
          const list = Array.isArray(old) ? old : [];
          return [saved, ...list.filter(item => item.id !== saved.id)];
        });
      }
      queryClient.invalidateQueries({ queryKey: ["company-email-settings", companyId] });

      setShowWizard(false);
      setStep(1);
      setErrors({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ item, impactedChannels }) => {
      if (impactedChannels.length > 0) {
        const saved = await base44.entities.CompanyEmailSettings.update(
          item.id,
          buildDeletedMailHoldPayload(item, companyId, impactedChannels)
        );
        return { mode: "hold", saved };
      }

      await base44.entities.CompanyEmailSettings.delete(item.id);
      return { mode: "delete", id: item.id };
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["company-email-settings", companyId], (old = []) => {
        const list = Array.isArray(old) ? old : [];
        if (result.mode === "hold" && result.saved) {
          return [result.saved, ...list.filter(item => item.id !== result.saved.id)];
        }
        return list.filter(item => item.id !== result.id);
      });
      queryClient.invalidateQueries({ queryKey: ["company-email-settings", companyId] });
      setShowWizard(false);
      setDeleteRequest(null);
      setStep(1);
      setErrors({});
      if (result.mode === "delete") {
        setForm(getInitialForm(company));
      }
    },
  });

  const testMailMutation = useMutation({
    mutationFn: async ({ recipient }) => {
      const payload = buildTestMailPayload({ companyId, company, settings, recipient });
      await base44.functions.invoke("sendCompanyEmail", payload);
      const now = new Date().toISOString();
      const saved = settings?.id
        ? await base44.entities.CompanyEmailSettings.update(settings.id, {
            last_send_test_at: now,
            last_checked_at: now,
            last_error: null,
          })
        : null;
      return { saved, recipient, sentAt: now };
    },
    onSuccess: ({ saved, recipient, sentAt }) => {
      if (saved) {
        queryClient.setQueryData(["company-email-settings", companyId], (old = []) => {
          const list = Array.isArray(old) ? old : [];
          return [saved, ...list.filter(item => item.id !== saved.id)];
        });
      }
      queryClient.invalidateQueries({ queryKey: ["company-email-settings", companyId] });
      setTestMailStatus({
        type: "success",
        message: `Testmail verzonden naar ${recipient} om ${formatDateTime(sentAt)}.`,
      });
      setTimeout(() => {
        setTestMailOpen(false);
        setTestMailStatus({ type: "idle", message: "" });
      }, 3500);
    },
    onError: (error) => {
      const message = error?.response?.data?.detail
        || error?.response?.data?.error
        || error?.message
        || "Testmail verzenden mislukt.";
      setTestMailStatus({ type: "error", message });
    },
  });

  async function startOAuthRedirect(providerOverride) {
    const providerKey = providerOverride || form.provider;
    try {
      setErrors(current => ({ ...current, oauth: undefined }));
      const redirectUri = `${window.location.origin}/email-oauth/callback`;
      const { data } = await base44.functions.invoke("startCompanyEmailOAuth", {
        company_id: companyId,
        provider: providerKey,
        redirect_uri: redirectUri,
      });
      if (!data?.authorize_url) {
        throw new Error("De provider gaf geen koppel-url terug.");
      }
      window.location.assign(data.authorize_url);
      return true;
    } catch (error) {
      setErrors(current => ({
        ...current,
        oauth: error?.response?.data?.error || error?.message || "De koppeling kan niet worden gestart.",
      }));
      return false;
    }
  }

  const openWizard = (targetStep = 1) => {
    const isProviderChoiceStep = targetStep === 1;
    const nextForm = {
      ...getInitialForm(company),
      ...(settings || {}),
      company_id: companyId,
      oauth_scopes: settings?.oauth_scopes?.length
        ? settings.oauth_scopes
        : getProvider(settings?.provider || "microsoft_365").scopes,
    };
    if (isProviderChoiceStep || !settings) {
      nextForm.provider = "";
      nextForm.status = "draft";
      nextForm.oauth_scopes = [];
    }
    setForm(nextForm);
    setStep(targetStep);
    setErrors({});
    setTestMailOpen(false);
    setTestMailStatus({ type: "idle", message: "" });
    setShowWizard(true);
  };

  const closeWizard = () => {
    setShowWizard(false);
    setDeleteRequest(null);
    setStep(1);
    setErrors({});
    setForm({
      ...getInitialForm(company),
      ...(settings || {}),
      company_id: companyId,
      oauth_scopes: settings?.oauth_scopes?.length
        ? settings.oauth_scopes
        : getProvider(settings?.provider || "microsoft_365").scopes,
    });
  };

  useEffect(() => {
    if (!settings || settings.status !== "connected" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("emailSetup") !== "sender") return;

    let shouldOpen = true;
    try {
      const completed = JSON.parse(window.sessionStorage.getItem(OAUTH_COMPLETED_STORAGE_KEY) || "{}");
      shouldOpen = !completed.company_id || completed.company_id === companyId;
      window.sessionStorage.removeItem(OAUTH_COMPLETED_STORAGE_KEY);
    } catch {
      shouldOpen = true;
    }

    if (!shouldOpen) return;
    openWizard(3);
    params.delete("emailSetup");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  }, [companyId, settings]);

  const validateProviderStep = () => {
    if (form.provider) return true;
    setErrors({ provider: "Kies eerst een e-mailservice" });
    return false;
  };

  const validateDetailsStep = () => {
    const nextErrors = {};
    if (!form.provider) nextErrors.provider = "Kies eerst een e-mailservice";
    if (isSmtpProvider(form.provider)) {
      if (!isValidEmail(form.from_email)) nextErrors.from_email = "Vul een geldig e-mailadres in";
      if (!form.smtp_host?.trim()) nextErrors.smtp_host = "Vul de SMTP-server in";
      const port = Number(form.smtp_port);
      if (!port || port < 1 || port > 65535) nextErrors.smtp_port = "Vul een geldige poort in";
      if (!form.smtp_username?.trim()) nextErrors.smtp_username = "Vul de SMTP-gebruikersnaam in";
      if (!form.smtp_secret_reference?.trim()) nextErrors.smtp_secret_reference = "Vul de secret-referentie in";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateSenderStep = () => {
    const nextErrors = {};
    if (form.provider !== "platform" && !form.from_email?.trim()) {
      nextErrors.from_email = "Rond eerst de koppeling af";
    }
    if (!form.from_name?.trim()) nextErrors.from_name = "Vul een afzendernaam in";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const save = () => {
    const email = form.from_email?.trim() || "";
    const nextStatus = settings?.status === "connected" && settings.provider === form.provider
      ? "connected"
      : getStatusForProvider(form.provider);
    const payload = {
      ...form,
      status: nextStatus,
      reply_to_email: email || null,
      bcc_email: null,
      use_for_invoices: Boolean(form.use_for_invoices),
      use_for_operational_mail: Boolean(form.use_for_operational_mail),
      use_for_reports: Boolean(form.use_for_reports),
      save_to_sent_items: form.provider !== "platform",
      require_manual_review_before_send: false,
      signature_text: null,
      invoice_subject_prefix: null,
      oauth_tenant_hint: isOauthProvider(form.provider) ? form.oauth_tenant_hint || getEmailDomain(email) : null,
      oauth_account_id: isOauthProvider(form.provider) ? form.oauth_account_id || email : null,
    };
    setForm(payload);
    saveMutation.mutate({ data: payload });
  };

  const connectExisting = () => {
    if (!settings) return;
    const nextForm = {
      ...getInitialForm(company),
      ...settings,
      company_id: companyId,
      oauth_scopes: settings.oauth_scopes?.length
        ? settings.oauth_scopes
        : getProvider(settings.provider || "microsoft_365").scopes,
    };
    setForm(nextForm);
    setErrors({});
    startOAuthRedirect(settings.provider);
  };

  const deleteSettings = () => {
    if (!settings?.id || deleteMutation.isPending) return;
    setShowWizard(false);
    setTestMailOpen(false);
    setTestMailStatus({ type: "idle", message: "" });
    setDeleteRequest({
      item: settings,
      impactedChannels: getConfiguredChannels(settings),
    });
  };

  const confirmDeleteSettings = () => {
    if (!deleteRequest?.item || deleteMutation.isPending) return;
    deleteMutation.mutate(deleteRequest);
  };

  const openTestMail = () => {
    if (!settings || settings.status !== "connected") return;
    setShowWizard(false);
    setDeleteRequest(null);
    setTestRecipient(company?.email || settings.from_email || "");
    setTestMailStatus({ type: "idle", message: "" });
    setTestMailOpen(true);
  };

  const closeTestMail = () => {
    setTestMailOpen(false);
    setTestMailStatus({ type: "idle", message: "" });
  };

  const sendTestMail = () => {
    const recipient = testRecipient.trim();
    if (!isValidEmail(recipient)) {
      setTestMailStatus({ type: "error", message: "Vul een geldig e-mailadres in." });
      return;
    }
    setTestMailStatus({ type: "idle", message: "" });
    testMailMutation.mutate({ recipient });
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">E-mailinstellingen laden...</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">Zakelijke e-mail</p>
              {settings && (
                <Badge className={STATUS_CLASSES[displayStatus] || STATUS_CLASSES.draft}>
                  {STATUS_LABELS[displayStatus] || displayStatus}
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              Laat de applicatie uitgaande mail verzenden vanuit het domein van dit bedrijf.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">E-mailadressen</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Beheer het adres waarmee LOQ namens dit bedrijf e-mails mag verzenden.
              </p>
            </div>
            <Button size="sm" variant={showWizard ? "outline" : "default"} onClick={() => showWizard ? closeWizard() : openWizard(1)}>
              {showWizard ? (
                "Sluiten"
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Toevoegen
                </>
              )}
            </Button>
          </div>

          {emailNeedsAction && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">Uitgaande mail staat op hold</p>
                  <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">
                    Stel een nieuw zakelijk e-mailadres in of rond de koppeling af voordat gekoppelde functies e-mail kunnen verzenden.
                  </p>
                  {heldChannels.length > 0 && (
                    <div className="mt-2">
                      <ChannelBadges channels={heldChannels} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {deleteRequest && (
            <DeleteEmailImpactBar
              emailSettings={deleteRequest.item}
              impactedChannels={deleteRequest.impactedChannels}
              onConfirm={confirmDeleteSettings}
              onCancel={() => setDeleteRequest(null)}
              isPending={deleteMutation.isPending}
            />
          )}

          {showWizard && (
            <div className="border-b border-primary/30 bg-muted/20">
              <div className="border-b border-border px-4 py-4 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {settings ? "E-mailadres wijzigen" : "Nieuw e-mailadres"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {settings ? "Wijzig de uitgaande mailbox voor dit bedrijf." : "Voeg een uitgaande mailbox toe voor dit bedrijf."}
                </p>
              </div>

              <div className="space-y-5 px-4 py-5 sm:px-6">
                <WizardSteps step={step} />

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Kies de e-mailservice</p>
                <div className="grid grid-cols-1 gap-2">
                  {PROVIDER_CARDS.map(provider => {
                    const isSelected = form.provider === provider.key || (form.provider === "other" && provider.key === "smtp");
                    return (
                      <button
                        key={provider.key}
                        type="button"
                        onClick={() => { set("provider", provider.key); setErrors(current => ({ ...current, provider: undefined })); setStep(2); }}
                        className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${
                          isSelected ? "border-primary bg-accent" : "border-border bg-card"
                        }`}
                      >
                        <div className="mr-3 flex h-10 w-16 shrink-0 items-center justify-center">
                          <ProviderVisual providerKey={provider.key} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-semibold text-foreground">{provider.label}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{provider.desc}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
                {errors.provider && <p className="text-xs text-destructive">{errors.provider}</p>}
                <div className="flex justify-end pt-1">
                  <Button variant="outline" size="sm" onClick={closeWizard}>Annuleren</Button>
                </div>
              </div>
            )}

            {step === 2 && selectedProvider && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {form.provider === "platform"
                      ? "LOQ standaardmail gebruiken"
                      : isOauthProvider(form.provider)
                        ? "Account koppelen"
                        : "SMTP-gegevens instellen"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.provider === "platform"
                      ? "LOQ gebruikt de standaard mailprovider wanneer er geen eigen mailbox is gekoppeld."
                      : isOauthProvider(form.provider)
                        ? "Je wordt doorgestuurd naar de provider. Het e-mailadres komt daarna automatisch terug uit de koppeling."
                        : "Vul de verzendserver van de mailprovider in. Voor overige providers is een SMTP-relay nodig."}
                  </p>
                </div>

                {form.provider === "platform" && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Fallback vanuit LOQ</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Facturen, rapportages en meldingen kunnen via de LOQ mailprovider worden verzonden.
                          Antwoorden gaan naar het e-mailadres van het bedrijf zodra dat bekend is.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {isOauthProvider(form.provider) && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0 space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{selectedProvider.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            LOQ vraagt alleen toestemming om namens de gekoppelde mailbox uitgaande mail te verzenden.
                            Het wachtwoord wordt niet opgeslagen.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                            <Check className="h-3.5 w-3.5 text-green-600" />
                            Basisprofiel bekijken
                          </div>
                          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                            <Check className="h-3.5 w-3.5 text-green-600" />
                            Toegang onderhouden
                          </div>
                          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
                            <Check className="h-3.5 w-3.5 text-green-600" />
                            E-mail verzenden
                          </div>
                        </div>
                        {errors.oauth && (
                          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <p>{errors.oauth}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {isSmtpProvider(form.provider) && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <Server className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">SMTP-server</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Gebruik de verzendserver van de provider. Het wachtwoord zelf hoort als beveiligde server-side secret te worden opgeslagen.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Zakelijk e-mailadres</Label>
                        <Input
                          type="email"
                          value={form.from_email || ""}
                          onChange={(event) => { set("from_email", event.target.value); setErrors(current => ({ ...current, from_email: undefined })); }}
                          placeholder="mailbox@bedrijf.nl"
                          className={errors.from_email ? "border-destructive" : ""}
                        />
                        {errors.from_email && <p className="text-xs text-destructive">{errors.from_email}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label>SMTP-server</Label>
                        <Input
                          value={form.smtp_host || ""}
                          onChange={(event) => { set("smtp_host", event.target.value); setErrors(current => ({ ...current, smtp_host: undefined })); }}
                          placeholder="smtp.provider.nl"
                          className={errors.smtp_host ? "border-destructive" : ""}
                        />
                        {errors.smtp_host && <p className="text-xs text-destructive">{errors.smtp_host}</p>}
                      </div>
                      <div className="grid grid-cols-[110px_1fr] gap-3">
                        <div className="space-y-1">
                          <Label>Poort</Label>
                          <Input
                            type="number"
                            value={form.smtp_port || ""}
                            onChange={(event) => { set("smtp_port", event.target.value); setErrors(current => ({ ...current, smtp_port: undefined })); }}
                            placeholder="587"
                            className={errors.smtp_port ? "border-destructive" : ""}
                          />
                          {errors.smtp_port && <p className="text-xs text-destructive">{errors.smtp_port}</p>}
                        </div>
                        <div className="space-y-1">
                          <Label>Beveiliging</Label>
                          <Select value={form.smtp_security || "starttls"} onValueChange={(value) => set("smtp_security", value)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="starttls">STARTTLS</SelectItem>
                              <SelectItem value="ssl_tls">SSL/TLS</SelectItem>
                              <SelectItem value="none">Geen</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>SMTP-gebruikersnaam</Label>
                        <Input
                          value={form.smtp_username || ""}
                          onChange={(event) => { set("smtp_username", event.target.value); setErrors(current => ({ ...current, smtp_username: undefined })); }}
                          placeholder={form.from_email || "mailbox@bedrijf.nl"}
                          className={errors.smtp_username ? "border-destructive" : ""}
                        />
                        {errors.smtp_username && <p className="text-xs text-destructive">{errors.smtp_username}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label>Secret-referentie</Label>
                        <Input
                          value={form.smtp_secret_reference || ""}
                          onChange={(event) => { set("smtp_secret_reference", event.target.value); setErrors(current => ({ ...current, smtp_secret_reference: undefined })); }}
                          placeholder="company-mail-smtp-password"
                          className={errors.smtp_secret_reference ? "border-destructive" : ""}
                        />
                        {errors.smtp_secret_reference && <p className="text-xs text-destructive">{errors.smtp_secret_reference}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && selectedProvider && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Afzendernaam</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Kies de naam die ontvangers bij uitgaande e-mails zien.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Afzendernaam</Label>
                    <Input
                      value={form.from_name || ""}
                      onChange={(event) => { set("from_name", event.target.value); setErrors(current => ({ ...current, from_name: undefined })); }}
                      placeholder={company?.display_name || company?.legal_name || "Bedrijfsnaam"}
                      className={errors.from_name ? "border-destructive" : ""}
                    />
                    {errors.from_name && <p className="text-xs text-destructive">{errors.from_name}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label>Verzendadres</Label>
                    <div className="flex h-10 items-center rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
                      {form.provider === "platform"
                        ? "LOQ standaardmail"
                        : form.from_email || "Wordt ingesteld door de provider"}
                    </div>
                    {errors.from_email && <p className="text-xs text-destructive">{errors.from_email}</p>}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-card divide-y divide-border">
                  <SummaryRow label="E-mailservice" value={selectedProvider.label} />
                  <SummaryRow label="Authenticatie" value={selectedProvider.authLabel} />
                  <SummaryRow label="Status na opslaan" value={STATUS_LABELS[getStatusForProvider(form.provider)] || getStatusForProvider(form.provider)} />
                  <SummaryRow label="Afzendernaam" value={form.from_name} />
                  <SummaryRow label="E-mailadres" value={form.provider === "platform" ? "LOQ standaardmail" : form.from_email} />
                  {isOauthProvider(form.provider) && (
                    <>
                      <SummaryRow label="Domein" value={form.oauth_tenant_hint || getEmailDomain(form.from_email)} />
                      <SummaryRow label="Machtiging" value="E-mail verzenden als afzender" />
                    </>
                  )}
                  {isSmtpProvider(form.provider) && (
                    <>
                      <SummaryRow label="SMTP-server" value={`${form.smtp_host || "-"}:${form.smtp_port || "-"}`} />
                      <SummaryRow label="Beveiliging" value={form.smtp_security === "ssl_tls" ? "SSL/TLS" : form.smtp_security === "none" ? "Geen" : "STARTTLS"} />
                      <SummaryRow label="SMTP-gebruiker" value={form.smtp_username} />
                    </>
                  )}
                </div>
                {errors.oauth && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{errors.oauth}</p>
                  </div>
                )}
              </div>
            )}
          </div>

              <div className="flex items-center justify-between border-t border-border px-4 py-4 sm:px-6">
            {step === 1 && null}
            {step === 2 && (
              <>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ChevronLeft className="mr-1.5 h-4 w-4" />
                  Terug
                </Button>
                <Button
                  onClick={() => {
                    if (isOauthProvider(form.provider)) {
                      startOAuthRedirect(form.provider);
                      return;
                    }
                    if (validateDetailsStep()) setStep(3);
                  }}
                >
                  {isOauthProvider(form.provider) ? (
                    <ExternalLink className="mr-1.5 h-4 w-4" />
                  ) : null}
                  {isOauthProvider(form.provider) ? "Account koppelen" : "Volgende"}
                  {!isOauthProvider(form.provider) && <ChevronRight className="ml-1.5 h-4 w-4" />}
                </Button>
              </>
            )}
            {step === 3 && (
              <>
                <Button variant="ghost" onClick={() => setStep(2)}>
                  <ChevronLeft className="mr-1.5 h-4 w-4" />
                  Terug
                </Button>
                <Button
                  onClick={() => { if (validateSenderStep()) save(); }}
                  disabled={saveMutation.isPending}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  {saveMutation.isPending ? "Opslaan..." : "Opslaan"}
                </Button>
              </>
            )}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">E-mail</th>
                  <th className="px-4 py-3 text-left font-semibold">Authenticatie</th>
                  <th className="px-4 py-3 text-left font-semibold">Functies</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Afzendernaam</th>
                  <th className="px-4 py-3 text-right font-semibold">Actie</th>
                </tr>
              </thead>
              <tbody>
                {settings ? (
                  <>
                  <tr className={`border-t border-border ${testMailOpen && testMailStatus.type === "success" ? "bg-green-50 dark:bg-green-950/40" : testMailOpen ? "bg-primary/5" : ""}`}>
                     {testMailOpen ? (
                       <td colSpan={6} className="px-4 py-3">
                         {testMailStatus.type === "success" ? (
                           <div className="flex items-center gap-3">
                             <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                             <p className="text-sm font-medium text-green-800 dark:text-green-200">{testMailStatus.message}</p>
                           </div>
                         ) : (
                           <div className="flex flex-wrap items-center gap-2">
                             <span className="text-xs text-muted-foreground border border-border rounded px-2 py-1 bg-muted/40 shrink-0">
                               {settings.provider === "platform" ? "LOQ standaardmail" : settings.from_email || "-"}
                             </span>
                             <span className="text-sm font-medium text-foreground shrink-0">Testmail naar:</span>
                             <Input
                               type="email"
                               value={testRecipient}
                               onChange={(event) => {
                                 setTestRecipient(event.target.value);
                                 if (testMailStatus.type === "error") setTestMailStatus({ type: "idle", message: "" });
                               }}
                               onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); sendTestMail(); } }}
                               placeholder="naam@bedrijf.nl"
                               className="h-8 w-[260px]"
                               autoFocus
                             />
                             <Button size="sm" onClick={sendTestMail} disabled={testMailMutation.isPending}>
                               {testMailMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                               {testMailMutation.isPending ? "Verzenden..." : "Versturen"}
                             </Button>
                             <Button size="sm" variant="ghost" onClick={closeTestMail} disabled={testMailMutation.isPending}>
                               <X className="h-3.5 w-3.5" />
                             </Button>
                             {testMailStatus.type === "error" && testMailStatus.message && (
                               <span className="flex items-center gap-1 text-xs text-destructive">
                                 <AlertCircle className="h-3.5 w-3.5 shrink-0" />{testMailStatus.message}
                               </span>
                             )}
                           </div>
                         )}
                       </td>
                     ) : (
                       <>
                         <td className="px-4 py-4">
                           <div className="min-w-0">
                             <p className="truncate font-medium text-foreground">
                               {settings.provider === "platform" ? "LOQ standaardmail" : settings.from_email || "Geen e-mailadres"}
                             </p>
                             <p className="truncate text-xs text-muted-foreground">{getConnectionSummary(settings)}</p>
                           </div>
                         </td>
                         <td className="px-4 py-4 text-muted-foreground">{savedProvider?.authLabel || "-"}</td>
                         <td className="px-4 py-4">
                           <ChannelBadges channels={configuredChannels} muted={!configuredChannels.length} />
                         </td>
                         <td className="px-4 py-4">
                           <Badge className={STATUS_CLASSES[settings.status] || STATUS_CLASSES.draft}>
                             {STATUS_LABELS[settings.status] || settings.status}
                           </Badge>
                         </td>
                         <td className="px-4 py-4 text-muted-foreground">{settings.from_name || "-"}</td>
                         <td className="px-4 py-4 text-right">
                           <div className="flex justify-end gap-2">
                             {isOauthProvider(settings.provider) && settings.status === "pending_oauth" && (
                               <Button size="sm" variant="default" onClick={connectExisting}>
                                 <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                                 Account koppelen
                               </Button>
                             )}
                             <Button size="sm" variant="outline" onClick={() => openWizard(1)}>
                               <Edit className="mr-1.5 h-3.5 w-3.5" />
                               Wijzigen
                             </Button>
                             <Button
                               size="sm"
                               variant="outline"
                               onClick={openTestMail}
                               disabled={settings.status !== "connected" || testMailMutation.isPending}
                             >
                               <Send className="mr-1.5 h-3.5 w-3.5" />
                               Testmail
                             </Button>
                             <Button
                               size="sm"
                               variant="outline"
                               onClick={deleteSettings}
                               disabled={deleteMutation.isPending}
                               className="text-destructive hover:text-destructive"
                               aria-label="E-mailinstelling verwijderen"
                             >
                               <Trash2 className="h-3.5 w-3.5" />
                             </Button>
                           </div>
                         </td>
                       </>
                     )}
                   </tr>
                  </>
                ) : (
                  <tr className="border-t border-border">
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <Mail className="mx-auto h-6 w-6 text-muted-foreground" />
                      <p className="mt-2 text-sm font-medium text-foreground">Nog geen e-mailadres gekoppeld.</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        LOQ kan standaardmail gebruiken totdat dit bedrijf een eigen Microsoft-, Google- of overige mailbox koppelt.
                      </p>
                      {!showWizard && (
                        <Button size="sm" className="mt-3" onClick={() => openWizard(1)}>
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          E-mailadres toevoegen
                        </Button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>


        </div>
      </div>
    </div>
  );
}
