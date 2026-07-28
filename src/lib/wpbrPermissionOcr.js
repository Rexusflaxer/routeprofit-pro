import { loadPdfRenderer } from "@/lib/contractPdfLetterhead";

const MAX_OCR_PAGES = 8;
const OCR_RENDER_WIDTH = 1800;

const DUTCH_MONTHS = {
  januari: 1,
  februari: 2,
  maart: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  augustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  december: 12,
};

const KNOWN_LABELS = [
  "Organisatienaam",
  "Vestigingsadres",
  "Naam en voornamen",
  "Geboorteplaats en geboortedatum",
  "Geboorteplaats en datum",
  "Nummer beschikking",
  "Datum beschikking",
  "Politie-eenheid",
  "Ons kenmerk",
  "Datum",
  "Onderwerp",
  "Behandeld door",
  "Woonadres",
  "Adres",
];

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return compact(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineValueAfterLabel(text, labels) {
  const lines = String(text || "").split(/\r?\n/);
  const sortedLabels = [...labels].sort((left, right) => right.length - left.length);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const label of sortedLabels) {
      const match = line.match(new RegExp(
        `(?:^|\\s)${escapeRegExp(label).replace(/\\s+/g, "\\s+")}\\s*(?::|;|\\||=|\\.{2,}|-{1,}|–|—)?\\s*(.*)$`,
        "i"
      ));
      if (!match) continue;

      const inlineValue = trimAtKnownLabel(match[1]);
      if (usefulValue(inlineValue)) return inlineValue;

      for (let offset = 1; offset <= 2; offset += 1) {
        const nextLine = compact(lines[index + offset]);
        if (!nextLine || startsWithKnownLabel(nextLine)) break;
        const nextValue = trimAtKnownLabel(nextLine);
        if (usefulValue(nextValue)) return nextValue;
      }
    }
  }
  return "";
}

function addressValueAfterLabel(text, labels) {
  const value = lineValueAfterLabel(text, labels);
  if (!value) return "";

  const lines = String(text || "").split(/\r?\n/).map(compact);
  const valueIndex = lines.findIndex(line => normalize(line).includes(normalize(value)));
  if (valueIndex < 0) return value;

  const nextLine = compact(lines[valueIndex + 1]);
  const hasPostcode = /\b[0-9OQ]{4}\s*[A-Z]{2}\b/i.test(value);
  const nextIsPostcodeLine = /\b[0-9OQ]{4}\s*[A-Z]{2}\b/i.test(nextLine);
  if (!hasPostcode && nextIsPostcodeLine && !startsWithKnownLabel(nextLine)) {
    return compact(`${value}, ${nextLine}`);
  }

  return value;
}

function startsWithKnownLabel(value) {
  const normalized = normalize(value);
  return KNOWN_LABELS.some(label => normalized.startsWith(normalize(label)));
}

function trimAtKnownLabel(value) {
  let result = compact(value).replace(/^[:;|.\-\s]+/, "");
  KNOWN_LABELS.forEach(label => {
    const match = result.match(new RegExp(`\\s+${escapeRegExp(label)}\\s*(?::|;|\\||=)`, "i"));
    if (match?.index !== undefined) result = result.slice(0, match.index);
  });
  return compact(result).replace(/[|]+$/g, "");
}

function usefulValue(value) {
  const cleaned = compact(value);
  return Boolean(cleaned && /[A-Z0-9]{2}/i.test(cleaned) && !startsWithKnownLabel(cleaned));
}

function validIsoDate(year, month, day) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  if (
    numericYear < 1900
    || numericYear > 2100
    || numericMonth < 1
    || numericMonth > 12
    || numericDay < 1
    || numericDay > 31
  ) return "";

  const value = `${String(numericYear).padStart(4, "0")}-${String(numericMonth).padStart(2, "0")}-${String(numericDay).padStart(2, "0")}`;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    date.getUTCFullYear() === numericYear
    && date.getUTCMonth() + 1 === numericMonth
    && date.getUTCDate() === numericDay
  ) ? value : "";
}

