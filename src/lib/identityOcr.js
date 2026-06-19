const MRZ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

const MONTHS = {
  JAN: 1,
  JANUARI: 1,
  FEB: 2,
  FEBRUARI: 2,
  MRT: 3,
  MAART: 3,
  MAR: 3,
  MARCH: 3,
  APR: 4,
  APRIL: 4,
  MEI: 5,
  MAY: 5,
  JUN: 6,
  JUNI: 6,
  JUNE: 6,
  JUL: 7,
  JULI: 7,
  JULY: 7,
  AUG: 8,
  AUGUSTUS: 8,
  SEP: 9,
  SEPT: 9,
  SEPTEMBER: 9,
  OKT: 10,
  OCT: 10,
  OKTOBER: 10,
  OCTOBER: 10,
  NOV: 11,
  NOVEMBER: 11,
  DEC: 12,
  DECEMBER: 12,
};

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function toIsoDate(year, month, day) {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function parseYear(value) {
  const year = String(value || "");
  if (year.length === 4) return Number(year);
  if (year.length === 2) return Number(year) + (Number(year) < 70 ? 2000 : 1900);
  return null;
}

function parseVisibleDate(value) {
  const text = compact(value).toUpperCase();
  const numeric = text.match(/\b([0-3]?\d)[\s./-]([01]?\d)[\s./-]((?:19|20)?\d{2})\b/);
  if (numeric) {
    const year = parseYear(numeric[3]);
    return year ? toIsoDate(year, Number(numeric[2]), Number(numeric[1])) : null;
  }

  const named = text.match(/\b([0-3]?\d)\s+([A-ZÀ-ÿ]{3,10})\s+((?:19|20)?\d{2})\b/);
  if (named) {
    const month = MONTHS[named[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
    const year = parseYear(named[3]);
    return month && year ? toIsoDate(year, month, Number(named[1])) : null;
  }
  return null;
}

function findDateNearLabel(text, labels) {
  const upper = text.toUpperCase();
  for (const label of labels) {
    const index = upper.indexOf(label);
    if (index < 0) continue;
    const slice = upper.slice(index, index + 220);
    const date = parseVisibleDate(slice);
    if (date) return date;
  }
  return null;
}

function normalizeMrzLine(line) {
  return String(line || "")
    .toUpperCase()
    .replace(/[«‹]/g, "<")
    .replace(/\s+/g, "<")
    .replace(/[^A-Z0-9<]/g, "");
}

function mrzDateToIso(value, mode = "expiry") {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/[OQD]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[S]/g, "5")
    .replace(/[B]/g, "8");
  if (!/^\d{6}$/.test(normalized)) return null;
  const yy = Number(normalized.slice(0, 2));
  const mm = Number(normalized.slice(2, 4));
  const dd = Number(normalized.slice(4, 6));
  const currentYear = new Date().getFullYear();
  let year = yy + 2000;
  if (mode === "birth" && year > currentYear) year -= 100;
  return toIsoDate(year, mm, dd);
}

function cleanMrzField(value) {
  return String(value || "").replace(/</g, "").trim();
}

function findBsnInText(text) {
  const normalized = text.toUpperCase();
  const labeled = normalized.match(/(?:BSN|BURGERSERVICENUMMER|PERSONAL\s+NUMBER|PERSOONLIJK\s+NUMMER)\D{0,45}(\d[\d\s.-]{7,16}\d)/);
  if (labeled) {
    const candidate = onlyDigits(labeled[1]);
    if (candidate.length === 9) return candidate;
  }

  const candidates = normalized.match(/\b\d[\d\s.-]{7,16}\d\b/g) || [];
  for (const candidate of candidates) {
    const digits = onlyDigits(candidate);
    if (digits.length === 9 && isLikelyBsn(digits)) return digits;
  }
  return "";
}

function isLikelyBsn(value) {
  const bsn = onlyDigits(value);
  if (bsn.length !== 9) return false;
  const sum = bsn.split("").reduce((total, digit, index) => {
    const weight = index === 8 ? -1 : 9 - index;
    return total + Number(digit) * weight;
  }, 0);
  return sum % 11 === 0;
}

function findDocumentNumberInText(text) {
  const normalized = text.toUpperCase();
  const labeled = normalized.match(/(?:DOCUMENT(?:\s+|\s*-\s*)NUMMER|DOCUMENT\s+NUMBER|PASPOORTNUMMER|PASSPORT\s+NO|IDENTITEITSKAARTNUMMER)\D{0,35}([A-Z0-9][A-Z0-9<\s-]{6,14})/);
  if (labeled) {
    const value = cleanMrzField(labeled[1]).replace(/[^A-Z0-9]/g, "");
    if (value.length >= 7 && value.length <= 12) return value;
  }

  const candidates = normalized.match(/\b[A-Z]{1,3}[A-Z0-9]{6,9}\b/g) || [];
  return candidates.find(candidate => !/^(NLD|NEDERLAND|PASPOORT)$/.test(candidate)) || "";
}

function extractMrz(text) {
  const rawLines = text
    .split(/\r?\n/)
    .map(line => normalizeMrzLine(line))
    .filter(line => line.length >= 20 && /[<0-9]/.test(line));

  const lines = [];
  for (const line of rawLines) {
    if (line.length <= 50) {
      lines.push(line);
    } else {
      for (let i = 0; i < line.length; i += 44) {
        const chunk = line.slice(i, i + 44);
        if (chunk.length >= 20) lines.push(chunk);
      }
    }
  }

  for (let i = 0; i < lines.length - 1; i += 1) {
    const first = lines[i];
    const second = lines[i + 1];
    if (/^P[A-Z<]/.test(first) && second.length >= 35) {
      return {
        format: "TD3",
        document_number: cleanMrzField(second.slice(0, 9)),
        valid_until: mrzDateToIso(second.slice(21, 27), "expiry"),
        bsn: findBsnInText(second.slice(28, 43)),
      };
    }
  }

  for (let i = 0; i < lines.length - 2; i += 1) {
    const first = lines[i];
    const second = lines[i + 1];
    if (/^[IA][A-Z<]/.test(first) && first.length >= 25 && second.length >= 25) {
      const optional = `${first.slice(15)} ${second.slice(18, 29)}`;
      return {
        format: "TD1",
        document_number: cleanMrzField(first.slice(5, 14)),
        valid_until: mrzDateToIso(second.slice(8, 14), "expiry"),
        bsn: findBsnInText(optional),
      };
    }
  }

  return null;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Afbeelding kon niet worden geladen voor herkenning."));
    img.src = URL.createObjectURL(source);
  });
}

