import { h, progressBar } from './dom.js';
import { openScreen, countdown } from './screens.js';
import { ADVENTURES } from '../data/adventures.js';
import { BUILDINGS } from '../data/buildings.js';
import { RESOURCES } from '../data/resources.js';
export function openAdventures(ui){
 const g=ui.game,c=g.cooperative;
 if(!g.playing||g.visit)return ui.toast('Ouvrez votre village pour retrouver votre équipe.','info');
 ui.closeSheet(true);
 let refreshTimer;
 const action=async(kind,args={})=>{try{await c.performAdventure(kind,args);ui.toast(kind==='claim'?'Récompenses récupérées !':'L’aventure de votre équipe est à jour.','good');}catch(e){ui.toast(e.message,'error');}finally{screen.refresh(true);}};
 const screen=openScreen(ui,{id:'adventures',title:'🧭 Aventures en équipe',cls:'city-screen',onClose:()=>clearInterval(refreshTimer),render(body){
  body.append(h('h2.city-heading','Un chantier, tous les équipiers'),h('p.city-note','Choisissez une aventure à trois étapes et construisez-la ensemble. Chaque lot utilise 20 marchandises de votre village. Les progrès sont partagés entre tous les membres, même lorsqu’ils jouent à des moments différents.'));
  if(c.error)body.append(h('p.city-error',{role:'status'},c.error));
  if(g.state.mode==='libre'){body.append(h('p.city-note','Les aventures collectives se jouent avec les ressources de vos villages en mode carrière.'));return;}
  if(!c.adventureConnected){body.append(h('button.btn.primary',{disabled:c.loading,onclick:async()=>{await c.connectAdventures();screen.refresh(true);}},c.loading?'Connexion…':'Connecter mon équipe'));return;}
  if(c.pending()){const p=c.pending();body.append(h('article.city-card',h('h3','Un envoi attend confirmation'),h('p',`${p.village} · les marchandises restent réservées jusqu’à la réponse du serveur.`),h('button.btn.primary',{disabled:c.loading,onclick:async()=>{try{await c.retry();}catch(e){ui.toast(e.message,'error');}screen.refresh(true);}},'Vérifier l’envoi')));return;}
  const view=c.adventureView,coop=view?.coop,a=view?.adventure;
  if(!coop){body.append(h('article.city-card',h('h3','Retrouvez votre coopérative'),h('p','Créez une coopérative ou rejoignez vos amis avec leur code. Les aventures sont partagées uniquement avec votre équipe.'),h('button.btn.primary',{onclick:()=>ui.openCooperative()},'Ouvrir les coopératives')));return;}
  body.append(h('div.coop-header',h('h3',coop.name),h('button.btn.small',{disabled:c.loading,onclick:async()=>{await c.connectAdventures();screen.refresh(true);}},'Actualiser les progrès')));
  const owner=coop.owner===g.online.me?.id;
  if(a){
   const rule=ADVENTURES[a.kind];
   body.append(h('article.city-card',h('h2',`${rule?.icon||'🧭'} ${rule?.name||'Aventure collective'} · voyage ${a.cycle}`),h('p',a.phase>=3?'L’équipe a inauguré son grand chantier !':`Étape ${a.phase+1} sur 3`)));
   const stages=h('div.city-grid');
   for(const stage of a.stages){const label=rule?.stages[stage.phase],current=stage.phase===a.phase,resource=RESOURCES[stage.resource];
    stages.append(h('article.city-card',h('h3',`${stage.completed?'✓':current?'🔨':'🔒'} ${label?.name||`Étape ${stage.phase+1}`}`),progressBar(stage.progress/stage.goal),h('p',`${stage.progress}/${stage.goal} ${resource?.name||stage.resource}`),h('p',`Récompense : ${stage.coins} pièces par membre présent à la fin de l’étape${stage.phase===2?` et ${BUILDINGS[rule?.decor]?.name||'une décoration'}`:''}.`),current?h('button.btn.primary',{disabled:c.loading||(g.state.res[stage.resource]||0)<20||view.daily>=200,onclick:()=>action('contribute',{cycle:a.cycle,phase:stage.phase,kind:stage.resource})},`${resource?.icon||'📦'} Donner 20`):null));
   }body.append(stages);
   if(a.completedAt){const wait=Date.parse(a.completedAt)+86400000-Date.now();if(wait>0)body.append(h('p.city-note',`L’équipe pourra repartir dans ${countdown(wait)}.`));}
  }
  body.append(h('p.city-note',`${view.daily||0}/200 marchandises données aujourd’hui, entraide et chantier habituel compris.`));
  if(view.rewards?.length)body.append(h('article.city-card',h('h3',`${view.rewards.length} récompense${view.rewards.length>1?'s':''} d’étape à récupérer`),h('p','Les récompenses vous attendent même si votre équipe a déjà commencé une autre aventure.'),h('button.btn.primary',{disabled:c.loading,onclick:()=>action('claim')},'Récupérer mes récompenses')));
  const canStart=!a||(a.completedAt&&Date.parse(a.completedAt)+86400000<=Date.now());
  if(canStart){body.append(h('h3',owner?'Choisir la prochaine aventure':'Le fondateur choisit la prochaine aventure'));const choices=h('div.city-grid');
   for(const [kind,rule]of Object.entries(ADVENTURES))choices.append(h('article.city-card',h('h3',`${rule.icon} ${rule.name}`),h('p',rule.description),h('p',`Trois étapes · ${rule.stages.reduce((n,s)=>n+s.goal,0)} marchandises · décoration : ${BUILDINGS[rule.decor]?.name||rule.decor}`),h('button.btn.primary',{disabled:c.loading||!owner,onclick:()=>action('start',{kind})},'Lancer cette aventure')));body.append(choices);
  }
  if(view.owned?.length)body.append(h('p.city-note',`Votre collection : ${view.owned.map(id=>BUILDINGS[id]?.name||id).join(' · ')}. Retrouvez ces décorations dans Construire → Exclusifs.`));
  body.append(h('p.city-note','Les décorations se débloquent une fois par compte ; leurs doublons ne donnent pas de gemmes. Les pièces sont accordées une fois par étape et par aventure.'));
 }});
 refreshTimer=setInterval(()=>{if(ui.screen===screen&&!document.hidden&&c.adventureConnected&&!c.loading&&!c.pending())void c.connectAdventures().then(()=>{if(ui.screen===screen)screen.refresh();});},15000);
 return screen;
}
