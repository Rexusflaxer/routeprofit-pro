import React, { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Passport photo ratio: 35mm x 45mm = 7:9
const PASSPORT_RATIO = 7 / 9;

function getCroppedBlob(image, crop, rotation) {
  const canvas = document.createElement("canvas");
  const OUTPUT_W = 350;
  const OUTPUT_H = 450;
  canvas.width = OUTPUT_W;
  canvas.height = OUTPUT_H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);

  const rad = (rotation * Math.PI) / 180;
  ctx.save();
  ctx.translate(OUTPUT_W / 2, OUTPUT_H / 2);
  ctx.rotate(rad);

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  ctx.drawImage(
    image,
    crop.x * scaleX - image.naturalWidth / 2,
    crop.y * scaleY - image.naturalHeight / 2,
    image.naturalWidth,
    image.naturalHeight
  );
  ctx.restore();

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

function isPassportRatio(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = img.width / img.height;
      resolve(Math.abs(ratio - PASSPORT_RATIO) < 0.05);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

export default function PhotoCropUpload({ onUploaded, uploading, setUploading }) {
  const [cropOpen, setCropOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [cropPos, setCropPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const ok = await isPassportRatio(file);
    if (ok) {
      // Direct upload, no crop needed
      await doUpload(file);
    } else {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setOriginalFile(file);
      setZoom(1);
      setRotation(0);
      setCropPos({ x: 0, y: 0 });
      setCropOpen(true);
    }
  };

  const doUpload = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onUploaded(file_url);
    } finally {
      setUploading(false);
    }
  };

  const handleCropConfirm = async () => {
    if (!imgRef.current) return;
    const blob = await getCroppedBlob(imgRef.current, cropPos, rotation);
    const croppedFile = new File([blob], originalFile?.name || "pasfoto.jpg", { type: "image/jpeg" });
    setCropOpen(false);
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(null);
    await doUpload(croppedFile);
  };

  // Drag to pan the image inside the crop window
  const onMouseDown = (e) => {
    setDragging(true);
    setDragStart({ x: e.clientX - cropPos.x, y: e.clientY - cropPos.y });
  };
  const onMouseMove = useCallback((e) => {
    if (!dragging || !dragStart) return;
    setCropPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [dragging, dragStart]);
  const onMouseUp = () => setDragging(false);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, onMouseMove]);

  return (
    <>
      <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/40 text-white">
        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={uploading} />
        <Upload className="h-5 w-5" />
      </label>

      <Dialog open={cropOpen} onOpenChange={open => { if (!open) { setCropOpen(false); if (imageSrc) URL.revokeObjectURL(imageSrc); setImageSrc(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Foto bijsnijden — pasfotoformaat (7:9)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Sleep de foto om het gezicht te centreren. De uitsnede is het pasfotoformaat (35×45 mm).</p>

          {/* Crop viewport */}
          <div
            ref={containerRef}
            className="relative mx-auto overflow-hidden rounded-md border border-border bg-black"
            style={{ width: 280, height: 360 }}
          >
            {/* Overlay guides */}
            <div className="pointer-events-none absolute inset-0 z-10">
              <div className="absolute inset-0 border-2 border-white/60" />
              <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/25" />
              <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/25" />
              <div className="absolute top-1/3 left-0 right-0 border-t border-white/25" />
              <div className="absolute top-2/3 left-0 right-0 border-t border-white/25" />
            </div>
            {imageSrc && (
              <img
                ref={imgRef}
                src={imageSrc}
                alt="crop"
                draggable={false}
                onMouseDown={onMouseDown}
                style={{
                  position: "absolute",
                  transform: `translate(${cropPos.x}px, ${cropPos.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: "center",
                  cursor: dragging ? "grabbing" : "grab",
                  userSelect: "none",
                  maxWidth: "none",
                  maxHeight: "none",
                  width: 280,
                }}
              />
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}><ZoomOut className="h-4 w-4" /></Button>
            <span className="text-sm text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.min(3, z + 0.1))}><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => setRotation(r => (r + 90) % 360)}><RotateCw className="h-4 w-4" /></Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCropOpen(false); if (imageSrc) URL.revokeObjectURL(imageSrc); setImageSrc(null); }}>Annuleren</Button>
            <Button onClick={handleCropConfirm} disabled={uploading}>{uploading ? "Uploaden..." : "Opslaan als pasfoto"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}