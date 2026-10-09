import React, { useEffect, useRef, useState } from 'react';
import { Building2, Search, ChevronRight, ArrowLeft, Cloud, LogOut, LayoutGrid, RefreshCw, ExternalLink, Check, Layers3, Loader2, MoreHorizontal, Download, Upload, History, X, AlertCircle } from 'lucide-react';
import { LOQBrand } from '../../src/components/brand/LOQBrand';
import { Button } from '../../src/components/ui/button';
import { Input } from '../../src/components/ui/input';
import PageHeader from '../../src/components/ui-custom/PageHeader';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator } from '../../src/components/ui/dropdown-menu';
import { AppearanceMenu, AppearanceOptions } from './Appearance';
import FloorPlanEditor from '../../src/features/floorplans/FloorPlanEditor';
import FloorPlanImportDialog from '../../src/features/floorplans/FloorPlanImportDialog';
import { openRaster, canvasToBlob, encodeBase64 } from '../../src/features/floorplans/importSource';
import { parseFloorPlanDocument } from '../../src/features/floorplans/documentGuards';
import { createDocument } from '../../src/features/floorplans/model';
import { generatePrintHtml, generateDocumentPrintHtml } from '../../src/features/floorplans/FloorPlanPrint';
import { DraftController } from './draftController';
import './desktop.css';

