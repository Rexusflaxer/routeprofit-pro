import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, 'desktop/release');
const unsigned = process.argv.includes('--unsigned');
const version = (await readFile(path.join(root, 'desktop/electron-builder.yml'), 'utf8')).match(/^ {2}version: ([0-9]+\.[0-9]+\.[0-9]+)$/m)?.[1];
if (!version) throw new Error('Desktop release version is missing.');
const names = (await readdir(directory)).filter(name => /^LOQ-Desktop-.+\.(dmg|zip)$/.test(name) && name.startsWith(`LOQ-Desktop-${version}-`) && name.includes('-UNSIGNED-development.') === unsigned).sort();
if (names.length !== 4) throw new Error(`Expected four DMG/ZIP artifacts; found ${names.length}.`);
const artifacts = [];
for (const name of names) {
  const filename = path.join(directory, name);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  artifacts.push({filename: name, bytes: (await stat(filename)).size, sha256: digest.digest('hex')});
}
await writeFile(path.join(directory, 'SHA256SUMS.txt'), artifacts.map(item => `${item.sha256}  ${item.filename}`).join('\n') + '\n');
await writeFile(path.join(directory, 'release-manifest.json'), JSON.stringify({version, createdAt: new Date().toISOString(), minimumMacOS: '13.0', flavor: unsigned ? 'unsigned-development' : 'production', ...(unsigned ? {developerIdSigned: false, notarized: false} : {}), artifacts}, null, 2) + '\n');
console.log(JSON.stringify(artifacts));
