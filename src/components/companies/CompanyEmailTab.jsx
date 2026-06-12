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
  Check,
  ChevronLeft,
  ChevronRight,
  Edit,
  ExternalLink,
  Mail,
  Plus,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";

const PROVIDERS = [
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
    desc: "Gebruik SMTP-gegevens van de mailprovider",
    authLabel: "SMTP",
    scopes: [],
  },
  {
    key: "platform",
    label: "Later instellen",
    shortLabel: "Later instellen",
    desc: "Nog geen mailbox koppelen",
    authLabel: "Niet gekoppeld",
    scopes: [],
  },
];

const PROVIDER_CARDS = PROVIDERS.filter(provider => provider.key !== "platform");

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
  if (provider === "microsoft_365" || provider === "google_workspace") return "pending_oauth";
  if (provider === "smtp" || provider === "other") return "action_required";
  return "draft";
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
  const email = form.from_email?.trim() || null;
  const domain = getEmailDomain(email);

  return {
    company_id: companyId,
    provider: providerKey,
    status: form.status || getStatusForProvider(providerKey),
    from_name: form.from_name?.trim() || null,
    from_email: email,
    reply_to_email: email,
    bcc_email: null,
    use_for_invoices: false,
    use_for_operational_mail: false,
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

function getConnectionSummary(settings) {
  if (!settings) return "Nog niet ingesteld";
  if (settings.provider === "platform") return "Nog niet gekoppeld";
  if (isSmtpProvider(settings.provider)) {
    return [settings.smtp_host, settings.smtp_port].filter(Boolean).join(":") || "SMTP niet volledig";
  }
  return settings.oauth_tenant_hint || getEmailDomain(settings.from_email) || "OAuth nog afronden";
}

const OAUTH_STORAGE_KEY = "loq_pending_email_oauth";

function encodeOAuthState(payload) {
  if (typeof window === "undefined") return "";
  const json = encodeURIComponent(JSON.stringify(payload)).replace(
    /%([0-9A-F]{2})/g,
    (_, value) => String.fromCharCode(parseInt(value, 16))
  );

  return window
    .btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getOAuthConfig(providerKey) {
  if (typeof window === "undefined") return null;

  const origin = window.location.origin;
  const defaultRedirectUri = `${origin}/email-oauth/callback`;
  const sharedRedirectUri = import.meta.env.VITE_EMAIL_OAUTH_REDIRECT_URI || defaultRedirectUri;

  if (providerKey === "microsoft_365") {
    return {
      clientId:
        import.meta.env.VITE_MICROSOFT_EMAIL_CLIENT_ID ||
        import.meta.env.VITE_MICROSOFT_CLIENT_ID ||
        "",
      authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      redirectUri: import.meta.env.VITE_MICROSOFT_EMAIL_REDIRECT_URI || sharedRedirectUri,
    };
  }

  if (providerKey === "google_workspace") {
    return {
      clientId:
        import.meta.env.VITE_GOOGLE_EMAIL_CLIENT_ID ||
        import.meta.env.VITE_GOOGLE_CLIENT_ID ||
        "",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      redirectUri: import.meta.env.VITE_GOOGLE_EMAIL_REDIRECT_URI || sharedRedirectUri,
    };
  }

  return null;
}

function buildOAuthUrl({ settings, providerKey, companyId }) {
  const provider = getProvider(providerKey);
  const config = getOAuthConfig(providerKey);

  if (!provider || !isOauthProvider(providerKey) || !config?.clientId) return null;

  const state = encodeOAuthState({
    company_id: companyId,
    settings_id: settings?.id || null,
    provider: providerKey,
    from_email: settings?.from_email || "",
    ts: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: provider.scopes.join(" "),
    state,
    prompt: "consent",
  });

  if (settings?.from_email) {
    params.set("login_hint", settings.from_email);
  }

  if (providerKey === "google_workspace") {
    params.set("access_type", "offline");
    params.set("include_granted_scopes", "true");
  }

  return `${config.authorizeUrl}?${params.toString()}`;
}

function WizardSteps({ step }) {
  const steps = ["Provider", "Gegevens", "Bevestigen"];

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
  if (providerKey === "microsoft_365") {
    return (
      <div className="grid h-11 w-11 grid-cols-2 gap-0.5">
        <span className="bg-[#f25022]" />
        <span className="bg-[#7fba00]" />
        <span className="bg-[#00a4ef]" />
        <span className="bg-[#ffb900]" />
      </div>
    );
  }

  if (providerKey === "google_workspace") {
    return (
      <div className="flex h-11 items-center text-3xl font-semibold tracking-normal">
        <span className="text-[#4285f4]">G</span>
        <span className="text-[#ea4335]">m</span>
        <span className="text-[#fbbc05]">a</span>
        <span className="text-[#4285f4]">i</span>
        <span className="text-[#34a853]">l</span>
      </div>
    );
  }

  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Mail className="h-7 w-7" />
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

export default function CompanyEmailTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => getInitialForm(company));
  const [step, setStep] = useState(1);
  const [showWizard, setShowWizard] = useState(false);
  const [errors, setErrors] = useState({});

  const { data: settingsList = [], isLoading } = useQuery({
    queryKey: ["company-email-settings", companyId],
    queryFn: () => base44.entities.CompanyEmailSettings.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const settings = settingsList[0] || null;
  const savedProvider = settings ? getProvider(settings.provider) : null;
  const selectedProvider = form.provider ? getProvider(form.provider) : null;
  const displayStatus = settings?.status || "draft";

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
    mutationFn: async ({ data, connectAfterSave = false }) => {
      const payload = normalizePayload(data, companyId);
      const saved = settings?.id
        ? await base44.entities.CompanyEmailSettings.update(settings.id, payload)
        : await base44.entities.CompanyEmailSettings.create(payload);
      return { saved, connectAfterSave, providerKey: payload.provider };
    },
    onSuccess: ({ saved, connectAfterSave, providerKey }) => {
      if (saved) {
        queryClient.setQueryData(["company-email-settings", companyId], (old = []) => {
          const list = Array.isArray(old) ? old : [];
          return [saved, ...list.filter(item => item.id !== saved.id)];
        });
      }
      queryClient.invalidateQueries({ queryKey: ["company-email-settings", companyId] });

      if (connectAfterSave && saved) {
        const redirected = startOAuthRedirect(saved, providerKey);
        if (!redirected) return;
      }

      setShowWizard(false);
      setStep(1);
      setErrors({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyEmailSettings.delete(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData(["company-email-settings", companyId], (old = []) => {
        const list = Array.isArray(old) ? old : [];
        return list.filter(item => item.id !== id);
      });
      queryClient.invalidateQueries({ queryKey: ["company-email-settings", companyId] });
      setShowWizard(false);
      setStep(1);
      setErrors({});
      setForm(getInitialForm(company));
    },
  });

  function startOAuthRedirect(nextSettings, providerOverride) {
    const providerKey = providerOverride || nextSettings?.provider || form.provider;
    const redirectUrl = buildOAuthUrl({
      settings: nextSettings,
      providerKey,
      companyId,
    });

    if (!redirectUrl) {
      const providerName = providerKey === "google_workspace" ? "Google" : "Microsoft";
      setStep(3);
      setShowWizard(true);
      setErrors(current => ({
        ...current,
        oauth: `De ${providerName}-koppeling kan nog niet starten omdat de OAuth client-id in de app-configuratie ontbreekt.`,
      }));
      return false;
    }

    try {
      window.sessionStorage.setItem(
        OAUTH_STORAGE_KEY,
        JSON.stringify({
          company_id: companyId,
          settings_id: nextSettings?.id || null,
          provider: providerKey,
          from_email: nextSettings?.from_email || "",
          started_at: new Date().toISOString(),
        })
      );
    } catch {
      // De redirect mag doorgaan, ook als sessionStorage niet beschikbaar is.
    }

    window.location.assign(redirectUrl);
    return true;
  }

  const openWizard = (targetStep = 1) => {
    const nextForm = {
      ...getInitialForm(company),
      ...(settings || {}),
      company_id: companyId,
      oauth_scopes: settings?.oauth_scopes?.length
        ? settings.oauth_scopes
        : getProvider(settings?.provider || "microsoft_365").scopes,
    };
    if (!settings) {
      nextForm.provider = "";
      nextForm.status = "draft";
    }
    setForm(nextForm);
    setStep(targetStep);
    setErrors({});
    setShowWizard(true);
  };

  const closeWizard = () => {
    setShowWizard(false);
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

  const validateProviderStep = () => {
    if (form.provider) return true;
    setErrors({ provider: "Kies eerst een e-mailservice" });
    return false;
  };

  const validateDetailsStep = () => {
    const nextErrors = {};
    if (!form.provider) nextErrors.provider = "Kies eerst een e-mailservice";
    if (form.provider !== "platform") {
      if (!form.from_name?.trim()) nextErrors.from_name = "Vul een afzendernaam in";
      if (!isValidEmail(form.from_email)) nextErrors.from_email = "Vul een geldig e-mailadres in";
    }
    if (isSmtpProvider(form.provider)) {
      if (!form.smtp_host?.trim()) nextErrors.smtp_host = "Vul de SMTP-server in";
      const port = Number(form.smtp_port);
      if (!port || port < 1 || port > 65535) nextErrors.smtp_port = "Vul een geldige poort in";
      if (!form.smtp_username?.trim()) nextErrors.smtp_username = "Vul de SMTP-gebruikersnaam in";
      if (!form.smtp_secret_reference?.trim()) nextErrors.smtp_secret_reference = "Vul de secret-referentie in";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const save = ({ connectAfterSave = false } = {}) => {
    const email = form.from_email?.trim() || "";
    const payload = {
      ...form,
      status: getStatusForProvider(form.provider),
      reply_to_email: email || null,
      bcc_email: null,
      use_for_invoices: false,
      use_for_operational_mail: false,
      save_to_sent_items: form.provider !== "platform",
      require_manual_review_before_send: false,
      signature_text: null,
      invoice_subject_prefix: null,
      oauth_tenant_hint: isOauthProvider(form.provider) ? form.oauth_tenant_hint || getEmailDomain(email) : null,
      oauth_account_id: isOauthProvider(form.provider) ? form.oauth_account_id || email : null,
    };
    setForm(payload);
    saveMutation.mutate({ data: payload, connectAfterSave });
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
    startOAuthRedirect(settings, settings.provider);
  };

  const deleteSettings = () => {
    if (!settings?.id || deleteMutation.isPending) return;
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Weet je zeker dat je deze e-mailinstelling wilt verwijderen?");
    if (!confirmed) return;
    deleteMutation.mutate(settings.id);
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">E-mailinstellingen laden...</div>;
  }

  const providerActionLabel = form.provider
    ? isOauthProvider(form.provider)
      ? "Account koppelen"
      : "SMTP instellen"
    : "Account koppelen";

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
                  {settings ? <Edit className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                  {settings ? "Wijzigen" : "Toevoegen"}
                </>
              )}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">E-mail</th>
                  <th className="px-4 py-3 text-left font-semibold">Authenticatie</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Afzendernaam</th>
                  <th className="px-4 py-3 text-right font-semibold">Actie</th>
                </tr>
              </thead>
              <tbody>
                {settings ? (
                  <tr className="border-t border-border">
                    <td className="px-4 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{settings.from_email || "Geen e-mailadres"}</p>
                          <p className="truncate text-xs text-muted-foreground">{getConnectionSummary(settings)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{savedProvider?.authLabel || "-"}</td>
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
                          onClick={deleteSettings}
                          disabled={deleteMutation.isPending}
                          className="text-destructive hover:text-destructive"
                          aria-label="E-mailinstelling verwijderen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr className="border-t border-border">
                    <td colSpan={5} className="px-4 py-8 text-center">
                      <Mail className="mx-auto h-6 w-6 text-muted-foreground" />
                      <p className="mt-2 text-sm font-medium text-foreground">Nog geen e-mailadres gekoppeld.</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Voeg een zakelijk mailadres toe om later rapportages, facturen en meldingen vanuit het eigen domein te verzenden.
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

          {showWizard && (
            <div className="border-t border-primary/30 bg-muted/20">
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
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Van welke e-mailservice maak je gebruik?</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Kies de provider. Voor Microsoft en Google loopt de koppeling via een veilige inlogmachtiging.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {PROVIDER_CARDS.map(provider => (
                    <ProviderCard
                      key={provider.key}
                      provider={provider}
                      selected={form.provider === provider.key || (form.provider === "other" && provider.key === "smtp")}
                      onSelect={(providerKey) => { set("provider", providerKey); setErrors(current => ({ ...current, provider: undefined })); }}
                    />
                  ))}
                </div>
                {errors.provider && (
                  <p className="text-xs text-destructive">{errors.provider}</p>
                )}
              </div>
            )}

            {step === 2 && selectedProvider && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {isOauthProvider(form.provider) ? "Account koppelen" : "SMTP-gegevens instellen"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isOauthProvider(form.provider)
                      ? "Vul het afzendadres in. Na opslaan staat de koppeling klaar om via de provider te worden gemachtigd."
                      : "Vul de afzender en de verzendserver van de mailprovider in."}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Afzendernaam</Label>
                    <Input
                      value={form.from_name || ""}
                      onChange={(event) => { set("from_name", event.target.value); setErrors(current => ({ ...current, from_name: undefined })); }}
                      placeholder={company?.display_name || "Bedrijfsnaam"}
                      className={errors.from_name ? "border-destructive" : ""}
                    />
                    {errors.from_name && <p className="text-xs text-destructive">{errors.from_name}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label>Zakelijk e-mailadres</Label>
                    <Input
                      type="email"
                      value={form.from_email || ""}
                      onChange={(event) => { set("from_email", event.target.value); setErrors(current => ({ ...current, from_email: undefined })); }}
                      placeholder="no-reply@bedrijf.nl"
                      className={errors.from_email ? "border-destructive" : ""}
                    />
                    {errors.from_email && <p className="text-xs text-destructive">{errors.from_email}</p>}
                  </div>
                </div>

                {isOauthProvider(form.provider) && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0 space-y-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{selectedProvider.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            LOQ vraagt alleen toestemming om namens dit e-mailadres uitgaande mail te verzenden. Het wachtwoord wordt niet opgeslagen.
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
                        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                          Domein: <span className="font-medium text-foreground">{getEmailDomain(form.from_email) || "wordt afgeleid uit het e-mailadres"}</span>
                        </div>
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
                  <p className="text-sm font-semibold text-foreground">Controleer de instelling</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sla deze instelling op. Daarna staat het e-mailadres als uitgaande mailbox in het bedrijfsprofiel.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card divide-y divide-border">
                  <SummaryRow label="E-mailservice" value={selectedProvider.label} />
                  <SummaryRow label="Authenticatie" value={selectedProvider.authLabel} />
                  <SummaryRow label="Status na opslaan" value={STATUS_LABELS[getStatusForProvider(form.provider)] || getStatusForProvider(form.provider)} />
                  <SummaryRow label="Afzendernaam" value={form.from_name} />
                  <SummaryRow label="E-mailadres" value={form.from_email} />
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
                {isOauthProvider(form.provider) && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      Na opslaan opent LOQ de beveiligde Microsoft- of Google-login om de machtiging af te ronden.
                    </p>
                  </div>
                )}
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
            {step === 1 && (
              <>
                <Button variant="outline" onClick={closeWizard}>Annuleren</Button>
                <Button onClick={() => { if (validateProviderStep()) setStep(2); }} disabled={!form.provider}>
                  {providerActionLabel}
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              </>
            )}
            {step === 2 && (
              <>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ChevronLeft className="mr-1.5 h-4 w-4" />
                  Terug
                </Button>
                <Button onClick={() => { if (validateDetailsStep()) setStep(3); }}>
                  Volgende
                  <ChevronRight className="ml-1.5 h-4 w-4" />
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
                  onClick={() => save({ connectAfterSave: isOauthProvider(form.provider) })}
                  disabled={saveMutation.isPending}
                >
                  {isOauthProvider(form.provider) ? (
                    <ExternalLink className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Check className="mr-1.5 h-4 w-4" />
                  )}
                  {saveMutation.isPending
                    ? "Opslaan..."
                    : isOauthProvider(form.provider)
                      ? "Opslaan en account koppelen"
                      : "Opslaan"}
                </Button>
              </>
            )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
