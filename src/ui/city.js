import { h, costChips, progressBar } from './dom.js';
import { openScreen, countdown } from './screens.js';
import { SPECIALTIES, FACADES, GARDENS, PROJECTS, HOUSEHOLDS, TERRITORIES, TRANSPORT } from '../data/city.js';
import { BUILDINGS } from '../data/buildings.js';
import { GOODS, RESOURCES } from '../data/resources.js';
import { SIZE,ZONE,ZONES } from '../world/constants.js';
import { fmt, fmtDec } from '../core/util.js';

const select = (label, values, current, change) => h('label.city-field', h('span',label),h('select',{ 'aria-label':label, value:current,onchange:(e)=>change(e.target.value) },values.map(([value,name])=>h('option',{value,selected:value===String(current)},name))));
const note = (text) => h('p.city-note',text);
const title = (text) => h('h2.city-heading',text);
function apply(ui, screen, result, text='Enregistré') {
  if(!result.ok){ui.toast(result.reason,'error');return false;}
  ui.toast(text,'good');screen?.refresh(true);return true;
}
const button = (text,fn,disabled=false) => h('button.btn.primary',{onclick:fn,disabled},text);
const cost = (ui,value) => costChips(value,ui.game.state.res,{libre:ui.libre});

export function openCity(ui, tab='districts') {
  if(!ui.game.playing || ui.game.visit)return ui.toast('Ouvrez votre propre village pour le développer.','info');
  ui.closeSheet(true);
  const drafts={};
  const screen=openScreen(ui,{
    id:'city', title:'🏘️ Développer',cls:'city-screen',tab,
    tabs:[{id:'districts',label:'Quartiers'},{id:'projects',label:'Grands projets'},{id:'families',label:'Habitants'},{id:'logistics',label:'Transports'},{id:'regions',label:'Région'}],
    onClose:()=>{ui.game.renderer.showDistricts=false;ui.game.renderer.cityView.districtBorders(false);},
    render:(body,sc)=>{
      if(sc.tab!=='districts' && ui.game.renderer.showDistricts){ui.game.renderer.showDistricts=false;ui.game.renderer.cityView.districtBorders(false);}
      ({districts:renderDistricts,projects:renderProjects,families:renderFamilies,logistics:renderLogistics,regions:renderRegions})[sc.tab](ui,body,sc,drafts);
    },
  });
  return screen;
}

