// Architecture modulaire dessinée pour les collections de la ville.
// Une seule géométrie fusionnée par modèle : pas de maillage ajouté par fenêtre ou fleur.
import { COLLECTIONS } from '../data/catalogue.js';
import { shade } from './geom.js';

const C={stone:0xd5cebd,dark:0x485560,wood:0x9f7956,water:0x70cbd6,gold:0xe6bc69};
function leaf(g,ctx,x,z,s=.17,color=0x639654,y=.03){
 g.cyl(x,y,z,s*.13,s*.9,5,0x94714e);
 g.ico(x,y+s*1.45,z,s,ctx.leaf(color),.95,.12,x*19+z*37);
}
function flowers(g,ctx,x,z,n,p){
 for(let k=0;k<n;k++){const a=k*2.4,r=.04*Math.sqrt(k);g.ico(x+Math.cos(a)*r,.12,z+Math.sin(a)*r,.025,ctx.winter?0xf3f7f6:[0xf0a8b4,0xf0ce6f,0xbcb0dc,0xe4796c][(k+p)%4],.7,0,k);}
}
function bench(g,x,z,angle=0){
 g.push(angle,x,.025,z);g.box(0,.09,0,.3,.025,.11,C.wood);g.box(0,.115,-.047,.3,.095,.02,C.wood);
 for(const s of[-1,1])g.box(s*.12,0,0,.025,.09,.1,C.dark);g.pop();
}
function lamp(g,x,z,h=.55){
 g.cyl(x,.03,z,.012,h,5,C.dark);g.box(x,h+.03,z,.07,.1,.07,C.dark);
 g.layer('glass');g.box(x,h+.045,z,.055,.065,.075,0xffe4a0);g.layer('body');
 g.cone(x,h+.13,z,.065,.05,4,C.dark);
}
function pot(g,ctx,x,z,p){g.cyl(x,.03,z,.055,.09,7,p.roof,.07);leaf(g,ctx,x,z,.075,p.garden,.1);}
function fence(g,s,p,v){
 const z=s*.46;
 for(let k=0;k<4+v%3;k++){const x=-s*.43+k*s*.86/(3+v%3);g.box(x,.03,-z,.025,.13,.025,p.trim);}
 g.box(0,.1,-z,s*.89,.025,.025,p.trim);
 g.box(-s*.46,.03,0,.035,.1,s*.9,p.trim);
}
function windows(g,x,y,z,w,n,rows,fh=.26){
 for(let row=0;row<rows;row++)for(let k=0;k<n;k++){
  const xx=x-w*.38+(n===1?w*.38:k*w*.76/(n-1));
  if(row===0&&Math.abs(xx)<.055)continue;
  g.layer('glass');g.box(xx,y+.09+row*fh,z,.085,.12,.014,0xd3e9e8);g.layer('body');
  g.box(xx,y+.08+row*fh,z+.012,.11,.015,.023,C.stone);
 }
}
function door(g,x,z,p,h=.23){g.box(x,.035,z,.1,h,.02,p.trim);g.box(x+.027,.14,z+.015,.012,.012,.012,C.gold);}
function chimney(g,out,x,z,y,p){g.box(x,y,z,.065,.16,.065,p.trim);g.box(x,y+.16,z,.085,.025,.085,C.stone);out.emitters.push({pos:[x,y+.2,z],kind:'smoke'});}
function roof(g,ctx,x,y,z,w,d,h,p,ridge=1){g.roof(x,y,z,w,d,h,w*ridge,ctx.roof(p.roof),p.wall);}
function home(g,L,ctx,out,d,p){
 const {family,variant:v}=d.catalogue,s=d.size[0];
 const w=s*(.55+v*.018),depth=s*(.47+(v%3)*.035),z=-s*.08;
 const floors=family==='apartment'?3+Number(L>1):family==='townhouse'?2:1+Number(L===3);
 const fh=.29,h=floors*fh,wall={top:shade(p.wall,.93),side:p.wall,back:shade(p.wall,.93)};
 g.box(0,.03,z,w,h,depth,wall);
 const front=z+depth/2+.01;
 if(family==='villa'||family==='apartment'){
  g.box(0,h+.03,z,w+.035,.035,depth+.035,p.trim);
  g.box(0,h+.065,z,w-.08,.012,depth-.08,ctx.roof(p.roof));
  if(family==='villa'){g.box(-w*.38,.03,z+.17,w*.35,.23,depth*.75,wall);g.box(-w*.38,.26,z+.17,w*.38,.035,depth*.78,p.trim);}
 }else roof(g,ctx,0,h+.03,z,w+.1,depth+.08,family==='chalet'?.3:.18+v*.012,p,family==='cottage'?.3:family==='manor'?.4:1);
 windows(g,0,.03,front,w,2+Number(v>3),floors,fh);door(g,0,front+.01,p);
 if(family==='chalet'){
  g.box(0,.3,front+.07,w+.06,.025,.15,p.trim);
  for(let k=0;k<6;k++)g.box(-w*.5+k*w/5,.32,front+.14,.018,.12,.018,p.trim);
  g.box(0,.42,front+.14,w+.03,.02,.02,p.trim);
 }
 if(family==='longhouse'||family==='duplex'){
  const x=s*.29,ww=s*.29,hh=family==='duplex'?h*.9:h*.65;
  g.box(x,.03,z+.025,ww,hh,depth*.88,wall);roof(g,ctx,x,hh+.03,z+.025,ww+.07,depth*.88+.07,.17,p,1);door(g,x,front-.012,p);
 }
 if(family==='manor'){
  const x=-s*.29;g.cyl(x,.03,z+.08,.16,h+.27,8,p.wall);g.cone(x,h+.3,z+.08,.2,.28,8,ctx.roof(p.roof));
  g.layer('glass');g.box(x,h+.12,z+.242,.065,.1,.01,0xd3e9e8);g.layer('body');
 }
 if(v%2){g.box(w*.31,.03,front+.07,.18,.14,.17,wall);roof(g,ctx,w*.31,.17,front+.07,.22,.21,.1,p,0);}
 if(L>=2){g.box(0,.035,front+.065,.26,.025,.12,C.stone);pot(g,ctx,-w*.32,front+.11,p);}
 chimney(g,out,w*.28,z-.05,h+.12,p);
 g.box(0,.031,s*.29,.13,.012,s*.35,0xdccca9);
 fence(g,s,p,v);leaf(g,ctx,-s*.34,s*.3,.13+(v%3)*.025,p.garden);flowers(g,ctx,s*.28,s*.32,3+v,v);
}
const SHOP_FAMILIES=['cafe','florist','books','grocer','tea','pottery','hotel','restaurant','fashion','gallery'];
function shop(g,L,ctx,out,d,p){
 const {family,variant:v}=d.catalogue,s=d.size[0],index=SHOP_FAMILIES.indexOf(family);
 const w=s*(.57+v*.012),dd=s*(.46+(v%3)*.02),floors=family==='hotel'?2+Math.min(L,2):1+Number(v%2===1||L>=2),h=floors*.28,z=-s*.08,front=z+dd/2;
 g.box(0,.03,z,w,h,dd,{top:shade(p.wall,.94),side:p.wall,back:shade(p.wall,.92)});
 roof(g,ctx,0,h+.03,z,w+.07,dd+.08,.17+(index%3)*.035,p,v%3===0?0:1);
 if(floors>1)windows(g,0,.31,front+.012,w,2+(v%2),floors-1,.28);
 g.layer('glass');g.box(-w*.16,.065,front+.012,w*.35,.2,.018,0xc7e4df);g.layer('body');door(g,w*.27,front+.016,p);
 g.box(0,.3,front+.028,w*.94,.075,.026,p.trim);
 // Enseigne à pictogramme géométrique propre au métier.
 const signX=-w*.34;g.discZ(signX,.338,front+.045,.022+(index%3)*.005,6+index,0xf4d78d);
 const awning=.16+(v%3)*.025;
 g.box(0,.27,front+awning/2,w+.06,.018,awning,p.roof);
 for(let k=0;k<5;k++)g.box(-w*.4+k*w*.2,.25,front+awning,w*.1,.035,.012,k%2?p.roof:0xf5ebd4);
 if(['cafe','tea','restaurant','hotel'].includes(family)){
  const count=1+Number(v>2);for(let k=0;k<count;k++){
   const xx=(k-(count-1)/2)*s*.36;g.cyl(xx,.03,s*.34,.09,.16,8,p.trim);g.cyl(xx,.19,s*.34,.115,.02,10,p.wall);
   bench(g,xx,s*.45,Math.PI);if(v%2)g.cone(xx,.53,s*.34,.16,.09,8,p.roof);
  }
 }else if(family==='florist'){for(let k=0;k<3+v%2;k++){pot(g,ctx,-.29+k*.18,s*.32,p);flowers(g,ctx,-.29+k*.18,s*.32,3,k);}}
 else if(family==='grocer'){for(let k=0;k<3;k++){g.box(-.22+k*.18,.03,.35,.14,.09,.14,C.wood);g.ico(-.22+k*.18,.135,.35,.06,[0xc96646,0xb5bd59,0xe2aa52][k],.65,0,k);}}
 else if(family==='pottery'){for(let k=0;k<4;k++)g.cyl(-.27+k*.18,.03,.34,.05,.1+k*.025,7,p.roof,.035);}
 else if(family==='books'){g.box(0,.03,.35,.44,.12,.12,C.wood);for(let k=0;k<7;k++)g.box(-.18+k*.06,.15,.35,.035,.07+(k%3)*.02,.08,[p.trim,p.roof,C.gold][k%3]);}
 else if(family==='fashion'){g.cyl(0,.03,.35,.015,.22,5,C.dark);g.cone(0,.1,.35,.08,.14,6,p.roof);g.ico(0,.285,.35,.035,p.wall,1,0,2);}
 else{g.box(0,.03,.35,.13,.12,.13,C.stone);g.ico(0,.23,.35,.09,p.trim,1.4,.1,v);}
 if(family==='hotel')chimney(g,out,-w*.3,z,h+.12,p);
 pot(g,ctx,s*.39,s*.18,p);
}
function service(g,L,ctx,out,d,p){
 const {family,variant:v}=d.catalogue,w=.6+v*.025,h=.37+L*.07,z=-.08,front=.19;
 g.box(0,.03,z,w,h,.54,{top:shade(p.wall,.94),side:p.wall,back:shade(p.wall,.91)});
 roof(g,ctx,0,h+.03,z,w+.08,.62,.17+v*.02,p,v%2?1:0);
 windows(g,0,.04,front+.01,w,3,1);door(g,0,front+.025,p,.26);
 if(family==='water'){
  g.cyl(-.24,.03,-.2,.095,h+.2,8,p.trim);g.cyl(-.24,h+.23,-.2,.16,.2,10,0x82b5bc);g.cone(-.24,h+.43,-.2,.17,.1,10,ctx.roof(p.roof));
 }else if(family==='watch'){
  g.box(-.22,.03,-.18,.19,h+.24,.22,p.trim);roof(g,ctx,-.22,h+.27,-.18,.24,.27,.18,p,0);
 }else if(family==='doctor'){
  g.box(0,h-.04,front+.02,.18,.045,.02,0xc86e63);g.box(0,h-.1,front+.023,.045,.16,.02,0xc86e63);
 }else if(family==='library'){
  for(let k=0;k<3;k++)g.box(-.09+k*.09,h-.055,front+.02,.055,.095+(k%2)*.02,.025,p.trim);
 }else if(family==='nursery'){
  g.box(.28,.03,.34,.13,.09,.12,p.roof);g.box(.29,.12,.34,.09,.065,.08,C.gold);g.box(.3,.185,.34,.05,.05,.05,p.trim);
 }else{
  g.cyl(0,.03,.36,.15,.13,10,p.trim);g.cyl(0,.16,.36,.18,.015,10,C.stone);bench(g,-.3,.33,Math.PI/2);
 }
 g.box(0,.031,.32,.16,.015,.3,0xdccca9);leaf(g,ctx,-.36,.33,.12+v*.012,p.garden);flowers(g,ctx,.35,.3,4+v,v);
}
function decor(g,L,ctx,out,d,p){
 const {family,variant:v}=d.catalogue,n=2+v,soil=ctx.ground(0xb8c389),stone=0xd9d2c2,accent=p.roof;
 g.box(0,.03,0,.84,.012,.84,soil);
 if(family==='trees'||family==='orchard'){
  for(let k=0;k<2+v%3;k++){const a=k*2.4+v*.19,r=.16+v*.012,x=Math.cos(a)*r,z=Math.sin(a)*r;
   leaf(g,ctx,x,z,.16+k*.035,p.garden);if(family==='orchard')for(let q=0;q<3;q++)g.ico(x+Math.sin(q*2)*.09,.3+k*.045,z+Math.cos(q*2)*.09,.027,0xd88855,.9,0,q);
  }
 }else if(family==='flowers'){
  for(let k=0;k<2+v%3;k++){const x=-.23+k*.46/(1+v%3);g.box(x,.04,0,.15,.06,.5,stone);flowers(g,ctx,x,-.1,3+v,k);flowers(g,ctx,x,.15,3+v,k+2);}
 }else if(family==='seating'||family==='picnic'){
  for(let k=0;k<2+v%2;k++){const a=k*Math.PI+(v%3)*.45;bench(g,Math.cos(a)*.26,Math.sin(a)*.26,a+Math.PI/2);}
  if(family==='picnic'){g.box(0,.16,0,.34,.03,.22,C.wood);for(const s of[-1,1])g.box(s*.12,.03,0,.025,.13,.17,C.dark);}
  else leaf(g,ctx,0,0,.12+v*.012,p.garden);
 }else if(family==='fountain'||family==='pond'){
  const r=.25+v*.012;
  g.cyl(0,.04,0,r,.045,8+v,stone,r,true,ctx.winter?0xd4e7e7:C.water);
  if(family==='fountain'){
   g.cyl(0,.085,0,.04,.17+v*.025,7,stone);g.cyl(0,.255+v*.025,0,.11,.025,8,stone,.11,true,C.water);
   out.emitters.push({pos:[0,.31+v*.025,0],kind:'water'});
  }else for(let k=0;k<2+v%3;k++)g.ico(Math.sin(k*2.5)*r*.6,.095,Math.cos(k*2.5)*r*.6,.045,ctx.leaf(p.garden),.8,0,k);
  for(let k=0;k<3+v%2;k++){const a=k*2.1;leaf(g,ctx,Math.cos(a)*.35,Math.sin(a)*.35,.07,p.garden);}
 }else if(family==='pergola'||family==='gazebo'){
  const sides=family==='gazebo'?6+v%3:4,r=.29,h=.35+v*.025;
  for(let k=0;k<sides;k++){const a=k*Math.PI*2/sides+Math.PI/4;g.box(Math.sin(a)*r,.04,Math.cos(a)*r,.035,h,.035,p.trim);}
  if(family==='gazebo'){g.cyl(0,.04,0,.34,.03,sides,stone);g.cone(0,h+.04,0,.38,.16,sides,ctx.roof(accent));}
  else for(let k=0;k<4+v%3;k++)g.box(-.29+k*.58/(3+v%3),h+.04,0,.035,.035,.68,p.trim);
  flowers(g,ctx,-.3,-.28,3+v,v);
 }else if(family==='hedge'){
  for(let k=0;k<3+v%3;k++){const a=k*2.4+v*.15;g.box(Math.cos(a)*.24,.04,Math.sin(a)*.24,.18,.14+v*.012,.15,ctx.leaf(p.garden));}
 }else if(family==='sculpture'||family==='obelisk'){
  g.box(0,.04,0,.35,.06,.35,stone);g.box(0,.1,0,.22,.16,.22,p.trim);
  if(family==='obelisk'){g.cyl(0,.26,0,.09,.3+v*.04,4+v%3,p.wall,.045);g.cone(0,.56+v*.04,0,.045,.13,4+v%3,p.wall);}
  else{g.ico(0,.39,0,.14,accent,1.1+v*.12,.05,v);g.ico(.035,.56+v*.022,0,.07,C.gold,1,0,v+2);}
  flowers(g,ctx,-.29,.26,3+v,v);
 }else if(family==='playground'){
  g.box(-.17,.04,-.09,.2,.25+v*.018,.23,p.trim);g.cone(-.17,.29+v*.018,-.09,.19,.12,4,accent);
  for(let k=0;k<5;k++)g.box(-.17,.25-k*.035,.06+k*.065,.14,.025,.08,0xdac56d);
  g.box(.25,.04,0,.025,.38,.025,p.trim);g.box(.25,.42,0,.025,.025,.5,p.trim);
  for(const z of[-.17,.17])g.box(.25,.11,z,.04,.16,.015,C.dark);
 }else if(family==='lantern'){
  for(let k=0;k<2+v%3;k++){const x=-.29+k*.58/(1+v%3);lamp(g,x,k%2?.2:-.2,.35+v*.035);}
  g.box(0,.045,0,.8,.012,.12,stone);
 }else if(family==='terrace'){
  g.box(0,.04,0,.68+v*.012,.06,.64-v*.008,p.trim);bench(g,0,-.18);
  for(let k=0;k<2+v%3;k++)pot(g,ctx,-.28+k*.56/(1+v%3),.23,p);
 }else if(family==='rockery'){
  for(let k=0;k<3+v;k++){const a=k*2.4,r=.09*Math.sqrt(k);g.ico(Math.sin(a)*r,.08,Math.cos(a)*r,.07+(k%3)*.02,stone,.8,.2,k);}
  flowers(g,ctx,.18,-.2,4+v,v);
 }else if(family==='sport'){
  g.box(0,.045,0,.68,.012,.72,0xb9846a);
  for(const x of[-.3,.3])g.box(x,.058,0,.012,.003,.63,0xf1e9d4);
  g.box(0,.058,0,.6,.003,.012,0xf1e9d4);g.cyl(0,.058,0,.11,.003,12,0xf1e9d4,.1,true,0xb9846a);
  g.cyl(0,.06,-.33,.012,.38+v*.018,6,C.dark);g.box(0,.41+v*.018,-.31,.18,.12,.018,p.wall);g.cyl(0,.4+v*.018,-.25,.055,.012,10,accent,.045,true,0xf1e9d4);
 }else{
  for(let k=0;k<n;k++)g.box(-.32+(k%3)*.3,.045,.28-Math.floor(k/3)*.3,.23,.015,.23,k%2?stone:p.wall);
  lamp(g,-.32,-.32,.4+v*.025);bench(g,.16,-.24);pot(g,ctx,.31,.3,p);
 }
}

export function buildCatalogueModel(g,def,L,ctx,out){
 const p=COLLECTIONS[def.catalogue.collection];
 const themeRoof=ctx.theme==='mix'?p.roof:ctx.team??([0x5683a5,0xbe6550,0x629270,0xd9ae62][ctx.roofVar]);
 const palette={...p,roof:themeRoof??p.roof};
 const [w,d]=def.size;
 g.box(0,0,0,w-.055,.03,d-.055,{top:ctx.ground(0xa9bf86),side:0xb4aa90});
 const kind=def.catalogue.kind;
 if(kind==='home')home(g,L,ctx,out,def,palette);
 else if(kind==='shop')shop(g,L,ctx,out,def,palette);
 else if(kind==='service')service(g,L,ctx,out,def,palette);
 else decor(g,L,ctx,out,def,palette);
}
