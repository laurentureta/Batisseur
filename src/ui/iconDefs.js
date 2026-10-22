// Dessins des icônes (repère 64 × 64). Chaque entrée renvoie { defs, parts }.
// Les « parts » sont dessinées deux fois : un contour brun commun (silhouette), puis les couleurs.
// Options : out:false (pas de contour), sep:true (contour propre, pour séparer d'une pièce de derrière),
// line (fin liseré), rnd (coins arrondis), only:'outline' (silhouette seule), tr (transformation), at (attributs).
const O = '#3a1d0b';

function stopsXML(stops) {
  return stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('');
}
const lin = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopsXML(stops)}</linearGradient>`;

const MATS = {
  gold: [[0, '#fff6b0'], [0.45, '#ffd43b'], [1, '#f29a12']],
  goldD: [[0, '#f8b72a'], [1, '#b5620a']],
  steel: [[0, '#f4f7fa'], [0.5, '#bac6d2'], [1, '#7a8a9c']],
  steelD: [[0, '#c9d3de'], [1, '#66768a']],
  wood: [[0, '#f0b878'], [0.55, '#c47e43'], [1, '#8c4f22']],
  woodL: [[0, '#ffd9a6'], [1, '#d99a5c']],
  woodD: [[0, '#b87440'], [1, '#6b3a17']],
  stone: [[0, '#eef1f4'], [0.5, '#b5bec8'], [1, '#7a8491']],
  stoneD: [[0, '#cfd6de'], [1, '#848e9b']],
  red: [[0, '#ff8f7f'], [0.5, '#f0473a'], [1, '#b6231b']],
  redD: [[0, '#e8463a'], [1, '#9c1b14']],
  green: [[0, '#bdf27f'], [0.5, '#64c63e'], [1, '#2f8a25']],
  greenD: [[0, '#6fcf48'], [1, '#2a7a20']],
  leafG: [[0, '#a9e86a'], [0.6, '#4fae34'], [1, '#2c7a22']],
  pineG: [[0, '#7fd35a'], [1, '#22703a']],
  blue: [[0, '#9fe4ff'], [0.5, '#3faaf6'], [1, '#1c63c6']],
  blueD: [[0, '#3b97ec'], [1, '#174d9e']],
  purple: [[0, '#eecbff'], [0.5, '#b867f0'], [1, '#6f2fc0']],
  yellow: [[0, '#fff4a6'], [0.5, '#ffd23a'], [1, '#f39a14']],
  yellowD: [[0, '#ffc02a'], [1, '#d47a0c']],
  orange: [[0, '#ffd28c'], [0.5, '#ff962e'], [1, '#d65e0e']],
  skin: [[0, '#ffe4c6'], [1, '#f0ac7e']],
  hair: [[0, '#a06233'], [1, '#5e3215']],
  paper: [[0, '#fffbee'], [0.6, '#f5e5bd'], [1, '#dbbd82']],
  paperD: [[0, '#f3dcae'], [1, '#c39a5c']],
  white: [[0, '#ffffff'], [1, '#d4e0ec']],
  cloud: [[0, '#ffffff'], [1, '#cddff1']],
  cream: [[0, '#fffaf0'], [1, '#e6d6b6']],
  terra: [[0, '#ffb27c'], [0.5, '#e06c35'], [1, '#a5401b']],
  brick: [[0, '#ff9273'], [0.5, '#d9532f'], [1, '#a2381e']],
  brickD: [[0, '#c95433'], [1, '#7e2a15']],
  dark: [[0, '#6c7380'], [1, '#2f333b']],
  pink: [[0, '#ffd6ea'], [0.5, '#ff8ac0'], [1, '#e04a90']],
  sack: [[0, '#f8dfb3'], [0.6, '#ddb27a'], [1, '#b8834a']],
  sackD: [[0, '#e2b77c'], [1, '#9c6a35']],
  water: [[0, '#c4f2ff'], [0.5, '#4cc1f6'], [1, '#1a76d0']],
  glass: [[0, '#d9f4ff'], [1, '#7cc8f2']],
  sand: [[0, '#ffe7a3'], [1, '#e8b553']],
  asphalt: [[0, '#8a929e'], [1, '#474e59']],
  dirt: [[0, '#d9a56b'], [1, '#9c6334']],
  ice: [[0, '#ffffff'], [1, '#9fdcff']],
  straw: [[0, '#ffe9a0'], [1, '#e0b450']],
  blond: [[0, '#ffe58a'], [1, '#e8a93a']],
  beard: [[0, '#ffffff'], [1, '#c9d4df']],
  vh: [[0, '#3c3f4a'], [1, '#14161b']],
};
const mats = (...names) => names.map((n) => lin(n, MATS[n]));
const u = (n) => `url(#${n})`;

/* constructeurs */
function mk(el, a, fill, o) {
  const at = { ...a };
  if (o.tr) at.transform = o.tr;
  if (o.at) Object.assign(at, o.at);
  return { el, a: at, fill, ...o };
}
const P = (d, fill, o = {}) => mk('path', { d }, fill, o);
const C = (cx, cy, r, fill, o = {}) => mk('circle', { cx, cy, r }, fill, o);
const E = (cx, cy, rx, ry, fill, o = {}) => mk('ellipse', { cx, cy, rx, ry }, fill, o);
const R = (x, y, w, h, rx, fill, o = {}) => mk('rect', { x, y, width: w, height: h, rx }, fill, o);
const S = (d, stroke, sw, o = {}) => mk('path', { d }, null, { stroke, sw, ...o });
const G = (tr, c, o = {}) => ({ el: 'g', a: tr ? { transform: tr, ...(o.at || {}) } : { ...(o.at || {}) }, c, ...o });
const H = (d, op = 0.55) => ({ el: 'path', a: { d }, fill: '#fff', op, out: false });
const D = (p) => ({ ...p, out: false });

const f2 = (n) => Math.round(n * 100) / 100;
function star(cx, cy, Rr, r, n = 5, rot = -90) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const rr = i % 2 ? r : Rr;
    d += (i ? 'L' : 'M') + f2(cx + rr * Math.cos(a)) + ' ' + f2(cy + rr * Math.sin(a));
  }
  return d + 'Z';
}
function sparkle(cx, cy, r, k = 0.26) {
  const q = r * k;
  return `M${cx} ${cy - r}Q${cx + q} ${cy - q} ${cx + r} ${cy}Q${cx + q} ${cy + q} ${cx} ${cy + r}Q${cx - q} ${cy + q} ${cx - r} ${cy}Q${cx - q} ${cy - q} ${cx} ${cy - r}Z`;
}
function gearPath(cx, cy, Rr, r, n) {
  const pt = (a, rad) => `${f2(cx + rad * Math.cos(a))} ${f2(cy + rad * Math.sin(a))}`;
  const s = (2 * Math.PI) / n;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = i * s - Math.PI / 2;
    d += (i ? 'L' : 'M') + pt(a - s * 0.31, r) + 'L' + pt(a - s * 0.17, Rr) + 'L' + pt(a + s * 0.17, Rr) + 'L' + pt(a + s * 0.31, r);
  }
  return d + 'Z';
}
const range = (n) => Array.from({ length: n }, (_, i) => i);

/* visages */
const EYES = [D(E(23.5, 27.5, 3.1, 4.3, O)), D(E(40.5, 27.5, 3.1, 4.3, O)), D(C(24.5, 25.8, 1.15, '#fff')), D(C(41.5, 25.8, 1.15, '#fff'))];
const CHEEKS = [D(E(15.5, 38, 4, 2.6, '#ff7d6b', { op: 0.45 })), D(E(48.5, 38, 4, 2.6, '#ff7d6b', { op: 0.45 }))];
function face(tint, extra) {
  return () => ({
    defs: [lin('f', tint)],
    parts: [C(32, 32, 25, u('f')), H('M11.5 27.5 A21.5 21.5 0 0 1 29 10.6 A23 23 0 0 0 14.6 31 Z', 0.6), ...extra],
  });
}
const YEL = MATS.yellow;

const CLOUD_D = 'M16.5 49 Q6 49 6 39.5 Q6 30.5 15.5 30 Q16.5 18.5 28.5 18.5 Q37.5 18.5 41 26.5 Q44 24 48.5 24.8 Q57.5 26 57.5 36.5 Q58 49 47 49 Z';
const CLOUD_HL = 'M12 36.5 Q12.5 31.5 18.5 31.5 Q19.5 22.5 28.5 21.5 Q22 25.5 21.5 33.5 Q15.5 33.5 12 36.5 Z';
const sunRays = (cx, cy, r0, r1, w, fill, n = 8) => range(n).map((i) => G(`rotate(${(i * 360) / n} ${cx} ${cy})`, [P(`M${cx} ${cy - r1} L${cx + w} ${cy - r0} H${cx - w} Z`, fill, { rnd: 2 })]));
const drop = (x, y, s, fill, o = {}) => P(`M${x} ${y - 8 * s} Q${x + 6 * s} ${y - 1 * s} ${x + 6 * s} ${y + 2.5 * s} A${6 * s} ${6 * s} 0 0 1 ${x - 6 * s} ${y + 2.5 * s} Q${x - 6 * s} ${y - 1 * s} ${x} ${y - 8 * s} Z`, fill, o);

function ball(stops) {
  return () => ({
    defs: [lin('b', stops)],
    parts: [C(32, 32, 22, u('b')), H('M15 28 A17 17 0 0 1 28 14.5 A18 18 0 0 0 18 30.5 Z', 0.7), D(C(40, 44, 3, '#fff', { op: 0.25 }))],
  });
}

function house(x, y, s, roof, o = {}) {
  // petite maison (pour village)
  return G(`translate(${x} ${y}) scale(${s})`, [
    R(41, 13, 7, 14, 1.5, u('brick')),
    R(13.5, 29, 37, 27, 2, u('cream')),
    P('M6.5 32 L32 9 L57.5 32 Z', roof, { rnd: 3 }),
    D(S('M12.5 28.5 L32 11.5 L51.5 28.5', '#ffffff', 2, { op: 0.35 })),
    D(P('M27.5 56 V45 Q27.5 39.5 32.5 39.5 Q37.5 39.5 37.5 45 V56 Z', u('woodD'))),
    D(R(17.5, 36, 8, 8, 1.5, u('glass'))),
    D(R(40, 36, 8, 8, 1.5, u('glass'))),
  ], o);
}


/* portraits (avatars du maire) */
const SKIN = [[0, '#ffe2c2'], [1, '#f2b184']];
function face2(o = {}) {
  const ey = o.ey ?? 31;
  return [
    D(C(27, ey, 1.7, O)), D(C(37, ey, 1.7, O)),
    D(C(27.6, ey - 0.6, 0.55, '#fff')), D(C(37.6, ey - 0.6, 0.55, '#fff')),
    ...(o.noMouth ? [] : [D(S('M28.3 36.4 Q32 39.6 35.7 36.4', O, 1.6))]),
    D(E(23.6, 35, 2.6, 1.6, '#ff7d6b', { op: 0.4 })), D(E(40.4, 35, 2.6, 1.6, '#ff7d6b', { op: 0.4 })),
  ];
}
function bust(shirt, { skin = 'sk', back = [], hair = [], front = [], ears = true, faceOpts } = {}) {
  return [
    ...back,
    R(27.5, 38, 9, 9, 3, u(skin)),
    P('M9 61 Q9 45 32 45 Q55 45 55 61 Z', shirt, { sep: true }),
    ...(ears ? [C(18.6, 31, 3.2, u(skin)), C(45.4, 31, 3.2, u(skin))] : []),
    C(32, 30, 13.5, u(skin)),
    ...face2(faceOpts),
    ...hair,
    ...front,
  ];
}
const AV = (extra, parts) => () => ({ defs: [lin('sk', SKIN), ...mats('hair', ...extra)], parts: parts() });

