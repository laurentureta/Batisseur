// Lit d'ambiance : de vrais enregistrements en boucle, fondus entre eux selon l'heure, la
// saison et ce que la caméra regarde. Jusqu'ici l'ambiance du jeu était faite de sinusoïdes —
// des « oiseaux » qui étaient des bips. Si un fichier manque, rien ne casse : la couche reste
// muette et la synthèse de audio.js continue de jouer, exactement comme avant.

/** Les couches, de la plus large à la plus locale. `want` rend le volume voulu (0 = muet). */
export const LAYERS = [
  {
    id: 'jour',
    file: 'audio/amb_jour.ogg',
    gain: 0.5,
    want: (c) => (1 - c.night) * (1 - c.winter * 0.45),
  },
  {
    id: 'nuit',
    file: 'audio/amb_nuit.ogg',
    gain: 0.45,
    want: (c) => c.night,
  },
  {
    id: 'hiver',
    file: 'audio/amb_hiver.ogg',
    gain: 0.4,
    want: (c) => c.winter * (1 - c.night * 0.5),
  },
  {
    id: 'village',
    file: 'audio/amb_village.ogg',
    gain: 0.55,
    // la rumeur du village : on ne l'entend qu'en s'approchant, et elle se tait la nuit
    want: (c) => c.close * (1 - c.night) * Math.min(1, c.population / 60),
  },
  {
    id: 'eau',
    file: 'audio/amb_eau.ogg',
    gain: 0.5,
    want: (c) => c.close * c.water,
  },
];

const FADE = 2.5;   // secondes pour qu'une couche monte ou descende

export class Ambience {
  constructor(sound) {
    this.sound = sound;
    this.bus = null;
    this.tracks = new Map();
    this.loading = new Set();
    this.missing = new Set();
    this.ready = false;
  }

  get ctx() { return this.sound.ctx; }

  /** Appelé une fois le contexte audio débloqué. Charge en tâche de fond, sans bloquer. */
  start() {
    const c = this.ctx;
    if (!c || this.bus) return;
    this.bus = c.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.sound.master);
    for (const layer of LAYERS) this.load(layer);
  }

  async load(layer) {
    const c = this.ctx;
    if (!c || this.tracks.has(layer.id) || this.loading.has(layer.id) || this.missing.has(layer.id)) return;
    this.loading.add(layer.id);
    try {
      const res = await fetch(layer.file);
      if (!res.ok) throw new Error(String(res.status));
      const buf = await c.decodeAudioData(await res.arrayBuffer());
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      gain.connect(this.bus);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain);
      src.start(c.currentTime + Math.random() * 0.4);
      this.tracks.set(layer.id, { layer, gain, src, level: 0 });
      this.ready = true;
    } catch {
      // pas de fichier (ou format refusé) : cette couche n'existera pas, et c'est tout
      this.missing.add(layer.id);
    } finally {
      this.loading.delete(layer.id);
    }
  }

  /** Vrai dès qu'au moins une couche enregistrée joue : audio.js coupe alors ses bips. */
  get playing() { return this.ready && this.tracks.size > 0; }

  /** `info` : { night, winter, close, water, population }. Les quatre premiers entre 0 et 1. */
  update(dt, info) {
    if (!this.bus || !this.tracks.size) return;
    const on = this.sound.settings.sound && this.sound.settings.ambience !== false;
    const c = this.ctx;
    for (const t of this.tracks.values()) {
      const target = on ? Math.max(0, Math.min(1, t.layer.want(info))) * t.layer.gain : 0;
      if (Math.abs(target - t.level) < 0.002) continue;
      // on glisse vers la cible au lieu de sauter : un fondu de FADE secondes à pleine course
      const step = Math.min(1, dt / FADE);
      t.level += (target - t.level) * step;
      t.gain.gain.setTargetAtTime(Math.max(0.0001, t.level), c.currentTime, 0.25);
    }
  }

  /** Coupe tout (sortie du jeu, mise en sourdine). */
  stop() {
    for (const t of this.tracks.values()) { try { t.src.stop(); } catch {} }
    this.tracks.clear();
    try { this.bus?.disconnect(); } catch {}
    this.bus = null;
    this.ready = false;
  }
}
