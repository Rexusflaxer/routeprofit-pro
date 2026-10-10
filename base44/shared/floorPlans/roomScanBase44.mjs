import {createRoomScanService,RoomScanError,ACTIONS,canonical} from './roomScanCore.mjs';
import {merge,dependencies,resourcesConflict} from './scanGeometry.mjs';
const ROUTES='ObjectBuildingRoomScanRoute',EVENTS='ObjectBuildingRoomScanEvent',ARCHIVES='ObjectBuildingRoomScanArchive',WORKSPACE='ObjectBuildingFloorPlanWorkspace';
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
/** Prepared concrete provider adapter; requires the three private entity schemas
 * and authenticated route wiring in SERVER-INTEGRATION.md before activation. */
export function createBase44RoomScanService({base44,entity,floorPlans,selectionKeys,validateDesktopDocument,ApiError,sha256,now=Date.now}){
 const fail=(status,code,message)=>{throw new RoomScanError(status,code,message);};
 const one=async(name,query)=>{const rows=await entity(base44,name).filter(query,'-created_date',2);if(rows.length!==1)fail(404,'room_scan_route_missing','Deze scankoppeling is niet beschikbaar.');return rows[0];};
 const version=object=>Number.isSafeInteger(object.version)&&object.version>0?object.version:1;
 async function load(user,body,action){
  let route,scopeBody=body;
  if(body.target_id){route=await one(ROUTES,{id:body.target_id,kind:'target'});if(route.user_id!==user.id||Date.parse(route.expires_at)<=now())fail(410,'room_scan_target_expired','Kies de ruimte opnieuw.');}
  else if(!body.customer_id&&body.capture_session_id)route=await one(ROUTES,{capture_session_id:body.capture_session_id,kind:'capture'});
  if(route)scopeBody={customer_id:route.customer_id,object_id:route.object_id,building_selection_key:route.building_selection_key};
  const mutable=[ACTIONS.begin,ACTIONS.submit,ACTIONS.end,ACTIONS.place].includes(action);
  // Mutation scope also rejects archived customers, unlike the read scope.
  // Keep the target/request's original map version; never silently substitute
  // the freshly loaded server version for a stale mobile or desktop request.
  if(mutable)scopeBody={...scopeBody,expected_map_version:route?.map_version??body.expected_map_version??body.map_version};
  const scope=await floorPlans.serverOnly.scope(base44,scopeBody,mutable),entry=scope.object.floor_plan_workspace_index?.[scope.keyHash];
  let document=null;
  if(entry?.snapshot_id){const row=await one(WORKSPACE,{id:entry.snapshot_id});if(row.customer_id!==scope.customer.id||row.object_id!==scope.object.id||row.building_selection_key!==scope.key||row.workspace_id!==entry.id)fail(409,'floor_plan_pointer_invalid','Ongeldige tekenbestandkoppeling.');document=validateDesktopDocument(row.document,ApiError);}
  if(route&&(route.document_id!==document?.id||route.map_version!==version(scope.object)||!document?.floors.some(f=>f.id===route.floor_id)))fail(409,'room_scan_scope_changed','Deze scan hoort bij een eerdere tekening of gebouwselectie.');
  return {...scope,scope,entry,document,mapVersion:version(scope.object),floorId:route?.floor_id||body.floor_id,route,archived:scope.object.status==='archived'};
 }
 async function listTargets(user,objectId){
  const object=await one('SurveillanceObject',{id:objectId}),targets=[];
  for(const key of selectionKeys(object)){
   const loaded=await load(user,{customer_id:object.customer_id,object_id:object.id,building_selection_key:key});
   if(!loaded.document||!loaded.entry?.collaboration||loaded.archived)continue;
   for(const floor of loaded.document.floors){
    if(targets.length>=256)fail(413,'room_scan_target_limit','Er zijn te veel scanverdiepingen.');
    const fingerprint=await sha256(JSON.stringify([user.id,object.id,key,loaded.document.id,floor.id,loaded.mapVersion]));
    const rows=await entity(base44,ROUTES).filter({lookup_key:fingerprint,kind:'target',expires_at:{$gt:new Date(now()).toISOString()}},'-created_date',1);
    const route=rows[0]||await entity(base44,ROUTES).create({kind:'target',lookup_key:fingerprint,user_id:user.id,customer_id:loaded.customer.id,object_id:object.id,building_selection_key:key,document_id:loaded.document.id,floor_id:floor.id,map_version:loaded.mapVersion,expires_at:new Date(now()+600000).toISOString()});
    targets.push({id:route.id,customerId:loaded.customer.id,objectId:object.id,buildingSelectionKey:key,documentId:loaded.document.id,floorId:floor.id,mapVersion:loaded.mapVersion,buildingLabel:object.building_labels?.[key]||'Gebouw',floorLabel:floor.name,rooms:floor.rooms.map(r=>({id:r.id,label:r.label,polygon:r.polygon}))});
   }
  }
  return targets;
 }
 async function stageRoute(loaded,{context,userId}){
  await entity(base44,ROUTES).create({kind:'capture',capture_session_id:context.captureSessionId,user_id:userId,customer_id:loaded.customer.id,object_id:loaded.object.id,building_selection_key:loaded.key,document_id:context.documentId,floor_id:context.floorId,map_version:context.mapVersion,expires_at:context.expiresAt});
 }
 async function getEvent(loaded,reference){
  const row=await one(EVENTS,{id:reference.id});
  if(row.customer_id!==loaded.customer.id||row.object_id!==loaded.object.id||row.building_selection_key!==loaded.key||row.event_id!==reference.eventId||row.digest!==reference.digest||await sha256(JSON.stringify(canonical(row.event)))!==reference.digest)fail(409,'room_scan_event_invalid','Deze scanmeting kon niet worden gecontroleerd.');
  return row.event;
 }
 async function readArchive(loaded,reference){
  if(!reference?.id||!reference.digest||!Number.isSafeInteger(reference.ordinal))fail(409,'room_scan_archive_invalid','Het scanarchief kon niet worden gecontroleerd.');
  const row=await one(ARCHIVES,{id:reference.id});
  if(row.customer_id!==loaded.customer.id||row.object_id!==loaded.object.id||row.building_selection_key!==loaded.key||row.workspace_id!==loaded.entry.id||row.digest!==reference.digest||row.manifest?.ordinal!==reference.ordinal||await sha256(JSON.stringify(canonical(row.manifest)))!==reference.digest)fail(409,'room_scan_archive_invalid','Het scanarchief kon niet worden gecontroleerd.');
  return row.manifest;
 }
 async function readArchives(loaded,state,{offset,limit}){
  let pointer=state.archiveHead,remaining=offset;
  if(!pointer||offset>=state.archiveCount)return {sessions:[],nextOffset:null};
  // Binary ancestor links are authenticated by the canonical head digest. A
  // page deep in history takes logarithmic lookups, never a full-history read.
  let manifest=await readArchive(loaded,pointer);
  while(remaining>0){const power=Math.floor(Math.log2(remaining));pointer=manifest.ancestors[power];if(!pointer)fail(409,'room_scan_archive_invalid','Ongeldige archiefverwijzing.');manifest=await readArchive(loaded,pointer);remaining-=2**power;}
  const sessions=[];
  while(manifest&&sessions.length<limit){sessions.push(manifest.session);pointer=manifest.ancestors[0]||null;if(!pointer)break;if(sessions.length<limit)manifest=await readArchive(loaded,pointer);}
  return {sessions,nextOffset:pointer?offset+sessions.length:null};
 }
 async function validateDocument(document,loaded){const normalized=validateDesktopDocument(document,ApiError);await floorPlans.serverOnly.validateReferences(base44,loaded.scope,normalized);return normalized;}
 async function commit(loaded,entry,document,event,operation){
  const next=structuredClone(entry);
  if(event){
   const id=event.context.captureSessionId,reference=next.room_scans.sessions[id].latest;
   const row=await entity(base44,EVENTS).create({customer_id:loaded.customer.id,object_id:loaded.object.id,building_selection_key:loaded.key,capture_session_id:id,event_id:reference.eventId,digest:reference.digest,event,created_at:new Date(now()).toISOString()});
   reference.id=row.id;
  }
  if(document!==undefined){
   const row=await entity(base44,WORKSPACE).create({workspace_id:next.id,customer_id:loaded.customer.id,object_id:loaded.object.id,building_selection_key:loaded.key,version:next.version,document,operation_hash:await sha256(`${operation.user.id}:roomscan:${operation.body.operation_id||operation.body.event_id}`),request_fingerprint:operation.fingerprint,actor_id:operation.user.id,created_at:next.updated_at});
   next.snapshot_id=row.id;
  }
  for(const session of operation.archives||[]){
   const state=next.room_scans,ordinal=(state.archiveCount||0)+1,ancestors=[];
   if(state.archiveHead){ancestors.push(state.archiveHead);for(let power=1;2**power<ordinal;power++){const earlier=await readArchive(loaded,ancestors[power-1]);const pointer=earlier.ancestors[power-1];if(!pointer)break;ancestors.push(pointer);}}
   const manifest={ordinal,session,ancestors},digest=await sha256(JSON.stringify(canonical(manifest)));
   const row=await entity(base44,ARCHIVES).create({customer_id:loaded.customer.id,object_id:loaded.object.id,building_selection_key:loaded.key,workspace_id:next.id,capture_session_id:session.context.captureSessionId,manifest,digest,created_at:new Date(now()).toISOString()});
   state.archiveHead={id:row.id,digest,ordinal};state.archiveCount=ordinal;
  }
  const currentVersion=loaded.object.floor_plan_workspace_index_version;
  const revision=Number.isSafeInteger(currentVersion)?{floor_plan_workspace_index_version:currentVersion}:{$or:[{floor_plan_workspace_index_version:null},{floor_plan_workspace_index_version:{$exists:false}}]};
  const map=loaded.object.version==null?{$or:[{version:null},{version:{$exists:false}}]}:{version:loaded.object.version};
  const time=now(),conditions=[revision,map,{customer_id:loaded.customer.id,status:{$ne:'archived'}}];
  if(operation.action===ACTIONS.begin&&Date.parse(loaded.route?.expires_at)<=time)fail(410,'room_scan_target_expired','Kies de ruimte opnieuw.');
  const previous=loaded.entry.room_scans?.sessions?.[operation.body.capture_session_id];
  const needsActive=operation.action===ACTIONS.submit||operation.action===ACTIONS.end&&operation.body.status==='completed'||operation.action===ACTIONS.place&&previous?.status==='capturing';
  if(needsActive){
   if(!previous||Date.parse(previous.context.expiresAt)<=time)fail(410,'room_scan_expired','Deze scansessie is verlopen.');
   conditions.push({[`floor_plan_workspace_index.${loaded.keyHash}.room_scans.sessions.${operation.body.capture_session_id}.context.expiresAt`]:{$gt:new Date(time).toISOString()}});
  }
  const index={...(loaded.object.floor_plan_workspace_index||{}),[loaded.keyHash]:next};
  if(bytes(index)>4194304)fail(409,'floor_plan_index_limit','De scanindex is vol. Rond een scan af voordat u verdergaat.');
  const result=await entity(base44,'SurveillanceObject').updateMany({id:loaded.object.id,$and:conditions},{$set:{floor_plan_workspace_index:index,floor_plan_workspace_index_version:(Number.isSafeInteger(currentVersion)?currentVersion:0)+1}});
  return result?.success===true&&result.updated===1;
 }
 return createRoomScanService({load,commit,listTargets,stageRoute,getEvent,readArchives,merge,dependencies,resourcesConflict,validateDocument,hash:sha256,now});
}
