import { h } from './dom.js';

export function openPhoto(ui) {
  const g=ui.game,r=g.renderer;
  if(!g.playing||g.visit)return ui.toast('Ouvrez votre village pour créer une carte postale.','info');
  if(ui.photoActive)return;
  ui.closeScreen();ui.closeSheet(true);g.setTool({kind:'select'});g.select(null);
  const hour=r.hourOverride,labels=r.labels.root.style.visibility,overlays=r.overlays.group.visible;
  ui.photoActive=true;ui.root.classList.add('photo-mode');r.labels.root.style.visibility='hidden';r.overlays.group.visible=false;
  let blob=null,url=null,busy=false;
  const preview=h('div.photo-preview.hidden'),status=h('p.photo-status',{'aria-live':'polite'},'Déplacez la carte au doigt pour choisir votre cadrage.');
  const clear=()=>{if(url)URL.revokeObjectURL(url);url=null;blob=null;preview.replaceChildren();preview.classList.add('hidden');};
  const capture=async()=>{
    if(busy)return;busy=true;take.disabled=true;
    try{clear();r.frame(0);blob=await r.capturePostcard(frame.checked);url=URL.createObjectURL(blob);preview.appendChild(h('img',{src:url,alt:'Carte postale de '+g.state.name}));preview.classList.remove('hidden');status.textContent='Votre carte postale est prête.';download.disabled=false;share.disabled=false;}
    catch(e){status.textContent=e.message;}finally{busy=false;take.disabled=false;}
  };
  const download=h('button.btn',{disabled:true,onclick:()=>{if(!url)return;const a=h('a',{href:url,download:'Batisseur-'+g.state.name.replace(/[^a-z0-9à-ÿ -]/gi,'').slice(0,28)+'.png'});document.body.appendChild(a);a.click();a.remove();}},'Enregistrer');
  const share=h('button.btn',{disabled:true,onclick:async()=>{
    if(!blob)return;
    const file=new File([blob],'Batisseur.png',{type:'image/png'});
    if(!navigator.canShare?.({files:[file]})){download.click();return;}
    try{await navigator.share({files:[file],title:g.state.name});}catch(e){if(e.name!=='AbortError')status.textContent='Le partage est indisponible. Utilisez Enregistrer.';}
  }},'Partager');
  const frame=h('input',{type:'checkbox',checked:true,'aria-label':'Cadre carte postale'});
  const take=h('button.btn.primary',{onclick:capture},'📷 Prendre la photo');
  const controls=h('div.photo-controls',h('div.photo-heading',h('b','Mode photo'),h('button.btn.small',{onclick:()=>ui.exitPhoto()},'Quitter la photo')),status,
    h('div.photo-settings',h('button.btn.small',{onclick:()=>r.cam.azimuth-=Math.PI/12},'↶ Pivoter'),h('button.btn.small',{onclick:()=>r.cam.azimuth+=Math.PI/12},'Pivoter ↷'),h('button.btn.small',{onclick:()=>r.cam.distance=Math.max(6,r.cam.distance-3)},'＋ Zoom'),h('button.btn.small',{onclick:()=>r.cam.distance=Math.min(72,r.cam.distance+3)},'− Zoom'),h('select',{'aria-label':'Lumière de la photo',onchange:(e)=>r.hourOverride=e.target.value==='game'?hour:Number(e.target.value)},[['game','Lumière actuelle'],['8','Matin'],['17.5','Heure dorée'],['22','Nuit']].map(([v,n])=>h('option',{value:v},n))),h('label',frame,' Carte postale')),
    h('div.photo-buttons',take,download,share));
  ui.root.append(preview,controls);
  ui.exitPhoto=()=>{clear();controls.remove();preview.remove();r.hourOverride=hour;r.labels.root.style.visibility=labels;r.overlays.group.visible=overlays;ui.root.classList.remove('photo-mode');ui.photoActive=false;ui.exitPhoto=null;};
}
