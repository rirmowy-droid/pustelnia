// "Wielo" – a polyphonic synthesizer with many different oscillator kinds, run in an AudioWorklet.
// Every voice is a stack of oscillators (sine, triangle, band-limited saw and pulse with PWM, supersaw, 2- and
// 3-operator FM, wavefolder, hard sync, ring modulation, additive partials, FOF vocal formants, filtered noise
// bands, Karplus-Strong plucked/bowed string, chaotic logistic-map oscillator, morphing wavetable, phase
// distortion, sub-octave) -> state-variable filter with its own envelope -> amp envelope -> stereo.
'use strict';
const TAU = Math.PI * 2;
function blep(t, dt){ if (t < dt){ t /= dt; return t + t - t*t - 1; } if (t > 1 - dt){ t = (t - 1) / dt; return t*t + t + t + 1; } return 0; }
const VOWELS = { // formant frequencies (Hz), bandwidths, gains (dB) – adult male; children scale ~1.25
  a: [[700,1220,2600],[80,90,120],[0,-6,-18]], o: [[450,800,2830],[70,80,100],[0,-9,-22]], u: [[325,700,2530],[50,60,170],[0,-14,-26]],
  e: [[400,1700,2600],[70,80,100],[0,-12,-14]], i: [[290,1870,2800],[40,90,100],[0,-16,-16]] };
