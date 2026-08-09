import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE = "2026.08.2";
const releaseDir = path.join(ROOT, "public", "installation-handbook-assets", "ajax", RELEASE);
const manifest = JSON.parse(fs.readFileSync(path.join(releaseDir, "manifest.json"), "utf8"));
const frontend = fs.readFileSync(path.join(ROOT, "src", "components", "objects", "handbookContent.js"), "utf8");
const backend = fs.readFileSync(path.join(ROOT, "base44", "functions", "customerPlatformApi", "entry.ts"), "utf8");

assert.equal(manifest.manufacturer, "Ajax Systems");
assert.equal(manifest.release, RELEASE);
assert.ok(Array.isArray(manifest.assets));
assert.equal(manifest.assets.length, 25, "De release moet exact 25 gecontroleerde Ajax-assets bevatten");
assert.equal(new Set(manifest.assets.map(asset => asset.key)).size, manifest.assets.length, "Asset keys moeten uniek zijn");

const required = new Set([
  "ajax:icon:armed", "ajax:icon:disarmed", "ajax:icon:night-mode", "ajax:icon:function",
  "ajax:icon:control", "ajax:icon:pass-tag", "ajax:icon:settings",
  "ajax:image:keypad:functional", "ajax:image:keypad-plus:functional", "ajax:image:keypad-combi:functional",
  "ajax:image:touchscreen:functional", "ajax:image:outdoor:functional",
  "ajax:image:bypass:device", "ajax:image:bypass:settings", "ajax:image:bypass:choice", "ajax:image:bypass:result",
]);

for (const asset of manifest.assets) {
  assert.match(asset.key, /^ajax:(icon|image):/);
  assert.ok(["icon", "image"].includes(asset.kind));
  assert.match(asset.source_url, /^https:\/\/ajax\.systems\//, `${asset.key} heeft geen officiele Ajax-bron`);
  assert.ok(String(asset.alt || "").trim(), `${asset.key} mist alternatieve tekst`);
  const file = path.join(releaseDir, asset.file);
  assert.ok(fs.existsSync(file), `Asset ontbreekt: ${asset.file}`);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  assert.equal(digest, asset.sha256, `Checksum wijkt af: ${asset.file}`);
  assert.ok(frontend.includes(`"${asset.key}"`), `Frontendcatalogus mist ${asset.key}`);
  assert.ok(backend.includes(`'${asset.key}'`), `Backendallowlist mist ${asset.key}`);
  required.delete(asset.key);
}

assert.deepEqual([...required], [], "Verplichte Ajax-assets ontbreken");
console.log(`Ajax-handboekassets: OK (${manifest.assets.length} bestanden, release ${RELEASE})`);
