// "Głos" – what the vocal folds do to a held note, as control signals for the choir samples.
// Outputs 0..2: pitch deviation in cents for three groups of singers (each voice is connected to one group);
// output 3: amplitude deviation (added to a gain of 1).
// Ingredients (as in the analog oscillators of Kurhan: a slow random walk for drift, a warm-up that settles,
// a spread between units, one "age" knob that scales all imperfections):
//  - vibrato: ~5 Hz, its rate and depth wander a little from cycle to cycle, it blooms after each onset
//  - jitter: fast, tiny period-to-period pitch noise (the folds never close exactly the same way)
//  - drift: slow random walk of the pitch (a group sags and corrects), different for every group
//  - tremor: irregular 4-7 Hz wobble in pitch and loudness (physiological tremor, stronger with age)
//  - shimmer: fast loudness noise, and breath pressure swells
'use strict';
const TAU = Math.PI * 2;
class Glos extends AudioWorkletProcessor {
  constructor(){
    super();
    this.p = {vib: 14, vibRate: 5.2, jitter: .35, shimmer: .3, tremor: .25, age: .3, drift: .4};
    this.vph = Math.random(); this.vr = 1; this.vd = 1; this.bloom = 1;
    this.g = [0, 1, 2].map(() => ({dr: 0, sl: 0, fj: 0, fj2: 0, tr1: 0, tr2: 0, trph: Math.random(), off: (Math.random() * 2 - 1), vph: Math.random()}));
    this.sh = 0; this.sh2 = 0; this.br = 0; this.brT = 0; this.warm = 1; this.k = 0;
    this.out = [0, 0, 0, 0]; this.prev = [0, 0, 0, 0];
    this.port.onmessage = e => { const m = e.data; if (m.type === 'set') Object.assign(this.p, m.p); else if (m.type === 'onset') this.bloom = 0; };
  }
  process(_, outputs){
    const n = outputs[0][0].length, sr = sampleRate, p = this.p, age = p.age, step = 16, dt = step / sr;
    for (let i0 = 0; i0 < n; i0 += step){
      // ---- control rate (every 16 samples)
      this.warm *= Math.exp(-dt / 25);
      this.bloom = Math.min(1, this.bloom + dt / .45);
      // vibrato: rate and depth wander per cycle
      this.vph += p.vibRate * this.vr * dt; if (this.vph >= 1){ this.vph -= 1; this.vr = 1 + (Math.random() * 2 - 1) * (.04 + .08 * age); this.vd = 1 + (Math.random() * 2 - 1) * (.15 + .2 * age); }
      const vib = p.vib * this.vd * Math.sin(TAU * this.vph) * this.bloom * this.bloom;
      // shimmer + breath pressure (shared by the section)
      this.sh += (Math.random() * 2 - 1 - this.sh) * .25; this.sh2 += (this.sh - this.sh2) * .25;
      if (Math.random() < dt * .6) this.brT = (Math.random() * 2 - 1) * .5; this.br += (this.brT - this.br) * dt * 1.5;
      let amp = p.shimmer * (this.sh2 * .22 + this.br * .12);
      for (let k = 0; k < 3; k++){
        const G = this.g[k];
        // slow drift: random walk pulled back to the note (like Kurhan's dr = dr * .999 + noise)
        G.dr = G.dr * (1 - dt * .35) + (Math.random() * 2 - 1) * Math.sqrt(dt) * 1.4;
        // fast jitter: two-pole low-passed noise ~ 30 Hz
        G.fj += (Math.random() * 2 - 1 - G.fj) * .5; G.fj2 += (G.fj - G.fj2) * .5;
        // tremor: narrow-band noise around 4-7 Hz (resonator driven by noise)
        G.trph += (4.5 + 2 * age + G.off * .8) * dt; const w = Math.sin(TAU * G.trph);
        G.tr1 += (Math.random() * 2 - 1 - G.tr1) * dt * 1.2; const tr = w * (.5 + G.tr1);
        const cents = vib * (1 + .12 * G.off)
          + p.drift * (6 + 14 * age) * G.dr
          + p.jitter * (3 + 6 * age) * G.fj2
          + p.tremor * (5 + 18 * age) * tr
          + age * 10 * G.off * this.warm - age * 6 * this.warm;   // a cold voice starts flat and settles
        this.out[k] = cents;
        if (k === 0) amp += p.tremor * (.06 + .12 * age) * tr;
      }
      this.out[3] = amp;
      // ---- write, interpolated across the step
      const i1 = Math.min(n, i0 + step);
      for (let o = 0; o < 4; o++){ const ch = outputs[o][0], a = this.prev[o], b = this.out[o], d = (b - a) / (i1 - i0); for (let i = i0; i < i1; i++) ch[i] = a + d * (i - i0); this.prev[o] = b; }
    }
    return true;
  }
}
registerProcessor('glos', Glos);
