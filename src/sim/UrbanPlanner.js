// L'urbaniste prépare une opération sur une copie des occupations, puis l'applique en une fois.
import {Actions} from '../core/Actions.js';
import {BUILDINGS,ROAD_TYPES,sizeOf,buildXP} from '../data/buildings.js';
import {T,SIZE} from '../world/constants.js';
import {needsSite,realDuration,siteWork} from './Construction.js';
const fail=reason=>({ok:false,reason});
const clone=value=>JSON.parse(JSON.stringify(value));
const MAX_SELECTION=100,MAX_ROADS=1024;
function addCost(total,cost){for(const[k,v]of Object.entries(cost))total[k]=(total[k]||0)+v;}
export class UrbanPlanner{
 constructor(game){this.game=game;}
 get data(){const city=this.game.state.city||={},p=city.planning||={stored:[],blueprints:[],nextStored:1,nextBlueprint:1};p.stored||=[];p.blueprints||=[];p.nextStored||=1;p.nextBlueprint||=1;return p;}
 writable(){return !!this.game.state&&!!this.game.playing&&!this.game.isDemo&&!this.game.visit;}
 valid(){return this.writable()?null:fail('Ouvrez votre propre village pour utiliser l’urbaniste.');}
 selection(ids,{roads=true}={}){
  if(!Array.isArray(ids)||!ids.length||ids.length>MAX_SELECTION||ids.some(id=>!Number.isInteger(id)))return fail(`Sélectionnez de 1 à ${MAX_SELECTION} bâtiments.`);
  ids=[...new Set(ids)];const world=this.game.world,buildings=ids.map(id=>world.buildings.get(id));
  if(buildings.some(b=>!b))return fail('Un bâtiment sélectionné a été retiré.');
  if(buildings.some(b=>b.type==='townhall'||BUILDINGS[b.type].civic))return fail('La mairie et les grands projets restent à leur emplacement.');
  if(buildings.some(b=>b.cons||b.fire))return fail('Terminez les travaux et éteignez les incendies avant de déplacer ce quartier.');
  let x0=SIZE,z0=SIZE,x1=0,z1=0;
  for(const b of buildings){const[w,d]=sizeOf(BUILDINGS[b.type],b.rot);x0=Math.min(x0,b.x);z0=Math.min(z0,b.z);x1=Math.max(x1,b.x+w);z1=Math.max(z1,b.z+d);}
  const selectedRoads=[];
  if(roads){
   if((x1-x0+2)*(z1-z0+2)>MAX_ROADS)return fail('Pour emporter les routes, choisissez un quartier plus compact (1 024 cases maximum).');
   for(let z=Math.max(0,z0-1);z<Math.min(SIZE,z1+1);z++)for(let x=Math.max(0,x0-1);x<Math.min(SIZE,x1+1);x++){const i=world.idx(x,z);if(world.road[i])selectedRoads.push({x,z,type:world.road[i]});}
  }
  const bounds={x:Math.min(x0,...selectedRoads.map(r=>r.x)),z:Math.min(z0,...selectedRoads.map(r=>r.z)),x1:Math.max(x1,...selectedRoads.map(r=>r.x+1)),z1:Math.max(z1,...selectedRoads.map(r=>r.z+1))};
  return {ok:true,buildings,roads:selectedRoads,bounds};
 }
 virtual(removeBuildings=[],removeRoads=[]){
  const world=this.game.world,v=Object.create(world);v.occ=world.occ.slice();v.road=world.road.slice();v.buildings=new Map(world.buildings);v.version=world.version;
  for(const b of removeBuildings)v.removeBuilding(b.id);for(const r of removeRoads)v.setRoad(v.idx(r.x,r.z),0);
  // Un plan est une nouvelle construction ; le cadeau d'entrepôt ne paie pas une copie.
  const state={...this.game.state,flags:{...this.game.state.flags}};delete state.flags.depotGift;
  const game={...this.game,state,world:v};return {world:v,actions:new Actions(game)};
 }
 plan(buildings,roads,{removeBuildings=[],removeRoads=[],charge=false}={}){
  const{world:v,actions}=this.virtual(removeBuildings,removeRoads),cost={};
  if(buildings.length>MAX_SELECTION||roads.length>MAX_ROADS)return fail('Ce plan est trop grand.');
  let id=0x3fffffff;
  for(const b of buildings){
   const def=BUILDINGS[b.type];if(!def||def.notBuildable||def.plantsTerrain||!Number.isInteger(b.x)||!Number.isInteger(b.z)||!Number.isInteger(b.rot)||b.rot<0||b.rot>3)return fail('Le plan contient un emplacement invalide.');
   const result=actions.checkPlacement(b.type,b.x,b.z,b.rot,charge?-1:(b.id??id));
   if(!result.ok)return {...result,at:{x:b.x,z:b.z}};
   if(result.clear.length)return {ok:false,reason:'Le terrain doit être libre : l’urbaniste préserve les arbres et les rochers.',at:{x:b.x,z:b.z}};
   if(charge)addCost(cost,result.cost);
   v.addBuilding({...b,id:id--});
  }
  for(const r of roads){
   if(!Number.isInteger(r.x)||!Number.isInteger(r.z)||!v.inside(r.x,r.z)||!ROAD_TYPES[r.type])return fail('Une route sort de la carte ou possède un type invalide.');
   if(!this.game.prog.roadUnlocked(r.type))return fail(`Route accessible au niveau ${ROAD_TYPES[r.type].unlock}.`);
   const i=v.idx(r.x,r.z);if(v.road[i])return {ok:false,reason:'Une route existante occupe la destination.',at:{x:r.x,z:r.z}};
   const result=actions.checkRoadTile(i,r.type);if(!result.ok)return {...result,at:{x:r.x,z:r.z}};
   if(result.clearT!=null)return {ok:false,reason:'Les routes du plan doivent respecter les arbres et les rochers.',at:{x:r.x,z:r.z}};
   if(charge)addCost(cost,result.cost);v.setRoad(i,r.type);
  }
  if(charge&&!this.game.actions.canAfford(cost))return {ok:false,reason:this.game.actions.missingText(cost),cost};
  return {ok:true,buildings,roads,cost};
 }
 previewMove(ids,dx,dz,options={}){
  const bad=this.valid();if(bad)return bad;
  if(!Number.isInteger(dx)||!Number.isInteger(dz)||Math.abs(dx)>SIZE||Math.abs(dz)>SIZE)return fail('Le déplacement doit utiliser un nombre entier de cases.');
  if(!dx&&!dz)return fail('Choisissez un déplacement d’au moins une case.');
  const selection=this.selection(ids,options);if(!selection.ok)return selection;
  const buildings=selection.buildings.map(b=>({...b,x:b.x+dx,z:b.z+dz})),roads=selection.roads.map(r=>({...r,x:r.x+dx,z:r.z+dz}));
  const result=this.plan(buildings,roads,{removeBuildings:selection.buildings,removeRoads:selection.roads});
  return {...result,source:selection,buildings,roads,dx,dz};
 }
 transaction(mutate,events){
  const g=this.game,w=g.world,st=g.state;
  const backup={buildings:new Map(w.buildings),positions:[...w.buildings.values()].map(b=>[b,b.x,b.z,b.rot]),occ:w.occ.slice(),road:w.road.slice(),version:w.version,res:{...st.res},stats:clone(st.stats),nextId:st.nextId,planning:clone(this.data),undo:g.actions.undoStack.slice()};
  try{
   const value=mutate();
   if(g.save?.()===false)throw new Error('Le stockage du téléphone est plein. Aucune modification n’a été conservée.');
   backup.value=value;
  }catch(error){
   for(const[b,x,z,rot]of backup.positions)Object.assign(b,{x,z,rot});w.buildings=backup.buildings;w.occ=backup.occ;w.road=backup.road;w.version=backup.version;st.res=backup.res;st.stats=backup.stats;st.nextId=backup.nextId;st.city.planning=backup.planning;g.actions.undoStack=backup.undo;g.sim.markDirty();
   return fail(error.message||'Le quartier n’a pas été modifié.');
  }
  const value=backup.value;g.actions.undoStack=[];g.bus.emit('undo:changed',0);g.prog.recount();g.sim.markDirty();events?.(value);g.bus.emit('urbanist:changed');g.save?.();return {ok:true,...value};
 }
 move(ids,dx,dz,options={}){
  const p=this.previewMove(ids,dx,dz,options);if(!p.ok)return p;const w=this.game.world;
  return this.transaction(()=>{
   for(const b of p.source.buildings)w.removeBuilding(b.id);for(const r of p.source.roads)w.setRoad(w.idx(r.x,r.z),0);
   for(let i=0;i<p.buildings.length;i++){const original=p.source.buildings[i],target=p.buildings[i];Object.assign(original,{x:target.x,z:target.z});w.addBuilding(original);}
   for(const r of p.roads)w.setRoad(w.idx(r.x,r.z),r.type);return {count:p.buildings.length,roadCount:p.roads.length};
  },()=>{for(let i=0;i<p.source.buildings.length;i++)this.game.bus.emit('building:moved',p.source.buildings[i],{x:p.buildings[i].x-dx,z:p.buildings[i].z-dz,rot:p.buildings[i].rot});this.game.bus.emit('roads:changed',[...p.source.roads,...p.roads].map(r=>w.idx(r.x,r.z)));});
 }
 canStore(b){const def=BUILDINGS[b?.type];return !!def&&def.cat==='decor'&&!def.unique&&!def.civic&&!def.notBuildable&&!def.plantsTerrain&&!b.cons&&!b.fire;}
 storeDecor(id){
  const bad=this.valid();if(bad)return bad;const b=this.game.world.buildings.get(id);if(!this.canStore(b))return fail('Seuls les décors terminés, sans incendie et sans caractère unique peuvent être rangés.');
  if(this.data.stored.length>=500)return fail('La réserve contient déjà 500 décorations.');
  return this.transaction(()=>{const entry={key:this.data.nextStored++,building:clone(b)};this.data.stored.push(entry);this.game.world.removeBuilding(id);return {entry};},()=>{if(this.game.selection===id)this.game.select(null);this.game.bus.emit('building:removed',b,{stored:true});});
 }
 previewRestore(key,x,z,rot){
  const bad=this.valid();if(bad)return bad;const entry=this.data.stored.find(v=>v.key===key);if(!entry||!this.canStore(entry.building))return fail('Cette décoration ne se trouve plus dans la réserve.');
  const building={...clone(entry.building),x,z,rot:rot??entry.building.rot};return {...this.plan([building],[],{}),entry,building};
 }
 restoreDecor(key,x,z,rot){
  const p=this.previewRestore(key,x,z,rot);if(!p.ok)return p;
  return this.transaction(()=>{const b={...p.building,id:this.game.state.nextId++};this.game.world.addBuilding(b);this.data.stored=this.data.stored.filter(v=>v.key!==key);return {building:b};},value=>this.game.bus.emit('building:placed',value.building,{restored:true,silent:true}));
 }
 saveBlueprint(name,ids,options={}){
  const bad=this.valid();if(bad)return bad;name=String(name||'').trim().slice(0,40);if(!name)return fail('Donnez un nom au plan.');if(this.data.blueprints.length>=20)return fail('Vingt plans peuvent être conservés.');
  const s=this.selection(ids,options);if(!s.ok)return s;
  if(s.buildings.some(b=>BUILDINGS[b.type].unique))return fail('Un plan à reproduire ne peut pas contenir de bâtiment unique.');
  const x=s.bounds.x,z=s.bounds.z;
  return this.transaction(()=>{const blueprint={id:this.data.nextBlueprint++,name,width:s.bounds.x1-x,depth:s.bounds.z1-z,buildings:s.buildings.map(b=>({type:b.type,x:b.x-x,z:b.z-z,rot:b.rot,...(b.appearance?{appearance:clone(b.appearance)}:{})})),roads:s.roads.map(r=>({...r,x:r.x-x,z:r.z-z}))};this.data.blueprints.push(blueprint);return {blueprint};});
 }
 deleteBlueprint(id){const bad=this.valid();if(bad)return bad;if(!this.data.blueprints.some(b=>b.id===id))return fail('Plan introuvable.');return this.transaction(()=>{this.data.blueprints=this.data.blueprints.filter(b=>b.id!==id);return {};});}
 previewBlueprint(id,x,z){
  const bad=this.valid();if(bad)return bad;const blueprint=this.data.blueprints.find(b=>b.id===id);if(!blueprint)return fail('Plan introuvable.');if(!Number.isInteger(x)||!Number.isInteger(z))return fail('Choisissez des coordonnées entières.');
  if(!Array.isArray(blueprint.buildings)||!Array.isArray(blueprint.roads)||blueprint.buildings.some(b=>!BUILDINGS[b.type]||BUILDINGS[b.type].unique||BUILDINGS[b.type].civic||b.type==='townhall'))return fail('Ce plan contient un bâtiment protégé.');
  const buildings=blueprint.buildings.map(b=>({...clone(b),x:b.x+x,z:b.z+z,level:1})),roads=blueprint.roads.map(r=>({...r,x:r.x+x,z:r.z+z}));
  return {...this.plan(buildings,roads,{charge:true}),blueprint,buildings,roads};
 }
 buildBlueprint(id,x,z){
  const p=this.previewBlueprint(id,x,z);if(!p.ok)return p;const g=this.game,st=g.state,w=g.world;
  return this.transaction(()=>{
   g.actions.pay(p.cost);const buildings=[];
   for(const template of p.buildings){const b={...template,id:st.nextId++,level:1,born:st.time.day},def=BUILDINGS[b.type];if(def.residents)b.residents=0;
    if(g.construction?.enabled()&&needsSite(def)){const seconds=st.mode==='libre'?6:realDuration(def,1,'new');b.cons={k:'new',w:0,W:siteWork(def,1,'new'),to:1,del:0,t0:st.time.day,rs:Date.now(),rd:seconds*1000};}
    w.addBuilding(b);buildings.push(b);st.stats.totalBuilt++;st.stats.built[b.type]=(st.stats.built[b.type]||0)+1;if(st.stats.daily){st.stats.daily.built++;if(def.cat==='decor')st.stats.daily.decor++;}if(def.cat==='monuments')st.stats.monuments++;
   }
   for(const r of p.roads)w.setRoad(w.idx(r.x,r.z),r.type);st.stats.roadsBuilt+=p.roads.length;if(st.stats.daily)st.stats.daily.roads+=p.roads.length;
   return {buildings,cost:p.cost,count:buildings.length};
  },value=>{for(const b of value.buildings){if(b.cons){g.construction.version++;g.bus.emit('site:started',b);}g.bus.emit('building:placed',b);g.prog.addXP(buildXP(BUILDINGS[b.type]),'build');}if(p.roads.length){g.bus.emit('roads:built',p.roads.length);g.bus.emit('roads:changed',p.roads.map(r=>w.idx(r.x,r.z)));}});
 }
}
