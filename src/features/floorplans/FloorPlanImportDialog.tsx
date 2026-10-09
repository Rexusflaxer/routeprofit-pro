import React,{useEffect,useRef,useState} from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Upload, X, RotateCw, ScanLine, Check, Scissors, Ruler, Loader2, Undo2 } from 'lucide-react';
import { calibratedScale, proposeWalls, splitCandidate, type PixelPoint, type WallCandidate } from './recognition';
import { canvasImage, canvasToBlob, encodeBase64, openPDF, openRaster, renderPDFPage, rotateImage, validateCorners, type ImportFile, type PreparedImage } from './importSource';
import type { Wall } from './model';
import './import.css';
import { imagePointFromClient, assertImageScale, confirmedWalls, mergeWallCandidates, createCancellableWorkerTask } from './importEditing';

type ImportResult={background:{fileId:string;width:number;height:number;origin:PixelPoint;metresPerPixel:number;opacity:number;calibrated:boolean};walls:Wall[];backgroundUrl:string};
type Props={open:boolean;onClose:()=>void;onApply:(result:ImportResult)=>void;pickFile:()=>Promise<ImportFile|null>;uploadAsset:(asset:{filename:string;mime_type:string;content_base64:string;kind:'background'})=>Promise<{file_id:string}>};
export default function FloorPlanImportDialog({open,onClose,onApply,pickFile,uploadAsset}:Props){
  const [source,setSource]=useState<PreparedImage|null>(null),[original,setOriginal]=useState<PreparedImage|null>(null);
  const [page,setPage]=useState(1),[pages,setPages]=useState(1),[mode,setMode]=useState<'review'|'scale'|'crop'|'corners'>('scale');
  const [points,setPoints]=useState<PixelPoint[]>([]),[metres,setMetres]=useState('10'),[scale,setScale]=useState<number|null>(null);
  const [ratio,setRatio]=useState('0.7071067811865476'),[candidates,setCandidates]=useState<WallCandidate[]>([]),[selected,setSelected]=useState<string|null>(null),[mergeWith,setMergeWith]=useState<string|null>(null);
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[note,setNote]=useState('');
  const pdf=useRef<any>(null),generation=useRef(0),worker=useRef<ReturnType<typeof createCancellableWorkerTask>|null>(null),urls=useRef(new Set<string>()),alive=useRef(true);
  const activeCandidate=candidates.find(c=>c.id===selected);
  const svgRef=useRef<SVGSVGElement>(null),dragEndpoint=useRef<{id:string;endpoint:'start'|'end'}|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;worker.current?.cancel();pdf.current?.destroy();urls.current.forEach(url=>URL.revokeObjectURL(url));};},[]);
  useEffect(()=>{if(!open){generation.current++;worker.current?.cancel();worker.current=null;setBusy('');}},[open]);
  const own=(image:PreparedImage)=>{urls.current.add(image.url);return image;};
  const reset=(image:PreparedImage)=>{setSource(own(image));setScale(null);setPoints([]);setCandidates([]);setSelected(null);setMergeWith(null);setMode('scale');setNote('Klik twee punten waarvan je de werkelijke afstand kent.');};
  async function choose(){
    const id=++generation.current;worker.current?.cancel();setBusy('Bestand openen…');setError('');
    try{const file=await pickFile();if(!file)return;if(file.contentBase64.length>48_000_000)throw new Error('Dit bestand is te groot. Kies een bestand kleiner dan 36 MB.');
      await pdf.current?.destroy();pdf.current=null;
      let image:PreparedImage;
      if(file.mimeType==='application/pdf'){pdf.current=await openPDF(file);setPages(pdf.current.numPages);setPage(1);image=await renderPDFPage(pdf.current,1,file.name);}
      else{setPages(1);setPage(1);image=await openRaster(file);}
      if(id!==generation.current||!alive.current){URL.revokeObjectURL(image.url);return;}
      setOriginal(own(image));reset(image);
    }catch(e){if(id===generation.current)setError((e as Error).message);}finally{if(id===generation.current)setBusy('');}
  }
  async function changePage(value:number){const id=++generation.current;worker.current?.cancel();setBusy('Pagina voorbereiden…');setError('');try{const image=await renderPDFPage(pdf.current,value,source?.name||'Plattegrond.pdf');if(id!==generation.current){URL.revokeObjectURL(image.url);return;}setPage(value);setOriginal(own(image));reset(image);}catch(e){if(id===generation.current)setError((e as Error).message);}finally{if(id===generation.current)setBusy('');}}
  async function runWorker(operation:string,extra:Record<string,unknown>={}):Promise<any>{
    if(!source)throw new Error('Open eerst een bestand.');worker.current?.cancel();
    const pixels=source.canvas.getContext('2d')!.getImageData(0,0,source.canvas.width,source.canvas.height);
    const job=createCancellableWorkerTask(()=>new Worker(new URL('./recognition.worker.ts',import.meta.url),{type:'module'}),{id:generation.current,operation,width:pixels.width,height:pixels.height,buffer:pixels.data.buffer,...extra},[pixels.data.buffer]);worker.current=job;
    try{return await job.promise;}finally{if(worker.current===job)worker.current=null;}
  }
  async function recognize(){if(!source||!scale)return;const id=++generation.current;setBusy('Muurvoorstellen zoeken op deze Mac…');setError('');try{
    let proposed=source.vectors.length?proposeWalls(source.vectors,source.canvas.width,source.canvas.height):[];
    if(!proposed.some(c=>c.confidence==='strong'))proposed=(await runWorker('recognize')).candidates;
    if(id!==generation.current)return;setCandidates(proposed);setMode('review');setPoints([]);setSelected(proposed[0]?.id||null);
    setNote(proposed.length?`${proposed.length} voorstellen gevonden. Controleer aansluitingen, diktes en deuropeningen voordat je ze overneemt.`:'Geen betrouwbare muurvoorstellen gevonden. Je kunt de onderlegger invoegen en handmatig overtrekken.');
  }catch(e){if(id===generation.current)setError((e as Error).message);}finally{if(id===generation.current)setBusy('');}}
  function clickImage(event:React.MouseEvent<SVGSVGElement>){if(!source||busy||mode==='review')return;const p=imagePointFromClient(event.currentTarget,event.clientX,event.clientY,source.canvas.width,source.canvas.height);if(!p)return;const count=mode==='corners'?4:2;setPoints(previous=>previous.length>=count?[p]:[...previous,p]);setError('');}
  function startEndpointDrag(event:React.PointerEvent<SVGCircleElement>,endpoint:'start'|'end'){if(busy||!activeCandidate)return;event.preventDefault();event.stopPropagation();dragEndpoint.current={id:activeCandidate.id,endpoint};svgRef.current?.setPointerCapture(event.pointerId);}
  function moveEndpoint(event:React.PointerEvent<SVGSVGElement>){if(!source||busy||!dragEndpoint.current)return;const p=imagePointFromClient(event.currentTarget,event.clientX,event.clientY,source.canvas.width,source.canvas.height,true);if(!p)return;const {id,endpoint}=dragEndpoint.current;setCandidates(list=>list.map(c=>c.id===id?{...c,[endpoint]:p,confidence:'review'}:c));setError('');}
  function stopEndpoint(event:React.PointerEvent<SVGSVGElement>){dragEndpoint.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
  async function rotateSource(){if(!source)return;const id=++generation.current;worker.current?.cancel();setBusy('Afbeelding draaien…');setError('');try{const image=await rotateImage(source);if(id!==generation.current){URL.revokeObjectURL(image.url);return;}reset(image);}catch(e){if(id===generation.current)setError((e as Error).message);}finally{if(id===generation.current)setBusy('');}}
  async function prepare(){if(!source)return;const id=++generation.current;setBusy('Afbeelding rechtzetten…');setError('');try{
    let image:PreparedImage;
    if(mode==='crop'){
      if(points.length!==2)throw new Error('Klik de linkerbovenhoek en rechteronderhoek van de uitsnede.');
      const x=Math.floor(Math.min(points[0].x,points[1].x)),y=Math.floor(Math.min(points[0].y,points[1].y)),width=Math.floor(Math.abs(points[1].x-points[0].x)),height=Math.floor(Math.abs(points[1].y-points[0].y));
      if(width<20||height<20)throw new Error('Deze uitsnede is te klein.');
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d')!.drawImage(source.canvas,x,y,width,height,0,0,width,height);image=await canvasImage(canvas,source.name);
    }else{
      validateCorners(points,source.canvas.width,source.canvas.height);const r=Number(ratio);if(!Number.isFinite(r)||r<.1||r>10)throw new Error('Geef een bekende verhouding van breedte tot hoogte op.');
      const outputWidth=Math.round(r>1?2200:2200*r),outputHeight=Math.round(r>1?2200/r:2200);
      const result=await runWorker('rectify',{corners:points,outputWidth,outputHeight});
      const canvas=document.createElement('canvas');canvas.width=result.width;canvas.height=result.height;canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(result.buffer),result.width,result.height),0,0);image=await canvasImage(canvas,source.name);
    }
    if(id!==generation.current){URL.revokeObjectURL(image.url);return;}reset(image);
  }catch(e){if(id===generation.current)setError((e as Error).message);}finally{if(id===generation.current)setBusy('');}}
  async function apply(){if(!source||!scale)return;const id=++generation.current;setBusy('Onderlegger veilig opslaan…');setError('');try{
    const walls=confirmedWalls(candidates,source.canvas.width,source.canvas.height,scale);
    const blob=await canvasToBlob(source.canvas);if(blob.size>12*1024*1024)throw new Error('Deze onderlegger is te groot. Kies een kleinere uitsnede.');
    const asset=await uploadAsset({filename:source.name.replace(/\.[^.]+$/,'')+'.png',mime_type:'image/png',content_base64:encodeBase64(new Uint8Array(await blob.arrayBuffer())),kind:'background'});
    if(!asset?.file_id)throw new Error('Het opgeslagen bestand kon niet worden gecontroleerd.');if(id!==generation.current)return;
    const backgroundUrl=URL.createObjectURL(blob); // Ownership transfers to the document shell.
    onApply({background:{fileId:asset.file_id,width:source.canvas.width,height:source.canvas.height,origin:{x:0,y:0},metresPerPixel:scale,opacity:.45,calibrated:true},walls,backgroundUrl});onClose();
  }catch(e){if(id===generation.current)setError((e as Error).message);}finally{if(id===generation.current)setBusy('');}}
  function cancelTask(){generation.current++;worker.current?.cancel();worker.current=null;setBusy('');setNote('Analyse geannuleerd. Je kunt verder met de onderlegger.');}
  if(!open)return null;
  const total=candidates.filter(c=>c.selected).length;
  return <DialogPrimitive.Root open={open} onOpenChange={next=>{if(!next){cancelTask();onClose();}}}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="loq-import-overlay"/><DialogPrimitive.Content className="loq-import-dialog" onPointerDownOutside={event=>event.preventDefault()}>
    <header><div><span className="loq-import-eyebrow">SLIMME ONDERLEGGER</span><DialogPrimitive.Title asChild><h2>Van bestaande plattegrond naar bewerkbare muren</h2></DialogPrimitive.Title><DialogPrimitive.Description asChild><p>Voorbereiden · Schaal instellen · Voorstellen controleren</p></DialogPrimitive.Description></div><button type="button" className="loq-import-close" aria-label="Import sluiten" onClick={()=>{cancelTask();onClose();}}><X size={20}/></button></header>
    <div className="loq-import-body"><aside>
      <button type="button" className="loq-import-primary" onClick={choose} disabled={!!busy}><Upload size={17}/> Bestand kiezen</button><small>PDF, PNG, JPEG of HEIC · verwerking op je Mac</small>
      {source&&<><div className="loq-import-card"><strong>{source.name}</strong>{pages>1&&<label>PDF-pagina<select value={page} disabled={!!busy} onChange={e=>changePage(Number(e.target.value))}>{Array.from({length:pages},(_,i)=><option key={i} value={i+1}>Pagina {i+1}</option>)}</select></label>}
        <div className="loq-import-button-grid"><button type="button" disabled={!!busy} onClick={rotateSource}><RotateCw size={15}/> Draaien</button><button type="button" aria-pressed={mode==='crop'} disabled={!!busy} onClick={()=>{setMode('crop');setPoints([]);}}><Scissors size={15}/> Bijsnijden</button><button type="button" aria-pressed={mode==='corners'} disabled={!!busy} onClick={()=>{setMode('corners');setPoints([]);}}>Foto rechtzetten</button><button type="button" disabled={!!busy} onClick={()=>original&&reset(original)}><Undo2 size={15}/> Origineel</button></div>
      </div>
      {(mode==='crop'||mode==='corners')&&<div className="loq-import-card"><strong>{mode==='crop'?'Kies 2 hoeken':'Kies 4 hoeken'}</strong><p>{mode==='crop'?'Klik twee tegenoverliggende hoeken van de gewenste uitsnede.':'Begin linksboven en klik met de klok mee op de vier hoeken van het papier.'}</p>{mode==='corners'&&<label>Bekende papierverhouding<select value={ratio} onChange={e=>setRatio(e.target.value)}><option value="0.7071067811865476">A4 / A3 staand</option><option value="1.4142135623730951">A4 / A3 liggend</option><option value="1">Vierkant</option></select></label>}<button type="button" onClick={prepare} disabled={!!busy||points.length!==(mode==='crop'?2:4)}>Uitsnede toepassen</button></div>}
      <div className="loq-import-card"><strong><Ruler size={15}/> Werkelijke schaal</strong><p>Klik twee herkenbare punten en geef hun afstand aan.</p><button type="button" aria-pressed={mode==='scale'} disabled={!!busy} onClick={()=>{setMode('scale');setPoints([]);}}>Twee meetpunten kiezen</button><label>Afstand in meters<input inputMode="decimal" type="number" min="0.01" step="0.1" value={metres} onChange={e=>setMetres(e.target.value)}/></label><button type="button" disabled={!!busy||mode!=='scale'||points.length!==2} onClick={()=>{try{const nextScale=calibratedScale(points[0],points[1],Number(metres));assertImageScale(source.canvas.width,source.canvas.height,nextScale);setScale(nextScale);setMode('review');setError('');setNote('Schaal ingesteld. Zoek nu muurvoorstellen of voeg alleen de onderlegger toe.');}catch(e){setError((e as Error).message);}}}>Schaal bevestigen</button>{scale&&<small className="loq-import-success"><Check size={14}/> Schaal bevestigd</small>}</div>
      <button type="button" className="loq-import-primary" disabled={!scale||!!busy} onClick={recognize}><ScanLine size={17}/> Muren herkennen</button>
      {!!candidates.length&&<div className="loq-import-card"><strong>{total} van {candidates.length} geselecteerd</strong><small>Klik op een muurvoorstel en sleep de ronde eindpunten om het te corrigeren. Shift-klik een tweede aansluitende muur om samen te voegen.</small><div className="loq-import-button-grid"><button type="button" onClick={()=>setCandidates(c=>c.map(x=>({...x,selected:true})))}>Alle voorstellen</button><button type="button" onClick={()=>setCandidates(c=>c.map(x=>({...x,selected:false})))}>Geen</button></div>
      {activeCandidate&&<>{mergeWith&&<button type="button" disabled={!!busy} onClick={()=>{try{const other=candidates.find(c=>c.id===mergeWith);if(!other)return;const merged=mergeWallCandidates(activeCandidate,other);setCandidates(list=>[...list.filter(c=>c.id!==activeCandidate.id&&c.id!==other.id),merged]);setSelected(merged.id);setMergeWith(null);setError('');}catch(e){setError((e as Error).message);}}}>Twee muren samenvoegen</button>}<label><input type="checkbox" checked={activeCandidate.selected} onChange={e=>setCandidates(c=>c.map(x=>x.id===selected?{...x,selected:e.target.checked}:x))}/> Dit muurvoorstel overnemen</label><label>Dikte (pixels)<input type="number" min="1" max="100" value={Math.round(activeCandidate.thickness)} onChange={e=>setCandidates(c=>c.map(x=>x.id===selected?{...x,thickness:Math.max(1,Number(e.target.value))}:x))}/></label><div className="loq-import-coordinates">{(['start','end'] as const).flatMap(endpoint=>(['x','y'] as const).map(axis=><label key={endpoint+axis}>{endpoint==='start'?'Begin':'Eind'} {axis}<input type="number" min={0} max={axis==='x'?source.canvas.width:source.canvas.height} value={Math.round(activeCandidate[endpoint][axis])} onChange={e=>setCandidates(c=>c.map(x=>x.id===selected?{...x,[endpoint]:{...x[endpoint],[axis]:Number(e.target.value)}}:x))}/></label>))}</div><button type="button" onClick={()=>{setCandidates(c=>c.flatMap(x=>x.id===selected?splitCandidate(x):[x]));setSelected(null);}}>Muur splitsen</button><button type="button" onClick={()=>{setCandidates(c=>c.filter(x=>x.id!==selected));setSelected(null);}}>Voorstel verwijderen</button></>}
      </div>}</>}
    </aside><main>
      {!source?<div className="loq-import-empty"><ScanLine size={44}/><h3>Je bestaande plattegrond als vertrekpunt</h3><p>Open een bestand, bevestig de schaal en laat LOQ bewerkbare muren voorstellen.</p></div>:<div className="loq-import-canvas"><svg ref={svgRef} onPointerMove={moveEndpoint} onPointerUp={stopEndpoint} onPointerCancel={stopEndpoint} viewBox={`0 0 ${source.canvas.width} ${source.canvas.height}`} style={{aspectRatio:`${source.canvas.width}/${source.canvas.height}`}} onClick={clickImage} aria-label="Onderlegger met meetpunten en muurvoorstellen">
      <image href={source.url} width={source.canvas.width} height={source.canvas.height}/>
      {mode==='review'&&candidates.map(c=><g key={c.id} onClick={e=>{if(busy||mode!=='review')return;e.stopPropagation();if(e.shiftKey&&selected&&selected!==c.id){setMergeWith(c.id);}else{setSelected(c.id);setMergeWith(null);}setMode('review');}} style={{cursor:'pointer'}}><line x1={c.start.x} y1={c.start.y} x2={c.end.x} y2={c.end.y} stroke="transparent" strokeWidth={Math.max(14,c.thickness)}/><line x1={c.start.x} y1={c.start.y} x2={c.end.x} y2={c.end.y} stroke={c.id===selected||c.id===mergeWith?'#1f7aff':c.selected?'#2563eb':'#d97706'} strokeWidth={Math.max(2,c.thickness)} opacity={c.selected?.75:.4}/></g>)}
      {activeCandidate&&mode==='review'&&(['start','end'] as const).map(endpoint=><circle key={endpoint} cx={activeCandidate[endpoint].x} cy={activeCandidate[endpoint].y} r={Math.max(7,source.canvas.width/110)} fill="white" stroke="#1f7aff" strokeWidth={Math.max(2,source.canvas.width/650)} style={{cursor:'grab'}} role="button" tabIndex={0} aria-label={endpoint==='start'?'Beginpunt muur verslepen':'Eindpunt muur verslepen'} onPointerDown={e=>startEndpointDrag(e,endpoint)} onClick={e=>e.stopPropagation()} onKeyDown={e=>{const vectors:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const vector=vectors[e.key];if(!vector)return;e.preventDefault();const amount=e.shiftKey?10:1;setCandidates(list=>list.map(c=>c.id===selected?{...c,[endpoint]:{x:Math.max(0,Math.min(source.canvas.width,c[endpoint].x+vector[0]*amount)),y:Math.max(0,Math.min(source.canvas.height,c[endpoint].y+vector[1]*amount))},confidence:'review'}:c));}}/>)}
      {points.length>1&&<polyline points={points.map(p=>`${p.x},${p.y}`).join(' ')} stroke="#1f7aff" strokeWidth="3" fill="none"/>}{points.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r={Math.max(6,source.canvas.width/160)} fill="#1f7aff" stroke="white" strokeWidth="2"/><text x={p.x+12} y={p.y-12} fontSize={Math.max(16,source.canvas.width/80)} fill="#1f7aff">{i+1}</text></g>)}
      </svg></div>}
      <div className="loq-import-message" aria-live="polite">{busy?<span role="status"><Loader2 className="loq-import-spin" size={17}/>{busy} <button type="button" onClick={cancelTask}>Annuleren</button></span>:<p>{note||'Het originele bestand blijft ongewijzigd.'}</p>}{error&&<p role="alert" className="loq-import-error">{error}</p>}</div>
    </main></div>
    <footer><span>{total?`${total} muurvoorstellen en onderlegger`:'Alleen onderlegger'} · Je controleert de uitkomst zelf.</span><button type="button" className="loq-import-primary" disabled={!source||!scale||!!busy||mode!=='review'} onClick={apply}><Check size={17}/> In tekening invoegen</button></footer>
  </DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}
