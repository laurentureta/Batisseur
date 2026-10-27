import {h,costChips} from './dom.js';
import {openScreen} from './screens.js';
import {BUILDINGS,sizeOf} from '../data/buildings.js';
import {SIZE,T} from '../world/constants.js';
const note=text=>h('p.city-note',text);
function act(ui,screen,result,text){if(!result.ok){ui.toast(result.reason,'error');return false;}ui.toast(text,'good');screen.keepTop=true;screen.refresh(true);return true;}
function number(label,value,onchange){return h('label.city-field',h('span',label),h('span.urban-stepper',h('button.btn.small',{'aria-label':`Diminuer ${label}`,onclick:()=>onchange(value-1)},'−'),h('input.text',{type:'number',min:-SIZE,max:SIZE,step:1,value,'aria-label':label,onchange:e=>onchange(Number(e.target.value))}),h('button.btn.small',{'aria-label':`Augmenter ${label}`,onclick:()=>onchange(value+1)},'+')));}
function preview(ui,plan){
 const world=ui.game.world,buildings=plan.buildings||[],roads=plan.roads||[];
 const box=h('div.urban-preview',h('p.urban-validation.'+(plan.ok?'good':'bad'),plan.ok?`✓ ${buildings.length} bâtiment(s), ${roads.length} case(s) de route. Le quartier peut être posé.`:`⚠ ${plan.reason}`));
 if(!buildings.length)return box;
 const points=[...buildings.flatMap(b=>{const[w,d]=sizeOf(BUILDINGS[b.type],b.rot);return[{x:b.x,z:b.z},{x:b.x+w-1,z:b.z+d-1}];}),...roads];
 let x0=Math.max(0,Math.min(...points.map(p=>p.x))-1),z0=Math.max(0,Math.min(...points.map(p=>p.z))-1),x1=Math.min(SIZE,Math.max(...points.map(p=>p.x))+2),z1=Math.min(SIZE,Math.max(...points.map(p=>p.z))+2);
 if(x1-x0>36||z1-z0>36||x1<=x0||z1<=z0)return h('div',box,note('L’aperçu détaillé apparaît pour les quartiers de 36 × 36 cases maximum.'));
 const destinations=new Map();for(const b of buildings){const[w,d]=sizeOf(BUILDINGS[b.type],b.rot);for(let z=b.z;z<b.z+d;z++)for(let x=b.x;x<b.x+w;x++)destinations.set(world.idx(x,z),{kind:'target',text:x===b.x&&z===b.z?BUILDINGS[b.type].icon:'',name:BUILDINGS[b.type].name});}for(const r of roads)destinations.set(world.idx(r.x,r.z),{kind:'newroad',text:'·',name:'Route du plan'});
 const grid=h('div.urban-grid',{style:{gridTemplateColumns:`repeat(${x1-x0}, 20px)`},role:'img','aria-label':`Plan de ${x1-x0} colonnes et ${z1-z0} lignes, origine ${x0}, ${z0}`});
 const moved=new Set((plan.source?.buildings||[]).map(b=>b.id)),sourceRoads=new Set((plan.source?.roads||[]).map(r=>world.idx(r.x,r.z)));
 for(let z=z0;z<z1;z++)for(let x=x0;x<x1;x++){
  const i=world.idx(x,z),target=destinations.get(i),b=world.buildingAt(x,z),t=world.terrain[i];let kind='free',text='',name='Terrain libre';
  if(!world.zoneUnlocked(x,z)){kind='locked';text='×';name='Zone verrouillée';}else if(b&&!moved.has(b.id)){kind='occupied';name=BUILDINGS[b.type].name;text='■';}else if([T.FOREST,T.ROCK,T.MOUNTAIN,T.WATER,T.DEEP].includes(t)){kind='nature';text=t===T.FOREST?'♠':t===T.ROCK?'◆':'~';name='Terrain naturel préservé';}else if(world.road[i]&&!sourceRoads.has(i)){kind='road';text='·';name='Route existante';}
  if(target){if(kind==='occupied'||kind==='locked'||(kind==='nature'&&!(target.kind==='newroad'&&t===T.WATER))||kind==='road')kind='conflict';else kind=target.kind;text=target.text;name=target.name;}
  grid.append(h('span.urban-cell.'+kind,{title:`${x}, ${z} · ${name}`},text));
 }
 box.append(h('div.urban-grid-scroll',grid),note(`Origine de l’aperçu : x ${x0}, z ${z0}. Vert : bâtiments prévus · bleu : routes prévues · rouge : obstacle. Les arbres et les rochers restent préservés.`));return box;
}
export function openUrbanist(ui,tab='move',initialId=null){
 const g=ui.game;if(!g.playing||g.visit||g.isDemo)return ui.toast('Ouvrez votre propre village pour utiliser l’urbaniste.','info');
 ui.closeSheet(true);const selected=new Set(initialId?[initialId]:[]),draft={dx:1,dz:0,roads:true,query:'',page:0,name:'Mon quartier',x:55,z:55,rot:0,stored:null,blueprint:null};
 return openScreen(ui,{id:'urbanist',title:'📐 Urbaniste',cls:'urbanist-screen',tab,tabs:[{id:'move',label:'Déplacer un quartier'},{id:'storage',label:'Réserve de décors'},{id:'blueprints',label:'Mes plans'}],render:(body,screen)=>{
  const planner=g.urbanist,refresh=()=>{screen.keepTop=true;screen.refresh(true);};
  const selector=()=>{
   const all=[...g.world.buildings.values()].filter(b=>b.type!=='townhall'&&!BUILDINGS[b.type].civic&&!b.cons&&!b.fire),matches=all.filter(b=>`${BUILDINGS[b.type].name} ${b.id}`.toLocaleLowerCase('fr').includes(draft.query.toLocaleLowerCase('fr'))),pages=Math.max(1,Math.ceil(matches.length/24));draft.page=Math.min(draft.page,pages-1);
   const list=h('div.urban-selector',h('label.city-field',h('span','Rechercher un bâtiment'),h('input.text',{type:'search',value:draft.query,'aria-label':'Rechercher dans la ville',onchange:e=>{draft.query=e.target.value;draft.page=0;refresh();}})),h('div.urban-selection-toolbar',h('b',`${selected.size} sélectionné(s)`),h('button.btn.small',{onclick:()=>{selected.clear();refresh();}},'Tout désélectionner')));
   const rows=h('div.urban-building-list');for(const b of matches.slice(draft.page*24,draft.page*24+24))rows.append(h('label.urban-building'+(selected.has(b.id)?'.selected':''),h('input',{type:'checkbox',checked:selected.has(b.id),'aria-label':`Sélectionner ${BUILDINGS[b.type].name} ${b.id}`,onchange:e=>{if(e.target.checked)selected.add(b.id);else selected.delete(b.id);refresh();}}),h('span',BUILDINGS[b.type].icon),h('span',h('b',BUILDINGS[b.type].name),h('small',`n° ${b.id} · ${b.x}, ${b.z} · niveau ${b.level}`))));list.append(rows);
   if(pages>1)list.append(h('div.urban-selection-toolbar',h('button.btn.small',{disabled:draft.page===0,onclick:()=>{draft.page--;refresh();}},'‹ Précédents'),h('span',`${draft.page+1} / ${pages}`),h('button.btn.small',{disabled:draft.page===pages-1,onclick:()=>{draft.page++;refresh();}},'Suivants ›')));
   list.append(h('label.urban-option',h('input',{type:'checkbox',checked:draft.roads,onchange:e=>{draft.roads=e.target.checked;refresh();}}),h('span','Emporter les routes du rectangle sélectionné et de sa bordure d’une case')));return list;
  };
  if(screen.tab==='move'){
   body.append(h('h2.city-heading','Déplacez votre quartier en une seule opération'),note('Sélectionnez les bâtiments, réglez le décalage puis vérifiez le plan. Le déplacement conserve leurs niveaux, leurs habitants et leurs apparences. La mairie, les grands projets et les chantiers restent fixes.'),selector());
   body.append(h('div.urban-controls',number('Décalage horizontal (x)',draft.dx,v=>{draft.dx=v;refresh();}),number('Décalage vertical (z)',draft.dz,v=>{draft.dz=v;refresh();})));
   const p=planner.previewMove([...selected],draft.dx,draft.dz,{roads:draft.roads});body.append(preview(ui,p),h('button.btn.primary',{disabled:!p.ok,onclick:()=>act(ui,screen,planner.move([...selected],draft.dx,draft.dz,{roads:draft.roads}),'Quartier déplacé, bâtiments et routes conservés.')},'Déplacer tout le quartier'),note('Déplacement gratuit. Le bouton Annuler habituel est réinitialisé après une opération d’urbanisme.'));
  }else if(screen.tab==='storage'){
   body.append(h('h2.city-heading','Votre réserve de décorations'),note('Rangez un décor sans le vendre, puis replacez-le gratuitement. Son niveau et ses couleurs restent conservés. Les décors uniques, les chantiers et les grands projets sont protégés.'));
   const existing=[...g.world.buildings.values()].filter(b=>planner.canStore(b)),select=h('select',{'aria-label':'Décoration à ranger',onchange:e=>draft.storeId=Number(e.target.value)},h('option',{value:''},'Choisir un décor posé'),existing.map(b=>h('option',{value:b.id,selected:draft.storeId===b.id},`${BUILDINGS[b.type].name} n°${b.id} · ${b.x}, ${b.z}`)));
   body.append(h('div.city-form',h('label.city-field',h('span','Décor dans la ville'),select),h('button.btn',{onclick:()=>act(ui,screen,planner.storeDecor(draft.storeId),'Décoration rangée sans remboursement.')},'Ranger cette décoration')));
   const stored=planner.data.stored;if(!stored.length)body.append(note('Votre réserve est vide.'));
   for(const entry of stored){const b=entry.building;body.append(h('article.city-card',h('h3',`${BUILDINGS[b.type].icon} ${BUILDINGS[b.type].name}`),note(`Niveau ${b.level} · ${b.appearance?'apparence personnalisée conservée':'apparence d’origine'}`),h('button.btn.small',{onclick:()=>{draft.stored=entry.key;draft.rot=b.rot;refresh();}},'Choisir pour replacer')));}
   if(draft.stored&&stored.some(v=>v.key===draft.stored)){
    body.append(h('div.urban-controls',number('Position x',draft.x,v=>{draft.x=v;refresh();}),number('Position z',draft.z,v=>{draft.z=v;refresh();}),h('button.btn.small',{onclick:()=>{draft.rot=(draft.rot+1)%4;refresh();}},`Pivoter : ${draft.rot*90}°`)));
    const p=planner.previewRestore(draft.stored,draft.x,draft.z,draft.rot);body.append(preview(ui,{...p,buildings:p.building?[p.building]:[]}),h('button.btn.primary',{disabled:!p.ok,onclick:()=>{const r=planner.restoreDecor(draft.stored,draft.x,draft.z,draft.rot);if(r.ok)draft.stored=null;act(ui,screen,r,'Décoration replacée gratuitement.');}},'Replacer gratuitement'));
   }
  }else{
   body.append(h('h2.city-heading','Des quartiers à reproduire'),note('Enregistrez les bâtiments sélectionnés avec leurs couleurs et leurs routes. Chaque copie construit des bâtiments neufs de niveau 1, avec les coûts et les chantiers habituels. Les bâtiments uniques ne sont pas copiables.'),selector(),h('div.city-form',h('label.city-field',h('span','Nom du plan'),h('input.text',{maxlength:40,value:draft.name,'aria-label':'Nom du plan',oninput:e=>draft.name=e.target.value})),h('button.btn.primary',{disabled:!selected.size,onclick:()=>act(ui,screen,planner.saveBlueprint(draft.name,[...selected],{roads:draft.roads}),'Plan de quartier enregistré.')},'Enregistrer cette sélection')));
   for(const bp of planner.data.blueprints)body.append(h('article.city-card',h('h3',bp.name),note(`${bp.buildings.length} bâtiments · ${bp.roads.length} cases de route · ${bp.width} × ${bp.depth} cases`),h('div.urban-selection-toolbar',h('button.btn.small',{onclick:()=>{draft.blueprint=bp.id;refresh();}},'Préparer une copie'),h('button.btn.small',{onclick:()=>{const r=planner.deleteBlueprint(bp.id);if(r.ok&&draft.blueprint===bp.id)draft.blueprint=null;act(ui,screen,r,'Plan retiré.');}},'Supprimer ce plan'))));
   if(draft.blueprint){body.append(h('div.urban-controls',number('Origine x du plan',draft.x,v=>{draft.x=v;refresh();}),number('Origine z du plan',draft.z,v=>{draft.z=v;refresh();})));
    const p=planner.previewBlueprint(draft.blueprint,draft.x,draft.z);body.append(preview(ui,p),p.cost?costChips(p.cost,g.state.res,{libre:ui.libre}):null,h('button.btn.primary',{disabled:!p.ok,onclick:()=>act(ui,screen,planner.buildBlueprint(draft.blueprint,draft.x,draft.z),'Quartier posé. Les chantiers commencent.')},'Payer et construire tout le plan'));}
  }
 }});
}
