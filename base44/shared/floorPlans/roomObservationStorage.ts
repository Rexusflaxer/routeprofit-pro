import {QueueError} from './queueCore.ts';
import {createAnalysisQueueForRequest} from './floorPlanAnalysisRuntime.ts';
import {validateRoomObjectSource,validateRoomObjectResult} from './roomObjectContract.mjs';
import {validateRoomDiscoverySource,validateRoomDiscoveryResult,ROOM_DISCOVERY_TASK} from './roomDiscoveryContract.mjs';
export {validateRoomObjectResult};
export const validateRoomObservationResult=(result,source)=>source.task===ROOM_DISCOVERY_TASK?validateRoomDiscoveryResult(result,source):validateRoomObjectResult(result,source);
const fail=()=>{throw new QueueError(409,'room_observation_scope_changed','Deze beelden horen niet meer bij de actuele ruimtescan.');};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const encoded=value=>new TextEncoder().encode(JSON.stringify(value));
const to64=bytes=>{let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);return btoa(raw);};
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoded(canonical(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');

/** Staging archive rows are not authority: authenticate a candidate against the
 * canonical head and its binary ancestor links before using its session. */
export async function canonicalCaptureSession(base44,state,entry,id){
 const scans=entry.room_scans,active=scans?.sessions?.[id];if(active)return active;
 const head=scans?.archiveHead;if(!head)return null;
 const entity=base44.asServiceRole.entities.ObjectBuildingRoomScanArchive;
 const read=async pointer=>{const row=await entity.get(pointer.id);if(!row||row.customer_id!==state.customer.id||row.object_id!==state.object.id||row.building_selection_key!==state.key||row.workspace_id!==entry.id||row.digest!==pointer.digest||row.manifest?.ordinal!==pointer.ordinal||await digest(row.manifest)!==pointer.digest)fail();return row;};
 const candidates=await entity.filter({customer_id:state.customer.id,object_id:state.object.id,building_selection_key:state.key,workspace_id:entry.id,capture_session_id:id},'-created_date',8);
 for(const candidate of candidates||[]){
  const ordinal=candidate.manifest?.ordinal;if(!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>head.ordinal)continue;
  let pointer=head,row=await read(pointer),distance=head.ordinal-ordinal,steps=0;
  while(distance>0&&steps++<32){const power=Math.floor(Math.log2(distance));pointer=row.manifest.ancestors?.[power];if(!pointer)fail();row=await read(pointer);distance-=2**power;}
  if(distance===0&&row.id===candidate.id&&row.manifest.session?.context?.captureSessionId===id)return row.manifest.session;
 }
 return null;
}

/** Called only after roomScanCore authorizes the owner, opt-in and exact final
 * event. The worker receives validated images, never user-provided URLs. */
export async function storeRoomObservations({base44,floorPlans,loaded,session,event,user,body,hash}){
 const discovery=session.discoveryEnabled===true;
 const source={task:discovery?ROOM_DISCOVERY_TASK:'room-object-classification-v1',captureSessionId:session.context.captureSessionId,sequence:event.sequence,...(discovery?{coordinateFrameId:event.coordinateFrameId,snapshot:event.snapshot}:{}),observation_batch:body.observation_batch};
 if(discovery)await validateRoomDiscoverySource(source);else await validateRoomObjectSource(source);
 const measured=new Map((event.snapshot.objects||[]).map(object=>[object.id,object]));
 for(const object of source.observation_batch.objects){
  const original=measured.get(object.id);
  if(!original||object.category!==original.category||['width','depth','height'].some(key=>Math.abs(object.dimensions[key]-original[key])>1e-6))fail();
 }
 const context=session.context;
 const scope={customer_id:loaded.customer.id,object_id:loaded.object.id,building_selection_key:loaded.key,expected_map_version:loaded.mapVersion,idempotency_key:`room-observations:${context.captureSessionId}:${event.sequence}`};
 const metadata={observation_protocol:discovery?ROOM_DISCOVERY_TASK:'room-scan-observations-v1',capture_user_id:user.id,capture_session_id:context.captureSessionId,coordinate_frame_id:event.coordinateFrameId,snapshot_sequence:event.sequence,document_id:context.documentId,floor_id:context.floorId,map_version:context.mapVersion,accepted_event_digest:session.latest.digest,observation_expires_at:new Date(session.createdAt+86400000).toISOString()};
 const fingerprint=await hash(JSON.stringify(canonical({metadata,source})));
 const saved=await floorPlans.storeRoomObservationAsset(base44,user,scope,{kind:'room_observations',mime_type:'application/json',content_base64:to64(encoded(source))},metadata,fingerprint);
 // The queue's CAS is authoritative for this idempotent job. The scan CAS may
 // retry after upload changes the index, without starting a second analysis.
 return createAnalysisQueueForRequest(base44).client(user,{action:'create_object_floor_plan_analysis_job',...scope,source:{file_id:saved.file_id,source_kind:discovery?'room-discovery':'room-objects',width:1,height:1}});
}

export async function validateRoomObservationBinding({base44,state,file,actorId}){
 const meta=file.metadata,expires=Date.parse(file.metadata?.observation_expires_at);
 if(!Number.isFinite(expires)||!meta||!['room-scan-observations-v1',ROOM_DISCOVERY_TASK].includes(meta.observation_protocol)||actorId&&meta.capture_user_id!==actorId||file.uploaded_by!==meta.capture_user_id||meta.map_version!==(state.object.version??1)||expires<=Date.now())fail();
 const entry=state.object.floor_plan_workspace_index?.[state.keyHash];
 if(!entry?.snapshot_id)fail();
 const session=await canonicalCaptureSession(base44,state,entry,meta.capture_session_id);
 if(!session||meta.observation_protocol===ROOM_DISCOVERY_TASK&&session.discoveryEnabled!==true||!session.observationsEnabled||!session.richDetails||session.userId!==meta.capture_user_id||session.status==='cancelled'||session.context.documentId!==meta.document_id||session.context.floorId!==meta.floor_id||session.context.mapVersion!==meta.map_version||session.finalSequence!==meta.snapshot_sequence||session.sequence!==meta.snapshot_sequence||session.coordinateFrameId!==meta.coordinate_frame_id||session.latest?.digest!==meta.accepted_event_digest)fail();
 const workspace=await base44.asServiceRole.entities.ObjectBuildingFloorPlanWorkspace.get(entry.snapshot_id);
 if(workspace?.workspace_id!==entry.id||workspace.customer_id!==state.customer.id||workspace.object_id!==state.object.id||workspace.building_selection_key!==state.key||workspace.document?.id!==meta.document_id||!workspace.document.floors?.some(f=>f.id===meta.floor_id))fail();
 return meta;
}

export async function readRoomObservationSource({base44,floorPlans,state,file,actorId}){
 const meta=await validateRoomObservationBinding({base44,state,file,actorId});
 const content=await floorPlans.decryptAsset(base44,file);
 if(typeof content!=='string'||content.length>12*1024*1024)fail();
 let source;try{source=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(content),c=>c.charCodeAt(0))));}catch{fail();}
 if(meta.observation_protocol===ROOM_DISCOVERY_TASK){
  if(source.task!==ROOM_DISCOVERY_TASK||source.coordinateFrameId!==meta.coordinate_frame_id)fail();
  await validateRoomDiscoverySource(source);
 }else await validateRoomObjectSource(source);
 if(source.captureSessionId!==meta.capture_session_id||source.sequence!==meta.snapshot_sequence)fail();
 return source;
}
