import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AJAX_CONTROL_DEVICE_OPTIONS } from "../src/components/objects/objectInstallationManuals.js";

const assetRoot = resolve(process.cwd(), "public/installation-control-devices/ajax");
const manifest = JSON.parse(readFileSync(resolve(assetRoot, "manifest.json"), "utf8"));
const entries = Array.isArray(manifest.devices) ? manifest.devices : [];
const photoOptions = AJAX_CONTROL_DEVICE_OPTIONS.filter(option => option.imageSrc);
const failures = [];

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

function inspectPng(buffer, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(buffer.subarray(0, 8).equals(signature), `${label}: geen geldig PNG-bestand`);
  if (!buffer.subarray(0, 8).equals(signature)) return;

  let offset = 8;
  let header = null;
  let hasTransparencyChunk = false;
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
      };
    }
    if (type === "tRNS") hasTransparencyChunk = true;
    offset += length + 12;
    if (type === "IEND") break;
  }

  assert(header, `${label}: IHDR ontbreekt`);
  if (!header) return;
  assert(header.width >= 1000 && header.height >= 450, `${label}: productrender is te klein (${header.width}x${header.height})`);
  assert(header.bitDepth === 8, `${label}: verwacht 8-bit PNG, kreeg ${header.bitDepth}-bit`);
  assert([4, 6].includes(header.colorType) || hasTransparencyChunk, `${label}: transparantiekanaal ontbreekt`);
}

assert(manifest.manufacturer === "Ajax Systems", "fabrikant ontbreekt in manifest");
assert(manifest.retrieved_at === "2026-08-05", "ophaaldatum ontbreekt of is onjuist");
assert(entries.length === photoOptions.length, `manifest bevat ${entries.length} foto's; catalogus bevat ${photoOptions.length} foto-opties`);
assert(new Set(entries.map(entry => entry.key)).size === entries.length, "manifest bevat dubbele paneelsleutels");
assert(entries.every(entry => entry.colour === "black"), "alle Ajax-productrenders moeten dezelfde zwarte uitvoering gebruiken");

for (const option of photoOptions) {
  const entry = entries.find(candidate => candidate.key === option.value);
  assert(entry, `${option.label}: manifestvermelding ontbreekt`);
  if (!entry) continue;
  assert(entry.label === option.label, `${option.label}: manifestlabel is ${entry.label}`);
  assert(option.imageSrc === `/installation-control-devices/ajax/${entry.asset}`, `${option.label}: catalogus- en manifestpad verschillen`);
  assert(/^https:\/\/ajax\.systems\//.test(entry.source_page), `${option.label}: officiële bronpagina ontbreekt`);
  assert(/^https:\/\/ajax\.systems\/cdn\/upload\/.+@2\.png$/.test(entry.source_url), `${option.label}: officiële hoge-resolutiebron ontbreekt`);

  let buffer;
  try {
    buffer = readFileSync(resolve(assetRoot, entry.asset));
  } catch {
    failures.push(`${option.label}: ${entry.asset} ontbreekt`);
    continue;
  }
  inspectPng(buffer, option.label);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  assert(entry.sha256 === sha256, `${option.label}: SHA-256 komt niet overeen met manifest`);
}

const appOnly = AJAX_CONTROL_DEVICE_OPTIONS.find(option => option.value === "ajax-app-only");
assert(appOnly?.imageSrc === null, "appbediening mag niet als fysiek productpaneel worden afgebeeld");

if (failures.length) {
  console.error(`Ajax-bedienpaneelcontrole mislukt (${failures.length}):`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Ajax-bedienpaneelcontrole geslaagd: ${photoOptions.length} officiële zwarte PNG-productrenders met herkomst en checksum.`);
