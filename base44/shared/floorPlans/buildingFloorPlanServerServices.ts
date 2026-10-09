import {createBuildingFloorPlanHandlers} from './buildingFloorPlans.ts';
import {ApiError,getEntity,requireRecord,requireCustomerObjectScope,requireCustomerObjectForMutation,objectBuildingFloorPlanSelectionKeys,versionOf,sha256,nowIso} from './buildingFloorPlanScope.ts';
// No mutation API is exposed here. The existing factory's exact read guards are shared.
export function createBuildingFloorPlanServerServices(){
 return createBuildingFloorPlanHandlers({entity:getEntity,ApiError,requireRecord,selectionKeys:objectBuildingFloorPlanSelectionKeys,versionOf,sha256,nowIso,requireScope:(base44,body,mutable)=>mutable?requireCustomerObjectForMutation(base44,body):requireCustomerObjectScope(base44,body),audit:async()=>{throw new Error('Deze interne service staat geen tekenmutaties toe.');}}).serverOnly;
}
