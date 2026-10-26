// Modèles propres à Bâtisseur : de la fondation au lieu de fête.
export function buildCivicModel(g, type, L) {
  const stone=0xd0c3a5, grass=0x85ad69, wood=0x9b704a, teal=0x438f98;
  g.box(0,.015,0,2.95,.03,2.95,0xdccca6);
  for(const x of [-1.4,1.4]) g.box(x,.04,0,.12,.08,2.95,stone);
  for(const z of [-1.4,1.4]) g.box(0,.04,z,2.95,.08,.12,stone);
  if(L===1){ for(const x of [-1.1,1.1]) for(const z of [-1.1,1.1])g.box(x,.25,z,.06,.5,.06,wood);g.box(0,.04,0,1.5,.08,1.5,0xa28a67);return; }
  if(type==='civic_square') {
    g.cyl(-.45,.1,-.2,.52,.2,16,stone);
    if(L>=3){g.cyl(-.45,.13,-.2,.44,.04,16,0x65bfc3);g.cyl(-.45,.5,-.2,.09,.75,10,stone);g.cyl(-.45,.82,-.2,.25,.08,12,stone);}
    if(L>=4){g.box(.75,.12,-.65,.8,.24,1,wood);g.box(.75,.7,-.65,.06,1.1,.06,wood);g.roof(.75,1.3,-.65,1,1.15,.35,0,teal);for(const x of [-1.15,1.15]){g.box(x,.6,1.1,.05,1.2,.05,wood);g.box(x,.95,1.1,.3,.3,.025,x<0?0xe3a652:0x609dae);}}
  } else if(type==='civic_garden') {
    g.box(0,.04,0,.5,.02,2.6,stone);g.box(0,.04,0,2.6,.02,.5,stone);
    for(const x of [-.8,.8])for(const z of [-.8,.8]){g.box(x,.06,z,.85,.09,.85,grass);if(L>=3){for(const d of [-.2,0,.2])g.cyl(x+d,.15,z,.06,.16,6,0xde8fa2);}}
    if(L>=4){g.cyl(0,.45,0,.12,.8,8,wood);g.box(0,1,0,.55,.5,.15,0xf4e6c3);g.box(0,1.02,.081,.025,.17,.02,teal);g.box(.08,1.04,.081,.16,.025,.02,teal);g.roof(0,1.25,0,.7,.4,.25,0,teal);}
  } else {
    for(let x=-1.3;x<=1.3;x+=.18)g.box(x,.09,.25,.15,.15,2.3,wood);
    if(L>=3){g.box(-.65,.55,-.65,.85,1.1,.85,0xf0e4c9);g.roof(-.65,1.1,-.65,1.05,1.05,.45,0,teal);g.layer('glass');g.box(-.65,.7,-.214,.3,.25,.012,0xffd987);g.layer('body');}
    if(L>=4){g.box(.65,1,-.5,.08,2,.08,wood);g.box(.65,1.9,-.15,.08,.08,.8,wood);g.box(.65,1.5,.2,.04,.7,.04,0xe9e1c9);g.box(.65,1.14,.2,.35,.1,.35,0xcb955b);g.cyl(.6,.2,1,.3,.12,12,teal);}
  }
  if(L>=3)for(const x of [-1.15,1.15]){g.box(x,.14,.65,.4,.17,.15,wood);g.box(x,.3,.7,.4,.3,.05,wood);}
}

export function gardenDetails(g, size, garden, season) {
  if(!garden || garden==='none') return;
  const [w,d]=size, snow=season===3;
  for(const side of [-1,1]) {
    const x=side*(w/2-.12),z=d/2-.15;
    if(garden==='flowers') {
      g.box(x,.07,z,.22,.14,.24,0xb8956c);
      for(let n=0;n<3;n++)g.cyl(x+(n-1)*.055,.19,z,.035,.15,5,snow?0xf0f5f3:n%2?0xf1d780:0xdb8ba2);
    }else{
      g.box(x,.17,0,.12,.32,Math.max(.3,d-.3),snow?0xe2e8d8:0x639060);
      for(const zz of [-d/2+.12,d/2-.12])g.box(x,.23,zz,.045,.46,.045,0xd4b18b);
    }
  }
}
