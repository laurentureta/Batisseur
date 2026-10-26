// Pictogrammes légers du HUD, distincts des illustrations des bâtiments.
import { h } from './dom.js';

const PATHS = {
  coins: '<circle cx="12" cy="12" r="8.5" fill="#f9e6a6" stroke="#9a741e"/><path d="m12 7 1.5 3 3.3.5-2.4 2.3.6 3.2-3-1.5-3 1.5.6-3.2-2.4-2.3 3.3-.5Z" stroke="#9a741e" stroke-width="1.3"/>',
  gem: '<path d="m7 5-4 5 9 10 9-10-4-5Z" fill="#e6dcf7" stroke="#8463b0"/><path d="M3 10h18M7 5l5 15 5-15" stroke="#8463b0" stroke-width="1.3"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8 14a4.5 4.5 0 0 0 8 0M8.5 9h.01m7 0h.01"/>',
  happy: '<circle cx="12" cy="12" r="8.5"/><path d="M7 13a5 5 0 0 0 10 0M7 9l2-1 2 1m2 0 2-1 2 1"/>',
  neutral: '<circle cx="12" cy="12" r="8.5"/><path d="M8 15h8M8.5 9h.01m7 0h.01"/>',
  sad: '<circle cx="12" cy="12" r="8.5"/><path d="M8 16a4.5 4.5 0 0 1 8 0M8.5 9h.01m7 0h.01"/>',
  angry: '<circle cx="12" cy="12" r="8.5"/><path d="M8 16a4.5 4.5 0 0 1 8 0M7 8l3 2m7-2-3 2"/>',
  menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  road: '<path d="M8 3 4 21m12-18 4 18M12 4v3m0 4v3m0 4v3"/>',
  hammer: '<path d="m5 19 9-9m-3-6 3-2 7 7-2 3-3-3-3 3-4-4 3-3Z"/><path d="m4 17 3 3-2 2-3-3Z"/>',
  bulldozer: '<path d="M4 8h7l3 8H3V9m5-1V4h5l3 8h-4m5 2 4-3v9h-4M5 20h9"/><circle cx="6" cy="17" r="2"/><circle cx="13" cy="17" r="2"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/>',
  village: '<path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/>',
  play: '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14m8-14v14" stroke-width="3"/>',
  ff: '<path d="m4 5 8 7-8 7Zm9 0 8 7-8 7Z"/>',
  fff: '<path d="m2 6 6 6-6 6Zm7 0 6 6-6 6Zm7 0 6 6-6 6Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 8-8"/>',
  scroll: '<path d="M6 3h13a2 2 0 0 1 0 4H7M6 3a2 2 0 0 0-2 2v13a3 3 0 0 0 6 0V7m0 14h9a2 2 0 0 0 2-2v-2H10M10 10h6m-6 4h6"/>',
  trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0ZM8 5H4v2a5 5 0 0 0 5 5m7-7h4v2a5 5 0 0 1-5 5m-3 1v6m-4 2h8"/>',
  crate: '<path d="m3 7 9-4 9 4v12l-9 3-9-3Zm0 0 9 4 9-4m-9 4v11M8 5l9 4v6"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/>',
  stall: '<path d="m4 3-2 7a3 3 0 0 0 5 2 3 3 0 0 0 5 0 3 3 0 0 0 5 0 3 3 0 0 0 5-2l-2-7ZM4 13v8h16v-8M9 21v-6h6v6"/>',
  medal: '<circle cx="12" cy="16" r="6"/><path d="M8 11 4 3h6l2 5 2-5h6l-4 8m-4 2v6m-3-3h6"/>',
  event: '<path d="m4 21 4-14 9 9Zm8-18v3m6-1-2 3m5 2h-3M8 12l5 5"/><circle cx="19" cy="19" r="1"/>',
};
const URLS = new Map();
export function hudIconURL(name) {
  if (!URLS.has(name)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#365d50" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" color="#365d50">${PATHS[name] || PATHS.sun}</svg>`;
    URLS.set(name, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }
  return URLS.get(name);
}
export function hudIcon(name, cls = '') {
  return h('img.hud-icon' + (cls ? '.' + cls : ''), { src: hudIconURL(name), alt: '', dataset: { i: name }, draggable: false });
}
