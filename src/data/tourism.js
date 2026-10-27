// Le parc se bâtit dans la ville : aucune monnaie ou progression séparée de la sauvegarde.
export const ATTRACTIONS = {
  park_gate: { name: 'Entrée du Parc des Merveilles', icon: '🎟️', level: 6, size: [3,3], visitors: 8, ticket: 2, phases: [
    {name:'Tracer la promenade',cost:{coins:300,wood:40},seconds:60},
    {name:'Bâtir les pavillons',cost:{coins:600,stone:60},seconds:180},
    {name:'Ouvrir les grilles',cost:{coins:900,planks:30},seconds:300},
  ]},
  park_garden: { name: 'Jardins des Papillons', icon: '🦋', level: 8, size:[2,2], visitors: 12, ticket:2, phases:[
    {name:'Tracer les allées',cost:{coins:350,stone:30},seconds:90},
    {name:'Planter les massifs',cost:{coins:600,food:50},seconds:240},
    {name:'Installer la volière',cost:{coins:1000,wood:80},seconds:600},
  ]},
  park_stalls: { name: 'Allée des Gourmandises', icon:'🍭', level:10, size:[2,1], visitors:20,ticket:3,phases:[
    {name:'Poser les comptoirs',cost:{coins:500,wood:60},seconds:120},
    {name:'Monter les auvents',cost:{coins:900,planks:45},seconds:300},
    {name:'Préparer les spécialités',cost:{coins:1200,food:100,flour:40},seconds:900},
  ]},
  park_carousel: {name:'Carrousel des Nuages',icon:'🎠',level:12,size:[2,2],visitors:30,ticket:3,phases:[
    {name:'Couler la plateforme',cost:{coins:700,stone:80},seconds:180},
    {name:'Sculpter les chevaux',cost:{coins:1200,planks:80},seconds:600},
    {name:'Lancer la musique',cost:{coins:1800,tools:20},seconds:1200},
  ]},
  park_wheel: {name:'Grande Roue des Étoiles',icon:'🎡',level:16,size:[3,3],visitors:50,ticket:4,phases:[
    {name:'Ancrer les fondations',cost:{coins:1400,stone:120},seconds:300},
    {name:'Assembler la roue',cost:{coins:2400,iron:80,tools:30},seconds:900},
    {name:'Installer les nacelles',cost:{coins:3200,planks:100,tools:40},seconds:1800},
  ]},
  park_stage: {name:'Théâtre des Lumières',icon:'🎭',level:20,size:[3,2],visitors:40,ticket:4,phases:[
    {name:'Aménager les gradins',cost:{coins:1600,stone:120},seconds:300},
    {name:'Monter la scène',cost:{coins:2600,planks:100,bricks:60},seconds:1200},
    {name:'Préparer la première',cost:{coins:4000,tools:50,food:100},seconds:2400},
  ]},
};
export const TOURISM_BUILDINGS = Object.entries(ATTRACTIONS).map(([id,a])=>({
  id,name:a.name,icon:a.icon,cat:'monuments',tab:'monuments',unlock:a.level,size:a.size,unique:true,civic:true,tourism:true,maxLevel:4,
  costs:[{coins:120},{},{},{}],levelNames:[`Emplacement · ${a.name}`,`Fondations · ${a.name}`,`Aménagement · ${a.name}`,a.name],
  desc:'Parc des Merveilles : posez cet emplacement, puis financez ses trois étapes depuis Village → Parc et festivals. Reliez chaque attraction à la mairie pour recevoir des visiteurs.',
}));
export const PARK_MILESTONES=[
  {visitors:100,name:'Les premiers curieux',coins:500,xp:100},
  {visitors:500,name:'La sortie du dimanche',coins:1500,xp:250},
  {visitors:1500,name:'Une destination régionale',coins:4000,xp:500},
  {visitors:4000,name:'Le parc des grands voyages',coins:10000,xp:1000},
  {visitors:10000,name:'Une merveille reconnue',coins:25000,xp:2000},
];
export const FESTIVAL_THEMES=[
 {id:'spring',name:'Festival des Jardins',icon:'🌸',color:0xea96b8,months:[2,3,4],decor:'x_flower_arch'},
 {id:'maritime',name:'Fête des Navigateurs',icon:'⚓',color:0x53b1c7,months:[5,6,7],decor:'e_pirate_ship'},
 {id:'harvest',name:'Fête des Récoltes',icon:'🌾',color:0xe0a64e,months:[8,9,10],decor:'e_haystacks'},
 {id:'winter',name:'Marché des Lumières',icon:'🎄',color:0xb3cfd5,months:[11,0,1],decor:'e_xmas_market'},
];
export const FESTIVAL_STAGES=[
 {points:100,name:'Préparer les étals',coins:600,xp:100},
 {points:300,name:'Inviter les voisins',coins:1500,xp:250},
 {points:700,name:'La grande fête',coins:3500,xp:500},
];
export const FESTIVAL_VALUES={wood:1,stone:1,food:1,planks:2,flour:2,bricks:3,tools:5};
export function festivalCalendar(now=Date.now()){
 const day=86400000,epochMonday=4*day,week=Math.floor((now-epochMonday)/(7*day)),startsAt=epochMonday+week*7*day;
 const date=new Date(startsAt),theme=FESTIVAL_THEMES.find(t=>t.months.includes(date.getUTCMonth()));
 return {...theme,id:`${theme.id}-${week}`,startsAt,endsAt:startsAt+7*day};
}
