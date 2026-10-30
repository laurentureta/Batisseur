// Le joueur automatique. Il joue comme quelqu'un qui suit les quêtes et bouche les trous :
// il inaugure ce qui est prêt, réclame ses récompenses, construit ce que la quête demande,
// puis, s'il n'a rien de mieux à faire, nourrit son village, loge ses habitants et améliore.
//
// Ce qui nous intéresse n'est pas qu'il joue bien, mais qu'il joue comme un humain ordinaire :
// ce sont ses moments de blocage et d'ennui qui révèlent les défauts d'équilibrage.
import { BUILDINGS } from '../../src/data/buildings.js';
import { Town } from './town.mjs';

/** Bâtiments candidats pour un besoin, du moins cher au plus cher, parmi ceux débloqués. */
function candidates(game, filter) {
  const out = [];
  for (const [type, def] of Object.entries(BUILDINGS)) {
    if (def.notBuildable || def.unique) continue;
    if (!game.prog.isUnlocked(type)) continue;
    if (!filter(def, type)) continue;
    const c = def.costs?.[0] || {};
    out.push({ type, def, price: (c.coins || 0) + (c.wood || 0) * 2 + (c.stone || 0) * 3 + (c.planks || 0) * 6 + (c.bricks || 0) * 8 });
  }
  return out.sort((a, b) => a.price - b.price);
}

export class Player {
  constructor(game, { name = 'joueur' } = {}) {
    this.g = game;
    this.name = name;
    this.town = new Town(game);
    this.log = [];
    this.idleActions = 0;   // décisions où il n'y avait rien à faire
    this.actionsDone = 0;
    this.blocked = new Map(); // raison → nombre de décisions concernées
    this.pending = new Set();
    this.town.openRow(0);
  }

  // un blocage est compté une fois par décision, pas une fois par tentative : sinon la boucle
  // qui essaie quinze maisons d'affilée écrase toutes les autres causes dans le relevé
  note(reason) { this.pending.add(reason); }

  /* ───────── briques d'action ───────── */

  inaugurate() {
    let n = 0;
    for (const b of this.g.construction.readySites?.() || []) {
      if (this.g.actions.inaugurate(b.id)?.ok !== false) n++;
    }
    return n;
  }

  claim() {
    let n = 0;
    if (this.g.state.quests.mainReady && this.g.prog.claimMain()?.ok !== false) n++;
    for (let i = 0; i < 3; i++) if (this.g.prog.claimDaily?.(i)?.ok) n++;
    return n;
  }

  build(type, retry = true) {
    // checkPlacement refuse aussi pour cause de bourse vide : sans ce test préalable, tous les
    // emplacements paraîtraient mauvais et on mettrait « plus de place » pour « pas les moyens ».
    const def = BUILDINGS[type];
    if (!def) return false;
    if (!this.g.actions.canAfford(def.costs?.[0] || {})) { this.note(`pas les moyens : ${type}`); return false; }
    const spot = this.town.spot(type);
    if (!spot) {
      if (!retry || !this.town.grow()) { this.note('plus de place'); return false; }
      return this.build(type, false);
    }
    const res = this.g.actions.placeBuilding(type, spot.x, spot.z, spot.rot);
    if (res?.ok === false) { this.note(res.reason || 'refus de construction'); return false; }
    this.actionsDone++;
    return true;
  }

  /** Améliore le bâtiment améliorable le moins cher. */
  upgradeCheapest() {
    let best = null;
    for (const b of this.g.world.buildings.values()) {
      const chk = this.g.actions.checkUpgrade(b);
      if (!chk?.ok) continue;
      const c = chk.cost || {};
      const price = (c.coins || 0) + (c.wood || 0) * 2 + (c.stone || 0) * 3 + (c.planks || 0) * 6 + (c.bricks || 0) * 8;
      if (!best || price < best.price) best = { id: b.id, price };
    }
    if (!best) { this.note('rien à améliorer'); return false; }
    const r = this.g.actions.upgrade(best.id);
    if (r?.ok === false) { this.note(r.reason || 'refus d\'amélioration'); return false; }
    this.actionsDone++;
    return true;
  }

  /** Livrer les commandes qu'on peut honorer : c'est une bonne part du revenu du jeu. */
  deliver() {
    let n = 0;
    const slots = this.g.state.orders?.slots || [];
    for (let i = 0; i < slots.length; i++) {
      const o = slots[i];
      if (o && this.g.prog.canDeliver(o) && this.g.prog.deliverOrder(i)) { n++; this.actionsDone++; }
    }
    return n;
  }

  /** Achète la première zone réellement achetable (voisine, niveau atteint, payable). */
  unlockZone() {
    const st = this.g.state;
    let why = 'aucune zone voisine';
    for (let zi = 0; zi < st.zones.length; zi++) {
      if (st.zones[zi]) continue;
      if (!this.g.world.zoneAdjacentUnlocked(zi)) continue;   // les zones lointaines ne disent rien
      const info = this.g.prog.zoneInfo(zi);
      if (!info.ok) { if (info.reason) why = info.reason; continue; }
      if (this.g.actions.unlockZone(zi)?.ok !== false) { this.actionsDone++; return true; }
    }
    this.note(`zone : ${why}`);
    return false;
  }

