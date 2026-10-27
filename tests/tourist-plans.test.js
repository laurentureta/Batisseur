import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCore } from '../src/core/GameCore.js';
import { createNewState,migrateState } from '../src/core/state.js';
import { serialize } from '../src/core/save.js';
import { SIZE } from '../src/world/constants.js';
import { buildTouristNetwork,makeTouristPlan,touristPosition,touristPlanValid,MAX_VISIBLE_TOURISTS } from '../src/render/touristPlans.js';
function fixture(){
 const g=new GameCore({sites:false});g.loadState(createNewState({seed:1234,mode:'carriere'}));g.state.level=35;g.save=()=>true;
 const add=(type,x,z,phase=false)=>{const b={id:g.state.nextId++,type,x,z,rot:0,level:phase?4:1};g.world.addBuilding(b);g.sim.info.set(b.id,{connected:true,eff:1});if(phase)g.tourism.data.attractions[type]={phase:3,readyAt:0};return b;};
 const gate=add('park_gate',30,37,true),wheel=add('park_wheel',40,37,true),carousel=add('park_carousel',46,38,true),station=add('station',25,38),cafe=add('v5_shop_cafe_bocage',35,39),restaurant=add('v5_shop_restaurant_bocage',50,39);
 for(let x=25;x<=55;x++)g.world.setRoad(40*SIZE+x,2);
 return {g,gate,wheel,carousel,station,cafe,restaurant,add};
}

test('touristes : parcours gare → entrée → attractions/restauration → départ sur de vraies routes',()=>{
 const {g,station,cafe,restaurant}=fixture(),network=g.tourism.network(),plan=makeTouristPlan(network,1,100000,12);
 assert.equal(network.usable,true);assert.equal(plan.origin,station.id);assert.equal(plan.fromTrain,true);
 const visits=plan.legs.filter(l=>l.kind==='visit');assert.equal(visits.length,4);
 assert.ok(visits.some(l=>l.venue===cafe.id||l.venue===restaurant.id));
 assert.ok(visits.some(l=>l.type==='park_wheel'));assert.ok(visits.some(l=>l.type==='park_carousel'));
 assert.equal(visits.reduce((sum,l)=>sum+l.amount,0),12);
 for(const leg of plan.legs.filter(l=>l.kind==='walk'))for(let i=1;i<leg.path.length;i++){
  const a=leg.path[i-1],b=leg.path[i];assert.ok(g.world.road[a]&&g.world.road[b]);assert.equal(Math.abs(a%SIZE-b%SIZE)+Math.abs(Math.floor(a/SIZE)-Math.floor(b/SIZE)),1);
 }
 for(let now=plan.arrivedAt;now<plan.leavesAt;now+=500){const p=touristPosition(plan,now);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z));assert.ok(g.world.road[Math.floor(p.z+SIZE/2)*SIZE+Math.floor(p.x+SIZE/2)]);}
 assert.equal(touristPosition(plan,plan.leavesAt),null);
 g.world.setRoad(40*SIZE+37,0);assert.equal(touristPlanValid(plan,g.world,100000),false);
 const cut=buildTouristNetwork(g.world,g.sim.info,g.tourism.data.attractions);assert.equal(cut.attractions.length,0);assert.equal(cut.restaurants.length,1);
});

