import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ACTIONS, LEASE_MS} from '../../base44/shared/floorPlans/buildingCollaboration.mjs';
import {createBase44BuildingCollaboration} from '../../base44/shared/floorPlans/buildingCollaborationBase44.mjs';
import {diffDocuments} from '../../base44/shared/floorPlans/collabDocument.mjs';
import {createBuildingFloorPlanHandlers,validateDesktopDocument} from '../../base44/shared/floorPlans/buildingFloorPlans.ts';
class ApiError extends Error { constructor(status,message,details){super(message);this.status=status;this.details=details;} }
const hash=async value=>createHash('sha256').update(value).digest('hex');
const user={id:'user-1',role:'admin',full_name:'David'};
const scope={customer_id:'customer-1',object_id:'object-1',building_selection_key:'bag:123',expected_map_version:3};
const value=(object,key)=>key.split('.').reduce((item,part)=>item?.[part],object);
function matches(record,query){return Object.entries(query).every(([key,want])=>{
  if(key==='$and')return want.every(item=>matches(record,item));
  if(key==='$or')return want.some(item=>matches(record,item));
  const found=value(record,key);
  if(want && typeof want==='object')return Object.entries(want).every(([op,item])=>op==='$exists'?(found!==undefined)===item:op==='$gt'?found>item:false);
  return want===null?found==null:found===want;
});}
function doc(){return{schemaVersion:1,id:'document-1',title:'Gebouw',unit:'m',floors:[{id:'floor-1',name:'Begane grond',elevation:0,walls:[{id:'wall-1',start:{x:0,y:0},end:{x:5,y:0},thickness:.2}],rooms:[],openings:[],symbols:[],routes:[],print:{paper:'A3',orientation:'landscape',scale:100,profile:'installation',title:'Tekening',address:'',drawingNumber:'',instructions:'',secondaryInstructions:'',language2:'',viewpoints:[]}}]};}
async function setup({audit = async () => {}} = {}){
  let time=1_800_000_000_000,counter=0,stageHook=null;
  const keyHash=await hash(scope.building_selection_key),otherHash=await hash('bag:other');
  const object={id:scope.object_id,customer_id:scope.customer_id,version:3,status:'concept',floor_plan_workspace_index_version:0,floor_plan_workspace_index:{[otherHash]:{id:'other-workspace',version:99,snapshot_id:'other-snapshot'}}};
  const rows={SurveillanceObject:[object],ObjectBuildingFloorPlanWorkspace:[],ObjectFloorPlan:[]},queries=[];
  const entity=(_base,name)=>({
    async filter(query){return structuredClone((rows[name]||[]).filter(row=>matches(row,query)));},
    async create(data){const row={...structuredClone(data),id:`row-${++counter}`};(rows[name]||=[]).push(row);if(stageHook && name==='ObjectBuildingFloorPlanWorkspace')await stageHook(row);return structuredClone(row);},
    async updateMany(query,update){queries.push(structuredClone(query));const found=(rows[name]||[]).filter(row=>matches(row,query));for(const row of found)Object.assign(row,structuredClone(update.$set));return {success:true,updated:found.length};}
  });
  const requireScope=async(_base,body)=>{
    if(body.customer_id!==scope.customer_id||body.object_id!==scope.object_id)throw new ApiError(403,'Geen toegang');
    return{customer:{id:scope.customer_id},object:structuredClone(object)};
  };
  const floorPlans=createBuildingFloorPlanHandlers({entity,ApiError,requireScope,selectionKeys:()=>[scope.building_selection_key],versionOf:item=>item.version||0,sha256:hash,nowIso:()=>new Date(time).toISOString(),requireRecord:async(_base,name,id)=>structuredClone((rows[name]||[]).find(row=>row.id===id)),audit:async()=>{}});
  const service=createBase44BuildingCollaboration({base44:{},entity,floorPlans,validateDesktopDocument,ApiError,sha256:hash,now:()=>time,audit});
  const call=(action,payload={})=>service.handle(action,user,{...scope,...payload});
  return{call,rows,object,queries,keyHash,otherHash,floorPlans,advance:ms=>time+=ms,stageHook:fn=>stageHook=fn};
}
async function open(f){return f.call(ACTIONS.open,{client_id:'client-one',initial_document:doc()});}
async function change(f,opened){const next=structuredClone(opened.workspace.document);next.floors[0].walls[0].thickness=.3;const changes=diffDocuments(opened.workspace.document,next);const claimed=await f.call(ACTIONS.claim,{session_id:opened.session.session_id,request_id:'claim-request',changes});return{session_id:opened.session.session_id,operation_id:'operation-one',lease_id:claimed.lease.lease_id,fence:claimed.lease.fence,base_version:opened.workspace.version,changes};}

