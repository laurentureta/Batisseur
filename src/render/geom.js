// Construction de géométries low-poly : sommets non partagés, normales par face, couleurs par sommet.
// Deux calques : "body" (murs, toits...) et "glass" (fenêtres qui s'allument la nuit).

const linCache = new Map();
function s2l(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
/** Couleur hexadécimale sRGB -> [r, g, b] linéaire (ce qu'attend Three.js). */
export function hexToLin(hex) {
  let v = linCache.get(hex);
  if (!v) {
    v = [s2l(((hex >> 16) & 255) / 255), s2l(((hex >> 8) & 255) / 255), s2l((hex & 255) / 255)];
    linCache.set(hex, v);
  }
  return v;
}

/** Éclaircit (f > 1) ou assombrit (f < 1) une couleur. */
export function shade(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/** Mélange deux couleurs. */
export function mix(a, b, t) {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

export class Layer {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
  }
  get count() {
    return this.pos.length / 3;
  }
}

const ICO_T = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0],
  [0, -1, ICO_T], [0, 1, ICO_T], [0, -1, -ICO_T], [0, 1, -ICO_T],
  [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1],
].map(([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
});
const ICO_F = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
  3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
];

export class GeoBuilder {
  constructor() {
    this.body = new Layer();
    this.glass = new Layer();
    this.cur = this.body;
    this.stack = [];
    this.c = 1;
    this.s = 0;
    this.tx = 0;
    this.ty = 0;
    this.tz = 0;
    this.tint = null; // fonction optionnelle appliquée aux couleurs
  }

  layer(name) {
    this.cur = name === 'glass' ? this.glass : this.body;
    return this;
  }

  /** Empile une transformation locale (rotation Y puis translation). */
  push(rotY = 0, x = 0, y = 0, z = 0) {
    this.stack.push([this.c, this.s, this.tx, this.ty, this.tz]);
    const cr = Math.cos(rotY), sr = Math.sin(rotY);
    const c = this.c, s = this.s;
    const ntx = x * c + z * s + this.tx;
    const ntz = -x * s + z * c + this.tz;
    this.c = c * cr - s * sr;
    this.s = s * cr + c * sr;
    this.tx = ntx;
    this.ty += y;
    this.tz = ntz;
    return this;
  }

  pop() {
    const t = this.stack.pop();
    if (t) [this.c, this.s, this.tx, this.ty, this.tz] = t;
    return this;
  }

  _v(x, y, z) {
    return [x * this.c + z * this.s + this.tx, y + this.ty, -x * this.s + z * this.c + this.tz];
  }

  tri(a, b, c, color) {
    a = this._v(a[0], a[1], a[2]);
    b = this._v(b[0], b[1], b[2]);
    c = this._v(c[0], c[1], c[2]);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const col = hexToLin(this.tint ? this.tint(color) : color);
    const L = this.cur;
    L.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    L.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    L.col.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
  }

