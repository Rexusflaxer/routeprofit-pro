import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import FloorPlanImportDialog from '../../src/features/floorplans/FloorPlanImportDialog';
import {openRaster} from '../../src/features/floorplans/importSource';
vi.mock('../../src/features/floorplans/importSource',()=>({openRaster:vi.fn(),canvasImage:vi.fn(),canvasToBlob:vi.fn(),encodeBase64:vi.fn(),openPDF:vi.fn(),renderPDFPage:vi.fn(),rotateImage:vi.fn(),validateCorners:vi.fn()}));
afterEach(cleanup);
beforeEach(()=>{Object.defineProperty(SVGSVGElement.prototype,'getScreenCTM',{configurable:true,value:()=>({inverse:()=>({a:1,b:0,c:0,d:1,e:0,f:0})})});URL.revokeObjectURL=vi.fn();const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;vi.mocked(openRaster).mockResolvedValue({canvas,url:'blob:test',name:'Voorbeeld.png',vectors:[{start:{x:10,y:10},end:{x:90,y:10}},{start:{x:10,y:15},end:{x:90,y:15}}]});});
describe('import review never intercepts later calibration/crop clicks',()=>{
 it('hides review wall handles in crop mode and accepts two crop points',async()=>{
  render(<FloorPlanImportDialog open onClose={()=>{}} onApply={()=>{}} pickFile={async()=>({name:'Voorbeeld.png',mimeType:'image/png',contentBase64:'x'})} uploadAsset={async()=>({file_id:'asset'})}/>);
  fireEvent.click(screen.getByRole('button',{name:'Bestand kiezen'}));await screen.findByText('Voorbeeld.png');const svg=screen.getByLabelText('Onderlegger met meetpunten en muurvoorstellen');
  fireEvent.click(svg,{clientX:10,clientY:10});fireEvent.click(svg,{clientX:90,clientY:10});fireEvent.click(screen.getByRole('button',{name:'Schaal bevestigen'}));fireEvent.click(screen.getByRole('button',{name:'Muren herkennen'}));await screen.findByRole('button',{name:'Beginpunt muur verslepen'});
  fireEvent.click(screen.getByRole('button',{name:'Bijsnijden'}));expect(screen.queryByRole('button',{name:'Beginpunt muur verslepen'})).toBeNull();
  fireEvent.click(svg,{clientX:10,clientY:10});fireEvent.click(svg,{clientX:90,clientY:80});expect(screen.getByRole('button',{name:'Uitsnede toepassen'})).toBeEnabled();expect(screen.getByRole('button',{name:'In tekening invoegen'})).toBeDisabled();
 });
});
