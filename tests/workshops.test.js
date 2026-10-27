import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCore } from '../src/core/GameCore.js';
import { createNewState,migrateState } from '../src/core/state.js';
import { serialize } from '../src/core/save.js';
import { Workshop } from '../src/sim/Workshop.js';
import { RECIPES,CRAFTED_GOODS,WORKSHOP_QUEUE_LIMIT,recipesForDefinition } from '../src/data/recipes.js';
import { RESOURCES } from '../src/data/resources.js';
import { BUILDING_LIST } from '../src/data/buildings.js';
import { SIZE,T } from '../src/world/constants.js';
function fixture(){
 const g=new GameCore({}),st=createNewState({seed:1234});st.level=40;st.zones.fill(true);
 for(const r in st.res)st.res[r]=CRAFTED_GOODS.includes(r)?0:100;
 st.res.coins=5000;
 g.loadState(st);g.playing=true;g.workshop=new Workshop(g);g.workshop.reset();
 for(let z=50;z<60;z++)for(let x=50;x<60;x++)g.world.setTerrain(z*SIZE+x,T.GRASS);
 const b={id:st.nextId++,type:'bakery',x:52,z:54,level:1,rot:0};g.world.addBuilding(b);g.world.setRoad(54*SIZE+53,1);g.sim.recalc();
 g.save=()=>{g.saved=serialize(g);return true;};return {g,b,road:54*SIZE+53};
}
function clock(t){let now=1800000000000;t.mock.method(Date,'now',()=>now);return {get now(){return now;},add(ms){now+=ms;return now;}};}
test('fabrications : neuf produits utilisables et recettes reliées à de vrais bâtiments',()=>{
 assert.equal(CRAFTED_GOODS.length,9);
 for(const r of CRAFTED_GOODS){assert.ok(RESOURCES[r]);assert.ok(RECIPES.some(recipe=>recipe.outputs[r]>0));}
 for(const r of RECIPES){assert.ok(BUILDING_LIST.some(d=>recipesForDefinition(d).includes(r)),r.id);assert.ok(r.seconds>0&&r.seconds<=180);for(const c of[r.inputs,r.outputs])for(const[k,n]of Object.entries(c)){assert.ok(RESOURCES[k]);assert.ok(n>0);}}
});
test('fabrications : intrants réservés une seule fois et production habituelle suspendue',(t)=>{
 clock(t);const{g,b}=fixture(),flour=g.state.res.flour,food=g.state.res.food;
 assert.equal(g.workshop.enqueue(b.id,'pastries').ok,true);
 assert.equal(g.state.res.flour,flour-8);assert.equal(g.state.res.food,food-5);
 const reserved=g.state.res.flour;g.sim.recalc();g.sim.produce(.1);
 assert.equal(g.state.res.flour,reserved);assert.equal(g.state.res.pastries,0);
 assert.equal(g.sim.info.get(b.id).status,'crafting');
 assert.equal(g.workshop.enqueue(b.id,'machinery').ok,false);
 assert.equal(g.workshop.queue(b.id).length,1);
});
test('fabrications : FIFO en temps réel, fermeture et rechargement sans double crédit',(t)=>{
 const c=clock(t),{g,b}=fixture();g.workshop.enqueue(b.id,'pastries');g.workshop.enqueue(b.id,'country_bread');
 const food=g.state.res.food;c.add(135000);
 const saved=migrateState(JSON.parse(serialize(g)));g.loadState(saved);g.workshop.reset();
 const result=g.workshop.tick();assert.equal(result.completed,2);assert.equal(g.state.res.pastries,6);assert.equal(g.state.res.food,food+25);
 assert.equal(g.workshop.queue(b.id).length,0);g.workshop.tick();assert.equal(g.state.res.pastries,6);
 const again=migrateState(JSON.parse(serialize(g)));g.loadState(again);g.workshop.tick();assert.equal(g.state.res.pastries,6);
});
test('fabrications : stockage saturé conserve le lot et retarde le suivant',(t)=>{
 const c=clock(t),{g,b}=fixture();g.workshop.enqueue(b.id,'pastries');g.workshop.enqueue(b.id,'country_bread');
 g.state.res.pastries=g.sim.d.storage;const food=g.state.res.food;c.add(200000);g.workshop.tick();
 assert.equal(g.workshop.queue(b.id).length,2);assert.equal(g.workshop.queue(b.id)[0].blocked,true);assert.equal(g.state.res.food,food);
 g.state.res.pastries-=10;c.add(1000);g.workshop.tick();assert.equal(g.state.res.pastries,g.sim.d.storage-4);
 assert.equal(g.workshop.queue(b.id).length,1);assert.equal(g.workshop.queue(b.id)[0].readyAt,c.now+45000);
 c.add(45000);g.workshop.tick();assert.equal(g.state.res.food,food+25);
});
test('fabrications : route coupée suspend le délai, annuler rembourse sans avancer le suivant',(t)=>{
 const c=clock(t),{g,b,road}=fixture(),flour=g.state.res.flour;
 const a=g.workshop.enqueue(b.id,'pastries').job;g.workshop.enqueue(b.id,'country_bread');
 c.add(30000);g.workshop.tick();g.world.setRoad(road,0);g.sim.recalc();g.workshop.tick();
 assert.equal(g.workshop.queue(b.id)[0].remaining,60000);
 c.add(3600000);g.workshop.tick();assert.equal(g.state.res.pastries,0);
 g.world.setRoad(road,1);g.sim.recalc();g.workshop.tick();assert.equal(g.workshop.queue(b.id)[0].readyAt,c.now+60000);
 assert.equal(g.workshop.cancel(b.id,a.id).ok,true);assert.equal(g.state.res.flour,flour-8);
 assert.equal(g.workshop.queue(b.id)[0].readyAt,c.now+45000);c.add(45000);g.workshop.tick();assert.equal(g.state.res.pastries,0);
});
test('fabrications : échecs de sauvegarde annulent réservation et crédit, puis reprise unique',(t)=>{
 const c=clock(t),{g,b}=fixture(),flour=g.state.res.flour,goodSave=g.save;
 g.save=()=>false;assert.equal(g.workshop.enqueue(b.id,'pastries').ok,false);assert.equal(g.state.res.flour,flour);assert.equal(g.workshop.queue(b.id).length,0);
 g.save=goodSave;g.workshop.enqueue(b.id,'pastries');c.add(90000);g.save=()=>false;
 assert.equal(g.workshop.tick().failed,true);assert.equal(g.state.res.pastries,0);assert.equal(g.workshop.queue(b.id).length,1);
 g.save=goodSave;g.workshop.tick();g.workshop.tick();assert.equal(g.state.res.pastries,6);assert.equal(g.state.stats.produced.pastries,6);
});
test('fabrications : démolition rembourse les lots réservés et ne crée pas de production',(t)=>{
 clock(t);const{g,b}=fixture(),before={...g.state.res};g.workshop.enqueue(b.id,'pastries');g.workshop.enqueue(b.id,'country_bread');
 g.world.removeBuilding(b.id);const r=g.workshop.tick();assert.equal(r.refunded,2);assert.deepEqual(g.state.res,before);assert.equal(g.workshop.queue(b.id).length,0);
});
test('fabrications : file bornée, ventes exactes et visites en lecture seule',(t)=>{
 const c=clock(t),{g,b}=fixture();
 for(let i=0;i<WORKSHOP_QUEUE_LIMIT;i++)assert.equal(g.workshop.enqueue(b.id,'pastries').ok,true);
 const before={...g.state.res};assert.equal(g.workshop.enqueue(b.id,'pastries').ok,false);assert.deepEqual(g.state.res,before);
 c.add(100000000);assert.equal(g.workshop.tick().completed,6);assert.equal(g.state.res.pastries,36);
 const coins=g.state.res.coins;assert.equal(g.workshop.sell('pastries',5).ok,true);assert.equal(g.state.res.coins,coins+60);assert.equal(g.state.res.pastries,31);
 assert.equal(g.workshop.sell('pastries',100).ok,false);g.visit={};assert.equal(g.workshop.sell('pastries',1).ok,false);assert.equal(g.workshop.enqueue(b.id,'pastries').ok,false);
});
test('fabrications : des villes différentes ne mélangent ni files ni marchandises',(t)=>{
 const c=clock(t),a=fixture(),b=fixture();a.g.workshop.enqueue(a.b.id,'country_bread');b.g.workshop.enqueue(b.b.id,'pastries');
 const snapshot=JSON.parse(serialize(b.g));a.g.state.regionBook={settlements:{island:{snapshot}}};const food=a.g.state.res.food;
 c.add(90000);a.g.workshop.tick();assert.equal(a.g.state.res.food,food+25);assert.equal(a.g.state.res.pastries,0);assert.equal(snapshot.res.pastries,6);
 a.g.workshop.tick();assert.equal(snapshot.res.pastries,6);
});
