import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCore } from '../src/core/GameCore.js';
import { createNewState, migrateState } from '../src/core/state.js';
import { serialize } from '../src/core/save.js';
import { makeSnapshot, stateFromSnapshot } from '../src/net/snapshot.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { GOODS } from '../src/data/resources.js';
import { PROJECTS } from '../src/data/city.js';
import { buildModel } from '../src/render/models.js';
import { SIZE, N, T } from '../src/world/constants.js';
import { generateMap } from '../src/world/mapgen.js';

function fixture(mode='carriere') {
 const game=new GameCore({sites:false});
 const state=createNewState({seed:1234,mode});state.level=35;
 for(const r of Object.keys(state.res))state.res[r]=10000;
 game.loadState(state);game.startState=(st)=>game.loadState(st);game.playing=true;
 game.save=()=>{game.saved=serialize(game);return true;};
 return game;
}
function add(g,type,x,z,level=1){const b={id:g.state.nextId++,type,x,z,rot:0,level};if(BUILDINGS[type].residents)b.residents=4;g.world.addBuilding(b);return b;}
function depotRoute(g,road=1){
 const a=add(g,'sawmill',50,50),b=add(g,'depot',56,50);
 for(let x=50;x<=57;x++)g.world.setRoad(52*SIZE+x,road);
 g.world.setRoad(51*SIZE+50,road);
 return {a,b};
}

test('quartiers : composition, bonus et validation des zones sans chevauchement',()=>{
 const g=fixture();add(g,'house',50,50);add(g,'house',51,50);g.city.recount();
 assert.equal(g.city.districtFor([...g.world.buildings.values()][1]).active,true);
 assert.equal(g.city.effects([...g.world.buildings.values()][1]).happy,.04);
 assert.equal(g.city.setDistrict(1,'Le Bourg','commerce',[60]).ok,true);
 assert.equal(g.city.setDistrict(null,'Doublon','residential',[60]).ok,false);
 assert.equal(g.city.setDistrict(1,'Perdu','commerce',[0]).ok,false);
 g.state.zones[61]=true;g.state.zones[63]=true;
 assert.equal(g.city.setDistrict(null,'Discontinu','farming',[61,63]).ok,false);
 add(g,'market',51,51);add(g,'market',52,51);g.city.recount();
 assert.equal(g.city.effects([...g.world.buildings.values()].find(b=>b.type==='market')).commerce,1.15);
});

test('apparences : sauvegarde et visites conservent façade, toit et jardin',()=>{
 const g=fixture(),b=add(g,'house',50,50);
 const look={facade:'sage',roof:'blue',garden:'flowers'};
 assert.equal(g.city.styleBuilding(b.id,look).ok,true);
 const saved=migrateState(JSON.parse(serialize(g)));
 assert.deepEqual(saved.buildings.find(v=>v.id===b.id).appearance,look);
 assert.deepEqual(stateFromSnapshot(makeSnapshot(g)).buildings.find(v=>v.id===b.id).appearance,look);
 assert.equal(g.city.styleBuilding(b.id,{...look,facade:'invalid'}).ok,false);
 const normal=buildModel('house',1),styled=buildModel('house',1,0,1,'blue',{appearance:look});
 assert.ok(styled.body.count>normal.body.count);
 assert.notDeepEqual(styled.body.col,normal.body.col);
});

test('grands projets : frais uniques, attente réelle, trois inaugurations et bonus persistants',(t)=>{
 let now=1800000000000;t.mock.method(Date,'now',()=>now);
 const g=fixture(),b=add(g,'civic_square',50,50);
 const initial=g.state.res.coins;
 assert.equal(g.city.startProject('civic_square').ok,true);
 assert.equal(g.state.res.coins,initial-PROJECTS.civic_square.phases[0].cost.coins);
 assert.equal(g.city.startProject('civic_square').ok,false);
 assert.equal(g.city.finishProject('civic_square').ok,false);
 for(let phase=0;phase<3;phase++){
  if(phase)assert.equal(g.city.startProject('civic_square').ok,true);
  now+=PROJECTS.civic_square.phases[phase].seconds*1000;
  assert.equal(g.city.finishProject('civic_square').ok,true);
 }
 assert.equal(b.level,4);assert.equal(g.city.completed('civic_square'),true);
 assert.equal(g.actions.checkUpgrade(b).ok,false);
 const restore=fixture();restore.loadState(migrateState(JSON.parse(serialize(g))));
 assert.equal(restore.city.completed('civic_square'),true);
 assert.equal(restore.city.startProject('civic_square').ok,false);
 for(const id of Object.keys(PROJECTS))assert.ok(buildModel(id,4).body.count>buildModel(id,1).body.count);
});

test('familles : histoires liées aux maisons et récompenses non répétables',()=>{
 const g=fixture(),a=add(g,'house',50,50,2),b=add(g,'house',51,50),c=add(g,'house',52,50);g.city.syncFamilies();
 const family=g.city.data.families[0],before=g.state.res.coins;
 assert.equal(g.city.claimStory(family.family).ok,true);
 assert.equal(g.state.res.coins,before+250);
 assert.equal(g.city.claimStory(family.family).ok,false);
 a.cons={k:'up'};g.city.syncFamilies();assert.equal(family.house,a.id);delete a.cons;
 g.world.removeBuilding(a.id);g.city.syncFamilies();
 const homes=g.city.data.families.map(f=>f.house).filter(Boolean);
 assert.equal(new Set(homes).size,homes.length);
 assert.ok(g.city.data.families.some(f=>!f.house));
 assert.equal(g.city.data.families[0].chapter,1);
});

