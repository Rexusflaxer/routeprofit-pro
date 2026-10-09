import {createDocument,uid} from '../../src/features/floorplans/model';
export const example=createDocument('LOQ Voorbeeldgebouw');
const f=example.floors[0];
f.walls=[[[0,0],[18,0]],[[18,0],[18,12]],[[18,12],[0,12]],[[0,12],[0,0]],[[0,7],[12,7]],[[12,0],[12,12]],[[6,0],[6,7]]].map(([a,b])=>({id:uid(),start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]},thickness:.2}));
f.rooms=[['Receptie',[[0,7],[12,7],[12,12],[0,12]]],['Werkruimte',[[12,0],[18,0],[18,12],[12,12]]],['Opslag',[[0,0],[6,0],[6,7],[0,7]]],['Hal',[[6,0],[12,0],[12,7],[6,7]]]].map(([label,p])=>({id:uid(),label,polygon:p.map(([x,y])=>({x,y}))}));
f.openings=[{id:uid(),wallId:f.walls[0].id,type:'door',offset:8,width:1.4,hinge:'left',swing:'out'},{id:uid(),wallId:f.walls[4].id,type:'door',offset:8,width:1.1,hinge:'left',swing:'in'},{id:uid(),wallId:f.walls[1].id,type:'window',offset:7,width:3,hinge:'left',swing:'in'}];
f.symbols=[['fire_extinguisher',7,6.5,'Blusser 1'],['emergency_exit',8.7,.3,'Nooduitgang'],['aed',11,8.5,'AED'],['camera',17,11,'Camera 1'],['you_are_here',9,10,'U bevindt zich hier']].map(([kind,x,y,label])=>({id:uid(),kind,position:{x,y},rotation:0,label}));
f.routes=[{id:uid(),label:'Vluchtweg',points:[{x:9,y:10},{x:9,y:6},{x:8.7,y:.3}]}];
f.print.address='Voorbeeldstraat 1 · Demonstratiegegevens';f.print.drawingNumber='LOQ-TEST-001';
