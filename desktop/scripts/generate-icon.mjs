import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');
// Keep the native app's wordmark identical to the webapp, including its aspect ratio.
const logo = await readFile(path.join(assets, '../../public/loq-logo-dark.png'));
if (logo.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('The LOQ brand asset must be a PNG.');
const logoWidth = 628;
const logoHeight = logoWidth * logo.readUInt32BE(20) / logo.readUInt32BE(16);
await writeFile(path.join(assets, 'loq-desktop.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="surface" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#F2F4F7"/></linearGradient>
    <linearGradient id="accent" gradientUnits="userSpaceOnUse" x1="245" y1="770" x2="779" y2="770"><stop stop-color="#1F8CFF" stop-opacity="0"/><stop offset=".5" stop-color="#1F8CFF" stop-opacity=".35"/><stop offset="1" stop-color="#1F8CFF" stop-opacity="0"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#17243B" flood-opacity=".16"/></filter>
  </defs>
  <rect x="80" y="72" width="864" height="864" rx="194" fill="url(#surface)" filter="url(#shadow)"/>
  <rect x="81" y="73" width="862" height="862" rx="193" fill="none" stroke="#FFFFFF" stroke-width="2"/>
  <path d="M245 770H779" fill="none" stroke="url(#accent)" stroke-width="4" stroke-linecap="round"/>
  <image href="data:image/png;base64,${logo.toString('base64')}" x="198" y="${504 - logoHeight / 2}" width="${logoWidth}" height="${logoHeight}" preserveAspectRatio="xMidYMid meet"/>
</svg>\n`);
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1024, height: 1024}, deviceScaleFactor: 1});
  await page.setContent(`<style>html,body{margin:0;background:transparent;overflow:hidden}</style>${await readFile(path.join(assets, 'loq-desktop.svg'), 'utf8')}`);
  await page.locator('svg image').evaluate(async image => { const preload = new Image(); preload.src = image.getAttribute('href'); await preload.decode(); });
  await page.screenshot({path: path.join(assets, 'loq-desktop.png'), omitBackground: true});
} finally { await browser.close(); }
const iconset = path.join(assets, 'loq-desktop.iconset');
await mkdir(iconset, {recursive: true});
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) await run('/usr/bin/sips', ['-z', String(size * scale), String(size * scale), path.join(assets, 'loq-desktop.png'), '--out', path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)]);
}
await run('/usr/bin/iconutil', ['-c', 'icns', '-o', path.join(assets, 'loq-desktop.icns'), iconset]);
await rm(iconset, {recursive: true, force: true});
console.log('LOQ native icon generated from the existing LOQ brand asset.');
