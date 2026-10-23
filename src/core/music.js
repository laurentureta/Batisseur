// Musique d'ambiance, composée en direct (aucun fichier audio) : des accords tenus, une harpe qui
// égrène les accords, une basse douce et, de temps en temps, une petite mélodie de flûte qui se
// répète et se transforme. Elle change avec le moment de la journée :
// - le jour : majeur, tranquille (harpe, flûte) ; en hiver, des clochettes remplacent la harpe ;
// - la nuit : mineur, lent, quelques notes de célesta dans la réverbération ;
// - les jours de fête : accordéon, basse « oum-pa », tambourin et mains qui claquent
//   (Halloween : plus mystérieux ; Noël : grelots).
// Les passages d'une ambiance à l'autre se font en fondu, sur la mesure.

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

const MOODS = {
  day: {
    bpm: 82, key: 53, scale: 'major', swing: 0, arp: 'harp', lead: 'flute', bass: 'soft', perc: null, pad: 'warm', vol: 1, wet: 0.3,
    progs: [[0, 5, 3, 4], [0, 3, 4, 0], [5, 3, 0, 4], [0, 4, 5, 3], [3, 4, 0, 5], [0, 2, 3, 4]],
  },
  winter: {
    bpm: 74, key: 53, scale: 'major', swing: 0, arp: 'bells', lead: 'flute', bass: 'soft', perc: null, pad: 'warm', vol: 0.9, wet: 0.4,
    progs: [[0, 5, 3, 4], [0, 3, 4, 0], [5, 3, 0, 4], [0, 4, 5, 3]],
  },
  night: {
    bpm: 60, key: 57, scale: 'dorian', swing: 0, arp: 'celesta', lead: null, bass: 'whole', perc: null, pad: 'dark', vol: 0.75, wet: 0.5,
    progs: [[0, 5, 3, 4], [0, 3, 0, 4], [0, 6, 5, 4], [3, 0, 4, 0]],
  },
  fete: {
    bpm: 112, key: 55, scale: 'major', swing: 0.12, arp: null, lead: 'accordion', bass: 'oompah', perc: 'fete', pad: 'accordion', vol: 0.9, wet: 0.2,
    progs: [[0, 3, 4, 0], [0, 4, 0, 4], [3, 4, 0, 0], [0, 5, 3, 4]],
  },
  spooky: {
    bpm: 96, key: 50, scale: 'harmonic', swing: 0, arp: 'celesta', lead: 'celestaLead', bass: 'oompah', perc: 'light', pad: 'dark', vol: 0.85, wet: 0.4,
    progs: [[0, 5, 3, 4], [0, 3, 4, 4], [0, 5, 1, 4]],
  },
  xmas: {
    bpm: 104, key: 57, scale: 'major', swing: 0.1, arp: 'bells', lead: 'flute', bass: 'oompah', perc: 'sleigh', pad: 'warm', vol: 0.9, wet: 0.3,
    progs: [[0, 3, 4, 0], [0, 5, 3, 4], [3, 0, 4, 0]],
  },
};

