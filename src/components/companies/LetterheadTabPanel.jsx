import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Archive, ChevronLeft, Edit, Eye, Plus, Trash2 } from "lucide-react";
import { getAuditActorLabel } from "@/lib/auditTrail";

const DELETE_PASSWORD = "verwijder";

export default function LetterheadTabPanel({
  wizard,
  tableGrid,
  letterheads,
  activeLetterheads,
  onNew,
  wizardOpen,
  onEdit,
  onArchive,
  onDelete,
  onPreview,
  auditActors,
  marginLabel,
  statusBadge,
}) {
  const [showArchive, setShowArchive] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  const archived = letterheads.filter((i) => i.status === "archived");
  const rows = showArchive ? archived : activeLetterheads;
  const target = letterheads.find((i) => i.id === deleteId);

  const confirmDelete = async () => {
    if (password !== DELETE_PASSWORD || !deleteId) return;
    try {
      setPending(true);
      await onDelete(deleteId);
      setDeleteId(null);
      setPassword("");
    } finally {
      setPending(false);
    }
  };

  const openDelete = (item) => {
    setDeleteId(item.id);
    setPassword("");
  };

  const closeDelete = () => {
    setDeleteId(null);
    setPassword("");
  };

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      {wizard}

      <div className={`${tableGrid} items-center border-b border-border bg-muted/20 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span>Naam</span>
        <span>Marges</span>
        <span>Status</span>
        <span>Door</span>
        <div className="flex flex-nowrap items-center justify-end gap-2">
          {showArchive && (
            <Badge className="shrink-0 bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 animate-pulse">Archief</Badge>
          )}
          {showArchive ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowArchive(false)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
              <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Actieve briefpapier
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowArchive(true)} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                <Archive className="mr-1 h-3.5 w-3.5" /> Archief {archived.length > 0 ? `(${archived.length})` : ""}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onNew} disabled={wizardOpen} className="h-7 px-2 text-xs font-medium normal-case tracking-normal whitespace-nowrap">
                <Plus className="mr-1 h-3.5 w-3.5" /> Nieuw briefpapier
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1">
        {rows.length === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center px-5 py-8 text-center text-sm text-muted-foreground">
            {showArchive ? "Geen briefpapier in het archief." : "Nog geen briefpapier ingesteld."}
          </div>
        ) : (
          rows.map((item) => (
            <div key={item.id} className={`${tableGrid} items-start border-b border-border px-5 py-4 text-sm transition-colors hover:bg-accent/35`}>
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{item.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.download_filename || "Briefpapier"}</p>
              </div>
              <span className="text-sm text-muted-foreground">{marginLabel(item)}</span>
              <div>
                {item.status === "archived"
                  ? statusBadge("archived")
                  : <Badge className="border-0 bg-green-100 text-xs text-green-800 dark:bg-green-900/45 dark:text-green-200">Actief</Badge>}
              </div>
              <span className="min-w-0 truncate text-sm text-muted-foreground">{getAuditActorLabel(item, auditActors)}</span>
              <div className="flex justify-end gap-1">
                {(item.file_id || item.file_url) && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onPreview({ managedFileId: item.file_id, fileUrl: item.file_url, filename: item.download_filename, title: item.name })} title="Bekijken">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                )}
                {showArchive ? (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => openDelete(item)} title="Verwijderen">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <>
                    {!item.legacy && (
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(item)} title="Bewerken">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!item.legacy && item.status !== "archived" && (
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => onArchive(item)} title="Naar archief">
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) closeDelete(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Briefpapier verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Je staat op het punt <strong>{target?.name}</strong> definitief te verwijderen. Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 px-6 pb-2">
            <label className="text-xs text-muted-foreground block">
              Typ <strong className="text-foreground font-mono">{DELETE_PASSWORD}</strong> om te bevestigen:
            </label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={DELETE_PASSWORD}
              className="h-8 text-sm font-mono max-w-[200px]"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && confirmDelete()}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={password !== DELETE_PASSWORD || pending}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> {pending ? "Verwijderen..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}