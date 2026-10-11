/** Prepared server core. Not deployed. Every mutation is one object-index CAS.
 * Adapter contract is documented in SERVER-INTEGRATION.md. */
export const PROTOCOL = 'building-room-scan-v1';
export const WALL_MERGE = 'room-scan-wall-merge-v1';
export const ROOM_DETAILS = 'room-scan-details-v1';
export const ROOM_ORIENTATION = 'room-scan-orientation-v1';
export const ROOM_OBSERVATIONS='room-scan-observations-v1';
export const ROOM_DISCOVERY='room-object-discovery-v2';
export const CAPABILITIES = Object.freeze({room_discovery:ROOM_DISCOVERY,room_observations:ROOM_OBSERVATIONS,wall_merge:WALL_MERGE,room_details:ROOM_DETAILS,room_orientation:ROOM_ORIENTATION});
// Keep index receipts bounded: analysis results live in the queue, never in scan history.
const observationJobSummary=job=>{if(!job||typeof job.id!=='string'||job.id.length>180||!['queued','running','completed','failed','cancelled','expired'].includes(job.status))fail(503,'room_observations_unavailable','De analysewachtrij bevestigde de opdracht niet.');return Object.fromEntries(['id','status','created_at','expires_at','poll_after_ms'].filter(key=>job[key]!==undefined).map(key=>[key,job[key]]));};
const captureCapabilities=(rich,observations=false,discovery=false)=>({wall_merge:WALL_MERGE,room_orientation:ROOM_ORIENTATION,...(rich?{room_details:ROOM_DETAILS}:{}),...(rich&&observations?{room_observations:ROOM_OBSERVATIONS}:{}),...(rich&&observations&&discovery?{room_discovery:ROOM_DISCOVERY}:{})});
export const ACTIONS = Object.freeze({observe:'submit_object_building_room_observations',targets:'get_building_room_scan_targets',begin:'begin_building_room_scan',submit:'submit_building_room_scan_event',end:'end_building_room_scan',get:'get_object_building_room_scans',place:'place_object_building_room_scan'});
export class RoomScanError extends Error { constructor(status,code,message,details={}) { super(message);this.status=status;this.details={code,...details}; } }
const fail=(status,code,message,details)=>{throw new RoomScanError(status,code,message,details);};
const clone=v=>structuredClone(v), iso=t=>new Date(t).toISOString();
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k));
const identifier=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const point=v=>keys(v,['x','y'])&&number(v.x,-1000,1000)&&number(v.y,-1000,1000);
const confidence=v=>['low','medium','high','unknown'].includes(v);
const categories=new Set(['storage','refrigerator','stove','bed','sink','washerDryer','toilet','bathtub','oven','dishwasher','table','sofa','chair','fireplace','television','stairs','unknown']);
export const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const byteLength=v=>new TextEncoder().encode(JSON.stringify(v)).length;
const smallText=(v,max)=>typeof v==='string'&&v.length>0&&new TextEncoder().encode(v).length<=max&&!/[<>\u0000-\u001f]/.test(v);
const wrapDegrees=v=>(v%360+360)%360;
const angleDifference=(a,b)=>Math.abs(((a-b+540)%360)-180);
export function validateOrientation(value,event,context){
 const allowed=['schemaVersion','method','reference','headingOrientation','localYAxisBearingDegrees','headingAccuracyDegrees','spreadDegrees','sampleCount','sampleWindowSeconds','sampledAt','magneticHeadingDegrees','trueHeadingDegrees','cameraFrameTimestampSeconds','pairingDeltaMilliseconds','deviceTopLocal','cameraForwardLocal','tracking'];
 const angle=v=>number(v,0,360)&&v<360;
 const vector=v=>keys(v,['x','y','z'])&&[v.x,v.y,v.z].every(n=>number(n,-1,1))&&Math.abs(Math.hypot(v.x,v.y,v.z)-1)<=.02;
 if(!keys(value,allowed)||value.schemaVersion!==1||value.method!=='corelocation-arkit-device-top-v1'||!['true','magnetic'].includes(value.reference)||value.headingOrientation!=='portrait'||!angle(value.localYAxisBearingDegrees)||!number(value.headingAccuracyDegrees,0,20)||!number(value.spreadDegrees,0,8)||!Number.isInteger(value.sampleCount)||!number(value.sampleCount,3,32)||!number(value.sampleWindowSeconds,.4,10)||typeof value.sampledAt!=='string'||!Number.isFinite(Date.parse(value.sampledAt))||!angle(value.magneticHeadingDegrees)||(value.trueHeadingDegrees!==undefined&&!angle(value.trueHeadingDegrees))||(value.reference==='true'&&value.trueHeadingDegrees===undefined)||!number(value.cameraFrameTimestampSeconds,0,Number.MAX_SAFE_INTEGER)||!number(value.pairingDeltaMilliseconds,0,150)||!vector(value.deviceTopLocal)||!vector(value.cameraForwardLocal)||value.tracking!=='normal')fail(400,'invalid_room_scan_orientation','Ongeldige meetrichting.');
 const a=value.deviceTopLocal,b=value.cameraForwardLocal;
 const derived=wrapDegrees((value.reference==='true'?value.trueHeadingDegrees:value.magneticHeadingDegrees)-Math.atan2(a.x,-a.z)*180/Math.PI);
 if(Math.hypot(a.x,a.z)<.45||Math.abs(a.x*b.x+a.y*b.y+a.z*b.z)>.03||angleDifference(derived,value.localYAxisBearingDegrees)>value.spreadDegrees+2||Date.parse(value.sampledAt)>Date.parse(event.capturedAt)+1500||Date.parse(value.sampledAt)<Date.parse(context.expiresAt)-1205000)fail(400,'invalid_room_scan_orientation','De richting hoort niet bij deze scanmeting.');
 return value;
}
export function validateEvent(event,context,{richDetails=false}={}) {
  if(byteLength(event)>1048576)fail(413,'room_scan_too_large','Deze scanmeting is te groot.');
  if(!keys(event,['schemaVersion','context','coordinateFrameId','coordinateSystem','alignment','sequence','capturedAt','isFinal','snapshot','orientation'])||event.schemaVersion!==1||!uuid(event.coordinateFrameId)||event.coordinateSystem!=='arkit-x-negative-z-metres'||event.alignment!=='unregistered'||!Number.isSafeInteger(event.sequence)||event.sequence<1||event.sequence>100000||typeof event.isFinal!=='boolean'||typeof event.capturedAt!=='string'||!Number.isFinite(Date.parse(event.capturedAt)))fail(400,'invalid_room_scan_event','Ongeldige scanmeting.');
  const actual=event.context;
  if(!keys(actual,['captureSessionId','customerId','objectId','buildingSelectionKey','documentId','floorId','mapVersion','expiresAt','targetRoomId','targetRoomLabel']))fail(400,'invalid_room_scan_scope','Ongeldige scankoppeling.');
  for(const key of ['captureSessionId','customerId','objectId','buildingSelectionKey','documentId','floorId','mapVersion','targetRoomId','targetRoomLabel'])if(actual[key]!==context[key])fail(409,'room_scan_scope_changed','De scan hoort niet bij deze ruimte of tekening.');
  if(Date.parse(actual.expiresAt)!==Date.parse(context.expiresAt))fail(409,'room_scan_scope_changed','De scansessie heeft een andere geldigheid.');
  if(event.orientation!==undefined)validateOrientation(event.orientation,event,context);
  const snapshot=event.snapshot;
  if(!keys(snapshot,['roomId','surfaces','objects'])||!identifier(snapshot.roomId)||!Array.isArray(snapshot.surfaces)||snapshot.surfaces.length>2500||!Array.isArray(snapshot.objects??[])||(snapshot.objects??[]).length>500)fail(400,'invalid_room_scan_geometry','Ongeldige ruimtegegevens.');
  const ids=new Set();
  for(const s of snapshot.surfaces){
    if(!keys(s,['id','kind','start','end','height','bottomElevation','confidence','parentWallId','isCurved','details'])||!identifier(s.id)||ids.has(s.id)||!['wall','door','window','opening'].includes(s.kind)||!point(s.start)||!point(s.end)||!number(Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y),.001,1000)||!number(s.height,.000001,50)||!number(s.bottomElevation,-1000,1000)||!confidence(s.confidence)||(s.parentWallId!==undefined&&!identifier(s.parentWallId))||(s.isCurved!==undefined&&typeof s.isCurved!=='boolean'))fail(400,'invalid_room_scan_geometry','Ongeldig scanvlak.');
    if(s.details!==undefined&&(!richDetails||s.kind!=='door'||!keys(s.details,['isOpen'])||typeof s.details.isOpen!=='boolean'))fail(400,'invalid_room_scan_geometry','Ongeldige deurgegevens.');
    ids.add(s.id);
  }
  ids.clear();
  for(const o of snapshot.objects??[]){
    if(!keys(o,['id','category','center','width','depth','height','bottomElevation','rotationRadians','confidence','details'])||!identifier(o.id)||ids.has(o.id)||!categories.has(o.category)||!point(o.center)||![o.width,o.depth,o.height].every(v=>number(v,.000001,100))||!number(o.bottomElevation,-1000,1000)||!number(o.rotationRadians,-Math.PI*2,Math.PI*2)||!confidence(o.confidence))fail(400,'invalid_room_scan_geometry','Ongeldig gescand object.');
    if(o.details!==undefined){const d=o.details;if(!richDetails||!keys(d,['parentObjectId','attributes'])||(d.parentObjectId!==undefined&&!smallText(d.parentObjectId,128))||!Array.isArray(d.attributes)||d.attributes.length>16||d.attributes.some(a=>!keys(a,['type','value'])||!smallText(a.type,80)||!smallText(a.value,80))||new Set(d.attributes.map(a=>JSON.stringify([a.type,a.value]))).size!==d.attributes.length)fail(400,'invalid_room_scan_geometry','Ongeldige objectdetails.');}
    ids.add(o.id);
  }
  return clone(event);
}
export function validateTransform(value){
 if(!keys(value,['angleRadians','scale','translation'])||!number(value.angleRadians,-Math.PI*2,Math.PI*2)||value.scale!==1||!keys(value.translation,['x','y'])||!number(value.translation.x,-100000,100000)||!number(value.translation.y,-100000,100000))fail(400,'invalid_room_scan_transform','Een scan wordt op ware grootte geplaatst.');
 return clone(value);
}
export function validateWallContacts(value=[]){
 if(!Array.isArray(value)||value.length>2)fail(400,'invalid_room_scan_wall_contacts','Kies maximaal twee aansluitende muren.');
 const contacts=value.map(item=>{
  if(!keys(item,['source_wall_id','target_wall_id'])||!identifier(item.source_wall_id)||!identifier(item.target_wall_id))fail(400,'invalid_room_scan_wall_contacts','Ongeldige muuraansluiting.');
  return {source_wall_id:item.source_wall_id,target_wall_id:item.target_wall_id};
 }).sort((a,b)=>a.source_wall_id.localeCompare(b.source_wall_id)||a.target_wall_id.localeCompare(b.target_wall_id));
 if(new Set(contacts.map(item=>JSON.stringify(item))).size!==contacts.length)fail(400,'invalid_room_scan_wall_contacts','Een muuraansluiting mag maar eenmaal worden opgegeven.');
 return contacts;
}
function boundOperationReceipts(operations){
 const entries=Object.entries(operations).slice(-128);
 const size=([key,value])=>byteLength(key)+1+byteLength(value);
 let bytes=2+entries.reduce((total,item)=>total+size(item),0)+Math.max(0,entries.length-1);
 // Retain the newest outcome even when a single receipt exceeds the budget.
 // Evicted operations still cannot reapply with an old placement revision.
 while(entries.length>1&&bytes>1048576)bytes-=size(entries.shift())+1;
 return Object.fromEntries(entries);
}
const placementReceipt=(receipt,entry,replayed=false)=>({protocol:PROTOCOL,capabilities:CAPABILITIES,
 applied_sequence:receipt.appliedSequence,placement_status:receipt.status,placement_revision:receipt.placementRevision,
 workspace_version:receipt.workspaceVersion??entry.version,committed_version:receipt.committedVersion??null,
 affected_wall_ids:receipt.affectedWallIds||[],protected_ids:receipt.protectedIds||[],conflicts:receipt.conflicts||[],...(replayed?{replayed:true}:{})});
