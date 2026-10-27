import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCore } from '../src/core/GameCore.js';
import { createNewState, migrateState } from '../src/core/state.js';
import { serialize } from '../src/core/save.js';
import { Meta } from '../src/core/meta.js';
import { Tourism,MAX_TOURISM_ABSENCE } from '../src/sim/Tourism.js';
import { ATTRACTIONS,festivalCalendar } from '../src/data/tourism.js';
import { GeoBuilder } from '../src/render/geom.js';
import { buildTourismModel } from '../src/render/tourismModels.js';
function fixture(){const g=new GameCore({sites:false});g.loadState(createNewState({seed:1234,mode:'carriere'}));g.state.level=35;for(const k in g.state.res)g.state.res[k]=100000;g.save=()=>true;g.tourism ||=new Tourism(g);g.tourism.reset();return g;}
function add(g,type,x=50,z=50){const b={id:g.state.nextId++,type,x,z,rot:0,level:1};g.world.addBuilding(b);g.sim.info.set(b.id,{connected:true});return b;}
function complete(g,type){const b=add(g,type);b.level=4;g.tourism.data.attractions[type]={phase:3,readyAt:0};return b;}

test('parc : paiement unique, temps réel, étapes et entrée obligatoire',t=>{
 let now=1800000000000;t.mock.method(Date,'now',()=>now);const g=fixture(),m=g.tourism;add(g,'park_gate');add(g,'park_wheel');
 assert.equal(m.start('park_wheel').ok,false);const before=g.state.res.coins;
 assert.equal(m.start('park_gate').ok,true);assert.equal(g.state.res.coins,before-300);assert.equal(m.start('park_gate').ok,false);assert.equal(m.finish('park_gate').ok,false);
 for(let phase=0;phase<3;phase++){if(phase)assert.equal(m.start('park_gate').ok,true);now+=ATTRACTIONS.park_gate.phases[phase].seconds*1000;assert.equal(m.finish('park_gate').ok,true);}
 assert.equal(m.completed('park_gate'),true);assert.equal(m.building('park_gate').level,4);assert.equal(m.start('park_wheel').ok,true);
 const saved=migrateState(JSON.parse(serialize(g)));assert.equal(saved.city.tourism.attractions.park_gate.phase,3);assert.ok(saved.city.tourism.attractions.park_wheel.readyAt>now);
});

test('tourisme : revenus réels bornés, routes obligatoires et absence sans double crédit',t=>{
 let now=1800000000000;t.mock.method(Date,'now',()=>now);const g=fixture(),m=g.tourism;const gate=complete(g,'park_gate');complete(g,'park_wheel');m.advance(now);
 const before=g.state.res.coins;now+=3600000;m.advance(now);assert.equal(m.data.visitors,58);assert.equal(g.state.res.coins-before,216);
 m.advance(now);assert.equal(m.data.visitors,58);now+=MAX_TOURISM_ABSENCE*3;m.advance(now);assert.equal(m.data.visitors,58*9);
 g.sim.info.get(gate.id).connected=false;const v=m.data.visitors;now+=3600000;m.advance(now);assert.equal(m.data.visitors,v);
 g.sim.info.get(gate.id).connected=true;now+=3600000;m.advance(now);assert.equal(m.data.visitors,v,'reconnection must not retroactively attract visitors');
 now+=3600000;m.advance(now);assert.equal(m.data.visitors,v+58);
});

test('nouvelle attraction : pas de revenu rétroactif et paliers uniques',t=>{
 let now=1800000000000;t.mock.method(Date,'now',()=>now);const g=fixture(),m=g.tourism;complete(g,'park_gate');m.advance(now);now+=3600000;complete(g,'park_wheel');m.advance(now);assert.equal(m.data.visitors,8);
 m.data.visitors=100;const before=g.state.res.coins;assert.equal(m.claimMilestone(0).ok,true);assert.equal(g.state.res.coins,before+500);assert.equal(m.claimMilestone(0).ok,false);assert.equal(m.claimMilestone(1).ok,false);
});

test('fête : vraies ressources, plafonnement, récompenses et trophée de saison conservé',t=>{
 let now=Date.UTC(2026,9,26,12);t.mock.method(Date,'now',()=>now);const g=fixture(),m=g.tourism;complete(g,'park_gate');const before=g.state.res.tools;
 assert.equal(m.donate('coins',1).ok,false);assert.equal(m.donate('tools',101).ok,false);assert.equal(m.donate('tools',100).ok,true);assert.equal(m.donate('tools',100).ok,true);
 assert.equal(g.state.res.tools,before-140);assert.equal(m.data.festival.points,700);assert.equal(m.donate('wood',1).ok,false);
 const base=m.rates().visitors;for(let i=0;i<3;i++){assert.equal(m.claimFestival(i).ok,true);assert.equal(m.claimFestival(i).ok,false);}
 assert.equal(m.rates().visitors,base*1.25);assert.deepEqual(m.data.trophies,['harvest']);const id=m.data.festival.id;
 now+=7*86400000;assert.notEqual(m.syncFestival().id,id);assert.equal(m.data.festival.points,0);assert.deepEqual(m.data.trophies,['harvest']);assert.equal(m.rates().visitors,base);
});

test('parc : pas de mutation pendant une visite ou une démonstration',()=>{const g=fixture(),m=g.tourism;complete(g,'park_gate');g.visit={};assert.equal(m.start('park_wheel').ok,false);assert.equal(m.donate('wood',10).ok,false);assert.equal(m.claimFestival(0).ok,false);});

test('modèles du parc : six silhouettes détaillées et pièces animées seulement après inauguration',()=>{
 for(const type of Object.keys(ATTRACTIONS)){
  const make=L=>{const g=new GeoBuilder(),out={parts:[],emitters:[]};buildTourismModel(g,type,L,{ground:x=>x,leaf:x=>x},out);return {g,out};};
  const initial=make(1),final=make(4);assert.ok(final.g.body.count>initial.g.body.count,type);assert.ok(final.g.body.pos.every(Number.isFinite),type);
  if(['park_wheel','park_carousel'].includes(type)){assert.equal(initial.out.parts.length,0);assert.equal(final.out.parts.length,1);assert.ok(final.out.parts[0].body.count>0);}
 }
 const monday=Date.UTC(2026,9,26);assert.equal(festivalCalendar(monday).startsAt,monday);assert.equal(festivalCalendar(monday).endsAt,monday+7*86400000);
});


test('fête : vraie décoration exclusive débloquée dans le profil, sans doublon payant',t=>{
 let now=Date.UTC(2026,9,26,12);t.mock.method(Date,'now',()=>now);const g=fixture(),m=g.tourism;g.playing=true;g.meta=new Meta(g);complete(g,'park_gate');
 assert.equal(g.meta.ownsDecor('e_haystacks'),false);m.data.festival.points=700;assert.equal(m.claimFestival(2).ok,true);assert.equal(g.meta.ownsDecor('e_haystacks'),true);
 const gems=g.meta.p.gems;assert.equal(m.claimFestival(2).ok,false);now+=7*86400000;m.syncFestival().points=700;assert.equal(m.claimFestival(2).ok,true);assert.equal(g.meta.p.gems,gems);
});
