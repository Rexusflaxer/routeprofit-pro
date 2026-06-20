import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Camera } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Official Dutch passport photo: 35mm × 45mm → ratio 7:9
const PHOTO_ASPECT = 7 / 9;
const OUTPUT_W = 350;
const OUTPUT_H = 450;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getInitialPhotoCrop(image) {
  const aspect = image.naturalWidth / image.naturalHeight;
  if (aspect > PHOTO_ASPECT) {
    const width = PHOTO_ASPECT / aspect;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = aspect / PHOTO_ASPECT;
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

function getCroppedBlob(image, crop) {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_W;
  canvas.height = OUTPUT_H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);

  ctx.drawImage(
    image,
    crop.x * image.naturalWidth,
    crop.y * image.naturalHeight,
    crop.width * image.naturalWidth,
    crop.height * image.naturalHeight,
    0,
    0,
    OUTPUT_W,
    OUTPUT_H
  );

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
  const imgRef = useRef(null);
  const imageFrameRef = useRef(null);
  const interactionLayerRef = useRef(null);
  const dragRef = useRef(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 1, height: 1 });

  useEffect(() => {
    if (open) setCrop({ x: 0, y: 0, width: 1, height: 1 });
  }, [open, imageSrc]);

  const handleImageLoad = () => {
    if (imgRef.current) setCrop(getInitialPhotoCrop(imgRef.current));
  };

  const getPointerRatio = (event) => {
    const rect = imageFrameRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const startCropDrag = (mode, event) => {
    const pointer = getPointerRatio(event);
    if (!pointer) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      start: pointer,
      origin: crop,
    };
    interactionLayerRef.current?.setPointerCapture?.(event.pointerId);
  };

  const resizeWithAspect = (mode, origin, pointer) => {
    let anchorX;
    let anchorY;
    let draggedX = pointer.x;
    let draggedY = pointer.y;

    if (mode.includes("w")) anchorX = origin.x + origin.width;
    else anchorX = origin.x;

    if (mode.includes("n")) anchorY = origin.y + origin.height;
    else anchorY = origin.y;

    const directionX = mode.includes("w") ? -1 : 1;
    const directionY = mode.includes("n") ? -1 : 1;
    let width = Math.abs(draggedX - anchorX);
    let height = width / PHOTO_ASPECT;

    if (Math.abs(draggedY - anchorY) > height) {
      height = Math.abs(draggedY - anchorY);
      width = height * PHOTO_ASPECT;
    }

    const maxWidth = directionX > 0 ? 1 - anchorX : anchorX;
    const maxHeight = directionY > 0 ? 1 - anchorY : anchorY;
    const maxWidthByHeight = maxHeight * PHOTO_ASPECT;
    width = clamp(width, 0.08, Math.min(maxWidth, maxWidthByHeight));
    height = width / PHOTO_ASPECT;

    const x = directionX > 0 ? anchorX : anchorX - width;
    const y = directionY > 0 ? anchorY : anchorY - height;
    return { x, y, width, height };
  };

  const updateCrop = (mode, origin, start, pointer) => {
    if (mode === "move") {
      return {
        ...origin,
        x: clamp(origin.x + pointer.x - start.x, 0, 1 - origin.width),
        y: clamp(origin.y + pointer.y - start.y, 0, 1 - origin.height),
      };
    }
    return resizeWithAspect(mode, origin, pointer);
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const pointer = getPointerRatio(event);
    if (!pointer) return;
    event.preventDefault();
    setCrop(updateCrop(drag.mode, drag.origin, drag.start, pointer));
  };

  const endDrag = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      interactionLayerRef.current?.releasePointerCapture?.(event.pointerId);
      dragRef.current = null;
    }
  };

  const resetCrop = () => {
    if (imgRef.current) {
      setCrop(getInitialPhotoCrop(imgRef.current));
    };
  };

  const handleConfirm = async () => {
    if (!imgRef.current) return;
    const blob = await getCroppedBlob(imgRef.current, crop);
    onConfirm(blob);
  };

  const cropStyle = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };
  const shadeStyle = {
    top: { left: 0, top: 0, width: "100%", height: `${crop.y * 100}%` },
    bottom: { left: 0, top: `${(crop.y + crop.height) * 100}%`, width: "100%", height: `${(1 - crop.y - crop.height) * 100}%` },
    left: { left: 0, top: `${crop.y * 100}%`, width: `${crop.x * 100}%`, height: `${crop.height * 100}%` },
    right: { left: `${(crop.x + crop.width) * 100}%`, top: `${crop.y * 100}%`, width: `${(1 - crop.x - crop.width) * 100}%`, height: `${crop.height * 100}%` },
  };
  const handles = [
    { mode: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
    { mode: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
    { mode: "sw", className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize" },
    { mode: "se", className: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Foto bijsnijden — 35 × 45 mm pasfotoformaat</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Sleep de hoeken om de uitsnede aan te passen. Sleep het kader zelf om de pasfoto te verplaatsen.
        </p>

        <div className="flex min-h-72 items-center justify-center rounded-lg border border-border bg-slate-950 p-2">
          <div ref={imageFrameRef} className="relative max-h-[58vh] max-w-full touch-none select-none">
            {imageSrc && (
              <img
                ref={imgRef}
                src={imageSrc}
                alt="crop preview"
                draggable={false}
                onLoad={handleImageLoad}
                className="block max-h-[58vh] max-w-full rounded-md object-contain"
              />
            )}
            <div
              ref={interactionLayerRef}
              className="absolute inset-0"
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div className="pointer-events-none absolute bg-black/55" style={shadeStyle.top} />
              <div className="pointer-events-none absolute bg-black/55" style={shadeStyle.bottom} />
              <div className="pointer-events-none absolute bg-black/55" style={shadeStyle.left} />
              <div className="pointer-events-none absolute bg-black/55" style={shadeStyle.right} />
              <div
                className="absolute cursor-move border-2 border-primary bg-primary/5 shadow-[0_0_0_1px_rgba(255,255,255,0.55)]"
                style={cropStyle}
                onPointerDown={event => startCropDrag("move", event)}
              >
                <div className="pointer-events-none absolute left-1/3 top-0 h-full w-px bg-white/45" />
                <div className="pointer-events-none absolute left-2/3 top-0 h-full w-px bg-white/45" />
                <div className="pointer-events-none absolute left-0 top-1/3 h-px w-full bg-white/45" />
                <div className="pointer-events-none absolute left-0 top-2/3 h-px w-full bg-white/45" />
                <div className="pointer-events-none absolute left-[20%] right-[20%] top-[8%] bottom-[30%] rounded-full border border-dashed border-white/45" />
                {handles.map(handle => (
                  <button
                    key={handle.mode}
                    type="button"
                    aria-label={`Pasfotohoek ${handle.mode} verplaatsen`}
                    className={`absolute h-5 w-5 rounded-sm border-2 border-white bg-primary shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${handle.className}`}
                    onPointerDown={event => startCropDrag(handle.mode, event)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetCrop}>Uitsnede resetten</Button>
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
