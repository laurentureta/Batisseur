// Outils génériques : maths, formatage des nombres, calendrier.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

const NNBSP = ' ';

/** 12345 -> "12 345" */
export function fmt(n) {
  if (n === Infinity) return '∞';
  if (!Number.isFinite(n)) return '0';
  const v = Math.floor(n);
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
}

/** 12345 -> "12,3 k" ; 1234567 -> "1,23 M" */
export function fmtCompact(n) {
  if (n === Infinity) return '∞';
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a < 10000) return fmt(n);
  if (a < 1e6) return (n / 1000).toFixed(a < 1e5 ? 1 : 0).replace('.', ',') + NNBSP + 'k';
  return (n / 1e6).toFixed(a < 1e7 ? 2 : 1).replace('.', ',') + NNBSP + 'M';
}

/** Nombre décimal court : 1.5 -> "1,5" */
export function fmtDec(n, digits = 1) {
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(digits).replace('.', ',');
  return s.replace(/,0+$/, '');
}

export const SEASONS = [
  { id: 'spring', name: 'Printemps', icon: '🌸' },
  { id: 'summer', name: 'Été', icon: '☀️' },
  { id: 'autumn', name: 'Automne', icon: '🍂' },
  { id: 'winter', name: 'Hiver', icon: '❄️' },
];
export const DAYS_PER_SEASON = 7;

/** Calendrier du jeu à partir du nombre de jours écoulés (décimal). */
export function calendar(day) {
  const d = Math.floor(day);
  const season = Math.floor(d / DAYS_PER_SEASON) % 4;
  const year = Math.floor(d / (DAYS_PER_SEASON * 4)) + 1;
  const hour = (day - d) * 24;
  return { day: d + 1, season, year, hour, dayInSeason: (d % DAYS_PER_SEASON) + 1 };
}

export function hourLabel(hour) {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}

/** Date locale du jour au format AAAA-MM-JJ (missions du jour). */
export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addCosts(a, b) {
  const out = { ...a };
  for (const k in b) out[k] = (out[k] || 0) + b[k];
  return out;
}

export function scaleCost(cost, f, round = true) {
  const out = {};
  for (const k in cost) out[k] = round ? Math.floor(cost[k] * f) : cost[k] * f;
  return out;
}

export function isEmptyCost(cost) {
  for (const k in cost) if (cost[k] > 0) return false;
  return true;
}
