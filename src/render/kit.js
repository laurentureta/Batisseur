// Modèles 3D importés (packs KayKit et Kenney, licence CC0) : lecture de assets/models.bin
// et ajout des modèles dans les géométries du jeu (couleurs, occlusion, variantes, neige).
import { GeoBuilder } from './geom.js';

const LUT = new Float32Array(256); // sRGB 8 bits -> linéaire
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export const KIT_BYTES = 6_000_000; // taille approximative (barre de chargement si le serveur ne la donne pas)

let MODELS = null;
let BUF = null;
let BASE = 0;

export function kitReady() {
  return !!MODELS;
}

/** Télécharge et prépare le fichier des modèles. onProgress(0..1) */
export async function loadKit(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Modèles introuvables (' + res.status + ')');
  const total = +res.headers.get('content-length') || KIT_BYTES;
  let buf;
  if (res.body && res.body.getReader && onProgress) {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress(Math.min(0.99, got / total));
    }
    const all = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) {
      all.set(c, o);
      o += c.length;
    }
    buf = all.buffer;
  } else buf = await res.arrayBuffer();
  parseKit(buf);
  onProgress?.(1);
}

export function parseKit(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'BTSR') throw new Error('Fichier de modèles invalide');
  const len = dv.getUint32(8, true);
  const json = new TextDecoder().decode(new Uint8Array(buf, 12, len));
  MODELS = JSON.parse(json).models;
  BUF = buf;
  BASE = 12 + len;
}

export function kitHas(name) {
  return !!MODELS?.[name];
}

export function kitInfo(name) {
  return MODELS?.[name] || null;
}

/** Boîte englobante [x0, y0, z0, x1, y1, z1] du modèle. */
export function kitBox(name) {
  return MODELS?.[name]?.bb || [-0.5, 0, -0.5, 0.5, 1, 0.5];
}

function decode(name) {
  const m = MODELS[name];
  if (m._d) return m._d;
  const q = new Int16Array(BUF, BASE + m.pos, m.v * 3);
  const [x0, y0, z0, x1, y1, z1] = m.bb;
  const sx = (x1 - x0) / 65535, sy = (y1 - y0) / 65535, sz = (z1 - z0) / 65535;
  const pos = new Float32Array(m.v * 3);
  for (let i = 0; i < m.v; i++) {
    pos[i * 3] = x0 + (q[i * 3] + 32768) * sx;
    pos[i * 3 + 1] = y0 + (q[i * 3 + 1] + 32768) * sy;
    pos[i * 3 + 2] = z0 + (q[i * 3 + 2] + 32768) * sz;
  }
  const nq = new Int8Array(BUF, BASE + m.nor, m.v * 3);
  const nor = new Float32Array(m.v * 3);
  for (let i = 0; i < m.v * 3; i++) nor[i] = nq[i] / 127;
  const ao = new Uint8Array(BUF, BASE + m.ao, m.v);
  const cols = m.col.map((off) => new Uint8Array(BUF, BASE + off, m.v * 3));
  const idx = m.i32 ? new Uint32Array(BUF, BASE + m.idx, m.t * 3) : new Uint16Array(BUF, BASE + m.idx, m.t * 3);
  // sommets « couleur d'équipe » (toits, bannières) : ils changent d'une variante à l'autre
  let team = null, teamLum = 0.2;
  if (cols.length > 1) {
    team = new Uint8Array(m.v);
    let sum = 0, n = 0;
    const a = cols[0], b = cols[1];
    for (let i = 0; i < m.v; i++) {
      const k = i * 3;
      if (a[k] !== b[k] || a[k + 1] !== b[k + 1] || a[k + 2] !== b[k + 2]) {
        team[i] = 1;
        sum += 0.2126 * LUT[a[k]] + 0.7152 * LUT[a[k + 1]] + 0.0722 * LUT[a[k + 2]];
        n++;
      }
    }
    if (n) teamLum = sum / n;
  }
  m._d = { pos, nor, ao, cols, idx, team, teamLum };
  return m._d;
}

const ROOF_COLORS = { blue: 0, red: 1, green: 2, yellow: 3 };

function variantIndex(m, v) {
  if (v == null) return 0;
  if (typeof v === 'number') return ((v % m.col.length) + m.col.length) % m.col.length;
  const k = m.vars.indexOf(v);
  return k >= 0 ? k : 0;
}

