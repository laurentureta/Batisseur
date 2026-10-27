import { h,costChips,progressBar } from './dom.js';
import { openScreen,countdown } from './screens.js';
import { BUILDINGS } from '../data/buildings.js';
import { RESOURCES } from '../data/resources.js';
import { CRAFTED_GOODS, WORKSHOP_QUEUE_LIMIT } from '../data/recipes.js';
import { fmt } from '../core/util.js';
const note=text=>h('p.city-note',text);
function apply(ui,sc,result,message){if(!result.ok)return ui.toast(result.reason,'error');ui.toast(message,'good');sc.refresh(true);}
export function openWorkshops(ui,buildingId=null){
 const g=ui.game;if(!g.playing||g.visit||g.isDemo)return ui.toast('Ouvrez votre propre village pour fabriquer.','info');
 ui.closeSheet(true);
 const draft={building:Number(buildingId)||null};
 return openScreen(ui,{id:'workshops',title:'⚒️ Ateliers et fabrications',cls:'workshops-screen',tab:'craft',tabs:[{id:'craft',label:'Fabriquer'},{id:'stocks',label:'Produits finis'}],render:(body,sc)=>{
  const manager=g.workshop;
  if(sc.tab==='stocks'){
   body.append(h('h2.city-heading','Votre production artisanale'),note('Les produits fabriqués peuvent être expédiés entre vos villages ou vendus ici au prix indiqué.'));
   const grid=h('div.city-grid');
   for(const r of CRAFTED_GOODS){
    const n=Math.floor(g.state.res[r]||0),rule=RESOURCES[r];
    grid.append(h('article.city-card',h('span.city-card-icon',rule.icon),h('h3',rule.name),h('p.city-state',`${fmt(n)} en stock`),note(`${rule.value} pièces par unité`),
     h('div.city-actions',h('button.btn.small',{disabled:n<1,onclick:()=>apply(ui,sc,manager.sell(r,1),'Produit vendu')},'Vendre 1'),h('button.btn.small',{disabled:n<1,onclick:()=>apply(ui,sc,manager.sell(r,Math.min(n,20)),'Produits vendus')},`Vendre ${Math.min(n,20)||20}`))));
   }body.append(grid);return;
  }
  body.append(note('Choisissez une recette et réservez ses ingrédients. Chaque atelier prépare jusqu’à six lots, l’un après l’autre, en temps réel. Les recettes continuent pendant la fermeture du jeu. Les stocks pleins retiennent le lot terminé ; une route coupée ou un incendie suspend le travail.'),note('La production habituelle de cet atelier reprend dès que sa file est vide. Annuler rembourse intégralement les ingrédients réservés.'));
  const buildings=[...g.world.buildings.values()].filter(b=>manager.recipesFor(b).length);
  if(!buildings.length){body.append(note('Construisez un moulin, une boulangerie, une scierie, une forge, une briqueterie, un potager, une étable ou un atelier de couture ou de céramique.'));return;}
  if(!buildings.some(b=>b.id===draft.building))draft.building=buildings[0].id;
  body.append(h('label.city-field',h('span','Atelier'),h('select',{'aria-label':'Atelier de fabrication',onchange:e=>{draft.building=Number(e.target.value);sc.refresh(true);}},buildings.map(b=>h('option',{value:b.id,selected:b.id===draft.building},`${BUILDINGS[b.type].name} n°${b.id}`)))));
  const b=g.world.buildings.get(draft.building),queue=manager.queue(b.id),now=Date.now();
  body.append(h('h2.city-heading',`File de fabrication · ${queue.length}/${WORKSHOP_QUEUE_LIMIT}`));
  if(!queue.length)body.append(note('Votre atelier est prêt à recevoir une recette.'));
  for(const [i,job]of queue.entries()){
   const status=job.paused?'Travail suspendu · reliez et réparez l’atelier':job.blocked?'Lot terminé · libérez de la place dans le stock':job.readyAt?`${countdown(job.readyAt-now)} restantes`:'Attend son tour';
   body.append(h('article.city-card',h('h3',`${i+1}. ${job.name}`),h('p.city-state',status),job.readyAt?progressBar(job.paused?1-job.remaining/(job.seconds*1000):1-(job.readyAt-now)/(job.seconds*1000)):null,
    h('p','Production du lot'),costChips(job.outputs,null),h('button.btn.small',{onclick:()=>apply(ui,sc,manager.cancel(b.id,job.id),'Fabrication annulée, ingrédients remboursés')},'Annuler et rembourser')));
  }
  body.append(h('h2.city-heading','Recettes disponibles'));
  const grid=h('div.city-grid');
  for(const recipe of manager.recipesFor(b)){
   const unlocked=g.state.mode==='libre'||g.state.level>=recipe.level;
   const afford=Object.entries(recipe.inputs).every(([r,n])=>(g.state.res[r]||0)>=n);
   const card=h('article.city-card',h('span.city-card-icon',recipe.icon),h('h3',recipe.name),note(`${countdown(recipe.seconds*1000)} par lot · niveau ${recipe.level}`),h('p','Ingrédients réservés'),costChips(recipe.inputs,g.state.res),h('p','Produits finis'),costChips(recipe.outputs,null),
    h('button.btn.primary',{disabled:!unlocked||!afford||queue.length>=WORKSHOP_QUEUE_LIMIT||!!b.cons||!!b.fire||!g.sim.info.get(b.id)?.connected,onclick:()=>apply(ui,sc,manager.enqueue(b.id,recipe.id),'Lot ajouté à la file')},unlocked?'Ajouter à la file':`Niveau ${recipe.level} requis`));
   grid.append(card);
  }body.append(grid);
 }});
}