export const ICON_DEFS = {
  /* ───────── ressources ───────── */
  coins: () => ({
    defs: mats('gold', 'goldD'),
    parts: [
      C(32, 35.5, 23.5, u('goldD')),
      C(32, 31, 23.5, u('gold')),
      D(C(32, 31, 17.5, 'none', { stroke: '#e3900f', sw: 2.4 })),
      D(P(star(32, 31.8, 10, 4.4), '#ffe36a', { stroke: '#d88a12', sw: 1.6 })),
      H('M13.5 27 A19 19 0 0 1 29 12.6 A20.5 20.5 0 0 0 16.4 31 Z', 0.7),
    ],
  }),
  gem: () => ({
    parts: [
      P('M12 24 L21.5 11 H42.5 L52 24 L32 55 Z', '#a64ee6'),
      D(P('M12 24 L21.5 11 L26 24 Z', '#c27af2')),
      D(P('M21.5 11 H32 L26 24 Z', '#e8b6ff')),
      D(P('M32 11 L26 24 H38 Z', '#f7e1ff')),
      D(P('M32 11 H42.5 L38 24 Z', '#dc9cff')),
      D(P('M42.5 11 L52 24 H38 Z', '#9a43de')),
      D(P('M12 24 H26 L32 55 Z', '#9a3fdc')),
      D(P('M26 24 H38 L32 55 Z', '#c57df5')),
      D(P('M38 24 H52 L32 55 Z', '#7428bf')),
      D(S('M12 24 H52 M21.5 11 L26 24 L32 55 L38 24 L42.5 11 M26 24 L32 11 L38 24', '#5b1d96', 1, { op: 0.45 })),
      D(P(sparkle(20, 14.5, 5.5), '#fff')),
      D(P(sparkle(44.5, 33, 3), '#fff', { op: 0.8 })),
    ],
  }),
  wood: () => {
    const log = (x, y, sep) => G(null, [
      C(x, y, 12.5, u('bark')),
      D(C(x, y, 9.4, u('end'))),
      D(C(x, y, 6.2, 'none', { stroke: '#cf914f', sw: 1.4 })),
      D(C(x, y, 2.9, 'none', { stroke: '#cf914f', sw: 1.4 })),
      D(P(`M${x - 6} ${y - 6.5} A9 9 0 0 1 ${x + 3} ${y - 9}`, null, { stroke: '#fff3d6', sw: 1.6, op: 0.8 })),
    ], { sep });
    return {
      defs: [lin('bark', [[0, '#b27140'], [1, '#6b3a17']]), lin('end', [[0, '#ffe6b8'], [1, '#efb978']])],
      parts: [log(19.5, 44.5), log(44.5, 44.5, true), log(32, 23, true)],
    };
  },
  stone: () => ({
    defs: [lin('s', MATS.stone), lin('s2', [[0, '#d7dde3'], [1, '#8b95a1']])],
    parts: [
      P('M33.5 57 L37 42 L46.5 35.5 L56.5 39 L60 50.5 L55.5 57 Z', u('s2')),
      D(P('M37 42 L46.5 35.5 L56.5 39 L48 44 Z', '#eef1f4', { op: 0.8 })),
      P('M4.5 57 L9 34.5 L20.5 22.5 L35 21 L44 30.5 L46.5 46.5 L40 57 Z', u('s'), { sep: true }),
      D(P('M9 34.5 L20.5 22.5 L35 21 L27.5 31.5 Z', '#f4f6f8', { op: 0.9 })),
      D(P('M27.5 31.5 L35 21 L44 30.5 L46.5 46.5 Z', '#959fab', { op: 0.65 })),
      D(S('M27.5 31.5 L21 57 M27.5 31.5 L9 34.5', '#7f8995', 1.3, { op: 0.55 })),
    ],
  }),
  bread: () => ({
    defs: [lin('cr', [[0, '#ffd893'], [0.55, '#eb9a43'], [1, '#b6601c']])],
    parts: [
      P('M6.5 41 Q6 22 32 20 Q58 22 57.5 41 Q57.5 51 47 51 H17 Q6.5 51 6.5 41 Z', u('cr')),
      D(S('M17.5 33.5 Q21.5 27 25.5 32.5 M28 30.5 Q32 24.5 36 30.5 M38.5 32.5 Q42.5 27 46.5 33.5', '#fff0c8', 2.6)),
      D(P('M8 43 Q32 49.5 56 43 Q54.5 50 47 50 H17 Q9.5 50 8 43 Z', '#9c4c14', { op: 0.3 })),
      H('M12 33 Q15 24.5 30 22.5 Q19 26.5 15 34.5 Z', 0.55),
    ],
  }),
  wheat: () => {
    const ear = (rot, sep) => G(`rotate(${rot} 32 57)`, [
      S('M32 57 V22', u('stalk'), 2.4),
      ...range(4).flatMap((k) => [
        E(28.6, 30.5 - k * 5.3, 3.1, 4.9, u('grain'), { tr: `rotate(-28 28.6 ${30.5 - k * 5.3})` }),
        E(35.4, 30.5 - k * 5.3, 3.1, 4.9, u('grain'), { tr: `rotate(28 35.4 ${30.5 - k * 5.3})` }),
      ]),
      E(32, 9.5, 2.9, 5, u('grain')),
    ], { sep });
    return {
      defs: [lin('stalk', [[0, '#f7d277'], [1, '#c9902c']]), lin('grain', [[0, '#ffe7a0'], [1, '#e0a63a']]), ...mats('red')],
      parts: [ear(-24), ear(24), ear(0, true), R(25.5, 43.5, 13, 6, 2.5, u('red'), { sep: true })],
    };
  },
  flour: () => ({
    defs: [lin('sk', [[0, '#fffaf2'], [0.6, '#efe3cc'], [1, '#cbb694']]), lin('gr', [[0, '#f6cf70'], [1, '#d39a32']])],
    parts: [
      P('M15.5 21 Q13 15 20 15 H44 Q51 15 48.5 21 L54 48 Q55 57 46 57 H18 Q9 57 10 48 Z', u('sk')),
      P('M21 16.5 Q32 4.5 43 16.5 Q32 20.5 21 16.5 Z', u('sk')),
      D(S('M21.5 17.5 Q32 22.5 42.5 17.5', '#9a6a36', 2.6)),
      D(S('M32 50 V30', '#c99236', 1.8)),
      ...[0, 1, 2].flatMap((k) => [
        D(E(29.4, 41 - k * 5, 2.2, 3.4, u('gr'), { tr: `rotate(-30 29.4 ${41 - k * 5})` })),
        D(E(34.6, 41 - k * 5, 2.2, 3.4, u('gr'), { tr: `rotate(30 34.6 ${41 - k * 5})` })),
      ]),
      D(E(32, 27.5, 2, 3.4, u('gr'))),
      D(P('M11.5 47 Q32 53 52.5 47 Q53.5 56 46 56 H18 Q10.5 56 11.5 47 Z', '#b29a72', { op: 0.35 })),
      H('M17.5 24 Q17 20.5 21 20 Q19 32 16.5 44 Q14 36 17.5 24 Z', 0.7),
    ],
  }),
  planks: () => {
    const plank = (y, dx, sep) => G(null, [
      P(`M${6 + dx} ${y} L${13 + dx} ${y - 6.5} H${55 + dx} L${48 + dx} ${y} Z`, u('woodL')),
      R(6 + dx, y, 42, 8.5, 0.5, u('wood')),
      P(`M${48 + dx} ${y} L${55 + dx} ${y - 6.5} V${y + 2} L${48 + dx} ${y + 8.5} Z`, u('end')),
      D(S(`M${10 + dx} ${y + 4.3} H${28 + dx} M${33 + dx} ${y + 2.8} H${44 + dx}`, '#9b5a28', 1.2, { op: 0.6 })),
      D(S(`M${16 + dx} ${y - 3.2} H${44 + dx}`, '#fff3dc', 1.2, { op: 0.7 })),
    ], { sep });
    return {
      defs: [...mats('wood', 'woodL'), lin('end', [[0, '#ffe6bf'], [1, '#e2a464']])],
      parts: [plank(48, -1), plank(36.5, 2, true), plank(25, -2, true)],
    };
  },
  clay: () => ({
    defs: [lin('t', MATS.terra), lin('tl', [[0, '#ffc9a3'], [1, '#e27a45']])],
    parts: [
      S('M22.5 22 Q12.5 21 14.5 32', u('t'), 3.6),
      S('M41.5 22 Q51.5 21 49.5 32', u('t'), 3.6),
      P('M24 15 H40 Q39.5 22 46.5 28 Q55 36 49 48.5 Q44 57 32 57 Q20 57 15 48.5 Q9 36 17.5 28 Q24.5 22 24 15 Z', u('t')),
      R(21, 9, 22, 7.5, 3, u('tl')),
      D(S('M16.5 38 Q32 44.5 47.5 38', '#9c3a17', 2)),
      D(S('M18.5 44 Q32 50 45.5 44', '#ffd0ae', 1.4, { op: 0.5 })),
      H('M20 30 Q24 25 27 21 Q26 28 22.5 34 Q19 40 20 46 Q15.5 38 20 30 Z', 0.45),
    ],
  }),
  bricks: () => {
    const brick = (x, y, w, sep) => G(null, [
      P(`M${x} ${y} L${x + 5} ${y - 5} H${x + w + 5} L${x + w} ${y} Z`, u('bt')),
      P(`M${x + w} ${y} L${x + w + 5} ${y - 5} V${y + 8} L${x + w} ${y + 13} Z`, u('bs')),
      R(x, y, w, 13, 1.2, u('br')),
      D(R(x + 2, y + 2, w - 4, 2.2, 1.1, '#ffb59c', { op: 0.55 })),
    ], { sep });
    return {
      defs: [lin('br', MATS.brick), lin('bt', [[0, '#ffc2ab'], [1, '#f08562']]), lin('bs', [[0, '#c4462a'], [1, '#86301a']])],
      parts: [brick(4.5, 42, 24), brick(29.5, 42, 24, true), brick(16.5, 27.5, 24, true)],
    };
  },
  iron: () => ({
    defs: [lin('if', [[0, '#cbd6e1'], [0.5, '#8c9cb0'], [1, '#5c6b7e']]), lin('it', [[0, '#f6f9fc'], [1, '#b8c5d3']])],
    parts: [
      P('M4.5 47.5 L13.5 30 H50.5 L59.5 47.5 Z', u('if')),
      P('M13.5 30 L20 19 H44 L50.5 30 Z', u('it')),
      D(S('M13.5 30 H50.5', '#6d7d91', 1.2, { op: 0.7 })),
      H('M16.5 31.5 H47.5 L49.5 34.5 H14.5 Z', 0.45),
      D(P(sparkle(40, 23.5, 3.2), '#fff')),
    ],
  }),
  tools: () => ({
    defs: mats('steel', 'steelD', 'wood', 'red'),
    parts: [
      G('translate(32 32) scale(0.92) translate(-32 -32) rotate(42 32 32)', [
        R(28.5, 21, 7, 35, 3.5, u('steel')),
        P('M21.5 10 Q21.5 3 28.5 3 V12 H35.5 V3 Q42.5 3 42.5 10 Q42.5 21.5 32 23.5 Q21.5 21.5 21.5 10 Z', u('steel')),
        D(C(32, 51, 1.9, '#7d8a99')),
      ]),
      G('translate(32 32) scale(0.92) translate(-32 -32) rotate(-42 32 32)', [
        R(28.5, 21, 7, 37, 3.5, u('wood')),
        R(16.5, 8, 31, 14, 3, u('steelD')),
        D(R(16.5, 8, 5.5, 14, 2, u('steel'))),
        H('M23 10.5 H46 V13 H23 Z', 0.5),
      ], { sep: true }),
    ],
  }),

  /* ───────── méta ───────── */
  star: () => ({
    defs: mats('gold'),
    parts: [
      P(star(32, 34, 26, 12.5), u('gold'), { rnd: 2 }),
      D(P(star(32, 34.5, 14.5, 7), '#ffe988', { op: 0.75 })),
      H('M30.6 12.5 L25.3 25.2 L11.5 27 L25.6 27.4 Z', 0.6),
    ],
  }),
  medal: () => ({
    defs: mats('gold', 'blue', 'red'),
    parts: [
      P('M13 5 H26.5 L36.5 30 H23 Z', u('blue')),
      P('M37.5 5 H51 L41 30 H27.5 Z', u('red')),
      D(S('M17.5 6 L27 29', '#c8ecff', 1.6, { op: 0.6 })),
      D(S('M46.5 6 L37 29', '#ffd0c8', 1.6, { op: 0.6 })),
      C(32, 41.5, 16, u('gold')),
      D(C(32, 41.5, 11.5, 'none', { stroke: '#e0900f', sw: 2.2 })),
      D(P(star(32, 42.3, 8, 3.6), '#fff3a0', { stroke: '#dc8a10', sw: 1.3 })),
      H('M18.5 38 A14 14 0 0 1 29 27.5 A15 15 0 0 0 21 40 Z', 0.6),
    ],
  }),
  gift: () => ({
    defs: mats('red', 'redD', 'gold'),
    parts: [
      P('M32 21 Q19 4 13.5 11.5 Q10 18.5 32 21 Z', u('gold')),
      P('M32 21 Q45 4 50.5 11.5 Q54 18.5 32 21 Z', u('gold')),
      D(P('M31 19.5 Q21 9.5 16.5 12.5 Q15.5 15.5 22 17.5 Z', '#c97d0c', { op: 0.45 })),
      D(P('M33 19.5 Q43 9.5 47.5 12.5 Q48.5 15.5 42 17.5 Z', '#c97d0c', { op: 0.45 })),
      R(12, 30, 40, 27, 3, u('redD')),
      R(9, 20, 46, 12, 3, u('red')),
      D(R(28, 20, 8, 37, 0, u('gold'))),
      D(R(12, 32, 40, 2.4, 0, '#6a120c', { op: 0.3 })),
      C(32, 20.5, 4.3, u('gold')),
      H('M12 22.5 H52 V24.8 H12 Z', 0.45),
    ],
  }),
  lock: () => ({
    defs: mats('steel', 'gold'),
    parts: [
      S('M21 30 V22 Q21 10 32 10 Q43 10 43 22 V30', u('steel'), 6.5),
      R(13, 28, 38, 29, 6, u('gold')),
      D(C(32, 40, 4.3, O)),
      D(P('M29.6 42 L28.6 49.5 H35.4 L34.4 42 Z', O)),
      H('M17 31.5 H47 Q44 34 17 34 Z', 0.55),
    ],
  }),
  unlock: () => ({
    defs: mats('steel', 'gold'),
    parts: [
      S('M43 30 V20 Q43 8 32 8 Q21 8 21 20', u('steel'), 6.5),
      R(13, 28, 38, 29, 6, u('gold')),
      D(C(32, 40, 4.3, O)),
      D(P('M29.6 42 L28.6 49.5 H35.4 L34.4 42 Z', O)),
      H('M17 31.5 H47 Q44 34 17 34 Z', 0.55),
    ],
  }),
  crown: () => ({
    defs: mats('gold', 'goldD', 'red', 'blue'),
    parts: [
      P('M8 22 L20.5 35 L32 13.5 L43.5 35 L56 22 L51.5 50 H12.5 Z', u('gold'), { rnd: 2 }),
      R(11.5, 44.5, 41, 9, 2.5, u('goldD')),
      C(8, 20.5, 3.7, u('gold')), C(32, 11.5, 3.7, u('gold')), C(56, 20.5, 3.7, u('gold')),
      D(C(32, 49, 3.2, u('red'))), D(C(21.5, 49, 2.6, u('blue'))), D(C(42.5, 49, 2.6, u('blue'))),
      H('M13.5 26.5 L19.5 33.5 L18 42.5 H15.2 Z', 0.5),
    ],
  }),
  palette: () => ({
    defs: [lin('pw', [[0, '#ffe4b6'], [1, '#d99a58']]), ...mats('red', 'yellow', 'green', 'blue', 'purple')],
    parts: [
      P('M32 7 Q57 7 58.5 27 Q59.5 40 47.5 41 Q40 41.5 42.5 49 Q45 57.5 32 57.5 Q7 57.5 5.5 33 Q5 7 32 7 Z', u('pw')),
      D(C(20, 22.5, 5.2, u('red'), { line: 1 })), D(C(32, 16, 5.2, u('yellow'), { line: 1 })), D(C(44.5, 20.5, 5.2, u('green'), { line: 1 })),
      D(C(16, 36.5, 5.2, u('blue'), { line: 1 })), D(C(25.5, 47.5, 4.8, u('purple'), { line: 1 })),
      D(C(47.5, 32, 3.6, '#a36b36')),
    ],
  }),
  tag: () => ({
    defs: mats('orange'),
    parts: [
      P('M8.5 35.5 L33 11 H53 V31 L28.5 55.5 Z', u('orange'), { rnd: 3 }),
      D(C(44.5, 19.5, 3.7, '#fff4e0')),
      H('M13 35 L33.5 14.5 H38 L16 36.5 Z', 0.4),
    ],
  }),
  check: () => ({
    defs: mats('green'),
    parts: [R(7, 7, 50, 50, 13, u('green')), D(S('M19 33 L28 42 L45.5 22.5', '#ffffff', 6.5)), H('M12 18 Q12 12 18 12 H46 Q38 14 14 21 Z', 0.45)],
  }),
  heart: () => ({
    defs: mats('red'),
    parts: [
      P('M32 55 Q8 40 7 25 Q6 11 19 10 Q28 9.5 32 18 Q36 9.5 45 10 Q58 11 57 25 Q56 40 32 55 Z', u('red')),
      H('M12 24 Q12 15 20 14.5 Q15 18 15.5 27 Z', 0.65),
    ],
  }),
  forbid: () => ({
    defs: mats('red'),
    parts: [C(32, 32, 24, u('red')), D(C(32, 32, 16, '#fff4f2')), D(R(9.5, 28, 45, 8, 2, u('red'), { tr: 'rotate(-45 32 32)' }))],
  }),

  /* ───────── HUD ───────── */
  people: () => ({
    defs: mats('blue', 'orange', 'skin', 'hair'),
    parts: [
      P('M5 51 Q5 36 19.5 36 Q34 36 34 51 V53 H5 Z', u('blue')),
      C(19.5, 25.5, 8.6, u('skin')),
      D(P('M10.9 25 Q10.6 15.5 19.5 15.5 Q28.4 15.5 28.1 25 Q25 20.5 19.5 21 Q14 20.5 10.9 25 Z', u('hair'))),
      D(C(16.7, 27.2, 1.25, O)), D(C(22.3, 27.2, 1.25, O)),
      G(null, [
        P('M24 56 Q24 39 41 39 Q58 39 58 56 V58 H24 Z', u('orange')),
        C(41, 27.5, 10, u('skin')),
        D(P('M31 27 Q30.6 16 41 16 Q51.4 16 51 27 Q47.5 21.5 41 22 Q34.5 21.5 31 27 Z', u('hair'))),
        D(C(37.6, 29.4, 1.4, O)), D(C(44.4, 29.4, 1.4, O)),
        D(S('M38 33.6 Q41 35.6 44 33.6', O, 1.4)),
        H('M28 54 Q28 45 35 42 Q31 47 31.5 54 Z', 0.4),
      ], { sep: true }),
    ],
  }),
  person: () => ({
    defs: mats('blue', 'skin', 'hair'),
    parts: [
      P('M11 56 Q11 37 32 37 Q53 37 53 56 V58 H11 Z', u('blue')),
      C(32, 24, 12, u('skin')),
      D(P('M20 24 Q19.5 11 32 11 Q44.5 11 44 24 Q40 17.5 32 18 Q24 17.5 20 24 Z', u('hair'))),
      D(C(27.8, 26, 1.6, O)), D(C(36.2, 26, 1.6, O)),
      D(S('M28.5 31 Q32 33.5 35.5 31', O, 1.6)),
      H('M15.5 54 Q15.5 44 23 40.5 Q19 46 19 54 Z', 0.4),
    ],
  }),
  happy: face(YEL, [
    D(S('M18.5 28 Q23.5 21 28.5 28', O, 3.2)), D(S('M35.5 28 Q40.5 21 45.5 28', O, 3.2)),
    D(P('M17 35 Q32 37.5 47 35 Q45.5 51 32 51 Q18.5 51 17 35 Z', '#6e1f10')),
    D(P('M24 45.5 Q32 40.5 40 45.5 Q37 51 32 51 Q27 51 24 45.5 Z', '#ff6b6b')),
    D(P('M19.2 35.6 Q32 37.8 44.8 35.6 L44.2 38.6 Q32 40.6 19.8 38.6 Z', '#fff')),
    ...CHEEKS,
  ]),
  smile: face(YEL, [...EYES, D(S('M21 37.5 Q32 47.5 43 37.5', O, 3.4)), ...CHEEKS]),
  neutral: face(YEL, [...EYES, D(S('M22.5 41.5 H41.5', O, 3.4))]),
  sad: face([[0, '#fff2ae'], [0.5, '#ffd24a'], [1, '#ec9f2a']], [
    ...EYES,
    D(S('M17.5 20.5 Q22 18.5 26.5 20', O, 2.2)), D(S('M46.5 20.5 Q42 18.5 37.5 20', O, 2.2)),
    D(S('M22 45.5 Q32 37 42 45.5', O, 3.4)),
  ]),
  angry: face([[0, '#ffbe8a'], [0.5, '#ff7d45'], [1, '#d63e1a']], [
    D(S('M16 20 L28 25.5', O, 3.4)), D(S('M48 20 L36 25.5', O, 3.4)),
    D(E(23.5, 30, 3, 3.6, O)), D(E(40.5, 30, 3, 3.6, O)),
    D(S('M21.5 46 Q32 38 42.5 46', O, 3.6)),
  ]),
  menu: () => ({
    defs: mats('cream'),
    parts: [R(9, 12, 46, 9, 4.5, u('cream')), R(9, 27.5, 46, 9, 4.5, u('cream')), R(9, 43, 46, 9, 4.5, u('cream'))],
  }),
  gear: () => ({
    defs: [lin('g', MATS.steel)],
    parts: [
      P(gearPath(32, 32, 26.5, 19.5, 9), u('g'), { rnd: 3 }),
      D(C(32, 32, 14.5, 'none', { stroke: '#9aa9b9', sw: 1.6 })),
      D(C(32, 32, 9, '#55616f')),
      D(C(32, 32, 9, 'none', { stroke: O, sw: 1.6 })),
      H('M12.5 26 A20 20 0 0 1 26 12.5 L27.5 16 A17 17 0 0 0 16 27.5 Z', 0.55),
    ],
  }),
  target: () => ({
    defs: mats('red', 'wood'),
    parts: [
      C(28, 36, 22.5, u('red')),
      D(C(28, 36, 16.5, '#fff7f0')),
      D(C(28, 36, 10.5, u('red'))),
      D(C(28, 36, 4.6, '#fff7f0')),
      H('M9.5 32 A19 19 0 0 1 24 15.5 A20 20 0 0 0 12.5 34 Z', 0.5),
      G('translate(28 36) rotate(-45)', [
        S('M2 0 H31', u('wood'), 3.4),
        P('M23 0 L28.5 -7.5 H35.5 L31 0 L35.5 7.5 H28.5 Z', '#3aa0f0'),
      ], { sep: true }),
      D(C(28, 36, 2.2, O)),
    ],
  }),
  scroll: () => ({
    defs: mats('paper', 'paperD', 'red'),
    parts: [
      R(14, 13, 36, 38, 2, u('paper')),
      R(9, 8, 46, 10, 5, u('paperD')),
      R(9, 46, 46, 10, 5, u('paperD')),
      D(S('M19.5 24.5 H44.5 M19.5 31 H44.5 M19.5 37.5 H37.5', '#b98d52', 2.2)),
      D(C(13.8, 13, 2.4, '#b4864a')), D(C(13.8, 51, 2.4, '#b4864a')),
      C(43, 44.5, 6.6, u('red'), { sep: true }),
      D(P(star(43, 44.6, 3.6, 1.6), '#ffb8ac', { op: 0.85 })),
      H('M12 10.5 H52 V12.5 H12 Z', 0.55),
    ],
  }),
  trophy: () => ({
    defs: mats('gold', 'goldD', 'wood'),
    parts: [
      S('M17.5 16.5 Q6.5 16 7.5 25.5 Q8.5 34 19.5 35', u('gold'), 4.6),
      S('M46.5 16.5 Q57.5 16 56.5 25.5 Q55.5 34 44.5 35', u('gold'), 4.6),
      P('M15 9 H49 V21 Q49 40 32 42.5 Q15 40 15 21 Z', u('gold')),
      R(28, 41.5, 8, 7, 1, u('goldD')),
      R(20, 47, 24, 5, 2, u('goldD')),
      R(15.5, 51, 33, 7, 2.5, u('wood')),
      D(P(star(32, 23.5, 7.5, 3.3), '#fff4a8', { stroke: '#e3920f', sw: 1.3 })),
      H('M19 12 H24.5 V23 Q24.5 32 29.5 37.5 Q19.5 34 19 23 Z', 0.5),
    ],
  }),
  crate: () => ({
    defs: mats('wood', 'woodL', 'woodD'),
    parts: [
      P('M8 22 H44 V57 H8 Z', u('wood')),
      P('M8 22 L19 11 H55 L44 22 Z', u('woodL')),
      P('M44 22 L55 11 V46 L44 57 Z', u('woodD')),
      D(S('M12 26 H40 V53 H12 Z', '#8a4c20', 2.2)),
      D(S('M13.5 51.5 L38.5 27.5', '#8a4c20', 3.4)),
      D(S('M15.5 16.5 H51.5', '#c88a4f', 1.4, { op: 0.8 })),
      D(S('M47.5 20 V48', '#5c3214', 1.4, { op: 0.6 })),
      D(C(12, 26, 1.2, '#5a2e10')), D(C(40, 26, 1.2, '#5a2e10')), D(C(12, 53, 1.2, '#5a2e10')), D(C(40, 53, 1.2, '#5a2e10')),
      H('M10.5 24 H41.5 V25.6 H10.5 Z', 0.4),
    ],
  }),
  map: () => ({
    defs: mats('paper', 'paperD', 'red'),
    parts: [
      P('M5 17 L21.5 11 V52 L5 58 Z', u('paper')),
      P('M21.5 11 L41.5 17 V58 L21.5 52 Z', u('paperD')),
      P('M41.5 17 L58 11 V52 L41.5 58 Z', u('paper')),
      D(P('M8 23.5 Q13 20.5 18 23 Q19.5 28 15.5 31 Q10 32.5 8 29 Z', '#8fd36a')),
      D(P('M25 26 Q31 22.5 37.5 26.5 Q39 33 34 36 Q27 37.5 25 33 Z', '#83c95f')),
      D(P('M45 37 Q50 34 55 37 V45 Q50 48 45 45 Z', '#8fd36a')),
      D(S('M7 46 Q13 42.5 19 46 T31 47 T44 48 T56 46', '#4fb3f0', 2.6)),
      D(S('M12 37.5 L20 35.5 L28 41.5 L37 40.5', '#d9472b', 1.8, { dash: '2.6 2.2' })),
      P('M44 25 Q44 15.5 51 15.5 Q58 15.5 58 25 Q58 31 51 39 Q44 31 44 25 Z', u('red'), { sep: true }),
      D(C(51, 24.5, 3, '#fff')),
    ],
  }),
  stall: () => {
    const parts = [
      R(11.5, 22, 5, 34, 1.5, u('woodD')),
      R(47.5, 22, 5, 34, 1.5, u('woodD')),
      R(7, 39, 50, 17, 3, u('wood')),
      D(S('M7 47.5 H57', '#8a4c20', 1.6, { op: 0.7 })),
      C(17.5, 37, 5, u('red'), { sep: true }), C(27, 36, 5, u('green'), { sep: true }), C(36.5, 37, 5, u('red'), { sep: true }), C(46, 36, 5, u('orange'), { sep: true }),
    ];
    let aw = 'M5 8 Q5 6 7 6 H57 Q59 6 59 8 V22';
    const n = 8, w = 54 / n;
    for (let i = n - 1; i >= 0; i--) {
      const x0 = 5 + i * w;
      aw += ` Q${f2(x0 + w / 2)} 28 ${f2(x0)} 22`;
    }
    parts.push(P(aw + ' Z', '#fff', { only: 'outline', sep: true }));
    for (let i = 0; i < n; i++) {
      const x0 = 5 + i * w, x1 = x0 + w;
      parts.push(D(P(`M${f2(x0)} 6 H${f2(x1)} V22 Q${f2((x0 + x1) / 2)} 28 ${f2(x0)} 22 Z`, i % 2 ? '#fff6ee' : u('red'))));
    }
    parts.push(H('M7 8 H57 V10.5 H7 Z', 0.45));
    return { defs: mats('wood', 'woodD', 'red', 'green', 'orange'), parts };
  },
  hand: () => ({
    defs: mats('white', 'blue'),
    parts: [
      R(25, 4.5, 11.5, 31, 5.75, u('white')),
      P('M16.5 31 Q16.5 26.5 21 26.5 H44 Q49 26.5 49 31.5 V43 Q49 53.5 38.5 53.5 H27.5 Q16.5 53.5 16.5 43 Z', u('white')),
      P('M18.5 33 Q11 30 8.5 35.5 Q7 40.5 17.5 46.5 Z', u('white')),
      R(20, 50, 26.5, 9, 3, u('blue')),
      D(S('M36.5 27 V35.5 M42.5 27.5 V35.5', '#9fb0c2', 1.8)),
      H('M27.5 8 Q28 6.5 30 6.5 V30 H27.5 Z', 0.7),
    ],
  }),
  road: () => ({
    defs: mats('asphalt', 'green'),
    parts: [
      P('M3 58 L22.5 6 H25.5 L7 58 Z', u('green')),
      P('M61 58 L41.5 6 H38.5 L57 58 Z', u('green')),
      P('M7 58 L25.5 6 H38.5 L57 58 Z', u('asphalt'), { sep: true }),
      D(S('M12.5 54.5 L27.6 9.5', '#f5f7fa', 1.8, { op: 0.85 })),
      D(S('M51.5 54.5 L36.4 9.5', '#f5f7fa', 1.8, { op: 0.85 })),
      D(P('M30.3 53 H33.7 L33.3 43 H30.7 Z', '#ffd23a')),
      D(P('M30.9 35.5 H33.1 L32.9 28.5 H31.1 Z', '#ffd23a')),
      D(P('M31.3 22.5 H32.7 L32.6 17.5 H31.4 Z', '#ffd23a')),
      D(P('M31.6 13 H32.4 L32.35 10 H31.65 Z', '#ffd23a')),
    ],
  }),
  hammer: () => ({
    defs: mats('wood', 'steel', 'steelD'),
    parts: [
      G('translate(3 2) rotate(-40 32 32)', [
        R(28.5, 21, 7, 39, 3.5, u('wood')),
        R(15.5, 9, 33, 14, 3.5, u('steel')),
        D(R(15.5, 9, 6.5, 14, 2.5, u('steelD'))),
        D(S('M30.6 27 V56', '#f7cb94', 1.5, { op: 0.75 })),
        H('M23 11.4 H46 V14 H23 Z', 0.65),
      ]),
    ],
  }),
  bulldozer: () => ({
    defs: mats('yellow', 'yellowD', 'dark', 'steel', 'glass'),
    parts: [
      G('translate(2.5 -2)', [
        R(19.5, 19, 4.2, 13, 1.2, u('dark')),
        P('M27 14 H44 Q47 14 47 17 V32 H27 Z', u('yellow')),
        P('M17 30 H47.5 Q51 30 51 33.5 V44 H17 Z', u('yellow')),
        P('M17 35 L9 38.5 V45 L17 42 Z', u('yellowD')),
        P('M4 26.5 Q13 29.5 13 41.5 Q13 53 4.5 56 Q8 41.5 4 26.5 Z', u('steel')),
        R(14, 43, 41, 14, 7, u('dark'), { sep: true }),
        D(C(21, 50, 4.3, '#a6afba')), D(C(34.5, 50, 4.3, '#a6afba')), D(C(48, 50, 4.3, '#a6afba')),
        D(C(21, 50, 1.6, '#4a515c')), D(C(34.5, 50, 1.6, '#4a515c')), D(C(48, 50, 1.6, '#4a515c')),
        D(R(30, 17, 13.5, 11, 2, u('glass'))),
        D(R(19, 36, 30, 2.2, 1, '#c98a10', { op: 0.55 })),
        H('M20 32.3 H48 V34.2 H20 Z', 0.5),
        H('M31.5 18.5 H36 L33 26.5 H31.5 Z', 0.6),
      ]),
    ],
  }),
  undo: () => ({
    defs: mats('blue'),
    parts: [
      S('M47 53 Q59 42 53 27.5 Q47 14 26 17.5', u('blue'), 9),
      P('M30 5 L8.5 18.5 L31 30.5 Z', u('blue'), { rnd: 2 }),
      D(S('M50.5 46.5 Q55 39 51.5 30.5', '#c8f0ff', 2, { op: 0.75 })),
    ],
  }),
  play: () => ({ defs: mats('white'), parts: [P('M20 11 L51 32 L20 53 Z', u('white'), { rnd: 4 })] }),
  pause: () => ({ defs: mats('white'), parts: [R(15, 11, 12, 42, 4, u('white')), R(37, 11, 12, 42, 4, u('white'))] }),
  ff: () => ({ defs: mats('white'), parts: [P('M7 15 L31 32 L7 49 Z', u('white'), { rnd: 3 }), P('M33 15 L57 32 L33 49 Z', u('white'), { rnd: 3 })] }),
  fff: () => ({
    defs: mats('white'),
    parts: [P('M4.5 19 L22 32 L4.5 45 Z', u('white'), { rnd: 3 }), P('M23.5 19 L41 32 L23.5 45 Z', u('white'), { rnd: 3 }), P('M42.5 19 L60 32 L42.5 45 Z', u('white'), { rnd: 3 })],
  }),
  calendar: () => ({
    defs: mats('white', 'red', 'steel'),
    parts: [
      R(9, 12, 46, 45, 6, u('white')),
      D(P('M9 18 Q9 12 15 12 H49 Q55 12 55 18 V25.5 H9 Z', u('red'))),
      R(18.5, 6, 6, 13, 3, u('steel')), R(39.5, 6, 6, 13, 3, u('steel')),
      ...range(8).map((k) => D(R(15 + (k % 4) * 9.2, 31 + Math.floor(k / 4) * 9.5, 6.4, 6.2, 1.4, k === 6 ? '#ff6b5a' : '#c3ccd8'))),
      H('M12 14.5 H52 V16.8 H12 Z', 0.35),
    ],
  }),
  hourglass: () => ({
    defs: mats('wood', 'woodD', 'sand'),
    parts: [
      P('M19 12 H45 Q45 24.5 35.5 32 Q45 39.5 45 52 H19 Q19 39.5 28.5 32 Q19 24.5 19 12 Z', '#e4f6ff'),
      D(P('M23 17 H41 Q40.5 24 32 29.5 Q23.5 24 23 17 Z', u('sand'))),
      D(P('M21.5 50 Q23 41.5 32 39 Q41 41.5 42.5 50 Z', u('sand'))),
      D(S('M32 29.5 V40', '#e6a83a', 1.6)),
      S('M16 12 V52', u('woodD'), 3.2), S('M48 12 V52', u('woodD'), 3.2),
      R(12, 6, 40, 7, 3, u('wood')),
      R(12, 51, 40, 7, 3, u('wood')),
      H('M23 14.5 Q24 22 29 27 Q23 24 22.5 14.5 Z', 0.75),
    ],
  }),
  stopwatch: () => ({
    defs: mats('white', 'steel', 'red'),
    parts: [
      R(27.5, 4, 9, 7, 2.5, u('steel')),
      R(45, 10, 7, 6, 2.5, u('steel'), { tr: 'rotate(40 48.5 13)' }),
      C(32, 36, 22, u('red')),
      D(C(32, 36, 17, u('white'))),
      D(S('M32 22.5 V25.5 M45.5 36 H42.5 M32 49.5 V46.5 M18.5 36 H21.5', '#8794a3', 2)),
      D(S('M32 36 V25', O, 3)),
      D(S('M32 36 L39.5 40', O, 2.4)),
      D(C(32, 36, 2.4, O)),
      H('M13.5 32 A19 19 0 0 1 28 17.4 A20 20 0 0 0 16.5 34 Z', 0.5),
    ],
  }),

  /* ───────── saisons et météo ───────── */
  sun: () => ({
    defs: mats('yellow', 'orange'),
    parts: [
      ...sunRays(32, 31, 17, 27.5, 5.2, u('orange')),
      C(32, 31, 15.5, u('yellow')),
      H('M19.5 27 A13 13 0 0 1 29 17.6 A14 14 0 0 0 22 29 Z', 0.7),
    ],
  }),
  moon: () => ({
    defs: mats('yellow'),
    parts: [
      P('M38 7 A25 25 0 1 0 57 40 A19.5 19.5 0 0 1 38 7 Z', u('yellow')),
      D(C(24, 38, 3.2, '#e6ad25', { op: 0.6 })), D(C(31, 48, 2.2, '#e6ad25', { op: 0.6 })), D(C(20, 26, 1.8, '#e6ad25', { op: 0.6 })),
      P(sparkle(50, 13, 5.5), u('yellow')),
      P(sparkle(57, 26, 3.4), u('yellow')),
      H('M13 30 A20 20 0 0 1 29 11 Q19 19 17 33 Z', 0.55),
    ],
  }),
  cloud: () => ({ defs: mats('cloud'), parts: [P(CLOUD_D, u('cloud')), H(CLOUD_HL, 0.9)] }),
  partly: () => ({
    defs: mats('cloud', 'yellow', 'orange'),
    parts: [
      G('translate(18 0) scale(0.66)', [...sunRays(32, 32, 17, 25, 5.2, u('orange')), C(32, 32, 15.5, u('yellow'))]),
      G('translate(-3 6) scale(0.95)', [P(CLOUD_D, u('cloud')), H(CLOUD_HL, 0.9)], { sep: true }),
    ],
  }),
  rain: () => ({
    defs: mats('cloud', 'water'),
    parts: [
      G('translate(0 -8)', [P(CLOUD_D, u('cloud')), H(CLOUD_HL, 0.9)]),
      drop(20, 52, 0.62, u('water')), drop(32, 56.5, 0.62, u('water')), drop(44, 52, 0.62, u('water')),
    ],
  }),
  snow: () => ({
    defs: [...mats('cloud'), lin('ice', MATS.ice)],
    parts: [
      G('translate(0 -8)', [P(CLOUD_D, u('cloud')), H(CLOUD_HL, 0.9)]),
      ...[[19, 51], [32, 56], [45, 51]].map(([x, y]) => G(`translate(${x} ${y})`, [S('M0 -5 V5 M-4.3 -2.5 L4.3 2.5 M-4.3 2.5 L4.3 -2.5', u('ice'), 2.4)])),
    ],
  }),
  heat: () => ({
    defs: mats('white', 'red', 'yellow', 'orange'),
    parts: [
      G('translate(24 0) scale(0.56)', [...sunRays(32, 32, 17, 25, 5.2, u('orange')), C(32, 32, 15.5, u('yellow'))]),
      R(22, 8, 12, 38, 6, u('white'), { sep: true }),
      C(28, 47, 10, u('red')),
      D(R(25.5, 20, 5, 26, 2.5, u('red'))),
      D(S('M34 16 H31 M34 23 H31 M34 30 H31 M34 37 H31', '#8a97a6', 1.6)),
      H('M22 50 A7 7 0 0 1 25 41.5 Q23.5 46 25 50 Z', 0.55),
    ],
  }),
  snowflake: () => {
    const arm = (a) => G(`rotate(${a} 32 32)`, [S('M32 32 V7', u('ice'), 4.2), S('M24.5 12 L32 18 L39.5 12', u('ice'), 3.4), S('M26.5 22 L32 26 L37.5 22', u('ice'), 3)]);
    return { defs: [lin('ice', MATS.ice)], parts: [...[0, 60, 120, 180, 240, 300].map(arm), C(32, 32, 5.2, '#ffffff')] };
  },
  blossom: () => ({
    defs: [lin('p', MATS.pink), ...mats('yellow')],
    parts: [
      ...[0, 72, 144, 216, 288].map((a) => G(`rotate(${a} 32 33)`, [E(32, 18.5, 9.5, 13, u('p'), { line: 1.2 })])),
      ...[0, 72, 144, 216, 288].map((a) => D(G(`rotate(${a} 32 33)`, [S('M32 26 V13', '#ffd1e6', 1.4, { op: 0.8 })]))),
      C(32, 33, 7.5, u('yellow'), { sep: true }),
      D(C(29.5, 30.5, 2, '#fff', { op: 0.75 })),
    ],
  }),
  tulip: () => ({
    defs: mats('green', 'red', 'pink'),
    parts: [
      S('M32 58 V34', u('green'), 3.4),
      P('M31 52 Q18 50 13 36 Q24 37 31 46 Z', u('green')),
      P('M33 55 Q46 52 51 39 Q40 40 33 49 Z', u('green')),
      P('M19.5 16 Q19 37 32 37.5 Q45 37 44.5 16 L38.5 22 L32 11 L25.5 22 Z', u('pink'), { sep: true, rnd: 1 }),
      D(S('M32 13 V36', '#c43a7a', 1.3, { op: 0.5 })),
      H('M22.5 20.5 Q22.5 31 28 34 Q23 33 22.5 20.5 Z', 0.6),
    ],
  }),
  leaf: () => ({
    defs: [lin('l', [[0, '#ffd36a'], [0.5, '#ff8a2a'], [1, '#d6461b']]), ...mats('woodD')],
    parts: [
      S('M19 46 L8 58', u('woodD'), 3.6),
      P('M17.5 47.5 Q9 25 30 12.5 Q46 4 56 6.5 Q59 17 51 34 Q40 55 17.5 47.5 Z', u('l')),
      D(S('M18.5 46.5 Q33 33 52 10', '#b4380f', 2)),
      D(S('M27 37.5 L24 26 M34 30 L33 18.5 M41 23 L41.5 13.5 M31 34.5 L42.5 35.5 M38 27.5 L48.5 28', '#c4471a', 1.5, { op: 0.8 })),
      H('M22 38 Q20 26 30 17 Q24 26 25 36 Z', 0.45),
    ],
  }),
  tree: () => ({
    defs: mats('wood', 'leafG'),
    parts: [
      R(28, 36, 8, 21, 2.5, u('wood')),
      C(19.5, 31, 10.5, u('leafG')), C(44.5, 31, 10.5, u('leafG')), C(32, 22, 14.5, u('leafG')), C(32, 36, 11.5, u('leafG')),
      D(C(26, 16.5, 3.4, '#d8ff9a', { op: 0.5 })), D(C(15.5, 27, 2.4, '#d8ff9a', { op: 0.45 })), D(C(40.5, 25.5, 2.4, '#d8ff9a', { op: 0.4 })),
    ],
  }),
  pine: () => ({
    defs: mats('wood', 'pineG'),
    parts: [
      R(28.5, 47, 7, 11, 2, u('wood')),
      P('M32 26 L54 50 H10 Z', u('pineG'), { line: 1.4 }),
      P('M32 15 L49.5 37 H14.5 Z', u('pineG'), { line: 1.4 }),
      P('M32 4 L45 23.5 H19 Z', u('pineG'), { line: 1.4 }),
      H('M32 8 L23.5 21.5 H26.5 Z', 0.45), H('M30 19 L19 34 H22.5 Z', 0.35), H('M28.5 30 L16 47 H19.5 Z', 0.3),
    ],
  }),
  herb: () => ({
    defs: mats('green'),
    parts: [
      S('M18 58 Q22 34 44 10', u('green'), 3),
      ...[[22, 44, -50], [27, 33, -55], [33, 24, -60], [40, 16, -65]].flatMap(([x, y, a]) => [
        E(x - 6, y - 2, 4.2, 8.5, u('green'), { tr: `rotate(${a} ${x - 6} ${y - 2})` }),
        E(x + 6, y + 3, 4.2, 8.5, u('green'), { tr: `rotate(${a + 100} ${x + 6} ${y + 3})` }),
      ]),
    ],
  }),
  drop: () => ({
    defs: mats('water'),
    parts: [P('M32 5 Q49 25.5 49 38 A17 17 0 0 1 15 38 Q15 25.5 32 5 Z', u('water')), H('M22 36 Q22 28 29 19 Q26 30 26.5 38 Q24 41 22 36 Z', 0.75)],
  }),
  wave: () => ({
    defs: mats('water'),
    parts: [
      P('M4 46 Q9 18 34 15 Q50 14 56 28 Q46 23 40 28.5 Q34 35 42 41 Q48 45 59 40 Q57 52 44 55 H9 Q4 53 4 46 Z', u('water')),
      D(S('M40 28.5 Q46 23.5 56 28', '#ffffff', 2.4)),
      D(S('M10 44 Q14 26 31 20', '#d9f6ff', 2, { op: 0.7 })),
    ],
  }),

  /* ───────── besoins, services, alertes ───────── */
  cap: () => ({
    defs: [lin('d', [[0, '#5b6270'], [1, '#262a31']]), lin('d2', [[0, '#3e434d'], [1, '#1c1f24']]), ...mats('gold')],
    parts: [
      P('M16 30 V43 Q32 53 48 43 V30 Z', u('d2')),
      P('M3.5 25 L32 12.5 L60.5 25 L32 37.5 Z', u('d'), { sep: true }),
      D(S('M32 25 L51 31 V44', '#ffd23a', 2.4)),
      C(51, 46.5, 3.4, u('gold')),
      H('M10 25 L32 15.5 L33.5 17 L13 25.8 Z', 0.35),
    ],
  }),
  health: () => ({
    defs: mats('white', 'red'),
    parts: [C(32, 32, 25, u('white')), D(P('M26 13 H38 V26 H51 V38 H38 V51 H26 V38 H13 V26 H26 Z', u('red'), { rnd: 3.5 }))],
  }),
  shield: () => ({
    defs: mats('blue', 'gold'),
    parts: [
      P('M32 4.5 L54.5 12 V30 Q54.5 48.5 32 59 Q9.5 48.5 9.5 30 V12 Z', u('blue')),
      D(P('M32 10 L49 15.6 V30 Q49 44.5 32 53 Q15 44.5 15 30 V15.6 Z', 'none', { stroke: '#c4ebff', sw: 2 })),
      D(P(star(32, 31, 11, 4.8), u('gold'), { line: 1.2 })),
      H('M14 15 L32 9 V13.5 L18 18.5 V30 Q18 38 22 44 Q14 38 14 30 Z', 0.35),
    ],
  }),
  ferris: () => {
    const cols = ['red', 'blue', 'yellow', 'green', 'red', 'blue'];
    const cabins = range(6).map((i) => {
      const a = (i * Math.PI) / 3 - Math.PI / 2;
      return R(f2(32 + 19 * Math.cos(a) - 4.5), f2(26 + 19 * Math.sin(a) - 3.5), 9, 8, 2.5, u(cols[i]), { sep: true });
    });
    let spokes = '';
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 2 + Math.PI / 6;
      spokes += `M32 26 L${f2(32 + 19 * Math.cos(a))} ${f2(26 + 19 * Math.sin(a))} `;
    }
    return {
      defs: mats('red', 'blue', 'yellow', 'green', 'steel', 'dark'),
      parts: [
        S('M19.5 58 L32 27 L44.5 58', u('dark'), 4),
        S('M13 58 H51', u('dark'), 4),
        C(32, 26, 19, 'none', { stroke: u('steel'), sw: 3.6 }),
        D(S(spokes, '#c9d3de', 1.6)),
        ...cabins,
        C(32, 26, 4, u('yellow')),
      ],
    };
  },
  firetruck: () => ({
    defs: mats('red', 'dark', 'steel', 'glass'),
    parts: [
      R(5, 22, 38, 24, 3, u('red')),
      P('M42 24 H50.5 Q53 24 54.5 26.5 L59 34 V43 Q59 46 56 46 H42 Z', u('red')),
      D(P('M44.5 27 H50 L54.5 34.5 H44.5 Z', u('glass'))),
      R(8, 15, 32, 5, 2, u('steel')),
      D(S('M13 15.5 V19.5 M18.5 15.5 V19.5 M24 15.5 V19.5 M29.5 15.5 V19.5 M35 15.5 V19.5', '#7d8a99', 1.4)),
      R(45, 18, 7, 5, 2.5, '#4fc3ff'),
      D(R(5, 36, 54, 3, 0, '#ffffff', { op: 0.85 })),
      C(17, 47.5, 7, u('dark'), { sep: true }), C(47, 47.5, 7, u('dark'), { sep: true }),
      D(C(17, 47.5, 2.8, '#c9d3de')), D(C(47, 47.5, 2.8, '#c9d3de')),
      H('M8 24.5 H40 V27 H8 Z', 0.4),
    ],
  }),
  up: () => ({ defs: mats('green'), parts: [P('M32 5 L56 30 H42.5 V57 H21.5 V30 H8 Z', u('green'), { rnd: 3 }), H('M32 10.5 L15 28 H21 L32 16.5 Z', 0.5)] }),
  sparkles: () => ({
    defs: mats('yellow'),
    parts: [P(sparkle(27, 36, 21, 0.25), u('yellow')), P(sparkle(48.5, 14.5, 9.5, 0.25), u('yellow')), P(sparkle(50.5, 47, 6.5, 0.25), u('yellow'))],
  }),
  fire: () => ({
    defs: [lin('f1', [[0, '#ffd54a'], [0.45, '#ff8a1f'], [1, '#e2341a']]), lin('f2', [[0, '#fff6c2'], [1, '#ffc22e']])],
    parts: [
      P('M32 4 Q36 15 44 22 Q56 33 52 46 Q48 58 32 58 Q16 58 12.5 46 Q9.5 34 20 25 Q20 33 26 35 Q22 17 32 4 Z', u('f1')),
      D(P('M32 27 Q35 35 40 39 Q45.5 45 42 51 Q39 56 32 56 Q24.5 56 22.5 50.5 Q20.5 44 26 40 Q27 45 30 45.5 Q27.5 35 32 27 Z', u('f2'))),
      H('M19 33 Q15 41 18.5 48 Q14 42 16 36 Z', 0.5),
    ],
  }),
  helmet: () => ({
    defs: mats('yellow', 'yellowD'),
    parts: [
      P('M10 41 Q10 14 32 14 Q54 14 54 41 Z', u('yellow')),
      R(4, 38.5, 56, 10, 5, u('yellowD'), { sep: true }),
      D(R(28.5, 12.5, 7, 27, 3.5, '#ffe57a')),
      D(S('M28.5 15 V38 M35.5 15 V38', '#d48a10', 1.3, { op: 0.6 })),
      H('M14.5 36 Q15 21 27 17.5 Q20 24 19.5 36 Z', 0.55),
    ],
  }),
  barrier: () => ({
    defs: [lin('w', MATS.white), ...mats('dark', 'orange'), '<clipPath id="cb"><rect x="6" y="16" width="52" height="17" rx="3"/></clipPath>'],
    parts: [
      R(11, 30, 5.5, 25, 1.5, u('dark')), R(47.5, 30, 5.5, 25, 1.5, u('dark')),
      R(6, 52.5, 16, 5, 2.5, u('dark')), R(42, 52.5, 16, 5, 2.5, u('dark')),
      R(6, 16, 52, 17, 3, u('w'), { sep: true }),
      D(G(null, range(6).map((k) => P(`M${3 + k * 10} 33 L${12 + k * 10} 16 H${18 + k * 10} L${9 + k * 10} 33 Z`, '#ff5a2e')), { at: { 'clip-path': 'url(#cb)' } })),
      C(14, 11, 4.2, u('orange')), C(50, 11, 4.2, u('orange')),
    ],
  }),
  question: () => ({
    defs: mats('orange'),
    parts: [S('M21 21.5 Q21 9 32 9 Q43.5 9 43.5 20 Q43.5 27.5 35.5 31 Q32 32.5 32 38 V40', u('orange'), 8.5), C(32, 52, 5.5, u('orange'))],
  }),
  moneybag: () => ({
    defs: mats('sack', 'sackD', 'gold', 'red'),
    parts: [
      P('M19 27 Q8 37 10 47 Q12 57.5 32 57.5 Q52 57.5 54 47 Q56 37 45 27 Z', u('sack')),
      P('M23.5 27 Q20.5 19 26.5 14.5 L24 7.5 Q32 11.5 40 7.5 L37.5 14.5 Q43.5 19 40.5 27 Z', u('sackD')),
      R(21, 23, 22, 6, 3, u('red'), { sep: true }),
      C(32, 43, 8.5, u('gold'), { sep: true }),
      D(P(star(32, 43.4, 4.6, 2), '#fff1a0')),
      H('M15 44 Q15 35 22 30 Q19 38 19 46 Z', 0.45),
    ],
  }),
  flywings: () => ({
    defs: mats('white', 'gold', 'goldD'),
    parts: [
      P('M22 31 Q12 18 3.5 22 Q8 25.5 5.5 29 Q12 30.5 7 34.5 Q15 37.5 22 36 Z', u('white')),
      P('M42 31 Q52 18 60.5 22 Q56 25.5 58.5 29 Q52 30.5 57 34.5 Q49 37.5 42 36 Z', u('white')),
      C(32, 37.5, 13, u('goldD'), { sep: true }),
      C(32, 35, 13, u('gold')),
      D(P(star(32, 35.5, 6.5, 2.9), '#ffe36a', { stroke: '#d88a12', sw: 1.2 })),
    ],
  }),
  bolt: () => ({
    defs: mats('yellow'),
    parts: [P('M37 3.5 L14 36 H28.5 L24.5 60.5 L50.5 24 H35.5 L42.5 3.5 Z', u('yellow'), { rnd: 1.5 }), H('M36 7 L19.5 33 H24 L38.5 10 Z', 0.6)],
  }),
  party: () => ({
    defs: [lin('cone', [[0, '#d39bff'], [1, '#6f2dbd']]), ...mats('yellow', 'red', 'green', 'blue')],
    parts: [
      P('M7 57 L20.5 22.5 L41.5 43.5 Z', u('cone'), { rnd: 2 }),
      D(S('M11.5 45 L27 51 M15 35 L34 43.5', '#ffd23a', 3)),
      R(37.5, 8, 6, 9.5, 1.5, u('yellow'), { tr: 'rotate(25 40.5 12.75)' }),
      R(50, 20, 6, 9.5, 1.5, u('green'), { tr: 'rotate(-30 53 24.75)' }),
      C(29.5, 10.5, 3.6, u('red')), C(53.5, 38, 3.6, u('blue')), C(45, 51, 3, u('yellow')),
      S('M24 20 Q25 12 32.5 16', u('red'), 2.8),
      S('M42.5 40 Q50 34 55 46', u('blue'), 2.8),
    ],
  }),
  growth: () => ({
    defs: mats('blue', 'skin', 'hair', 'green'),
    parts: [
      P('M6 56 Q6 38 23 38 Q40 38 40 56 V58 H6 Z', u('blue')),
      C(23, 26.5, 10, u('skin')),
      D(P('M13 26 Q12.6 15 23 15 Q33.4 15 33 26 Q29.5 20.5 23 21 Q16.5 20.5 13 26 Z', u('hair'))),
      D(C(19.6, 28.4, 1.4, O)), D(C(26.4, 28.4, 1.4, O)),
      D(S('M20 32.6 Q23 34.6 26 32.6', O, 1.4)),
      P('M48 5 L60.5 20 H53 V41 H43 V20 H35.5 Z', u('green'), { rnd: 2, sep: true }),
    ],
  }),
  truck: () => ({
    defs: mats('white', 'red', 'dark', 'glass', 'blue'),
    parts: [
      R(4, 14, 38, 31, 3, u('white')),
      D(R(4, 33, 38, 4, 0, u('blue'))),
      P('M41 22 H51 Q53.5 22 55 24.5 L59.5 32.5 V44 Q59.5 46 57.5 46 H41 Z', u('red')),
      D(P('M44 25 H50.5 L55 32.5 H44 Z', u('glass'))),
      C(15.5, 47, 7, u('dark'), { sep: true }), C(48, 47, 7, u('dark'), { sep: true }),
      D(C(15.5, 47, 2.8, '#c9d3de')), D(C(48, 47, 2.8, '#c9d3de')),
      H('M7 16.5 H39 V19 H7 Z', 0.6),
    ],
  }),
  scales: () => ({
    defs: mats('gold', 'goldD', 'woodD'),
    parts: [
      R(29.5, 12, 5, 40, 2, u('goldD')),
      R(20, 50, 24, 7, 3, u('woodD')),
      S('M9 16 H55', u('gold'), 4),
      D(S('M11 17 L5 35 M11 17 L17 35 M53 17 L47 35 M53 17 L59 35', '#8a5a2a', 1.4)),
      P('M3 35 Q11 45 19 35 Z', u('gold')), P('M45 35 Q53 45 61 35 Z', u('gold')),
      C(32, 11, 3.6, u('gold')),
    ],
  }),

  /* ───────── bâtiments et lieux ───────── */
  house: () => ({ defs: mats('cream', 'red', 'woodD', 'brick', 'glass'), parts: [house(0, 0, 1, u('red'))] }),
  village: () => ({
    defs: mats('cream', 'red', 'blue', 'woodD', 'brick', 'glass'),
    parts: [house(-1, 2, 0.62, u('blue')), house(20, 18, 0.7, u('red'), { sep: true })],
  }),
  townhall: () => ({
    defs: mats('stone', 'white', 'blue'),
    parts: [
      R(9, 27, 46, 24, 0, '#8d98a6'),
      P('M5 23.5 L32 8 L59 23.5 Z', u('stone'), { rnd: 2 }),
      R(7, 22.5, 50, 6, 1, u('stone')),
      ...[11, 22.5, 35, 46.5].map((x) => R(x, 28.5, 6.5, 21.5, 1, u('white'))),
      R(6, 49.5, 52, 5, 1.5, u('stone')),
      R(3, 54, 58, 5, 1.5, u('stone')),
      D(C(32, 17.5, 3.4, u('blue'))),
    ],
  }),
  castle: () => ({
    defs: mats('stone', 'stoneD', 'blue', 'woodD', 'red'),
    parts: [
      P('M17 56 V27 H21 V23 H26 V27 H30 V23 H34 V27 H38 V23 H43 V27 H47 V56 Z', u('stone')),
      R(5, 24, 14, 32, 1.5, u('stoneD'), { sep: true }), R(45, 24, 14, 32, 1.5, u('stoneD'), { sep: true }),
      P('M3.5 25.5 L12 7 L20.5 25.5 Z', u('blue'), { rnd: 2 }), P('M43.5 25.5 L52 7 L60.5 25.5 Z', u('blue'), { rnd: 2 }),
      D(P('M26 56 V44 Q26 37 32 37 Q38 37 38 44 V56 Z', u('woodD'))),
      D(R(10, 32, 4, 6.5, 2, '#3a2b20')), D(R(50, 32, 4, 6.5, 2, '#3a2b20')),
    ],
  }),
  factory: () => ({
    defs: mats('brick', 'brickD', 'glass', 'cloud'),
    parts: [
      C(50, 7, 4.8, u('cloud')), C(57, 4.5, 3.4, u('cloud')),
      R(43, 9, 9, 26, 1.5, u('brickD')),
      P('M5 57 V33 L17 25 V33 L29 25 V33 L41 25 V33 H59 V57 Z', u('brick'), { sep: true }),
      D(R(10, 41, 9, 8, 1.5, u('glass'))), D(R(24, 41, 9, 8, 1.5, u('glass'))), D(R(38, 41, 9, 8, 1.5, u('glass'))),
    ],
  }),
  mountain: () => ({
    defs: [lin('m1', [[0, '#bcc6d2'], [1, '#6f7b8a']]), lin('m2', [[0, '#9aa6b4'], [1, '#56626f']])],
    parts: [
      P('M33 57 L46 28 L60 57 Z', u('m2'), { rnd: 2 }),
      P('M3 57 L24 12 L45 57 Z', u('m1'), { rnd: 2, sep: true }),
      D(P('M17 27 L24 12 L31 27 L27.5 24.5 L24 28.5 L20.5 24.5 Z', '#ffffff')),
      D(P('M42 36.5 L46 28 L50 36.5 L48 35 L46 37 L44 35 Z', '#ffffff')),
    ],
  }),
  valley: () => ({
    defs: mats('green', 'water', 'yellow'),
    parts: [
      C(46, 17, 8, u('yellow')),
      P('M3 46 Q18 24 34 40 Q46 28 61 40 V57 H3 Z', u('green'), { sep: true }),
      D(P('M26 57 Q30 48 38 46 Q44 44.5 46 40 Q47 46 42 50 Q36 54 36 57 Z', u('water'))),
    ],
  }),
  beach: () => ({
    defs: mats('water', 'sand', 'woodD', 'red'),
    parts: [
      P('M3 36 Q32 30 61 36 V57 H3 Z', u('water')),
      P('M3 46 Q30 40 61 48 V57 H3 Z', u('sand'), { sep: true }),
      S('M38 50 L30.5 22', u('woodD'), 2.6),
      P('M13.5 24.5 Q28 6 46.5 18.5 Q38.5 17.5 34 22.5 Q27 19 22 24 Q18 21 13.5 24.5 Z', u('red')),
    ],
  }),
  crane: () => ({
    defs: mats('yellow', 'yellowD', 'dark', 'steel', 'wood'),
    parts: [
      R(10, 54, 20, 5, 2, u('dark')),
      R(16.5, 12, 7, 43, 1, u('yellow')),
      D(S('M16.5 18 L23.5 24 L16.5 30 L23.5 36 L16.5 42 L23.5 48', '#c98a10', 1.4)),
      R(6, 10, 52, 6, 1.5, u('yellow')),
      R(7, 16, 8, 6, 1, u('dark')),
      D(S('M48 16 V34', '#5b6878', 1.6)),
      R(44.5, 33, 7, 4.5, 1.5, u('steel')),
      R(41, 40, 14, 11, 1.5, u('wood')),
    ],
  }),
  bridge: () => ({
    defs: mats('stone', 'water'),
    parts: [
      P('M3 52 Q32 44 61 52 V58 H3 Z', u('water')),
      P('M3 30 H61 V37 H56.5 Q46 37 42 50 H22 Q18 37 7.5 37 H3 Z', u('stone'), { sep: true }),
      D(S('M3 30 H61', '#ffffff', 1.4, { op: 0.6 })),
      R(3, 23, 58, 4, 1.5, u('stone')),
      ...[6, 18, 30, 42, 54].map((x) => R(x, 23, 4, 9, 1, u('stone'))),
    ],
  }),
  radar: () => ({
    defs: mats('white', 'steel', 'red'),
    parts: [
      R(29, 36, 6, 18, 1.5, u('steel')),
      R(20, 52, 24, 6, 2.5, u('steel')),
      P('M10 14 Q12 40 38 42 Q48 42 52 36 Z', u('white')),
      D(S('M31 28 L45 16', '#7d8a99', 1.6)),
      C(47, 14, 3.4, u('red')),
    ],
  }),

  /* ───────── outils ───────── */
  save: () => ({
    defs: mats('blue', 'white', 'steel'),
    parts: [
      P('M9 13 Q9 9 13 9 H46 L55 18 V51 Q55 55 51 55 H13 Q9 55 9 51 Z', u('blue')),
      D(R(19, 9, 24, 15, 2, u('steel'))), D(R(34, 12, 5, 9, 1, '#5b6878')),
      D(R(16, 31.5, 32, 20, 2.5, u('white'))),
      D(S('M21 38.5 H43 M21 44.5 H37', '#a9b6c4', 2)),
    ],
  }),
  export: () => ({
    defs: mats('blue', 'green'),
    parts: [
      P('M7 35 H20 L24 41.5 H40 L44 35 H57 V53 Q57 57 53 57 H11 Q7 57 7 53 Z', u('blue')),
      P('M32 5 L45.5 19 H38 V33 H26 V19 H18.5 Z', u('green'), { rnd: 2, sep: true }),
    ],
  }),
  import: () => ({
    defs: mats('blue', 'green'),
    parts: [
      P('M7 35 H20 L24 41.5 H40 L44 35 H57 V53 Q57 57 53 57 H11 Q7 57 7 53 Z', u('blue')),
      P('M32 36 L45.5 22 H38 V6 H26 V22 H18.5 Z', u('green'), { rnd: 2, sep: true }),
    ],
  }),
  trash: () => ({
    defs: mats('steel', 'steelD'),
    parts: [
      S('M26 12 V8 Q26 6 28 6 H36 Q38 6 38 8 V12', u('steelD'), 3),
      P('M14.5 19 H49.5 L45.5 57 H18.5 Z', u('steel')),
      R(10, 12, 44, 8, 3, u('steelD'), { sep: true }),
      D(S('M24 25 L25.5 51 M32 25 V51 M40 25 L38.5 51', '#7d8a99', 2)),
    ],
  }),
  flag: () => ({
    defs: mats('red', 'woodD', 'gold'),
    parts: [
      S('M15 7 V58', u('woodD'), 4.2),
      P('M17 8 Q27 3.5 36 9 Q45 14.5 56 9.5 V33 Q45 38.5 36 33 Q27 27.5 17 32 Z', u('red')),
      C(15, 5.5, 3.4, u('gold')),
      H('M20 11 Q27 8 34 12 Q27 11.5 20 14 Z', 0.45),
    ],
  }),
  search: () => ({
    defs: mats('steel', 'woodD'),
    parts: [
      R(37.5, 38, 9.5, 23, 4.5, u('woodD'), { tr: 'rotate(-45 42.25 49.5)' }),
      C(26, 26, 17, 'none', { stroke: u('steel'), sw: 6 }),
      D(C(26, 26, 14, '#d4f1ff')),
      H('M15 24 A11 11 0 0 1 24 15 A12 12 0 0 0 18 26 Z', 0.85),
    ],
  }),
  rotate: () => ({
    defs: mats('blue'),
    parts: [
      S('M49 29 A18 18 0 0 0 17.5 20', u('blue'), 7),
      P('M9.5 11.5 L12 30 L27.5 21.5 Z', u('blue'), { rnd: 2 }),
      S('M15 35 A18 18 0 0 0 46.5 44', u('blue'), 7),
      P('M54.5 52.5 L52 34 L36.5 42.5 Z', u('blue'), { rnd: 2 }),
    ],
  }),
  move: () => ({
    defs: mats('blue'),
    parts: [P('M32 3 L42.5 14 H36 V28 H50 V21.5 L61 32 L50 42.5 V36 H36 V50 H42.5 L32 61 L21.5 50 H28 V36 H14 V42.5 L3 32 L14 21.5 V28 H28 V14 H21.5 Z', u('blue'), { rnd: 1.5 })],
  }),
  pumpkin: () => ({
    defs: [lin('pk', [[0, '#ffc067'], [0.5, '#ff8a1f'], [1, '#d6540a']]), ...mats('green')],
    parts: [
      P('M30.5 22 Q29.5 13 35.5 8 L39.5 11 Q34.5 15 35 22 Z', u('green')),
      E(21, 38, 13.5, 16.5, u('pk')), E(43, 38, 13.5, 16.5, u('pk')),
      E(32, 38, 12.5, 17.5, u('pk'), { line: 1.3 }),
      D(P('M19.5 32.5 L26 27 L28 34.5 Z', '#5a1d05')), D(P('M44.5 32.5 L38 27 L36 34.5 Z', '#5a1d05')),
      D(P('M18 41 Q32 50 46 41 L43 47 L39 44.5 L35.5 48.5 L32 45.5 L28.5 48.5 L25 44.5 L21 47 Z', '#5a1d05')),
      H('M11.5 36 Q12 27 18 23.5 Q14.5 30 15 38 Z', 0.45),
    ],
  }),
  snowman: () => ({
    defs: mats('white', 'dark', 'orange', 'red'),
    parts: [
      C(32, 43, 15, u('white')),
      C(32, 23.5, 10.5, u('white'), { sep: true }),
      R(24.5, 3.5, 15, 10.5, 1.5, u('dark'), { sep: true }),
      R(20.5, 12.5, 23, 3.8, 1.9, u('dark')),
      D(P('M32 24.5 L42.5 26.5 L32 28 Z', u('orange'))),
      D(C(28.5, 21.5, 1.5, O)), D(C(35.5, 21.5, 1.5, O)),
      R(22, 31.5, 20, 5, 2.5, u('red'), { sep: true }),
      D(C(32, 42, 1.6, O)), D(C(32, 48, 1.6, O)),
    ],
  }),


  /* ───────── avatars ───────── */
  'av-builder': AV(['orange', 'yellow', 'yellowD'], () => bust(u('orange'), {
    front: [
      D(S('M16 52 H48 M14 57 H50', '#fff2a6', 2.4)),
      P('M17.5 27.5 Q17.5 13 32 13 Q46.5 13 46.5 27.5 Z', u('yellow'), { sep: true }),
      R(14, 24.5, 36, 6, 3, u('yellowD'), { sep: true }),
      D(R(29.5, 12.5, 5, 13, 2.5, '#ffe57a')),
    ],
  })),
  'av-farmer': AV(['green', 'red', 'straw'], () => bust(u('green'), {
    hair: [D(P('M19 27 Q20 20 26 19 H38 Q44 20 45 27 Q40 23 32 23 Q24 23 19 27 Z', u('hair')))],
    front: [
      D(S('M20 50 V61 M44 50 V61', '#2f7a22', 2)),
      E(32, 21.5, 23.5, 5.5, u('straw'), { sep: true }),
      P('M20.5 21 Q20.5 7.5 32 7.5 Q43.5 7.5 43.5 21 Z', u('straw'), { sep: true }),
      D(R(20.5, 16.5, 23, 4, 0, u('red'))),
      D(S('M24 11.5 Q28 9.5 32 10', '#fff4c8', 1.4, { op: 0.8 })),
    ],
  })),
  'av-mechanic': AV(['blue', 'red', 'redD'], () => bust(u('blue'), {
    back: [P('M42 22 Q53 24 51 38 Q47 33 42 32 Z', u('hair'))],
    hair: [P('M18.5 30 Q17 16 32 15 Q47 16 45.5 30 Q42 22 32 22 Q22 22 18.5 30 Z', u('hair'), { line: 1.2 })],
    front: [
      D(S('M22 49 V61 M42 49 V61', '#ffd23a', 2.2)),
      P('M17.5 23 Q17.5 12 32 12 Q46.5 12 46.5 23 Z', u('red'), { sep: true }),
      P('M15 23 H49 Q49 26.5 45 26.5 H19 Q15 26.5 15 23 Z', u('redD'), { sep: true }),
    ],
  })),
  'av-beard': AV(['red'], () => bust(u('red'), {
    hair: [
      P('M18.5 29 Q17 15 32 14.5 Q47 15 45.5 29 Q43 21 32 21.5 Q21 21 18.5 29 Z', u('hair'), { line: 1.2 }),
      P('M18.5 31 Q19 46 32 47.5 Q45 46 45.5 31 Q43 37 38.5 36.5 Q35 35 32 36 Q29 35 25.5 36.5 Q21 37 18.5 31 Z', u('hair'), { line: 1.2 }),
      D(S('M28.5 39.5 Q32 41 35.5 39.5', '#3a1d0b', 1.5)),
    ],
    faceOpts: { noMouth: true },
  })),
  'av-queen': AV(['pink', 'gold', 'red', 'blue', 'blond'], () => bust(u('pink'), {
    back: [P('M15 33 Q13 15 32 14.5 Q51 15 49 33 Q51 46 44 52 H20 Q13 46 15 33 Z', u('blond'))],
    hair: [P('M18 30 Q18 17 32 17 Q46 17 46 30 Q42 22 34 22.5 Q27 23 18 30 Z', u('blond'), { line: 1.2 })],
    front: [
      P('M21.5 18 L24 8 L28 13.5 L32 6.5 L36 13.5 L40 8 L42.5 18 Z', u('gold'), { rnd: 1.5, sep: true }),
      D(C(32, 14.5, 1.8, u('red'))), D(C(26, 15.5, 1.3, u('blue'))), D(C(38, 15.5, 1.3, u('blue'))),
    ],
    ears: false,
  })),
  'av-king': AV(['red', 'gold', 'blue', 'white'], () => bust(u('red'), {
    hair: [
      P('M18.5 29 Q17.5 17 32 17 Q46.5 17 45.5 29 Q43 23 32 23 Q21 23 18.5 29 Z', u('hair'), { line: 1.2 }),
      P('M23 38 Q32 46 41 38 Q38 44 32 44.5 Q26 44 23 38 Z', u('hair'), { line: 1 }),
    ],
    front: [
      P('M11 52 Q20 46 32 47 Q44 46 53 52 L51 56 Q41 51 32 52 Q23 51 13 56 Z', u('white'), { sep: true }),
      D(C(20, 52.5, 1, O)), D(C(32, 50, 1, O)), D(C(44, 52.5, 1, O)),
      P('M19.5 20 L21.5 6 L26.5 12.5 L32 4.5 L37.5 12.5 L42.5 6 L44.5 20 Z', u('gold'), { rnd: 1.5, sep: true }),
      D(C(32, 15, 2, u('red'))), D(C(25, 16, 1.5, u('blue'))), D(C(39, 16, 1.5, u('blue'))),
    ],
  })),
  'av-wizard': AV(['purple', 'yellow', 'beard'], () => bust(u('purple'), {
    hair: [
      P('M18 32 Q18 50 32 56 Q46 50 46 32 Q43 38 38.5 37.5 Q35 36 32 37 Q29 36 25.5 37.5 Q21 38 18 32 Z', u('beard'), { line: 1.2 }),
      D(S('M28.5 40 Q32 41.5 35.5 40', '#9aa6b4', 1.4)),
    ],
    front: [
      P('M14 25 Q32 30 50 25 L46 21 Q38 2 31 2.5 Q36 9 33 21 Q24 21 18 21 Z', u('purple'), { sep: true }),
      P('M12 25.5 Q32 31 52 25.5 Q50 21.5 32 21.5 Q14 21.5 12 25.5 Z', u('purple'), { sep: true }),
      D(P(star(25, 16, 3, 1.3), u('yellow'))), D(P(star(37.5, 12.5, 2.4, 1), u('yellow'))),
    ],
    faceOpts: { noMouth: true, ey: 32 },
  })),
  'av-elf': AV(['green', 'greenD', 'blond'], () => bust(u('green'), {
    back: [P('M15 32 Q13 15 32 14 Q51 15 49 32 Q50 44 45 50 H19 Q14 44 15 32 Z', u('blond'))],
    hair: [P('M18.5 29 Q18.5 17 32 17 Q45.5 17 45.5 29 Q42 22 32 23 Q22 22 18.5 29 Z', u('blond'), { line: 1.2 })],
    front: [
      P('M17 31 L7 22 L18.5 27 Z', u('sk'), { sep: true }),
      P('M47 31 L57 22 L45.5 27 Z', u('sk'), { sep: true }),
      D(S('M19 21 Q32 15 45 21', u('greenD'), 2.6)),
      D(E(26, 18.2, 3, 1.6, u('green'), { tr: 'rotate(-20 26 18.2)' })),
    ],
    ears: false,
  })),
  'av-fox': () => ({
    defs: [lin('fx', [[0, '#ffb35c'], [0.6, '#f07a1f'], [1, '#c4540d']]), lin('wh', MATS.white)],
    parts: [
      P('M14 26 L13 6 L28 16 Z', u('fx')), P('M50 26 L51 6 L36 16 Z', u('fx')),
      D(P('M16.5 20 L16 10.5 L24 16 Z', '#5a2a10', { op: 0.7 })), D(P('M47.5 20 L48 10.5 L40 16 Z', '#5a2a10', { op: 0.7 })),
      P('M8 33 Q8 14 32 14 Q56 14 56 33 Q56 44 46 51 Q40 57 32 57 Q24 57 18 51 Q8 44 8 33 Z', u('fx'), { sep: true }),
      D(P('M10.5 36 Q16 33 23 38 Q28 42 32 42 Q36 42 41 38 Q48 33 53.5 36 Q52 46 44 51.5 Q38 56 32 56 Q26 56 20 51.5 Q12 46 10.5 36 Z', u('wh'))),
      D(E(24, 30, 2.3, 3, O)), D(E(40, 30, 2.3, 3, O)),
      D(C(24.7, 29, 0.8, '#fff')), D(C(40.7, 29, 0.8, '#fff')),
      D(E(32, 43, 3.6, 2.6, O)),
      H('M12 30 Q13 19 24 16.5 Q16 22 15 31 Z', 0.4),
    ],
  }),
  'av-bear': () => ({
    defs: [lin('br', [[0, '#c98b55'], [0.6, '#9a5f30'], [1, '#6e3e18']]), lin('mz', [[0, '#f2d3a8'], [1, '#d9a86e']])],
    parts: [
      C(15.5, 16, 7.5, u('br')), C(48.5, 16, 7.5, u('br')),
      D(C(15.5, 16, 4, '#e0b07a')), D(C(48.5, 16, 4, '#e0b07a')),
      C(32, 34, 22, u('br'), { sep: true }),
      D(E(32, 42.5, 10, 8, u('mz'))),
      D(E(32, 38.5, 3.8, 2.8, O)),
      D(S('M32 41 V44.5 M28.5 45.5 Q32 47.5 35.5 45.5', O, 1.5)),
      D(C(23.5, 30, 2.2, O)), D(C(40.5, 30, 2.2, O)),
      D(C(24.2, 29.2, 0.7, '#fff')), D(C(41.2, 29.2, 0.7, '#fff')),
      H('M13 33 Q14 21 24 16.5 Q17 23 16.5 34 Z', 0.35),
    ],
  }),
  'av-vampire': () => ({
    defs: [lin('pale', [[0, '#f4f0fb'], [1, '#c9bfe0']]), lin('cape', [[0, '#5a5f6e'], [1, '#22252c']]), lin('capeR', [[0, '#e8463a'], [1, '#8e1a14']]), lin('vh', MATS.vh), ...mats('hair')],
    parts: [
      P('M6 61 L14 38 Q32 52 50 38 L58 61 Z', u('capeR')),
      R(27.5, 38, 9, 9, 3, u('pale')),
      P('M12 61 Q12 46 32 46 Q52 46 52 61 Z', u('cape'), { sep: true }),
      C(18.6, 31, 3.2, u('pale')), C(45.4, 31, 3.2, u('pale')),
      C(32, 30, 13.5, u('pale')),
      D(C(27, 31, 1.7, '#b31b1b')), D(C(37, 31, 1.7, '#b31b1b')),
      D(S('M28.3 36.4 Q32 38.6 35.7 36.4', O, 1.6)),
      D(P('M29.3 37 L30.2 40 L31 37.3 Z', '#fff')), D(P('M33 37.3 L33.8 40 L34.7 37 Z', '#fff')),
      P('M18.5 28 Q17.5 15.5 32 15.5 Q46.5 15.5 45.5 28 Q42 21 36 21 L32 26 L28 21 Q22 21 18.5 28 Z', 'url(#vh)', { line: 1.2 }),
    ],
  }),
  'av-santa': AV(['red', 'white'], () => bust(u('red'), {
    hair: [
      P('M17.5 31 Q18 49 32 54 Q46 49 46.5 31 Q43 37.5 38.5 37 Q35 35.5 32 36.5 Q29 35.5 25.5 37 Q21 37.5 17.5 31 Z', u('white'), { line: 1.2 }),
      D(P('M25 37.5 Q28.5 34.5 32 36.5 Q35.5 34.5 39 37.5 Q35.5 39.5 32 38.4 Q28.5 39.5 25 37.5 Z', '#f2f6fa', { line: 1 })),
    ],
    front: [
      D(S('M32 47 V61', '#ffffff', 3)),
      P('M17 24 Q19 6 34 7 Q48 8 52 22 L47 24 Z', u('red'), { sep: true }),
      R(14.5, 21, 35, 7, 3.5, u('white'), { sep: true }),
      C(51.5, 22, 4.2, u('white'), { sep: true }),
    ],
    faceOpts: { noMouth: true },
  })),
  'av-butterfly': () => ({
    defs: [lin('w1', [[0, '#a6e8ff'], [0.5, '#4aa8f5'], [1, '#7a3fd0']]), lin('w2', [[0, '#ffd0f0'], [1, '#c45ad8']]), ...mats('dark')],
    parts: [
      P('M31 30 Q20 6 8 10 Q2 14 6 24 Q10 32 30 33 Z', u('w1')),
      P('M33 30 Q44 6 56 10 Q62 14 58 24 Q54 32 34 33 Z', u('w1')),
      P('M30 35 Q14 36 12 46 Q12 55 20 54 Q28 52 31 38 Z', u('w2')),
      P('M34 35 Q50 36 52 46 Q52 55 44 54 Q36 52 33 38 Z', u('w2')),
      D(C(14.5, 17, 3.2, '#fff', { op: 0.7 })), D(C(49.5, 17, 3.2, '#fff', { op: 0.7 })),
      D(C(19, 46, 2.4, '#fff', { op: 0.6 })), D(C(45, 46, 2.4, '#fff', { op: 0.6 })),
      R(29.5, 24, 5, 28, 2.5, u('dark'), { sep: true }),
      S('M31 25 Q27 15 22 13 M33 25 Q37 15 42 13', '#3a1d0b', 1.6),
    ],
  }),

  /* ───────── boules de couleur (thèmes) ───────── */
  'ball-blue': ball([[0, '#9fe4ff'], [0.5, '#3faaf6'], [1, '#1c63c6']]),
  'ball-red': ball([[0, '#ff9b8c'], [0.5, '#e8382d'], [1, '#a81e17']]),
  'ball-green': ball([[0, '#a5f07c'], [0.5, '#2fb34b'], [1, '#167a2c']]),
  'ball-yellow': ball([[0, '#fff0a0'], [0.5, '#ffbf2e'], [1, '#e08a0c']]),
  'ball-violet': ball([[0, '#e5c4ff'], [0.5, '#9b5ae0'], [1, '#5e2aa8']]),
  'ball-black': ball([[0, '#8a92a0'], [0.5, '#454b56'], [1, '#22262d']]),
  'ball-teal': ball([[0, '#a6fff2'], [0.5, '#2ec4b6'], [1, '#13857a']]),
  path: () => ({ defs: mats('dirt'), parts: [R(8, 8, 48, 48, 9, u('dirt')), D(C(22, 24, 2.4, '#e8c08e')), D(C(40, 38, 3, '#7e4c24', { op: 0.5 })), D(C(36, 18, 1.8, '#7e4c24', { op: 0.5 }))] }),
  paved: () => ({ defs: mats('asphalt'), parts: [R(8, 8, 48, 48, 9, u('asphalt')), D(S('M32 13 V22 M32 28 V36 M32 42 V51', '#ffd23a', 3))] }),
};

