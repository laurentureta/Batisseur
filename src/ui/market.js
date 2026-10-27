import { h } from './dom.js';
import { openScreen, countdown } from './screens.js';
import { RESOURCES } from '../data/resources.js';
import { MARKET_REGIONS, MARKET_DAILY_UNITS, MARKET_SLOT_MS, marketIndex } from '../data/market.js';
import { fmt } from '../core/util.js';

const money=value=>Number(value).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
function trend(seed,region,resource,slot){
  const values=Array.from({length:8},(_,i)=>marketIndex(seed,region,resource,slot-7+i));
  const min=Math.min(...values)-.015,max=Math.max(...values)+.015;
  const points=values.map((v,i)=>`${Math.round(i*100/7)},${Math.round(27-(v-min)/(max-min)*23)}`).join(' ');
  return h('div.market-trend',{html:`<svg viewBox="0 0 100 30" role="img" aria-label="Évolution des cours sur deux heures"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`});
}
export function openMarket(ui,region=ui.game.state.regionId){
  const game=ui.game,market=game.market;
  if(!market||!game.playing||game.visit||game.isDemo)return ui.toast('Ouvrez votre propre village pour accéder au marché.','info');
  const regions=market.regions();if(!regions.includes(region))region=regions[0];
  let quantity=10;
  ui.closeSheet(true);
  return openScreen(ui,{
    id:'regional-market',title:'🛒 Marchés régionaux',cls:'market-screen',tab:region,
    tabs:regions.map(id=>({id,label:`${MARKET_REGIONS[id].icon} ${game.city.book.settlements[id].name}`})),
    render:(body,screen)=>{
      const id=screen.tab,view=market.publicState(id);if(!view)return body.appendChild(h('p.city-note','Ce marché n’est pas encore ouvert.'));
      body.append(h('div.market-summary',h('div',h('h2.city-heading',view.rule.name),h('p.city-note',view.rule.specialty)),h('div.market-wallet',h('span','Caisse du village'),h('strong',`🪙 ${money(view.coins)}`))),
        h('p.city-note','Chaque marché utilise les pièces et les marchandises du village sélectionné. Les réserves des marchands sont limitées ; les cours évoluent toutes les 15 minutes réelles. Les prix d’achat incluent les frais du marché.'),
        h('div.market-toolbar',h('label.city-field',h('span','Quantité par échange'),h('select',{'aria-label':'Quantité par échange',onchange:e=>{quantity=Number(e.target.value);screen.keepTop=true;screen.refresh(true);}},[1,5,10,25,50,100,200].map(n=>h('option',{value:n,selected:n===quantity},String(n))))),
          h('p.city-note',`Prochain réassort : ${countdown(view.nextAt-Date.now())} · ${view.remaining}/${MARKET_DAILY_UNITS} unités disponibles aujourd’hui`)));
      const list=h('div.city-grid.market-grid');
      for(const offer of view.offers){
        const resource=offer.resource,def=RESOURCES[resource],buy=market.quote(id,resource,'buy',quantity),sell=market.quote(id,resource,'sell',quantity);
        const execute=quote=>{
          const result=market.trade(id,resource,quote.side,quote.quantity,quote.quoteId);
          ui.toast(result.ok?`${quote.side==='buy'?'Achat':'Vente'} : ${quote.quantity} ${def.name.toLowerCase()} · ${money(quote.total)} pièces`:result.reason,result.ok?'good':'error');
          screen.keepTop=true;screen.refresh(true);ui.refreshHud?.();
        };
        const card=h('article.city-card.market-card',h('div.market-card-head',h('div',h('h3',`${def.icon} ${def.name}`),h('span.market-specialty'+(offer.abundant?'.abundant':offer.sought?'.sought':''),offer.abundant?'Offre régionale abondante':offer.sought?'Forte demande régionale':'Marchandise courante')),trend(market.data.seed,id,resource,view.slot)),
          h('p.market-stock',`Votre stock : ${fmt(offer.local)}${Number.isFinite(view.capacity)?` / ${fmt(view.capacity)}`:''}`),
          h('div.market-reserves',h('span',`À acheter : ${offer.stock}`),h('span',`Recherchés : ${offer.wanted}`)),
          h('div.market-actions',h('button.btn.primary',{disabled:!buy.ok,title:buy.reason||`Prix moyen : ${money(buy.unit)} pièce(s) par unité`,onclick:()=>execute(buy)},buy.ok?`Acheter ${quantity} · ${money(buy.total)} 🪙`:'Achat indisponible'),h('button.btn',{disabled:!sell.ok,title:sell.reason||`Prix moyen : ${money(sell.unit)} pièce(s) par unité`,onclick:()=>execute(sell)},sell.ok?`Vendre ${quantity} · ${money(sell.total)} 🪙`:'Vente indisponible')));
        if(!buy.ok||!sell.ok)card.appendChild(h('p.city-note.market-reason',[!buy.ok?`Achat : ${buy.reason}`:null,!sell.ok?`Vente : ${sell.reason}`:null].filter(Boolean).join(' ')));
        list.appendChild(card);
      }
      body.append(list,h('p.city-note',`Trésorerie du marchand : ${money(view.budget)} pièces. Les réserves se reconstituent graduellement au réassort ; le rattrapage est limité à une heure. Les limites quotidiennes se renouvellent à minuit UTC. Le graphique représente les cours de référence des deux dernières heures, hors effet de vos échanges.`));
      const recent=market.data.history.filter(t=>t.region===id).slice(-6).reverse();
      if(recent.length){
        body.appendChild(h('h2.city-heading','Vos derniers échanges'));
        for(const t of recent)body.appendChild(h('p.market-history',`${t.side==='buy'?'↙ Achat':'↗ Vente'} · ${t.quantity} ${RESOURCES[t.resource].name.toLowerCase()} · ${money(t.total)} pièces`));
      }
    },
  });
}
