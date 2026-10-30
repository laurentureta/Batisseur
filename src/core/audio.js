// Sons synthétisés : clics, construction, pièces, niveau. L'ambiance de fond peut venir de
// vrais enregistrements (voir ambience.js) ; faute de fichiers, elle reste synthétisée ici.
import { Ambience } from './ambience.js';

export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.ambTimer = 0;
    this.night = 0;
    this.amb = new Ambience(this);
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.amb.start();
    } catch {
      this.ctx = null;
    }
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, delay = 0, slide = 0, attack = 0.005 } = {}) {
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noise(dur, { vol = 0.2, delay = 0, freq = 1200, q = 0.8 } = {}) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(c.currentTime + delay);
  }

  play(name) {
    if (!this.settings.sound || !this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'tap':
        this.tone(880, 0.06, { vol: 0.12 });
        break;
      case 'place':
        this.noise(0.12, { vol: 0.25, freq: 500 });
        this.tone(520, 0.12, { vol: 0.2, slide: 0.6, type: 'triangle' });
        this.tone(780, 0.1, { vol: 0.12, delay: 0.06, type: 'triangle' });
        break;
      case 'road':
        this.noise(0.08, { vol: 0.18, freq: 900 });
        break;
      case 'chop': // coup de hache
        this.noise(0.05, { vol: 0.16, freq: 1700, q: 2.5 });
        this.tone(190, 0.07, { vol: 0.1, type: 'triangle', slide: 0.7 });
        break;
      case 'timber': // l'arbre craque et tombe
        this.noise(0.35, { vol: 0.14, freq: 420, q: 0.7 });
        this.tone(110, 0.4, { vol: 0.08, type: 'sawtooth', slide: 0.5, delay: 0.05 });
        this.noise(0.18, { vol: 0.16, freq: 260, delay: 0.85 });
        break;
      case 'harvest':
        this.noise(0.06, { vol: 0.1, freq: 2400, q: 1.5 });
        this.tone(660, 0.05, { vol: 0.05, type: 'triangle', delay: 0.02 });
        break;
      case 'drop':
        this.noise(0.07, { vol: 0.12, freq: 600 });
        this.tone(240, 0.08, { vol: 0.07, type: 'triangle', slide: 0.8 });
        break;
      case 'coin':
        this.tone(1320, 0.08, { vol: 0.15, type: 'square' });
        this.tone(1760, 0.16, { vol: 0.12, delay: 0.07, type: 'square' });
        break;
      case 'upgrade':
        [523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.18, { vol: 0.16, delay: k * 0.07, type: 'triangle' }));
        break;
      case 'levelup':
        [523, 659, 784, 1047, 1319].forEach((f, k) => this.tone(f, 0.28, { vol: 0.18, delay: k * 0.09, type: 'triangle' }));
        [1568, 2093].forEach((f, k) => this.tone(f, 0.4, { vol: 0.08, delay: 0.5 + k * 0.08 }));
        break;
      case 'quest':
        [784, 988, 1175].forEach((f, k) => this.tone(f, 0.2, { vol: 0.15, delay: k * 0.08, type: 'triangle' }));
        break;
      case 'error':
        this.tone(180, 0.16, { vol: 0.16, type: 'square', slide: 0.8 });
        break;
      case 'demolish':
        this.noise(0.3, { vol: 0.35, freq: 300, q: 0.5 });
        this.tone(140, 0.25, { vol: 0.2, slide: 0.5, type: 'sawtooth' });
        break;
      case 'unlock':
        [392, 523, 659, 784].forEach((f, k) => this.tone(f, 0.3, { vol: 0.15, delay: k * 0.1, type: 'triangle' }));
        break;
      case 'fire':
        for (let k = 0; k < 3; k++) {
          this.tone(880, 0.16, { vol: 0.12, delay: k * 0.36, type: 'square' });
          this.tone(660, 0.16, { vol: 0.12, delay: k * 0.36 + 0.18, type: 'square' });
        }
        break;
      case 'undo':
        this.tone(660, 0.08, { vol: 0.12, slide: 0.7 });
        break;
      case 'open':
        this.tone(600, 0.05, { vol: 0.08 });
        break;
      case 'hammer':
        this.noise(0.05, { vol: 0.22, freq: 2400, q: 1.2 });
        this.tone(320 + Math.random() * 60, 0.07, { vol: 0.08, type: 'square', slide: 0.5 });
        break;
      case 'saw': // aller-retour de scie
        this.noise(0.13, { vol: 0.07, freq: 3200, q: 3 });
        this.noise(0.12, { vol: 0.06, freq: 2600, q: 3, delay: 0.17 });
        break;
      case 'dig': // pelletée de terre
        this.noise(0.12, { vol: 0.12, freq: 380, q: 0.8 });
        this.noise(0.08, { vol: 0.06, freq: 900, q: 1, delay: 0.32 });
        break;
      case 'built': // inauguration d'un bâtiment
        [0, 1, 2].forEach((k) => this.noise(0.04, { vol: 0.12, freq: 2400, q: 1.2, delay: k * 0.09 }));
        [523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.22, { vol: 0.13, delay: 0.28 + k * 0.08, type: 'triangle' }));
        [784, 1047, 1319].forEach((f) => this.tone(f, 0.55, { vol: 0.06, delay: 0.62, type: 'triangle' }));
        break;
      case 'pick': // pioche sur la roche
        this.tone(1900 + Math.random() * 300, 0.05, { vol: 0.07, type: 'square', slide: 0.6 });
        this.noise(0.06, { vol: 0.12, freq: 2800, q: 1.4 });
        break;
      case 'anvil': // marteau sur l'enclume
        this.tone(1250, 0.22, { vol: 0.08, type: 'triangle', slide: 0.98 });
        this.tone(2480, 0.15, { vol: 0.04, type: 'sine' });
        this.noise(0.03, { vol: 0.1, freq: 3500, q: 2 });
        break;
      case 'splash':
        this.noise(0.22, { vol: 0.1, freq: 1400, q: 0.6 });
        this.tone(520, 0.08, { vol: 0.04, slide: 1.8, delay: 0.04 });
        break;
      case 'cast':
        this.noise(0.12, { vol: 0.05, freq: 3000, q: 1.5 });
        break;
      case 'cluck':
        for (let k = 0; k < 3; k++) this.tone(620 + Math.random() * 120, 0.05, { vol: 0.05, type: 'square', delay: k * 0.09, slide: 0.8 });
        break;
      case 'moo':
        this.tone(150, 0.7, { vol: 0.07, type: 'sawtooth', slide: 0.75, attack: 0.08 });
        this.tone(300, 0.6, { vol: 0.025, type: 'triangle', slide: 0.8, attack: 0.08 });
        break;
      case 'baa':
        this.tone(420, 0.45, { vol: 0.05, type: 'sawtooth', slide: 0.9, attack: 0.03 });
        break;
      case 'bark':
        this.tone(380, 0.08, { vol: 0.08, type: 'sawtooth', slide: 0.6 });
        this.tone(360, 0.08, { vol: 0.07, type: 'sawtooth', slide: 0.6, delay: 0.16 });
        break;
      case 'meow':
        this.tone(700, 0.35, { vol: 0.05, type: 'triangle', slide: 1.25, attack: 0.05 });
        break;
      case 'quack':
        this.tone(340, 0.09, { vol: 0.06, type: 'square', slide: 0.75 });
        this.tone(330, 0.09, { vol: 0.05, type: 'square', slide: 0.75, delay: 0.13 });
        break;
      case 'gem':
        [1568, 2093, 2637].forEach((f, k) => this.tone(f, 0.14, { vol: 0.1, delay: k * 0.05, type: 'sine' }));
        break;
      case 'chest':
        this.noise(0.18, { vol: 0.2, freq: 700, q: 0.6 });
        [392, 523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.22, { vol: 0.14, delay: 0.15 + k * 0.06, type: 'triangle' }));
        [2093, 2637].forEach((f, k) => this.tone(f, 0.3, { vol: 0.06, delay: 0.5 + k * 0.07 }));
        break;
      case 'buy':
        this.tone(1047, 0.07, { vol: 0.12, type: 'square' });
        this.tone(1568, 0.12, { vol: 0.1, delay: 0.06, type: 'square' });
        this.tone(2093, 0.16, { vol: 0.06, delay: 0.12 });
        break;
      case 'tier':
        [659, 880, 1175, 1568].forEach((f, k) => this.tone(f, 0.2, { vol: 0.13, delay: k * 0.06, type: 'triangle' }));
        break;
      case 'whoosh':
        this.noise(0.25, { vol: 0.12, freq: 900, q: 0.4 });
        break;
      case 'pop':
        this.tone(480, 0.1, { vol: 0.17, type: 'triangle', slide: 2.4 });
        this.tone(1568, 0.1, { vol: 0.07, delay: 0.07 });
        this.tone(2349, 0.16, { vol: 0.05, delay: 0.11 });
        break;
      case 'fete':
        this.noise(0.35, { vol: 0.12, freq: 2600, q: 0.5, delay: 0.42 });
        [392, 523, 659, 784].forEach((f, k) => this.tone(f, 0.16, { vol: 0.13, delay: k * 0.09, type: 'square' }));
        [523, 659, 784, 1047].forEach((f) => this.tone(f, 0.6, { vol: 0.07, delay: 0.38, type: 'triangle' }));
        [1568, 2093, 2637].forEach((f, k) => this.tone(f, 0.3, { vol: 0.05, delay: 0.55 + k * 0.07 }));
        break;
      case 'gift': // un cadeau d'un ami
        [784, 988, 1175, 1568].forEach((f, k) => this.tone(f, 0.18, { vol: 0.12, delay: k * 0.07, type: 'triangle' }));
        this.noise(0.12, { vol: 0.08, freq: 3200, q: 1.2, delay: 0.3 });
        break;
      case 'thud': // un bloc de briques s'écrase
        this.noise(0.5, { vol: 0.42, freq: 160, q: 0.6 });
        this.noise(0.25, { vol: 0.18, freq: 900, q: 0.8, delay: 0.02 });
        this.tone(70, 0.45, { vol: 0.28, type: 'sine', slide: 0.5 });
        for (let k = 0; k < 4; k++) this.noise(0.05, { vol: 0.08, freq: 2200 + k * 400, q: 2, delay: 0.12 + k * 0.07 });
        break;
      case 'clack': // des briques qui se posent
        this.noise(0.04, { vol: 0.1, freq: 1900, q: 2.2 });
        this.tone(420 + Math.random() * 80, 0.05, { vol: 0.05, type: 'triangle', slide: 0.7 });
        break;
      case 'whistle': // sifflet de la locomotive à vapeur (deux tuyaux légèrement désaccordés)
        for (const [at, d] of [[0, 0.55], [0.7, 0.9]]) {
          for (const f of [740, 932]) this.tone(f, d, { vol: 0.045, type: 'triangle', delay: at, attack: 0.06 });
          this.noise(d, { vol: 0.05, freq: 2600, q: 1.8, delay: at });
        }
        break;
      case 'chuff': // coup de piston
        this.noise(0.16, { vol: 0.07, freq: 520, q: 0.7 });
        break;
      default:
        break;
    }
  }

  /**
   * Musique de la cinématique d'introduction (synthétisée) : nappes d'accords, vent qui se lève
   * dans les nuages, notes égrenées pendant le survol, oiseaux au-dessus du village, carillon
   * et souffle à l'apparition du titre. Tout est calé sur la ligne de temps de la caméra.
   */
  cineScore() {
    if (!this.settings.sound || !this.ctx || this.ctx.state !== 'running') return null;
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0.0001;
    out.connect(this.master);
    const t0 = c.currentTime + 0.05;
    out.gain.exponentialRampToValueAtTime(1, t0 + 1.2);
    // réverbération légère (écho filtré)
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.32;
    const fb = c.createGain();
    fb.gain.value = 0.32;
    const damp = c.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    delay.connect(damp).connect(fb).connect(delay);
    const wet = c.createGain();
    wet.gain.value = 0.35;
    delay.connect(wet).connect(out);
    const bus = c.createGain();
    bus.connect(out);
    bus.connect(delay);
    const pad = (freqs, at, dur, vol = 0.045) => {
      for (const f of freqs) {
        for (const det of [-7, 7]) {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = det;
          const lp = c.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(700, t0 + at);
          lp.frequency.linearRampToValueAtTime(1500, t0 + at + dur * 0.6);
          lp.frequency.linearRampToValueAtTime(900, t0 + at + dur);
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t0 + at);
          g.gain.exponentialRampToValueAtTime(vol / freqs.length, t0 + at + Math.min(2.2, dur * 0.35));
          g.gain.setValueAtTime(vol / freqs.length, t0 + at + dur - 1.8);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur + 0.8);
          o.connect(lp).connect(g).connect(bus);
          o.start(t0 + at);
          o.stop(t0 + at + dur + 1);
        }
      }
    };
    const pluck = (f, at, vol = 0.05, len = 1.4) => {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g).connect(bus);
      o.start(t0 + at);
      o.stop(t0 + at + len + 0.05);
    };
    const bell = (f, at, vol = 0.05) => {
      for (const [m, v, d] of [[1, 1, 2.6], [2.76, 0.35, 1.2], [5.4, 0.12, 0.6]]) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * m;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(vol * v, t0 + at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d);
        o.connect(g).connect(bus);
        o.start(t0 + at);
        o.stop(t0 + at + d + 0.05);
      }
    };
    // vent : bruit filtré en boucle, il forcit en traversant les nuages
    const len = Math.floor(c.sampleRate * 2.5);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      data[i] = last * 6;
    }
    const wind = c.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.setValueAtTime(500, t0);
    wf.frequency.linearRampToValueAtTime(900, t0 + 7.2);
    wf.frequency.linearRampToValueAtTime(2200, t0 + 9.6);
    wf.frequency.linearRampToValueAtTime(600, t0 + 12.8);
    const wg = c.createGain();
    wg.gain.setValueAtTime(0.0001, t0);
    wg.gain.exponentialRampToValueAtTime(0.09, t0 + 2);
    wg.gain.linearRampToValueAtTime(0.1, t0 + 7);
    wg.gain.linearRampToValueAtTime(0.34, t0 + 9.4);
    wg.gain.linearRampToValueAtTime(0.06, t0 + 12.6);
    wg.gain.linearRampToValueAtTime(0.015, t0 + 18);
    wg.gain.exponentialRampToValueAtTime(0.0001, t0 + 24);
    wind.connect(wf).connect(wg).connect(out);
    wind.start(t0);
    wind.stop(t0 + 25);
    // accords
    pad([174.6, 220, 261.6, 329.6], 0, 7.8);
    pad([164.8, 196, 261.6, 293.7], 7.4, 5.6);
    pad([110, 164.8, 196, 261.6], 12.6, 4.6);
    pad([123.5, 146.8, 196, 329.6], 16.8, 4.4);
    pad([130.8, 196, 261.6, 329.6, 587.3], 20.9, 7, 0.06);
    // notes égrenées pendant le survol
    const arps = [[523.3, 659.3, 784, 880], [440, 523.3, 659.3, 784], [493.9, 587.3, 784, 987.8]];
    for (let k = 0; k < 20; k++) {
      const at = 12.8 + k * 0.42;
      const chord = arps[Math.min(2, Math.floor((at - 12.8) / 2.8))];
      pluck(chord[k % 4] * (k % 8 >= 4 ? 1 : 0.5), at, 0.035);
    }
    // les oiseaux au-dessus du village
    for (let k = 0; k < 7; k++) {
      const at = 13.6 + k * 0.9 + (k % 3) * 0.2;
      const base = 2400 + (k % 3) * 500;
      for (let j = 0; j < 3; j++) {
        const o = c.createOscillator();
        o.frequency.setValueAtTime(base + j * 120, t0 + at + j * 0.11);
        o.frequency.exponentialRampToValueAtTime(base * 1.3, t0 + at + j * 0.11 + 0.08);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0 + at + j * 0.11);
        g.gain.exponentialRampToValueAtTime(0.02, t0 + at + j * 0.11 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + j * 0.11 + 0.09);
        o.connect(g).connect(out);
        o.start(t0 + at + j * 0.11);
        o.stop(t0 + at + j * 0.11 + 0.1);
      }
    }
    // le titre : souffle, carillon
    const swoosh = c.createBufferSource();
    swoosh.buffer = buf;
    const sf = c.createBiquadFilter();
    sf.type = 'bandpass';
    sf.Q.value = 0.7;
    sf.frequency.setValueAtTime(400, t0 + 17);
    sf.frequency.exponentialRampToValueAtTime(3500, t0 + 18.2);
    const sg = c.createGain();
    sg.gain.setValueAtTime(0.0001, t0 + 17);
    sg.gain.exponentialRampToValueAtTime(0.22, t0 + 17.6);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 18.8);
    swoosh.connect(sf).connect(sg).connect(out);
    swoosh.start(t0 + 17);
    swoosh.stop(t0 + 19);
    [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, k) => bell(f, 21 + k * 0.13, 0.05));
    bell(2093, 21.85, 0.03);
    return {
      stop: (fade = 0.6) => {
        const now = c.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now);
        out.gain.exponentialRampToValueAtTime(0.0001, now + fade);
        setTimeout(() => {
          try {
            wind.stop();
          } catch {
            /* déjà arrêté */
          }
          out.disconnect();
        }, (fade + 0.2) * 1000);
      },
    };
  }

  /** Ambiance de fond. Si des enregistrements sont présents, ce sont eux qui jouent ; sinon
      on garde les petits bruits synthétisés : oiseaux le jour, grillons la nuit.
      `info` porte le contexte (hiver, eau sous la caméra, population) ; il peut manquer. */
  ambience(dt, night, zoomedIn, info = null) {
    if (!this.settings.sound || !this.settings.ambience || !this.ctx || this.ctx.state !== 'running') return;
    this.amb.update(dt, {
      night,
      winter: info?.winter || 0,
      close: zoomedIn ? 1 : 0,
      water: info?.water || 0,
      population: info?.population || 0,
    });
    if (this.amb.playing) return;   // de vrais enregistrements : plus besoin des bips
    this.ambTimer -= dt;
    if (this.ambTimer > 0) return;
    this.ambTimer = 2.5 + Math.random() * 5;
    if (!zoomedIn) return;
    if (night > 0.6) {
      for (let k = 0; k < 4; k++) this.tone(4200 + Math.random() * 300, 0.04, { vol: 0.025, delay: k * 0.09 });
    } else if (night < 0.3) {
      const base = 2200 + Math.random() * 1200;
      for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) this.tone(base + Math.random() * 400, 0.09, { vol: 0.03, delay: k * 0.12, slide: 1.3 });
    }
  }
}
