// Événements de la semaine : chaque semaine de l'année, une journée de fête (le jour change d'une semaine
// à l'autre). Les grandes dates du calendrier ont leur événement (Nouvel An, Chandeleur, Saint-Valentin,
// Pâques, 14 juillet, Halloween, Noël…) ; les autres semaines piochent parmi des thèmes qui tournent.
// Tout est calculé à partir de la date : le calendrier se renouvelle tout seul, chaque semaine, chaque année.
// Récompenses et défis sont tirés au sort pour chaque événement : jamais deux fois les mêmes.
import { mulberry32, hashStr } from '../core/rng.js';
import { fmt } from '../core/util.js';

export const EV_THRESHOLDS = [30, 80, 150, 240, 350, 480, 620, 780];
export const DROP_PTS = 12; // jetons par objet ramassé dans le village
export const DROP_CAP = 45; // objets maximum par événement
export const DROP_EVERY = 24; // secondes entre deux apparitions
export const DROP_MAX = 3; // objets visibles en même temps

export const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const MONTH_NAMES = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const DAY = 864e5;
const EPOCH = new Date(2026, 0, 5); // lundi 5 janvier 2026
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const range = (a, b) => ALL.filter((m) => m >= a && m <= b);

/* ───────── Thèmes ─────────
   drop : objet à ramasser dans le village (icône, pluriel, singulier, coins = rapporte aussi des pièces)
   mods : bonus de la journée (tax, commerce, prod, happy, growth, xp, shop, drops)
   decor : [grand prix, deuxième décoration] ; theme : toits offerts ; cash : multiplicateur des pièces */
