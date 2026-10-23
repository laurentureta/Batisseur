// Gestes des habitants sur les vrais modèles animés.
// La pose de base vient des animations du modèle (marche, porter, repos, courir, cueillir, fête…).
// Les gestes des métiers (hache, houe, marteau, pelle, canne à pêche…) sont calculés par pose()
// dans People.js sous forme d'angles (bras, buste, jambes, tête, accroupi) et appliqués ici aux os :
// les bras sont orientés vers la direction voulue, le buste penché, les jambes pliées pour que les
// pieds restent au sol quand on s'accroupit ou qu'on s'agenouille.
import { Q } from './creatures.js';

const TAU = Math.PI * 2;
const v3 = [0, 0, 0], v3b = [0, 0, 0];

/** Rotation la plus courte qui amène le vecteur unitaire a sur b → out (x, y, z, w). */
function fromTo(ax, ay, az, bx, by, bz, out) {
  let d = ax * bx + ay * by + az * bz;
  if (d < -0.9999) {
    // demi-tour : axe quelconque perpendiculaire
    let x = 0, y = -az, z = ay;
    if (Math.abs(ax) > 0.9) (x = -az), (y = 0), (z = ax);
    const l = Math.hypot(x, y, z) || 1;
    out[0] = x / l;
    out[1] = y / l;
    out[2] = z / l;
    out[3] = 0;
    return out;
  }
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  const w = 1 + d;
  const l = Math.hypot(cx, cy, cz, w);
  out[0] = cx / l;
  out[1] = cy / l;
  out[2] = cz / l;
  out[3] = w / l;
  return out;
}

export class HumanPoser {
  constructor(lib) {
    const sk = (this.skel = lib.skels.human);
    this.ok = !!sk;
    if (!sk) return;
    const b = (n) => sk.bone(n);
    this.B = {
      root: b('Bone'), body: b('Body_1'), hips: b('Hips'), abdomen: b('Abdomen'), torso: b('Torso'), neck: b('Neck'), head: b('Head'),
      // côté +x du modèle (« R » des anciens gestes) et côté −x (« L »)
      shP: b('ShoulderL'), uaP: b('UpperArmL'), laP: b('LowerArmL'), fistP: b('FistL'),
      shN: b('ShoulderR'), uaN: b('UpperArmR'), laN: b('LowerArmR'), fistN: b('FistR'),
      ulP: b('UpperLegL'), llP: b('LowerLegL'), footP: b('FootL'),
      ulN: b('UpperLegR'), llN: b('LowerLegR'), footN: b('FootR'),
    };
    this.clips = {};
    for (const n of ['idle', 'walk', 'run', 'carry', 'runCarry', 'pickup', 'cheer', 'sit', 'sad']) this.clips[n] = lib.clip('human', n);
    this.q = [0, 0, 0, 1];
    // mesures au repos (repère du modèle)
    this.rigRest = null;
  }

  /** Longueurs des membres et attaches des pieds, mesurées une fois sur la pose de repos. */
  measure(rig) {
    if (this.rest) return;
    const B = this.B;
    rig.rest();
    rig.hook = null;
    rig.forward();
    const P = (i) => [rig.wp[i * 3], rig.wp[i * 3 + 1], rig.wp[i * 3 + 2]];
    const dist = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
    // le pied suit le bas de la jambe : attache relative mesurée sur l'animation de repos
    if (this.clips.idle) rig.fromClip(this.clips.idle, 0);
    rig.forward();
    const foot = (ll, ft) => {
      const lq = [rig.wq[ll * 4], rig.wq[ll * 4 + 1], rig.wq[ll * 4 + 2], rig.wq[ll * 4 + 3]];
      const inv = [-lq[0], -lq[1], -lq[2], lq[3]];
      const rq = [0, 0, 0, 1];
      Q.mul(rq, 0, inv[0], inv[1], inv[2], inv[3], rig.wq[ft * 4], rig.wq[ft * 4 + 1], rig.wq[ft * 4 + 2], rig.wq[ft * 4 + 3]);
      const d = [rig.wp[ft * 3] - rig.wp[ll * 3], rig.wp[ft * 3 + 1] - rig.wp[ll * 3 + 1], rig.wp[ft * 3 + 2] - rig.wp[ll * 3 + 2]];
      const rp = Q.rot(inv[0], inv[1], inv[2], inv[3], d[0], d[1], d[2], [0, 0, 0]);
      return { q: rq, p: rp, s: rig.ws[ll] };
    };
    this.footP = foot(B.llP, B.footP);
    this.footN = foot(B.llN, B.footN);
    this.L1 = dist(P(B.ulP), P(B.llP));
    this.L2 = dist(P(B.llP), P(B.footP));
    this.footY = Math.min(rig.wp[B.footP * 3 + 1], rig.wp[B.footN * 3 + 1]);
    this.rest = true;
  }

