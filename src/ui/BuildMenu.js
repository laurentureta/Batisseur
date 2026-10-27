// Menu de construction : catégories et cartes des bâtiments.
import { h, costChips } from './dom.js';
import { CATEGORIES, BUILDING_LIST, ROAD_TYPES, sizeOf } from '../data/buildings.js';
import { COLLECTIONS } from '../data/catalogue.js';

export function renderBuildMenu(ui, body, sheet) {
  const game = ui.game;
  const st = game.state;
  if (ui.catalogueLastCat !== ui.buildCat) {
    ui.catalogueLastCat = ui.buildCat; ui.buildPage = 0; ui.buildQuery = ''; ui.buildCollection = '';
  }
  const libre = st.mode === 'libre';
  const tabs = h('div.tabs');
  for (const c of CATEGORIES) {
    tabs.appendChild(h('button.tab' + (ui.buildCat === c.id ? '.on' : ''), {
      onclick: () => {
        ui.buildCat = c.id;
        ui.buildPage = 0; ui.buildQuery = ''; ui.buildCollection = '';
        sheet.refresh(true);
      },
    }, h('span.ti', c.icon), h('span.tl', c.name)));
  }
  body.appendChild(tabs);
  const grid = h('div.cards');
  body.appendChild(grid);

  if (ui.buildCat === 'roads') {
    for (const t of Object.keys(ROAD_TYPES).map(Number)) {
      const rt = ROAD_TYPES[t];
      const unlocked = game.prog.roadUnlocked(t);
      grid.appendChild(card({
        icon: rt.icon, name: rt.name, desc: rt.desc, cost: rt.cost, res: st.res, libre, unlocked, unlockLevel: rt.unlock,
        onclick: () => {
          if (!unlocked) return ui.toast(`${rt.name} : se débloque au niveau ${rt.unlock}`, 'error');
          ui.lastRoadType = t;
          ui.setTool({ kind: 'road', roadType: t });
        },
      }));
    }
    grid.appendChild(h('div.card-note', '🌉 Les ponts se posent automatiquement quand tu traces une route sur une rivière (dès le niveau 8).'));
    return;
  }

  let list = BUILDING_LIST.filter((d) => (d.tab || d.cat) === ui.buildCat && !d.notBuildable).sort((a, b) => a.unlock - b.unlock);
  if (ui.buildCat === 'exclusive') {
    const fete = list.filter((d) => d.event);
    const won = fete.filter((d) => game.meta?.ownsDecor(d.id)).length;
    list = list.filter((d) => !d.event || game.meta?.ownsDecor(d.id));
    const owned = list.filter((d) => game.meta?.ownsDecor(d.id));
    grid.appendChild(h('div.card-note', owned.length
      ? `⭐ ${owned.length} décoration${owned.length > 1 ? 's' : ''} exclusive${owned.length > 1 ? 's' : ''} à toi : boutique, coffres, passe et fêtes de la semaine.`
      : '⭐ Les décorations exclusives se gagnent dans la boutique, les coffres, le passe et les fêtes de la semaine.'));
    grid.appendChild(h('button.card-note.fete-note', { onclick: () => ui.openEvent('cal') }, `🎉 Décos des fêtes : ${won}/${fete.length} gagnées · voir le calendrier ›`));
    list.sort((a, b) => (game.meta?.ownsDecor(b.id) ? 1 : 0) - (game.meta?.ownsDecor(a.id) ? 1 : 0));
  }
  // Search updates only the cards: the active input keeps focus on mobile keyboards.
  const tools = h('div.catalogue-tools');
  const search = h('input.catalogue-search', {
    type: 'search', placeholder: 'Rechercher un bâtiment…', value: ui.buildQuery || '',
    'aria-label': 'Rechercher dans cette catégorie',
    oninput: () => { ui.buildQuery = search.value; ui.buildPage = 0; paint(); },
  });
  const collections = h('select', { 'aria-label': 'Collection architecturale',
    onchange: () => { ui.buildCollection = collections.value; ui.buildPage = 0; paint(); },
  }, h('option', { value: '' }, 'Toutes les collections'),
    h('option', { value: 'classic' }, 'Village classique'),
    ...Object.entries(COLLECTIONS).map(([id,c]) => h('option', { value: id }, c.name)));
  collections.value = ui.buildCollection || '';
  const count = h('span.catalogue-count');
  tools.append(search, collections, count);
  body.insertBefore(tools, grid);
  const pages = h('div.catalogue-pagination');
  body.appendChild(pages);
  // Preserve exclusive collection information before repainting the card area.
  const notes = [...grid.childNodes];
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function paint() {
    const query = normalize((ui.buildQuery || '').trim());
    const filtered = list.filter(d => {
      const collection = d.catalogue?.collection || 'classic';
      return (!ui.buildCollection || collection === ui.buildCollection) &&
        (!query || normalize(d.name + ' ' + d.desc).includes(query));
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / 16));
    ui.buildPage = Math.max(0, Math.min(totalPages - 1, ui.buildPage || 0));
    count.textContent = `${filtered.length} référence${filtered.length > 1 ? 's' : ''}`;
    grid.replaceChildren(...notes);
    for (const def of filtered.slice(ui.buildPage * 16, (ui.buildPage + 1) * 16)) {
      const unlocked = game.prog.isUnlocked(def.id);
      const owned = def.unique && game.prog.countType(def.id) > 0;
      const [w, d] = sizeOf(def, 0);
      grid.appendChild(card({
        img: game.renderer.thumbs.get(def.id, def.civic ? def.maxLevel : 1), icon: def.icon, name: def.name, desc: def.desc,
        cost: def.id === 'depot' && st.flags?.depotGift ? {} : def.costs[0],
        gift: def.id === 'depot' && st.flags?.depotGift ? `🎁 Offert · niv. ${st.flags.depotGift}` : '',
        res: st.res, libre, unlocked, unlockLevel: def.unlock, owned,
        size: w * d > 1 ? `${w}×${d}` : '', exclusive: def.exclusive,
        onclick: () => {
          if (!unlocked && def.exclusive) return ui.openShop('decor');
          if (!unlocked) return ui.toast(`${def.name} : se débloque au niveau ${def.unlock}`, 'error');
          if (owned) return ui.toast('Ce monument est unique et déjà construit', 'error');
          ui.setTool({ kind: 'build', type: def.id, rot: null });
        },
      }));
    }
    if (!filtered.length) grid.append(h('div.card-note', 'Aucun bâtiment ne correspond à cette recherche.'));
    pages.replaceChildren();
    if (totalPages > 1) pages.append(
      h('button.btn', { type: 'button', disabled: ui.buildPage === 0,
        onclick: () => { ui.buildPage--; paint(); grid.scrollIntoView({ block: 'start' }); } }, '‹ Précédent'),
      h('span', `Page ${ui.buildPage + 1} / ${totalPages}`),
      h('button.btn', { type: 'button', disabled: ui.buildPage >= totalPages - 1,
        onclick: () => { ui.buildPage++; paint(); grid.scrollIntoView({ block: 'start' }); } }, 'Suivant ›'),
    );
  }
  paint();
}

function card({ img, icon, name, desc, cost, res, libre, unlocked, unlockLevel, owned, size, onclick, exclusive, gift }) {
  const el = h('button.card' + (unlocked ? '' : '.locked') + (owned ? '.owned' : '') + (exclusive ? '.exclusive' : ''), { onclick, title: desc, type: 'button' });
  const pic = h('div.card-pic');
  if (img) pic.appendChild(h('img', { src: img, alt: '', loading: 'lazy' }));
  else pic.appendChild(h('span.card-emoji', icon));
  if (!unlocked) pic.appendChild(h('span.lock-badge', exclusive ? '⭐ Exclusif' : `🔒 Niv. ${unlockLevel}`));
  if (owned) pic.appendChild(h('span.lock-badge.ok', '✓ Construit'));
  if (size) pic.appendChild(h('span.size-badge', size));
  if (gift) pic.appendChild(h('span.lock-badge.ok', gift));
  el.append(pic, h('div.card-name', name), unlocked ? costChips(cost, res, { compact: true, libre }) : h('div.card-desc', desc));
  return el;
}
