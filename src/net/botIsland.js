// Plan de Bellerive : une île dessinée, six quartiers, un canal, des quais et un parc achevé.
// Chaque référence du catalogue possède un emplacement réel, sans catalogue factice de façades.
import { BUILDINGS, BUILDING_LIST, sizeOf, residentsAt } from '../data/buildings.js';
import { T, SIZE, ZONES } from '../world/constants.js';
import { ATTRACTIONS, festivalCalendar } from '../data/tourism.js';
import { PROJECTS } from '../data/city.js';

export const ISLAND_LAYOUT_VERSION = 2;
export const ISLAND_CAMERA = { target:{x:-2,z:5},distance:36,azimuth:.68 };
const QUARTERS = [
 ['alpine','Les Terrasses des Alpages',21,23,4], ['jardin','La Cité des Jardins',42,17,4],
 ['canal','Les Maisons du Canal',74,25,4], ['heritage','Le Bourg des Arts',17,46,4],
 ['riviera','La Riviera Fleurie',77,49,4], ['bocage','Le Hameau des Vergers',25,75,4],
];
const water=t=>t===T.WATER||t===T.DEEP;

export function refreshIslandRelief(world) {
 for(let z=0;z<SIZE;z++)for(let x=0;x<SIZE;x++)if(world.terrain[world.idx(x,z)]===T.MOUNTAIN) {
   world.height[world.idx(x,z)]=1.1+Math.max(0,2.2-Math.hypot(x-28,z-14)*.4);
 }
}

