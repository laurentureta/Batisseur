#!/usr/bin/env python3
"""
Prépare assets/creatures.bin : habitants, animaux, bateaux et train en vrais modèles 3D animés.

Toutes les sources sont sous licence CC0 (domaine public) :
- habitants : Quaternius, « Ultimate Animated Character Pack » (nov. 2019),
  copie GLB : https://github.com/wellmota/tutory-personagens (dossier quaternius-uac)
- animaux, bateaux, train : bibliothèque https://github.com/nrknithin/html-anime (models/library),
  qui reprend Quaternius (LowPoly Animated Farm Animal Pack, Animal Pack Vol.2, Animals Pack),
  CDmir (poule, papillon), mujtaba-io (pigeon), Kenney (Watercraft Kit, Train Kit).
- chargeur glTF et décodeur meshopt de three.js r186 (MIT).

Utilisation :
  1. cloner les dépôts ci-dessus et three.js (tag r186) ;
  2. servir un dossier contenant : batisseur/ (ce dépôt), three/, uac/ (quaternius-uac), lib/ (models/library)
     python3 -m http.server 8770 --directory <dossier>
  3. python3 tools/bake_creatures.py
"""
import asyncio, base64, json, os, sys
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'creatures.bin')
URL = os.environ.get('BAKE_URL', 'http://localhost:8770/batisseur/tools/bake_creatures.html')

# Emplacements de couleur (variés pour chaque habitant) : 1 peau, 2 cheveux, 3 haut, 4 bas, 5 chapeau.
HUMAN_SLOTS = {1: ['Skin'], 2: ['Hair', 'Moustache'], 3: ['Shirt', 'Top', 'Jacket'], 4: ['Pants'], 5: ['Hat', 'HatBrown']}
FACE = ['fffff8', 'ffffff']  # les traits du visage sont clairs dans les fichiers : on les assombrit

def human(mid, src, slots=None, cells=None):
    return {'id': mid, 'src': f'/uac/{src}.glb', 'slots': slots, 'cells': cells}