/* ───────── événements de la semaine ───────── */
const cloudPuff = (x, y, s) => G(`translate(${x} ${y}) scale(${s})`, [P('M-12 6 Q-18 6 -18 0 Q-18 -6 -11 -6 Q-9 -13 -1 -13 Q7 -13 9 -6 Q18 -6 18 1 Q18 6 12 6 Z', u('cloud'))], { sep: true });
Object.assign(ICON_DEFS, {
  token: () => ({
    defs: [lin('t1', [[0, '#ffd3ee'], [0.5, '#ff4fb0'], [1, '#b81e78']]), lin('t2', [[0, '#d83a92'], [1, '#86104f']])],
    parts: [
      C(32, 35.5, 23.5, u('t2')),
      C(32, 31, 23.5, u('t1')),
      D(C(32, 31, 17.5, 'none', { stroke: '#ffd34d', sw: 2.4 })),
      D(P(star(32, 31.8, 10.5, 4.6), '#ffffff', { stroke: '#ffb3dc', sw: 1.4 })),
      H('M13.5 27 A19 19 0 0 1 29 12.6 A20.5 20.5 0 0 0 16.4 31 Z', 0.65),
    ],
  }),
  ticket: () => ({
    defs: [lin('tk', [[0, '#ffe58a'], [0.5, '#ffb72e'], [1, '#f08a12']]), ...mats('red')],
    parts: [
      G('rotate(-16 32 32)', [
        P('M6 19 H58 V27.5 A4.5 4.5 0 0 0 58 36.5 V45 H6 V36.5 A4.5 4.5 0 0 0 6 27.5 Z', u('tk')),
        D(S('M44 21 V43', '#c96a0a', 1.6, { dash: '2.6 2.4' })),
        D(R(10.5, 23, 29, 18, 3, 'none', { stroke: '#fff3c4', sw: 1.6 })),
        D(P(star(25, 32, 7, 3.1), u('red'), { line: 1 })),
        D(C(51, 32, 3, '#c96a0a', { op: 0.5 })),
      ]),
    ],
  }),
  firework: () => {
    const cols = ['red', 'yellow', 'blue', 'green', 'pink', 'orange', 'purple', 'yellow', 'red', 'blue'];
    const n = 10, cx = 32, cy = 31;
    const pt = (a, r) => `${f2(cx + Math.cos(a) * r)} ${f2(cy + Math.sin(a) * r)}`;
    const rays = range(n).map((i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2, w = 0.15;
      return P(`M${pt(a, 8)} L${pt(a - w, 16)} L${pt(a, 23)} L${pt(a + w, 16)} Z`, u(cols[i]), { rnd: 1.2 });
    });
    const dots = range(n).map((i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return C(f2(cx + Math.cos(a) * 27.5), f2(cy + Math.sin(a) * 27.5), 2.4, u(cols[i]));
    });
    return {
      defs: [...mats('red', 'yellow', 'blue', 'green', 'orange', 'purple'), lin('pink', MATS.pink)],
      parts: [...rays, ...dots, C(cx, cy, 7, u('yellow'), { sep: true }), D(P(sparkle(cx, cy, 4.6), '#fff')),
        D(P(sparkle(9, 9, 4), '#fff3a0')), D(P(sparkle(55, 54, 3.4), '#fff3a0'))],
    };
  },
  crepe: () => ({
    defs: [lin('cp', [[0, '#ffe2a0'], [1, '#e7a64a']]), ...mats('white', 'red')],
    parts: [
      E(32, 47, 27, 9, u('white')),
      E(32, 43, 21, 7.5, u('cp'), { sep: true }),
      E(32, 37, 21, 7.5, u('cp'), { sep: true }),
      E(32, 31, 21, 7.5, u('cp'), { sep: true }),
      D(P('M19 30 Q26 25 34 27 Q42 25 45 30 Q42 34 38 32 L37 37 Q35 39 34 35 Q30 34 26 34 L25 38 Q23 39 23 34 Q19 33 19 30 Z', '#7a3a1a')),
      R(27.5, 21, 9, 7, 2, '#ffe66a', { sep: true }),
      C(45, 23, 4.5, u('red'), { sep: true }),
      D(C(46.5, 21.5, 1.2, '#fff', { op: 0.7 })),
    ],
  }),
  mask: () => ({
    defs: [...mats('purple', 'gold', 'red', 'blue')],
    parts: [
      S('M52 40 L60 58', u('gold'), 3.4),
      P('M24 20 Q16 4 22 3 Q28 6 28 19 Z', u('red')),
      P('M30 19 Q32 1 37 2 Q41 6 35 20 Z', u('blue')),
      P('M37 21 Q46 6 50 9 Q51 15 41 23 Z', u('gold')),
      P('M5 28 Q7 17 20 19 Q28 20.5 32 26 Q36 20.5 44 19 Q57 17 59 28 Q59 42 46 44 Q38 45 32 38 Q26 45 18 44 Q5 42 5 28 Z', u('purple'), { sep: true }),
      D(E(19.5, 30, 6.5, 4.5, O, { tr: 'rotate(8 19.5 30)' })),
      D(E(44.5, 30, 6.5, 4.5, O, { tr: 'rotate(-8 44.5 30)' })),
      D(S('M8 27 Q10 20 19 21.5 M56 27 Q54 20 45 21.5', '#ffd34d', 1.8)),
      D(C(32, 31, 2.4, '#ffd34d')),
      H('M9 27 Q11 21 18 21.5 Q12 24 11 30 Z', 0.55),
    ],
  }),
  clover: () => {
    const leaf = 'M32 32 Q21 31 18.5 22 Q17.5 13.5 24.5 13 Q29.5 13 32 18 Q34.5 13 39.5 13 Q46.5 13.5 45.5 22 Q43 31 32 32 Z';
    return {
      defs: mats('green', 'greenD'),
      parts: [
        S('M33 36 Q38 49 30 59', u('greenD'), 3.8),
        ...[0, 90, 180, 270].map((a) => G(`rotate(${a} 32 32)`, [P(leaf, u('green'), { line: 1.3 })])),
        D(C(32, 32, 2.6, '#2f8a25')),
        H('M22 16 Q26 15 28.5 18.5 Q24 18 22.5 21 Z', 0.6),
      ],
    };
  },
  fish: () => ({
    defs: [lin('fb', [[0, '#a6ecff'], [0.5, '#35aef2'], [1, '#1c63c6']]), ...mats('orange')],
    parts: [
      P('M47 32 L61 18 Q57 32 61 46 Z', u('orange')),
      P('M24 19 Q33 6 42 20 Z', u('orange')),
      P('M5 32 Q15 15 33 16 Q48 17 52 32 Q48 47 33 48 Q15 49 5 32 Z', u('fb'), { sep: true }),
      D(S('M30 18 Q36 32 30 46 M39 19 Q44 32 39 45', '#bff1ff', 2, { op: 0.75 })),
      D(C(16.5, 28.5, 4.2, '#fff')), D(C(15.6, 28.8, 2.2, O)),
      D(S('M7.5 35 Q11 37.5 14.5 36', O, 1.6)),
      H('M10 30 Q16 20 28 19 Q18 23 13 31 Z', 0.55),
    ],
  }),
  egg: () => ({
    defs: [lin('eg', [[0, '#fff3a8'], [1, '#ffc93a']]), '<clipPath id="ce"><path d="M32 6 Q50 6 52 34 Q52 58 32 58 Q12 58 12 34 Q14 6 32 6 Z"/></clipPath>', lin('pk', MATS.pink), ...mats('blue', 'green')],
    parts: [
      P('M32 6 Q50 6 52 34 Q52 58 32 58 Q12 58 12 34 Q14 6 32 6 Z', u('eg')),
      D(G(null, [
        P('M8 26 L14 21 L20 26 L26 21 L32 26 L38 21 L44 26 L50 21 L56 26 V31 L50 26 L44 31 L38 26 L32 31 L26 26 L20 31 L14 26 L8 31 Z', u('pk')),
        R(6, 38, 52, 6, 0, u('blue')),
        ...range(5).map((k) => C(16 + k * 8, 49.5, 2.4, u('green'))),
        ...range(3).map((k) => C(24 + k * 8, 15, 2.2, u('pk'))),
      ], { at: { 'clip-path': 'url(#ce)' } })),
      H('M19 30 Q19 14 30 9.5 Q23 18 23 32 Z', 0.6),
    ],
  }),
  lily: () => {
    const bell = (x, y) => P(`M${x - 5.5} ${y + 6} Q${x - 6} ${y - 3} ${x} ${y - 3} Q${x + 6} ${y - 3} ${x + 5.5} ${y + 6} Q${x + 3.5} ${y + 3.5} ${x + 1.8} ${y + 6.5} Q${x} ${y + 4} ${x - 1.8} ${y + 6.5} Q${x - 3.5} ${y + 3.5} ${x - 5.5} ${y + 6} Z`, u('white'), { sep: true });
    return {
      defs: mats('green', 'greenD', 'white'),
      parts: [
        P('M20 59 Q6 36 17 12 Q28 33 27 59 Z', u('green')),
        S('M29 59 Q28 30 38 16 Q44 9 51 12', u('greenD'), 2.6),
        S('M36 21 V24 M43 12.5 V17 M50 12 V20', u('greenD'), 1.8),
        bell(36, 28), bell(43.5, 21), bell(50, 25),
        bell(32, 39),
        P('M33 59 Q46 44 56 34 Q52 52 38 59 Z', u('greenD'), { sep: true }),
      ],
    };
  },
  music: () => ({
    defs: [lin('m', [[0, '#c9a6ff'], [0.5, '#7a5cff'], [1, '#3a2aa8']])],
    parts: [
      P('M24 15 L53 8 V18 L24 25 Z', u('m'), { rnd: 1.5 }),
      R(23, 15, 5, 34, 2, u('m')),
      R(48.5, 9, 5, 34, 2, u('m')),
      E(19, 49, 9, 6.5, u('m'), { tr: 'rotate(-22 19 49)' }),
      E(44.5, 43, 9, 6.5, u('m'), { tr: 'rotate(-22 44.5 43)' }),
      H('M13 47 Q15 43 20 43 Q16 46 15 49 Z', 0.6),
      H('M38.5 41 Q40.5 37 45.5 37 Q41.5 40 40.5 43 Z', 0.6),
    ],
  }),
  grapes: () => {
    const pts = [[22, 24], [32, 23], [42, 24], [17, 33], [27, 33], [37, 33], [47, 33], [22, 42], [32, 42], [42, 42], [27, 51], [37, 51], [32, 59]];
    return {
      defs: [lin('gp', [[0, '#d9a6ff'], [0.5, '#8a3ad6'], [1, '#4a1a8a']]), ...mats('green', 'woodD')],
      parts: [
        S('M32 17 Q33 9 38 5', u('woodD'), 3),
        P('M34 13 Q44 3 56 8 Q50 18 38 16 Z', u('green')),
        ...pts.map(([x, y]) => C(x, y - 4, 6.2, u('gp'), { sep: true })),
        ...pts.map(([x, y]) => D(C(x - 2, y - 6.5, 1.5, '#fff', { op: 0.6 }))),
      ],
    };
  },
  xmastree: () => ({
    defs: mats('wood', 'pineG', 'gold', 'red', 'blue'),
    parts: [
      R(28.5, 49, 7, 9, 2, u('wood')),
      P('M32 26 L54 51 H10 Z', u('pineG'), { line: 1.4 }),
      P('M32 16 L49.5 38 H14.5 Z', u('pineG'), { line: 1.4 }),
      P('M32 7 L45 25 H19 Z', u('pineG'), { line: 1.4 }),
      D(S('M21 33 Q32 37 43 31 M16 45 Q32 50 48 43', '#ffd34d', 2)),
      C(23, 41, 3, u('red'), { sep: true }), C(41, 46, 3, u('blue'), { sep: true }), C(36, 33, 2.6, u('gold'), { sep: true }), C(27, 25, 2.6, u('red'), { sep: true }),
      P(star(32, 7.5, 7.5, 3.3), u('gold'), { sep: true, rnd: 1 }),
    ],
  }),
  balloon: () => ({
    defs: [lin('b1', [[0, '#ff9b7a'], [1, '#d63a1a']]), lin('b2', [[0, '#fff2a0'], [1, '#f2b01a']]), '<clipPath id="cb"><path d="M32 4 Q55 4 55 26 Q55 38 41 46 H23 Q9 38 9 26 Q9 4 32 4 Z"/></clipPath>', ...mats('wood')],
    parts: [
      D(S('M24 46 L26 51 M40 46 L38 51', '#5a3a22', 1.4)),
      R(24.5, 50, 15, 9, 2.5, u('wood')),
      P('M32 4 Q55 4 55 26 Q55 38 41 46 H23 Q9 38 9 26 Q9 4 32 4 Z', u('b1')),
      D(G(null, [P('M21 2 Q16 24 26 47 H31 Q24 24 27 2 Z', u('b2')), P('M37 2 Q40 24 33 47 H38 Q48 24 43 2 Z', u('b2')), R(4, 34, 56, 3, 0, '#ffffff', { op: 0.8 })], { at: { 'clip-path': 'url(#cb)' } })),
      H('M14 24 Q14 10 25 7 Q17 14 18 28 Z', 0.55),
    ],
  }),
  circus: () => ({
    defs: [...mats('red', 'yellow', 'blue', 'woodD'), lin('w', MATS.white), '<clipPath id="cr"><path d="M5 31 L32 10 L59 31 Z"/></clipPath>', '<clipPath id="cw"><rect x="9" y="30" width="46" height="27"/></clipPath>'],
    parts: [
      S('M32 11 V3', u('woodD'), 2.4),
      P('M33 3 L43 6 L33 9 Z', u('blue')),
      R(9, 30, 46, 27, 1.5, u('red')),
      D(G(null, range(6).map((k) => R(9 + k * 8, 30, 4, 27, 0, u('yellow'))), { at: { 'clip-path': 'url(#cw)' } })),
      P('M5 31 L32 10 L59 31 Z', u('w'), { rnd: 2 }),
      D(G(null, range(6).map((k) => P(`M32 10 L${5 + k * 9} 31 L${9.5 + k * 9} 31 Z`, u('red'))), { at: { 'clip-path': 'url(#cr)' } })),
      D(P('M25 57 V44 Q25 38 32 38 Q39 38 39 44 V57 Z', '#3a1408')),
      ...range(5).map((k) => D(C(9 + k * 11.5, 31, 2.4, u('yellow')))),
    ],
  }),
  lantern: () => ({
    defs: [lin('ln', [[0, '#ffd27a'], [0.45, '#ff6a2a'], [1, '#c92a16']]), ...mats('gold', 'red')],
    parts: [
      S('M32 4 V12', '#5a3a22', 1.8),
      R(24, 10, 16, 6, 2, u('gold')),
      E(32, 33, 19, 18.5, u('ln'), { sep: true }),
      D(S('M32 15 V51 M23 16.5 Q16 33 23 49.5 M41 16.5 Q48 33 41 49.5', '#a8200f', 1.5, { op: 0.6 })),
      R(24, 50, 16, 6, 2, u('gold'), { sep: true }),
      S('M32 56 V62', u('red'), 3),
      H('M18 30 Q19 21 27 17 Q21 25 21.5 35 Z', 0.55),
    ],
  }),
  basket: () => ({
    defs: [lin('bk', [[0, '#e9b878'], [1, '#a8682f']]), ...mats('red', 'woodD')],
    parts: [
      S('M15 30 Q15 8 32 8 Q49 8 49 30', u('woodD'), 4),
      P('M11 27 H53 L56 33 H8 Z', u('red')),
      D(G(null, range(5).map((k) => R(12 + k * 9, 27, 4.5, 3, 0, '#ffffff')))),
      P('M8 33 H56 L50 57 H14 Z', u('bk'), { sep: true }),
      D(S('M10 40 H54 M12 47 H52 M13.5 53 H50.5', '#8a5226', 1.6)),
      D(S('M20 33 L22 57 M32 33 V57 M44 33 L42 57', '#c98a4b', 1.6)),
    ],
  }),
  icecream: () => ({
    defs: [lin('cn', [[0, '#ffd590'], [1, '#d98a3a']]), lin('pk', MATS.pink), lin('mt', [[0, '#d9fff0'], [1, '#6fd6b0']]), ...mats('red')],
    parts: [
      P('M19 36 H45 L32 61 Z', u('cn'), { rnd: 1.5 }),
      D(S('M23 40 L35 56 M29 38 L39 48 M41 40 L29 56 M35 38 L25 48', '#b8702a', 1.4)),
      P('M16.5 37 Q14 26 22 23 Q24 15 32 15 Q40 15 42 23 Q50 26 47.5 37 Q44 41 41 37 Q37 42 32 38 Q27 42 23 37 Q20 41 16.5 37 Z', u('mt'), { sep: true }),
      C(32, 17, 9.5, u('pk'), { sep: true }),
      S('M34 9 Q36 4 40 3', '#5a3a22', 1.6),
      C(33, 9, 3.6, u('red'), { sep: true }),
      H('M24 26 Q26 21 31 20 Q27 24 27 28 Z', 0.6),
      H('M25.5 15 Q27 10 31 9.5 Q28 13 28 16 Z', 0.6),
    ],
  }),
  ship: () => ({
    defs: [...mats('wood', 'woodD', 'white', 'red', 'blue'), lin('sl', [[0, '#ffffff'], [1, '#e6dcc4']])],
    parts: [
      S('M30 50 V6', u('woodD'), 3.2),
      P('M31 6 L42 9.5 L31 13 Z', u('red')),
      P('M33 12 Q50 22 52 44 H33 Z', u('sl')),
      P('M28 16 Q15 28 12 44 H28 Z', u('sl'), { sep: true }),
      D(S('M33 22 Q43 27 46 36 M28 26 Q20 32 17.5 38', '#d9ccae', 1.6)),
      P('M5 44 H59 L53 56 Q32 60 11 56 Z', u('wood'), { sep: true }),
      D(S('M8 49.5 H56', '#8c4f22', 1.8)),
      D(C(20, 49.5, 1.9, u('blue'))), D(C(32, 49.5, 1.9, u('blue'))), D(C(44, 49.5, 1.9, u('blue'))),
      H('M9 46 H40 Q22 48 12 52 Z', 0.4),
    ],
  }),
  rainbow: () => {
    const cols = ['#ff5a4a', '#ffa23a', '#ffe14d', '#5ad15a', '#4da6ff', '#9b6bff'];
    return {
      defs: [...mats('cloud')],
      parts: [
        ...cols.map((c, k) => S(`M${8 + k * 4} 46 A${24 - k * 4} ${24 - k * 4} 0 0 1 ${56 - k * 4} 46`, c, 4.3)),
        cloudPuff(11, 47, 0.62),
        cloudPuff(53, 47, 0.62),
      ],
    };
  },
});

