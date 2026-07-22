import React, { useEffect, useRef, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import DocumentPreviewZoomControls from "@/components/files/DocumentPreviewZoomControls";
import { loadPdfRenderer } from "@/lib/contractPdfLetterhead";

const A4_PREVIEW_WIDTH = 595;
const MAX_RENDER_PIXEL_RATIO = 2.5;
const MAX_RENDER_WIDTH = 1800;

function A4PdfPage({ document, pageNumber, zoom }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const cssWidth = A4_PREVIEW_WIDTH * (zoom / 100);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      try {
        setStatus("loading");
        const page = await document.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const pixelRatio = Math.min(
          MAX_RENDER_PIXEL_RATIO,
          Math.max(1, window.devicePixelRatio || 1),
          Math.max(1, MAX_RENDER_WIDTH / cssWidth),
        );
        const renderScale = (cssWidth / baseViewport.width) * pixelRatio;
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { alpha: false });
        if (!canvas || !context) return;

        renderTaskRef.current?.cancel?.();
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        renderTaskRef.current = page.render({ canvasContext: context, viewport });
        await renderTaskRef.current.promise;
        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (!cancelled && error?.name !== "RenderingCancelledException") setStatus("error");
      }
    }

    renderPage();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
    };
  }, [cssWidth, document, pageNumber]);

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[2px] bg-white shadow-[0_18px_46px_rgba(15,23,42,0.18)] ring-1 ring-slate-950/15 dark:ring-white/15"
      style={{ width: `${cssWidth}px`, aspectRatio: "210 / 297" }}
      aria-label={`PDF-pagina ${pageNumber}`}
    >
      <canvas ref={canvasRef} className={`block h-full w-full transition-opacity ${status === "ready" ? "opacity-100" : "opacity-0"}`} />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" /> Pagina laden...
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-slate-500">
          Deze pagina kon niet worden weergegeven.
        </div>
      )}
    </div>
  );
}

export default function A4PdfPreview({ url, filename = "Contract", className = "" }) {
  const [zoom, setZoom] = useState(100);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;
    let loadedDocument = null;

    async function loadDocument() {
      setStatus("loading");
      setError("");
      setPdfDocument(null);
      try {
        const pdfjs = await loadPdfRenderer();
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({ url });
        loadedDocument = await loadingTask.promise;
        if (cancelled) {
          await loadedDocument.destroy?.();
          return;
        }
        setPdfDocument(loadedDocument);
        setStatus("ready");
      } catch (loadError) {
        if (!cancelled) {
          setStatus("error");
          setError(loadError?.message || "De PDF-preview kon niet worden geladen.");
        }
      }
    }

    if (url) loadDocument();
    return () => {
      cancelled = true;
      if (loadedDocument) loadedDocument.destroy?.();
      else loadingTask?.destroy?.();
    };
  }, [url]);

  return (
    <div className={`flex min-h-0 flex-col rounded-lg border border-border bg-muted/20 p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="min-w-0 truncate">
          <span className="font-semibold uppercase tracking-wider">PDF-preview</span>
          <span className="ml-2">{filename}{pdfDocument ? ` · ${pdfDocument.numPages} pagina${pdfDocument.numPages === 1 ? "" : "'s"}` : ""}</span>
        </div>
        <DocumentPreviewZoomControls zoom={zoom} onZoomChange={setZoom} />
      </div>

      <div className="min-h-[520px] flex-1 overflow-auto overscroll-contain rounded-lg bg-slate-950/5 dark:bg-black/25">
        {status === "loading" && (
          <div className="flex h-full min-h-[520px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> PDF-preview wordt opgebouwd...
          </div>
        )}
        {status === "error" && (
          <div className="flex h-full min-h-[520px] items-center justify-center p-6 text-center">
            <div>
              <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">Voorbeeld niet beschikbaar</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        )}
        {status === "ready" && pdfDocument && (
          <div className="flex w-max min-w-full flex-col items-center gap-4 p-4">
            {Array.from({ length: pdfDocument.numPages }, (_, index) => (
              <A4PdfPage key={`${url}-${index + 1}`} document={pdfDocument} pageNumber={index + 1} zoom={zoom} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
