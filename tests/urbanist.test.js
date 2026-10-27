import test from 'node:test';
import assert from 'node:assert/strict';
import {GameCore} from '../src/core/GameCore.js';
import {createNewState,migrateState} from '../src/core/state.js';
import {serialize} from '../src/core/save.js';
import {Meta} from '../src/core/meta.js';
import {UrbanPlanner} from '../src/sim/UrbanPlanner.js';
import {BUILDINGS,ROAD_TYPES,sizeOf} from '../src/data/buildings.js';
import {T,SIZE} from '../src/world/constants.js';
function fixture(sites=false){const g=new GameCore({sites});g.loadState(createNewState({seed:2711,mode:'carriere'}));g.playing=true;g.state.level=100;g.state.zones.fill(true);g.world.terrain.fill(T.GRASS);for(const k in g.state.res)g.state.res[k]=100000;g.save=()=>true;g.urbanist||=new UrbanPlanner(g);return g;}
function add(g,type,x,z,rot=0,level=1){const b={id:g.state.nextId++,type,x,z,rot,level};if(BUILDINGS[type].residents)b.residents=7;g.world.addBuilding(b);return b;}
function digest(g){return JSON.stringify({b:[...g.world.buildings.values()],occ:[...g.world.occ],road:[...g.world.road],terrain:[...g.world.terrain],res:g.state.res,nextId:g.state.nextId,planning:g.urbanist.data,stats:g.state.stats});}
function consistent(g){for(const b of g.world.buildings.values())for(const i of g.world.tilesOf(b))assert.equal(g.world.occ[i],b.id);for(let i=0;i<g.world.occ.length;i++)if(g.world.occ[i]>=0)assert.ok(g.world.buildings.has(g.world.occ[i]));}

test('quartier : déplacement atomique sur les anciennes cases, habitants et routes conservés',()=>{
 const g=fixture(),p=g.urbanist,a=add(g,'house',40,40),b=add(g,'house',41,40);a.appearance={facade:'peach',roof:'blue',garden:'flowers'};g.world.setRoad(g.world.idx(40,41),2);g.world.setRoad(g.world.idx(41,41),1);const res={...g.state.res};
 assert.equal(p.previewMove([a.id,b.id],1,0,{roads:true}).ok,true);assert.equal(p.move([a.id,b.id],1,0,{roads:true}).ok,true);
 assert.equal(a.x,41);assert.equal(b.x,42);assert.equal(a.residents,7);assert.equal(a.appearance.facade,'peach');assert.equal(g.world.occ[g.world.idx(40,40)],-1);assert.equal(g.world.road[g.world.idx(40,41)],0);assert.equal(g.world.road[g.world.idx(41,41)],2);assert.equal(g.world.road[g.world.idx(42,41)],1);assert.deepEqual(g.state.res,res);consistent(g);
});

test('quartier : obstacle, nature, zone verrouillée et route extérieure refusés sans effet',()=>{
 const g=fixture(),p=g.urbanist,a=add(g,'house',40,40),b=add(g,'house',42,40);let before=digest(g);assert.equal(p.move([a.id],2,0,{roads:false}).ok,false);assert.equal(digest(g),before);
 g.world.terrain[g.world.idx(43,40)]=T.FOREST;before=digest(g);assert.equal(p.move([a.id],3,0,{roads:false}).ok,false);assert.equal(digest(g),before);
 g.world.setRoad(g.world.idx(44,40),1);before=digest(g);assert.equal(p.move([a.id],4,0,{roads:false}).ok,false);assert.equal(digest(g),before);
 g.state.zones[g.world.zoneIndex(80,80)]=false;before=digest(g);assert.equal(p.move([a.id],40,40,{roads:false}).ok,false);assert.equal(digest(g),before);assert.equal(p.move([a.id],-.5,0).ok,false);consistent(g);
});

test('quartier : coordonnées et routes restaurées si la sauvegarde échoue',()=>{
 const g=fixture(),a=add(g,'house',40,40);g.world.setRoad(g.world.idx(40,41),2);g.save=()=>false;const before=digest(g);let moved=0;g.bus.on('building:moved',()=>moved++);
 assert.equal(g.urbanist.move([a.id],3,0).ok,false);assert.equal(digest(g),before);assert.equal(moved,0);consistent(g);
});

test('décors : réserve persistante, niveau et apparence préservés, sans remboursement ni copie',()=>{
 const g=fixture(),p=g.urbanist,b=add(g,'park',40,40,1,3);b.appearance={facade:'sage',roof:'red',garden:'hedge'};const before={...g.state.res};
 assert.equal(p.storeDecor(b.id).ok,true);assert.equal(g.world.buildings.has(b.id),false);assert.deepEqual(g.state.res,before);assert.equal(p.data.stored.length,1);
 const saved=migrateState(JSON.parse(serialize(g)));assert.deepEqual(saved.city.planning.stored[0].building.appearance,b.appearance);
 const key=p.data.stored[0].key;assert.equal(p.restoreDecor(key,42,42,0).ok,true);assert.equal(p.data.stored.length,0);const restored=[...g.world.buildings.values()].find(v=>v.type==='park');assert.equal(restored.level,b.level);assert.deepEqual(restored.appearance,b.appearance);assert.deepEqual(g.state.res,before);assert.equal(p.restoreDecor(key,45,45).ok,false);consistent(g);
});

