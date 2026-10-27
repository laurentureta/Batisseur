// Capucine est une maire simulée sur cet appareil : sa ville utilise la même économie,
// les mêmes routes, habitants, coûts et chantiers que la partie du joueur.
import { T, CENTER } from '../world/constants.js';
import { BUILDINGS, sizeOf, residentsAt } from '../data/buildings.js';
import { createNewState, migrateState } from '../core/state.js';
import { GameCore } from '../core/GameCore.js';
import { serialize } from '../core/save.js';

export const BOT = { id: 'bot-capucine', bot: true, code: 'BOT', name: 'Capucine', avatar: '👸', village: 'Bellerive', level: 18, pop: 384, has_village: true };
export const BOT_STORE = 'batisseur.bot.city.v5';
export const BOT_MAX_CATCHUP = 180; // secondes simulées à chaque retour : travail borné sur mobile
const SEED = 20260101, B = 5, NB = 7, ORIGIN = CENTER - 18;
const bx = (n) => ORIGIN + n * B + 1;
const storageOrNull = () => { try { return globalThis.localStorage; } catch { return null; } };

function readBot(storage) {
  try {
    const st = JSON.parse(storage?.getItem(BOT_STORE) || 'null');
    if (st?.botCity?.version === 1 && st.seed === SEED && st.map?.terrain && st.map?.road && Array.isArray(st.buildings) && st.buildings.length > 20) return migrateState(st);
  } catch { /* une sauvegarde locale invalide est reconstruite sans toucher à la partie */ }
  return null;
}

export function botSummary(storage = storageOrNull()) {
  const st = readBot(storage);
  return { ...BOT, ...(st ? { level: st.level, pop: st.summary?.pop || 0, developments: st.botCity.developments || 0 } : {}), simulated: true };
}

/** L'état persistant est indépendant des trois emplacements du joueur. */
export function botState(now = Date.now(), storage = storageOrNull()) {
  let st = readBot(storage);
  const game = new GameCore({ fires: false });
  if (!st) {
    st = createNewState({ name: BOT.village, preset: 'vallee', mode: 'carriere', seed: SEED });
    st.level = 18; st.zones.fill(true); st.time = { day: 8.32, speed: 1 };
    st.cosmetics = { roof: 'mix' }; st.flags.welcome = true;
    Object.assign(st.res, { coins: 12000, food: 1500, wood: 900, stone: 900, wheat: 450, flour: 450, planks: 400, clay: 450, bricks: 300, iron: 150, tools: 120 });
    st.botCity = { version: 1, lastAt: now, nextBuildAt: now + 60000, plan: 0, developments: 0 };
    game.loadState(st, { demo: true });
    populateBot(game.world);
    game.prog.recount(); game.sim.recalc();
  } else {
    game.loadState(st, { demo: true });
    const elapsed = Math.max(0, now - st.botCity.lastAt) / 1000;
    simulateBot(game, Math.min(BOT_MAX_CATCHUP, elapsed));
    completeBotSites(game, now);
    developBot(game, now);
  }
  st.botCity.lastAt = Math.max(st.botCity.lastAt || 0, now);
  saveBotCity(game, storage, now);
  return JSON.parse(serialize(game));
}

