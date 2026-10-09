import { copyFile, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'desktop/licenses');
await mkdir(output, {recursive: true});
const packages = ['electron', 'pdfjs-dist', '@techstark/opencv-js', 'react', 'react-dom', 'scheduler', 'lucide-react', 'zod'];
const entries = [];
for (const name of packages) {
  const directory = path.join(root, 'node_modules', name);
  const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const license = (await readdir(directory)).find(filename => /^licen[sc]e(?:\.(?:md|txt))?$/i.test(filename));
  if (!license) throw new Error(`Missing license text: ${name}`);
  const destination = `${name.replaceAll('/', '--').replaceAll('@', '')}-LICENSE.txt`;
  await copyFile(path.join(directory, license), path.join(output, destination));
  entries.push(`${name} ${metadata.version}\nLicense: ${metadata.license}\nUpstream: ${typeof metadata.repository === 'object' ? metadata.repository.url : metadata.repository || metadata.homepage || ''}\nLicense text: ${destination}\n`);
}
await copyFile(path.join(root, 'node_modules/electron/dist/LICENSES.chromium.html'), path.join(output, 'Chromium-LICENSES.html'));
for (const subdirectory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  const source = path.join(root, 'node_modules/pdfjs-dist', subdirectory);
  for (const filename of await readdir(source)) if (/^LICENSE/.test(filename)) await copyFile(path.join(source, filename), path.join(output, `PDFjs-${subdirectory}-${filename}.txt`));
}
await writeFile(path.join(output, 'NOTICE.txt'), `LOQ Desktop — third-party software notices\n\nThis application includes the following software. Original license texts and copyright notices are retained alongside this notice. The Electron runtime includes Chromium and its dependencies; their detailed notices are in Chromium-LICENSES.html. PDF.js support-component license texts are also supplied.\n\n${entries.join('\n')}\nLOQ application code uses these packages through their published APIs. Vite bundles the JavaScript modules; the package source itself is not modified. The OpenCV.js WebAssembly build is supplied by @techstark/opencv-js. LOQ's wall recognition, SVG renderer and desktop integration are separate application code.\n\nThe application icon incorporates the pre-existing LOQ logo from this repository. Third-party licenses do not grant rights to the LOQ brand.\n`);
console.log(`License texts collected for ${packages.length} packages and bundled runtime notices.`);
