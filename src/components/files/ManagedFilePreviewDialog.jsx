import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import A4PdfPreview from "@/components/files/A4PdfPreview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  downloadBlob,
  downloadManagedFile,
  prepareManagedFilePreview,
  revokeManagedFilePreview
} from "@/lib/managedFiles";

function extensionOf(filename = "") {
  const clean = String(filename || "").split("?")[0].split("#")[0];
  return clean.includes(".") ? clean.split(".").pop().toLowerCase() : "";
}

function isPdf(preview, filename) {
  return preview?.mimeType === "application/pdf" || extensionOf(preview?.filename || filename) === "pdf";
}

function isImage(preview, filename) {
  const extension = extensionOf(preview?.filename || filename);
  return preview?.mimeType?.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(extension);
}

function pdfViewerUrl(url) {
  if (!url) return "";
  return `${url}${url.includes("#") ? "&" : "#"}toolbar=0&navpanes=0`;
}

export default function ManagedFilePreviewDialog({
  open,
  onOpenChange,
  managedFileId,
  fileUrl,
  filename,
  title = "Document bekijken",
  description = null,
  renderPdfAsA4 = false,
}) {
  const descriptionId = React.useId();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return undefined;

    let active = true;
    setLoading(true);
    setError(null);
    setPreview((current) => {
      revokeManagedFilePreview(current);
      return null;
    });

    prepareManagedFilePreview({ managedFileId, fileUrl, filename })
      .then((nextPreview) => {
        if (!active) {
          revokeManagedFilePreview(nextPreview);
          return;
        }
        setPreview(nextPreview);
      })
      .catch((err) => {
        if (!active) return;
        console.error("Managed file preview failed:", err);
        setError(err?.message || "Document kan niet veilig worden geopend.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, managedFileId, fileUrl, filename]);

  useEffect(() => {
    if (open) return;
    setLoading(false);
    setError(null);
    setPreview((current) => {
      revokeManagedFilePreview(current);
      return null;
    });
  }, [open]);

  useEffect(() => () => revokeManagedFilePreview(preview), [preview]);

  const resolvedFilename = preview?.filename || filename || "Document";
  const canPreviewPdf = useMemo(() => isPdf(preview, filename), [preview, filename]);
  const canPreviewImage = useMemo(() => isImage(preview, filename), [preview, filename]);

  const handleDownload = () => {
    if (preview?.blob) {
      downloadBlob(preview.blob, resolvedFilename);
      return;
    }

    downloadManagedFile({ managedFileId, fileUrl, filename: resolvedFilename });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={description ? descriptionId : undefined}
        className={`h-[90vh] max-h-[90vh] w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] grid-rows-[auto,1fr] overflow-hidden p-4 sm:p-6 ${renderPdfAsA4 ? "max-w-6xl" : "max-w-2xl"}`}
      >
        <DialogHeader className="min-w-0 pr-12">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="flex min-w-0 items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                <span className="truncate">{title}</span>
              </DialogTitle>
              {description && (
                <DialogDescription id={descriptionId} className="truncate">{description}</DialogDescription>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={loading || (!preview && !fileUrl)}
              className="shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Downloaden
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-hidden rounded-md border border-border bg-muted/20">
          {loading && (
            <div className="flex h-full min-h-[22rem] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Document wordt geopend...
            </div>
          )}

          {!loading && error && (
            <div className="flex h-full min-h-[22rem] items-center justify-center p-6">
              <div className="max-w-md text-center">
                <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-destructive" />
                <p className="text-sm font-medium text-foreground">Document kan niet worden geopend.</p>
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && preview && canPreviewPdf && renderPdfAsA4 && (
            <A4PdfPreview
              url={preview.url}
              filename={resolvedFilename}
              className="h-full min-h-0 border-0 bg-transparent p-0"
            />
          )}

          {!loading && !error && preview && canPreviewPdf && !renderPdfAsA4 && (
            <div className="flex h-full min-h-[22rem] overflow-auto bg-muted/30 p-2">
              <iframe
                title={resolvedFilename}
                src={pdfViewerUrl(preview.url)}
                className="h-full w-full rounded-sm bg-background"
              />
            </div>
          )}

          {!loading && !error && preview && canPreviewImage && (
            <div className="flex h-full min-h-[22rem] items-center justify-center overflow-auto bg-background p-4">
              <img
                src={preview.url}
                alt={resolvedFilename}
                className="max-h-full max-w-full rounded-sm object-contain"
              />
            </div>
          )}

          {!loading && !error && preview && !canPreviewPdf && !canPreviewImage && (
            <div className="flex h-full min-h-[22rem] items-center justify-center p-6">
              <div className="max-w-md text-center">
                <ImageIcon className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Voorbeeld niet beschikbaar</p>
                <p className="mt-1 text-xs text-muted-foreground">{resolvedFilename}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
