import { _electron as electron } from '@playwright/test';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPackage } from '@electron/asar';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const run = promisify(execFile);
const qa = path.join(root, 'desktop/.qa');
const distribution = path.resolve(root, process.env.LOQ_PACKAGE_DIRECTORY || 'desktop/release');
await mkdir(qa, {recursive: true});
const results = [];
for (const [arch, directory] of [['arm64', 'mac-arm64'], ['x64', 'mac']].filter(([arch]) => !process.env.LOQ_PACKAGE_ARCH || process.env.LOQ_PACKAGE_ARCH === arch)) {
  const bundle = path.join(distribution, `${directory}/LOQ Desktop.app`);
  const {stdout} = await run('/usr/bin/plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', '-o', '-', path.join(bundle, 'Contents/Info.plist')]);
  if (stdout.trim() !== '13.0') throw new Error(`Minimum macOS version is incorrect for ${arch}`);
  const entries = listPackage(path.join(bundle, 'Contents/Resources/app.asar'));
  if (entries.some(entry => entry.includes('/node_modules/') || entry.includes('/base44/') || entry.includes('.env'))) throw new Error('Unexpected source or dependencies included in the desktop bundle.');
  const notices = await readFile(path.join(bundle, 'Contents/Resources/licenses/NOTICE.txt'), 'utf8');
  if (!notices.includes('electron ') || !notices.includes('pdfjs-dist ') || !notices.includes('@techstark/opencv-js ')) throw new Error('Runtime notices are missing.');
  if (!(await stat(path.join(bundle, 'Contents/Resources/icon.icns'))).size) throw new Error('Native application icon is missing.');
  const application = await electron.launch({executablePath: path.join(bundle, 'Contents/MacOS/LOQ Desktop'), args: [`--user-data-dir=/tmp/loq-packaged-smoke-${arch}`], timeout: 60_000});
  try {
    const page = await application.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('button', {name: 'Inloggen met mijn LOQ-account'}).waitFor({timeout: 20_000});
    const runtime = await application.evaluate(({app}) => ({packaged: app.isPackaged, version: app.getVersion(), arch: process.arch, platform: process.platform}));
    const isolated = await page.evaluate(() => typeof window.require === 'undefined' && !('token' in window.loqDesktop));
    if (!runtime.packaged || runtime.arch !== arch || !isolated || !page.url().startsWith('file:') || errors.length) throw new Error(`Standalone runtime verification failed: ${JSON.stringify({runtime, isolated, errors})}`);
    const appearance = await page.evaluate(() => ({
      logos: [...document.querySelectorAll('.loq-brand img')].map(image => ({loaded: image.complete && image.naturalWidth === 769, bundled: image.src.startsWith('file:')})),
      primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    }));
    if (appearance.logos.length !== 2 || appearance.logos.some(logo => !logo.loaded || !logo.bundled) || !appearance.primary || appearance.horizontalOverflow) throw new Error(`Packaged LOQ appearance failed: ${JSON.stringify(appearance)}`);
    const workerFiles = {recognition: path.basename(entries.find(entry => entry.includes('recognition.worker-'))), pdf: path.basename(entries.find(entry => entry.includes('pdf.worker.min-')))};
    const workers = await page.evaluate(async ({recognition, pdf}) => {
      const pdfWorker = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL(`./assets/${pdf}`, location.href), {type: 'module'});
        const timer = setTimeout(() => {worker.terminate(); reject(new Error('PDF.js worker handshake timed out.'));}, 15_000);
        const fail = message => {clearTimeout(timer); worker.terminate(); reject(new Error(message));};
        worker.onerror = event => fail(event.message);
        worker.onmessage = ({data}) => {
          if (data.action === 'ready') worker.postMessage({sourceName: 'main', targetName: 'worker', action: 'test', data: new Uint8Array([255])});
          if (data.action === 'test') {clearTimeout(timer); worker.terminate(); data.data === true ? resolve({ready: true, typedArrayProtocol: true}) : fail('PDF.js rejected the typed-array handshake.');}
        };
      });
      const recognitionWorker = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL(`./assets/${recognition}`, location.href), {type: 'module'});
        const timer = setTimeout(() => {worker.terminate(); reject(new Error('OpenCV recognition timed out.'));}, 30_000);
        worker.onerror = event => {clearTimeout(timer); worker.terminate(); reject(new Error(event.message));};
        worker.onmessage = ({data}) => {
          clearTimeout(timer); worker.terminate();
          if (data.error || !data.candidates?.length) reject(new Error(data.error || 'OpenCV returned no candidates for four thick walls.'));
          else resolve({candidates: data.candidates.length, syntheticImage: '300x200 RGBA, four 8px walls'});
        };
        const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 200;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 300, 200); ctx.strokeStyle = '#000'; ctx.lineWidth = 8; ctx.strokeRect(35, 35, 230, 130);
        const buffer = ctx.getImageData(0, 0, 300, 200).data.buffer;
        worker.postMessage({id: 'packaged-smoke', operation: 'recognize', width: 300, height: 200, buffer}, [buffer]);
      });
      return {pdfWorker, recognitionWorker, csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content};
    }, workerFiles);
    await page.screenshot({path: path.join(qa, `packaged-${arch}.png`)});
    results.push({architecture: arch, minimumMacOS: stdout.trim(), runtime, isolated, appearance, source: 'bundled local files', workers, pageErrors: errors});
  } finally { await application.close(); }
}
await writeFile(path.join(qa, 'packaging-smoke.json'), JSON.stringify({verifiedAt: new Date().toISOString(), results}, null, 2));
console.log(JSON.stringify(results));
