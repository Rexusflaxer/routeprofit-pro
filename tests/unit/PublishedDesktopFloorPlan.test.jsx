import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const {prepare, revoke} = vi.hoisted(() => ({prepare: vi.fn(), revoke: vi.fn()}));
vi.mock('@/lib/managedFiles', () => ({prepareManagedFilePreview: prepare, revokeManagedFilePreview: revoke}));
import PublishedDesktopFloorPlan from '@/components/objects/PublishedDesktopFloorPlan';
import { createDocument, createFloor } from '@/features/floorplans/model';

function plan(overrides = {}) {
  const document = createDocument('Kantoor Noord');
  const first = document.floors[0];
  first.rooms.push({id: 'room-ground', label: 'Receptie', polygon: [{x:0,y:0},{x:10,y:0},{x:10,y:8},{x:0,y:8}]});
  first.walls.push({id: 'wall-ground', start: {x:0,y:0}, end: {x:10,y:0}, thickness: .2});
  first.symbols.push({id: 'cam-ground',kind:'camera',position:{x:2,y:2},rotation:0,label:'Camera entree'}, {id:'exit-ground',kind:'emergency_exit',position:{x:5,y:0},rotation:0,label:'Uitgang receptie'});
  const second = createFloor('Eerste verdieping');
  second.rooms.push({id: 'room-upper', label: 'Vergaderruimte', polygon: [{x:0,y:0},{x:7,y:0},{x:7,y:5},{x:0,y:5}]});
  second.walls.push({id: 'wall-upper', start: {x:0,y:0}, end: {x:7,y:0}, thickness: .2});
  document.floors.push(second);
  return {id:'plan-1',revision:2,desktop_document:document,...overrides};
}
const pdf = (url = 'blob:private-pdf', filename = 'Kantoor-ontruiming.pdf') => ({mimeType:'application/pdf',url,blob:new Blob(['%PDF-1.7'],{type:'application/pdf'}),filename,revoke:true,encrypted:true});
beforeEach(() => {prepare.mockReset();revoke.mockReset();});

