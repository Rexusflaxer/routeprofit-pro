import { rdToGeographic, type ReferenceGeo } from './publicBuildingSources.ts';

export type PublicBuildingModel = {
  schemaVersion: 1; bagId: string; geoReference: ReferenceGeo;
  vertices: Array<{x:number;y:number;z:number}>;
  surfaces: Array<{rings:number[][];type:'roof'|'wall'|'ground'|'other'}>;
  groundNAP: number; sourceYear: number | null;
  quality: {rmseMetres?:number;pointCloudSource?:string;referenceDate?:string;roofType?:string;groundSource:'model_attribute'|'model_surface'};
  provenance: {source:'kadaster_3d'|'3dbag';sourceId:string;url:string;retrievedAt:string;license:'CC-BY-4.0';attribution:string;lod:string};
  attributions: string[];
};
export type PublicBuildingModelRequest = {bagId:string;geoReference:ReferenceGeo;sourceBounds?:[number,number,number,number]};
export type PublicBuildingModelOptions = {fetch?:typeof globalThis.fetch;now?:Date|string;timeoutMs?:number;inflateRaw?:(compressed:Uint8Array,expectedBytes:number)=>Uint8Array};
const INDEX='https://api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1/collections/basisbestand_gebouwen/items';
const MAX_ARCHIVE=12*1024*1024,MAX_DOCUMENT=12*1024*1024,MAX_MODEL=2*1024*1024;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const rounded=(value:number)=>Math.round(value*1000)/1000;
const clipped=(value:unknown)=>typeof value==='string'?value.slice(0,160):undefined;
function validateRequest(request:PublicBuildingModelRequest) {
  if(!/^\d{16}$/.test(request.bagId)||request.geoReference?.crs!=='EPSG:28992'||request.geoReference?.axis!=='x-east-y-north'||request.geoReference?.rotation!==0||request.geoReference?.verticalDatum!=='NAP'||!finite(request.geoReference?.origin?.x)||!finite(request.geoReference?.origin?.y))throw new Error('Ongeldige gebouwreferentie voor het buitenmodel.');
  rdToGeographic(request.geoReference.origin);
  if(request.sourceBounds){const [x1,y1,x2,y2]=request.sourceBounds;if(![x1,y1,x2,y2].every(finite)||x2<=x1||y2<=y1||x2-x1>1000||y2-y1>1000||Math.abs((x1+x2)/2-request.geoReference.origin.x)>1000||Math.abs((y1+y2)/2-request.geoReference.origin.y)>1000)throw new Error('Ongeldige begrenzing voor het buitenmodel.');}
}
/** Normalize only the selected parent and its verified children; never import a whole tile. */
export function normalizePublicCityModel(raw:any,request:PublicBuildingModelRequest,provenance:{source:'kadaster_3d'|'3dbag';url:string;retrievedAt:string;sourceYear?:number}):PublicBuildingModel {
  validateRequest(request);
  const feature=raw?.feature??raw;
  const header=raw?.feature?raw.metadata:raw;
  const crs=header?.metadata?.referenceSystem;
  if(typeof crs!=='string'||!/(?:\/|:)7415$/.test(crs))throw new Error('Het buitenmodel gebruikt geen bevestigde RD/NAP-referentie.');
  const transform=header?.transform;
  if(!Array.isArray(transform?.scale)||!Array.isArray(transform?.translate)||transform.scale.length!==3||transform.translate.length!==3||!transform.scale.every((n:unknown)=>finite(n)&&n>0&&n<=10)||!transform.translate.every(finite))throw new Error('Schaal of oorsprong van het buitenmodel ontbreekt.');
  if(!Array.isArray(feature?.vertices)||!feature?.CityObjects||typeof feature.CityObjects!=='object')throw new Error('Ongeldig CityJSON-bestand.');
  const parentId=`NL.IMBAG.Pand.${request.bagId}`;
  const parent=feature.CityObjects[parentId];
  if(!parent||parent.type!=='Building')throw new Error('Het gekozen BAG-pand staat niet in dit buitenmodel.');
  const attributes=parent.attributes??{};
  const statedId=attributes.identificatie;
  if(statedId!=null&&statedId!==parentId&&statedId!==request.bagId)throw new Error('De gebouwidentiteit in het buitenmodel komt niet overeen.');
  if(attributes.rf_pointcloud_unusable===true||attributes.b3_pw_onvoldoende===true||attributes.rf_success===false)throw new Error('De bron markeert dit buitenmodel als onbruikbaar.');
  const members:any[]=[parent],seen=new Set([parentId]);
  const walk=(id:string,depth:number)=>{
    if(depth>4)throw new Error('Het buitenmodel bevat te veel geneste onderdelen.');
    const object=feature.CityObjects[id];
    if(object.children!=null&&!Array.isArray(object.children))throw new Error('Ongeldige gebouwonderdelen.');
    for(const childId of object.children??[]){
      if(typeof childId!=='string'||seen.has(childId))throw new Error('Onzekere koppeling van gebouwonderdelen.');
      const child=feature.CityObjects[childId];
      if(!child||child.type!=='BuildingPart'||!Array.isArray(child.parents)||!child.parents.includes(id))throw new Error('Een gebouwonderdeel hoort niet aantoonbaar bij dit BAG-pand.');
      seen.add(childId);members.push(child);if(members.length>200)throw new Error('Te veel gebouwonderdelen.');walk(childId,depth+1);
    }
  };walk(parentId,0);
  const surfaces:Array<{rings:number[][];type:'roof'|'wall'|'ground'|'other'}>=[];
  let lod=0,totalReferences=0;
  for(const object of members){
    const choices=(Array.isArray(object.geometry)?object.geometry:[]).filter((g:any)=>['Solid','MultiSurface','CompositeSurface'].includes(g?.type)&&finite(Number(g.lod))&&Number(g.lod)>=1&&Number(g.lod)<=2.2).sort((a:any,b:any)=>Number(b.lod)-Number(a.lod));
    if(!choices.length)continue;
    const geometry=choices[0];lod=Math.max(lod,Number(geometry.lod));
    const groups=geometry.type==='Solid'?geometry.boundaries:[geometry.boundaries];
    const semantics=geometry.type==='Solid'?geometry.semantics?.values:[geometry.semantics?.values];
    if(!Array.isArray(groups)||groups.length>50)throw new Error('Ongeldige modelvlakken.');
    for(let shell=0;shell<groups.length;shell++){
      if(!Array.isArray(groups[shell]))throw new Error('Ongeldige modelvlakken.');
      for(let surface=0;surface<groups[shell].length;surface++){
        const rings=groups[shell][surface];
        if(!Array.isArray(rings)||!rings.length||rings.length>100)throw new Error('Ongeldige modelringen.');
        const normalized=rings.map((ring:any)=>{
          totalReferences+=Array.isArray(ring)?ring.length:0;
          if(totalReferences>100000)throw new Error('Het buitenmodel heeft te veel vlakverwijzingen.');
          if(!Array.isArray(ring)||ring.length<3||ring.length>20000||!ring.every((index:unknown)=>Number.isInteger(index)&&Number(index)>=0&&Number(index)<feature.vertices.length))throw new Error('Ongeldige vertexverwijzing in het model.');
          const clean=ring[0]===ring[ring.length-1]?ring.slice(0,-1):ring.slice();
          if(new Set(clean).size<3)throw new Error('Een modelvlak heeft onvoldoende verschillende punten.');
          return clean;
        });
        const semanticIndex=semantics?.[shell]?.[surface];
        const semantic=Number.isInteger(semanticIndex)?geometry.semantics?.surfaces?.[semanticIndex]?.type:undefined;
        const type:PublicBuildingModel['surfaces'][number]['type']=semantic==='RoofSurface'?'roof':semantic==='WallSurface'?'wall':semantic==='GroundSurface'?'ground':'other';
        surfaces.push({rings:normalized,type});if(surfaces.length>20000)throw new Error('Het buitenmodel heeft te veel vlakken.');
      }
    }
  }
  if(!surfaces.length||!surfaces.some(s=>s.type==='roof'))throw new Error('Het buitenmodel bevat geen herkenbare dakvlakken.');
  const sourceIndices=[...new Set(surfaces.flatMap(s=>s.rings.flat()))];
  if(sourceIndices.length>20000)throw new Error('Het buitenmodel heeft te veel punten.');
  const rdVertices=new Map<number,{x:number;y:number;z:number}>();
  for(const index of sourceIndices){
    const source=feature.vertices[index];
    if(!Array.isArray(source)||source.length!==3||!source.every(finite))throw new Error('Het buitenmodel bevat ongeldige coördinaten.');
    const [x,y,z]=source.map((n:number,i:number)=>n*transform.scale[i]+transform.translate[i]);
    if(![x,y,z].every(finite)||Math.abs(x-request.geoReference.origin.x)>1000||Math.abs(y-request.geoReference.origin.y)>1000||z< -25||z>1000)throw new Error('Het buitenmodel valt buiten het geselecteerde gebouwgebied.');
    if(request.sourceBounds){const [x1,y1,x2,y2]=request.sourceBounds;if(x<x1-30||x>x2+30||y<y1-30||y>y2+30)throw new Error('Het buitenmodel past niet bij de geselecteerde buitenvorm.');}
    rdVertices.set(index,{x,y,z});
  }
  const statedGround=attributes.rf_h_ground??attributes.b3_h_maaiveld;
  const groundVertices=surfaces.filter(s=>s.type==='ground').flatMap(s=>s.rings.flat()).map(i=>rdVertices.get(i)!.z);
  const groundNAP=finite(statedGround)?statedGround:groundVertices.length?Math.min(...groundVertices):NaN;
  if(!finite(groundNAP)||groundNAP< -25||groundNAP>400)throw new Error('De maaiveldhoogte van het buitenmodel ontbreekt.');
  const vertices=sourceIndices.map(i=>{const p=rdVertices.get(i)!;return{x:rounded(p.x-request.geoReference.origin.x),y:rounded(p.y-request.geoReference.origin.y),z:rounded(p.z-groundNAP)};});
  if(vertices.some(v=>v.z< -5||v.z>500))throw new Error('De hoogte van het buitenmodel is onbruikbaar.');
  const indices=new Map(sourceIndices.map((v,i)=>[v,i]));
  const remapped=surfaces.map(surface=>({...surface,rings:surface.rings.map(ring=>ring.map(index=>indices.get(index)!))}));
  const year=attributes.rf_pc_year??attributes.b3_pw_datum??provenance.sourceYear;
  const sourceYear=Number.isInteger(year)&&year>=2000&&year<=new Date(provenance.retrievedAt).getUTCFullYear()?year:null;
  const rmse=attributes[`rf_rmse_lod${String(lod).replace('.','')}`]??attributes[`b3_rmse_lod${String(lod).replace('.','')}`];
  const attribution=provenance.source==='kadaster_3d'?'Kadaster 3D Basisvoorziening · CC BY 4.0 · creativecommons.org/licenses/by/4.0':'© 3DBAG door tudelft3d en 3DGI · CC BY 4.0 · creativecommons.org/licenses/by/4.0';
  const model:PublicBuildingModel={schemaVersion:1,bagId:request.bagId,geoReference:request.geoReference,vertices,surfaces:remapped,groundNAP:rounded(groundNAP),sourceYear,
    quality:{groundSource:finite(statedGround)?'model_attribute':'model_surface',...(finite(rmse)&&rmse>=0?{rmseMetres:rmse}:{}),...(clipped(attributes.rf_pc_source??attributes.b3_pw_bron)?{pointCloudSource:clipped(attributes.rf_pc_source??attributes.b3_pw_bron)}:{}),...(clipped(header.metadata?.referenceDate)?{referenceDate:clipped(header.metadata?.referenceDate)}:{}),...(clipped(attributes.rf_roof_type??attributes.b3_dak_type)?{roofType:clipped(attributes.rf_roof_type??attributes.b3_dak_type)}:{})},
    provenance:{source:provenance.source,sourceId:parentId,url:provenance.url,retrievedAt:provenance.retrievedAt,license:'CC-BY-4.0',attribution,lod:String(lod)},attributions:[attribution]};
  if(new TextEncoder().encode(JSON.stringify(model)).length>MAX_MODEL)throw new Error('Het uitgeknipte buitenmodel is te groot.');
  return model;
}
function crc32(bytes:Uint8Array):number {
  let crc=0xffffffff;
  for(const value of bytes){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
/** Read a single bounded CityJSON entry. No extraction to disk and no ZIP64. */
export function extractPublicCityJSON(archive:Uint8Array,inflateRaw:NonNullable<PublicBuildingModelOptions['inflateRaw']>):any {
  if(archive.byteLength>MAX_ARCHIVE||archive.byteLength<22)throw new Error('Het bronarchief is te groot of onvolledig.');
  const view=new DataView(archive.buffer,archive.byteOffset,archive.byteLength);let end=-1;
  for(let p=archive.length-22;p>=Math.max(0,archive.length-65557);p--)if(view.getUint32(p,true)===0x06054b50&&p+22+view.getUint16(p+20,true)===archive.length){end=p;break;}
  if(end<0||view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0||view.getUint16(end+8,true)!==view.getUint16(end+10,true))throw new Error('Ongeldig bronarchief.');
  const entries=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
  if(entries<1||entries>50||start+size!==end)throw new Error('Het bronarchief heeft een ongeldige inhoudsopgave.');
  let cursor=start;const candidates:Array<{name:string;compressed:number;uncompressed:number;offset:number;crc:number;method:number;flags:number}>=[];
  for(let n=0;n<entries;n++){
    if(cursor+46>end||view.getUint32(cursor,true)!==0x02014b50)throw new Error('Ongeldige archiefverwijzing.');
    const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),checksum=view.getUint32(cursor+16,true),compressed=view.getUint32(cursor+20,true),uncompressed=view.getUint32(cursor+24,true),nameLength=view.getUint16(cursor+28,true),extraLength=view.getUint16(cursor+30,true),commentLength=view.getUint16(cursor+32,true),offset=view.getUint32(cursor+42,true);
    const next=cursor+46+nameLength+extraLength+commentLength;if(next>end||view.getUint16(cursor+34,true)!==0)throw new Error('Ongeldige archiefverwijzing.');
    const name=new TextDecoder('utf-8',{fatal:true}).decode(archive.slice(cursor+46,cursor+46+nameLength));
    if(/\.city\.json$/i.test(name)){
      if(!/^buildings_\d{4}_\d+_\d+\.city\.json$/.test(name)||(flags&1)!==0||![0,8].includes(method)||uncompressed<2||uncompressed>MAX_DOCUMENT||compressed<2||compressed>MAX_ARCHIVE||offset>=start)throw new Error('Het CityJSON-archiefbestand is niet veilig begrensd.');
      candidates.push({name,compressed,uncompressed,offset,crc:checksum,method,flags});
    }
    cursor=next;
  }
  if(cursor!==end||candidates.length!==1)throw new Error('Het bronarchief bevat niet precies één CityJSON-bestand.');
  const entry=candidates[0],p=entry.offset;
  if(p+30>start||view.getUint32(p,true)!==0x04034b50||view.getUint16(p+6,true)!==entry.flags||view.getUint16(p+8,true)!==entry.method)throw new Error('De archiefheaders komen niet overeen.');
  const nameLength=view.getUint16(p+26,true),extraLength=view.getUint16(p+28,true),dataStart=p+30+nameLength+extraLength;
  if(dataStart+entry.compressed>start||new TextDecoder().decode(archive.slice(p+30,p+30+nameLength))!==entry.name)throw new Error('Ongeldige archiefbestandsgrenzen.');
  const compressed=archive.slice(dataStart,dataStart+entry.compressed);
  const bytes=entry.method===0?compressed:inflateRaw(compressed,entry.uncompressed);
  if(bytes.length!==entry.uncompressed||crc32(bytes)!==entry.crc)throw new Error('Het bronarchief is beschadigd of onvolledig.');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function permittedURL(raw:string):URL {
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash)throw new Error('Niet-toegestane modelbron.');
  const index=url.origin==='https://api.pdok.nl'&&url.pathname==='/kadaster/3d-basisvoorziening/ogc/v1/collections/basisbestand_gebouwen/items';
  const bag=url.origin==='https://api.3dbag.nl'&&/^\/collections\/pand\/items\/NL\.IMBAG\.Pand\.\d{16}$/.test(url.pathname);
  const pdok=url.origin==='https://download.pdok.nl'&&/^\/kadaster\/basisvoorziening-3d\/v1_0\/\d{4}\/gebouwen\/buildings_\d{4}_\d+_\d+\.zip$/.test(url.pathname);
  const kadaster=url.origin==='https://3d.kadaster.nl'&&/^\/kadaster\/basisvoorziening-3d\/\d{4}\/gebouwen\/buildings_\d{4}_\d+_\d+\.zip$/.test(url.pathname);
  if(!index&&!bag&&!pdok&&!kadaster)throw new Error('Niet-toegestane modelbron.');
  if((pdok||kadaster)&&url.search)throw new Error('Onverwachte parameters in de modelbron.');
  return url;
}
async function fetchBounded(url:string,max:number,options:PublicBuildingModelOptions,deadline:number):Promise<Uint8Array>{
  const parsed=permittedURL(url),controller=new AbortController(),remaining=deadline-Date.now();
  if(remaining<=0)throw new Error('De modelbron reageert te langzaam.');
  const timer=setTimeout(()=>controller.abort(),Math.min(remaining,Math.max(100,options.timeoutMs??15000)));
  try {
    let response=await(options.fetch??globalThis.fetch)(url,{redirect:'manual',signal:controller.signal,headers:{Accept:url.endsWith('.zip')?'application/zip':'application/json'}});
    if([301,302,307,308].includes(response.status)&&parsed.origin==='https://download.pdok.nl'){
      const expected=`https://3d.kadaster.nl${parsed.pathname.replace('/v1_0/','/')}`,location=new URL(response.headers.get('location')??'',url).href;
      if(location!==expected)throw new Error('Onverwachte doorverwijzing van de modelbron.');
      permittedURL(location);await response.body?.cancel();
      response=await(options.fetch??globalThis.fetch)(location,{redirect:'manual',signal:controller.signal});
    }
    if(!response.ok||response.redirected||Number(response.headers.get('content-length'))>max||!response.body)throw new Error('De modelbron is niet beschikbaar of te groot.');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
    try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>max)throw new Error('Het modelbestand is te groot.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
    const output=new Uint8Array(length);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;
  } finally {clearTimeout(timer);}
}
export async function preparePublicBuildingModel(request:PublicBuildingModelRequest,options:PublicBuildingModelOptions={}):Promise<{model:PublicBuildingModel|null;warnings:string[]}> {
  validateRequest(request);const checkedAt=new Date(options.now??Date.now()).toISOString(),warnings:string[]=[],deadline=Date.now()+45000;
  const bounds=request.sourceBounds??[request.geoReference.origin.x-10,request.geoReference.origin.y-10,request.geoReference.origin.x+10,request.geoReference.origin.y+10];
  const corners=[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]]].map(([x,y])=>rdToGeographic({x,y}));
  const bbox=[Math.min(...corners.map(c=>c[0])),Math.min(...corners.map(c=>c[1])),Math.max(...corners.map(c=>c[0])),Math.max(...corners.map(c=>c[1]))].join(',');
  if(options.inflateRaw){
    try {
      const index=new URL(INDEX);for(const [key,value]of Object.entries({f:'json',bbox,limit:'20',jaargang_luchtfoto:'2025'}))index.searchParams.set(key,value);
      const listing=JSON.parse(new TextDecoder().decode(await fetchBounded(index.href,1024*1024,options,deadline)));
      if(!Array.isArray(listing.features)||listing.features.length>20||listing.links?.some((l:any)=>l.rel==='next'))throw new Error('De modeltegelselectie is niet volledig.');
      const downloads=[...new Set<string>(listing.features.filter((f:any)=>f.properties?.jaargang_luchtfoto===2025).map((f:any)=>f.properties?.download_link))].filter((v):v is string=>typeof v==='string');
      if(downloads.length>4)throw new Error('Te veel modeltegels voor dit gebouw.');
      for(const url of downloads){
        const raw=extractPublicCityJSON(await fetchBounded(url,MAX_ARCHIVE,options,deadline),options.inflateRaw);
        if(!raw?.CityObjects?.[`NL.IMBAG.Pand.${request.bagId}`])continue;
        return {model:normalizePublicCityModel(raw,request,{source:'kadaster_3d',url,retrievedAt:checkedAt,sourceYear:2025}),warnings};
      }
      warnings.push('In de Kadaster-bron is geen passend buitenmodel gevonden.');
    } catch {warnings.push('Het Kadaster-buitenmodel kon niet worden geladen. De buitenvorm blijft beschikbaar.');}
  } else warnings.push('De Kadaster-archiefadapter is niet beschikbaar; een alternatief buitenmodel wordt gezocht.');
  try {
    const url=`https://api.3dbag.nl/collections/pand/items/NL.IMBAG.Pand.${request.bagId}`;
    const raw=JSON.parse(new TextDecoder().decode(await fetchBounded(url,MAX_MODEL,options,deadline)));
    const model=normalizePublicCityModel(raw,request,{source:'3dbag',url,retrievedAt:checkedAt});
    warnings.push('Het buitenmodel komt uit 3DBAG. Controleer bronjaar en verschillen met de buitenvorm.');
    return {model,warnings};
  } catch {warnings.push('Er is geen bruikbaar buitenmodel beschikbaar. U kunt met de buitenvorm verder.');return {model:null,warnings};}
}
export const discoverPublicBuildingModel=preparePublicBuildingModel;
