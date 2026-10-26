import { h, progressBar } from './dom.js';
import { openScreen } from './screens.js';
import { RESOURCES } from '../data/resources.js';

export function openCooperative(ui){
 const g=ui.game,c=g.cooperative;
 if(!g.playing||g.visit)return ui.toast('Ouvrez votre village pour rejoindre une coopérative.','info');
 ui.closeSheet(true);
 let name='',code='',kind='wood';
 const act=async(action,args)=>{
  try{await c.perform(action,args);ui.toast('La coopérative est à jour.','good');}
  catch(e){ui.toast(e.message,'error');}
  finally{screen.refresh(true);}
 };
 const screen=openScreen(ui,{id:'cooperative',title:'🤝 Coopératives',cls:'city-screen',render:(body)=>{
  body.append(h('h2.city-heading','Construire plus grand, ensemble'),h('p.city-note','Jusqu’à 20 maires peuvent s’entraider et participer à des chantiers collectifs. Les dons utilisent vos véritables marchandises.'));
  if(c.error)body.appendChild(h('p.city-error',{'role':'status'},c.error));
  if(!c.connected){body.appendChild(h('button.btn.primary',{disabled:c.loading,onclick:async()=>{await c.connect();screen.refresh(true);}},c.loading?'Connexion…':'Connecter ma coopérative'));return;}
  if(g.state.mode==='libre'){body.appendChild(h('p.city-note','Les échanges de marchandises sont disponibles dans vos villages en mode carrière.'));return;}
  if(c.pending()){
   body.append(h('div.city-card',h('h3','Un envoi attend confirmation'),h('p','Les marchandises sont réservées dans leur village d’origine. Vérifier récupère le reçu du serveur, sans nouvel envoi.'),h('button.btn.primary',{disabled:c.loading,onclick:async()=>{try{await c.retry();}catch(e){ui.toast(e.message,'error');}screen.refresh(true);}},'Vérifier l’envoi')));return;
  }
  const view=c.view,coop=view?.coop;
  if(!coop){
   body.append(h('div.city-form',h('h3','Créer une coopérative'),h('input.text',{'aria-label':'Nom de la coopérative',placeholder:'Nom de la coopérative',maxLength:30,value:name,oninput:(e)=>name=e.target.value}),h('button.btn.primary',{disabled:c.loading,onclick:()=>act('create',{name})},'Créer ma coopérative')),
    h('div.city-form',h('h3','Rejoindre mes amis'),h('input.text',{'aria-label':'Code de la coopérative',placeholder:'Code à six caractères',maxLength:6,value:code,oninput:(e)=>code=e.target.value.toUpperCase()}),h('button.btn.primary',{disabled:c.loading,onclick:()=>act('join',{code})},'Rejoindre')));return;
  }
  body.append(h('div.coop-header',h('div',h('h2',coop.name),h('p',`Code à partager : ${coop.code} · ${view.members.length}/20 membres`)),h('button.btn.small',{disabled:c.loading,onclick:async()=>{await c.connect();screen.refresh(true);}},'Actualiser')));
  body.append(h('article.city-card',h('h3',`${coop.cycle%2?'⚓ Le Grand Port':'🗼 Le Phare des Maires'} · chantier ${coop.cycle}`),progressBar(coop.progress/coop.goal),h('p',`${coop.progress} / ${coop.goal} marchandises`),h('p',coop.completed?'Projet inauguré ! Les membres présents pendant les travaux peuvent récupérer 1 000 pièces.':'Chaque lot de 20 bois, pierres ou nourritures fait avancer le projet. Un maire peut donner 200 marchandises par jour, entraide comprise.'),
   h('div.city-actions',...['wood','stone','food'].map((k)=>h('button.btn.small',{disabled:c.loading||coop.completed||(g.state.res[k]||0)<20,onclick:()=>act('contribute',{kind:k})},`${RESOURCES[k].icon} Donner 20`))),h('small',`${view.daily}/200 envoyées aujourd’hui`)));
  const requests=h('div.city-grid');
  for(const req of view.requests||[]){
   const mine=req.recipient===g.online.me.id;
   requests.appendChild(h('article.city-card',h('h3',`${req.name} · ${RESOURCES[req.kind].icon} ${req.amount}`),h('p',req.sent?'Colis arrivé':mine?'Votre demande attend de l’aide.':'Cette personne attend un coup de main.'),!mine&&!req.sent?h('button.btn.primary',{disabled:c.loading||(g.state.res[req.kind]||0)<20,onclick:()=>act('send',{request:req.id})},'Envoyer un colis'):mine&&!req.sent?h('button.btn.small',{disabled:c.loading,onclick:()=>act('cancel',{request:req.id})},'Annuler ma demande'):null));
  }
  body.append(h('h3','Entraide'),requests,h('div.city-form',h('select',{'aria-label':'Marchandise demandée',value:kind,onchange:(e)=>kind=e.target.value},...['wood','stone','food'].map((k)=>h('option',{value:k,selected:kind===k},RESOURCES[k].name))),h('button.btn',{disabled:c.loading,onclick:()=>act('request',{kind})},'Demander 20 marchandises')),
   h('button.btn.primary',{disabled:c.loading,onclick:()=>act('claim',{})},'Récupérer mes colis et récompenses'));
  body.append(h('h3','Les maires de la coopérative'),h('div.coop-members',...view.members.map((m)=>h('div',h('b',m.name+(m.owner?' · fondateur':'')),h('span',m.village)))));
  if(coop.owner===g.online.me.id&&coop.completed)body.appendChild(h('button.btn',{disabled:c.loading,onclick:()=>act('next',{})},'Préparer le chantier suivant (après 24 h)'));
  body.appendChild(h('button.btn.danger-soft',{disabled:c.loading,onclick:async()=>{if(await ui.confirm('Quitter cette coopérative ?',h('p','Les colis reçus doivent être récupérés avant de partir.')))act('leave',{});}},'Quitter la coopérative'));
 }});
 return screen;
}
