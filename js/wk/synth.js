// "Wielo" – a polyphonic synthesizer with many different oscillator kinds, run in an AudioWorklet.
// Every voice is a stack of oscillators (sine, triangle, band-limited saw and pulse with PWM, supersaw, 2- and
// 3-operator FM, wavefolder, hard sync, ring modulation, additive partials, FOF vocal formants, filtered noise
// bands, Karplus-Strong plucked/bowed string, chaotic logistic-map oscillator, morphing wavetable, phase
// distortion, sub-octave) -> state-variable filter with its own envelope -> amp envelope -> stereo.
'use strict';
const TAU = Math.PI * 2;
const SN = 4096, STAB = new Float32Array(SN + 1); for (let i = 0; i <= SN; i++) STAB[i] = Math.sin(TAU * i / SN);
function sn(ph){ ph -= Math.floor(ph); const x = ph * SN, i = x | 0; return STAB[i] + (STAB[i + 1] - STAB[i]) * (x - i); }   // sin(2 pi ph)
function sat(x){ return x < -3 ? -1 : x > 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x); }                                   // fast tanh
function blep(t, dt){ if (t < dt){ t /= dt; return t + t - t*t - 1; } if (t > 1 - dt){ t = (t - 1) / dt; return t*t + t + t + 1; } return 0; }
const VOWELS = { // formant frequencies (Hz), bandwidths, gains (dB) – adult male; children scale ~1.25
  a: [[700,1220,2600],[80,90,120],[0,-6,-18]], o: [[450,800,2830],[70,80,100],[0,-9,-22]], u: [[325,700,2530],[50,60,170],[0,-14,-26]],
  e: [[400,1700,2600],[70,80,100],[0,-12,-14]], i: [[290,1870,2800],[40,90,100],[0,-16,-16]] };
class Env {
  constructor(a, d, s, r, dt){ this.ai = dt / Math.max(a, .001); this.dk = 1 - Math.exp(-dt / (Math.max(d, .001) / 3)); this.s = s; this.rk = Math.exp(-dt / (Math.max(r, .002) / 4)); this.v = 0; this.st = 0; }
  gate(on){ this.st = on ? 1 : 3; }
  tick(){
    if (this.st === 1){ this.v += this.ai; if (this.v >= 1){ this.v = 1; this.st = 2; } }
    else if (this.st === 2){ this.v += (this.s - this.v) * this.dk; }
    else if (this.st === 3){ this.v *= this.rk; if (this.v < 1e-5){ this.v = 0; this.st = 4; } }
    return this.v;
  }
}
// ---- oscillators: one small class per kind, all parameters resolved to numbers at note-on (fast, monomorphic)
// tick(inc, e): inc = phase increment of the voice's base frequency per sample, e = amp envelope 0..1
class OBase { init(sp, f, sr, vel){ this.r = sp.r ?? 1; this.det = Math.pow(2, (sp.det ?? 0) / 1200); this.k = this.r * this.det; this.lvl = sp.lvl ?? 1; this.pan = sp.pan ?? 0; this.ph = Math.random(); this.age = 0; this.sr = sr; } block(f, bt){ this.age += bt; } }
class OSin extends OBase { tick(inc){ const y = sn(this.ph); this.ph += inc * this.k; if (this.ph >= 1) this.ph -= 1; return y; } }
class OTri extends OBase { tick(inc){ const y = 1 - 4 * Math.abs(this.ph - .5); this.ph += inc * this.k; if (this.ph >= 1) this.ph -= 1; return y; } }
class OSub extends OBase { tick(inc){ const y = this.ph < .5 ? 1 : -1; this.ph += inc * this.k; if (this.ph >= 1) this.ph -= 1; return y; } }
class OSaw extends OBase { tick(inc){ const d = inc * this.k, y = 2 * this.ph - 1 - blep(this.ph, d); this.ph += d; if (this.ph >= 1) this.ph -= 1; return y; } }
class OPulse extends OBase {
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}; this.pw0 = p.pw ?? .5; this.pwm = p.pwm ?? 0; this.rate = p.pwmRate ?? .3; this.w = this.pw0; }
  block(f, bt){ this.age += bt; this.w = Math.min(.95, Math.max(.05, this.pw0 + this.pwm * sn(this.age * this.rate))); }
  tick(inc){ const d = inc * this.k, w = this.w, y = (this.ph < w ? 1 : -1) + blep(this.ph, d) - blep((this.ph + 1 - w) % 1, d); this.ph += d; if (this.ph >= 1) this.ph -= 1; return y; } }
