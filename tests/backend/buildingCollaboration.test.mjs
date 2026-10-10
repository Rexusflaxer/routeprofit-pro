import test from 'node:test';
import assert from 'node:assert/strict';
import {createBuildingCollaboration, ACTIONS, CollaborationError, LEASE_MS, SESSION_MS} from '../../base44/shared/floorPlans/buildingCollaboration.mjs';
import {diffDocuments, resourceId, applyChanges, dependencyResources, splitDocument, resourcesConflict} from '../../base44/shared/floorPlans/collabDocument.mjs';
import {validateDesktopDocument} from '../../base44/shared/floorPlans/buildingFloorPlans.ts';

class ApiError extends Error { constructor(status, message, details) { super(message); this.status = status; this.details = details; } }
const scope = {customer_id: 'customer-1', object_id: 'object-1', building_selection_key: 'bag:123', expected_map_version: 3};
const user = {id: 'user-1', role: 'admin', full_name: 'David'};
const wall = (id, x, y, endX, endY) => ({id, start:{x,y}, end:{x:endX,y:endY}, thickness:.2});
function document() {
  return {schemaVersion:1,id:'document-1',title:'Samen tekenen',unit:'m',floors:[{id:'floor-1',name:'Begane grond',elevation:0,walls:[wall('wall-1',0,0,5,0),wall('wall-2',20,0,25,0)],rooms:[],openings:[],symbols:[{id:'symbol-1',kind:'camera',position:{x:1,y:1},rotation:0,label:'Camera 1'},{id:'symbol-2',kind:'camera',position:{x:21,y:1},rotation:0,label:'Camera 2'}],routes:[],print:{paper:'A3',orientation:'landscape',scale:100,profile:'installation',title:'Plattegrond',address:'',drawingNumber:'',instructions:'',secondaryInstructions:'',language2:'',viewpoints:[]}}]};
}
function setup({initial = document()} = {}) {
  let time = 1_800_000_000_000, revision = 0, counter = 0, mapVersion = 3;
  let current = initial ? {entry:{id:'workspace-1',version:1,snapshot_id:'snapshot-1',published_revision:0,collaboration:{protocol:1,generation:0,next_fence:1,retired_through_version:0,sessions:{},leases:{},claims:{},operations:{}}},document:initial} : {entry:null,document:null};
  const snapshots = [], audit = [], scopeChecks = [];
  let beforeCommit = null;
  const service = createBuildingCollaboration({
    now:()=>time, randomId:()=>`identifier-${++counter}`,
    async load(actor, body) {
      scopeChecks.push(body.object_id);
      if (body.customer_id !== scope.customer_id || body.object_id !== scope.object_id || body.building_selection_key !== scope.building_selection_key) throw new CollaborationError(403,'scope_denied','Geen toegang');
      return {...structuredClone(current),mapVersion,revision,archived:false};
    },
    async validateDocument(value) { return validateDesktopDocument(value, ApiError); },
    async stagePublication(_doc, _loaded, entry) { return {current_published_floor_plan_id:`publication-${entry.published_revision + 1}`,published_revision:entry.published_revision + 1}; },
    async commit(loaded, entry, doc, operation) {
      if (beforeCommit) await beforeCommit(operation);
      if (loaded.revision !== revision || loaded.mapVersion !== mapVersion) return false;
      if (doc !== undefined) {snapshots.push(structuredClone(doc));entry.snapshot_id = `snapshot-${snapshots.length + 1}`;}
      current = {entry:structuredClone(entry),document:structuredClone(doc ?? current.document)};
      revision++;
      audit.push(operation.action);
      return {entry};
    },
  });
  const call = (action, body = {}, actor = user) => service.handle(action,actor,{...scope,...body});
  return {call,snapshots,audit,scopeChecks,get:()=>structuredClone(current),advance:ms=>time+=ms,setMapVersion:value=>mapVersion=value,setBeforeCommit:fn=>beforeCommit=fn};
}
const open = (f,id='client-one',extra={}) => f.call(ACTIONS.open,{client_id:id,...extra});
const claim = (f,session,changes,extra={}) => f.call(ACTIONS.claim,{session_id:session.session_id,request_id:crypto.randomUUID(),changes,...extra});
const apply = (f,session,lease,changes,extra={}) => f.call(ACTIONS.apply,{session_id:session.session_id,operation_id:crypto.randomUUID(),lease_id:lease.lease_id,fence:lease.fence,base_version:1,changes,...extra});
const code = expected => error => error.details?.code === expected;
const edit = (doc, collection, id, fields) => {const next=structuredClone(doc);Object.assign(next.floors[0][collection].find(item=>item.id===id),fields);return diffDocuments(doc,next);};

