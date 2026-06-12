import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Edit, Mail, Server, ShieldCheck, X } from "lucide-react";

const PROVIDERS = [
  {
    key: "microsoft_365",
    label: "Outlook",
    desc: "Zakelijke Microsoft 365-mailbox",
    scopes: ["Mail.Send", "offline_access", "User.Read"],
  },
  {
    key: "google_workspace",
    label: "Gmail",
    desc: "Google Workspace of Gmail",
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
  },
  {
    key: "smtp",
    label: "Andere provider",
    desc: "Bijvoorbeeld eigen domeinprovider",
    scopes: [],
  },
  {
    key: "platform",
    label: "Later instellen",
    desc: "Nog geen mailbox koppelen",
    scopes: [],
  },
];

const LEGACY_OTHER_PROVIDER = {
  key: "other",
  label: "Andere provider",
  desc: "Bijvoorbeeld eigen domeinprovider",
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
    provider: "microsoft_365",
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

function normalizePayload(form, companyId) {
  const provider = getProvider(form.provider);
  const isSmtp = isSmtpProvider(form.provider);
  const email = form.from_email?.trim() || null;

  return {
    company_id: companyId,
    provider: form.provider,
    status: form.status || getStatusForProvider(form.provider),
    from_name: form.from_name?.trim() || null,
    from_email: email,
    reply_to_email: email,
    bcc_email: null,
    use_for_invoices: false,
    use_for_operational_mail: false,
    save_to_sent_items: form.provider !== "platform",
    require_manual_review_before_send: false,
    signature_text: null,
    invoice_subject_prefix: null,
    oauth_tenant_hint: form.oauth_tenant_hint?.trim() || null,
    oauth_account_id: form.oauth_account_id?.trim() || null,
    oauth_scopes: provider.scopes || [],
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

function WizardSteps({ step }) {
  const steps = ["Provider", "Afzender", "Koppeling", "Bevestigen"];
  const CheckIcon = () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );

  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((label, index) => (
        <React.Fragment key={label}>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
            index + 1 === step ? "bg-primary text-primary-foreground" :
            index + 1 < step ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" :
            "text-muted-foreground"
          }`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
              index + 1 === step ? "bg-primary-foreground text-primary" :
              index + 1 < step ? "text-green-700 dark:text-green-300" :
              "border border-muted-foreground/30 text-muted-foreground"
            }`}>
              {index + 1 < step ? <CheckIcon /> : index + 1}
            </span>
            {label}
          </div>
          {index < steps.length - 1 && <div className={`h-px flex-1 ${index + 1 < step ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function ProviderBadge({ providerKey }) {
  const provider = getProvider(providerKey);
  return <Badge variant="outline" className="text-xs">{provider.label}</Badge>;
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right truncate">{value || "—"}</span>
    </div>
  );
}

export default function CompanyEmailTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const wizardRef = useRef(null);
  const [form, setForm] = useState(() => getInitialForm(company));
  const [step, setStep] = useState(1);
  const [showWizard, setShowWizard] = useState(false);
  const [errors, setErrors] = useState({});
  const [didAutoOpen, setDidAutoOpen] = useState(false);

  const { data: settingsList = [], isLoading } = useQuery({
    queryKey: ["company-email-settings", companyId],
    queryFn: () => base44.entities.CompanyEmailSettings.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const settings = settingsList[0] || null;
  const provider = getProvider(form.provider);
  const status = form.status || "draft";

  useEffect(() => {
    setDidAutoOpen(false);
  }, [companyId]);

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
    if (isLoading || didAutoOpen) return;
    setShowWizard(!settings);
    setDidAutoOpen(true);
  }, [didAutoOpen, isLoading, settings]);

  useEffect(() => {
    if (!showWizard) return;
    const timer = setTimeout(() => {
      wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => clearTimeout(timer);
  }, [showWizard, step]);

  const set = (field, value) => {
    setForm(current => {
      const next = { ...current, [field]: value };
      if (field === "provider") {
        const selectedProvider = getProvider(value);
        next.oauth_scopes = selectedProvider.scopes;
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
      if (field === "from_email" && (!current.reply_to_email || current.reply_to_email === current.from_email)) {
        next.reply_to_email = value;
      }
      if (field === "from_email" && isSmtpProvider(current.provider) && (!current.smtp_username || current.smtp_username === current.from_email)) {
        next.smtp_username = value;
      }
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = normalizePayload(data, companyId);
      if (settings?.id) return base44.entities.CompanyEmailSettings.update(settings.id, payload);
      return base44.entities.CompanyEmailSettings.create(payload);
    },
    onSuccess: (saved) => {
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

  const validateAddressStep = () => {
    const nextErrors = {};
    if (form.provider !== "platform") {
      if (!form.from_name?.trim()) nextErrors.from_name = "Vul een afzendernaam in";
      if (!isValidEmail(form.from_email)) nextErrors.from_email = "Vul een geldig e-mailadres in";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateConnectionStep = () => {
    const nextErrors = {};
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

  const openWizard = () => {
    setStep(1);
    setErrors({});
    setShowWizard(true);
  };

  const cancelWizard = () => {
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

  const save = () => {
    const payload = {
      ...form,
      status: getStatusForProvider(form.provider),
      reply_to_email: form.from_email || null,
      bcc_email: null,
      use_for_invoices: false,
      use_for_operational_mail: false,
      save_to_sent_items: form.provider !== "platform",
      require_manual_review_before_send: false,
      signature_text: null,
      invoice_subject_prefix: null,
    };
    setForm(payload);
    saveMutation.mutate(payload);
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">E-mailinstellingen laden...</div>;
  }

  const connectionSummary = form.provider === "platform"
    ? "Nog niet gekoppeld"
    : isSmtpProvider(form.provider)
      ? [form.smtp_host, form.smtp_port].filter(Boolean).join(":") || "SMTP niet volledig"
      : form.oauth_tenant_hint || "OAuth nog afronden";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">Zakelijke e-mail</p>
              <Badge className={STATUS_CLASSES[status] || STATUS_CLASSES.draft}>
                {STATUS_LABELS[status] || status}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">Uitgaande mail verzenden vanuit het domein van dit bedrijf</p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showWizard && (
          <motion.div
            ref={wizardRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-none border-0 border-b border-primary/30 bg-muted/20 p-5 overflow-hidden"
          >
            <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">
              {settings ? "E-mailinstelling wijzigen" : "E-mail instellen"}
            </p>
            <WizardSteps step={step} />

            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {step === 1 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">Waarmee wil je zakelijke e-mail koppelen?</p>
                      <div className="grid grid-cols-1 gap-2">
                        {PROVIDERS.map(item => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => { set("provider", item.key); setStep(2); }}
                            className={`flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99] ${
                              form.provider === item.key ? "border-primary bg-accent" : "border-border bg-card"
                            }`}
                          >
                            <div>
                              <span className="text-sm font-semibold text-foreground">{item.label}</span>
                              <span className="text-xs text-muted-foreground ml-2">{item.desc}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-end pt-1">
                        <Button variant="ghost" size="sm" onClick={cancelWizard}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">
                        Afzender — <span className="text-muted-foreground font-normal">{provider.label}</span>
                      </p>
                      {form.provider === "platform" && (
                        <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <p>Je slaat hiermee alleen vast dat de mailbox later wordt gekoppeld. Afzendergegevens zijn dan nog optioneel.</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                            placeholder="facturen@bedrijf.nl"
                            className={errors.from_email ? "border-destructive" : ""}
                          />
                          {errors.from_email && <p className="text-xs text-destructive">{errors.from_email}</p>}
                        </div>
                      </div>
                      <div className="flex justify-between pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setStep(1)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                        <Button size="sm" onClick={() => { if (validateAddressStep()) setStep(3); }}>
                          Volgende <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {step === 3 && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Koppeling en verzenden</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Vul de gegevens in die nodig zijn om mail namens dit bedrijf te kunnen verzenden.</p>
                      </div>

                      {form.provider === "platform" && (
                        <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-3 text-sm text-muted-foreground">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <p>Er wordt nog geen mailbox gekoppeld. De instelling wordt als concept opgeslagen zodat je later Outlook, Gmail of SMTP kunt kiezen.</p>
                        </div>
                      )}

                      {isOauthProvider(form.provider) && (
                        <div className="rounded-lg border border-border bg-card p-3">
                          <div className="mb-3 flex items-start gap-2">
                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <div>
                              <p className="text-sm font-medium text-foreground">OAuth-koppeling</p>
                              <p className="text-xs text-muted-foreground">Deze provider vereist een veilige inlogkoppeling voordat er echt verzonden kan worden.</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label>{form.provider === "microsoft_365" ? "Tenant of domein" : "Workspace domein"}</Label>
                              <Input
                                value={form.oauth_tenant_hint || ""}
                                onChange={(event) => set("oauth_tenant_hint", event.target.value)}
                                placeholder={form.from_email?.split("@")[1] || "bedrijf.nl"}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Mailbox/account-id</Label>
                              <Input
                                value={form.oauth_account_id || ""}
                                onChange={(event) => set("oauth_account_id", event.target.value)}
                                placeholder={form.from_email || "Wordt na koppelen gevuld"}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {isSmtpProvider(form.provider) && (
                        <div className="rounded-lg border border-border bg-card p-3">
                          <div className="mb-3 flex items-start gap-2">
                            <Server className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <div>
                              <p className="text-sm font-medium text-foreground">SMTP-server</p>
                              <p className="text-xs text-muted-foreground">Gebruik de verzendserver van de mailprovider. Wachtwoorden worden als server-side secret-referentie opgeslagen.</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                      <div className="flex justify-between pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                        <Button size="sm" onClick={() => { if (validateConnectionStep()) setStep(4); }}>
                          Volgende <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {step === 4 && (
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-foreground">Controleer de instelling</p>
                      <div className="rounded-lg border border-border bg-card divide-y divide-border">
                        <SummaryRow label="Provider" value={provider.label} />
                        <SummaryRow label="Status na opslaan" value={STATUS_LABELS[getStatusForProvider(form.provider)] || getStatusForProvider(form.provider)} />
                        <SummaryRow label="Afzender" value={form.from_name} />
                        <SummaryRow label="Mailadres" value={form.from_email} />
                        {isOauthProvider(form.provider) && (
                          <>
                            <SummaryRow label="Domein/tenant" value={form.oauth_tenant_hint} />
                            <SummaryRow label="Scopes" value={(provider.scopes || []).join(", ")} />
                          </>
                        )}
                        {isSmtpProvider(form.provider) && (
                          <>
                            <SummaryRow label="SMTP-server" value={`${form.smtp_host || "-"}:${form.smtp_port || "-"}`} />
                            <SummaryRow label="Beveiliging" value={form.smtp_security === "ssl_tls" ? "SSL/TLS" : form.smtp_security === "none" ? "Geen" : "STARTTLS"} />
                            <SummaryRow label="SMTP-gebruiker" value={form.smtp_username} />
                            <SummaryRow label="Secret" value={form.smtp_secret_reference ? "Referentie ingevuld" : "Niet ingevuld"} />
                          </>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {form.provider === "platform"
                          ? "Er wordt nog geen mailbox gekoppeld."
                          : isOauthProvider(form.provider)
                            ? "Na opslaan moet de OAuth-koppeling nog worden afgerond voordat de status Verbonden kan worden."
                            : "Na opslaan moeten de secret-referentie en testmail server-side worden gecontroleerd voordat de status Verbonden kan worden."}
                      </p>
                      <div className="flex justify-between pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setStep(3)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={cancelWizard}>Annuleren</Button>
                          <Button size="sm" onClick={save} disabled={saveMutation.isPending}>
                            <Check className="w-4 h-4 mr-1" /> {saveMutation.isPending ? "Opslaan..." : "Instelling opslaan"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showWizard && (
        <div className="p-4">
          {settings ? (
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{form.from_email || "Geen e-mailadres"}</p>
                    <ProviderBadge providerKey={form.provider} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{form.from_name || company?.display_name || "Afzender niet ingevuld"}</p>
                </div>
                <Button size="sm" variant="outline" onClick={openWizard}>
                  <Edit className="w-3.5 h-3.5 mr-1" /> Wijzigen
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 text-sm">
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium text-foreground">{STATUS_LABELS[status] || status}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">Koppeling</p>
                  <p className="font-medium text-foreground truncate">{connectionSummary}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">Afzendernaam</p>
                  <p className="font-medium text-foreground truncate">{form.from_name || "—"}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
              <Mail className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">Nog geen zakelijke e-mail ingesteld.</p>
              <Button size="sm" className="mt-3" onClick={openWizard}>
                E-mail instellen
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