async function imageToDataUrl(file, { crop = "full" } = {}) {
  const image = await loadImage(file);
  try {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const sourceY = crop === "mrz" ? Math.floor(sourceHeight * 0.52) : 0;
    const cropHeight = crop === "mrz" ? Math.ceil(sourceHeight * 0.48) : sourceHeight;
    const maxWidth = crop === "mrz" ? 2600 : 2200;
    const scale = Math.min(1.8, maxWidth / sourceWidth);
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(cropHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, sourceY, sourceWidth, cropHeight, 0, 0, targetWidth, targetHeight);

    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
      data[i] = contrasted;
      data[i + 1] = contrasted;
      data[i + 2] = contrasted;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    URL.revokeObjectURL(image.src);
  }
}

function mergeResults(text) {
  const mrz = extractMrz(text) || {};
  const visibleUntil = findDateNearLabel(text, [
    "GELDIG TOT",
    "DATE OF EXPIRY",
    "EXPIRY DATE",
    "VALID UNTIL",
    "VALID TO",
  ]);
  const validFrom = findDateNearLabel(text, [
    "DATUM VAN AFGIFTE",
    "DATE OF ISSUE",
    "ISSUED ON",
    "AFGIFTE",
  ]);

  return {
    document_number: mrz.document_number || findDocumentNumberInText(text),
    bsn: mrz.bsn || findBsnInText(text),
    valid_from: validFrom || "",
    valid_until: mrz.valid_until || visibleUntil || "",
    mrz_format: mrz.format || null,
  };
}

export async function recognizeIdentityDocument({ frontFile, backFile, onProgress }) {
  const { createWorker } = await import("https://esm.sh/tesseract.js@6.0.1");
  const worker = await createWorker("eng", 1, {
    logger: message => {
      if (message.status && typeof message.progress === "number") {
        onProgress?.(`${message.status} ${Math.round(message.progress * 100)}%`);
      }
    },
  });

  try {
    const files = [frontFile, backFile].filter(Boolean);
    const textParts = [];

    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    for (const file of files) {
      const image = await imageToDataUrl(file);
      const { data } = await worker.recognize(image);
      textParts.push(data.text || "");
    }

    await worker.setParameters({
      tessedit_char_whitelist: MRZ_CHARS,
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    for (const file of files) {
      const image = await imageToDataUrl(file, { crop: "mrz" });
      const { data } = await worker.recognize(image);
      textParts.push(data.text || "");
    }

    const rawText = textParts.join("\n");
    const fields = mergeResults(rawText);
    return {
      ...fields,
      detected_fields: Object.entries(fields)
        .filter(([key, value]) => key !== "mrz_format" && Boolean(value))
        .map(([key]) => key),
    };
  } finally {
    await worker.terminate();
  }
}