test('réserve : échec de placement ou sauvegarde conserve exactement un décor',()=>{
 const g=fixture(),p=g.urbanist,b=add(g,'park',40,40);p.storeDecor(b.id);const key=p.data.stored[0].key;g.world.terrain[g.world.idx(45,45)]=T.ROCK;let before=digest(g);assert.equal(p.restoreDecor(key,45,45).ok,false);assert.equal(digest(g),before);
 g.save=()=>false;before=digest(g);assert.equal(p.restoreDecor(key,43,43).ok,false);assert.equal(digest(g),before);consistent(g);
});

test('plans : coût agrégé exact, apparences, bâtiments neufs et vrais chantiers',()=>{
 const g=fixture(true),p=g.urbanist,a=add(g,'house',40,40,0,3),b=add(g,'house',42,40);a.appearance={facade:'ivory',roof:'blue',garden:'flowers'};g.world.setRoad(g.world.idx(40,41),2);g.world.setRoad(g.world.idx(41,41),2);g.world.setRoad(g.world.idx(42,41),2);
 assert.equal(p.saveBlueprint('Le quartier des fleurs',[a.id,b.id],{roads:true}).ok,true);const bp=p.data.blueprints[0],preview=p.previewBlueprint(bp.id,50,40);assert.equal(preview.ok,true);
 const expected={};for(const r of [BUILDINGS.house.costs[0],BUILDINGS.house.costs[0],ROAD_TYPES[2].cost,ROAD_TYPES[2].cost,ROAD_TYPES[2].cost])for(const[k,n]of Object.entries(r))expected[k]=(expected[k]||0)+n;assert.deepEqual(preview.cost,expected);
 const before={...g.state.res};const result=p.buildBlueprint(bp.id,50,40);assert.equal(result.ok,true);assert.equal(result.count,2);for(const[k,n]of Object.entries(expected))assert.equal(g.state.res[k],before[k]-n);assert.ok(result.buildings.every(v=>v.level===1&&v.cons?.k==='new'));assert.deepEqual(result.buildings[0].appearance,a.appearance);assert.equal(a.level,3);assert.equal(p.data.blueprints.length,1);consistent(g);
});

test('plans : pas de paiement partiel ni de construction si stock total insuffisant',()=>{
 const g=fixture(),p=g.urbanist,a=add(g,'house',40,40),b=add(g,'house',42,40);p.saveBlueprint('Deux maisons',[a.id,b.id],{roads:false});g.state.res.coins=BUILDINGS.house.costs[0].coins;const before=digest(g);assert.equal(p.buildBlueprint(p.data.blueprints[0].id,50,40).ok,false);assert.equal(digest(g),before);
 g.state.res.coins=100000;g.save=()=>false;const again=digest(g);assert.equal(p.buildBlueprint(p.data.blueprints[0].id,50,40).ok,false);assert.equal(digest(g),again);consistent(g);
});

test('plans et mouvements : emprises tournées respectées, uniques et projets protégés',()=>{
 const g=fixture(),p=g.urbanist,a=add(g,'citygate',40,40,1),[width,depth]=sizeOf(BUILDINGS.citygate,1);assert.notEqual(width,depth);assert.equal(p.move([a.id],1,1,{roads:false}).ok,true);consistent(g);
 assert.equal(p.saveBlueprint('Arche',[a.id],{roads:false}).ok,true);assert.equal(p.buildBlueprint(p.data.blueprints[0].id,50,40).ok,true);consistent(g);
 const civic=add(g,'civic_square',60,60),station=add(g,'station',65,65);assert.equal(p.move([civic.id],1,0).ok,false);assert.equal(p.storeDecor(civic.id).ok,false);assert.equal(p.saveBlueprint('Gare',[station.id],{roads:false}).ok,false);assert.equal(p.storeDecor(station.id).ok,false);assert.equal(p.move([g.world.townhall().id],1,0).ok,false);
});

test('urbaniste : visites et démonstrations ne modifient jamais la ville',()=>{const g=fixture(),b=add(g,'house',40,40);g.visit={};assert.equal(g.urbanist.move([b.id],1,0).ok,false);assert.equal(g.urbanist.saveBlueprint('Non',[b.id]).ok,false);g.visit=null;g.isDemo=true;assert.equal(g.urbanist.previewMove([b.id],1,0).ok,false);});


test('réserve : ranger et replacer ne rapporte ni XP de passe ni récompense de construction',()=>{
 const g=fixture(),p=g.urbanist,b=add(g,'bench',40,40);g.meta=new Meta(g);const xp=g.meta.p.pass.xp,total=g.state.stats.totalBuilt;
 for(let i=0;i<3;i++){const decor=[...g.world.buildings.values()].find(v=>v.type==='bench');assert.equal(p.storeDecor(decor.id).ok,true);assert.equal(p.restoreDecor(p.data.stored[0].key,40,40).ok,true);}
 assert.equal(g.meta.p.pass.xp,xp);assert.equal(g.state.stats.totalBuilt,total);assert.equal([...g.world.buildings.values()].filter(v=>v.type==='bench').length,1);
});

test('plans : déblocages et collisions internes restent vérifiés après chargement d’un plan',()=>{
 const g=fixture(),p=g.urbanist,b=add(g,'house',40,40);p.saveBlueprint('Maison',[b.id],{roads:false});const bp=p.data.blueprints[0];bp.buildings.push({...bp.buildings[0]});const before=digest(g);assert.equal(p.buildBlueprint(bp.id,50,40).ok,false);assert.equal(digest(g),before);
 bp.buildings.pop();bp.buildings[0].type='citygate';g.state.level=1;assert.equal(p.previewBlueprint(bp.id,50,40).ok,false);
});
