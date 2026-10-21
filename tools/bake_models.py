#!/usr/bin/env python3
"""
Convertit les modèles 3D glTF libres de droits (KayKit, Kenney) en un seul fichier binaire
compact lu par le jeu : assets/models.bin.

- les couleurs de la texture-palette sont « cuites » dans les sommets (pas de texture à charger),
- une occlusion ambiante est calculée par sommet (ombres douces dans les recoins),
- les variantes de couleur (toits bleus, rouges, verts, jaunes) partagent la même géométrie,
- les fenêtres sont repérées pour s'allumer la nuit, les pièces mobiles (ailes de moulin,
  roue à aubes...) sont séparées avec leur pivot.

Les packs sources ne sont pas dans le dépôt : ce script a servi à préparer le fichier.
  python3 tools/bake_models.py  (ASSETS_SRC = dossier contenant les packs clonés depuis GitHub)
"""
import json, os, struct, sys, math, time
import numpy as np
from PIL import Image

SRC = os.environ.get('ASSETS_SRC', '/home/claude/assets-src')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'models.bin')

PACKS = {
    'med': 'KayKit-Medieval-Hexagon-Pack-1.0/addons/kaykit_medieval_hexagon_pack/Assets/gltf',
    'city': 'KayKit-City-Builder-Bits-1.0/addons/kaykit_city_builder_bits/Assets/gltf',
    'hw': 'KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf',
    'resto': 'KayKit-Restaurant-Bits-1.0/addons/kaykit_restaurant_bits/Assets/gltf',
    'ken': 'Starter-Kit-City-Builder/models',
    'mk': 'undraco',  # modèles de market-assets décompressés (Draco -> GLB) dans le navigateur
}
# taille de référence d'un pack (distance d'occlusion proportionnelle)
UNIT = {'med': 1.0, 'city': 1.0, 'hw': 4.0, 'resto': 1.0, 'ken': 1.0, 'mk': 1.0}
# cases de la palette 8 x 4 utilisées pour les vitres (allumées la nuit)
GLASS = {'med': {(1, 6)}, 'city': {(3, 0), (3, 1)}, 'hw': {(3, 2)}, 'resto': set(), 'ken': set(), 'mk': set()}
COLORS4 = ['blue', 'red', 'green', 'yellow']

M = []  # manifeste


def add(mid, pack, path, variants=None, **opt):
    M.append(dict(id=mid, pack=pack, path=path, variants=variants, **opt))


# ── Médiéval : bâtiments (4 couleurs de toit) ──
for n in ['archeryrange', 'barracks', 'blacksmith', 'castle', 'church', 'home_A', 'home_B', 'lumbermill', 'market',
          'mine', 'tavern', 'tower_A', 'tower_B', 'tower_base', 'tower_catapult', 'watermill', 'well', 'windmill']:
    opt = {}
    if n in ('castle', 'barracks', 'tower_A', 'tower_B', 'tower_base', 'tower_catapult', 'archeryrange'):
        opt['glass_extra'] = {(0, 3)}  # meurtrières sombres
        opt['glass_vertical'] = True
    if n == 'windmill':
        opt['parts'] = {'building_windmill_top_fan_{v}': 'z'}
    if n == 'watermill':
        opt['parts'] = {'building_watermill_wheel_{v}': 'x'}
    if n == 'lumbermill':
        opt['parts'] = {'building_lumbermill_saw_{v}': 'x'}
    add(n, 'med', f'buildings/{{v}}/building_{n}_{{v}}.gltf', COLORS4, **opt)
for n in ['destroyed', 'dirt', 'grain', 'scaffolding', 'stage_A', 'stage_B', 'stage_C', 'bridge_A',
          'fence_wood_straight', 'fence_wood_straight_gate', 'fence_stone_straight', 'fence_stone_straight_gate',
          'wall_straight', 'wall_straight_gate', 'wall_corner_A_outside', 'wall_corner_A_inside', 'wall_corner_B_outside']:
    add(n, 'med', f'buildings/neutral/building_{n}.gltf' if not n.startswith(('fence', 'wall')) else f'buildings/neutral/{n}.gltf', glass=False)
