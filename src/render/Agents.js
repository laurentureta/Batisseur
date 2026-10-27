// La ville vivante : passants sur les chemins, voitures sur les routes pavées.
import * as THREE from 'three';
import { SIZE, N, T } from '../world/constants.js';
import { BUILDINGS, isPavedRoad } from '../data/buildings.js';
import { GeoBuilder } from './geom.js';
import { toGeometry } from './TerrainView.js';
import { kit, kitReady, kitBox } from './kit.js';
import { dailyActivity, planErrand } from './livingPlans.js';

// voitures (modèles KayKit) et camionnette (Kenney) : [nom, longueur visée]
const CAR_MODELS = [['c_car_sedan', 0.4], ['c_car_taxi', 0.4], ['c_car_hatchback', 0.36], ['c_car_stationwagon', 0.4], ['c_car_sedan', 0.4], ['c_car_police', 0.4], ['mk_delivery_truck', 0.5]];

const HALF = SIZE / 2;
const SHIRTS = [0xe94b5a, 0x3f7fd1, 0x4caf50, 0xf2c94c, 0x9b6bd1, 0xf08b3a, 0x2a9d8f, 0xffffff, 0x455a64, 0xd81b60];
const SKINS = [0xf2c9a6, 0xe0ac85, 0xc68863, 0x8d5a3b, 0xf5d5bd];
const CARS = [0xd9443a, 0x3f7fd1, 0xf2f2f2, 0x2b2b30, 0xf2c94c, 0x4caf50, 0x9aa5b1, 0x1e3a6e];

