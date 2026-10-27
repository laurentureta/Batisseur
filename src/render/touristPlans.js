// Paid tourist itineraries: path planning is cached by Tourism, never done per frame.
import { BUILDINGS } from '../data/buildings.js';
import { ATTRACTIONS } from '../data/tourism.js';
import { SIZE, N } from '../world/constants.js';
const HALF=SIZE/2;
export const MAX_VISIBLE_TOURISTS=24;
const FOOD={restaurant:7,cafe:4,tea:3,hotel:5};
const center=(w,b)=>{const c=w.centerOf(b);return [c.cx-HALF,c.cz-HALF];};
export function buildTouristNetwork(world,info,phases,roadConnected=null){
 const buildings=[...world.buildings.values()],gate=buildings.find(b=>b.type==='park_gate'&&!b.cons&&!b.fire&&phases.park_gate?.phase===3);
 const out={usable:false,gate:null,nodes:[],attractions:[],restaurants:[],station:null,beauty:0,refreshment:0,arrivalFactor:1};
 if(!gate||!info.get(gate.id)?.connected)return out;
 const starts=world.perimeter(gate).filter(i=>world.road[i]);if(!starts.length)return out;
 const prev=new Int32Array(N).fill(-2),depth=new Uint16Array(N),queue=new Int32Array(N);let head=0,tail=0;
 // A single entrance keeps every itinerary on the road instead of crossing the gate.
 const root=starts.find(i=>roadConnected?.[i])??starts[0];prev[root]=-1;queue[tail++]=root;
 while(head<tail){const i=queue[head++],x=i%SIZE;if(depth[i]>=240)continue;for(const j of [x?i-1:-1,x<SIZE-1?i+1:-1,i-SIZE,i+SIZE])if(j>=0&&j<N&&prev[j]===-2&&world.road[j]){prev[j]=i;depth[j]=depth[i]+1;queue[tail++]=j;}}
 const makeNode=(b,kind,ticket)=>{
  const ends=world.perimeter(b).filter(i=>prev[i]!==-2).sort((a,b)=>depth[a]-depth[b]);if(!ends.length)return null;
  const path=[];for(let i=ends[0];i!==-1;i=prev[i])path.push(i);path.reverse();
  const p=center(world,b),tile=path.at(-1);return {id:b.id,type:b.type,kind,name:BUILDINGS[b.type]?.name||b.type,ticket,path,dir:Math.atan2(p[0]-(tile%SIZE+.5-HALF),p[1]-(Math.floor(tile/SIZE)+.5-HALF))};
 };
 const gateNode=makeNode(gate,'gate',ATTRACTIONS.park_gate.ticket);if(!gateNode)return out;
 Object.assign(out,{usable:true,gate:gateNode,nodes:[gateNode]});
 for(const b of buildings){
  if(b.id===gate.id||b.cons?.k==='new'||b.fire||!info.get(b.id)?.connected)continue;
  const d=BUILDINGS[b.type];if(!d)continue;
  let node=null;
  if(ATTRACTIONS[b.type]&&phases[b.type]?.phase===3){node=makeNode(b,'attraction',ATTRACTIONS[b.type].ticket);if(node)out.attractions.push(node);}
  else if(FOOD[d.catalogue?.family]&&info.get(b.id)?.eff!==0){node=makeNode(b,'refreshment',FOOD[d.catalogue.family]);if(node)out.restaurants.push(node);}
  else if(b.type==='station'&&!b.cons){node=makeNode(b,'station',0);if(node&&(!out.station||node.path.length<out.station.path.length))out.station=node;}
  if(node)out.nodes.push(node);
 }
 out.restaurants.sort((a,b)=>a.path.length-b.path.length);out.restaurants=out.restaurants.slice(0,3);
 const venues=[gateNode,...out.attractions];let decors=0;
 for(const b of buildings){if(b.cons?.k==='new'||!BUILDINGS[b.type]?.beauty)continue;const c=center(world,b);if(venues.some(n=>{const p=n.path.at(-1);return (c[0]-(p%SIZE+.5-HALF))**2+(c[1]-(Math.floor(p/SIZE)+.5-HALF))**2<=64;}))decors++;}
 out.beauty=Math.min(.2,decors*.015);
 out.refreshment=out.restaurants.length?out.restaurants.reduce((s,n)=>s+n.ticket,0)/out.restaurants.length:0;
 out.arrivalFactor=out.station?1.15:1;return out;
}
export function betweenNodes(a,b){
 const A=a.path,B=b.path;let k=0;while(k<Math.min(A.length,B.length)&&A[k]===B[k])k++;
 if(!k)return null;return [...A.slice(k-1).reverse(),...B.slice(k)];
}
export function makeTouristPlan(network,id,arrivedAt,paid){
 if(!network.usable)return null;
 const origin=network.station&&id%3!==0?network.station:network.gate;
 const picks=[];const options=network.attractions;
 if(options.length)picks.push(options[id%options.length]);
 if(network.restaurants.length)picks.push(network.restaurants[id%network.restaurants.length]);
 if(options.length>1)picks.push(options[(id+1)%options.length]);
 const stops=[network.gate,...picks],weight=stops.reduce((s,n)=>s+n.ticket,0)||1;
 const legs=[];let at=arrivedAt,last=origin,assigned=0;
 for(const node of [...stops,origin]){
  const path=betweenNodes(last,node);if(!path)return null;
  if(path.length>1){const duration=(path.length-1)/.65*1000;legs.push({kind:'walk',path,startAt:at,endAt:at+duration});at+=duration;}
  if(node!==origin||node===network.gate&&last===origin&&legs.length===0){
   const final=node===stops.at(-1),amount=final?Math.max(0,paid-assigned):paid*node.ticket/weight;assigned+=amount;
   const duration=node.kind==='gate'?3000:node.kind==='refreshment'?7000:10000;
   legs.push({kind:'visit',venue:node.id,type:node.type,activity:node.kind,amount,tile:node.path.at(-1),dir:node.dir,startAt:at,endAt:at+duration});at+=duration;
  }
  last=node;
 }
 return {id,arrivedAt,paid,origin:origin.id,fromTrain:origin.kind==='station',legs,leavesAt:at,settled:0};
}
export function touristPosition(plan,now,out={}){
 if(!plan||now<plan.arrivedAt||now>=plan.leavesAt)return null;
 const leg=plan.legs.find(l=>now<l.endAt);if(!leg)return null;
 out.activity=leg.kind==='visit'?leg.activity:'walk';out.elapsed=(now-leg.startAt)/1000;out.venue=leg.venue||null;
 if(leg.kind==='visit'){out.x=leg.tile%SIZE+.5-HALF;out.z=Math.floor(leg.tile/SIZE)+.5-HALF;out.dir=leg.dir;out.distance=0;return out;}
 const distance=Math.max(0,(now-leg.startAt)/(leg.endAt-leg.startAt))*(leg.path.length-1),k=Math.min(leg.path.length-2,Math.floor(distance)),a=leg.path[k],b=leg.path[k+1],f=distance-k;
 const ax=a%SIZE,az=Math.floor(a/SIZE),bx=b%SIZE,bz=Math.floor(b/SIZE),dx=bx-ax,dz=bz-az;
 out.x=ax+(bx-ax)*f+.5-HALF-dz*.22;out.z=az+(bz-az)*f+.5-HALF+dx*.22;out.dir=Math.atan2(dx,dz);out.distance=distance;return out;
}
export function touristPlanValid(plan,world,now){return plan.legs.every(leg=>leg.endAt<=now||(leg.kind==='walk'?leg.path.every(i=>!!world.road[i]):world.buildings.has(leg.venue)));}
