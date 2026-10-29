// Logements collectifs contemporains. Construits en volumes simples, comme le reste du jeu :
// un corps de bâtiment, une cage d'escalier vitrée, des balcons à panneaux colorés, un toit
// plat avec ses panneaux solaires. C'est la signature des résidences neuves.
import { shade } from './geom.js';
import { P } from './models.js';

// Les panneaux de balcon donnent son caractère à la résidence : une teinte par immeuble.
const PANELS = [0x4f86c6, 0xe08a3c, 0x6aa84f, 0xc8614f, 0x7a6fae, 0x3fa9a0];
const SHAFTS = [0x7c8694, 0x8a8275, 0x6f7d8a];

/** Dalle de sol fine (parvis, trottoir, pelouse). */
function slab(g, x, z, w, d, color, y = 0.03, h = 0.012) {
  g.box(x, y, z, w, h, d, { top: color, side: shade(color, 0.84) });
}

/** Haie basse le long d'un bord. */
function hedgeRow(g, x, z, w, d, color) {
  g.box(x, 0.035, z, w, 0.1, d, { top: shade(color, 1.12), side: color });
}

/** Petit arbre d'agrément de résidence. */
function youngTree(g, ctx, x, z, s = 1) {
  g.cyl(x, 0.035, z, 0.022 * s, 0.17 * s, 6, P.trunk);
  const leaf = ctx.leaf(P.leaf);
  g.ico(x, 0.035 + 0.2 * s, z, 0.1 * s, leaf, 1.15, 0.22, (x * 31 + z * 17) | 0);
  g.ico(x + 0.04 * s, 0.035 + 0.3 * s, z - 0.03 * s, 0.07 * s, ctx.leaf(P.leafDark), 1.1, 0.25, (x * 13 + 5) | 0);
}

/**
 * Résidence HLM neuve : deux logements par palier.
 * Niveau 1 : R+3, huit logements. Niveau 2 : R+5. Niveau 3 : R+6.
 */
