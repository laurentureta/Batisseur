import { GOODS } from '../data/resources.js';
import { BUILDINGS, sizeOf } from '../data/buildings.js';
import { BASE_STORAGE, TOWNHALL_STORAGE, N, SIZE } from '../world/constants.js';
import { decodeBytes } from '../core/save.js';
import { MARKET_REGIONS, MARKET_SLOT_MS, MARKET_DAY_MS, MARKET_DAILY_UNITS, MARKET_MAX_TRADE, marketOfferRule, initialMarketOffer, marketDemand, marketIndex, unitPriceCents } from '../data/market.js';

const fail = reason => ({ ok: false, reason });
const cents = value => Math.floor(value*100+1e-7);
const capacityCache = new WeakMap();
function perimeter(building) {
  const def=BUILDINGS[building.type]; if(!def)return [];
  const [w,d]=sizeOf(def,building.rot),out=[];
  for(let z=building.z-1;z<=building.z+d;z++)for(let x=building.x-1;x<=building.x+w;x++){
    if(x<0||z<0||x>=SIZE||z>=SIZE||x>=building.x&&x<building.x+w&&z>=building.z&&z<building.z+d)continue;
    if((x===building.x-1||x===building.x+w)&&(z===building.z-1||z===building.z+d))continue;
    out.push(z*SIZE+x);
  }
  return out;
}
/** Capacité réelle des entrepôts reliés à la mairie, aussi pour une ville non affichée. */
export function regionalMarketStorage(state) {
  if(state.mode==='libre')return Infinity;
  const buildings=state.buildings||[],key=buildings.map(b=>`${b.id}:${b.type}:${b.level}:${b.x}:${b.z}:${b.rot}:${b.cons?.k||''}`).join('|')+'|'+(state.legacyStorage||0)+'|'+state.city?.projects?.civic_garden?.phase;
  const cached=capacityCache.get(state);
  if(cached?.key===key&&cached.road===state.map?.road)return cached.capacity;
  const road=state.map?.road?decodeBytes(state.map.road,N):new Uint8Array(N),connected=new Uint8Array(N),queue=[];
  const hall=buildings.find(b=>b.type==='townhall');
  if(hall)for(const i of perimeter(hall))if(road[i]&&!connected[i]){connected[i]=1;queue.push(i);}
  for(let h=0;h<queue.length;h++){
    const i=queue[h],x=i%SIZE,z=Math.floor(i/SIZE);
    for(const n of [x?i-1:-1,x<SIZE-1?i+1:-1,z?i-SIZE:-1,z<SIZE-1?i+SIZE:-1])if(n>=0&&road[n]&&!connected[n]){connected[n]=1;queue.push(n);}
  }
  let capacity=BASE_STORAGE,hasDepot=false;
  for(const b of buildings){
    const def=BUILDINGS[b.type];if(!def||b.cons?.k==='new')continue;
    if(b.type==='townhall')capacity+=TOWNHALL_STORAGE*b.level;
    if(def.storage&&perimeter(b).some(i=>connected[i])){capacity+=def.storage[Math.min(def.storage.length,b.level)-1]||0;if(b.type==='depot'&&!b.cons)hasDepot=true;}
    if(b.type==='civic_garden'&&!b.cons&&state.city?.projects?.civic_garden?.phase===3)capacity+=200;
  }
  if(!hasDepot)capacity+=state.legacyStorage||0;
  capacityCache.set(state,{key,road:state.map?.road,capacity});return capacity;
}