function hexLin(hex) {
  return [LUT[(hex >> 16) & 255], LUT[(hex >> 8) & 255], LUT[hex & 255]];
}

/**
 * Ajoute un modèle importé dans le constructeur de géométrie g (avec sa pile de transformations).
 * o : { x, y, z, rot (radians), s, sx, sy, sz, variant (index ou 'blue'...), team (couleur hex de toit),
 *       ao (force de l'occlusion), snow (0..1), tint ([r,g,b] multiplicateur), dim (zone verrouillée),
 *       noGlass, out (pour récupérer pièces mobiles et cheminées), spin (vitesse des pièces) }
 */
export function kit(g, name, o = {}) {
  const m = MODELS?.[name];
  if (!m) return false;
  const d = decode(name);
  const s = o.s ?? 1;
  const sx = (o.sx ?? 1) * s, sy = (o.sy ?? 1) * s, sz = (o.sz ?? 1) * s;
  const rot = o.rot ?? 0;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const ox = o.x ?? 0, oy = o.y ?? 0, oz = o.z ?? 0;
  const gc = g.c, gs = g.s, gtx = g.tx, gty = g.ty, gtz = g.tz;
  const col = d.cols[variantIndex(m, o.variant)];
  const aoK = o.ao ?? 0.6;
  const snow = o.snow || 0;
  const tint = o.tint || null;
  const team = o.team != null && d.team ? hexLin(o.team) : null;
  const teamLum = d.teamLum;
  const dim = !!o.dim;
  const mirror = sx * sy * sz < 0;
  const { pos, nor, ao, idx } = d;
  const inx = 1 / sx, iny = 1 / sy, inz = 1 / sz;
  const layers = [[g.body, 0, m.g], [o.noGlass ? g.body : g.glass, m.g, m.t]];
  const cut = o.cutAbove ?? Infinity;
  for (const [L, t0, t1] of layers) {
    if (t1 <= t0) continue;
    const P = L.pos, Nn = L.nor, C = L.col;
    for (let t = t0; t < t1; t++) {
      if (cut < Infinity && pos[idx[t * 3] * 3 + 1] > cut && pos[idx[t * 3 + 1] * 3 + 1] > cut && pos[idx[t * 3 + 2] * 3 + 1] > cut) continue;
      for (let k = 0; k < 3; k++) {
        const i = idx[t * 3 + (mirror ? 2 - k : k)];
        const i3 = i * 3;
        // position : échelle, rotation propre, décalage, puis pile du constructeur
        const px = pos[i3] * sx, py = pos[i3 + 1] * sy, pz = pos[i3 + 2] * sz;
        const rx = px * cr + pz * sr + ox, ry = py + oy, rz = -px * sr + pz * cr + oz;
        P.push(rx * gc + rz * gs + gtx, ry + gty, -rx * gs + rz * gc + gtz);
        // normale
        let nx = nor[i3] * inx, ny = nor[i3 + 1] * iny, nz = nor[i3 + 2] * inz;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
        const qx = nx * cr + nz * sr, qz = -nx * sr + nz * cr;
        Nn.push(qx * gc + qz * gs, ny, -qx * gs + qz * gc);
        // couleur
        let r, gg, b;
        if (team && d.team[i]) {
          const lum = (0.2126 * LUT[col[i3]] + 0.7152 * LUT[col[i3 + 1]] + 0.0722 * LUT[col[i3 + 2]]) / teamLum;
          const f = Math.min(1.6, Math.max(0.35, lum));
          r = team[0] * f;
          gg = team[1] * f;
          b = team[2] * f;
        } else {
          r = LUT[col[i3]];
          gg = LUT[col[i3 + 1]];
          b = LUT[col[i3 + 2]];
        }
        const a = 1 - aoK * (1 - ao[i] / 255);
        r *= a;
        gg *= a;
        b *= a;
        if (tint) {
          r *= tint[0];
          gg *= tint[1];
          b *= tint[2];
        }
        if (snow > 0 && ny > 0.45) {
          const f = snow * Math.min(1, (ny - 0.45) / 0.3);
          r += (0.86 * a - r) * f;
          gg += (0.9 * a - gg) * f;
          b += (0.95 * a - b) * f;
        }
        if (dim) {
          const lm = 0.3 * r + 0.59 * gg + 0.11 * b;
          r = (r * 0.45 + lm * 0.55) * 0.36;
          gg = (gg * 0.45 + lm * 0.55) * 0.36;
          b = (b * 0.45 + lm * 0.55) * 0.36;
        }
        C.push(r, gg, b);
      }
    }
  }
  // pièces mobiles et cheminées
  const out = o.out;
  if (out) {
    const tr = (x, y, z) => {
      const px = x * sx, py = y * sy, pz = z * sz;
      const rx = px * cr + pz * sr + ox, ry = py + oy, rz = -px * sr + pz * cr + oz;
      return [rx * gc + rz * gs + gtx, ry + gty, -rx * gs + rz * gc + gtz];
    };
    for (const e of m.emit) out.emitters.push({ pos: tr(e[0], e[1], e[2]), kind: o.emit || 'smoke' });
    for (const p of m.parts) {
      const pg = new GeoBuilder();
      // la pièce garde l'orientation du modèle (rotation propre + rotation du constructeur)
      const ang = rot + Math.atan2(gs, gc);
      kit(pg, p.id, { ...o, x: 0, y: 0, z: 0, rot: ang, out: null });
      const v = [0, 0, 0];
      v[p.axis === 'x' ? 0 : p.axis === 'y' ? 1 : 2] = 1;
      const ax = v[0] * Math.cos(ang) + v[2] * Math.sin(ang), az = -v[0] * Math.sin(ang) + v[2] * Math.cos(ang);
      let axis = p.axis === 'y' ? 'y' : Math.abs(ax) > Math.abs(az) ? 'x' : 'z';
      const sign = axis === 'y' ? 1 : Math.sign(axis === 'x' ? ax : az) || 1;
      out.parts.push({
        body: pg.body, glass: pg.glass, pivot: tr(p.pivot[0], p.pivot[1], p.pivot[2]),
        axis, kind: 'spin', speed: (o.spin ?? 1.2) * sign,
      });
    }
  }
  return true;
}