  quad(a, b, c, d, color) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /**
   * Pavé : centre (x, z), base à la hauteur y.
   * colors : couleur unique, ou { top, side, front, back, left, right, bottom }
   */
  box(x, y, z, w, h, d, colors, bottom = false) {
    const top = typeof colors === 'object' ? colors.top ?? colors.side : colors;
    const side = typeof colors === 'object' ? colors.side ?? colors.top : colors;
    const front = typeof colors === 'object' ? colors.front ?? side : colors;
    const back = typeof colors === 'object' ? colors.back ?? side : colors;
    const left = typeof colors === 'object' ? colors.left ?? side : colors;
    const right = typeof colors === 'object' ? colors.right ?? side : colors;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y0 = y, y1 = y + h;
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], front);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], back);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], right);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], left);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], typeof colors === 'object' ? colors.bottom ?? side : colors);
    return this;
  }

  /**
   * Toit : base w (x) × d (z) à la hauteur y, faîtage le long de x de longueur `ridge`.
   * ridge = w -> toit à deux pans ; ridge = 0 -> pyramide. endColor = couleur des pignons.
   */
  roof(x, y, z, w, d, h, ridge, color, endColor) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const r0 = x - ridge / 2, r1 = x + ridge / 2, yt = y + h;
    const ec = endColor ?? color;
    if (ridge > 0.0001) {
      this.quad([x0, y, z1], [x1, y, z1], [r1, yt, z], [r0, yt, z], color);
      this.quad([x1, y, z0], [x0, y, z0], [r0, yt, z], [r1, yt, z], color);
    } else {
      this.tri([x0, y, z1], [x1, y, z1], [x, yt, z], color);
      this.tri([x1, y, z0], [x0, y, z0], [x, yt, z], color);
    }
    const endsColor = ridge >= w - 0.0001 ? ec : color;
    this.tri([x1, y, z1], [x1, y, z0], [r1, yt, z], endsColor);
    this.tri([x0, y, z0], [x0, y, z1], [r0, yt, z], endsColor);
    return this;
  }

  /** Toit à deux pans dont le faîtage suit l'axe z. */
  roofZ(x, y, z, w, d, h, ridge, color, endColor) {
    this.push(Math.PI / 2, x, 0, z);
    this.roof(0, y, 0, d, w, h, ridge, color, endColor);
    this.pop();
    return this;
  }

  /** Cylindre vertical (rTop pour un tronc de cône). */
  cyl(x, y, z, r, h, seg, color, rTop = r, caps = true, topColor) {
    const p = (a, rad, yy) => [x + rad * Math.cos(a), yy, z + rad * Math.sin(a)];
    const step = (Math.PI * 2) / seg;
    for (let k = 0; k < seg; k++) {
      const a0 = k * step, a1 = (k + 1) * step;
      this.quad(p(a1, r, y), p(a0, r, y), p(a0, rTop, y + h), p(a1, rTop, y + h), color);
      if (caps && rTop > 0.0001) this.tri([x, y + h, z], p(a1, rTop, y + h), p(a0, rTop, y + h), topColor ?? color);
    }
    return this;
  }

  /** Cône vertical. */
  cone(x, y, z, r, h, seg, color) {
    const p = (a) => [x + r * Math.cos(a), y, z + r * Math.sin(a)];
    const step = (Math.PI * 2) / seg;
    for (let k = 0; k < seg; k++) {
      const a0 = k * step, a1 = (k + 1) * step;
      this.tri(p(a1), p(a0), [x, y + h, z], color);
    }
    return this;
  }

  /** Cylindre couché le long de l'axe x. */
  cylX(x, y, z, r, len, seg, color, capColor) {
    const x0 = x - len / 2, x1 = x + len / 2;
    const p = (a, xx) => [xx, y + r * Math.cos(a), z + r * Math.sin(a)];
    const step = (Math.PI * 2) / seg;
    for (let k = 0; k < seg; k++) {
      const a0 = k * step, a1 = (k + 1) * step;
      this.quad(p(a1, x0), p(a1, x1), p(a0, x1), p(a0, x0), color);
      this.tri([x1, y, z], p(a0, x1), p(a1, x1), capColor ?? color);
      this.tri([x0, y, z], p(a1, x0), p(a0, x0), capColor ?? color);
    }
    return this;
  }

  /** Cylindre couché le long de l'axe z. */
  cylZ(x, y, z, r, len, seg, color, capColor) {
    this.push(Math.PI / 2, x, 0, z);
    this.cylX(0, y, 0, r, len, seg, color, capColor);
    this.pop();
    return this;
  }

  /** Sphère low-poly (icosaèdre), aplatie avec sy, déformée avec jitter. */
  ico(x, y, z, r, color, sy = 1, jitter = 0, seed = 1) {
    const verts = ICO_V.map((v, k) => {
      let j = 1;
      if (jitter) {
        const f = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
        j = 1 + (f - Math.floor(f) - 0.5) * jitter;
      }
      return [x + v[0] * r * j, y + v[1] * r * sy * j, z + v[2] * r * j];
    });
    for (let f = 0; f < ICO_F.length; f += 3) this.tri(verts[ICO_F[f]], verts[ICO_F[f + 1]], verts[ICO_F[f + 2]], color);
    return this;
  }

  /** Dôme (demi-sphère) posé à la hauteur y. */
  dome(x, y, z, r, color, seg = 10, rings = 3, sy = 1) {
    const step = (Math.PI * 2) / seg;
    for (let k = 0; k < rings; k++) {
      const t0 = (k / rings) * (Math.PI / 2), t1 = ((k + 1) / rings) * (Math.PI / 2);
      const r0 = r * Math.cos(t0), r1 = r * Math.cos(t1);
      const y0 = y + r * Math.sin(t0) * sy, y1 = y + r * Math.sin(t1) * sy;
      for (let s = 0; s < seg; s++) {
        const a0 = s * step, a1 = (s + 1) * step;
        const p = (a, rr, yy) => [x + rr * Math.cos(a), yy, z + rr * Math.sin(a)];
        if (k === rings - 1) this.tri(p(a1, r0, y0), p(a0, r0, y0), [x, y1, z], color);
        else this.quad(p(a1, r0, y0), p(a0, r0, y0), p(a0, r1, y1), p(a1, r1, y1), color);
      }
    }
    return this;
  }

  /** Disque horizontal (face vers le haut). */
  disc(x, y, z, r, seg, color) {
    const step = (Math.PI * 2) / seg;
    for (let k = 0; k < seg; k++) {
      const a0 = k * step, a1 = (k + 1) * step;
      this.tri([x, y, z], [x + r * Math.cos(a1), y, z + r * Math.sin(a1)], [x + r * Math.cos(a0), y, z + r * Math.sin(a0)], color);
    }
    return this;
  }

  /** Disque vertical tourné vers +z (horloges, roues). */
  discZ(x, y, z, r, seg, color) {
    const step = (Math.PI * 2) / seg;
    for (let k = 0; k < seg; k++) {
      const a0 = k * step, a1 = (k + 1) * step;
      this.tri([x, y, z], [x + r * Math.cos(a0), y + r * Math.sin(a0), z], [x + r * Math.cos(a1), y + r * Math.sin(a1), z], color);
    }
    return this;
  }

  /** Fenêtre (calque "glass") sur une façade orientée : 'front' (+z), 'back' (-z), 'left' (-x), 'right' (+x). */
  win(face, u, y, wall, w, h, frame) {
    const t = 0.012;
    this.layer('glass');
    if (face === 'front') this.box(u, y, wall + t / 2, w, h, t, 0x2e4157);
    else if (face === 'back') this.box(u, y, -wall - t / 2, w, h, t, 0x2e4157);
    else if (face === 'right') this.box(wall + t / 2, y, u, t, h, w, 0x2e4157);
    else this.box(-wall - t / 2, y, u, t, h, w, 0x2e4157);
    this.layer('body');
    if (frame) {
      if (face === 'front') this.box(u, y - 0.012, wall + 0.01, w + 0.03, 0.012, 0.03, frame);
      else if (face === 'back') this.box(u, y - 0.012, -wall - 0.01, w + 0.03, 0.012, 0.03, frame);
    }
    return this;
  }

  /** Rangée de fenêtres réparties sur une façade. */
  windows(face, count, span, y, wall, w, h, frame) {
    for (let k = 0; k < count; k++) {
      const u = count === 1 ? 0 : -span / 2 + (span * k) / (count - 1);
      this.win(face, u, y, wall, w, h, frame);
    }
    return this;
  }

  /** Porte sur la façade avant (+z). */
  door(u, wall, w, h, color = 0x6b4429) {
    this.box(u, 0, wall + 0.008, w, h, 0.016, color);
    return this;
  }
}
