import test from 'node:test';
import assert from 'node:assert/strict';
import { botState, BOT_STORE, BOT_MAX_CATCHUP, botSummary, grantBotGift, tickBotVisit, saveBotCity, populateBot, tickBotWorkshops } from '../src/net/bot.js';
import { GameCore } from '../src/core/GameCore.js';
import { BUILDINGS, BUILDING_LIST } from '../src/data/buildings.js';
import { DAY_SECONDS, T, SIZE } from '../src/world/constants.js';
import { ATTRACTIONS } from '../src/data/tourism.js';
import { PROJECTS } from '../src/data/city.js';
const store=()=>{const items=new Map();return{getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,v),items};};
const core=st=>{const g=new GameCore({fires:false});g.loadState(st,{demo:true});populateBot(g.world);g.sim.recalc();return g;};
const NOW=1800000000000;

test('Bellerive is a finished level100 island with every building at maximum level and no automatic construction',()=>{
 const storage=store(),st=botState(NOW,storage),g=core(st),types=new Set(st.buildings.map(b=>b.type));
 assert.equal(st.mode,'carriere');assert.equal(st.level,100);assert.equal(st.preset,'ile');assert.equal(st.botCity.finished,true);
 for(const def of BUILDING_LIST)if(!def.plantsTerrain)assert.ok(types.has(def.id),`${def.id} is present`);
 for(const b of g.world.buildings.values()) {assert.equal(b.level,BUILDINGS[b.type].maxLevel);assert.equal(b.cons,undefined);assert.equal(b.fire,undefined);}
 for(const type in PROJECTS)assert.equal(g.city.completed(type),true,type);
 for(const type in ATTRACTIONS)assert.equal(st.city.tourism.attractions[type].phase,3,type);
 assert.ok(st.city.tourism.guests.length>0);assert.ok(st.city.tourism.receipts.every(r=>r.paid>0));
 const count=g.world.buildings.size;for(let i=0;i<60;i++)tickBotVisit(g,.25,NOW+i*1000);
 assert.equal(g.world.buildings.size,count);assert.equal([...g.world.buildings.values()].some(b=>b.cons),false);
 assert.ok(storage.items.has(BOT_STORE));assert.equal(storage.items.has('batisseur.save.0'),false);
});

test('every island building is connected, fully staffed, supplied with natural resources and productive',()=>{
 const st=botState(NOW,store()),g=core(st);
 for(const b of g.world.buildings.values()) {
   const def=BUILDINGS[b.type],info=g.sim.info.get(b.id);
   assert.ok(info.connected,`${b.type} has a connected road`);
   if(def.workers)assert.equal(info.staff,1,`${b.type} is staffed`);
   if(def.near)assert.ok(info.nearCount>0,`${b.type} has actual natural resources`);
 }
 assert.ok(g.sim.d.rates.food.prod>g.sim.d.rates.food.cons);
 assert.ok(g.sim.d.income.total>g.sim.d.upkeep);assert.ok(g.sim.d.happiness>.9);
 const original=st.res.coins;g.sim.advance(180);tickBotWorkshops(g,NOW+180000);
 assert.ok(st.res.coins>original);assert.ok(st.stats.produced.planks>0);assert.ok(st.stats.produced.tools>0);
 assert.equal(g.sim.d.starving,false);assert.equal(g.sim.d.staffing,1);
});

test('coast is surrounded by contiguous sea, canal reaches the ocean and footprints never overlap water or roads',()=>{
 const g=core(botState(NOW,store())),w=g.world;
 for(let n=0;n<SIZE;n++)for(const [x,z]of [[n,0],[n,SIZE-1],[0,n],[SIZE-1,n]])assert.equal(w.terrain[w.idx(x,z)],T.DEEP);
 for(let z=36;z<104;z++)assert.ok([T.WATER,T.DEEP].includes(w.terrain[w.idx(68,z)]));
 const seen=new Set();for(const b of w.buildings.values())for(const i of w.tilesOf(b)){assert.equal(seen.has(i),false,`overlap ${b.type}`);seen.add(i);assert.equal(w.road[i],0);assert.equal(w.terrain[i],T.GRASS);}
 assert.equal(g.state.botCity.districts.length,6);assert.ok(g.state.botCity.camera.distance<=72);
});

test('away economy is bounded and repeated loading cannot duplicate earnings or alter the finished island',()=>{
 const storage=store(),initial=botState(NOW,storage),later=botState(NOW+86400000,storage);
 assert.ok(later.stats.produced.planks>0);assert.ok(later.time.day-initial.time.day<=BOT_MAX_CATCHUP/DAY_SECONDS+1e-8);
 const repeated=botState(NOW+86400000,storage);assert.deepEqual(repeated.res,later.res);assert.equal(repeated.time.day,later.time.day);
 assert.equal(repeated.buildings.length,initial.buildings.length);assert.equal(botSummary(storage).level,100);
});

test('v6 replaces only the old bot showcase, preserving player saves and friendship gift records',()=>{
 const storage=store();storage.setItem('batisseur.save.0','player village');storage.setItem('batisseur.online.bot',JSON.stringify({sent:'2026-10-27',claimed:'2026-10-26'}));
 storage.setItem('batisseur.bot.city.v5',JSON.stringify({botCity:{version:1,giftsReceived:4}}));
 const st=botState(NOW,storage);assert.equal(st.botCity.giftsReceived,4);assert.equal(st.level,100);
 assert.equal(storage.getItem('batisseur.save.0'),'player village');assert.equal(JSON.parse(storage.getItem('batisseur.online.bot')).sent,'2026-10-27');
});

test('gifts replenish the real island stocks and survive visits without touching player slots',()=>{
 const storage=store(),st=botState(NOW,storage),before=st.res.wood;
 assert.equal(grantBotGift('wood',60,storage,NOW),true);assert.equal(JSON.parse(storage.getItem(BOT_STORE)).res.wood,before+60);
 assert.equal(grantBotGift('gems',10000,storage,NOW),false);
 const g=core(botState(NOW,storage)),coins=g.state.res.coins;
 for(let i=0;i<40;i++)tickBotVisit(g,.25,NOW+i*250);assert.ok(g.state.res.coins>coins);
 const food=g.state.res.food;assert.equal(grantBotGift('food',60,storage,NOW+10000,g),true);assert.equal(g.state.res.food,food+60);
 assert.equal(saveBotCity(g,storage,NOW+10000),true);assert.equal(JSON.parse(storage.getItem(BOT_STORE)).res.food,g.state.res.food);
 assert.equal(g.state.botCity.giftTotals.wood,60);assert.equal(storage.items.has('batisseur.save.0'),false);
});


test('finished island workshops reserve genuine inputs and finish all nine crafted goods with no duplicate credits',()=>{
 const storage=store();let st=botState(NOW,storage);
 assert.ok(Object.values(st.city.workshops.byBuilding).some(e=>e.queue.length));
 for(let step=1;step<=4;step++)st=botState(NOW+step*240000,storage);
 for(const good of ['wool','fabric','clothing','pastries','furniture','cheese','jam','ceramics','machinery'])assert.ok(st.stats.produced[good]>0,`${good} produced by a real workshop`);
 const repeated=botState(NOW+4*240000,storage);assert.deepEqual(repeated.res,st.res);
 assert.ok(st.res.food>0);assert.ok(st.res.coins>0);
});