CONFIG = {
    'fps': 30,
    'credits': 'Quaternius, CDmir, mujtaba-io, Kenney (CC0)',
    'skeletons': [
        {
            'id': 'human', 'ref': '/uac/Worker_Male.glb', 'refHeight': 3.13, 'height': 0.27, 'cells': 22,
            'slots': HUMAN_SLOTS,
            'clips': [['Idle', 'idle'], ['Walk', 'walk'], ['Run', 'run'], ['Walk_Carry', 'carry'], ['Run_Carry', 'runCarry'],
                      ['PickUp', 'pickup', False], ['Victory', 'cheer'], ['SitDown', 'sit', False], ['Defeat', 'sad']],
            'meshes': [
                human('worker_m', 'Worker_Male'), human('worker_f', 'Worker_Female'),
                human('farmer_m', 'Cowboy_Male'), human('farmer_f', 'Cowboy_Female'),
                human('chef_m', 'Chef_Hat'),
                human('doctor_m', 'Doctor_Male_Old'), human('doctor_f', 'Doctor_Female_Old'),
                human('casual_m', 'Casual2_Male'), human('casual_f', 'Casual2_Female'),
                human('bald_m', 'Casual_Bald'),
                human('old_m', 'OldClassy_Male'), human('old_f', 'OldClassy_Female'),
                human('suit_m', 'Suit_Male', {1: ['Skin'], 2: ['Hair'], 3: ['Black'], 4: [], 5: []}),
            ],
        },
        {'id': 'cow', 'ref': '/lib/cow/model.glb', 'height': 0.2, 'cells': 16, 'slots': {3: ['White'], 4: ['Black']},
         'clips': [['Idle', 'idle'], ['Walk', 'walk'], ['WalkSlow', 'walkSlow'], ['Run', 'run']],
         'meshes': [{'id': 'cow', 'src': '/lib/cow/model.glb'}]},
        {'id': 'sheep', 'ref': '/lib/sheep/model.glb', 'height': 0.14, 'cells': 16, 'slots': {3: ['White']},
         'clips': [['Idle', 'idle'], ['Walk', 'walk'], ['WalkSlow', 'walkSlow'], ['Run', 'run']],
         'meshes': [{'id': 'sheep', 'src': '/lib/sheep/model.glb'}]},
        {'id': 'pig', 'ref': '/lib/pig/model.glb', 'height': 0.11, 'cells': 16,
         'clips': [['Idle', 'idle'], ['Walk', 'walk'], ['Run', 'run']],
         'meshes': [{'id': 'pig', 'src': '/lib/pig/model.glb'}]},
        {'id': 'dog', 'ref': '/lib/dog/model.glb', 'height': 0.085, 'cells': 16, 'slots': {3: ['Beige'], 4: ['Brown']},
         'clips': [['Idle', 'idle'], ['Walk', 'walk'], ['WalkSlow', 'walkSlow'], ['Run', 'run'], ['Jump', 'jump', False]],
         'meshes': [{'id': 'dog', 'src': '/lib/dog/model.glb'}]},
        {'id': 'cat', 'ref': '/lib/cat/model.glb', 'height': 0.075, 'cells': 16, 'slots': {3: ['Grey'], 4: ['White']},
         'clips': [['Idle', 'idle'], ['Walking', 'walk']],
         'meshes': [{'id': 'cat', 'src': '/lib/cat/model.glb'}]},
        {'id': 'chicken', 'ref': '/lib/chicken/model.glb', 'height': 0.085, 'cells': 12, 'lodNoColor': True,
         'clips': [['Idle2', 'idle'], ['Idle1', 'idle2'], ['Walk', 'walk'], ['Eating', 'eat'], ['Pecking1', 'peck']],
         'meshes': [{'id': 'chicken', 'src': '/lib/chicken/model.glb'}]},
        {'id': 'pigeon', 'ref': '/lib/pigeon/model.glb', 'length': 0.075, 'cells': 12,
         'clips': [['idle-animation', 'idle'], ['flap-wings-animation', 'fly']],
         'meshes': [{'id': 'pigeon', 'src': '/lib/pigeon/model.glb'}]},
        {'id': 'bird', 'ref': '/lib/songbird/model.glb', 'length': 0.07, 'cells': 10,
         'clips': [['ArmatureAction', 'fly']],
         'meshes': [{'id': 'bird', 'src': '/lib/songbird/model.glb'}]},
        {'id': 'butterfly', 'ref': '/lib/butterfly/model.glb', 'length': 0.05, 'cells': 10,
         'clips': [['Flying', 'fly'], ['Sitting2', 'sit']],
         'meshes': [{'id': 'butterfly', 'src': '/lib/butterfly/model.glb'}]},
    ],
    'statics': [
        {'id': 'boat_row', 'src': '/lib/boat-row/model.glb', 'length': 0.62},
        {'id': 'boat_fish', 'src': '/lib/boat-fishing/model.glb', 'length': 0.95},
        {'id': 'boat_sail', 'src': '/lib/boat-sail/model.glb', 'length': 1.0},
        {'id': 'loco', 'src': '/lib/train-locomotive/model.glb', 'length': 1.25},
    ],
    'face': FACE,
}


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await b.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(m.text))
        pg.on('pageerror', lambda e: logs.append('ERREUR ' + str(e)))
        await pg.goto(URL)
        await pg.wait_for_function('window.__ready === true', timeout=60000)
        r = await pg.evaluate('(cfg) => window.bake(cfg)', json.loads(json.dumps(CONFIG)))
        for line in r['log']:
            print(line)
        for line in logs[-20:]:
            print('LOG', line)
        data = base64.b64decode(r['b64'])
        with open(OUT, 'wb') as f:
            f.write(data)
        print(f'{OUT} : {len(data) / 1024:.0f} Ko')
        await b.close()


if __name__ == '__main__':
    asyncio.run(main())