test('real Base44 adapter atomically publishes initialized document and collaboration state in one index CAS',async()=>{
  const f=await setup(),opened=await open(f);
  assert.equal(opened.workspace.version,1);assert.deepEqual(opened.workspace.document,doc());
  assert.equal(f.object.floor_plan_workspace_index[f.otherHash].version,99);
  assert.equal(f.object.floor_plan_workspace_index[f.keyHash].collaboration.protocol,1);
  assert.equal(f.object.version,3);assert.equal(f.object.floor_plan_workspace_index_version,1);
});
test('adapter CAS includes current map, shared index revision and exact lease fence with deadline',async()=>{
  const f=await setup(),opened=await open(f),operation=await change(f,opened);await f.call(ACTIONS.apply,operation);
  const query=f.queries.at(-1);assert.equal(query.id,scope.object_id);assert(query.$and.some(item=>item.version===3));
  assert(query.$and.some(item=>Object.keys(item).some(key=>key.endsWith('.fence')&&item[key]===operation.fence)));
  assert(query.$and.some(item=>Object.keys(item).some(key=>key.endsWith('.expires_at_ms')&&item[key].$gt)));
  assert.equal(f.object.floor_plan_workspace_index[f.keyHash].version,2);
});
test('lease expiry during snapshot staging leaves only an inert staged row and no activated document',async()=>{
  const f=await setup(),opened=await open(f),operation=await change(f,opened);f.stageHook(()=>f.advance(LEASE_MS+1));
  await assert.rejects(f.call(ACTIONS.apply,operation),error=>error.details?.code==='floor_plan_lease_lost');
  assert.equal(f.rows.ObjectBuildingFloorPlanWorkspace.length,2);assert.equal(f.object.floor_plan_workspace_index[f.keyHash].version,1);
});
test('stale snapshot staging cannot overwrite an intervening reservation CAS',async()=>{
  const f=await setup(),opened=await open(f),operation=await change(f,opened);let once=false;
  f.stageHook(async()=>{if(once)return;once=true;await f.call(ACTIONS.renew,{session_id:opened.session.session_id,leases:[{lease_id:operation.lease_id,fence:operation.fence}],presence:{floor_id:'floor-1',selection_resource_ids:[]}});});
  const result=await f.call(ACTIONS.apply,operation);assert.equal(result.workspace.version,2);assert(f.rows.ObjectBuildingFloorPlanWorkspace.length>=3);
  assert.equal(f.object.floor_plan_workspace_index[f.otherHash].version,99);
});
test('prepared integration rejects legacy whole-document saves and publication while retaining reads',async()=>{
  const f=await setup();await open(f);
  for(const action of ['save_object_building_floor_plan_draft','publish_object_building_floor_plan'])await assert.rejects(f.floorPlans.mutate({},user,{...scope,action,expected_version:1,idempotency_key:'legacy-request',data:{document:doc()}}),error=>error.details?.code==='floor_plan_client_update_required');
  const result=await f.floorPlans.read({},user,{...scope,action:'get_object_building_floor_plan_workspace'});assert.equal(result.capabilities.collaboration_protocol,1);assert.equal(result.workspace.version,1);
});
test('adapter publication remains immutable and exact replay cannot create a second revision',async()=>{
  const f=await setup(),opened=await open(f);const claimed=await f.call(ACTIONS.claim,{session_id:opened.session.session_id,request_id:'claim-document',resource_ids:['document']});
  const payload={session_id:opened.session.session_id,operation_id:'publication-one',lease_id:claimed.lease.lease_id,fence:claimed.lease.fence,base_version:1,expected_current_floor_plan_id:null};
  const result=await f.call(ACTIONS.publish,payload);assert.equal(result.workspace.published_revision,1);assert.equal(result.workspace.version,2);
  assert.equal((await f.call(ACTIONS.publish,payload)).replayed,true);assert.equal(f.rows.ObjectFloorPlan.length,1);assert.equal(f.rows.ObjectFloorPlan[0].is_current,false);
  assert.equal(f.object.floor_plan_workspace_index[f.keyHash].current_published_floor_plan_id,f.rows.ObjectFloorPlan[0].id);
});
test('first collaboration open places one version barrier around an existing unpublished draft',async()=>{
  const f=await setup(),existing=doc();existing.title='Bestaand concept';
  f.rows.ObjectBuildingFloorPlanWorkspace.push({id:'legacy-snapshot',workspace_id:'legacy-workspace',customer_id:scope.customer_id,object_id:scope.object_id,building_selection_key:scope.building_selection_key,version:7,document:existing});
  f.object.floor_plan_workspace_index[f.keyHash]={id:'legacy-workspace',version:7,snapshot_id:'legacy-snapshot',published_revision:2,current_published_floor_plan_id:'existing-publication'};
  const first=await open(f),again=await open(f);
  assert.equal(first.workspace.version,8);assert.equal(again.workspace.version,8);assert.equal(first.workspace.document.title,'Bestaand concept');
  assert.equal(first.workspace.current_published_floor_plan_id,'existing-publication');assert.equal(f.rows.ObjectBuildingFloorPlanWorkspace.length,1);
});
test('legacy objects without a version use the same map-version fallback as the existing API',async()=>{
  const f=await setup();delete f.object.version;
  const opened=await f.call(ACTIONS.open,{client_id:'client-one',initial_document:doc(),expected_map_version:1});
  assert.equal(opened.configuration_version,1);assert.equal(opened.workspace.version,1);
});
for (const action of [ACTIONS.apply,ACTIONS.publish]) test(`receipt replay retries an audit failure without repeating ${action}`,async()=>{
  const audited=new Map(),attempts=[];let failOnce=true;
  const f=await setup({audit:async event=>{attempts.push(event);if(failOnce){failOnce=false;throw new Error('Audit tijdelijk niet beschikbaar');}audited.set(`${event.action}:${event.operation_id}:${event.version}`,event);}}),opened=await open(f);
  let payload;
  if(action===ACTIONS.apply) payload=await change(f,opened);
  else {
    const claim=await f.call(ACTIONS.claim,{session_id:opened.session.session_id,request_id:'claim-publish-audit',resource_ids:['document']});
    payload={session_id:opened.session.session_id,operation_id:'publish-audit',lease_id:claim.lease.lease_id,fence:claim.lease.fence,base_version:1,expected_current_floor_plan_id:null};
  }
  await assert.rejects(f.call(action,payload),/Audit tijdelijk/);
  assert.equal(f.object.floor_plan_workspace_index[f.keyHash].version,2);
  const rowsBefore=f.rows.ObjectBuildingFloorPlanWorkspace.length,publicationsBefore=f.rows.ObjectFloorPlan.length;
  assert.equal((await f.call(action,payload)).replayed,true);
  assert.equal((await f.call(action,payload)).replayed,true);
  assert.equal(attempts.length,3);assert.equal(audited.size,1);assert(attempts.every(event=>event.version===2));
  assert.equal(f.rows.ObjectBuildingFloorPlanWorkspace.length,rowsBefore);assert.equal(f.rows.ObjectFloorPlan.length,publicationsBefore);
});
