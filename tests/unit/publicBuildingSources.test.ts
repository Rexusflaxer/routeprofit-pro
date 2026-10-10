import { describe, expect, it, vi } from 'vitest';
import { createPublicAerialReference, discoverPublicBuildingReferences, geographicToRD, isCurrentBgtFeature, normalizePublicBuildingFeature, preparePublicAerial, rdToGeographic, type ReferenceGeo } from '../../base44/shared/floorPlans/publicBuildingSources';

const date = '2026-10-10T12:00:00.000Z';
const origin = { x: 201610, y: 495310 };
const geo: ReferenceGeo = { crs: 'EPSG:28992', origin, rotation: 0, verticalDatum: 'NAP', axis: 'x-east-y-north' };
const square = (x=origin.x,y=origin.y) => [[x-5,y-4],[x+5,y-4],[x+5,y+4],[x-5,y+4],[x-5,y-4]];
const feature = (props: Record<string,unknown> = {}, id='sample', rings=[square()]) => ({ type:'Feature',id,properties:{status:'bestaand',bag_pnd:'0246100000012576',tijdstip_registratie:'2025-01-01T00:00:00Z',...props},geometry:{type:'Polygon',coordinates:rings} });
const normalize = (f:any, options:any={}) => normalizePublicBuildingFeature(f,{source:'bgt',collection:'pand',geoReference:geo,checkedAt:date,url:'https://api.pdok.nl/kadaster/bgt/ogc/v1/collections/pand/items',...options});
const response = (features:any[], links:any[]=[]) => new Response(JSON.stringify({type:'FeatureCollection',features,links}),{headers:{'content-type':'application/geo+json'}});
const bagFeature = (id='bag')=>feature({identificatie:'0246100000012576',status:'Pand in gebruik'},id);
const bagSelection = {selectionKey:'bag:saved-business-id',bagId:'0246100000012576', selectedPoint:rdToGeographic(origin)};