/** Construit une fois une vraie ville alimentée, reliée et entièrement employée. */
export function populateBot(world) {
  if (world.state.botCity?.populated) return population(world);
  for (const b of [...world.buildings.values()]) world.removeBuilding(b.id);
  // Une plaine centrale aménagée, entourée des ressources réellement utilisées par les ateliers.
  for (let z = ORIGIN - 3; z <= ORIGIN + NB * B + 3; z++) for (let x = ORIGIN - 3; x <= ORIGIN + NB * B + 3; x++) world.terrain[world.idx(x,z)] = T.GRASS;
  for (let n = 0; n <= NB; n++) for (let t = 0; t <= NB * B; t++) {
    world.road[world.idx(ORIGIN + n * B, ORIGIN + t)] = 2;
    world.road[world.idx(ORIGIN + t, ORIGIN + n * B)] = 2;
  }
  for (let z = ORIGIN - 3; z < ORIGIN; z++) for (let x = ORIGIN; x < ORIGIN + 5; x++) world.terrain[world.idx(x,z)] = x < ORIGIN + 2 ? T.ROCK : T.MOUNTAIN;
  for (let z = bx(1); z < bx(2) + 4; z++) for (let x = ORIGIN - 3; x < ORIGIN; x++) world.terrain[world.idx(x,z)] = T.FOREST;
  for (let z = bx(3); z < bx(3) + 4; z++) for (let x = ORIGIN - 3; x < ORIGIN; x++) world.terrain[world.idx(x,z)] = T.WATER;
  let id = 1;
  const place = (type, x, z, level = 1, rot = 0) => {
    const def = BUILDINGS[type]; if (!def) return null;
    const [w,d] = sizeOf(def,rot);
    for (let dz=0;dz<d;dz++) for(let dx=0;dx<w;dx++) { const i=world.idx(x+dx,z+dz); if(world.occ[i]>=0||world.road[i]||world.terrain[i]!==T.GRASS) return null; }
    const b = { id:id++,type,x,z,rot,level:Math.min(level,def.maxLevel),born:0 };
    if (def.residents) { b.residents=residentsAt(def,b.level); b.appearance={facade:['ivory','sage','peach','sky'][b.id%4],roof:'mix',garden:b.id%2?'flowers':'hedge'}; }
    world.addBuilding(b); return b;
  };
  const block = (x,z,items) => { for(const [type,dx,dz,lvl] of items) place(type,bx(x)+dx,bx(z)+dz,lvl||1); };
  block(3,3,[['townhall',0,2,4],['fountain',3,3],['flowers',3,0],['statue',0,0]]);
  for (const [x,z] of [[2,2],[3,2],[4,2],[2,3],[4,3],[2,4],[3,4],[4,4]]) {
    for (const [dx,dz] of [[0,0],[1,0],[3,0],[0,3],[2,3],[3,3]]) place('house',bx(x)+dx,bx(z)+dz,3);
    place('flowers',bx(x)+2,bx(z)); place('bench',bx(x)+1,bx(z)+3);
  }
  block(0,0,[['quarry',0,0,3],['mine',3,0,3]]);
  block(0,1,[['lumber',0,0,4],['sawmill',3,0,3],['lumber',0,3,4]]);
  block(0,2,[['farm',0,0,3],['farm',2,2,3],['mill',3,0,3],['bakery',0,3,3]]);
  block(0,3,[['claypit',0,0,3],['fisher',0,3,3],['brickworks',3,0,3],['forge',3,3,3]]);
  for (const [x,z] of [[1,0],[2,0],[1,1],[2,1]]) block(x,z,[['pasture',0,0,3],['pasture',2,2,3],['garden',3,0,3],['coop',0,3,3]]);
  block(1,3,[['depot',0,0,6],['watertower',3,0,3],['school',0,3,4],['police',3,3,4]]);
  block(3,1,[['station',0,0,1],['bandstand',3,3]]);
  block(4,1,[['park',0,0,3],['clinic',3,0,4],['firestation',3,3,4]]);
  block(1,2,[['market',3,0,3],['tavern',3,3,3],['shop',0,0,3],['well',0,3,3]]);
  block(1,4,[['park',0,0,3],['school',3,0,4],['clinic',0,3,4],['watertower',3,3,3]]);
  block(5,2,[['market',0,0,3],['clinic',0,3,4],['school',3,0,4],['watertower',3,3,3]]);
  block(5,3,[['park',0,0,3],['police',0,3,4],['firestation',3,0,4]]);
  block(5,4,[['shop',0,0,3],['tavern',0,3,3],['well',3,0,3],['bandstand',3,3]]);
  world.state.nextId=id; world.state.botCity ||= { version:1,lastAt:Date.now(),nextBuildAt:Date.now()+60000,plan:0,developments:0 };
  world.state.botCity.populated=true;
  world.state.stats.popRecord=population(world);
  world.state.stats.built=Object.fromEntries([...new Set([...world.buildings.values()].map(b=>b.type))].map(t=>[t,[...world.buildings.values()].filter(b=>b.type===t).length]));
  world.state.stats.totalBuilt=world.buildings.size;
  world.version++; world.terrainVersion++; world.trees?.rebuild();
  return population(world);
}
const population = (world) => Math.round([...world.buildings.values()].reduce((n,b)=>n+(b.residents||0),0));

