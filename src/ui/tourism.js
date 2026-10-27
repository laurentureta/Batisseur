import {h,costChips,progressBar,rewardChips} from './dom.js';
import {openScreen,countdown} from './screens.js';
import {ATTRACTIONS,PARK_MILESTONES,FESTIVAL_STAGES,FESTIVAL_VALUES,festivalCalendar} from '../data/tourism.js';
import {RESOURCES} from '../data/resources.js';
import {BUILDINGS} from '../data/buildings.js';
import {fmt} from '../core/util.js';
const note=text=>h('p.city-note',text);
function result(ui,sc,r,message){if(!r.ok)return ui.toast(r.reason,'error');ui.toast(message,'good');sc.refresh(true);}
export function openTourism(ui,tab='park'){
 if(!ui.game.playing||ui.game.visit)return ui.toast('Ouvrez votre propre ville pour développer votre parc.','info');
 ui.closeSheet(true);const draft={res:'wood',amount:20};
 return openScreen(ui,{id:'tourism',title:'🎡 Parc et festivals',cls:'tourism-screen',tab,tabs:[{id:'park',label:'Les attractions'},{id:'visitors',label:'Visiteurs'},{id:'festival',label:'La fête de la semaine'}],render:(body,sc)=>{
 const t=ui.game.tourism;
 if(sc.tab==='park'){
  body.append(h('div.tourism-banner',h('span','LE PARC DES MERVEILLES'),h('h2','Une destination à construire'),note('Placez vos attractions dans la ville, financez chaque étape puis inaugurez-les. Les visiteurs arrivent quand l’entrée et les attractions sont reliées à la mairie par une route.')));
  const grid=h('div.city-grid');for(const[type,a]of Object.entries(ATTRACTIONS)){
   const p=t.attraction(type),b=t.building(type),unlocked=ui.libre||ui.game.state.level>=a.level,connected=b&&ui.game.sim.info.get(b.id)?.connected;
   const card=h('article.city-card.tourism-card',h('div.tourism-card-title',h('img.tourism-thumb',{src:ui.game.renderer.thumbs.get(type,4),alt:'',width:76,height:76}),h('div',h('h3',a.name),note(`${a.visitors} visiteurs/h · tarif de référence : ${a.ticket} pièces`))),progressBar(p.phase/3),note(`${p.phase}/3 étapes inaugurées`));
   if(!b)card.append(h('button.btn.primary',{disabled:!unlocked,onclick:()=>{ui.closeScreen();ui.setTool({kind:'build',type,rot:null});}},unlocked?'Placer l’emplacement':`Niveau ${a.level}`),note('Emplacement : 120 pièces, hors défrichage.'));
   else if(p.readyAt)card.append(h('p',`${a.phases[p.phase].name} · ${countdown(p.readyAt-Date.now())}`),h('button.btn.primary',{disabled:Date.now()<p.readyAt,onclick:()=>result(ui,sc,t.finish(type),'Nouvelle étape inaugurée !')},'Inaugurer cette étape'));
   else if(p.phase<3){const phase=a.phases[p.phase];card.append(h('h4',phase.name),costChips(phase.cost,ui.game.state.res,{libre:ui.libre}),note(`Travaux : ${countdown(phase.seconds*1000)} en temps réel`),h('button.btn.primary',{disabled:!unlocked||(type!=='park_gate'&&!t.completed('park_gate')),onclick:()=>result(ui,sc,t.start(type),'Les travaux commencent !')},'Financer les travaux'));if(type!=='park_gate'&&!t.completed('park_gate'))card.append(note('Inaugurez d’abord l’entrée du parc.'));}
   else card.append(h('p.tourism-status',connected?'✓ Ouvert aux visiteurs':'Reliez cette attraction à la mairie.'),h('button.btn.small',{onclick:()=>{ui.closeScreen();ui.game.select(b.id);ui.game.renderer.focusBuilding(b);}},'Voir dans la ville'));
   grid.append(card);
  }body.append(grid);
 }else if(sc.tab==='visitors'){
  const rates=t.rates(),d=t.data;body.append(h('div.tourism-stats',h('article.city-card',h('b',fmt(d.admissions)),note('visiteurs accueillis')),h('article.city-card',h('b',fmt(rates.visitors)),note('arrivées par heure réelle')),h('article.city-card',h('b',fmt(rates.revenue)),note('recettes prévues par heure réelle'))),note('Les voyageurs achètent à leur arrivée un forfait comprenant leurs billets et un bon de restauration lorsqu’un café ou un restaurant est accessible. Ils rejoignent ensuite les attractions par les routes. Les recettes continuent pendant une absence de 8 heures maximum.'));
  body.append(h('article.city-card',h('h3','Le séjour dans votre ville'),note(`${d.guests.length} visiteurs en promenade · ${fmt(d.completedTours)} séjours terminés`),note(`Budget moyen : ${rates.visitors?(rates.revenue/rates.visitors).toFixed(1):'0'} pièces · Embellissement : +${Math.round((rates.beauty||0)*1000)/10} %`),note(rates.arrivalFactor>1?'La gare reliée à l’entrée apporte 15 % de visiteurs supplémentaires.':'Reliez une gare à l’entrée du parc pour attirer davantage de voyageurs.'),note(rates.refreshment?`${rates.refreshment.toFixed(1)} pièces de restauration par visiteur grâce aux commerces accessibles.`:'Un café, un salon de thé, une auberge ou un restaurant relié au parc permet aux voyageurs de se restaurer.')));
  if(d.receipts.length){body.append(h('h3','Dernières arrivées'));for(const r of d.receipts.slice(-5).reverse())body.append(h('article.city-card',h('b',`Voyageur ${r.id} · ${r.fromTrain?'🚂 Gare':'🎟️ Entrée du parc'}`),note(`Forfait acheté : ${r.paid.toFixed(1)} pièces · ${r.status==='completed'?'Séjour terminé':r.status==='interrupted'?'Parcours interrompu après une modification des accès':'En visite'}`),note(r.venues.map(v=>BUILDINGS[v.type]?.name||'Parc').join(' → '))));}

  for(const[m,r]of PARK_MILESTONES.entries())body.append(h('article.city-card',h('h3',r.name),note(`${fmt(Math.min(d.visitors,r.visitors))} / ${fmt(r.visitors)} visiteurs`),progressBar(d.visitors/r.visitors),rewardChips({coins:r.coins,xp:r.xp}),h('button.btn.primary',{disabled:d.milestones.includes(m)||d.visitors<r.visitors,onclick:()=>result(ui,sc,t.claimMilestone(m),'Récompense de renommée reçue !')},d.milestones.includes(m)?'Récompense reçue':'Recevoir la récompense')));
 }else{
  const cal=festivalCalendar(),f=t.syncFestival();body.append(h('div.tourism-banner',h('span','LA FÊTE DE VOTRE VILLE'),h('h2',`${cal.icon} ${cal.name}`),note(`Prochaine fête dans ${countdown(cal.endsAt-Date.now())}.`)),note('Préparez votre fête avec les stocks de ce village. Cette progression est personnelle. Les projets en équipe sont accessibles depuis Coopératives lorsque le service est activé.'),progressBar(f.points/700),h('p',`${f.points}/700 points de préparation`));
  for(const[i,r]of FESTIVAL_STAGES.entries())body.append(h('article.city-card',h('h3',`${i+1}. ${r.name}`),note(`${r.points} points requis`),rewardChips({coins:r.coins,xp:r.xp}),i===2?note(`Trophée permanent et +25 % de fréquentation jusqu’à la fin de cette fête. En carrière : décoration « ${BUILDINGS[cal.decor].name} » débloquée dans Construire → Exclusifs.`):null,h('button.btn.primary',{disabled:f.claimed.includes(i)||f.points<r.points,onclick:()=>result(ui,sc,t.claimFestival(i),'La fête prend vie !')},f.claimed.includes(i)?'Palier reçu':'Recevoir ce palier')));
  const form=h('div.city-form',h('h3','Approvisionner la fête'),h('label.city-field',h('span','Marchandise'),h('select',{'aria-label':'Marchandise du festival',value:draft.res,onchange:e=>draft.res=e.target.value},Object.entries(FESTIVAL_VALUES).map(([r,v])=>h('option',{value:r,selected:r===draft.res},`${RESOURCES[r].name} · ${v} point${v>1?'s':''}/unité`)))),h('label.city-field',h('span','Quantité'),h('input.text',{type:'number',min:1,max:100,step:1,value:draft.amount,'aria-label':'Quantité du festival',oninput:e=>draft.amount=Number(e.target.value)})),h('button.btn.primary',{disabled:f.points>=700||!t.completed('park_gate'),onclick:()=>result(ui,sc,t.donate(draft.res,draft.amount),'Marchandises livrées à la fête !')},'Livrer au festival'));
  body.append(form);if(!t.completed('park_gate'))body.append(note('L’entrée du parc doit être inaugurée pour préparer la fête.'));
 }
 }});
}