test('tourisme : budget influencé par cafés, beauté et accès en gare sans deuxième revenu visuel',t=>{
 let now=1800000000000;t.mock.method(Date,'now',()=>now);const {g,add}=fixture(),m=g.tourism;
 const beforeBeauty=m.rates();add('v5_decor_flowers_bocage',41,35);const afterBeauty=m.rates();assert.ok(afterBeauty.revenue>beforeBeauty.revenue);assert.equal(afterBeauty.visitors,beforeBeauty.visitors);assert.equal(afterBeauty.arrivalFactor,1.15);
 m.advance(now);const coins=g.state.res.coins,rate=m.rates();now+=60000;m.advance(now);
 const income=g.state.res.coins-coins;assert.ok(Math.abs(income-rate.revenue/60)<1e-8);
 assert.equal(m.data.admissions,Math.floor(rate.visitors/60));assert.ok(m.data.guests.length>0&&m.data.guests.length<=MAX_VISIBLE_TOURISTS);
 assert.ok(m.data.receipts.every(r=>r.paid>0));
 const paid=m.data.receipts.reduce((sum,r)=>sum+r.paid,0)+m.data.arrivalBudget;assert.ok(Math.abs(paid-income)<1e-8);
 const guestIds=m.data.guests.map(g=>g.id);m.advance(now);assert.deepEqual(m.data.guests.map(g=>g.id),guestIds);assert.equal(g.state.res.coins-coins,income);
 m.settleGuests(now+600000);const spent=m.data.spentRevenue;assert.ok(spent>0);assert.equal(g.state.res.coins-coins,income,'redeeming a prepaid venue voucher cannot grant more coins');
 m.settleGuests(now+600000);assert.equal(m.data.spentRevenue,spent);assert.ok(Object.keys(m.data.spentByVenue).length>=3);
});

test('touristes : sauvegarde, absence bornée, comptes uniques et interruption après modification des routes',t=>{
 let now=1800000000000;t.mock.method(Date,'now',()=>now);const {g}=fixture(),m=g.tourism;m.advance(now);now+=60000;m.advance(now);
 const save=migrateState(JSON.parse(serialize(g)));assert.deepEqual(save.city.tourism.guests,m.data.guests);
 const coins=g.state.res.coins;g.world.setRoad(40*SIZE+37,0);m.settleGuests(now);assert.equal(m.data.guests.length,0);assert.ok(m.data.receipts.some(r=>r.status==='interrupted'));assert.equal(g.state.res.coins,coins);
 now+=24*3600000;m.advance(now);const count=m.data.admissions,revenue=m.data.revenue,after=g.state.res.coins;m.advance(now);assert.equal(m.data.admissions,count);assert.equal(m.data.revenue,revenue);assert.equal(g.state.res.coins,after);assert.ok(m.data.receipts.length<=64);assert.ok(m.data.guests.length<=MAX_VISIBLE_TOURISTS);
 const legacy=m.data;delete legacy.guests;delete legacy.admissions;legacy.visitors=12.5;legacy.revenue=100;const migrated=m.data;assert.equal(migrated.admissions,12);assert.equal(migrated.nextGuest,13);assert.equal(migrated.arrivalFraction,.5);assert.equal(g.state.res.coins,after);
});

test('tourisme : reprise réelle sans recrédit et économie du bot explicitement isolée des visites ordinaires',t=>{
 let now=1800000000000;t.mock.method(Date,'now',()=>now);const {g}=fixture();g.tourism.advance(now);now+=60000;g.tourism.advance(now);
 const saved=migrateState(JSON.parse(serialize(g))),coins=saved.res.coins,ids=saved.city.tourism.guests.map(v=>v.id);
 const resumed=new GameCore({sites:false});resumed.loadState(saved);resumed.tourism.advance(now);
 assert.equal(resumed.state.res.coins,coins);assert.deepEqual(resumed.tourism.data.guests.map(v=>v.id),ids);
 resumed.tourism.settleGuests(now+600000);assert.equal(resumed.state.res.coins,coins);
 g.isDemo=true;g.visit={home:0};const before=g.state.res.coins;
 now+=60000;g.tourism.advance(now);g.tourism.advance(now,{bot:true});assert.equal(g.state.res.coins,before,'ordinary read-only visits cannot turn on tourism');
 g.state.botCity={finished:true};g.tourism.advance(now,{bot:true});assert.ok(g.state.res.coins>before);assert.equal(g.tourism.donate('wood',1).ok,false);
});
