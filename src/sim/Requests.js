// Les demandes des habitants. De temps en temps, quelqu'un d'une maison demande quelque chose
// qui lui manque vraiment : la demande vient de la simulation (un besoin pas couvert, un commerce
// absent du quartier, une maison prête à s'agrandir). Une bulle apparaît au-dessus de la maison ;
// dès que c'est fait, la bulle passe au vert et on vient chercher la récompense (pièces, XP,
// parfois une gemme) : les habitants de la maison sont ravis pendant quelques jours (bonheur).
import { BUILDINGS, ROAD_TYPES, sizeOf } from '../data/buildings.js';
import { villagerName } from './Villagers.js';
import { hash2 } from '../core/rng.js';
import { round5 } from '../core/util.js';

const FEM = new Set(['Léa', 'Emma', 'Jade', 'Louise', 'Alice', 'Chloé', 'Inès', 'Lina', 'Rose', 'Anna', 'Mia', 'Zoé', 'Manon', 'Camille',
  'Margaux', 'Clara', 'Lou', 'Juliette', 'Agathe', 'Céleste', 'Romane', 'Elsa', 'Iris', 'Nina']);

/** Besoins couverts par les services (la simulation dit s'ils manquent). */
const NEED_REQ = {
  water: { icon: '💧', text: 'aimerait avoir de l\'eau près de chez {lui}', types: ['well', 'watertower'], hint: 'Un puits ou un château d\'eau à portée de sa maison.' },
  commerce: { icon: '🧺', text: 'voudrait un marché dans son quartier', types: ['market', 'shop', 'mall'], hint: 'Un marché, une boutique ou un grand magasin à portée.' },
  leisure: { icon: '🍺', text: 'rêve d\'un endroit pour se détendre le soir', types: ['tavern', 'park', 'fountain', 'bench'], hint: 'Une taverne, un parc, une fontaine ou un banc à portée.' },
  education: { icon: '🎓', text: 'voudrait une école pour ses enfants', types: ['school'], hint: 'Une école à portée de sa maison.' },
  health: { icon: '⚕️', text: 'aimerait un dispensaire pas trop loin', types: ['clinic', 'hospital'], hint: 'Un dispensaire ou un hôpital à portée.' },
  security: { icon: '🛡️', text: 'ne se sent pas en sécurité : une gendarmerie ?', types: ['police'], hint: 'Une gendarmerie à portée de sa maison.' },
  paved: { icon: '🛣️', text: 'voudrait une route pavée devant chez {lui}', types: [], hint: 'Pave la route qui longe sa maison (outil Route).' },
};

/** Bâtiments qu'on aimerait avoir à côté de chez soi (rayon en cases, centre à centre). */
const NEAR_REQ = {
  bakery: { r: 7, text: 'voudrait une boulangerie près de chez {lui}' },
  market: { r: 6, text: 'aimerait faire ses courses au marché sans marcher des heures' },
  tavern: { r: 7, text: 'aimerait une taverne pour retrouver ses amis' },
  fountain: { r: 5, text: 'aimerait une fontaine sur la place de son quartier' },
  flowers: { r: 2.5, text: 'voudrait des fleurs devant sa maison' },
  tree: { r: 2.5, text: 'aimerait des arbres autour de chez {lui}' },
  bench: { r: 4, text: 'voudrait un banc pour s\'asseoir au soleil' },
  park: { r: 7, text: 'rêve d\'un parc pour promener son chien' },
  school: { r: 8, text: 'voudrait que ses enfants aillent à l\'école à pied' },
  garden: { r: 5, text: 'aimerait des légumes frais : un potager à côté ?' },
  statue: { r: 7, text: 'trouve que le quartier manque d\'une belle statue' },
  bandstand: { r: 8, text: 'aimerait écouter de la musique au kiosque' },
};

const KEEP_DAYS = 5; // une demande attend 5 jours de jeu
const JOY_DAYS = 3; // les habitants sont ravis pendant 3 jours

export class Requests {
  constructor(game) {
    this.game = game;
    this.acc = 0;
  }

