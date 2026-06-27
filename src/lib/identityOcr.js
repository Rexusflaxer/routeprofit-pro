const MRZ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

const MONTHS = {
  JAN: 1,
  JANUARI: 1,
  FEB: 2,
  FEBRUARI: 2,
  MRT: 3,
  MAA: 3,
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

function cleanPersonText(value) {
  return compact(value)
    .replace(/[<]+/g, " ")
    .replace(/\s+\/\s+/g, " ")
    .replace(/[^A-Za-zÀ-ÿ' .-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[ .'-]+|[ .'-]+$/g, "");
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function ocrDigits(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[OQD]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/[S]/g, "5")
    .replace(/[B]/g, "8")
    .replace(/\D/g, "");
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
  const numeric = text.match(/\b([0-3OQDILSB]?[0-9OQDILSB])[\s./-]([01OQDILSB]?[0-9OQDILSB])[\s./-]((?:19|20)?[0-9OQDILSB]{2})\b/);
  if (numeric) {
    const year = parseYear(ocrDigits(numeric[3]));
    return year ? toIsoDate(year, Number(ocrDigits(numeric[2])), Number(ocrDigits(numeric[1]))) : null;
  }

  const named = text.match(/\b([0-3]?\d)\s+([A-ZÀ-ÿ]{3,10}(?:\/[A-ZÀ-ÿ]{3,10})?)\s+((?:19|20)?\d{2})\b/);
  if (named) {
    const monthToken = named[2]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split("/")
      .find(Boolean);
    const month = MONTHS[monthToken];
    const year = parseYear(named[3]);
    return month && year ? toIsoDate(year, month, Number(named[1])) : null;
  }
  return null;
}

function extractVisibleDates(value) {
  const text = String(value || "").toUpperCase();
  const dates = [];
  const addDate = (date, index) => {
    if (!date) return;
    dates.push({ date, index });
  };

  const numericPattern = /\b([0-3OQDILSB]?[0-9OQDILSB])[\s./-]([01OQDILSB]?[0-9OQDILSB])[\s./-]((?:19|20)?[0-9OQDILSB]{2})\b/g;
  for (const match of text.matchAll(numericPattern)) {
    const year = parseYear(ocrDigits(match[3]));
    addDate(year ? toIsoDate(year, Number(ocrDigits(match[2])), Number(ocrDigits(match[1]))) : null, match.index);
  }

  const namedPattern = /\b([0-3]?\d)\s+([A-ZÀ-ÿ]{3,10}(?:\/[A-ZÀ-ÿ]{3,10})?)\s+((?:19|20)?\d{2})\b/g;
  for (const match of text.matchAll(namedPattern)) {
    const monthToken = match[2]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split("/")
      .find(Boolean);
    const month = MONTHS[monthToken];
    const year = parseYear(match[3]);
    addDate(month && year ? toIsoDate(year, month, Number(match[1])) : null, match.index);
  }

  const seen = new Set();
  return dates
    .sort((a, b) => a.index - b.index)
    .filter(item => {
      if (seen.has(item.date)) return false;
      seen.add(item.date);
      return true;
    });
}

function parseCompactVisibleDate(value) {
  const digits = ocrDigits(value);
  const candidates = [];
  if (digits.length < 8) return null;

  for (let index = 0; index <= Math.min(2, digits.length - 8); index += 1) {
    candidates.push(digits.slice(index, index + 8));
  }

  for (const candidate of [...new Set(candidates)]) {
    const day = Number(candidate.slice(0, 2));
    const month = Number(candidate.slice(2, 4));
    const year = Number(candidate.slice(4, 8));
    if (year < 1900 || year > 2099) continue;
    const date = toIsoDate(year, month, day);
    if (date) return date;
  }

  return null;
}

function findDateNearLabel(text, labels) {
  const upper = text.toUpperCase();
  for (const label of labels) {
    const index = upper.indexOf(label);
    if (index < 0) continue;
    const slice = upper.slice(index, index + 220);
    const date = parseVisibleDate(slice) || extractVisibleDates(slice)[0]?.date;
    if (date) return date;
  }
  return null;
}

function findVisibleBirthDate(text) {
  const labeled = findDateNearLabel(text, [
    "GEBOORTEDATUM",
    "DATE OF BIRTH",
    "DATE OF BIRTH",
    "BIRTH",
    "NAISSANCE",
  ]);
  if (labeled) return labeled;

  const currentYear = new Date().getFullYear();
  const dates = extractVisibleDates(text)
    .map(item => item.date)
    .filter(date => Number(date.slice(0, 4)) <= currentYear - 5)
    .sort();
  return dates[0] || "";
}

function isLikelyVisiblePersonName(value) {
  const text = cleanPersonText(value);
  if (text.length < 3 || text.length > 60) return false;
  if (/\d/.test(value)) return false;

  const upper = text.toUpperCase();
  if (/\b(NEDERLAND|NEDERLANDSE|NEDERIANDSE|KINGDOM|KONINKRIJK|IDENTITEITSKAART|IDENTITY|CARTE|DOCUMENT|DATUM|DATE|GELDIG|GEBOORTE|BIRTH|PLACE|PERSOON|PERSOONS|PERSOONSNR|PERSONAL|PERSONNEL|IDENTIFIANT|NUMMER|NUMBER|NO|NAAM|SURNAME|NAME|NAMES|VOORNAMEN|GIVEN|PRENOMS|PRÉNOMS|NOM|NATIONALITEIT|NATIONALITY|GESLACHT|SEX|LENGTE|HEIGHT|TAILLE|CAN|MODEL|SERIE|PASPOORT|PASSPORT|RIJBEWIJS|SPECIMEN|VERVOLG|CONTINUE|SUITE|INSTANTIE|AUTHORITY|HANDTEKENING|SIGNATURE)\b/.test(upper)) {
    return false;
  }

  return /[A-Za-zÀ-ÿ]{3}/.test(text);
}

function isIdentityFieldLabelLine(value) {
  const upper = cleanPersonText(value).toUpperCase();
  return /\b(NAAM|SURNAME|NAME|VOORNAMEN|GIVEN|NAMES|PRENOMS|PRÉNOMS|NOM|PERSOON|PERSOONS|PERSOONSNR|PERSONAL|PERSONNEL|IDENTIFIANT|NUMMER|NUMBER|NO|GEBOORTE|BIRTH|DATUM|DATE|GELDIG|NATIONALITEIT|NATIONALITY|GESLACHT|SEX|LENGTE|HEIGHT|TAILLE|CAN|INSTANTIE|AUTHORITY|HANDTEKENING|SIGNATURE|VERVOLG|CONTINUE|SUITE)\b/.test(upper);
}

function findVisiblePersonNameAfterLabel(lines, labelPattern) {
  for (let index = 0; index < lines.length; index += 1) {
    const upperLine = lines[index].toUpperCase();
    if (/VERVOLG\s+NAAM|CONTINUE\s+SURNAME/.test(upperLine)) continue;
    if (!labelPattern.test(upperLine)) continue;
    for (let offset = 1; offset <= 3; offset += 1) {
      const rawCandidate = lines[index + offset] || "";
      if (isIdentityFieldLabelLine(rawCandidate)) continue;
      if (isLikelyVisiblePersonName(rawCandidate)) return cleanPersonText(rawCandidate);
    }
  }
  return "";
}

function findFallbackIdCardVisibleNames(lines) {
  const documentLineIndex = lines.findIndex(line => {
    const tokens = line.toUpperCase().match(/[A-Z0-9]{8,10}/g) || [];
    return tokens.some(token => isLikelyIdCardNumber(token.length === 10 ? token.slice(0, 9) : token));
  });
  if (documentLineIndex < 0) return {};

  const names = [];
  for (let index = documentLineIndex + 1; index < Math.min(lines.length, documentLineIndex + 9); index += 1) {
    const line = lines[index];
    const upperLine = line.toUpperCase();
    if (extractVisibleDates(line).length > 0) break;
    if (/\b(NEDERLAND|NEDERLANDSE|NEDERIANDSE|NATIONALITEIT|NATIONALITY|GESLACHT|SEX|DATUM|DATE|CAN)\b/.test(upperLine)) break;

    if (isLikelyVisiblePersonName(line)) names.push(cleanPersonText(line));
  }

  if (!names.length) return {};

  return {
    last_name: names[0] || "",
    given_names: names.slice(1).at(-1) || "",
  };
}

function findVisibleIdentityPerson(text, { docType = "" } = {}) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const fallback = docType === "id_card" ? findFallbackIdCardVisibleNames(lines) : {};

  return {
    last_name: findVisiblePersonNameAfterLabel(lines, /\b(NAAM|SURNAME|NOM)\b/) || fallback.last_name || "",
    given_names: findVisiblePersonNameAfterLabel(lines, /\b(VOORNAMEN|GIVEN\s+NAMES|PRENOMS|PRÉNOMS)\b/) || fallback.given_names || "",
    birth_date: findVisibleBirthDate(text),
  };
}

function findVisibleIssueDate(text, expiryDate = "", birthDate = "") {
  const labeled = findDateNearLabel(text, [
    "DATUM VAN AFGIFTE",
    "DATUM VAN ALGIFTE",
    "DATE OF ISSUE",
    "DATE OF ISS",
    "ISSUED ON",
    "ISSWE",
    "AFGIFTE",
    "ALGIFTE",
  ]);
  if (labeled) return labeled;

  const today = new Date().toISOString().split("T")[0];
  const dates = extractVisibleDates(text)
    .map(item => item.date)
    .filter(date => date !== birthDate && date !== expiryDate && date <= today)
    .sort();
  return dates[0] || "";
}

function findVisibleExpiryDate(text) {
  const labeled = findDateNearLabel(text, [
    "GELDIG TOT",
    "DATE OF EXPIRY",
    "DATE OF EXPI",
    "EXPIRY DATE",
    "VALID UNTIL",
    "VALID TO",
  ]);
  if (labeled) return labeled;

  const today = new Date().toISOString().split("T")[0];
  const dates = extractVisibleDates(text)
    .map(item => item.date)
    .filter(date => date > today)
    .sort();
  return dates.at(-1) || "";
}

function findDateNearFieldCode(text, fieldCode) {
  const upper = text.toUpperCase();
  const code = String(fieldCode || "").toUpperCase();
  if (!/^\d[A-Z]$/.test(code)) return null;

  const letterPattern = code[1] === "B"
    ? "[B8V]"
    : "A?";
  const guard = code[1] === "A" ? "(?![B8V])" : "";
  const pattern = new RegExp(`(?:^|[^A-Z0-9])${code[0]}\\s*${letterPattern}\\s*${guard}[:.]?\\s*`, "gi");

  for (const line of upper.split(/\r?\n/)) {
    for (const match of line.matchAll(pattern)) {
      const slice = line.slice(match.index + match[0].length, match.index + match[0].length + 90);
      const date = parseVisibleDate(slice) || parseCompactVisibleDate(slice);
      if (date) return date;
    }
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

function mrzCheckDigit(value) {
  const weights = [7, 3, 1];
  const total = String(value || "").toUpperCase().split("").reduce((sum, char, index) => {
    let number = 0;
    if (/\d/.test(char)) number = Number(char);
    else if (/[A-Z]/.test(char)) number = char.charCodeAt(0) - 55;
    return sum + number * weights[index % weights.length];
  }, 0);
  return total % 10;
}

function hasValidMrzCheckDigit(value, checkDigit) {
  return /^\d$/.test(String(checkDigit || "")) && mrzCheckDigit(value) === Number(checkDigit);
}

function cleanMrzField(value) {
  return String(value || "").replace(/</g, "").trim();
}

function parseMrzNameField(value) {
  const normalized = normalizeMrzLine(value)
    .replace(/<+$/g, "")
    .replace(/^P<[A-Z]{3}/, "");
  if (!normalized) return {};

  const [lastNamePart = "", givenNamesPart = ""] = normalized.split("<<");
  return {
    last_name: cleanPersonText(lastNamePart),
    given_names: cleanPersonText(givenNamesPart),
  };
}

function isLikelyDocumentNumber(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 7 || normalized.length > 12) return false;
  if (!/[A-Z]/.test(normalized) || !/\d/.test(normalized)) return false;
  if (/^(TYPE|CODE|TYPECODE|DOCUMENT|DOCUMENTNO|DOCUMENTNUMMER|PASSPORT|PASPOORT|PASSEPORT|NATIONALITY|NEDERLANDSE)$/.test(normalized)) {
    return false;
  }
  return true;
}

function documentNumberVariants(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const variants = [normalized];
  if (normalized.length > 9) {
    for (let index = 0; index <= normalized.length - 9; index += 1) {
      variants.push(normalized.slice(index, index + 9));
    }
  }
  return [...new Set(variants)].filter(isLikelyDocumentNumber);
}

function findBsnInText(text) {
  const normalized = text.toUpperCase();
  const labeled = normalized.match(/(?:BSN|BURGERSERVICENUMMER|PERSOONS\s*NUMMER|PERSOONLIJK\s+NUMMER|PERSONAL\s+(?:NUMBER|NO\.?|N[O0]\.?)|IDENTIFIANT\s+PERSONNEL)\D{0,80}([0-9OQDILSB][0-9OQDILSB\s.-]{7,16}[0-9OQDILSB])/);
  if (labeled) {
    const candidate = ocrDigits(labeled[1]);
    if (candidate.length === 9) return candidate;
  }

  const candidates = normalized.match(/\b[0-9OQDILSB][0-9OQDILSB\s.-]{7,16}[0-9OQDILSB]\b/g) || [];
  for (const candidate of candidates) {
    const digits = ocrDigits(candidate);
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

  const labelPattern = /DOCUMENT(?:\s+|\s*-\s*)NUMMER|DOCUMENT\s+NO\.?|DOCUMENT\s+NUMBER|N[°O]\s*DU\s*DOCUMENT|PASPOORTNUMMER|PASSPORT\s+NO\.?|IDENTITEITSKAARTNUMMER/g;
  const labeledCandidates = [];
  for (const match of normalized.matchAll(labelPattern)) {
    const after = normalized.slice(match.index + match[0].length, match.index + match[0].length + 220);
    const candidates = after.match(/\b[A-Z0-9][A-Z0-9<\s-]{6,18}[A-Z0-9]\b/g) || [];
    for (const candidate of candidates) {
      const value = cleanMrzField(candidate).replace(/[^A-Z0-9]/g, "");
      labeledCandidates.push(...documentNumberVariants(value));
    }
  }
  if (labeledCandidates.length > 0) {
    return labeledCandidates.sort((a, b) => scoreDocumentNumber(b) - scoreDocumentNumber(a))[0];
  }

  const candidates = normalized.match(/\b[A-Z]{1,3}[A-Z0-9]{6,9}\b/g) || [];
  return candidates
    .flatMap(documentNumberVariants)
    .sort((a, b) => scoreDocumentNumber(b) - scoreDocumentNumber(a))[0] || "";
}

function isLikelyIdCardNumber(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length !== 9) return false;
  if (!/[A-Z]/.test(normalized) || !/\d/.test(normalized)) return false;
  if (/^(NEDERLAND|NEDERIAND|KINGDOMO|IDENTITE)$/i.test(normalized)) return false;
  return true;
}

function scoreIdCardNumber(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let score = 0;
  if (normalized.length === 9) score += 20;
  if (/^[I1L][A-Z0-9]{8}$/.test(normalized)) score += 14;
  if (/^[A-Z]{2}\d/.test(normalized)) score += 6;
  if (normalized.endsWith("0")) score -= 2;
  score += (normalized.match(/[A-Z]/g) || []).length * 0.8;
  score += (normalized.match(/\d/g) || []).length * 0.5;
  return score;
}

function findIdCardNumberInText(text) {
  const normalized = String(text || "").toUpperCase();
  const candidates = [];

  const labelPattern = /DOCUMENT(?:\s+|\s*-\s*)NUMMER|DOCUMENT\s+NO\.?|DOCUMENT\s+NUMBER|IDENTITEITSKAARTNUMMER/g;
  for (const match of normalized.matchAll(labelPattern)) {
    const after = normalized.slice(match.index + match[0].length, match.index + match[0].length + 80);
    candidates.push(...(after.match(/\b[A-Z0-9][A-Z0-9\s-]{7,12}[A-Z0-9]\b/g) || []));
  }

  candidates.push(...(normalized.match(/\b[A-Z][A-Z0-9]{8,9}\b/g) || []));

  return candidates
    .flatMap(candidate => {
      const clean = candidate.replace(/[^A-Z0-9]/g, "");
      return clean.length === 10 ? [clean.slice(0, 9), clean.slice(1, 10)] : [clean];
    })
    .filter(isLikelyIdCardNumber)
    .sort((a, b) => scoreIdCardNumber(b) - scoreIdCardNumber(a))[0] || "";
}

function isLikelyDriversLicenseNumber(value) {
  const normalized = ocrDigits(value);
  if (normalized.length !== 10) return false;
  if (/^0{10}$/.test(normalized)) return false;
  return true;
}

function findDriversLicenseNumberInText(text) {
  const normalized = text.toUpperCase();
  const labeledCandidates = [];

  const bsnAndDocument = normalized.match(/(?:BSN|BURGERSERVICENUMMER)\D{0,40}([0-9OQDILSB\s.-]{8,18})\s*[/|]\s*([0-9OQDILSB\s.-]{8,18})/);
  if (bsnAndDocument) labeledCandidates.push(ocrDigits(bsnAndDocument[2]));

  const labelPatterns = [
    /\b5\s*[:.]?\s*([0-9OQDILSB][0-9OQDILSB\s.-]{8,18}[0-9OQDILSB])/g,
    /RIJBEWIJS(?:\s*NUMMER|\s*NO\.?)?\D{0,50}([0-9OQDILSB][0-9OQDILSB\s.-]{8,18}[0-9OQDILSB])/g,
    /DRIVING\s+LICEN[CS]E(?:\s*(?:NO\.?|NUMBER))?\D{0,50}([0-9OQDILSB][0-9OQDILSB\s.-]{8,18}[0-9OQDILSB])/g,
  ];

  for (const pattern of labelPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      labeledCandidates.push(ocrDigits(match[1]));
    }
  }

  const labeled = labeledCandidates.find(isLikelyDriversLicenseNumber);
  if (labeled) return labeled;

  return findDriversLicenseNumberInMrz(text);
}

function findDriversLicenseNumberInMrz(text) {
  const lines = text
    .split(/\r?\n/)
    .map(line => normalizeMrzLine(line))
    .flatMap(line => line.length > 44 ? line.match(/.{1,44}/g) || [line] : [line]);

  for (const line of lines) {
    const match = line.match(/D[1IL]NLD/);
    if (!match) continue;
    const digits = ocrDigits(line.slice(match.index + match[0].length, match.index + match[0].length + 18));
    const candidates = [
      digits.slice(1, 11),
      digits.slice(0, 10),
      digits.slice(2, 12),
    ];
    const candidate = candidates.find(isLikelyDriversLicenseNumber);
    if (candidate) return candidate;
  }

  return "";
}

function fieldValueOnSameLine(text, fieldNumber) {
  const pattern = new RegExp(`(?:^|\\s)${fieldNumber}\\s*[:.]?\\s+([^\\n\\r]+)`, "i");
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const match = line.match(pattern);
    if (!match) continue;
    const value = match[1]
      .replace(/\s+\d+[a-z]?\s+.*$/i, "")
      .replace(/\s{2,}.+$/g, "")
      .trim();
    if (value) return value;
  }
  return "";
}

function findDateNearNumberField(text, fieldNumber) {
  const upper = String(text || "").toUpperCase();
  const pattern = new RegExp(`(?:^|[^A-Z0-9])${fieldNumber}\\s*[:.]?\\s*`, "gi");
  for (const line of upper.split(/\r?\n/)) {
    for (const match of line.matchAll(pattern)) {
      const slice = line.slice(match.index + match[0].length, match.index + match[0].length + 80);
      const date = parseVisibleDate(slice) || parseCompactVisibleDate(slice);
      if (date) return date;
    }
  }
  return null;
}

function findDriversLicensePersonInText(text) {
  const birthDate = findDateNearNumberField(text, "3") || "";
  const lastName = cleanPersonText(fieldValueOnSameLine(text, "1"));
  const givenNames = cleanPersonText(fieldValueOnSameLine(text, "2"));

  return {
    last_name: lastName,
    given_names: givenNames,
    birth_date: birthDate,
  };
}

function mergePersonFields(...people) {
  return people.reduce((merged, person) => ({
    last_name: merged.last_name || person?.last_name || "",
    given_names: merged.given_names || person?.given_names || "",
    birth_date: merged.birth_date || person?.birth_date || "",
    gender: merged.gender || person?.gender || "",
    nationality_code: merged.nationality_code || person?.nationality_code || "",
  }), {});
}

function scoreDocumentNumber(value) {
  const normalized = String(value || "");
  let score = 0;
  if (normalized.length === 9) score += 20;
  if (/^[A-Z]{3}\d/.test(normalized)) score += 10;
  score += (normalized.match(/\d/g) || []).length;
  score += (normalized.match(/[A-Z]/g) || []).length * 0.4;
  return score;
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

  const passportSecondLine = findPassportMrzSecondLine(lines);
  if (passportSecondLine) return passportSecondLine;

  for (let i = 0; i < lines.length - 1; i += 1) {
    const first = lines[i];
    const second = lines[i + 1];
    if (/^P[A-Z<]/.test(first) && second.length >= 35) {
      const documentNumber = cleanMrzField(second.slice(0, 9)).replace(/[^A-Z0-9]/g, "");
      const documentNumberIsValid = isLikelyDocumentNumber(documentNumber) && hasValidMrzCheckDigit(second.slice(0, 9), second[9]);
      const person = parseMrzNameField(first);
      return {
        format: "TD3",
        document_number: documentNumberIsValid ? documentNumber : "",
        birth_date: mrzDateToIso(second.slice(13, 19), "birth"),
        valid_until: mrzDateToIso(second.slice(21, 27), "expiry"),
        gender: second[20] || "",
        nationality_code: second.slice(10, 13).replace(/</g, ""),
        bsn: findBsnInText(second.slice(28, 43)),
        ...person,
      };
    }
  }

  for (let i = 0; i < lines.length - 2; i += 1) {
    const first = lines[i];
    const second = lines[i + 1];
    const third = lines[i + 2];
    if (/^[IA][A-Z<][A-Z]{3}/.test(first) && first[1] === "<" && first.length >= 25 && second.length >= 25) {
      const documentNumber = cleanMrzField(first.slice(5, 14)).replace(/[^A-Z0-9]/g, "");
      const documentNumberIsValid = isLikelyDocumentNumber(documentNumber) && hasValidMrzCheckDigit(first.slice(5, 14), first[14]);
      const optional = `${first.slice(15)} ${second.slice(18, 29)}`;
      const person = parseMrzNameField(third || "");
      return {
        format: "TD1",
        document_number: documentNumberIsValid ? documentNumber : "",
        birth_date: mrzDateToIso(second.slice(0, 6), "birth"),
        valid_until: mrzDateToIso(second.slice(8, 14), "expiry"),
        gender: second[7] || "",
        nationality_code: second.slice(15, 18).replace(/</g, ""),
        bsn: findBsnInText(optional),
        ...person,
      };
    }
  }

  return null;
}

function findPassportMrzSecondLine(lines) {
  const candidates = [];
  lines.forEach((line, index) => {
    const withoutFillers = line.replace(/<+$/g, "");
    const compacted = withoutFillers.replace(/</g, "");
    candidates.push(
      { value: line, index },
      { value: withoutFillers, index },
      { value: compacted, index }
    );
  });

  for (const candidate of candidates) {
    const match = candidate.value.match(/([A-Z0-9<]{9})(\d)[A-Z<]{0,2}NLD(\d{6})(\d)([MF<])(\d{6})(\d)/);
    if (!match) continue;
    const documentNumber = cleanMrzField(match[1]).replace(/[^A-Z0-9]/g, "");
    const documentNumberIsValid = isLikelyDocumentNumber(documentNumber) && hasValidMrzCheckDigit(match[1], match[2]);
    const previousLine = candidate.index > 0 ? lines[candidate.index - 1] : "";
    const person = /^P[A-Z<]/.test(previousLine) ? parseMrzNameField(previousLine) : {};
    return {
      format: "TD3",
      document_number: documentNumberIsValid ? documentNumber : "",
      birth_date: mrzDateToIso(match[3], "birth"),
      valid_until: mrzDateToIso(match[6], "expiry"),
      gender: match[5] || "",
      nationality_code: "NLD",
      bsn: "",
      ...person,
    };
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

function qualityCheck(key, label, status, detail = "") {
  return { key, label, status, detail };
}

const DOCUMENT_DETECTION_LABELS = {
  passport: "paspoort",
  id_card: "identiteitskaart",
  drivers_license: "rijbewijs",
};

function normalizeDetectionText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function countPatternHits(text, patterns) {
  return patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}

function detectIdentityDocumentType(text) {
  const normalized = normalizeDetectionText(text);
  const scores = {
    passport: countPatternHits(normalized, [
      /\bPASPOORT\b/,
      /\bPASSPORT\b/,
      /\bPASSEPORT\b/,
      /\bP<NLD/,
      /^P[A-Z<]{1,2}/m,
      /\bPASSPORT\s*\/\s*PASSEPORT\b/,
    ]),
    id_card: countPatternHits(normalized, [
      /\bIDENTITEITSKAART\b/,
      /\bIDENTITY\s+CARD\b/,
      /\bCARTE\s+D[’']?IDENTITE\b/,
      /\bI<NLD/,
      /^I<[A-Z]{3}/m,
      /\bNEDERLANDSE\s+IDENTITEITSKAART\b/,
    ]),
    drivers_license: countPatternHits(normalized, [
      /\bRIJBEW[IJY]S\b/,
      /\bDRIVING\s+LICEN[CS]E\b/,
      /\bPERMIS\s+DE\s+CONDUIRE\b/,
      /\bFUHRERSCHEIN\b/,
      /\bRDW\b/,
      /\bD[I1]NLD/,
      /\bD[I1]NLD[A-Z0-9]{12,}/,
    ]),
  };

  const [type, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] || ["", 0];
  const secondScore = Object.entries(scores)
    .filter(([candidate]) => candidate !== type)
    .sort((a, b) => b[1] - a[1])[0]?.[1] || 0;

  if (!type || score < 2 || score === secondScore) {
    return { type: "", confidence: 0, scores };
  }

  return { type, confidence: score - secondScore, scores };
}

function scoreDocumentSide(text, docType) {
  const normalized = normalizeDetectionText(text);

  if (docType === "passport") {
    return {
      front: countPatternHits(normalized, [
        /\bP<NLD/,
        /^P[A-Z<]{1,2}/m,
        /\bNAAM\s*\/\s*SURNAME\b/,
        /\bVOORNAMEN\s*\/\s*GIVEN\s+NAMES\b/,
        /\bGEBOORTEDATUM\s*\/\s*DATE\s+OF\s+BIRTH\b/,
        /\bDATUM\s+VAN\s+AFGIFTE\b/,
        /\bCAN\b/,
      ]),
      back: countPatternHits(normalized, [
        /\bPERSOONSNR\.?\s*\/\s*PERSONAL\s+NO\b/,
        /\bVERVOLG\s+NAAM\b/,
        /\bCONTINUE\s+SURNAME\b/,
        /\bEUROPESE\s+UNIE\b/,
        /\bPASSPORT\s*\/\s*PASSEPORT\b/,
        /\bMODEL\s+\d{3}\b/,
      ]),
    };
  }

  if (docType === "id_card") {
    return {
      front: countPatternHits(normalized, [
        /\bIDENTITEITSKAART\b/,
        /\bIDENTITY\s+CARD\b/,
        /\bCARTE\s+D[’']?IDENTITE\b/,
        /\bDOCUMENT\s+NO\b/,
        /\bNAAM\s*\/\s*SURNAME\b/,
        /\bVOORNAMEN\s*\/\s*GIVEN\s+NAMES\b/,
        /\bDATUM\s+VAN\s+(AFGIFTE|ALGIFTE)\b/,
        /\bDATE\s+OF\s+ISS/,
        /\bGELDIG\s+TOT\b/,
        /\bGELDIG\s+TOT\s*\/\s*DATE\s+OF\s+EXPIRY\b/,
        /\bCAN\b/,
      ]),
      back: countPatternHits(normalized, [
        /\bI<NLD/,
        /^I<[A-Z]{3}/m,
        /\bPERSOONSNR\.?\s*\/\s*PERSONAL\s+NO\b/,
        /\bGEBOORTEPLAATS\s*\/\s*PLACE\s+OF\s+BIRTH\b/,
        /\bINSTANTIE\s*\/\s*AUTHORITY\b/,
        /\bVERVOLG\s+NAAM\b/,
        /\bCONTINUE\s+SURNAME\b/,
      ]),
    };
  }

  if (docType === "drivers_license") {
    return {
      front: countPatternHits(normalized, [
        /\bRIJBEW[IJY]S\b/,
        /\bDRIVING\s+LICEN[CS]E\b/,
        /\bPERMIS\s+DE\s+CONDUIRE\b/,
        /\bFUHRERSCHEIN\b/,
        /\bD[I1]NLD/,
        /\bD[I1]NLD[A-Z0-9]{12,}/,
        /\b4A\b/,
        /\b4B\b/,
        /\b4C\b/,
      ]),
      back: countPatternHits(normalized, [
        /\bRDW\b/,
        /\bBSN\b/,
        /\bAM\b.*\bA1\b.*\bA2\b/s,
        /\bA1\b.*\bA2\b.*\bB\b/s,
        /\bD1E\b/,
        /\bVERKLARING\b/,
      ]),
    };
  }

  return { front: 0, back: 0 };
}

function detectDocumentSide(text, docType) {
  const scores = scoreDocumentSide(text, docType);
  const side = scores.front >= scores.back ? "front" : "back";
  const score = scores[side];
  const otherScore = side === "front" ? scores.back : scores.front;
  const confidence = score - otherScore;

  if (score < 2 || confidence < 1) {
    return { side: "", confidence: 0, scores };
  }

  return { side, confidence, scores };
}

export function analyzeIdentityUploadCompatibility({ docType, frontText = "", backText = "", hasBackFile = false } = {}) {
  const issues = [];
  const sides = [
    { key: "front", label: "Voorkant", expectedSide: "front", text: frontText },
    { key: "back", label: "Achterkant", expectedSide: "back", text: backText },
  ].filter(side => side.key === "front" || hasBackFile);

  const detected = {};
  for (const side of sides) {
    const documentType = detectIdentityDocumentType(side.text);
    const documentSide = detectDocumentSide(side.text, docType);
    detected[side.key] = { documentType, documentSide };

    if (documentType.type && documentType.type !== docType && documentType.confidence >= 2) {
      issues.push({
        severity: "critical",
        field: side.key,
        label: `${side.label} lijkt geen ${DOCUMENT_DETECTION_LABELS[docType]}`,
        detail: `${side.label} lijkt op een ${DOCUMENT_DETECTION_LABELS[documentType.type]}. Kies het juiste documenttype of upload de juiste afbeelding.`,
      });
    }

    if (documentSide.side && documentSide.side !== side.expectedSide && documentSide.confidence >= 1) {
      issues.push({
        severity: "critical",
        field: side.key,
        label: `${side.label} lijkt omgewisseld`,
        detail: `${side.label} lijkt de ${side.expectedSide === "front" ? "achterkant" : "voorkant"} van het document. Upload deze in het andere uploadvak.`,
      });
    }
  }

  if (
    detected.front?.documentSide?.side === "back"
    && detected.back?.documentSide?.side === "front"
  ) {
    issues.unshift({
      severity: "critical",
      field: "both",
      label: "Voorkant en achterkant lijken omgewisseld",
      detail: "Plaats de houderzijde bij voorkant en de BSN-/controlegegevens bij achterkant.",
    });
  }

  const criticalIssues = issues.filter(issue => issue.severity === "critical");
  return {
    status: criticalIssues.length > 0 ? "blocked" : "ok",
    issues: criticalIssues,
    detected,
  };
}

function thresholdStatus(value, passMinimum, warnMinimum) {
  if (value >= passMinimum) return "pass";
  if (value >= warnMinimum) return "warn";
  return "fail";
}

function rangeStatus(value, passMin, passMax, warnMin, warnMax) {
  if (value >= passMin && value <= passMax) return "pass";
  if (value >= warnMin && value <= warnMax) return "warn";
  return "fail";
}

async function analyzeImageFile(file, sideLabel, keyPrefix) {
  const image = await loadImage(file);
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const pixelCount = width * height;
    const sampleWidth = Math.min(420, width);
    const sampleHeight = Math.max(1, Math.round(height * (sampleWidth / width)));
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);

    const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imageData.data;
    const grays = new Float32Array(sampleWidth * sampleHeight);
    let sum = 0;
    let sumSquares = 0;
    let edgeSum = 0;
    let edgeCount = 0;

    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        const pixelIndex = y * sampleWidth + x;
        const dataIndex = pixelIndex * 4;
        const gray = data[dataIndex] * 0.299 + data[dataIndex + 1] * 0.587 + data[dataIndex + 2] * 0.114;
        grays[pixelIndex] = gray;
        sum += gray;
        sumSquares += gray * gray;
        if (x > 0) {
          edgeSum += Math.abs(gray - grays[pixelIndex - 1]);
          edgeCount += 1;
        }
        if (y > 0) {
          edgeSum += Math.abs(gray - grays[pixelIndex - sampleWidth]);
          edgeCount += 1;
        }
      }
    }

    const samplePixels = sampleWidth * sampleHeight;
    const brightness = sum / samplePixels;
    const variance = Math.max(0, (sumSquares / samplePixels) - brightness * brightness);
    const contrast = Math.sqrt(variance);
    const sharpness = edgeCount ? edgeSum / edgeCount : 0;
    const resolutionStatus = pixelCount >= 800000 && Math.min(width, height) >= 550
      ? "pass"
      : pixelCount >= 420000 && Math.min(width, height) >= 360
        ? "warn"
        : "fail";

    return {
      side: keyPrefix,
      width,
      height,
      checks: [
        qualityCheck(
          `${keyPrefix}_resolution`,
          `${sideLabel} heeft voldoende resolutie`,
          resolutionStatus,
          `${width} x ${height}px`
        ),
        qualityCheck(
          `${keyPrefix}_exposure`,
          `${sideLabel} is goed belicht`,
          rangeStatus(brightness, 55, 215, 35, 235)
        ),
        qualityCheck(
          `${keyPrefix}_contrast`,
          `${sideLabel} heeft voldoende contrast`,
          thresholdStatus(contrast, 32, 22)
        ),
        qualityCheck(
          `${keyPrefix}_sharpness`,
          `${sideLabel} lijkt scherp genoeg`,
          thresholdStatus(sharpness, 7, 4.5)
        ),
      ],
    };
  } finally {
    URL.revokeObjectURL(image.src);
  }
}

async function analyzeUploadedImages({ frontFile, backFile }) {
  const checks = [];
  const metrics = {};
  const jobs = [];

  if (frontFile) {
    jobs.push(
      analyzeImageFile(frontFile, "Voorkant", "front")
        .then(result => {
          metrics.front = { width: result.width, height: result.height };
          checks.push(...result.checks);
        })
        .catch(() => {
          checks.push(qualityCheck("front_readable", "Voorkant kon technisch worden beoordeeld", "warn"));
        })
    );
  }

  if (backFile) {
    jobs.push(
      analyzeImageFile(backFile, "Achterkant", "back")
        .then(result => {
          metrics.back = { width: result.width, height: result.height };
          checks.push(...result.checks);
        })
        .catch(() => {
          checks.push(qualityCheck("back_readable", "Achterkant kon technisch worden beoordeeld", "warn"));
        })
    );
  }

  await Promise.all(jobs);
  return { checks, metrics };
}

function buildUploadQuality({ imageQuality, fields, docType, requiresBsn, hasBackFile, compatibility }) {
  const checks = [...(imageQuality?.checks || [])];
  const isPassport = docType === "passport";
  const hasDates = Boolean(fields.valid_from && fields.valid_until);

  checks.unshift(
    qualityCheck(
      "back_uploaded",
      isPassport ? "BSN-pagina of achterkant toegevoegd" : "Achterkant toegevoegd",
      hasBackFile ? "pass" : "warn",
      hasBackFile ? "" : "Aanbevolen voor BSN en volledige dossiercontrole"
    )
  );

  checks.push(
    qualityCheck(
      "document_number_found",
      "Documentnummer gevonden",
      fields.document_number ? "pass" : "warn"
    ),
    qualityCheck(
      "bsn_found",
      "BSN gevonden",
      fields.bsn ? "pass" : requiresBsn ? "warn" : "pass",
      fields.bsn ? "" : requiresBsn ? "Controleer of de BSN-zijde goed zichtbaar is" : "Niet altijd beschikbaar"
    ),
    qualityCheck(
      "validity_found",
      "Geldigheid gevonden",
      fields.valid_until ? "pass" : "warn"
    ),
    qualityCheck(
      "validity_logic",
      "Geldigheidsdatums zijn logisch",
      hasDates ? fields.valid_from < fields.valid_until ? "pass" : "fail" : "warn"
    ),
    qualityCheck(
      "machine_readable",
      isPassport ? "Machineleesbare paspoortregel gelezen" : "Machineleesbare gegevens gelezen",
      fields.mrz_format ? "pass" : "warn",
      fields.mrz_format ? "" : "Controleer documentnummer en datums handmatig"
    )
  );

  const failCount = checks.filter(check => check.status === "fail").length;
  const warnCount = checks.filter(check => check.status === "warn").length;
  const score = Math.round((checks.filter(check => check.status === "pass").length / checks.length) * 100);
  const status = failCount >= 2 ? "poor" : failCount > 0 || warnCount > 0 ? "review" : "good";

  return {
    status,
    score,
    title: status === "good"
      ? "Uploadkwaliteit goed"
      : status === "poor"
        ? "Nieuwe upload aanbevolen"
        : "Controle aanbevolen",
    summary: status === "good"
      ? "Deze upload lijkt bruikbaar voor dossiercontrole."
      : status === "poor"
        ? "De upload bevat meerdere technische aandachtspunten. Maak bij voorkeur een nieuwe scan of foto."
        : "De upload is bruikbaar, maar controleer de aandachtspunten voordat je opslaat.",
    checks,
    compatibility,
  };
}

async function imageToDataUrl(file, { crop = "full" } = {}) {
  const image = await loadImage(file);
  try {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const cropBox = resolveCropBox(crop, sourceWidth, sourceHeight);
    const maxWidth = crop === "mrz" ? 3200 : 2200;
    const scale = Math.min(crop === "mrz" ? 2.4 : 1.8, maxWidth / cropBox.width);
    const targetWidth = Math.max(1, Math.round(cropBox.width * scale));
    const targetHeight = Math.max(1, Math.round(cropBox.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, cropBox.x, cropBox.y, cropBox.width, cropBox.height, 0, 0, targetWidth, targetHeight);

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

function resolveCropBox(crop, width, height) {
  if (crop === "mrz") {
    return {
      x: 0,
      y: Math.floor(height * 0.78),
      width,
      height: Math.ceil(height * 0.22),
    };
  }

  if (crop === "passport_details") {
    return {
      x: Math.floor(width * 0.18),
      y: Math.floor(height * 0.42),
      width: Math.ceil(width * 0.82),
      height: Math.ceil(height * 0.42),
    };
  }

  if (crop === "back_details") {
    const aspect = width / height;
    if (aspect < 1.05) {
      return {
        x: 0,
        y: 0,
        width,
        height: Math.ceil(height * 0.42),
      };
    }

    return {
      x: Math.floor(width * 0.52),
      y: 0,
      width: Math.ceil(width * 0.48),
      height: Math.ceil(height * 0.34),
    };
  }

  if (crop === "drivers_license_front") {
    return {
      x: Math.floor(width * 0.16),
      y: Math.floor(height * 0.14),
      width: Math.ceil(width * 0.72),
      height: Math.ceil(height * 0.62),
    };
  }

  if (crop === "drivers_license_back") {
    return {
      x: 0,
      y: 0,
      width: Math.ceil(width * 0.52),
      height: Math.ceil(height * 0.42),
    };
  }

  return { x: 0, y: 0, width, height };
}

export function parseIdentityOcrText(text, { docType = "passport" } = {}) {
  const isDriversLicense = docType === "drivers_license";
  const isIdCard = docType === "id_card";
  const mrz = extractMrz(text) || {};
  const driversLicensePerson = isDriversLicense ? findDriversLicensePersonInText(text) : {};
  const visiblePerson = isDriversLicense ? {} : findVisibleIdentityPerson(text, { docType });
  const person = mergePersonFields(mrz, driversLicensePerson, visiblePerson);
  const visibleUntil = isDriversLicense ? "" : findVisibleExpiryDate(text);
  const validFrom = isDriversLicense ? "" : findVisibleIssueDate(
    text,
    mrz.valid_until || visibleUntil,
    mrz.birth_date || visiblePerson.birth_date
  );
  const driversLicenseValidFrom = isDriversLicense ? findDateNearFieldCode(text, "4A") : "";
  const driversLicenseValidUntil = isDriversLicense ? findDateNearFieldCode(text, "4B") : "";

  return {
    document_number: mrz.document_number
      || (isDriversLicense ? findDriversLicenseNumberInText(text) : "")
      || (isIdCard ? findIdCardNumberInText(text) : "")
      || findDocumentNumberInText(text),
    bsn: mrz.bsn || findBsnInText(text),
    valid_from: isDriversLicense ? driversLicenseValidFrom || "" : validFrom || "",
    valid_until: isDriversLicense ? driversLicenseValidUntil || "" : mrz.valid_until || visibleUntil || "",
    person,
    mrz_format: mrz.format || null,
  };
}

export async function recognizeIdentityDocument({ frontFile, backFile, docType = "passport", requiresBsn = false, onProgress }) {
  const { createWorker } = await import("tesseract.js");
  const imageQualityPromise = analyzeUploadedImages({ frontFile, backFile });
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
    const sideTextParts = {
      front: [],
      back: [],
    };

    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    for (const [index, file] of files.entries()) {
      const side = index === 0 ? "front" : "back";
      const image = await imageToDataUrl(file);
      const { data } = await worker.recognize(image);
      textParts.push(data.text || "");
      sideTextParts[side].push(data.text || "");
    }

    if (frontFile) {
      const image = await imageToDataUrl(frontFile, { crop: "passport_details" });
      const { data } = await worker.recognize(image);
      textParts.push(data.text || "");
      sideTextParts.front.push(data.text || "");
    }
    if (backFile) {
      const image = await imageToDataUrl(backFile, { crop: "back_details" });
      const { data } = await worker.recognize(image);
      textParts.push(data.text || "");
      sideTextParts.back.push(data.text || "");
    }

    if (docType === "drivers_license") {
      if (frontFile) {
        const image = await imageToDataUrl(frontFile, { crop: "drivers_license_front" });
        const { data } = await worker.recognize(image);
        textParts.push(data.text || "");
        sideTextParts.front.push(data.text || "");
      }
      if (backFile) {
        const image = await imageToDataUrl(backFile, { crop: "drivers_license_back" });
        const { data } = await worker.recognize(image);
        textParts.push(data.text || "");
        sideTextParts.back.push(data.text || "");
      }
    }

    await worker.setParameters({
      tessedit_char_whitelist: MRZ_CHARS,
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    for (const [index, file] of files.entries()) {
      const side = index === 0 ? "front" : "back";
      const image = await imageToDataUrl(file, { crop: "mrz" });
      const { data } = await worker.recognize(image);
      textParts.push(data.text || "");
      sideTextParts[side].push(data.text || "");
    }

    const rawText = textParts.join("\n");
    const fields = parseIdentityOcrText(rawText, { docType });
    const imageQuality = await imageQualityPromise;
    const compatibility = analyzeIdentityUploadCompatibility({
      docType,
      frontText: sideTextParts.front.join("\n"),
      backText: sideTextParts.back.join("\n"),
      hasBackFile: Boolean(backFile),
    });
    return {
      ...fields,
      detected_fields: Object.entries(fields)
        .filter(([key, value]) => !["mrz_format", "person"].includes(key) && Boolean(value))
        .map(([key]) => key),
      upload_quality: buildUploadQuality({
        imageQuality,
        fields,
        docType,
        requiresBsn,
        hasBackFile: Boolean(backFile),
        compatibility,
      }),
    };
  } finally {
    await worker.terminate();
  }
}
