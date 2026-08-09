export const HANDBOOK_CONTENT_FORMAT = "blocks_v1";
export const AJAX_HANDBOOK_RELEASE = "2026.08.2";

const releaseRoot = `/installation-handbook-assets/ajax/${AJAX_HANDBOOK_RELEASE}`;

export const HANDBOOK_ASSETS = {
  "ajax:icon:armed": { kind: "icon", src: `${releaseRoot}/icons/armed.svg`, alt: "Inschakelen" },
  "ajax:icon:disarmed": { kind: "icon", src: `${releaseRoot}/icons/disarmed.svg`, alt: "Uitschakelen" },
  "ajax:icon:night-mode": { kind: "icon", src: `${releaseRoot}/icons/night-mode.svg`, alt: "Nachtmodus" },
  "ajax:icon:reset": { kind: "icon", src: `${releaseRoot}/icons/reset.svg`, alt: "Wissen" },
  "ajax:icon:function": { kind: "icon", src: `${releaseRoot}/icons/function.svg`, alt: "Functietoets" },
  "ajax:icon:control": { kind: "icon", src: `${releaseRoot}/icons/control.svg`, alt: "Bediening" },
  "ajax:icon:user": { kind: "icon", src: `${releaseRoot}/icons/user.svg`, alt: "Gebruiker" },
  "ajax:icon:pass-tag": { kind: "icon", src: `${releaseRoot}/icons/pass-tag.svg`, alt: "Pass of Tag" },
  "ajax:icon:settings": { kind: "icon", src: `${releaseRoot}/icons/settings.svg`, alt: "Instellingen" },
  "ajax:image:keypad:functional": { kind: "image", src: `${releaseRoot}/images/keypad-functional-elements.jpg` },
  "ajax:image:keypad-plus:functional": { kind: "image", src: `${releaseRoot}/images/keypad-plus-functional-elements.jpg` },
  "ajax:image:keypad-combi:functional": { kind: "image", src: `${releaseRoot}/images/keypad-combi-functional-elements.jpg` },
  "ajax:image:touchscreen:functional": { kind: "image", src: `${releaseRoot}/images/keypad-touchscreen-functional-elements.jpg` },
  "ajax:image:touchscreen:control": { kind: "image", src: `${releaseRoot}/images/touchscreen-control.jpg` },
  "ajax:image:touchscreen:groups": { kind: "image", src: `${releaseRoot}/images/touchscreen-groups.jpg` },
  "ajax:image:touchscreen:night": { kind: "image", src: `${releaseRoot}/images/touchscreen-night-mode.jpg` },
  "ajax:image:outdoor:functional": { kind: "image", src: `${releaseRoot}/images/keypad-outdoor-functional-elements.jpg` },
  "ajax:image:bypass:device": { kind: "image", src: `${releaseRoot}/images/one-time-deactivation-device.png` },
  "ajax:image:bypass:settings": { kind: "image", src: `${releaseRoot}/images/one-time-deactivation-settings.jpg` },
  "ajax:image:bypass:choice": { kind: "image", src: `${releaseRoot}/images/one-time-deactivation-choice.jpg` },
  "ajax:image:bypass:result": { kind: "image", src: `${releaseRoot}/images/one-time-deactivation-result.jpg` },
  "ajax:image:app:arm": { kind: "image", src: `${releaseRoot}/images/app-arm.jpg` },
  "ajax:image:app:disarm": { kind: "image", src: `${releaseRoot}/images/app-disarm.jpg` },
  "ajax:image:app:night": { kind: "image", src: `${releaseRoot}/images/app-night-mode.jpg` },
  "ajax:image:app:group": { kind: "image", src: `${releaseRoot}/images/app-group.jpg` },
};

export const HANDBOOK_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "steps",
  "callout",
  "image",
  "button_sequence",
  "link",
  "divider",
];

export const HANDBOOK_BLOCK_LABELS = {
  paragraph: "Tekst",
  heading: "Tussenkop",
  steps: "Stappenplan",
  callout: "Aandachtspunt",
  image: "Afbeelding",
  button_sequence: "Toetsvolgorde",
  link: "Verwijzing",
  divider: "Scheidslijn",
};

export function handbookBlockId(prefix = "block") {
  const value = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${value}`;
}

export function newHandbookBlock(type = "paragraph") {
  const base = { id: handbookBlockId(type), type };
  if (type === "heading") return { ...base, text: "", level: 2 };
  if (type === "steps") return { ...base, items: [""] };
  if (type === "callout") return { ...base, text: "", tone: "info" };
  if (type === "image") return { ...base, managed_file_id: null, asset_key: null, alt: "", caption: "", layout: "wide" };
  if (type === "button_sequence") return { ...base, sequence: [{ type: "text", value: "Bevoegde code", label: null }] };
  if (type === "link") return { ...base, target_type: "article", target_id: null, target_key: null, label: "", description: "" };
  if (type === "divider") return base;
  return { ...base, text: "" };
}

export function legacyArticleBlocks(article) {
  if (article?.content_format === HANDBOOK_CONTENT_FORMAT) {
    return Array.isArray(article?.supplement_blocks) ? article.supplement_blocks : [];
  }
  if (Array.isArray(article?.supplement_blocks) && article.supplement_blocks.length) return article.supplement_blocks;
  const content = String(article?.content || "").trim();
  return content ? [{ id: `legacy-${article?.id || "article"}`, type: "paragraph", text: content }] : [];
}

export function articleBlocks(article) {
  const managed = Array.isArray(article?.managed_blocks) ? article.managed_blocks : [];
  const supplement = article?.content_format === HANDBOOK_CONTENT_FORMAT
    ? (Array.isArray(article?.supplement_blocks) ? article.supplement_blocks : [])
    : legacyArticleBlocks(article);
  return { managed, supplement, all: [...managed, ...supplement] };
}

export function blockPlainText(block) {
  if (!block || typeof block !== "object") return "";
  if (block.type === "steps") return (block.items || []).join("\n");
  if (block.type === "button_sequence") return (block.sequence || []).map(item => item.label || item.value).join(" → ");
  if (block.type === "image") return [block.alt, block.caption].filter(Boolean).join(" ");
  if (block.type === "link") return [block.label, block.description].filter(Boolean).join(" ");
  return String(block.text || "");
}

export function blocksPlainText(blocks = []) {
  return blocks.map(blockPlainText).filter(Boolean).join("\n\n");
}

export function handbookArticleSearchText(article, categories = []) {
  const blocks = articleBlocks(article).all;
  const categoryPath = categoryBreadcrumb(categories, article?.category_id).map(category => category.name).join(" ");
  return [categoryPath, article?.title, article?.summary, article?.content, blocksPlainText(blocks)].filter(Boolean).join(" ");
}

export function categoryBreadcrumb(categories, categoryId) {
  const byId = new Map(categories.map(category => [category.id, category]));
  const path = [];
  const visited = new Set();
  let current = categoryId ? byId.get(categoryId) : null;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parent_category_id ? byId.get(current.parent_category_id) : null;
  }
  return path;
}

export function categoryOptionLabel(categories, category) {
  return categoryBreadcrumb(categories, category.id).map(item => item.name).join(" / ");
}

export function articleOptionLabel(categories, article) {
  return [...categoryBreadcrumb(categories, article?.category_id).map(item => item.name), article?.title]
    .filter(Boolean)
    .join(" / ");
}