const H = (o) => ({ holiday: true, ...o });
export const EVENT_THEMES = {
  // fêtes du calendrier
  newyear: H({ name: 'Le Nouvel An', icon: 'firework', colors: ['#ffd34d', '#2b2f72'], tagline: 'Feu d\'artifice, confettis et bonnes résolutions : bonne année au village !', drop: { icon: 'sparkles', name: 'étincelles', one: 'étincelle' }, mods: { tax: 1.5 }, decor: ['e_fireworks', 'e_lanterns'], title: 'Étoile du Nouvel An', cash: 1.5 }),
  galette: H({ name: 'La Galette des rois', icon: 'crown', colors: ['#f6c851', '#8a4b12'], tagline: 'Qui trouvera la fève ? Partage la galette avec tout le village.', drop: { icon: 'crown', name: 'fèves', one: 'fève' }, mods: { xp: 2 }, decor: ['e_galette'], title: 'Roi de la galette' }),
  crepes: H({ name: 'La Chandeleur', icon: 'crepe', colors: ['#ffcf7a', '#c0662a'], tagline: 'Les crêpes sautent dans toutes les cuisines du village !', drop: { icon: 'crepe', name: 'crêpes', one: 'crêpe' }, mods: { prod: 1.5 }, decor: ['e_crepes'], title: 'Maître crêpier' }),
  valentin: H({ name: 'La Saint-Valentin', icon: 'heart', colors: ['#ff6f9f', '#8a1f4a'], tagline: 'Cœurs fleuris et mots doux : l\'amour est dans le village.', drop: { icon: 'heart', name: 'cœurs', one: 'cœur' }, mods: { happy: 0.12 }, decor: ['e_heart'], theme: 'rose', title: 'Cœur d\'or' }),
  carnaval: H({ name: 'Le Carnaval', icon: 'mask', colors: ['#ff4fb0', '#3a1f8a'], tagline: 'Masques, confettis et chars colorés défilent dans les rues.', drop: { icon: 'party', name: 'confettis', one: 'confetti' }, mods: { commerce: 2 }, decor: ['e_carnival', 'e_cotton_candy'], title: 'Roi du carnaval' }),
  patrick: H({ name: 'La Saint-Patrick', icon: 'clover', colors: ['#5ad15a', '#1f6b2f'], tagline: 'Trèfles porte-bonheur et chaudron d\'or au pied de l\'arc-en-ciel !', drop: { icon: 'clover', name: 'trèfles', one: 'trèfle', coins: true }, mods: { tax: 2 }, decor: ['e_rainbow'], title: 'Porte-bonheur', cash: 2 }),
  poisson: H({ name: 'Le Poisson d\'avril', icon: 'fish', colors: ['#5ac8ff', '#ff7a3a'], tagline: 'Des poissons farceurs se cachent partout… attrape-les tous !', drop: { icon: 'fish', name: 'poissons', one: 'poisson' }, mods: { drops: 2 }, decor: ['e_fish'], title: 'Farceur du village' }),
  paques: H({ name: 'Pâques', icon: 'egg', colors: ['#ffd34d', '#7a4fd6'], tagline: 'La grande chasse aux œufs est ouverte dans tout le village !', drop: { icon: 'egg', name: 'œufs', one: 'œuf' }, mods: { drops: 2 }, decor: ['e_easter_egg', 'e_picnic'], title: 'Chasseur d\'œufs' }),
  muguet: H({ name: 'Le 1er Mai', icon: 'lily', colors: ['#9be07a', '#2f7a3a'], tagline: 'Un brin de muguet porte-bonheur pour chaque habitant.', drop: { icon: 'lily', name: 'brins de muguet', one: 'brin de muguet' }, mods: { happy: 0.1 }, decor: ['e_lily'], title: 'Porte-bonheur du printemps' }),
  musique: H({ name: 'La Fête de la musique', icon: 'music', colors: ['#7a5cff', '#ff4f8a'], tagline: 'Des concerts à tous les coins de rue jusqu\'au bout de la nuit !', drop: { icon: 'music', name: 'notes', one: 'note' }, mods: { happy: 0.1, commerce: 1.5 }, decor: ['e_stage'], title: 'Star du village' }),
  saintjean: H({ name: 'Les Feux de la Saint-Jean', icon: 'fire', colors: ['#ffb13a', '#b8301a'], tagline: 'Un grand feu de joie pour fêter l\'arrivée de l\'été.', drop: { icon: 'fire', name: 'braises', one: 'braise' }, mods: { prod: 1.5 }, decor: ['e_bonfire'], title: 'Gardien du feu' }),
  quatorze: H({ name: 'La Fête nationale', icon: 'firework', colors: ['#2f6fd1', '#e8322d'], tagline: 'Bal populaire, lampions et grand feu d\'artifice du 14 juillet !', drop: { icon: 'firework', name: 'fusées', one: 'fusée' }, mods: { tax: 1.5, happy: 0.1 }, decor: ['e_guinguette', 'e_fireworks'], title: 'Citoyen d\'honneur', cash: 1.5 }),
  etoiles: H({ name: 'La Nuit des étoiles', icon: 'moon', colors: ['#3a4fb0', '#0e1a40'], tagline: 'Les étoiles filantes traversent le ciel : fais un vœu !', drop: { icon: 'star', name: 'étoiles filantes', one: 'étoile filante' }, mods: { xp: 2 }, decor: ['e_telescope'], title: 'Astronome royal' }),
  vendanges: H({ name: 'Les Vendanges', icon: 'grapes', colors: ['#9b4fd6', '#4a1f6b'], tagline: 'Les grappes sont mûres : tout le village file aux vignes !', drop: { icon: 'grapes', name: 'grappes', one: 'grappe' }, mods: { prod: 1.5 }, decor: ['e_grape_press'], title: 'Vigneron d\'honneur' }),
  halloween: H({ name: 'Halloween', icon: 'pumpkin', colors: ['#ff8a2a', '#3a1a5a'], tagline: 'Des bonbons ou un sort ! Les citrouilles envahissent le village…', drop: { icon: 'pumpkin', name: 'citrouilles', one: 'citrouille' }, mods: { drops: 2 }, decor: ['e_cauldron', 'x_pumpkins'], title: 'Sorcier du village' }),
  marchenoel: H({ name: 'Le Marché de Noël', icon: 'gift', colors: ['#e8322d', '#1f6b3a'], tagline: 'Chalets en bois, chocolat chaud et guirlandes lumineuses !', drop: { icon: 'gift', name: 'cadeaux', one: 'cadeau' }, mods: { commerce: 2 }, decor: ['e_xmas_market'], title: 'Lutin en chef' }),
  noel: H({ name: 'Noël', icon: 'xmastree', colors: ['#2fa04a', '#b8231b'], tagline: 'Le Père Noël passe au village : des cadeaux pour tout le monde !', drop: { icon: 'gift', name: 'cadeaux', one: 'cadeau' }, mods: { tax: 1.5, happy: 0.1 }, decor: ['x_xmas_tree', 'x_sleigh'], title: 'Ami du Père Noël', cash: 1.5 }),
  // thèmes qui tournent
  gold: { name: 'La Ruée vers l\'or', icon: 'moneybag', colors: ['#ffd34d', '#8a5a12'], tagline: 'De l\'or a été découvert près du village : impôts doublés toute la journée !', drop: { icon: 'coins', name: 'pépites', one: 'pépite', coins: true }, mods: { tax: 2 }, decor: ['e_gold_cart'], title: 'Chercheur d\'or', cash: 2, weight: 1.4 },
  jackpot: { name: 'Le Grand Jackpot', icon: 'ticket', colors: ['#ff4fb0', '#ffb300'], tagline: 'Des billets de loterie partout dans le village : qui touchera le gros lot ?', drop: { icon: 'ticket', name: 'billets', one: 'billet', coins: true }, mods: { tax: 1.5 }, decor: ['e_wishing_well'], title: 'Gagnant du jackpot', cash: 2.5, jackpot: true },
  braderie: { name: 'La Grande Braderie', icon: 'tag', colors: ['#ff6a4a', '#2a7fd1'], tagline: 'Tout est à moitié prix dans la boutique, aujourd\'hui seulement !', drop: { icon: 'tag', name: 'étiquettes', one: 'étiquette' }, mods: { shop: 0.5 }, decor: ['e_market_stall'], title: 'Roi des bonnes affaires' },
  moisson: { name: 'La Fête des moissons', icon: 'wheat', colors: ['#f2c14e', '#8a5a12'], tagline: 'Les champs sont dorés : la production est boostée toute la journée !', drop: { icon: 'wheat', name: 'gerbes', one: 'gerbe' }, mods: { prod: 1.5 }, decor: ['e_haystacks', 'e_scarecrow'], title: 'Roi de la moisson', months: range(7, 10) },
  batisseur: { name: 'Le Jour du bâtisseur', icon: 'hammer', colors: ['#ffb13a', '#5a3a22'], tagline: 'Marteaux en main : l\'XP du passe est doublée toute la journée !', drop: { icon: 'hammer', name: 'marteaux', one: 'marteau' }, mods: { xp: 2 }, decor: ['e_builder_statue'], title: 'Bâtisseur d\'élite' },
  tournoi: { name: 'Le Grand Tournoi', icon: 'shield', colors: ['#2f6fd1', '#c0292b'], tagline: 'Les chevaliers s\'affrontent en joute devant tout le village.', drop: { icon: 'shield', name: 'écus', one: 'écu' }, mods: { happy: 0.1 }, decor: ['e_joust'], title: 'Chevalier du tournoi' },
  tresor: { name: 'La Chasse au trésor', icon: 'map', colors: ['#2ab4c8', '#7a4a1a'], tagline: 'Des pirates ont caché leur butin dans le village !', drop: { icon: 'coins', name: 'trésors', one: 'trésor', coins: true }, mods: { drops: 2 }, decor: ['e_pirate_ship'], title: 'Capitaine pirate', cash: 1.5 },
  foire: { name: 'La Fête foraine', icon: 'ferris', colors: ['#ff5a8a', '#5b2a86'], tagline: 'Manèges, barbe à papa et tickets gagnants : la fête bat son plein !', drop: { icon: 'ticket', name: 'tickets', one: 'ticket' }, mods: { happy: 0.1, commerce: 1.5 }, decor: ['e_carousel', 'e_cotton_candy'], title: 'Roi de la fête foraine', months: range(3, 10) },
  montgolfieres: { name: 'Le Festival des montgolfières', icon: 'balloon', colors: ['#ff7a3a', '#2f9ad1'], tagline: 'Des ballons colorés s\'envolent au-dessus des toits.', drop: { icon: 'balloon', name: 'ballons', one: 'ballon' }, mods: { growth: 2 }, decor: ['e_balloon'], title: 'Aéronaute', months: range(4, 10) },
  cirque: { name: 'Le Cirque en ville', icon: 'circus', colors: ['#e8322d', '#f2a91b'], tagline: 'Jongleurs, acrobates et clowns : le chapiteau est plein à craquer !', drop: { icon: 'ticket', name: 'tickets', one: 'ticket' }, mods: { commerce: 2 }, decor: ['e_circus'], title: 'Monsieur Loyal' },
  lanternes: { name: 'La Fête des lanternes', icon: 'lantern', colors: ['#ff9a3a', '#3a1f5a'], tagline: 'Des centaines de lanternes illuminent les rues à la tombée de la nuit.', drop: { icon: 'lantern', name: 'lanternes', one: 'lanterne' }, mods: { happy: 0.1 }, decor: ['e_lanterns'], title: 'Gardien des lumières', months: [9, 10, 11, 12, 1, 2, 3] },
  piquenique: { name: 'Le Grand Pique-nique', icon: 'basket', colors: ['#e8322d', '#5ab84a'], tagline: 'Nappes à carreaux et paniers garnis dans les prés.', drop: { icon: 'basket', name: 'paniers', one: 'panier' }, mods: { prod: 1.5 }, decor: ['e_picnic'], title: 'Roi du pique-nique', months: range(4, 9) },
  glace: { name: 'Le Festival de glace', icon: 'snowflake', colors: ['#9fe4ff', '#28408f'], tagline: 'Sculptures de glace et igloos : brrr, mais quelle fête !', drop: { icon: 'snowflake', name: 'flocons', one: 'flocon' }, mods: { happy: 0.1 }, decor: ['e_igloo'], title: 'Prince des glaces', months: [12, 1, 2] },
  plage: { name: 'L\'Été à la plage', icon: 'beach', colors: ['#ffd34d', '#2ab4e8'], tagline: 'Châteaux de sable et glaces à la vanille pour tout le monde !', drop: { icon: 'icecream', name: 'glaces', one: 'glace' }, mods: { tax: 1.5 }, decor: ['e_sandcastle', 'e_icecream'], title: 'Roi de la plage', months: [6, 7, 8], cash: 1.5 },
  foodtrucks: { name: 'Le Festival des food trucks', icon: 'truck', colors: ['#ff6a4a', '#ffc52e'], tagline: 'Les camions gourmands se garent sur la place du village.', drop: { icon: 'bread', name: 'casse-croûtes', one: 'casse-croûte' }, mods: { commerce: 2 }, decor: ['e_foodtruck'], title: 'Chef étoilé', months: range(4, 10) },
  voeux: { name: 'La Nuit des vœux', icon: 'sparkles', colors: ['#b38cff', '#2a1f6b'], tagline: 'Jette une pièce dans le puits et fais un vœu…', drop: { icon: 'sparkles', name: 'vœux', one: 'vœu' }, mods: { xp: 2 }, decor: ['e_wishing_well'], title: 'Faiseur de vœux' },
  arbres: { name: 'Le Jour de l\'arbre', icon: 'tree', colors: ['#5ab84a', '#2a6b2f'], tagline: 'Plantons des arbres : le village devient plus vert que jamais.', drop: { icon: 'herb', name: 'graines', one: 'graine' }, mods: { growth: 2 }, decor: ['e_giant_tree'], title: 'Ami des forêts', months: range(3, 11) },
  marchands: { name: 'Le Jour des marchands', icon: 'scales', colors: ['#ffb13a', '#2a7fd1'], tagline: 'Les marchands affluent : les commerces rapportent le double !', drop: { icon: 'coins', name: 'bourses', one: 'bourse', coins: true }, mods: { commerce: 2 }, decor: ['e_market_stall', 'e_foodtruck'], title: 'Grand marchand', cash: 1.5 },
  couleurs: { name: 'La Fête des couleurs', icon: 'palette', colors: ['#ff4fb0', '#4fc3ff'], tagline: 'Pots de peinture et toits multicolores : le village change de look !', drop: { icon: 'palette', name: 'pots de peinture', one: 'pot de peinture' }, mods: { happy: 0.1 }, decor: ['e_carnival'], theme: 'random', title: 'Artiste du village', months: range(3, 10) },
  fleurs: { name: 'Le Festival des fleurs', icon: 'blossom', colors: ['#ff8fc2', '#3a9a4a'], tagline: 'Tulipes, cerisiers et arches fleuries dans toute la ville.', drop: { icon: 'tulip', name: 'fleurs', one: 'fleur' }, mods: { happy: 0.1, growth: 2 }, decor: ['x_cherry_tree', 'x_tulips'], title: 'Main verte', months: [4, 5, 6] },
  gout: { name: 'La Fête du goût', icon: 'bread', colors: ['#ffcf7a', '#a8561a'], tagline: 'Pains, tartes et brioches : les boulangers font la fête !', drop: { icon: 'bread', name: 'brioches', one: 'brioche' }, mods: { prod: 1.5 }, decor: ['e_picnic', 'e_crepes'], title: 'Gourmet du village' },
};
for (const [id, t] of Object.entries(EVENT_THEMES)) t.id = id;
const GENERIC = Object.values(EVENT_THEMES).filter((t) => !t.holiday);
// semaine de lancement : la Ruée vers l'or (les pièces avant tout !)
const OVERRIDES = { '2026-10-19': 'gold' };