class OSuper extends OBase {
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}, n = p.n ?? 7, spr = p.spread ?? 18; this.n = n; this.phs = new Float64Array(n); this.ds = new Float64Array(n);
    for (let i = 0; i < n; i++){ this.phs[i] = Math.random(); this.ds[i] = Math.pow(2, ((i - (n - 1) / 2) / ((n - 1) / 2 || 1)) * spr / 1200); } this.norm = 1 / Math.sqrt(n); }
  tick(inc){ let s = 0; const b = inc * this.k; for (let i = 0; i < this.n; i++){ const d = b * this.ds[i]; let ph = this.phs[i] + d; if (ph >= 1) ph -= 1; this.phs[i] = ph; s += 2 * ph - 1 - blep(ph, d); } return s * this.norm; } }
class OFm extends OBase {
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}; this.ratio = p.ratio ?? 2; this.i1 = p.idx ?? 3; this.i2 = p.idx2 ?? 1; this.it = p.idxT ?? .4; this.fb = (p.fb ?? 0) / TAU; this.m = Math.random(); this.idx = this.i1; }
  block(f, bt){ this.age += bt; this.idx = (this.i2 + (this.i1 - this.i2) * Math.exp(-this.age / this.it)) / TAU; }
  tick(inc){ const d = inc * this.k; this.m += d * this.ratio; if (this.m >= 1) this.m -= 1; const y = sn(this.ph + this.idx * sn(this.m + this.fb * this.m)); this.ph += d; if (this.ph >= 1) this.ph -= 1; return y; } }
class OFm3 extends OBase {
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}; this.r1 = p.ratio ?? 1.5; this.r2 = p.ratio2 ?? 3.01; this.i0 = p.idx ?? 2.5; this.i2 = (p.idx2 ?? 1.5) / TAU; this.it = p.idxT ?? .8; this.m1 = Math.random(); this.m2 = Math.random(); this.idx = this.i0 / TAU; }
  block(f, bt){ this.age += bt; this.idx = this.i0 * (.4 + .6 * Math.exp(-this.age / this.it)) / TAU; }
  tick(inc){ const d = inc * this.k; this.m1 += d * this.r1; if (this.m1 >= 1) this.m1 -= 1; this.m2 += d * this.r2; if (this.m2 >= 1) this.m2 -= 1;
    const y = sn(this.ph + this.idx * sn(this.m1 + this.i2 * sn(this.m2))); this.ph += d; if (this.ph >= 1) this.ph -= 1; return y; } }
class OFold extends OBase {
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}; this.fold = p.fold ?? 2.5; this.fl = p.foldLfo ?? 0; this.dr = 0; }
  block(f, bt){ this.age += bt; this.dr = this.fold * (1 + this.fl * sn(this.age * .23)) / TAU; }
  tick(inc, e){ const y = sn(this.dr * (.4 + .6 * e) * sn(this.ph)); this.ph += inc * this.k; if (this.ph >= 1) this.ph -= 1; return y; } }
class OSync extends OBase {
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}; this.r0 = p.ratio ?? 2; this.sw = p.sweep ?? .6; this.swT = p.sweepT ?? .5; this.lf = p.lfo ?? 0; this.ph2 = 0; this.ratio = this.r0; }
  block(f, bt){ this.age += bt; this.ratio = this.r0 * (1 + this.sw * Math.exp(-this.age / this.swT) + this.lf * sn(this.age * .17)); }
  tick(inc){ const d = inc * this.k; this.ph2 += d * this.ratio; if (this.ph2 >= 1) this.ph2 -= Math.floor(this.ph2); this.ph += d; if (this.ph >= 1){ this.ph -= 1; this.ph2 = 0; } return 2 * this.ph2 - 1; } }
