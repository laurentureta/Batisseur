// Icônes du jeu dessinées en SVG (style jeu mobile : contour brun épais, dégradés, reflets).
// Chaque icône est une petite image (data URI) : icon('coins') ou iconHTML('gem').
// emojify() remplace automatiquement les emoji de l'interface par ces icônes.
import { ICON_DEFS } from './iconDefs.js';

const O = '#3a1d0b'; // contour
const OW = 5; // épaisseur du contour (repère 64 × 64)

/* ───────── Petit langage de dessin ───────── */
function attrs(a) {
  let s = '';
  if (a) for (const k in a) s += ` ${k}="${a[k]}"`;
  return s;
}

function outlinePass(p, col) {
  if (p.out === false) return '';
  if (p.el === 'g') return `<g${attrs(p.a)}>${p.c.map((c) => outlinePass(c, col)).join('')}</g>`;
  const w = (p.stroke ? p.sw || 3 : 0) + OW;
  const fill = p.stroke && (p.fill == null || p.fill === 'none') ? 'none' : col;
  return `<${p.el}${attrs(p.a)} fill="${fill}" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

function fillPass(p) {
  if (p.only === 'outline') return '';
  if (p.el === 'g') return `<g${attrs(p.a)}${p.op != null ? ` opacity="${p.op}"` : ''}>${p.c.map(fillPass).join('')}</g>`;
  let s = `<${p.el}${attrs(p.a)} fill="${p.fill == null ? 'none' : p.fill}"`;
  if (p.stroke) s += ` stroke="${p.stroke}" stroke-width="${p.sw || 3}" stroke-linecap="round" stroke-linejoin="round"`;
  else if (p.line) s += ` stroke="${O}" stroke-width="${p.line}" stroke-linejoin="round"`;
  else if (p.rnd) s += ` stroke="${p.fill}" stroke-width="${p.rnd}" stroke-linejoin="round"`;
  if (p.dash) s += ` stroke-dasharray="${p.dash}"`;
  if (p.op != null) s += ` opacity="${p.op}"`;
  if (p.at) s += attrs(p.at);
  return s + '/>';
}

/** SVG complet d'une icône. */
export function iconSVG(name) {
  const def = ICON_DEFS[name];
  if (!def) return '';
  const { defs = [], parts } = def();
  const outline = parts.map((p) => outlinePass(p, O)).join('');
  const shadow = parts.map((p) => outlinePass(p, '#000')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${defs.join('')}</defs>`
    + `<g transform="translate(0 2.4)" opacity="0.26">${shadow}</g><g>${outline}</g><g>${parts.map(fillPass).join('')}</g></svg>`;
}

const URLS = new Map();
/** Adresse (data URI) d'une icône, mise en cache. */
export function iconURL(name) {
  let u = URLS.get(name);
  if (u === undefined) {
    const svg = iconSVG(name);
    u = svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) : '';
    URLS.set(name, u);
  }
  return u;
}

export function hasIcon(name) {
  return !!ICON_DEFS[name];
}

/** Élément <img> d'une icône. */
export function icon(name, cls = '') {
  const img = document.createElement('img');
  img.className = 'ico' + (cls ? ' ' + cls : '');
  img.src = iconURL(name);
  img.alt = '';
  img.draggable = false;
  img.dataset.i = name;
  return img;
}

export function iconHTML(name, cls = '') {
  return `<img class="ico${cls ? ' ' + cls : ''}" src="${iconURL(name)}" alt="" draggable="false" data-i="${name}">`;
}