// Évolution reproductible : la météo et les incidents aléatoires du joueur ne modifient pas le bot.
function simulateBot(game, seconds, live = false) {
  const original = game.events.onNewDay;
  game.events.onNewDay = (day) => { game.state.events.active=[]; game.state.events.merchant=null; game.state.weather={kind:day%5===0?'cloudy':'clear',day}; };
  try { if (live) game.sim.update(Math.max(0,seconds)); else game.sim.advance(Math.max(0,seconds)); } finally { game.events.onNewDay=original; }
}
function completeBotSites(game,now) {
  for (const b of game.world.buildings.values()) if (b.cons && (b.cons.ready || (b.cons.rs != null && game.construction.realProgress(b.cons,now)>=1))) {
    game.construction.finish(b); game.state.botCity.developments++;
  }
}
// Les emplacements de ce quartier sont réservés : les nouveaux habitants sont tous près d'une rue.
const PLAN = [
  ...[5,6].flatMap(z=>[1,2,3,4,5].flatMap(x=>[['house',bx(x),bx(z)],['house',bx(x)+3,bx(z)+3]])),
  ['park',bx(6),bx(3)],['market',bx(6),bx(2)],['school',bx(6),bx(4)],['clinic',bx(6),bx(5)],
];
function developBot(game,now) {
  const data=game.state.botCity;
  if(now<data.nextBuildAt || [...game.world.buildings.values()].some(b=>b.cons)) return false;
  data.nextBuildAt=now+60000;
  while(data.plan<PLAN.length) {
    const [type,x,z]=PLAN[data.plan];
    if(game.world.buildingAt(x,z)) {data.plan++;continue;}
    const result=game.actions.placeBuilding(type,x,z,0);
    if(result.ok) { if(result.building.cons) result.building.cons.rs=now; data.plan++;data.lastWork=BUILDINGS[type].name;return true;}
    return false;
  }
  // Lorsque le nouveau quartier est plein, améliorer les logements selon les vrais besoins.
  for(const b of game.world.buildings.values()) if(b.type==='house'&&!b.cons&&b.level<4) {
    const result=game.actions.upgrade(b.id);
    if(result.ok) {if(result.building.cons) result.building.cons.rs=now; data.lastWork='Amélioration d’une maison';return true;}
  }
  return false;
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
  completeBotSites(game,now);
  developBot(game,now);
  game.state.botCity.liveSave=(game.state.botCity.liveSave||0)+dt;
  if(game.state.botCity.liveSave>=20) { game.state.botCity.liveSave=0; saveBotCity(game,storageOrNull(),now); }
}

export function grantBotGift(kind,amount,storage=storageOrNull(),now=Date.now(),game=null) {
  if(!['coins','wood','stone','food'].includes(kind)||!Number.isFinite(amount)||amount<=0) return false;
  const st=game?.state?.botCity ? game.state : botState(now,storage);
  st.res[kind]=(st.res[kind]||0)+amount;
  st.botCity.giftsReceived=(st.botCity.giftsReceived||0)+1;
  if(game?.state===st) return saveBotCity(game,storage,now);
  try { if(!storage) return false; storage.setItem(BOT_STORE,JSON.stringify(st)); return true; } catch { return false; }
}
