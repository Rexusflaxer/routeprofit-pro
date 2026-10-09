import {afterEach,describe,expect,it,vi} from 'vitest';
import {createDocument,createFloor} from '../../src/features/floorplans/model';
import {parseFloorPlanDocument} from '../../src/features/floorplans/documentGuards';
import {validateDesktopDocument} from '../../base44/functions/customerPlatformApi/buildingFloorPlans';
import {imagePointFromClient,confirmedWalls,mergeWallCandidates,createCancellableWorkerTask,assertImageScale} from '../../src/features/floorplans/importEditing';
import type {WallCandidate} from '../../src/features/floorplans/recognition';
class ApiError extends Error {constructor(_status:number,message:string){super(message);}}
const example=()=>{const doc=createDocument();const f=doc.floors[0];f.walls=[{id:'wall-1',start:{x:0,y:0},end:{x:10,y:0},thickness:.2}];f.openings=[{id:'door-1',wallId:'wall-1',type:'door',offset:2,width:.9,hinge:'left',swing:'in'}];return doc;};
const candidate=(id='a',from=10,to=110):WallCandidate=>({id,start:{x:from,y:20},end:{x:to,y:20},thickness:6,confidence:'strong',selected:true});
afterEach(()=>vi.useRealTimers());
describe('desktop document guards share server limits',()=>{
 it('preserves crop centres and logo references',()=>{const doc=example();doc.floors[0].print.cropCenter={x:8,y:4};doc.floors[0].print.logoFileId='logo-123';expect(parseFloorPlanDocument(doc)).toEqual(validateDesktopDocument(doc,ApiError));});
 it.each([
  ['duplicate document ID',(doc:any)=>{doc.floors[0].id=doc.id;}],
  ['cross-floor duplicate',(doc:any)=>{const copy=structuredClone(doc.floors[0]);copy.id='floor-copy';doc.floors.push(copy);}],
  ['ID too long',(doc:any)=>{doc.id='a'.repeat(121);}],
  ['unsafe ID',(doc:any)=>{doc.id='../../file';}],
  ['31 floors',(doc:any)=>{doc.floors=Array.from({length:31},()=>createFloor());}],
  ['floor name too long',(doc:any)=>{doc.floors[0].name='x'.repeat(121);}],
  ['blank floor name',(doc:any)=>{doc.floors[0].name=' ';}],
  ['label too long',(doc:any)=>{doc.title='x'.repeat(251);}],
  ['instructions too long',(doc:any)=>{doc.floors[0].print.instructions='x'.repeat(4001);}],
  ['out-of-wall opening',(doc:any)=>{doc.floors[0].openings[0].offset=9.5;}],
  ['missing opening wall',(doc:any)=>{doc.floors[0].openings[0].wallId='missing';}],
  ['collapsed wall',(doc:any)=>{doc.floors[0].walls[0].end={x:0,y:0};}],
  ['wall too thick',(doc:any)=>{doc.floors[0].walls[0].thickness=6;}],
  ['unsafe text',(doc:any)=>{doc.title='<script>'; }],
  ['unknown property',(doc:any)=>{doc.url='https://example.com';}],
  ['too many route points',(doc:any)=>{doc.floors[0].routes=[{id:'route',label:'Route',points:Array.from({length:501},()=>({x:1,y:1}))}];}],
 ])('rejects %s consistently with the server',(_name,mutate)=>{const doc=example();mutate(doc);expect(parseFloorPlanDocument(doc)).toBeNull();expect(()=>validateDesktopDocument(doc,ApiError)).toThrow();});
 it('accepts 2000 rooms with valid individual polygons instead of the previous 500 limit',()=>{const doc=example();doc.floors[0].rooms=Array.from({length:2000},(_,i)=>({id:`r-${i}`,label:'Ruimte',polygon:[{x:0,y:0},{x:1,y:0},{x:1,y:1}]}));expect(parseFloorPlanDocument(doc)).not.toBeNull();expect(()=>validateDesktopDocument(doc,ApiError)).not.toThrow();});
 it('rejects more than 40000 aggregate points even when each array is within limits',()=>{const doc=example();doc.floors[0].routes=Array.from({length:81},(_,i)=>({id:`r-${i}`,label:'Route',points:Array.from({length:500},()=>({x:1,y:1}))}));expect(parseFloorPlanDocument(doc)).toBeNull();expect(()=>validateDesktopDocument(doc,ApiError)).toThrow();});
 it('rejects oversized/cyclic payloads without throwing to the caller',()=>{const doc:any=example();doc.extra='x'.repeat(4*1024*1024);expect(parseFloorPlanDocument(doc)).toBeNull();delete doc.extra;doc.loop=doc;expect(parseFloorPlanDocument(doc)).toBeNull();});
});
describe('import coordinate correction and proposal validation',()=>{
 it('inverts the actual SVG transform including image letterboxing',()=>{const svg={getScreenCTM:()=>({inverse:()=>({a:2,b:0,c:0,d:2,e:-100,f:-200})})} as unknown as SVGSVGElement;expect(imagePointFromClient(svg,100,150,400,200)).toEqual({x:100,y:100});expect(imagePointFromClient(svg,70,80,400,200)).toBeNull();expect(imagePointFromClient(svg,70,80,400,200,true)).toEqual({x:40,y:0});});
 it('fails safely when the SVG is not mounted',()=>{expect(imagePointFromClient({getScreenCTM:()=>null} as SVGSVGElement,1,1,100,100)).toBeNull();});
 it('converts selected endpoints into metres with Y up and actual wall thickness',()=>{const walls=confirmedWalls([candidate(),{...candidate('excluded'),selected:false}],200,100,.1);expect(walls).toHaveLength(1);expect(walls[0].start).toEqual({x:1,y:8});expect(walls[0].end).toEqual({x:11,y:8});expect(walls[0].thickness).toBeCloseTo(.6);});
 it('rejects nonfinite, out-of-image and collapsed proposals before uploading',()=>{expect(()=>confirmedWalls([{...candidate(),end:{x:NaN,y:1}}],200,100,.1)).toThrow('ongeldige');expect(()=>confirmedWalls([candidate('a',10,300)],200,100,.1)).toThrow('buiten');expect(()=>confirmedWalls([candidate('a',10,10)],200,100,.1)).toThrow('centimeter');expect(()=>assertImageScale(20000,20000,100)).toThrow('schaal');});
 it('merges touching/overlapping straight proposals, but preserves gaps and corners',()=>{expect(mergeWallCandidates(candidate('a',10,110),candidate('b',100,160)).end).toEqual({x:160,y:20});expect(()=>mergeWallCandidates(candidate('a',10,110),candidate('b',130,180))).toThrow('opening');expect(()=>mergeWallCandidates(candidate(),{...candidate('b'),start:{x:110,y:20},end:{x:110,y:70}})).toThrow('rechte');});
});
describe('cancelled analysis workers settle and release resources',()=>{
 const worker=()=>({onmessage:null,onerror:null,terminate:vi.fn(),postMessage:vi.fn()}) as unknown as Worker;
 it('clears its timer, rejects once as AbortError and ignores late replies on cancellation',async()=>{vi.useFakeTimers();const w=worker();const task=createCancellableWorkerTask(()=>w,{operation:'recognize'},[],45000);const result=task.promise.catch(error=>error);const late=w.onmessage!;task.cancel();expect(vi.getTimerCount()).toBe(0);expect(w.terminate).toHaveBeenCalledTimes(1);expect((await result).name).toBe('AbortError');late.call(w,{data:{candidates:[]}} as MessageEvent);vi.advanceTimersByTime(50000);expect(w.terminate).toHaveBeenCalledTimes(1);});
 it('cleans up after successful recognition and timeout alike',async()=>{vi.useFakeTimers();const w=worker();const job=createCancellableWorkerTask(()=>w,{},[],100);w.onmessage!({data:{candidates:['wall']}} as MessageEvent);expect(await job.promise).toEqual({candidates:['wall']});expect(vi.getTimerCount()).toBe(0);const w2=worker(),job2=createCancellableWorkerTask(()=>w2,{},[],100);const error=job2.promise.catch(error=>error);vi.advanceTimersByTime(101);expect((await error).message).toContain('duurt te lang');expect(vi.getTimerCount()).toBe(0);expect(w2.onmessage).toBeNull();expect(w2.terminate).toHaveBeenCalledTimes(1);});
});