# ── Médiéval : nature et accessoires ──
for n in ['tree_single_A', 'tree_single_A_cut', 'tree_single_B', 'tree_single_B_cut', 'trees_A_small', 'trees_A_medium',
          'trees_B_small', 'trees_B_medium', 'rock_single_A', 'rock_single_B', 'rock_single_C', 'rock_single_D', 'rock_single_E',
          'hill_single_A', 'hill_single_B', 'hill_single_C', 'mountain_A', 'mountain_B', 'mountain_C', 'mountain_A_grass',
          'mountain_B_grass', 'mountain_C_grass', 'mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees',
          'cloud_big', 'cloud_small', 'waterlily_A', 'waterlily_B', 'waterplant_A', 'waterplant_B', 'waterplant_C']:
    add(n, 'med', f'decoration/nature/{n}.gltf', ao=not n.startswith('cloud'), ground=not n.startswith(('cloud', 'water')), glass=False)
for n in ['barrel', 'bucket_arrows', 'bucket_empty', 'bucket_water', 'crate_A_big', 'crate_A_small', 'crate_B_big', 'crate_B_small',
          'crate_long_A', 'crate_long_B', 'crate_long_C', 'crate_long_empty', 'crate_open', 'flag_blue', 'flag_green', 'flag_red',
          'flag_yellow', 'ladder', 'pallet', 'resource_lumber', 'resource_stone', 'sack', 'target', 'tent', 'weaponrack', 'wheelbarrow']:
    add(n, 'med', f'decoration/props/{n}.gltf', glass=False)
# ── Ville ──
for n in 'ABCDEFGH':
    add(f'city_{n}', 'city', f'building_{n}_withoutBase.gltf')
for n in ['watertower', 'bench', 'bush', 'streetlight', 'car_sedan', 'car_taxi', 'car_police', 'car_hatchback',
          'car_stationwagon', 'dumpster', 'firehydrant', 'trafficlight_A', 'trash_A', 'trash_B', 'box_A', 'box_B']:
    add('c_' + n, 'city', f'{n}.gltf', ground=not n.startswith('car'))
# ── Halloween (saison 1) ──
for n in ['pumpkin_orange', 'pumpkin_orange_jackolantern', 'pumpkin_orange_small', 'pumpkin_yellow', 'pumpkin_yellow_jackolantern',
          'pumpkin_yellow_small', 'lantern_standing', 'lantern_hanging', 'post_lantern', 'tree_pine_orange_small', 'tree_pine_orange_medium',
          'tree_pine_orange_large', 'tree_pine_yellow_small', 'tree_pine_yellow_medium', 'tree_pine_yellow_large', 'tree_dead_medium',
          'tree_dead_large', 'tree_dead_large_decorated', 'gravestone', 'grave_A', 'crypt', 'shrine', 'shrine_candles', 'arch',
          'arch_gate', 'fence', 'fence_pillar', 'fence_gate', 'bench', 'bench_decorated', 'candle_triple', 'skull', 'skull_candle',
          'coffin', 'post_skull', 'plaque_candles', 'pillar', 'gravemarker_A', 'ribcage']:
    add('hw_' + n, 'hw', f'{n}.gltf', **({'glass_extra': {(0, 1)}} if 'jackolantern' in n else {}))
# ── Restaurant : étals et potagers ──
for n in ['crate', 'crate_buns', 'crate_carrots', 'crate_cheese', 'crate_ham', 'crate_lettuce', 'crate_onions', 'crate_potatoes',
          'crate_steak', 'crate_tomatoes', 'table_round_A', 'table_round_A_decorated', 'chair_A', 'chair_stool',
          'food_ingredient_carrot', 'food_ingredient_lettuce', 'food_ingredient_tomato', 'food_ingredient_potato',
          'food_ingredient_onion', 'food_ingredient_cheese', 'food_ingredient_bun', 'food_ingredient_ham', 'pot_A_stew', 'jar_A_large', 'jar_B_large',
          'jar_C_medium', 'menu']:
    add('r_' + n, 'resto', f'{n}.gltf')