test('two devices merge independent walls against the same base without overwriting each other',async()=>{
  const f=setup(),a=(await open(f)).session,b=(await open(f,'client-two')).session,base=f.get().document;
  const ca=edit(base,'walls','wall-1',{thickness:.3}),cb=edit(base,'walls','wall-2',{thickness:.4});
  const la=(await claim(f,a,ca)).lease,lb=(await claim(f,b,cb)).lease;
  await Promise.all([apply(f,a,la,ca),apply(f,b,lb,cb)]);
  assert.equal(f.get().entry.version,3);assert.deepEqual(f.get().document.floors[0].walls.map(w=>w.thickness),[.3,.4]);
});
test('same user on separate devices receives distinct sessions and cannot edit the same wall',async()=>{
  const f=setup(),a=(await open(f)).session,b=(await open(f,'client-two')).session;
  const changes=edit(f.get().document,'walls','wall-1',{thickness:.3});
  await claim(f,a,changes);
  await assert.rejects(claim(f,b,changes),code('floor_plan_resource_busy'));assert.notEqual(a.session_id,b.session_id);
});
test('a wall reservation also blocks its opening and a connected corner',async()=>{
  const d=document();d.floors[0].walls.push(wall('wall-3',5,0,5,5));d.floors[0].openings.push({id:'door-1',wallId:'wall-1',type:'door',offset:1,width:.9,hinge:'left',swing:'in'});
  const f=setup({initial:d}),a=(await open(f)).session,b=(await open(f,'client-two')).session;
  await claim(f,a,[],{resource_ids:[resourceId('floor-1','walls','wall-1')]});
  await assert.rejects(claim(f,b,[],{resource_ids:[resourceId('floor-1','openings','door-1')]}),code('floor_plan_resource_busy'));
  await assert.rejects(claim(f,b,[],{resource_ids:[resourceId('floor-1','walls','wall-3')]}),code('floor_plan_resource_busy'));
});
test('expired lease rejects buffered offline operation and can be reserved by another session',async()=>{
  const f=setup(),a=(await open(f)).session,b=(await open(f,'client-two')).session,changes=edit(f.get().document,'walls','wall-1',{thickness:.3});
  const old=(await claim(f,a,changes)).lease;f.advance(LEASE_MS+1);
  const fresh=(await claim(f,b,changes)).lease;
  await assert.rejects(apply(f,a,old,changes),code('floor_plan_lease_lost'));
  await apply(f,b,fresh,changes);assert.equal(f.get().entry.version,2);
});
test('renew is fenced; stale release never releases another active lease',async()=>{
  const f=setup(),a=(await open(f)).session,b=(await open(f,'client-two')).session,changes=edit(f.get().document,'walls','wall-1',{thickness:.3});
  const old=(await claim(f,a,changes)).lease;f.advance(LEASE_MS+1);const fresh=(await claim(f,b,changes)).lease;
  await f.call(ACTIONS.release,{session_id:a.session_id,leases:[old]});
  await assert.rejects(f.call(ACTIONS.renew,{session_id:a.session_id,leases:[old]}),code('floor_plan_lease_lost'));
  await apply(f,b,fresh,changes);
});
test('successful operation replay after session expiry returns current canonical document without reapplying',async()=>{
  const f=setup(),a=(await open(f)).session,base=f.get().document,changes=edit(base,'symbols','symbol-1',{label:'Nieuw'}),lease=(await claim(f,a,changes)).lease;
  const body={session_id:a.session_id,operation_id:'operation-original',lease_id:lease.lease_id,fence:lease.fence,base_version:1,changes};
  await f.call(ACTIONS.apply,body);f.advance(SESSION_MS+1);
  const b=(await open(f,'client-two')).session,other=edit(f.get().document,'symbols','symbol-2',{label:'Ander'}),l=(await claim(f,b,other)).lease;
  await apply(f,b,l,other,{base_version:2});
  const replay=await f.call(ACTIONS.apply,body);assert.equal(replay.replayed,true);assert.equal(replay.committed_version,2);assert.equal(replay.workspace.version,3);assert.equal(f.snapshots.length,2);
  await assert.rejects(f.call(ACTIONS.apply,{...body,base_version:2}),code('floor_plan_operation_reused'));
});
test('successful receipt does not bypass changed customer/object authorization',async()=>{
  const f=setup(),a=(await open(f)).session,changes=edit(f.get().document,'symbols','symbol-1',{label:'Nieuw'}),lease=(await claim(f,a,changes)).lease;
  const body={session_id:a.session_id,operation_id:'operation-original',lease_id:lease.lease_id,fence:lease.fence,base_version:1,changes};await f.call(ACTIONS.apply,body);
  await assert.rejects(f.call(ACTIONS.apply,{...body,object_id:'object-other'}),code('scope_denied'));
  await assert.rejects(f.call(ACTIONS.apply,body,{id:'user-other',role:'admin'}),code('collaboration_session_expired'));
});
test('unknown operation after expired session never becomes a new write',async()=>{
  const f=setup(),a=(await open(f)).session,changes=edit(f.get().document,'symbols','symbol-1',{label:'Nieuw'}),lease=(await claim(f,a,changes)).lease;f.advance(SESSION_MS+1);
  await assert.rejects(apply(f,a,lease,changes),code('collaboration_session_expired'));assert.equal(f.get().entry.version,1);
});
test('before values reject stale edits even if caller acquires a broad reservation',async()=>{
  const f=setup(),a=(await open(f)).session,base=f.get().document,changes=edit(base,'symbols','symbol-1',{label:'Nieuw'}),lease=(await claim(f,a,changes)).lease;await apply(f,a,lease,changes);
  const broad=(await claim(f,a,[],{resource_ids:['document']})).lease;
  await assert.rejects(apply(f,a,broad,edit(base,'symbols','symbol-1',{label:'Oud'})),code('floor_plan_resource_conflict'));
});
test('late new geometry expands dependencies at commit and cannot bypass another reservation',async()=>{
  const f=setup(),a=(await open(f)).session,b=(await open(f,'client-two')).session,base=f.get().document;
  const next=structuredClone(base);next.floors[0].walls.push(wall('new-a',10,0,10,4));const ca=diffDocuments(base,next);
  const other=structuredClone(base);other.floors[0].walls.push(wall('new-b',8,2,12,2));const cb=diffDocuments(base,other);
  const la=(await claim(f,a,ca)).lease,lb=(await claim(f,b,cb)).lease;
  await apply(f,b,lb,cb);
  await assert.rejects(apply(f,a,la,ca),code('floor_plan_dependencies_changed'));assert.equal(f.get().document.floors[0].walls.length,3);
});
test('floor and document locks conflict with descendants, while independent symbols do not',async()=>{
  assert.equal(resourcesConflict('floor:floor-1',resourceId('floor-1','symbols','symbol-1')),true);
  assert.equal(resourcesConflict('document',resourceId('floor-1','symbols','symbol-1')),true);
  assert.equal(resourcesConflict(resourceId('floor-1','symbols','symbol-1'),resourceId('floor-1','symbols','symbol-2')),false);
  const f=setup(),a=(await open(f)).session,b=(await open(f,'client-two')).session;await claim(f,a,[],{resource_ids:['floor:floor-1']});
  await assert.rejects(claim(f,b,[],{resource_ids:[resourceId('floor-1','symbols','symbol-2')]}),code('floor_plan_resource_busy'));
});
test('racing first opens create exactly one canonical document',async()=>{
  const f=setup({initial:null}),first=document(),second=document();second.id='document-other';
  const [a,b]=await Promise.all([open(f,'client-one',{initial_document:first}),open(f,'client-two',{initial_document:second})]);
  assert.equal(a.workspace.document.id,b.workspace.document.id);assert.equal(f.snapshots.length,1);assert.equal(f.get().entry.version,1);
});
test('open retry uses one active session, renew presence is visible to another device',async()=>{
  const f=setup(),a=await open(f),again=await open(f),b=await open(f,'client-two');assert.equal(a.session.session_id,again.session.session_id);
  await f.call(ACTIONS.renew,{session_id:a.session.session_id,leases:[],presence:{floor_id:'floor-1',selection_resource_ids:[resourceId('floor-1','walls','wall-1')],cursor:{x:2,y:3}}});
  const read=await f.call(ACTIONS.get,{session_id:b.session.session_id});assert.equal(read.presence.length,2);assert.deepEqual(read.presence.find(p=>p.session_id===a.session.session_id).cursor,{x:2,y:3});
});
test('leaving releases only own reservations',async()=>{
  const f=setup(),a=(await open(f)).session,b=(await open(f,'client-two')).session,changes=edit(f.get().document,'walls','wall-1',{thickness:.3});await claim(f,a,changes);
  await f.call(ACTIONS.leave,{session_id:a.session_id});await claim(f,b,changes);
});
test('map changes reject new writes but do not stop acknowledging a successful old request',async()=>{
  const f=setup(),a=(await open(f)).session,changes=edit(f.get().document,'symbols','symbol-1',{label:'Nieuw'}),lease=(await claim(f,a,changes)).lease;
  const body={session_id:a.session_id,operation_id:'operation-original',lease_id:lease.lease_id,fence:lease.fence,base_version:1,changes};await f.call(ACTIONS.apply,body);f.setMapVersion(4);
  assert.equal((await f.call(ACTIONS.apply,body)).replayed,true);
  await assert.rejects(claim(f,a,changes),code('building_configuration_conflict'));
});
test('same operation racing itself commits once via shared CAS receipt',async()=>{
  const f=setup(),a=(await open(f)).session,changes=edit(f.get().document,'symbols','symbol-1',{label:'Nieuw'}),lease=(await claim(f,a,changes)).lease;
  const body={session_id:a.session_id,operation_id:'operation-original',lease_id:lease.lease_id,fence:lease.fence,base_version:1,changes};
  const replies=await Promise.all([f.call(ACTIONS.apply,body),f.call(ACTIONS.apply,body)]);assert.equal(f.snapshots.length,1);assert.deepEqual(replies.map(r=>r.replayed).sort(),[false,true]);
});
test('claim response replay preserves its fence and does not resurrect expired reservations',async()=>{
  const f=setup(),a=(await open(f)).session,body={session_id:a.session_id,request_id:'claim-original',resource_ids:[resourceId('floor-1','symbols','symbol-1')]};
  const one=await f.call(ACTIONS.claim,body),two=await f.call(ACTIONS.claim,body);assert.deepEqual(one.lease,two.lease);f.advance(LEASE_MS+1);
  await assert.rejects(f.call(ACTIONS.claim,body),code('floor_plan_lease_lost'));
});
test('server document validator rejects orphan openings and invalid geometry before activation',async()=>{
  const f=setup(),a=(await open(f)).session,base=f.get().document,next=structuredClone(base);next.floors[0].openings.push({id:'bad-door',wallId:'missing-wall',type:'door',offset:1,width:.9,hinge:'left',swing:'in'});
  const changes=diffDocuments(base,next),lease=(await claim(f,a,changes)).lease;
  await assert.rejects(apply(f,a,lease,changes),error=>error.status===400);assert.equal(f.get().entry.version,1);
});
test('publication requires exact canonical version and document reservation; replay keeps one publication',async()=>{
  const f=setup(),a=(await open(f)).session,small=(await claim(f,a,[],{resource_ids:[resourceId('floor-1','symbols','symbol-1')]})).lease;
  const payload={session_id:a.session_id,operation_id:'publish-original',lease_id:small.lease_id,fence:small.fence,base_version:1,expected_current_floor_plan_id:null};
  await assert.rejects(f.call(ACTIONS.publish,payload),code('floor_plan_dependencies_changed'));
  const broad=(await claim(f,a,[],{resource_ids:['document']})).lease;payload.lease_id=broad.lease_id;payload.fence=broad.fence;
  const result=await f.call(ACTIONS.publish,payload);assert.equal(result.workspace.published_revision,1);assert.equal(result.workspace.version,2);
  f.advance(SESSION_MS+1);assert.equal((await f.call(ACTIONS.publish,payload)).replayed,true);assert.equal(f.get().entry.published_revision,1);
});
test('an unauthorized account cannot open or read the drawing',async()=>{
  const f=setup();await assert.rejects(f.call(ACTIONS.open,{client_id:'client-one'},{id:'user-2',role:'user'}),code('collaboration_forbidden'));
});
test('resource diff preserves unrelated remote additions and supports IDs containing colons',()=>{
  const base=document();base.floors[0].id='floor:one';base.floors[0].symbols[0].id='symbol:one';const next=structuredClone(base);next.floors[0].symbols[0].label='A';
  const changes=diffDocuments(base,next);assert.equal(changes[0].resource_id,'element:floor%3Aone:symbols:symbol%3Aone');
  const remote=structuredClone(base);remote.floors[0].symbols.push({...remote.floors[0].symbols[1],id:'symbol-3'});const merged=applyChanges(remote,changes);assert.equal(merged.floors[0].symbols.length,3);assert.equal(merged.floors[0].symbols[0].label,'A');
});
test('dependency expansion is bounded to affected neighbours rather than every connected wall',()=>{
  const d=document();d.floors[0].walls=[wall('a',0,0,5,0),wall('b',5,0,5,5),wall('c',5,5,10,5)];
  const ids=dependencyResources(d,{resourceIds:[resourceId('floor-1','walls','a')]});assert(ids.includes(resourceId('floor-1','walls','b')));assert(!ids.includes(resourceId('floor-1','walls','c')));
});
test('retired operation receipt cannot be applied again after values cycle back through undo',async()=>{
  const f=setup(),a=(await open(f)).session,base=f.get().document,initial=edit(base,'symbols','symbol-1',{label:'B'}),lease=(await claim(f,a,[],{resource_ids:['document']})).lease;
  const original={session_id:a.session_id,operation_id:'operation-original',lease_id:lease.lease_id,fence:lease.fence,base_version:1,changes:initial};
  await f.call(ACTIONS.apply,original);
  for(let index=0;index<256;index++) {
    const current=f.get(),changes=edit(current.document,'symbols','symbol-1',{label:index===255?'Camera 1':`Label ${index}`});
    await apply(f,a,lease,changes,{base_version:current.entry.version});
  }
  assert.equal(f.get().document.floors[0].symbols[0].label,'Camera 1');
  await assert.rejects(f.call(ACTIONS.apply,original),code('floor_plan_operation_history_expired'));
  assert.equal(f.get().entry.version,258);
});
test('empty overview presence may omit a floor without claiming any resource',async()=>{
  const f=setup(),a=(await open(f)).session;
  const response=await f.call(ACTIONS.renew,{session_id:a.session_id,leases:[],presence:{floor_id:null,selection_resource_ids:[]}});
  assert.equal(response.presence[0].floor_id,null);
});