export function parseDutchPermissionDate(value) {
  const cleaned = compact(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const numeric = cleaned
    .replace(/[oqd]/g, "0")
    .replace(/[il]/g, "1")
    .match(/\b([0-3]?\d)[\s./-]([01]?\d)[\s./-]((?:19|20)?\d{2})\b/);
  const written = cleaned.match(
    new RegExp(`\\b([0-3]?\\d)\\s+(${Object.keys(DUTCH_MONTHS).join("|")})\\s+((?:19|20)\\d{2})\\b`, "i")
  );
  if (!numeric && !written) return "";

  if (written && (!numeric || written.index < numeric.index)) {
    return validIsoDate(written[3], DUTCH_MONTHS[written[2].toLowerCase()], written[1]);
  }

  let year = Number(numeric[3]);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  return validIsoDate(year, numeric[2], numeric[1]);
}

function dateNearLabel(text, labels, maxLength = 220) {
  const source = String(text || "");
  for (const label of labels) {
    const match = source.match(new RegExp(escapeRegExp(label).replace(/\s+/g, "\\s+"), "i"));
    if (match?.index === undefined) continue;
    const parsed = parseDutchPermissionDate(source.slice(match.index, match.index + maxLength));
    if (parsed) return parsed;
  }
  return "";
}

function dateNearPattern(text, pattern, maxLength = 180) {
  const match = String(text || "").match(pattern);
  if (!match) return "";
  return parseDutchPermissionDate(String(text).slice(match.index, match.index + maxLength));
}

function splitPermissionHolder(value) {
  const cleaned = compact(value);
  if (!cleaned) return { last_name: "", given_names: "" };
  const commaParts = cleaned.split(",").map(part => compact(part)).filter(Boolean);
  if (commaParts.length >= 2) {
    return {
      last_name: commaParts[0],
      given_names: commaParts.slice(1).join(" "),
    };
  }
  return { last_name: cleaned, given_names: "" };
}

function birthPlaceFromValue(value) {
  const cleaned = compact(value);
  const writtenDate = cleaned.match(
    new RegExp(`\\b[0-3]?\\d\\s+(?:${Object.keys(DUTCH_MONTHS).join("|")})\\s+(?:19|20)\\d{2}\\b`, "i")
  );
  const numericDate = cleaned.match(/\b[0-3]?\d[\s./-][01]?\d[\s./-](?:19|20)?\d{2}\b/);
  const dateMatch = writtenDate || numericDate;
  if (!dateMatch || dateMatch.index === undefined) {
    return cleaned.includes(",") ? compact(cleaned.split(",")[0]) : "";
  }
  return compact(cleaned.slice(0, dateMatch.index)
    .replace(/^[_:;|.\-\s]+/, "")
    .replace(/[,\s]+$/, ""));
}

function permissionCondition(text) {
  const normalized = normalize(text);
  const conditional = [
    "ONDER DE VOLGENDE VOORWAARDE",
    "VOORWAARDELIJKE TOESTEMMING",
    "TOESTEMMING KAN ALSNOG WORDEN INGETROKKEN",
  ].some(needle => normalized.includes(needle));
  if (!conditional) {
    return {
      conditional_permission: false,
      condition_type: "",
      condition_summary: "",
    };
  }

  const criminalRecordsPending = (
    normalized.includes("STRAFRECHTELIJKE GEGEVENS")
    || normalized.includes("JUSTITIELE GEGEVENS")
  ) && (
    normalized.includes("NOG NIET VOLLEDIG")
    || normalized.includes("NOG NIET AFGEROND")
    || normalized.includes("IN AFWACHTING")
    || normalized.includes("ALSNOG EEN BEVRAGING")
    || normalized.includes("ALSNOG EEN BEVRAGING PLAATSVINDEN")
  );

  return {
    conditional_permission: true,
    condition_type: criminalRecordsPending ? "pending_criminal_records_check" : "other_condition",
    condition_summary: criminalRecordsPending
      ? "De toestemming is verleend onder voorwaarde van afronding van de controle van strafrechtelijke gegevens."
      : "De brief bevat een voorwaarde die voor inzet en opvolging moet worden gecontroleerd.",
  };
}

function permissionQuality(fields, text) {
  const required = [
    "organization_name",
    "last_name",
    "birth_date",
    "decision_number",
    "decision_date",
    "valid_from",
    "valid_until",
  ];
  const found = required.filter(field => Boolean(fields[field]));
  const normalized = normalize(text);
  const documentDetected = (
    normalized.includes("KORPSCHEF")
    || normalized.includes("KORPSCHEFTAKEN")
  ) && (
    normalized.includes("TOESTEMMING")
    || normalized.includes("BESLUIT AAN")
    || normalized.includes("WPBR")
  );
  const decisionDetected = normalized.includes("NUMMER BESCHIKKING")
    || normalized.includes("DATUM BESCHIKKING")
    || normalized.includes("BESLUIT AAN");
  const score = Math.round((found.length / required.length) * 80)
    + (documentDetected ? 10 : 0)
    + (decisionDetected ? 10 : 0);

  return {
    status: !documentDetected || score < 65 ? "review" : "ok",
    score: Math.min(100, score),
    title: score >= 80 && documentDetected ? "Toestemmingsbrief goed herkend" : "Handmatige controle nodig",
    summary: score >= 80 && documentDetected
      ? "De besluitgegevens, geldigheid en koppelgegevens zijn uit de brief gelezen."
      : "Niet alle kerngegevens konden betrouwbaar uit de brief worden gelezen. Controleer de ingevulde velden.",
    checks: [
      { key: "document_type", label: "Document herkend als toestemmingsbrief", status: documentDetected ? "pass" : "warn" },
      { key: "decision", label: "Beschikkingsgegevens herkend", status: fields.decision_number && fields.decision_date ? "pass" : "warn" },
      { key: "validity", label: "Geldigheidsperiode herkend", status: fields.valid_from && fields.valid_until ? "pass" : "warn" },
      { key: "holder", label: "Medewerkergegevens herkend", status: fields.last_name && fields.birth_date ? "pass" : "warn" },
      { key: "company", label: "Organisatie herkend", status: fields.organization_name ? "pass" : "warn" },
    ],
  };
}

export function parseWpbrPermissionOcrText({ pageTexts = [], text = "" } = {}) {
  const pages = pageTexts.length ? pageTexts : [text];
  const combined = pages.join("\n");
  const holderValue = lineValueAfterLabel(combined, ["Naam en voornamen", "Naam/voornamen"]);
  const holder = splitPermissionHolder(holderValue);
  const birthValue = lineValueAfterLabel(combined, [
    "Geboorteplaats en geboortedatum",
    "Geboorteplaats en datum",
  ]);
  const decisionNumber = compact(lineValueAfterLabel(combined, ["Nummer beschikking"]))
    .replace(/[^A-Z0-9/-]/gi, "");
  const correspondenceReference = compact(lineValueAfterLabel(combined, ["Ons kenmerk"]))
    .replace(/[^A-Z0-9/-]/gi, "");
  const condition = permissionCondition(combined);

  const fields = {
    organization_name: lineValueAfterLabel(combined, ["Organisatienaam"]),
    organization_address: addressValueAfterLabel(combined, ["Vestigingsadres"]),
    holder_name: holderValue,
    last_name: holder.last_name,
    given_names: holder.given_names,
    birth_place: birthPlaceFromValue(birthValue),
    birth_date: parseDutchPermissionDate(birthValue),
    holder_address: addressValueAfterLabel(combined.slice(Math.max(
      0,
      combined.search(/TEN\s+BEHOEVE\s+VAN/i)
    )), ["Woonadres", "Adres"]),
    decision_number: decisionNumber,
    decision_date: dateNearLabel(combined, ["Datum beschikking"])
      || dateNearPattern(combined, /\bOns\s+kenmerk\b[\s\S]{0,220}\bDatum\b/i, 320),
    valid_from: dateNearPattern(
      combined,
      /\bper\b[\s\S]{0,80}\btoestemming(?:\s+te\s+verlenen)?\b/i
    ) || dateNearLabel(combined, ["Geldig vanaf", "Ingangsdatum"]),
    valid_until: dateNearPattern(
      combined,
      /\b(?:de\s+)?toestemming\s+vervalt\s+op\b/i
    ) || dateNearLabel(combined, ["Geldig tot", "Vervalt op"]),
    correspondence_reference: correspondenceReference,
    police_unit: lineValueAfterLabel(combined, ["Politie-eenheid"])
      || compact(combined.match(/politiechef\s+van\s+(?:de\s+)?eenheid\s+([^,;\n]+)/i)?.[1]),
    subject: lineValueAfterLabel(combined, ["Onderwerp"]),
    application_date: dateNearLabel(combined, ["Datum aanvraag"])
      || dateNearPattern(combined, /\bOp\b[\s\S]{0,25}\bontving\s+ik\b/i, 100),
    ...condition,
  };

  return {
    ...fields,
    document_detected: permissionQuality(fields, combined).checks[0].status === "pass",
    detected_fields: Object.entries(fields)
      .filter(([, value]) => value !== "" && value !== null && value !== false)
      .map(([field]) => field),
    upload_quality: permissionQuality(fields, combined),
  };
}

async function renderPdfForPermissionOcr(file) {
  const pdfjs = await loadPdfRenderer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const pages = [];

  try {
    const pageCount = Math.min(pdf.numPages, MAX_OCR_PAGES);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: OCR_RENDER_WIDTH / baseViewport.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Een pagina uit de toestemmingsbrief kon niet worden voorbereid.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push({
        source: canvas,
        page_number: pageNumber,
      });
    }
  } finally {
    await pdf.destroy?.();
  }

  return pages;
}

async function permissionOcrSources(file) {
  const isPdf = file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
  if (isPdf) return renderPdfForPermissionOcr(file);
  return [{ source: file, page_number: 1 }];
}

export async function recognizeWpbrPermission({ file, onProgress } = {}) {
  if (!file) throw new Error("Een toestemmingsbrief is nodig voor herkenning.");
  const pages = await permissionOcrSources(file);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("nld+eng", 1, {
    logger: message => {
      if (typeof message.progress !== "number") return;
      onProgress?.({
        status: message.status || "Brief uitlezen",
        progress: Math.round(message.progress * 100),
      });
    },
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const pageTexts = [];
    for (let index = 0; index < pages.length; index += 1) {
      onProgress?.({
        status: `Pagina ${index + 1} van ${pages.length} uitlezen`,
        progress: Math.round((index / pages.length) * 90),
      });
      const result = await worker.recognize(pages[index].source);
      pageTexts.push(result?.data?.text || "");
    }
    onProgress?.({ status: "Gegevens controleren", progress: 95 });
    return {
      ...parseWpbrPermissionOcrText({ pageTexts }),
      page_count: pages.length,
    };
  } finally {
    await worker.terminate();
  }
}