class ORing extends OBase {
  init(sp, f, sr, v){ super.init(sp, f, sr, v); this.ratio = (sp.p || {}).ratio ?? 1.414; this.ph2 = 0; }
  tick(inc){ const d = inc * this.k; this.ph2 += d * this.ratio; if (this.ph2 >= 1) this.ph2 -= 1; const y = sn(this.ph) * sn(this.ph2); this.ph += d; if (this.ph >= 1) this.ph -= 1; return y; } }
class OAdd extends OBase {
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}, amps = p.amps || [1, .5, .33, .25], st = p.stretch ?? 0;
    this.n = amps.length; this.a = Float64Array.from(amps); this.mul = Float64Array.from(amps.map((_, k) => (k + 1) * (1 + st * k * k))); this.phs = Float64Array.from(amps.map(() => Math.random())); this.norm = p.norm ?? .5; this.on = new Uint8Array(this.n).fill(1); }
  block(f){ for (let i = 0; i < this.n; i++) this.on[i] = f * this.k * this.mul[i] < this.sr * .45 && this.a[i] !== 0 ? 1 : 0; }
  tick(inc){ let s = 0; const d = inc * this.k; for (let i = 0; i < this.n; i++){ if (!this.on[i]) continue; let ph = this.phs[i] + d * this.mul[i]; ph -= Math.floor(ph); this.phs[i] = ph; s += this.a[i] * sn(ph); } return s * this.norm; } }
class OFormant extends OBase {   // FOF: every period restarts a decaying sine (rotating phasor) at each formant
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}, V = VOWELS[p.vowel || 'a'], sc = p.scale ?? 1;
    this.c = new Float64Array(3); this.s = new Float64Array(3); this.g = new Float64Array(3); this.re = new Float64Array(3); this.im = new Float64Array(3); this.fa = 0; this.win = .003 * sr;
    for (let k = 0; k < 3; k++){ const r = Math.exp(-Math.PI * V[1][k] / sr), w = TAU * V[0][k] * sc / sr; this.c[k] = r * Math.cos(w); this.s[k] = r * Math.sin(w); this.g[k] = Math.pow(10, V[2][k] / 20); } }
  tick(inc){ const d = inc * this.k; this.ph += d; if (this.ph >= 1){ this.ph -= 1; this.fa = 0; for (let k = 0; k < 3; k++){ this.re[k] = 0; this.im[k] = 1; } }
    let y = 0; for (let k = 0; k < 3; k++){ const r = this.re[k], i = this.im[k]; this.re[k] = r * this.c[k] - i * this.s[k]; this.im[k] = r * this.s[k] + i * this.c[k]; y += this.g[k] * this.re[k]; }
    this.fa++; return y * (this.fa < this.win ? this.fa / this.win : 1) * 1.2; } }
class ONoise extends OBase {
  init(sp, f, sr, v){ super.init(sp, f, sr, v); this.q = (sp.p || {}).q ?? 8; this.z1 = 0; this.z2 = 0; this.g = 0; this.kk = 1 / this.q; this.a1 = 1; }
  block(f){ const fc = Math.min(.45, f * this.k / this.sr); this.g = Math.tan(Math.PI * fc); this.a1 = 1 / (1 + this.g * (this.g + this.kk)); }
  tick(){ const w = Math.random() * 2 - 1, g = this.g, v1 = this.a1 * (this.z1 + g * (w - this.z2)), v2 = this.z2 + g * v1; this.z1 = 2 * v1 - this.z1; this.z2 = 2 * v2 - this.z2; return v1 * this.kk * 3; } }
class OKs extends OBase {        // Karplus-Strong string, optionally kept alive by a noisy "bow"
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}, n = Math.max(2, Math.round(sr / (f * this.k)));
    this.b = new Float32Array(n); for (let i = 0; i < n; i++) this.b[i] = (Math.random() * 2 - 1) * (.5 + v * .5); this.i = 0; this.lp = 0; this.fb = p.fb ?? .996; this.br = p.bright ?? .5; this.bow = (p.bow ?? 0) * .05; }
  tick(inc, e){ const b = this.b, n = b.length, i = this.i, j = i + 1 === n ? 0 : i + 1, v = b[i], avg = (v + b[j]) * .5;
    this.lp += (1 - this.br) * (avg - this.lp); b[i] = (this.br * avg + (1 - this.br) * this.lp) * this.fb + this.bow * (Math.random() * 2 - 1) * e; this.i = j; return v; } }
