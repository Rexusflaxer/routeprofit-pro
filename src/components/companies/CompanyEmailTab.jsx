import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, Info, Mail, Save, Send, ShieldCheck } from "lucide-react";

const PROVIDERS = [
  {
    key: "microsoft_365",
    label: "Microsoft 365 / Outlook",
    badge: "Aanbevolen",
    description: "OAuth via Microsoft Graph, geschikt voor zakelijke Outlook en shared mailboxes.",
    scopes: ["Mail.Send", "offline_access", "User.Read"],
  },
  {
    key: "google_workspace",
    label: "Google Workspace / Gmail",
    badge: "OAuth",
    description: "OAuth via Gmail API, geschikt voor Gmail en Workspace domeinen.",
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
  },
  {
    key: "smtp",
    label: "SMTP-provider",
    badge: "Fallback",
    description: "Voor providers zonder directe API; secrets blijven server-side.",
    scopes: [],
  },
  {
    key: "platform",
    label: "Platform-afzender",
    badge: "Basis",
    description: "Versturen via het platform met eigen reply-to en bedrijfsnaam.",
    scopes: [],
  },
  {
    key: "other",
    label: "Andere provider",
    badge: "Maatwerk",
    description: "Voor SendGrid, Mailgun, SES of een branchespecifieke mailgateway.",
    scopes: [],
  },
];

const STATUS_LABELS = {
  draft: "Concept",
  pending_oauth: "Wacht op koppeling",
  connected: "Verbonden",
  action_required: "Actie nodig",
  disabled: "Uitgeschakeld",
};

const STATUS_CLASSES = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  pending_oauth: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  connected: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  action_required: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  disabled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300",
};

