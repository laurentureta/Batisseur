import { ADVENTURE_DECOR } from '../data/adventures.js';
const MESSAGES={
 'aventure deja en cours ou repos de 24 heures':'Une aventure est en cours, ou la suivante attend les 24 heures de repos.',
 'aventure inconnue':'Choisissez une aventure proposée.',
 'aucune aventure en cours':'L’aventure est terminée, ou doit être lancée par le fondateur.',
 'etape deja avancee':'Vos équipiers ont terminé cette étape. Actualisez : les marchandises réservées ont été rendues.',
 'marchandise attendue differente':'Cette étape attend une autre marchandise.',
 'limite operations du jour':'La coopérative a reçu beaucoup d’actions aujourd’hui. Réessayez demain.',
 'limite de creations du jour':'Vous pouvez créer trois coopératives par jour.',
 'pas membre':'Rejoignez d’abord une coopérative.','deja membre':'Vous êtes déjà dans une coopérative.',
 'cooperative complete':'Cette coopérative compte déjà 20 membres.','code inconnu':'Ce code ne correspond à aucune coopérative ouverte.',
 'deux demandes au maximum':'Deux demandes peuvent attendre de l’aide en même temps.',
 'limite de demandes du jour':'Vous avez atteint les cinq demandes de la journée.',
 'limite de contributions du jour':'Vous avez déjà envoyé 200 marchandises aujourd’hui.',
 'demande indisponible':'Cette demande a déjà reçu de l’aide, ou elle n’est plus disponible.',
 'projet termine':'Ce projet collectif est déjà terminé.','reserve au fondateur':'Seul le fondateur peut lancer le projet suivant.',
 'prochain projet disponible 24 heures apres inauguration':'Le prochain projet ouvrira 24 heures après cette inauguration.',
 'recuperer les colis avant de partir':'Récupérez vos colis avant de quitter la coopérative.',
};
export class Cooperative {
 constructor(game){this.game=game;this.view=null;this.loading=false;this.connected=false;this.adventureConnected=false;this.adventureView=null;this.error='';}
 get ledger(){return this.game.city.book.coopLedger ||= {};}
 pending(){return Object.values(this.ledger).find((p)=>p.status==='pending');}
 async connect(){
  if(this.loading)return;
  this.loading=true;this.error='';
  try{
   await this.game.online.rpc('bat_coop_capabilities');
   await this.game.online.ensure();
   this.view=await this.game.online.rpc('bat_coop',{...this.game.online.auth(),p_action:'status'});this.connected=true;
  }catch(e){this.error=e.status===404||e.code==='PGRST202'?'Les coopératives ne sont pas encore disponibles sur ce serveur.':e.message;}
  finally{this.loading=false;}
 }
 async connectAdventures(){
  if(this.loading)return;
  this.loading=true;this.error='';
  try{
   await this.game.online.rpc('bat_adventure_capabilities');
   await this.game.online.ensure();
   this.adventureView=await this.game.online.rpc('bat_adventure',{...this.game.online.auth(),p_action:'status'});
   this.adventureConnected=true;this.restoreAdventureDecor(this.adventureView.owned);
  }catch(e){this.adventureConnected=false;this.error=e.status===404||e.code==='PGRST202'?'Les aventures collectives ne sont pas encore activées sur ce serveur.':e.message;}
  finally{this.loading=false;}
 }
 restoreAdventureDecor(owned=[]){
  if(!this.game.state||this.game.isDemo||this.game.visit)return;
  const book=this.game.city.book;book.adventureDecor ||= [];
  for(const id of owned)if(ADVENTURE_DECOR.includes(id)&&!book.adventureDecor.includes(id))book.adventureDecor.push(id);
  const meta=this.game.meta;if(!meta?.p?.owned?.decor)return;
  let changed=false;
  for(const id of book.adventureDecor)if(ADVENTURE_DECOR.includes(id)&&!meta.ownsDecor(id)){meta.p.owned.decor.push(id);changed=true;this.game.bus?.emit('decor:unlocked',id);}
  if(changed)meta.save();
 }
 performAdventure(action,args={}){return this.perform(action,args,{adventure:true});}
 resources(region){return region===this.game.state.regionId?this.game.state.res:this.game.city.book.settlements[region]?.snapshot?.res;}
 async perform(action,args={}, {adventure=false}={}){
  if(this.loading)throw new Error('Une opération est déjà en cours.');
  if(!(adventure?this.adventureConnected:this.connected))throw new Error('Connectez la coopérative pour continuer.');
  if(this.game.isDemo||this.game.visit)throw new Error('Ouvrez votre propre village.');
  if(this.game.state.mode==='libre')throw new Error('L’entraide avec marchandises se joue en mode carrière.');
  if(this.pending())throw new Error('Vérifiez d’abord l’envoi en attente.');
  let kind=null;
  if(action==='contribute')kind=args.kind;
  if(action==='send')kind=this.view?.requests?.find((r)=>r.id===args.request)?.kind;
  if(['send','contribute'].includes(action)&&!['wood','stone','food'].includes(kind))throw new Error('Marchandise inconnue.');
  if(kind&&(this.game.state.res[kind]||0)<20)throw new Error('Il faut 20 marchandises pour cet envoi.');
  const pending={id:crypto.randomUUID(),action,args,kind,...(adventure?{channel:'adventure'}:{}),region:this.game.state.regionId,slot:this.game.state.slot,village:this.game.state.name,status:'pending'};
  if(kind)this.game.state.res[kind]-=20;
  this.ledger[pending.id]=pending;
  if(!this.game.save()){
   if(kind)this.game.state.res[kind]+=20;delete this.ledger[pending.id];throw new Error('La sauvegarde est indisponible : aucun envoi n’a été effectué.');
  }
  return this.resolve(pending);
 }
 async retry(){const p=this.pending();if(p)return this.resolve(p);}
 async resolve(p){
  if(p.status!=='pending')return p.result;
  if(this.loading)return;
  this.loading=true;this.error='';
  const originBook=this.game.city.book;
  try{
   const result=await this.game.online.rpc(p.channel==='adventure'?'bat_adventure':'bat_coop',{...this.game.online.auth(),p_action:p.action,p_args:p.args,p_operation:p.id});
   if(this.game.city.book!==originBook || this.game.state.slot!==p.slot)throw new Error('Revenez au village d’origine pour confirmer cet envoi.');
   const resources=this.resources(p.region);if(!resources)throw new Error('Le village d’origine doit être restauré pour récupérer cet envoi.');
   for(const [kind,n]of Object.entries(result.grant||{}))if(['wood','stone','food','coins'].includes(kind)&&Number.isFinite(n)&&n>0)resources[kind]=(resources[kind]||0)+n;
   const oldDecor=[...(originBook.adventureDecor||[])];
   if(p.channel==='adventure'){originBook.adventureDecor ||= [];for(const id of result.cosmetics||[])if(ADVENTURE_DECOR.includes(id)&&!originBook.adventureDecor.includes(id))originBook.adventureDecor.push(id);}
   p.status='done';p.result=result;
   if(p.channel==='adventure')this.adventureView=result.view;else this.view=result.view;
   // Ressources et reçu vivent dans le même document de sauvegarde : une réponse
   // perdue peut être redemandée sans déduire ni créditer deux fois.
   if(!this.game.save()){
    for(const [kind,n]of Object.entries(result.grant||{}))if(['wood','stone','food','coins'].includes(kind)&&Number.isFinite(n)&&n>0)resources[kind]-=n;
    if(p.channel==='adventure')originBook.adventureDecor=oldDecor;
    p.status='pending';throw new Error('Réponse reçue, sauvegarde indisponible. Vérifiez l’envoi pour reprendre.');
   }
   if(p.channel==='adventure')this.restoreAdventureDecor(result.view?.owned||result.cosmetics||[]);
   const done=Object.values(this.ledger).filter((v)=>v.status==='done');
   for(const old of done.slice(0,-60))delete this.ledger[old.id];
   this.game.sim.markDirty();return result;
  }catch(e){
   if(this.game.city.book!==originBook||this.game.state.slot!==p.slot){this.error='Revenez au village d’origine pour confirmer cet envoi.';throw new Error(this.error);}
   if(e.status&&e.status<500){
    const resources=this.resources(p.region);if(p.kind&&resources)resources[p.kind]+=20;
    p.status='rejected';this.game.save();
    this.error=MESSAGES[e.serverMessage||e.message]||e.message;
   }else this.error=e.message+' L’opération reste en attente : utilisez Vérifier l’envoi.';
   throw new Error(this.error);
  }finally{this.loading=false;}
 }
}