describe('public building source geometry',()=>{
  it('preserves metre lengths, north-up coordinates and courtyard holes',()=>{
    const hole = [[origin.x-1,origin.y-1],[origin.x-1,origin.y+1],[origin.x+1,origin.y+1],[origin.x+1,origin.y-1],[origin.x-1,origin.y-1]];
    const candidate = normalize(feature({},'courtyard',[square(),hole]));
    expect(candidate?.polygons[0][0]).toEqual([{x:-5,y:-4},{x:5,y:-4},{x:5,y:4},{x:-5,y:4},{x:-5,y:-4}]);
    expect(candidate?.polygons[0]).toHaveLength(2);
    expect(candidate?.matching).toBe('nearby'); // The selected point is in the hole.
    expect(candidate?.distanceMetres).toBe(1);
    expect(candidate?.requiresConfirmation).toBe(true);
  });
  it('retains multipolygons without bridging disconnected column bases',()=>{
    const f = feature({type:'overkapping'},'canopy');
    f.geometry = {type:'MultiPolygon',coordinates:[[square()],[square(origin.x+15)]]} as any;
    const candidate = normalize(f,{collection:'overigbouwwerk'});
    expect(candidate?.structureType).toBe('canopy');
    expect(candidate?.polygons).toHaveLength(2);
  });
  it('never calls an open shed or canopy a closed building',()=>{
    expect(normalize(feature({type:'open loods'}),{collection:'overigbouwwerk'})?.structureType).toBe('open_shed');
    expect(normalize(feature({type:'niet-bgt',plus_type:'luifel'}),{collection:'gebouwinstallatie'})?.structureType).toBe('canopy');
    expect(normalize(feature({type:'onbekend'}),{collection:'overigbouwwerk'})?.structureType).toBe('unknown');
  });
  it('recognizes crossing manual outlines without inventing an exact BAG match',()=>{
    const selectedPolygons=[[ [{x:-1,y:-10},{x:1,y:-10},{x:1,y:10},{x:-1,y:10},{x:-1,y:-10}] ]];
    const result=normalize(feature(),{selectedPoint:{x:15,y:15},selectedPolygons});
    expect(result?.matching).toBe('overlap');
    expect(result?.requiresConfirmation).toBe(true);
  });
  it('matches the actual BAG number rather than a feature UUID or first neighbour',()=>{
    expect(normalize(feature(),{expectedBagId:'0246100000012576'})?.matching).toBe('exact_bag');
    expect(normalize(feature({bag_pnd:'0246100000019650'}),{expectedBagId:'0246100000012576'})).toBeNull();
  });
  it('rejects historic, future, malformed and zero-area source records',()=>{
    expect(isCurrentBgtFeature(feature({eind_registratie:'2025-01-01T00:00:00Z'}),date)).toBe(false);
    expect(isCurrentBgtFeature(feature({termination_date:'2025-01-01T00:00:00Z'}),date)).toBe(false);
    expect(isCurrentBgtFeature(feature({tijdstip_registratie:'2027-01-01T00:00:00Z'}),date)).toBe(false);
    expect(isCurrentBgtFeature(feature({status:'plan'}),date)).toBe(false);
    expect(isCurrentBgtFeature(feature({termination_date:'not-a-date'}),date)).toBe(false);
    expect(()=>normalize(feature({},'degenerate',[[[201600,495300],[201600,495300],[201600,495300],[201600,495300]]]))).toThrow();
    expect(()=>normalize(feature({},'geographic',[square(6,52)]))).toThrow();
  });
  it('normalizes the actual public Van der Zeelaan BGT response in exact RD metres',()=>{
    // Public PDOK fixture retrieved 2026-10-10; the BAG number is not the BGT feature UUID.
    const actual = {type:'Feature',id:'ba3c00d1-93ec-5f8e-b6ce-80764e8d61ee',properties:{bag_pnd:'0246100000012576',status:'bestaand',relatieve_hoogteligging:0,eind_registratie:null,termination_date:null,tijdstip_registratie:'2014-04-22T22:00:00Z',version:'d7132ada-1a3d-5c88-e1dc-bdc7eb7c4f03'},geometry:{type:'MultiPolygon',coordinates:[[[[201583.421,495888.611],[201579.728,495876.765],[201590.096,495873.719],[201594.203,495886.986],[201583.895,495890.129],[201583.421,495888.611]]]]}};
    const result=normalize(actual,{expectedBagId:'0246100000012576',geoReference:{...geo,origin:{x:201584.816,y:495883.765}}});
    expect(result?.polygons[0][0][0]).toEqual({x:-1.395,y:4.846});
    expect(result?.polygons[0][0][1]).toEqual({x:-5.088,y:-7});
    expect(result?.bagId).toBe('0246100000012576');
    expect(result?.sourceId).toBe('ba3c00d1-93ec-5f8e-b6ce-80764e8d61ee');
    expect(result?.provenance.license).toBe('CC0-1.0');
    expect(result?.provenance.version).toBe('d7132ada-1a3d-5c88-e1dc-bdc7eb7c4f03');
  });
  it('uses metric RD while map coordinates round-trip across the Netherlands',()=>{
    expect(geographicToRD([5.38720621,52.1551744])).toEqual({x:155000,y:463000});
    for (const p of [{x:201610,y:495310},{x:80000,y:420000},{x:230000,y:570000}]) {
      const back=geographicToRD(rdToGeographic(p));
      expect(Math.hypot(back.x-p.x,back.y-p.y)).toBeLessThan(0.1);
    }
  });
});

