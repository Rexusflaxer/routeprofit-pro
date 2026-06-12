import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ChevronLeft, ChevronRight, Edit, Mail, X } from "lucide-react";

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
    use_for_invoices: true,
    use_for_operational_mail: false,
    save_to_sent_items: true,
    require_manual_review_before_send: false,
    signature_text: "",
    invoice_subject_prefix: "Factuur",
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

function normalizePayload(form, companyId) {
  const provider = getProvider(form.provider);
  const isSmtp = form.provider === "smtp";
  const email = form.from_email?.trim() || null;

  return {
    company_id: companyId,
    provider: form.provider,
    status: form.status || getStatusForProvider(form.provider),
    from_name: form.from_name?.trim() || null,
    from_email: email,
    reply_to_email: form.reply_to_email?.trim() || email,
    bcc_email: form.bcc_email?.trim() || null,
    use_for_invoices: form.use_for_invoices !== false,
    use_for_operational_mail: !!form.use_for_operational_mail,
    save_to_sent_items: form.save_to_sent_items !== false,
    require_manual_review_before_send: !!form.require_manual_review_before_send,
    signature_text: form.signature_text?.trim() || null,
    invoice_subject_prefix: form.invoice_subject_prefix?.trim() || "Factuur",
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
  const steps = ["Provider", "Mailadres", "Bevestigen"];
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
        if (value !== "smtp") {
          next.smtp_host = "";
          next.smtp_username = "";
          next.smtp_secret_reference = "";
        }
      }
      if (field === "from_email" && (!current.reply_to_email || current.reply_to_email === current.from_email)) {
        next.reply_to_email = value;
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
    if (!form.from_name?.trim()) nextErrors.from_name = "Vul een afzendernaam in";
    if (!isValidEmail(form.from_email)) nextErrors.from_email = "Vul een geldig e-mailadres in";
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
      reply_to_email: form.reply_to_email || form.from_email,
      use_for_invoices: true,
      invoice_subject_prefix: form.invoice_subject_prefix || "Factuur",
      save_to_sent_items: form.provider !== "platform",
    };
    setForm(payload);
    saveMutation.mutate(payload);
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">E-mailinstellingen laden...</div>;
  }

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
            <p className="truncate text-xs text-muted-foreground">Afzender voor facturen en klantmails</p>
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
                        Mailadres — <span className="text-muted-foreground font-normal">{provider.label}</span>
                      </p>
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
                      <p className="text-sm font-medium text-foreground">Controleer de instelling</p>
                      <div className="rounded-lg border border-border bg-card divide-y divide-border">
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <span className="text-xs text-muted-foreground">Provider</span>
                          <span className="text-sm font-medium text-foreground">{provider.label}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <span className="text-xs text-muted-foreground">Afzender</span>
                          <span className="text-sm font-medium text-foreground text-right">{form.from_name}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <span className="text-xs text-muted-foreground">Mailadres</span>
                          <span className="text-sm font-medium text-foreground text-right">{form.from_email}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <span className="text-xs text-muted-foreground">Gebruik</span>
                          <span className="text-sm font-medium text-foreground text-right">Factuurmails</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {form.provider === "platform"
                          ? "Je kunt later alsnog Outlook, Gmail of een andere provider koppelen."
                          : "De veilige mailboxkoppeling wordt later via een aparte inlogstap afgerond."}
                      </p>
                      <div className="flex justify-between pt-1">
                        <Button variant="ghost" size="sm" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
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
                  <p className="text-xs text-muted-foreground">Gebruik</p>
                  <p className="font-medium text-foreground">Factuurmails</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium text-foreground">{STATUS_LABELS[status] || status}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">Antwoorden naar</p>
                  <p className="font-medium text-foreground truncate">{form.reply_to_email || form.from_email || "—"}</p>
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
