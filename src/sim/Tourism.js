import { ATTRACTIONS,PARK_MILESTONES,FESTIVAL_STAGES,FESTIVAL_VALUES,festivalCalendar } from '../data/tourism.js';
import { BUILDINGS } from '../data/buildings.js';
import { buildTouristNetwork,makeTouristPlan,touristPlanValid,MAX_VISIBLE_TOURISTS } from '../render/touristPlans.js';
const fail=reason=>({ok:false,reason});
export const MAX_TOURISM_ABSENCE=8*3600000;
function fresh(now){return {attractions:{},visitors:0,revenue:0,milestones:[],lastAt:now,fraction:0,festival:null,trophies:[],festivalHistory:[],lastRates:{visitors:0,revenue:0},guests:[],receipts:[],nextGuest:1,admissions:0,arrivalFraction:0,arrivalBudget:0,spentRevenue:0,completedTours:0,spentByVenue:{},unusedVouchers:0};}
export class Tourism {
 constructor(game){this.game=game;this.acc=0;game.bus.on('building:placed',b=>{if(ATTRACTIONS[b.type])b.level=this.attraction(b.type).phase+1;});}
 get data(){const city=this.game.state.city ||= {},d=city.tourism ||= fresh(Date.now()),base=fresh(Date.now());const legacy=d.guests===undefined;if(legacy){d.admissions=Math.floor(d.visitors||0);d.nextGuest=d.admissions+1;d.arrivalFraction=Math.max(0,(d.visitors||0)-d.admissions);d.arrivalBudget=0;d.spentRevenue=d.revenue||0;}for(const key in base)if(d[key]===undefined)d[key]=base[key];return d;}
 writable(){return !!this.game.state&&!this.game.isDemo&&!this.game.visit;}
 reset(){this.acc=0;this.buildingWorld=null;this.networkKey=null;this.routeVersion=-1;this.data;this.syncFestival();}
 changed(visual=false){this.game.sim.markDirty();this.game.bus.emit('tourism:changed');if(visual)this.game.bus.emit('city:appearance');this.game.save?.();}
 attraction(type){return this.data.attractions[type]||{phase:0,readyAt:0};}
 building(type){
  const w=this.game.world;if(this.buildingWorld!==w||this.buildingVersion!==w.version){this.buildingWorld=w;this.buildingVersion=w.version;this.allBuildings=[...w.buildings.values()];this.buildingsByType=new Map();for(const b of this.allBuildings){if(!this.buildingsByType.has(b.type))this.buildingsByType.set(b.type,[]);this.buildingsByType.get(b.type).push(b);}}
  return this.buildingsByType.get(type)?.find(b=>!b.cons?.k)||null;
 }
 network(){
  this.building('park_gate');const w=this.game.world,info=this.game.sim.info;
  const relevant=this.allBuildings.filter(b=>ATTRACTIONS[b.type]||b.type==='station'||['restaurant','cafe','tea','hotel'].includes(BUILDINGS[b.type]?.catalogue?.family));
  const key=w.version+':'+this.game.sim.netVersion+'|'+relevant.map(b=>`${b.id}:${b.level}:${b.cons?.k||''}:${!!b.fire}:${!!info.get(b.id)?.connected}:${info.get(b.id)?.eff===0}:${this.data.attractions[b.type]?.phase||0}`).join(',');
  if(this.networkKey!==key){this.networkKey=key;this.touristNetwork=buildTouristNetwork(w,info,this.data.attractions,this.game.sim.roadConn);}
  return this.touristNetwork;
 }
 completed(type){return this.attraction(type).phase===3&&!!this.building(type);}
 start(type){
  if(!this.writable())return fail('Ouvrez votre propre ville.');
  const rule=ATTRACTIONS[type],p=this.attraction(type);
  if(!rule||!this.building(type))return fail('Posez d’abord cet emplacement dans votre ville.');
  if(this.game.state.mode!=='libre'&&this.game.state.level<rule.level)return fail(`Niveau ${rule.level} requis.`);
  if(p.phase>=3||p.readyAt)return fail('Cette attraction est déjà prête ou en travaux.');
  if(type!=='park_gate'&&!this.completed('park_gate'))return fail('Inaugurez d’abord l’entrée du parc.');
  const phase=rule.phases[p.phase];if(!this.game.actions.canAfford(phase.cost))return fail(this.game.actions.missingText(phase.cost));
  this.game.actions.pay(phase.cost);this.data.attractions[type]={...p,readyAt:Date.now()+(this.game.state.mode==='libre'?1000:phase.seconds*1000)};this.changed();return {ok:true};
 }
 finish(type){
  if(!this.writable())return fail('Ouvrez votre propre ville.');
  this.advance();const p=this.attraction(type),b=this.building(type);if(!ATTRACTIONS[type]||!b||!p.readyAt||Date.now()<p.readyAt)return fail('Les travaux ne sont pas terminés.');
  p.phase=Math.min(3,p.phase+1);p.readyAt=0;this.data.attractions[type]=p;b.level=p.phase+1;
  this.game.bus.emit('building:upgraded',b);this.game.prog.addXP(80*p.phase,'tourism');this.changed(true);return {ok:true};
 }
 rates(){
  let visitors=0,revenue=0,active=[];
  const gate=this.building('park_gate');if(!this.completed('park_gate')||gate.fire||!this.game.sim.info.get(gate.id)?.connected)return {visitors,revenue,active,beauty:0,refreshment:0,arrivalFactor:1};
  const network=this.network();
  for(const [type,a]of Object.entries(ATTRACTIONS)){
   const b=this.building(type);if(!b||b.fire||!this.completed(type)||!this.game.sim.info.get(b.id)?.connected)continue;
   if(network.usable&&type!=='park_gate'&&!network.attractions.some(n=>n.id===b.id))continue;
   active.push(type);visitors+=a.visitors;revenue+=a.visitors*a.ticket;
  }
  const festival=this.syncFestival();if(festival.claimed.length===3){visitors*=1.25;revenue*=1.25;}
  revenue=revenue*(1+network.beauty)+visitors*network.refreshment;
  visitors*=network.arrivalFactor;revenue*=network.arrivalFactor;
  return {visitors,revenue,active,beauty:network.beauty,refreshment:network.refreshment,arrivalFactor:network.arrivalFactor};
 }
 // Admission revenue pays for a park pass and any refreshment vouchers up front.
 // Visits redeem that same budget; neither the renderer nor venue visits mint coins.
 bookArrivals(count,amount,now,rate){
  const d=this.data;d.arrivalFraction+=count;d.arrivalBudget+=amount;
  const n=Math.floor(d.arrivalFraction+1e-9);if(!n)return;
  const budget=d.arrivalBudget/d.arrivalFraction;d.arrivalFraction=Math.max(0,d.arrivalFraction-n);d.arrivalBudget=Math.max(0,d.arrivalBudget-n*budget);d.admissions+=n;
  const network=this.network(),skip=Math.max(0,n-64);d.nextGuest+=skip;d.completedTours+=skip;d.spentRevenue+=skip*budget;
  for(let i=skip;i<n;i++){
   const id=d.nextGuest++,arrivedAt=now-(n-i-1+d.arrivalFraction)*3600000/rate;
   const plan=makeTouristPlan(network,id,arrivedAt,budget);
   const receipt={id,arrivedAt,paid:budget,spent:0,fromTrain:!!plan?.fromTrain,status:plan?'visiting':'completed',venues:plan?plan.legs.filter(l=>l.kind==='visit').map(l=>({id:l.venue,type:l.type,amount:l.amount})):[]};
   d.receipts.push(receipt);
   if(plan)d.guests.push(plan);else{receipt.spent=budget;d.spentRevenue+=budget;d.completedTours++;}
  }
  d.receipts=d.receipts.slice(-64);
  // High-flow parks retain complete aggregate accounts, with bounded visible detail.
  while(d.guests.length>MAX_VISIBLE_TOURISTS){const g=d.guests.shift();this.settleGuest(g,g.leavesAt);d.completedTours++;}
 }
 settleGuest(guest,now){
  const d=this.data,receipt=d.receipts.find(r=>r.id===guest.id);
  while(guest.settled<guest.legs.length){const leg=guest.legs[guest.settled];if(leg.endAt>now)break;guest.settled++;
   if(leg.kind!=='visit')continue;d.spentRevenue+=leg.amount;d.spentByVenue[leg.type]=(d.spentByVenue[leg.type]||0)+leg.amount;if(receipt)receipt.spent+=leg.amount;
  }
  if(receipt&&now>=guest.leavesAt)receipt.status='completed';
 }
 settleGuests(now){
  const d=this.data,w=this.game.world,validate=this.routeVersion!==w.version;this.routeVersion=w.version;
  const keep=[];for(const guest of d.guests){this.settleGuest(guest,now);
   if(now>=guest.leavesAt){d.completedTours++;continue;}
   if(validate&&!touristPlanValid(guest,w,now)){const r=d.receipts.find(r=>r.id===guest.id);if(r)r.status='interrupted';d.unusedVouchers+=Math.max(0,guest.paid-(r?.spent||0));continue;}
   keep.push(guest);
  }d.guests=keep;
 }