/** Toutes les décorations exclusives des événements (elles ne sortent pas des coffres). */
export const EVENT_DECOR = [...new Set(Object.values(EVENT_THEMES).flatMap((t) => t.decor).filter((d) => d.startsWith('e_')))];

/* ───────── Dates ───────── */
const dmy = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d) => addDays(dmy(d), -((d.getDay() + 6) % 7));
const isoYear = (monday) => addDays(monday, 3).getFullYear();
const weekIdx = (monday) => Math.round((monday - EPOCH) / (7 * DAY));
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Dimanche de Pâques (algorithme de Meeus). */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

function holidays(y) {
  const e = easter(y);
  const sept = new Date(y, 8, 1);
  const vendanges = addDays(sept, ((5 - ((sept.getDay() + 6) % 7)) + 7) % 7 + 14); // 3e samedi de septembre
  return [
    { id: 'newyear', date: new Date(y, 0, 1), fixed: true },
    { id: 'galette', date: new Date(y, 0, 6) },
    { id: 'crepes', date: new Date(y, 1, 2) },
    { id: 'valentin', date: new Date(y, 1, 14), fixed: true },
    { id: 'carnaval', date: addDays(e, -47) },
    { id: 'patrick', date: new Date(y, 2, 17) },
    { id: 'poisson', date: new Date(y, 3, 1) },
    { id: 'paques', date: e, fixed: true },
    { id: 'muguet', date: new Date(y, 4, 1) },
    { id: 'musique', date: new Date(y, 5, 21), fixed: true },
    { id: 'saintjean', date: new Date(y, 5, 24) },
    { id: 'quatorze', date: new Date(y, 6, 14), fixed: true },
    { id: 'etoiles', date: new Date(y, 7, 12) },
    { id: 'vendanges', date: vendanges },
    { id: 'halloween', date: new Date(y, 9, 31), fixed: true },
    { id: 'marchenoel', date: new Date(y, 11, 6) },
    { id: 'noel', date: new Date(y, 11, 25), fixed: true },
  ];
}

