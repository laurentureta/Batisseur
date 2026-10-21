// Sons synthétisés (aucun fichier audio) : clics, construction, pièces, niveau, ambiance.
export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.ambTimer = 0;
    this.night = 0;
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
      default:
        break;
    }
  }

  /** Petits bruits d'ambiance : oiseaux le jour, grillons la nuit. */
  ambience(dt, night, zoomedIn) {
    if (!this.settings.sound || !this.settings.ambience || !this.ctx || this.ctx.state !== 'running') return;
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