const scopeOf=loaded=>({customerId:loaded.customer.id,objectId:loaded.object.id,buildingSelectionKey:loaded.key,documentId:loaded.document.id,floorId:loaded.floorId,mapVersion:loaded.mapVersion});
const stateOf=entry=>clone({archiveHead:null,archiveCount:0,closedReceipts:{},...(entry.room_scans||{protocol:PROTOCOL,generation:0,sessions:{},begins:{},operations:{}})});
/** load must authenticate scope on EVERY attempt, including receipt replay.
 * commit stages immutable events/documents then atomically swaps pointer+entry.
 * listTargets/stageRoute expose no authority beyond an authenticated lookup. */
export function createRoomScanService({load,commit,listTargets,stageRoute,getEvent,readArchives,merge,dependencies,resourcesConflict,validateDocument,observe,hash,now=Date.now,randomId=()=>crypto.randomUUID()}){
 const actions=new Set(Object.values(ACTIONS));
 const currentSession=(loaded,state,id)=>{const s=state.sessions[id];if(!s)fail(404,'room_scan_not_found','Deze scansessie bestaat niet.');const floor=loaded.document.floors.find(f=>f.id===s.context.floorId);if(!floor||s.context.documentId!==loaded.document.id||s.context.mapVersion!==loaded.mapVersion)fail(409,'room_scan_scope_changed','De tekening of gebouwselectie is veranderd. Start een nieuwe scan.');return s;};
 const assertOwner=(session,user)=>{if(session.userId!==user.id)fail(403,'room_scan_forbidden','Deze scan behoort aan een andere gebruiker.');};
 const assertActive=(session,time)=>{if(session.status!=='capturing')fail(409,'room_scan_closed','Deze scan is al afgesloten.');if(Date.parse(session.context.expiresAt)<=time)fail(410,'room_scan_expired','Deze scansessie is verlopen.');};
 async function applySnapshot(loaded,entry,session,event,time){
   if(!session.placement)return {document:loaded.document,changed:false};
   const result=await merge(loaded.document,session,event,session.placement.transform);
   if(result.status==='invalid'||result.status==='ignored')fail(409,'room_scan_merge_invalid','De scan kan niet veilig in deze tekening worden verwerkt.');
   // The geometry reads existing host walls even when the document does not
   // change. Expand those reads through the same joint/room/opening rules as
   // ordinary edits. The object-index CAS rechecks leases on concurrent writes.
   const readResources=result.readResources||[];
   if(!Array.isArray(readResources)||readResources.length>10000)fail(409,'room_scan_merge_invalid','De scan bevat te veel muurafhankelijkheden.');
   const required=dependencies(loaded.document,result.document,readResources);
   const leases=Object.values(entry.collaboration?.leases||{}).filter(l=>l.expires_at_ms>time&&entry.collaboration?.sessions?.[l.session_id]?.expires_at_ms>time);
   const blocked=leases.find(l=>l.resource_ids.some(a=>required.some(b=>resourcesConflict(a,b))));
   if(blocked){session.placement.status='waiting_for_edit';session.placement.committedVersion=null;session.placement.affectedWallIds=[];session.placement.conflicts=[{code:'resource_busy',resourceIds:required}];return {document:loaded.document,changed:false};}
   const document=await validateDocument(result.document,loaded);
   session.mergeState=result.state;
   if(result.sessionPatch)Object.assign(session,clone(result.sessionPatch));
   const changed=!same(loaded.document,document);
   session.placement={...session.placement,status:'applied',appliedSequence:event.sequence,protectedIds:result.protected||[],conflicts:result.conflicts||[],
     committedVersion:entry.version+(changed?1:0),affectedWallIds:[...new Set(result.affectedWallIds||[])]};
   return {document,changed};
 }
 async function handle(action,user,body){
   if(!actions.has(action))fail(400,'invalid_room_scan_action','Onbekende scanactie.');
   if(!user?.id||user.role!=='admin')fail(403,'room_scan_forbidden','Alleen bevoegde LOQ-beheerders kunnen gebouwen scannen.');
   if(!body||byteLength(body)>(action===ACTIONS.observe?9*1024*1024:1100000))fail(413,'room_scan_too_large','Dit scanverzoek is te groot.');
   if(action===ACTIONS.observe&&(!keys(body,['capture_session_id','coordinate_frame_id','snapshot_sequence','observation_batch'])||!uuid(body.coordinate_frame_id)||!Number.isSafeInteger(body.snapshot_sequence)||body.snapshot_sequence<1||!body.observation_batch||typeof body.observation_batch!=='object'||Array.isArray(body.observation_batch)))fail(400,'invalid_room_observations','Ongeldige inrichtingbeelden.');
   if(action===ACTIONS.targets){if(!identifier(body.object_id))fail(400,'invalid_room_scan_scope','Kies een geldig object.');return {protocol:PROTOCOL,capabilities:CAPABILITIES,targets:await listTargets(user,body.object_id)};}
   if(action===ACTIONS.begin&&!identifier(body.target_id))fail(400,'invalid_room_scan_scope','Kies een geldig scandoel.');
   if([ACTIONS.submit,ACTIONS.end,ACTIONS.place,ACTIONS.observe].includes(action)&&!uuid(body.capture_session_id))fail(400,'invalid_room_scan_scope','Kies een geldige scansessie.');
   if([ACTIONS.begin,ACTIONS.place].includes(action)&&body.required_room_details!==undefined&&body.required_room_details!==ROOM_DETAILS)fail(409,'room_scan_capability_mismatch','Werk LOQ bij voor deze scangegevens.',{capabilities:CAPABILITIES});
   if(action===ACTIONS.begin&&body.required_room_observations!==undefined&&(body.required_room_observations!==ROOM_OBSERVATIONS||body.required_room_details!==ROOM_DETAILS))fail(409,'room_scan_capability_mismatch','Werk LOQ bij voor inrichtingherkenning.',{capabilities:CAPABILITIES});
   if(action===ACTIONS.begin&&body.required_room_discovery!==undefined&&(body.required_room_discovery!==ROOM_DISCOVERY||body.required_room_observations!==ROOM_OBSERVATIONS||body.required_room_details!==ROOM_DETAILS))fail(409,'room_scan_capability_mismatch','Werk LOQ bij voor het herkennen van extra objecten.',{capabilities:CAPABILITIES});
   if(action===ACTIONS.place){
     if(body.required_wall_merge!==undefined&&body.required_wall_merge!==WALL_MERGE)fail(409,'room_scan_capability_mismatch','Werk LOQ bij om deze scan veilig samen te voegen.',{capabilities:CAPABILITIES});
     // Order is not a semantic difference, so an identical retry may reorder
     // its two confirmed contacts without creating another operation.
     if(body.wall_contacts!==undefined)body={...body,wall_contacts:validateWallContacts(body.wall_contacts)};
   }
   const fingerprint=await hash(JSON.stringify(canonical({action,body})));
   for(let attempt=0;attempt<8;attempt++){
     const loaded=await load(user,body,action),time=now();
     if(!loaded.document||!loaded.entry?.collaboration)fail(409,'room_scan_workspace_required','Open de gebouwplattegrond eerst in LOQ Desktop.');
     if(loaded.archived)fail(409,'object_archived','Dit object is gearchiveerd.');
     const entry=clone(loaded.entry),state=stateOf(entry);let document=loaded.document,changed=false,eventToStage=null,response,routeToStage=null;
     if(state.protocol!==PROTOCOL)fail(409,'room_scan_protocol_invalid','Werk de app bij om deze scan te openen.');
     if(action===ACTIONS.get){
       const offset=body.archive_offset??0;
       if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)fail(400,'invalid_room_scan_cursor','Ongeldige scanarchiefpagina.');
       const archived=await readArchives(loaded,state,{offset,limit:20});
       const sessions=[];
       for(const [s,isArchived] of [...Object.values(state.sessions).map(s=>[s,false]),...archived.sessions.map(s=>[s,true])]){
         if(s.context.documentId!==document.id||s.context.mapVersion!==loaded.mapVersion||!document.floors.some(f=>f.id===s.context.floorId)||s.status==='cancelled'&&!s.placement?.appliedSequence)continue;
         const event=s.latest?await getEvent(loaded,s.latest):null;
         sessions.push({capture_session_id:s.context.captureSessionId,status:s.status==='capturing'&&Date.parse(s.context.expiresAt)<=time?'expired':s.status,context:s.context,sequence:s.sequence,event,placement:s.placement||null,placement_revision:s.placementRevision||0,rich_details:s.richDetails===true,observation_job:s.observationJob||null,furnishing_bindings:(s.mergeState?.elements||[]).filter(e=>e.kind==='furnishing'&&e.status==='active').map(e=>({source_id:e.sourceId,element_id:e.elementId,baseline:e.baseline})),archived:isArchived});
       }
       return {protocol:PROTOCOL,capabilities:CAPABILITIES,server_time:iso(time),cursor:state.generation,workspace_version:entry.version,sessions,archive_offset:offset,next_archive_offset:archived.nextOffset,archive_count:state.archiveCount};
     }
     if(action===ACTIONS.begin){
       if(!uuid(body.request_id))fail(400,'invalid_room_scan_request','Een scansleutel is verplicht.');
       const beginKey=await hash(`${user.id}:${body.request_id}`),prior=state.begins[beginKey];
       if(prior){if(prior.fingerprint!==fingerprint)fail(409,'room_scan_request_reused','Deze scansleutel is anders gebruikt.');const context=prior.context||state.sessions[prior.sessionId]?.context;if(!context)fail(410,'room_scan_expired','Deze scansessie is verlopen.');return {protocol:PROTOCOL,capabilities:captureCapabilities(prior.richDetails===true,prior.observationsEnabled===true,prior.discoveryEnabled===true),context};}
       const floor=document.floors.find(f=>f.id===loaded.floorId);
       if(!floor)fail(409,'room_scan_scope_changed','Deze verdieping bestaat niet meer.');
       const existing=typeof body.room_id==='string',creating=typeof body.new_room_label==='string';
       if(existing===creating)fail(400,'invalid_room_scan_target','Kies een bestaande ruimte of geef een nieuwe ruimte een naam.');
       const room=existing?floor.rooms.find(r=>r.id===body.room_id):null;
       const label=room?.label??body.new_room_label?.trim();
       if(existing&&!room||!label||label.length>120||/[<>\u0000-\u001f]/.test(label))fail(400,'invalid_room_scan_target','Kies een geldige ruimte.');
       if(Object.values(state.sessions).some(s=>s.userId===user.id&&s.status==='capturing'&&Date.parse(s.context.expiresAt)>time))fail(409,'room_scan_already_active','Rond de huidige ruimtescan eerst af.');
       if(Object.values(state.sessions).filter(s=>s.status==='capturing'&&Date.parse(s.context.expiresAt)>time).length>=32)fail(429,'room_scan_session_limit','Er zijn te veel gelijktijdige scans in dit gebouw.');
       const id=randomId(),context={captureSessionId:id,...scopeOf(loaded),expiresAt:iso(Math.floor((time+1200000)/1000)*1000),...(room?{targetRoomId:room.id}:{}),targetRoomLabel:label};
       const richDetails=body.required_room_details===ROOM_DETAILS;
       state.sessions[id]={context,richDetails,observationsEnabled:body.required_room_observations===ROOM_OBSERVATIONS,discoveryEnabled:body.required_room_discovery===ROOM_DISCOVERY,userId:user.id,createdAt:time,status:'capturing',sequence:0,latest:null,receipts:{},placement:null,placementRevision:0,mergeState:null};
       state.begins[beginKey]={fingerprint,sessionId:id,context,richDetails,observationsEnabled:body.required_room_observations===ROOM_OBSERVATIONS,discoveryEnabled:body.required_room_discovery===ROOM_DISCOVERY,expiresAt:Date.parse(loaded.route?.expires_at)||time+600000};routeToStage={context,userId:user.id};response={protocol:PROTOCOL,capabilities:captureCapabilities(richDetails,body.required_room_observations===ROOM_OBSERVATIONS,body.required_room_discovery===ROOM_DISCOVERY),context};
     }else{
       if(action===ACTIONS.end&&!state.sessions[body.capture_session_id]){
         const receipt=state.closedReceipts[body.capture_session_id];
         if(receipt){assertOwner(receipt,user);if(!['completed','cancelled'].includes(body.status))fail(400,'invalid_room_scan_status','Ongeldige afsluiting.');if(receipt.status==='completed'||receipt.status===body.status)return {status:receipt.status};fail(409,'room_scan_closed','Deze scan is al afgesloten.');}
       }
       // Recent successful place receipts remain replayable after archiving.
       // Load/scope checks still ran; unknown retired requests fail below.
       if(action===ACTIONS.place){
         if(!uuid(body.operation_id))fail(400,'invalid_room_scan_request','Een plaatsingssleutel is verplicht.');
         const prior=state.operations[await hash(`${user.id}:${body.operation_id}`)];
         if(prior){
           if(body.document_id!==document.id||body.map_version!==loaded.mapVersion)fail(409,'room_scan_scope_changed','De tekening of kaart is veranderd.');
           if(prior.fingerprint!==fingerprint)fail(409,'room_scan_operation_reused','Deze plaatsingssleutel is anders gebruikt.');
           return placementReceipt(prior,entry,true);
         }
       }
       if(action===ACTIONS.observe&&!state.sessions[body.capture_session_id]){
         const receipt=state.closedReceipts[body.capture_session_id],prior=receipt?.observation;
         if(prior){
           assertOwner(receipt,user);
           const context=prior.context;
           if(receipt.status==='cancelled'||prior.observationsEnabled!==true||prior.richDetails!==true||time>=prior.expiresAt||context.customerId!==loaded.customer.id||context.objectId!==loaded.object.id||context.buildingSelectionKey!==loaded.key||context.documentId!==document.id||context.mapVersion!==loaded.mapVersion||!document.floors.some(f=>f.id===context.floorId))fail(409,'room_observation_scope_changed','Deze beelden horen niet meer bij de actuele ruimtescan.');
           if(prior.fingerprint!==fingerprint)fail(409,'room_observation_reused','Deze scanbeelden zijn met andere inhoud herhaald.');
           return {accepted:true,job:clone(prior.job),replayed:true};
         }
       }
       const session=currentSession(loaded,state,body.capture_session_id);
       if(action===ACTIONS.observe){
         assertOwner(session,user);
         if(!session.observationsEnabled||!session.richDetails||session.status==='cancelled'||!session.finalSequence||session.finalSequence!==body.snapshot_sequence||session.sequence!==body.snapshot_sequence||session.coordinateFrameId!==body.coordinate_frame_id||!session.latest||time>=session.createdAt+86400000)fail(409,'room_observation_scope_changed','Deze beelden horen niet bij de afgeronde meting.');
         if(session.observationFingerprint){if(session.observationFingerprint!==fingerprint)fail(409,'room_observation_reused','Deze scanbeelden zijn met andere inhoud herhaald.');return {accepted:true,job:session.observationJob,replayed:true};}
         if(!observe)fail(503,'room_observations_unavailable','Inrichtingherkenning is nog niet beschikbaar.');
         const event=await getEvent(loaded,session.latest);
         const result=await observe(loaded,session,event,user,body);
         session.observationJob=observationJobSummary(result.job);session.observationFingerprint=fingerprint;
         response={accepted:true,job:session.observationJob};
       }else if(action===ACTIONS.submit){
         assertOwner(session,user);
         const event=validateEvent(body.event,session.context,{richDetails:session.richDetails===true});
         if(body.event_id!==`${body.capture_session_id}:${event.coordinateFrameId}:${event.sequence}`)fail(400,'invalid_room_scan_event_id','Ongeldige scanmetingssleutel.');
         const digest=await hash(JSON.stringify(canonical(event))),prior=session.receipts[String(event.sequence)];
         if(prior){if(prior.digest!==digest||prior.eventId!==body.event_id)fail(409,'room_scan_event_reused','Deze scanmeting is met andere inhoud herhaald.');return {eventId:body.event_id,sequence:event.sequence,accepted:true,replayed:true};}
         assertActive(session,time);
         if(session.finalSequence||event.sequence<=session.sequence)fail(409,'room_scan_stale_event','Deze meting is ouder dan de nieuwste scan.');
         if(session.coordinateFrameId&&session.coordinateFrameId!==event.coordinateFrameId||session.roomId&&session.roomId!==event.snapshot.roomId)fail(409,'room_scan_frame_changed','Begin een nieuwe scan voor een andere ruimte of meetrichting.');
         if(Date.parse(event.capturedAt)>time+60000||Date.parse(event.capturedAt)<session.createdAt-5000)fail(400,'invalid_room_scan_time','Ongeldige scantijd.');
         if(session.lastAcceptedAt&&time-session.lastAcceptedAt<450)fail(429,'room_scan_rate_limited','De volgende scanmeting kan zo worden verstuurd.',{retryAfterMs:450-(time-session.lastAcceptedAt)});
         const applied=await applySnapshot(loaded,entry,session,event,time);document=applied.document;changed=applied.changed;
         session.coordinateFrameId=event.coordinateFrameId;session.roomId=event.snapshot.roomId;session.sequence=event.sequence;session.lastAcceptedAt=time;
         session.latest={id:null,digest,eventId:body.event_id,sequence:event.sequence};eventToStage=event;
         session.receipts=Object.fromEntries([...Object.entries(session.receipts),[String(event.sequence),{digest,eventId:body.event_id}]].slice(-64));
         if(event.isFinal)session.finalSequence=event.sequence;
         response={eventId:body.event_id,sequence:event.sequence,accepted:true,placementStatus:session.placement?.status||'unregistered'};
       }else if(action===ACTIONS.end){
         assertOwner(session,user);
         if(!['completed','cancelled'].includes(body.status))fail(400,'invalid_room_scan_status','Ongeldige afsluiting.');
         if(session.status==='completed'||session.status==='cancelled'){if(session.status!==body.status&&session.status!=='completed')fail(409,'room_scan_closed','Deze scan is geannuleerd.');return {status:session.status};}
         if(body.status==='completed'){assertActive(session,time);if(!session.finalSequence||session.latest?.sequence!==session.finalSequence)fail(409,'room_scan_final_required','Wacht tot de laatste meting is opgeslagen.');}
         session.status=body.status;response={status:session.status};
       }else if(action===ACTIONS.place){
         if(session.richDetails===true&&body.required_room_details!==ROOM_DETAILS)fail(409,'room_scan_client_update_required','Werk LOQ Desktop bij voor deze uitgebreide ruimtescan.',{capabilities:CAPABILITIES});
         if(!uuid(body.operation_id))fail(400,'invalid_room_scan_request','Een plaatsingssleutel is verplicht.');
         if(body.document_id!==document.id||body.map_version!==loaded.mapVersion||body.coordinate_frame_id!==session.coordinateFrameId)fail(409,'room_scan_scope_changed','De tekening, kaart of scanrichting is veranderd.');
         const operationKey=await hash(`${user.id}:${body.operation_id}`),prior=state.operations[operationKey];
         if(prior){if(prior.fingerprint!==fingerprint)fail(409,'room_scan_operation_reused','Deze plaatsingssleutel is anders gebruikt.');return placementReceipt(prior,entry,true);}
         if(session.status==='cancelled'||(session.status==='capturing'&&Date.parse(session.context.expiresAt)<=time)||session.status==='completed'&&time>=session.createdAt+86400000)fail(409,'room_scan_closed','Deze scan is afgesloten.');
         if(!Number.isSafeInteger(body.expected_placement_revision)||body.expected_placement_revision!==(session.placementRevision||0))fail(409,'room_scan_placement_changed','Deze scanplaatsing is bijgewerkt. Controleer de actuele plaatsing.');
         if(body.expected_version!==entry.version)fail(409,'room_scan_workspace_changed','De tekening is bijgewerkt. Controleer de actuele plaatsing.');
         if(body.sequence!==session.sequence||!session.latest)fail(409,'room_scan_snapshot_changed','Er staat een nieuwere scan klaar.');
         const transform=validateTransform(body.transform);
         if(session.placement&&session.placement.appliedSequence&&!same(session.placement.transform,transform))fail(409,'room_scan_already_placed','Deze scan is al ingevoegd. Pas de muren in de tekening aan.');
         const event=await getEvent(loaded,session.latest);
         const floor=document.floors.find(f=>f.id===session.context.floorId);
         const wallContacts=(body.wall_contacts||[]).map(item=>({sourceWallId:item.source_wall_id,targetWallId:item.target_wall_id}));
         for(const contact of wallContacts)if(!event.snapshot.surfaces.some(s=>s.id===contact.sourceWallId&&s.kind==='wall'&&!s.isCurved)||!floor?.walls.some(w=>w.id===contact.targetWallId))fail(409,'room_scan_wall_contact_changed','Deze muuraansluiting is veranderd. Controleer de plaatsing opnieuw.');
         if(session.placement?.appliedSequence&&!same(session.placement.wallContacts||[],wallContacts))fail(409,'room_scan_already_placed','Deze scan is al ingevoegd. Pas de muren in de tekening aan.');
         session.placement={...(session.placement||{}),transform,wallContacts,sequence:event.sequence,status:'placing'};
         const applied=await applySnapshot(loaded,entry,session,event,time);document=applied.document;changed=applied.changed;
         session.placementRevision=(session.placementRevision||0)+1;
         state.operations[operationKey]={fingerprint,sessionId:session.context.captureSessionId,sequence:event.sequence,appliedSequence:session.placement.appliedSequence||0,status:session.placement.status,placementRevision:session.placementRevision,
           workspaceVersion:entry.version+(changed?1:0),committedVersion:session.placement.status==='applied'?session.placement.committedVersion:null,
           affectedWallIds:session.placement.affectedWallIds||[],protectedIds:session.placement.protectedIds||[],conflicts:session.placement.conflicts||[]};
         state.operations=boundOperationReceipts(state.operations);
         response=placementReceipt(state.operations[operationKey],entry);
       }
     }
     // Terminal session history is immutable and linked from one authoritative
     // archive head. Completed unplaced/waiting scans remain mutable for 24h.
     // Receipt eviction is safe: old place revisions cannot become new writes.
     const archives=[];
     for(const [id,s] of Object.entries(state.sessions)){
       const expired=s.status==='capturing'&&Date.parse(s.context.expiresAt)<=time||s.status==='completed'&&time>=s.createdAt+86400000;
       if(s.status!=='cancelled'&&!expired&&!(s.status==='completed'&&s.placement?.status==='applied'&&(!s.observationsEnabled||s.observationJob)))continue;
       if(s.latest)archives.push({...s,status:expired?'expired':s.status,archivedAt:time});
       state.closedReceipts[id]={userId:s.userId,status:s.status==='capturing'?'expired':s.status,...(s.observationFingerprint?{observation:{fingerprint:s.observationFingerprint,job:s.observationJob,context:s.context,observationsEnabled:s.observationsEnabled===true,richDetails:s.richDetails===true,expiresAt:s.createdAt+86400000}}:{})};
       delete state.sessions[id];
     }
     state.closedReceipts=Object.fromEntries(Object.entries(state.closedReceipts).slice(-128));
     state.begins=Object.fromEntries(Object.entries(state.begins).filter(([,receipt])=>(receipt.expiresAt||0)>time));
     state.generation++;entry.room_scans=state;
     if(changed){entry.version++;entry.updated_at=iso(time);entry.collaboration.generation++;}
     if(routeToStage)await stageRoute(loaded,routeToStage);
     // Adapter validates active session deadline again immediately before CAS.
     // A staged event/doc on failed CAS remains unreachable and is not accepted.
     const committed=await commit(loaded,entry,changed?document:undefined,eventToStage,{action,user,body,fingerprint,archives});
     if(committed)return response;
   }
   fail(409,'room_scan_busy','De tekening is gelijktijdig bijgewerkt. Probeer opnieuw.',{retryable:true});
 }
 return {actions,handle};
}
