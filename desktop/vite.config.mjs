import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
const desktop = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig(({command}) => {
  const nonce = command === 'serve' ? randomBytes(24).toString('base64') : undefined;
  return {root: desktop, base: './', html: nonce ? {cspNonce: nonce} : {}, plugins: [react(), ...(nonce ? [{name: 'desktop-dev-csp', transformIndexHtml: {order: 'pre', handler: html => html.replace("script-src 'self' 'wasm-unsafe-eval'", `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'`)}}] : [])], resolve: {alias: {'@': path.resolve(desktop, '../src')}}, worker: {format: 'es'}, server: {host: '127.0.0.1', port: 5199, strictPort: true, fs: {allow: [path.resolve(desktop, '..')]}}, build: {outDir: 'dist', emptyOutDir: true, target: 'chrome142'}};
});