function roomAddition(base, id, x, y, size) {
  const next=structuredClone(base), polygon=[{x,y},{x:x+size,y},{x:x+size,y:y+size},{x,y:y+size}];
  next.floors[0].rooms.push({id,label:id,polygon});
  next.floors[0].walls.push(...polygon.map((point,index)=>wall(`${id}-wall-${index}`,point.x,point.y,polygon[(index+1)%4].x,polygon[(index+1)%4].y)));
  return diffDocuments(base,next);
}
for (const outerFirst of [true,false]) test(`concurrent nested room proposals cannot both commit (outer first: ${outerFirst})`,async()=>{
  const initial=document();initial.floors[0].walls=[];
  const f=setup({initial}),a=(await open(f)).session,b=(await open(f,'client-two')).session,base=f.get().document;
  const outer=roomAddition(base,'outer',0,0,10),inner=roomAddition(base,'inner',2,2,2);
  const la=(await claim(f,a,outer)).lease,lb=(await claim(f,b,inner)).lease;
  if (outerFirst) {
    await apply(f,a,la,outer);
    await assert.rejects(apply(f,b,lb,inner),code('floor_plan_dependencies_changed'));
  } else {
    await apply(f,b,lb,inner);
    await assert.rejects(apply(f,a,la,outer),code('floor_plan_dependencies_changed'));
  }
  assert.equal(f.get().entry.version,2);assert.equal(f.get().document.floors[0].rooms.length,1);
});
test('a room reservation covers an entirely contained wall and its linked opening in both directions',async()=>{
  const initial=applyChanges(document(),roomAddition(document(),'outer',0,0,10));
  initial.floors[0].walls.push(wall('interior',3,3,7,3));
  initial.floors[0].openings.push({id:'interior-door',wallId:'interior',type:'door',offset:1,width:.9,hinge:'left',swing:'in'});
  const f=setup({initial}),a=(await open(f)).session,b=(await open(f,'client-two')).session;
  const roomLease=(await claim(f,a,[],{resource_ids:[resourceId('floor-1','rooms','outer')]})).lease;
  assert(roomLease.resource_ids.includes(resourceId('floor-1','walls','interior')));
  assert(roomLease.resource_ids.includes(resourceId('floor-1','openings','interior-door')));
  await assert.rejects(claim(f,b,[],{resource_ids:[resourceId('floor-1','walls','interior')]}),code('floor_plan_resource_busy'));
  await f.call(ACTIONS.release,{session_id:a.session_id,leases:[roomLease]});
  await claim(f,b,[],{resource_ids:[resourceId('floor-1','walls','interior')]});
  await assert.rejects(claim(f,a,[],{resource_ids:[resourceId('floor-1','rooms','outer')]}),code('floor_plan_resource_busy'));
});
test('separate new rooms still merge concurrently without floor-wide reservations',async()=>{
  const initial=document();initial.floors[0].walls=[];
  const f=setup({initial}),a=(await open(f)).session,b=(await open(f,'client-two')).session,base=f.get().document;
  const ca=roomAddition(base,'left',0,0,10),cb=roomAddition(base,'right',20,0,10);
  const la=(await claim(f,a,ca)).lease,lb=(await claim(f,b,cb)).lease;
  await Promise.all([apply(f,a,la,ca),apply(f,b,lb,cb)]);
  assert.equal(f.get().entry.version,3);assert.equal(f.get().document.floors[0].rooms.length,2);
});
test('independent interior walls do not share a room reservation merely because they are contained',async()=>{
  const initial=applyChanges(document(),roomAddition(document(),'outer',0,0,10));
  initial.floors[0].walls.push(wall('interior-left',2,2,2,7),wall('interior-right',7,2,7,7));
  const f=setup({initial}),a=(await open(f)).session,b=(await open(f,'client-two')).session;
  const ca=edit(initial,'walls','interior-left',{thickness:.3}),cb=edit(initial,'walls','interior-right',{thickness:.4});
  const la=(await claim(f,a,ca)).lease,lb=(await claim(f,b,cb)).lease;
  await Promise.all([apply(f,a,la,ca),apply(f,b,lb,cb)]);
  assert.equal(f.get().entry.version,3);
});
