import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Eye,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import ManagedFilePreviewDialog from "@/components/files/ManagedFilePreviewDialog";
import KorpschefDocumentWizard from "@/components/personnel/KorpschefDocumentWizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildAuditMetadata, getAuditActorLabel } from "@/lib/auditTrail";
import {
  buildLegacyKorpschefDocuments,
  companyKorpschefLabel,
  isArchivedKorpschefDocument,
  isKorpschefDocument,
  korpschefDocumentLabel,
  korpschefRecordStatus,
  korpschefRecordType,
  KORPSCHEF_RECORD_STATUSES,
  licenseSnapshotLabel,
} from "@/lib/korpschefRules";

const DELETE_CONFIRMATION = "verwijder";
const TABLE_GRID = "grid grid-cols-[minmax(200px,1.2fr)_minmax(160px,1fr)_minmax(100px,.6fr)_minmax(180px,1fr)_minmax(100px,.65fr)_minmax(105px,.7fr)_minmax(220px,max-content)] gap-3";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value, fallback = "-") {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function dateSortValue(document) {
  return [
    document?.valid_until || "",
    document?.valid_from || "",
    document?.updated_date || document?.created_date || "",
    document?.id || "",
  ].join("|");
}

function documentFiles(document) {
  if (document?.category === "wpbr_badge") {
    return [
      {
        side: "front",
        label: "Voorkant openen",
        managedFileId: document.front_file_id,
        fileUrl: document.front_file_url || document.metadata?.front_file_url,
        filename: document.front_download_filename || "Wpbr-legitimatiebewijs-voorkant",
      },
      {
        side: "back",
        label: "Achterkant openen",
        managedFileId: document.back_file_id,
        fileUrl: document.back_file_url || document.metadata?.back_file_url,
        filename: document.back_download_filename || "Wpbr-legitimatiebewijs-achterkant",
      },
    ].filter(file => file.managedFileId || file.fileUrl);
  }

  return [{
    side: "document",
    label: "Document openen",
    managedFileId: document?.file_id,
    fileUrl: document?.file_url,
    filename: document?.file_download_filename || "Toestemmingsbrief",
  }].filter(file => file.managedFileId || file.fileUrl);
}

function statusBadgeClass(status) {
  if (status === "active") return "border-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200";
  if (status === "requested") return "border-0 bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200";
  if (status === "expired") return "border-0 bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200";
  if (status === "rejected" || status === "revoked") return "border-0 bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200";
  return "border-0 bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200";
}

function StatusBadge({ document }) {
  const status = korpschefRecordStatus(document);
  return (
    <Badge className={`whitespace-nowrap text-xs ${statusBadgeClass(status)}`}>
      {KORPSCHEF_RECORD_STATUSES[status] || status}
    </Badge>
  );
}

function companyLabelFor(document, companyMap) {
  if (document?.company_id && companyMap.has(document.company_id)) {
    return companyKorpschefLabel(companyMap.get(document.company_id));
  }
  return document?.metadata?.organization_name || "Bedrijf niet vastgelegd";
}

function DeleteDialog({ document, open, onOpenChange, onConfirm, pending }) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setConfirmation("");
      setError("");
    }
  }, [open]);

  const submit = () => {
    if (confirmation !== DELETE_CONFIRMATION) {
      setError(`Typ "${DELETE_CONFIRMATION}" om te bevestigen.`);
      return;
    }
    onConfirm(document);
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
            <div>
              <p className="text-sm font-medium text-foreground">{korpschefDocumentLabel(document)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Het document en de beveiligde bestanden worden definitief verwijderd.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Typ <strong className="font-mono text-foreground">{DELETE_CONFIRMATION}</strong> om te bevestigen
            </Label>
            <Input
              autoFocus
              value={confirmation}
              onChange={event => {
                setConfirmation(event.target.value);
                setError("");
              }}
              onKeyDown={event => event.key === "Enter" && submit()}
              placeholder={DELETE_CONFIRMATION}
              className={error ? "border-destructive font-mono" : "font-mono"}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Annuleren</Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            <Trash2 className="mr-1 h-4 w-4" />
            {pending ? "Verwijderen..." : "Definitief verwijderen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KorpschefRow({
  document,
  archived,
  companyMap,
  auditActors,
  onPreview,
  onArchive,
  onRestore,
  onDelete,
}) {
  const [menu, setMenu] = useState(null);
  const rowRef = useRef(null);
  const menuRef = useRef(null);
  const files = documentFiles(document);
  const isLegacy = document.metadata?.legacy_read_only === true;

  useEffect(() => {
    if (!menu) return undefined;
    const close = event => {
      if (!menuRef.current?.contains(event.target)) setMenu(null);
    };
    window.document.addEventListener("mousedown", close);
    return () => window.document.removeEventListener("mousedown", close);
  }, [menu]);

  const openRow = event => {
    if (files.length === 1 && !archived) {
      onPreview(document, files[0]);
      return;
    }
    const rowRect = rowRef.current?.getBoundingClientRect();
    setMenu({
      left: Math.min(event.clientX - (rowRect?.left || 0), Math.max((rowRect?.width || 240) - 230, 8)),
      top: event.clientY - (rowRect?.top || 0),
    });
  };

  return (
    <div
      ref={rowRef}
      className={`${TABLE_GRID} group relative items-center px-5 py-2.5 transition-colors hover:bg-accent/35 ${files.length || archived ? "cursor-pointer" : ""}`}
      onClick={openRow}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {korpschefRecordType(document) === "permission" ? korpschefDocumentLabel(document) : "Legitimatie"}
        </p>
      </div>
      <span className="min-w-0 truncate text-sm text-foreground">{companyLabelFor(document, companyMap)}</span>
      <span className="min-w-0 truncate text-sm text-muted-foreground">
        {document.document_number ? `#${document.document_number}` : licenseSnapshotLabel(document)}
      </span>
      <div className="min-w-0 text-xs text-muted-foreground">
        <strong className="font-medium text-foreground">{formatDate(document.valid_until)}</strong>
      </div>
      <div className="min-w-0"><StatusBadge document={document} /></div>
      <span className="min-w-0 truncate text-sm text-muted-foreground">
        {isLegacy ? "Oude registratie" : getAuditActorLabel(document, auditActors)}
      </span>
      <div className="flex justify-end" onClick={event => event.stopPropagation()}>
        {!isLegacy && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={event => {
              const rowRect = rowRef.current?.getBoundingClientRect();
              setMenu({
                left: Math.max((rowRect?.width || 240) - 230, 8),
                top: event.currentTarget.offsetTop + event.currentTarget.offsetHeight,
              });
            }}
            title="Acties"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        )}
      </div>

      <AnimatePresence>
        {menu && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.1 }}
            style={{ left: menu.left, top: menu.top }}
            className="absolute z-50 min-w-[220px] overflow-hidden rounded-lg border border-border bg-popover py-1 text-sm shadow-lg"
            onClick={event => event.stopPropagation()}
          >
            {files.map(file => (
              <button
                key={file.side}
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
                onClick={() => {
                  setMenu(null);
                  onPreview(document, file);
                }}
              >
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                {file.label}
              </button>
            ))}
            {!isLegacy && !archived && (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
                onClick={() => {
                  setMenu(null);
                  onArchive(document);
                }}
              >
                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                Archiveren
              </button>
            )}
            {!isLegacy && archived && korpschefRecordStatus(document) !== "expired" && (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-foreground transition-colors hover:bg-accent"
                onClick={() => {
                  setMenu(null);
                  onRestore(document);
                }}
              >
                <RefreshCw className="h-3.5 w-3.5 text-emerald-500" />
                Terugzetten
              </button>
            )}
            {!isLegacy && archived && (
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-destructive transition-colors hover:bg-destructive/10"
                onClick={() => {
                  setMenu(null);
                  onDelete(document);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Definitief verwijderen
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PersonnelKorpschefTab({
  personnel,
  companies = [],
  companyOptions = [],
  licenses = [],
  documents = [],
  securityPasses = [],
  auditActors = [],
}) {
  const queryClient = useQueryClient();
  const [showArchive, setShowArchive] = useState(false);
  const [wizard, setWizard] = useState(null);
  const [preview, setPreview] = useState(null);
  const [deleteDocument, setDeleteDocument] = useState(null);
  const [message, setMessage] = useState(null);

  const { data: currentUser = null } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const companyMap = useMemo(
    () => new Map(companies.map(company => [company.id, company])),
    [companies]
  );
  const storedDocuments = useMemo(
    () => documents.filter(isKorpschefDocument),
    [documents]
  );
  const legacyDocuments = useMemo(() => {
    const storedNumbers = new Set(storedDocuments.map(document => `${document.company_id || ""}:${document.document_number || ""}`));
    return buildLegacyKorpschefDocuments(securityPasses).filter(document => (
      !storedNumbers.has(`${document.company_id || ""}:${document.document_number || ""}`)
    ));
  }, [securityPasses, storedDocuments]);
  const allDocuments = useMemo(
    () => [...storedDocuments, ...legacyDocuments].sort((a, b) => dateSortValue(b).localeCompare(dateSortValue(a))),
    [legacyDocuments, storedDocuments]
  );
  const activeDocuments = useMemo(
    () => allDocuments.filter(document => !isArchivedKorpschefDocument(document)),
    [allDocuments]
  );
  const archivedDocuments = useMemo(
    () => allDocuments.filter(document => isArchivedKorpschefDocument(document)),
    [allDocuments]
  );

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
    queryClient.invalidateQueries({ queryKey: ["personnel-security-passes"] });
  };

  const archiveMutation = useMutation({
    mutationFn: ({ document, status = "archived" }) => base44.entities.PersonnelDocument.update(document.id, {
      verification_status: status === "expired" ? "expired" : document.verification_status,
      metadata: buildAuditMetadata(currentUser, "gearchiveerd", {
        ...(document.metadata || {}),
        archived: true,
        archived_at: new Date().toISOString(),
        record_status: status,
      }, auditActors),
    }),
    onSuccess: () => {
      invalidate();
      setMessage({ type: "success", text: "Het document is naar het archief verplaatst." });
    },
    onError: error => setMessage({ type: "error", text: error?.message || "Archiveren is niet gelukt." }),
  });

  const restoreMutation = useMutation({
    mutationFn: async document => {
      const duplicateActive = storedDocuments.some(candidate => (
        candidate.id !== document.id
        && candidate.company_id === document.company_id
        && candidate.category === document.category
        && !isArchivedKorpschefDocument(candidate)
      ));
      if (duplicateActive) {
        throw new Error("Er staat al een actief document van dit type voor dit bedrijf.");
      }
      if (document.valid_until && document.valid_until < today()) {
        throw new Error("Een verlopen document kan niet worden teruggezet.");
      }
      return base44.entities.PersonnelDocument.update(document.id, {
        verification_status: document.verification_status === "pending_review" ? "pending_review" : "verified",
        metadata: buildAuditMetadata(currentUser, "teruggezet", {
          ...(document.metadata || {}),
          archived: false,
          archived_at: null,
          record_status: "active",
        }, auditActors),
      });
    },
    onSuccess: () => {
      invalidate();
      setMessage({ type: "success", text: "Het document staat weer in het actieve dossier." });
    },
    onError: error => setMessage({ type: "error", text: error?.message || "Terugzetten is niet gelukt." }),
  });

  const deleteMutation = useMutation({
    mutationFn: async document => {
      const managedFileIds = [
        document.file_id,
        document.front_file_id,
        document.back_file_id,
      ].filter(Boolean);
      await Promise.all(managedFileIds.map(fileId => base44.entities.ManagedFile.delete(fileId)));
      await base44.entities.PersonnelDocument.delete(document.id);
    },
    onSuccess: () => {
      setDeleteDocument(null);
      invalidate();
      setMessage({ type: "success", text: "Het archiefdocument is definitief verwijderd." });
    },
    onError: error => setMessage({ type: "error", text: error?.message || "Verwijderen is niet gelukt." }),
  });

  const expiringDocuments = useMemo(
    () => storedDocuments.filter(document => (
      document.metadata?.archived !== true
      && document.valid_until
      && document.valid_until < today()
    )),
    [storedDocuments]
  );
  const autoArchiveSignature = expiringDocuments.map(document => document.id).sort().join("|");

  useEffect(() => {
    if (!autoArchiveSignature || archiveMutation.isPending) return;
    expiringDocuments.forEach(document => archiveMutation.mutate({ document, status: "expired" }));
  }, [autoArchiveSignature]);

  const visibleDocuments = showArchive ? archivedDocuments : activeDocuments;
  const canAdd = companyOptions.some(option => option.selectable);

  return (
    <div className="min-w-0">
      <AnimatePresence>
        {wizard && (
          <KorpschefDocumentWizard
            personnel={personnel}
            companyOptions={companyOptions}
            licenses={licenses}
            isArchiveEntry={wizard.archiveMode}
            auditActors={auditActors}
            onClose={() => setWizard(null)}
            onSaved={() => {
              setWizard(null);
              setMessage({ type: "success", text: "Het Korpschef-document is opgeslagen." });
            }}
          />
        )}
      </AnimatePresence>

      <div className={`${TABLE_GRID} items-center border-b border-border bg-muted/30 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span>Document</span>
        <span>Bedrijf</span>
        <span>Context</span>
        <span>Geldigheid</span>
        <span>Status</span>
        <span>Door</span>
        <div className="col-span-1 flex items-center justify-end gap-2">
          {showArchive && (
            <Badge className="shrink-0 animate-pulse bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
              Archief
            </Badge>
          )}
          {!wizard && (
            <>
              {showArchive ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 whitespace-nowrap px-2 text-xs font-medium normal-case tracking-normal"
                  onClick={() => setShowArchive(false)}
                >
                  <ArrowLeft className="mr-1 h-3 w-3" /> Actief
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 whitespace-nowrap px-2 text-xs font-medium normal-case tracking-normal"
                  onClick={() => setShowArchive(true)}
                >
                  <Archive className="mr-1 h-3 w-3" /> Archief {archivedDocuments.length ? `(${archivedDocuments.length})` : ""}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 whitespace-nowrap px-2 text-xs font-medium normal-case tracking-normal"
                onClick={() => setWizard({ archiveMode: showArchive })}
                disabled={!canAdd}
                title={canAdd ? "Nieuw document toevoegen" : "Rond eerst een Wpbr-bedrijfsprofiel af"}
              >
                <Plus className="mr-1 h-3 w-3" />
                {showArchive ? "Oud document" : "Nieuw document"}
              </Button>
            </>
          )}
        </div>
      </div>

      {message && !wizard && (
        <div className="px-5 pt-3">
          <div className={`rounded-md border px-3 py-2 text-xs ${
            message.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}>
            {message.text}
          </div>
        </div>
      )}

      {!canAdd && !showArchive && companyOptions.length > 0 && !wizard && (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Rond bij het bedrijf eerst de actieve Wpbr-vergunning en juridische bedrijfsnaam af.</span>
        </div>
      )}

      {visibleDocuments.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {showArchive
              ? "Geen toestemmingsbrieven of legitimatiebewijzen in het archief."
              : "Nog geen toestemmingsbrief of Wpbr-legitimatiebewijs geregistreerd."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visibleDocuments.map(document => (
            <KorpschefRow
              key={document.id}
              document={document}
              archived={showArchive}
              companyMap={companyMap}
              auditActors={auditActors}
              onPreview={(record, file) => setPreview({ document: record, file })}
              onArchive={record => archiveMutation.mutate({ document: record })}
              onRestore={record => restoreMutation.mutate(record)}
              onDelete={setDeleteDocument}
            />
          ))}
        </div>
      )}

      <ManagedFilePreviewDialog
        open={Boolean(preview)}
        onOpenChange={open => {
          if (!open) setPreview(null);
        }}
        managedFileId={preview?.file?.managedFileId}
        fileUrl={preview?.file?.fileUrl}
        filename={preview?.file?.filename}
        title={preview ? `${korpschefDocumentLabel(preview.document)} - ${preview.file.label.replace(" openen", "")}` : "Document bekijken"}
        renderPdfAsA4={preview?.document?.category === "wpbr_permission"}
      />

      <DeleteDialog
        document={deleteDocument}
        open={Boolean(deleteDocument)}
        onOpenChange={open => {
          if (!open) setDeleteDocument(null);
        }}
        onConfirm={document => deleteMutation.mutate(document)}
        pending={deleteMutation.isPending}
      />
    </div>
  );
}