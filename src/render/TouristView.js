// Only paid, persisted arrivals are drawn. This layer never changes coins or counters.
import * as THREE from 'three';
import { HumanPoser } from './humanPose.js';
import { pose } from './People.js';
import { touristPosition,touristPlanValid,MAX_VISIBLE_TOURISTS } from './touristPlans.js';
import { SIZE,T } from '../world/constants.js';
const MODELS=['casual_f','casual_m','old_f','suit_m','casual_m'];
const SKINS=[0xf2c9a6,0xc98b62,0xe8b48a,0x8d5a3b];
const SHIRTS=[0xe58f9c,0x679ebc,0xe6bd65,0x83ad89,0xaa91c1,0xd58d64];
export class TouristView{
 constructor(renderer){
  this.r=renderer;this.group=new THREE.Group();this.group.name='Paid park visitors';this.position={};this.figure={};this.dummy=new THREE.Object3D();this.color=new THREE.Color();this.time=0;this.visibleCount=0;this.invalid=new Set();this.version=-1;
  this.material=new THREE.MeshLambertMaterial({vertexColors:false});
  this.fallback=new THREE.InstancedMesh(new THREE.BoxGeometry(.065,.14,.045),this.material,MAX_VISIBLE_TOURISTS);this.fallback.count=0;this.fallback.frustumCulled=false;this.group.add(this.fallback);
  this.luggage=new THREE.InstancedMesh(new THREE.BoxGeometry(.045,.07,.055),this.material,MAX_VISIBLE_TOURISTS);this.luggage.count=0;this.luggage.frustumCulled=false;this.group.add(this.luggage);
  for(const m of [this.fallback,this.luggage]){m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.castShadow=true;}
 }
 clear(){this.visibleCount=0;this.version=-1;this.invalid.clear();this.fallback.count=0;this.luggage.count=0;}
 update(dt){
  this.time+=dt;this.visibleCount=0;this.fallback.count=0;this.luggage.count=0;
  const r=this.r,w=r.world,t=r.game.tourism;if(!w||!t)return;
  const guests=t.data.guests||[],now=Date.now(),crowd=r.crowd;
  if(this.version!==w.version){this.version=w.version;this.invalid.clear();for(const g of guests)if(!touristPlanValid(g,w,now))this.invalid.add(g.id);}
  if(crowd&&!this.poser)this.poser=new HumanPoser(crowd.lib);
  const radius=Math.min(70,r.cam.distance*1.3+8),cx=r.cam.target.x,cz=r.cam.target.z;
  for(const guest of guests){
   if(this.visibleCount>=MAX_VISIBLE_TOURISTS)break;
   if(this.invalid.has(guest.id))continue;const p=touristPosition(guest,now,this.position);if(!p||(p.x-cx)**2+(p.z-cz)**2>radius*radius)continue;
   const tile=Math.floor(p.z+SIZE/2)*SIZE+Math.floor(p.x+SIZE/2),water=w.terrain[tile]===T.WATER||w.terrain[tile]===T.DEEP,y=water ? .11 : .015,kid=guest.id%5===0;
   const f=this.figure;f.anim=p.activity==='walk'?'walk':p.activity==='attraction'?'cheer':p.activity==='refreshment'?'browse':'idle';f.phase=p.distance*9;f.t=p.elapsed;f.seed=guest.id%997;f.x=p.x;f.z=p.z;f.role='walker';
   if(crowd&&this.poser?.ok){
    const P=pose(f,this.time),rig=crowd.rig('human');this.poser.pose(rig,f,P,this.time);
    const cp=r.camera.position,lod=(cp.x-p.x)**2+cp.y**2+(cp.z-p.z)**2<196?0:1,slot=crowd.add(MODELS[guest.id%MODELS.length],lod);
    if(!slot)continue;const[e,i]=slot;
    rig.writeSkin(e.stage,i*e.nb*12,p.x,y+(P.bob||0),p.z,p.dir,kid ? .76 : 1);
    crowd.tint(e,i,1,SKINS[guest.id%SKINS.length]);crowd.tint(e,i,2,guest.id%3===0?0xd4c4a4:0x644732);crowd.tint(e,i,3,SHIRTS[guest.id%SHIRTS.length]);crowd.tint(e,i,4,0x3d5268);
   }else{
    this.dummy.position.set(p.x,y+.1,p.z);this.dummy.rotation.set(0,p.dir,0);this.dummy.scale.setScalar(kid ? .75 : 1);this.dummy.updateMatrix();
    this.fallback.setMatrixAt(this.fallback.count,this.dummy.matrix);this.fallback.setColorAt(this.fallback.count++,this.color.setHex(SHIRTS[guest.id%SHIRTS.length]));
   }
   if(guest.fromTrain&&p.activity==='walk'){
    this.dummy.position.set(p.x+Math.cos(p.dir)*.07,y+.045,p.z-Math.sin(p.dir)*.07);this.dummy.rotation.set(0,p.dir,0);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.luggage.setMatrixAt(this.luggage.count,this.dummy.matrix);this.luggage.setColorAt(this.luggage.count++,this.color.setHex(guest.id%2?0xb78355:0x7991a9));
   }
   this.visibleCount++;
  }
  for(const m of [this.fallback,this.luggage]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
 }
}
