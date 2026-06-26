import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Check, X, Globe, AlertTriangle, ImageIcon, Crop, Loader2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { buildAuditMetadata } from "@/lib/auditTrail";

// EU/EEA nationalities that can carry an identity card
const EU_EEA_NATIONALITIES = new Set([
  "Nederlandse", "Belgische", "Duitse", "Franse", "Italiaanse", "Spaanse", "Portugese",
  "Griekse", "Oostenrijkse", "Zweedse", "Finse", "Deense", "Ierse", "Luxemburgse",
  "Poolse", "Tsjechische", "Slowaakse", "Hongaarse", "Roemeense", "Bulgaarse",
  "Kroatische", "Sloveense", "Estse", "Letse", "Litouwse", "Maltese",
  "Cypriotische", "Zwitserse", "Noorse", "IJslandse",
]);

const NATIONALITY_TO_COUNTRY = {
  "Nederlandse": "Nederland", "Belgische": "België", "Duitse": "Duitsland",
  "Franse": "Frankrijk", "Italiaanse": "Italië", "Spaanse": "Spanje",
  "Portugese": "Portugal", "Griekse": "Griekenland", "Oostenrijkse": "Oostenrijk",
  "Zweedse": "Zweden", "Finse": "Finland", "Deense": "Denemarken",
  "Ierse": "Ierland", "Luxemburgse": "Luxemburg", "Poolse": "Polen",
  "Tsjechische": "Tsjechië", "Slowaakse": "Slowakije", "Hongaarse": "Hongarije",
  "Roemeense": "Roemenië", "Bulgaarse": "Bulgarije", "Kroatische": "Kroatië",
  "Sloveense": "Slovenië", "Estse": "Estland", "Letse": "Letland",
  "Litouwse": "Litouwen", "Maltese": "Malta", "Cypriotische": "Cyprus",
  "Zwitserse": "Zwitserland", "Noorse": "Noorwegen", "IJslandse": "IJsland",
  "Turkse": "Turkije", "Marokkaanse": "Marokko", "Algerijnse": "Algerije",
  "Tunesische": "Tunesië", "Egyptische": "Egypte", "Nigeriaanse": "Nigeria",
  "Ghanese": "Ghana", "Somalische": "Somalië", "Eritrese": "Eritrea",
  "Ethiopische": "Ethiopië", "Surinaamse": "Suriname", "Indonesische": "Indonesië",
  "Chinese": "China", "Indiaase": "India", "Pakistaanse": "Pakistan",
  "Syrische": "Syrië", "Iraakse": "Irak", "Iraanse": "Iran",
  "Afghaanse": "Afghanistan", "Oekraïense": "Oekraïne", "Russische": "Rusland",
  "Kazachse": "Kazachstan", "Congolese": "Congo", "Soedanese": "Soedan",
  "Libische": "Libië", "Jordaanse": "Jordanië", "Libanese": "Libanon",
  "Braziliaanse": "Brazilië", "Mexicaanse": "Mexico", "Colombiaanse": "Colombia",
};

const ALL_COUNTRIES = Object.values(NATIONALITY_TO_COUNTRY)
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort((a, b) => a.localeCompare(b, "nl"));

const DOCUMENT_TYPE_META = {
  passport: {
    label: "Paspoort",
    shortLabel: "paspoort",
    category: "identity_document",
    numberPlaceholder: "Bijv. NL1234567",
    typeLabel: country => `Paspoort (${country})`,
  },
  id_card: {
    label: "Identiteitskaart",
    shortLabel: "identiteitskaart",
    category: "identity_document",
    numberPlaceholder: "Bijv. ID1234567NL",
    typeLabel: country => `ID-kaart (${country})`,
  },
  drivers_license: {
    label: "Rijbewijs",
    shortLabel: "rijbewijs",
    category: "drivers_license",
    numberPlaceholder: "Bijv. 1234567890",
    typeLabel: country => `Rijbewijs (${country})`,
  },
};

function storedDocumentKind(doc) {
  if (doc?.metadata?.doc_type) return doc.metadata.doc_type;
  if (doc?.category === "drivers_license") return "drivers_license";
  const type = String(doc?.document_type || "").toLowerCase();
  if (type.includes("rijbewijs")) return "drivers_license";
  if (type.includes("id-kaart") || type.includes("identiteitskaart")) return "id_card";
  if (type.includes("paspoort")) return "passport";
  return "";
}

function isIdentityLikeDocument(doc) {
  return doc?.category === "identity_document" || doc?.category === "drivers_license";
}

