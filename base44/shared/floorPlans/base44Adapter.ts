import {createFloorPlanAnalysisQueue, QueueError} from './queueCore.ts';
const reject = (code, message = 'Deze analyse is niet beschikbaar.') => {throw new QueueError(403, code, message);};
const PNG_MAX = 8 * 1024 * 1024;
const states = new Set(['get_floor_plan_analysis_service_status', 'create_object_floor_plan_analysis_job', 'get_object_floor_plan_analysis_job', 'cancel_object_floor_plan_analysis_job']);
export const ANALYSIS_ACTIONS = states;

export function validatePixelResult(value, width, height) {
  const bad = () => {throw new QueueError(400, 'invalid_analysis_result', 'Ongeldig analyseresultaat.');};
  const exact = (value, keys) => {if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) bad();};
  const number = (value, min, max) => {if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) bad();return value;};
  const text = (value, max) => {if(typeof value !== 'string' || value.length > max || /[<>\u0000-\u001f\u007f]/.test(value)) bad();return value;};
  exact(value, ['walls','labels','warnings']);
  if (!Array.isArray(value.walls) || value.walls.length > 400 || !Array.isArray(value.labels) || value.labels.length > 100 || !Array.isArray(value.warnings) || value.warnings.length > 20 || new TextEncoder().encode(JSON.stringify(value)).length > 128 * 1024) bad();
  return {walls:value.walls.map(wall=>{
    exact(wall,['x1','y1','x2','y2','thickness','confidence']);
    const result={x1:number(wall.x1,0,width),y1:number(wall.y1,0,height),x2:number(wall.x2,0,width),y2:number(wall.y2,0,height),thickness:number(wall.thickness,Number.EPSILON,Math.max(1,Math.min(width,height)/10)),confidence:number(wall.confidence,0,1)};
    if(Math.hypot(result.x2-result.x1,result.y2-result.y1)<2)bad();return result;
  }),labels:value.labels.map(label=>{
    exact(label,['text','x','y','kind','confidence']);if(!['room','dimension'].includes(label.kind))bad();
    return{text:text(label.text,120),x:number(label.x,0,width),y:number(label.y,0,height),kind:label.kind,confidence:number(label.confidence,0,1)};
  }),warnings:value.warnings.map(warning=>text(warning,240))};
}

/** Adapter dependencies MUST come from the existing buildingFloorPlanHandlers
 * server-only scope/asset/decryption helpers, not request-supplied values.
 * settings contains operator-managed singletonId and workerSecrets {workerId:secret}.
 */
export function createBase44AnalysisQueue({base44, settings, floorPlans, getUser, auditDownload, hash, randomToken}) {
  const entity = name => base44.asServiceRole.entities[name];
  if(!settings.singletonId || !settings.workerSecrets || !Object.keys(settings.workerSecrets).length)throw new QueueError(503,'analysis_not_configured','De AI-service is nog niet geconfigureerd.');
  const store = {
    async getService(){const row=await entity('FloorPlanAnalysisService').get(settings.singletonId);return row&&{id:row.id,version:row.version,enabled:row.enabled,max_workers:row.max_workers,jobs:row.jobs,receipts:row.receipts,workers:row.workers};},
    async getSnapshot(id){const row=await entity('FloorPlanAnalysisJobSnapshot').get(id);return row?.payload;},
    async stageSnapshot(job){return entity('FloorPlanAnalysisJobSnapshot').create({job_id:job.id,version:job.version,payload:job,retain_until:job.retain_until});},
    async casService(expected,next){
      const result=await entity('FloorPlanAnalysisService').updateMany({id:settings.singletonId,version:expected,enabled:next.enabled,max_workers:next.max_workers},{$set:{version:next.version,jobs:next.jobs,receipts:next.receipts,workers:next.workers}});
      return result?.success===true&&result.updated===1;
    },
  };
  async function scope(actor,body,mutable){
    if(!actor?.id||actor.role!=='admin')reject('analysis_access_denied');
    // Exact existing requireCustomerObjectScope/Mutation + saved selection-key checks.
    return floorPlans.scope(base44,body,mutable);
  }
  async function asset(state,source){
    const file=await floorPlans.assetScope(base44,state,source.file_id,['background']);
    if(file.mime_type!=='image/png'||!Number.isSafeInteger(file.size_bytes)||file.size_bytes<=0||file.size_bytes>PNG_MAX||typeof file.plaintext_sha256!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(file.plaintext_sha256))reject('analysis_source_unavailable');
    return file;
  }
  async function liveScope(job){
    const actor=await getUser(job.actor_id);
    const state=await scope(actor,job,false);
    if(state.object.status==='archived'||state.customer.status==='archived')reject('analysis_access_changed');
    return {actor,state};
  }
  return createFloorPlanAnalysisQueue({store,workerIds:Object.keys(settings.workerSecrets),hash,randomToken,authorizeScope:scope,
    validateSource:async(state,source)=>({sha256:(await asset(state,source)).plaintext_sha256}),
    validateJobScope:async job=>{const {state}=await liveScope(job);const file=await asset(state,job.source);if(file.plaintext_sha256!==job.source.sha256)reject('analysis_source_changed');},validateResult:validatePixelResult,
    loadSource:async job=>{
      const {actor,state}=await liveScope(job),file=await asset(state,job.source);
      if(file.plaintext_sha256!==job.source.sha256)reject('analysis_source_changed');
      // Existing decryptAsset verifies ciphertext + plaintext SHA256 and AES-GCM.
      const content=await floorPlans.decryptAsset(base44,file);
      if(typeof content!=='string'||content.length>Math.ceil(PNG_MAX/3)*4)reject('analysis_source_invalid');
      const bytes=Uint8Array.from(atob(content),c=>c.charCodeAt(0));
      const header=[137,80,78,71,13,10,26,10];
      if(bytes.length<33||bytes.length>PNG_MAX||header.some((n,i)=>bytes[i]!==n))reject('analysis_source_invalid');
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      if(view.getUint32(8)!==13||String.fromCharCode(...bytes.slice(12,16))!=='IHDR'||view.getUint32(16)!==job.source.width||view.getUint32(20)!==job.source.height)reject('analysis_source_invalid');
      const fresh=await liveScope(job),currentFile=await asset(fresh.state,job.source);
      if(currentFile.plaintext_sha256!==job.source.sha256)reject('analysis_source_changed');
      await auditDownload({actor,file,job});
      return{mime_type:'image/png',content_base64:content,width:job.source.width,height:job.source.height,source_kind:job.source.source_kind,sha256:job.source.sha256};
    },
  });
}

export async function authenticateWorker(secret, workerId, settings) {
  const expected=settings.workerSecrets?.[workerId];
  if(typeof expected!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(expected)||typeof secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(secret))reject('worker_access_denied','Geen toegang.');
  const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([digest(expected),digest(secret)]);let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];
  if(different)reject('worker_access_denied','Geen toegang.');
  return{id:workerId};
}

export async function boundedJson(request,limit=256*1024){
  if(!request.body)throw new QueueError(400,'invalid_analysis_request','Leeg verzoek.');
  const reader=request.body.getReader(),chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new QueueError(413,'analysis_request_too_large','Verzoek is te groot.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new QueueError(400,'invalid_analysis_request','Ongeldig JSON-verzoek.');}
}
