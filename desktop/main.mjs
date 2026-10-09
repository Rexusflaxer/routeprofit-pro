import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, session } from 'electron';
import { readFile, writeFile, rename, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_ID, APP_URL, API_URL, MAX_FILE_BYTES, sha256, newAttempt, validateCallback, scopeKey, validateAction, validatePrint } from './security.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
let mainWindow, authSession = null, pendingAttempt = null, processingCallback = false;
let queuedCallback = process.argv.find(value => value.startsWith('loq-desktop:'));
const devUrl = !app.isPackaged && process.env.LOQ_DESKTOP_DEV_URL === 'http://127.0.0.1:5199' ? process.env.LOQ_DESKTOP_DEV_URL : null;
const rendererUrl = devUrl ? new URL(devUrl).href : pathToFileURL(path.join(dir, 'dist', 'index.html')).href;
app.setName('LOQ Desktop');
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_event, argv) => { const url = argv.find(value => value.startsWith('loq-desktop:')); if (url) receiveCallback(url); mainWindow?.show(); mainWindow?.focus(); });
app.on('open-url', (event, url) => { event.preventDefault(); receiveCallback(url); });

const vaultPath = name => path.join(app.getPath('userData'), 'vault', `${name}.bin`);
async function writeVault(name, value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS Sleutelhanger is niet beschikbaar. Ontgrendel uw Mac en probeer opnieuw.');
  const filename = vaultPath(name);
  await mkdir(path.dirname(filename), {recursive: true, mode: 0o700});
  const encrypted = safeStorage.encryptString(JSON.stringify(value));
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, encrypted, {mode: 0o600});
  await rename(temporary, filename);
}
async function readVault(name) {
  try {
    const contents = await readFile(vaultPath(name));
    if (!safeStorage.isEncryptionAvailable()) throw new Error('macOS Sleutelhanger is niet beschikbaar.');
    return JSON.parse(safeStorage.decryptString(contents));
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const removeVault = name => rm(vaultPath(name), {force: true});
const publicUser = user => user ? {id: user.id, full_name: user.full_name || user.name || '', email: user.email || '', role: user.role} : null;
const broadcastSession = error => mainWindow?.webContents.send('loq:session-changed', {user: publicUser(authSession?.user), error: error || null});

async function requestApi(resource, payload, token = authSession?.token) {
  const response = await fetch(`${API_URL}/api/apps/${APP_ID}/${resource}`, {method: payload ? 'POST' : 'GET', headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})}, ...(payload ? {body: JSON.stringify(payload)} : {}), signal: AbortSignal.timeout(60_000), redirect: 'error'});
  const value = await response.json().catch(() => null);
  if (!response.ok || value?.error) {
    const error = new Error(typeof value?.error === 'string' ? value.error : `LOQ reageert niet zoals verwacht (${response.status}).`);
    error.status = response.status; error.details = value?.details || null;
    if (response.status === 401 && token && token === authSession?.token) { authSession = null; await removeVault('session'); broadcastSession('Uw sessie is verlopen. Meld u opnieuw aan; uw herstelkopie blijft bewaard.'); }
    throw error;
  }
  return value;
}
async function currentSession() {
  if (!authSession) authSession = await readVault('session');
  if (!authSession?.token) return {user: null};
  const user = await requestApi('entities/User/me');
  if (!user?.id || user.role !== 'admin') { authSession = null; await removeVault('session'); throw new Error('Voor LOQ Desktop is een beheerdersaccount nodig.'); }
  authSession.user = publicUser(user);
  return {user: authSession.user};
}
async function login() {
  pendingAttempt = newAttempt();
  await writeVault('pending-login', pendingAttempt);
  const target = new URL('/DesktopSignIn', APP_URL);
  target.searchParams.set('state', pendingAttempt.state);
  target.searchParams.set('challenge', sha256(pendingAttempt.verifier));
  await shell.openExternal(target.href);
  return {pending: true};
}
async function receiveCallback(value) {
  if (!app.isReady() || !mainWindow) { queuedCallback = value; return; }
  if (processingCallback) return;
  processingCallback = true;
  try {
    pendingAttempt ||= await readVault('pending-login');
    const proof = validateCallback(value, pendingAttempt);
    const result = await requestApi('functions/desktopAuth', {action: 'exchange', ...proof}, null);
    if (!result?.access_token || result.user?.role !== 'admin') throw new Error('LOQ gaf geen geldige beheerderssessie terug.');
    const user = await requestApi('entities/User/me', null, result.access_token);
    if (user.id !== result.user.id || user.role !== 'admin') throw new Error('Uw LOQ-account kon niet worden gecontroleerd.');
    authSession = {token: result.access_token, user: publicUser(user)};
    await writeVault('session', authSession); await removeVault('pending-login'); pendingAttempt = null;
    broadcastSession(); mainWindow.show(); mainWindow.focus();
  } catch (error) { broadcastSession(error.message); }
  finally { processingCallback = false; }
}
function trustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || event.senderFrame.url !== rendererUrl) throw new Error('Onbetrouwbaar venster.');
}
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    try { trustedSender(event); return {ok: true, value: await fn(...args)}; }
    catch (error) { return {ok: false, error: error.message || 'Deze handeling is niet gelukt.', status: error.status || 0, details: error.details || null}; }
  });
}
function requireUser() { if (!authSession?.user?.id) throw new Error('Meld u eerst aan bij LOQ.'); return authSession.user; }