# ── Kenney ──
for n in ['pavement-fountain', 'grass-trees-tall', 'building-small-a', 'building-small-b', 'building-small-c', 'building-small-d', 'building-garage']:
    add('k_' + n.replace('-', '_'), 'ken', f'{n}.glb')
# ── Véhicules Kenney (pmndrs market, CC0) ──
for n in ['ambulance', 'firetruck', 'boat-small', 'boat-large', 'tractor', 'delivery-truck']:
    add('mk_' + n.replace('-', '_'), 'mk', f'{n}.glb', matglass=True)

# ───────────────────────── lecture glTF ─────────────────────────
CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8, 5122: np.int16, 5120: np.int8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_gltf(path):
    base = os.path.dirname(path)
    if path.endswith('.glb'):
        raw = open(path, 'rb').read()
        off = 12
        js = None
        binchunk = None
        while off < len(raw):
            ln, typ = struct.unpack('<II', raw[off:off + 8])
            data = raw[off + 8:off + 8 + ln]
            if typ == 0x4E4F534A:
                js = json.loads(data)
            elif typ == 0x004E4942:
                binchunk = data
            off += 8 + ln
        d = js
        bufs = [binchunk if 'uri' not in b else open(os.path.join(base, b['uri']), 'rb').read() for b in d['buffers']]
    else:
        d = json.load(open(path))
        import base64
        bufs = [base64.b64decode(b['uri'].split(',', 1)[1]) if b['uri'].startswith('data:') else open(os.path.join(base, b['uri']), 'rb').read() for b in d['buffers']]

    def acc(i):
        a = d['accessors'][i]
        dt = CT[a['componentType']]
        n = NC[a['type']]
        if 'bufferView' not in a:
            arr = np.zeros((a['count'], n), dtype=np.float64)
            sp = a.get('sparse')
            if sp:
                ib = d['bufferViews'][sp['indices']['bufferView']]
                it = CT[sp['indices']['componentType']]
                ids = np.frombuffer(bufs[ib['buffer']], dtype=it, count=sp['count'], offset=ib.get('byteOffset', 0) + sp['indices'].get('byteOffset', 0))
                vb = d['bufferViews'][sp['values']['bufferView']]
                vals = np.frombuffer(bufs[vb['buffer']], dtype=dt, count=sp['count'] * n, offset=vb.get('byteOffset', 0) + sp['values'].get('byteOffset', 0)).reshape(-1, n)
                arr[ids] = vals
            return arr
        bv = d['bufferViews'][a['bufferView']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', 0)
        itemsize = np.dtype(dt).itemsize * n
        raw = bufs[bv['buffer']]
        if stride and stride != itemsize:
            arr = np.frombuffer(raw, dtype=np.uint8, count=stride * a['count'], offset=off).reshape(a['count'], stride)[:, :itemsize].copy().view(dt).reshape(a['count'], n)
        else:
            arr = np.frombuffer(raw, dtype=dt, count=a['count'] * n, offset=off).reshape(a['count'], n)
        arr = arr.astype(np.float64) if dt == np.float32 else arr
        if a.get('normalized'):
            arr = arr.astype(np.float64) / np.iinfo(dt).max
        return arr

    img = None
    if d.get('images'):
        im = d['images'][0]
        if 'uri' in im:
            img = Image.open(os.path.join(base, im['uri'])).convert('RGB')
        else:
            bv = d['bufferViews'][im['bufferView']]
            import io
            img = Image.open(io.BytesIO(bufs[bv['buffer']][bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB')
    return d, acc, img


def quat_mat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    s = np.diag(n.get('scale', [1, 1, 1]) + [1])
    r = np.eye(4)
    r[:3, :3] = quat_mat(n.get('rotation', [0, 0, 0, 1]))
    t = np.eye(4)
    t[:3, 3] = n.get('translation', [0, 0, 0])
    return t @ r @ s


def collect(d, acc):
    """Liste des primitives avec leur matrice monde et le nom du nœud racine 'pièce'."""
    out = []
    scene = d['scenes'][d.get('scene', 0)]

    def walk(ni, parent, chain):
        n = d['nodes'][ni]
        mw = parent @ node_matrix(n)
        chain = chain + [(n.get('name', ''), mw)]
        if 'mesh' in n:
            for p in d['meshes'][n['mesh']]['primitives']:
                out.append((p, mw, chain))
        for c in n.get('children', []):
            walk(c, mw, chain)

    for ni in scene['nodes']:
        walk(ni, np.eye(4), [])
    return out


def sample(img_arr, uv):
    h, w, _ = img_arr.shape
    x = uv[:, 0] * w - 0.5
    y = uv[:, 1] * h - 0.5
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = (x - x0)[:, None]
    fy = (y - y0)[:, None]
    x0c = np.clip(x0, 0, w - 1); x1c = np.clip(x0 + 1, 0, w - 1)
    y0c = np.clip(y0, 0, h - 1); y1c = np.clip(y0 + 1, 0, h - 1)
    c = (img_arr[y0c, x0c] * (1 - fx) * (1 - fy) + img_arr[y0c, x1c] * fx * (1 - fy) +
         img_arr[y1c, x0c] * (1 - fx) * fy + img_arr[y1c, x1c] * fx * fy)
    return c


def load_model(path, pack, part_names):
    """Retourne body/parts : dict avec pos (n,3), nor (n,3), col (n,3) [0..255 sRGB], tri (m,3), sw (m,2) swatch par triangle."""
    d, acc, img = read_gltf(path)
    img_arr = np.asarray(img, dtype=np.float64) if img is not None else None
    groups = {}  # nom de pièce ('' = corps) -> listes
    for p, mw, chain in collect(d, acc):
        part = ''
        pivot = None
        for name, m in chain:
            if name in part_names:
                part = name
                pivot = m[:3, 3].copy()
        pos = acc(p['attributes']['POSITION'])[:, :3]
        nor = acc(p['attributes']['NORMAL'])[:, :3] if 'NORMAL' in p['attributes'] else None
        uv = acc(p['attributes']['TEXCOORD_0'])[:, :2] if 'TEXCOORD_0' in p['attributes'] else None
        idx = acc(p['indices']).reshape(-1).astype(np.int64) if 'indices' in p else np.arange(len(pos))
        tri = idx.reshape(-1, 3)
        pw = (np.c_[pos, np.ones(len(pos))] @ mw.T)[:, :3]
        nm = np.linalg.inv(mw[:3, :3]).T
        if nor is None:
            nor = np.zeros_like(pos)
        nw = nor @ nm.T
        nw /= np.maximum(1e-9, np.linalg.norm(nw, axis=1, keepdims=True))
        if np.linalg.det(mw[:3, :3]) < 0:
            tri = tri[:, ::-1]
        mat = d['materials'][p['material']] if 'material' in p else {}
        pbr = mat.get('pbrMetallicRoughness', {})
        factor = np.array(pbr.get('baseColorFactor', [1, 1, 1, 1])[:3])
        if uv is not None and img_arr is not None and 'baseColorTexture' in pbr:
            col = sample(img_arr, uv)
            # facteur glTF en linéaire -> appliqué en linéaire
            col = lin2srgb(srgb2lin(col / 255.0) * factor) * 255.0
            cu = uv[tri].mean(axis=1)
            sw = np.c_[np.clip((cu[:, 1] * 4).astype(int), 0, 3), np.clip((cu[:, 0] * 8).astype(int), 0, 7)]
        else:
            col = np.tile(lin2srgb(factor) * 255.0, (len(pos), 1))
            sw = np.full((len(tri), 2), -1)
        mname = (mat.get('name') or '').lower()
        mg = np.full(len(tri), any(k in mname for k in ('window', 'glass', 'light')))
        g = groups.setdefault(part, dict(pos=[], nor=[], col=[], tri=[], sw=[], mg=[], n=0, pivot=pivot))
        g['mg'].append(mg)
        g['pos'].append(pw)
        g['nor'].append(nw)
        g['col'].append(col)
        g['tri'].append(tri + g['n'])
        g['sw'].append(sw)
        g['n'] += len(pos)
    res = {}
    for k, g in groups.items():
        res[k] = dict(pos=np.concatenate(g['pos']), nor=np.concatenate(g['nor']), col=np.concatenate(g['col']),
                      tri=np.concatenate(g['tri']), sw=np.concatenate(g['sw']), mg=np.concatenate(g['mg']), pivot=g['pivot'])
    return res


def srgb2lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin2srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


# ───────────────────────── occlusion ambiante ─────────────────────────
def hemisphere(k):
    pts = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(k):
        r = math.sqrt((i + 0.5) / k)
        a = i * ga
        x, y = r * math.cos(a), r * math.sin(a)
        z = math.sqrt(max(0, 1 - x * x - y * y))
        pts.append((x, y, z))
    return np.array(pts)


HEMI = hemisphere(28)


def bake_ao(pos, nor, tri, dist, ground):
    n = len(pos)
    ao = np.ones(n)
    if n == 0:
        return ao
    v0, v1, v2 = pos[tri[:, 0]], pos[tri[:, 1]], pos[tri[:, 2]]
    e1, e2 = v1 - v0, v2 - v0
    tmin = np.minimum(np.minimum(v0, v1), v2)
    tmax = np.maximum(np.maximum(v0, v1), v2)
    # repère tangent par sommet
    up = np.where(np.abs(nor[:, 1:2]) < 0.9, np.array([[0, 1, 0]]), np.array([[1, 0, 0]]))
    tx = np.cross(up, nor)
    tx /= np.maximum(1e-9, np.linalg.norm(tx, axis=1, keepdims=True))
    ty = np.cross(nor, tx)
    cell = max(dist, 0.08)
    keys = np.floor(pos / cell).astype(np.int64)
    order = np.lexsort((keys[:, 2], keys[:, 1], keys[:, 0]))
    ks = keys[order]
    starts = np.r_[0, np.nonzero(np.any(np.diff(ks, axis=0) != 0, axis=1))[0] + 1, len(order)]
    K = len(HEMI)
    for a, b in zip(starts[:-1], starts[1:]):
        vi = order[a:b]
        lo = pos[vi].min(axis=0) - dist
        hi = pos[vi].max(axis=0) + dist
        sel = np.nonzero(np.all(tmax >= lo, axis=1) & np.all(tmin <= hi, axis=1))[0]
        o = pos[vi] + nor[vi] * (0.004 * dist / 0.3)
        dirs = (HEMI[None, :, 0:1] * tx[vi][:, None, :] + HEMI[None, :, 1:2] * ty[vi][:, None, :] + HEMI[None, :, 2:3] * nor[vi][:, None, :])
        O = np.repeat(o, K, axis=0)
        D = dirs.reshape(-1, 3)
        best = np.full(len(O), np.inf)
        for c0 in range(0, len(sel), 400):
            ts = sel[c0:c0 + 400]
            E1, E2, V0 = e1[ts], e2[ts], v0[ts]
            pvec = np.cross(D[:, None, :], E2[None, :, :])
            det = np.einsum('ijk,jk->ij', pvec, E1)
            ok = np.abs(det) > 1e-12
            inv = np.where(ok, 1.0 / np.where(ok, det, 1), 0)
            s = O[:, None, :] - V0[None, :, :]
            u = np.einsum('ijk,ijk->ij', s, pvec) * inv
            q = np.cross(s, E1[None, :, :])
            v = np.einsum('ik,ijk->ij', D, q) * inv
            t = np.einsum('jk,ijk->ij', E2, q) * inv
            hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-5) & (t < dist)
            t = np.where(hit, t, np.inf)
            best = np.minimum(best, t.min(axis=1))
        if ground:
            dy = D[:, 1]
            tg = np.where(dy < -1e-6, -O[:, 1] / np.where(dy < -1e-6, dy, -1), np.inf)
            tg = np.where((tg > 0) & (O[:, 1] > -1e-4), tg, np.inf)
            best = np.minimum(best, tg)
        occ = np.where(np.isfinite(best) & (best < dist), np.sqrt(np.clip(1 - best / dist, 0, 1)), 0.0)
        ao[vi] = 1 - occ.reshape(-1, K).mean(axis=1)
    return ao


# ───────────────────────── écriture ─────────────────────────
class Blob:
    def __init__(self):
        self.parts = []
        self.size = 0

    def add(self, arr):
        b = arr.tobytes()
        off = self.size
        pad = (-len(b)) % 4
        self.parts.append(b + b'\0' * pad)
        self.size += len(b) + pad
        return off


def emitters_of(g, pack):
    """Ouvertures de cheminée : petites faces noires tournées vers le haut."""
    if pack != 'med':
        return []
    sw = g['sw']
    tri = g['tri']
    pos = g['pos']
    nor = g['nor']
    fn = nor[tri].mean(axis=1)
    sel = np.nonzero((sw[:, 0] == 0) & (sw[:, 1] == 4) & (fn[:, 1] > 0.8))[0]
    pts = []
    for i in sel:
        c = pos[tri[i]].mean(axis=0)
        if c[1] < 0.3:
            continue
        for p in pts:
            if np.linalg.norm(p['c'] - c) < 0.12:
                p['s'] += c
                p['n'] += 1
                break
        else:
            pts.append(dict(c=c, s=c.copy(), n=1))
    return [[round(float(v), 3) for v in (p['s'] / p['n'])] for p in pts]


def encode(g, variants_cols, pack, opt, blob, glass_set, ao_on=True, ground=True):
    pos, nor, tri, sw = g['pos'], g['nor'], g['tri'], g['sw']
    glass = np.zeros(len(tri), dtype=bool)
    if len(glass_set):
        fn = nor[tri].mean(axis=1)
        for (r, c) in glass_set:
            m = (sw[:, 0] == r) & (sw[:, 1] == c)
            if (r, c) in opt.get('glass_extra', set()) and opt.get('glass_vertical'):
                m &= np.abs(fn[:, 1]) < 0.3
            glass |= m
    if opt.get('matglass'):
        glass |= g['mg']
    order = np.r_[np.nonzero(~glass)[0], np.nonzero(glass)[0]]
    tri = tri[order]
    gstart = int((~glass).sum())
    unit = UNIT[pack]
    ao = cached_ao(pos, nor, tri, 0.32 * unit, ground) if ao_on else np.ones(len(pos))
    lo = pos.min(axis=0)
    hi = pos.max(axis=0)
    span = np.maximum(hi - lo, 1e-6)
    q = np.round((pos - lo) / span * 65535 - 32768).astype(np.int16)
    nq = np.round(np.clip(nor, -1, 1) * 127).astype(np.int8)
    aq = np.round(np.clip(ao, 0, 1) * 255).astype(np.uint8)
    rec = dict(v=int(len(pos)), t=int(len(tri)), g=gstart, bb=[round(float(x), 5) for x in list(lo) + list(hi)])
    rec['pos'] = blob.add(q)
    rec['nor'] = blob.add(nq)
    rec['ao'] = blob.add(aq)
    rec['col'] = [blob.add(np.round(np.clip(c, 0, 255)).astype(np.uint8)) for c in variants_cols]
    big = len(pos) > 65535
    rec['i32'] = big
    rec['idx'] = blob.add(tri.astype(np.uint32 if big else np.uint16))
    return rec


CACHE = os.path.join(os.path.expanduser('~'), '.cache', 'batisseur-bake')
AO_VERSION = 2


def cached_ao(pos, nor, tri, dist, ground):
    import hashlib
    h = hashlib.sha1()
    for a in (pos, nor, tri):
        h.update(np.ascontiguousarray(a).tobytes())
    h.update(repr((dist, ground, AO_VERSION, len(HEMI))).encode())
    path = os.path.join(CACHE, h.hexdigest() + '.npy')
    if os.path.exists(path):
        return np.load(path)
    ao = bake_ao(pos, nor, tri, dist, ground)
    os.makedirs(CACHE, exist_ok=True)
    np.save(path, ao)
    return ao


def cache_key(e):
    import hashlib
    paths = []
    base = os.path.join(SRC, PACKS[e['pack']])
    for v in (e['variants'] or [None]):
        p = os.path.join(base, e['path'].replace('{v}', v or ''))
        paths.append((p, os.path.getmtime(p) if os.path.exists(p) else 0))
    raw = repr((sorted((k, repr(v)) for k, v in e.items()), paths, AO_VERSION, UNIT[e['pack']], sorted(GLASS[e['pack']])))
    return hashlib.sha1(raw.encode()).hexdigest()


def main():
    blob = Blob()
    models = {}
    t0 = time.time()
    total_v = 0
    for e in M:
        base = os.path.join(SRC, PACKS[e['pack']])
        variants = e['variants'] or [None]
        loaded = []
        for v in variants:
            path = os.path.join(base, e['path'].replace('{v}', v or ''))
            parts = {k.replace('{v}', v or ''): ax for k, ax in e.get('parts', {}).items()}
            if not os.path.exists(path):
                print('  ! manquant', path)
                loaded = None
                break
            loaded.append((v, load_model(path, e['pack'], set(parts)), parts))
        if not loaded:
            continue
        v0, g0, parts0 = loaded[0]

        glass_set = (GLASS[e['pack']] | e.get('glass_extra', set())) if e.get('glass', True) else set()
        for gname, g in g0.items():
            cols = [g['col']]
            for v, gv, _ in loaded[1:]:
                key = gname.replace(v0, v) if v0 else gname
                other = gv.get(key)
                if other is None or other['pos'].shape != g['pos'].shape or np.abs(other['pos'] - g['pos']).max() > 1e-4:
                    print('  ! géométrie différente pour', e['id'], v)
                    cols.append(g['col'])
                else:
                    cols.append(other['col'])
            if gname == '':
                rec = encode(g, cols, e['pack'], e, blob, glass_set, ao_on=e.get('ao', True), ground=e.get('ground', True))
                rec['vars'] = [v for v in variants if v] or ['base']
                rec['emit'] = emitters_of(g, e['pack'])
                rec['parts'] = []
                models[e['id']] = rec
                total_v += rec['v']
        for gname, g in g0.items():
            if gname == '':
                continue
            pid = e['id'] + '#' + gname.split('_')[-2] if gname.endswith(v0 or '') else e['id'] + '#' + gname
            pivot = g['pivot']
            gl = dict(g)
            gl['pos'] = g['pos'] - pivot
            cols = [g['col']]
            for v, gv, _ in loaded[1:]:
                other = gv.get(gname.replace(v0, v))
                cols.append(other['col'] if other is not None else g['col'])
            rec = encode(gl, cols, e['pack'], e, blob, glass_set, ao_on=e.get('ao', True), ground=False)
            rec['vars'] = models[e['id']]['vars']
            rec['emit'] = []
            rec['parts'] = []
            models[pid] = rec
            models[e['id']]['parts'].append(dict(id=pid, pivot=[round(float(x), 4) for x in pivot], axis=parts0[gname]))
            total_v += rec['v']
        print(f"{e['id']:<34} v={models[e['id']]['v']:6d} t={models[e['id']]['t']:6d} vars={len(variants)} parts={len(models[e['id']]['parts'])} emit={len(models[e['id']]['emit'])}  ({time.time() - t0:.0f}s)")
    head = json.dumps(dict(models=models), separators=(',', ':')).encode()
    head += b' ' * ((-len(head)) % 4)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'wb') as f:
        f.write(b'BTSR')
        f.write(struct.pack('<II', 1, len(head)))
        f.write(head)
        for p in blob.parts:
            f.write(p)
    print(f'{len(models)} modèles, {total_v} sommets, {os.path.getsize(OUT) / 1e6:.2f} Mo -> {OUT}')


if __name__ == '__main__':
    if len(sys.argv) > 1:
        keep = set(sys.argv[1:])
        M[:] = [e for e in M if e['id'] in keep]
    main()