describe('published desktop drawing and PDF', () => {
  it('shows the complete selected floor and distinguishes installation from evacuation symbols', () => {
    const value = plan(); render(<PublishedDesktopFloorPlan plan={value}/>);
    expect(screen.getByRole('img',{name:'Plattegrond Begane grond'})).toBeInTheDocument();
    expect(screen.getByText('Receptie')).toBeInTheDocument();expect(screen.getByText('Uitgang receptie')).toBeInTheDocument();
    expect(screen.queryByText('Camera entree')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox',{name:'Plattegrondweergave'}),{target:{value:'installation'}});
    expect(screen.getByText('Camera entree')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox',{name:'Verdieping'}),{target:{value:value.desktop_document.floors[1].id}});
    expect(screen.getByRole('img',{name:'Plattegrond Eerste verdieping'})).toBeInTheDocument();
    expect(screen.getByText('Vergaderruimte')).toBeInTheDocument();expect(screen.queryByText('Receptie')).not.toBeInTheDocument();
    expect(prepare).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Afdrukvoorbeeld'})).not.toBeInTheDocument();
  });
  it('opens the full private PDF only on demand and downloads that same blob with its filename', async () => {
    const file=pdf();prepare.mockResolvedValue(file);const view=render(<PublishedDesktopFloorPlan plan={plan({pdf_file_id:'private-pdf-id'})}/>);
    expect(prepare).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Afdrukvoorbeeld'}));
    const frame=await screen.findByTitle('Afdrukvoorbeeld Kantoor Noord, revisie 2');expect(frame).toHaveAttribute('src',file.url);
    expect(prepare).toHaveBeenCalledWith({managedFileId:'private-pdf-id',filename:'LOQ-plattegronden-revisie-2.pdf'});
    const download=screen.getByRole('link',{name:'PDF downloaden'});expect(download).toHaveAttribute('href',file.url);expect(download).toHaveAttribute('download',file.filename);
    expect(screen.queryByRole('combobox',{name:'Verdieping'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Terug naar tekening'}));
    expect(screen.getByRole('img',{name:'Plattegrond Begane grond'})).toBeInTheDocument();expect(revoke).toHaveBeenCalledWith(file);
    expect(screen.queryByTitle(/Afdrukvoorbeeld Kantoor/)).not.toBeInTheDocument();view.unmount();
  });
  it('revokes the PDF when the dialog closes and rejects late responses after returning to the drawing', async () => {
    const loaded=pdf();prepare.mockResolvedValueOnce(loaded);const view=render(<PublishedDesktopFloorPlan plan={plan({pdf_file_id:'pdf-id'})}/>);
    fireEvent.click(screen.getByRole('button',{name:'Afdrukvoorbeeld'}));await screen.findByTitle(/Afdrukvoorbeeld Kantoor/);view.unmount();expect(revoke).toHaveBeenCalledWith(loaded);
    let finish;prepare.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));render(<PublishedDesktopFloorPlan plan={plan({pdf_file_id:'pdf-late'})}/>);
    fireEvent.click(screen.getByRole('button',{name:'Afdrukvoorbeeld'}));expect(screen.getByRole('status')).toHaveTextContent('Beveiligd afdrukvoorbeeld openen');
    fireEvent.click(screen.getByRole('button',{name:'Terug naar tekening'}));const late=pdf('blob:late-pdf');await act(async()=>finish(late));
    expect(revoke).toHaveBeenCalledWith(late);expect(screen.queryByTitle(/Afdrukvoorbeeld Kantoor/)).not.toBeInTheDocument();
  });
  it.each([
    {mimeType:'image/png',url:'blob:not-pdf',blob:new Blob(),revoke:true},
    {mimeType:'application/pdf',url:'https://external.test/plan.pdf',blob:new Blob(),revoke:false},
  ])('rejects a wrong MIME or nonlocal preview without using a raw file URL',async invalid=>{
    prepare.mockResolvedValue(invalid);render(<PublishedDesktopFloorPlan plan={plan({pdf_file_id:'bad-pdf',pdf_file_url:'https://untrusted.test/fallback.pdf'})}/>);
    fireEvent.click(screen.getByRole('button',{name:'Afdrukvoorbeeld'}));expect(await screen.findByRole('alert')).toHaveTextContent('beveiligde afdrukvoorbeeld');
    expect(revoke).toHaveBeenCalledWith(invalid);expect(document.querySelector('iframe')).toBeNull();expect(screen.queryByRole('link',{name:'PDF downloaden'})).not.toBeInTheDocument();
  });
  it('retains drawing access after an access failure and can retry the PDF',async()=>{
    prepare.mockRejectedValueOnce(new Error('403 denied'));const file=pdf();prepare.mockResolvedValueOnce(file);
    render(<PublishedDesktopFloorPlan plan={plan({pdf_file_id:'retry-pdf'})}/>);fireEvent.click(screen.getByRole('button',{name:'Afdrukvoorbeeld'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Probeer opnieuw');expect(screen.getByRole('button',{name:'Terug naar tekening'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Opnieuw laden'}));expect(await screen.findByTitle(/Afdrukvoorbeeld Kantoor/)).toHaveAttribute('src',file.url);
  });
  it('cleans background previews on profile/floor changes and never requests them in evacuation view',async()=>{
    const value=plan();value.desktop_document.floors[0].background={fileId:'bg-first',width:100,height:100,origin:{x:0,y:0},metresPerPixel:.1,opacity:.5,calibrated:true};
    const background={mimeType:'image/png',url:'blob:background',blob:new Blob(),revoke:true};prepare.mockResolvedValue(background);
    render(<PublishedDesktopFloorPlan plan={value}/>);expect(prepare).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox',{name:'Plattegrondweergave'}),{target:{value:'installation'}});
    await waitFor(()=>expect(document.querySelector('image')).toHaveAttribute('href','blob:background'));
    fireEvent.change(screen.getByRole('combobox',{name:'Verdieping'}),{target:{value:value.desktop_document.floors[1].id}});
    expect(revoke).toHaveBeenCalledWith(background);expect(document.querySelector('image')).toBeNull();
  });
});