export function buildBotIsland(world,now=Date.now()) {
 const st=world.state;
 for(const b of [...world.buildings.values()])world.removeBuilding(b.id);
 world.road.fill(0);world.terrain.fill(T.DEEP);world.height.fill(0);
 // Une côte continue, avec de petites anses ; tous les bords de carte restent en pleine mer.
 for(let z=2;z<SIZE-2;z++)for(let x=2;x<SIZE-2;x++){
   const edge=Math.pow(Math.abs((x-54.5)/48),3.4)+Math.pow(Math.abs((z-54.5)/48),3.4)+.025*Math.sin(x*.31)*Math.cos(z*.22);
   world.terrain[world.idx(x,z)]=edge<.87?T.GRASS:edge<1?T.SAND:edge<1.11?T.WATER:T.DEEP;
 }
 const paint=(x0,z0,x1,z1,type)=>{for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)world.terrain[world.idx(x,z)]=type;};
 // Canal navigable et bassin de retournement ; la marina ouvre sur la mer au sud.
 paint(67,29,70,103,T.WATER);
 for(let z=27;z<=35;z++)for(let x=65;x<=73;x++)if(Math.hypot(x-69,z-31)<4.1)world.terrain[world.idx(x,z)]=T.WATER;
 paint(67,91,74,103,T.WATER);paint(77,93,77,98,T.WATER);paint(74,98,77,99,T.WATER);
 // Le grand miroir d’eau royal rejoint le canal par une écluse sous le boulevard.
 paint(44,40,59,42,T.WATER);paint(60,41,67,41,T.WATER);
 // La presqu'île agricole utilise réellement sa forêt, son argile et son relief minier.
 paint(21,12,33,16,T.ROCK);paint(26,11,32,16,T.MOUNTAIN);
 paint(12,23,15,40,T.FOREST);paint(17,20,20,22,T.FOREST);
 let nextId=1;const placed=new Set();
 const road=(x0,z0,x1,z1,type=4)=>{
   if(x0!==x1&&z0!==z1)throw new Error('Une allée doit suivre un axe.');
   const dx=Math.sign(x1-x0),dz=Math.sign(z1-z0),n=Math.max(Math.abs(x1-x0),Math.abs(z1-z0));
   for(let k=0;k<=n;k++){const x=x0+k*dx,z=z0+k*dz,i=world.idx(x,z);if(world.occ[i]>=0)throw new Error(`Route sous ${world.buildingAt(x,z)?.type}`);if(world.terrain[i]===T.DEEP)world.terrain[i]=T.WATER;world.road[i]=type;}
 };
 const free=(def,x,z,rot=0)=>{
   const [w,d]=sizeOf(def,rot);
   if(x<3||z<3||x+w>107||z+d>107)return false;
   for(let zz=z;zz<z+d;zz++)for(let xx=x;xx<x+w;xx++){const i=world.idx(xx,zz);if(world.occ[i]>=0||world.road[i]||water(world.terrain[i])||world.terrain[i]===T.MOUNTAIN)return false;}
   return true;
 };
 const place=(type,x,z,rot=0)=>{
   const def=BUILDINGS[type];if(!def||def.plantsTerrain||!free(def,x,z,rot))return null;
   const b={id:nextId++,type,x,z,rot,level:def.maxLevel,born:0};
   if(def.residents)b.residents=residentsAt(def,b.level);
   for(const i of world.tilesOf(b))world.terrain[i]=T.GRASS;
   world.addBuilding(b);placed.add(type);return b;
 };
 const must=(type,x,z,rot=0)=>{const b=place(type,x,z,rot);if(!b)throw new Error(`Emplacement de Bellerive indisponible : ${type} (${x},${z})`);return b;};
 // Les grands axes relient les quartiers ; les ponts sont limités aux traversées du canal.
 road(40,17,40,95,6);road(63,20,63,96,6);road(17,43,94,43,6);road(16,65,95,65,6);road(20,72,95,72,4);
 road(40,95,63,95,4);road(71,36,71,90,4);road(75,90,75,98,4);road(63,90,75,90,4);
 // Le parvis royal : deux promenades plantées, des monuments alignés sur la place.
 for(const z of [39,48,54,60])road(39,z,64,z,z===54?6:4);
 road(39,39,39,65,4);road(64,39,64,65,4);
 // Entrées de quartier et petites rues. Les maisons ont de vrais jardins entre deux rues.
 for(const [collection,name,x,z,type]of QUARTERS){
   for(const line of [3,9,15])road(x,z+line,x+16,z+line,type);
   road(x,z+3,x,z+15,type);road(x+16,z+3,x+16,z+15,type);
   const mid=z+9;
   if(x<40)road(x+16,mid,40,mid,type);
   else if(x<63)road(40,mid,x,mid,type);
   else road(63,mid,x,mid,type);
 }
 // Le parc de loisirs et le jardin des saisons ont leur propre promenade.
 road(40,68,64,68,5);road(71,68,94,68,5);road(94,68,94,72,4);
 for(const z of [77,83,89])road(46,z,64,z,4);
 road(46,72,46,95,4);road(64,72,64,95,4);
 for(const z of [77,83,89])road(77,z,94,z,4);
 road(77,72,77,89,4);road(94,72,94,89,4);
 // Route des artisans, fermes et carrière. Les zones naturelles restent hors des emprises.
 road(17,19,40,19,4);road(17,19,17,43,4);road(35,11,35,19,4);road(35,11,63,11,4);
 road(35,16,63,16,4);
 must('townhall',49,52);must('civic_square',54,51);must('palace',44,51);
 must('opera',49,46);must('colosseum',56,45);must('castle',41,45);
 must('stadium',44,57);must('civic_garden',55,57);must('planetarium',49,58);
 must('station',43,37);must('civic_harbor',72,80);must('lighthouse',76,94);
 must('park_gate',49,69);must('park_wheel',57,74);must('park_stage',49,75);
 must('park_carousel',49,81);must('park_garden',57,81);must('park_stalls',52,88);
 // Aménagements du parvis : symétrie, fontaines et sculptures ; pas de trame de lots vides.
 for(const [type,x,z]of [['grandfountain',51,55],['mayorstatue',49,49],['arch',59,53],['clocktower',61,53],['goldkiosk',41,53],['equestrian',42,53],['goldtower',60,59],['citygate',41,64]])must(type,x,z);
 // Une rangée est une suite de lots, séparés par des jardins. Le grand côté touche la rue.
 function bank(types,x,z,width,side,gap=1) {
   let cursor=x;
   for(const type of types){const def=BUILDINGS[type],[w,d]=sizeOf(def);let done=false;
     while(cursor+w<=x+width){const zz=side<0?z-d:z+1;const b=place(type,cursor,zz,side<0?0:2);cursor+=w+gap;if(b){done=true;break;}}
     if(!done)return types.slice(types.indexOf(type));
   }
   return [];
 }
 // Chaque collection est réunie dans un quartier identifiable, dans l'ordre de ses familles.
 for(const [collection,name,x,z]of QUARTERS){
   let types=BUILDING_LIST.filter(d=>d.catalogue?.collection===collection).map(d=>d.id);
   for(const [line,side]of [[3,-1],[3,1],[9,-1],[9,1],[15,-1],[15,1]])types=bank(types,x+1,z+line,15,side,line===15?0:1);
   if(types.length)throw new Error(`Quartier ${collection} trop petit : ${types.length}`);
 }
 // Chaînes complètes : minerai→outils, argile→briques, bois→planches et blé→pain.
 must('quarry',23,18);must('mine',30,18);must('lumber',16,25);must('fisher',72,87);must('claypit',72,85);
 const industry=['sawmill','brickworks','forge','depot'];
 bank(industry,35,11,27,-1,2);
 const farmRows=['farm','pasture','mill','bakery','garden','coop'];
 let rest=bank(farmRows,36,16,26,-1,1);if(rest.length)throw new Error('Fermes insuffisantes');
 // Une ceinture de fermes nourrit aussi les voyageurs, même durant l'hiver.
 for(const [x,z]of [[42,12],[46,12],[50,12],[54,12],[58,12]])must('pasture',x,z);
 // Les grandes demeures du boulevard fournissent la main-d'œuvre des équipements insulaires.
 must('manor',41,56);
 for(const [i,[x,z]]of [[42,61],[45,61],[48,61],[51,61],[54,61],[57,61],[60,61],[49,37],[53,37],[57,37]].entries())must('v5_home_apartment_'+['heritage','canal','jardin'][i%3],x,z);
 // Espaces de placement pour les équipements classiques et les décors des fêtes.
 const slots=[];
 const addBanks=(x,z,width)=>{for(const side of [-1,1])for(let xx=x;xx<x+width;xx++)slots.push([xx,z,side,x+width]);};
 for(const z of [77,83,89])addBanks(78,z,16);
 for(const z of [77,83,89])addBanks(47,z,16);
 for(const z of [39,48,54,60])addBanks(40,z,23);
 // Les types non architecturaux s'intègrent autour des places et jardins.
 const missing=BUILDING_LIST.filter(d=>!d.plantsTerrain&&!placed.has(d.id));
 for(const def of missing){let b=null;
   for(const [x,z,side,end]of slots){const [w,d]=sizeOf(def);if(x+w>end)continue;const zz=side<0?z-d:z+1;if(def.near&&world.countTerrainAround(x,zz,w,d,def.near.types,def.near.radius)<1)continue;b=place(def.id,x,zz,side<0?0:2);if(b)break;}
   if(!b)throw new Error(`Aucune place paysagée pour ${def.id}`);
 }
 // Services de proximité pour les quartiers qui n'ont pas de déclinaison de cette collection.
 for(const [x,z]of [[17,43],[74,43],[25,72]]){
   for(const [type,dx]of [['watertower',0],['school',3],['clinic',6],['police',9],['market',12],['park',14]]){
     const def=BUILDINGS[type],[w,d]=sizeOf(def);if(free(def,x+dx,z-d))place(type,x+dx,z-d);
   }
 }
 // Les interstices plantés gardent un rythme régulier sans ajouter des centaines de logements.
 for(const z of [48,54,60,65,72])for(let x=20;x<96;x+=4){
   if(x>=66&&x<=75)continue;
   const type=(x+z)%3?'tree':'flowers';if(world.perimeterRect(x,z+1,1,1).some(i=>world.road[i]))place(type,x,z+1);
 }
 // Jardins de poche devant les lots : une composition paysagée remplit les retraits des maisons.
 for(const [collection,name,x,z]of QUARTERS){
   let count=0;
   for(const line of [3,9,15])for(const side of [-1,1])for(let xx=x+1;xx<x+16;xx++){
     if(count>=12)continue;
     const zz=z+line+side;
     const type=['x_cherry_tree','flowers','tree'][count%3];
     if(place(type,xx,zz)){count++;}
   }
 }
 // Les espaces entre quartiers sont de vrais bosquets et jardins, jamais des lots en attente.
 const groves=[[34,46,38,62],[21,66,38,70],[60,22,62,36],[72,48,75,70],[42,75,44,91],[20,21,38,22],[78,92,91,96],[42,34,61,36],[19,44,37,45],[75,44,94,47],[47,91,61,94]];
 for(const [x0,z0,x1,z1]of groves)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   const i=world.idx(x,z);if(world.occ[i]>=0||world.road[i]||world.terrain[i]!==T.GRASS)continue;
   if((x+z)%3===0)continue;
   if(world.perimeterRect(x,z,1,1).some(j=>world.occ[j]>=0))continue;
   world.terrain[i]=T.FOREST;
 }
 // Les grands tapis verts du boulevard deviennent des jardins dessinés et des bosquets.
 for(const [x0,z0,x1,z1]of [[41,55,43,59],[59,55,62,58],[47,78,62,80],[47,84,62,87],[78,66,92,71]]){
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   const i=world.idx(x,z);if(world.occ[i]>=0||world.road[i]||world.terrain[i]!==T.GRASS)continue;
   if((x%5===0)||(z%4===0))continue;
   if(world.perimeterRect(x,z,1,1).some(j=>world.occ[j]>=0))continue;
   world.terrain[i]=T.FOREST;
  }
 }
 for(const [x0,x1]of [[41,63],[72,93]])for(let x=x0;x<=x1;x++)for(const z of [67,69]){
   const type=['x_cherry_tree','flowers','tree'][x%3];place(type,x,z);
 }
 // Les grands retraits du domaine sont des jardins en bosquets, avec des allées de pelouse.
 for(let z=17;z<97;z++)for(let x=18;x<96;x++){
   const i=world.idx(x,z);if(world.terrain[i]!==T.GRASS||world.occ[i]>=0||world.road[i])continue;
   if(x%5===0||z%5===0)continue;
   let nearBuilding=false,nearStreet=false;
   for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const j=world.idx(x+dx,z+dz);nearBuilding ||= world.occ[j]>=0;nearStreet ||= !!world.road[j];}
   if(!nearBuilding&&!nearStreet)world.terrain[i]=T.FOREST;
 }
 // Parterre minéral autour de la mairie et promenades fleuries des jardins royaux.
 for(let z=49;z<=53;z++)for(let x=41;x<=62;x++){
   const i=world.idx(x,z);if(world.occ[i]<0&&!world.road[i]&&world.terrain[i]===T.GRASS)world.terrain[i]=T.SAND;
 }
 for(let z=74;z<=92;z+=3){place('flowers',45,z);place('x_cherry_tree',41,z);}
 st.nextId=nextId;st.zones.fill(true);st.stats.zonesUnlocked=ZONES*ZONES;
 st.city.projects=Object.fromEntries(Object.keys(PROJECTS).map(type=>[type,{phase:3,readyAt:0}]));
 const festival=festivalCalendar(now);
 st.city.tourism={attractions:Object.fromEntries(Object.keys(ATTRACTIONS).map(type=>[type,{phase:3,readyAt:0}])),visitors:25000,revenue:120000,milestones:[0,1,2,3,4],lastAt:now-180000,fraction:0,festival:{id:festival.id,points:700,claimed:[0,1,2],donated:{food:700}},trophies:['spring','maritime','harvest','winter'],festivalHistory:[],lastRates:{visitors:200,revenue:700}};
 st.botCity={...(st.botCity||{}),version:ISLAND_LAYOUT_VERSION,populated:true,finished:true,camera:ISLAND_CAMERA,layout:'L’Île des Six Jardins',views:[
 {name:'Le Grand Parvis',target:{x:-4,z:0},distance:34,azimuth:.68},
 {name:'Les Merveilles du Parc',target:{x:0,z:26},distance:32,azimuth:.7},
 {name:'Le Canal et la Marina',target:{x:20,z:28},distance:35,azimuth:.5},
 {name:'La Riviera Fleurie',target:{x:30,z:3},distance:30,azimuth:.6},
 {name:'Les Jardins et les Alpages',target:{x:-13,z:-25},distance:38,azimuth:.7},
 {name:'Le Hameau des Vergers',target:{x:-21,z:28},distance:30,azimuth:.68},
 {name:'Le Domaine des Fermes',target:{x:-9,z:-39},distance:33,azimuth:.8}
 ],districts:QUARTERS.map(([collection,name,x,z])=>({collection,name,x,z}))};
 st.stats.built={};for(const b of world.buildings.values())st.stats.built[b.type]=(st.stats.built[b.type]||0)+1;
 st.stats.totalBuilt=world.buildings.size;st.stats.popRecord=Math.round([...world.buildings.values()].reduce((n,b)=>n+(b.residents||0),0));
 refreshIslandRelief(world);world.version++;world.terrainVersion++;world.trees?.rebuild();
 return st.stats.popRecord;
}
