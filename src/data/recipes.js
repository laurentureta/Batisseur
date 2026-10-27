// Fabrications manuelles : un lot réservé, un délai réel, une production finie.
export const WORKSHOP_QUEUE_LIMIT = 6;
export const RECIPES = [
 {id:'country_bread',name:'Pain de campagne',icon:'🥖',types:['bakery'],level:5,seconds:45,inputs:{flour:8},outputs:{food:25}},
 {id:'pastries',name:'Viennoiseries',icon:'🥐',types:['bakery'],level:7,seconds:90,inputs:{flour:8,food:5},outputs:{pastries:6}},
 {id:'planks_batch',name:'Planches calibrées',icon:'🪚',types:['sawmill'],level:6,seconds:60,inputs:{wood:30},outputs:{planks:20}},
 {id:'furniture',name:'Mobilier artisanal',icon:'🪑',types:['sawmill'],level:10,seconds:150,inputs:{planks:10,tools:2},outputs:{furniture:4}},
 {id:'tools_batch',name:'Outils forgés',icon:'🛠️',types:['forge'],level:14,seconds:90,inputs:{iron:10,wood:10},outputs:{tools:8}},
 {id:'machinery',name:'Petites machines',icon:'⚙️',types:['forge'],level:18,seconds:180,inputs:{iron:20,tools:6},outputs:{machinery:3}},
 {id:'bricks_batch',name:'Briques moulées',icon:'🧱',types:['brickworks'],level:8,seconds:75,inputs:{clay:12,wood:5},outputs:{bricks:10}},
 {id:'ceramics',name:'Céramiques émaillées',icon:'🏺',types:['brickworks'],families:['pottery'],level:9,seconds:120,inputs:{clay:10,wood:5},outputs:{ceramics:6}},
 {id:'flour_batch',name:'Farine fine',icon:'🥣',types:['mill'],level:4,seconds:45,inputs:{wheat:15},outputs:{flour:18}},
 {id:'wool',name:'Tonte et tri de la laine',icon:'🧶',types:['pasture'],level:5,seconds:120,inputs:{food:12},outputs:{wool:8}},
 {id:'cheese',name:'Fromages affinés',icon:'🧀',types:['pasture'],level:8,seconds:180,inputs:{food:12},outputs:{cheese:6}},
 {id:'jam',name:'Confitures du jardin',icon:'🫙',types:['garden'],level:6,seconds:120,inputs:{food:15},outputs:{jam:6}},
 {id:'fabric',name:'Tissage de la laine',icon:'🧵',families:['fashion'],level:8,seconds:120,inputs:{wool:8},outputs:{fabric:6}},
 {id:'clothing',name:'Vêtements cousus main',icon:'👕',families:['fashion'],level:12,seconds:150,inputs:{fabric:6,tools:2},outputs:{clothing:4}},
];
export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map(r=>[r.id,r]));
export const CRAFTED_GOODS = ['wool','fabric','clothing','pastries','furniture','cheese','jam','ceramics','machinery'];
export function recipesForDefinition(def){return def?RECIPES.filter(r=>r.types?.includes(def.id)||r.families?.includes(def.catalogue?.family)):[];}
export function hasWorkshopQueue(state,buildingId){return !!state?.city?.workshops?.byBuilding?.[buildingId]?.queue?.length;}