export class RegionalMarket {
  constructor(game){this.game=game;this.elapsed=0;}
  reset(){this.elapsed=0;if(this.game.state&&!this.game.isDemo)this.refresh();}
  get book(){return this.game.city.book;}
  get data(){
    const book=this.book;
    book.market ||= {version:1,seed:this.game.state.seed>>>0,day:Math.floor(Date.now()/MARKET_DAY_MS),volume:0,nextTrade:1,venues:{},history:[]};
    return book.market;
  }
  regions(){return Object.keys(MARKET_REGIONS).filter(id=>this.book.settlements[id]);}
  target(region){return region===this.game.state.regionId?this.game.state:this.book.settlements[region]?.snapshot;}
  capacity(region){return region===this.game.state.regionId?this.game.sim.d.storage:regionalMarketStorage(this.target(region));}
  refresh(now=Date.now()){
    const data=this.data,day=Math.floor(now/MARKET_DAY_MS);
    let changed=false;
    if(day>data.day){data.day=day;data.volume=0;changed=true;}
    for(const region of this.regions()){
      const slot=Math.floor(now/MARKET_SLOT_MS),rule=MARKET_REGIONS[region];
      let venue=data.venues[region];
      if(!venue){venue=data.venues[region]={slot,revision:0,budget:rule.budget,offers:Object.fromEntries(GOODS.map(r=>[r,initialMarketOffer(data.seed,region,r,slot)]))};changed=true;}
      for(const r of GOODS)if(!venue.offers[r]){venue.offers[r]=initialMarketOffer(data.seed,region,r,venue.slot);changed=true;}
      if(slot<=venue.slot)continue; // reculer l’horloge ne recharge pas les réserves
      const periods=Math.min(4,slot-venue.slot);
      for(const r of GOODS){
        const cfg=marketOfferRule(region,r),offer=venue.offers[r];
        offer.stock=Math.min(cfg.capacity,offer.stock+cfg.restock*periods);
        offer.wanted=Math.min(marketDemand(data.seed,region,r,slot),offer.wanted+cfg.demandRestock*periods);
      }
      venue.slot=slot;venue.revision++;venue.budget=rule.budget;changed=true;
    }
    return changed;
  }
  publicState(region=this.game.state.regionId){
    this.refresh();
    const venue=this.data.venues[region],state=this.target(region);if(!venue||!state)return null;
    return {region,rule:MARKET_REGIONS[region],slot:venue.slot,nextAt:(venue.slot+1)*MARKET_SLOT_MS,coins:state.res.coins,budget:venue.budget,remaining:Math.max(0,MARKET_DAILY_UNITS-this.data.volume),capacity:this.capacity(region),offers:GOODS.map(resource=>({resource,...venue.offers[resource],...marketOfferRule(region,resource),local:state.res[resource]||0,index:marketIndex(this.data.seed,region,resource,venue.slot)}))};
  }
  quote(region,resource,side,quantity){
    this.refresh();quantity=Number(quantity);
    if(!this.regions().includes(region)||!GOODS.includes(resource)||!['buy','sell'].includes(side))return fail('Choisissez un marché ouvert et une marchandise.');
    if(!Number.isInteger(quantity)||quantity<1||quantity>MARKET_MAX_TRADE)return fail(`Choisissez de 1 à ${MARKET_MAX_TRADE} unités.`);
    const data=this.data,venue=data.venues[region],offer=venue.offers[resource],state=this.target(region);
    if(!state)return fail('Ce village n’est pas disponible.');
    if(data.volume+quantity>MARKET_DAILY_UNITS)return fail('Limite quotidienne de 1 600 unités échangées atteinte.');
    if(side==='buy'&&offer.stock<quantity)return fail(`Le marchand ne dispose que de ${offer.stock} unités.`);
    if(side==='sell'&&offer.wanted<quantity)return fail(`Les acheteurs recherchent encore ${offer.wanted} unités.`);
    if(side==='sell'&&(state.res[resource]||0)<quantity)return fail('Ce village ne possède pas assez de cette marchandise.');
    const cfg=marketOfferRule(region,resource);
    if(side==='sell'&&offer.stock+quantity>cfg.capacity)return fail('Les réserves du marchand sont pleines.');
    if(side==='buy'&&(state.res[resource]||0)+quantity>this.capacity(region)+1e-6)return fail('Le stockage du village est insuffisant.');
    let totalCents=0;
    // Chaque unité est cotée au milieu du mouvement de stock : un aller-retour suit la même
    // courbe dans les deux sens, et perd toujours l’écart d’achat/vente, même en gros volume.
    for(let i=0;i<quantity;i++)totalCents+=unitPriceCents(data.seed,region,resource,venue.slot,offer.stock+(side==='buy'?-i-.5:i+.5),side);
    if(side==='buy'&&cents(state.res.coins||0)<totalCents)return fail('Ce village ne possède pas assez de pièces.');
    if(side==='sell'&&cents(venue.budget)<totalCents)return fail('Le marchand manque de pièces jusqu’au prochain réassort.');
    return {ok:true,region,resource,side,quantity,total:totalCents/100,unit:totalCents/quantity/100,stock:offer.stock,wanted:offer.wanted,quoteId:[region,resource,side,quantity,venue.slot,venue.revision,data.day,data.volume,totalCents].join(':')};
  }
  trade(region,resource,side,quantity,quoteId){
    if(!this.game.playing||this.game.visit||this.game.isDemo)return fail('Ouvrez votre propre village pour échanger.');
    const quote=this.quote(region,resource,side,quantity);if(!quote.ok)return quote;
    if(quoteId&&quoteId!==quote.quoteId)return fail('Les cours ou les réserves ont changé. Vérifiez le nouveau prix.');
    const data=this.data,state=this.target(region),venue=data.venues[region],offer=venue.offers[resource];
    const before=JSON.parse(JSON.stringify(data)),stocks={...state.res};
    const sign=side==='buy'?1:-1;
    state.res[resource]=(state.res[resource]||0)+sign*quote.quantity;
    state.res.coins=Math.max(0,state.res.coins-sign*quote.total);
    offer.stock-=sign*quote.quantity;if(side==='sell')offer.wanted-=quote.quantity;
    venue.budget=Math.round((venue.budget+sign*quote.total)*100)/100;venue.revision++;
    data.volume+=quote.quantity;
    const transaction={id:data.nextTrade++,region,resource,side,quantity:quote.quantity,total:quote.total,at:Date.now()};
    data.history.push(transaction);data.history=data.history.slice(-40);
    let saved=true;
    try { saved=this.game.save?.(); } catch { saved=false; }
    if(saved===false){Object.assign(state.res,stocks);Object.assign(data,before);return fail('La sauvegarde est impossible. Aucun échange n’a été conservé.');}
    this.game.sim.markDirty();this.game.bus.emit('market:changed',transaction);
    return {ok:true,transaction};
  }
  tick(dt){
    if(!this.game.playing||this.game.visit||this.game.isDemo)return;
    this.elapsed+=dt;if(this.elapsed<1)return;this.elapsed=0;
    if(this.refresh()){this.game.save?.();this.game.bus.emit('market:changed');}
  }
}
