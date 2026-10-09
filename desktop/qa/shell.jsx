// Test-only bridge and fictitious objects. Not an input of the packaged app.
import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {AppearanceProvider, initializeAppearance} from '../renderer/Appearance';
import {example} from './example';
const params=new URLSearchParams(location.search);
const user={id:'qa-user',full_name:'Voorbeeldbeheerder',email:'voorbeeld@example.test'};
let changed=()=>{};
const configuration={version:1,building_floor_plan_selection_keys:['qa-main','qa-annex'],building_labels:{'qa-main':'Hoofdgebouw','qa-annex':'Bijgebouw'}};
const objects=[{id:'qa-object',customer_id:'qa-customer',name:'Voorbeeldlocatie',object_code:'OBJ-001',address:'Voorbeeldstraat 1, Amersfoort'},{id:'qa-object-2',customer_id:'qa-customer',name:'Testlocatie Noord',object_code:'OBJ-002',address:'Demoweg 20, Zwolle'},{id:'qa-object-3',customer_id:'qa-customer',name:'Oefengebouw Centrum',object_code:'OBJ-003',address:'Testplein 4, Arnhem'}];
const recovery=new Map(), workspaces=new Map();
window.loqDesktop={session:{get:async()=>({user:params.has('welcome')?null:user}),login:async()=>{changed({user});},logout:async()=>changed({user:null}),onChanged:callback=>{changed=callback;return()=>{changed=()=>{};};}},
invoke:async(action,payload)=>{
  if(action==='search_customer_objects')return{items:objects.filter(o=>[o.name,o.address,o.object_code].join(' ').toLowerCase().includes(payload.search.toLowerCase())),has_more:false};
  if(action==='get_object_map_configuration')return{configuration:payload.object_id==='qa-object-3'?{...configuration,building_floor_plan_selection_keys:[]}:configuration};
  if(action==='get_object_building_floor_plan_workspace')return{workspace:workspaces.get(payload.building_selection_key)||{version:1,published_revision:0,document:structuredClone(example)},configuration_version:1};
  if(action==='list_object_installations')return{items:[{id:'qa-installation',name:'Voorbeeld camerasysteem'}]};
  if(action==='save_object_building_floor_plan_draft'){const workspace={version:payload.expected_version+1,document:payload.data.document};workspaces.set(payload.building_selection_key,workspace);return{workspace};}
  if(action==='publish_object_building_floor_plan')return{workspace:{...workspaces.get(payload.building_selection_key),version:payload.expected_version+1,published_revision:1}};
  if(action==='upload_object_building_floor_plan_asset')return{file_id:crypto.randomUUID()};
  throw new Error(`Geen testantwoord voor ${action}`);
},recovery:{read:async scope=>recovery.get(scope.building_selection_key)||null,write:async(scope,data)=>recovery.set(scope.building_selection_key,data),archive:async()=>{},remove:async scope=>recovery.delete(scope.building_selection_key)},
openFile:()=>new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.png,.jpg,.jpeg,.pdf';input.onchange=()=>{const file=input.files?.[0];if(!file)return resolve(null);const reader=new FileReader();reader.onload=()=>resolve({name:file.name,mimeType:file.type,contentBase64:reader.result.split(',')[1]});reader.readAsDataURL(file);};input.oncancel=()=>resolve(null);input.click();}),
exportDraft:async()=>({saved:true}),openDraft:async()=>null,exportPdf:async()=>({saved:true}),renderPdf:async()=>({mime_type:'application/pdf',content_base64:'VEVTVA=='})};
initializeAppearance();
const {default:App}=await import('../renderer/App');
createRoot(document.getElementById('root')).render(<AppearanceProvider><App/><div style={{position:'fixed',left:80,bottom:8,zIndex:15,fontSize:10,color:'hsl(var(--muted-foreground))',background:'hsl(var(--card))',border:'1px solid hsl(var(--border))',borderRadius:5,padding:'3px 7px',pointerEvents:'none'}}>Lokale test · fictieve gegevens</div></AppearanceProvider>);
