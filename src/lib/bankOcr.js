// OCR helpers for bank card / bank statement uploads.
// Uses tesseract.js (already installed) to extract the IBAN and background
// account-holder text from uploaded front/back images of a bank card.
// Bank name is derived from the typed or recognized IBAN in the UI.

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

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function collectIbanCandidates(text) {
  const upper = String(text || "").toUpperCase();
  const candidates = [];

  // Try with spaces first (as printed on cards)
  const spacedMatches = upper.match(/\b[A-Z]{2}[\s.\-]?[0-9OQDILSZBG]{2}(?:[\s.\-]?[A-Z0-9]{2,4}){3,8}\b/g) || [];
  candidates.push(...spacedMatches);

  // Dutch bank cards are often printed as "NL67 ABNA 0464 8530 36"; OCR may
  // confuse O/0 and I/1, so collect a compact NL candidate and correct it.
  const compactText = normalizeIban(upper);
  const dutchMatches = compactText.match(/N[L1I][0-9OQDILSZBG]{2}[A-Z0-9]{4}[A-Z0-9]{10}/g) || [];
  candidates.push(...dutchMatches);

  // Try compact/general IBAN candidates.
  const compactMatches = compactText.match(/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/g) || [];
  candidates.push(...compactMatches);

  // Try compact fallback without checksum, for countries/cards where OCR drops
  // one trailing character. This keeps old behavior but only after stronger tries.
  const match = upper.match(IBAN_REGEX);
  if (match) candidates.push(normalizeIban(match[1]));

  // Try loose: find any sequence that looks like an IBAN
  const loose = upper.match(/\b(NL|BE|DE|FR|GB|ES|IT|AT|CH|LU|IE|PT|FI|EE|LV|LT|CY|MT|SI|SK|BG|RO|HR|PL|CZ|HU|DK|SE|NO|IS)[0-9]{2}[A-Z0-9]{8,30}\b/);
  if (loose) {
    const clean = normalizeIban(loose[0]);
    if (clean.length >= 15 && clean.length <= 34) candidates.push(clean);
  }

  return candidates;
}

function findIbansInText(text) {
  const found = [];

  for (const candidate of collectIbanCandidates(text)) {
    const normalized = normalizePotentialIban(candidate);
    if (normalized && !found.includes(normalized)) {
      found.push(normalized);
    }
  }

  const upper = String(text || "").toUpperCase();
  const fallback = upper.match(IBAN_REGEX);
  if (fallback) {
    const normalized = normalizeIban(fallback[1]);
    if (normalized && !found.includes(normalized)) {
      found.push(normalized);
    }
  }

  return found;
}

function findIbanInText(text) {
  return findIbansInText(text)[0] || "";
}

