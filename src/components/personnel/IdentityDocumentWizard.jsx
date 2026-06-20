import React, { useState, useEffect, useRef, useCallback } from "react";
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

// ─── Upload Guidance ──────────────────────────────────────────────────────────

function Marker({ x, y, children }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="9" fill="#2563eb" />
      <text x="0" y="3.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="white">{children}</text>
    </g>
  );
}

function PassportGuideIllustration() {
  return (
    <svg viewBox="0 0 620 190" role="img" aria-label="Schematisch voorbeeld van Nederlands paspoort upload" className="h-36 w-full">
      <defs>
        <linearGradient id="nlPassportPage" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dff7fb" />
          <stop offset="0.28" stopColor="#f4f7df" />
          <stop offset="0.55" stopColor="#e0fbef" />
          <stop offset="0.78" stopColor="#dcecff" />
          <stop offset="1" stopColor="#fde2e8" />
        </linearGradient>
        <linearGradient id="nlPassportBack" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8fbff" />
          <stop offset="1" stopColor="#dff3ff" />
        </linearGradient>
        <pattern id="nlPassportLetters" width="22" height="20" patternUnits="userSpaceOnUse">
          <text x="2" y="9" fontSize="6" fill="#be123c" opacity="0.24">N</text>
          <text x="11" y="18" fontSize="6" fill="#0f766e" opacity="0.22">L</text>
          <path d="M0 19c6-5 13-5 22 0" fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.16" />
        </pattern>
      </defs>

      <rect width="620" height="190" rx="14" fill="hsl(var(--muted))" opacity="0.28" />

      <g transform="translate(30 16)">
        <rect x="0" y="0" width="258" height="158" rx="7" fill="url(#nlPassportPage)" stroke="#8b2746" strokeWidth="2" />
        <rect x="5" y="5" width="248" height="148" rx="5" fill="url(#nlPassportLetters)" opacity="0.78" />
        <path d="M16 82c20-22 34-18 50-32 18-16 32-20 55-6 20 12 30 4 45-8 18-15 38-5 59 18" fill="none" stroke="#94a3b8" strokeWidth="2" opacity="0.45" />
        <path d="M12 8h28v142H12M246 8h-28v142h28" fill="none" stroke="#f9a8d4" strokeWidth="3" opacity="0.55" />
        <text x="18" y="18" fontSize="8" letterSpacing="1.2" fill="#334155">PASPOORT</text>
        <text x="92" y="18" fontSize="7" letterSpacing="1" fill="#64748b">KINGDOM OF THE NETHERLANDS</text>
        <text x="56" y="76" fontSize="10" fontWeight="700" fill="#0f172a">KONINKRIJK DER</text>
        <text x="140" y="76" fontSize="10" fontWeight="700" fill="#be123c">NEDERLANDEN</text>

        <rect x="24" y="24" width="34" height="44" rx="4" fill="#dbeafe" stroke="#93c5fd" />
        <circle cx="41" cy="39" r="8" fill="#475569" opacity="0.55" />
        <rect x="32" y="50" width="18" height="12" rx="6" fill="#475569" opacity="0.45" />
        <path d="M70 28h70M70 40h86M70 52h64" stroke="#64748b" strokeWidth="3" strokeLinecap="round" opacity="0.75" />

        <rect x="22" y="86" width="58" height="58" rx="4" fill="#e5e7eb" stroke="#cbd5e1" />
        <circle cx="51" cy="106" r="15" fill="#64748b" opacity="0.36" />
        <rect x="34" y="123" width="34" height="18" rx="9" fill="#64748b" opacity="0.28" />

        <rect x="92" y="92" width="82" height="7" rx="2" fill="#475569" opacity="0.8" />
        <rect x="92" y="106" width="104" height="7" rx="2" fill="#64748b" opacity="0.6" />
        <rect x="92" y="120" width="74" height="7" rx="2" fill="#64748b" opacity="0.55" />
        <rect x="180" y="91" width="32" height="32" rx="4" fill="#dbeafe" stroke="#93c5fd" />
        <circle cx="196" cy="103" r="7" fill="#475569" opacity="0.52" />
        <rect x="188" y="113" width="16" height="8" rx="4" fill="#475569" opacity="0.42" />

        <text x="216" y="36" fontSize="7" fill="#64748b" transform="rotate(90 216 36)">DOCUMENT NR.</text>
        <path d="M234 34v58" stroke="#0f172a" strokeWidth="3" strokeDasharray="3 4" opacity="0.55" />
        <rect x="18" y="130" width="222" height="14" rx="2" fill="#f6f3d6" opacity="0.85" />
        <path d="M20 146h214M20 155h214" stroke="#0f172a" strokeWidth="3" strokeDasharray="10 5" />
      </g>

      <g transform="translate(360 28)">
        <rect x="0" y="0" width="150" height="126" rx="4" fill="url(#nlPassportBack)" stroke="#8b2746" strokeWidth="2" />
        <path d="M10 8h16v110H10" fill="none" stroke="#f9a8d4" strokeWidth="3" opacity="0.6" />
        <text x="24" y="22" fontSize="8" fontWeight="700" fill="#1e40af">Documentnummer</text>
        <rect x="24" y="29" width="54" height="9" rx="2" fill="#475569" opacity="0.8" />
        <text x="24" y="53" fontSize="8" fontWeight="700" fill="#1e40af">Persoonsnummer / BSN</text>
        <rect x="24" y="60" width="66" height="9" rx="2" fill="#64748b" opacity="0.7" />
        <rect x="104" y="24" width="25" height="25" rx="3" fill="#0f172a" opacity="0.72" />
        <path d="M108 28h6v6h-6zM119 28h6v6h-6zM108 39h6v6h-6zM119 39h6v6h-6z" fill="#e0f2fe" opacity="0.75" />
        <path d="M24 100h58" stroke="#64748b" strokeWidth="5" strokeLinecap="round" />
      </g>

      <Marker x="56" y="34">1</Marker>
      <Marker x="30" y="96">2</Marker>
      <Marker x="216" y="118">3</Marker>
      <Marker x="262" y="65">4</Marker>
      <Marker x="374" y="50">5</Marker>
    </svg>
  );
}

