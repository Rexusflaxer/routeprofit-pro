import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createDocument,createFloor,duplicateFloor,historyPush,validateDocument} from '../../src/features/floorplans/model';
import {distance,moveWall,moveRoom,resizeWall,wallPoint,snapPoint,floorBounds,polygonArea,projectPoint} from '../../src/features/floorplans/geometry';
import {generatePrintHtml,generateDocumentPrintHtml,printLayout} from '../../src/features/floorplans/FloorPlanPrint';
import FloorPlanRenderer from '../../src/features/floorplans/FloorPlanRenderer';
const roomFloor=()=>{const f=createFloor();f.walls=[{id:'a',start:{x:0,y:0},end:{x:10,y:0},thickness:.2},{id:'b',start:{x:10,y:0},end:{x:10,y:6},thickness:.2},{id:'c',start:{x:10,y:6},end:{x:0,y:6},thickness:.2},{id:'d',start:{x:0,y:6},end:{x:0,y:0},thickness:.2}];f.openings=[{id:'door',wallId:'a',type:'door',offset:2,width:.9,hinge:'left',swing:'in'}];return f;};
describe('LOQ floor plan geometry',()=>{
 it('moves connected endpoints while preserving the door attachment',()=>{const before=roomFloor(),after=moveWall(before,'a',{x:1,y:1});expect(after.walls[0].start).toEqual({x:1,y:1});expect(after.walls[1].start).toEqual({x:11,y:1});expect(after.walls[3].end).toEqual({x:1,y:1});expect(after.openings[0]).toEqual(before.openings[0]);expect(wallPoint(after.walls[0],2)).toEqual({x:3,y:1});expect(before.walls[0].start).toEqual({x:0,y:0});});
 it('resizes a wall exactly and keeps connected walls joined',()=>{const floor=resizeWall(roomFloor(),'a',12);expect(distance(floor.walls[0].start,floor.walls[0].end)).toBe(12);expect(floor.walls[1].start).toEqual({x:12,y:0});});
 it('keeps an opening on a wall when shortening',()=>{const floor=resizeWall(roomFloor(),'a',2.5);expect(floor.openings[0].width).toBe(.9);expect(floor.openings[0].offset).toBe(1.6);});
 it('retains diagonal measurements and projects to diagonal walls',()=>{const wall={id:'w',start:{x:0,y:0},end:{x:3,y:4},thickness:.2};expect(distance(wall.start,wall.end)).toBe(5);expect(wallPoint(wall,2.5)).toEqual({x:1.5,y:2});expect(projectPoint({x:1.5,y:2},wall).distance).toBe(0);});
 it('snaps to real endpoints before grid and horizontal alignment',()=>{const floor=roomFloor();expect(snapPoint({x:9.91,y:.05},floor.walls)).toEqual({x:10,y:0});expect(snapPoint({x:3.82,y:2.08},[],{x:1,y:2})).toEqual({x:3.8,y:2});});
 it('treats background origins as bottom-left in a Y-up world',()=>{const f=createFloor();f.background={fileId:'b',width:100,height:100,metresPerPixel:.1,origin:{x:1,y:2},opacity:.5,calibrated:true};const bounds=floorBounds(f);expect(bounds.minY).toBe(1.4);expect(bounds.maxY).toBe(12.6);});
 it('computes polygon area independent of drawing direction',()=>{const points=[{x:0,y:0},{x:10,y:0},{x:10,y:6},{x:0,y:6}];expect(polygonArea(points)).toBe(60);expect(polygonArea(points.reverse())).toBe(60);});
});
describe('LOQ document integrity',()=>{
 it('duplicates a floor with independent IDs and correct door relationships',()=>{const floor=roomFloor(),copy=duplicateFloor(floor);expect(copy.id).not.toBe(floor.id);expect(copy.walls[0].id).not.toBe(floor.walls[0].id);expect(copy.openings[0].wallId).toBe(copy.walls[0].id);copy.walls[0].start.x=99;expect(floor.walls[0].start.x).toBe(0);});
 it('preserves the full document in history including background and floors',()=>{const doc=createDocument();doc.floors.push(roomFloor());doc.floors[0].background={fileId:'asset',width:10,height:20,metresPerPixel:1,origin:{x:2,y:3},opacity:.4,calibrated:true};const history=historyPush([],doc);doc.floors[0].background!.fileId='changed';doc.floors[1].walls=[];expect(history[0].floors[0].background!.fileId).toBe('asset');expect(history[0].floors[1].walls.length).toBe(4);});
 it('requires background calibration but accepts blank-canvas metre geometry',()=>{const doc=createDocument();doc.floors=[roomFloor()];expect(validateDocument(doc).filter(i=>i.severity==='error')).toHaveLength(0);doc.floors[0].background={fileId:'x',width:100,height:100,origin:{x:0,y:0},metresPerPixel:.1,opacity:.5,calibrated:false};expect(validateDocument(doc).some(i=>i.severity==='error'&&i.message.includes('schaal'))).toBe(true);});
 it('catches dangling opening relationships and route endpoint gaps',()=>{const doc=createDocument();doc.floors=[roomFloor()];doc.floors[0].openings[0].wallId='gone';doc.floors[0].routes=[{id:'route',points:[{x:3,y:3},{x:8,y:3}],label:'Route'}];expect(validateDocument(doc).some(i=>i.elementId==='door'&&i.severity==='error')).toBe(true);expect(validateDocument(doc).some(i=>i.elementId==='route'&&i.severity==='warning')).toBe(true);});
 it('recognizes a route ending at an exit',()=>{const doc=createDocument();doc.floors=[roomFloor()];doc.floors[0].symbols=[{id:'exit',kind:'emergency_exit',position:{x:8,y:3},rotation:0,label:'Nooduitgang'}];doc.floors[0].routes=[{id:'route',points:[{x:3,y:3},{x:8,y:3}],label:'Route'}];expect(validateDocument(doc).filter(i=>i.elementId==='route')).toEqual([]);});
});
describe('shared SVG and print output',()=>{
 it('uses bottom-left origin correctly when rendering imported images',()=>{const f=createFloor();f.background={fileId:'x',width:100,height:100,origin:{x:1,y:2},metresPerPixel:.1,opacity:.5,calibrated:true};const html=renderToStaticMarkup(<FloorPlanRenderer floor={f} backgroundUrls={{x:'data:image/png;base64,eA=='}}/>);expect(html).toContain('x="1" y="-12" width="10" height="10"');});
 it('prints 10 metres as 100 millimetres at 1:100 without fit-to-page scaling',()=>{const doc=createDocument();doc.floors=[roomFloor()];const html=generatePrintHtml(doc,doc.floors[0].id);expect(html).toContain('scale(10)');expect(html).toContain('x1="0" y1="0" x2="10" y2="0"');expect(html).toContain('width="396mm"');expect(html).toContain('size:420mm 297mm');});
 it('reports paper clipping and reacts to rotated viewpoints',()=>{const f=roomFloor();f.print.paper='A4';f.print.orientation='portrait';f.print.scale=50;expect(printLayout(f).clipped).toBe(true);f.print.scale=100;expect(printLayout(f).clipped).toBe(false);expect(printLayout(f,90).worldWidth).toBeCloseTo(7.2);});
 it('keeps original floor geometry unchanged for print profiles and escaping',()=>{const doc=createDocument();doc.title='<img src=x onerror=alert(1)>';doc.floors=[roomFloor()];const before=JSON.stringify(doc);const html=generatePrintHtml(doc,doc.floors[0].id);expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');expect(html).not.toContain('<img src=x');expect(JSON.stringify(doc)).toBe(before);});
 it('creates one print page per hanging location and filters a selected one',()=>{const doc=createDocument();doc.floors=[roomFloor()];doc.floors[0].print.viewpoints=[{id:'one',label:'Entree',position:{x:2,y:2},rotation:0},{id:'two',label:'Achterzijde',position:{x:8,y:3},rotation:90}];expect((generatePrintHtml(doc,doc.floors[0].id).match(/class="plan-sheet"/g)||[])).toHaveLength(2);expect((generatePrintHtml(doc,doc.floors[0].id,{viewpointId:'two'}).match(/class="plan-sheet"/g)||[])).toHaveLength(1);});
 it('keeps security installations out of the evacuation view',()=>{const f=roomFloor();f.symbols=[{id:'camera',kind:'camera',position:{x:2,y:2},rotation:0,label:'Camera private'},{id:'fire',kind:'fire_extinguisher',position:{x:3,y:2},rotation:0,label:'Blusser'}];const html=renderToStaticMarkup(<FloorPlanRenderer floor={f} profile="evacuation"/>);expect(html).not.toContain('Camera private');expect(html).toContain('Blusser');expect(html).toContain('fill="#d64239"');});
});

import {useState} from 'react';
import {render,fireEvent,screen,cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';
import FloorPlanEditor from '../../src/features/floorplans/FloorPlanEditor';
afterEach(cleanup);
describe('floor plan editing interactions',()=>{
 it('creates a complete room in two clicks and reverses it with one undo',()=>{
  let current=createDocument('Gebouw A');
  function Harness(){const[doc,setDoc]=useState(current);return <FloorPlanEditor document={doc} onChange={next=>{current=next;setDoc(next);}}/>;}
  render(<Harness/>);
  fireEvent.click(screen.getByRole('button',{name:'Ruimte (R)'}));
  const canvas=screen.getByRole('application');
  fireEvent.pointerDown(canvas,{clientX:130,clientY:549,button:0});
  fireEvent.pointerDown(canvas,{clientX:450,clientY:357,button:0});
  expect(current.floors[0].walls).toHaveLength(4);
  expect(current.floors[0].rooms).toHaveLength(1);
  expect(polygonArea(current.floors[0].rooms[0].polygon)).toBe(60);
  fireEvent.click(screen.getByRole('button',{name:'Ongedaan maken (⌘Z)'}));
  expect(current.floors[0].walls).toHaveLength(0);
  expect(current.floors[0].rooms).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Opnieuw (⇧⌘Z)'}));
  expect(current.floors[0].walls).toHaveLength(4);
 });
 it('treats an externally imported drawing as one reversible history action',()=>{
  const initial=createDocument();let current=initial;
  const onChange=(doc:any)=>{current=doc;};
  const {rerender}=render(<FloorPlanEditor document={initial} onChange={onChange}/>);
  const imported=structuredClone(initial);imported.floors[0].walls=roomFloor().walls;
  imported.floors[0].background={fileId:'source',width:100,height:100,origin:{x:0,y:0},metresPerPixel:.1,opacity:.5,calibrated:true};
  rerender(<FloorPlanEditor document={imported} onChange={onChange}/>);
  fireEvent.click(screen.getByRole('button',{name:'Ongedaan maken (⌘Z)'}));
  expect(current.floors[0].walls).toHaveLength(0);expect(current.floors[0].background).toBeUndefined();
 });
});

it('moves an entire room and its wall geometry together without breaking door references',()=>{const f=roomFloor();f.rooms=[{id:'room',label:'Hal',polygon:[{x:0,y:0},{x:10,y:0},{x:10,y:6},{x:0,y:6}]}];const result=moveRoom(f,'room',{x:2,y:3});expect(result.rooms[0].polygon[0]).toEqual({x:2,y:3});expect(result.walls[0].start).toEqual({x:2,y:3});expect(result.walls[2].end).toEqual({x:2,y:9});expect(wallPoint(result.walls[0],result.openings[0].offset)).toEqual({x:4,y:3});});
it('supports translated legends and refuses unreadable text overflow',()=>{const doc=createDocument();doc.floors=[roomFloor()];doc.floors[0].print.language2='en';doc.floors[0].symbols=[{id:'fire',kind:'fire_extinguisher',position:{x:2,y:2},rotation:0,label:'Blusser'}];expect(generatePrintHtml(doc,doc.floors[0].id)).toContain('Fire extinguisher');doc.floors[0].print.instructions='x '.repeat(2000);doc.floors[0].print.secondaryInstructions='y '.repeat(2000);expect(()=>generatePrintHtml(doc,doc.floors[0].id)).toThrow('passen niet leesbaar');});
it('detects content outside a custom print crop even when the building would fit if centered',()=>{const floor=roomFloor();expect(printLayout(floor).clipped).toBe(false);floor.print.cropCenter={x:80,y:90};expect(printLayout(floor).clipped).toBe(true);});

it('prints every floor and viewpoint with its own named A4/A3 paper size and exact scale',()=>{const doc=createDocument();const ground=roomFloor(),upper=roomFloor();ground.id='ground';upper.id='upper';ground.print.paper='A4';ground.print.orientation='portrait';ground.print.scale=100;ground.print.viewpoints=[{id:'a',label:'Entree',position:{x:2,y:2},rotation:0},{id:'b',label:'Gang',position:{x:7,y:2},rotation:90}];upper.print.paper='A3';upper.print.orientation='landscape';upper.print.scale=200;doc.floors=[ground,upper];const html=generateDocumentPrintHtml(doc,{revision:'3'});expect(html).toContain('@page loq-floor-0{size:210mm 297mm;margin:0}');expect(html).toContain('@page loq-floor-1{size:420mm 297mm;margin:0}');expect((html.match(/class="plan-sheet"/g)||[])).toHaveLength(3);expect((html.match(/page:loq-floor-0/g)||[])).toHaveLength(2);expect(html).toContain('page:loq-floor-1');expect(html).toContain('scale(10)');expect(html).toContain('scale(5)');expect((html.match(/<style>/g)||[])).toHaveLength(1);});

it('counterrotates print labels and nondirectional safety signs while preserving directional equipment',()=>{const floor=roomFloor();floor.rooms=[{id:'room',label:'Hal',polygon:[{x:0,y:0},{x:10,y:0},{x:10,y:6},{x:0,y:6}]}];floor.symbols=[{id:'fire',kind:'fire_extinguisher',position:{x:2,y:2},rotation:15,label:'Blusser'},{id:'cam',kind:'camera',position:{x:8,y:2},rotation:15,label:'Camera'}];const html=renderToStaticMarkup(<FloorPlanRenderer floor={floor} printMode printScale={100} profile="installation" viewpoint={{position:{x:3,y:3},rotation:90}}/>);expect(html).toContain('rotate(90 5 -3)');expect(html).toContain('translate(2 -2) rotate(75)');expect(html).toContain('translate(8 -2) rotate(-15)');expect(html).toContain('translate(3 -3) rotate(90)');expect(html).toContain('rotate(90 2 -1.3375)');});
