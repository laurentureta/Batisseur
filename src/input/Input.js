// Gestes tactiles et souris : déplacer, zoomer, pivoter, construire, tracer des routes, détruire.
import { BUILDINGS, sizeOf } from '../data/buildings.js';
import { SIZE } from '../world/constants.js';

const TAP_MOVE = 9; // px avant de considérer qu'on fait glisser

export class Input {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.pointers = new Map();
    this.mode = null; // 'pending' | 'pan' | 'stroke' | 'pinch' | 'rotate'
    this.panWorld = null;
    this.stroke = null;
    this.samples = [];
    this.pinch = null;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.cancel(e));
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.key(e));
  }

  get r() {
    return this.game.renderer;
  }
  get enabled() {
    return !!this.game.world && this.game.playing;
  }

  /* ───────── Événements bruts ───────── */
  down(e) {
    if (!this.game.world) return;
    this.game.sound.unlock();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignoré */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, type: e.pointerType });
    this.r.cam.vel.set(0, 0);
    this.r.cam.fly = null;
    if (this.pointers.size === 1) {
      const tool = this.game.tool;
      if (e.button === 2 || (e.pointerType === 'mouse' && e.altKey)) {
        this.mode = 'rotate';
        return;
      }
      this.mode = 'pending';
      if (!this.enabled) return;
      if (tool.kind === 'road' || tool.kind === 'demolish') {
        const t = this.r.pickTile(e.clientX, e.clientY);
        if (t && this.game.world.inside(t.x, t.z)) this.stroke = { start: t, end: t, active: false };
      }
      if (tool.kind === 'build' || tool.kind === 'move') this.updateGhost(e.clientX, e.clientY);
    } else if (this.pointers.size === 2) {
      this.cancelStroke();
      this.r.overlays.hideGhost();
      this.mode = 'pinch';
      this.pinch = this.pinchState();
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      // survol à la souris : aperçu du bâtiment
      if (e.pointerType === 'mouse' && this.enabled && (this.game.tool.kind === 'build' || this.game.tool.kind === 'move')) this.updateGhost(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const cam = this.r.cam;
    if (this.mode === 'rotate') {
      cam.rotate(-dx * 0.008);
      return;
    }
    if (this.mode === 'pinch' && this.pointers.size >= 2) {
      const now = this.pinchState();
      const prev = this.pinch;
      if (prev && now) {
        if (prev.dist > 10) cam.zoomAt(now.dist / prev.dist, now.mx, now.my);
        let da = now.angle - prev.angle;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < 0.5) cam.rotate(da, now.mx, now.my);
        const before = cam.screenToGround(prev.mx, prev.my);
        if (before) cam.dragTo(before, now.mx, now.my);
      }
      this.pinch = now;
      return;
    }
    if (this.pointers.size !== 1) return;
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
    if (this.mode === 'pending' && this.stroke && moved > TAP_MOVE * 0.6) {
      this.mode = 'stroke';
      this.stroke.active = true;
    }
    if (this.mode === 'stroke') {
      const t = this.r.pickTile(e.clientX, e.clientY);
      if (t) {
        const cx = Math.max(0, Math.min(SIZE - 1, t.x)), cz = Math.max(0, Math.min(SIZE - 1, t.z));
        if (cx !== this.stroke.end.x || cz !== this.stroke.end.z) {
          this.stroke.end = { x: cx, z: cz };
          this.previewStroke(e.clientX, e.clientY);
        } else this.game.ui.moveStrokeInfo(e.clientX, e.clientY);
      }
      return;
    }
    if (this.mode === 'pending' && moved > TAP_MOVE) {
      this.mode = 'pan';
      this.panWorld = cam.screenToGround(p.sx, p.sy);
      if (this.game.tool.kind === 'build' && e.pointerType !== 'mouse') this.r.overlays.hideGhost();
      this.samples = [];
    }
    if (this.mode === 'pan' && this.panWorld) {
      const before = cam.target.clone();
      cam.dragTo(this.panWorld, e.clientX, e.clientY);
      const now = performance.now();
      this.samples.push({ t: now, dx: cam.target.x - before.x, dz: cam.target.z - before.z });
      while (this.samples.length && now - this.samples[0].t > 90) this.samples.shift();
    }
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignoré */
    }
    if (this.mode === 'pinch') {
      if (this.pointers.size === 1) {
        const rest = [...this.pointers.values()][0];
        this.mode = 'pan';
        rest.sx = rest.x;
        rest.sy = rest.y;
        this.panWorld = this.r.cam.screenToGround(rest.x, rest.y);
        this.pinch = null;
      } else if (this.pointers.size === 0) this.mode = null;
      return;
    }
    if (this.pointers.size > 0) return;
    const mode = this.mode;
    this.mode = null;
    if (mode === 'stroke') {
      this.commitStroke();
      return;
    }
    this.cancelStroke();
    if (mode === 'pan') {
      // inertie
      if (this.samples.length >= 2) {
        const first = this.samples[0], last = this.samples[this.samples.length - 1];
        const dt = Math.max(16, last.t - first.t) / 1000;
        let sx = 0, sz = 0;
        for (const s of this.samples) {
          sx += s.dx;
          sz += s.dz;
        }
        const v = this.r.cam.vel.set(sx / dt, sz / dt);
        if (v.length() > 40) v.setLength(40);
        if (v.length() < 1.5) v.set(0, 0);
      }
      if (this.game.tool.kind === 'build' && p.type !== 'mouse') this.r.overlays.hideGhost();
      return;
    }
    if (mode === 'pending' && this.enabled) this.tap(e.clientX, e.clientY, p.type);
  }

  cancel(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      this.mode = null;
      this.cancelStroke();
    }
  }

  wheel(e) {
    e.preventDefault();
    if (!this.game.world) return;
    if (e.ctrlKey) this.r.cam.zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    else this.r.cam.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }

  key(e) {
    if (!this.enabled || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Escape') this.game.ui.exitTool();
    else if (e.key === 'r' || e.key === 'R') this.game.ui.rotateTool();
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z') this.game.ui.undo();
  }

  pinchState() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  }

  /* ───────── Construction ───────── */
  anchorFor(type, fx, fz, rot) {
    const [w, d] = sizeOf(BUILDINGS[type], rot);
    return { x: Math.round(fx - w / 2), z: Math.round(fz - d / 2) };
  }

  placementAt(cx, cy) {
    const tool = this.game.tool;
    const t = this.r.pickTile(cx, cy);
    if (!t) return null;
    const type = tool.kind === 'move' ? this.game.world.buildings.get(tool.id)?.type : tool.type;
    if (!type) return null;
    let rot = tool.rot;
    let a = this.anchorFor(type, t.fx, t.fz, rot ?? 0);
    if (rot == null) {
      rot = this.game.actions.autoRotation(type, a.x, a.z);
      a = this.anchorFor(type, t.fx, t.fz, rot);
    }
    return { type, x: a.x, z: a.z, rot };
  }

  updateGhost(cx, cy) {
    const pl = this.placementAt(cx, cy);
    if (!pl) return;
    const tool = this.game.tool;
    const chk = tool.kind === 'move'
      ? this.game.actions.checkPlacement(pl.type, pl.x, pl.z, pl.rot, tool.id)
      : this.game.actions.checkPlacement(pl.type, pl.x, pl.z, pl.rot);
    const level = tool.kind === 'move' ? this.game.world.buildings.get(tool.id)?.level || 1 : 1;
    this.r.overlays.setGhost(pl.type, pl.x, pl.z, pl.rot, chk.ok, level);
    const def = BUILDINGS[pl.type];
    if (def.coverage) {
      const [w, d] = sizeOf(def, pl.rot);
      this.r.overlays.showRadius(pl.x + w / 2, pl.z + d / 2, def.coverage.radius[Math.min(level, def.coverage.radius.length) - 1], 0x64b5f6);
    }
    this.lastPlacement = pl;
  }

  tap(cx, cy, pointerType) {
    const game = this.game;
    const tool = game.tool;
    const ui = game.ui;
    if (tool.kind === 'select') {
      const id = this.r.pickBuilding(cx, cy);
      if (id != null) {
        game.select(id);
        game.sound.play('tap');
        return;
      }
      const t = this.r.pickTile(cx, cy);
      if (t && game.world.inside(t.x, t.z) && !game.world.zoneUnlocked(t.x, t.z) && game.state.mode !== 'libre') {
        const zi = game.world.zoneIndex(t.x, t.z);
        if (game.world.zoneAdjacentUnlocked(zi)) {
          ui.openZone(zi);
          return;
        }
      }
      game.select(null);
      return;
    }
    if (tool.kind === 'build') {
      const pl = this.placementAt(cx, cy);
      if (!pl) return;
      const res = game.actions.placeBuilding(pl.type, pl.x, pl.z, pl.rot);
      if (res.ok) {
        game.sound.play('place');
        this.r.overlays.setGhost(pl.type, pl.x, pl.z, pl.rot, false);
        if (pointerType !== 'mouse') this.r.overlays.hideGhost();
        else this.updateGhost(cx, cy);
        if (res.building) ui.afterBuild(res.building);
      } else {
        game.sound.play('error');
        ui.toast(res.reason, 'error');
        this.r.overlays.setGhost(pl.type, pl.x, pl.z, pl.rot, false);
      }
      return;
    }
    if (tool.kind === 'move') {
      const pl = this.placementAt(cx, cy);
      if (!pl) return;
      const res = game.actions.move(tool.id, pl.x, pl.z, pl.rot);
      if (res.ok) {
        game.sound.play('place');
        this.r.overlays.hideGhost();
        this.r.overlays.hideRadius();
        const id = tool.id;
        game.setTool({ kind: 'select' });
        game.select(id);
      } else {
        game.sound.play('error');
        ui.toast(res.reason, 'error');
      }
      return;
    }
    if (tool.kind === 'demolish') {
      const id = this.r.pickBuilding(cx, cy);
      if (id != null) {
        ui.confirmDemolish(id);
        return;
      }
      const t = this.r.pickTile(cx, cy);
      if (t && game.world.inside(t.x, t.z)) {
        const i = game.world.idx(t.x, t.z);
        if (game.world.road[i]) {
          const res = game.actions.demolishRoads([i]);
          if (res.ok) game.sound.play('demolish');
        }
      }
      return;
    }
    if (tool.kind === 'road') {
      const t = this.r.pickTile(cx, cy);
      if (!t || !game.world.inside(t.x, t.z)) return;
      ui.commitRoad([game.world.idx(t.x, t.z)], tool.roadType);
    }
  }

  /* ───────── Tracé de routes ───────── */
  strokeTiles() {
    const s = this.stroke;
    if (!s) return [];
    const a = s.start, b = s.end;
    const tiles = [];
    const add = (x, z) => {
      if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) return;
      const i = z * SIZE + x;
      if (!tiles.includes(i)) tiles.push(i);
    };
    const line = (x0, z0, x1, z1) => {
      const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
      let x = x0, z = z0;
      add(x, z);
      while (x !== x1 || z !== z1) {
        x += dx;
        z += dz;
        add(x, z);
      }
    };
    // tracé en L : d'abord dans la direction principale
    if (Math.abs(b.x - a.x) >= Math.abs(b.z - a.z)) {
      line(a.x, a.z, b.x, a.z);
      line(b.x, a.z, b.x, b.z);
    } else {
      line(a.x, a.z, a.x, b.z);
      line(a.x, b.z, b.x, b.z);
    }
    return tiles;
  }

  previewStroke(cx, cy) {
    const tiles = this.strokeTiles();
    const tool = this.game.tool;
    if (tool.kind === 'road') {
      const pv = this.game.actions.previewRoads(tiles, tool.roadType);
      this.r.overlays.setRoadPreview(pv.tiles);
      this.game.ui.showStrokeInfo(pv, cx, cy);
    } else {
      const road = this.game.world.road;
      this.r.overlays.setRoadPreview(tiles.map((i) => ({ i, ok: true, demolish: true, skip: !road[i] })));
    }
  }

  commitStroke() {
    const tiles = this.strokeTiles();
    const tool = this.game.tool;
    this.cancelStroke();
    if (!tiles.length) return;
    if (tool.kind === 'road') this.game.ui.commitRoad(tiles, tool.roadType);
    else if (tool.kind === 'demolish') {
      const res = this.game.actions.demolishRoads(tiles);
      if (res.ok) this.game.sound.play('demolish');
    }
  }

  cancelStroke() {
    this.stroke = null;
    this.r?.overlays.clearRoadPreview();
    this.game.ui?.hideStrokeInfo();
  }
}
