import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Check, X, Globe, AlertTriangle, ImageIcon, Crop, Loader2 } from "lucide-react";

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

// ─── Image Crop Dialog ─────────────────────────────────────────────────────────

function ImageCropDialog({ open, onClose, imageSrc, onCropped, label }) {
  const canvasRef = useRef(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [imgEl, setImgEl] = useState(null);
  const [imageError, setImageError] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!imageSrc || !open) return;
    setImgEl(null);
    setImageError("");
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      // Default crop = full image
      setCrop({ x: 0, y: 0, w: img.width, h: img.height });
    };
    img.onerror = () => setImageError("De afbeelding kon niet worden geopend. Gebruik een JPG of PNG.");
    img.src = imageSrc;
  }, [imageSrc, open]);

  useEffect(() => {
    if (!canvasRef.current || !imgEl) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const maxW = Math.min(imgEl.width, 700);
    const scale = maxW / imgEl.width;
    canvas.width = imgEl.width * scale;
    canvas.height = imgEl.height * scale;
    canvas.dataset.scale = scale;
    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
    // Draw crop overlay
    const sx = crop.x * scale;
    const sy = crop.y * scale;
    const sw = crop.w * scale;
    const sh = crop.h * scale;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, canvas.width, sy);
    ctx.fillRect(0, sy + sh, canvas.width, canvas.height - (sy + sh));
    ctx.fillRect(0, sy, sx, sh);
    ctx.fillRect(sx + sw, sy, canvas.width - (sx + sw), sh);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);
  }, [imgEl, crop]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = parseFloat(canvas.dataset.scale || 1);
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(imgEl.width, (clientX - rect.left) / scale)),
      y: Math.max(0, Math.min(imgEl.height, (clientY - rect.top) / scale)),
    };
  };

  const onMouseDown = (e) => {
    const pos = getPos(e);
    setStartPos(pos);
    setDrawing(true);
    setCrop({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const onMouseMove = (e) => {
    if (!drawing || !startPos) return;
    const pos = getPos(e);
    setCrop({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      w: Math.abs(pos.x - startPos.x),
      h: Math.abs(pos.y - startPos.y),
    });
  };

  const onMouseUp = () => setDrawing(false);

  const applyCrop = () => {
    const offscreen = document.createElement("canvas");
    const finalCrop = crop.w < 10 || crop.h < 10
      ? { x: 0, y: 0, w: imgEl.width, h: imgEl.height }
      : crop;
    offscreen.width = finalCrop.w;
    offscreen.height = finalCrop.h;
    const ctx = offscreen.getContext("2d");
    ctx.drawImage(imgEl, finalCrop.x, finalCrop.y, finalCrop.w, finalCrop.h, 0, 0, finalCrop.w, finalCrop.h);
    offscreen.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      onCropped(url, blob);
      onClose();
    }, "image/jpeg", 0.92);
  };

  const resetCrop = () => {
    if (imgEl) setCrop({ x: 0, y: 0, w: imgEl.width, h: imgEl.height });
  };

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="w-4 h-4" /> Bijsnijden — {label}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground mb-3">
          Teken een selectie op de afbeelding om het gewenste gebied bij te snijden. Klik op <strong>Toepassen</strong> om op te slaan.
        </p>
        <div ref={containerRef} className="min-h-64 overflow-auto rounded-md border border-border bg-muted/30 flex items-center justify-center p-2">
          {imageError ? (
            <p className="text-sm text-destructive">{imageError}</p>
          ) : !imgEl ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Afbeelding laden...
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="max-w-full cursor-crosshair select-none"
              style={{ userSelect: "none" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            />
          )}
        </div>
        <div className="flex justify-between items-center mt-3">
          <Button variant="outline" size="sm" onClick={resetCrop}>
            Selectie resetten
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

function DocumentSideUpload({ label, previewUrl, onFileSelected, uploading, required }) {
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
      <label className="text-xs font-medium text-muted-foreground block">{label}{required && <span className="text-destructive ml-1">*</span>}</label>
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

export default function IdentityDocumentWizard({ personnelId, nationality, onClose, onSaved, isArchiveEntry = false }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [docType, setDocType] = useState(null);
  const [form, setForm] = useState({
    document_number: "",
    bsn: "",
    valid_from: "",
    valid_until: "",
    issuing_country: NATIONALITY_TO_COUNTRY[nationality] || "",
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
  const [recognitionMessage, setRecognitionMessage] = useState("");
  const [recognitionResult, setRecognitionResult] = useState(null);
  const [recognizedUploadKey, setRecognizedUploadKey] = useState("");

  const isEuEea = EU_EEA_NATIONALITIES.has(nationality);
  const isDutch = nationality === "Nederlandse";
  const isNonEu = !!nationality && !isEuEea;
  const countryLabel = NATIONALITY_TO_COUNTRY[nationality] || nationality || "Onbekend";

  const { data: sensitiveData = [] } = useQuery({
    queryKey: ["personnel-sensitive-data", personnelId],
    queryFn: () => base44.entities.PersonnelSensitiveData.filter({ personnel_id: personnelId }),
    enabled: !!personnelId,
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
    setRecognitionMessage("");
    setRecognitionResult(null);
    setRecognizedUploadKey("");
  }, [docType, frontFile, backFile]);

  const applyRecognizedFields = (result) => {
    setForm(current => {
      const next = { ...current };
      for (const field of ["document_number", "bsn", "valid_from", "valid_until"]) {
        if (!next[field] && result?.[field]) next[field] = result[field];
      }
      return next;
    });
  };

  const runRecognition = async () => {
    if (!frontFile || recognizing) return;
    if (recognizedUploadKey === uploadKey) return;

    setRecognizing(true);
    setRecognitionMessage("Automatische herkenning starten...");
    try {
      const { recognizeIdentityDocument } = await import("@/lib/identityOcr");
      const result = await recognizeIdentityDocument({
        frontFile,
        backFile,
        onProgress: message => setRecognitionMessage(`Herkenning: ${message}`),
      });
      setRecognitionResult(result);
      applyRecognizedFields(result);
      setRecognizedUploadKey(uploadKey);

      const labels = {
        document_number: "documentnummer",
        bsn: "BSN",
        valid_from: "geldig vanaf",
        valid_until: "geldig tot",
      };
      const detected = (result.detected_fields || []).map(field => labels[field] || field);
      setRecognitionMessage(
        detected.length > 0
          ? `Herkend: ${detected.join(", ")}. Controleer de waarden met de upload.`
          : "Er zijn geen betrouwbare velden herkend. Vul de gegevens handmatig in."
      );
    } catch (error) {
      console.error("Identity OCR failed", error);
      setRecognitionMessage("Automatische herkenning is niet gelukt. Vul de gegevens handmatig in.");
    } finally {
      setRecognizing(false);
    }
  };

  const validateDetails = () => {
    const e = {};
    const today = new Date().toISOString().split("T")[0];
    if (!form.document_number.trim()) e.document_number = "Verplicht";
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
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const typeLabel = docType === "passport" ? "Paspoort" : "Identiteitskaart";
      const country = form.issuing_country || countryLabel;

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

      // Archiveer bestaande documenten van hetzelfde type
      const existing = await base44.entities.PersonnelDocument.filter({ personnel_id: personnelId, category: "identity_document" });
      for (const doc of existing) {
        if (doc.metadata?.doc_type === docType && doc.metadata?.archived !== true) {
          await base44.entities.PersonnelDocument.update(doc.id, {
            metadata: { ...doc.metadata, archived: true },
          });
        }
      }

      await base44.entities.PersonnelDocument.create({
        personnel_id: personnelId,
        category: "identity_document",
        document_type: `${typeLabel} (${country})`,
        document_number: form.document_number || null,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
        is_sensitive: true,
        verification_status: isArchiveEntry ? "verified" : "pending_review",
        metadata: {
          doc_type: docType,
          issuing_country: form.issuing_country,
          issuing_authority: form.issuing_authority || null,
          nationality,
          is_eu_eea: isEuEea,
          archived: isArchiveEntry,
          front_file_url: frontUrl,
          back_file_url: backUrl,
        },
      });

      if (form.bsn.trim()) {
        const existingSensitive = sensitiveData[0];
        if (existingSensitive) {
          await base44.entities.PersonnelSensitiveData.update(existingSensitive.id, { bsn: form.bsn.trim() });
        } else {
          await base44.entities.PersonnelSensitiveData.create({ personnel_id: personnelId, bsn: form.bsn.trim() });
        }
        queryClient.invalidateQueries({ queryKey: ["personnel-sensitive-data", personnelId] });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personnel-documents"] });
      onSaved?.();
      onClose();
    },
  });

  const STEP_LABELS = ["Type", "Upload", "Controleren"];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="border-b border-primary/30 bg-muted/20 p-5"
    >
      <p className="text-xs font-semibold text-primary mb-3 uppercase tracking-wider">
        {isArchiveEntry ? "Verlopen legitimatiebewijs archiveren" : "Legitimatiebewijs toevoegen"}
        {nationality && (
          <span className="ml-2 text-muted-foreground font-normal normal-case tracking-normal">
            — {countryLabel} ({nationality})
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
                    <span className="text-xs text-muted-foreground ml-2">{countryLabel} paspoort</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                {isEuEea && (
                  <button onClick={() => { setDocType("id_card"); setStep(2); }}
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card text-left transition-all hover:border-primary hover:bg-accent active:scale-[0.99]">
                    <div>
                      <span className="text-sm font-semibold text-foreground">Identiteitskaart</span>
                      <span className="text-xs text-muted-foreground ml-2">{countryLabel} ID-kaart</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
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
                <p className="text-sm font-medium text-foreground mb-1">
                  Document uploaden — <span className="text-muted-foreground font-normal">{docType === "passport" ? "Paspoort" : "Identiteitskaart"}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Upload een duidelijke foto of scan van het document. Na het uploaden kun je de afbeelding bijsnijden en probeert de app documentnummer, BSN en geldigheid automatisch te herkennen.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DocumentSideUpload
                  label={docType === "passport" ? "Voorkant (pasfoto / persoonsgegevens)" : "Voorkant"}
                  previewUrl={frontPreview}
                  onFileSelected={(file, preview) => { setFrontFile(file); setFrontPreview(preview); }}
                  uploading={uploadingFront}
                  required
                />
                <DocumentSideUpload
                  label={docType === "passport" ? "Achterkant (BSN-pagina)" : "Achterkant"}
                  previewUrl={backPreview}
                  onFileSelected={(file, preview) => { setBackFile(file); setBackPreview(preview); }}
                  uploading={uploadingBack}
                />
              </div>

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
                <Button size="sm" onClick={() => { setStep(3); runRecognition(); }} disabled={!frontFile || recognizing}>
                  {recognizing ? "Herkennen..." : "Volgende"} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Controleren & opslaan */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Controleer de herkenning en vul aan</p>
                <p className="text-xs text-muted-foreground">
                  Vergelijk de automatisch ingevulde velden met de upload. Als herkenning een fout maakt, kun je hier direct overtypen voordat je opslaat.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="rounded-lg border border-border bg-card p-4">
                  {(recognizing || recognitionMessage) && (
                    <div className={`mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                      recognizing
                        ? "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200"
                        : recognitionResult?.detected_fields?.length
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
                          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                    }`}>
                      {recognizing ? (
                        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                      ) : recognitionResult?.detected_fields?.length ? (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>{recognitionMessage}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Documentnummer <span className="text-destructive">*</span></label>
                      <Input value={form.document_number} onChange={e => set("document_number", e.target.value)}
                        className={`h-8 text-sm font-mono ${errors.document_number ? "border-destructive" : ""}`}
                        placeholder={docType === "passport" ? "Bijv. NL1234567" : "Bijv. ID1234567NL"} />
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

                  {isNonEu && (
                    <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-200 mt-4">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Voor niet-EU medewerkers is naast het paspoort een verblijfs- en/of werkvergunning vereist. Registreer deze apart onder het tabblad <strong>Compliance</strong>.</span>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upload controleren</p>
                    <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="h-7 px-2 text-xs">
                      Wijzig upload
                    </Button>
                  </div>
                  <div className="space-y-3">
                  {frontPreview && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{docType === "passport" ? "Voorkant (pasfoto / persoonsgegevens)" : "Voorkant"}</p>
                      <img src={frontPreview} alt="Voorkant" className="rounded-md border border-border w-full max-h-56 object-contain bg-muted/20" />
                    </div>
                  )}
                  {backPreview && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{docType === "passport" ? "Achterkant (BSN-pagina)" : "Achterkant"}</p>
                      <img src={backPreview} alt="Achterkant" className="rounded-md border border-border w-full max-h-56 object-contain bg-muted/20" />
                    </div>
                  )}
                  </div>
                </div>
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