function IdCardGuideIllustration() {
  return (
    <svg viewBox="0 0 420 210" role="img" aria-label="Schematisch voorbeeld van ID-kaart upload" className="h-40 w-full">
      <rect width="420" height="210" rx="14" fill="hsl(var(--muted))" opacity="0.45" />
      <rect x="26" y="40" width="170" height="112" rx="12" fill="#eef8ff" stroke="#38bdf8" strokeWidth="2" />
      <rect x="42" y="56" width="48" height="58" rx="7" fill="#cbd5e1" />
      <circle cx="66" cy="80" r="14" fill="#94a3b8" />
      <rect x="104" y="60" width="62" height="6" rx="3" fill="#64748b" />
      <rect x="104" y="75" width="72" height="5" rx="2.5" fill="#94a3b8" />
      <rect x="104" y="88" width="48" height="5" rx="2.5" fill="#94a3b8" />
      <rect x="104" y="106" width="66" height="8" rx="3" fill="#bfdbfe" />
      <path d="M42 132h126" stroke="#0f172a" strokeWidth="3" strokeDasharray="10 4" />
      <text x="42" y="143" fontSize="8" fill="#475569">MRZ / documentgegevens</text>
      <rect x="226" y="40" width="170" height="112" rx="12" fill="#f8fafc" stroke="#94a3b8" />
      <rect x="244" y="58" width="78" height="8" rx="4" fill="#64748b" />
      <rect x="244" y="78" width="58" height="20" rx="4" fill="#dbeafe" />
      <rect x="344" y="58" width="24" height="24" rx="3" fill="#0f172a" opacity="0.75" />
      <rect x="244" y="120" width="52" height="7" rx="3.5" fill="#64748b" />
      <text x="244" y="112" fontSize="8" fill="#475569">BSN / kaartnummer</text>
      <Marker x="30" y="44">1</Marker>
      <Marker x="195" y="72">2</Marker>
      <Marker x="172" y="132">3</Marker>
      <Marker x="364" y="48">4</Marker>
    </svg>
  );
}

