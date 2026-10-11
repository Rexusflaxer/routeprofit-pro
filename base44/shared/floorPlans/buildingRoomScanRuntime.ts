import {QueueError} from './queueCore.ts';
import {RoomDiscoveryError} from './roomDiscoveryContract.mjs';
import {RoomObjectContractError} from './roomObjectContract.mjs';
import {ACTIONS,RoomScanError} from './roomScanCore.mjs';
import {createBase44RoomScanService} from './roomScanBase44.mjs';
import {createBuildingFloorPlanHandlers,validateDesktopDocument} from './buildingFloorPlans.ts';
import {ApiError,getEntity,requireRecord,requireCustomerObjectScope,requireCustomerObjectForMutation,objectBuildingFloorPlanSelectionKeys,versionOf,sha256,nowIso} from './buildingFloorPlanScope.ts';
export const ROOM_SCAN_DESKTOP_ACTIONS=new Set([ACTIONS.get,ACTIONS.place]);
export const ROOM_SCAN_MOBILE_ACTIONS=new Set([ACTIONS.targets,ACTIONS.begin,ACTIONS.submit,ACTIONS.end,ACTIONS.observe]);
export function roomScanForRequest(base44:any){
 const floorPlans=createBuildingFloorPlanHandlers({entity:getEntity,ApiError,requireRecord,selectionKeys:objectBuildingFloorPlanSelectionKeys,versionOf,sha256,nowIso,
  requireScope:(client:any,body:any,mutable:boolean)=>mutable?requireCustomerObjectForMutation(client,body):requireCustomerObjectScope(client,body),
  audit:async(_client:any,user:any,body:any,result:any)=>{if(body.action!==ACTIONS.observe)throw new ApiError(500,'Onverwachte legacy schrijfroute');await base44.asServiceRole.entities.ManagedFileAccessLog.create({action:'upload',actor_user_id:user.id,owner_type:'object',owner_id:result.object_id,source_entity:'ObjectBuildingRoomScanEvent',success:true,created_at:nowIso(),metadata:{purpose:'room_object_recognition',building_selection_key:body.building_selection_key}});},
 });
 return createBase44RoomScanService({base44,entity:getEntity,floorPlans,selectionKeys:objectBuildingFloorPlanSelectionKeys,validateDesktopDocument,ApiError,sha256});
}
export async function handleMobileRoomScan(req:Request,body:any,createClientFromRequest:(req:Request)=>any){
 try{
  const base44=createClientFromRequest(req),user=await base44.auth.me().catch(()=>null);
  if(!user)return Response.json({error:'Niet aangemeld'},{status:401});
  if(!ROOM_SCAN_MOBILE_ACTIONS.has(body?.action))return Response.json({error:'Onbekende scanactie'},{status:400});
  const payload=body.payload&&typeof body.payload==='object'&&!Array.isArray(body.payload)?body.payload:{};
  const result=await roomScanForRequest(base44).handle(body.action,user,payload);
  return Response.json(result);
 }catch(error){
  if(error instanceof RoomObjectContractError||error instanceof RoomDiscoveryError)return Response.json({error:'De scanbeelden konden niet worden gecontroleerd. De gemeten ruimte blijft bewaard.',details:{code:error.code}},{status:400});
  const known=error instanceof ApiError||error instanceof RoomScanError||error instanceof QueueError,status=known?Number((error as any).status||500):500;
  // Never log raw RoomPlan geometry, source photos, token, names or request body.
  console.error('[room-scan]',{action:String(body?.action||''),status,code:known?(error as any).details?.code:'room_scan_unavailable'});
  return Response.json({error:known&&status<500?(error as Error).message:'De scansessie is tijdelijk niet beschikbaar.',details:known?(error as any).details:{code:'room_scan_unavailable'}},{status});
 }
}
