import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/managedFiles',()=>({prepareManagedFilePreview:vi.fn(),revokeManagedFilePreview:vi.fn()}));
import PublishedDesktopFloorPlan from '@/components/objects/PublishedDesktopFloorPlan';
import {createDocument,createFloor} from '@/features/floorplans/model';
import {parseFloorPlanDocument} from '@/features/floorplans/documentGuards';
import {floorBounds} from '@/features/floorplans/geometry';

function plan(){
 const doc=createDocument('Gescand kantoor');doc.schemaVersion=3;
 const floor=doc.floors[0];floor.id='floor-one';
 floor.walls=[{id:'wall-one',start:{x:0,y:0},end:{x:6,y:0},thickness:.2,height:3.2}];
 floor.rooms=[{id:'room-one',label:'Receptie',polygon:[{x:0,y:0},{x:6,y:0},{x:6,y:4},{x:0,y:4}]}];
 floor.openings=[{id:'window-one',wallId:'wall-one',type:'window',offset:1,width:2,hinge:'left',swing:'in',height:1.4,bottomElevation:1.2}];
 floor.furnishings=[{id:'table-one',category:'table',position:{x:2,y:2},rotation:35,width:1.5,depth:.8,height:.75,bottomElevation:0,confidence:'high'}];
 const other=createFloor('Eerste verdieping');other.id='floor-two';doc.floors.push(other);
 return{id:'publication',revision:4,desktop_document:doc};
}
describe('published schema3 source compatibility',()=>{
 it('renders the actual published viewer with measured details and furniture, and changes floors',()=>{
  const value=plan(),original=structuredClone(value.desktop_document),view=render(<PublishedDesktopFloorPlan plan={value}/>);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.getByText('Receptie')).toBeInTheDocument();
  expect(view.container.querySelector('svg[aria-label="Plattegrond Begane grond"] title')).toHaveTextContent('Tafel · gemeten begrenzing');
  expect(parseFloorPlanDocument(value.desktop_document)).toEqual(original);
  fireEvent.change(screen.getByRole('combobox',{name:'Verdieping'}),{target:{value:'floor-two'}});
  expect(screen.getByRole('img',{name:'Plattegrond Eerste verdieping'})).toBeInTheDocument();
  expect(screen.queryByText('Tafel · gemeten begrenzing')).not.toBeInTheDocument();expect(value.desktop_document).toEqual(original);
 });
 it('keeps furniture outside the wall bounds inside the complete drawing viewbox',()=>{
  const value=plan(),floor=value.desktop_document.floors[0];floor.furnishings[0].position={x:20,y:20};floor.furnishings[0].rotation=90;
  render(<PublishedDesktopFloorPlan plan={value}/>);const svg=screen.getByRole('img',{name:'Plattegrond Begane grond'}),bounds=floorBounds(floor);
  expect(bounds.maxX).toBeGreaterThanOrEqual(20.4);expect(bounds.maxY).toBeGreaterThanOrEqual(20.75);
  expect(svg).toHaveAttribute('viewBox',`${bounds.minX} ${-bounds.maxY} ${bounds.width} ${bounds.height}`);
 });
 it('places a concave room label inside the room and uses the even-odd room fill',()=>{
  const value=plan(),floor=value.desktop_document.floors[0];floor.rooms[0].polygon=[{x:0,y:0},{x:6,y:0},{x:6,y:1},{x:1,y:1},{x:1,y:6},{x:0,y:6}];
  const view=render(<PublishedDesktopFloorPlan plan={value}/>),label=screen.getByText('Receptie');
  const x=Number(label.getAttribute('x')),y=-Number(label.getAttribute('y'));
  expect(x).toBeGreaterThan(0);expect(y).toBeGreaterThan(0);expect(x<1||y<1).toBe(true);
  expect(view.container.querySelector('polygon')).toHaveAttribute('fill-rule','evenodd');
 });
 it.each([1,2])('continues reading schema%s without requiring rich fields',schema=>{
  const value=plan(),doc=value.desktop_document;doc.schemaVersion=schema;
  for(const floor of doc.floors){delete floor.furnishings;for(const w of floor.walls)delete w.height;for(const o of floor.openings){delete o.height;delete o.bottomElevation;}}
  render(<PublishedDesktopFloorPlan plan={value}/>);expect(screen.getByText('Receptie')).toBeInTheDocument();expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 });
 it.each([
  doc=>doc.schemaVersion=4,
  doc=>doc.schemaVersion=2,
  doc=>doc.floors[0].furnishings[0].id='wall-one',
  doc=>doc.floors[0].furnishings[0].width=NaN,
  doc=>doc.floors[0].openings[0].bottomElevation=-1,
  doc=>doc.floors[0].walls[0].height=51,
 ])('still rejects unsafe or mis-versioned documents instead of silently stripping fields',mutate=>{
  const value=plan();mutate(value.desktop_document);expect(parseFloorPlanDocument(value.desktop_document)).toBeNull();
  render(<PublishedDesktopFloorPlan plan={value}/>);expect(screen.getByRole('alert')).toHaveTextContent('nog niet veilig');expect(screen.queryByRole('img')).not.toBeInTheDocument();
 });
});
