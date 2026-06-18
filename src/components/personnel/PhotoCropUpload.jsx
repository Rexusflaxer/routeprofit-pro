import React, { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, ZoomIn, ZoomOut, RotateCw, Camera } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Official Dutch passport photo: 35mm × 45mm → ratio 7:9
const CROP_W = 280;
const CROP_H = 360; // 280 * 9/7

function getCroppedBlob(image, offsetX, offsetY, zoom, rotation) {
  const OUTPUT_W = 350;
  const OUTPUT_H = 450;
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_W;
  canvas.height = OUTPUT_H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);

  const scaleX = image.naturalWidth / CROP_W;
  const scaleY = image.naturalHeight / CROP_H;

  // We render the image into the canvas scaled to output size,
  // with the same pan/zoom/rotation the user set.
  const rad = (rotation * Math.PI) / 180;
  ctx.save();
  ctx.translate(OUTPUT_W / 2, OUTPUT_H / 2);
  ctx.rotate(rad);
  ctx.scale(zoom, zoom);
  ctx.drawImage(
    image,
    -(OUTPUT_W / 2) - offsetX * (OUTPUT_W / CROP_W),
    -(OUTPUT_H / 2) - offsetY * (OUTPUT_H / CROP_H),
    image.naturalWidth * (OUTPUT_W / (CROP_W)),
    image.naturalHeight * (OUTPUT_H / (CROP_H))
  );
  ctx.restore();

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

// ── Info dialog (step 1) ──────────────────────────────────────────────────────
function PhotoInfoDialog({ open, onOpenChange, onFileSelected }) {
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    onFileSelected(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Pasfoto uploaden
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm space-y-2">
            <p className="font-semibold text-foreground">Vereisten officiële pasfoto (Nederland):</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>Formaat: <strong className="text-foreground">35 × 45 mm</strong> (breedte × hoogte)</li>
              <li>Hoofd recht van voren, neutrale uitdrukking</li>
              <li>Witte of lichtgrijze achtergrond</li>
              <li>Geen zonnebril, geen hoed of pet</li>
              <li>Scherpe, goede belichting</li>
            </ul>
          </div>

          <p className="text-sm text-muted-foreground">
            Na het selecteren van een foto kun je deze bijsnijden tot het juiste formaat.
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Annuleren
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Foto selecteren
          </Button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Crop dialog (step 2) ──────────────────────────────────────────────────────
function PhotoCropDialog({ open, onOpenChange, imageSrc, onConfirm, uploading }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const imgRef = useRef(null);

  // Reset state when a new image opens
  useEffect(() => {
    if (open) { setZoom(1); setRotation(0); setOffset({ x: 0, y: 0 }); }
  }, [open, imageSrc]);

  const onMouseDown = (e) => {
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const onMouseMove = useCallback((e) => {
    if (!dragging || !dragStart) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);
  const onMouseUp = useCallback(() => setDragging(false), []);

  // Touch support
  const onTouchStart = (e) => {
    const t = e.touches[0];
    setDragging(true);
    setDragStart({ x: t.clientX - offset.x, y: t.clientY - offset.y });
  };
  const onTouchMove = useCallback((e) => {
    if (!dragging || !dragStart) return;
    const t = e.touches[0];
    setOffset({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y });
  }, [dragging, dragStart]);
  const onTouchEnd = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("touchend", onTouchEnd);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [dragging, onMouseMove, onMouseUp, onTouchMove, onTouchEnd]);

  const handleConfirm = async () => {
    if (!imgRef.current) return;
    const blob = await getCroppedBlob(imgRef.current, offset.x, offset.y, zoom, rotation);
    onConfirm(blob);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Foto bijsnijden — 35 × 45 mm pasfotoformaat</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Sleep de foto om het gezicht te centreren binnen het kader. Gebruik zoom en rotatie om de foto aan te passen.
        </p>

        {/* Crop viewport */}
        <div
          className="relative mx-auto overflow-hidden rounded-md border-2 border-primary bg-black select-none"
          style={{ width: CROP_W, height: CROP_H }}
        >
          {/* Rule-of-thirds grid overlay */}
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute inset-0 border-2 border-white/70" />
            <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/20" />
            <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/20" />
            <div className="absolute top-1/3 left-0 right-0 border-t border-white/20" />
            <div className="absolute top-2/3 left-0 right-0 border-t border-white/20" />
            {/* Head guide */}
            <div className="absolute left-[20%] right-[20%] top-[8%] bottom-[30%] border border-dashed border-white/40 rounded-full" />
          </div>

          {imageSrc && (
            <img
              ref={imgRef}
              src={imageSrc}
              alt="crop preview"
              draggable={false}
              onMouseDown={onMouseDown}
              onTouchStart={onTouchStart}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: "center",
                cursor: dragging ? "grabbing" : "grab",
                maxWidth: "none",
                width: CROP_W,
              }}
            />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.max(0.3, parseFloat((z - 0.1).toFixed(1))))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground w-14 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.min(4, parseFloat((z + 0.1).toFixed(1))))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setRotation(r => (r + 90) % 360)}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={handleConfirm} disabled={uploading}>
            {uploading ? "Uploaden..." : "Opslaan als pasfoto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function PhotoCropUpload({ onUploaded, uploading, setUploading }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);

  const handleFileSelected = (file) => {
    setInfoOpen(false);
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCropOpen(true);
  };

  const handleCropConfirm = async (blob) => {
    setCropOpen(false);
    if (imageSrc) { URL.revokeObjectURL(imageSrc); setImageSrc(null); }
    setUploading(true);
    try {
      const file = new File([blob], "pasfoto.jpg", { type: "image/jpeg" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onUploaded(file_url);
    } finally {
      setUploading(false);
    }
  };

  const handleCropClose = (open) => {
    if (!open) {
      setCropOpen(false);
      if (imageSrc) { URL.revokeObjectURL(imageSrc); setImageSrc(null); }
    }
  };

  return (
    <>
      {/* Overlay button on the photo */}
      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        disabled={uploading}
        className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 text-white hover:bg-black/60 transition-colors"
      >
        {uploading
          ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          : <Upload className="h-4 w-4" />
        }
      </button>

      <PhotoInfoDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        onFileSelected={handleFileSelected}
      />

      <PhotoCropDialog
        open={cropOpen}
        onOpenChange={handleCropClose}
        imageSrc={imageSrc}
        onConfirm={handleCropConfirm}
        uploading={uploading}
      />
    </>
  );
}