  get st() {
    return this.game.state;
  }
  get world() {
    return this.game.world;
  }

  data() {
    const st = this.st;
    if (!st.requests) st.requests = { list: [], next: Math.max(1.2, st.time.day + 0.6), seq: 1 };
    return st.requests;
  }

  list() {
    return this.st ? this.data().list : [];
  }

  readyCount() {
    return this.list().filter((r) => r.ready).length;
  }

  of(houseId) {
    return this.list().find((r) => r.house === houseId) || null;
  }

  /** Texte de la demande (« Léa voudrait une boulangerie près de chez elle »). */
  text(r) {
    const lui = r.fem ? 'elle' : 'lui';
    let t;
    if (r.kind === 'need') t = NEED_REQ[r.key].text;
    else if (r.kind === 'near') t = NEAR_REQ[r.key].text;
    else t = 'attend un bébé : il faudrait agrandir sa maison';
    return `${r.name} ${t.replace('{lui}', lui)}`;
  }

  icon(r) {
    if (r.kind === 'need') return NEED_REQ[r.key].icon;
    if (r.kind === 'near') return BUILDINGS[r.key]?.icon || '🏠';
    return '🏠';
  }

  hint(r) {
    if (r.kind === 'need') return NEED_REQ[r.key].hint;
    if (r.kind === 'near') return `${BUILDINGS[r.key].name} à moins de ${Math.round(NEAR_REQ[r.key].r)} cases de sa maison.`;
    return `Améliore sa maison au niveau ${r.to}.`;
  }

  /** Bâtiment à proposer pour répondre (le moins cher qu'on sait construire). */
  suggestion(r) {
    const prog = this.game.prog;
    const types = r.kind === 'need' ? NEED_REQ[r.key].types : r.kind === 'near' ? [r.key] : [];
    return types.find((t) => BUILDINGS[t] && prog.isUnlocked(t)) || null;
  }

  /* ───────── Chaque pas de simulation ───────── */
  tick(days) {
    const game = this.game, st = this.st;
    if (!st || !this.world || game.isDemo) return;
    this.acc += days;
    if (this.acc < 0.01) return; // ~1 s de jeu
    this.acc = 0;
    const R = this.data();
    const day = st.time.day;
    // réalisées ? abandonnées ?
    for (const r of [...R.list]) {
      const b = this.world.buildings.get(r.house);
      if (!b) {
        this.drop(r);
        continue;
      }
      if (!r.ready && this.fulfilled(r, b)) {
        r.ready = true;
        game.bus.emit('request:ready', r, b);
      } else if (!r.ready && day > r.until) {
        this.drop(r);
        game.bus.emit('request:expired', r);
      }
    }
    // une nouvelle demande de temps en temps
    if (day >= R.next) {
      R.next = day + 1.2 + hash2(R.seq, Math.floor(day), 5) * 1.2;
      const max = Math.min(3, 1 + Math.floor(this.houses().length / 6));
      if (R.list.length < max) {
        const r = this.create();
        if (r) {
          R.list.push(r);
          game.bus.emit('request:new', r);
        }
      }
    }
  }

  drop(r) {
    const R = this.data();
    R.list = R.list.filter((x) => x !== r);
    this.game.bus.emit('request:changed');
  }

  houses() {
    const out = [];
    const sim = this.game.sim;
    for (const b of this.world.buildings.values()) {
      const def = BUILDINGS[b.type];
      if (!def.residents || b.cons?.k === 'new' || !(b.residents >= 1) || b.fire) continue;
      if (!sim.info.get(b.id)?.connected) continue;
      out.push(b);
    }
    return out;
  }

  fulfilled(r, b) {
    const inf = this.game.sim.info.get(b.id);
    if (r.kind === 'need') return !!inf?.needs?.[r.key];
    if (r.kind === 'up') return b.level >= r.to && !b.cons;
    if (r.kind === 'near') return this.nearHas(b, r.key, NEAR_REQ[r.key].r);
    return false;
  }

