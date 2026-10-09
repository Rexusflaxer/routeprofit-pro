/** Shared server-only queue wiring; no user secrets or renderer capabilities. */
import {createBase44AnalysisQueue} from './base44Adapter.ts';
import {QueueError} from './queueCore.ts';
import {createBuildingFloorPlanServerServices} from './buildingFloorPlanServerServices.ts';

const to64url = (bytes:Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function readAnalysisSettings() {
  const singletonId=Deno.env.get('LOQ_AI_SERVICE_RECORD_ID')||'';
  let workerSecrets;
  try {workerSecrets=JSON.parse(Deno.env.get('LOQ_AI_WORKERS_JSON')||'{}');}
  catch {throw new QueueError(503,'analysis_not_configured','De AI-service is nog niet geconfigureerd.');}
  if(!singletonId||!workerSecrets||Array.isArray(workerSecrets)||Object.keys(workerSecrets).length<1||Object.keys(workerSecrets).length>16||Object.entries(workerSecrets).some(([id,secret])=>!/^[A-Za-z0-9_.:-]{1,100}$/.test(id)||typeof secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(secret)))throw new QueueError(503,'analysis_not_configured','De AI-service is nog niet geconfigureerd.');
  return{singletonId,workerSecrets};
}
export function createAnalysisQueueForRequest(base44,settings=readAnalysisSettings()) {
  return createBase44AnalysisQueue({base44,settings,
    floorPlans:createBuildingFloorPlanServerServices(),
    getUser:id=>base44.asServiceRole.entities.User.get(id),
    hash:async text=>to64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))),
    randomToken:()=>to64url(crypto.getRandomValues(new Uint8Array(32))),
    auditDownload:({actor,file,job})=>base44.asServiceRole.entities.ManagedFileAccessLog.create({
      managed_file_id:file.id,action:'download',actor_user_id:actor.id,
      owner_type:'object',owner_id:job.object_id,
      source_entity:'FloorPlanAnalysisJobSnapshot',source_entity_id:job.id,
      success:true,created_at:new Date().toISOString(),
      metadata:{purpose:'local_floor_plan_analysis',worker_id:job.worker_id},
    }),
  });
}