  /* ───────── la quête du moment ───────── */

  workOnQuest() {
    const q = this.g.prog.currentQuest();
    if (!q) return false;
    const g = q.goal;
    const p = this.g.prog.questProgress(q);
    if (p.done) return false;
    switch (g.kind) {
      case 'roadConnected': return this.town.openRow(0);
      case 'count': return this.build(g.type);
      case 'countLevel': {
        // améliorer en priorité un bâtiment de ce type
        for (const b of this.g.world.buildings.values()) {
          if (b.type !== g.type || b.level >= g.level) continue;
          if (this.g.actions.checkUpgrade(b)?.ok) {
            this.g.actions.upgrade(b.id);
            this.actionsDone++;
            return true;
          }
        }
        return this.build(g.type);
      }
      case 'mairie': {
        const th = this.g.world.townhall();
        if (th && this.g.actions.checkUpgrade(th)?.ok) {
          this.g.actions.upgrade(th.id);
          this.actionsDone++;
          return true;
        }
        this.note('mairie pas améliorable');
        return false;
      }
      case 'zones': return this.unlockZone();
      case 'paved': case 'roads': return this.town.grow();
      case 'pop': return this.houseOrWork();
      case 'happiness': return this.comfort();
      case 'stock': return this.produce(g.res);
      default: return false;
    }
  }

  /* ───────── besoins de fond ───────── */

  houseOrWork() {
    const d = this.g.sim.d;
    if (d.population >= d.capacity * 0.85) {
      const homes = candidates(this.g, (def) => def.residents);
      for (const c of homes.slice(-3).reverse()) if (this.build(c.type)) return true;
      for (const c of homes) if (this.build(c.type)) return true;
      this.note('pas de logement abordable');
      return false;
    }
    if (d.unemployment > 0.25) {
      const jobs = candidates(this.g, (def) => def.workers);
      for (const c of jobs) if (this.build(c.type)) return true;
    }
    return false;
  }

  produce(res) {
    const makers = candidates(this.g, (def) => def.produces?.[res] || def.out?.[res]);
    for (const c of makers) if (this.build(c.type)) return true;
    return false;
  }

  comfort() {
    const nice = candidates(this.g, (def) => def.beauty || def.coverage);
    for (const c of nice) if (this.build(c.type)) return true;
    return false;
  }

  /** La nourriture, mais seulement quand elle manque vraiment : le premier jet du joueur
      automatique couvrait le village de potagers parce qu'il regardait un débit encore nul. */
  feed() {
    const d = this.g.sim.d;
    const st = this.g.state;
    const need = d.population * 0.5;                 // FOOD_PER_RESIDENT
    const rate = d.rates?.food ?? 0;
    const urgent = d.starving || st.res.food < 15;
    if (!urgent && rate >= need) return false;
    // un producteur de plus seulement si les chantiers en cours ne suffisent pas déjà
    const coming = [...this.g.world.buildings.values()]
      .filter((b) => BUILDINGS[b.type]?.produces?.food && b.cons && !b.cons.ready).length;
    if (!urgent && coming >= 1) return false;
    const farms = candidates(this.g, (def) => def.produces?.food);
    for (const c of farms) if (this.build(c.type)) return true;
    return false;
  }

  /** Réserve de sécurité : un joueur ne dépense jamais sa dernière pièce. */
  broke() {
    return this.g.state.res.coins < 25;
  }

  /** Le village est-il à l'étroit ? (toutes les parcelles des rues ouvertes sont prises) */
  cramped() {
    return !this.town.spot('house') && !this.town.spot('garden');
  }

  /* ───────── une décision ───────── */

  decide() {
    this.pending.clear();
    const what = this.step();
    for (const r of this.pending) this.blocked.set(r, (this.blocked.get(r) || 0) + 1);
    return what;
  }

  step() {
    if (this.inaugurate()) return 'inauguration';
    if (this.claim()) return 'récompense';
    if (this.deliver()) return 'commande';
    if (this.g.sim.d.starving && this.feed()) return 'famine';
    if (this.broke()) { this.idleActions++; this.note('sans le sou'); return null; }
    if (this.workOnQuest()) return 'quête';
    if (this.feed()) return 'nourriture';
    if (this.houseOrWork()) return 'logement';
    if (this.upgradeCheapest()) return 'amélioration';
    if (this.town.grow()) return 'rue';
    // à court de parcelles : on achète du terrain, comme le ferait un joueur
    if (this.cramped() && this.unlockZone()) return 'terrain';
    this.idleActions++;
    this.note('rien à faire');
    return null;
  }
}
