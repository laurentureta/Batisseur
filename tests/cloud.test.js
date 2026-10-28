import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSave } from '../src/net/CloudSave.js';
import { createNewState } from '../src/core/state.js';
function store(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};}
function fixture(){const storage=store(),st=createNewState({seed:125});storage.setItem('batisseur.save.0',JSON.stringify(st));globalThis.localStorage=storage;const game={playing:false,isDemo:false,meta:{p:{name:'Maire',owned:{decor:[]}}},online:{me:null},state:st,save:()=>true};const client=new CloudSave(game,{localStorage:storage,fetch:async()=>{throw Error('unexpected network');}});client.setSession({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,user:{id:'fixture-owner'}});client.ready=true;return {storage,game,client,st};}
test('cloud : aucun compte ni transfert créé automatiquement sans session et lien choisi',()=>{
 const {client,game}=fixture();client.session=null;game.playing=true;let calls=0;client.upload=async()=>calls++;client.sync();assert.equal(calls,0);assert.equal(client.rows.length,0);
});
test('cloud : première sauvegarde réserve une révision et synchronisation liée uniquement à son compte',async()=>{
 const {client,game}=fixture();let calls=[];client.request=async(path,payload)=>{calls.push({path,payload});return path.endsWith('bat_cloud_list')?[]:{slot:0,revision:1,at:'2026-10-27T12:00:00Z'};};
 await client.upload(0);assert.equal(calls[0].payload.p_expected,0);assert.equal(client.links['fixture-owner'][0].revision,1);assert.equal(client.links['fixture-owner'][0].auto,true);assert.equal(calls[0].payload.p_state.seed,125);
 client.session.user.id='different-owner';game.playing=true;client.lastAttempt=0;client.sync();assert.equal(calls.length,2);
});
test('cloud : conflit suspend la synchronisation sans écraser le village local',async()=>{
 const {client,storage}=fixture();const before=storage.getItem('batisseur.save.0');client.request=async()=>{throw Error('cloud conflict');};await assert.rejects(client.upload(0),/autre appareil/);assert.ok(client.conflicts.has(0));assert.equal(storage.getItem('batisseur.save.0'),before);
});
test('cloud : restauration privée avec copie annulable du village et de l’identité',async()=>{
 const {client,storage}=fixture(),original=storage.getItem('batisseur.save.0'),remote=createNewState({name:'Rivage',seed:321});const identity={id:'7ea367af-1f6d-4549-a3d9-591955ef2700',code:'ABCDEF',secret:'fixture-identity-only-never-network'};
 client.request=async()=>({state:remote,profile:{name:'Compte cloud'},identity,revision:3,headRevision:3,at:'2026-10-27T12:00:00Z'});
 const r=await client.restore(0,3);assert.equal(r.state.name,'Rivage');assert.equal(JSON.parse(storage.getItem('batisseur.save.0')).seed,321);assert.deepEqual(JSON.parse(storage.getItem('batisseur.online')),identity);assert.ok(storage.getItem('batisseur.cloud.beforeRestore'));
 assert.equal(client.undoRestore(),0);assert.equal(storage.getItem('batisseur.save.0'),original);assert.equal(storage.getItem('batisseur.online'),null);assert.equal(client.links['fixture-owner'][0].auto,false);
});
test('cloud : restauration impossible ne perd aucune donnée locale et refuse une ville bot',async()=>{
 const {client,storage}=fixture(),before=storage.getItem('batisseur.save.0');const bad=createNewState({seed:789});bad.botCity={};client.request=async()=>({state:bad});await assert.rejects(client.restore(0),/votre village/);assert.equal(storage.getItem('batisseur.save.0'),before);
 delete bad.botCity;client.request=async()=>({state:bad,profile:{},revision:1,headRevision:1});const set=storage.setItem;storage.setItem=(k,v)=>{if(k==='batisseur.cloud.beforeRestore')throw Error('disk full');set(k,v);};await assert.rejects(client.restore(0),/disk full/);assert.equal(storage.getItem('batisseur.save.0'),before);
});
test('cloud : deux appels concurrents partagent un seul renouvellement de session',async()=>{
 const {client}=fixture();client.session.expires_at=1;let calls=0;client.env.fetch=async(url)=>{calls++;return {ok:true,json:async()=>({access_token:'new-fixture-token',refresh_token:'new-fixture-refresh',expires_in:3600,user:{id:'fixture-owner'}})};};await Promise.all([client.refreshSession(),client.refreshSession()]);assert.equal(calls,1);assert.equal(client.session.access_token,'new-fixture-token');
});
test('cloud : l’état unavailable ne demande jamais d’adresse ni de mot de passe au serveur',async()=>{
 const {client}=fixture();client.ready=false;let calls=0;client.request=async()=>calls++;await assert.rejects(client.signIn('a@example.test','not-a-real-password'),/activé/);await assert.rejects(client.register('a@example.test','not-a-real-password'),/serveur/);assert.equal(calls,0);
});

