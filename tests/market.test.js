import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCore } from '../src/core/GameCore.js';
import { createNewState } from '../src/core/state.js';
import { serialize } from '../src/core/save.js';
import { RegionalMarket, regionalMarketStorage } from '../src/sim/RegionalMarket.js';
import { advanceRegionalState } from '../src/sim/RegionalEconomy.js';
import { CityDevelopment } from '../src/sim/CityDevelopment.js';
import { MARKET_SLOT_MS, MARKET_DAY_MS, MARKET_DAILY_UNITS, marketOfferRule, marketDemand, marketIndex, initialMarketOffer, unitPriceCents } from '../src/data/market.js';
import { GOODS } from '../src/data/resources.js';
import { SIZE } from '../src/world/constants.js';

const NOW=1800000000000;
function fixture(state){
  const game=new GameCore({sites:false});
  state ||= createNewState({seed:1234});
  if(!state.regionBook){for(const r of GOODS)state.res[r]=100;state.res.coins=100000;state.level=35;}
  game.loadState(state);game.playing=true;game.save=()=>true;
  game.market=new RegionalMarket(game);game.market.reset();return game;
}
function add(game,type,x,z,level=1){const b={id:game.state.nextId++,type,x,z,rot:0,level};game.world.addBuilding(b);return b;}

function lockTime(t){let now=NOW;t.mock.method(Date,'now',()=>now);return value=>{now=value;};}

test('cours : déterministes, évolutifs, bornés et réellement spécialisés',()=>{
  const slot=Math.floor(NOW/MARKET_SLOT_MS);
  for(const r of GOODS){
    assert.deepEqual(initialMarketOffer(123,'home',r,slot),initialMarketOffer(123,'home',r,slot));
    for(const region of ['home','island','mountain','coast']){
      const cfg=marketOfferRule(region,r),stock=cfg.capacity*.65;
      const ask=unitPriceCents(123,region,r,slot,stock,'buy'),bid=unitPriceCents(123,region,r,slot,stock,'sell');
      assert.ok(ask>bid);assert.ok(bid>0);
    }
  }
  assert.ok(marketOfferRule('home','wood').capacity>marketOfferRule('island','wood').capacity);
  assert.ok(marketOfferRule('island','wood').demand>marketOfferRule('home','wood').demand);
  assert.ok(marketIndex(123,'home','wood',slot)<marketIndex(123,'island','wood',slot));
  assert.ok(new Set(Array.from({length:8},(_,i)=>marketIndex(123,'home','wood',slot+i))).size>1);
  assert.ok(new Set(Array.from({length:8},(_,i)=>marketDemand(123,'home','wood',slot+i))).size>1);
});

test('achat : débit des pièces, crédit du stock et épuisement réel du marchand',(t)=>{
  lockTime(t);const g=fixture();g.state.res.wood=0;
  let bought=0,total=0;
  const initial=g.market.publicState('home').offers.find(o=>o.resource==='wood').stock;
  while(bought<initial){
    const qty=Math.min(200,initial-bought),q=g.market.quote('home','wood','buy',qty);
    assert.equal(q.ok,true);assert.equal(g.market.trade('home','wood','buy',qty,q.quoteId).ok,true);
    bought+=qty;total+=q.total;
  }
  assert.equal(g.state.res.wood,initial);assert.equal(Math.round(g.state.res.coins*100),Math.round((100000-total)*100));
  assert.equal(g.market.publicState('home').offers.find(o=>o.resource==='wood').stock,0);
  const coins=g.state.res.coins;assert.equal(g.market.trade('home','wood','buy',1).ok,false);assert.equal(g.state.res.coins,coins);
});

