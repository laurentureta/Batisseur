// Capucine est une maire simulée sur cet appareil : sa ville utilise la même économie,
// les mêmes routes, habitants et ateliers que la partie du joueur, dans une île entièrement achevée.
import { buildBotIsland, refreshIslandRelief, ISLAND_LAYOUT_VERSION, ISLAND_CAMERA } from './botIsland.js';
import { createNewState, migrateState } from '../core/state.js';
import { GameCore } from '../core/GameCore.js';
import { serialize } from '../core/save.js';
import { advanceWorkshopState, ensureWorkshops } from '../sim/Workshop.js';
import { RECIPE_BY_ID } from '../data/recipes.js';
import { BUILDINGS } from '../data/buildings.js';

export const BOT = { id: 'bot-capucine', bot: true, code: 'BOT', name: 'Capucine', avatar: '👸', village: 'Bellerive', level: 100, pop: 1072, has_village: true };
export const BOT_STORE = 'batisseur.bot.city.v6';
export const BOT_MAX_CATCHUP = 180; // secondes simulées à chaque retour : travail borné sur mobile
const SEED = 20260101;
const storageOrNull = () => { try { return globalThis.localStorage; } catch { return null; } };

function readBot(storage) {
  try {
    const st = JSON.parse(storage?.getItem(BOT_STORE) || 'null');
    if (st?.botCity?.version === ISLAND_LAYOUT_VERSION && st.seed === SEED && st.map?.terrain && st.map?.road && Array.isArray(st.buildings) && st.buildings.length > 20) return migrateState(st);
  } catch { /* une sauvegarde locale invalide est reconstruite sans toucher à la partie */ }
  return null;
}

export function botSummary(storage = storageOrNull()) {
  const st = readBot(storage);
  return { ...BOT, ...(st ? { level: st.level, pop: st.summary?.pop || 0, developments: st.botCity.developments || 0, finished:true } : {}), simulated: true };
}

/** L'état persistant est indépendant des trois emplacements du joueur. */
export function botState(now = Date.now(), storage = storageOrNull()) {
  let st = readBot(storage);
  const game = new GameCore({ fires: false });
  if (!st) {
    st = createNewState({ name: BOT.village, preset: 'ile', mode: 'carriere', seed: SEED });
    st.level = 100; st.zones.fill(true); st.time = { day: 8.68, speed: 1 };
    st.cosmetics = { roof: 'mix' }; st.flags.welcome = true;
    Object.assign(st.res, { coins: 1000000, food: 9000, wood: 5000, stone: 5000, wheat: 5000, flour: 5000, planks: 5000, clay: 5000, bricks: 5000, iron: 5000, tools: 5000 });
    st.botCity = { version: ISLAND_LAYOUT_VERSION, lastAt: now, developments: 0, finished:true,camera:ISLAND_CAMERA };
    try { const legacy=JSON.parse(storage?.getItem('batisseur.bot.city.v5')||'null');st.botCity.giftsReceived=legacy?.botCity?.giftsReceived||0; } catch { /* ancienne ville indisponible */ }
    game.loadState(st, { demo: true });
    populateBot(game.world);
    game.prog.recount(); game.sim.recalc();
  } else {
    game.loadState(st, { demo: true });
    populateBot(game.world);
    const elapsed = Math.max(0, now - st.botCity.lastAt) / 1000;
    simulateBot(game, Math.min(BOT_MAX_CATCHUP, elapsed));

  }
  tickBotWorkshops(game,now);
  game.tourism?.advance(now,{bot:true});
  st.botCity.lastAt = Math.max(st.botCity.lastAt || 0, now);
  saveBotCity(game, storage, now);
  return JSON.parse(serialize(game));
}

/** Île entièrement inaugurée : aucun chantier automatique ni création de nouveaux lots. */
export function populateBot(world) {
  if (world.state.botCity?.populated && world.state.botCity.version===ISLAND_LAYOUT_VERSION) {refreshIslandRelief(world);world.trees?.rebuild();return population(world);}
  return buildBotIsland(world,world.state.botCity?.lastAt||Date.now());
}
const population = (world) => Math.round([...world.buildings.values()].reduce((n,b)=>n+(b.residents||0),0));