function renderDistricts(ui,body,screen,drafts) {
  const city=ui.game.city,st=ui.game.state;city.recount();
  body.append(title('Donnez une identité à vos quartiers'),note('Associez des zones voisines, nommez-les et choisissez leur spécialité. Les bonus s’activent quand le quartier accueille les bâtiments indiqués.'));
  const cards=h('div.city-grid');
  for(const d of city.data.districts){
    const rule=SPECIALTIES[d.specialty],info=city.districts.get(d.zones[0]);
    cards.appendChild(h('article.city-card',h('span.city-card-icon',rule.icon),h('h3',d.name),h('p',rule.name),
      h('span.city-state'+(info?.active?'.on':''),info?.active?'Bonus actif':`${info?.count||0}/${rule.count} · ${rule.goal}${rule.decor?' et deux décors':''}`),
      h('p',rule.production?`Production +${Math.round((rule.production-1)*100)} %${rule.happy<0?' ; bonheur des logements −5 %':''}`:rule.commerce?'Commerces +15 %':rule.tourism?'+20 de tourisme par jour':'Bonheur +4 %'),
      h('div.city-actions',h('button.btn.small',{onclick:()=>{drafts.district={id:d.id,name:d.name,specialty:d.specialty,zones:[...d.zones]};screen.refresh(true);}},'Modifier'),h('button.btn.small',{onclick:()=>{ui.closeScreen();const z=d.zones[0];ui.game.renderer.cam.target.set((z%ZONES)*ZONE+ZONE/2-SIZE/2,0,Math.floor(z/ZONES)*ZONE+ZONE/2-SIZE/2);ui.game.renderer.cam.distance=26;ui.game.renderer.showDistricts=true;ui.game.renderer.cityView.districtBorders(true);}},'Voir sur la carte'))));
  }
  body.append(cards,h('button.btn',{onclick:()=>{drafts.district={id:null,name:'Nouveau quartier',specialty:'residential',zones:[]};screen.refresh(true);}},'＋ Créer un quartier'));
  const draft=drafts.district;
  if(draft){
    const form=h('div.city-form',title(draft.id?'Modifier le quartier':'Nouveau quartier'),
      h('label.city-field',h('span','Nom du quartier'),h('input.text',{value:draft.name,maxLength:28,'aria-label':'Nom du quartier',oninput:(e)=>draft.name=e.target.value})),
      select('Spécialité',Object.entries(SPECIALTIES).map(([id,s])=>[id,s.name]),draft.specialty,(v)=>draft.specialty=v),
      note('Touchez les zones débloquées. Les zones grises sont verrouillées ; celles d’un autre quartier restent réservées.'));
    const grid=h('div.district-picker',{'aria-label':'Zones du quartier'});
    for(let i=0;i<st.zones.length;i++){
      const other=city.data.districts.some((d)=>d.id!==draft.id&&d.zones.includes(i));
      grid.appendChild(h('button.district-cell'+(draft.zones.includes(i)?'.on':''),{disabled:!st.zones[i]||other,'aria-label':`Zone ${i+1}`,'aria-pressed':draft.zones.includes(i),onclick:()=>{draft.zones=draft.zones.includes(i)?draft.zones.filter((z)=>z!==i):[...draft.zones,i];screen.refresh(true);}},st.zones[i]?other?'•':draft.zones.includes(i)?'✓':'＋':'·'));
    }
    form.append(grid,button('Enregistrer le quartier',()=>{const r=city.setDistrict(draft.id,draft.name,draft.specialty,draft.zones);if(r.ok)drafts.district=null;apply(ui,screen,r,'Quartier enregistré');}),h('button.btn',{onclick:()=>{drafts.district=null;screen.refresh(true);}},'Annuler'));
    if(draft.id)form.appendChild(h('button.btn.danger-soft',{onclick:async()=>{if(await ui.confirm('Dissoudre ce quartier ?',note('Les bâtiments sont conservés. Seule la spécialisation disparaît.'))){city.removeDistrict(draft.id);drafts.district=null;screen.refresh(true);}}},'Dissoudre le quartier'));
    body.appendChild(form);
  }
  body.appendChild(h('button.btn',{onclick:()=>{ui.closeScreen();ui.game.renderer.showDistricts=true;ui.game.renderer.cityView.districtBorders(true);ui.toast('Limites des quartiers affichées. Touchez Calques pour revenir aux autres vues.','info');}},'🗺️ Voir toutes les limites'));
}