function isLikelyPersonName(value) {
  const text = compact(value)
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ");
  if (text.length < 4 || text.length > 64) return false;
  if (/[0-9<>]/.test(text)) return false;
  if (/\b(ABN\s*[·.\-]?\s*AMRO|RABOBANK|ING|BUNQ|MAESTRO|MASTERCARD|VISA|DEBIT|BETAALPAS)\b/i.test(text)) return false;
  if (/\b(BANK|BANKIER|IBAN|BIC|SWIFT|KAARTHOUDER|CARDHOLDER|CARD|HOLDER|NAAM|NAME|CVV|CVC|VALID|GELDIG|THRU|EUR|EURO|CREDIT|DEBIT|PAS|CHIP|CONTACTLESS|CONTACTLOOS|VPAY|PIN|GIRO|REKENING|NUMMER|NR)\b/i.test(text)) return false;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const longWordCount = words.filter(word => word.replace(/[.'’-]/g, "").length >= 3).length;
  const initialCount = words.filter(word => /^[A-ZÀ-ÿ]\.?$/u.test(word)).length;
  if (longWordCount < 2 && !(initialCount >= 1 && longWordCount >= 1)) return false;

  return words.every(word => /^[A-ZÀ-ÿ][A-ZÀ-ÿa-zà-ÿ'’.-]*$/u.test(word));
}

function findAccountHolderInText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(line => compact(line))
    .filter(Boolean);

  const labelPatterns = [
    /\b(?:KAARTHOUDER|CARDHOLDER|CARD\s+HOLDER|NAAM|NAME)\b/i,
  ];

  for (const pattern of labelPatterns) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!pattern.test(lines[index])) continue;

      const sameLine = compact(lines[index].replace(pattern, "").replace(/^[:.\-\s]+/, ""));
      if (sameLine && isLikelyPersonName(sameLine)) return sameLine;

      for (let offset = 1; offset <= 2; offset += 1) {
        const candidate = compact(lines[index + offset] || "");
        if (candidate && isLikelyPersonName(candidate)) return candidate;
      }
    }
  }

  for (const line of lines) {
    if (isLikelyPersonName(line)) return line;
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

function detectBankNameInText(text) {
  const normalized = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (/\bABN[\s·.\-]*AMRO\b/.test(normalized) || /\bABNA\b/.test(normalized)) return "ABN AMRO";
  if (/\bRABO(?:BANK)?\b/.test(normalized) || /\bCOOPERATIEVE\s+RABOBANK\b/.test(normalized)) return "Rabobank";
  if (/\bINGB?\b/.test(normalized) || /\bING\s+BANK\b/.test(normalized)) return "ING";
  if (/\bBUNQ\b/.test(normalized)) return "bunq";
  if (/\bSNS\b/.test(normalized)) return "SNS Bank";
  if (/\bASN\b/.test(normalized)) return "ASN Bank";
  if (/\bREGIOBANK\b/.test(normalized)) return "RegioBank";
  if (/\bTRIODOS\b/.test(normalized)) return "Triodos Bank";
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

function canvasToDataUrl(image, crop, targetWidth = 2400, options = {}) {
  const {
    mode = "gray",
    contrast = 1.45,
    quality = 0.94,
  } = options;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const cropX = Math.max(0, Math.round((crop?.x ?? 0) * sourceWidth));
  const cropY = Math.max(0, Math.round((crop?.y ?? 0) * sourceHeight));
  const cropWidth = Math.max(1, Math.round((crop?.width ?? 1) * sourceWidth));
  const cropHeight = Math.max(1, Math.round((crop?.height ?? 1) * sourceHeight));
  const scale = Math.min(2.4, targetWidth / cropWidth);
  const outputWidth = Math.max(1, Math.round(cropWidth * scale));
  const outputHeight = Math.max(1, Math.round(cropHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);

  if (mode === "color") {
    return canvas.toDataURL("image/jpeg", quality);
  }

  const imageData = ctx.getImageData(0, 0, outputWidth, outputHeight);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));
    data[i] = contrasted;
    data[i + 1] = contrasted;
    data[i + 2] = contrasted;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", quality);
}

async function imageToDataUrls(file) {
  const image = await loadImage(file);
  try {
    return [
      canvasToDataUrl(image, { x: 0, y: 0, width: 1, height: 1 }, 2400),
      canvasToDataUrl(image, { x: 0, y: 0, width: 1, height: 0.55 }, 2600),
      canvasToDataUrl(image, { x: 0, y: 0.45, width: 1, height: 0.55 }, 2600),
    ];
  } finally {
    URL.revokeObjectURL(image.src);
  }
}

async function imageToIbanDataUrls(file) {
  const image = await loadImage(file);
  try {
    return [
      // Dutch debit cards often print the IBAN on a low-contrast lower band.
      canvasToDataUrl(image, { x: 0, y: 0.46, width: 1, height: 0.46 }, 3600, { contrast: 1.9 }),
      canvasToDataUrl(image, { x: 0, y: 0.48, width: 0.78, height: 0.42 }, 3600, { contrast: 1.9 }),
      // Some banks place IBAN/account data on the upper-left back side.
      canvasToDataUrl(image, { x: 0, y: 0, width: 0.85, height: 0.5 }, 3400, { contrast: 1.7 }),
      // Keep one color pass because embossed text can lose detail in grayscale.
      canvasToDataUrl(image, { x: 0, y: 0.44, width: 1, height: 0.5 }, 3400, { mode: "color", quality: 0.96 }),
    ];
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
    const sideResults = [];
    const files = [
      { side: "front", file: frontFile },
      { side: "back", file: backFile },
    ].filter(item => Boolean(item.file));

    for (const { side, file } of files) {
      const sideTextParts = [];
      const images = await imageToDataUrls(file);
      for (const image of images) {
        const { data } = await worker.recognize(image);
        sideTextParts.push(data.text || "");
      }

      let sideText = sideTextParts.join("\n");
      let sideIbans = findIbansInText(sideText);
      if (!sideIbans.length) {
        await worker.setParameters({
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ",
          tessedit_pageseg_mode: "6",
        });

        const ibanImages = await imageToIbanDataUrls(file);
        for (const image of ibanImages) {
          const { data } = await worker.recognize(image);
          sideTextParts.push(data.text || "");
        }

        await worker.setParameters({
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
          tessedit_char_whitelist: "",
          tessedit_pageseg_mode: "3",
        });

        sideText = sideTextParts.join("\n");
        sideIbans = findIbansInText(sideText);
      }

      const sideIban = sideIbans[0] || "";
      const sideBankName = detectBankNameFromIban(sideIban) || detectBankNameInText(sideText);
      const sideHolderName = findAccountHolderInText(sideText);

      sideResults.push({
        side,
        iban: sideIban ? formatIban(sideIban) : "",
        iban_raw: sideIban,
        account_holder_name: sideHolderName || "",
        bank_name: sideBankName || "",
      });
      textParts.push(`[${side}]\n${sideText}`);
    }

    const rawText = textParts.join("\n");
    const ibans = [];
    const accountHolderNames = [];

    for (const result of sideResults) {
      if (result.iban_raw && !ibans.includes(result.iban_raw)) {
        ibans.push(result.iban_raw);
      }
      if (result.account_holder_name && !accountHolderNames.includes(result.account_holder_name)) {
        accountHolderNames.push(result.account_holder_name);
      }
    }

    const fallbackIban = findIbanInText(rawText);
    if (fallbackIban && !ibans.includes(fallbackIban)) {
      ibans.push(fallbackIban);
    }
    const fallbackHolderName = findAccountHolderInText(rawText);
    if (fallbackHolderName && !accountHolderNames.includes(fallbackHolderName)) {
      accountHolderNames.push(fallbackHolderName);
    }

    const iban = ibans[0] || "";
    const accountHolderName = accountHolderNames[0] || "";

    return {
      iban: iban ? formatIban(iban) : "",
      account_holder_name: accountHolderName || "",
      side_results: sideResults,
      detected_ibans: ibans.map(formatIban),
      detected_account_holders: accountHolderNames,
      raw_text: rawText,
      detected_fields: iban ? ["iban"] : [],
    };
  } finally {
    await worker.terminate();
  }
}