class OChaos extends OBase {     // logistic map stepped 8 times per period, interpolated
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}; this.r0 = p.r ?? 3.7; this.rl = p.rLfo ?? .2; this.x = Math.random() * .5 + .25; this.prev = 0; this.next = 0; this.cph = 0; this.rr = this.r0; }
  block(f, bt){ this.age += bt; this.rr = this.r0 + this.rl * sn(this.age * .11); }
  tick(inc){ this.cph += inc * this.k * 8; while (this.cph >= 1){ this.cph -= 1; this.prev = this.next; this.x = this.rr * this.x * (1 - this.x); if (!(this.x > 0 && this.x < 1)) this.x = .37; this.next = this.x * 2 - 1; }
    return this.prev + (this.next - this.prev) * this.cph; } }
class OWt extends OBase {        // morphing wavetable: sine -> triangle -> saw -> vocal-ish partials
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}; this.m0 = p.morph ?? 1; this.ml = p.morphLfo ?? .6; this.mr = p.morphRate ?? .07; this.me = p.morphEnv ?? 0; this.l1 = 0; this.l2 = 0; }
  block(f, bt){ this.age += bt; this.l1 = sn(this.age * this.mr); this.l2 = sn(this.age * .3); }
  tick(inc, e){ const m = Math.min(2.999, Math.max(0, this.m0 + this.ml * this.l1 + this.me * e)), d = inc * this.k, ph = this.ph;
    const s0 = sn(ph); let a, b; const k = m | 0, fr = m - k;
    if (k === 0){ a = s0; b = 1 - 4 * Math.abs(ph - .5); } else if (k === 1){ a = 1 - 4 * Math.abs(ph - .5); b = 2 * ph - 1 - blep(ph, d); }
    else { a = 2 * ph - 1 - blep(ph, d); b = s0 * .6 + sn(2 * ph) * .3 * this.l2 + sn(3 * ph) * .35 + sn(5 * ph) * .2; }
    this.ph += d; if (this.ph >= 1) this.ph -= 1; return a + (b - a) * fr; } }
class OPd extends OBase {        // phase distortion (Casio CZ style), opens with the envelope
  init(sp, f, sr, v){ super.init(sp, f, sr, v); const p = sp.p || {}; this.d0 = p.d ?? .1; this.de = p.dEnv ?? .7; }
  tick(inc, e){ const d = Math.max(.02, Math.min(.5, this.d0 + (.5 - this.d0) * (1 - e) * this.de)), ph = this.ph, w = ph < d ? ph * .5 / d : .5 + (ph - d) * .5 / (1 - d);
    this.ph += inc * this.k; if (this.ph >= 1) this.ph -= 1; return -sn(w + .25); } }