// Évolution reproductible : la météo et les incidents aléatoires du joueur ne modifient pas le bot.
function simulateBot(game, seconds, live = false) {
  const original = game.events.onNewDay;
  game.events.onNewDay = (day) => { game.state.events.active=[]; game.state.events.merchant=null; game.state.weather={kind:'clear',day}; };
  try { if (live) game.sim.update(Math.max(0,seconds)); else game.sim.advance(Math.max(0,seconds)); } finally { game.events.onNewDay=original; }
}
export function saveBotCity(game,storage=storageOrNull(),now=Date.now()) {
  if(!game.state?.botCity || !game.world) return false;
  game.state.botCity.lastAt=Math.max(game.state.botCity.lastAt||0,now);
  try { storage?.setItem(BOT_STORE,serialize(game)); Object.assign(BOT,{level:game.state.level,pop:population(game.world)}); return !!storage; } catch { return false; }
}

/** Une visite montre l'économie réelle, sans enregistrer quoi que ce soit dans le village du joueur. */
export function tickBotVisit(game,dt,now=Date.now()) {
  if(!game.state?.botCity) return;
  simulateBot(game,Math.min(0.25,Math.max(0,dt)),true);
  tickBotWorkshops(game,now);
  if(now>=(game.state.botCity.tourismAt||0)+1000){game.state.botCity.tourismAt=now;game.tourism?.advance(now,{bot:true});}
  game.state.botCity.liveSave=(game.state.botCity.liveSave||0)+dt;
  if(game.state.botCity.liveSave>=20) { game.state.botCity.liveSave=0; saveBotCity(game,storageOrNull(),now); }
}

export function grantBotGift(kind,amount,storage=storageOrNull(),now=Date.now(),game=null) {
  if(!['coins','wood','stone','food'].includes(kind)||!Number.isFinite(amount)||amount<=0) return false;
  const st=game?.state?.botCity ? game.state : botState(now,storage);
  st.res[kind]=(st.res[kind]||0)+amount;
  st.botCity.giftsReceived=(st.botCity.giftsReceived||0)+1;
  st.botCity.giftTotals ||= {};st.botCity.giftTotals[kind]=(st.botCity.giftTotals[kind]||0)+amount;
  if(game?.state===st) return saveBotCity(game,storage,now);
  try { if(!storage) return false; storage.setItem(BOT_STORE,JSON.stringify(st)); return true; } catch { return false; }
}

// Capucine réserve les mêmes matières premières que le joueur. Une seule file réelle par atelier,
// sans fabrication rétroactive illimitée : un retour règle le lot fini, puis commande le suivant.
export function tickBotWorkshops(game,now=Date.now()) {
 const st=game.state;if(!st?.botCity)return;
 if(now<(st.botCity.workshopAt||0)+1000)return;
 st.botCity.workshopAt=now;
 const buildings=[...game.world.buildings.values()],data=ensureWorkshops(st);
 advanceWorkshopState(st,now,{buildings,capacity:game.sim.d.storage,operable:b=>!b.cons&&!b.fire&&!!game.sim.info.get(b.id)?.connected});
 const roles=[
   ['sawmill',['planks_batch','furniture']],['forge',['tools_batch','machinery']],['bakery',['pastries','country_bread']],
   ['pasture',['wool']],['pasture',['cheese']],['garden',['jam']],['fashion',['fabric']],['fashion',['clothing']],['pottery',['ceramics']],
 ];
 const used=new Set();st.botCity.workshopTurns ||= {};
 for(const [role,recipes]of roles){
   const b=buildings.find(b=>!used.has(b.id)&&(b.type===role||BUILDINGS[b.type].catalogue?.family===role));
   if(!b)continue;used.add(b.id);
   const e=data.byBuilding[b.id] ||= {queue:[],lastAt:now,capacity:game.sim.d.storage,operable:true};
   if(e.queue.length||!game.sim.info.get(b.id)?.connected)continue;
   const turn=st.botCity.workshopTurns[b.id]||0,recipe=RECIPE_BY_ID[recipes[turn%recipes.length]];
   if(!recipe||Object.entries(recipe.inputs).some(([r,n])=>(st.res[r]||0)<n))continue;
   if(Object.entries(recipe.outputs).some(([r,n])=>(st.res[r]||0)+n>game.sim.d.storage))continue;
   for(const [r,n]of Object.entries(recipe.inputs))st.res[r]-=n;
   e.queue.push({id:data.nextId++,recipe:recipe.id,name:recipe.name,seconds:recipe.seconds,inputs:{...recipe.inputs},outputs:{...recipe.outputs},startedAt:now,readyAt:now+recipe.seconds*1000});
   e.lastAt=now;e.capacity=game.sim.d.storage;e.operable=true;st.botCity.workshopTurns[b.id]=turn+1;
 }
 game.sim.markDirty();
}