test('cloud : changement de compte pendant un refresh interdit l’envoi de l’ancien village au nouveau compte',async()=>{
 const {client}=fixture();client.session.expires_at=1;let release,calls=[];client.env.fetch=async(url,options)=>{calls.push({url,options});if(url.includes('refresh_token'))return new Promise(r=>release=()=>r({ok:true,json:async()=>({access_token:'old-new-token',refresh_token:'old-refresh',expires_in:3600,user:{id:'fixture-owner'}})}));throw Error('private POST must not happen');};
 const request=client.request('/rest/v1/rpc/bat_cloud_save',{p_state:{name:'Secret original'}},{auth:true});
 client.setSession({access_token:'different-token',refresh_token:'different-refresh',expires_in:3600,user:{id:'different-owner'}});release();await assert.rejects(request,/compte a changé/);assert.equal(calls.length,1);assert.equal(client.user.id,'different-owner');assert.equal(client.session.access_token,'different-token');
});
test('cloud : ancienne réponse de liste ignorée après déconnexion',async()=>{
 const {client}=fixture();let release;client.env.fetch=async(url)=>url.endsWith('/logout')?{ok:true}:new Promise(r=>release=()=>r({ok:true,json:async()=>[{slot:0,name:'Private old account'}]}));
 const pending=client.list();await Promise.resolve();await client.signOut();release();await assert.rejects(pending,/compte a changé/);assert.deepEqual(client.rows,[]);assert.equal(client.user,undefined);
});
test('cloud : échec métadonnées restaure fichiers et ancien backup sans bloquer le jeu',async()=>{
 const {client,storage,game}=fixture();storage.setItem('batisseur.cloud.beforeRestore','prior-backup');const before=new Map(storage.m);const remote=createNewState({name:'Remote',seed:0});client.request=async()=>({state:remote,profile:{name:'Cloud'},identity:null,headRevision:1,revision:1});let failed=false;const set=storage.setItem;
 storage.setItem=(k,v)=>{if(k==='batisseur.cloud'&&!failed){failed=true;throw Error('disk full metadata');}set(k,v);};await assert.rejects(client.restore(0),/disk full/);assert.deepEqual(storage.m,before);assert.equal(game.restoringCloud,undefined);
});
test('cloud : seed zéro valide et gel empêchent la sauvegarde de départ de détruire la restauration',async()=>{
 const {client,storage,game}=fixture();const remote=createNewState({name:'Seed zéro',seed:0});storage.setItem('batisseur.online',JSON.stringify({id:'old'}));client.request=async()=>({state:remote,profile:{name:'Cloud'},identity:null,headRevision:1,revision:1});await client.restore(0);assert.equal(game.restoringCloud,true);assert.equal(JSON.parse(storage.getItem('batisseur.save.0')).seed,0);assert.equal(storage.getItem('batisseur.online'),null);
});
test('cloud : une sauvegarde locale échouée interdit tout envoi d’une version périmée',async()=>{
 const {client,game}=fixture();game.playing=true;game.save=()=>false;let sent=0;client.request=async()=>sent++;await assert.rejects(client.upload(0),/locale a échoué/);assert.equal(sent,0);
});
