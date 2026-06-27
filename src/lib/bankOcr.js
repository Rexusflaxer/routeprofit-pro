// OCR helpers for bank card / bank statement uploads.
// Uses tesseract.js (already installed) to extract only the IBAN from
// uploaded front/back images of a bank card. Bank name is derived from the
// typed or recognized IBAN in the UI.

function normalizeIban(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatIban(value) {
  const clean = normalizeIban(value);
  if (!clean) return "";
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

// IBAN pattern: 2 letters country code, 2 digits check, then 11-30 alphanumeric
const IBAN_REGEX = /\b([A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/;

// Dutch bank code → bank name mapping (first 4 chars after NL + check digits)
const DUTCH_BANK_MAP = {
  ABNA: "ABN AMRO",
  RABO: "Rabobank",
  INGB: "ING",
  BUNQ: "bunq",
  ARSP: "Argenta",
  SNSB: "SNS Bank",
  RBRB: "RegioBank",
  TRIO: "Triodos Bank",
  KNAB: "Knab",
  FVLG: "van Lanschot",
  ASNB: "ASN Bank",
  MOYO: "Moneyou",
  NWB: "NWB Bank",
  DEUT: "DEUTSCHE BANK",
  FBHL: "Friesland Bank",
  AABN: "Achmea Bank",
  BICK: "BinckBank",
  BTEK: "Bitonic",
  CFBK: "Credit Europe Bank",
  FLOR: "Florius",
  HANB: "Handelsbanken",
  ICBC: "ICBC",
  KASA: "KAS Bank",
  KOEX: "Korea Exchange Bank",
  LOYD: "Lloyds TSB Bank",
  MHCB: "Mizuho Bank",
  NIBC: "NIBC Bank",
  NWBK: "NWB Bank",
  PCBC: "PCBC",
  RABO: "Rabobank",
  RBRB: "RegioBank",
  SOGE: "Société Générale",
  STAL: "Staalbankiers",
  TEBU: "Test Bank",
  TRIO: "Triodos Bank",
  UBSF: "UBS Bank",
  VRIJ: "Vrijbuiter",
  ZWBT: "Zwitserse Bank",
};

function digitFromOcr(value) {
  const char = String(value || "").toUpperCase();
  return ({
    O: "0",
    Q: "0",
    D: "0",
    I: "1",
    L: "1",
    Z: "2",
    S: "5",
    B: "8",
    G: "6",
  }[char]) || char;
}

function letterFromOcr(value) {
  const char = String(value || "").toUpperCase();
  return ({
    0: "O",
    1: "I",
    5: "S",
    8: "B",
  }[char]) || char;
}

function normalizeDutchIbanCandidate(value) {
  const clean = normalizeIban(value);
  if (clean.length < 18) return clean;

  const chars = clean.slice(0, 18).split("");
  if (chars[0] !== "N") return clean;
  chars[1] = chars[1] === "1" || chars[1] === "I" ? "L" : chars[1];
  chars[2] = digitFromOcr(chars[2]);
  chars[3] = digitFromOcr(chars[3]);
  for (let index = 4; index < 8; index += 1) chars[index] = letterFromOcr(chars[index]);
  for (let index = 8; index < 18; index += 1) chars[index] = digitFromOcr(chars[index]);
  return chars.join("");
}

function ibanChecksumValid(iban) {
  const clean = normalizeIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(clean)) return false;

  const rearranged = `${clean.slice(4)}${clean.slice(0, 4)}`;
  let remainder = 0;
  for (const char of rearranged) {
    const value = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of value) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

function normalizePotentialIban(value) {
  const clean = normalizeIban(value);
  if (clean.startsWith("NL") || clean.startsWith("N1") || clean.startsWith("NI")) {
    const dutch = normalizeDutchIbanCandidate(clean);
    if (dutch.length === 18 && DUTCH_BANK_MAP[dutch.slice(4, 8)] && ibanChecksumValid(dutch)) {
      return dutch;
    }
  }
  if (ibanChecksumValid(clean)) return clean;
  return "";
}

function findIbanInText(text) {
  const upper = String(text || "").toUpperCase();
  const candidates = [];

  // Try with spaces first (as printed on cards)
  const spacedMatches = upper.match(/\b[A-Z]{2}[\s.\-]?[0-9OQDILSZB]{2}(?:[\s.\-]?[A-Z0-9]{2,4}){3,8}\b/g) || [];
  candidates.push(...spacedMatches);

  // Dutch bank cards are often printed as "NL67 ABNA 0464 8530 36"; OCR may
  // confuse O/0 and I/1, so collect a compact NL candidate and correct it.
  const compactText = normalizeIban(upper);
  const dutchMatches = compactText.match(/N[L1I][0-9OQDILSZB]{2}[A-Z0-9]{4}[A-Z0-9]{10}/g) || [];
  candidates.push(...dutchMatches);

  // Try compact/general IBAN candidates.
  const compactMatches = compactText.match(/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/g) || [];
  candidates.push(...compactMatches);

  for (const candidate of candidates) {
    const normalized = normalizePotentialIban(candidate);
    if (normalized) {
      return normalized;
    }
  }

  // Try compact fallback without checksum, for countries/cards where OCR drops
  // one trailing character. This keeps old behavior but only after stronger tries.
  const match = upper.match(IBAN_REGEX);
  if (match) return normalizeIban(match[1]);

  // Try loose: find any sequence that looks like an IBAN
  const loose = upper.match(/\b(NL|BE|DE|FR|GB|ES|IT|AT|CH|LU|IE|PT|FI|EE|LV|LT|CY|MT|SI|SK|BG|RO|HR|PL|CZ|HU|DK|SE|NO|IS)[0-9]{2}[A-Z0-9]{8,30}\b/);
  if (loose) {
    const clean = normalizeIban(loose[0]);
    if (clean.length >= 15 && clean.length <= 34) return clean;
  }
  return "";
}

export function detectBankNameFromIban(iban) {
  if (iban) {
    const clean = normalizeIban(iban);
    if (clean.startsWith("NL")) {
      const bankCode = clean.substring(4, 8);
      if (DUTCH_BANK_MAP[bankCode]) return DUTCH_BANK_MAP[bankCode];
    }
  }
  return "";
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Afbeelding kon niet worden geladen voor herkenning."));
    img.src = URL.createObjectURL(source);
  });
}

async function imageToDataUrl(file) {
  const image = await loadImage(file);
  try {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const maxWidth = 2200;
    const scale = Math.min(1.8, maxWidth / sourceWidth);
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);

    // Enhance contrast for better OCR
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

export async function recognizeBankCard({ frontFile, backFile, onProgress }) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: message => {
      if (message.status && typeof message.progress === "number") {
        onProgress?.(`${message.status} ${Math.round(message.progress * 100)}%`);
      }
    },
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    const textParts = [];
    const files = [frontFile, backFile].filter(Boolean);

    for (const file of files) {
      const image = await imageToDataUrl(file);
      const { data } = await worker.recognize(image);
      textParts.push(data.text || "");
    }

    const rawText = textParts.join("\n");
    const iban = findIbanInText(rawText);

    return {
      iban: iban ? formatIban(iban) : "",
      raw_text: rawText,
      detected_fields: iban ? ["iban"] : [],
    };
  } finally {
    await worker.terminate();
  }
}