test('logistique : stock crédité à l’arrivée, coupure de route et reprise sans duplication',()=>{
 const g=fixture(),{a,b}=depotRoute(g),initial=g.state.res.planks;
 g.state.res.planks=0;g.sim.d.storage=500;
 assert.equal(g.city.createRoute(a.id,b.id,'truck').ok,false);
 assert.equal(g.city.createRoute(a.id,b.id,'cart').ok,true);
 assert.equal(g.city.bufferProduction(a,'planks',20),true);
 assert.equal(g.state.res.planks,0);
 g.city.localTick(.25);assert.equal(g.city.data.deliveries.length,1);
 const cut=52*SIZE+54;g.world.setRoad(cut,0);g.city.localTick(50);
 assert.equal(g.state.res.planks,0);assert.equal(g.city.data.deliveries[0].blocked,true);
 const restored=fixture();restored.loadState(migrateState(JSON.parse(serialize(g))));restored.sim.d.storage=500;
 restored.world.setRoad(cut,1);restored.city.localTick(50);
 assert.equal(restored.state.res.planks,20);assert.equal(restored.city.data.delivered,1);
 restored.city.localTick(50);assert.equal(restored.state.res.planks,20);
});

test('logistique : saturation et arrêt de tournée ne détruisent pas de marchandises',()=>{
 const g=fixture(),{a,b}=depotRoute(g,2);g.state.res.planks=100;g.sim.d.storage=100;
 assert.equal(g.city.createRoute(a.id,b.id,'truck').ok,true);
 g.city.bufferProduction(a,'planks',120);assert.equal(g.city.productionRoom(a,'planks'),0);
 g.city.localTick(50);assert.equal(g.state.res.planks,100);
 const total=g.city.buffer(a.id,'planks')+g.city.data.deliveries.reduce((v,j)=>v+j.qty,0);
 assert.equal(total,120);
 g.city.removeRoute(a.id);assert.equal(g.state.res.planks,220);assert.equal(g.city.data.deliveries.length,0);
});

test('région : aller-retour, stocks indépendants et sauvegarde sans références circulaires',()=>{
 const g=fixture(),b=add(g,'house',50,50);g.city.book.level=35;
 assert.equal(g.city.unlockTerritory('island').ok,true);
 const before=g.state.res.wood,homeId=b.id;
 assert.equal(g.city.switchTerritory('island').ok,true);
 assert.equal(g.state.regionId,'island');g.state.res.wood=23;
 assert.equal(g.city.switchTerritory('home').ok,true);
 assert.equal(g.state.res.wood,before);assert.ok(g.world.buildings.has(homeId));
 const saved=serialize(g);assert.ok(saved.length<500000);
 const restore=fixture();restore.loadState(migrateState(JSON.parse(saved)));
 assert.equal(restore.city.switchTerritory('island').ok,true);assert.equal(restore.state.res.wood,23);
});

test('expéditions : coût réel, trajet hors ligne et livraison unique',(t)=>{
 let now=1800000000000;t.mock.method(Date,'now',()=>now);
 const g=fixture();g.city.book.level=35;g.city.unlockTerritory('island');
 const before=g.state.res.wood,target=g.city.book.settlements.island.snapshot.res.wood;
 assert.equal(g.city.sendShipment('island','wood',20,'cart').ok,true);
 assert.equal(g.state.res.wood,before-20);
 assert.equal(g.city.sendShipment('island','wood',20,'train').ok,false);
 assert.equal(g.city.sendShipment('island','wood',20,'boat').ok,false);
 const restore=fixture();restore.loadState(migrateState(JSON.parse(serialize(g))));
 now+=180000;restore.city.regionalTick();restore.city.regionalTick();
 assert.equal(restore.city.book.settlements.island.snapshot.res.wood,target+20);
});

test('île : la mer entoure le territoire sans recouvrir le village de départ',()=>{
 const map=generateMap(123,'ile');
 assert.ok([T.DEEP,T.WATER].includes(map.terrain[0]));assert.ok([T.DEEP,T.WATER].includes(map.terrain[N-1]));
 assert.equal(map.terrain[55*SIZE+55],T.GRASS);
});


test('économie : les sorties réelles d’un atelier alimentent la tournée avant le stock',()=>{
 const g=fixture(),{a,b}=depotRoute(g);g.world.setRoad(53*SIZE+54,1);
 g.state.res.wood=100;g.state.res.planks=0;g.sim.recalc();g.sim.info.get(g.world.townhall().id).eff=0;
 assert.equal(g.city.createRoute(a.id,b.id,'cart').ok,true);
 const before=g.state.res.wood;g.sim.produce(1);
 assert.ok(g.city.buffer(a.id,'planks')>0);assert.equal(g.state.res.planks,0);assert.ok(g.state.res.wood<before);
 const waiting=g.city.buffer(a.id,'planks');g.city.localTick(50);
 assert.equal(g.state.res.planks,waiting);
});

test('économie : un tampon de livraison plein ne consomme plus les intrants',()=>{
 const g=fixture(),{a,b}=depotRoute(g);g.world.setRoad(53*SIZE+54,1);g.state.res.planks=0;g.sim.recalc();g.sim.info.get(g.world.townhall().id).eff=0;
 g.city.createRoute(a.id,b.id,'cart');g.city.bufferProduction(a,'planks',120);
 const wood=g.state.res.wood;g.sim.produce(1);assert.equal(g.state.res.wood,wood);assert.equal(g.city.buffer(a.id,'planks'),120);
});