/* ───────── v3.2 : animaux de la ferme ───────── */
Object.assign(ICON_DEFS, {
  chicken: () => ({
    defs: [lin('hb', [[0, '#ffffff'], [0.6, '#f1e7d6'], [1, '#cdb894']]), ...mats('red', 'yellow')],
    parts: [
      P('M44 14 Q48 8 52 13 Q56 10 57 16 Q60 18 56 21 L46 22 Z', u('red')),
      P('M12 36 Q8 22 20 24 Q30 12 46 18 Q56 22 54 34 Q54 50 36 54 Q18 56 12 36 Z', u('hb'), { sep: true }),
      P('M54 26 L63 30 L54 33 Z', u('yellow')),
      P('M53 34 Q57 38 53 42 Q50 38 53 34 Z', u('red')),
      D(C(48, 27, 2.6, O)), D(C(48.8, 26.2, 0.9, '#fff')),
      D(S('M20 38 Q28 46 38 40', '#cdb894', 2.4)),
      D(S('M30 54 V60 M38 53 V60', '#f29a12', 2.6)),
      H('M16 32 Q16 25 24 25.5 Q19 28 19 34 Z', 0.65),
    ],
  }),
  cow: () => ({
    defs: [lin('cw', [[0, '#ffffff'], [1, '#d7dde4']]), lin('mz', [[0, '#ffd0d8'], [1, '#f08aa0']]), ...mats('dark', 'yellow')],
    parts: [
      P('M14 16 Q6 10 4 18 Q8 22 16 22 Z', u('yellow')), P('M50 16 Q58 10 60 18 Q56 22 48 22 Z', u('yellow')),
      P('M6 26 Q2 22 6 20 L16 22 Z', u('dark')), P('M58 26 Q62 22 58 20 L48 22 Z', u('dark')),
      P('M14 22 Q14 12 32 12 Q50 12 50 22 L50 38 Q50 44 44 46 L20 46 Q14 44 14 38 Z', u('cw'), { sep: true }),
      D(P('M20 14 Q28 13 30 20 Q26 26 18 24 Q15 18 20 14 Z', '#3a3f4a')),
      D(P('M42 26 Q48 24 49 30 Q46 34 41 32 Z', '#3a3f4a')),
      P('M16 40 Q16 34 32 34 Q48 34 48 40 Q48 54 32 54 Q16 54 16 40 Z', u('mz'), { sep: true }),
      D(E(25, 44, 2.6, 3.2, '#b04a62')), D(E(39, 44, 2.6, 3.2, '#b04a62')),
      D(E(24, 27, 2.8, 3.4, O)), D(E(40, 27, 2.8, 3.4, O)), D(C(25, 25.8, 1, '#fff')), D(C(41, 25.8, 1, '#fff')),
      H('M18 22 Q18 15 27 14 Q21 18 21 24 Z', 0.6),
    ],
  }),
});