// motifs rythmiques d'une mélodie (deux mesures de 4 temps)
const RHYTHMS = [
  [0, 1, 1.5, 2, 4, 5, 6],
  [0, 0.5, 1, 2, 3, 4, 6],
  [0, 1.5, 2, 3, 4, 4.5, 5, 6],
  [0, 2, 3, 3.5, 4, 6],
  [0, 1, 2, 2.5, 3, 4, 5.5, 6],
];

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Music {
  constructor(sound, settings) {
    this.sound = sound;
    this.settings = settings;
    this.out = null;
    this.session = null;
    this.wanted = null;
    this.rng = mulberry(Date.now());
    this.timer = 0;
  }

  get ctx() {
    return this.sound.ctx;
  }

  /** Volume réglé (0 à 1) → gain. */
  level() {
    const v = this.settings.musicVol ?? 0.5;
    return v * v * 2.4;
  }

  setup() {
    const c = this.ctx;
    if (this.out || !c) return !!this.out;
    this.out = c.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(c.destination);
    // réverbération : réponse impulsionnelle fabriquée (bruit qui s'éteint)
    const len = Math.floor(c.sampleRate * 2.6);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
        d[i] = lp * Math.pow(1 - t, 2.4) * (i < 80 ? i / 80 : 1);
      }
    }
    this.verb = c.createConvolver();
    this.verb.buffer = ir;
    this.verb.connect(this.out);
    // bruit blanc partagé (percussions, souffle de la flûte)
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    return true;
  }

  /** Appelé à chaque image : choisit l'ambiance et fait avancer la partition. */
  update(dt, mood) {
    const c = this.ctx;
    const on = this.settings.music !== false && c && c.state === 'running' && !document.hidden;
    if (!on) mood = null;
    if (mood && !this.setup()) return;
    if (!this.out) return;
    // volume général (suit le réglage)
    const target = mood ? this.level() : 0.0001;
    if (Math.abs((this.outLevel ?? 0) - target) > 1e-4) {
      this.outLevel = target;
      this.out.gain.cancelScheduledValues(c.currentTime);
      this.out.gain.setTargetAtTime(Math.max(0.0001, target), c.currentTime, mood ? 0.6 : 0.25);
    }
    if (mood !== (this.session?.mood ?? null)) this.change(mood);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.1;
    if (this.session) this.schedule(this.session);
    if (this.fading) {
      for (const s of this.fading) if (c.currentTime > s.endAt) s.bus.disconnect();
      this.fading = this.fading.filter((s) => c.currentTime <= s.endAt);
    }
  }

  change(mood) {
    const c = this.ctx;
    const now = c.currentTime;
    const old = this.session;
    let start = now + 0.15;
    if (old) {
      // l'ancienne ambiance s'efface pendant que la nouvelle entre, à la mesure suivante
      start = Math.max(now + 0.15, Math.min(old.nextBar, now + 2.5));
      old.bus.gain.cancelScheduledValues(now);
      old.bus.gain.setValueAtTime(old.bus.gain.value, now);
      old.bus.gain.linearRampToValueAtTime(0.0001, start + 2.5);
      old.endAt = start + 6;
      (this.fading ||= []).push(old);
    }
    this.session = null;
    if (!mood) return;
    const M = MOODS[mood];
    const bus = c.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.linearRampToValueAtTime(M.vol, start + (old ? 3 : 1.5));
    bus.connect(this.out);
    const send = c.createGain();
    send.gain.value = M.wet;
    bus.connect(send).connect(this.verb);
    this.session = {
      mood, M, bus, scale: SCALES[M.scale], beat: 60 / M.bpm, nextBar: start, bar: 0,
      prog: this.pick(M.progs), motifs: null, lastLead: 7,
    };
  }

  pick(list) {
    return list[Math.floor(this.rng() * list.length)];
  }

  /* ───────── Partition ───────── */
  schedule(S) {
    const c = this.ctx;
    while (S.nextBar < c.currentTime + 0.6) {
      this.playBar(S, S.nextBar);
      S.nextBar += S.beat * 4;
      S.bar++;
    }
  }

  /** Note d'un degré de la gamme (deg peut dépasser 7 : octaves). */
  noteOf(S, deg, octave) {
    const n = S.scale.length;
    const o = Math.floor(deg / n);
    const i = ((deg % n) + n) % n;
    return S.M.key + (octave - 3 + o) * 12 + S.scale[i]; // octave 3 = la tonique de base
  }

  playBar(S, t) {
    const M = S.M, rng = this.rng;
    // structure : 16 mesures ; nouvelle grille d'accords à chaque cycle
    const pos = S.bar % 16;
    if (pos === 0 && S.bar > 0) {
      S.prog = this.pick(M.progs);
      S.motifs = null;
    }
    const chord = S.prog[pos % 4];
    const beat = S.beat;
    const sw = (k) => (k % 2 ? M.swing * beat : 0); // croches « swinguées »
    const breath = !M.perc && S.bar % 32 >= 28; // respiration : accords seuls (pas les jours de fête)
    // accords tenus
    this.padChord(S, t, beat * 4, chord);
    // basse
    if (M.bass === 'soft') {
      this.bass(t, this.noteOf(S, chord, 2), beat * 1.9, 0.5);
      this.bass(t + beat * 2, this.noteOf(S, chord + (pos % 2 ? 4 : 0), 2), beat * 1.9, 0.38);
    } else if (M.bass === 'whole') {
      this.bass(t, this.noteOf(S, chord, 2), beat * 3.8, 0.45);
    } else if (M.bass === 'oompah' && !breath) {
      this.bass(t, this.noteOf(S, chord, 2), beat * 0.8, 0.6);
      this.bass(t + beat * 2, this.noteOf(S, chord - 3, 2), beat * 0.8, 0.5);
      for (const k of [1, 3]) this.stab(S, t + beat * k, chord, beat * 0.45);
    }
    if (breath) return;
    // arpèges
    if (M.arp === 'harp' || M.arp === 'bells') {
      const pat = [[0, 1, 2, 3, 2, 1, 2, 1], [0, 2, 1, 3, 2, 4, 3, 2], [0, 1, 2, 1, 3, 2, 1, 2]][S.bar % 3];
      const density = pos < 8 ? 1 : 0.75;
      for (let k = 0; k < 8; k++) {
        if (k > 0 && rng() > density) continue;
        const deg = chord + [0, 2, 4, 7, 9][pat[k]];
        const tt = t + k * beat * 0.5 + sw(k);
        if (M.arp === 'bells') this.bell(tt, this.noteOf(S, deg, 5), k % 4 === 0 ? 0.32 : 0.2, 1.4);
        else this.pluck(tt, this.noteOf(S, deg, 4), k % 4 === 0 ? 0.55 : 0.38);
      }
    } else if (M.arp === 'celesta') {
      // quelques notes isolées qui tintent dans la nuit
      for (let k = 0; k < 4; k++) {
        if (rng() < (M.lead ? 0.45 : 0.35)) {
          const deg = chord + [0, 2, 4, 7, 9][Math.floor(rng() * 5)];
          this.bell(t + k * beat + (rng() < 0.3 ? beat * 0.5 : 0), this.noteOf(S, deg, 5), 0.22, 2.6);
        }
      }
    }
    // mélodie : les 8 dernières mesures du cycle (toutes pour la fête)
    if (M.lead && (pos >= 8 || M.perc === 'fete' || M.perc === 'sleigh')) this.melody(S, t, chord, pos);
    // percussions
    if (M.perc === 'fete' || M.perc === 'sleigh') {
      for (let k = 0; k < 8; k++) this.shaker(t + k * beat * 0.5 + sw(k), k % 2 ? 0.05 : 0.09, M.perc === 'sleigh');
      if (M.perc === 'fete') for (const k of [1, 3]) this.clap(t + beat * k);
    } else if (M.perc === 'light') {
      for (const k of [0, 2]) this.shaker(t + beat * k, 0.05, false);
    }
  }

  /** Mélodie construite sur des motifs de deux mesures qui reviennent (A A' B A''). */
  melody(S, t, chord, pos) {
    const rng = this.rng, beat = S.beat;
    const half = Math.floor(pos / 2) % 4; // quelle paire de mesures
    if (pos % 2) return; // on joue la paire entière d'un coup
    if (!S.motifs) {
      const mk = () => {
        const r = RHYTHMS[Math.floor(rng() * RHYTHMS.length)];
        const steps = [0];
        for (let k = 1; k < r.length; k++) {
          const x = rng();
          steps.push(steps[k - 1] + (x < 0.35 ? 1 : x < 0.7 ? -1 : x < 0.82 ? 2 : x < 0.94 ? -2 : 0));
        }
        return { r, steps };
      };
      S.motifs = { A: mk(), B: mk() };
    }
    const m = half === 2 ? S.motifs.B : S.motifs.A;
    const chord2 = S.prog[(pos + 1) % 4];
    const tones = (c) => [c, c + 2, c + 4];
    // première note : la note de l'accord la plus proche de la dernière jouée
    let first = S.lastLead;
    let best = 99;
    for (const ct of tones(chord)) for (const o of [0, 7, 14]) if (Math.abs(ct + o - S.lastLead) < best) (best = Math.abs(ct + o - S.lastLead)), (first = ct + o);
    first = Math.max(4, Math.min(11, first));
    const notes = [];
    for (let k = 0; k < m.r.length; k++) {
      const b = m.r[k];
      let deg = first + m.steps[k];
      // temps forts : on retombe sur une note de l'accord en cours
      if (b % 2 === 0) {
        const c = b >= 4 ? chord2 : chord;
        let nb = deg, bd = 99;
        for (const ct of tones(c)) for (const o of [-7, 0, 7, 14]) if (Math.abs(ct + o - deg) < bd) (bd = Math.abs(ct + o - deg)), (nb = ct + o);
        deg = nb;
      }
      deg = Math.max(2, Math.min(12, deg));
      notes.push([b, deg]);
    }
    // fin de phrase : on se pose sur la tonique
    if (half === 3) notes[notes.length - 1][1] = notes[notes.length - 1][1] >= 4 ? 7 : 0;
    for (let k = 0; k < notes.length; k++) {
      const [b, deg] = notes[k];
      const nextB = k + 1 < notes.length ? notes[k + 1][0] : 8;
      const dur = Math.min(2.5, nextB - b) * beat;
      const tt = t + b * beat + ((b * 2) % 2 ? S.M.swing * beat : 0);
      const midi = this.noteOf(S, deg, 4);
      if (S.M.lead === 'flute') this.flute(tt, midi, dur * 0.95, k === 0 ? 0.36 : 0.3);
      else if (S.M.lead === 'accordion') this.accordion(tt, midi, dur * 0.8, 0.22);
      else this.bell(tt, midi, 0.24, 1.8);
      S.lastLead = deg;
    }
  }

  /* ───────── Instruments ───────── */
  env(g, t, a, peak, d, sustain = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (sustain) g.gain.setTargetAtTime(peak * sustain, t + a, d / 3);
    else g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  osc(type, freq, t, stop, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.connect(dest);
    o.start(t);
    o.stop(stop);
    return o;
  }

  padChord(S, t, dur, chord) {
    const c = this.ctx, M = S.M;
    if (M.pad === 'accordion') return; // la fête : accords piqués à la place
    const degs = [chord, chord + 2, chord + 4, chord + (M.pad === 'warm' ? 6 : 7)];
    // voix proches de l'accord précédent
    let midis = degs.map((d) => this.noteOf(S, d, 3));
    midis = midis.map((m) => (m > 64 ? m - 12 : m < 50 ? m + 12 : m));
    const out = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(M.pad === 'dark' ? 650 : 950, t);
    lp.frequency.linearRampToValueAtTime(M.pad === 'dark' ? 900 : 1500, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(M.pad === 'dark' ? 650 : 1000, t + dur);
    lp.Q.value = 0.4;
    lp.connect(out).connect(S.bus);
    const vol = (M.pad === 'dark' ? 0.045 : 0.04) / midis.length;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(vol, t + Math.min(1.4, dur * 0.35));
    out.gain.setValueAtTime(vol, t + dur - 0.2);
    out.gain.linearRampToValueAtTime(0.0001, t + dur + 1.4);
    for (const m of midis) {
      const f = midiHz(m);
      this.osc('sawtooth', f, t, t + dur + 1.5, lp, -7);
      this.osc(M.pad === 'dark' ? 'triangle' : 'sawtooth', f, t, t + dur + 1.5, lp, 7);
    }
  }

  pluck(t, midi, vel) {
    const c = this.ctx, S = this.session;
    if (!S) return;
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.6);
    lp.connect(g).connect(S.bus);
    this.env(g, t, 0.004, 0.11 * vel, 1.3);
    const f = midiHz(midi);
    this.osc('triangle', f, t, t + 1.4, lp);
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    g2.connect(lp);
    this.osc('sine', f * 2, t, t + 0.6, g2);
  }

  bell(t, midi, vel, len) {
    const c = this.ctx, S = this.session;
    if (!S) return;
    const f = midiHz(midi);
    for (const [ratio, v, d] of [[1, 1, len], [2.76, 0.28, len * 0.45], [5.4, 0.09, len * 0.2]]) {
      const g = c.createGain();
      g.connect(S.bus);
      this.env(g, t, 0.003, 0.1 * vel * v, d);
      this.osc('sine', f * ratio, t, t + d + 0.05, g);
    }
  }

  flute(t, midi, dur, vel) {
    const c = this.ctx, S = this.session;
    if (!S) return;
    const f = midiHz(midi);
    const g = c.createGain();
    g.connect(S.bus);
    const peak = 0.07 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.07);
    g.gain.setValueAtTime(peak * 0.85, t + Math.max(0.08, dur - 0.08));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.12);
    const o = this.osc('sine', f, t, t + dur + 0.2, g);
    const o2g = c.createGain();
    o2g.gain.value = 0.12;
    o2g.connect(g);
    const o2 = this.osc('triangle', f * 2, t, t + dur + 0.2, o2g);
    // vibrato qui arrive doucement
    if (dur > 0.35) {
      const lfo = c.createOscillator();
      lfo.frequency.value = 5.2;
      const lg = c.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, dur));
      lfo.connect(lg);
      lg.connect(o.frequency);
      lg.connect(o2.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.2);
    }
    // souffle
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 2;
    const ng = c.createGain();
    this.env(ng, t, 0.03, 0.012 * vel, 0.18);
    n.connect(bp).connect(ng).connect(S.bus);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.3);
  }

  accordion(t, midi, dur, vel) {
    const c = this.ctx, S = this.session;
    if (!S) return;
    const f = midiHz(midi);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const g = c.createGain();
    lp.connect(g).connect(S.bus);
    const peak = 0.05 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.03);
    g.gain.setValueAtTime(peak, t + Math.max(0.04, dur - 0.05));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.06);
    for (const det of [-9, 9]) this.osc('sawtooth', f, t, t + dur + 0.1, lp, det);
    const sq = c.createGain();
    sq.gain.value = 0.4;
    sq.connect(lp);
    this.osc('square', f / 2, t, t + dur + 0.1, sq);
  }

  stab(S, t, chord, dur) {
    for (const d of [chord + 2, chord + 4, chord + 7]) this.accordion(t, this.noteOf(S, d, 3), dur, 0.35);
  }

  bass(t, midi, dur, vel) {
    const c = this.ctx, S = this.session;
    if (!S) return;
    const f = midiHz(midi);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const g = c.createGain();
    lp.connect(g).connect(S.bus);
    this.env(g, t, 0.02, 0.16 * vel, dur, 0.55);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.08);
    this.osc('triangle', f, t, t + dur + 0.5, lp);
    const s = c.createGain();
    s.gain.value = 0.6;
    s.connect(lp);
    this.osc('sine', f / 2, t, t + dur + 0.5, s);
  }

  shaker(t, vel, bells) {
    const c = this.ctx, S = this.session;
    if (!S) return;
    if (bells) {
      // grelots : petites cloches très aiguës
      for (const m of [100, 104]) this.bell(t + Math.random() * 0.01, m, vel * 1.2, 0.25);
      return;
    }
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const g = c.createGain();
    this.env(g, t, 0.004, vel * 0.5, 0.07);
    n.connect(hp).connect(g).connect(S.bus);
    n.start(t, Math.random() * 0.8);
    n.stop(t + 0.12);
  }

  clap(t) {
    const c = this.ctx, S = this.session;
    if (!S) return;
    for (let k = 0; k < 3; k++) {
      const n = c.createBufferSource();
      n.buffer = this.noiseBuf;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 0.9;
      const g = c.createGain();
      this.env(g, t + k * 0.011, 0.002, k === 2 ? 0.07 : 0.04, k === 2 ? 0.13 : 0.02);
      n.connect(bp).connect(g).connect(S.bus);
      n.start(t + k * 0.011, Math.random() * 0.8);
      n.stop(t + k * 0.011 + 0.2);
    }
  }
}

/** L'ambiance qui convient au moment (null : pas de musique). */
export function pickMood(game) {
  const r = game.renderer;
  if (!r || r.cinematic?.active) return null;
  const meta = game.meta;
  let ev = null;
  try {
    ev = meta?.event?.();
  } catch {
    ev = null;
  }
  if (ev?.status === 'live' && game.playing && game.state?.mode !== 'libre') {
    if (ev.id === 'halloween') return 'spooky';
    if (ev.id === 'noel' || ev.id === 'marchenoel') return 'xmas';
    return 'fete';
  }
  if ((r.night || 0) > 0.55) return 'night';
  return r.season === 3 ? 'winter' : 'day';
}