function normalizeDocumentNumber(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeBsn(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanCountryLabel(value) {
  const label = String(value || "").trim();
  if (!label || /^(onbekend|unknown|null|undefined)$/i.test(label)) return "";
  return label;
}

function normalizeMatchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function matchTokens(value) {
  return normalizeMatchText(value)
    .split(/\s+/)
    .filter(token => token.length > 1);
}

function namesOverlap(expected, recognized) {
  const expectedTokens = matchTokens(expected);
  const recognizedTokens = matchTokens(recognized);
  if (!expectedTokens.length || !recognizedTokens.length) return null;

  const expectedText = expectedTokens.join(" ");
  const recognizedText = recognizedTokens.join(" ");
  if (expectedText === recognizedText || expectedText.includes(recognizedText) || recognizedText.includes(expectedText)) return true;
  return expectedTokens.some(token => recognizedTokens.includes(token));
}

function firstNameMatches(personnel, recognizedNames) {
  const candidates = [
    personnel?.legal_first_names,
    personnel?.first_name,
    personnel?.call_name,
  ].filter(Boolean);
  if (!candidates.length || !matchTokens(recognizedNames).length) return null;

  return candidates.some(candidate => {
    const expectedFirst = matchTokens(candidate)[0];
    const recognized = matchTokens(recognizedNames);
    return expectedFirst && recognized.includes(expectedFirst);
  });
}

function buildPersonMatchCheck(personnel, recognizedPerson) {
  if (!personnel || !recognizedPerson) return { status: "unknown", issues: [] };

  const issues = [];
  const recognizedBirthDate = recognizedPerson.birth_date || "";
  const expectedBirthDate = personnel.date_of_birth || "";
  if (expectedBirthDate && recognizedBirthDate && expectedBirthDate !== recognizedBirthDate) {
    issues.push({
      severity: "critical",
      label: "Geboortedatum komt niet overeen",
      detail: `Profiel: ${expectedBirthDate}. Document: ${recognizedBirthDate}.`,
    });
  }

  const expectedLastName = [personnel.name_prefix, personnel.last_name].filter(Boolean).join(" ") || personnel.name || "";
  const lastNameMatch = namesOverlap(expectedLastName, recognizedPerson.last_name);
  if (lastNameMatch === false) {
    issues.push({
      severity: "critical",
      label: "Achternaam komt niet overeen",
      detail: `Profiel: ${expectedLastName}. Document: ${recognizedPerson.last_name}.`,
    });
  }

  const firstNameMatch = firstNameMatches(personnel, recognizedPerson.given_names);
  if (firstNameMatch === false) {
    issues.push({
      severity: "warning",
      label: "Voornamen lijken af te wijken",
      detail: `Profiel: ${personnel.legal_first_names || personnel.first_name || personnel.call_name}. Document: ${recognizedPerson.given_names}.`,
    });
  }

  if (!issues.length) return { status: "matched", issues };
  return {
    status: issues.some(issue => issue.severity === "critical") ? "blocked" : "review",
    issues,
  };
}

// ─── Image Crop Dialog ─────────────────────────────────────────────────────────

function ImageCropDialog({ open, onClose, imageSrc, onCropped, label }) {
  const imageFrameRef = useRef(null);
  const interactionLayerRef = useRef(null);
  const [imgEl, setImgEl] = useState(null);
  const [imageError, setImageError] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 1, height: 1 });
  const dragRef = useRef(null);

  useEffect(() => {
    if (!imageSrc || !open) return;
    setImgEl(null);
    setImageError("");
    setCrop({ x: 0, y: 0, width: 1, height: 1 });
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
    };
    img.onerror = () => setImageError("De afbeelding kon niet worden geopend. Gebruik een JPG of PNG.");
    img.src = imageSrc;
  }, [imageSrc, open]);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const minCropSize = 0.05;

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

  const updateCrop = (mode, origin, start, pointer) => {
    const dx = pointer.x - start.x;
    const dy = pointer.y - start.y;
    let left = origin.x;
    let top = origin.y;
    let right = origin.x + origin.width;
    let bottom = origin.y + origin.height;

    if (mode === "move") {
      const nextX = clamp(origin.x + dx, 0, 1 - origin.width);
      const nextY = clamp(origin.y + dy, 0, 1 - origin.height);
      return { ...origin, x: nextX, y: nextY };
    }

    if (mode.includes("w")) left = clamp(origin.x + dx, 0, right - minCropSize);
    if (mode.includes("e")) right = clamp(origin.x + origin.width + dx, left + minCropSize, 1);
    if (mode.includes("n")) top = clamp(origin.y + dy, 0, bottom - minCropSize);
    if (mode.includes("s")) bottom = clamp(origin.y + origin.height + dy, top + minCropSize, 1);

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
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

  const applyCrop = () => {
    if (!imgEl) return;
    const sourceX = crop.x * imgEl.width;
    const sourceY = crop.y * imgEl.height;
    const sourceW = crop.width * imgEl.width;
    const sourceH = crop.height * imgEl.height;

    const offscreen = document.createElement("canvas");
    offscreen.width = Math.max(1, Math.round(sourceW));
    offscreen.height = Math.max(1, Math.round(sourceH));
    const ctx = offscreen.getContext("2d");
    ctx.drawImage(imgEl, sourceX, sourceY, sourceW, sourceH, 0, 0, offscreen.width, offscreen.height);
    offscreen.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      onCropped(url, blob);
      onClose();
    }, "image/jpeg", 0.92);
  };

  const resetCrop = () => {
    setCrop({ x: 0, y: 0, width: 1, height: 1 });
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
    {
      mode: "nw",
      className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
      cornerClass: "left-1/2 top-1/2 border-l-[5px] border-t-[5px] rounded-tl-sm",
    },
    {
      mode: "ne",
      className: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
      cornerClass: "right-1/2 top-1/2 border-r-[5px] border-t-[5px] rounded-tr-sm",
    },
    {
      mode: "sw",
      className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
      cornerClass: "bottom-1/2 left-1/2 border-b-[5px] border-l-[5px] rounded-bl-sm",
    },
    {
      mode: "se",
      className: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
      cornerClass: "bottom-1/2 right-1/2 border-b-[5px] border-r-[5px] rounded-br-sm",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="w-4 h-4" /> Bijsnijden — {label}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground mb-3">
          Sleep de hoeken van het kader om de uitsnede aan te passen. Sleep het kader zelf om de uitsnede te verplaatsen.
        </p>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          {imageError ? (
            <p className="text-sm text-destructive">{imageError}</p>
          ) : !imgEl ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Afbeelding laden...
            </div>
          ) : (
            <div className="flex min-h-64 items-center justify-center rounded-md bg-slate-950 p-2">
              <div
                ref={imageFrameRef}
                className="relative inline-block w-fit max-h-[58vh] max-w-full touch-none select-none leading-none"
              >
                <img
                  src={imageSrc}
                  alt=""
                  draggable="false"
                  className="block max-h-[58vh] max-w-full rounded-md object-contain"
                />
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
                    {handles.map(handle => (
                      <button
                        key={handle.mode}
                        type="button"
                        tabIndex={-1}
                        aria-label={`Uitsnedehoek ${handle.mode} verplaatsen`}
                        className={`absolute h-8 w-8 appearance-none rounded-none border-0 bg-transparent p-0 shadow-none outline-none ring-0 hover:bg-transparent focus:bg-transparent focus:outline-none focus:ring-0 active:bg-transparent ${handle.className}`}
                        onPointerDown={event => startCropDrag(handle.mode, event)}
                      >
                        <span className={`pointer-events-none absolute block h-5 w-5 border-primary bg-transparent drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)] ${handle.cornerClass}`} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-between items-center mt-3">
          <Button variant="outline" size="sm" onClick={resetCrop}>
            Uitsnede resetten
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
            <Button size="sm" onClick={applyCrop} disabled={!imgEl || !!imageError}>
              <Check className="w-3.5 h-3.5 mr-1" /> Toepassen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Document Side Upload ──────────────────────────────────────────────────────

function DocumentSideUpload({ label, hint, previewUrl, onFileSelected, uploading, required }) {
  const [cropOpen, setCropOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setRawImageSrc(e.target.result);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleCropped = async (objectUrl, blob) => {
    const file = new File([blob], "document.jpg", { type: "image/jpeg" });
    onFileSelected(file, objectUrl);
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs font-medium text-muted-foreground block">{label}{required && <span className="text-destructive ml-1">*</span>}</label>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/75">{hint}</p>}
      </div>
      <div
        onClick={() => fileInputRef.current?.click()}
        className="relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary bg-muted/20 hover:bg-accent/30 cursor-pointer transition-colors min-h-[120px] overflow-hidden"
      >
        {previewUrl ? (
          <>
            <img src={previewUrl} alt={label} className="w-full h-40 object-contain" />
            <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
              <span className="text-xs font-medium text-white bg-black/50 rounded px-2 py-1">Vervangen</span>
            </div>
          </>
        ) : (
          <>
            <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">Klik om te uploaden</span>
            <span className="text-[10px] text-muted-foreground/60">JPG of PNG</span>
          </>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <ImageCropDialog
        open={cropOpen}
        onClose={() => setCropOpen(false)}
        imageSrc={rawImageSrc}
        onCropped={handleCropped}
        label={label}
      />
    </div>
  );
}

// ─── Upload Guidance ──────────────────────────────────────────────────────────

function DrivingLicenseGuideImage({ side = "front" }) {
  const isBack = side === "back";
  return (
    <div className="flex h-36 w-[260px] items-center justify-center overflow-hidden rounded border border-border bg-white shadow-sm">
      <img
        src={isBack ? "/identity-guides/driving-license-back.jpg" : "/identity-guides/driving-license-front.jpg"}
        alt={isBack ? "Voorbeeld achterkant Nederlands rijbewijs" : "Voorbeeld voorkant Nederlands rijbewijs"}
        className={`h-full w-full object-contain ${isBack ? "scale-[1.14]" : ""}`}
        draggable="false"
      />
    </div>
  );
}

function UploadGuideCard({ docType, frontUpload, backUpload }) {
  const isPassport = docType === "passport";
  const isIdCard = docType === "id_card";
  const isDriversLicense = docType === "drivers_license";

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 w-full">
      {/* Rij 1: uploadvak links + voorbeeldafbeelding rechts */}
      <div className="flex items-stretch gap-4">
        <div className="w-1/2 flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Voorkant</p>
          {frontUpload}
        </div>
        <div className="w-px bg-border self-stretch" />
        <div className="w-1/2 flex flex-col">
          <div className="flex flex-1 items-center justify-center p-2 min-h-[120px]">
            {isPassport ? (
              <img
                src="/identity-guides/passport-holder-page-model-2024.jpg"
                alt="Voorbeeld voorkant paspoort"
                className="max-h-36 w-auto rounded border border-[#6b1734] bg-white object-contain shadow-sm"
                draggable="false"
              />
            ) : isDriversLicense ? (
              <DrivingLicenseGuideImage side="front" />
            ) : isIdCard ? (
              <img
                src="/identity-guides/id-card-front-model-2024.jpg"
                alt="Voorbeeld voorkant Nederlandse identiteitskaart"
                className="max-h-36 w-auto rounded border border-border bg-white object-contain shadow-sm"
                draggable="false"
              />
            ) : (
              null
            )}
          </div>
          <div className="px-2 py-1.5">
            <p className="text-[11px] leading-snug text-muted-foreground">
              {isPassport
                ? "Houderpagina met pasfoto, persoonsgegevens, documentnummer en MRZ."
                : isDriversLicense
                  ? "Voorzijde met pasfoto, documentnummer, geldigheid en categorieen."
                : "Voorzijde met pasfoto en kaartgegevens."}
            </p>
          </div>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Rij 2: uploadvak links + voorbeeldafbeelding rechts */}
      <div className="flex items-stretch gap-4">
        <div className="w-1/2 flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Achterkant</p>
          {backUpload}
        </div>
        <div className="w-px bg-border self-stretch" />
        <div className="w-1/2 flex flex-col">
          <div className="flex flex-1 items-center justify-center p-2 min-h-[120px]">
            {isPassport ? (
              <img
                src="/identity-guides/passport-back-page-2021.jpg"
                alt="Voorbeeld achterkant paspoort"
                className="max-h-36 w-auto rounded border border-[#6b1734] bg-white object-contain shadow-sm"
                draggable="false"
              />
            ) : isDriversLicense ? (
              <DrivingLicenseGuideImage side="back" />
            ) : isIdCard ? (
              <img
                src="/identity-guides/id-card-back-model-2024.jpg"
                alt="Voorbeeld achterkant Nederlandse identiteitskaart"
                className="max-h-36 w-auto rounded border border-border bg-white object-contain shadow-sm"
                draggable="false"
              />
            ) : (
              null
            )}
          </div>
          <div className="px-2 py-1.5">
            <p className="text-[11px] leading-snug text-muted-foreground">
              {isPassport
                ? "BSN-/titelpagina met persoonsnummer en documentnummer."
                : isDriversLicense
                  ? "Achterzijde met BSN, QR-code en categoriegegevens."
                : "Achterzijde met BSN en controlegegevens."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CriticalUploadNotice({ quality }) {
  if (!quality || quality.status !== "poor") return null;

  const failedChecks = (quality.checks || [])
    .filter(check => check.status === "fail")
    .slice(0, 2);

  return (
    <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-950 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-xs font-semibold">Nieuwe upload aanbevolen</p>
          <p className="mt-0.5 text-xs opacity-85">
            De scan lijkt onvoldoende bruikbaar. Maak bij voorkeur een scherpere foto of scan voordat je opslaat.
          </p>
          {failedChecks.length > 0 && (
            <p className="mt-1 text-xs opacity-75">
              Aandachtspunt: {failedChecks.map(check => check.detail || check.label).join(", ")}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function IdentityMatchNotice({ match }) {
  if (!match || !["blocked", "review"].includes(match.status) || !match.issues?.length) return null;

  const isBlocked = match.status === "blocked";
  return (
    <div className={`mt-4 rounded-md border px-3 py-2 ${
      isBlocked
        ? "border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100"
        : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100"
    }`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-xs font-semibold">
            {isBlocked ? "Document lijkt bij een andere medewerker te horen" : "Controleer documenthouder"}
          </p>
          <p className="mt-0.5 text-xs opacity-85">
            {isBlocked
              ? "De herkende persoonsgegevens komen niet overeen met dit medewerkersprofiel. Controleer of het juiste document is geupload."
              : "Niet alle herkende persoonsgegevens sluiten duidelijk aan op dit profiel. Controleer dit voordat je opslaat."}
          </p>
          <div className="mt-1 space-y-0.5 text-xs opacity-85">
            {match.issues.map(issue => (
              <p key={`${issue.label}-${issue.detail}`}>
                {issue.label}: {issue.detail}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function IssuingCountryField({ value, onChange, error, defaultCountry }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const inputRef = React.useRef(null);
  const filtered = query.trim()
    ? ALL_COUNTRIES.filter(c => c.toLowerCase().includes(query.toLowerCase()))
    : ALL_COUNTRIES;

  const handleSelect = (country) => {
    onChange(country);
    setQuery(country);
    setOpen(false);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false);
      setQuery(value || "");
    }, 150);
  };

  const handleFocus = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setOpen(true);
  };

  React.useEffect(() => {
    setQuery(value || "");
  }, [value]);

  return (
    <div className="relative">
      <label className="text-xs text-muted-foreground mb-1 block">Uitgevend land <span className="text-destructive">*</span></label>
      <Input
        ref={inputRef}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Typ een land..."
        className={`h-8 text-sm ${error ? "border-destructive" : ""}`}
      />
      {open && filtered.length > 0 && (
        <div style={dropdownStyle} className="max-h-48 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg text-sm">
          {filtered.slice(0, 30).map(country => (
            <button key={country} type="button" onMouseDown={() => handleSelect(country)}
              className={`flex items-center w-full px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground transition-colors ${country === value ? "bg-accent/60 font-medium" : ""}`}>
              {country}
              {country === defaultCountry && <span className="ml-2 text-[10px] text-muted-foreground">(standaard)</span>}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

// ─── Document Photo Viewer (zoom + pan) ───────────────────────────────────────

function DocumentPhotoViewer({ images }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(null);
  const containerRef = useRef(null);

  const current = images[index];

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Reset when switching photos
  const goTo = (i) => { setIndex(i); resetView(); };

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
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upload controleren</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setZoom(z => Math.min(5, z + 0.3))} title="Inzoomen">
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setZoom(z => Math.max(1, z - 0.3))} title="Uitzoomen">
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={resetView} title="Reset">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 min-h-[160px] max-h-[260px] overflow-hidden rounded-md bg-muted/30 border border-border"
        onWheel={onWheel}
        style={{ cursor: zoom > 1 ? "grab" : "default" }}
      >
        <img
          src={current.src}
          alt={current.label}
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
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">{current.label}</p>
        {images.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => goTo((index - 1 + images.length) % images.length)}>
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <span className="text-xs text-muted-foreground">{index + 1}/{images.length}</span>
            <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => goTo((index + 1) % images.length)}>
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function WizardSteps({ step, labels }) {
  return (
    <div className="flex items-center gap-1 mb-4">
      {labels.map((label, i) => (
        <React.Fragment key={label}>
          <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-colors ${
            i + 1 === step ? "bg-primary text-primary-foreground" :
            i + 1 < step ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" :
            "text-muted-foreground"}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i + 1 === step ? "bg-primary-foreground text-primary" :
              i + 1 < step ? "text-green-700 dark:text-green-300" :
              "border border-muted-foreground/30 text-muted-foreground"}`}>
              {i + 1 < step ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : i + 1}
            </span>
            {label}
          </div>
          {i < labels.length - 1 && (
            <div className={`h-px flex-1 ${i + 1 < step ? "bg-green-200 dark:bg-green-900" : "bg-border"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main Wizard ───────────────────────────────────────────────────────────────

export default function IdentityDocumentWizard({ personnelId, personnel = null, nationality, onClose, onSaved, isArchiveEntry = false, initialDocType = null, auditActors = [] }) {
  const queryClient = useQueryClient();
  const normalizedInitialDocType = DOCUMENT_TYPE_META[initialDocType] ? initialDocType : null;
  const docTypeLocked = Boolean(normalizedInitialDocType);
  const [step, setStep] = useState(normalizedInitialDocType ? 2 : 1);
  const [docType, setDocType] = useState(normalizedInitialDocType);
  const [form, setForm] = useState({
    document_number: "",
    bsn: "",
    valid_from: "",
    valid_until: "",
    issuing_country: cleanCountryLabel(NATIONALITY_TO_COUNTRY[nationality] || nationality),
    issuing_authority: "",
  });
  const [errors, setErrors] = useState({});
  const [frontFile, setFrontFile] = useState(null);
  const [frontPreview, setFrontPreview] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [backPreview, setBackPreview] = useState(null);
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recognizedUploadKey, setRecognizedUploadKey] = useState("");
  const [recognizedPerson, setRecognizedPerson] = useState(null);
  const [scanQuality, setScanQuality] = useState(null);
  const latestUploadKeyRef = useRef("");

  const isEuEea = EU_EEA_NATIONALITIES.has(nationality);
  const isDutch = nationality === "Nederlandse";
  const isNonEu = !!nationality && !isEuEea;
  const nationalityLabel = cleanCountryLabel(nationality);
  const countryLabel = cleanCountryLabel(NATIONALITY_TO_COUNTRY[nationality] || nationality);
  const passportChoiceLabel = countryLabel ? `${countryLabel} paspoort` : "";
  const idCardChoiceLabel = countryLabel ? `${countryLabel} ID-kaart` : "";
  const docMeta = DOCUMENT_TYPE_META[docType] || DOCUMENT_TYPE_META.passport;

  useEffect(() => {
    if (!normalizedInitialDocType) return;
    setDocType(normalizedInitialDocType);
    setStep(2);
  }, [normalizedInitialDocType]);

  const { data: sensitiveData = [] } = useQuery({
    queryKey: ["personnel-sensitive-data", personnelId],
    queryFn: () => base44.entities.PersonnelSensitiveData.filter({ personnel_id: personnelId }),
    enabled: !!personnelId,
  });
  const { data: allSensitiveData = [] } = useQuery({
    queryKey: ["personnel-sensitive-data"],
    queryFn: () => base44.entities.PersonnelSensitiveData.list(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: personnelDocuments = [] } = useQuery({
    queryKey: ["personnel-documents", personnelId],
    queryFn: () => base44.entities.PersonnelDocument.filter({ personnel_id: personnelId }, "-created_date"),
    enabled: !!personnelId,
  });
  const { data: currentUser = null } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };

  const uploadKey = [
    docType || "",
    frontFile ? `${frontFile.name}-${frontFile.size}-${frontFile.lastModified}` : "",
    backFile ? `${backFile.name}-${backFile.size}-${backFile.lastModified}` : "",
  ].join("|");

  useEffect(() => {
    latestUploadKeyRef.current = uploadKey;
  }, [uploadKey]);

  useEffect(() => {
    setRecognizedUploadKey("");
    setRecognizedPerson(null);
    setScanQuality(null);
    setErrors({});
    setForm(current => ({
      ...current,
      document_number: "",
      bsn: "",
      valid_from: "",
      valid_until: "",
    }));
  }, [docType, frontFile, backFile]);

  const applyRecognizedFields = useCallback((result) => {
    setForm(current => {
      const next = { ...current };
      for (const field of ["document_number", "bsn", "valid_from", "valid_until"]) {
        if (!next[field] && result?.[field]) next[field] = result[field];
      }
      return next;
    });
  }, []);

  const runRecognition = useCallback(async () => {
    if (!frontFile || recognizing) return;
    if (recognizedUploadKey === uploadKey) return;

    const currentUploadKey = uploadKey;
    setRecognizing(true);
    try {
      const { recognizeIdentityDocument } = await import("@/lib/identityOcr");
      const result = await recognizeIdentityDocument({
        frontFile,
        backFile,
        docType,
        requiresBsn: isDutch,
      });
      if (latestUploadKeyRef.current !== currentUploadKey) return;
      applyRecognizedFields(result);
      setRecognizedPerson(result.person || null);
      setScanQuality(result.upload_quality || null);
      setRecognizedUploadKey(currentUploadKey);
    } catch (error) {
      console.error("Identity OCR failed", error);
      if (latestUploadKeyRef.current === currentUploadKey) {
        setScanQuality({
          status: "review",
          score: 0,
          title: "Handmatige controle nodig",
          summary: "De upload is ontvangen, maar de automatische scan kon niet volledig worden afgerond. Controleer de velden handmatig.",
          checks: [
            { key: "upload_available", label: "Upload aanwezig", status: "pass" },
            { key: "automatic_scan", label: "Automatische scan afgerond", status: "warn", detail: "Controleer documentnummer, BSN en geldigheid handmatig" },
          ],
        });
        setRecognizedPerson(null);
        setRecognizedUploadKey(currentUploadKey);
      }
    } finally {
      setRecognizing(false);
    }
  }, [applyRecognizedFields, backFile, docType, frontFile, isDutch, recognizedUploadKey, recognizing, uploadKey]);

  useEffect(() => {
    if (![2, 3].includes(step) || !frontFile || recognizing || recognizedUploadKey === uploadKey) return;
    runRecognition();
  }, [frontFile, recognizedUploadKey, recognizing, runRecognition, step, uploadKey]);

  const validateDetails = () => {
    const e = {};
    const personMatch = buildPersonMatchCheck(personnel, recognizedPerson);
    const today = new Date().toISOString().split("T")[0];
    const documentNumber = normalizeDocumentNumber(form.document_number);
    const bsn = normalizeBsn(form.bsn);
    const existingSensitiveBsn = normalizeBsn(sensitiveData.find(item => normalizeBsn(item.bsn))?.bsn);
    const duplicateDocument = personnelDocuments
      .filter(isIdentityLikeDocument)
      .find(doc => normalizeDocumentNumber(doc.document_number) === documentNumber);
    const duplicateBsnOwner = bsn
      ? allSensitiveData.find(item => item.personnel_id !== personnelId && normalizeBsn(item.bsn) === bsn)
      : null;

    if (!form.document_number.trim()) e.document_number = "Verplicht";
    else if (duplicateDocument) e.document_number = "Dit documentnummer is al geregistreerd bij dit personeelsprofiel.";
    if (!form.valid_from) e.valid_from = "Verplicht";
    if (!form.valid_until) {
      e.valid_until = "Verplicht";
    } else if (!isArchiveEntry && form.valid_until <= today) {
      e.valid_until = "Document is verlopen — voeg verlopen documenten toe via het archief.";
    } else if (isArchiveEntry && form.valid_until >= today) {
      e.valid_until = "Archief is voor verlopen documenten (einddatum moet in het verleden liggen).";
    } else if (form.valid_from && form.valid_until <= form.valid_from) {
      e.valid_until = "Geldig tot moet later zijn dan geldig vanaf";
    }
    if (!form.issuing_country.trim()) e.issuing_country = "Verplicht";
    if (isDutch && !bsn) e.bsn = "BSN is verplicht voor Nederlandse documenten.";
    else if (bsn && bsn.length !== 9) e.bsn = "BSN moet uit 9 cijfers bestaan.";
    else if (existingSensitiveBsn && bsn && existingSensitiveBsn !== bsn) {
      e.bsn = "Dit BSN komt niet overeen met het opgeslagen BSN in dit personeelsprofiel.";
    } else if (duplicateBsnOwner) {
      e.bsn = "Dit BSN is al geregistreerd bij een ander personeelsprofiel.";
    }
    if (personMatch.status === "blocked") {
      e.identity_match = "Het document lijkt niet bij deze medewerker te horen.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const activeDocMeta = DOCUMENT_TYPE_META[docType] || DOCUMENT_TYPE_META.passport;
      const personMatch = buildPersonMatchCheck(personnel, recognizedPerson);
      if (personMatch.status === "blocked") {
        setErrors(current => ({
          ...current,
          identity_match: "Het document lijkt niet bij deze medewerker te horen.",
        }));
        throw new Error("identity_person_mismatch");
      }

      const country = form.issuing_country || countryLabel || "Nederland";
      const documentNumber = normalizeDocumentNumber(form.document_number);
      const allDocuments = await base44.entities.PersonnelDocument.list();
      const existingDocs = allDocuments.filter(doc => doc.personnel_id === personnelId);
      const duplicateDocument = existingDocs
        .filter(isIdentityLikeDocument)
        .find(doc => normalizeDocumentNumber(doc.document_number) === documentNumber);

      if (duplicateDocument) {
        setErrors(current => ({
          ...current,
          document_number: "Dit documentnummer is al geregistreerd bij dit personeelsprofiel.",
        }));
        throw new Error("duplicate_document_number");
      }

      const bsn = normalizeBsn(form.bsn);
      const existingSensitiveBsn = normalizeBsn(sensitiveData.find(item => normalizeBsn(item.bsn))?.bsn);
      const latestSensitiveData = await base44.entities.PersonnelSensitiveData.list();
      const duplicateBsnOwner = bsn
        ? latestSensitiveData.find(item => item.personnel_id !== personnelId && normalizeBsn(item.bsn) === bsn)
        : null;
      if (bsn && existingSensitiveBsn && existingSensitiveBsn !== bsn) {
        setErrors(current => ({
          ...current,
          bsn: "Dit BSN komt niet overeen met het opgeslagen BSN in dit personeelsprofiel.",
        }));
        throw new Error("conflicting_bsn");
      }
      if (duplicateBsnOwner) {
        setErrors(current => ({
          ...current,
          bsn: "Dit BSN is al geregistreerd bij een ander personeelsprofiel.",
        }));
        throw new Error("duplicate_bsn");
      }

      // Upload foto's
      let frontUrl = null;
      let backUrl = null;

      if (frontFile) {
        setUploadingFront(true);
        const res = await base44.integrations.Core.UploadFile({ file: frontFile });
        frontUrl = res.file_url;
        setUploadingFront(false);
      }
      if (backFile) {
        setUploadingBack(true);
        const res = await base44.integrations.Core.UploadFile({ file: backFile });
        backUrl = res.file_url;
        setUploadingBack(false);
      }

      let replacedActiveDocument = false;
      const actionAt = new Date().toISOString();
      let newDocumentArchived = isArchiveEntry;

      if (!isArchiveEntry) {
        const activeSameTypeDocs = existingDocs
          .filter(doc => storedDocumentKind(doc) === docType && doc.metadata?.archived !== true);
        const winner = [
          ...activeSameTypeDocs.map(doc => ({ id: doc.id, validUntil: doc.valid_until || "", isNew: false })),
          { id: "__new__", validUntil: form.valid_until || "", isNew: true },
        ].sort((a, b) => {
          const dateDiff = String(b.validUntil).localeCompare(String(a.validUntil));
          if (dateDiff !== 0) return dateDiff;
          return Number(b.isNew) - Number(a.isNew);
        })[0];

        newDocumentArchived = winner?.id !== "__new__";

        for (const doc of activeSameTypeDocs) {
          if (winner?.id !== doc.id) {
            replacedActiveDocument = true;
            await base44.entities.PersonnelDocument.update(doc.id, {
              verification_status: "expired",
              metadata: buildAuditMetadata(currentUser, "vernieuwd", {
                ...(doc.metadata || {}),
                archived: true,
                archived_at: actionAt,
              }, auditActors),
            });
          }
        }
      }

      const auditAction = newDocumentArchived
        ? "gearchiveerd"
        : !isArchiveEntry && replacedActiveDocument
          ? "vernieuwd"
          : "toegevoegd";

      await base44.entities.PersonnelDocument.create({
        personnel_id: personnelId,
        category: activeDocMeta.category,
        document_type: activeDocMeta.typeLabel(country),
        document_number: documentNumber || null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        front_file_url: frontUrl,
        back_file_url: backUrl,
        is_sensitive: true,
        verification_status: newDocumentArchived ? "expired" : "verified",
        metadata: buildAuditMetadata(currentUser, auditAction, {
          doc_type: docType,
          issuing_country: country,
          issuing_authority: form.issuing_authority || null,
          nationality,
          is_eu_eea: isEuEea,
          archived: newDocumentArchived,
          archived_at: newDocumentArchived ? actionAt : null,
          front_file_url: frontUrl,
          back_file_url: backUrl,
        }, auditActors),
      });

      if (bsn) {
        const existingSensitive = sensitiveData[0];
        if (existingSensitive) {
          await base44.entities.PersonnelSensitiveData.update(existingSensitive.id, { bsn });
        } else {
          await base44.entities.PersonnelSensitiveData.create({ personnel_id: personnelId, bsn });
        }
        queryClient.invalidateQueries({ queryKey: ["personnel-sensitive-data", personnelId] });
        queryClient.invalidateQueries({ queryKey: ["personnel-sensitive-data"] });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
      queryClient.invalidateQueries({ queryKey: ["personnel-documents", personnelId] });
      onSaved?.();
      onClose();
    },
    onError: error => {
      if (["duplicate_document_number", "conflicting_bsn", "duplicate_bsn", "identity_person_mismatch"].includes(error?.message)) return;
      console.error("Identity document save failed", error);
    },
  });

  const STEP_LABELS = ["Type", "Upload", "Controleren"];
  const scanPending = Boolean(frontFile) && recognizedUploadKey !== uploadKey;
  const personMatch = buildPersonMatchCheck(personnel, recognizedPerson);
  const wizardTitle = !docType || step === 1
    ? (isArchiveEntry ? "Document archiveren" : "Legitimatiebewijs toevoegen")
    : (isArchiveEntry ? `${docMeta.label} archiveren` : `${docMeta.label} toevoegen`);
  const goBackFromUpload = () => {
    if (docTypeLocked) onClose();
    else setStep(1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="scroll-mt-4 border-b border-primary/30 bg-muted/20 p-5"
    >
      <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">
        {wizardTitle}
        {(countryLabel || nationalityLabel) && (
          <span className="ml-2 text-muted-foreground font-normal normal-case tracking-normal">
            — {[countryLabel, nationalityLabel ? `(${nationalityLabel})` : ""].filter(Boolean).join(" ")}
          </span>
        )}
      </p>

      <WizardSteps step={step} labels={STEP_LABELS} />

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: "easeOut" }}>

          {/* Step 1: Type */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Kies het type legitimatiebewijs</p>

              {isNonEu && nationality && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  <Globe className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Op basis van de nationaliteit <strong>{nationality}</strong> is alleen een paspoort toegestaan. Een EU/EEA-identiteitskaart is niet van toepassing.</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                <button onClick={() => { setDocType("passport"); setStep(2); }}
                  className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99]">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Paspoort</span>
                    {passportChoiceLabel && <span className="text-xs text-muted-foreground ml-2">{passportChoiceLabel}</span>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                <button onClick={() => { setDocType("id_card"); setStep(2); }}
                  className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99]">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Identiteitskaart</span>
                    {idCardChoiceLabel && <span className="text-xs text-muted-foreground ml-2">{idCardChoiceLabel}</span>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                <button onClick={() => { setDocType("drivers_license"); setStep(2); }}
                  className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99]">
                  <div>
                    <span className="text-sm font-semibold text-foreground">Rijbewijs</span>
                    <span className="text-xs text-muted-foreground ml-2">Rijbewijs met voor- en achterzijde</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="flex justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4 mr-1" /> Annuleren</Button>
              </div>
            </div>
          )}

          {/* Step 2: Upload */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-0.5">
                  Document uploaden — <span className="text-muted-foreground font-normal">{docMeta.label}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Upload een duidelijke foto of scan. Na het uploaden kun je bijsnijden. De controle opent zodra de scan klaar is.
                </p>
              </div>

              <UploadGuideCard
                docType={docType}
                frontUpload={
                  <DocumentSideUpload
                    label={docType === "passport" ? "Voorkant (pasfoto / persoonsgegevens)" : "Voorkant"}
                    hint={docType === "passport"
                      ? "Upload hier de houderpagina met pasfoto, persoonsgegevens en MRZ."
                      : docType === "drivers_license"
                        ? "Upload hier de voorzijde met pasfoto, documentnummer en categorieen."
                      : "Upload hier de voorzijde met pasfoto en kaartgegevens."}
                    previewUrl={frontPreview}
                    onFileSelected={(file, preview) => { setFrontFile(file); setFrontPreview(preview); }}
                    uploading={uploadingFront}
                    required
                  />
                }
                backUpload={
                  <DocumentSideUpload
                    label={docType === "passport" ? "Achterkant (BSN-pagina)" : "Achterkant"}
                    hint={docType === "passport"
                      ? "Upload hier de BSN-/titelpagina of achterkant van de houderpagina."
                      : docType === "drivers_license"
                        ? "Upload hier de achterzijde met BSN, QR-code en categoriegegevens."
                      : "Upload hier de achterzijde met BSN en controlegegevens."}
                    previewUrl={backPreview}
                    onFileSelected={(file, preview) => { setBackFile(file); setBackPreview(preview); }}
                    uploading={uploadingBack}
                  />
                }
              />

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={goBackFromUpload}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                <Button size="sm" onClick={() => setStep(3)} disabled={!frontFile}>
                  Volgende <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Controleren & opslaan */}
          {step === 3 && scanPending && (
            <div className="space-y-4">
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-12 text-center">
                <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Scan verwerken</p>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  De upload wordt gelezen. Zodra dit klaar is, opent de controle automatisch.
                </p>
              </div>

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
              </div>
            </div>
          )}

          {step === 3 && !scanPending && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Controleer en vul aan</p>
                <p className="text-xs text-muted-foreground">
                  Vergelijk de velden met de upload. Scroll met het muiswiel om in te zoomen, sleep om te verslepen.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {/* Left: form fields */}
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Documentnummer <span className="text-destructive">*</span></label>
                      <Input value={form.document_number} onChange={e => set("document_number", e.target.value)}
                        className={`h-8 text-sm font-mono ${errors.document_number ? "border-destructive" : ""}`}
                        placeholder={docMeta.numberPlaceholder} />
                      {errors.document_number && <p className="text-xs text-destructive mt-1">{errors.document_number}</p>}
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        BSN-nummer
                        {isDutch && <span className="text-destructive ml-1">*</span>}
                        {!isDutch && <span className="text-muted-foreground ml-1">(indien beschikbaar)</span>}
                      </label>
                      <Input value={form.bsn} onChange={e => set("bsn", e.target.value.replace(/\D/g, ""))}
                        className={`h-8 text-sm font-mono ${errors.bsn ? "border-destructive" : ""}`}
                        placeholder="000000000" maxLength={9} />
                      {!isDutch && <p className="text-xs text-muted-foreground mt-1">Buitenlandse medewerkers ontvangen een BSN na inschrijving in de BRP.</p>}
                      {errors.bsn && <p className="text-xs text-destructive mt-1">{errors.bsn}</p>}
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Geldig vanaf <span className="text-destructive">*</span></label>
                      <Input type="date" value={form.valid_from} onChange={e => set("valid_from", e.target.value)}
                        className={`h-8 text-sm ${errors.valid_from ? "border-destructive" : ""}`} />
                      {errors.valid_from && <p className="text-xs text-destructive mt-1">{errors.valid_from}</p>}
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Geldig tot <span className="text-destructive">*</span></label>
                      <Input type="date" value={form.valid_until} onChange={e => set("valid_until", e.target.value)}
                        className={`h-8 text-sm ${errors.valid_until ? "border-destructive" : ""}`}
                        max={isArchiveEntry ? new Date().toISOString().split("T")[0] : undefined}
                        min={isArchiveEntry ? undefined : new Date(Date.now() + 86400000).toISOString().split("T")[0]} />
                      {errors.valid_until && <p className="text-xs text-destructive mt-1">{errors.valid_until}</p>}
                    </div>

                    <IssuingCountryField value={form.issuing_country} onChange={val => set("issuing_country", val)}
                      error={errors.issuing_country} defaultCountry={NATIONALITY_TO_COUNTRY[nationality] || ""} />

                    {isNonEu && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Uitgevende instantie</label>
                        <Input value={form.issuing_authority} onChange={e => set("issuing_authority", e.target.value)}
                          className="h-8 text-sm" placeholder="Bijv. Ministry of Interior" />
                      </div>
                    )}
                  </div>

                  <CriticalUploadNotice quality={scanQuality} />
                  <IdentityMatchNotice match={personMatch} />

                  {isNonEu && (
                    <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-200">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Voor niet-EU medewerkers is naast het paspoort een verblijfs- en/of werkvergunning vereist. Registreer deze apart onder het tabblad <strong>Compliance</strong>.</span>
                    </div>
                  )}

                  <div className="pt-1">
                    <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="h-7 px-2 text-xs text-muted-foreground">
                      Wijzig upload
                    </Button>
                  </div>
                </div>

                {/* Right: photo viewer */}
                {(frontPreview || backPreview) && (
                  <DocumentPhotoViewer
                    images={[
                      ...(frontPreview ? [{ src: frontPreview, label: docType === "passport" ? "Voorkant (pasfoto / persoonsgegevens)" : "Voorkant" }] : []),
                      ...(backPreview ? [{ src: backPreview, label: docType === "passport" ? "Achterkant (BSN-pagina)" : "Achterkant" }] : []),
                    ]}
                  />
                )}
              </div>

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => { setStep(2); setErrors({}); }}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onClose}>Annuleren</Button>
                  <Button size="sm" onClick={() => { if (validateDetails()) saveMutation.mutate(); }} disabled={saveMutation.isPending || recognizing}>
                    <Check className="w-4 h-4 mr-1" />
                    {saveMutation.isPending ? "Opslaan..." : "Document opslaan"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