 syncFestival(now=Date.now()){
  const c=festivalCalendar(now),d=this.data;
  if(d.festival?.id!==c.id){if(d.festival)d.festivalHistory.push({id:d.festival.id,points:d.festival.points,claimed:[...d.festival.claimed]});d.festivalHistory=d.festivalHistory.slice(-12);d.festival={id:c.id,points:0,claimed:[],donated:{}};}
  return d.festival;
 }
 advance(now=Date.now(),{bot=false}={}){
  if(!this.writable()&&!(bot&&this.game.state?.botCity))return;
  const d=this.data,prior=Number.isFinite(d.lastAt)?d.lastAt:now,elapsed=Math.max(0,Math.min(MAX_TOURISM_ABSENCE,now-prior));
  // Avancer le curseur AVANT le crédit évite de rejouer l'absence après une sauvegarde.
  if(now<prior)return;d.lastAt=now;this.syncFestival(now);this.settleGuests(now);
  const current=this.rates(),last=d.lastRates||current;d.lastRates={visitors:current.visitors,revenue:current.revenue};
  const rate={visitors:Math.min(current.visitors,last.visitors),revenue:Math.min(current.revenue,last.revenue)};if(!elapsed||!rate.visitors)return;
  const count=elapsed/3600000*rate.visitors;d.visitors+=count;
  const amount=elapsed/3600000*rate.revenue;d.revenue+=amount;this.bookArrivals(count,amount,now,rate.visitors);this.settleGuests(now);
  this.game.actions.grant({coins:amount});
  if(this.game.state.stats)this.game.state.stats.coinsEarned=(this.game.state.stats.coinsEarned||0)+amount;
  this.game.sim.markDirty();
 }
 claimMilestone(index){
  if(!this.writable())return fail('Ouvrez votre propre ville.');
  const rule=PARK_MILESTONES[index],d=this.data;if(!Number.isInteger(index)||!rule||d.visitors+1e-6<rule.visitors||d.milestones.includes(index))return fail('Ce palier a déjà été reçu ou attend plus de visiteurs.');
  d.milestones.push(index);this.game.actions.grant({coins:rule.coins});this.game.prog.addXP(rule.xp,'tourism');this.changed();return {ok:true};
 }
 donate(res,amount){
  if(!this.writable())return fail('Ouvrez votre propre ville.');
  const value=FESTIVAL_VALUES[res];amount=Number(amount);if(!value||!Number.isInteger(amount)||amount<1||amount>100)return fail('Choisissez entre 1 et 100 marchandises.');
  if(!this.completed('park_gate'))return fail('Inaugurez l’entrée du parc pour organiser votre fête.');
  const f=this.syncFestival();if(f.points>=700)return fail('La fête est prête ! Recevez vos récompenses.');
  amount=Math.min(amount,Math.ceil((700-f.points)/value));const cost={[res]:amount};if(!this.game.actions.canAfford(cost))return fail(this.game.actions.missingText(cost));
  this.game.actions.pay(cost);f.points=Math.min(700,f.points+amount*value);f.donated[res]=(f.donated[res]||0)+amount;this.changed(true);return {ok:true};
 }
 claimFestival(index){
  if(!this.writable())return fail('Ouvrez votre propre ville.');
  const r=FESTIVAL_STAGES[index],f=this.syncFestival();if(!Number.isInteger(index)||!r||f.points<r.points||f.claimed.includes(index))return fail('Ce palier n’est pas disponible.');
  f.claimed.push(index);this.game.actions.grant({coins:r.coins});this.game.prog.addXP(r.xp,'festival');
  if(index===2){
   const theme=festivalCalendar(),season=theme.id.split('-')[0];if(!this.data.trophies.includes(season))this.data.trophies.push(season);
   // Le décor est un vrai élément de la collection, ensuite constructible depuis Exclusifs.
   // Une décoration déjà possédée ne se convertit pas en gemmes à chaque fête.
   const meta=this.game.meta;
   if(this.game.state.mode!=='libre'&&meta&&!meta.ownsDecor(theme.decor)){meta.grant({decor:theme.decor},'festival');meta.save();}
  }
  this.changed(true);return {ok:true};
 }
 tick(dt){if(!this.writable())return;this.acc+=dt;if(this.acc<1)return;this.acc=0;this.advance();}
}