function renderProjects(ui,body,screen) {
  const city=ui.game.city,now=Date.now();
  body.append(title('Des lieux qui racontent votre histoire'),note('Posez un emplacement, financez les étapes puis inaugurez chaque phase. Les travaux continuent en temps réel, même jeu fermé.'));
  const grid=h('div.city-grid');
  for(const [id,rule] of Object.entries(PROJECTS)){
    const p=city.project(id),building=city.projectBuilding(id),unlocked=ui.libre||ui.st.level>=rule.level;
    const card=h('article.city-card',h('span.city-card-icon',rule.icon),h('h3',rule.name),h('p',rule.bonus),progressBar(p.phase/3),h('p.city-state',`${p.phase}/3 étapes inaugurées`));
    if(!building)card.append(button(unlocked?'Choisir l’emplacement':`Niveau ${rule.level}`,()=>{ui.closeScreen();ui.setTool({kind:'build',type:id});},!unlocked),note('Emplacement : 100 pièces, hors défrichage.'));
    else if(p.phase===3)card.append(h('p.city-state.on','✓ Lieu inauguré'),h('button.btn',{onclick:()=>{ui.closeScreen();ui.game.renderer.focusBuilding(building,12);}},'Voir mon projet'));
    else {
      const phase=rule.phases[p.phase];card.append(h('h4',phase.name),cost(ui,phase.cost));
      if(p.readyAt)card.append(button(now>=p.readyAt?'Inaugurer cette étape':`Travaux · ${countdown(p.readyAt-now)}`,()=>apply(ui,screen,city.finishProject(id),'Étape inaugurée !'),now<p.readyAt));
      else card.append(button(`Financer · ${countdown(phase.seconds*1000)}`,()=>apply(ui,screen,city.startProject(id),'Les travaux commencent')));
    }
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

function renderFamilies(ui,body,screen) {
  const city=ui.game.city;city.syncFamilies();
  body.append(title('Les familles de votre village'),note('Leurs histoires progressent avec vos constructions, vos livraisons et vos voyages. Leurs maisons et leurs souvenirs restent dans votre sauvegarde.'));
  if(!city.data.families.length)return body.appendChild(note('Construisez une habitation et terminez son chantier pour accueillir votre première famille.'));
  const grid=h('div.city-grid');
  for(const f of city.data.families){
    const person=HOUSEHOLDS[f.family],p=city.familyProgress(f),home=ui.game.world.buildings.get(f.house);
    const card=h('article.city-card.family-card',h('span.city-card-icon',person.icon),h('h3',person.name),h('p',person.people),h('small',person.job),h('p.city-state',home?`Maison n°${home.id} · niveau ${home.level}`:'Attend une nouvelle maison'));
    if(p.finished)card.append(h('h4','Une famille heureuse'),note('Vous avez accompli toutes ses histoires. Merci de lui avoir donné une place dans le village.'));
    else card.append(h('h4',p.chapter.title),h('blockquote',p.chapter.text),progressBar(Math.min(1,p.cur/p.target)),h('p',`${fmt(p.cur)} / ${p.target}`),h('p.city-reward',`Récompense : ${p.chapter.reward.coins} pièces · ${p.chapter.reward.xp} XP`),button('Achever cette histoire',()=>apply(ui,screen,city.claimStory(f.family),'La famille vous remercie !'),!p.done));
    if(home)card.appendChild(h('button.btn.small',{onclick:()=>{ui.closeScreen();ui.game.renderer.focusBuilding(home,12);ui.game.select(home.id);}},'Retrouver la famille'));
    grid.appendChild(card);
  }
  body.appendChild(grid);
}

function renderLogistics(ui,body,screen,drafts) {
  const g=ui.game,city=g.city,buildings=[...g.world.buildings.values()];
  body.append(title('Vos marchandises prennent la route'),note('Activez une tournée entre un producteur et le Grand Entrepôt. Sa production attendra sur place, puis rejoindra le stock seulement à l’arrivée du véhicule. Sans tournée, les livraisons habituelles restent actives.'));
  const producers=buildings.filter((b)=>BUILDINGS[b.type].produces&&b.type!=='townhall'&&b.cons?.k!=='new'),depots=buildings.filter((b)=>b.type==='depot'&&b.cons?.k!=='new');
  const list=h('div.city-grid');
  for(const route of city.data.routes){
    const b=g.world.buildings.get(route.from),target=g.world.buildings.get(route.to),job=city.data.deliveries.find((j)=>j.from===route.from);
    const buffer=Object.entries(city.data.buffers[route.from]||{}).map(([r,n])=>`${fmtDec(n)} ${RESOURCES[r]?.name}`).join(', ');
    list.appendChild(h('article.city-card',h('h3',`${route.mode==='truck'?'🚚':'🐎'} ${BUILDINGS[b?.type]?.name||'Producteur'}`),h('p',`Vers ${BUILDINGS[target?.type]?.name||'l’entrepôt'}`),note(buffer?`En attente : ${buffer}`:'Le producteur prépare son chargement.'),job?h('div',h('p',`${RESOURCES[job.res].name} · ${fmtDec(job.qty)} · ${job.blocked?'Route coupée':job.progress===1?'Attend de la place':'En route'}`),progressBar(job.progress)):null,h('button.btn.small',{onclick:()=>apply(ui,screen,city.removeRoute(route.from),'Tournée arrêtée, marchandises rapatriées')},'Arrêter la tournée')));
  }
  body.append(list,note(`${city.data.delivered} livraisons arrivées à l’entrepôt.`));
  if(!producers.length||!depots.length)return body.appendChild(note('Terminez un bâtiment de production et un Grand Entrepôt pour organiser votre première tournée.'));
  const d=drafts.route ||= {from:producers[0].id,to:depots[0].id,mode:'cart'};
  body.append(h('div.city-form',title('Nouvelle tournée'),select('Producteur',producers.map((b)=>[String(b.id),`${BUILDINGS[b.type].name} n°${b.id}`]),String(d.from),(v)=>d.from=Number(v)),select('Entrepôt',depots.map((b)=>[String(b.id),`Grand Entrepôt n°${b.id}`]),String(d.to),(v)=>d.to=Number(v)),select('Véhicule',[['cart','Charrette · 20 unités'],['truck','Camion · 60 unités, chaussée carrossable']],d.mode,(v)=>d.mode=v),button('Créer la tournée',()=>apply(ui,screen,city.createRoute(d.from,d.to,d.mode),'Tournée créée'))));
}

function renderRegions(ui,body,screen,drafts) {
  const city=ui.game.city,book=city.book,id=ui.st.regionId;
  body.append(title('Une région entière à construire'),note('Chaque territoire possède sa carte, ses bâtiments et son stock. Vos autres villages sont conservés pendant votre voyage. Les expéditions continuent en temps réel ; la simulation des villages se déroule quand vous les visitez.'));
  const map=h('div.region-map');
  for(const [key,rule] of Object.entries(TERRITORIES)){
    const entry=book.settlements[key],active=id===key;
    const card=h('article.region-card.'+key+(active?'.active':''),h('span.city-card-icon',rule.icon),h('h3',entry?.name||rule.name),h('p',active?'Vous êtes ici':entry?'Village ouvert':`Niveau ${rule.level} requis`));
    if(key!=='home')card.appendChild(note(key==='island'?'Production de nourriture +15 %':key==='mountain'?'Production de pierre +15 %':'Commerces +15 %'));
    if(!entry)card.append(cost(ui,rule.cost),button('Fonder ce village',()=>apply(ui,screen,city.unlockTerritory(key),'Nouveau territoire ouvert !'),!ui.libre&&book.level<rule.level));
    else if(!active)card.append(button('Voyager',()=>{const r=city.switchTerritory(key);if(!r.ok)ui.toast(r.reason,'error');else ui.toast(`Bienvenue : ${ui.game.state.name}`,'good');}));
    map.appendChild(card);
  }
  body.appendChild(map);
  const dest=Object.keys(book.settlements).filter((k)=>k!==id);
  if(dest.length){
    const d=drafts.shipment ||= {to:dest[0],res:'wood',qty:20,mode:'cart'};
    if(!dest.includes(d.to))d.to=dest[0];
    body.append(h('div.city-form',title('Relier vos villes'),select('Destination',dest.map((k)=>[k,book.settlements[k].name]),d.to,(v)=>d.to=v),select('Marchandise',GOODS.map((r)=>[r,RESOURCES[r].name]),d.res,(v)=>d.res=v),h('label.city-field',h('span','Quantité à expédier'),h('input.text',{type:'number',min:1,max:500,step:1,value:d.qty,'aria-label':'Quantité à expédier',oninput:(e)=>d.qty=Number(e.target.value)})),select('Transport régional',Object.entries(TRANSPORT).map(([k,v])=>[k,`${v.icon} ${v.name} · ${v.capacity} unités · ${v.fee} pièces · ${countdown(v.seconds*1000)}`]),d.mode,(v)=>d.mode=v),note('Le train exige une gare reliée ; le cargo exige un Port des Explorateurs terminé. Les convois légers, par route ou par bac, sont disponibles dès le premier territoire.'),button('Expédier les marchandises',()=>apply(ui,screen,city.sendShipment(d.to,d.res,d.qty,d.mode),'Votre convoi est parti !'))));
  }
  for(const job of book.shipments.slice().reverse().slice(0,10)){
    const progress=job.delivered?1:Math.min(1,(Date.now()-job.sentAt)/(job.readyAt-job.sentAt));
    body.appendChild(h('article.city-card.region-shipment',h('h3',`${TRANSPORT[job.mode].icon} ${book.settlements[job.from]?.name} → ${book.settlements[job.to]?.name}`),h('p',`${job.qty} ${RESOURCES[job.res].name} · ${job.delivered?'Livré':countdown(job.readyAt-Date.now())}`),h('div.region-track',h('span',{style:{left:`${Math.round(progress*92)}%`}},TRANSPORT[job.mode].icon)),progressBar(progress)));
  }
}

export function customizeBuilding(ui,id) {
  const b=ui.game.world.buildings.get(id);if(!b)return;
  const draft={facade:'original',roof:'mix',garden:'none',...b.appearance};
  const body=h('div.city-form',note('Les façades sont repeintes sans changer les coûts, la production ou les niveaux. Les jardins s’intègrent à l’emprise du bâtiment.'),select('Façade',Object.entries(FACADES).map(([id,v])=>[id,v.name]),draft.facade,(v)=>draft.facade=v),select('Toiture',[['mix','Couleurs variées'],['blue','Bleu'],['red','Rouge'],['green','Vert'],['yellow','Or des blés']],draft.roof,(v)=>draft.roof=v),select('Abords',Object.entries(GARDENS),draft.garden,(v)=>draft.garden=v));
  ui.modal({title:'🎨 Personnaliser '+BUILDINGS[b.type].name,body,actions:[{label:'Annuler'},{label:'Appliquer',cls:'primary',onclick:()=>{const r=ui.game.city.styleBuilding(id,draft);if(!r.ok){ui.toast(r.reason,'error');return true;}ui.toast('Nouvelle apparence appliquée','good');ui.sheet?.refresh(true);}}]});
}
