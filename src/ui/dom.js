// Petits outils pour construire l'interface.
import { RESOURCES } from '../data/resources.js';
import { fmt, fmtCompact } from '../core/util.js';

/** h('div.classe#id', { onclick, style, ... }, enfants...) */
export function h(tag, props, ...children) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement(m?.[1] || 'div');
  if (m?.[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) || []) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      }
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Puces de coût : 🪙 30  🪵 10 (en rouge si on n'en a pas assez). */
export function costChips(cost, res, { compact = false, libre = false } = {}) {
  const wrap = h('span.cost');
  for (const k of Object.keys(cost)) {
    if (!cost[k]) continue;
    const enough = libre || !res || (res[k] || 0) >= cost[k] - 1e-6;
    wrap.appendChild(h('span.chip' + (enough ? '' : '.short'), `${RESOURCES[k]?.icon || ''} ${compact ? fmtCompact(cost[k]) : fmt(cost[k])}`));
  }
  if (!wrap.childNodes.length) wrap.appendChild(h('span.chip', 'Gratuit'));
  return wrap;
}

export function rewardChips(reward) {
  const wrap = h('span.cost.reward');
  for (const k of Object.keys(reward)) {
    if (!reward[k]) continue;
    const icon = k === 'xp' ? '⭐' : k === 'gems' ? '💎' : RESOURCES[k]?.icon || '';
    wrap.appendChild(h('span.chip', `${icon} +${fmt(reward[k])}`));
  }
  return wrap;
}

export function progressBar(pct, cls = '') {
  const bar = h('div.progress' + (cls ? '.' + cls : ''));
  bar.appendChild(h('div.fill', { style: { width: `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%` } }));
  return bar;
}

export function btn(label, onclick, cls = '') {
  return h('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { onclick, type: 'button' }, label);
}