  /**
   * Pose complète d'une figure : f (figure de People.js), P (angles des gestes), time (s).
   * Remplit rig puis appelle rig.forward().
   */
  pose(rig, f, P, time) {
    this.measure(rig);
    const C = this.clips, B = this.B;
    const anim = f.anim || 'idle';
    const loaded = !!f.load;
    let base = 'idle', bt = time * 0.92 + (f.seed || 0) * 0.37, arms = 0, legs = false, armOnlyP = false;
    switch (anim) {
      case 'walk':
      case 'carryLogs':
      case 'carryFront':
      case 'push':
      case 'carryTray': {
        const ph = f.phase || 0;
        const run = !!f.run;
        base = run ? (anim === 'carryFront' || anim === 'push' ? 'runCarry' : 'run') : anim === 'carryFront' || anim === 'push' ? 'carry' : 'walk';
        const clip = C[base] || C.walk;
        bt = (ph / TAU) * clip.dur * (run ? 0.62 : 1);
        if (anim === 'carryLogs' || anim === 'carryTray') armOnlyP = true;
        break;
      }
      case 'cheer':
        base = 'cheer';
        bt = f.t || 0;
        break;
      case 'pickup':
        base = 'pickup';
        bt = Math.min(1, (f.t || 0) / Math.max(0.2, f.dur || 0.8)) * (C.pickup?.dur || 1);
        break;
      case 'row':
      case 'rowRest':
      case 'sitChat':
        // assis (fin de l'animation « s'asseoir »), les bras font le geste
        base = 'sit';
        bt = 10;
        arms = anim === 'sitChat' ? 0 : 1;
        armOnlyP = anim === 'sitChat';
        break;
      case 'idle':
        break;
      case 'chat':
        armOnlyP = true;
        break;
      default:
        // un geste de métier : bras, buste et parfois jambes viennent des angles
        arms = 1;
        legs = !!(P.legL || P.legR || P.crouch > 0.002);
    }
    const clip = C[base] || C.idle;
    if (clip) rig.fromClip(clip, bt);
    else rig.rest();
    if (anim === 'climb') legs = true;

    // préparation des réglages pour le passage os par os
    const tilt = arms ? P.tilt || 0 : 0;
    const crouch = legs ? Math.max(0, P.crouch || 0) * 0.85 : 0;
    const look = P.look || 0;
    const self = this;
    const qa = this.q;
    rig.hook = (r, i) => {
      const p = r.skel.parent[i];
      if (i === B.body && crouch) {
        r.lt[i * 3 + 1] -= crouch / (p >= 0 ? r.ws[p] : r.skel.rootS[i]);
        return;
      }
      if (i === B.abdomen || i === B.torso) {
        if (!tilt) return;
        self.rotWorld(r, i, 1, 0, 0, tilt * (i === B.abdomen ? 0.6 : 0.4));
        return;
      }
      if (i === B.head) {
        if (look) self.rotWorld(r, i, 0, 1, 0, look * 0.8);
        return;
      }
      const sideP = i === B.uaP, sideN = i === B.uaN;
      if ((sideP || sideN) && (arms || (armOnlyP && sideP))) {
        const ax = sideP ? P.armR : P.armL;
        const az = sideP ? P.armSpread || 0 : -(P.armSpread || 0);
        // direction du bras dans le repère du buste penché
        const ca = Math.cos(ax), sa = Math.sin(ax), cz = Math.cos(az), sz = Math.sin(az);
        let dx = sz * ca, dy = -cz * ca, dz = -sa;
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        const y2 = dy * ct - dz * st, z2 = dy * st + dz * ct;
        dy = y2;
        dz = z2;
        self.aim(r, i, dx, dy, dz, 1);
        return;
      }
      if ((i === B.laP || i === B.laN) && arms) {
        // coude presque tendu pendant les gestes (outils à deux mains)
        self.blendRest(r, i, 0.55);
        return;
      }
      if (legs && (i === B.ulP || i === B.ulN)) {
        const a = i === B.ulP ? P.legR : P.legL;
        self.aim(r, i, 0, -Math.cos(a), -Math.sin(a), 1);
        return;
      }
      if (legs && (i === B.llP || i === B.llN)) {
        const a = i === B.llP ? P.legR : P.legL;
        let c;
        if (anim === 'climb') c = a + 1.1;
        else {
          // le genou se plie pour que le pied touche le sol
          const kx = r.wp[p * 3], ky = r.wp[p * 3 + 1], kz = r.wp[p * 3 + 2];
          Q.rot(r.wq[p * 4], r.wq[p * 4 + 1], r.wq[p * 4 + 2], r.wq[p * 4 + 3], r.lt[i * 3] * r.ws[p], r.lt[i * 3 + 1] * r.ws[p], r.lt[i * 3 + 2] * r.ws[p], v3);
          const knee = ky + v3[1];
          void kx;
          void kz;
          const h = knee - self.footY;
          if (h >= self.L2 * 0.995) c = a + 0.05;
          else {
            const c0 = Math.acos(Math.max(-1, Math.min(1, h / self.L2)));
            c = a < -0.4 && -c0 - a >= 0 ? -c0 : c0;
          }
        }
        self.aim(r, i, 0, -Math.cos(c), -Math.sin(c), 1);
        return;
      }
      void qa;
    };
    rig.forward();
    rig.hook = null;
    // les pieds suivent les jambes quand celles-ci sont pliées à la main
    if (legs) {
      this.attachFoot(rig, B.llP, B.footP, this.footP);
      this.attachFoot(rig, B.llN, B.footN, this.footN);
    }
  }