describe('bounded public discovery',()=>{
  it('loads current BGT pages completely, excludes neighbours and pins metre CRS',async()=>{
    const fetcher=vi.fn(async(input:any)=>{
      const url=new URL(String(input));
      if(url.pathname.includes('/bag/')) return response([bagFeature()]);
      expect(url.searchParams.get('datetime')).toBe(date);
      expect(url.searchParams.get('crs')?.endsWith('/28992')).toBe(true);
      if(!url.searchParams.has('cursor')) {
        const next=new URL(url);next.searchParams.set('cursor','page2');
        return response([feature({bag_pnd:'0246100000019650'},'neighbour')],[{rel:'next',href:next.href}]);
      }
      return response([feature({},'correct')]);
    });
    const result=await discoverPublicBuildingReferences(bagSelection,{fetch:fetcher as any,now:date});
    expect(result.candidates.map(c=>c.sourceId)).toEqual(['correct','bag']);
    expect(result.status).toBe('ready');expect(result.warnings).toEqual([]);
    expect(result.candidates.every(c=>c.matching==='exact_bag')).toBe(true);
    expect(result.aerial?.year).toBe(2026);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('proposes registered buildings at an unlinked point without replacing its business key',async()=>{
    const pointSelection={selectionKey:'point:my-existing-id',selectedPoint:rdToGeographic(origin)};
    const fetcher=vi.fn(async(input:any)=>String(input).includes('/bag/') ? response([bagFeature()]) : response(String(input).includes('/pand/')?[feature()]:[]));
    const result=await discoverPublicBuildingReferences(pointSelection,{fetch:fetcher as any,now:date});
    expect(pointSelection.selectionKey).toBe('point:my-existing-id');
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every(c=>c.matching==='contains_point'&&c.requiresConfirmation)).toBe(true);
  });
  it('discards an incomplete collection instead of trusting the first page',async()=>{
    const fetcher=vi.fn(async(input:any)=>{
      if(String(input).includes('/bag/'))return response([bagFeature()]);
      return response([feature()],[{rel:'next',href:'https://evil.invalid/private'}]);
    });
    const result=await discoverPublicBuildingReferences(bagSelection,{fetch:fetcher as any,now:date});
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].source).toBe('bag');
    expect(result.status).toBe('partial');
    expect(fetcher.mock.calls.every(([url])=>String(url).includes('api.pdok.nl'))).toBe(true);
  });
  it('rejects pagination that enlarges or removes the selected search area',async()=>{
    const fetcher=vi.fn(async(input:any)=>{
      const url=new URL(String(input));
      if(url.pathname.includes('/bag/'))return response([bagFeature()]);
      url.searchParams.delete('bbox');url.searchParams.set('cursor','bad');
      return response([feature()],[{rel:'next',href:url.href}]);
    });
    const result=await discoverPublicBuildingReferences(bagSelection,{fetch:fetcher as any,now:date});
    expect(result.candidates.map(c=>c.source)).toEqual(['bag']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('limits response bytes before JSON parsing and never follows redirects',async()=>{
    const fetcher=vi.fn(async(_input:any,init:any)=>{
      expect(init.redirect).toBe('manual');
      return new Response('{}',{headers:{'content-type':'application/json','content-length':'99999999'}});
    });
    const result=await discoverPublicBuildingReferences({selectionKey:'point:p',selectedPoint:rdToGeographic(origin)},{fetch:fetcher as any,now:date});
    expect(result.candidates).toEqual([]);expect(result.status).toBe('unavailable');
  });
});

describe('public aerial geometry and integrity',()=>{
  it('pins the year and square pixels to the same RD origin as the imported contour',()=>{
    const aerial=createPublicAerialReference([201600,495300,201637.27,495322.35],geo);
    expect(aerial.year).toBe(2026);
    expect(aerial.origin).toEqual({x:-10,y:round(aerial.bboxRD[1]-origin.y)});
    expect(aerial.width*aerial.metresPerPixel).toBeCloseTo(aerial.bboxRD[2]-aerial.bboxRD[0],6);
    expect(aerial.height*aerial.metresPerPixel).toBeCloseTo(aerial.bboxRD[3]-aerial.bboxRD[1],6);
    expect(new URL(aerial.url).searchParams.get('layers')).toBe('2026_orthoHR');
  });
  it('refuses URL changes, error XML disguised as JPEG, and inconsistent dimensions',async()=>{
    const aerial=createPublicAerialReference([201600,495300,201650,495350],geo);
    const never=vi.fn();
    await expect(preparePublicAerial({...aerial,url:'https://evil.invalid/photo'},{fetch:never as any})).rejects.toThrow('gewijzigd');
    expect(never).not.toHaveBeenCalled();
    const xml=vi.fn(async()=>new Response('<error/>',{headers:{'content-type':'image/jpeg'}}));
    await expect(preparePublicAerial(aerial,{fetch:xml as any})).rejects.toThrow('JPEG');
    const bytes=jpeg(aerial.width+1,aerial.height);
    const dimensions=vi.fn(async()=>new Response(bytes,{headers:{'content-type':'image/jpeg'}}));
    await expect(preparePublicAerial(aerial,{fetch:dimensions as any})).rejects.toThrow('afmetingen');
  });
  it('has a stable regenerated extent even at floating-point resolution boundaries',async()=>{
    for(const box of [[201599.773,495279.897,201642.83,495331.16],[201600,495300,202500.127,495831.287]] as [number,number,number,number][]) {
      const aerial=createPublicAerialReference(box,geo);
      const bytes=jpeg(aerial.width,aerial.height);
      const prepared=await preparePublicAerial(aerial,{fetch:vi.fn(async()=>new Response(bytes,{headers:{'content-type':'image/jpeg'}})) as any});
      expect(prepared.origin).toEqual(aerial.origin);
    }
  });
});
function round(v:number){return Math.round(v*1000)/1000;}

function jpeg(width:number,height:number){return new Uint8Array([255,216,255,192,0,11,8,height>>8,height&255,width>>8,width&255,1,1,0,0,255,217]);}
