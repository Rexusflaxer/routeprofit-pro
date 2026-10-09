// Local visual/integration fixture, deliberately excluded from desktop/dist and packaging.
import React,{useState} from 'react';
import '../../src/index.css';
import {example} from './example';
import {createRoot} from 'react-dom/client';
import FloorPlanEditor from '../../src/features/floorplans/FloorPlanEditor';
import FloorPlanImportDialog from '../../src/features/floorplans/FloorPlanImportDialog';
import {uid} from '../../src/features/floorplans/model';
import {generatePrintHtml,printLayout} from '../../src/features/floorplans/FloorPlanPrint';


function App(){const [document,setDocument]=useState(example),[importId,setImportId]=useState(null),[urls,setUrls]=useState({}),[status,setStatus]=useState('Lokale test · geen productiegegevens'),[print,setPrint]=useState('');
const pickFile=()=>new Promise(resolve=>{const input=window.document.createElement('input');input.type='file';input.accept='.png,.jpg,.jpeg,.pdf';input.onchange=()=>{const file=input.files?.[0];if(!file)return resolve(null);const reader=new FileReader();reader.onload=()=>resolve({name:file.name,mimeType:file.type,contentBase64:reader.result.split(',')[1]});reader.readAsDataURL(file);};input.oncancel=()=>resolve(null);input.click();});
return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><div style={{background:'hsl(var(--primary))',color:'white',padding:'8px 18px',font:'12px system-ui',display:'flex',justifyContent:'space-between'}}><span>LOQ · Lokale testwerkruimte met fictieve gegevens</span><span>{status}</span></div>{print?<><button onClick={()=>setPrint('')}>Terug naar editor</button><iframe title="Afdrukvoorbeeld" srcDoc={print} style={{width:'100%',height:'calc(100vh - 70px)',border:0}}/></>:<FloorPlanEditor document={document} onChange={setDocument} onSave={()=>setStatus('Testconcept opgeslagen')} onPublish={()=>setStatus('Testpublicatie gecontroleerd')} onImport={setImportId} onExport={(doc,floorId)=>{setPrint(generatePrintHtml(doc,floorId,{backgroundUrls:urls,revision:'1'}));setStatus(JSON.stringify(printLayout(doc.floors.find(f=>f.id===floorId))));}} backgroundUrls={urls} installations={[{id:'installation-1',name:'Voorbeeld camerasysteem'}]} saveStatus="Testconcept"/>}<FloorPlanImportDialog open={!!importId} onClose={()=>setImportId(null)} pickFile={pickFile} uploadAsset={async()=>({file_id:uid()})} onApply={r=>{const next=structuredClone(document);const floor=next.floors.find(f=>f.id===importId);floor.background=r.background;floor.walls.push(...r.walls);setUrls(u=>({...u,[r.background.fileId]:r.backgroundUrl}));setDocument(next);setImportId(null);setStatus(`${r.walls.length} herkende muren ingevoegd`);}}/></div>;
}
createRoot(window.document.getElementById('root')).render(<App/>);
