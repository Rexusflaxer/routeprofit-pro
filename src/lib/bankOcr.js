// OCR helpers for bank card / bank statement uploads.
// Uses tesseract.js (already installed) to extract IBAN, account holder name
// and bank name from uploaded front/back images of a bank card.

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

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
  INGB: "ING",
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

function findIbanInText(text) {
  const upper = String(text || "").toUpperCase();
  // Try with spaces first (as printed on cards)
  const spaced = upper.match(/\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}\s?[A-Z0-9]{0,4})\b/);
  if (spaced) {
    const clean = normalizeIban(spaced[1]);
    if (clean.length >= 15 && clean.length <= 34 && IBAN_REGEX.test(clean)) {
      return clean;
    }
  }
  // Try compact
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

function findAccountHolderInText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(line => compact(line))
    .filter(Boolean);

  // Look for label "Kaarthouder" / "Cardholder" / "Naam"
  const labelPatterns = [
    /\b(?:KAARTHOUDER|CARDHOLDER|CARD\s+HOLDER|NAAM|NAME)\b/i,
  ];

  for (const pattern of labelPatterns) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        // Value might be on same line after the label, or on the next line
        const sameLine = lines[i].replace(pattern, "").replace(/[:.]\s*/, "").trim();
        if (sameLine && isLikelyPersonName(sameLine)) return sameLine;
        for (let offset = 1; offset <= 2; offset++) {
          const candidate = compact(lines[i + offset] || "");
          if (candidate && isLikelyPersonName(candidate)) return candidate;
        }
      }
    }
  }

  // Fallback: look for a line that looks like a person name (not a bank name, not IBAN, not numbers)
  for (const line of lines) {
    if (isLikelyPersonName(line)) return line;
  }

  return "";
}

function isLikelyPersonName(value) {
  const text = compact(value);
  if (text.length < 3 || text.length > 40) return false;
  if (/\d/.test(text)) return false;
  if (/\b(BANK|BANKIER|IBAN|BIC|SWIFT|KAARTHOUDER|CARDHOLDER|CARD|HOLDER|NAAM|NAME|CVV|CVC|VALID|GELDIG|THRU|EUR|EURO|CREDIT|DEBIT|PAS|CHIP|CONTACTLESS|CONTACTLOOS|MAESTRO|VISA|MASTERCARD|VPAY|PIN|GIRO|REKENING|NUMMER)\b/i.test(text)) {
    return false;
  }
  // Must contain at least one space (first + last name) or be a single capitalized word
  const words = text.split(/\s+/);
  if (words.length < 1) return false;
  // Check that words look like name parts (start with uppercase, contain letters)
  return words.every(w => /^[A-ZÀ-ÿ][a-zà-ÿ''-]*$/.test(w)) && words.length >= 1;
}

function findBankNameInText(text, iban) {
  const upper = String(text || "").toUpperCase();
  // Check for known bank names in text
  const knownBanks = [
    "ABN AMRO", "RABOBANK", "ING", "BUNQ", "ARGENTA", "SNS BANK", "REGIOBANK",
    "TRIODOS BANK", "KNAB", "VAN LANSCHOT", "ASN BANK", "MONEYOU", "NIBC BANK",
    "BINCKBANK", "CREDIT EUROPE BANK", "FLORIUS", "HANDelsbanken".toUpperCase(),
    "SOCIÉTÉ GÉNÉRALE", "STAALBANKIERS", "FRIESLAND BANK", "ACHMEA BANK",
  ];
  for (const bank of knownBanks) {
    if (upper.includes(bank.toUpperCase())) return bank;
  }

  // Derive from Dutch IBAN bank code
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
    const accountHolderName = findAccountHolderInText(rawText);
    const bankName = findBankNameInText(rawText, iban);

    return {
      iban: iban ? formatIban(iban) : "",
      account_holder_name: accountHolderName || "",
      bank_name: bankName || "",
      raw_text: rawText,
      detected_fields: ["iban", "account_holder_name", "bank_name"].filter(
        key => ({ iban, account_holder_name: accountHolderName, bank_name: bankName }[key])
      ),
    };
  } finally {
    await worker.terminate();
  }
}