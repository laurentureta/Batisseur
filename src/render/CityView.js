import * as THREE from 'three';
import { GeoBuilder } from './geom.js';
import { toGeometry } from './TerrainView.js';
import { SIZE,ZONE,ZONES } from '../world/constants.js';
import { SPECIALTIES } from '../data/city.js';

export class CityView {
  constructor(renderer) {
    this.r=renderer;this.group=new THREE.Group();this.fleet=new Map();this.geometries={};
    this.material=new THREE.MeshLambertMaterial({vertexColors:true});this.districtMesh=null;
  }
  clear() { for(const m of this.fleet.values())this.group.remove(m);this.fleet.clear();if(this.districtMesh){this.group.remove(this.districtMesh);this.districtMesh.geometry.dispose();this.districtMesh=null;} }
  districtBorders(show) {
    if(this.districtMesh){this.group.remove(this.districtMesh);this.districtMesh.geometry.dispose();this.districtMesh=null;}
    if(!show)return;
    const g=new GeoBuilder();
    for(const d of this.r.game.city.data.districts)for(const zone of d.zones){
      const x=(zone%ZONES)*ZONE-SIZE/2,z=Math.floor(zone/ZONES)*ZONE-SIZE/2,c=SPECIALTIES[d.specialty]?.color||0xffffff;
      g.box(x+ZONE/2,.07,z+.06,ZONE,.06,.12,c);g.box(x+ZONE/2,.07,z+ZONE-.06,ZONE,.06,.12,c);
      g.box(x+.06,.07,z+ZONE/2,.12,.06,ZONE,c);g.box(x+ZONE-.06,.07,z+ZONE/2,.12,.06,ZONE,c);
    }
    if(g.body.count){this.districtMesh=new THREE.Mesh(toGeometry(g.body),this.material);this.group.add(this.districtMesh);}
  }
  vehicle(mode) {
    if(this.geometries[mode])return this.geometries[mode];
    const g=new GeoBuilder(),truck=mode==='truck';
    g.box(0,.23,0,.35,.2,.65,truck?0x448eaa:0x98734b);
    if(truck)g.box(0,.39,-.22,.34,.3,.24,0x75b7c4);
    g.box(0,.4,.08,.26,.18,.3,0xc39e66);
    for(const x of [-.2,.2])for(const z of [-.22,.22])g.cylX(x,.12,z,.09,.05,8,0x3e4642);
    return this.geometries[mode]=toGeometry(g.body);
  }
  update() {
    const jobs=this.r.game.city.data.deliveries;
    const ids=new Set(jobs.map((j)=>j.id));
    for(const [id,m] of this.fleet)if(!ids.has(id)){this.group.remove(m);this.fleet.delete(id);}
    for(const j of jobs){
      if(!j.path?.length)continue;
      let m=this.fleet.get(j.id);
      if(!m){m=new THREE.Mesh(this.vehicle(j.mode),this.material);m.castShadow=true;this.group.add(m);this.fleet.set(j.id,m);}
      const at=Math.min(j.path.length-1,j.progress*(j.path.length-1)),a=j.path[Math.floor(at)],b=j.path[Math.min(j.path.length-1,Math.floor(at)+1)],f=at%1;
      const ax=a%SIZE,az=Math.floor(a/SIZE),bx=b%SIZE,bz=Math.floor(b/SIZE);
      m.position.set(ax+(bx-ax)*f+.5-SIZE/2,.04,az+(bz-az)*f+.5-SIZE/2);
      if(a!==b)m.rotation.y=Math.atan2(bx-ax,bz-az);
    }
  }
}