handle('loq:session', currentSession);
handle('loq:login', login);
handle('loq:logout', async () => { authSession = null; pendingAttempt = null; await removeVault('session'); await removeVault('pending-login'); broadcastSession(); return true; });
handle('loq:invoke', async (action, payload) => { requireUser(); validateAction(action, payload); return requestApi('functions/customerPlatformApi', {...payload, action}); });
handle('loq:recovery-read', scope => readVault(`recovery-${scopeKey(requireUser().id, scope)}`));
handle('loq:recovery-archive', async scope => {
  const key = `recovery-${scopeKey(requireUser().id, scope)}`;
  const previous = await readVault(key);
  if (!previous?.document) return true;
  const conflicts = previous.conflicts || [];
  const id = sha256(JSON.stringify([previous.serverVersion, previous.document]));
  if (!conflicts.some(item => item.id === id)) conflicts.push({id, document: previous.document, serverVersion: previous.serverVersion, savedAt: previous.savedAt});
  if (conflicts.length > 10) throw new Error('Er zijn tien conflictkopieën bewaard. Exporteer en verwerk deze voordat u verder werkt.');
  await writeVault(key, {...previous, dirty: false, conflicts}); return true;
});
handle('loq:recovery-write', async (scope, data) => {
  if (!data?.document || JSON.stringify(data).length > 20 * 1024 * 1024) throw new Error('Ongeldige herstelkopie.');
  const key = `recovery-${scopeKey(requireUser().id, scope)}`;
  const previous = await readVault(key);
  const conflicts = previous?.conflicts || [];
  if (previous?.dirty && previous.serverVersion !== data.serverVersion && JSON.stringify(previous.document) !== JSON.stringify(data.document)) {
    const id = sha256(JSON.stringify([previous.serverVersion, previous.document]));
    if (!conflicts.some(item => item.id === id)) conflicts.push({id, document: previous.document, serverVersion: previous.serverVersion, savedAt: previous.savedAt});
  }
  if (conflicts.length > 10) throw new Error('Er zijn tien conflictkopieën bewaard. Exporteer en verwerk deze voordat u verder werkt.');
  await writeVault(key, {...data, conflicts}); return true;
});
handle('loq:recovery-remove', scope => removeVault(`recovery-${scopeKey(requireUser().id, scope)}`));
handle('loq:export-draft', async (scope, document) => {
  scopeKey(requireUser().id, scope);
  const contents = JSON.stringify({format: 'loq-floor-plan-backup', version: 1, scope, createdAt: new Date().toISOString(), document}, null, 2);
  if (!document || contents.length > 20 * 1024 * 1024) throw new Error('Deze herstelkopie is te groot.');
  const choice = await dialog.showSaveDialog(mainWindow, {title: 'Bewerkbare LOQ-kopie bewaren', defaultPath: 'LOQ-plattegrond.loqplan.json', filters: [{name: 'LOQ-tekening', extensions: ['json']}]});
  if (choice.canceled || !choice.filePath) return {saved: false};
  await writeFile(choice.filePath, contents, {mode: 0o600}); return {saved: true};
});
handle('loq:open-draft', async scope => {
  scopeKey(requireUser().id, scope);
  const choice = await dialog.showOpenDialog(mainWindow, {title: 'Bewerkbare LOQ-kopie terugzetten', properties: ['openFile'], filters: [{name: 'LOQ-tekening', extensions: ['json']}]});
  if (choice.canceled) return null;
  if ((await stat(choice.filePaths[0])).size > 20 * 1024 * 1024) throw new Error('Deze herstelkopie is te groot.');
  const value = JSON.parse(await readFile(choice.filePaths[0], 'utf8'));
  if (value?.format !== 'loq-floor-plan-backup' || value.version !== 1 || scopeKey(requireUser().id, value.scope) !== scopeKey(requireUser().id, scope) || !value.document) throw new Error('Deze herstelkopie hoort niet bij het geselecteerde gebouw.');
  return {document: value.document};
});
handle('loq:open-file', async () => {
  requireUser();
  const choice = await dialog.showOpenDialog(mainWindow, {title: 'Kies een plattegrond', properties: ['openFile'], filters: [{name: 'Plattegronden', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'heic', 'heif']}]});
  if (choice.canceled) return null;
  const original = choice.filePaths[0];
  if ((await stat(original)).size > MAX_FILE_BYTES) throw new Error('Kies een bestand van maximaal 12 MB.');
  const extension = path.extname(original).slice(1).toLowerCase();
  const types = {pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', heic: 'image/heic', heif: 'image/heif'};
  if (!types[extension]) throw new Error('Dit bestandsformaat wordt niet ondersteund.');
  let bytes, mimeType = types[extension], name = path.basename(original);
  if (['heic', 'heif'].includes(extension)) {
    const temporary = path.join(app.getPath('temp'), `loq-import-${crypto.randomUUID()}.png`);
    try {
      await execFileAsync('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '2600', original, '--out', temporary], {timeout: 30_000, maxBuffer: 64 * 1024});
      bytes = await readFile(temporary); mimeType = 'image/png'; name = `${path.parse(name).name}.png`;
    } finally { await rm(temporary, {force: true}); }
  } else bytes = await readFile(original);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('De afbeelding is na omzetting groter dan 12 MB. Verklein de afbeelding eerst.');
  return {name, mimeType, contentBase64: bytes.toString('base64')};
});
async function renderPdf(options) {
  const {html, paper, landscape} = validatePrint(options);
  const printSession = session.fromPartition(`loq-print-${crypto.randomUUID()}`);
  printSession.webRequest.onBeforeRequest((details, callback) => callback({cancel: !details.url.startsWith('data:')}));
  const printWindow = new BrowserWindow({show: false, webPreferences: {session: printSession, javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true}});
  printWindow.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  try {
    await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    return await printWindow.webContents.printToPDF({pageSize: paper, landscape, printBackground: true, preferCSSPageSize: true, margins: {top: 0, bottom: 0, left: 0, right: 0}});
  } finally { printWindow.destroy(); }
}
handle('loq:render-pdf', async options => {
  requireUser(); const bytes = await renderPdf(options);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('De publicatie-PDF is groter dan 12 MB. Gebruik kleinere onderleggers of minder ophanglocaties.');
  return {mime_type: 'application/pdf', content_base64: bytes.toString('base64')};
});
handle('loq:export-pdf', async options => {
  requireUser(); validatePrint(options);
  const target = await dialog.showSaveDialog(mainWindow, {title: 'Plattegrond als PDF bewaren', defaultPath: 'LOQ-plattegrond.pdf', filters: [{name: 'PDF', extensions: ['pdf']}]});
  if (target.canceled || !target.filePath) return {saved: false, canceled: true};
  await writeFile(target.filePath, await renderPdf(options)); return {saved: true, canceled: false};
});

async function createWindow() {
  mainWindow = new BrowserWindow({width: 1440, height: 940, minWidth: 1080, minHeight: 760, title: 'LOQ Desktop', backgroundColor: '#f3f6f8', titleBarStyle: 'hiddenInset', trafficLightPosition: {x: 18, y: 20}, webPreferences: {preload: path.join(dir, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false}});
  mainWindow.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (url !== rendererUrl) event.preventDefault(); });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  await mainWindow.loadURL(rendererUrl);
  if (queuedCallback) { const callback = queuedCallback; queuedCallback = null; await receiveCallback(callback); }
}
app.whenReady().then(async () => {
  if (process.defaultApp) app.setAsDefaultProtocolClient('loq-desktop', process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient('loq-desktop');
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
