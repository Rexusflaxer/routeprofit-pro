// Candidate geometric grounding. No model-generated dimensions are accepted.
import {ROOM_DISCOVERY_TASK,ROOM_DISCOVERY_LIMITS,validateRoomDiscoverySource,parseRoomDiscoveryFrame,validateDiscoveryClassifications,decodeBytes,record,failOutput} from './roomDiscoveryContract.mjs';
const round=n=>Math.round(n*1000)/1000;
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const reject=(reason,evidenceFrameIds)=>({reason,evidenceFrameIds:[...new Set(evidenceFrameIds)].sort()});
export function unprojectDepth(camera,u,v,metres){
 const x=(u-camera.cx)/camera.fx*metres,y=-(v-camera.cy)/camera.fy*metres,z=-metres,m=camera.cameraToWorld;
 return {x:m[0]*x+m[4]*y+m[8]*z+m[12],y:m[1]*x+m[5]*y+m[9]*z+m[13],z:m[2]*x+m[6]*y+m[10]*z+m[14]};
}
export function projectWorld(camera,p){
 const m=camera.cameraToWorld,x=p.x-m[12],y=p.y-m[13],z=p.z-m[14],cx=m[0]*x+m[1]*y+m[2]*z,cy=m[4]*x+m[5]*y+m[6]*z,cz=m[8]*x+m[9]*y+m[10]*z;
 if(cz>=-.1)return null;return {u:camera.fx*cx/-cz+camera.cx,v:camera.cy-camera.fy*cy/-cz,depth:-cz};
}
function depthGrid(frame){const d=frame.depth;if(!d)return null;const bytes=decodeBytes(d.base64,d.width*d.height*2);return {...d,values:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),confidence:decodeBytes(d.confidenceBase64,d.width*d.height)};}
function sampleDepth(d,x,y){if(x<0||y<0||x>=d.width||y>=d.height)return null;const index=y*d.width+x;if(d.confidence[index]!==2)return null;const z=d.values.getUint16(index*2,true)/1000;return z>=.15&&z<=12?z:null;}
function bounds(points){const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};for(const p of points)for(const k of ['x','y','z']){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}return {min,max};}
const center=b=>Object.fromEntries(['x','y','z'].map(k=>[k,(b.min[k]+b.max[k])/2]));
const extent=b=>['x','y','z'].map(k=>b.max[k]-b.min[k]);
const inside=(p,b,pad=0)=>['x','y','z'].every(k=>p[k]>=b.min[k]-pad&&p[k]<=b.max[k]+pad);
function independent(a,b){const x=a.camera.cameraToWorld,y=b.camera.cameraToWorld,distance=Math.hypot(...[12,13,14].map(i=>x[i]-y[i])),angle=Math.acos(Math.max(-1,Math.min(1,[8,9,10].reduce((sum,i)=>sum+x[i]*y[i],0))));return a.image.sha256!==b.image.sha256&&(distance>=.3||angle>=Math.PI/12);}
function ground(frame,object,index){
 const evidence={frameId:frame.id,detectionIndex:index,bbox:object.bbox};
 if(object.label==='unknown'||object.visibility!=='clear')return {error:'not_clearly_visible'};
 if(object.bbox[0]<.01||object.bbox[1]<.01||object.bbox[2]>.99||object.bbox[3]>.99)return {error:'clipped_object'};
 const d=depthGrid(frame);if(!d)return {error:'missing_depth'};
 const [l,t,r,b]=object.bbox,x0=Math.floor(l*d.width),y0=Math.floor(t*d.height),x1=Math.ceil(r*d.width),y1=Math.ceil(b*d.height);
 if(x1-x0<6||y1-y0<6)return {error:'insufficient_depth'};
 const step=Math.max(1,Math.ceil(Math.sqrt((x1-x0)*(y1-y0)/4096))),samples=[],middle=[];
 for(let y=y0;y<y1;y+=step)for(let x=x0;x<x1;x+=step){const z=sampleDepth(d,x,y);if(z===null)continue;const item={x,y,z};samples.push(item);if(Math.abs((x+.5)/d.width-(l+r)/2)<(r-l)*.2&&Math.abs((y+.5)/d.height-(t+b)/2)<(b-t)*.2)middle.push(item);}
 const area=Math.ceil((x1-x0)/step)*Math.ceil((y1-y0)/step);
 if(samples.length<24||samples.length/area<.45||middle.length<5)return {error:'insufficient_depth'};
 // Permit a connected object's receding faces; the per-neighbour continuity
 // test and independent border separation still reject a jump into background.
 const seed=median(middle.map(p=>p.z)),tolerance=Math.max(.5,seed*.25);
 const eligible=samples.filter(p=>Math.abs(p.z-seed)<=tolerance),cells=new Map(eligible.map(p=>[`${p.x},${p.y}`,p]));
 const start=middle.filter(p=>cells.has(`${p.x},${p.y}`)).sort((a,b)=>Math.hypot(a.x-(x0+x1)/2,a.y-(y0+y1)/2)-Math.hypot(b.x-(x0+x1)/2,b.y-(y0+y1)/2))[0];
 if(!start)return {error:'ambiguous_depth'};
 const queue=[start],seen=new Set([`${start.x},${start.y}`]);for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dy] of [[step,0],[-step,0],[0,step],[0,-step]]){const key=`${p.x+dx},${p.y+dy}`,next=cells.get(key);if(next&&!seen.has(key)&&Math.abs(p.z-next.z)<=Math.max(.08,seed*.025)){seen.add(key);queue.push(next);}}}
 if(queue.length<24||queue.length/area<.15||queue.length<eligible.length*.65)return {error:'ambiguous_depth'};
 // An unseparated floor/wall/background plane cannot establish an object.
 const border=[],pad=Math.max(2,Math.ceil(Math.max(x1-x0,y1-y0)*.12));
 for(let y=Math.max(0,y0-pad);y<Math.min(d.height,y1+pad);y+=step)for(let x=Math.max(0,x0-pad);x<Math.min(d.width,x1+pad);x+=step){if(x>=x0&&x<x1&&y>=y0&&y<y1)continue;const z=sampleDepth(d,x,y);if(z!==null)border.push(z);}
 if(border.length<12||border.filter(z=>z>seed+Math.max(.12,seed*.05)).length/border.length<.25)return {error:'background_not_separated'};
 const points=queue.map(p=>unprojectDepth(frame.camera,(p.x+.5)/d.width*frame.image.width,(p.y+.5)/d.height*frame.image.height,p.z));
 const box=bounds(points);if(extent(box).some(n=>n>12)||Math.max(...extent(box))<.08)return {error:'implausible_extent'};
 return {frame,evidence,label:object.label,points,box,center:center(box),grid:d};
}
function reprojection(a,b){
 let visible=0,matched=0,contradictory=0;const step=Math.max(1,Math.floor(a.points.length/128)),[l,t,r,bt]=b.evidence.bbox;
 for(let i=0;i<a.points.length;i+=step){const p=projectWorld(b.frame.camera,a.points[i]);if(!p)continue;const u=p.u/b.frame.image.width,v=p.v/b.frame.image.height;if(u<l-.03||u>r+.03||v<t-.03||v>bt+.03)continue;visible++;
  const z=sampleDepth(b.grid,Math.floor(u*b.grid.width),Math.floor(v*b.grid.height));if(z===null)continue;matched++;
  // A known surface cannot be substantially nearer than what the second camera
  // measures there; a farther point can be occluded by another visible face.
  if(z-p.depth>Math.max(.15,p.depth*.07))contradictory++;
 }
 return visible>=Math.ceil(a.points.length/step)*.6&&matched>=8&&contradictory/matched<=.15;
}
function compatible(a,b){return dist(a.center,b.center)<=Math.min(3,Math.max(.4,(Math.max(...extent(a.box))+Math.max(...extent(b.box)))*.7))&&reprojection(a,b)&&reprojection(b,a);}
function volumeRatio(points){
 const c={x:0,y:0,z:0};for(const p of points)for(const k of ['x','y','z'])c[k]+=p[k]/points.length;
 const m=[[0,0,0],[0,0,0],[0,0,0]],keys=['x','y','z'];for(const p of points)for(let i=0;i<3;i++)for(let j=0;j<3;j++)m[i][j]+=(p[keys[i]]-c[keys[i]])*(p[keys[j]]-c[keys[j]])/points.length;
 for(let iter=0;iter<12;iter++){let p=0,q=1;for(const [i,j] of [[0,2],[1,2]])if(Math.abs(m[i][j])>Math.abs(m[p][q])){p=i;q=j;}if(Math.abs(m[p][q])<1e-10)break;const angle=.5*Math.atan2(2*m[p][q],m[q][q]-m[p][p]),s=Math.sin(angle),c=Math.cos(angle),pp=m[p][p],qq=m[q][q],pq=m[p][q];for(let k=0;k<3;k++)if(k!==p&&k!==q){const kp=m[k][p],kq=m[k][q];m[k][p]=m[p][k]=c*kp-s*kq;m[k][q]=m[q][k]=s*kp+c*kq;}m[p][p]=c*c*pp-2*s*c*pq+s*s*qq;m[q][q]=s*s*pp+2*s*c*pq+c*c*qq;m[p][q]=m[q][p]=0;}
 const eigen=[m[0][0],m[1][1],m[2][2]].sort((a,b)=>a-b);return {smallest:eigen[0],ratio:eigen[0]/Math.max(eigen[2],1e-9)};
}
function duplicatesExisting(points,box,objects){
 for(const o of objects){const c=Math.cos(o.rotationRadians),s=Math.sin(o.rotationRadians),contains=p=>{const dx=p.x-o.center.x,dy=-p.z-o.center.y,lx=c*dx+s*dy,ly=-s*dx+c*dy;return Math.abs(lx)<=o.width/2+.12&&Math.abs(ly)<=o.depth/2+.12&&p.y>=o.bottomElevation-.12&&p.y<=o.bottomElevation+o.height+.12;};if(points.filter(contains).length/points.length>.2||contains(center(box)))return true;}
 return false;
}
export async function buildRoomDiscoveryResult(source,frameDetections,classifications=null){
 await validateRoomDiscoverySource(source);await validateDiscoveryClassifications(classifications,source);
 if(!Array.isArray(frameDetections)||frameDetections.length>8)failOutput();
 const frames=new Map(source.observation_batch.frames.filter(f=>f.kind==='room_keyframe').map(f=>[f.id,f])),seen=new Set(),rejected=[],candidates=[];
 for(const result of frameDetections){if(!record(result,['frameId','objects'])||!frames.has(result.frameId)||seen.has(result.frameId))failOutput();seen.add(result.frameId);parseRoomDiscoveryFrame(JSON.stringify({objects:result.objects}),result.frameId);const frame=frames.get(result.frameId);
  if(frame.quality.meanLuma<20||frame.quality.meanLuma>235||frame.quality.sharpness<40){rejected.push(reject('poor_image_quality',[frame.id]));continue;}
  for(let i=0;i<result.objects.length;i++){const item=ground(frame,result.objects[i],i);if(item.error)rejected.push(reject(item.error,[frame.id]));else candidates.push(item);}
 }
 for(const frame of frames.values())if(!seen.has(frame.id))rejected.push(reject(frame.depth?'unprocessed_frame':'missing_depth',[frame.id]));
 const links=candidates.map(()=>[]);for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){const a=candidates[i],b=candidates[j];if(a.frame.id!==b.frame.id&&compatible(a,b)){links[i].push(j);links[j].push(i);}}
 const visited=new Set(),proposals=[];
 for(let i=0;i<candidates.length;i++){if(visited.has(i))continue;const group=[i];visited.add(i);for(let cursor=0;cursor<group.length;cursor++)for(const j of links[group[cursor]])if(!visited.has(j)){visited.add(j);group.push(j);}
  const items=group.map(j=>candidates[j]),frameIds=items.map(x=>x.frame.id),labels=new Set(items.map(x=>x.label));
  if(new Set(frameIds).size!==items.length){rejected.push(reject('ambiguous_association',frameIds));continue;}
  if(labels.size!==1){rejected.push(reject('contradictory_labels',frameIds));continue;}
  if(!items.some((a,i)=>items.slice(i+1).some(b=>independent(a.frame,b.frame)))){rejected.push(reject('independent_views_required',frameIds));continue;}
  // No chain through a third region may merge two mutually inconsistent objects.
  if(items.some((a,i)=>items.slice(i+1).some(b=>!compatible(a,b)))){rejected.push(reject('inconsistent_geometry',frameIds));continue;}
  const points=items.flatMap(o=>o.points),box=bounds(points),axes=extent(box),shape=volumeRatio(points);
  if(Math.min(...axes)<.05||Math.max(...axes)>12||shape.smallest<.00015||shape.ratio<.002){rejected.push(reject('insufficient_surface_coverage',frameIds));continue;}
  if(duplicatesExisting(points,box,source.snapshot.objects)){rejected.push(reject('existing_measured_object',frameIds));continue;}
  const evidence=items.map(x=>x.evidence).sort((a,b)=>a.frameId.localeCompare(b.frameId)||a.detectionIndex-b.detectionIndex),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([source.captureSessionId,source.coordinateFrameId,source.sequence,evidence])))),id='discovery:'+Array.from(digest).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,24);
  proposals.push({id,label:items[0].label,status:'review',measurement:'observed_surface_extent',complete:false,worldGeometry:{min:Object.fromEntries(Object.entries(box.min).map(([k,v])=>[k,round(v)])),max:Object.fromEntries(Object.entries(box.max).map(([k,v])=>[k,round(v)]))},evidence,depthSampleCount:points.length,warnings:['partial_surface_extent','manual_review_required']});
 }
 if(proposals.length>ROOM_DISCOVERY_LIMITS.proposals)failOutput();
 const unique=new Map(rejected.map(r=>[JSON.stringify(r),r]));
 return {schemaVersion:2,task:ROOM_DISCOVERY_TASK,captureSessionId:source.captureSessionId,coordinateFrameId:source.coordinateFrameId,sequence:source.sequence,geometrySource:'observed-depth',classifications,frameDetections,proposals:proposals.sort((a,b)=>a.id.localeCompare(b.id)),rejected:[...unique.values()]};
}
export async function validateRoomDiscoveryResult(result,source){
 if(!record(result,['schemaVersion','task','captureSessionId','coordinateFrameId','sequence','geometrySource','classifications','frameDetections','proposals','rejected'])||new TextEncoder().encode(JSON.stringify(result)).length>ROOM_DISCOVERY_LIMITS.responseBytes)failOutput();
 const expected=await buildRoomDiscoveryResult(source,result.frameDetections,result.classifications);
 if(JSON.stringify(canonical(result))!==JSON.stringify(canonical(expected)))failOutput();return expected;
}
