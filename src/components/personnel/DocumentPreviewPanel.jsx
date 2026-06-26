import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw, RefreshCw } from "lucide-react";

export default function DocumentPreviewPanel({ url, isPdf, fileName, onReplace }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(null);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom(z => Math.min(5, Math.max(1, z + delta)));
  };

  const onPointerDown = (e) => {
    if (zoom <= 1) return;
    e.preventDefault();
    panRef.current = { startX: e.clientX - pan.x, startY: e.clientY - pan.y, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!panRef.current || panRef.current.pointerId !== e.pointerId) return;
    setPan({ x: e.clientX - panRef.current.startX, y: e.clientY - panRef.current.startY });
  };

  const onPointerUp = (e) => {
    if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document controleren</p>
        <div className="flex items-center gap-1">
          {!isPdf && (
            <>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setZoom(z => Math.min(5, z + 0.3))} title="Inzoomen">
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setZoom(z => Math.max(1, z - 0.3))} title="Uitzoomen">
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={resetView} title="Reset">
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          {onReplace && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onReplace} title="Vervangen">
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Vervangen
            </Button>
          )}
        </div>
      </div>

      <div
        className="relative flex-1 min-h-[420px] max-h-[560px] overflow-hidden rounded-md bg-muted/30 border border-border"
        onWheel={!isPdf ? onWheel : undefined}
        style={{ cursor: !isPdf && zoom > 1 ? "grab" : "default" }}
      >
        {isPdf ? (
          <iframe src={url} title={fileName || "PDF preview"} className="w-full h-full border-0" />
        ) : (
          <img
            src={url}
            alt={fileName || "Document"}
            draggable="false"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: panRef.current ? "none" : "transform 0.15s ease",
              userSelect: "none",
              cursor: zoom > 1 ? "grabbing" : "default",
            }}
            className="w-full h-full object-contain select-none"
          />
        )}
      </div>

      <p className="text-xs text-muted-foreground truncate">{fileName}</p>
    </div>
  );
}