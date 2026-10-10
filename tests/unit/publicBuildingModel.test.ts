import {describe,expect,it,vi} from 'vitest';
import {inflateSync,zipSync} from 'fflate';
import {extractPublicCityJSON,normalizePublicCityModel,preparePublicBuildingModel,type PublicBuildingModelRequest} from '../../base44/shared/floorPlans/publicBuildingModel';
const id='NL.IMBAG.Pand.0246100000012576';
const request:PublicBuildingModelRequest={bagId:'0246100000012576',geoReference:{crs:'EPSG:28992',origin:{x:201600,y:495880},rotation:0,verticalDatum:'NAP',axis:'x-east-y-north'},sourceBounds:[201600,495880,201610,495892]};
const provenance={source:'kadaster_3d' as const,url:'https://3d.kadaster.nl/kadaster/basisvoorziening-3d/2025/gebouwen/buildings_2025_200000_494000.zip',retrievedAt:'2026-10-10T14:00:00.000Z',sourceYear:2025};
function fixture():any{return{type:'CityJSON',version:'2.0',metadata:{referenceSystem:'https://www.opengis.net/def/crs/EPSG/0/7415',referenceDate:'2026-06-16'},transform:{scale:[0.001,0.001,0.001],translate:[201600,495880,0]},CityObjects:{[id]:{type:'Building',children:[`${id}-0`],attributes:{identificatie:id,rf_h_ground:5,rf_pc_year:2025,rf_pc_source:'AHN6',rf_rmse_lod22:0.5,rf_roof_type:'horizontal'}},[`${id}-0`]:{type:'BuildingPart',parents:[id],geometry:[{type:'Solid',lod:'2.2',boundaries:[[[[0,1,2,3]],[[0,4,5,1]],[[1,5,6,2]],[[2,6,7,3]],[[3,7,4,0]],[[4,7,6,5]]]],semantics:{surfaces:[{type:'GroundSurface'},{type:'WallSurface'},{type:'RoofSurface'}],values:[[0,1,1,1,1,2]]}}]},'NL.IMBAG.Pand.9999999999999999':{type:'Building',geometry:[{type:'Solid',lod:'2.2',boundaries:[[[[8,9,10]]]]}]}},vertices:[[0,0,5000],[10000,0,5000],[10000,12000,5000],[0,12000,5000],[0,0,8000],[10000,0,8100],[10000,12000,8300],[0,12000,8200],[999999999,0,0],[999999998,0,0],[999999997,1,0]]};}
const decode=(compressed:Uint8Array,expected:number)=>inflateSync(compressed,{out:new Uint8Array(expected)});
const archive=(data:any=fixture())=>zipSync({'buildings_2025_200000_494000.city.json':Uint8Array.from(new TextEncoder().encode(JSON.stringify(data)))});
const wrapped=(data:any)=>({feature:{type:'CityJSONFeature',CityObjects:data.CityObjects,vertices:data.vertices},metadata:{type:'CityJSON',version:'2.0',metadata:data.metadata,transform:data.transform}});
const json=(data:any)=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});

describe('public CityJSON normalization',()=>{
 it('applies scale + translation, keeps north positive and subtracts ground NAP',()=>{
  const model=normalizePublicCityModel(fixture(),request,provenance);
  expect(model.vertices).toContainEqual({x:10,y:12,z:3.3});
  expect(model.vertices).toContainEqual({x:0,y:0,z:0});
  expect(model.vertices).toHaveLength(8);expect(model.surfaces).toHaveLength(6);
  expect(model.surfaces.filter(s=>s.type==='roof')).toHaveLength(1);
  expect(model.groundNAP).toBe(5);expect(model.sourceYear).toBe(2025);
  expect(model.quality.rmseMetres).toBe(0.5);expect(model.quality.pointCloudSource).toBe('AHN6');
  expect(model.provenance.lod).toBe('2.2');
 });
 it('preserves holes and ring order rather than fan-triangulating a roof',()=>{
  const raw=fixture();raw.vertices.push([2000,2000,8020],[2000,4000,8040],[4000,4000,8060],[4000,2000,8040]);
  raw.CityObjects[`${id}-0`].geometry[0].boundaries[0][5].push([11,12,13,14]);
  const model=normalizePublicCityModel(raw,request,provenance);
  expect(model.surfaces.find(s=>s.type==='roof')?.rings.map(r=>r.length)).toEqual([4,4]);
  expect(model.vertices).toHaveLength(12);
 });
 it('selects only the requested BAG parent and its verified children',()=>{
  expect(()=>normalizePublicCityModel(fixture(),{...request,bagId:'0246100000019999'},provenance)).toThrow('BAG-pand');
  const raw=fixture();raw.CityObjects[`${id}-0`].parents=['NL.IMBAG.Pand.9999999999999999'];
  expect(()=>normalizePublicCityModel(raw,request,provenance)).toThrow('gebouwonderdeel');
  const model=normalizePublicCityModel(fixture(),request,provenance);
  expect(model.vertices.every(v=>Math.abs(v.x)<20)).toBe(true);
 });
 it('rejects missing CRS, absent transforms, unusable quality and distant geometry',()=>{
  for(const mutate of [(f:any)=>delete f.metadata.referenceSystem,(f:any)=>delete f.transform,(f:any)=>f.CityObjects[id].attributes.rf_pointcloud_unusable=true,(f:any)=>f.vertices[0][0]=2000000]){
   const raw=fixture();mutate(raw);expect(()=>normalizePublicCityModel(raw,request,provenance)).toThrow();
  }
 });
 it('does not confuse absolute roof NAP with building height or invent missing ground',()=>{
  const raw=fixture();delete raw.CityObjects[id].attributes.rf_h_ground;
  const model=normalizePublicCityModel(raw,request,provenance);
  expect(model.groundNAP).toBe(5);expect(model.quality.groundSource).toBe('model_surface');
  raw.CityObjects[`${id}-0`].geometry[0].semantics.surfaces[0].type='Other';
  expect(()=>normalizePublicCityModel(raw,request,provenance)).toThrow('maaiveldhoogte');
 });
 it('uses 3DBAG wrapper metadata and source fields without guessing a newer year',()=>{
  const raw=fixture();raw.CityObjects[id].attributes={identificatie:id,b3_h_maaiveld:5,b3_pw_datum:2022,b3_pw_bron:'ahn4',b3_rmse_lod22:0.13};
  const model=normalizePublicCityModel(wrapped(raw),request,{...provenance,source:'3dbag'});
  expect(model.sourceYear).toBe(2022);expect(model.quality.pointCloudSource).toBe('ahn4');
  expect(model.attributions[0]).toContain('tudelft3d en 3DGI');
 });
});

