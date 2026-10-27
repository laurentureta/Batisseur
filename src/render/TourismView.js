// Pièces de parc qui restent verticales pendant la rotation, décor de fête et trophées.
import * as THREE from 'three';
import {GeoBuilder} from './geom.js';
import {toGeometry} from './TerrainView.js';
import {buildingCenter} from './BuildingView.js';
import {festivalCalendar} from '../data/tourism.js';
export class TourismView{
 constructor(renderer){this.r=renderer;this.group=new THREE.Group();this.material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});this.cabins=[];this.key='';this.time=0;this.acc=0;this.wheelId=null;}
 clear(){for(const c of [...this.group.children]){c.traverse(o=>o.geometry?.dispose());this.group.remove(c);}this.cabins=[];this.key='';this.wheelId=null;}
 refresh(){
  const t=this.r.game.tourism;if(!t)return;const data=t.data,gate=t.building('park_gate'),wheel=t.building('park_wheel'),cal=festivalCalendar(),f=t.syncFestival();
  const key=[this.r.game.world.version,wheel?.level,gate?.level,f.id,f.points,f.claimed.length,data.trophies.length].join('|');if(key===this.key)return;this.clear();this.key=key;
  if(wheel?.level===4){this.wheelId=wheel.id;
   const center=buildingCenter(wheel),root=new THREE.Group();root.position.set(center.cx,0,center.cz);root.rotation.y=(wheel.rot&3)*Math.PI/2;this.group.add(root);
   for(let i=0;i<8;i++){const g=new GeoBuilder(),color=[0xe69c82,0x6bb9c5,0xe8c56f,0xb3c78e][i%4];g.box(0,0,0,.24,.22,.2,color);g.box(0,.22,0,.29,.05,.23,0xffefd1);g.box(-.09,.27,0,.02,.12,.02,0xffefd1);g.box(.09,.27,0,.02,.12,.02,0xffefd1);const mesh=new THREE.Mesh(toGeometry(g.body),this.material);root.add(mesh);this.cabins.push({mesh,index:i});}
  }
  if(!gate||gate.level!==4)return;
  const c=buildingCenter(gate),g=new GeoBuilder(),rot=(gate.rot&3)*Math.PI/2;
  g.push(rot,c.cx,0,c.cz);
  if(f.points>0){for(const x of [-1.22,1.22]){g.box(x,.06,.9,.025,1.6,.025,0xb49368);g.quad([x,.95,.92],[x+.35,1.1,.92],[x,1.45,.92],[x,.95,.92],cal.color);}
   if(f.points>=300)for(let i=0;i<7;i++){const x=-1.05+i*.35;g.box(x,1.5,.9,.03,.03,.03,0xffdd8f);}
   if(f.claimed.length===3){g.box(0,.06,1.15,.7,.08,.3,cal.color);g.ico(0,.3,1.15,.15,0xe2b75e);}
  }
  for(let i=0;i<Math.min(4,data.trophies.length);i++){const x=-.6+i*.4;g.cyl(x,.07,-1.1,.12,.09,8,0xc7b9a0);g.cyl(x,.16,-1.1,.035,.16,8,0xe2b75e);g.dome(x,.32,-1.1,.09,0xe2b75e,8,2);}
  g.pop();if(g.body.count)this.group.add(new THREE.Mesh(toGeometry(g.body),this.material));
 }
 update(dt){this.acc+=dt;if(this.acc>=1){this.acc=0;this.refresh();}const speed=this.r.game.state?.time.speed??1;this.time+=dt*(speed>0?1:.15);const rotor=this.r.buildings?.parts.get(this.wheelId)?.find(p=>p.kind==='spin'&&p.axis==='z');const angle=rotor?.inner.rotation.z??this.time*.16;for(const c of this.cabins){const a=angle+c.index/8*Math.PI*2;c.mesh.position.set(Math.cos(a)*1.05,1.5+Math.sin(a)*1.05-.35,.4);}}
}
