import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EXPANDED_BUILDINGS, COLLECTIONS } from '../src/data/catalogue.js';
import { BUILDINGS, BUILDING_LIST } from '../src/data/buildings.js';
import { RESOURCES } from '../src/data/resources.js';
import { buildModel } from '../src/render/models.js';
import { GameCore } from '../src/core/GameCore.js';
import { createNewState, migrateState } from '../src/core/state.js';
import { serialize } from '../src/core/save.js';
import { SIZE, T } from '../src/world/constants.js';

test('catalogue : 240 références stables, coûts valides et usages économiques réels',()=>{
 assert.equal(EXPANDED_BUILDINGS.length,240);
 assert.equal(new Set(BUILDING_LIST.map(d=>d.id)).size,BUILDING_LIST.length);
 const counts={};
 for(const d of EXPANDED_BUILDINGS){
  assert.equal(BUILDINGS[d.id],d);assert.ok(COLLECTIONS[d.catalogue.collection]);
  assert.ok(d.unlock>=1&&d.unlock<=100);assert.equal(d.costs.length,d.maxLevel);
  for(const cost of d.costs)for(const [r,n]of Object.entries(cost)){assert.ok(RESOURCES[r],r);assert.ok(Number.isFinite(n)&&n>=0);}
  if(d.cat==='housing'){assert.equal(d.residents.length,d.maxLevel);assert.equal(d.tax.length,d.maxLevel);}
  if(d.cat==='commerce')assert.ok(d.income.base>0&&d.coverage.need);
  if(d.cat==='services')assert.ok(d.coverage.radius[0]>0);
  if(d.cat==='decor')assert.ok(d.beauty.v>0);
  counts[d.cat]=(counts[d.cat]||0)+1;
 }
 assert.deepEqual(counts,{housing:48,commerce:60,services:24,decor:108});
});

test('catalogue : 240 plans 3D distincts, géométries finies et adaptées à leur emprise',()=>{
 const hashes=new Set();
 for(const d of EXPANDED_BUILDINGS){
  const model=buildModel(d.id,1,0,1),hash=createHash('sha256').update(Buffer.from(model.body.pos.buffer)).digest('hex');
  assert.ok(!hashes.has(hash),`Le plan ${d.id} doit être distinct`);hashes.add(hash);
  assert.ok(model.body.count>0&&model.body.count<10000,`${d.id} respecte le budget mobile`);
  for(const layer of[model.body,model.glass]){
   assert.equal(layer.pos.length,layer.col.length);assert.equal(layer.pos.length,layer.nor.length);
   for(let k=0;k<layer.pos.length;k+=3){
    assert.ok(Number.isFinite(layer.pos[k])&&Number.isFinite(layer.pos[k+1])&&Number.isFinite(layer.pos[k+2]),d.id);
    assert.ok(Math.abs(layer.pos[k])<=d.size[0]/2+.1,`${d.id} dépasse son emprise en x`);
    assert.ok(Math.abs(layer.pos[k+2])<=d.size[1]/2+.1,`${d.id} dépasse son emprise en z`);
   }
  }
  for(let season=0;season<4;season++)assert.ok(buildModel(d.id,d.maxLevel,5,season).body.count>0);
 }
 assert.equal(hashes.size,240);
});

test('catalogue : placement payant, logement, commerce et décor conservés en sauvegarde',()=>{
 const g=new GameCore({sites:false}),st=createNewState({seed:124});st.level=50;st.zones.fill(true);
 for(const r in st.res)st.res[r]=100000;
 g.loadState(st);
 for(let z=43;z<55;z++)for(let x=43;x<60;x++)g.world.setTerrain(z*SIZE+x,T.GRASS);
 const types=['v5_home_cottage_bocage','v5_shop_cafe_bocage','v5_service_library_bocage','v5_decor_fountain_bocage'];
 const first=st.res.coins;let cost=0;
 for(let k=0;k<types.length;k++){
  const type=types[k],result=g.actions.placeBuilding(type,43+k*2,43,0);
  assert.equal(result.ok,true,result.reason);cost+=BUILDINGS[type].costs[0].coins;
  if(BUILDINGS[type].residents)assert.equal(result.building.residents,0);
  if(result.building.cons){result.building.cons.ready=true;g.construction.finish(result.building);}
 }
 assert.equal(st.res.coins,first-cost);
 const saved=migrateState(JSON.parse(serialize(g)));
 for(const type of types)assert.ok(saved.buildings.some(b=>b.type===type));
 g.loadState(saved);g.sim.recalc();assert.ok(g.sim.d.capacity>=2);
});
