// Candidate only. Portable Node/Deno/browser validation; no credentials or I/O.
import {validateRoomObjectImage,validateRoomObjectSource,validateRoomObjectResult,ROOM_OBJECT_LABELS} from './roomObjectContract.mjs';
export const ROOM_DISCOVERY_TASK='room-object-discovery-v2';
export const ROOM_DISCOVERY_LIMITS=Object.freeze({frames:24,keyframes:8,objects:40,detectionsPerFrame:12,proposals:16,jsonBytes:8*1024*1024,responseBytes:256*1024,depthDimension:256});
export const ROOM_DISCOVERY_LABELS=Object.freeze([...ROOM_OBJECT_LABELS.filter(x=>x!=='unknown'),'car','van','motorcycle','bicycle','machinery','unknown']);
export class RoomDiscoveryError extends Error {constructor(code){super(code);this.code=code;}}
export const failInput=()=>{throw new RoomDiscoveryError('room_discovery_input_invalid');};
export const failOutput=()=>{throw new RoomDiscoveryError('model_output_invalid');};
export const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
export const record=(v,required,optional=[])=>v&&typeof v==='object'&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
export const identifier=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v);
const size=v=>new TextEncoder().encode(JSON.stringify(v)).length;
export function decodeBytes(text,max){
 if(typeof text!=='string'||!text.length||text.length>Math.ceil(max/3)*4)failInput();
 let bytes;try{bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0));}catch{failInput();}
 let plain='';for(let i=0;i<bytes.length;i+=32768)plain+=String.fromCharCode(...bytes.subarray(i,i+32768));
 if(bytes.length>max||btoa(plain)!==text)failInput();return bytes;
}
function validateCamera(camera,image){
 if(!record(camera,['imageWidth','imageHeight','fx','fy','cx','cy','cameraToWorld'])||camera.imageWidth!==image.width||camera.imageHeight!==image.height||![camera.fx,camera.fy].every(x=>finite(x,.1,20000))||![camera.cx,camera.cy].every(x=>finite(x,-16384,16384)))failInput();
 const m=camera.cameraToWorld;if(!Array.isArray(m)||m.length!==16||!m.every(x=>finite(x,-10000,10000))||Math.abs(m[3])+Math.abs(m[7])+Math.abs(m[11])>1e-5||Math.abs(m[15]-1)>1e-5)failInput();
 const a=m.slice(0,3),b=m.slice(4,7),c=m.slice(8,11),dot=(x,y)=>x.reduce((s,n,i)=>s+n*y[i],0);
 if([a,b,c].some(v=>Math.abs(dot(v,v)-1)>.025)||[dot(a,b),dot(a,c),dot(b,c)].some(v=>Math.abs(v)>.025))failInput();
 const det=a[0]*(b[1]*c[2]-b[2]*c[1])-b[0]*(a[1]*c[2]-a[2]*c[1])+c[0]*(a[1]*b[2]-a[2]*b[1]);if(Math.abs(det-1)>.04)failInput();
}
function validateDepth(d){
 if(!record(d,['width','height','encoding','base64','confidenceEncoding','confidenceBase64'])||![d.width,d.height].every(n=>Number.isInteger(n)&&n>=8&&n<=256)||d.encoding!=='uint16-mm-le'||d.confidenceEncoding!=='uint8-arkit')failInput();
 const count=d.width*d.height,b=decodeBytes(d.base64,count*2),c=decodeBytes(d.confidenceBase64,count);if(b.length!==count*2||c.length!==count||c.some(n=>n>2))failInput();
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength);for(let i=0;i<count;i++){const mm=view.getUint16(i*2,true);if(mm!==0&&(mm<150||mm>12000))failInput();}
}
function validateSnapshot(s){
 if(!record(s,['roomId','surfaces','objects'])||!identifier(s.roomId)||!Array.isArray(s.surfaces)||s.surfaces.length>5000||!Array.isArray(s.objects)||s.objects.length>2500)failInput();
 const ids=new Set(),point=p=>record(p,['x','y'])&&finite(p.x,-10000,10000)&&finite(p.y,-10000,10000);
 for(const w of s.surfaces){if(!record(w,['id','kind','start','end','height','bottomElevation','confidence'],['parentWallId','isCurved','details'])||!identifier(w.id)||ids.has(w.id)||!['wall','door','window','opening'].includes(w.kind)||!point(w.start)||!point(w.end)||!finite(w.height,.000001,50)||!finite(w.bottomElevation,-1000,1000)||!['low','medium','high','unknown'].includes(w.confidence))failInput();ids.add(w.id);}
 for(const o of s.objects){if(!record(o,['id','category','center','width','depth','height','bottomElevation','rotationRadians','confidence'],['details'])||!identifier(o.id)||ids.has(o.id)||typeof o.category!=='string'||!o.category.length||o.category.length>128||!point(o.center)||![o.width,o.depth,o.height].every(v=>finite(v,.000001,100))||!finite(o.bottomElevation,-1000,1000)||!finite(o.rotationRadians,-Math.PI*2,Math.PI*2)||!['low','medium','high','unknown'].includes(o.confidence))failInput();ids.add(o.id);}
}
export function classificationSourceForDiscovery(source){
 const objects=source.observation_batch.objects;if(!objects.length)return null;
 const frameIds=new Set(objects.flatMap(o=>o.projections.map(p=>p.frameId)));
 return {task:'room-object-classification-v1',captureSessionId:source.captureSessionId,sequence:source.sequence,observation_batch:{schemaVersion:1,frames:source.observation_batch.frames.filter(f=>frameIds.has(f.id)),objects}};
}
export async function validateRoomDiscoverySource(source){
 if(!record(source,['task','captureSessionId','coordinateFrameId','sequence','snapshot','observation_batch'])||source.task!==ROOM_DISCOVERY_TASK||!identifier(source.captureSessionId)||!identifier(source.coordinateFrameId)||!Number.isSafeInteger(source.sequence)||source.sequence<1||size(source)>ROOM_DISCOVERY_LIMITS.jsonBytes)failInput();
 validateSnapshot(source.snapshot);
 const batch=source.observation_batch;if(!record(batch,['schemaVersion','frames','objects'])||batch.schemaVersion!==2||!Array.isArray(batch.frames)||!batch.frames.length||batch.frames.length>24||!Array.isArray(batch.objects)||batch.objects.length>40)failInput();
 const ids=new Set();let keyframes=0;
 for(const f of batch.frames){
  if(!record(f,['id','kind','image','camera','capturedAt','frameTimestamp','quality','sourceCrop','sourceImageWidth','sourceImageHeight'],['sourceObjectId','depth'])||!identifier(f.id)||ids.has(f.id)||!['object_crop','room_keyframe'].includes(f.kind))failInput();ids.add(f.id);
  if(f.kind==='room_keyframe'){keyframes++;if(f.sourceObjectId!==undefined)failInput();}else if(!identifier(f.sourceObjectId))failInput();
  try{await validateRoomObjectImage(f.image);}catch{failInput();}validateCamera(f.camera,f.image);
  if(typeof f.capturedAt!=='string'||f.capturedAt.length>40||!Number.isFinite(Date.parse(f.capturedAt))||!finite(f.frameTimestamp,0,Number.MAX_SAFE_INTEGER)||!record(f.quality,['meanLuma','sharpness','tracking'])||!finite(f.quality.meanLuma,0,255)||!finite(f.quality.sharpness,0,1e9)||f.quality.tracking!=='normal')failInput();
  if(![f.sourceImageWidth,f.sourceImageHeight].every(n=>Number.isInteger(n)&&n>=32&&n<=16384)||!record(f.sourceCrop,['x','y','width','height'])||!Object.values(f.sourceCrop).every(Number.isInteger))failInput();
  const c=f.sourceCrop;if(c.x<0||c.y<0||c.width<1||c.height<1||c.x+c.width>f.sourceImageWidth||c.y+c.height>f.sourceImageHeight)failInput();
  // Raw depth belongs to the complete sensor frame, so cropped keyframes cannot
  // claim the same pixel-to-depth mapping. Object crops never carry depth.
  if(f.kind==='room_keyframe'&&(c.x!==0||c.y!==0||c.width!==f.sourceImageWidth||c.height!==f.sourceImageHeight))failInput();
  if(f.depth!==undefined){if(f.kind!=='room_keyframe')failInput();validateDepth(f.depth);if(Math.abs(f.depth.width/f.depth.height-f.sourceImageWidth/f.sourceImageHeight)>.015)failInput();}
 }
 if(keyframes>8||!keyframes&&!batch.objects.length)failInput();
 const snapshotObjects=new Map(source.snapshot.objects.map(o=>[o.id,o]));
 for(const o of batch.objects){if(!record(o,['id','category','dimensions','projections'])||!identifier(o.id)||!record(o.dimensions,['width','depth','height'])||!Object.values(o.dimensions).every(n=>finite(n,.01,1000))||!Array.isArray(o.projections)||!o.projections.length||o.projections.length>24||o.projections.some(p=>!record(p,['frameId','bbox'])||!ids.has(p.frameId)||!Array.isArray(p.bbox)))failInput();const existing=snapshotObjects.get(o.id);if(!existing||o.category!==existing.category||!o.dimensions||['width','depth','height'].some(k=>Math.abs(o.dimensions[k]-existing[k])>1e-6))failInput();}
 const v1=classificationSourceForDiscovery(source);if(v1){try{await validateRoomObjectSource(v1);}catch{failInput();}}
 const objectIds=new Set(batch.objects.map(o=>o.id));if(batch.frames.some(f=>f.kind==='object_crop'&&!objectIds.has(f.sourceObjectId)))failInput();
 return source;
}
export const ROOM_DISCOVERY_MODEL_SCHEMA={type:'object',additionalProperties:false,required:['objects'],properties:{objects:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,required:['label','bbox','visibility'],properties:{label:{type:'string',enum:ROOM_DISCOVERY_LABELS},bbox:{type:'array',minItems:4,maxItems:4,items:{type:'integer',minimum:0,maximum:1000}},visibility:{type:'string',enum:['clear','partial','not_visible']}}}}}};
export function parseRoomDiscoveryFrame(content,frameId,{modelCoordinates=false}={}){
 let data;try{if(typeof content!=='string'||new TextEncoder().encode(content).length>65536)failOutput();data=JSON.parse(content);}catch{failOutput();}
 if(!record(data,['objects'])||!Array.isArray(data.objects)||data.objects.length>12)failOutput();
 if(modelCoordinates){for(const o of data.objects){if(!Array.isArray(o?.bbox)||o.bbox.length!==4||!o.bbox.every(n=>Number.isInteger(n)&&n>=0&&n<=1000))failOutput();o.bbox=o.bbox.map(n=>n/1000);}}
 for(const o of data.objects){if(!record(o,['label','bbox','visibility'])||!ROOM_DISCOVERY_LABELS.includes(o.label)||!['clear','partial','not_visible'].includes(o.visibility)||!Array.isArray(o.bbox)||o.bbox.length!==4||!o.bbox.every(n=>finite(n,0,1))||o.bbox[2]<=o.bbox[0]||o.bbox[3]<=o.bbox[1])failOutput();}
 return {frameId,objects:data.objects};
}
export async function validateDiscoveryClassifications(result,source){
 const v1=classificationSourceForDiscovery(source);if(!v1){if(result!==null)failOutput();return null;}
 try{return await validateRoomObjectResult(result,v1);}catch{failOutput();}
}
export async function validateRoomDiscoveryResult(result,source){const module=await import('./roomDiscoveryGeometry.mjs');return module.validateRoomDiscoveryResult(result,source);}
