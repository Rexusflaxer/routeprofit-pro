import type {Furnishing,Point} from './model';
export const furnishingLabel=(category:string):string=>({storage:'Kast',table:'Tafel',chair:'Stoel',sofa:'Bank',bed:'Bed',refrigerator:'Koelkast',stove:'Fornuis',oven:'Oven',dishwasher:'Vaatwasser',washerDryer:'Wasmachine / droger',sink:'Wastafel',bathtub:'Bad',toilet:'Toilet',stairs:'Trap',television:'Televisie',fireplace:'Haard'}[category]||'Gescand object');
export function furnishingCorners(value:Furnishing):Point[]{
 const a=value.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:value.position.x+x*value.width/2*c-y*value.depth/2*s,y:value.position.y+x*value.width/2*s+y*value.depth/2*c}));
}
