// Petites illustrations vectorielles de l'interface (coffres).
import { h } from './dom.js';

const CHEST_COLORS = {
  bois: { body: '#9b5a2e', lid: '#b86f3b', trim: '#7d858d', dark: '#4a2a14', shine: '#d99a62' },
  argent: { body: '#8197ad', lid: '#a9bdd1', trim: '#eef3f8', dark: '#3d4b5a', shine: '#dbe7f2' },
  or: { body: '#d9951c', lid: '#ffc93c', trim: '#fff1b0', dark: '#7a4c0a', shine: '#ffe58a' },
  royal: { body: '#5e2a91', lid: '#8a44c9', trim: '#f2c14e', dark: '#25103d', shine: '#b98aea' },
};

/** Coffre en SVG (chaîne HTML). open = couvercle entrouvert avec lumière. */
export function chestSVG(type = 'bois', { open = false } = {}) {
  const c = CHEST_COLORS[type] || CHEST_COLORS.bois;
  const lid = open
    ? `<g transform="translate(6 20) rotate(-24)"><path d="M0 6 V-2 Q0 -14 26 -14 Q52 -14 52 -2 V6 Z" fill="${c.lid}" stroke="${c.dark}" stroke-width="3" stroke-linejoin="round"/><rect x="8" y="-13" width="6" height="19" fill="${c.trim}" stroke="${c.dark}" stroke-width="2"/><rect x="38" y="-13" width="6" height="19" fill="${c.trim}" stroke="${c.dark}" stroke-width="2"/></g>`
    : `<path d="M6 26 V18 Q6 6 32 6 Q58 6 58 18 V26 Z" fill="${c.lid}" stroke="${c.dark}" stroke-width="3" stroke-linejoin="round"/>
       <path d="M12 16 Q14 10 30 9.5" fill="none" stroke="${c.shine}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
       <rect x="13" y="7.5" width="7" height="18.5" fill="${c.trim}" stroke="${c.dark}" stroke-width="2"/>
       <rect x="44" y="7.5" width="7" height="18.5" fill="${c.trim}" stroke="${c.dark}" stroke-width="2"/>`;
  const glow = open ? `<ellipse cx="32" cy="24" rx="22" ry="9" fill="#fff6c2" opacity="0.95"/><path d="M14 24 L4 0 M32 22 L32 -6 M50 24 L60 0" stroke="#fff3a6" stroke-width="5" stroke-linecap="round" opacity="0.7"/>` : '';
  return `<svg viewBox="-2 -8 68 68" xmlns="http://www.w3.org/2000/svg" class="chest-svg">
    <ellipse cx="32" cy="55" rx="26" ry="4.5" fill="rgba(0,0,0,0.22)"/>
    ${glow}
    <rect x="6" y="24" width="52" height="28" rx="4" fill="${c.body}" stroke="${c.dark}" stroke-width="3"/>
    <rect x="9" y="27" width="46" height="5" rx="2" fill="${c.shine}" opacity="0.35"/>
    <rect x="13" y="24" width="7" height="28" fill="${c.trim}" stroke="${c.dark}" stroke-width="2"/>
    <rect x="44" y="24" width="7" height="28" fill="${c.trim}" stroke="${c.dark}" stroke-width="2"/>
    ${lid}
    <rect x="26" y="${open ? 25 : 21}" width="12" height="14" rx="3" fill="${c.trim}" stroke="${c.dark}" stroke-width="2.5"/>
    <circle cx="32" cy="${open ? 31 : 27}" r="2.2" fill="${c.dark}"/>
    <rect x="31" y="${open ? 31 : 27}" width="2" height="5" fill="${c.dark}"/>
  </svg>`;
}

/** Élément coffre dimensionné en em (remplace un emoji dans le texte). */
export function chestArt(type = 'bois', opts = {}) {
  return h('span.chest-art', { html: chestSVG(type, opts) });
}