const OSC = {sin: OSin, tri: OTri, sub: OSub, saw: OSaw, pulse: OPulse, supersaw: OSuper, fm: OFm, fm3: OFm3, fold: OFold, sync: OSync, ring: ORing, add: OAdd, formant: OFormant, noise: ONoise, ks: OKs, chaos: OChaos, wt: OWt, pd: OPd};
function makeOsc(sp, f, sr, vel){ const o = new (OSC[sp.t] || OSin)(); o.init(sp, f, sr, vel); return o; }
class Voice {
  constructor(msg, sr){
    const P = msg.patch; this.id = msg.id; this.f = msg.f; this.f0 = msg.from || msg.f; this.glide = P.glide ?? 0; this.vel = msg.vel ?? .7; this.sr = sr;
    this.env = new Env(...(P.env || [.01, .3, .8, .4]), 1 / sr); this.fenv = new Env(...(P.fenv || P.env || [.01, .3, .8, .4]), 1 / sr);
    this.oscs = (P.oscs || [{t: 'saw'}]).map(sp => makeOsc(sp, msg.f, sr, this.vel));
    const F = P.filt || {}; this.ft = F.type || 'lp'; this.fc = F.f ?? 2000; this.fq = F.q ?? .7; this.fenvAmt = F.env ?? 0; this.fkey = F.key ?? .5; this.fvel = F.vel ?? .5;
    this.z1 = 0; this.z2 = 0; this.z3 = 0; this.z4 = 0;
    this.amp = (P.gain ?? .3) * (.35 + .65 * this.vel); this.drift = P.drift ?? 4; this.dv = 0; this.dt = 0;
    this.vib = P.vib || null; this.age = 0; this.pan = msg.pan ?? 0; this.on = false; this.dead = false;
    this.start = msg.t; this.stop = Infinity; this.tilt = P.sat ?? 0;
  }
  render(L, R, i0, i1, dt){
    if (i1 <= i0) return;
    const n = i1 - i0, bt = dt * n;
    // per block: glide, slow drift (random walk in cents), vibrato, filter coefficients
    if (this.glide > 0) this.f0 += (this.f - this.f0) * (1 - Math.exp(-bt / this.glide)); else this.f0 = this.f;
    this.dt += bt; if (this.dt > .05){ this.dt = 0; this.dv += (Math.random() * 2 - 1) * this.drift * .15; this.dv *= .97; }
    let cents = this.dv; if (this.vib){ cents += this.vib[1] * sn(this.vib[0] * this.age) * Math.min(1, this.age / (this.vib[2] ?? .4)); }
    const f = this.f0 * Math.pow(2, cents / 1200);
    for (const o of this.oscs) o.block(f, bt);
    const inc = f * dt;
    const fe0 = this.fenv.v;
    const fc = Math.min(this.sr * .45, this.fc * Math.pow(f / 220, this.fkey) * (1 + this.fenvAmt * fe0) * (.6 + .8 * this.vel * this.fvel + (1 - this.fvel) * .4));
    const g = Math.tan(Math.PI * fc / this.sr), k = 1 / this.fq, a1 = 1 / (1 + g * (g + k)), ft = this.ft, tl = this.tilt, pl = (1 - this.pan) * .7, pr = (1 + this.pan) * .7;
    const oscs = this.oscs, no = oscs.length;
    for (let i = i0; i < i1; i++){
      const e = this.env.tick(); this.fenv.tick();
      if (this.env.st === 4){ this.dead = true; return; }
      let sL = 0, sR = 0;
      for (let q = 0; q < no; q++){ const o = oscs[q], y = o.tick(inc, e) * o.lvl; sL += y * (1 - o.pan); sR += y * (1 + o.pan); }
      let v1 = a1 * (this.z1 + g * (sL - this.z2)), v2 = this.z2 + g * v1; this.z1 = 2 * v1 - this.z1; this.z2 = 2 * v2 - this.z2;
      let w1 = a1 * (this.z3 + g * (sR - this.z4)), w2 = this.z4 + g * w1; this.z3 = 2 * w1 - this.z3; this.z4 = 2 * w2 - this.z4;
      let oL = ft === 'lp' ? v2 : ft === 'bp' ? v1 * k : sL - k * v1 - v2;
      let oR = ft === 'lp' ? w2 : ft === 'bp' ? w1 * k : sR - k * w1 - w2;
      if (tl){ oL = sat(oL * (1 + tl * 3)) / (1 + tl); oR = sat(oR * (1 + tl * 3)) / (1 + tl); }
      const a = e * this.amp; L[i] += oL * a * pl; R[i] += oR * a * pr;
    }
    this.age += bt;
  }
}
class Wielo extends AudioWorkletProcessor {
  constructor(){
    super(); this.v = []; this.q = []; this.maxV = 20;
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
        if (m.type === 'on'){ const v = new Voice(m, sr); v.off = off; v.env.gate(true); v.fenv.gate(true); this.v.push(v); if (this.v.length > this.maxV) this.v.shift(); }
        else if (m.type === 'off'){ for (const v of this.v) if (v.id === m.id && !v.released){ v.releaseAt = off; v.released = true; } }
        else if (m.type === 'bend'){ for (const v of this.v) if (v.id === m.id){ v.f = m.f; if (m.glide !== undefined) v.glide = m.glide; } }
        else if (m.type === 'panic'){ this.v = []; }
        else if (m.type === 'maxv'){ this.maxV = m.n; }
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
