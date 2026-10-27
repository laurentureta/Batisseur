import test from 'node:test';
import assert from 'node:assert/strict';
import { botState, BOT_STORE, BOT_MAX_CATCHUP, botSummary, grantBotGift, tickBotVisit, saveBotCity } from '../src/net/bot.js';
import { GameCore } from '../src/core/GameCore.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { DAY_SECONDS } from '../src/world/constants.js';
const store=()=>{const items=new Map();return{getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,v),items};};
const core=st=>{const g=new GameCore({fires:false});g.loadState(st,{demo:true});return g;};
const NOW=1800000000000;

test('Capucine has a staffed career economy, road-connected services and actual production chains',()=>{
 const storage=store(),st=botState(NOW,storage),g=core(st);
 assert.equal(st.mode,'carriere');assert.ok(st.buildings.length>=120);
 for(const b of g.world.buildings.values()) {
   const def=BUILDINGS[b.type],info=g.sim.info.get(b.id);
   assert.ok(info.connected,`${b.type} has a connected road`);
   if(def.workers) assert.equal(info.staff,1,`${b.type} is staffed`);
   if(def.near) assert.ok(info.nearCount>0,`${b.type} has actual natural resources`);
 }
 assert.ok(g.sim.d.rates.food.prod>g.sim.d.rates.food.cons);
 assert.ok(g.sim.d.income.total>g.sim.d.upkeep);
 assert.ok(g.villagers.byJob.size>20);
 const planks=st.res.planks;
 g.sim.advance(30);
 assert.ok(st.res.planks>planks);assert.ok(st.stats.produced.planks>0);
 assert.ok(storage.items.has(BOT_STORE));assert.equal(storage.items.has('batisseur.save.0'),false);
});

test('away production is bounded and repeated loading at the same date cannot duplicate earnings',()=>{
 const storage=store(),initial=botState(NOW,storage);
 const later=botState(NOW+86400000,storage);
 assert.ok(later.stats.produced.planks>0);
 assert.ok(later.time.day-initial.time.day<=BOT_MAX_CATCHUP/DAY_SECONDS+1e-8);
 const repeated=botState(NOW+86400000,storage);
 assert.deepEqual(repeated.res,later.res);
 assert.equal(repeated.time.day,later.time.day);
 assert.deepEqual(botSummary(storage).pop,later.summary.pop);
});

test('Capucine pays for a real construction, inaugurates it once and remembers the new district',()=>{
 const storage=store();botState(NOW,storage);
 const started=botState(NOW+60000,storage),site=started.buildings.find(b=>b.cons);
 assert.ok(site);assert.equal(site.cons.k,'new');assert.equal(site.residents,0);
 const before=started.buildings.length;
 const finished=botState(NOW+95000,storage);
 assert.equal(finished.buildings.length,before);assert.equal(finished.buildings.find(b=>b.id===site.id).cons,undefined);
 assert.equal(finished.botCity.developments,1);
 assert.equal(botState(NOW+95000,storage).botCity.developments,1);
});

test('gifts actually replenish the bot city and invalid gifts cannot change its economy',()=>{
 const storage=store(),st=botState(NOW,storage),before=st.res.wood;
 assert.equal(grantBotGift('wood',60,storage,NOW),true);
 assert.equal(JSON.parse(storage.getItem(BOT_STORE)).res.wood,before+60);
 assert.equal(grantBotGift('gems',10000,storage,NOW),false);
 assert.equal(JSON.parse(storage.getItem(BOT_STORE)).res.wood,before+60);
});

test('live visits use the economy and save outside the player slots, including live gifts',()=>{
 const storage=store(),g=core(botState(NOW,storage)),coins=g.state.res.coins;
 for(let i=0;i<40;i++)tickBotVisit(g,0.25,NOW+i*250);
 assert.ok(g.state.res.coins>coins);
 const food=g.state.res.food;
 assert.equal(grantBotGift('food',60,storage,NOW+10000,g),true);
 assert.equal(g.state.res.food,food+60);
 assert.equal(saveBotCity(g,storage,NOW+10000),true);
 assert.equal(JSON.parse(storage.getItem(BOT_STORE)).res.food,g.state.res.food);
 assert.equal(storage.items.has('batisseur.save.0'),false);
});
