import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  FolderLock,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import PortalShell from "@/components/customer-portal/PortalShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PUBLICATION_TAB = {
  planning: "planning",
  schedule: "planning",
  report: "reports",
  document: "documents",
  quote: "commercial",
  contract: "commercial",
  invoice: "billing",
  credit_note: "billing",
};

const ALL_TABS = [
  { id: "overview", label: "Overzicht", icon: LayoutDashboard, module: "overview" },
  { id: "objects", label: "Objecten", icon: Building2, module: "objects" },
  { id: "planning", label: "Planning", icon: CalendarDays, module: "planning" },
  { id: "requests", label: "Aanvragen", icon: ClipboardList, module: "requests" },
  { id: "reports", label: "Rapportages", icon: FileText, module: "reports" },
  { id: "documents", label: "Documenten", icon: FolderLock, module: "documents" },
  { id: "commercial", label: "Offertes & contracten", icon: ShieldCheck, module: "commercial" },
  { id: "billing", label: "Facturatie", icon: ReceiptText, module: "billing" },
  { id: "access", label: "Mijn toegang", icon: LockKeyhole, module: "access_management" },
];

const PUBLICATION_TYPES = {
  planning: ["planning"],
  reports: ["report"],
  documents: ["document"],
  commercial: ["quote", "contract"],
  billing: ["invoice", "credit_note"],
};

const REQUEST_TYPES = [
  ["new_service", "Extra dienst"],
  ["schedule_change", "Planningswijziging"],
  ["document_request", "Vraag over rapportage of document"],
  ["object_change", "Objectwijziging"],
  ["other", "Overige aanvraag"],
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("nl-NL");
}

function formatMoney(cents, currency = "EUR") {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(Number(cents) / 100);
}

function statusLabel(status) {
  return String(status || "onbekend").replaceAll("_", " ");
}

function PortalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="space-y-3 text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-700" />
        <p className="text-sm text-slate-500">Klantomgeving laden…</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon = FileText, title, description, action }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <Icon className="mx-auto h-9 w-9 text-slate-400" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function PublicationTable({ publications, onDownload, downloading }) {
  if (!publications.length) {
    return (
      <EmptyState
        title="Nog niets gepubliceerd"
        description="Zodra een document is gecontroleerd en voor u gepubliceerd, verschijnt het hier."
      />
    );
  }
  return (
    <Card className="overflow-hidden border-slate-200 shadow-none">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Document</TableHead>
            <TableHead>Object</TableHead>
            <TableHead>Gepubliceerd</TableHead>
            <TableHead>Versie</TableHead>
            <TableHead className="text-right">Actie</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {publications.map((publication) => {
            const payload = publication.safe_payload || {};
            const name = payload.name
              || payload.invoice_number
              || payload.report_type
              || publication.publication_type;
            const firstFile = publication.attachment_managed_file_ids?.[0];
            return (
              <TableRow key={publication.id}>
                <TableCell>
                  <p className="font-medium capitalize">{String(name || "Publicatie").replaceAll("_", " ")}</p>
                  {payload.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{payload.description}</p>}
                </TableCell>
                <TableCell className="text-slate-600">{publication.object_id ? "Gekoppeld object" : "Klantbreed"}</TableCell>
                <TableCell>{formatDate(publication.published_at)}</TableCell>
                <TableCell>v{publication.version || 1}</TableCell>
                <TableCell className="text-right">
                  {firstFile && publication.can_download ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={downloading === firstFile}
                      onClick={() => onDownload(publication.id, firstFile)}
                    >
                      {downloading === firstFile ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                      Download
                    </Button>
                  ) : firstFile ? (
                    <span className="text-xs text-slate-400">Alleen bekijken</span>
                  ) : (
                    <span className="text-xs text-slate-400">Geen bijlage</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

export default function CustomerPortal() {
  const { user, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [objects, setObjects] = useState([]);
  const [publications, setPublications] = useState([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState("");
  const requestIdempotencyKey = useRef("");
  const [requestForm, setRequestForm] = useState({
    request_type: "other",
    object_id: "customer_wide",
    title: "",
    description: "",
  });

  const invitationId = searchParams.get("invitation");
  const invitationToken = searchParams.get("token");
  const requestedTab = searchParams.get("tab") || "overview";
  const membershipId = searchParams.get("membership") || undefined;

  const invoke = useCallback(async (action, payload = {}) => {
    const response = await base44.functions.invoke("customerPortalApi", {
      action,
      membership_id: membershipId,
      ...payload,
    });
    return response.data;
  }, [membershipId]);

  const loadContext = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await invoke("context");
      setContext(data);
    } catch (loadError) {
      setContext(null);
      setError(loadError?.response?.data?.error || loadError?.message || "Klantomgeving kon niet worden geladen.");
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    if (user) loadContext();
  }, [loadContext, user]);

  const tabs = useMemo(() => {
    const modules = new Set((context?.grants || []).filter((grant) =>
      grant.status !== "revoked" && grant.actions?.includes("read")
    ).map((grant) => grant.module));
    modules.add("overview");
    modules.add("access_management");
    if ((context?.grants || []).some((grant) => grant.module === "requests" && grant.actions?.includes("create"))) {
      modules.add("requests");
    }
    return ALL_TABS.filter((tab) => modules.has(tab.module));
  }, [context]);

  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : tabs[0]?.id || "overview";

  const setActiveTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!context) return;
    let cancelled = false;
    const loadTab = async () => {
      setTabLoading(true);
      setError("");
      try {
        if (activeTab === "objects" || activeTab === "requests") {
          const data = await invoke("list_objects");
          if (!cancelled) setObjects(data.objects || []);
        }
        const types = PUBLICATION_TYPES[activeTab];
        if (types) {
          const batches = await Promise.all(types.map((type) => invoke("list_publications", { publication_type: type })));
          if (!cancelled) setPublications(batches.flatMap((batch) => batch.publications || []));
        } else if (activeTab === "overview") {
          const data = await invoke("list_publications");
          if (!cancelled) setPublications(data.publications || []);
        }
      } catch (tabError) {
        if (!cancelled) setError(tabError?.response?.data?.error || tabError?.message || "Gegevens konden niet worden geladen.");
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    };
    loadTab();
    return () => { cancelled = true; };
  }, [activeTab, context, invoke]);

  const acceptInvitation = async () => {
    if (!invitationId || !invitationToken) return;
    setAccepting(true);
    setError("");
    try {
      const response = await base44.functions.invoke("customerPortalApi", {
        action: "accept_invitation",
        invitation_id: invitationId,
        token: invitationToken,
        terms_version: "v1",
        idempotency_key: `portal-invitation-accept:${invitationId}`,
        expected_version: 1,
      });
      const next = new URLSearchParams();
      next.set("tab", "overview");
      if (response.data?.membership?.id) next.set("membership", response.data.membership.id);
      setSearchParams(next, { replace: true });
      await loadContext();
    } catch (acceptError) {
      setError(acceptError?.response?.data?.error || acceptError?.message || "Uitnodiging accepteren is mislukt.");
    } finally {
      setAccepting(false);
    }
  };

  const downloadPublication = async (publicationId, managedFileId) => {
    setDownloading(managedFileId);
    setError("");
    try {
      const data = await invoke("create_file_url", {
        publication_id: publicationId,
        managed_file_id: managedFileId,
      });
      window.open(data.signed_url, "_blank", "noopener,noreferrer");
    } catch (downloadError) {
      setError(downloadError?.response?.data?.error || downloadError?.message || "Download kon niet worden gestart.");
    } finally {
      setDownloading("");
    }
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    setRequestSubmitting(true);
    setRequestSuccess("");
    setError("");
    try {
      const data = await invoke("create_request", {
        ...requestForm,
        object_id: requestForm.object_id === "customer_wide" ? null : requestForm.object_id,
        idempotency_key: requestIdempotencyKey.current || (requestIdempotencyKey.current = crypto.randomUUID()),
        expected_version: 0,
      });
      setRequestSuccess(`Aanvraag ${data.request?.id || ""} is ingediend.`);
      requestIdempotencyKey.current = "";
      setRequestForm({ request_type: "other", object_id: "customer_wide", title: "", description: "" });
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError?.message || "Aanvraag indienen is mislukt.");
    } finally {
      setRequestSubmitting(false);
    }
  };

  if (loading) return <PortalLoading />;

  if (!context) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-lg border-slate-200 shadow-sm">
          <CardContent className="space-y-5 p-6 sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 text-white">
              {invitationId ? <ShieldCheck className="h-6 w-6" /> : <LockKeyhole className="h-6 w-6" />}
            </div>
            <div>
              <h1 className="text-xl font-semibold">
                {invitationId ? "Klantportaal activeren" : "Geen actieve klanttoegang"}
              </h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {invitationId
                  ? "Controleer uw uitnodiging en activeer deze voor het account waarmee u nu bent ingelogd."
                  : "Uw account heeft geen actief klantportaal-lidmaatschap."}
              </p>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Toegang niet beschikbaar</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {invitationId && invitationToken ? (
              <Button className="w-full" onClick={acceptInvitation} disabled={accepting}>
                {accepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Uitnodiging accepteren
              </Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={loadContext}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Opnieuw controleren
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderContent = () => {
    if (tabLoading) {
      return (
        <div className="space-y-3">
          <div className="h-8 w-52 animate-pulse rounded bg-slate-200" />
          <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
        </div>
      );
    }

    if (activeTab === "overview") {
      const latest = publications.slice(0, 5);
      return (
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-slate-500">Welkom</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{context.customer?.name}</h1>
            <p className="mt-1 text-sm text-slate-500">Hier vindt u uitsluitend gecontroleerde en voor u gepubliceerde informatie.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Publicaties", publications.length],
              ["Objecttoegang", context.grants?.find((grant) => grant.module === "objects")?.scope_type === "customer_wide" ? "Alle" : "Selectie"],
              ["Portaalrol", context.membership?.role_template || "Lezer"],
            ].map(([label, value]) => (
              <Card key={label} className="border-slate-200 shadow-none">
                <CardContent className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-semibold capitalize">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-slate-200 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recente publicaties</CardTitle>
            </CardHeader>
            <CardContent>
              {latest.length ? (
                <div className="divide-y divide-slate-100">
                  {latest.map((publication) => (
                    <button
                      type="button"
                      key={publication.id}
                      onClick={() => setActiveTab(PUBLICATION_TAB[publication.publication_type] || "overview")}
                      className="flex w-full items-center gap-3 py-3 text-left"
                    >
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span className="flex-1 text-sm font-medium capitalize">{publication.publication_type.replaceAll("_", " ")}</span>
                      <span className="text-xs text-slate-500">{formatDate(publication.published_at)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Er zijn nog geen publicaties.</p>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    if (activeTab === "objects") {
      if (!objects.length) return <EmptyState icon={Building2} title="Geen objecten beschikbaar" description="Er zijn nog geen objecten aan uw portaaltoegang gekoppeld." />;
      return (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Objecten</h1>
            <p className="mt-1 text-sm text-slate-500">Veilige klantweergave zonder operationele toegangscodes of interne instructies.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {objects.map((object) => (
              <Card key={object.id} className="border-slate-200 shadow-none">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Building2 className="mt-0.5 h-5 w-5 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{object.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{object.address || "Geen adres gepubliceerd"}</p>
                      <Badge variant="outline" className="mt-3 capitalize">{statusLabel(object.status)}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab === "requests") {
      return (
        <div className="max-w-2xl space-y-5">
          <div>
            <h1 className="text-xl font-semibold">Nieuwe aanvraag</h1>
            <p className="mt-1 text-sm text-slate-500">Uw aanvraag wordt intern beoordeeld voordat planning of klantgegevens wijzigen.</p>
          </div>
          {requestSuccess && (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Ontvangen</AlertTitle>
              <AlertDescription>{requestSuccess}</AlertDescription>
            </Alert>
          )}
          <Card className="border-slate-200 shadow-none">
            <CardContent className="p-5">
              <form className="space-y-4" onSubmit={submitRequest}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="request-type">Soort aanvraag</Label>
                    <Select value={requestForm.request_type} onValueChange={(value) => setRequestForm((current) => ({ ...current, request_type: value }))}>
                      <SelectTrigger id="request-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REQUEST_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="request-object">Objectscope</Label>
                    <Select value={requestForm.object_id} onValueChange={(value) => setRequestForm((current) => ({ ...current, object_id: value }))}>
                      <SelectTrigger id="request-object"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer_wide">Klantbreed</SelectItem>
                        {objects.map((object) => <SelectItem key={object.id} value={object.id}>{object.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="request-title">Onderwerp</Label>
                  <Input id="request-title" required value={requestForm.title} onChange={(event) => setRequestForm((current) => ({ ...current, title: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="request-description">Toelichting</Label>
                  <Textarea id="request-description" rows={6} value={requestForm.description} onChange={(event) => setRequestForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
                <Button type="submit" disabled={requestSubmitting || !requestForm.title.trim()}>
                  {requestSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Aanvraag indienen
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (activeTab === "access") {
      return (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Mijn toegang</h1>
            <p className="mt-1 text-sm text-slate-500">Uw rechten zijn per module en, waar van toepassing, per object ingesteld.</p>
          </div>
          <Card className="border-slate-200 shadow-none">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Module</TableHead>
                  <TableHead>Acties</TableHead>
                  <TableHead>Scope</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(context.grants || []).map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell className="font-medium capitalize">{grant.module.replaceAll("_", " ")}</TableCell>
                    <TableCell>{(grant.actions || []).map((action) => <Badge key={action} variant="outline" className="mr-1 capitalize">{action}</Badge>)}</TableCell>
                    <TableCell>{grant.scope_type === "customer_wide" ? "Alle objecten" : `${grant.object_ids?.length || 0} geselecteerd`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      );
    }

    if (activeTab === "billing" && publications.length) {
      return (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Facturatie</h1>
            <p className="mt-1 text-sm text-slate-500">Alleen definitief uitgegeven en voor u gepubliceerde documenten.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {publications.slice(0, 3).map((publication) => (
              <Card key={publication.id} className="border-slate-200 shadow-none">
                <CardContent className="p-5">
                  <p className="text-xs text-slate-500">{publication.safe_payload?.invoice_number || "Factuur"}</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatMoney(publication.safe_payload?.total_including_tax_cents, publication.safe_payload?.currency)}
                  </p>
                  <Badge variant="outline" className="mt-2 capitalize">{statusLabel(publication.safe_payload?.payment_status)}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
          <PublicationTable publications={publications} onDownload={downloadPublication} downloading={downloading} />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
          <p className="mt-1 text-sm text-slate-500">Gecontroleerde publicaties binnen uw toegewezen klant- en objectscope.</p>
        </div>
        <PublicationTable publications={publications} onDownload={downloadPublication} downloading={downloading} />
      </div>
    );
  };

  return (
    <PortalShell
      customer={context.customer}
      user={user}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onLogout={() => logout(true)}
    >
      {error && (
        <Alert variant="destructive" className="mb-5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Gegevens niet beschikbaar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {renderContent()}
    </PortalShell>
  );
}
