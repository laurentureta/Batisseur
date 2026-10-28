// Écran d'accueil : continuer, nouvelle partie (nom, terrain, mode), emplacements de sauvegarde.
import { h, clear } from './dom.js';
import { PRESETS, PRESET_ORDER } from '../data/presets.js';
import { slotSummaries, deleteSlot, SLOT_COUNT } from '../core/save.js';
import { RANKS } from '../data/progression.js';
import { VERSION } from '../version.js';
import { fmt } from '../core/util.js';
import { gemPill, countdown } from './screens.js';
import { TIERS } from '../data/pass.js';
import { chestArt } from './art.js';
import { eventCard, eventCardKey } from './event.js';

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
    return h('div.logo', h('img.logo-svg', { src: 'icons/logo.svg', alt: 'Bâtisseur' }));
  }

  /** Barre du haut : profil et gemmes. */
  topBar() {
    const meta = this.game.meta;
    const p = meta.p;
    this.pill = gemPill(this.ui, { onclick: () => this.ui.openShop('gems') });
    return h('div.start-top',
      h('button.profile-chip', { onclick: () => this.ui.openProfile() }, h('span.pc-avatar', { dataset: { av: p.avatar } }, p.avatar), h('span.pc-text', h('b', p.name), h('small', p.title))),
      this.pill,
    );
  }

  seasonChip() {
    const meta = this.game.meta;
    const season = meta.season();
    const pr = meta.passProgress();
    const claim = meta.passClaimables() + meta.weeklyClaimables();
    return h('button.season-chip', { style: { '--c1': season.theme.colors[0], '--c2': season.theme.colors[1] }, onclick: () => this.ui.openPass() },
      h('span.sc-icon', season.theme.icon),
      h('span.sc-text', h('b', `Saison ${season.number} · ${season.theme.name}`), h('small', `Palier ${pr.tier}/${TIERS} · fin dans ${countdown(season.end - Date.now())}`)),
      h('span.sc-bar', h('i', { style: { width: `${Math.round((pr.tier / TIERS) * 100)}%` } })),
      claim ? h('i.badge', String(claim)) : null,
    );
  }

  refreshMeta() {
    if (this.el.classList.contains('hidden') || this.view !== 'home') return;
    this.pill?.update();
    const p = this.game.meta.p;
    const chip = this.el.querySelector('.profile-chip');
    if (chip) {
      const av = chip.querySelector('.pc-avatar');
      if (av.dataset.av !== p.avatar) {
        av.dataset.av = p.avatar;
        av.textContent = p.avatar;
      }
      chip.querySelector('b').textContent = p.name;
      chip.querySelector('small').textContent = p.title;
    }
    const free = this.el.querySelector('.si-chest');
    if (free) this.updateChestIcon(free);
    const card = this.el.querySelector('.event-card');
    if (card && card.dataset.key !== eventCardKey(this.game.meta)) card.replaceWith(eventCard(this.ui));
  }

  tick() {
    this.tickAcc = (this.tickAcc || 0) + 1;
    if (this.tickAcc % 4 === 0) this.refreshMeta();
  }

  updateChestIcon(btn) {
    const meta = this.game.meta;
    const wait = meta.freeChestIn();
    btn.querySelector('small').textContent = wait > 0 ? countdown(wait) : 'Gratuit !';
    btn.classList.toggle('ready', wait <= 0);
  }

  renderHome() {
    this.view = 'home';
    const el = clear(this.el);
    const slots = slotSummaries();
    const last = slots.filter((s) => s.exists).sort((a, b) => b.savedAt - a.savedAt)[0];
    const panel = h('div.start-panel');
    if (last) {
      panel.appendChild(h('button.btn.primary.huge.play', { onclick: () => this.game.continueGame(last.slot) },
        h('span', '▶ JOUER'),
        h('small', `${last.name} · ${last.mode === 'libre' ? 'Libre' : `Niv. ${last.level}`} · ${RANKS[(last.mairie || 1) - 1].name} · ${fmt(last.pop)} hab.`),
      ));
    }
    const row = h('div.start-row');
    row.appendChild(h('button.btn.huge' + (last ? '' : '.primary.play'), { onclick: () => this.renderNew() }, h('span', last ? '✨ Nouveau' : '✨ NOUVEAU VILLAGE')));
    if (slots.some((s) => s.exists)) row.appendChild(h('button.btn.huge', { onclick: () => this.renderSlots() }, h('span', '📂 Villages')));
    panel.appendChild(row);
    const icon = (ic, label, fn, cls = '') => h('button.start-icon' + (cls ? '.' + cls : ''), { onclick: fn }, h('span', ic), h('small', label));
    const chest = icon(chestArt('bois'), '', () => this.ui.openShop('featured'), 'si-chest');
    this.updateChestIcon(chest);
    const icons = h('div.start-icons',
      icon('🛒', 'Boutique', () => this.ui.openShop()),
      icon('🎖️', 'Passe', () => this.ui.openPass()),
      icon('👥', 'Amis', () => this.ui.openFriends()),
      chest,
      icon('⚙️', 'Réglages', () => this.ui.openSettings()),
    );
    const installed = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    el.append(
      this.topBar(),
      this.logo(),
      h('div.start-chips', this.seasonChip(), eventCard(this.ui)),
      panel,
      icons,
      h('div.start-foot',
        h('button.link', { onclick: () => this.ui.openNews() }, `Nouveautés · v${VERSION}`),
        h('button.link', { onclick: () => this.ui.openCloud() }, 'Compte et sauvegardes'),
        h('button.link', { onclick: () => this.showCredits() }, 'Crédits'),
        installed ? null : h('span', 'Partager → « Sur l\'écran d\'accueil » pour l\'installer'),
      ),
    );
  }

  showCredits() {
    this.ui.modal({
      title: '✨ Crédits', cls: 'credits-modal',
      body: h('div.credits',
        h('p', h('b', 'Bâtisseur'), ' — un jeu de construction de ville pour iPhone.'),
        h('p', 'Modèles 3D : ', h('b', 'KayKit'), ' par Kay Lousberg (Medieval Hexagon, City Builder, Halloween, Restaurant Bits) et ', h('b', 'Kenney'), ' — licence CC0.'),
        h('p', 'Polices : ', h('b', 'Lilita One'), ' et ', h('b', 'Fredoka'), ' (Google Fonts, licence OFL).'),
        h('p', 'Moteur 3D : ', h('b', 'Three.js'), ' (licence MIT).'),
        h('p.hint', 'Gemmes, coffres et passe de combat : tout se gagne en jouant, aucun achat réel.'),
      ),
      actions: [{ label: 'Fermer', cls: 'primary' }],
    });
  }

  renderSlots() {
    this.view = 'slots';
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
    this.view = 'new';
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
