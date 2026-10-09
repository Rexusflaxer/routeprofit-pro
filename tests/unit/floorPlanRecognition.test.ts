import { describe, expect, it } from 'vitest';
import { calibratedScale, pdfVectorSegments, proposeWalls, splitCandidate, toWorld } from '../../src/features/floorplans/recognition';

describe('local wall proposals',()=>{
  it('pairs parallel wall edges and preserves door gaps',()=>{
    const segments=[{start:{x:20,y:20},end:{x:180,y:20}},{start:{x:20,y:28},end:{x:180,y:28}},{start:{x:220,y:20},end:{x:400,y:20}},{start:{x:220,y:28},end:{x:400,y:28}}];
    const candidates=proposeWalls(segments,500,500).filter(c=>c.confidence==='strong');
    expect(candidates).toHaveLength(2);expect(candidates[0].thickness).toBe(8);
    expect(candidates.every(c=>!(c.start.x<180&&c.end.x>220))).toBe(true);
  });
  it('supports diagonal wall pairs without forcing right angles',()=>{
    const candidates=proposeWalls([{start:{x:10,y:10},end:{x:110,y:110}},{start:{x:16,y:4},end:{x:116,y:104}}],500,500);
    expect(candidates[0].confidence).toBe('strong');expect(candidates[0].thickness).toBeCloseTo(Math.sqrt(72));
    expect(candidates[0].end.x-candidates[0].start.x).toBeCloseTo(candidates[0].end.y-candidates[0].start.y);
  });
  it('does not call a single line a confirmed wall',()=>{
    const [candidate]=proposeWalls([{start:{x:10,y:20},end:{x:300,y:20}}],500,500);
    expect(candidate.confidence).toBe('review');expect(candidate.selected).toBe(false);
  });
  it('rejects excessive work instead of a silently truncated plan',()=>{
    expect(()=>proposeWalls(Array.from({length:8001},()=>({start:{x:0,y:0},end:{x:20,y:0}})),500,500)).toThrow('Te veel lijnen');
  });
  it('requires a real distance and maps image Y down to model Y up',()=>{
    expect(calibratedScale({x:10,y:10},{x:110,y:10},10)).toBe(.1);
    expect(toWorld({x:30,y:20},200,.1)).toEqual({x:3,y:18});
    expect(()=>calibratedScale({x:10,y:10},{x:11,y:10},10)).toThrow();
    expect(()=>calibratedScale({x:0,y:0},{x:100,y:0},0)).toThrow();
  });
  it('splits a selected suggestion without discarding its thickness or selection',()=>{
    const [c]=proposeWalls([{start:{x:0,y:20},end:{x:100,y:20}}],500,500);
    const [a,b]=splitCandidate({...c,selected:true});expect(a.end).toEqual(b.start);expect(a.end.x).toBe(50);expect(a.selected&&b.selected).toBe(true);
  });
});

describe('pinned PDF vector adapter',()=>{
  const ops={save:10,restore:11,transform:12,setLineWidth:13,constructPath:91,stroke:20,fill:21,clip:29};
  it('combines page and nested graphics transforms in rendering order',()=>{
    const list={fnArray:[10,12,13,91,11],argsArray:[[],[2,0,0,2,10,20],[3],[20,[[0,0,0,1,100,0]],[0,100,0,0]],[]]};
    const [segment]=pdfVectorSegments(list,ops,[1,0,0,-1,0,600],'5.4.624');
    expect(segment).toEqual({start:{x:10,y:580},end:{x:210,y:580},width:6});
  });
  it('declines clipping and unrecognized library versions for safe raster fallback',()=>{
    expect(pdfVectorSegments({fnArray:[29],argsArray:[[]]},ops,[1,0,0,1,0,0],'5.4.624')).toEqual([]);
    expect(pdfVectorSegments({fnArray:[],argsArray:[]},ops,[1,0,0,1,0,0],'6.0.0')).toEqual([]);
  });
  it('does not convert bezier door swings into walls',()=>{
    expect(pdfVectorSegments({fnArray:[91],argsArray:[[20,[[0,0,0,2,1,2,3,4,5,6]],[]]]},ops,[1,0,0,1,0,0],'5.4.624')).toEqual([]);
  });
});
