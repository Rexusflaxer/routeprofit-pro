const ARTICLE_HEADING_PATTERN = /^Artikel\s+(\d+)\s*[-\u2013\u2014]\s*(.+)$/i;

const ALLOWED_BLOCK_TAGS = new Set([
  "A",
  "BLOCKQUOTE",
  "BR",
  "EM",
  "H2",
  "H3",
  "LI",
  "OL",
  "P",
  "S",
  "SPAN",
  "STRONG",
  "U",
  "UL",
]);

const ALLOWED_BLOCK_CLASSES = new Set([
  "ql-align-center",
  "ql-align-justify",
  "ql-align-right",
  "ql-indent-1",
  "ql-indent-2",
  "ql-indent-3",
]);

export const CONTRACT_TEMPLATE_DURATION_OPTIONS = [
  {
    value: "indefinite",
    label: "Onbepaalde tijd",
    description: "Vast dienstverband zonder vooraf bepaalde einddatum.",
    contractTypes: ["standard", "call"],
  },
  {
    value: "1_month",
    label: "1 maand",
    description: "Bepaalde tijd. Een proeftijd is niet toegestaan.",
    contractTypes: ["standard", "call", "internship"],
  },
  {
    value: "2_months",
    label: "2 maanden",
    description: "Bepaalde tijd. Een proeftijd is niet toegestaan.",
    contractTypes: ["standard", "call", "internship"],
  },
  {
    value: "6_months",
    label: "6 maanden",
    description: "Bepaalde tijd. Een proeftijd is niet toegestaan; de aanzegplicht geldt bij zes maanden wel.",
    contractTypes: ["standard", "call", "internship"],
  },
  {
    value: "7_months",
    label: "7 maanden",
    description: "Bepaalde tijd langer dan zes maanden. De app leidt de toegestane proeftijd later af uit de CAO en medewerkerssituatie.",
    contractTypes: ["standard", "call", "internship"],
  },
  {
    value: "1_year",
    label: "1 jaar",
    description: "Bepaalde tijd van twaalf maanden.",
    contractTypes: ["standard", "call", "internship"],
  },
  {
    value: "2_years",
    label: "2 jaar",
    description: "Bepaalde tijd van vierentwintig maanden. Controleer altijd de contractketen.",
    contractTypes: ["standard", "call"],
  },
  {
    value: "3_years",
    label: "3 jaar",
    description: "Bepaalde tijd van zesendertig maanden. Controleer altijd de contractketen.",
    contractTypes: ["standard", "call"],
  },
  {
    value: "free",
    label: "Vrije einddatum",
    description: "De gebruiker kiest bij het contract zelf een einddatum; de app berekent de juridische duurregels uit de datums.",
    contractTypes: ["standard", "call", "internship"],
  },
];

function compact(value) {
  return String(value || "").trim();
}

function normalizeKeyPart(value) {
  return compact(value).toLocaleLowerCase("nl-NL").replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function decodeHtmlEntities(value) {
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");
    return textarea.value;
  }
  return String(value || "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");
}

function paragraphsFromText(value) {
  const paragraphs = [];
  let current = [];
  const flush = () => {
    const paragraph = current.join("\n").trim();
    if (paragraph) paragraphs.push(paragraph);
    current = [];
  };

  String(value || "").replace(/\r\n/g, "\n").split("\n").forEach(line => {
    if (!compact(line)) {
      flush();
      return;
    }
    if (/^(?:x|\d+)\.\d+\s+/i.test(compact(line)) && current.length > 0) flush();
    current.push(line);
  });
  flush();
  return paragraphs;
}

