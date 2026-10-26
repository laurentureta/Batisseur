import test from 'node:test';
import assert from 'node:assert/strict';
import { Cooperative } from '../src/net/Cooperative.js';

function fixture(rpc){
 const book={coopLedger:{},settlements:{home:{snapshot:{res:{wood:0,coins:0}}}}};
 const game={state:{slot:0,name:'Village de test',mode:'carriere',regionId:'home',res:{wood:100,coins:0}},city:{book},sim:{markDirty(){}},save:()=>true,online:{ensure:async()=>{},auth:()=>({p_id:'fixture',p_secret:'test-only'}),rpc}};
 const client=new Cooperative(game);client.connected=true;return {client,game,book};
}

test('coopérative : réponse réseau perdue, reprise idempotente sans deuxième débit',async()=>{
 let first=true,calls=0;
 const {client,game}=fixture(async()=>{calls++;if(first){first=false;throw new Error('Réseau interrompu');}return {grant:{},view:{coop:{name:'Test'}}};});
 await assert.rejects(client.perform('contribute',{kind:'wood'}));
 assert.equal(game.state.res.wood,80);assert.ok(client.pending());
 const operation=client.pending().id;await client.retry();
 assert.equal(game.state.res.wood,80);assert.equal(client.pending(),undefined);assert.equal(calls,2);assert.equal(client.ledger[operation].status,'done');
});

test('coopérative : un refus explicite rembourse le village d’origine',async()=>{
 const {client,game}=fixture(async()=>{const error=new Error('limite de contributions du jour');error.status=400;throw error;});
 await assert.rejects(client.perform('contribute',{kind:'wood'}));
 assert.equal(game.state.res.wood,100);assert.equal(client.pending(),undefined);
});

test('coopérative : une récompense est créditée avec son reçu une seule fois',async()=>{
 const {client,game}=fixture(async()=>({grant:{coins:1000,wood:20},view:{coop:null}}));
 await client.perform('claim');assert.equal(game.state.res.coins,1000);assert.equal(game.state.res.wood,120);
 await client.retry();assert.equal(game.state.res.coins,1000);
});

test('coopérative : pas d’appel serveur si stock ou sauvegarde indisponibles',async()=>{
 let calls=0;const {client,game}=fixture(async()=>{calls++;return {};});
 game.state.res.wood=10;await assert.rejects(client.perform('contribute',{kind:'wood'}));assert.equal(calls,0);
 game.state.res.wood=100;game.save=()=>false;
 await assert.rejects(client.perform('contribute',{kind:'wood'}));assert.equal(calls,0);assert.equal(game.state.res.wood,100);
});


test('coopérative : changer de sauvegarde pendant une réponse ne crédite pas le mauvais village',async()=>{
 let release;const wait=new Promise((resolve)=>release=resolve);
 const {client,game,book}=fixture(async()=>wait);
 const operation=client.perform('claim');
 game.state={slot:1,mode:'carriere',regionId:'home',res:{wood:10,coins:5}};
 game.city.book={coopLedger:{},settlements:{}};
 release({grant:{coins:1000},view:{coop:null}});
 await assert.rejects(operation);
 assert.equal(game.state.res.coins,5);
 assert.equal(Object.values(book.coopLedger)[0].status,'pending');
});

test('coopérative : une sauvegarde échouée après réception laisse un reçu reprenable, sans double crédit',async()=>{
 let writes=0;
 const {client,game}=fixture(async()=>({grant:{coins:1000},view:{coop:null}}));
 game.save=()=>++writes!==2;
 await assert.rejects(client.perform('claim'));
 assert.equal(game.state.res.coins,0);assert.ok(client.pending());
 await client.retry();assert.equal(game.state.res.coins,1000);assert.equal(client.pending(),undefined);
});
