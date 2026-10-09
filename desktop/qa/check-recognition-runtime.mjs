/** Local code-test runner. No production account, UI input, or external service. */
import { chromium } from 'playwright';
import { jsPDF } from 'jspdf';
import ts from 'typescript';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const assets=await readdir(path.join(root,'desktop/qa-dist/assets'));
const workerAsset=assets.find(name=>/^recognition\.worker-.*\.js$/.test(name));
const pdfWorkerAsset=assets.find(name=>/^pdf\.worker\.min-.*\.mjs$/.test(name));
if(!workerAsset||!pdfWorkerAsset)throw new Error('Build desktop/qa/vite.config.mjs first.');
const fixtureDir=path.join(dir,'fixtures');await mkdir(fixtureDir,{recursive:true});
const pdf=new jsPDF({unit:'pt',format:[600,400],orientation:'landscape',compress:true});
pdf.setFillColor(0,0,0);pdf.rect(30,40,230,6,'F');pdf.rect(330,40,240,6,'F');pdf.rect(30,340,540,6,'F');pdf.rect(30,40,6,300,'F');pdf.rect(564,40,6,300,'F');pdf.setLineWidth(6);pdf.line(350,160,470,280);pdf.setFontSize(12);pdf.text('Synthetische test: opening boven, diagonale binnenmuur',45,380);
const pdfBytes=new Uint8Array(pdf.output('arraybuffer'));await writeFile(path.join(fixtureDir,'vector-wall-gap-diagonal.pdf'),pdfBytes);
const recognitionSource=ts.transpileModule(await readFile(path.join(root,'src/features/floorplans/recognition.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const library=await readFile(path.join(root,'node_modules/pdfjs-dist/build/pdf.mjs'));
const server=createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5200');res.setHeader('Content-Type','text/javascript');if(req.url==='/recognition.mjs')res.end(recognitionSource);else if(req.url==='/pdf.mjs')res.end(library);else{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(5202,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:5200/qa.html');
 const result=await page.evaluate(async({workerAsset,pdfWorkerAsset,pdfBase64})=>{
  const {proposeWalls,pdfVectorSegments}=await import('http://127.0.0.1:5202/recognition.mjs');
  const workerUrl=`/assets/${workerAsset}`;
  const invoke=(operation,pixels,extra={})=>new Promise((resolve,reject)=>{const worker=new Worker(workerUrl,{type:'module'});const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Packaged worker timeout after 45 seconds'));},45000);worker.onmessage=({data})=>{clearTimeout(timeout);worker.terminate();data.error?reject(new Error(data.error)):resolve(data);};worker.onerror=event=>{clearTimeout(timeout);worker.terminate();reject(new Error(event.message));};worker.postMessage({id:1,operation,width:pixels.width,height:pixels.height,buffer:pixels.data.buffer,...extra},[pixels.data.buffer]);});
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,1200,800);context.strokeStyle='black';context.lineWidth=12;context.lineCap='butt';context.beginPath();context.moveTo(60,86);context.lineTo(520,86);context.moveTo(660,86);context.lineTo(1140,86);context.moveTo(60,86);context.lineTo(60,686);context.lineTo(1140,686);context.lineTo(1140,86);context.moveTo(700,320);context.lineTo(940,560);context.stroke();context.fillStyle='#444';context.font='22px sans-serif';context.fillText('Hal',260,320);context.fillText('Opslag',790,610);
  const rasterURL=canvas.toDataURL('image/png');
  const raster=await invoke('recognize',context.getImageData(0,0,1200,800));
  const summarize=(candidates,gap)=>({count:candidates.length,strong:candidates.filter(c=>c.confidence==='strong').length,diagonal:candidates.some(c=>Math.abs(c.end.x-c.start.x)>50&&Math.abs(c.end.y-c.start.y)>50),bridgesDoor:candidates.some(c=>Math.abs(c.start.y-gap.y)<15&&Math.abs(c.end.y-gap.y)<15&&Math.min(c.start.x,c.end.x)<gap.start&&Math.max(c.start.x,c.end.x)>gap.end)});
  const rasterResult=summarize(raster.candidates,{y:86,start:530,end:650});
  const rectified=await invoke('rectify',context.getImageData(0,0,1200,800),{corners:[{x:0,y:0},{x:1199,y:0},{x:1199,y:799},{x:0,y:799}],outputWidth:600,outputHeight:400});
  const pdfjs=await import('http://127.0.0.1:5202/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=`/assets/${pdfWorkerAsset}`;
  const bytes=Uint8Array.from(atob(pdfBase64),c=>c.charCodeAt(0));const pdf=await pdfjs.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true,enableXfa:false}).promise;const p=await pdf.getPage(1),viewport=p.getViewport({scale:3});const pdfCanvas=document.createElement('canvas');pdfCanvas.width=Math.ceil(viewport.width);pdfCanvas.height=Math.ceil(viewport.height);await p.render({canvas:pdfCanvas,canvasContext:pdfCanvas.getContext('2d'),viewport}).promise;
  const operators=await p.getOperatorList();const segments=pdfVectorSegments(operators,pdfjs.OPS,viewport.transform,pdfjs.version);const vectors=proposeWalls(segments,pdfCanvas.width,pdfCanvas.height);
  const pdfRaster=await invoke('recognize',pdfCanvas.getContext('2d').getImageData(0,0,pdfCanvas.width,pdfCanvas.height));
  const pdfResult={version:pdfjs.version,pages:pdf.numPages,width:pdfCanvas.width,height:pdfCanvas.height,vectorSegments:segments.length,vectorCandidates:vectors.length,vectorStrong:vectors.filter(c=>c.confidence==='strong').length,raster:summarize(pdfRaster.candidates,{y:129,start:800,end:970})};
  const png=pdfCanvas.toDataURL('image/png');await pdf.destroy();
  return {raster:rasterResult,rectify:{width:rectified.width,height:rectified.height,bytes:rectified.buffer.byteLength},pdf:pdfResult,rasterURL,pdfRasterURL:png};
 },{workerAsset,pdfWorkerAsset,pdfBase64:Buffer.from(pdfBytes).toString('base64')});
 await writeFile(path.join(fixtureDir,'raster-wall-gap-diagonal.png'),Buffer.from(result.rasterURL.split(',')[1],'base64'));await writeFile(path.join(fixtureDir,'rendered-vector-wall-gap-diagonal.png'),Buffer.from(result.pdfRasterURL.split(',')[1],'base64'));delete result.rasterURL;delete result.pdfRasterURL;
 const report={testedAt:new Date().toISOString(),browser:browser.version(),workerAsset,pdfWorkerAsset,...result,errors};await writeFile(path.join(fixtureDir,'recognition-runtime-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 if(errors.length||!result.raster.strong||!result.raster.diagonal||result.raster.bridgesDoor||!result.pdf.vectorCandidates||!result.pdf.raster.strong||!result.pdf.raster.diagonal||result.pdf.raster.bridgesDoor||result.rectify.width!==600||result.rectify.height!==400)throw new Error('Recognition runtime acceptance check failed.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