const PLANS = new Map();
/** Programme d'une année : clé du lundi → { id, date }. */
function yearPlan(y) {
  if (PLANS.has(y)) return PLANS.get(y);
  const weeks = [];
  for (let m = mondayOf(new Date(y, 0, 4)); isoYear(m) === y; m = addDays(m, 7)) weeks.push(m);
  const plan = new Map();
  const weekOf = (d) => weeks.find((w) => d >= w && d < addDays(w, 7));
  const hol = [...holidays(y - 1), ...holidays(y), ...holidays(y + 1)];
  for (const h of hol.filter((x) => x.fixed)) {
    const w = weekOf(h.date);
    if (w && !plan.has(dateKey(w))) plan.set(dateKey(w), { id: h.id, date: dmy(h.date) });
  }
  for (const h of hol.filter((x) => !x.fixed)) {
    for (const shift of [0, 7, -7, 14]) {
      const d = addDays(h.date, shift);
      const w = weekOf(d);
      if (w && !plan.has(dateKey(w))) {
        plan.set(dateKey(w), { id: h.id, date: d });
        break;
      }
    }
  }
  const hist = [];
  for (const w of weeks) {
    const k = dateKey(w);
    if (plan.has(k)) {
      hist.push(plan.get(k).id);
      continue;
    }
    const dow = (((weekIdx(w) * 3 + 6) % 7) + 7) % 7; // le jour de la fête change chaque semaine
    const date = addDays(w, dow);
    const month = date.getMonth() + 1;
    let id = OVERRIDES[k];
    if (!id) {
      const rng = mulberry32(hashStr('ev:' + k));
      const recent = hist.slice(-9);
      const ok = (t) => !t.months || t.months.includes(month);
      let cands = GENERIC.filter((t) => ok(t) && !recent.includes(t.id));
      if (!cands.length) cands = GENERIC.filter(ok);
      const tot = cands.reduce((s, t) => s + (t.weight || 1), 0);
      let r = rng() * tot;
      id = cands[cands.length - 1].id;
      for (const t of cands) {
        r -= t.weight || 1;
        if (r <= 0) {
          id = t.id;
          break;
        }
      }
    }
    plan.set(k, { id, date });
    hist.push(id);
  }
  PLANS.set(y, plan);
  return plan;
}

