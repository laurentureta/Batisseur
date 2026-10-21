// Écran d'accueil : continuer, nouvelle partie (nom, terrain, mode), emplacements de sauvegarde.
import { h, clear } from './dom.js';
import { PRESETS, PRESET_ORDER } from '../data/presets.js';
import { slotSummaries, deleteSlot, SLOT_COUNT } from '../core/save.js';
import { RANKS } from '../data/progression.js';
import { VERSION } from '../version.js';
import { fmt } from '../core/util.js';

export class StartScreen {
  constructor(ui) {
    this.ui = ui;
    this.el = h('div.start.hidden');
    ui.root.appendChild(this.el);
  }

  get game() {
    return this.ui.game;
  }

  show() {
    this.el.classList.remove('hidden');
    this.renderHome();
  }

  hide() {
    this.el.classList.add('hidden');
  }

  logo() {
    return h('div.logo', h('img.logo-icon', { src: 'icons/icon-192.png', alt: '' }), h('h1', 'BÂTISSEUR'), h('p.tagline', 'Construis le village de tes rêves… jusqu\'à la métropole'));
  }

  renderHome() {
    const el = clear(this.el);
    const slots = slotSummaries();
    const last = slots.filter((s) => s.exists).sort((a, b) => b.savedAt - a.savedAt)[0];
    const panel = h('div.start-panel');
    if (last) {
      panel.appendChild(h('button.btn.primary.huge', { onclick: () => this.game.continueGame(last.slot) },
        h('span', '▶ Continuer'),
        h('small', `${last.name} · ${last.mode === 'libre' ? 'Libre' : `Niv. ${last.level}`} · ${RANKS[(last.mairie || 1) - 1].name} · ${fmt(last.pop)} hab.`),
      ));
    }
    panel.appendChild(h('button.btn.huge' + (last ? '' : '.primary'), { onclick: () => this.renderNew() }, h('span', '✨ Nouvelle partie')));
    if (slots.some((s) => s.exists)) panel.appendChild(h('button.btn', { onclick: () => this.renderSlots() }, '📂 Mes villages'));
    el.append(this.logo(), panel, h('div.start-foot', `v${VERSION} · ${navigator.standalone || matchMedia('(display-mode: standalone)').matches ? 'Application installée' : 'Astuce : Partager → « Sur l\'écran d\'accueil » pour l\'installer'}`));
  }

  renderSlots() {
    const el = clear(this.el);
    const list = h('div.start-panel');
    list.appendChild(h('div.start-title', '📂 Mes villages'));
    for (const s of slotSummaries()) {
      if (!s.exists) {
        list.appendChild(h('div.slot.empty', h('b', `Emplacement ${s.slot + 1}`), h('small', 'Vide')));
        continue;
      }
      list.appendChild(h('div.slot',
        h('div.slot-info', h('b', s.name), h('small', `${PRESETS[s.preset]?.icon || ''} ${s.mode === 'libre' ? 'Mode libre' : `Niveau ${s.level}`} · ${RANKS[(s.mairie || 1) - 1].name} · ${fmt(s.pop)} hab. · jour ${s.day}`)),
        h('div.slot-btns',
          h('button.btn.small.primary', { onclick: () => this.game.continueGame(s.slot) }, 'Jouer'),
          h('button.btn.small.danger-soft', {
            onclick: async () => {
              const ok = await this.ui.confirm(`Supprimer « ${s.name} » ?`, h('p', 'Ce village sera effacé définitivement.'), 'Supprimer', 'danger');
              if (ok) {
                deleteSlot(s.slot);
                this.renderSlots();
              }
            },
          }, '🗑️'),
        ),
      ));
    }
    list.appendChild(h('button.btn', { onclick: () => this.renderHome() }, '← Retour'));
    el.append(this.logo(), list);
  }

  renderNew() {
    const el = clear(this.el);
    const state = { name: '', preset: 'vallee', mode: 'carriere', slot: null };
    const slots = slotSummaries();
    const free = slots.find((s) => !s.exists);
    state.slot = free ? free.slot : 0;

    const panel = h('div.start-panel.new');
    panel.appendChild(h('div.start-title', '✨ Nouveau village'));
    const name = h('input.text', { type: 'text', placeholder: 'Nom du village', maxLength: 28, value: '' });
    panel.appendChild(h('label.field', h('span', 'Nom de ton village'), name));

    panel.appendChild(h('div.field-label', 'Terrain'));
    const presets = h('div.presets');
    const renderPresets = () => {
      clear(presets);
      for (const id of PRESET_ORDER) {
        const p = PRESETS[id];
        presets.appendChild(h('button.preset' + (state.preset === id ? '.on' : ''), {
          onclick: () => {
            state.preset = id;
            renderPresets();
          },
        }, h('span.pi', p.icon), h('b', p.name), h('small', p.desc)));
      }
    };
    renderPresets();
    panel.appendChild(presets);

    panel.appendChild(h('div.field-label', 'Mode de jeu'));
    const modes = h('div.modes');
    const renderModes = () => {
      clear(modes);
      for (const [id, icon, label, desc] of [
        ['carriere', '🏆', 'Carrière', 'Budget, quêtes, niveaux et déblocages : fais grandir ton village pas à pas.'],
        ['libre', '🎨', 'Libre', 'Ressources illimitées, tout est débloqué : construis ce que tu veux.'],
      ]) {
        modes.appendChild(h('button.mode' + (state.mode === id ? '.on' : ''), {
          onclick: () => {
            state.mode = id;
            renderModes();
          },
        }, h('span.pi', icon), h('b', label), h('small', desc)));
      }
    };
    renderModes();
    panel.appendChild(modes);

    panel.appendChild(h('div.field-label', 'Emplacement de sauvegarde'));
    const slotRow = h('div.segs.slots');
    const renderSlotRow = () => {
      clear(slotRow);
      for (let s = 0; s < SLOT_COUNT; s++) {
        const info = slots[s];
        slotRow.appendChild(h('button.seg' + (state.slot === s ? '.on' : ''), {
          onclick: () => {
            state.slot = s;
            renderSlotRow();
          },
        }, `${s + 1}`, h('small', info.exists ? ` ${info.name.slice(0, 10)}` : ' libre')));
      }
    };
    renderSlotRow();
    panel.appendChild(slotRow);

    const go = h('button.btn.primary.huge', {
      onclick: async () => {
        const info = slots[state.slot];
        if (info.exists) {
          const ok = await this.ui.confirm('Remplacer ce village ?', h('p', `« ${info.name} » sera effacé.`), 'Remplacer', 'danger');
          if (!ok) return;
        }
        this.game.newGame({ name: name.value.trim() || 'Mon village', preset: state.preset, mode: state.mode, slot: state.slot });
      },
    }, h('span', '🏁 Fonder mon village'));
    panel.appendChild(go);
    panel.appendChild(h('button.btn', { onclick: () => this.renderHome() }, '← Retour'));
    el.append(panel);
  }
}
