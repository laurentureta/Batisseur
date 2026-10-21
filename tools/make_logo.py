#!/usr/bin/env python3
"""Fabrique le logo vectoriel du jeu (icons/logo.svg) : le texte est converti en tracés,
le logo s'affiche donc partout sans police à charger.
  python3 tools/make_logo.py  (police : fonts/LilitaOne.woff ou un .ttf passé en argument)"""
import os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FONT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'fonts', 'LilitaOne.woff')
font = TTFont(FONT)
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font['head'].unitsPerEm
hmtx = font['hmtx']


def text_path(text, size, x0, baseline, tracking=0.0, arc=0.0):
    """Tracé SVG d'un texte centré sur x0 ; arc > 0 courbe légèrement la ligne (effet arche)."""
    scale = size / upm
    names = [cmap[ord(c)] for c in text]
    widths = [hmtx[n][0] * scale + tracking for n in names]
    total = sum(widths) - tracking
    x = x0 - total / 2
    parts = []
    for n, w in zip(names, widths):
        cx = x + w / 2
        t = (cx - x0) / (total / 2) if total else 0
        dy = arc * (t * t)  # parabole : les bords descendent
        pen = SVGPathPen(gs)
        tp = TransformPen(pen, (scale, 0, 0, -scale, x, baseline + dy))
        gs[n].draw(tp)
        parts.append(pen.getCommands())
        x += w
    return ' '.join(parts), total


W, H = 520, 250
title, tw = text_path('BÂTISSEUR', 92, W / 2, 168, tracking=2, arc=10)
sub, sw = text_path('CONSTRUIS TA VILLE', 26, W / 2, 222, tracking=3)
rb = sw / 2 + 30

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff7c2"/>
      <stop offset="0.42" stop-color="#ffd447"/>
      <stop offset="0.43" stop-color="#ffbf2e"/>
      <stop offset="1" stop-color="#ff8f1f"/>
    </linearGradient>
    <linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4fb0ff"/>
      <stop offset="1" stop-color="#1f6fd1"/>
    </linearGradient>
    <linearGradient id="roof" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff6a5a"/>
      <stop offset="1" stop-color="#c8302a"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#2b1405" flood-opacity="0.45"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <!-- emblème : maison et marteau -->
    <g transform="translate({W / 2} 58)">
      <path d="M-58 8 L0 -42 L58 8 Z" fill="#5a2d0c" stroke="#5a2d0c" stroke-width="14" stroke-linejoin="round"/>
      <rect x="-40" y="2" width="80" height="44" rx="6" fill="#5a2d0c" stroke="#5a2d0c" stroke-width="12" stroke-linejoin="round"/>
      <rect x="-40" y="2" width="80" height="44" rx="6" fill="#fff1d6"/>
      <path d="M-58 8 L0 -42 L58 8 Z" fill="url(#roof)" stroke-linejoin="round"/>
      <path d="M-46 1 L0 -33 L46 1" fill="none" stroke="#ff9d8f" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
      <rect x="-11" y="18" width="22" height="28" rx="11" fill="#8b5a32"/>
      <rect x="-32" y="14" width="14" height="14" rx="3" fill="#7fd0ff"/>
      <rect x="18" y="14" width="14" height="14" rx="3" fill="#7fd0ff"/>
      <g transform="translate(66 -4) rotate(24)">
        <rect x="-4" y="-2" width="8" height="46" rx="3" fill="#5a2d0c"/>
        <rect x="-2.5" y="0" width="5" height="42" rx="2" fill="#c98a4b"/>
        <rect x="-15" y="-12" width="30" height="13" rx="3" fill="#5a2d0c"/>
        <rect x="-13" y="-10" width="26" height="9" rx="2" fill="#b9c4cf"/>
      </g>
    </g>
    <!-- titre -->
    <path d="{title}" fill="#5a2d0c" stroke="#5a2d0c" stroke-width="18" stroke-linejoin="round"/>
    <path d="{title}" fill="url(#gold)" stroke="#fff2b8" stroke-width="1.5" stroke-linejoin="round"/>
    <!-- ruban -->
    <path d="M{W / 2 - rb - 14} 190 L{W / 2 - rb} 199 L{W / 2 - rb - 14} 208 L{W / 2 - rb + 6} 224 L{W / 2 - rb + 6} 186 Z" fill="#164f99"/>
    <path d="M{W / 2 + rb + 14} 190 L{W / 2 + rb} 199 L{W / 2 + rb + 14} 208 L{W / 2 + rb - 6} 224 L{W / 2 + rb - 6} 186 Z" fill="#164f99"/>
    <rect x="{W / 2 - rb}" y="191" width="{2 * rb}" height="42" rx="10" fill="#0f3e7d"/>
    <rect x="{W / 2 - rb}" y="188" width="{2 * rb}" height="40" rx="10" fill="url(#ribbon)"/>
    <path d="{sub}" fill="#ffffff"/>
  </g>
</svg>
'''
out = os.path.join(ROOT, 'icons', 'logo.svg')
open(out, 'w').write(svg)
print('logo ->', out, len(svg) // 1024, 'Ko')