class Env {
  constructor(a, d, s, r){ this.a = Math.max(a, .001); this.d = Math.max(d, .001); this.s = s; this.r = Math.max(r, .002); this.v = 0; this.st = 0; }
  gate(on){ this.st = on ? 1 : 3; }
  tick(dt){
    if (this.st === 1){ this.v += dt / this.a; if (this.v >= 1){ this.v = 1; this.st = 2; } }
    else if (this.st === 2){ this.v += (this.s - this.v) * (1 - Math.exp(-dt / (this.d / 3))); }
    else if (this.st === 3){ this.v *= Math.exp(-dt / (this.r / 4)); if (this.v < 1e-5){ this.v = 0; this.st = 4; } }
    return this.v;
  }
}
class Osc {
  constructor(sp, f, sr, vel){
    this.t = sp.t; this.r = sp.r ?? 1; this.det = Math.pow(2, (sp.det ?? 0) / 1200); this.lvl = (sp.lvl ?? 1);
    this.p = sp.p || {}; this.sr = sr; this.ph = Math.random(); this.vel = vel; this.pan = sp.pan ?? 0; this.age = 0;
    const p = this.p;
    if (this.t === 'supersaw'){ const n = p.n ?? 7, sp_ = p.spread ?? 18; this.ss = []; for (let i = 0; i < n; i++) this.ss.push({ph: Math.random(), d: Math.pow(2, ((i - (n-1)/2) / ((n-1)/2 || 1)) * sp_ / 1200)}); }
    if (this.t === 'fm' || this.t === 'fm3'){ this.m1 = Math.random(); this.m2 = Math.random(); }
    if (this.t === 'sync' || this.t === 'ring'){ this.ph2 = 0; }
    if (this.t === 'add'){ this.parts = (p.amps || [1, .5, .33, .25]).map((a, k) => ({a, ph: Math.random(), k: (k + 1) * (1 + (p.stretch ?? 0) * k * k)})); }
    if (this.t === 'formant'){ const V = VOWELS[p.vowel || 'a'], sc = p.scale ?? 1; this.F = V[0].map(x => x * sc); this.B = V[1]; this.G = V[2].map(db => Math.pow(10, db / 20)); this.fph = [0, 0, 0]; this.fage = 0; }
    if (this.t === 'noise'){ this.z1 = 0; this.z2 = 0; }
    if (this.t === 'ks'){ const n = Math.max(2, Math.round(sr / (f * this.r * this.det))); this.buf = new Float32Array(n); for (let i = 0; i < n; i++) this.buf[i] = (Math.random() * 2 - 1) * (.5 + vel * .5); this.bi = 0; this.lp = 0; }
    if (this.t === 'chaos'){ this.x = Math.random() * .5 + .25; this.prev = 0; this.next = 0; this.cph = 0; }
    if (this.t === 'wt'){ this.mph = Math.random(); }
  }
  // f: current voice frequency (Hz), e: voice envelope 0..1, dt: 1/sr
  tick(f, e, dt){
    const p = this.p, fr = f * this.r * this.det, inc = fr * dt;
    let y = 0;
    switch (this.t){
      case 'sin': y = Math.sin(TAU * this.ph); break;
      case 'tri': y = 1 - 4 * Math.abs(this.ph - .5); break;
      case 'saw': y = 2 * this.ph - 1 - blep(this.ph, inc); break;
      case 'pulse': { const pw = (p.pw ?? .5) + (p.pwm ?? 0) * Math.sin(TAU * this.age * (p.pwmRate ?? .3));
        const w = Math.min(.95, Math.max(.05, pw)); y = (this.ph < w ? 1 : -1) + blep(this.ph, inc) - blep((this.ph + 1 - w) % 1, inc); break; }
      case 'sub': y = this.ph < .5 ? 1 : -1; break;
      case 'supersaw': { let s = 0; for (const o of this.ss){ const i2 = inc * o.d; o.ph += i2; if (o.ph >= 1) o.ph -= 1; s += 2 * o.ph - 1 - blep(o.ph, i2); } y = s / Math.sqrt(this.ss.length); break; }
      case 'fm': { const idx = (p.idx2 ?? 1) + ((p.idx ?? 3) - (p.idx2 ?? 1)) * Math.exp(-this.age / (p.idxT ?? .4));
        this.m1 += inc * (p.ratio ?? 2); if (this.m1 >= 1) this.m1 -= 1;
        y = Math.sin(TAU * this.ph + idx * Math.sin(TAU * this.m1 + (p.fb ?? 0) * this.m1)); break; }
      case 'fm3': { const idx = (p.idx ?? 2.5) * (.4 + .6 * Math.exp(-this.age / (p.idxT ?? .8)));
        this.m1 += inc * (p.ratio ?? 1.5); if (this.m1 >= 1) this.m1 -= 1; this.m2 += inc * (p.ratio2 ?? 3.01); if (this.m2 >= 1) this.m2 -= 1;
        const mm = Math.sin(TAU * this.m2) * (p.idx2 ?? 1.5); y = Math.sin(TAU * this.ph + idx * Math.sin(TAU * this.m1 + mm)); break; }
      case 'fold': { const drive = (p.fold ?? 2.5) * (.4 + .6 * e) * (1 + (p.foldLfo ?? 0) * Math.sin(TAU * this.age * .23));
        y = Math.sin(drive * Math.sin(TAU * this.ph)); break; }
      case 'sync': { const ratio = (p.ratio ?? 2) * (1 + (p.sweep ?? .6) * Math.exp(-this.age / (p.sweepT ?? .5)) + (p.lfo ?? 0) * Math.sin(TAU * this.age * .17));
        this.ph2 += inc * ratio; if (this.ph2 >= 1) this.ph2 -= Math.floor(this.ph2); if (this.ph + inc >= 1) this.ph2 = 0; y = 2 * this.ph2 - 1; break; }
      case 'ring': { this.ph2 += inc * (p.ratio ?? 1.414); if (this.ph2 >= 1) this.ph2 -= 1; y = Math.sin(TAU * this.ph) * Math.sin(TAU * this.ph2); break; }
      case 'add': { let s = 0; for (const q of this.parts){ if (fr * q.k > this.sr * .45) continue; q.ph += inc * q.k; if (q.ph >= 1) q.ph -= 1; s += q.a * Math.sin(TAU * q.ph); } y = s * (p.norm ?? .5); break; }
      case 'formant': { // FOF: every period starts a burst of decaying sines at each formant frequency
        if (this.ph + inc >= 1) this.fage = 0;
        let s = 0; const tt = this.fage;
        for (let k = 0; k < 3; k++){ s += this.G[k] * Math.sin(TAU * this.F[k] * tt) * Math.exp(-Math.PI * this.B[k] * tt); }
        const win = tt < .003 ? .5 - .5 * Math.cos(Math.PI * tt / .003) : 1;
        this.fage += dt; y = s * win * 1.2; break; }
      case 'noise': { const w = Math.random() * 2 - 1, fc = Math.min(.45, fr * dt) , g = Math.tan(Math.PI * fc), q = p.q ?? 8, k = 1 / q;
        const a1 = 1 / (1 + g * (g + k)), v1 = a1 * (this.z1 + g * (w - this.z2)), v2 = this.z2 + g * v1; this.z1 = 2 * v1 - this.z1; this.z2 = 2 * v2 - this.z2; y = v1 * k * 3; break; }
      case 'ks': { const b = this.buf, n = b.length, i = this.bi, j = (i + 1) % n; const fb = p.fb ?? .996, br = p.bright ?? .5;
        const v = b[i]; this.lp = this.lp + (1 - br) * (((v + b[j]) * .5) - this.lp) ; const nv = (br * (v + b[j]) * .5 + (1 - br) * this.lp) * fb + (p.bow ?? 0) * (Math.random() * 2 - 1) * e * .05;
        b[i] = nv; this.bi = j; y = v; break; }
      case 'chaos': { // logistic map stepped 8 times per period, interpolated: a buzzy, unstable pitched tone
        this.cph += inc * 8; while (this.cph >= 1){ this.cph -= 1; this.prev = this.next; const r = (p.r ?? 3.7) + (p.rLfo ?? .2) * Math.sin(TAU * this.age * .11); this.x = r * this.x * (1 - this.x); if (!(this.x > 0 && this.x < 1)) this.x = .37; this.next = this.x * 2 - 1; }
        y = this.prev + (this.next - this.prev) * this.cph; break; }
      case 'wt': { const m = Math.min(2.999, Math.max(0, (p.morph ?? 1) + (p.morphLfo ?? .6) * Math.sin(TAU * this.age * (p.morphRate ?? .07)) + (p.morphEnv ?? 0) * e));
        const ph = this.ph, s0 = Math.sin(TAU * ph), s1 = 1 - 4 * Math.abs(ph - .5), s2 = 2 * ph - 1 - blep(ph, inc);
        const s3 = Math.sin(TAU * ph) * .6 + Math.sin(2 * TAU * ph) * .3 * Math.sin(TAU * this.age * .3) + Math.sin(3 * TAU * ph) * .35 + Math.sin(5 * TAU * ph) * .2;
        const tabs = [s0, s1, s2, s3], k = Math.floor(m), fr2 = m - k; y = tabs[k] * (1 - fr2) + tabs[k + 1] * fr2; break; }
      case 'pd': { const d = Math.max(.02, Math.min(.5, (p.d ?? .1) + (.5 - (p.d ?? .1)) * (1 - e) * (p.dEnv ?? .7)));
        const ph = this.ph, w = ph < d ? ph * .5 / d : .5 + (ph - d) * .5 / (1 - d); y = -Math.cos(TAU * w); break; }
      default: y = 0;
    }
    if (this.t !== 'ks'){ this.ph += inc; if (this.ph >= 1) this.ph -= Math.floor(this.ph); }
    this.age += dt;
    return y;
  }
}
class Voice {
  constructor(msg, sr){
    const P = msg.patch; this.id = msg.id; this.f = msg.f; this.f0 = msg.from || msg.f; this.glide = P.glide ?? 0; this.vel = msg.vel ?? .7; this.sr = sr;
    this.env = new Env(...(P.env || [.01, .3, .8, .4])); this.fenv = new Env(...(P.fenv || P.env || [.01, .3, .8, .4]));
    this.oscs = (P.oscs || [{t: 'saw'}]).map(sp => new Osc(sp, msg.f, sr, this.vel));
    const F = P.filt || {}; this.ft = F.type || 'lp'; this.fc = F.f ?? 2000; this.fq = F.q ?? .7; this.fenvAmt = F.env ?? 0; this.fkey = F.key ?? .5; this.fvel = F.vel ?? .5;
    this.z1 = 0; this.z2 = 0; this.z3 = 0; this.z4 = 0;
    this.amp = (P.gain ?? .3) * (.35 + .65 * this.vel); this.drift = P.drift ?? 4; this.dv = 0; this.dt = 0;
    this.vib = P.vib || null; this.age = 0; this.pan = msg.pan ?? 0; this.on = false; this.dead = false;
    this.start = msg.t; this.stop = Infinity; this.tilt = P.sat ?? 0;
  }
  render(L, R, i0, i1, dt){
    for (let i = i0; i < i1; i++){
      const e = this.env.tick(dt), fe = this.fenv.tick(dt);
      if (this.env.st === 4){ this.dead = true; return; }
      // pitch: glide, slow drift (random walk in cents), vibrato
      if (this.glide > 0) this.f0 += (this.f - this.f0) * (1 - Math.exp(-dt / this.glide)); else this.f0 = this.f;
      this.dt += dt; if (this.dt > .05){ this.dt = 0; this.dv += (Math.random() * 2 - 1) * this.drift * .15; this.dv *= .97; }
      let cents = this.dv; if (this.vib){ cents += this.vib[1] * Math.sin(TAU * this.vib[0] * this.age) * Math.min(1, this.age / (this.vib[2] ?? .4)); }
      const f = this.f0 * Math.pow(2, cents / 1200);
      let sL = 0, sR = 0;
      for (const o of this.oscs){ const y = o.tick(f, e, dt) * o.lvl; sL += y * (1 - o.pan) * .5 * 2; sR += y * (1 + o.pan) * .5 * 2; }
      // state-variable filter (stereo pair)
      const fc = Math.min(this.sr * .45, this.fc * Math.pow(f / 220, this.fkey) * (1 + this.fenvAmt * fe) * (.6 + .8 * this.vel * this.fvel + (1 - this.fvel) * .4));
      const g = Math.tan(Math.PI * fc / this.sr), k = 1 / this.fq, a1 = 1 / (1 + g * (g + k));
      let v1 = a1 * (this.z1 + g * (sL - this.z2)), v2 = this.z2 + g * v1; this.z1 = 2 * v1 - this.z1; this.z2 = 2 * v2 - this.z2;
      let w1 = a1 * (this.z3 + g * (sR - this.z4)), w2 = this.z4 + g * w1; this.z3 = 2 * w1 - this.z3; this.z4 = 2 * w2 - this.z4;
      let oL = this.ft === 'lp' ? v2 : this.ft === 'bp' ? v1 * k : sL - k * v1 - v2;
      let oR = this.ft === 'lp' ? w2 : this.ft === 'bp' ? w1 * k : sR - k * w1 - w2;
      if (this.tilt){ oL = Math.tanh(oL * (1 + this.tilt * 3)) / (1 + this.tilt); oR = Math.tanh(oR * (1 + this.tilt * 3)) / (1 + this.tilt); }
      const a = e * this.amp, pl = (1 - this.pan) * .5, pr = (1 + this.pan) * .5;
      L[i] += oL * a * pl * 1.4; R[i] += oR * a * pr * 1.4;
      this.age += dt;
    }
  }
}
class Wielo extends AudioWorkletProcessor {
  constructor(){
    super(); this.v = []; this.q = [];
    this.port.onmessage = ev => { const m = ev.data; if (Array.isArray(m)) for (const x of m) this.q.push(x); else this.q.push(m); };
  }
  process(_, outputs){
    const out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length, sr = sampleRate, dt = 1 / sr, t0 = currentTime, t1 = t0 + n / sr;
    // due events
    if (this.q.length){
      const keep = [];
      for (const m of this.q){
        if ((m.t ?? 0) >= t1){ keep.push(m); continue; }
        const off = Math.max(0, Math.min(n - 1, Math.round(((m.t ?? t0) - t0) * sr)));
        if (m.type === 'on'){ const v = new Voice(m, sr); v.off = off; v.env.gate(true); v.fenv.gate(true); this.v.push(v); if (this.v.length > 28) this.v.shift(); }
        else if (m.type === 'off'){ for (const v of this.v) if (v.id === m.id && !v.released){ v.releaseAt = off; v.released = true; } }
        else if (m.type === 'bend'){ for (const v of this.v) if (v.id === m.id){ v.f = m.f; if (m.glide !== undefined) v.glide = m.glide; } }
        else if (m.type === 'panic'){ this.v = []; }
      }
      this.q = keep;
    }
    for (const v of this.v){
      const a = v.off || 0; v.off = 0;
      if (v.released && v.releaseAt !== undefined){ const r = v.releaseAt; v.releaseAt = undefined; v.render(L, R, a, Math.max(a, r), dt); v.env.gate(false); v.fenv.gate(false); v.render(L, R, Math.max(a, r), n, dt); }
      else v.render(L, R, a, n, dt);
    }
    this.v = this.v.filter(v => !v.dead);
    if (out.length > 1 && R === L){ /* mono destination */ }
    return true;
  }
}
registerProcessor('wielo', Wielo);
