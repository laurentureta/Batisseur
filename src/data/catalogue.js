// Collections architecturales : chaque référence possède son plan 3D et ses effets.
// IDs déterministes : une sauvegarde conserve le même bâtiment entre les versions.
export const COLLECTIONS = {
  bocage: { name: 'Bocage', wall: 0xf1e5cc, roof: 0xb85f43, trim: 0x795e48, garden: 0x719e5b },
  alpine: { name: 'Alpages', wall: 0xdac5a4, roof: 0x596f7b, trim: 0x846249, garden: 0x538568 },
  riviera: { name: 'Riviera', wall: 0xf4d6b4, roof: 0xd37e58, trim: 0x4d9ca5, garden: 0x80a861 },
  jardin: { name: 'Cité-jardin', wall: 0xe6dfd0, roof: 0x65967d, trim: 0x587b6b, garden: 0x75a358 },
  heritage: { name: 'Patrimoine', wall: 0xdfceaf, roof: 0x69748a, trim: 0x8b6853, garden: 0x6e9662 },
  canal: { name: 'Canal', wall: 0xd8a78a, roof: 0x4e6776, trim: 0xf0e5ca, garden: 0x719f6a },
};
const styles = Object.keys(COLLECTIONS);
const entries = [];
const add = d => entries.push(d);
const housing = [
  ['cottage','Chaumière', '🏡',1,1], ['chalet','Chalet', '🏔️',2,1],
  ['villa','Villa à patio','🏠',5,1], ['townhouse','Maison de bourg','🏘️',4,1],
  ['longhouse','Longère','🏡',3,2], ['duplex','Maison jumelée','🏘️',7,2],
  ['manor','Demeure à tourelle','🏰',12,2], ['apartment','Résidence','🏢',16,2],
];
for (const [family,name,icon,unlock,size] of housing) for(let variant=0;variant<6;variant++) {
  const collection=styles[variant], base=family==='apartment'?10:family==='manor'?8:size===2?5:2;
  const coins=80+unlock*25+variant*15;
  add({ id:`v5_home_${family}_${collection}`,name:`${name} · ${COLLECTIONS[collection].name}`,icon,cat:'housing',unlock:unlock+variant,maxLevel:3,size:[size,size],
    cost:{coins,wood:15+unlock*2,stone:unlock*2}, residents:[base,base*2,base*3],tax:[6,7,8],
    levelNames:[name,`${name} · Confort`,`${name} · Prestige`],
    upgradeNeeds:[[],['water'],['water','commerce','leisure']],
    catalogue:{kind:'home',family,variant,collection},xp:5+unlock,
    desc:`Collection ${COLLECTIONS[collection].name}. Logement évolutif, ${base} à ${base*3} habitants. Un plan, des volumes et un jardin propres à cette maison.` });
}
const shops=[
  ['cafe','Café','☕','leisure',3],['florist','Fleuriste','💐','commerce',4],
  ['books','Librairie','📚','education',6],['grocer','Épicerie','🥦','commerce',2],
  ['tea','Salon de thé','🫖','leisure',5],['pottery','Boutique de céramique','🏺','commerce',7],
  ['hotel','Auberge','🛎️','leisure',10],['restaurant','Restaurant','🍽️','leisure',9],
  ['fashion','Atelier de couture','🧵','commerce',8],['gallery','Galerie d’art','🎨','leisure',12],
];
for(const [family,name,icon,need,unlock] of shops)for(let variant=0;variant<6;variant++){
  const collection=styles[variant];
  add({id:`v5_shop_${family}_${collection}`,name:`${name} · ${COLLECTIONS[collection].name}`,icon,cat:'commerce',unlock:unlock+variant,maxLevel:3,size:family==='hotel'?[2,2]:[1,1],
    cost:{coins:160+unlock*35+variant*20,wood:20+unlock,stone:15+unlock},workers:family==='hotel'?4:2,
    coverage:{need,radius:[4,5,6]},income:{base:15+unlock*2,perRes:.35,radius:5},upkeep:2,
    catalogue:{kind:'shop',family,variant,collection},
    desc:`Collection ${COLLECTIONS[collection].name}. Un commerce avec sa propre devanture et ses aménagements ; attire les habitants et procure des revenus.`});
}
const services=[
  ['library','Bibliothèque','📖','education',6],['doctor','Maison médicale','🩺','health',7],
  ['water','Pavillon des eaux','💧','water',4],['watch','Poste de quartier','🛡️','security',9],
  ['community','Maison des associations','🤝','leisure',5],['nursery','École maternelle','🧸','education',8],
];
for(const [family,name,icon,need,unlock]of services)for(let variant=0;variant<4;variant++){
  const collection=styles[variant];
  add({id:`v5_service_${family}_${collection}`,name:`${name} · ${COLLECTIONS[collection].name}`,icon,cat:'services',unlock:unlock+variant,maxLevel:3,size:[1,1],
    cost:{coins:220+unlock*40+variant*30,wood:40,stone:35},workers:2,coverage:{need,radius:[5,6,7]},upkeep:8,
    catalogue:{kind:'service',family,variant,collection},
    desc:`Collection ${COLLECTIONS[collection].name}. Couvre le quartier en ${need==='education'?'éducation':need==='health'?'santé':need==='water'?'eau':need==='security'?'sécurité':'loisirs'} lorsqu’il est relié à la mairie.`});
}
const decorations=[
  ['trees','Bosquet','🌳',1],['flowers','Jardin fleuri','🌷',1],['seating','Coin détente','🪑',2],
  ['fountain','Bassin et jets','⛲',4],['pergola','Pergola','🌿',5],['hedge','Jardin de haies','🌱',2],
  ['pond','Mare paysagée','🪷',3],['sculpture','Sculpture','🗿',7],['playground','Aire de jeux','🛝',4],
  ['picnic','Espace pique-nique','🧺',3],['orchard','Verger décoratif','🍎',4],['lantern','Allée de lanternes','🏮',5],
  ['terrace','Terrasse paysagée','🪴',6],['obelisk','Stèle du jardin','🗼',8],['rockery','Rocaille','🪨',2],
  ['gazebo','Petit kiosque','🏛️',7],['sport','Terrain de quartier','🏀',6],['plaza','Placette','🧱',3],
];
for(const[family,name,icon,unlock]of decorations)for(let variant=0;variant<6;variant++){
  const collection=styles[variant];
  add({id:`v5_decor_${family}_${collection}`,name:`${name} · ${COLLECTIONS[collection].name}`,icon,cat:'decor',unlock:unlock+variant,maxLevel:1,size:[1,1],
    cost:{coins:30+unlock*15+variant*12,...(unlock>3?{stone:unlock*2}:{})},beauty:{v:.025+unlock*.005,r:2+Number(unlock>4)},
    ...(['seating','playground','picnic','sport','gazebo'].includes(family)?{coverage:{need:'leisure',radius:[2.5]}}:{}),
    catalogue:{kind:'decor',family,variant,collection},xp:2,
    desc:`Collection ${COLLECTIONS[collection].name}. Composition ${variant+1} avec un tracé et des éléments propres ; embellit les habitations proches.`});
}
export const EXPANDED_BUILDINGS = entries;
