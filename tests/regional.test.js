import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCore } from '../src/core/GameCore.js';
import { BASE_STORAGE, TOWNHALL_STORAGE } from '../src/world/constants.js';
// même raison qu'ailleurs : la capacité se calcule, elle ne se recopie pas
const BASE = BASE_STORAGE + TOWNHALL_STORAGE;
import { CityDevelopment } from '../src/sim/CityDevelopment.js';
import { createNewState } from '../src/core/state.js';
import { serialize } from '../src/core/save.js';
import { advanceRegionalState, REGIONAL_MAX_MS, REGIONAL_DAY_MS } from '../src/sim/RegionalEconomy.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { EXPEDITIONS } from '../src/data/city.js';
import { SIZE, T } from '../src/world/constants.js';

const NOW = 1800000000000;
function fixture() {
  const game = new GameCore({ sites: false });
  const state = createNewState({seed:1234});
  state.level=35;state.regionalClockAt=NOW;state.res.coins=10000;state.res.food=500;
  game.loadState(state);game.playing=true;game.startState=s=>game.loadState(s);
  game.save=()=>true;
  return game;
}
function add(g,type,x,z,level=1) {
  const b={id:g.state.nextId++,type,x,z,rot:0,level};
  if(BUILDINGS[type].residents)b.residents=4;
  g.world.addBuilding(b);return b;
}
function connectedWorkshop(g,type='sawmill') {
  const b=add(g,type,50,50);
  for(let x=50;x<=54;x++)g.world.setRoad(52*SIZE+x,1);
  g.world.setRoad(53*SIZE+54,1);
  g.world.setRoad(51*SIZE+50,1);
  g.sim.recalc();return b;
}
function saved(g) {const state=JSON.parse(serialize(g));state.regionalClockAt=NOW;return state;}
const advance=(state,now)=>advanceRegionalState(state,state.regionId||'home',now,g=>new CityDevelopment(g));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('veille : ateliers réels, intrants débités, routes requises, horloge non rejouable',()=>{
  const g=fixture();connectedWorkshop(g);g.state.res.wood=100;g.state.res.planks=0;
  const state=saved(g),before=state.res.wood;
  const report=advance(state,NOW+REGIONAL_DAY_MS);
  assert.ok(state.res.planks>0);close(before-state.res.wood,state.res.planks);
  assert.equal(report.elapsed,REGIONAL_DAY_MS);
  const after=JSON.stringify(state);
  assert.equal(advance(state,NOW+REGIONAL_DAY_MS),null);assert.equal(JSON.stringify(state),after);
  assert.equal(advance(state,NOW),null);assert.equal(JSON.stringify(state),after);
  const cut=saved(g);cut.map.road=btoa(String.fromCharCode(...new Uint8Array(SIZE*SIZE)));
  advance(cut,NOW+REGIONAL_DAY_MS);assert.equal(cut.res.planks,0);assert.equal(cut.res.wood,100);
});

test('veille : plafond de huit heures, stockage plein et absence d’intrants',()=>{
  const g=fixture();connectedWorkshop(g);g.state.res.wood=100;g.state.res.planks=0;
  const long=saved(g),bounded=structuredClone(long);
  assert.equal(advance(long,NOW+100*REGIONAL_DAY_MS).capped,true);
  advance(bounded,NOW+REGIONAL_MAX_MS);
  close(long.res.planks,bounded.res.planks);close(long.res.wood,bounded.res.wood);
  close(long.time.day,bounded.time.day);
  const full=saved(g);full.res.planks=BASE;advance(full,NOW+REGIONAL_DAY_MS);
  assert.equal(full.res.planks,BASE);assert.equal(full.res.wood,100);
  const empty=saved(g);empty.res.wood=0;advance(empty,NOW+REGIONAL_DAY_MS);
  assert.equal(empty.res.planks,0);assert.equal(empty.res.wood,0);
});

