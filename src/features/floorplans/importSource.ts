import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pdfVectorSegments, type Segment } from './recognition';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
export type ImportFile = { name: string; mimeType: string; contentBase64: string };
export type PreparedImage = { canvas: HTMLCanvasElement; url: string; vectors: Segment[]; name: string };
const MAX_SIDE = 2600;

export function decodeBase64(value: string) {
  const raw = atob(value), bytes = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function encodeBase64(bytes: Uint8Array) {
  let raw=''; for(let i=0;i<bytes.length;i+=32768) raw+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(raw);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('De afbeelding kon niet worden voorbereid.')), 'image/png'));
}

export async function canvasImage(canvas: HTMLCanvasElement, name: string, vectors: Segment[] = []): Promise<PreparedImage> {
  return { canvas, name, vectors, url: URL.createObjectURL(await canvasToBlob(canvas)) };
}

export async function openRaster(file: ImportFile): Promise<PreparedImage> {
  if (!['image/png','image/jpeg','image/webp'].includes(file.mimeType)) throw new Error('Kies een PDF, PNG, JPEG of HEIC-bestand.');
  const bitmap = await createImageBitmap(new Blob([decodeBase64(file.contentBase64)], {type:file.mimeType}));
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width*bitmap.height > 120_000_000) throw new Error('Deze afbeelding is te groot.');
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas'); canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale);
    const ctx=canvas.getContext('2d')!; ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvasImage(canvas,file.name);
  } finally { bitmap.close(); }
}

export async function openPDF(file: ImportFile) {
  return pdfjs.getDocument({data:decodeBase64(file.contentBase64),isEvalSupported:false,useSystemFonts:true,enableXfa:false,disableFontFace:false}).promise;
}

export async function renderPDFPage(pdf: pdfjs.PDFDocumentProxy,pageNumber: number,name: string): Promise<PreparedImage> {
  const page=await pdf.getPage(pageNumber), base=page.getViewport({scale:1});
  const viewport=page.getViewport({scale:Math.min(3,MAX_SIDE/Math.max(base.width,base.height))});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  let vectors:Segment[]=[];
  try { vectors=pdfVectorSegments(await page.getOperatorList(),pdfjs.OPS,viewport.transform as any,pdfjs.version); } catch { /* unsupported vector grammar has a raster path */ }
  await page.render({canvas,canvasContext:canvas.getContext('2d')!,viewport}).promise;
  page.cleanup();
  return canvasImage(canvas,name,vectors);
}

export async function rotateImage(source: PreparedImage): Promise<PreparedImage> {
  const canvas=document.createElement('canvas');canvas.width=source.canvas.height;canvas.height=source.canvas.width;
  const ctx=canvas.getContext('2d')!;ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(source.canvas,0,0);
  return canvasImage(canvas,source.name);
}

export function validateCorners(points: {x:number;y:number}[],width:number,height:number) {
  if(points.length!==4 || points.some(p=>!Number.isFinite(p.x+p.y)||p.x<0||p.y<0||p.x>width||p.y>height)) throw new Error('Klik vier hoeken binnen de afbeelding aan.');
  const crosses=points.map((p,i)=>{const q=points[(i+1)%4],r=points[(i+2)%4];return(q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);});
  if(crosses.some(c=>Math.abs(c)<1)||!crosses.every(c=>Math.sign(c)===Math.sign(crosses[0])))throw new Error('Klik de hoeken op volgorde: linksboven, rechtsboven, rechtsonder, linksonder.');
  const area=Math.abs(points.reduce((sum,p,i)=>sum+p.x*points[(i+1)%4].y-p.y*points[(i+1)%4].x,0))/2;
  if(area<100)throw new Error('Deze uitsnede is te klein.');
}
