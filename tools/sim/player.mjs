// Le joueur automatique. Il joue comme quelqu'un qui suit les quêtes et bouche les trous :
// il inaugure ce qui est prêt, réclame ses récompenses, construit ce que la quête demande,
// puis, s'il n'a rien de mieux à faire, nourrit son village, loge ses habitants et améliore.
//
// Ce qui nous intéresse n'est pas qu'il joue bien, mais qu'il joue comme un humain ordinaire :
// ce sont ses moments de blocage et d'ennui qui révèlent les défauts d'équilibrage.
import { BUILDINGS, sizeOf } from '../../src/data/buildings.js';
import { RESOURCES } from '../../src/data/resources.js';
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
    this.counts = new Map();
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

  /** Combien d'exemplaires de ce type un joueur sensé possède-t-il ? Le premier joueur
      automatique en avait bâti 399 du même, faute de cette borne. */
  tooMany(type) {
    const def = BUILDINGS[type];
    const n = this.counts.get(type) || 0;
    if (def.residents) return n >= 6 + Math.floor(this.g.sim.d.population / 6);
    if (def.workers) return n >= 2 + Math.floor(this.g.sim.d.workforce / (def.workers * 4));
    return n >= 8;
  }

  build(type, retry = true) {
    // checkPlacement refuse aussi pour cause de bourse vide : sans ce test préalable, tous les
    // emplacements paraîtraient mauvais et on mettrait « plus de place » pour « pas les moyens ».
    const def = BUILDINGS[type];
    if (!def) return false;
    if (!this.g.actions.canAfford(def.costs?.[0] || {})) { this.note(`pas les moyens : ${type}`); return false; }
    if (this.tooMany(type)) { this.note(`déjà assez de ${type}`); return false; }
    // un atelier sans ouvrier ne produit rien : inutile d'en ajouter si les postes sont vides
    if (def.workers && this.g.sim.d.staffing < 0.85) { this.note('pas assez de bras'); return false; }
    const spot = this.town.spot(type);
    if (!spot) {
      if (!retry || !this.town.grow()) { this.note('plus de place'); return false; }
      return this.build(type, false);
    }
    const res = this.g.actions.placeBuilding(type, spot.x, spot.z, spot.rot);
    if (res?.ok === false) { this.note(res.reason || 'refus de construction'); return false; }
    if (spot.away) {
      const [w, d] = sizeOf(def, spot.rot);
      this.town.connect(spot.x, spot.z, w, d);   // sans route, elle ne tournerait pas
    }
    this.actionsDone++;
    return true;
  }

  /** Un seul balayage des améliorations par décision : qui est améliorable le moins cher,
      et quelle ressource manque le plus souvent. Deux parcours séparés rendaient la campagne
      quadratique — des centaines de bâtiments fois des milliers de décisions. */
  scanUpgrades() {
    if (this._scan) return this._scan;
    let best = null;
    const miss = new Map();
    for (const b of this.g.world.buildings.values()) {
      const chk = this.g.actions.checkUpgrade(b);
      if (!chk || chk.max || !chk.cost) continue;
      if (chk.ok) {
        const c = chk.cost;
        const price = (c.coins || 0) + (c.wood || 0) * 2 + (c.stone || 0) * 3 + (c.planks || 0) * 6 + (c.bricks || 0) * 8;
        if (!best || price < best.price) best = { id: b.id, price };
      } else {
        for (const [res, need] of Object.entries(chk.cost)) {
          if ((this.g.state.res[res] || 0) < need) miss.set(res, (miss.get(res) || 0) + 1);
        }
      }
    }
    // une usine à l'arrêt faute d'intrant compte lourd : le joueur voit « manque d'argile »
    // écrit sur sa briqueterie et va creuser une argilière. Le premier bot ne regardait que
    // le coût des améliorations, qui ne demande jamais ni argile, ni fer, ni outils — il a
    // donc bâti trente-sept briqueteries qui n'ont jamais cuit une seule brique.
    for (const b of this.g.world.buildings.values()) {
      const need = BUILDINGS[b.type]?.consumes;
      if (!need) continue;
      for (const res of Object.keys(need)) {
        if ((this.g.state.res[res] || 0) >= need[res]) continue;
        if ((this.g.sim.d.rates?.[res]?.prod ?? 0) > 0) continue;
        miss.set(res, (miss.get(res) || 0) + 3);
      }
    }
    let bottleneck = null;
    for (const [res, n] of miss) if (!bottleneck || n > miss.get(bottleneck)) bottleneck = res;
    return (this._scan = { best, bottleneck });
  }

  upgradeCheapest() {
    const best = this.scanUpgrades().best;
    if (!best) { this.note('rien à améliorer'); return false; }
    const r = this.g.actions.upgrade(best.id);
    if (r?.ok === false) { this.note(r.reason || 'refus d\'amélioration'); return false; }
    this.actionsDone++;
    return true;
  }

  bottleneck() { return this.scanUpgrades().bottleneck; }

  /** Agrandir le stock quand les ressources plafonnent : sans entrepôt, toute la production
      part à la poubelle. Le jeu n'a qu'un seul bâtiment de stockage, à améliorer. */
  store() {
    const full = this.g.sim.d.fullGoods || [];
    if (full.length < 2) return false;
    const dep = [...this.g.world.buildings.values()].find((b) => BUILDINGS[b.type]?.storage);
    if (!dep) {
      for (const [type, def] of Object.entries(BUILDINGS)) {
        if (def.storage && this.g.prog.isUnlocked(type) && this.build(type)) return true;
      }
      this.note('pas d\'entrepôt possible');
      return false;
    }
    if (this.g.actions.checkUpgrade(dep)?.ok && this.g.actions.upgrade(dep.id)?.ok !== false) {
      this.actionsDone++;
      return true;
    }
    this.note('entrepôt saturé');
    return false;
  }

  /** Éteindre les incendies. Sans ça, le village se vide tout seul : la première campagne
      a vu la population tomber de 44 à 10 habitants en trois semaines, faute de pompier. */
  fight() {
    let n = 0;
    for (const b of this.g.world.buildings.values()) {
      if (!b.fire) continue;
      if (this.g.actions.extinguish(b.id)?.ok !== false) { n++; this.actionsDone++; }
    }
    return n;
  }

  /** Construit un producteur de la ressource qui bloque. Un joueur qui lit « il manque des
      planches » va bâtir une scierie ; le premier joueur automatique, lui, attendait. */
  supply(res) {
    if (!res) return false;
    const d = this.g.sim.d;
    // rates[res] est un objet { prod, cons } : le comparer à 0 ne donnait jamais rien,
    // et le bot empilait les producteurs d'une ressource déjà abondante.
    if ((d.rates?.[res]?.prod ?? 0) >= (d.rates?.[res]?.cons ?? 0)) return false;
    const already = [...this.g.world.buildings.values()]
      .some((b) => BUILDINGS[b.type]?.produces?.[res] && b.cons && !b.cons.ready);
    if (already) return false;
    const makers = candidates(this.g, (def) => def.produces?.[res]);
    for (const c of makers) if (this.build(c.type)) return true;
    return false;
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
    // des postes vides : ce sont des habitants qu'il faut, pas des bâtiments
    if (d.staffing < 0.85 || d.population >= d.capacity * 0.85) {
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

  /** Lancer un lot à l'atelier. Toute l'économie tardive du jeu passe par là — laine, tissu,
      vêtements, céramiques, machines — et aucun bâtiment ne les produit tout seul : il faut
      mettre un lot en file. Le premier joueur automatique l'ignorait complètement, et la
      campagne concluait donc « zéro marchandise avancée », ce qui mesurait le bot, pas le jeu. */
  craft() {
    const g = this.g;
    if (!g.workshop) return false;
    let best = null;
    for (const b of g.world.buildings.values()) {
      if (b.cons || b.fire) continue;
      if (g.workshop.queue(b.id).length >= 2) continue;        // on laisse de la marge dans la file
      for (const r of g.workshop.recipesFor(b)) {
        if (g.state.level < r.level) continue;
        let ok = true;
        for (const [res, n] of Object.entries(r.inputs)) {
          // on garde une réserve : un joueur ne vide pas son grenier pour un lot
          if ((g.state.res[res] || 0) < n * 3) { ok = false; break; }
        }
        if (!ok) continue;
        let value = 0;
        for (const [res, n] of Object.entries(r.outputs)) {
          const unit = RESOURCES[res]?.value ?? RESOURCES[res]?.price ?? 1;
          // une marchandise qu'on n'a jamais vue vaut qu'on s'y mette
          value += n * unit * ((g.state.res[res] || 0) > 0 ? 1 : 4);
        }
        const score = value / r.seconds;
        if (!best || score > best.score) best = { id: b.id, recipe: r.id, score };
      }
    }
    if (!best) { this.note('rien à fabriquer'); return false; }
    const res = g.workshop.enqueue(best.id, best.recipe);
    if (res?.ok === false) { this.note(res.reason || 'refus de fabrication'); return false; }
    this.actionsDone++;
    return true;
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
    // recensement une fois par décision : le compter à chaque tentative rendait la campagne
    // quadratique, et un joueur sait de tête combien de scieries il possède
    this._scan = null;
    this.counts = new Map();
    for (const b of this.g.world.buildings.values()) this.counts.set(b.type, (this.counts.get(b.type) || 0) + 1);
    const what = this.step();
    for (const r of this.pending) this.blocked.set(r, (this.blocked.get(r) || 0) + 1);
    return what;
  }

  step() {
    if (this.fight()) return 'incendie';
    if (this.inaugurate()) return 'inauguration';
    if (this.claim()) return 'récompense';
    if (this.deliver()) return 'commande';
    if (this.g.sim.d.starving && this.feed()) return 'famine';
    if (this.broke()) { this.idleActions++; this.note('sans le sou'); return null; }
    if (this.store()) return 'entrepôt';
    if (this.workOnQuest()) return 'quête';
    if (this.craft()) return 'atelier';
    if (this.feed()) return 'nourriture';
    if (this.houseOrWork()) return 'logement';
    if (this.upgradeCheapest()) return 'amélioration';
    if (this.supply(this.bottleneck())) return 'production';
    if (this.town.grow()) return 'rue';
    // à court de parcelles : on achète du terrain, comme le ferait un joueur
    if (this.cramped() && this.unlockZone()) return 'terrain';
    this.idleActions++;
    this.note('rien à faire');
    return null;
  }
}
