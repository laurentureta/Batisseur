import { BUILDINGS } from '../data/buildings.js';
import { CRAFTED_GOODS, RECIPE_BY_ID, WORKSHOP_QUEUE_LIMIT, recipesForDefinition, hasWorkshopQueue } from '../data/recipes.js';
import { RESOURCES } from '../data/resources.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=reason=>({ok:false,reason});
function saved(game){try{return game.save?.()===true;}catch{return false;}}
export function ensureWorkshops(state){
 state.city ||= {};
 const data=state.city.workshops ||= {nextId:1,byBuilding:{}};
 data.nextId ||= 1;data.byBuilding ||= {};
 return data;
}
function refund(state,job){for(const [r,n]of Object.entries(job.inputs))state.res[r]=(state.res[r]||0)+n;}
/** Pure state mutation, shared with inactive cities. Finite queue, no automatic repetitions. */
export function advanceWorkshopState(state,now,{buildings=state.buildings||[],capacity=null,operable=null}={}){
 const data=state.city?.workshops;if(!data)return {changed:false,completed:0,refunded:0};
 state.stats ||= {};state.stats.produced ||= {};
 const map=new Map([...buildings].map(b=>[b.id,b]));let changed=false,completed=0,refunded=0;
 for(const [id,e]of Object.entries(data.byBuilding)){
  if(!e.queue?.length)continue;
  const b=map.get(Number(id)),clock=Math.max(Number(e.lastAt)||0,now);
  if(!b){for(const job of e.queue){refund(state,job);refunded++;}delete data.byBuilding[id];changed=true;continue;}
  const allowed=operable?!!operable(b):e.operable===true&&!b.cons&&!b.fire;
  if(capacity!==null)e.capacity=capacity;
  e.operable=allowed;
  let head=e.queue[0];
  if(!allowed){
   if(!head.paused){head.remaining=Math.max(0,head.readyAt-(e.lastAt||clock));head.paused=true;changed=true;}
   e.lastAt=clock;continue;
  }
  if(head.paused){head.startedAt=clock-(head.seconds*1000-head.remaining);head.readyAt=clock+head.remaining;delete head.remaining;delete head.paused;changed=true;}
  let anchor=clock;
  for(let n=0;n<WORKSHOP_QUEUE_LIMIT&&e.queue.length;n++){
   head=e.queue[0];
   if(!head.readyAt){head.startedAt=anchor;head.readyAt=anchor+head.seconds*1000;changed=true;}
   if(clock<head.readyAt)break;
   const cap=state.mode==='libre'?Infinity:Number(e.capacity)||0;
   const room=Object.entries(head.outputs).every(([r,n])=>(state.res[r]||0)+n<=cap+1e-8);
   if(!room){if(!head.blocked){head.blocked=true;changed=true;}break;}
   for(const [r,n]of Object.entries(head.outputs)){
    state.res[r]=(state.res[r]||0)+n;
    state.stats.produced[r]=(state.stats.produced[r]||0)+n;
    if(state.stats.daily){state.stats.daily.produced ||= {};state.stats.daily.produced[r]=(state.stats.daily.produced[r]||0)+n;}
   }
   anchor=head.blocked?clock:head.readyAt;
   e.queue.shift();completed++;changed=true;
  }
  e.lastAt=clock;
 }
 return {changed,completed,refunded};
}
export class Workshop{
 constructor(game){this.game=game;}
 reset(){if(this.game.state)ensureWorkshops(this.game.state);}
 get data(){return ensureWorkshops(this.game.state);}
 recipesFor(building){const b=typeof building==='object'?building:this.game.world?.buildings.get(Number(building));return recipesForDefinition(BUILDINGS[b?.type]);}
 hasActive(id){return hasWorkshopQueue(this.game.state,id);}
 queue(id){return this.data.byBuilding[id]?.queue||[];}
 canEdit(){const g=this.game;return !!(g.playing&&!g.isDemo&&!g.visit);}
 persist(change){
  const g=this.game,st=g.state,previous={res:{...st.res},stats:clone(st.stats),data:clone(this.data)};
  const result=change();
  if(!result.ok)return result;
  if(saved(g)){g.sim?.markDirty();g.bus.emit('workshop:changed');return result;}
  st.res=previous.res;st.stats=previous.stats;st.city.workshops=previous.data;
  return fail('Sauvegarde impossible : aucune marchandise n’a été engagée.');
 }
 enqueue(id,recipeId){
  if(!this.canEdit())return fail('Ouvrez votre propre village pour fabriquer.');
  const g=this.game,b=g.world.buildings.get(Number(id)),r=RECIPE_BY_ID[recipeId];
  if(!b||!r||!this.recipesFor(b).includes(r))return fail('Cette recette ne se fabrique pas dans ce bâtiment.');
  if(b.cons||b.fire||!g.sim.info.get(b.id)?.connected)return fail('Terminez et reliez cet atelier à la mairie.');
  if(g.state.mode!=='libre'&&g.state.level<r.level)return fail(`Recette disponible au niveau ${r.level}.`);
  if(this.queue(b.id).length>=WORKSHOP_QUEUE_LIMIT)return fail(`La file peut contenir ${WORKSHOP_QUEUE_LIMIT} lots au maximum.`);
  for(const [res,n]of Object.entries(r.inputs))if((g.state.res[res]||0)<n)return fail(`Il manque ${RESOURCES[res].name.toLowerCase()}.`);
  return this.persist(()=>{
   const current=Date.now(),e=this.data.byBuilding[b.id] ||= {queue:[],lastAt:current,capacity:g.sim.d.storage,operable:true};
   const now=Math.max(current,e.lastAt||0);
   for(const [res,n]of Object.entries(r.inputs))g.state.res[res]-=n;
   const job={id:this.data.nextId++,recipe:r.id,name:r.name,seconds:r.seconds,inputs:{...r.inputs},outputs:{...r.outputs},startedAt:0,readyAt:0};
   if(!e.queue.length){job.startedAt=now;job.readyAt=now+r.seconds*1000;e.lastAt=now;}
   e.queue.push(job);e.capacity=g.sim.d.storage;e.operable=true;
   return {ok:true,job};
  });
 }
 cancel(id,jobId){
  if(!this.canEdit())return fail('Ouvrez votre propre village pour modifier la file.');
  const e=this.data.byBuilding[id],index=e?.queue.findIndex(j=>j.id===jobId);
  if(index===undefined||index<0)return fail('Ce lot ne se trouve plus dans la file.');
  return this.persist(()=>{
   const[job]=e.queue.splice(index,1);refund(this.game.state,job);
   if(index===0&&e.queue.length){const next=e.queue[0],now=Math.max(Date.now(),e.lastAt||0);next.startedAt=now;next.readyAt=now+next.seconds*1000;delete next.paused;delete next.remaining;e.lastAt=now;}
   return {ok:true};
  });
 }
 sell(resource,amount){
  if(!this.canEdit()||!CRAFTED_GOODS.includes(resource)||!Number.isInteger(amount)||amount<1||amount>1000)return fail('Vente impossible.');
  if((this.game.state.res[resource]||0)<amount)return fail('Stock insuffisant.');
  return this.persist(()=>{const st=this.game.state,coins=amount*RESOURCES[resource].value;st.res[resource]-=amount;st.res.coins+=coins;st.stats.coinsEarned=(st.stats.coinsEarned||0)+coins;return {ok:true,coins};});
 }
 tick(now=Date.now()){
  const g=this.game;if(!this.canEdit())return {changed:false};
  const states=[g.state,...Object.values(g.state.regionBook?.settlements||{}).map(e=>e.snapshot).filter(Boolean)];
  const backups=states.filter(st=>Object.values(st.city?.workshops?.byBuilding||{}).some(e=>e.queue?.length)).map(st=>({st,res:{...st.res},stats:clone(st.stats),data:clone(st.city.workshops)}));
  let changed=false,completed=0,refunded=0;
  for(const {st}of backups){
   const options=st===g.state?{buildings:g.world.buildings.values(),capacity:g.sim.d.storage,operable:b=>!b.cons&&!b.fire&&!!g.sim.info.get(b.id)?.connected}:{};
   const r=advanceWorkshopState(st,now,options);changed||=r.changed;completed+=r.completed;refunded+=r.refunded;
  }
  if(!changed)return {changed:false};
  if(!saved(g)){for(const b of backups){b.st.res=b.res;b.st.stats=b.stats;b.st.city.workshops=b.data;}return {changed:false,failed:true};}
  g.sim?.markDirty();g.bus.emit('workshop:changed',{completed,refunded});
  return {changed,completed,refunded};
 }
}