describe('bounded CityJSON ZIP handling',()=>{
 it('extracts a single compressed CityJSON with CRC validation',()=>{
  expect(extractPublicCityJSON(archive(),decode).CityObjects[id].type).toBe('Building');
 });
 it('rejects truncation, path traversal and multiple competing CityJSON files',()=>{
  const bytes=archive();expect(()=>extractPublicCityJSON(bytes.slice(0,-1),decode)).toThrow();
  const data=Uint8Array.from(new TextEncoder().encode(JSON.stringify(fixture())));
  expect(()=>extractPublicCityJSON(zipSync({'../buildings_2025_1_1.city.json':data}),decode)).toThrow();
  expect(()=>extractPublicCityJSON(zipSync({'buildings_2025_1_1.city.json':data,'buildings_2025_1_2.city.json':data}),decode)).toThrow();
 });
 it('checks uncompressed limits before decompression and rejects a wrong output CRC',()=>{
  const bytes=archive(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);let offset=0;
  while(offset<bytes.length-4&&view.getUint32(offset,true)!==0x02014b50)offset++;
  view.setUint32(offset+24,25*1024*1024,true);
  const inflate=vi.fn(decode);expect(()=>extractPublicCityJSON(bytes,inflate)).toThrow();expect(inflate).not.toHaveBeenCalled();
  expect(()=>extractPublicCityJSON(archive(),(_input,max)=>new Uint8Array(max))).toThrow('beschadigd');
 });
});

describe('optional exterior model lookup',()=>{
 it('prefers the exact Kadaster building and allows only its documented download redirect',async()=>{
  const zip=archive(),download='https://download.pdok.nl/kadaster/basisvoorziening-3d/v1_0/2025/gebouwen/buildings_2025_200000_494000.zip';
  const fetcher=vi.fn(async(input:any,init:any)=>{
   expect(init.redirect).toBe('manual');const url=String(input);
   if(url.includes('api.pdok.nl'))return json({features:[{properties:{jaargang_luchtfoto:2025,download_link:download}}]});
   if(url.startsWith('https://download.pdok.nl'))return new Response(null,{status:302,headers:{location:provenance.url}});
   if(url===provenance.url)return new Response(new Uint8Array(zip));
   throw new Error('Unexpected request');
  });
  const result=await preparePublicBuildingModel(request,{fetch:fetcher as any,inflateRaw:decode,now:provenance.retrievedAt});
  expect(result.model?.provenance.source).toBe('kadaster_3d');expect(result.warnings).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(3);
 });
 it('rejects arbitrary download hosts and falls back without losing the footprint',async()=>{
  const fetcher=vi.fn(async(input:any)=>String(input).includes('api.pdok.nl')?json({features:[{properties:{jaargang_luchtfoto:2025,download_link:'https://private.invalid/secret.zip'}}]}):json(wrapped(fixture())));
  const result=await preparePublicBuildingModel(request,{fetch:fetcher as any,inflateRaw:decode,now:provenance.retrievedAt});
  expect(result.model?.provenance.source).toBe('3dbag');
  expect(result.warnings.length).toBeGreaterThan(0);
  expect(fetcher.mock.calls.every(([u])=>!String(u).includes('private.invalid'))).toBe(true);
 });
 it('returns an optional-model warning when both sources are unavailable',async()=>{
  const result=await preparePublicBuildingModel(request,{fetch:vi.fn(async()=>new Response(null,{status:503})) as any,inflateRaw:decode});
  expect(result.model).toBeNull();expect(result.warnings.join(' ')).toContain('buitenvorm');
 });
});