export class Agents {
  constructor(renderer) {
    this.r = renderer;
    this.group = new THREE.Group();
    this.maxPeople = 90;
    this.maxCars = 36;
    // passants : corps + tête
    const body = new GeoBuilder();
    body.box(-0.008, 0.0, 0, 0.012, 0.065, 0.016, 0x3a3f4a); // jambes
    body.box(0.008, 0.0, 0, 0.012, 0.065, 0.016, 0x3a3f4a);
    body.box(0, 0.065, 0, 0.05, 0.075, 0.03, 0xffffff); // torse (teinté)
    const head = new GeoBuilder();
    head.ico(0, 0.17, 0, 0.028, 0xffffff, 1, 0, 1);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.bodies = new THREE.InstancedMesh(toGeometry(body.body), mat, this.maxPeople);
    this.heads = new THREE.InstancedMesh(toGeometry(head.body), mat, this.maxPeople);
    // voitures
    const car = new GeoBuilder();
    car.box(0, 0.012, 0, 0.075, 0.04, 0.15, 0xffffff);
    car.box(0, 0.052, -0.01, 0.066, 0.034, 0.08, 0xdfe6ee);
    car.layer('glass');
    car.box(0, 0.056, -0.01, 0.068, 0.024, 0.07, 0x2e4157);
    car.layer('body');
    for (const [x, z] of [[-0.038, 0.045], [0.038, 0.045], [-0.038, -0.05], [0.038, -0.05]]) car.box(x, 0, z, 0.012, 0.028, 0.03, 0x222222);
    this.cars = new THREE.InstancedMesh(toGeometry(car.body), mat, this.maxCars);
    // vraies voitures si les modèles 3D sont chargés
    this.carKinds = [];
    if (kitReady()) {
      for (const [name, len] of CAR_MODELS) {
        const g = new GeoBuilder();
        const [x0, y0, z0, x1, , z1] = kitBox(name);
        const s = len / Math.max(x1 - x0, z1 - z0);
        kit(g, name, { s, y: -y0 * s, x: -((x0 + x1) / 2) * s, z: -((z0 + z1) / 2) * s, ao: 0.35, noGlass: true });
        const im = new THREE.InstancedMesh(toGeometry(g.body), mat, this.maxCars);
        this.carKinds.push(im);
      }
    }
    for (const m of [this.bodies, this.heads, this.cars, ...this.carKinds]) {
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    this.people = [];
    this.vehicles = [];
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    // tampons de recherche de chemin
    this.parent = new Int32Array(N);
    this.stamp = new Uint32Array(N);
    this.depth = new Uint16Array(N);
    this.queue = new Int32Array(N);
    this.gen = 1;
    this.spawnAcc = 0;
  }

  setWorld(world, sim) {
    this.world = world;
    this.sim = sim;
    this.people = [];
    this.vehicles = [];
    this.destinationVersion = -1;
    this.pavedCountCache = 0;
    this.householdCursor = 0;
  }

  /** Marche au hasard sur le réseau (BFS limité), renvoie un chemin de cases. */
  randomPath(start, paved, minLen, maxLen) {
    const w = this.world;
    const road = w.road;
    const ok = (i) => (paved ? isPavedRoad(road[i]) : road[i] > 0);
    if (!ok(start)) return null;
    const g = ++this.gen;
    let qh = 0, qt = 0;
    this.queue[qt++] = start;
    this.stamp[start] = g;
    this.parent[start] = -1;
    this.depth[start] = 0;
    const candidates = [];
    while (qh < qt) {
      const i = this.queue[qh++];
      const d = this.depth[i];
      if (d >= minLen) candidates.push(i);
      if (d >= maxLen) continue;
      const x = i % SIZE, z = (i / SIZE) | 0;
      const nb = [];
      if (x > 0) nb.push(i - 1);
      if (x < SIZE - 1) nb.push(i + 1);
      if (z > 0) nb.push(i - SIZE);
      if (z < SIZE - 1) nb.push(i + SIZE);
      for (const j of nb) {
        if (this.stamp[j] === g || !ok(j)) continue;
        this.stamp[j] = g;
        this.parent[j] = i;
        this.depth[j] = d + 1;
        this.queue[qt++] = j;
      }
    }
    if (!candidates.length) return null;
    let end = candidates[Math.floor(Math.random() * candidates.length)];
    const path = [];
    while (end !== -1) {
      path.push(end);
      end = this.parent[end];
    }
    path.reverse();
    return path;
  }

  refreshDestinations() {
    const w = this.world;
    if (this.destinationVersion !== w.version) {
      this.destinationVersion = w.version;
      this.destinations = [...w.buildings.values()];
      this.pavedTiles = [];
      for (let i = 0; i < N; i++) if (isPavedRoad(w.road[i])) this.pavedTiles.push(i);
      this.pavedCountCache = this.pavedTiles.length;
    }
  }

  spawnPerson() {
    const w = this.world;
    this.refreshDestinations();
    const houses = this.destinations.filter((b) => BUILDINGS[b.type]?.residents && b.residents >= 1 && b.cons?.k !== 'new');
    if (!houses.length) return;
    const cursor = this.householdCursor = (this.householdCursor || 0) + 1;
    const h = houses[cursor % houses.length], member = Math.floor(cursor / houses.length) % Math.min(4, Math.max(1, Math.floor(h.residents)));
    const identity = `${h.id}:${member}`;
    if (this.people.some((a) => a.identity === identity)) return;
    const hour = ((w.state.time.day % 1) + 1) % 1 * 24;
    const activity = dailyActivity(hour, member);
    if (!activity) return;
    const seed = (Math.imul(h.id + 1, 69069) + member * 593) >>> 0;
    const trip = planErrand(w, h, this.destinations, activity, seed);
    const starts = w.perimeter(h).filter((i) => w.road[i]);
    if (!starts.length) return;
    // When a service is missing, a resident may still take a short walk.
    const path = trip?.path || this.randomPath(starts[0], false, 2, 12);
    if (!path || path.length < 2) return;
    const family = w.state.city?.families?.find((f) => f.house === h.id);
    const kid = member === 0, long = member % 2 === 0;
    this.people.push(this.makeAgent(path, kid ? 0.48 : 0.35 + (seed % 10) * 0.008, (member % 2 ? -1 : 1) * 0.28, {
      identity, home: h.id, target: trip?.target || null, activity: trip?.activity || 'stroll',
      family: family?.family ?? null, visiting: false, returning: false, visitTime: 0,
      path, shirt: SHIRTS[seed % SHIRTS.length], skin: SKINS[seed % SKINS.length],
      look: { skin: SKINS[seed % SKINS.length], hair: [0x513925,0x9a6c41,0xc5aa73][seed % 3], pants: 0x425c70, long, kid,
        seed: seed % 997, model: kid ? (long ? 'casual_f' : 'casual_m') : member === 3 ? 'old_m' : long ? 'casual_f' : 'casual_m' },
    }));
  }

  spawnCar() {
    const w = this.world;
    const paved = this.pavedTiles || [];
    if (paved.length < 4) return;
    const start = paved[Math.floor(Math.random() * paved.length)];
    const path = this.randomPath(start, true, 4, 26);
    if (!path || path.length < 3) return;
    const kind = this.carKinds.length ? Math.floor(Math.random() * this.carKinds.length) : -1;
    this.vehicles.push(this.makeAgent(path, 1.1 + Math.random() * 0.4, 0.17, { paint: CARS[Math.floor(Math.random() * CARS.length)], kind }));
  }

  makeAgent(path, speed, lane, extra) {
    const w = this.world;
    const pts = [];
    for (let k = 0; k < path.length; k++) {
      const i = path[k];
      const x = (i % SIZE) + 0.5 - HALF, z = ((i / SIZE) | 0) + 0.5 - HALF;
      const j = k < path.length - 1 ? path[k + 1] : path[k - 1];
      let dx = (j % SIZE) - (i % SIZE), dz = ((j / SIZE) | 0) - ((i / SIZE) | 0);
      if (k === path.length - 1) {
        dx = -dx;
        dz = -dz;
      }
      // côté droit de la marche
      const rx = -dz, rz = dx;
      const t = w.terrain[i];
      const y = t === T.WATER || t === T.DEEP ? 0.11 : 0.03;
      pts.push([x + rx * lane, y, z + rz * lane]);
    }
    return { pts, seg: 0, t: 0, speed, fade: 0, ...extra };
  }

  update(dt, gameSpeed, night, population) {
    if (!this.world) return;
    const w = this.world;
    this.refreshDestinations();
    const move = gameSpeed > 0 ? Math.min(gameSpeed, 3) : 0;
    // nombre souhaité
    // promeneurs : enfants, retraités, flâneurs (les travailleurs sont suivis à part)
    const wantPeople = Math.min(this.maxPeople, Math.floor(population / 5) + (population > 0 ? 2 : 0)) * (night > 0.6 ? 0.25 : 1);
    const pavedCount = this.pavedCountCache ?? 0;
    const wantCars = Math.min(this.maxCars, Math.floor(pavedCount / 4), Math.floor(population / 8));
    this.spawnAcc += dt;
    if (this.spawnAcc > 0.25) {
      this.spawnAcc = 0;
      if (this.people.length < wantPeople && move > 0) this.spawnPerson();
      if (this.vehicles.length < wantCars && move > 0) this.spawnCar();
    }
    this.advancePeople(dt * move);
    this.advance(this.vehicles, dt * move);
    this.write(dt);
  }

  advancePeople(dt) {
    for (let k = this.people.length - 1; k >= 0; k--) {
      const a = this.people[k];
      if (!this.world.buildings.has(a.home) || a.target && !this.world.buildings.has(a.target)) { this.people.splice(k, 1); continue; }
      if (a.visiting) {
        a.visitTime += dt;
        if (a.visitTime < (a.activity === 'school' ? 9 : 4 + (a.look.seed % 5))) continue;
        a.visiting = false;
        a.returning = true;
        a.pts = a.pts.slice().reverse();
        a.seg = 0; a.t = 0;
      }
      a.t += a.speed * dt;
      while (a.t >= 1 && a.seg < a.pts.length - 2) { a.t -= 1; a.seg++; }
      if (a.seg >= a.pts.length - 2 && a.t >= 1) {
        if (a.returning) this.people.splice(k, 1);
        else { a.t = 1; a.visiting = true; a.visitTime = 0; }
      }
    }
  }

  advance(list, dt) {
    for (let k = list.length - 1; k >= 0; k--) {
      const a = list[k];
      // routes supprimées : on retire l'agent
      if (dt > 0) {
        a.t += (a.speed * dt) / 1;
        while (a.t >= 1) {
          a.t -= 1;
          a.seg++;
          if (a.seg >= a.pts.length - 1) break;
        }
      }
      if (a.seg >= a.pts.length - 1) list.splice(k, 1);
    }
  }

  write() {
    const d = this.dummy;
    // les promeneurs sont dessinés par les personnages articulés (People)
    this.bodies.count = 0;
    this.heads.count = 0;
    let c = 0;
    const counts = this.carKinds.map(() => 0);
    for (const a of this.vehicles) {
      if (c >= this.maxCars) break;
      const p0 = a.pts[a.seg], p1 = a.pts[a.seg + 1];
      const x = p0[0] + (p1[0] - p0[0]) * a.t, y = p0[1] + (p1[1] - p0[1]) * a.t, z = p0[2] + (p1[2] - p0[2]) * a.t;
      d.position.set(x, y, z);
      d.rotation.set(0, Math.atan2(p1[0] - p0[0], p1[2] - p0[2]), 0);
      d.updateMatrix();
      if (a.kind >= 0 && this.carKinds[a.kind]) {
        this.carKinds[a.kind].setMatrixAt(counts[a.kind]++, d.matrix);
      } else {
        this.cars.setMatrixAt(c, d.matrix);
        this.cars.setColorAt(c, this.color.setHex(a.paint));
      }
      c++;
    }
    this.cars.count = this.carKinds.length ? 0 : c;
    this.carKinds.forEach((m, k) => (m.count = counts[k]));
    for (const m of [this.bodies, this.heads, this.cars, ...this.carKinds]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Après une modification des routes, on supprime les agents dont le trajet est coupé. */
  validate() {
    const road = this.world.road;
    const check = (list, paved) => {
      for (let k = list.length - 1; k >= 0; k--) {
        const a = list[k];
        if (a.path && a.path.some((i) => !road[i])) { list.splice(k, 1); continue; }
        // on vérifie la case suivante
        const p = a.pts[Math.min(a.seg + 1, a.pts.length - 1)];
        const tx = Math.floor(p[0] + HALF), tz = Math.floor(p[2] + HALF);
        const i = tz * SIZE + tx;
        if (tx < 0 || tz < 0 || tx >= SIZE || tz >= SIZE || (paved ? !isPavedRoad(road[i]) : !road[i])) list.splice(k, 1);
      }
    };
    check(this.people, false);
    check(this.vehicles, true);
  }
}