function UploadGuideCard({ docType }) {
  const isPassport = docType === "passport";
  const points = isPassport
    ? [
      "Volledig document met alle randen zichtbaar.",
      "Pasfoto en tweede portret scherp in beeld.",
      "Persoonsgegevens, documentnummer en geldigheid leesbaar.",
      "MRZ-regels onderaan vrij van schaduw.",
      "Upload ook de BSN-pagina of achterkant.",
    ]
    : [
      "Upload de voorzijde volledig en zonder afgesneden hoeken.",
      "Zorg dat pasfoto, kaartnummer en datums scherp zijn.",
      "Upload ook de achterzijde voor BSN en controlegegevens.",
      "Vermijd reflectie op de kaart.",
    ];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scanvoorbeeld</p>
          <p className="mt-1 text-sm font-medium text-foreground">{isPassport ? "Nederlands paspoort" : "ID-kaart"} correct uploaden</p>
        </div>
        <p className="text-[11px] text-muted-foreground">Controleert scanbaarheid, geen echtheid.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.75fr)] lg:items-center">
        <div className="rounded-md bg-muted/20 p-2">
          {isPassport ? <PassportGuideIllustration /> : <IdCardGuideIllustration />}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
        {points.map((point, index) => (
          <div key={point} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
              {index + 1}
            </span>
            <span>{point}</span>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

function UploadQualityCard({ quality }) {
  if (!quality) return null;

  const tone = quality.status === "good"
    ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100"
    : quality.status === "poor"
      ? "border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-100"
      : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100";

  const statusClasses = {
    pass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    fail: "bg-red-500/10 text-red-700 dark:text-red-300",
  };

  const statusIcons = {
    pass: Check,
    warn: AlertTriangle,
    fail: X,
  };

  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-75">Uploadcontrole</p>
          <p className="mt-1 text-sm font-semibold">{quality.title}</p>
          <p className="mt-1 text-xs opacity-80">{quality.summary}</p>
        </div>
        <div className="rounded-full border border-current/15 px-3 py-1 text-xs font-semibold">
          Score {quality.score}%
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {quality.checks.map(check => {
          const Icon = statusIcons[check.status] || AlertTriangle;
          return (
            <div key={check.key} className="rounded-md border border-current/10 bg-background/55 px-3 py-2">
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${statusClasses[check.status] || statusClasses.warn}`}>
                  <Icon className="h-3 w-3" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{check.label}</p>
                  {check.detail && <p className="mt-0.5 text-[11px] text-muted-foreground">{check.detail}</p>}
                </div>
              </div>
            </div>
          );
        })}
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
  const [recognizedUploadKey, setRecognizedUploadKey] = useState("");
  const [scanQuality, setScanQuality] = useState(null);
  const latestUploadKeyRef = useRef("");

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
    latestUploadKeyRef.current = uploadKey;
  }, [uploadKey]);

  useEffect(() => {
    setRecognizedUploadKey("");
    setScanQuality(null);
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
  const scanPending = Boolean(frontFile) && recognizedUploadKey !== uploadKey;

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
                  Upload een duidelijke foto of scan van het document. Na het uploaden kun je de afbeelding bijsnijden. De controle opent zodra de scan klaar is.
                </p>
              </div>

              <div className="space-y-4">
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
                <UploadGuideCard docType={docType} />
              </div>

              <div className="flex justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}><ChevronLeft className="w-4 h-4 mr-1" /> Terug</Button>
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
                  Vergelijk de velden met de upload. Je kunt waarden direct aanpassen voordat je opslaat.
                </p>
              </div>

              <UploadQualityCard quality={scanQuality} />

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="rounded-lg border border-border bg-card p-4">
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