test('vente : les ressources et la demande sont débitées, trésorerie marchande limitée',(t)=>{
  lockTime(t);const g=fixture(),offer=g.market.publicState('home').offers.find(o=>o.resource==='wood');
  const q=g.market.quote('home','wood','sell',10);assert.equal(q.ok,true);
  assert.equal(g.market.trade('home','wood','sell',10,q.quoteId).ok,true);
  assert.equal(g.state.res.wood,90);assert.equal(g.state.res.coins,100000+q.total);
  const after=g.market.publicState('home').offers.find(o=>o.resource==='wood');
  assert.equal(after.stock,offer.stock+10);assert.equal(after.wanted,offer.wanted-10);
  g.market.data.venues.home.budget=0;const stock=g.state.res.wood;
  assert.equal(g.market.trade('home','wood','sell',1).ok,false);assert.equal(g.state.res.wood,stock);
});

test('aller-retour : aucun arbitrage gratuit même sur une courbe de prix par unité',(t)=>{
  lockTime(t);const g=fixture();g.state.res.wood=0;
  const before=g.state.res.coins;
  assert.equal(g.market.trade('home','wood','buy',25).ok,true);
  const sale=g.market.quote('home','wood','sell',25);assert.equal(sale.ok,true);
  assert.equal(g.market.trade('home','wood','sell',25,sale.quoteId).ok,true);
  assert.equal(g.state.res.wood,0);assert.ok(g.state.res.coins<before);
  const stock=g.market.data.venues.home.offers.wood.stock;
  for(let i=0;i<25;i++){
    assert.equal(g.market.trade('home','wood','buy',1).ok,true);
    assert.equal(g.market.trade('home','wood','sell',1).ok,true);
  }
  assert.equal(g.market.data.venues.home.offers.wood.stock,stock);
  assert.ok(g.state.res.coins<before-sale.total*.01);
});

test('devis : un double clic, une nouvelle période et un autre échange invalident l’ancien prix',(t)=>{
  const set=lockTime(t),g=fixture(),q=g.market.quote('home','wood','buy',10);
  assert.equal(g.market.trade('home','wood','buy',10,q.quoteId).ok,true);
  const before=g.state.res.wood;assert.equal(g.market.trade('home','wood','buy',10,q.quoteId).ok,false);assert.equal(g.state.res.wood,before);
  const other=g.market.quote('home','wood','buy',10);g.market.trade('home','stone','buy',1);
  assert.equal(g.market.trade('home','wood','buy',10,other.quoteId).ok,false);
  const old=g.market.quote('home','wood','buy',10);set(NOW+MARKET_SLOT_MS);
  assert.equal(g.market.trade('home','wood','buy',10,old.quoteId).ok,false);
});

test('réassort : renouvellement plafonné, stock persistant au rechargement, horloge reculée ignorée',(t)=>{
  const set=lockTime(t),g=fixture();g.state.res.wood=0;g.market.data.venues.home.offers.wood.stock=0;
  set(NOW+MARKET_SLOT_MS);g.market.refresh();
  const cfg=marketOfferRule('home','wood'),once=g.market.data.venues.home.offers.wood.stock;
  assert.equal(once,cfg.restock);
  const restored=fixture(JSON.parse(serialize(g)));assert.equal(restored.market.data.venues.home.offers.wood.stock,once);
  set(NOW);restored.market.refresh();assert.equal(restored.market.data.venues.home.offers.wood.stock,once);
  set(NOW+20*MARKET_SLOT_MS);restored.market.refresh();
  assert.equal(restored.market.data.venues.home.offers.wood.stock,Math.min(cfg.capacity,once+4*cfg.restock));
});

test('transactions : sauvegarde refusée annule pièces, marchandises et journal',(t)=>{
  lockTime(t);const g=fixture(),before=JSON.stringify(g.market.data),stocks={...g.state.res};
  g.save=()=>false;assert.equal(g.market.trade('home','wood','buy',10).ok,false);
  assert.deepEqual(g.state.res,stocks);assert.equal(JSON.stringify(g.market.data),before);
  g.save=()=>{throw Error('quota');};assert.equal(g.market.trade('home','wood','sell',10).ok,false);
  assert.deepEqual(g.state.res,stocks);assert.equal(JSON.stringify(g.market.data),before);
});