const bridge = window.loqDesktop;
const mutation = () => crypto.randomUUID();
const statusText = {saved: 'Opgeslagen in LOQ', unsaved: 'Wijzigingen bewaren…', saving: 'Opslaan…', offline: 'Verbinding onderbroken · herstelkopie bewaard', conflict: 'Versieconflict · lokale tekening bewaard', expired: 'Opnieuw aanmelden', error: 'Opslaan vraagt aandacht'};
async function printableBackgrounds(urls) {
  const entries = await Promise.all(Object.entries(urls).map(async ([id, url]) => {
    if (url.startsWith('data:image/')) return [id, url];
    if (!url.startsWith('blob:')) throw new Error('De onderlegger is niet lokaal beschikbaar voor afdrukken.');
    const blob = await (await fetch(url)).blob();
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('De onderlegger kon niet worden afgedrukt.')); reader.readAsDataURL(blob); });
    return [id, data];
  }));
  return Object.fromEntries(entries);
}
const sameDocument = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function App() {
  const [user, setUser] = useState(null), [initializing, setInitializing] = useState(true), [error, setError] = useState(''), [loggingIn, setLoggingIn] = useState(false);
  const [objectsLoading, setObjectsLoading] = useState(true), [objectsError, setObjectsError] = useState(''), [objectsRetry, setObjectsRetry] = useState(0);
  const [search, setSearch] = useState(''), [objects, setObjects] = useState([]), [hasMore, setHasMore] = useState(false), [page, setPage] = useState(1);
  const [selectedObject, setSelectedObject] = useState(null), [configuration, setConfiguration] = useState(null), [scope, setScope] = useState(null);
  const [document, setDocument] = useState(null), [workspace, setWorkspace] = useState(null), [installations, setInstallations] = useState([]), [backgroundUrls, setBackgroundUrls] = useState({});
  const [saveState, setSaveState] = useState({status: 'saved'}), [busy, setBusy] = useState(false), [recovery, setRecovery] = useState(null), [recoveryHistory, setRecoveryHistory] = useState([]), [importFloorId, setImportFloorId] = useState(null), [notice, setNotice] = useState('');
  const controller = useRef(null), loadGeneration = useRef(0), ownedUrls = useRef(new Set());
  function clearImages() { loadGeneration.current++; ownedUrls.current.forEach(url => URL.revokeObjectURL(url)); ownedUrls.current.clear(); setBackgroundUrls({}); }
  const report = error => setError(error?.message || 'Deze handeling is niet gelukt.');
  useEffect(() => {
    if (!bridge) { setError('Open LOQ Desktop via de geïnstalleerde Mac-app.'); setInitializing(false); return; }
    bridge.session.get().then(result => setUser(result.user)).catch(report).finally(() => setInitializing(false));
    return bridge.session.onChanged(result => { setUser(result.user); setLoggingIn(false); setError(result.error || ''); if (!result.user) { clearImages(); controller.current?.dispose(); controller.current = null; setScope(null); setDocument(null); } });
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true; setObjectsLoading(true); setObjectsError('');
    const timer = setTimeout(() => bridge.invoke('search_customer_objects', {search, page, page_size: 50}).then(result => { if (active) { setObjects(result.items || []); setHasMore(result.has_more); } }).catch(error => { if (active) { setObjectsError(error?.message || 'De objecten konden niet worden opgehaald.'); setObjects([]); setHasMore(false); } }).finally(() => { if (active) setObjectsLoading(false); }), 250);
    return () => { active = false; clearTimeout(timer); };
  }, [user, search, page, objectsRetry]);
  useEffect(() => () => { controller.current?.dispose(); ownedUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);

  async function login() { setError(''); setLoggingIn(true); try { await bridge.session.login(); } catch (error) { report(error); setLoggingIn(false); } }
  async function chooseObject(object) {
    setBusy(true); setError('');
    try {
      if (controller.current && !controller.current.stopped) await controller.current.flush();
      const result = await bridge.invoke('get_object_map_configuration', {customer_id: object.customer_id, object_id: object.id});
      controller.current?.dispose(); controller.current = null;
      clearImages(); setRecoveryHistory([]); setSelectedObject(object); setConfiguration(result.configuration); setScope(null); setDocument(null); setRecovery(null); setNotice('');
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  function installController(nextScope, nextWorkspace, nextDocument, recovered = null, mapVersion = configuration.version) {
    controller.current?.dispose();
    controller.current = new DraftController({bridge, scope: nextScope, mapVersion, workspace: nextWorkspace, document: nextDocument, recovery: recovered, onState: setSaveState, onSaved: setWorkspace});
    setDocument(nextDocument); setWorkspace(nextWorkspace); setSaveState({status: 'saved'});
  }
  async function loadBackgrounds(nextScope, nextDocument) {
    clearImages(); const generation = loadGeneration.current;
    const ids = [...new Set(nextDocument.floors.flatMap(floor => [floor.background?.fileId, floor.print.logoFileId]).filter(Boolean))];
    for (const fileId of ids) {
      try {
        const asset = await bridge.invoke('read_object_building_floor_plan_asset', {...nextScope, file_id: fileId});
        if (generation !== loadGeneration.current) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type)) throw new Error('Onbekend afbeeldingsformaat.');
        setBackgroundUrls(previous => ({...previous, [fileId]: `data:${asset.mime_type};base64,${asset.content_base64}`}));
      } catch (error) { if (generation === loadGeneration.current) setError(`De onderlegger kon niet worden geopend: ${error.message}`); }
    }
  }
  async function chooseBuilding(key) {
    if (!(configuration?.building_floor_plan_selection_keys || []).includes(key)) return;
    setBusy(true); setError(''); setRecovery(null); setNotice(''); setInstallations([]);
    const nextScope = {customer_id: selectedObject.customer_id, object_id: selectedObject.id, building_selection_key: key};
    try {
      if (controller.current && !controller.current.stopped) await controller.current.flush();
      const mapResult = await bridge.invoke('get_object_map_configuration', {customer_id: nextScope.customer_id, object_id: nextScope.object_id});
      const freshConfiguration = mapResult.configuration; setConfiguration(freshConfiguration);
      if (!(freshConfiguration.building_floor_plan_selection_keys || []).includes(key)) { controller.current?.dispose(); controller.current = null; throw new Error('Deze gebouwselectie is gewijzigd. Kies opnieuw een opgeslagen gebouw. Uw herstelkopie blijft op deze Mac bewaard.'); }
      const result = await bridge.invoke('get_object_building_floor_plan_workspace', nextScope);
      const nextDocument = result.workspace ? parseFloorPlanDocument(result.workspace.document) : createDocument(`${selectedObject.name} · ${buildingLabel(key)}`);
      if (!nextDocument) throw new Error('Deze documentversie kan nog niet worden geopend. Werk LOQ Desktop bij.');
      const local = await bridge.recovery.read(nextScope);
      setRecoveryHistory(local?.conflicts || []);
      const resume = local?.document && (local.pendingPublication || local.pending) && parseFloorPlanDocument(local.document);
      const openedDocument = resume ? local.document : nextDocument;
      setScope(nextScope); installController(nextScope, result.workspace, openedDocument, resume ? local : null, result.configuration_version ?? freshConfiguration.version);
      await loadBackgrounds(nextScope, openedDocument);
      if (resume) { await controller.current.flush(); setNotice('De onderbroken opslag is hersteld.'); }
      const installResult = await bridge.invoke('list_object_installations', {customer_id: selectedObject.customer_id, object_id: selectedObject.id});
      setInstallations((installResult.items || []).map(item => ({id: item.id, name: item.name || item.installation_name || item.installation_type})));
      if (!resume && local?.document && !sameDocument(local.document, nextDocument)) setRecovery(local);
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  function buildingLabel(key) {
    const labels = configuration?.building_labels;
    if (labels && !Array.isArray(labels) && typeof labels[key] === 'string') return labels[key];
    const entry = Array.isArray(labels) ? labels.find(item => item.selection_key === key || item.building_key === key || item.key === key) : null;
    return entry?.label || entry?.name || `Gebouw ${(configuration?.building_floor_plan_selection_keys || []).indexOf(key) + 1}`;
  }
  function changeDocument(next) { setDocument(next); controller.current?.update(next); }
  async function save() { setError(''); try { if (!controller.current?.version) controller.current?.update(document); await controller.current?.flush(); } catch (error) { report(error); } }
  async function printImages(value) {
    const urls = {...backgroundUrls};
    const ids = [...new Set(value.floors.flatMap(floor => [floor.print.logoFileId, floor.print.profile === 'installation' ? floor.background?.fileId : null]).filter(Boolean))];
    for (const fileId of ids) if (!urls[fileId]) {
      const asset = await bridge.invoke('read_object_building_floor_plan_asset', {...scope, file_id: fileId});
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type)) throw new Error('Een afdrukafbeelding heeft een onbekend formaat.');
      urls[fileId] = `data:${asset.mime_type};base64,${asset.content_base64}`;
    }
    return printableBackgrounds(Object.fromEntries(ids.map(id => [id, urls[id]])));
  }
  async function publish() {
    setBusy(true); setError('');
    try {
      if (controller.current.pendingPublication) await controller.current.publish();
      else {
        if (!controller.current.version) controller.current.update(document);
        await controller.current.flush();
        const printable = await printImages(document);
        const floor = document.floors[0];
        const pdf = await bridge.renderPdf({html: generateDocumentPrintHtml(document, {backgroundUrls: printable, revision: String((workspace?.published_revision || 0) + 1)}), paper: floor.print.paper, landscape: floor.print.orientation === 'landscape'});
        const asset = await bridge.invoke('upload_object_building_floor_plan_asset', {...scope, expected_map_version: configuration.version, expected_version: controller.current.version, idempotency_key: mutation(), data: {...pdf, filename: 'LOQ-plattegronden.pdf', kind: 'pdf'}});
        await controller.current.publish(undefined, {pdf_file_id: asset.file_id});
      }
      setNotice('De plattegrond is gepubliceerd in het objectdossier van LOQ.');
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  async function exportPdf(value, floorId) {
    setError('');
    try {
      const floor = value.floors.find(item => item.id === floorId);
      const printable = await printImages(value);
      const result = await bridge.exportPdf({html: generatePrintHtml(value, floorId, {backgroundUrls: printable, revision: String(workspace?.published_revision || 'concept')}), paper: floor.print.paper, landscape: floor.print.orientation === 'landscape'});
      if (result.saved) setNotice('De PDF is bewaard op uw Mac.');
    } catch (error) { report(error); }
  }
  async function importLogo(floorId) {
    setBusy(true); setError(''); let image;
    try {
      const file = await bridge.openFile(); if (!file) return;
      if (!file.mimeType.startsWith('image/')) throw new Error('Kies een PNG-, JPEG- of HEIC-afbeelding voor het logo.');
      image = await openRaster(file); const blob = await canvasToBlob(image.canvas);
      const content = encodeBase64(new Uint8Array(await blob.arrayBuffer()));
      const asset = await bridge.invoke('upload_object_building_floor_plan_asset', {...scope, expected_map_version: configuration.version, expected_version: 0, idempotency_key: mutation(), data: {filename: 'logo.png', mime_type: 'image/png', content_base64: content, kind: 'logo'}});
      const next = structuredClone(document); const floor = next.floors.find(item => item.id === floorId);
      if (!floor || !asset.file_id) throw new Error('Het logo kon niet aan de verdieping worden gekoppeld.');
      floor.print.logoFileId = asset.file_id; setBackgroundUrls(previous => ({...previous, [asset.file_id]: `data:image/png;base64,${content}`})); changeDocument(next);
    } catch (error) { report(error); } finally { if (image) URL.revokeObjectURL(image.url); setBusy(false); }
  }
  async function exportEditable(value) { try { const result = await bridge.exportDraft(scope, value); if (result.saved) setNotice('De volledige bewerkbare tekening is bewaard.'); } catch (error) { report(error); } }
  async function importEditable() {
    setError(''); setBusy(true);
    try {
      const imported = await bridge.openDraft(scope); if (!imported) return;
      const validated = parseFloorPlanDocument(imported.document);
      if (!validated) throw new Error('Deze bewerkbare kopie heeft een ongeldige of niet-ondersteunde documentindeling.');
      await controller.current.flush(); await bridge.recovery.archive(scope);
      setDocument(validated); controller.current.update(validated);
      await controller.current.flush(); await loadBackgrounds(scope, validated);
      setNotice('De bewerkbare kopie is gecontroleerd en teruggezet in LOQ.');
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  async function restoreLocal() {
    if (!recovery || recovery.serverVersion !== (workspace?.version || 0)) return;
    installController(scope, workspace, recovery.document, recovery);
    await loadBackgrounds(scope, recovery.document);
    controller.current.update(recovery.document); setRecovery(null); setNotice('Uw herstelkopie is teruggezet en wordt opgeslagen.');
  }
  async function useOnlineVersion() { try { await bridge.recovery.archive(scope); await controller.current.persist(); const local = await bridge.recovery.read(scope); setRecoveryHistory(local?.conflicts || []); setRecovery(null); } catch (error) { report(error); } }
  async function logout() { try { if (recovery && scope) await bridge.recovery.archive(scope); if (controller.current) { await controller.current.persist(); try { await controller.current.flush(); } catch { /* Durable recovery remains partitioned under this account. */ } } await bridge.session.logout(); setSelectedObject(null); setConfiguration(null); } catch (error) { report(error); } }

  async function backToObjects() {
    setBusy(true); setError('');
    try {
      if (recovery && scope) await bridge.recovery.archive(scope);
      if (controller.current) { await controller.current.persist(); if (!controller.current.stopped) await controller.current.flush(); }
      controller.current?.dispose(); controller.current = null;
      clearImages(); setDocument(null); setScope(null); setSelectedObject(null); setConfiguration(null); setRecovery(null); setRecoveryHistory([]); setNotice(''); setSaveState({status: 'saved'});
    } catch (error) { report(error); } finally { setBusy(false); }
  }
  const dismissError = <button aria-label="Melding sluiten" onClick={() => setError('')}><X size={15}/></button>;
  if (initializing) return <main className="desktop-loading"><LOQBrand className="h-8 w-auto"/><Loader2 className="animate-spin" size={18}/><p>Uw werkruimte openen…</p></main>;
  if (!user) return <main className="desktop-welcome">
    <div className="desktop-titlebar"><span>LOQ Desktop</span><AppearanceMenu/></div>
    <div className="welcome-panel"><div className="welcome-brand"><LOQBrand className="h-7 w-auto"/><span/>Desktop</div>
      <section className="welcome-card" aria-labelledby="welcome-title"><span className="desktop-feature-icon"><Layers3 size={19}/></span><h1 id="welcome-title">Aanmelden bij LOQ Desktop</h1><p>Maak plattegronden en veiligheidsplannen voor uw gebouwen. Werk verder met dezelfde objecten en hetzelfde account als in LOQ.</p>
        <Button size="lg" className="w-full" onClick={login} disabled={!bridge || loggingIn} aria-busy={loggingIn}>{loggingIn ? <><Loader2 className="animate-spin"/>Aanmelding afwachten…</> : <>Inloggen met mijn LOQ-account<ExternalLink/></>}</Button>
        <p className="welcome-hint">{loggingIn ? 'Rond uw aanmelding af in de browser. Daarna keert u automatisch terug naar deze app.' : 'De vertrouwde LOQ-aanmelding opent in uw browser.'}</p>
        {loggingIn && <Button variant="outline" className="w-full" onClick={login}>Aanmelding opnieuw openen</Button>}
        {error && <div className="desktop-error" role="alert"><AlertCircle size={16}/><span>{error}</span></div>}
      </section><p className="welcome-footer"><Cloud size={14}/>Uw tekeningen veilig opgeslagen in LOQ</p>
    </div>
  </main>;
  const keys = [...new Set(configuration?.building_floor_plan_selection_keys || [])].filter(key => typeof key === 'string' && (configuration.building_floor_plan_selection_keys.filter(value => value === key).length === 1));
  const readOnly = busy || Boolean(recovery) || saveState.status === 'conflict' || (scope && !keys.includes(scope.building_selection_key));
  return <main className="desktop-app">
    <aside className="desktop-rail" aria-label="Hoofdnavigatie"><div className="rail-brand"><LOQBrand className="w-10"/></div><nav>
      <button className={!document ? 'active' : ''} aria-current={!document ? 'page' : undefined} aria-label="Objecten" title="Objecten" onClick={backToObjects} disabled={busy}><LayoutGrid size={19}/><span>Objecten</span></button>
      {document && <button className="active" aria-current="page" aria-label="Plattegronden" title="Plattegronden"><Layers3 size={19}/><span>Tekenen</span></button>}
    </nav><div className="rail-profile"><DropdownMenu><DropdownMenuTrigger asChild><button className="user-avatar" aria-label="Account en weergave" title={user.full_name || user.email}>{(user.full_name || user.email || 'L').slice(0,1).toUpperCase()}</button></DropdownMenuTrigger><DropdownMenuContent side="right" align="end" sideOffset={12} className="w-64"><DropdownMenuLabel className="profile-label"><span>{user.full_name || 'LOQ-account'}</span><small>{user.email}</small></DropdownMenuLabel><DropdownMenuSeparator/><AppearanceOptions/><DropdownMenuSeparator/><DropdownMenuItem onSelect={logout}><LogOut/>Uitloggen</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></aside>
    <div className="desktop-content"><header className="desktop-header"><nav aria-label="Kruimelpad" className="desktop-breadcrumb"><button onClick={backToObjects} disabled={busy}>Objecten</button>{selectedObject && <><ChevronRight size={13}/><button onClick={() => chooseObject(selectedObject)} disabled={busy}>{selectedObject.name}</button></>}{document && <><ChevronRight size={13}/><span aria-current="page">{buildingLabel(scope.building_selection_key)}</span></>}</nav>
      <div className="header-right">{!document && <span className="connection-status" role="status"><Cloud size={14}/>Verbonden met LOQ</span>}{document && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Meer documentacties"><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Tekening</DropdownMenuLabel><DropdownMenuItem onSelect={() => exportEditable(document)}><Download/>Bewerkbare kopie bewaren</DropdownMenuItem><DropdownMenuItem onSelect={importEditable} disabled={readOnly}><Upload/>Bewerkbare kopie terugzetten</DropdownMenuItem>{recoveryHistory.length > 0 && <><DropdownMenuSeparator/><DropdownMenuLabel>Herstelgeschiedenis</DropdownMenuLabel>{recoveryHistory.map((item, index) => <DropdownMenuItem key={item.id} onSelect={() => setRecovery(item)}><History/>Kopie {index + 1} · {new Date(item.savedAt).toLocaleString('nl-NL')}</DropdownMenuItem>)}</>}</DropdownMenuContent></DropdownMenu>}{!document && <AppearanceMenu/>}</div>
    </header>
    {error && <div className="desktop-error" role="alert"><AlertCircle size={16}/><span>{error}</span>{dismissError}</div>}{notice && <div className="desktop-notice" role="status"><Check size={16}/><span>{notice}</span><button aria-label="Bevestiging sluiten" onClick={() => setNotice('')}><X size={15}/></button></div>}
    {recovery && <div className="desktop-recovery" role="status"><div><strong>Er staat een lokale herstelkopie op deze Mac.</strong><p>{recovery.serverVersion === (workspace?.version || 0) ? 'U kunt uw laatste wijzigingen veilig terugzetten.' : 'De online versie is intussen veranderd. Bewaar uw lokale versie om de tekeningen te vergelijken.'}</p></div><div className="recovery-actions">{recovery.serverVersion === (workspace?.version || 0) && <Button variant="outline" onClick={restoreLocal}>Herstel mijn wijzigingen</Button>}<Button variant="outline" onClick={() => exportPdf(recovery.document, recovery.document.floors[0].id)}>PDF vergelijken</Button><Button variant="outline" onClick={() => exportEditable(recovery.document)}>Bewerkbare kopie bewaren</Button><Button variant="outline" onClick={useOnlineVersion}>Online versie gebruiken</Button></div></div>}
    {document && saveState.status === 'conflict' && <div className="desktop-recovery" role="alert"><div><strong>Deze tekening is ook op een andere Mac gewijzigd.</strong><p>Uw versie is veilig bewaard. Exporteer deze ter vergelijking en open daarna de online versie.</p></div><div className="recovery-actions"><Button variant="outline" onClick={() => exportPdf(document, document.floors[0].id)}>PDF van mijn versie</Button><Button variant="outline" onClick={() => exportEditable(document)}>Bewerkbare kopie bewaren</Button><Button variant="outline" onClick={() => chooseBuilding(scope.building_selection_key)}>Open online versie</Button></div></div>}
    {document && ['offline','expired','error'].includes(saveState.status) && <div className="desktop-recovery" role="status"><span>{statusText[saveState.status]}. Uw herstelkopie blijft op deze Mac bewaard.</span><Button variant="outline" onClick={save}><RefreshCw/>Opnieuw opslaan</Button></div>}
    {document ? <><FloorPlanEditor document={document} onChange={changeDocument} onSave={save} onPublish={publish} onImport={setImportFloorId} onImportLogo={importLogo} onExport={exportPdf} saveStatus={statusText[saveState.status]} readOnly={Boolean(readOnly)} installations={installations} backgroundUrls={backgroundUrls}/><FloorPlanImportDialog open={Boolean(importFloorId)} onClose={() => setImportFloorId(null)} pickFile={() => bridge.openFile()} uploadAsset={data => bridge.invoke('upload_object_building_floor_plan_asset', {...scope, expected_map_version: configuration.version, expected_version: 0, idempotency_key: mutation(), data})} onApply={result => { const next = structuredClone(document); const floor = next.floors.find(item => item.id === importFloorId); if (!floor) return; floor.background = result.background; floor.walls.push(...result.walls); ownedUrls.current.add(result.backgroundUrl); setBackgroundUrls(previous => ({...previous, [result.background.fileId]: result.backgroundUrl})); changeDocument(next); setImportFloorId(null); }}/></> : <section className="desktop-page" aria-busy={busy}>
      <PageHeader title={selectedObject ? selectedObject.name : 'Objecten'} subtitle={selectedObject ? selectedObject.address || 'Kies een opgeslagen gebouw om de plattegronden te openen.' : 'Open een object en kies het gebouw waarvoor u een plattegrond wilt maken.'} actions={selectedObject ? <><Button variant="ghost" onClick={backToObjects} disabled={busy}><ArrowLeft/>Alle objecten</Button><Button variant="outline" onClick={() => chooseObject(selectedObject)} disabled={busy}><RefreshCw className={busy ? 'animate-spin' : ''}/>Vernieuwen</Button></> : undefined}/>
      {selectedObject ? <><div className="section-heading"><div><h2>Gebouwen</h2><p>De opgeslagen gebouwen uit de objectpagina van LOQ.</p></div><span className="count-badge">{keys.length} {keys.length === 1 ? 'gebouw' : 'gebouwen'}</span></div>
        {keys.length ? <div className="building-grid">{keys.map(key => <button className="building-card" key={key} onClick={() => chooseBuilding(key)} disabled={busy}><span className="desktop-feature-icon"><Building2 size={21}/></span><span className="building-card-copy"><strong>{buildingLabel(key)}</strong><span>Plattegronden en veiligheidsplannen</span></span><ChevronRight size={16}/></button>)}</div> : <div className="desktop-empty"><Building2 size={28}/><h3>Nog geen opgeslagen gebouwen</h3><p>Selecteer en sla de gebouwen eerst op in de objectpagina van de LOQ-webapp. Vernieuw daarna deze pagina.</p></div>}
        <div className="workspace-help"><Layers3 size={18}/><div><strong>Van gebouw naar plattegrond</strong><p>Open een gebouw, voeg een verdieping toe en begin met tekenen of importeer een bestaande plattegrond. LOQ begeleidt u bij elke stap.</p></div></div>
      </> : <><div className="object-toolbar"><label className="object-search"><Search size={15}/><Input aria-label="Zoek object" placeholder="Zoek op naam, code of adres…" value={search} onChange={event => {setSearch(event.target.value); setPage(1);}}/></label><span className="object-result-count">{objectsLoading ? 'Objecten laden…' : objectsError ? 'Verbinding vraagt aandacht' : `${objects.length}${hasMore ? '+' : ''} objecten`}</span></div>
        <div className="object-table" aria-busy={objectsLoading}><div className="object-table-heading" aria-hidden="true"><span>Object</span><span>Adres</span><span/></div>{objectsLoading ? <div className="desktop-empty compact" role="status"><Loader2 className="animate-spin" size={22}/><p>Objecten ophalen uit LOQ…</p></div> : objectsError ? <div className="desktop-empty compact" role="alert"><AlertCircle size={24}/><h3>Objecten niet beschikbaar</h3><p>{objectsError}</p><Button variant="outline" onClick={() => setObjectsRetry(value => value + 1)}><RefreshCw/>Opnieuw proberen</Button></div> : objects.length ? objects.map(object => <button className="object-row" key={object.id} onClick={() => chooseObject(object)} disabled={busy}><span className="object-cell"><span className="object-icon"><Building2 size={18}/></span><span><strong>{object.name}</strong>{object.object_code && <small>{object.object_code}</small>}</span></span><span className="object-address">{object.address || 'Geen adres ingevuld'}</span><ChevronRight size={15}/></button>) : <div className="desktop-empty compact"><Search size={24}/><h3>{search ? 'Geen objecten gevonden' : 'Nog geen objecten beschikbaar'}</h3><p>{search ? 'Probeer een andere naam, code of adres.' : 'Opgeslagen objecten in LOQ verschijnen hier.'}</p>{search && <Button variant="outline" onClick={() => setSearch('')}>Zoekopdracht wissen</Button>}</div>}</div>
        <div className="object-pagination"><span>Pagina {page}</span><div><Button variant="outline" disabled={page <= 1 || objectsLoading || busy} onClick={() => setPage(value => value - 1)}>Vorige</Button><Button variant="outline" disabled={!hasMore || objectsLoading || busy} onClick={() => setPage(value => value + 1)}>Volgende</Button></div></div>
        <div className="workspace-help"><Cloud size={18}/><div><strong>Verderwerken op elke Mac</strong><p>Uw tekeningen worden bij het juiste gebouw in LOQ bewaard. Meld u op uw andere Mac aan met hetzelfde account om verder te werken.</p></div></div>
      </>}{busy && <div className="desktop-busy" role="status"><Loader2 size={16} className="animate-spin"/>Werkruimte openen…</div>}
    </section>}
    </div>
  </main>;
}