test('veille : pause conservée, population stable et commit atomique',()=>{
  const g=fixture();connectedWorkshop(g);add(g,'house',51,51);g.state.time.speed=0;
  const state=saved(g),before={...state.res};
  state.regionalReport={transport:['cart','train']};
  advance(state,NOW+REGIONAL_DAY_MS);assert.deepEqual(state.res,before);
  assert.equal(state.time.speed,0);assert.deepEqual(state.regionalReport.transport,['cart','train']);
  state.time.speed=1;const copy=JSON.stringify(state);
  assert.throws(()=>advanceRegionalState(state,'home',NOW+2*REGIONAL_DAY_MS,()=>{throw Error('fixture failure');}));
  assert.equal(JSON.stringify(state),copy);
  const residents=state.buildings.find(b=>b.type==='house').residents;
  advance(state,NOW+2*REGIONAL_DAY_MS);
  assert.equal(state.buildings.find(b=>b.type==='house').residents,residents);
});

test('veille : les bûcherons abattent des arbres persistés, sans bois gratuit',()=>{
  const g=fixture(),b=connectedWorkshop(g,'lumber');
  for(let z=48;z<=51;z++)for(let x=48;x<=53;x++)if(g.world.occ[z*SIZE+x]<0&&!g.world.road[z*SIZE+x])g.world.terrain[z*SIZE+x]=T.FOREST;
  g.world.terrainVersion++;g.world.trees.rebuild();g.state.res.wood=0;
  const state=saved(g);advance(state,NOW+REGIONAL_DAY_MS/4);
  assert.ok(state.res.wood>0);assert.ok(state.trees.length>0);
  const barren=saved(g);barren.res.wood=0;barren.map.terrain=btoa(String.fromCharCode(...new Uint8Array(SIZE*SIZE).fill(T.GRASS)));
  advance(barren,NOW+REGIONAL_DAY_MS);assert.equal(barren.res.wood,0);
});

test('veille : les tournées réelles créditent le stock à la livraison',()=>{
  const g=fixture(),a=connectedWorkshop(g),depot=add(g,'depot',56,50);
  for(let x=54;x<=57;x++)g.world.setRoad(52*SIZE+x,1);
  g.state.res.wood=100;g.state.res.planks=0;g.sim.recalc();
  assert.equal(g.city.createRoute(a.id,depot.id,'cart').ok,true);
  const state=saved(g);advance(state,NOW+REGIONAL_DAY_MS);
  assert.ok(state.res.planks>0);assert.ok(state.city.delivered>0);
  const resources=state.res.planks+(state.city.buffers[a.id]?.planks||0)+state.city.deliveries.reduce((n,j)=>n+j.qty,0);
  close(100-state.res.wood,resources);
});

test('liaisons régulières : vrais stocks, reprise unique et destinations persistantes',(t)=>{
  let now=NOW;t.mock.method(Date,'now',()=>now);
  const g=fixture();g.city.book.level=35;g.state.res.wood=500;g.city.unlockTerritory('island');
  const initial=g.state.res.wood,target=g.city.book.settlements.island.snapshot.res.wood;
  assert.equal(g.city.createTradeRoute('island','wood',20,'cart',5).ok,false);
  assert.equal(g.city.createTradeRoute('island','wood',20,'cart',15).ok,true);
  assert.equal(g.city.createTradeRoute('island','wood',20,'cart',15).ok,false);
  g.city.regionalTick();assert.equal(g.state.res.wood,initial-20);assert.equal(g.city.book.shipments.length,1);
  g.city.regionalTick();assert.equal(g.city.book.shipments.length,1);
  now+=180000;g.city.regionalTick();assert.equal(g.city.book.settlements.island.snapshot.res.wood,target+20);
  now+=2*86400000;g.city.regionalTick();
  assert.equal(g.city.book.tradeRoutes[0].sent,2); // pas de centaines de départs rétroactifs
  assert.equal(g.state.res.wood,initial-40);
  const restored=fixture();restored.loadState(JSON.parse(serialize(g)));restored.city.regionalTick();
  assert.equal(restored.city.book.tradeRoutes[0].sent,2);
  const route=restored.city.book.tradeRoutes[0];
  restored.city.toggleTradeRoute(route.id);now+=3600000;restored.city.regionalTick();assert.equal(route.sent,2);
  restored.city.removeTradeRoute(route.id);assert.equal(restored.city.book.tradeRoutes.length,0);
  assert.ok(restored.city.book.shipments.some(s=>s.id===2));
});