test('validation : quantité, ressources, village, capacité, fonds et visites protégés',(t)=>{
  lockTime(t);const g=fixture(),stocks={...g.state.res};
  for(const qty of [0,-1,.5,201,NaN,Infinity])assert.equal(g.market.trade('home','wood','buy',qty).ok,false);
  assert.equal(g.market.trade('island','wood','buy',1).ok,false);
  assert.equal(g.market.trade('home','coins','buy',1).ok,false);
  assert.equal(g.market.trade('home','wood','invalid',1).ok,false);
  assert.deepEqual(g.state.res,stocks);
  g.state.res.coins=0;assert.equal(g.market.trade('home','wood','buy',1).ok,false);
  g.state.res.coins=100000;g.state.res.wood=400;assert.equal(g.market.trade('home','wood','buy',1).ok,false);
  g.state.res.wood=0;assert.equal(g.market.trade('home','wood','sell',1).ok,false);
  g.visit={};assert.equal(g.market.trade('home','wood','buy',1).ok,false);
});

test('quota : limite quotidienne partagée et renouvellement à minuit UTC',(t)=>{
  const set=lockTime(t),g=fixture();g.market.data.volume=MARKET_DAILY_UNITS-5;
  assert.equal(g.market.trade('home','wood','buy',10).ok,false);
  assert.equal(g.market.trade('home','wood','buy',5).ok,true);
  assert.equal(g.market.trade('home','stone','buy',1).ok,false);
  const day=g.market.data.day;set((day+1)*MARKET_DAY_MS);g.market.refresh();assert.equal(g.market.data.volume,0);
  assert.equal(g.market.trade('home','stone','buy',1).ok,true);
  set(NOW);g.market.refresh();assert.equal(g.market.data.volume,1);
});

test('régions : chaque comptoir utilise les stocks du village sélectionné',(t)=>{
  lockTime(t);const g=fixture();g.state.res.wood=500;g.state.res.food=500;g.city.book.level=35;
  assert.equal(g.city.unlockTerritory('island').ok,true);
  const ownCoins=g.state.res.coins,ownWood=g.state.res.wood,target=g.city.book.settlements.island.snapshot;
  target.res.coins=5000;target.res.wood=50;
  const q=g.market.quote('island','wood','buy',10);assert.equal(q.ok,true);
  assert.equal(g.market.trade('island','wood','buy',10,q.quoteId).ok,true);
  assert.equal(target.res.wood,60);assert.equal(target.res.coins,5000-q.total);
  assert.equal(g.state.res.coins,ownCoins);assert.equal(g.state.res.wood,ownWood);
  assert.equal(g.market.regions().length,2);
});

test('stockage distant : seul un entrepôt réellement relié augmente la capacité',(t)=>{
  lockTime(t);const g=fixture();add(g,'depot',56,50,2);
  let state=JSON.parse(serialize(g));assert.equal(regionalMarketStorage(state),400);
  for(let x=54;x<=57;x++)g.world.setRoad(52*SIZE+x,1);g.world.setRoad(53*SIZE+54,1);
  state=JSON.parse(serialize(g));assert.equal(regionalMarketStorage(state),1200);
  state.buildings.find(b=>b.type==='depot').cons={k:'new'};
  assert.equal(regionalMarketStorage(state),400);
});

test('veille : une file de fabrication réservée supprime la production automatique de cet atelier',(t)=>{
  lockTime(t);const g=fixture(),b=add(g,'sawmill',50,50);
  for(let x=50;x<=54;x++)g.world.setRoad(52*SIZE+x,1);g.world.setRoad(53*SIZE+54,1);
  g.state.res.wood=100;g.state.res.planks=0;
  g.state.city.workshops={byBuilding:{[b.id]:{queue:[{id:1,recipe:'planks_batch'}]}}};
  const state=JSON.parse(serialize(g));state.regionalClockAt=NOW;
  advanceRegionalState(state,'home',NOW+3600000,r=>new CityDevelopment(r));
  assert.equal(state.res.wood,100);assert.equal(state.res.planks,0);
});