  /** Tourne un os (et ses enfants) autour d'un axe du modèle, en modifiant sa rotation locale. */
  rotWorld(r, i, axx, axy, axz, ang) {
    const p = r.skel.parent[i];
    const pq = p >= 0 ? [r.wq[p * 4], r.wq[p * 4 + 1], r.wq[p * 4 + 2], r.wq[p * 4 + 3]] : [r.skel.rootQ[i * 4], r.skel.rootQ[i * 4 + 1], r.skel.rootQ[i * 4 + 2], r.skel.rootQ[i * 4 + 3]];
    const s = Math.sin(ang / 2), c = Math.cos(ang / 2);
    // local' = inv(P) * R * P * local
    const t = [0, 0, 0, 1], u = [0, 0, 0, 1];
    Q.mul(t, 0, axx * s, axy * s, axz * s, c, pq[0], pq[1], pq[2], pq[3]);
    Q.mul(u, 0, -pq[0], -pq[1], -pq[2], pq[3], t[0], t[1], t[2], t[3]);
    const l = r.lq, o = i * 4;
    Q.mul(t, 0, u[0], u[1], u[2], u[3], l[o], l[o + 1], l[o + 2], l[o + 3]);
    l[o] = t[0];
    l[o + 1] = t[1];
    l[o + 2] = t[2];
    l[o + 3] = t[3];
  }