/* ───────── Emoji → icônes ───────── */
export const EMOJI = {
  '🪙': 'coins', '💎': 'gem', '🪵': 'wood', '🪨': 'stone', '🍞': 'bread', '🌾': 'wheat', '🥣': 'flour', '🪚': 'planks',
  '🏺': 'clay', '🧱': 'bricks', '🔩': 'iron', '🛠': 'tools', '⭐': 'star', '🌟': 'star', '🎖': 'medal', '🏅': 'medal',
  '👥': 'people', '👤': 'person', '👷': 'av-builder', '🧑‍🌾': 'av-farmer', '👩‍🔧': 'av-mechanic', '🧔': 'av-beard', '👸': 'av-queen',
  '🤴': 'av-king', '🧙': 'av-wizard', '🧝': 'av-elf', '🦊': 'av-fox', '🐻': 'av-bear', '🧛': 'av-vampire', '🎅': 'av-santa', '🦋': 'av-butterfly', '😄': 'happy', '😀': 'happy', '😊': 'smile', '🙂': 'smile', '😐': 'neutral', '🙁': 'sad', '😟': 'sad', '😠': 'angry',
  '☰': 'menu', '⚙': 'gear', '🎯': 'target', '📜': 'scroll', '🏆': 'trophy', '📦': 'crate', '🗺': 'map', '🛒': 'stall',
  '👆': 'hand', '☝': 'hand', '🛣': 'road', '🔨': 'hammer', '💥': 'bulldozer', '↩': 'undo', '⏸': 'pause', '▶': 'play',
  '📅': 'calendar', '📆': 'calendar', '⏳': 'hourglass', '⌛': 'hourglass', '⏱': 'stopwatch', '🌸': 'blossom', '🌷': 'tulip',
  '☀': 'sun', '🍂': 'leaf', '❄': 'snowflake', '⛅': 'partly', '☁': 'cloud', '🌧': 'rain', '🌨': 'snow', '🌙': 'moon', '🥵': 'heat',
  '🎁': 'gift', '🔒': 'lock', '🔓': 'unlock', '🔥': 'fire', '🚧': 'barrier', '❓': 'question', '💸': 'flywings',
  '💰': 'moneybag', '⚡': 'bolt', '🎉': 'party', '🏃': 'growth', '🚚': 'truck', '👑': 'crown', '🎨': 'palette',
  '🏠': 'house', '🏡': 'house', '🏘': 'village', '📂': 'village', '🏛': 'townhall', '🏰': 'castle', '🏭': 'factory',
  '🌳': 'tree', '🌲': 'pine', '🌿': 'herb', '💧': 'drop', '🎓': 'cap', '⚕': 'health', '🏥': 'health', '🛡': 'shield',
  '🎡': 'ferris', '🚒': 'firetruck', '⬆': 'up', '✨': 'sparkles', '⚖': 'scales', '💾': 'save', '📤': 'export', '📥': 'import',
  '🗑': 'trash', '🏁': 'flag', '🚩': 'flag', '🏷': 'tag', '🎃': 'pumpkin', '☃': 'snowman', '⛄': 'snowman', '🏔': 'mountain', '⛰': 'mountain',
  '🏞': 'valley', '🏖': 'beach', '🌊': 'wave', '✅': 'check', '❤': 'heart', '🚫': 'forbid', '🔍': 'search', '🔄': 'rotate',
  '✋': 'move', '🏗': 'crane', '🌉': 'bridge', '📡': 'radar', '🤝': 'scales', '🤏': 'search', '🔵': 'ball-blue', '🔴': 'ball-red',
  '🟢': 'ball-green', '🟡': 'ball-yellow', '🟣': 'ball-violet', '⚫': 'ball-black', '💠': 'ball-teal', '🟫': 'path', '⬛': 'paved',
  '🛍': 'stall', '🧺': 'basket', '🍺': 'mug', '🥖': 'bread', '🥕': 'carrot', '🪓': 'axe', '⛏': 'pickaxe', '⚒': 'pickaxe',
  '🎣': 'fishing', '🚜': 'tractor', '🌀': 'windmill', '🪣': 'bucket', '🏬': 'mall', '🗼': 'tower', '🕰': 'clock', '⛲': 'fountain',
  '🪑': 'bench', '🗽': 'statue', '🎶': 'music', '🏟': 'stadium', '🚉': 'train', '🌋': 'mountain',
  '🎆': 'firework', '🎇': 'firework', '🏮': 'lantern', '🥞': 'crepe', '🎭': 'mask', '🌈': 'rainbow', '🐟': 'fish', '🐠': 'fish',
  '🥚': 'egg', '🐔': 'chicken', '🐓': 'chicken', '🐄': 'cow', '🐮': 'cow', '🐑': 'cow', '🌼': 'lily', '🎤': 'music', '🎵': 'music', '💡': 'lantern', '🔭': 'moon', '🍇': 'grapes', '🧪': 'sparkles',
  '🎄': 'xmastree', '🌽': 'wheat', '⛵': 'ship', '🏴‍☠️': 'ship', '🎠': 'ferris', '🎈': 'balloon', '🎪': 'circus', '🧊': 'snowflake',
  '🍦': 'icecream', '🍨': 'icecream', '☘': 'clover', '🍀': 'clover', '🎟': 'token', '🎫': 'ticket', '🥳': 'party', '🎊': 'party',
};

const SKIP_SEL = '.no-ico, textarea, input, script, style, svg, [contenteditable]';
let RE = null;

function buildRe() {
  const keys = Object.keys(EMOJI).filter((k) => ICON_DEFS[EMOJI[k]]).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  RE = new RegExp(`(${keys.join('|')})\\uFE0F?`, 'gu');
}

function okNode(el) {
  return el && el.nodeType === 1 && !el.closest(SKIP_SEL);
}

function processText(node) {
  const s = node.nodeValue;
  if (!s || s.length > 4000) return;
  RE.lastIndex = 0;
  if (!RE.test(s)) return;
  RE.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0, m;
  while ((m = RE.exec(s))) {
    if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
    frag.appendChild(icon(EMOJI[m[1]]));
    last = m.index + m[0].length;
  }
  if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
  node.parentNode?.replaceChild(frag, node);
}

function scan(root) {
  if (root.nodeType === 3) {
    if (okNode(root.parentNode)) processText(root);
    return;
  }
  if (root.nodeType !== 1 || root.closest?.(SKIP_SEL)) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (okNode(n.parentNode) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const list = [];
  while (tw.nextNode()) list.push(tw.currentNode);
  for (const n of list) processText(n);
}

/** Remplace une fois les emoji d'un arbre (même hors du document). */
export function emojifyTree(root) {
  if (!RE) buildRe();
  scan(root);
  return root;
}

/** Remplace (et remplacera) les emoji connus sous root par les icônes du jeu. */
export function emojify(root = document.body) {
  if (!RE) buildRe();
  scan(root);
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') {
        if (m.target.parentNode && okNode(m.target.parentNode)) processText(m.target);
      } else for (const n of m.addedNodes) scan(n);
    }
  });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
  return mo;
}

/** Remplace les emoji d'une chaîne par du HTML d'icônes (pour innerHTML). */
export function emojiToHTML(str) {
  if (!RE) buildRe();
  return String(str).replace(RE, (_, k) => iconHTML(EMOJI[k]));
}