/** Événement de la semaine qui commence le lundi donné. */
export function eventOfWeek(monday) {
  const plan = yearPlan(isoYear(monday));
  const e = plan.get(dateKey(monday));
  const start = dmy(e.date);
  return { key: dateKey(start), id: e.id, theme: EVENT_THEMES[e.id], start, end: addDays(start, 1), week: monday, weekEnd: addDays(monday, 7) };
}

/** Événement de la semaine en cours, avec son état : 'soon' (à venir), 'live' (aujourd'hui), 'over' (terminé). */
export function currentEvent(now = Date.now()) {
  const d = new Date(now);
  const ev = eventOfWeek(mondayOf(d));
  ev.status = now < ev.start.getTime() ? 'soon' : now < ev.end.getTime() ? 'live' : 'over';
  return ev;
}

/** Les n prochains événements (celui de la semaine compris s'il n'est pas fini). */
export function upcomingEvents(n = 6, now = Date.now()) {
  const out = [];
  let m = mondayOf(new Date(now));
  for (let i = 0; out.length < n && i < n + 3; i++) {
    const ev = eventOfWeek(m);
    if (ev.end.getTime() > now) out.push(ev);
    m = addDays(m, 7);
  }
  return out;
}

export function eventDateLabel(ev, { short = false } = {}) {
  const d = ev.start;
  const dow = DAY_NAMES[(d.getDay() + 6) % 7];
  return short ? `${dow.slice(0, 3)}. ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}` : `${dow} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/* ───────── Bonus du jour ───────── */
const fr = (n) => String(n).replace('.', ',');
export function modsText(theme) {
  const m = theme.mods || {};
  const out = [];
  if (m.tax) out.push(`Impôts et commerces ×${fr(m.tax)}`);
  if (m.commerce) out.push(`Commerces ×${fr(m.commerce)}`);
  if (m.prod) out.push(`Production ×${fr(m.prod)}`);
  if (m.happy) out.push(`Bonheur +${Math.round(m.happy * 100)} %`);
  if (m.growth) out.push(`Maisons remplies ${m.growth}× plus vite`);
  if (m.xp) out.push(`XP du passe ×${m.xp}`);
  if (m.shop) out.push(`Boutique à −${Math.round((1 - m.shop) * 100)} %`);
  if (m.drops) out.push(`${m.drops}× plus de ${theme.drop.name} à ramasser`);
  return out;
}

/* ───────── Récompenses et défis (tirés au sort pour chaque événement) ───────── */
const ROOF_POOL = ['violet', 'citrouille', 'noir', 'rose', 'turquoise', 'or'];
const BOOST_IDS = ['prod2', 'tax2', 'fete', 'growth'];

/** Pièces d'une récompense « cash » selon le niveau du village. */
export function scaledCash(k, level = 1) {
  return Math.round(((300 + Math.max(1, level) * 220) * k) / 50) * 50;
}

/** Les 8 récompenses des paliers d'un événement. */
export function eventRewards(ev) {
  const rng = mulberry32(hashStr('evr:' + ev.key));
  const th = ev.theme;
  const cash = th.cash || 1;
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const filler = () => {
    const r = rng();
    if (r < 0.4) return { res: 1 + Math.floor(rng() * 4) };
    if (r < 0.75) return { boost: pick(BOOST_IDS), n: 1 };
    return { pxp: 600 };
  };
  const roof = th.theme === 'random' ? pick(ROOF_POOL) : th.theme;
  const list = [
    { cash: 1 * cash },
    filler(),
    { gems: 8 + Math.floor(rng() * 7) },
    { chest: rng() < 0.55 ? 'bois' : 'argent' },
    { cash: 3 * cash, title: th.title },
    th.decor[1] ? { decor: th.decor[1] } : roof ? { theme: roof } : { chest: 'argent', boost: pick(BOOST_IDS), n: 1 },
    { gems: 18 + Math.floor(rng() * 13), chest: rng() < 0.6 ? 'argent' : 'or' },
    { decor: th.decor[0], gems: 25 + Math.floor(rng() * 16), cash: 4 * cash },
  ];
  if (roof && th.decor[1]) list[3] = { theme: roof };
  if (th.jackpot) list[6] = { gems: 40 + Math.floor(rng() * 21), chest: 'royal' };
  // un peu de variété dans l'ordre des petits paliers
  if (rng() < 0.45) [list[1], list[2]] = [list[2], list[1]];
  return list;
}

const TASK_POOL = [
  { stat: 'built', label: (n) => `Construis ${n} bâtiments`, n: [4, 6, 9], pts: [70, 90, 120] },
  { stat: 'decor', label: (n) => `Pose ${n} décorations`, n: [3, 5, 7], pts: [60, 80, 100] },
  { stat: 'upgraded', label: (n) => `Fais ${n} améliorations`, n: [3, 5, 8], pts: [80, 100, 130] },
  { stat: 'coins', label: (n) => `Gagne ${fmt(n)} pièces`, n: [1500, 3500, 7000], pts: [70, 90, 120] },
  { stat: 'roads', label: (n) => `Trace ${n} cases de route`, n: [8, 15, 25], pts: [50, 70, 90] },
  { stat: 'daily', label: (n) => `Termine ${n} mission${n > 1 ? 's' : ''} du jour`, n: [1, 2, 3], pts: [70, 100, 130] },
  { stat: 'quests', label: (n) => `Termine ${n} quête${n > 1 ? 's' : ''} principale${n > 1 ? 's' : ''}`, n: [1, 2], pts: [90, 130] },
  { stat: 'food', label: (n) => `Produis ${fmt(n)} nourriture`, n: [300, 700, 1400], pts: [60, 80, 110] },
  { stat: 'planted', label: (n) => `Plante ${n} forêts`, n: [2, 4, 6], pts: [50, 70, 90] },
  { stat: 'trades', label: (n) => `Fais ${n} échanges au comptoir`, n: [2, 4], pts: [60, 90], minLevel: 5 },
  { stat: 'orders', label: (n) => `Livre ${n} commande${n > 1 ? 's' : ''}`, n: [1, 2], pts: [80, 120], minLevel: 3 },
  { stat: 'chests', label: (n) => `Ouvre ${n} coffre${n > 1 ? 's' : ''}`, n: [1, 2], pts: [50, 80] },
];

/** Les 5 défis d'un événement : ramasser les objets + 4 défis tirés au sort. */
export function eventTasks(ev, level = 1) {
  const rng = mulberry32(hashStr('evt:' + ev.key));
  const th = ev.theme;
  const out = [{ stat: 'ev_collect', n: 12, pts: 120, label: `Ramasse ${12} ${th.drop.name} dans ton village` }];
  const pool = TASK_POOL.filter((t) => (t.minLevel || 0) <= level);
  while (out.length < 5 && pool.length) {
    const t = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const d = Math.min(t.n.length - 1, Math.floor(rng() * t.n.length));
    out.push({ stat: t.stat, n: t.n[d], pts: t.pts[d], label: t.label(t.n[d]) });
  }
  return out;
}
