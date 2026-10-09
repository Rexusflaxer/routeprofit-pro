import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Download, FileText, Layers, Loader2, RefreshCw } from 'lucide-react';
import FloorPlanRenderer from '@/features/floorplans/FloorPlanRenderer';
import { parseFloorPlanDocument } from '@/features/floorplans/documentGuards';
import { prepareManagedFilePreview, revokeManagedFilePreview } from '@/lib/managedFiles';

function pdfFilename(preview, revision) {
  const filename = String(preview?.filename || `LOQ-plattegronden-revisie-${revision}.pdf`)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 180);
  return /\.pdf$/i.test(filename) ? filename : `${filename}.pdf`;
}

export default function PublishedDesktopFloorPlan({ plan }) {
  const document = useMemo(() => parseFloorPlanDocument(plan.desktop_document), [plan.desktop_document]);
  const [floorId, setFloorId] = useState(document?.floors[0]?.id);
  const [profile, setProfile] = useState('evacuation'), [view, setView] = useState('drawing');
  const [preview, setPreview] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [pdf, setPdf] = useState(null), [pdfError, setPdfError] = useState(''), [pdfLoading, setPdfLoading] = useState(false), [attempt, setAttempt] = useState(0);
  const floor = document?.floors.find(item => item.id === floorId) || document?.floors[0];
  useEffect(() => {
    let active = true, owned = null;
    setPreview(null); setError(''); setLoading(false);
    if (!floor?.background?.fileId || profile !== 'installation' || view !== 'drawing') return undefined;
    setLoading(true);
    prepareManagedFilePreview({ managedFileId: floor.background.fileId, filename: `${floor.name}.png` }).then(result => {
      if (!active) { revokeManagedFilePreview(result); return; }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(result.mimeType)) { revokeManagedFilePreview(result); throw new Error('De onderlegger is geen ondersteunde afbeelding.'); }
      owned = result; setPreview(result);
    }).catch(() => { if (active) setError('De beveiligde onderlegger kon niet worden geladen. De opgeslagen tekening blijft zichtbaar.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; revokeManagedFilePreview(owned); };
  }, [floor?.background?.fileId, floor?.name, profile, view]);
  useEffect(() => {
    let active = true, owned = null;
    setPdf(null); setPdfError(''); setPdfLoading(false);
    if (view !== 'pdf' || !plan.pdf_file_id) return undefined;
    setPdfLoading(true);
    prepareManagedFilePreview({managedFileId: plan.pdf_file_id, filename: `LOQ-plattegronden-revisie-${plan.revision}.pdf`}).then(result => {
      if (!active) { revokeManagedFilePreview(result); return; }
      if (result.mimeType !== 'application/pdf' || !result.blob || !result.url?.startsWith('blob:')) {
        revokeManagedFilePreview(result);
        throw new Error('Het bestand is geen beveiligd PDF-document.');
      }
      owned = result; setPdf(result);
    }).catch(() => { if (active) setPdfError('Het beveiligde afdrukvoorbeeld kon niet worden geopend. Probeer opnieuw of ga terug naar de tekening.'); })
      .finally(() => { if (active) setPdfLoading(false); });
    return () => { active = false; revokeManagedFilePreview(owned); };
  }, [view, plan.pdf_file_id, plan.revision, attempt]);
  if (!document || !floor) return <p role="alert" className="rounded-xl border p-6 text-sm">Deze documentversie kan nog niet veilig worden weergegeven. Open de plattegrond in een bijgewerkte LOQ Desktop-app.</p>;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3"><div className="mr-auto"><p className="text-sm font-semibold">{document.title}</p><p className="text-xs text-muted-foreground">Gepubliceerde revisie {plan.revision}</p></div>
      {view === 'drawing' ? <>
        <label className="flex items-center gap-2 text-xs"><Layers className="h-4 w-4" />Verdieping<select aria-label="Verdieping" className="rounded-md border bg-background p-2" value={floor.id} onChange={e => setFloorId(e.target.value)}>{document.floors.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="text-xs">Weergave <select aria-label="Plattegrondweergave" className="rounded-md border bg-background p-2" value={profile} onChange={e => setProfile(e.target.value)}><option value="evacuation">Ontruiming</option><option value="installation">Installaties</option></select></label>
        {plan.pdf_file_id && <button type="button" className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs" onClick={() => setView('pdf')}><FileText className="h-4 w-4" />Afdrukvoorbeeld</button>}
      </> : <>
        {pdf && <a className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs" href={pdf.url} download={pdfFilename(pdf, plan.revision)}><Download className="h-4 w-4" />PDF downloaden</a>}
        <button type="button" className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs" onClick={() => setView('drawing')}><ArrowLeft className="h-4 w-4" />Terug naar tekening</button>
      </>}
    </div>
    {view === 'pdf' ? <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-xl border bg-muted/10">
      {pdfLoading ? <p role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Beveiligd afdrukvoorbeeld openen…</p>
        : pdf ? <iframe title={`Afdrukvoorbeeld ${document.title}, revisie ${plan.revision}`} src={pdf.url} className="h-[60vh] w-full bg-white" />
          : <div role="alert" className="space-y-3 p-6 text-center"><AlertCircle className="mx-auto h-6 w-6 text-destructive" /><p className="text-sm">{pdfError || 'Er is geen afdrukvoorbeeld beschikbaar.'}</p><button type="button" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs" onClick={() => setAttempt(value => value + 1)}><RefreshCw className="h-4 w-4" />Opnieuw laden</button></div>}
    </div> : <>
      <div className="h-[60vh] min-h-72 overflow-hidden rounded-xl border bg-white p-6"><FloorPlanRenderer floor={floor} profile={profile} dimensions={profile === 'installation'} layers={{ background: profile === 'installation' }} backgroundUrls={preview && floor.background ? { [floor.background.fileId]: preview.url } : {}} /></div>
      {loading && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Onderlegger openen…</p>}
      {error && <p role="alert" className="flex items-center gap-2 text-xs text-destructive"><AlertCircle className="h-3 w-3" />{error}</p>}
    </>}
  </div>;
}