  /** Oriente l'os i (axe +Y de l'os) vers la direction voulue (repère du modèle), poids w. */
  aim(r, i, dx, dy, dz, w) {
    const p = r.skel.parent[i];
    const pq = p >= 0 ? [r.wq[p * 4], r.wq[p * 4 + 1], r.wq[p * 4 + 2], r.wq[p * 4 + 3]] : [r.skel.rootQ[i * 4], r.skel.rootQ[i * 4 + 1], r.skel.rootQ[i * 4 + 2], r.skel.rootQ[i * 4 + 3]];
    const l = r.lq, o = i * 4;
    const W = [0, 0, 0, 1];
    Q.mul(W, 0, pq[0], pq[1], pq[2], pq[3], l[o], l[o + 1], l[o + 2], l[o + 3]);
    Q.rot(W[0], W[1], W[2], W[3], 0, 1, 0, v3b);
    const dl = Math.hypot(dx, dy, dz) || 1;
    let tx = dx / dl, ty = dy / dl, tz = dz / dl;
    if (w < 1) {
      tx = v3b[0] + (tx - v3b[0]) * w;
      ty = v3b[1] + (ty - v3b[1]) * w;
      tz = v3b[2] + (tz - v3b[2]) * w;
      const k = Math.hypot(tx, ty, tz) || 1;
      tx /= k;
      ty /= k;
      tz /= k;
    }
    const d = fromTo(v3b[0], v3b[1], v3b[2], tx, ty, tz, this.q);
    const N = [0, 0, 0, 1], L = [0, 0, 0, 1];
    Q.mul(N, 0, d[0], d[1], d[2], d[3], W[0], W[1], W[2], W[3]);
    Q.mul(L, 0, -pq[0], -pq[1], -pq[2], pq[3], N[0], N[1], N[2], N[3]);
    l[o] = L[0];
    l[o + 1] = L[1];
    l[o + 2] = L[2];
    l[o + 3] = L[3];
  }

  /** Rapproche la rotation locale de l'os de celle du repos (bras tendu). */
  blendRest(r, i, w) {
    const l = r.lq, o = i * 4, rq = r.skel.restQ;
    let x = rq[o], y = rq[o + 1], z = rq[o + 2], ww = rq[o + 3];
    if (l[o] * x + l[o + 1] * y + l[o + 2] * z + l[o + 3] * ww < 0) (x = -x), (y = -y), (z = -z), (ww = -ww);
    const a = l[o] + (x - l[o]) * w, b = l[o + 1] + (y - l[o + 1]) * w, c = l[o + 2] + (z - l[o + 2]) * w, d = l[o + 3] + (ww - l[o + 3]) * w;
    const k = 1 / Math.hypot(a, b, c, d);
    l[o] = a * k;
    l[o + 1] = b * k;
    l[o + 2] = c * k;
    l[o + 3] = d * k;
  }

  attachFoot(r, ll, ft, rel) {
    const q = [r.wq[ll * 4], r.wq[ll * 4 + 1], r.wq[ll * 4 + 2], r.wq[ll * 4 + 3]];
    Q.mul(r.wq, ft * 4, q[0], q[1], q[2], q[3], rel.q[0], rel.q[1], rel.q[2], rel.q[3]);
    const k = r.ws[ll] / rel.s;
    Q.rot(q[0], q[1], q[2], q[3], rel.p[0] * k, rel.p[1] * k, rel.p[2] * k, v3);
    r.wp[ft * 3] = r.wp[ll * 3] + v3[0];
    r.wp[ft * 3 + 1] = r.wp[ll * 3 + 1] + v3[1];
    r.wp[ft * 3 + 2] = r.wp[ll * 3 + 2] + v3[2];
  }
}