function textToBlockHtml(value) {
  const paragraphs = paragraphsFromText(value);
  if (paragraphs.length === 0) return "<p><br></p>";
  return paragraphs
    .map(paragraph => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

export function sanitizeContractBlockHtml(value) {
  const source = String(value || "");
  if (typeof DOMParser === "undefined") {
    return source
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  }

  const parsed = new DOMParser().parseFromString(source, "text/html");
  [...parsed.body.querySelectorAll("*")].forEach(element => {
    if (!ALLOWED_BLOCK_TAGS.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }

    [...element.attributes].forEach(attribute => {
      const allowed = attribute.name === "class" || (element.tagName === "A" && attribute.name === "href");
      if (!allowed) element.removeAttribute(attribute.name);
    });

    if (element.hasAttribute("class")) {
      const classes = String(element.getAttribute("class") || "")
        .split(/\s+/)
        .filter(className => ALLOWED_BLOCK_CLASSES.has(className));
      if (classes.length > 0) element.setAttribute("class", classes.join(" "));
      else element.removeAttribute("class");
    }

    if (element.tagName === "A") {
      const href = compact(element.getAttribute("href"));
      if (!/^(https?:|mailto:)/i.test(href)) element.removeAttribute("href");
      else {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }
    }
  });
  return parsed.body.innerHTML || "<p><br></p>";
}

const ARTICLE_SECTION_BLOCK_SELECTOR = "p, li, h2, h3, blockquote";
const ARTICLE_SECTION_TEXT_PATTERN = /^(\s*)(?:x|\d{1,3})\.\d+(?=\s|$)/i;

function firstMeaningfulTextNode(element) {
  for (const child of element.childNodes || []) {
    if (child.nodeType === 3 && String(child.nodeValue || "").trim()) return child;
    if (child.nodeType === 1) {
      const nested = firstMeaningfulTextNode(child);
      if (nested) return nested;
    }
  }
  return null;
}

export function normalizeContractArticleSectionHtml(value) {
  const html = sanitizeContractBlockHtml(value);
  let sectionNumber = 0;

  if (typeof DOMParser !== "undefined") {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const sectionBlocks = [...parsed.body.querySelectorAll(ARTICLE_SECTION_BLOCK_SELECTOR)]
      .filter(element => !element.parentElement?.closest(ARTICLE_SECTION_BLOCK_SELECTOR));
    sectionBlocks.forEach(element => {
      const textNode = firstMeaningfulTextNode(element);
      if (!textNode || !ARTICLE_SECTION_TEXT_PATTERN.test(String(textNode.nodeValue || ""))) return;
      sectionNumber += 1;
      textNode.nodeValue = String(textNode.nodeValue || "").replace(
        ARTICLE_SECTION_TEXT_PATTERN,
        (_, whitespace) => `${whitespace}x.${sectionNumber}`,
      );
    });
    return parsed.body.innerHTML || "<p><br></p>";
  }

  return html.replace(
    /(^|>)(\s*)(?:x|\d{1,3})\.\d+(?=\s|<|$)/gi,
    (_, boundary, whitespace) => {
      sectionNumber += 1;
      return `${boundary}${whitespace}x.${sectionNumber}`;
    },
  );
}

export function contractBlockHtmlToPlainText(value) {
  const normalized = String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\u2022 ")
    .replace(/<\/(?:p|div|h2|h3|blockquote|li)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(normalized)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function nextContractArticleSectionNumber(value) {
  const content = contractBlockHtmlToPlainText(normalizeContractArticleSectionHtml(value));
  const sectionNumbers = [...content.matchAll(/(?:^|\n)\s*x\.(\d+)(?=\s|$)/gim)]
    .map(match => Number(match[1]))
    .filter(Number.isFinite);
  return Math.max(0, ...sectionNumbers) + 1;
}

function createBlockId(index, kind, title) {
  const slug = normalizeKeyPart(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `template-block-${index + 1}-${kind}-${slug || "zonder-titel"}`;
}

function createBlock({ index, kind, title, content, articleNumber = null }) {
  const contentHtml = textToBlockHtml(content);
  return {
    id: createBlockId(index, kind, title),
    kind,
    title: compact(title),
    content_html: kind === "article" ? normalizeContractArticleSectionHtml(contentHtml) : contentHtml,
    article_number: articleNumber,
  };
}

export function createEmptyContractTemplateBlock(index = 0) {
  return {
    id: `template-block-new-${Date.now()}-${index}`,
    kind: "article",
    title: "Nieuw artikel",
    content_html: "<p>x.1 Nieuwe bepaling</p>",
    article_number: null,
  };
}

export function contractTemplateBlocksFromBody(body) {
  const lines = String(body || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let current = { kind: "preamble", title: "Aanhef en partijen", articleNumber: null, lines: [] };

  const flush = () => {
    let title = current.title;
    let contentLines = current.lines;
    if (current.kind === "preamble") {
      const titleIndex = contentLines.findIndex(line => compact(line));
      if (titleIndex >= 0) {
        title = compact(contentLines[titleIndex]);
        contentLines = contentLines.filter((_, index) => index !== titleIndex);
      }
    }
    const content = contentLines.join("\n").trim();
    if (!content && current.kind !== "article") return;
    blocks.push(createBlock({
      index: blocks.length,
      kind: current.kind,
      title,
      content,
      articleNumber: current.articleNumber,
    }));
  };

  lines.forEach(line => {
    const articleMatch = compact(line).match(ARTICLE_HEADING_PATTERN);
    if (articleMatch) {
      flush();
      current = {
        kind: "article",
        title: articleMatch[2],
        articleNumber: Number(articleMatch[1]),
        lines: [],
      };
      return;
    }
    if (/^Ondertekening$/i.test(compact(line))) {
      flush();
      current = { kind: "closing", title: "Ondertekening", articleNumber: null, lines: [] };
      return;
    }
    current.lines.push(line);
  });
  flush();

  return blocks.length > 0 ? blocks : [createEmptyContractTemplateBlock()];
}

export function normalizeContractTemplateBlocks(blocks, fallbackBody = "") {
  if (!Array.isArray(blocks) || blocks.length === 0) return contractTemplateBlocksFromBody(fallbackBody);
  let articleNumber = 0;
  return blocks.map((block, index) => {
    const kind = ["preamble", "article", "closing"].includes(block.kind) ? block.kind : "article";
    if (kind === "article") articleNumber += 1;
    const contentHtml = sanitizeContractBlockHtml(block.content_html || textToBlockHtml(block.content || ""));
    return {
      id: compact(block.id) || createBlockId(index, kind, block.title),
      kind,
      title: compact(block.title) || (kind === "closing" ? "Ondertekening" : "Naamloos artikel"),
      content_html: kind === "article"
        ? normalizeContractArticleSectionHtml(contentHtml)
        : contentHtml,
      article_number: kind === "article" ? articleNumber : null,
    };
  });
}

function renderArticleSectionText(value, articleNumber) {
  return String(value || "").replace(
    /(^|\n)(\s*)x\.(\d+)(?=\s|$)/gim,
    `$1$2${articleNumber}.$3`,
  );
}

function renderArticleSectionHtml(value, articleNumber) {
  return normalizeContractArticleSectionHtml(value).replace(
    /(^|>)(\s*)x\.(\d+)(?=\s|<|$)/gi,
    `$1$2${articleNumber}.$3`,
  );
}

export function renderedContractTemplateBlocks(blocks) {
  let articleNumber = 0;
  return normalizeContractTemplateBlocks(blocks).map(block => {
    if (block.kind !== "article") {
      return {
        ...block,
        rendered_title: block.title,
        rendered_content_html: block.content_html,
        rendered_article_number: null,
      };
    }
    articleNumber += 1;
    return {
      ...block,
      rendered_title: `Artikel ${articleNumber} - ${block.title}`,
      rendered_content_html: renderArticleSectionHtml(block.content_html, articleNumber),
      rendered_article_number: articleNumber,
    };
  });
}

export function contractTemplateBodyFromBlocks(blocks) {
  let articleNumber = 0;
  return normalizeContractTemplateBlocks(blocks).map(block => {
    let content = contractBlockHtmlToPlainText(block.content_html);
    if (block.kind === "preamble") return [block.title, content].filter(Boolean).join("\n\n");
    if (block.kind === "closing") return [block.title || "Ondertekening", content].filter(Boolean).join("\n\n");
    articleNumber += 1;
    content = renderArticleSectionText(content, articleNumber);
    return [`Artikel ${articleNumber} - ${block.title}`, content].filter(Boolean).join("\n\n");
  }).filter(Boolean).join("\n\n");
}

function htmlTopLevelSegments(value) {
  const html = sanitizeContractBlockHtml(value);
  if (typeof DOMParser === "undefined") return [html];
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const segments = [...parsed.body.children].map(element => element.outerHTML).filter(Boolean);
  return segments.length > 0 ? segments : ["<p><br></p>"];
}

function estimatePreviewUnits(html, includesHeading = false) {
  const text = contractBlockHtmlToPlainText(html);
  const lines = Math.max(1, Math.ceil(text.length / 82));
  return lines + 1.3 + (includesHeading ? 2.4 : 0);
}

export function paginateContractTemplateBlocks(blocks, maxUnits = 57) {
  const units = [];
  renderedContractTemplateBlocks(blocks).forEach(block => {
    const segments = htmlTopLevelSegments(block.rendered_content_html);
    const showHeading = true;
    segments.forEach((html, index) => {
      units.push({
        id: `${block.id}-segment-${index}`,
        block_id: block.id,
        heading: index === 0 && showHeading ? block.rendered_title : "",
        html,
        estimated_units: estimatePreviewUnits(html, index === 0 && showHeading),
      });
    });
  });

  const pages = [[]];
  let used = 0;
  units.forEach(unit => {
    if (pages[pages.length - 1].length > 0 && used + unit.estimated_units > maxUnits) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(unit);
    used += unit.estimated_units;
  });
  return pages;
}

export function paginateContractTemplateUnitsByHeight(units = [], {
  heights = {},
  pageHeight = 1,
  firstPageReservedHeight = 0,
  safetyGap = 0,
} = {}) {
  const availableHeight = Math.max(1, Number(pageHeight) - Math.max(0, Number(safetyGap) || 0));
  const pages = [[]];
  let usedHeight = Math.max(0, Number(firstPageReservedHeight) || 0);

  (units || []).forEach(unit => {
    const measuredHeight = Number(heights[unit.id]);
    const unitHeight = Number.isFinite(measuredHeight) && measuredHeight > 0
      ? measuredHeight
      : Math.max(1, Number(unit.estimated_units || 1) * 11);
    const currentPage = pages[pages.length - 1];
    const shouldStartNewPage = usedHeight + unitHeight > availableHeight
      && (currentPage.length > 0 || (pages.length === 1 && usedHeight > 0));
    if (shouldStartNewPage) {
      pages.push([]);
      usedHeight = 0;
    }
    pages[pages.length - 1].push(unit);
    usedHeight += unitHeight;
  });

  return pages;
}

function contractDurationType(form = {}) {
  if (form.contract_model === "internship") return "internship";
  if (["min_max_employment", "call_employment"].includes(form.contract_model)) return "call";
  return "standard";
}

export function durationOptionsForContractTemplate(form = {}) {
  if (form.template_type !== "employment_contract") return [];
  const contractType = contractDurationType(form);
  return CONTRACT_TEMPLATE_DURATION_OPTIONS
    .filter(option => option.contractTypes.includes(contractType))
    .map(option => {
      if (form.cao_key === "cao_particuliere_beveiliging" && option.value === "indefinite") {
        return { ...option, description: `${option.description} CAO PB: de proeftijd bedraagt maximaal twee maanden.` };
      }
      if (form.cao_key !== "cao_particuliere_beveiliging" || !["7_months", "1_year", "2_years", "3_years", "free"].includes(option.value)) {
        return option;
      }
      return {
        ...option,
        description: `${option.description} CAO PB: bij bepaalde tijd langer dan zes maanden geldt één maand proeftijd, of twee maanden voor een aspirant-beveiliger.`,
      };
    });
}

export function normalizeTemplateReference(value) {
  return normalizeKeyPart(value);
}

function normalizeContractModelScope(value) {
  const normalized = normalizeKeyPart(value);
  if (["fulltime", "fulltime_fixed", "fulltime_indefinite", "fulltime_employment"].includes(normalized)) return "fulltime_employment";
  if (["parttime_fixed", "parttime_indefinite", "parttime_employment"].includes(normalized)) return "parttime_employment";
  if (["min_max", "min_max_fixed", "min_max_indefinite", "min_max_employment"].includes(normalized)) return "min_max_employment";
  if (["call_agreement", "call_fixed", "call_indefinite", "call_employment"].includes(normalized)) return "call_employment";
  return normalized || "all";
}

export function contractTemplateScopeKey({ template_type, cao_key, contract_model, employment_model_scope, metadata } = {}) {
  return [
    normalizeKeyPart(template_type || "employment_contract"),
    normalizeKeyPart(cao_key || "none"),
    normalizeContractModelScope(contract_model || metadata?.contract_model || employment_model_scope),
  ].join("::");
}

export function contractTemplateFamilyKey(template = {}) {
  const stored = compact(template.template_family_key || template.metadata?.template_family_key);
  if (stored) return stored;
  return `${contractTemplateScopeKey(template)}::${normalizeTemplateReference(template.name)}`;
}

export function groupContractTemplateVersions(templates = []) {
  const groups = new Map();
  (templates || []).forEach(template => {
    const key = contractTemplateFamilyKey(template);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(template);
  });
  return [...groups.entries()].map(([key, versions]) => ({
    key,
    versions: [...versions].sort((a, b) => Number(b.version || 1) - Number(a.version || 1)),
  })).sort((a, b) => String(a.versions[0]?.name || "").localeCompare(String(b.versions[0]?.name || ""), "nl"));
}

export function nextContractTemplateVersion(templates = [], familyKey) {
  const versions = (templates || []).filter(template => contractTemplateFamilyKey(template) === familyKey);
  return Math.max(0, ...versions.map(template => Number(template.version || 1))) + 1;
}