/** Point le plus haut du modèle (pour placer une fumée de cheminée). */
export function kitTop(name, below = Infinity) {
  const m = MODELS?.[name];
  if (!m) return [0, 1, 0];
  const d = decode(name);
  let best = -Infinity;
  for (let i = 0; i < m.v; i++) {
    const y = d.pos[i * 3 + 1];
    if (y > best && y < below) best = y;
  }
  let sx = 0, sz = 0, n = 0;
  for (let i = 0; i < m.v; i++) {
    if (d.pos[i * 3 + 1] > best - 0.02 && d.pos[i * 3 + 1] < below) {
      sx += d.pos[i * 3];
      sz += d.pos[i * 3 + 2];
      n++;
    }
  }
  return [sx / n, best, sz / n];
}

/** Demi-largeurs (x, z) du modèle dans une tranche de hauteur [y0, y1], autour du centre de sa boîte. */
export function kitExtent(name, y0, y1) {
  const m = MODELS?.[name];
  if (!m) return [0.3, 0.3];
  const d = decode(name);
  const [bx0, , bz0, bx1, , bz1] = m.bb;
  const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
  let ex = 0, ez = 0;
  for (let i = 0; i < m.v; i++) {
    const y = d.pos[i * 3 + 1];
    if (y < y0 || y > y1) continue;
    ex = Math.max(ex, Math.abs(d.pos[i * 3] - cx));
    ez = Math.max(ez, Math.abs(d.pos[i * 3 + 2] - cz));
  }
  return [ex, ez];
}

/** Échelle et décalage pour faire tenir un modèle dans une emprise w × d (centré). */
export function kitFit(name, w, d, { margin = 0.06, maxS = 3, minS = 0.05, rot = 0 } = {}) {
  const [x0, , z0, x1, , z1] = kitBox(name);
  let bw = x1 - x0, bd = z1 - z0;
  if (Math.abs(Math.sin(rot)) > 0.7) [bw, bd] = [bd, bw];
  const s = Math.max(minS, Math.min(maxS, (w - margin * 2) / bw, (d - margin * 2) / bd));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // centre après rotation
  const c = Math.cos(rot), sn = Math.sin(rot);
  return { s, x: -(cx * c + cz * sn) * s, z: -(-cx * sn + cz * c) * s };
}

export { ROOF_COLORS };