function emptyForm(company) {
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
    oauth_scopes: PROVIDERS.find(p => p.key === "microsoft_365")?.scopes || [],
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

function normalizePayload(form, companyId) {
  const provider = PROVIDERS.find(p => p.key === form.provider);
  const isSmtp = form.provider === "smtp";

  return {
    company_id: companyId,
    provider: form.provider,
    status: form.status || "draft",
    from_name: form.from_name?.trim() || null,
    from_email: form.from_email?.trim() || null,
    reply_to_email: form.reply_to_email?.trim() || null,
    bcc_email: form.bcc_email?.trim() || null,
    use_for_invoices: !!form.use_for_invoices,
    use_for_operational_mail: !!form.use_for_operational_mail,
    save_to_sent_items: !!form.save_to_sent_items,
    require_manual_review_before_send: !!form.require_manual_review_before_send,
    signature_text: form.signature_text?.trim() || null,
    invoice_subject_prefix: form.invoice_subject_prefix?.trim() || null,
    oauth_tenant_hint: form.oauth_tenant_hint?.trim() || null,
    oauth_account_id: form.oauth_account_id?.trim() || null,
    oauth_scopes: provider?.scopes || [],
    token_secret_reference: form.token_secret_reference?.trim() || null,
    smtp_host: isSmtp ? form.smtp_host?.trim() || null : null,
    smtp_port: isSmtp ? Number(form.smtp_port) || null : null,
    smtp_security: isSmtp ? form.smtp_security || "starttls" : null,
    smtp_username: isSmtp ? form.smtp_username?.trim() || null : null,
    smtp_secret_reference: isSmtp ? form.smtp_secret_reference?.trim() || null : null,
    connected_at: form.connected_at || null,
    last_checked_at: form.last_checked_at || null,
    last_send_test_at: form.last_send_test_at || null,
    last_error: form.last_error?.trim() || null,
    notes: form.notes?.trim() || null,
  };
}

function SettingSwitch({ checked, label, description, onCheckedChange }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function CompanyEmailTab({ companyId, company }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => emptyForm(company));

  const { data: settingsList = [], isLoading } = useQuery({
    queryKey: ["company-email-settings", companyId],
    queryFn: () => base44.entities.CompanyEmailSettings.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const settings = settingsList[0] || null;
  const provider = PROVIDERS.find(p => p.key === form.provider) || PROVIDERS[0];
  const isOAuthProvider = ["microsoft_365", "google_workspace"].includes(form.provider);
  const isConnected = form.status === "connected";

  useEffect(() => {
    if (!companyId) return;
    setForm({
      ...emptyForm(company),
      ...(settings || {}),
      company_id: companyId,
      oauth_scopes: settings?.oauth_scopes?.length
        ? settings.oauth_scopes
        : PROVIDERS.find(p => p.key === (settings?.provider || "microsoft_365"))?.scopes || [],
    });
  }, [company, companyId, settings]);

  const setField = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === "provider") {
        const selected = PROVIDERS.find(p => p.key === value);
        next.oauth_scopes = selected?.scopes || [];
        next.status = value === "platform" ? "draft" : prev.status === "connected" ? "action_required" : prev.status;
        if (value !== "smtp") {
          next.smtp_host = "";
          next.smtp_username = "";
          next.smtp_secret_reference = "";
        }
      }
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = normalizePayload(form, companyId);
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
    },
  });

  const markPendingOAuth = () => {
    setForm(prev => ({
      ...prev,
      status: "pending_oauth",
      oauth_scopes: provider.scopes,
      last_error: "",
    }));
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">E-mailinstellingen laden...</div>;
  }

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Zakelijke e-mail</h3>
            <Badge className={STATUS_CLASSES[form.status] || STATUS_CLASSES.draft}>
              {STATUS_LABELS[form.status] || form.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Afzender en verzendkanaal voor facturen en bedrijfsberichten.
          </p>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.provider}>
          <Save className="mr-2 h-4 w-4" />
          {saveMutation.isPending ? "Opslaan..." : "Opslaan"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {PROVIDERS.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setField("provider", item.key)}
            className={`min-h-[132px] rounded-lg border p-3 text-left transition-colors ${
              form.provider === item.key
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
              <Badge variant="outline" className="text-[10px]">{item.badge}</Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <div className="rounded-lg border border-border p-4">
            <h4 className="text-sm font-semibold text-foreground">Afzender</h4>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Afzendernaam</Label>
                <Input value={form.from_name || ""} onChange={e => setField("from_name", e.target.value)} placeholder={company?.display_name || "Bedrijfsnaam"} />
              </div>
              <div className="space-y-1.5">
                <Label>Afzendadres</Label>
                <Input type="email" value={form.from_email || ""} onChange={e => setField("from_email", e.target.value)} placeholder="facturen@bedrijf.nl" />
              </div>
              <div className="space-y-1.5">
                <Label>Reply-to</Label>
                <Input type="email" value={form.reply_to_email || ""} onChange={e => setField("reply_to_email", e.target.value)} placeholder={form.from_email || "administratie@bedrijf.nl"} />
              </div>
              <div className="space-y-1.5">
                <Label>BCC administratie</Label>
                <Input type="email" value={form.bcc_email || ""} onChange={e => setField("bcc_email", e.target.value)} placeholder="archief@bedrijf.nl" />
              </div>
              <div className="space-y-1.5">
                <Label>Factuuronderwerp prefix</Label>
                <Input value={form.invoice_subject_prefix || ""} onChange={e => setField("invoice_subject_prefix", e.target.value)} placeholder="Factuur" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status || "draft"} onValueChange={value => setField("status", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label>Ondertekening</Label>
              <Textarea
                value={form.signature_text || ""}
                onChange={e => setField("signature_text", e.target.value)}
                rows={4}
                placeholder={`Met vriendelijke groet,\n${company?.display_name || "Administratie"}`}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <SettingSwitch
              checked={!!form.use_for_invoices}
              label="Factuurmails"
              description="Gebruik dit kanaal voor facturen, herinneringen en creditnota's."
              onCheckedChange={value => setField("use_for_invoices", value)}
            />
            <SettingSwitch
              checked={!!form.use_for_operational_mail}
              label="Operationele mails"
              description="Gebruik dit kanaal ook voor planning, rapportages en klantberichten."
              onCheckedChange={value => setField("use_for_operational_mail", value)}
            />
            <SettingSwitch
              checked={!!form.save_to_sent_items}
              label="Opslaan in Verzonden items"
              description="Bewaar verzonden berichten in de gekoppelde mailbox."
              onCheckedChange={value => setField("save_to_sent_items", value)}
            />
            <SettingSwitch
              checked={!!form.require_manual_review_before_send}
              label="Review voor verzenden"
              description="Laat factuurmails eerst controleren voordat ze vertrekken."
              onCheckedChange={value => setField("require_manual_review_before_send", value)}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{provider.label}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{provider.description}</p>
              </div>
              {isConnected ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              )}
            </div>

            {isOAuthProvider && (
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label>{form.provider === "microsoft_365" ? "Tenant of domein" : "Workspace domein"}</Label>
                  <Input value={form.oauth_tenant_hint || ""} onChange={e => setField("oauth_tenant_hint", e.target.value)} placeholder="bedrijf.nl" />
                </div>
                <div className="space-y-2">
                  <Label>Aangevraagde rechten</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.scopes.map(scope => (
                      <Badge key={scope} variant="outline" className="text-[11px]">{scope}</Badge>
                    ))}
                  </div>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={markPendingOAuth}>
                  <Send className="mr-2 h-4 w-4" />
                  Koppeling voorbereiden
                </Button>
              </div>
            )}

            {form.provider === "smtp" && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-[1fr_96px] gap-3">
                  <div className="space-y-1.5">
                    <Label>SMTP-host</Label>
                    <Input value={form.smtp_host || ""} onChange={e => setField("smtp_host", e.target.value)} placeholder="smtp.bedrijf.nl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Poort</Label>
                    <Input type="number" value={form.smtp_port || ""} onChange={e => setField("smtp_port", e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Beveiliging</Label>
                  <Select value={form.smtp_security || "starttls"} onValueChange={value => setField("smtp_security", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starttls">STARTTLS</SelectItem>
                      <SelectItem value="ssl_tls">SSL/TLS</SelectItem>
                      <SelectItem value="none">Geen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Gebruikersnaam</Label>
                  <Input value={form.smtp_username || ""} onChange={e => setField("smtp_username", e.target.value)} placeholder={form.from_email || "mailbox@bedrijf.nl"} />
                </div>
                <div className="space-y-1.5">
                  <Label>Secret referentie</Label>
                  <Input value={form.smtp_secret_reference || ""} onChange={e => setField("smtp_secret_reference", e.target.value)} placeholder="secret://company-mail/..." />
                </div>
              </div>
            )}

            {["platform", "other"].includes(form.provider) && (
              <div className="mt-4 space-y-3">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>{form.provider === "platform" ? "Geen mailboxkoppeling" : "Maatwerkprovider"}</AlertTitle>
                  <AlertDescription>
                    {form.provider === "platform"
                      ? "Reply-to en afzendernaam worden gebruikt zolang er geen externe mailbox is gekoppeld."
                      : "Leg hier de gewenste provider vast; de verzendadapter wordt server-side aangesloten."}
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>

          <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Backend-stap vereist</AlertTitle>
            <AlertDescription>
              OAuth tokens, refresh tokens en SMTP secrets horen in een server-side vault. Dit scherm bewaart alleen de configuratie en referenties.
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border border-border p-4">
            <Label>Interne notities</Label>
            <Textarea
              className="mt-2"
              value={form.notes || ""}
              onChange={e => setField("notes", e.target.value)}
              rows={4}
              placeholder="Bijvoorbeeld: shared mailbox facturen@bedrijf.nl vereist admin consent."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
