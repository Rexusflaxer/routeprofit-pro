export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export const DEFAULT_PAGE_NUMBER_SETTINGS = Object.freeze({
  enabled: true,
  x_mm: 203,
  y_mm: 291,
  font_size_pt: 10,
  format: "page",
});

export const PAGE_NUMBER_FORMAT_OPTIONS = [
  { value: "page", label: "Alleen nummer", example: "1" },
  { value: "page_of_total", label: "Nummer en totaal", example: "1 / 5" },
  { value: "page_word_of_total", label: "Uitgeschreven", example: "Pagina 1 van 5" },
];

export const PAGE_NUMBER_POSITION_PRESETS = [
  { value: "top_left", label: "Linksboven", x_mm: 15, y_mm: 10 },
  { value: "top_center", label: "Middenboven", x_mm: 105, y_mm: 10 },
  { value: "top_right", label: "Rechtsboven", x_mm: 195, y_mm: 10 },
  { value: "bottom_left", label: "Linksonder", x_mm: 15, y_mm: 287 },
  { value: "bottom_center", label: "Middenonder", x_mm: 105, y_mm: 287 },
  { value: "bottom_right", label: "Rechtsonder", x_mm: 195, y_mm: 287 },
];

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(Math.min(max, Math.max(min, parsed)) * 10) / 10;
}

export function normalizePageNumberSettings(source = {}) {
  const settings = source.page_number
    || source.document_settings?.page_number
    || source.metadata?.page_number
    || {};
  const format = PAGE_NUMBER_FORMAT_OPTIONS.some(option => option.value === settings.format)
    ? settings.format
    : DEFAULT_PAGE_NUMBER_SETTINGS.format;

  return {
    enabled: settings.enabled !== false,
    x_mm: clampNumber(settings.x_mm, 3, A4_WIDTH_MM - 3, DEFAULT_PAGE_NUMBER_SETTINGS.x_mm),
    y_mm: clampNumber(settings.y_mm, 3, A4_HEIGHT_MM - 3, DEFAULT_PAGE_NUMBER_SETTINGS.y_mm),
    font_size_pt: clampNumber(settings.font_size_pt, 6, 18, DEFAULT_PAGE_NUMBER_SETTINGS.font_size_pt),
    format,
  };
}

export function pageNumberPositionPercentages(settings = {}) {
  const normalized = normalizePageNumberSettings({ page_number: settings });
  return {
    left: (normalized.x_mm / A4_WIDTH_MM) * 100,
    top: (normalized.y_mm / A4_HEIGHT_MM) * 100,
  };
}

export function pageNumberCssFontSize(settings = {}) {
  const normalized = normalizePageNumberSettings({ page_number: settings });
  const cqwPerPoint = (100 * 25.4) / (72 * A4_WIDTH_MM);
  return `${Math.round(normalized.font_size_pt * cqwPerPoint * 1000) / 1000}cqw`;
}

export function pageNumberHorizontalAlignment(settings = {}) {
  const normalized = normalizePageNumberSettings({ page_number: settings });
  if (normalized.x_mm <= 35) return "left";
  if (normalized.x_mm >= A4_WIDTH_MM - 35) return "right";
  return "center";
}

export function formatPageNumber(settings = {}, page = 1, totalPages = 1) {
  const normalized = normalizePageNumberSettings({ page_number: settings });
  const current = Math.max(1, Number(page) || 1);
  const total = Math.max(current, Number(totalPages) || current);
  if (normalized.format === "page_of_total") return `${current} / ${total}`;
  if (normalized.format === "page_word_of_total") return `Pagina ${current} van ${total}`;
  return String(current);
}

export function pageNumberPositionLabel(settings = {}) {
  const normalized = normalizePageNumberSettings({ page_number: settings });
  const preset = PAGE_NUMBER_POSITION_PRESETS.find(option => (
    option.x_mm === normalized.x_mm && option.y_mm === normalized.y_mm
  ));
  return preset?.label || `Aangepast (${normalized.x_mm} / ${normalized.y_mm} mm)`;
}
