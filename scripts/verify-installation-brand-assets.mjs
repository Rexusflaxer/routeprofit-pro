import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { ALARM_SYSTEM_BRAND_OPTIONS } from "../src/components/objects/objectInstallationConfig.js";

const assetRoot = resolve(process.cwd(), "public/installation-brand-logos/alarm-system");
const manifest = JSON.parse(readFileSync(resolve(assetRoot, "manifest.json"), "utf8"));
const entries = Array.isArray(manifest.brands) ? manifest.brands : [];
const failures = [];

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const paeth = (left, above, upperLeft) => {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
};

function inspectPng(buffer, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(buffer.subarray(0, 8).equals(signature), `${label}: geen geldig PNG-bestand`);
  if (!buffer.subarray(0, 8).equals(signature)) return null;

  let offset = 8;
  let header = null;
  let transparencyChunk = null;
  const imageData = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    }
    if (type === "tRNS") transparencyChunk = data;
    if (type === "IDAT") imageData.push(data);
    offset += length + 12;
    if (type === "IEND") break;
  }

  assert(header, `${label}: IHDR ontbreekt`);
  if (!header) return null;
  assert(header.width === 320 && header.height === 96, `${label}: verwacht 320x96, kreeg ${header.width}x${header.height}`);
  assert(header.bitDepth === 8, `${label}: verwacht 8-bit PNG, kreeg ${header.bitDepth}-bit`);
  assert(header.interlace === 0, `${label}: interlaced PNG kan niet volledig worden gecontroleerd`);

  if (header.bitDepth !== 8 || header.interlace !== 0) return header;
  if (header.colorType === 3) {
    assert(transparencyChunk?.some(alpha => alpha < 255), `${label}: palet-PNG heeft geen transparante pixels`);
    return header;
  }

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header.colorType];
  assert(channels, `${label}: niet-ondersteund PNG-kleurtype ${header.colorType}`);
  if (!channels) return header;
  if (header.colorType === 0 || header.colorType === 2) {
    assert(transparencyChunk, `${label}: PNG heeft geen transparantiekanaal`);
    return header;
  }

  const bytesPerPixel = channels;
  const rowLength = header.width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(imageData));
  const previous = Buffer.alloc(rowLength);
  let cursor = 0;
  let transparentPixels = 0;
  let visiblePixels = 0;
  let contrastingVisiblePixels = 0;

  for (let row = 0; row < header.height; row += 1) {
    const filter = inflated[cursor];
    cursor += 1;
    const current = Buffer.from(inflated.subarray(cursor, cursor + rowLength));
    cursor += rowLength;
    for (let index = 0; index < rowLength; index += 1) {
      const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0;
      const above = previous[index];
      const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
      if (filter === 1) current[index] = (current[index] + left) & 255;
      else if (filter === 2) current[index] = (current[index] + above) & 255;
      else if (filter === 3) current[index] = (current[index] + Math.floor((left + above) / 2)) & 255;
      else if (filter === 4) current[index] = (current[index] + paeth(left, above, upperLeft)) & 255;
      else assert(filter === 0, `${label}: onbekend PNG-filter ${filter}`);
    }
    const alphaOffset = header.colorType === 6 ? 3 : 1;
    for (let index = alphaOffset; index < rowLength; index += bytesPerPixel) {
      const alpha = current[index];
      if (alpha < 255) transparentPixels += 1;
      if (alpha > 0) visiblePixels += 1;
      const luminance = header.colorType === 6
        ? (0.2126 * current[index - 3]) + (0.7152 * current[index - 2]) + (0.0722 * current[index - 1])
        : current[index - 1];
      if (alpha > 16 && luminance < 235) contrastingVisiblePixels += 1;
    }
    current.copy(previous);
  }

  assert(transparentPixels > 0, `${label}: geen daadwerkelijk transparante pixels gevonden`);
  assert(visiblePixels > 0, `${label}: logo bevat geen zichtbare pixels`);
  assert(
    contrastingVisiblePixels >= Math.max(16, Math.floor(visiblePixels * 0.02)),
    `${label}: onvoldoende contrast op de gedeelde witte tegel`,
  );
  return header;
}

assert(entries.length === ALARM_SYSTEM_BRAND_OPTIONS.length, `manifest bevat ${entries.length} merken; catalogus bevat ${ALARM_SYSTEM_BRAND_OPTIONS.length}`);
assert(new Set(entries.map(entry => entry.slug)).size === entries.length, "manifest bevat dubbele slugs");
assert(ALARM_SYSTEM_BRAND_OPTIONS.every(option => option.logoBackground !== "dark"), "alle merklogo's moeten op dezelfde witte tegel werken");
assert(entries.every(entry => entry.dark_tile === false), "het manifest bevat nog een logo dat een donkere tegel vereist");

for (const option of ALARM_SYSTEM_BRAND_OPTIONS) {
  const slug = option.logoSrc.split("/").pop().replace(/\.png$/, "");
  const entry = entries.find(candidate => candidate.slug === slug);
  assert(entry, `${option.label}: manifestvermelding ontbreekt`);
  if (!entry) continue;
  assert(entry.label === option.label, `${option.label}: manifestlabel is ${entry.label}`);
  assert(/^https:\/\//.test(entry.source_url), `${option.label}: geldige bron-URL ontbreekt`);
  assert(entry.retrieved_at === "2026-08-04", `${option.label}: ophaaldatum ontbreekt of is onjuist`);
  assert(entry.dark_tile === (option.logoBackground === "dark"), `${option.label}: tegelcontrast komt niet overeen met het manifest`);

  let buffer;
  try {
    buffer = readFileSync(resolve(assetRoot, `${slug}.png`));
  } catch {
    failures.push(`${option.label}: ${slug}.png ontbreekt`);
    continue;
  }
  inspectPng(buffer, option.label);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  assert(entry.sha256 === sha256, `${option.label}: SHA-256 komt niet overeen met manifest`);
}

if (failures.length) {
  console.error(`Installatiemerkencontrole mislukt (${failures.length}):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Installatiemerkencontrole geslaagd: ${ALARM_SYSTEM_BRAND_OPTIONS.length} lokale PNG-logo's met herkomst en transparantie.`);
