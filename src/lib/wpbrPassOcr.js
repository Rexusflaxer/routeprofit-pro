function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return compact(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function cleanFieldValue(value) {
  return compact(value)
    .replace(/^[:;|.\-\s]+/, "")
    .replace(/[|]+$/g, "")
    .trim();
}

function linesOf(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

const KNOWN_FIELD_LABELS = [
  "Naam organisatie",
  "Organisatie",
  "Vergunningnummer",
  "Vergunning nummer",
  "Telefoonnummer",
  "Geldig van",
  "Geldig tot",
  "Valid from",
  "Valid until",
  "tot en met",
  "Naam",
  "Voornamen",
  "Geboortedatum",
  "Geboren",
  "Pasnummer",
  "Pas nummer",
  "Persoonsbeveiliger",
  "Winkelsurveillant",
  "Ontheffing Uniformdraagplicht",
  "Beperking",
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelPattern(label) {
  return escapeRegExp(label)
    .split(/\s+/)
    .join("\\s+");
}

function matchLeadingLabel(line, label) {
  const pattern = labelPattern(label);
  const delimited = String(line).match(
    new RegExp(`^\\s*${pattern}\\s*(?::|;|\\||=|\\.{2,}|-{1,}|–|—)\\s*(.*)$`, "i")
  );
  if (delimited) return { value: cleanFieldValue(delimited[1]), matched: true };

  if (normalize(line) === normalize(label)) return { value: "", matched: true };

  const spaced = String(line).match(new RegExp(`^\\s*${pattern}\\s{2,}(.+)$`, "i"));
  if (spaced) return { value: cleanFieldValue(spaced[1]), matched: true };

  return { value: "", matched: false };
}

function isKnownLabelLine(line) {
  return KNOWN_FIELD_LABELS.some(label => matchLeadingLabel(line, label).matched);
}

function isUsefulFieldValue(value) {
  const cleaned = cleanFieldValue(value);
  return Boolean(cleaned && /[A-Z0-9]{2}/i.test(cleaned) && !isKnownLabelLine(cleaned));
}

function fieldAfterLabel(text, labels, { maxNextLines = 2 } = {}) {
  const lines = linesOf(text);
  for (let index = 0; index < lines.length; index += 1) {
    const match = [...labels]
      .sort((left, right) => right.length - left.length)
      .map(label => matchLeadingLabel(lines[index], label))
      .find(candidate => candidate.matched);
    if (!match) continue;

    if (isUsefulFieldValue(match.value)) return match.value;

    for (let offset = 1; offset <= maxNextLines; offset += 1) {
      const nextLine = lines[index + offset];
      if (!nextLine || isKnownLabelLine(nextLine)) break;
      const candidate = cleanFieldValue(nextLine);
      if (isUsefulFieldValue(candidate)) return candidate;
    }
  }
  return "";
}

function parseIsoDate(value) {
  const normalized = normalize(value)
    .replace(/[OQD]/g, "0")
    .replace(/[IL]/g, "1");
  const match = normalized.match(/\b([0-3]?\d)[\s./-]([01]?\d)[\s./-]((?:19|20)?\d{2})\b/);
  if (!match) return "";
  let year = Number(match[3]);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  const month = Number(match[2]);
  const day = Number(match[1]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateAfterLabel(text, labels) {
  const labeled = fieldAfterLabel(text, labels);
  if (labeled) {
    const parsed = parseIsoDate(labeled);
    if (parsed) return parsed;
  }

  const upper = normalize(text);
  for (const label of labels) {
    const index = upper.indexOf(normalize(label));
    if (index < 0) continue;
    const parsed = parseIsoDate(upper.slice(index, index + 150));
    if (parsed) return parsed;
  }
  return "";
}

function normalizeIdentifier(value) {
  return compact(value)
    .toUpperCase()
    .replace(/[^A-Z0-9/-]/g, "")
    .replace(/^[-/]+|[-/]+$/g, "");
}

function detectRole(frontText) {
  const text = normalize(frontText);
  const roles = [
    ["ASPIRANT", "Aspirant"],
    ["PARTICULIER ONDERZOEKER", "Particulier onderzoeker"],
    ["RECHERCHEUR", "Rechercheur"],
    ["CENTRALIST", "Centralist"],
    ["BEVEILIGER", "Beveiliger"],
  ];
  return roles.find(([needle]) => text.includes(needle))?.[1] || "";
}

function checkboxValue(text, label) {
  const upper = normalize(text);
  const index = upper.indexOf(normalize(label));
  if (index < 0) return null;
  const slice = upper.slice(index, index + 100);
  if (/(?:JA|YES)\s*[:=]?\s*(?:X|V|AANGEKRUIST)/.test(slice)) return true;
  if (/(?:NEE|NO)\s*[:=]?\s*(?:X|V|AANGEKRUIST)/.test(slice)) return false;
  return null;
}

function buildQuality(fields, frontText, backText) {
  const required = ["organization_name", "license_number", "valid_from", "valid_until", "last_name", "birth_date", "card_number"];
  const found = required.filter(field => Boolean(fields[field]));
  const frontLooksLikePass = /LEGITIMATIEBEWIJS/.test(normalize(frontText))
    && /(BEVEILIGINGSORGANISATIE|RECHERCHEBUREAU|BEVEILIGER)/.test(normalize(frontText));
  const backLooksLikePass = /LEGITIMATIEBEWIJS/.test(normalize(backText))
    || /(UNIFORMDRAAGPLICHT|BEPERKING|KORPSCHEF)/.test(normalize(backText));
  const score = Math.round((found.length / required.length) * 80)
    + (frontLooksLikePass ? 10 : 0)
    + (backLooksLikePass ? 10 : 0);

  return {
    status: !frontLooksLikePass || !backLooksLikePass || score < 60 ? "review" : "ok",
    score: Math.min(100, score),
    title: score >= 80 ? "Document goed herkend" : "Handmatige controle nodig",
    summary: score >= 80
      ? "De belangrijkste kaartgegevens zijn uitgelezen. Controleer ze voor het opslaan."
      : "Niet alle kaartgegevens konden betrouwbaar worden uitgelezen. Vul ontbrekende gegevens handmatig aan.",
    checks: [
      { key: "front_type", label: "Voorkant herkend als Wpbr-legitimatiebewijs", status: frontLooksLikePass ? "pass" : "warn" },
      { key: "back_type", label: "Achterkant herkend als Wpbr-legitimatiebewijs", status: backLooksLikePass ? "pass" : "warn" },
      { key: "fields", label: `${found.length} van ${required.length} kernvelden herkend`, status: found.length >= 5 ? "pass" : "warn" },
    ],
  };
}

export function parseWpbrPassOcrText({ frontText = "", backText = "" } = {}) {
  const combined = `${frontText}\n${backText}`;
  const validFrom = dateAfterLabel(frontText, ["Geldig van", "Valid from"]);
  const validUntil = dateAfterLabel(frontText, ["tot en met", "Geldig tot", "Valid until"]);
  const restrictionText = fieldAfterLabel(backText, ["Beperking"]);
  const fields = {
    organization_name: fieldAfterLabel(frontText, ["Naam organisatie", "Organisatie"]),
    license_number: normalizeIdentifier(fieldAfterLabel(frontText, ["Vergunningnummer", "Vergunning nummer"])),
    valid_from: validFrom,
    valid_until: validUntil,
    last_name: fieldAfterLabel(frontText, ["Naam"]),
    given_names: fieldAfterLabel(frontText, ["Voornamen"]),
    birth_date: dateAfterLabel(frontText, ["Geboortedatum", "Geboren"]),
    card_number: normalizeIdentifier(fieldAfterLabel(frontText, ["Pasnummer", "Pas nummer"])),
    card_role: detectRole(frontText),
    personal_security: checkboxValue(frontText, "Persoonsbeveiliger"),
    retail_surveillance: checkboxValue(frontText, "Winkelsurveillant"),
    uniform_exemption: checkboxValue(backText, "Ontheffing Uniformdraagplicht"),
    restriction_applies: checkboxValue(backText, "Beperking"),
    restriction_text: restrictionText,
  };

  return {
    ...fields,
    detected_fields: Object.entries(fields)
      .filter(([, value]) => value !== "" && value !== null)
      .map(([field]) => field),
    upload_quality: buildQuality(fields, frontText, backText),
    document_detected: /LEGITIMATIEBEWIJS/.test(normalize(combined)),
  };
}

export async function recognizeWpbrPass({ frontFile, backFile, onProgress } = {}) {
  if (!frontFile || !backFile) throw new Error("Voor- en achterkant zijn nodig voor herkenning.");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: message => {
      if (message.status && typeof message.progress === "number") {
        onProgress?.({
          status: message.status,
          progress: Math.round(message.progress * 100),
        });
      }
    },
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    onProgress?.({ status: "Voorkant uitlezen", progress: 5 });
    const front = await worker.recognize(frontFile);
    onProgress?.({ status: "Achterkant uitlezen", progress: 55 });
    const back = await worker.recognize(backFile);
    onProgress?.({ status: "Gegevens controleren", progress: 95 });
    return parseWpbrPassOcrText({
      frontText: front?.data?.text || "",
      backText: back?.data?.text || "",
    });
  } finally {
    await worker.terminate();
  }
}
