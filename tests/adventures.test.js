import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Cooperative } from '../src/net/Cooperative.js';
import { ADVENTURES, ADVENTURE_DECOR } from '../src/data/adventures.js';
import { BUILDINGS } from '../src/data/buildings.js';
function fixture(rpc){
 const book={coopLedger:{},settlements:{home:{snapshot:{res:{wood:0,coins:0}}}}},owned=[];
 const game={state:{slot:0,regionId:'home',name:'Test',mode:'carriere',res:{wood:100,coins:0}},city:{book},bus:{emit(){}},sim:{markDirty(){}},save:()=>true,meta:{p:{owned:{decor:owned}},ownsDecor:id=>owned.includes(id),save(){}},online:{ensure:async()=>{},auth:()=>({p_id:'fixture',p_secret:'local-test-only'}),rpc}};
 const c=new Cooperative(game);c.adventureConnected=true;return {game,c,book,owned};
}
test('aventures : règles d’affichage identiques aux règles serveur et décors constructibles',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/006_coop_adventures.sql',import.meta.url),'utf8');
 for(const[kind,rule]of Object.entries(ADVENTURES)){
  const json=sql.match(new RegExp(`when '${kind}' then '([^']+)'`));assert.ok(json);const server=JSON.parse(json[1]);
  assert.equal(server.decor,rule.decor);assert.equal(rule.stages.length,3);
  for(let i=0;i<3;i++)assert.deepEqual(server.stages[i],{resource:rule.stages[i].resource,goal:rule.stages[i].goal,coins:rule.stages[i].coins});
  assert.ok(BUILDINGS[rule.decor]?.exclusive);assert.equal(BUILDINGS[rule.decor].cat,'decor');
 }
 assert.equal(new Set(ADVENTURE_DECOR).size,3);
});
test('aventures : réservation et reprise réseau utilisent le reçu partagé, sans double débit',async()=>{
 let count=0,operation;
 const {c,game}=fixture(async(fn,args)=>{assert.equal(fn,'bat_adventure');assert.equal(args.p_action,'contribute');if(!operation)operation=args.p_operation;else assert.equal(args.p_operation,operation);if(++count===1)throw new Error('Réseau perdu');return {view:{owned:[]},grant:{},cosmetics:[]};});
 await assert.rejects(c.performAdventure('contribute',{cycle:1,phase:0,kind:'wood'}));assert.equal(game.state.res.wood,80);assert.equal(c.pending().channel,'adventure');
 await c.retry();assert.equal(game.state.res.wood,80);assert.equal(c.pending(),undefined);assert.equal(count,2);
});
test('aventures : une phase dépassée rend les marchandises, les autres actions restent disponibles',async()=>{
 const {c,game}=fixture(async()=>{const e=new Error('etape deja avancee');e.status=400;e.serverMessage=e.message;throw e;});
 await assert.rejects(c.performAdventure('contribute',{cycle:1,phase:0,kind:'wood'}),/terminé cette étape/);assert.equal(game.state.res.wood,100);assert.equal(c.pending(),undefined);
});
test('aventures : pièces et décoration durablement enregistrées, aucun doublon converti en gemmes',async()=>{
 const {c,game,book,owned}=fixture(async()=>({view:{owned:['x_watchtower']},grant:{coins:1400},cosmetics:['x_watchtower']}));
 await c.performAdventure('claim');assert.equal(game.state.res.coins,1400);assert.deepEqual(book.adventureDecor,['x_watchtower']);assert.deepEqual(owned,['x_watchtower']);
 c.restoreAdventureDecor(['x_watchtower','unknown-hack']);assert.deepEqual(owned,['x_watchtower']);
 const operation=Object.values(book.coopLedger)[0];await c.resolve(operation);assert.equal(game.state.res.coins,1400);assert.deepEqual(owned,['x_watchtower']);
});
test('aventures : sauvegarde échouée après serveur permet reprise sans perdre ni doubler les gains',async()=>{
 const {c,game,book,owned}=fixture(async()=>({view:{owned:['x_gold_statue']},grant:{coins:800},cosmetics:['x_gold_statue']}));
 let saves=0;game.save=()=>++saves!==2;
 await assert.rejects(c.performAdventure('claim'),/sauvegarde indisponible/);assert.equal(game.state.res.coins,0);assert.deepEqual(book.adventureDecor,[]);assert.deepEqual(owned,[]);assert.ok(c.pending());
 await c.retry();assert.equal(game.state.res.coins,800);assert.deepEqual(owned,['x_gold_statue']);
});
test('aventures : refus reçu après changement d’emplacement ne rembourse pas le mauvais village',async()=>{
 let reject;const response=new Promise((_,r)=>reject=r);
 const {c,game,book}=fixture(()=>response);
 const sent=c.performAdventure('contribute',{cycle:1,phase:0,kind:'wood'});const original=game.state;
 game.state={...original,slot:1,res:{wood:500,coins:0}};game.city.book={coopLedger:{},settlements:{}};
 const e=new Error('etape deja avancee');e.status=400;reject(e);
 await assert.rejects(sent,/village d’origine/);assert.equal(game.state.res.wood,500);assert.equal(original.res.wood,80);assert.equal(Object.values(book.coopLedger)[0].status,'pending');
});
test('aventures : serveur absent reste indisponible et ne simule aucun progrès partagé',async()=>{
 const {c}=fixture(async()=>{const e=new Error('missing');e.code='PGRST202';e.status=404;throw e;});c.adventureConnected=false;
 await c.connectAdventures();assert.equal(c.adventureConnected,false);assert.match(c.error,/pas encore activées/);assert.equal(c.adventureView,null);
});
