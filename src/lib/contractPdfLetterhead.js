import { A4_HEIGHT_MM, A4_WIDTH_MM } from "./letterheadDocumentSettings.js";

const PDFJS_CDN_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";
const PDFJS_WORKER_CDN_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
const RASTER_WIDTH = 1680;
const RASTER_HEIGHT = Math.round(RASTER_WIDTH * (A4_HEIGHT_MM / A4_WIDTH_MM));
const PREVIEW_PAGE_WIDTH = 430;

export const DEFAULT_CONTRACT_PDF_MARGINS = Object.freeze({
  top: 25,
  right: 20,
  bottom: 25,
  left: 20,
});

function numberBetween(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeContractPdfMargins(source = {}) {
  const metadataMargins = source.metadata?.margins_mm || {};
  const documentMargins = source.document_settings?.margins_mm || {};
  return {
    top: numberBetween(source.margin_top_mm ?? documentMargins.top ?? metadataMargins.top, 0, 90, DEFAULT_CONTRACT_PDF_MARGINS.top),
    right: numberBetween(source.margin_right_mm ?? documentMargins.right ?? metadataMargins.right, 0, 90, DEFAULT_CONTRACT_PDF_MARGINS.right),
    bottom: numberBetween(source.margin_bottom_mm ?? documentMargins.bottom ?? metadataMargins.bottom, 0, 90, DEFAULT_CONTRACT_PDF_MARGINS.bottom),
    left: numberBetween(source.margin_left_mm ?? documentMargins.left ?? metadataMargins.left, 0, 90, DEFAULT_CONTRACT_PDF_MARGINS.left),
  };
}

function sourceMode(source = {}) {
  const value = source.source_mode || source.document_settings?.source_mode || source.metadata?.source_mode;
  return value === "design" ? "design" : "upload";
}

function backgroundFit(source = {}) {
  const value = source.background_fit || source.document_settings?.background_fit || source.metadata?.background_fit;
  return ["contain", "cover", "stretch"].includes(value) ? value : "contain";
}

function pageBackgroundColor(source = {}) {
  const value = source.page_background_color
    || source.document_settings?.page_background_color
    || source.metadata?.page_background_color;
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#ffffff";
}

function designLayers(source = {}) {
  const value = source.design_layers || source.document_settings?.design_layers || source.metadata?.design_layers;
  return Array.isArray(value) ? value.filter(layer => layer && layer.visible !== false) : [];
}

function looksLikePdf(source = {}) {
  return /\.pdf($|\?)/i.test(String(source.file_url || ""))
    || /\.pdf$/i.test(String(source.download_filename || ""));
}

async function loadPdfRenderer() {
  if (typeof window === "undefined") throw new Error("PDF-briefpapier kan alleen in de browser worden verwerkt.");
  if (window.__loqPdfRenderer) return window.__loqPdfRenderer;
  const pdfjs = await import(/* @vite-ignore */ PDFJS_CDN_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN_URL;
  window.__loqPdfRenderer = pdfjs;
  return pdfjs;
}

async function loadImage(source) {
  if (!source) throw new Error("De afbeelding van het briefpapier ontbreekt.");
  let imageSource = source;
  let objectUrl = null;
  try {
    if (!String(source).startsWith("data:") && !String(source).startsWith("blob:")) {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Briefpapier kon niet worden opgehaald (${response.status}).`);
      objectUrl = URL.createObjectURL(await response.blob());
      imageSource = objectUrl;
    }
    const image = new Image();
    image.decoding = "async";
    image.src = imageSource;
    await image.decode();
    return image;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function drawImageWithFit(context, image, x, y, width, height, fit = "contain") {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error("De afmetingen van het briefpapier konden niet worden gelezen.");
  if (fit === "stretch" || fit === "fill") {
    context.drawImage(image, x, y, width, height);
    return;
  }
  const scale = fit === "cover"
    ? Math.max(width / sourceWidth, height / sourceHeight)
    : Math.min(width / sourceWidth, height / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  context.drawImage(
    image,
    x + ((width - renderedWidth) / 2),
    y + ((height - renderedHeight) / 2),
    renderedWidth,
    renderedHeight,
  );
}

async function drawPdfBackground(context, source, fit) {
  const pdfjs = await loadPdfRenderer();
  const loadingTask = pdfjs.getDocument({ url: source });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(RASTER_WIDTH / baseViewport.width, RASTER_HEIGHT / baseViewport.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const pdfContext = canvas.getContext("2d", { alpha: false });
    if (!pdfContext) throw new Error("PDF-briefpapier kon niet worden gerenderd.");
    await page.render({ canvasContext: pdfContext, viewport }).promise;
    drawImageWithFit(context, canvas, 0, 0, RASTER_WIDTH, RASTER_HEIGHT, fit);
  } finally {
    await pdf.destroy?.();
  }
}

function wrappedLines(context, text, maxWidth) {
  return String(text || "").split(/\r?\n/).flatMap(paragraph => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines = [];
    let current = words.shift();
    words.forEach(word => {
      const candidate = `${current} ${word}`;
      if (context.measureText(candidate).width <= maxWidth) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    });
    lines.push(current);
    return lines;
  });
}

async function drawDesignLayer(context, layer) {
  const x = (numberBetween(layer.x, 0, 100, 0) / 100) * RASTER_WIDTH;
  const y = (numberBetween(layer.y, 0, 100, 0) / 100) * RASTER_HEIGHT;
  const width = (numberBetween(layer.width, 0, 100, 10) / 100) * RASTER_WIDTH;
  const height = (numberBetween(layer.height, 0, 100, 10) / 100) * RASTER_HEIGHT;
  context.save();
  context.globalAlpha = numberBetween(layer.opacity, 0, 100, 100) / 100;

  if (layer.type === "rectangle" || layer.type === "line") {
    context.fillStyle = layer.background_color || "#1d4ed8";
    context.fillRect(x, y, width, height);
    const borderWidth = numberBetween(layer.border_width, 0, 20, 0) * (RASTER_WIDTH / PREVIEW_PAGE_WIDTH);
    if (layer.type === "rectangle" && borderWidth > 0) {
      context.lineWidth = borderWidth;
      context.strokeStyle = layer.border_color || layer.background_color || "#1d4ed8";
      context.strokeRect(x, y, width, height);
    }
  } else if (layer.type === "image" && layer.src) {
    const image = await loadImage(layer.src);
    drawImageWithFit(context, image, x, y, width, height, layer.object_fit || "contain");
  } else if (layer.type === "text") {
    const fontSize = numberBetween(layer.font_size, 4, 120, 12) * (RASTER_WIDTH / PREVIEW_PAGE_WIDTH);
    const fontWeight = numberBetween(layer.font_weight, 100, 900, 400);
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.fillStyle = layer.color || "#111827";
    context.font = `${fontWeight} ${fontSize}px Arial, sans-serif`;
    context.textBaseline = "top";
    context.textAlign = ["center", "right"].includes(layer.align) ? layer.align : "left";
    const textX = layer.align === "center" ? x + (width / 2) : layer.align === "right" ? x + width : x;
    const lineHeight = fontSize * 1.15;
    wrappedLines(context, layer.text || "", width).forEach((line, index) => {
      const lineY = y + (index * lineHeight);
      if (lineY + lineHeight <= y + height + 1) context.fillText(line, textX, lineY);
    });
  }
  context.restore();
}

export async function buildContractPdfLetterhead(letterhead) {
  const margins = normalizeContractPdfMargins(letterhead || {});
  if (!letterhead) return { backgroundDataUrl: null, margins };
  if (typeof document === "undefined") throw new Error("Briefpapier kan alleen in de browser worden verwerkt.");

  const canvas = document.createElement("canvas");
  canvas.width = RASTER_WIDTH;
  canvas.height = RASTER_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Briefpapier kon niet worden opgebouwd.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = pageBackgroundColor(letterhead);
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (sourceMode(letterhead) === "upload") {
    if (!letterhead.file_url) throw new Error("Het aan dit sjabloon gekoppelde briefpapierbestand ontbreekt.");
    if (looksLikePdf(letterhead)) await drawPdfBackground(context, letterhead.file_url, backgroundFit(letterhead));
    else {
      const image = await loadImage(letterhead.file_url);
      drawImageWithFit(context, image, 0, 0, canvas.width, canvas.height, backgroundFit(letterhead));
    }
  } else {
    const layers = designLayers(letterhead);
    for (const layer of layers) await drawDesignLayer(context, layer);
  }

  return { backgroundDataUrl: canvas.toDataURL("image/png"), margins };
}
