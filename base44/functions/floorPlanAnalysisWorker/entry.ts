// Proposed separate Base44 function. Paths are the post-integration paths.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createAnalysisQueueForRequest, readAnalysisSettings } from '../../shared/floorPlans/floorPlanAnalysisRuntime.ts';
import { authenticateWorker, boundedJson } from '../../shared/floorPlans/base44Adapter.ts';
import { maintainAfterWorkerHeartbeat } from '../../shared/floorPlans/analysisMaintenance.ts';

export default async function handleFloorPlanAnalysisWorker(request: Request) {
  if(request.method!=='POST')return Response.json({error:'Alleen POST is toegestaan.'},{status:405,headers:{'Cache-Control':'no-store'}});
  try {
    const settings=readAnalysisSettings();
    const body=await boundedJson(request);
    const worker=await authenticateWorker(request.headers.get('x-loq-ai-worker-secret'),body?.worker_id,settings);
    // A worker credential never becomes a user/admin session or general API capability.
    const base44=createClientFromRequest(request);
    const queue=createAnalysisQueueForRequest(base44,settings);
    const result=await queue.worker(worker,body);
    await maintainAfterWorkerHeartbeat(base44,settings,body);
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const status=Number.isInteger(error.status)&&error.status>=400&&error.status<600?error.status:503;
    return Response.json({error:status===503?'De analysewachtrij is tijdelijk niet beschikbaar.':error.message,details:{code:error.details?.code||'analysis_service_unavailable'}},{status,headers:{'Cache-Control':'no-store'}});
  }
}