function residence(g, L, ctx) {
  const floors = L >= 3 ? 7 : L >= 2 ? 6 : 4;
  const fh = 0.2;                       // hauteur d'un étage
  const base = 0.042;                   // le bâtiment repose sur une plinthe
  const bw = 1.56, bd = 0.6;            // corps principal
  const bz = -0.1;                      // reculé pour dégager le parvis
  const wall = ctx.pick([P.cream, 0xf1efe8, 0xeae4d8]);
  const panel = ctx.pick(PANELS, 1);
  const shaftCol = ctx.pick(SHAFTS, 2);
  const top = base + floors * fh;

  /* ── le sol : pelouse, parvis dallé, allée ── */
  slab(g, 0, 0, 1.94, 0.94, ctx.ground(P.lawn), 0.026, 0.01);
  slab(g, 0, 0.3, 1.5, 0.3, ctx.ground(P.cobble));
  slab(g, 0, 0.44, 0.34, 0.16, ctx.ground(P.stoneLight));

  /* ── corps principal ── */
  g.box(0, 0, bz, bw + 0.06, base, bd + 0.06, { top: shade(wall, 0.7), side: P.stoneDark });
  g.box(0, base, bz, bw, floors * fh, bd, {
    top: shade(wall, 0.96), side: wall, back: shade(wall, 0.9), left: shade(wall, 0.93), right: shade(wall, 0.93),
  });
  // nez de dalle entre les étages : c'est ce qui donne l'échelle au bâtiment
  for (let f = 1; f < floors; f++) {
    g.box(0, base + f * fh - 0.012, bz, bw + 0.02, 0.016, bd + 0.02, shade(wall, 0.8));
  }

  /* ── cage d'escalier vitrée, décalée du corps ── */
  const sx = -bw / 2 + 0.17;
  g.box(sx, 0, bz + 0.02, 0.34, top + 0.07, bd + 0.1, {
    top: shade(shaftCol, 1.08), side: shaftCol, front: shade(shaftCol, 1.04),
  });
  g.layer('glass');
  for (let f = 0; f < floors; f++) {
    g.box(sx, base + f * fh + 0.045, bz + 0.02 + (bd + 0.1) / 2 + 0.008, 0.2, fh - 0.075, 0.012, 0x3d5e7c);
  }
  g.layer('body');

  // bandeau vertical coloré entre les deux travées
  g.box(0.2, base, bz + bd / 2 + 0.004, 0.1, floors * fh, 0.012, shade(panel, 0.9));

  /* ── balcons : deux par palier, un par logement ── */
  const front = bz + bd / 2;
  for (let f = 1; f < floors; f++) {
    const y = base + f * fh;
    for (const s of [-1, 1]) {
      const bx = s * 0.42 + 0.2;
      g.box(bx, y, front + 0.045, 0.44, 0.015, 0.09, { top: shade(wall, 1.02), side: shade(wall, 0.78) });
      // garde-corps : un panneau plein coloré, main courante claire
      const tint = f % 2 ? panel : shade(panel, 0.84);
      g.box(bx, y + 0.015, front + 0.085, 0.44, 0.07, 0.012, tint);
      g.box(bx, y + 0.085, front + 0.085, 0.45, 0.01, 0.018, shade(wall, 1.04));
      for (const e of [-1, 1]) g.box(bx + e * 0.22, y + 0.015, front + 0.05, 0.012, 0.07, 0.078, tint);
    }
  }

  /* ── percements ── */
  for (let f = 0; f < floors; f++) {
    const y = base + f * fh + 0.045;
    for (const s of [-1, 1]) {
      const bx = s * 0.42 + 0.2;
      if (f === 0 && s < 0) continue; // le hall occupe cette travée
      g.win('front', bx - 0.15, y, front, 0.17, fh - 0.085, null);   // porte-fenêtre du séjour
      g.win('front', bx + 0.16, y, front, 0.13, fh - 0.1, null);
    }
    g.win('back', -0.3, y, -bz + bd / 2, 0.16, fh - 0.1, null);
    g.win('back', 0.12, y, -bz + bd / 2, 0.16, fh - 0.1, null);
    g.win('back', 0.52, y, -bz + bd / 2, 0.16, fh - 0.1, null);
  }

  /* ── hall d'entrée : auvent, vitrage, numéro ── */
  const hx = -0.22;
  g.box(hx, base, front + 0.03, 0.44, fh - 0.03, 0.06, shade(shaftCol, 1.14));
  g.layer('glass');
  g.box(hx, base + 0.02, front + 0.068, 0.3, fh - 0.09, 0.012, 0x3d5e7c);
  g.layer('body');
  g.box(hx, base + fh - 0.045, front + 0.085, 0.46, 0.018, 0.13, panel);
  for (const s of [-1, 1]) g.box(hx + s * 0.2, base, front + 0.135, 0.016, fh - 0.06, 0.016, P.metal);
  slab(g, hx, front + 0.24, 0.5, 0.22, ctx.ground(P.stoneLight), 0.03, 0.018);

  /* ── toiture : acrotère, local technique, panneaux solaires ── */
  g.box(0, top, bz, bw + 0.016, 0.042, bd + 0.016, { top: shade(wall, 0.76), side: shade(wall, 0.92) });
  g.box(0, top + 0.012, bz, bw - 0.05, 0.012, bd - 0.05, 0x6f7a80);
  g.box(0.44, top + 0.012, bz - 0.1, 0.24, 0.075, 0.17, shade(shaftCol, 1.1));
  if (L >= 2) {
    for (let k = 0; k < 3; k++) {
      g.push(-0.16, -0.3 + k * 0.26, top + 0.03, bz + 0.08);
      g.box(0, 0, 0, 0.22, 0.01, 0.16, 0x27354a);
      g.box(0, -0.018, 0.05, 0.02, 0.022, 0.02, P.metal);
      g.pop();
    }
  }

  /* ── abords : haies, arbres, local à vélos, conteneurs ── */
  hedgeRow(g, 0, 0.44, 1.5, 0.08, ctx.leaf(P.hedge));
  for (const s of [-1, 1]) hedgeRow(g, s * 0.84, 0.16, 0.08, 0.5, ctx.leaf(P.hedge));
  youngTree(g, ctx, -0.74, 0.3, 0.95);
  youngTree(g, ctx, 0.76, 0.33, 0.8);
  // abri à vélos
  g.box(0.68, 0.035, -0.3, 0.3, 0.012, 0.26, { top: P.gravel, side: shade(P.gravel, 0.82) });
  for (const s of [-1, 1]) g.box(0.68 + s * 0.13, 0.035, -0.3, 0.018, 0.13, 0.018, P.metal);
  g.box(0.68, 0.16, -0.3, 0.34, 0.014, 0.3, shade(shaftCol, 1.2));
  for (let k = 0; k < 2; k++) g.box(0.6 + k * 0.16, 0.045, -0.3, 0.012, 0.07, 0.17, P.metal);
  // conteneurs de tri
  for (let k = 0; k < 2; k++) {
    g.box(-0.78 + k * 0.17, 0.035, -0.33, 0.14, 0.12, 0.13, k ? 0x4a7f3f : 0x3f6f9e);
    g.box(-0.78 + k * 0.17, 0.153, -0.33, 0.15, 0.014, 0.14, P.dark);
  }
  // deux lampadaires d'allée
  for (const s of [-1, 1]) {
    g.cyl(s * 0.6, 0.035, 0.42, 0.014, 0.3, 6, P.metal);
    g.box(s * 0.6, 0.33, 0.42, 0.09, 0.022, 0.07, P.dark);
  }
}

export function addModernModels(MODELS) {
  MODELS.hlm = (g, L, ctx) => residence(g, L, ctx);
}
