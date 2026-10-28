import { PROJECT_URL,PUBLIC_KEY } from './config.js';
import { parseImport, readSlot } from '../core/save.js';
const STORE='batisseur.cloud', SESSION='batisseur.cloud.session';
const PROFILE='batisseur-profile', ONLINE='batisseur.online';
export function cloudConflict(message){return /cloud conflict/.test(message||'');}
// Les messages du service d'authentification arrivent en anglais : on les traduit pour le joueur.
const AUTH_FR = [
 [/invalid login credentials/i, 'Adresse ou mot de passe incorrect.'],
 [/email not confirmed/i, 'Confirmez d’abord votre adresse : un courriel vous a été envoyé.'],
 [/user already registered|already been registered/i, 'Un compte existe déjà avec cette adresse. Connectez-vous.'],
 [/password should be at least (\d+)/i, 'Le mot de passe doit contenir au moins $1 caractères.'],
 [/unable to validate email|invalid email/i, 'Cette adresse courriel n’est pas valide.'],
 [/for security purposes|rate limit|too many requests/i, 'Trop de tentatives : réessayez dans quelques minutes.'],
 [/signups? not allowed|signup is disabled/i, 'La création de compte est désactivée sur ce serveur.'],
 [/new password should be different/i, 'Le nouveau mot de passe doit être différent de l’ancien.'],
 [/token has expired|invalid refresh token/i, 'Votre connexion a expiré. Reconnectez-vous à votre compte.'],
];
function frenchMessage(text){
 const value=String(text||'');
 for(const [pattern,replacement] of AUTH_FR) if(pattern.test(value)) return value.replace(pattern,replacement);
 return value;
}
export class CloudSave {
 constructor(game,env=globalThis){
  this.game=game;this.env=env;this.authEpoch=0;this.session=null;this.links={};this.rows=[];this.ready=false;this.error='';this.busy=false;this.lastAttempt=0;this.conflicts=new Set();
  try{const p=JSON.parse(env.localStorage?.getItem(STORE)||'{}');this.links=p.links||{};this.session=JSON.parse(env.localStorage?.getItem(SESSION)||'null');}catch{/* storage unavailable */}
 }
 get user(){return this.session?.user;}
 get linkKey(){return this.user?.id||'';}
 persist(){this.env.localStorage?.setItem(STORE,JSON.stringify({links:this.links}));if(this.session)this.env.localStorage?.setItem(SESSION,JSON.stringify(this.session));else this.env.localStorage?.removeItem(SESSION);}
 async request(path,body,{auth=false,method='POST'}={}){
  const headers={apikey:PUBLIC_KEY,'Content-Type':'application/json'},epoch=this.authEpoch,owner=this.user?.id;
  if(auth){await this.refreshSession();if(epoch!==this.authEpoch||owner!==this.user?.id)throw new Error('Le compte a changé pendant la connexion.');headers.Authorization='Bearer '+this.session.access_token;}
  let res;
  try{res=await this.env.fetch(PROJECT_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
  catch{throw new Error('Pas de connexion : vérifie ton accès à Internet.');}
  let data;try{data=await res.json();}catch{data=null;}
  if(auth&&(epoch!==this.authEpoch||owner!==this.user?.id))throw new Error('Le compte a changé pendant la connexion.');
  if(!res.ok){const e=new Error(frenchMessage(data?.msg||data?.message||data?.error_description)||`Service indisponible (${res.status}).`);e.status=res.status;e.code=data?.code;throw e;}
  return data;
 }
 async check(){
  try{await this.request('/rest/v1/rpc/bat_cloud_capabilities',{});this.ready=true;this.error='';}
  catch(e){this.ready=false;this.error=e.status===404||e.code==='PGRST202'?'Les sauvegardes cloud attendent leur activation sur le serveur.':e.message;return;}
  if(this.session)try{await this.list();}catch(e){if(e.status===400||e.status===401){this.session=null;this.authEpoch++;this.rows=[];this.persist();this.error='Votre connexion a expiré. Reconnectez-vous à votre compte.';}else this.error=e.message;}
 }
 async register(email,password){
  if(!this.ready)throw new Error('Activez le service cloud sur le serveur avant de créer un compte.');
  if(password.length<10)throw new Error('Choisissez un mot de passe d’au moins 10 caractères.');
  const redirect=new URL('./',this.env.location?.href||'https://laurentureta.github.io/Batisseur/').href;
  const epoch=++this.authEpoch;const result=await this.request('/auth/v1/signup?redirect_to='+encodeURIComponent(redirect),{email:email.trim(),password});if(epoch!==this.authEpoch)throw new Error('Une autre connexion a été choisie.');
  if(result.access_token){this.setSession(result);await this.list();return true;}
  return false; // email confirmation required; no claim of a signed-in session
 }
 setSession(s,{refresh=false}={}){if(!refresh)this.authEpoch++;this.session={access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600),user:s.user};this.persist();}
 async signIn(email,password){
  if(!this.ready)throw new Error('Le service cloud doit être activé sur le serveur.');
  const epoch=++this.authEpoch;const result=await this.request('/auth/v1/token?grant_type=password',{email:email.trim(),password});if(epoch!==this.authEpoch)throw new Error('Une autre connexion a été choisie.');this.setSession(result);await this.list();
 }
 async refreshSession(){
  if(!this.session)throw new Error('Connectez votre compte pour retrouver vos villages.');
  if(this.session.expires_at*1000>Date.now()+60000)return;
  if(!this.refreshing){
   const epoch=this.authEpoch,owner=this.user?.id,refresh=this.session.refresh_token;
   this.refreshing=this.request('/auth/v1/token?grant_type=refresh_token',{refresh_token:refresh}).then(s=>{
    if(epoch!==this.authEpoch||owner!==this.user?.id||s.user?.id!==owner)throw new Error('Le compte a changé pendant le renouvellement.');
    this.setSession(s,{refresh:true});
   }).finally(()=>{this.refreshing=null;});
  }
  await this.refreshing;
 }
 async signOut(){
  const token=this.session?.access_token;this.authEpoch++;this.session=null;this.rows=[];this.conflicts.clear();this.persist();
  if(token)try{await this.env.fetch(PROJECT_URL+'/auth/v1/logout',{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});}catch{/* local signout remains effective offline */}
 }
 async list(){this.rows=await this.request('/rest/v1/rpc/bat_cloud_list',{}, {auth:true})||[];return this.rows;}
 local(slot){if(![0,1,2].includes(slot))throw new Error('Emplacement invalide.');if(this.game.playing&&!this.game.isDemo&&this.game.state.slot===slot&&this.game.save()!==true)throw new Error('La sauvegarde locale a échoué : aucun village n’a été envoyé.');return readSlot(slot);}
 async upload(slot,{expected}={}){
  if(this.busy)throw new Error('Une synchronisation est déjà en cours.');
  this.lastAttempt=Date.now();
  const state=this.local(slot);if(!state)throw new Error('Cet emplacement local est vide.');
  const owner=this.linkKey;if(!owner)throw new Error('Connectez votre compte.');
  const link=this.links[owner]?.[slot];expected??=link?.revision??0;
  this.busy=true;
  try{
   const r=await this.request('/rest/v1/rpc/bat_cloud_save',{p_slot:slot,p_state:state,p_profile:this.game.meta.p,p_identity:this.game.online.me,p_expected:expected},{auth:true});
   if(this.linkKey!==owner)throw new Error('Le compte a changé pendant la sauvegarde.');
   (this.links[owner]||={})[slot]={revision:r.revision,auto:true,at:r.at};this.conflicts.delete(slot);this.persist();this.error='';await this.list();return r;
  }catch(e){if(cloudConflict(e.message)){this.conflicts.add(slot);this.error='Ce village a changé sur un autre appareil. Choisissez quelle version conserver dans Compte et sauvegardes.';}else this.error=e.message;throw new Error(this.error);}
  finally{this.busy=false;}
 }
 writeRestoration(changes){
  const storage=this.env.localStorage,before=Object.fromEntries(Object.keys(changes).map(k=>[k,storage.getItem(k)])),previous=this.game.restoringCloud;
  this.game.restoringCloud=true;
  try{for(const [k,v]of Object.entries(changes))if(v===null)storage.removeItem(k);else storage.setItem(k,v);}
  catch(e){
   try{for(const [k,v]of Object.entries(before))if(v===null)storage.removeItem(k);else storage.setItem(k,v);}
   finally{this.game.restoringCloud=previous;}
   throw e;
  }
 }
 async restore(slot,revision){
  if(![0,1,2].includes(slot))throw new Error('Emplacement invalide.');
  if(this.busy)throw new Error('Une synchronisation est déjà en cours.');
  this.busy=true;const owner=this.linkKey;
  try{
   const bundle=await this.request('/rest/v1/rpc/bat_cloud_read',{p_slot:slot,p_revision:revision||null},{auth:true});
   if(this.linkKey!==owner)throw new Error('Le compte a changé pendant la restauration.');
   if(!bundle?.state)throw new Error('Cette version n’est plus disponible.');
   const state=parseImport(JSON.stringify(bundle.state));if(state.botCity)throw new Error('Cette sauvegarde ne correspond pas à votre village.');state.slot=slot;
   if(this.game.playing&&this.game.save()!==true)throw new Error('La sauvegarde locale a échoué : restauration annulée.');this.game.meta.save?.();
   const storage=this.env.localStorage,keys=[`batisseur.save.${slot}`,PROFILE,ONLINE,'batisseur.last'];
   const backup=JSON.stringify({slot,at:Date.now(),values:Object.fromEntries(keys.map(k=>[k,storage.getItem(k)]))});
   const links=JSON.parse(JSON.stringify(this.links));
   (links[owner]||={})[slot]={revision:bundle.headRevision,auto:bundle.revision===bundle.headRevision,at:bundle.at};
   const changes={
    'batisseur.cloud.beforeRestore':backup,
    [`batisseur.save.${slot}`]:JSON.stringify(state),
    [PROFILE]:bundle.profile&&typeof bundle.profile==='object'&&!Array.isArray(bundle.profile)?JSON.stringify(bundle.profile):storage.getItem(PROFILE),
    [ONLINE]:bundle.identity?.id&&bundle.identity.secret?JSON.stringify(bundle.identity):null,
    'batisseur.last':String(slot),[STORE]:JSON.stringify({links}),
   };
   // Inclure métadonnées ET copie précédente dans la transaction, avant la navigation.
   this.writeRestoration(changes);this.links=links;this.conflicts.delete(slot);return {slot,state};
  }finally{this.busy=false;}
 }
 setAuto(slot,on){const link=this.links[this.linkKey]?.[slot];if(link){link.auto=!!on;this.persist();}}
 async recover(email){
  if(!this.ready)throw new Error('Le service cloud doit être activé.');
  const redirect=new URL('./',this.env.location?.href||'https://laurentureta.github.io/Batisseur/').href;
  await this.request('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),{email:email.trim()});
 }
 async acceptRecovery(){
  const hash=new URLSearchParams((this.env.location?.hash||'').replace(/^#/,''));
  if(hash.get('type')!=='recovery'||!hash.get('access_token')||!hash.get('refresh_token'))return false;
  const token=hash.get('access_token'),epoch=++this.authEpoch;
  const res=await this.env.fetch(PROJECT_URL+'/auth/v1/user',{headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw new Error('Ce lien de récupération a expiré. Demandez un nouveau lien.');
  const user=await res.json();if(epoch!==this.authEpoch)throw new Error('Une autre connexion a été choisie.');this.setSession({access_token:token,refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in'))||3600,user});
  this.env.history?.replaceState(null,'',this.env.location.pathname+this.env.location.search);return true;
 }
 async changePassword(password){
  if(password.length<10)throw new Error('Choisissez au moins 10 caractères.');
  await this.request('/auth/v1/user',{password},{auth:true,method:'PUT'});
 }
 undoRestore(){
  const storage=this.env.localStorage,b=JSON.parse(storage.getItem('batisseur.cloud.beforeRestore')||'null');
  if(!b?.values||![0,1,2].includes(b.slot))throw new Error('Aucune restauration locale à annuler.');
  const allowed=[`batisseur.save.${b.slot}`,PROFILE,ONLINE,'batisseur.last'];
  const links=JSON.parse(JSON.stringify(this.links)),link=links[this.linkKey]?.[b.slot];if(link)link.auto=false;
  const changes=Object.fromEntries(allowed.map(k=>[k,b.values[k]??null]));
  changes[STORE]=JSON.stringify({links});changes['batisseur.cloud.beforeRestore']=null;
  this.writeRestoration(changes);this.links=links;return b.slot;
 }
 sync(){
  if(this.game.restoringCloud||!this.ready||!this.session||this.busy||!this.game.playing||this.game.isDemo||this.game.visit||Date.now()-this.lastAttempt<90000)return;
  const slot=this.game.state.slot,link=this.links[this.linkKey]?.[slot];if(!link?.auto||this.conflicts.has(slot))return;
  this.lastAttempt=Date.now();void this.upload(slot).catch(()=>{});
 }
}
