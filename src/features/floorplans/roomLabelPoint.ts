import type { Point } from './model';
const distanceToSegment = (p: Point, a: Point, b: Point) => {
  const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/n)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
};
const inside = (p: Point, polygon: Point[]) => {
  let value=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)value=!value;
  }
  return value;
};
/** A bounded interior label position, including concave rooms and bridged holes.
 * It uses the same even-odd interior as the drawing, never the vertex average. */
export function roomLabelPoint(polygon: Point[]): Point {
  if(polygon.length<3||polygon.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return polygon[0]&&Number.isFinite(polygon[0].x)&&Number.isFinite(polygon[0].y)?{...polygon[0]}:{x:0,y:0};
  const xs=polygon.map(p=>p.x),ys=polygon.map(p=>p.y),center={x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2};
  let best:Point|undefined,clearance=-1,bestCenter=Infinity;
  const consider=(point:Point)=>{
    if(!inside(point,polygon))return;
    const d=Math.min(...polygon.map((a,i)=>distanceToSegment(point,a,polygon[(i+1)%polygon.length]))),c=Math.hypot(point.x-center.x,point.y-center.y);
    if(d>clearance+1e-8||Math.abs(d-clearance)<=1e-8&&c<bestCenter){best=point;clearance=d;bestCenter=c;}
  };
  consider(center);
  let signed=0,cx=0,cy=0;
  polygon.forEach((a,i)=>{const b=polygon[(i+1)%polygon.length],cross=a.x*b.y-b.x*a.y;signed+=cross;cx+=(a.x+b.x)*cross;cy+=(a.y+b.y)*cross;});
  if(Math.abs(signed)>1e-9)consider({x:cx/(3*signed),y:cy/(3*signed)});
  const levels=[...new Set(ys)].sort((a,b)=>a-b);
  const scans=levels.slice(1).map((value,i)=>({y:(value+levels[i])/2,gap:value-levels[i]})).filter(v=>v.gap>1e-8).sort((a,b)=>b.gap-a.gap).slice(0,64);
  for(const {y} of scans){
    const cuts:number[]=[];
    for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];if((a.y>y)!==(b.y>y))cuts.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));}
    cuts.sort((a,b)=>a-b);
    for(let i=0;i+1<cuts.length;i+=2)if(cuts[i+1]-cuts[i]>1e-8)consider({x:(cuts[i]+cuts[i+1])/2,y});
  }
  return best?{...best}:{...polygon[0]};
}
