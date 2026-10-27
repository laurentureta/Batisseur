import { GeoBuilder } from './geom.js';
import { ATTRACTIONS } from '../data/tourism.js';
const C={stone:0xc7b9a0,wood:0xa16f4c,cream:0xffefd1,teal:0x478e9c,coral:0xe48c7b,gold:0xe2b75e,grass:0x85b578,rose:0xe3a1b6};
function ring(g){
 const face=(a,b,c,d,color)=>{g.quad(a,b,c,d,color);g.quad(d,c,b,a,color);};
 const n=32,r=1.05,ri=.98;
 for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;face([Math.cos(a)*r,Math.sin(a)*r,0],[Math.cos(b)*r,Math.sin(b)*r,0],[Math.cos(b)*ri,Math.sin(b)*ri,0],[Math.cos(a)*ri,Math.sin(a)*ri,0],C.cream);}
 for(let i=0;i<8;i++){const a=i/8*Math.PI*2,x=Math.cos(a),y=Math.sin(a);face([-.025*y,.025*x,.005],[.025*y,-.025*x,.005],[x+.025*y,y-.025*x,.005],[x-.025*y,y+.025*x,.005],i%2?C.coral:C.gold);}
 g.discZ(0,0,.015,.12,12,C.gold);
}
export function buildTourismModel(g,type,L,ctx,out){
 const a=ATTRACTIONS[type];if(!a)return;
 const [w,d]=a.size;g.box(0,0,0,w-.05,.06,d-.05,ctx.ground(C.cream));
 for(const x of [-w/2+.12,w/2-.12])g.box(x,.06,0,.12,.06,d-.1,C.stone);
 if(L===1){g.box(0,.065,0,w*.64,.025,d*.64,0xb69c78);for(const x of [-w*.35,w*.35])for(const z of [-d*.35,d*.35]){g.box(x,.08,z,.055,.35,.055,C.wood);g.box(x,.28,z,.16,.05,.035,C.coral);}return;}
 if(type==='park_gate'){
  for(const x of [-.87,.87]){g.box(x,.06,0,.38,.9,.45,C.stone);g.box(x,.96,0,.5,.08,.55,C.cream);if(L>=3){g.box(x,1.04,0,.25,.5,.3,C.cream);g.roof(x,1.54,0,.5,.6,.3,0,C.teal);}}
  if(L>=3){g.box(0,1.25,0,1.9,.25,.28,C.teal);g.box(0,1.31,.15,.95,.12,.025,C.gold);}
  if(L>=4){g.box(-.95,.06,.85,.55,.55,.6,C.cream);g.roof(-.95,.61,.85,.7,.72,.3,0,C.coral);g.win('front',-.95,.3,1.15,.3,.2,C.teal);for(const x of [-.5,.5]){g.cyl(x,.07,.1,.04,.8,8,C.gold);g.ico(x,.95,.1,.13,C.rose);}g.box(.95,.06,.85,.5,.18,.5,C.wood);g.ico(.95,.4,.85,.3,ctx.leaf(C.grass));}
 }else if(type==='park_wheel'){
  for(const z of [-.28,.28])for(const side of [-1,1])g.quad([side*.83,.08,z-.04],[side*.69,.08,z-.04],[.06,1.49,z-.04],[-.06,1.49,z-.04],C.teal);
  g.cylZ(0,1.5,0,.13,.7,10,C.gold);
  if(L>=3){if(L===4){const r=new GeoBuilder();ring(r);out.parts.push({body:r.body,glass:r.glass,pivot:[0,1.5,.4],axis:'z',kind:'spin',speed:.16});
    if(!ctx.live)for(let i=0;i<8;i++){const a=i/8*Math.PI*2,x=Math.cos(a)*1.05,y=1.5+Math.sin(a)*1.05-.35;g.box(x,y,.4,.24,.22,.2,i%2?C.teal:C.coral);g.box(x,y+.22,.4,.29,.05,.23,C.cream);}
   }else{g.push(0,0,1.5,.4);ring(g);g.pop();}}
 }else if(type==='park_carousel'){
  g.cyl(0,.06,0,.87,.15,24,C.wood);g.cyl(0,.21,0,.08,1.15,10,C.gold);
  if(L>=3){g.cone(0,1.25,0,.95,.5,12,C.coral);g.cyl(0,1.2,0,.92,.1,24,C.cream);g.ico(0,1.83,0,.09,C.gold);}
  if(L>=4){const r=new GeoBuilder();r.cyl(0,0,0,.81,.05,24,C.teal);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;r.push(a,.6*Math.cos(a),0,.6*Math.sin(a));r.cyl(0,.02,0,.02,.95,6,C.gold);r.box(0,.38,0,.13,.17,.3,i%2?C.cream:C.rose);r.box(0,.5,-.12,.11,.18,.1,C.cream);for(const x of [-.045,.045])for(const z of [-.1,.1])r.box(x,.24,z,.035,.16,.04,C.cream);r.pop();}out.parts.push({body:r.body,glass:r.glass,pivot:[0,.23,0],axis:'y',kind:'spin',speed:.35});}
 }else if(type==='park_garden'){
  g.box(0,.06,0,.32,.03,1.75,C.stone);g.box(0,.06,0,1.75,.03,.32,C.stone);
  for(const x of [-.55,.55])for(const z of [-.55,.55]){g.box(x,.06,z,.65,.08,.65,ctx.ground(C.grass));if(L>=3)g.ico(x,.22,z,.25,ctx.leaf(C.grass),.7);if(L>=4)for(const dx of [-.12,.12])g.ico(x+dx,.33,z,.075,z<0?C.rose:C.gold);}
  if(L>=3){for(const x of [-.37,.37])g.box(x,.06,-.55,.04,.75,.04,C.cream);g.box(0,.81,-.55,.85,.06,.15,C.cream);}
  if(L>=4){g.cyl(0,.08,.35,.22,.1,14,C.stone);g.cyl(0,.18,.35,.17,.03,14,0x7bc8ce);out.emitters.push({pos:[0,.22,.35],kind:'water'});}
 }else if(type==='park_stalls'){
  for(const x of [-.48,.48]){g.box(x,.06,0,.78,.4,.65,C.wood);if(L>=3){for(const xx of [-.34,.34])g.box(x+xx,.46,-.25,.025,.47,.025,C.cream);g.roof(x,.94,0,.9,.95,.22,.7,x<0?C.coral:C.teal);}if(L>=4){g.box(x,.48,.1,.62,.03,.3,C.cream);for(const dx of [-.2,0,.2])g.ico(x+dx,.57,.1,.08,x<0?C.gold:C.rose);g.box(x,.23,.335,.33,.15,.02,C.teal);}}
 }else if(type==='park_stage'){
  g.box(0,.06,0,2.6,.22,1.7,C.wood);g.box(0,.06,.96,1.6,.11,.25,C.stone);
  if(L>=3){for(const x of [-1.1,1.1])g.box(x,.28,-.45,.08,1.25,.08,C.teal);g.box(0,.28,-.7,2.35,1.2,.04,C.coral);g.roof(0,1.53,-.2,2.7,1.65,.35,2.4,C.teal);}
  if(L>=4){g.box(0,.28,-.66,.65,.9,.05,C.gold);for(const x of [-1,1])g.cyl(x,.28,.52,.11,.4,8,0x515459);for(const x of [-.6,0,.6]){g.cyl(x,1.45,.35,.07,.1,8,C.gold);g.layer('glass');g.box(x,1.46,.43,.08,.06,.025,0xffedb1);g.layer('body');}}
 }
 if(L===4&&type!=='park_stalls')for(const x of [-w/2+.25,w/2-.25]){g.box(x,.06,d/2-.25,.3,.16,.3,C.wood);g.ico(x,.32,d/2-.25,.18,ctx.leaf(C.grass));g.ico(x,.43,d/2-.25,.07,C.rose);}
}