test('liaisons régulières : stocks épuisés suspendent le départ sans débit ni convoi',(t)=>{
  let now=NOW;t.mock.method(Date,'now',()=>now);
  const g=fixture();g.city.book.level=35;g.state.res.wood=500;g.city.unlockTerritory('island');
  assert.equal(g.city.createTradeRoute('island','wood',20,'cart',15).ok,true);
  g.state.res.wood=3;const coins=g.state.res.coins;g.city.regionalTick();
  assert.equal(g.city.book.shipments.length,0);assert.equal(g.state.res.wood,3);assert.equal(g.state.res.coins,coins);
  assert.match(g.city.book.tradeRoutes[0].status,/manque/);
  g.state.res.wood=30;now+=60000;g.city.regionalTick();assert.equal(g.city.book.shipments.length,1);assert.equal(g.state.res.wood,10);
});

test('contrats : coût unique, vrais prérequis et récompense non répétable',(t)=>{
  let now=NOW;t.mock.method(Date,'now',()=>now);
  const g=fixture();g.state.res.wood=500;g.state.res.stone=500;g.state.res.food=500;
  assert.equal(g.city.startExpedition('metropolis').ok,false);
  assert.equal(g.city.startExpedition('archipelago').ok,false);
  const before=g.state.res.coins;assert.equal(g.city.startExpedition('countryside').ok,true);
  const e=g.city.book.expeditions[0];assert.equal(g.state.res.coins,before-25);
  assert.equal(g.city.startExpedition('countryside').ok,false);assert.equal(g.city.claimExpedition(e.id).ok,false);
  now=e.readyAt;assert.equal(g.city.claimExpedition(e.id).ok,true);
  assert.equal(g.state.res.coins,before-25+EXPEDITIONS.countryside.reward.coins);
  const earned=g.state.res.coins;assert.equal(g.city.claimExpedition(e.id).ok,false);assert.equal(g.state.res.coins,earned);
});

test('liaisons régulières : une ville inactive paie son propre convoi',(t)=>{
  let now=NOW;t.mock.method(Date,'now',()=>now);
  const g=fixture();g.city.book.level=35;g.state.res.wood=500;g.city.unlockTerritory('island');
  g.city.switchTerritory('island');g.state.res.wood=100;g.state.res.coins=1000;
  assert.equal(g.city.createTradeRoute('home','wood',20,'cart',15).ok,true);
  g.city.switchTerritory('home');
  assert.equal(g.city.book.settlements.island.snapshot.res.wood,80);
  const homeStock=g.state.res.wood;
  now+=15*60000;g.city.regionalTick();
  assert.equal(g.city.book.settlements.island.snapshot.res.wood,60);
  assert.equal(g.state.res.wood,homeStock+20);
  assert.equal(g.city.book.tradeRoutes[0].sent,2);
});

test('contrats : récompenses et XP retrouvent le village d’origine après un voyage',(t)=>{
  let now=NOW;t.mock.method(Date,'now',()=>now);
  const g=fixture();g.city.book.level=35;g.state.res.wood=500;g.state.res.stone=500;g.state.res.food=500;
  g.city.unlockTerritory('island');g.city.startExpedition('countryside');
  const e=g.city.book.expeditions[0],coins=g.state.res.coins,xp=g.state.xp;
  g.city.switchTerritory('island');const islandCoins=g.state.res.coins;
  now=e.readyAt;assert.equal(g.city.claimExpedition(e.id).ok,true);
  assert.equal(g.state.res.coins,islandCoins);
  assert.equal(g.city.book.settlements.home.snapshot.res.coins,coins+240);
  assert.equal(g.city.book.settlements.home.snapshot.city.pendingExpeditionXP,80);
  assert.equal(g.city.claimExpedition(e.id).ok,false);
  g.city.switchTerritory('home');g.city.tick(1);
  assert.equal(g.state.xp,xp+80);g.city.tick(1);assert.equal(g.state.xp,xp+80);
});
