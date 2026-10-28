import test from 'node:test';
import assert from 'node:assert/strict';
import { Notifications, notificationEvents, pushSupport } from '../src/net/Notifications.js';
const now=1800000000000;
function fixture(){return {slot:0,regionId:'home',buildings:[{id:2,cons:{rs:now,rd:60000}}],city:{projects:{civic_square:{phase:1,readyAt:now+120000}}},orders:{slots:[null,{}],readyAt:[now+50000,now+30000]},regionBook:{settlements:{island:{snapshot:{buildings:[],city:{projects:{}},orders:{readyAt:[now+200000]}}}},shipments:[{id:1,to:'island',readyAt:now+180000}]}};}
const preferences={construction:true,projects:true,orders:true,shipments:true,gifts:true};
test('notifications : échéances réelles de tous les villages, triées et sans éléments terminés',()=>{
 const state=fixture();state.regionBook.shipments.push({id:2,to:'island',readyAt:now+1000,delivered:true});
 const events=notificationEvents(state,preferences,now);assert.equal(events.length,5);assert.equal(events[0].kind,'orders');assert.match(events.at(-1).tag,/island/);
 state.buildings[0].cons.ready=true;state.city.projects.civic_square.readyAt=now-1;assert.equal(notificationEvents(state,{...preferences,orders:false},now).length,1);
});
test('notifications : plafond de calendrier et rejet dates passées/lointaines',()=>{
 const state=fixture();state.regionBook.shipments=Array.from({length:80},(_,id)=>({id,to:'island',readyAt:now+id*1000}));
 state.city.projects.civic_square.readyAt=now+8*86400000;const events=notificationEvents(state,preferences,now);
 assert.equal(events.length,24);assert.ok(events.every((e)=>Date.parse(e.at)>now));assert.equal(new Set(events.map((e)=>e.tag)).size,events.length);
});
test('notifications : Safari iPhone exige installation écran accueil',()=>{
 const env={navigator:{userAgent:'iPhone',standalone:false},matchMedia:()=>({matches:false})};assert.equal(pushSupport(env).install,true);
 Object.assign(env,{isSecureContext:true,PushManager:{},Notification:{}});env.navigator.serviceWorker={};env.navigator.standalone=true;assert.equal(pushSupport(env).available,true);
});
test('notifications : aucune permission demandée avant activation explicite et serveur prêt',async()=>{
 let permissions=0,calls=[];const env={isSecureContext:true,PushManager:{},Notification:{permission:'default',requestPermission:async()=>{permissions++;return 'granted';}},navigator:{userAgent:'Chrome',serviceWorker:{getRegistration:async()=>({pushManager:{getSubscription:async()=>null}})}},localStorage:{getItem:()=>null,setItem(){}}};
 const game={online:{rpc:async(name)=>{calls.push(name);return {enabled:false};}}};const n=new Notifications(game,env);await n.status();assert.equal(permissions,0);await assert.rejects(n.enable(),/serveur/);assert.equal(permissions,0);assert.deepEqual(calls,['bat_push_config']);
});
test('notifications : calendrier synchronisé après sauvegarde, réconciliation et keepalive',async()=>{
 const state=fixture();state.buildings[0].cons.rs=Date.now();state.orders.readyAt[0]=Date.now()+60000;
 let sent=[];const subscription={endpoint:'https://fcm.googleapis.com/test',toJSON:()=>({endpoint:'https://fcm.googleapis.com/test'})};
 const game={state,playing:true,online:{me:{id:'a'},auth:()=>({p_id:'a',p_secret:'fixture-only'}),rpc:async(...args)=>{sent.push(args);return {ok:true};}}};
 const n=new Notifications(game,{localStorage:{getItem:()=>null}});n.enabled=true;n.subscription=subscription;
 await n.sync(true);assert.equal(sent.length,1);assert.equal(sent[0][1].p_scope,'slot0');await n.sync(true);assert.equal(sent.length,2);await n.sync();assert.equal(sent.length,2);
 state.buildings[0].cons.ready=true;await n.flush();assert.equal(sent.length,3);assert.deepEqual(sent[2][2],{keepalive:true});
 game.visit={};await n.flush();assert.equal(sent.length,3);
});
test('notifications : attractions et expéditions utilisent leurs véritables échéances sans collision',()=>{
 const state=fixture();state.city.tourism={attractions:{park_wheel:{phase:1,readyAt:now+80000},park_gate:{phase:3,readyAt:0}}};
 state.regionBook.expeditions=[{id:1,from:'island',readyAt:now+180000,claimed:false},{id:2,from:'home',readyAt:now+1000,claimed:true}];
 const events=notificationEvents(state,preferences,now);
 assert.ok(events.some(e=>e.kind==='projects'&&e.tag.includes('park:park_wheel:1')&&Date.parse(e.at)===now+80000));
 const shipments=events.filter(e=>e.kind==='shipments');assert.equal(shipments.length,2);assert.equal(new Set(shipments.map(e=>e.tag)).size,2);
 assert.ok(shipments.some(e=>e.tag.includes('expedition:1')&&Date.parse(e.at)===now+180000));
});
test('notifications : une préférence ne plante pas si l’abonnement a expiré',async()=>{
 const env={localStorage:{getItem:()=>null,setItem(){}},navigator:{serviceWorker:{getRegistration:async()=>({pushManager:{getSubscription:async()=>null}})}}};
 const n=new Notifications({online:{rpc:async()=>{throw new Error('unexpected');}}},env);n.enabled=true;
 await assert.rejects(n.setPreference('orders',false),/reconnecté/);assert.equal(n.enabled,false);assert.equal(n.loading,false);
});
test('notifications : échec d’inscription supprime le nouvel abonnement et conserve le choix explicite',async()=>{
 let prompts=0,unsubscribed=0;
 const subscription={endpoint:'https://fcm.googleapis.com/test',toJSON:()=>({endpoint:'https://fcm.googleapis.com/test'}),unsubscribe:async()=>{unsubscribed++;return true;}};
 const env={isSecureContext:true,PushManager:{},Notification:{requestPermission:async()=>{prompts++;return 'granted';}},navigator:{userAgent:'Chrome',serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>null,subscribe:async()=>subscription}})}},localStorage:{getItem:()=>null,setItem(){}}};
 const n=new Notifications({online:{ensure:async()=>{},auth:()=>({}),rpc:async()=>{throw new Error('service indisponible');}}},env);n.config={enabled:true,publicKey:'AQ'};
 await assert.rejects(n.enable(),/service indisponible/);assert.equal(prompts,1);assert.equal(unsubscribed,1);assert.equal(n.enabled,false);assert.equal(n.subscription,null);
});
test('notifications : deux sauvegardes en vol sont réconciliées dans l’ordre sans doubler les requêtes',async()=>{
 let finish;const calls=[];const state=fixture();state.buildings[0].cons.rs=Date.now();state.orders.readyAt[0]=Date.now()+60000;
 const game={state,playing:true,online:{me:{id:'a'},auth:()=>({}),rpc:async(name,payload,options)=>{calls.push({name,payload,options});if(calls.length===1)await new Promise(resolve=>{finish=resolve;});return {};}}};
 const n=new Notifications(game,{localStorage:{getItem:()=>null}});n.enabled=true;n.subscription={endpoint:'https://fcm.googleapis.com/test'};
 const first=n.sync(true);await Promise.resolve();state.buildings[0].cons.ready=true;await n.flush();assert.equal(calls.length,1);finish();await first;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,2);assert.deepEqual(calls[1].options,{keepalive:true});assert.ok(!calls[1].payload.p_events.some(e=>e.kind==='construction'));
});

test('notifications : atelier prêt utilise son échéance et ignore les files suspendues',()=>{
 const state=fixture();state.city.workshops={byBuilding:{2:{queue:[{id:3,readyAt:now+12000}]},3:{queue:[{id:4,readyAt:now+13000,paused:true}]},4:{queue:[{id:5,readyAt:now+14000,blocked:true}]}}};
 const events=notificationEvents(state,preferences,now).filter(e=>e.tag.includes('workshop:'));assert.equal(events.length,1);assert.equal(events[0].kind,'construction');assert.equal(Date.parse(events[0].at),now+12000);
});