  nearHas(b, type, radius) {
    const world = this.world;
    const c = world.centerOf(b);
    for (const o of world.buildings.values()) {
      if (o.type !== type || o.cons?.k === 'new') continue;
      const oc = world.centerOf(o);
      if ((oc.cx - c.cx) ** 2 + (oc.cz - c.cz) ** 2 <= radius * radius) return true;
    }
    return false;
  }

  /** Choisit une maison et ce qui lui manque vraiment. */
  create() {
    const st = this.st, game = this.game, prog = game.prog, R = this.data();
    const houses = this.houses().filter((b) => !this.of(b.id));
    if (houses.length < 2) return null;
    const seq = R.seq;
    const options = [];
    for (const b of houses) {
      const def = BUILDINGS[b.type];
      const inf = game.sim.info.get(b.id);
      const next = def.upgradeNeeds?.[b.level] || [];
      // besoins de service non couverts (en priorité ceux qui bloquent la prochaine amélioration)
      for (const k in NEED_REQ) {
        if (inf?.needs?.[k] !== false) continue;
        if (k === 'paved' ? st.mode !== 'libre' && st.level < ROAD_TYPES[2].unlock : !NEED_REQ[k].types.some((t) => prog.isUnlocked(t))) continue;
        options.push({ b, kind: 'need', key: k, w: next.includes(k) ? 6 : 2 });
      }
      // un bâtiment près de chez soi
      for (const t in NEAR_REQ) {
        if (!BUILDINGS[t] || !prog.isUnlocked(t)) continue;
        if (this.nearHas(b, t, NEAR_REQ[t].r)) continue;
        options.push({ b, kind: 'near', key: t, w: 1.2 });
      }
      // maison prête à s'agrandir (ses besoins sont couverts)
      if (b.level < def.maxLevel && !b.cons && next.every((n) => inf?.needs?.[n])) options.push({ b, kind: 'up', key: 'up', w: 2.5 });
    }
    if (!options.length) return null;
    let sum = 0;
    for (const o of options) sum += o.w;
    let pick = hash2(seq, Math.floor(st.time.day * 7), 11) * sum;
    let o = options[options.length - 1];
    for (const x of options) {
      pick -= x.w;
      if (pick <= 0) {
        o = x;
        break;
      }
    }
    R.seq++;
    const name = villagerName(o.b.id * 131 + seq * 17);
    const lvl = st.mode === 'libre' ? 10 : st.level;
    const mult = o.kind === 'up' ? 1.3 : o.kind === 'need' ? 1 : 0.8;
    const reward = { coins: round5((40 + lvl * 22) * mult), xp: Math.round((5 + lvl * 1.5) * mult) };
    if (hash2(seq, 3, 77) < 0.3) reward.gems = 1;
    return {
      id: seq, house: o.b.id, kind: o.kind, key: o.key, to: o.kind === 'up' ? o.b.level + 1 : 0,
      name, fem: FEM.has(name), day0: st.time.day, until: st.time.day + KEEP_DAYS, ready: false, reward,
    };
  }

  /** On vient chercher la récompense. */
  claim(id) {
    const R = this.data();
    const r = R.list.find((x) => x.id === id);
    if (!r || !r.ready) return null;
    R.list = R.list.filter((x) => x !== r);
    const game = this.game;
    const b = this.world.buildings.get(r.house);
    if (b) b.joy = this.st.time.day + JOY_DAYS;
    const { coins, xp, gems } = r.reward;
    if (coins) game.actions.grant({ coins });
    if (xp) game.prog.addXP(xp, 'request');
    if (gems) game.meta?.addGems(gems, 'request');
    this.st.stats.requestsDone = (this.st.stats.requestsDone || 0) + 1;
    game.sim.markDirty();
    game.bus.emit('request:claimed', r, b);
    return r;
  }

  /** Emprise de la maison (pour la caméra). */
  footprint(r) {
    const b = this.world.buildings.get(r.house);
    if (!b) return null;
    const [w, d] = sizeOf(BUILDINGS[b.type], b.rot);
    return { b, w, d };
  }
}
