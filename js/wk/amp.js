// "Lampa" – the tube amplifier from our physics work (amp.c), ported to an AudioWorklet.
// Two-stage 12AX7 preamp (Miller capacitance, grid current, coupling caps), bright cap on the gain pot,
// cathode follower, exact TMB tone stack, long-tailed-pair phase inverter with negative feedback and presence,
// grid-current blocking at the EL84 grids, cathode-biased (breathing) mismatched EL84 push-pull pair,
// output transformer (magnetising inductance, saturation, hysteresis, core loss, winding capacitance, leakage),
// speaker as a live load (lossy coil, Bl(x), K(x), coil heating), tube or silicon rectifier with 50 Hz mains,
// RC supply chain with sag, tube noise. Component tolerances from a seed.
'use strict';
let RS = 88172645;
const urand = () => { RS ^= RS << 13; RS ^= RS >>> 17; RS ^= RS << 5; return ((RS >>> 0) / 4294967296); };
const grand = () => Math.sqrt(-2 * Math.log(urand() + 1e-12)) * Math.cos(6.283185307 * urand());
const GT = new Float32Array(16384); for (let i = 0; i < GT.length; i++) GT[i] = Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(6.283185307 * Math.random());
let GI = 0x9e3779b9 | 0; const fgauss = () => { GI ^= GI << 13; GI ^= GI >>> 17; GI ^= GI << 5; return GT[(GI >>> 0) & 16383]; };
const tol = (v, pct, sc) => v * (1 + pct * sc * grand() * .5);
function ax7(sc){ return {mu: 100, ex: 1.4, kg1: tol(1060, .3, sc), kp: 600, kvb: 300}; }   // mu spread folded into kg1 (shared table)
// tube current from a per-tube table (bilinear): 0..500 V plate, -12..+8 V grid; outside it the formula
const TV0 = 0, TV1 = 500, TDV = 1, TG0 = -12, TG1 = 8, TDG = .05, TNV = 501, TNG = 401;
function triodeF(t, vpk, vgk){
  if (vpk < 0) vpk = 0;
  const e = t.kp * (1 / t.mu + vgk / Math.sqrt(t.kvb + vpk * vpk));
  let e1 = e > 30 ? e : Math.log1p(Math.exp(e)); e1 = vpk / t.kp * e1;
  return e1 > 0 ? Math.pow(e1, t.ex) / t.kg1 : 0;
}
const NOM = {mu: 100, ex: 1.4, kg1: 1060, kp: 600, kvb: 300}; let TAB = null;
function buildTab(){ const T = new Float32Array(TNV * TNG); for (let i = 0; i < TNV; i++) for (let j = 0; j < TNG; j++) T[i * TNG + j] = triodeF(NOM, TV0 + i * TDV, TG0 + j * TDG); TAB = T; }
function triode(t, vpk, vgk){
  if (vpk < 0) vpk = 0;
  if (vpk < TV1 && vgk > TG0 && vgk < TG1){
    if (!TAB) buildTab();
    const x = (vpk - TV0) / TDV, y = (vgk - TG0) / TDG, i = x | 0, j = y | 0, fx = x - i, fy = y - j, T = TAB, k = i * TNG + j;
    return ((T[k] * (1 - fy) + T[k + 1] * fy) * (1 - fx) + (T[k + TNG] * (1 - fy) + T[k + TNG + 1] * fy) * fx) * (1060 / t.kg1);
  }
  return triodeF(t, vpk, vgk);
}
function triodeOld(t, vpk, vgk){
  if (vpk < 0) vpk = 0;
  const e = t.kp * (1 / t.mu + vgk / Math.sqrt(t.kvb + vpk * vpk));
  let e1 = e > 30 ? e : Math.log1p(Math.exp(e)); e1 = vpk / t.kp * e1;
  return e1 > 0 ? Math.pow(e1, t.ex) / t.kg1 : 0;
}
const gridI = (v, k) => v > 0 ? k * v * Math.sqrt(v) : 0;
const PEN = {ig2: 0};
const PG0 = -45, PG1 = 12, PDG = .1, PNG = 571, PS0 = 120, PS1 = 420, PDS = 1, PNS = 301; let PT = null; const AT = new Float32Array(1601);
for (let i = 0; i < AT.length; i++) AT[i] = Math.atan(i * .5 / 18) * (2 / Math.PI);
function penP(vg1k, vg2k){ const e = 200 * (1 / 19 + vg1k / vg2k); let e1 = e > 30 ? e : Math.log1p(Math.exp(e)); e1 = vg2k / 200 * e1; return e1 > 0 ? Math.pow(e1, 1.35) : 0; }
function pentode(vpk, vg1k, vg2k, kg1){
  if (vg2k < 1) vg2k = 1;
  let p;
  if (vg1k > PG0 && vg1k < PG1 && vg2k > PS0 && vg2k < PS1){
    if (!PT){ PT = new Float32Array(PNG * PNS); for (let i = 0; i < PNG; i++) for (let j = 0; j < PNS; j++) PT[i * PNS + j] = penP(PG0 + i * PDG, PS0 + j * PDS); }
    const x = (vg1k - PG0) / PDG, y = (vg2k - PS0) / PDS, i = x | 0, j = y | 0, fx = x - i, fy = y - j, k = i * PNS + j;
    p = (PT[k] * (1 - fy) + PT[k + 1] * fy) * (1 - fx) + (PT[k + PNS] * (1 - fy) + PT[k + PNS + 1] * fy) * fx;
  } else p = penP(vg1k, vg2k);
  const vp = vpk < 0 ? 0 : vpk;
  PEN.ig2 = p / 4500 * (1 + 4 * Math.exp(-vp / 15));
  const ai = vp * 2; let at; if (ai < 1600){ const i = ai | 0, f = ai - i; at = AT[i] * (1 - f) + AT[i + 1] * f; } else at = Math.atan(vp / 18) * (2 / Math.PI);
  return p / kg1 * at;
}
function pentodeOld(vpk, vg1k, vg2k, kg1){
  if (vg2k < 1) vg2k = 1;
  const e = 200 * (1 / 19 + vg1k / vg2k); let e1 = e > 30 ? e : Math.log1p(Math.exp(e)); e1 = vg2k / 200 * e1;
  const p = e1 > 0 ? Math.pow(e1, 1.35) : 0, vp = vpk < 0 ? 0 : vpk;
  PEN.ig2 = p / 4500 * (1 + 4 * Math.exp(-vp / 15));
  return p / kg1 * Math.atan(vp / 18) * (2 / Math.PI);
}
class Noise {
  constructor(Rg, gm, fs, amt){ const kT4 = 4 * 1.38e-23 * 300; this.en = Math.sqrt(kT4 * (Rg + 2.5 / gm) * fs / 2) * amt; this.fl = this.en * 2; this.b = [0,0,0,0,0,0,0]; }
  tick(){ if (!this.en) return 0; const w = fgauss(), b = this.b;
    b[0] = .99886*b[0] + w*.0555179; b[1] = .99332*b[1] + w*.0750759; b[2] = .969*b[2] + w*.153852; b[3] = .8665*b[3] + w*.3104856; b[4] = .55*b[4] + w*.5329522; b[5] = -.7616*b[5] - w*.016898;
    const pink = (b[0]+b[1]+b[2]+b[3]+b[4]+b[5]+b[6] + w*.5362) * .11; b[6] = w*.115926; return this.en * fgauss() + this.fl * pink; }
}
class Stage {
  constructor(t, B, Ra, Rk, Ck, Cc, Rl, Rs, Cm, fs, nz){
    Object.assign(this, {t, B, Ra, Rk, Ck, Cc, Rl, Rs, Cm, kgc: 3e-4, vC: 0, iC: 0, iK: 0, vg: 0, vm: 0});
    let vp = B * .6, vk = 1; for (let i = 0; i < 3000; i++){ const ip = triode(t, vp - vk, -vk); vp = .95 * vp + .05 * (B - ip * Ra); vk = .95 * vk + .05 * ip * Rk; }
    this.vp = vp; this.vk = vk; this.ip = vk / Rk; this.nz = new Noise(Math.min(Rs, Rl), 1.6e-3, fs, nz);
  }
  tick(vs, B, T){
    const s = this; s.B = B; vs += s.nz.tick();
    const gC = 2 * s.Cc / T, gM = 2 * s.Cm / T, Zs = s.Rs + 1 / gC; let vg = s.vg;
    for (let it = 0; it < 8; it++){
      const ic = (vs - s.vC - s.iC / gC - vg) / Zs, im = gM * (vg - s.vg) - s.vm, x = vg - s.vk, ig = gridI(x, s.kgc), dig = x > 0 ? 1.5 * s.kgc * Math.sqrt(x) : 0;
      const f = ic - im - vg / s.Rl - ig, df = -1 / Zs - gM - 1 / s.Rl - dig; let d = f / df; if (d > 5) d = 5; if (d < -5) d = -5; vg -= d; if (Math.abs(d) < 1e-7) break;
    }
    { const ic = (vs - s.vC - s.iC / gC - vg) / Zs; s.vC += (ic + s.iC) / gC; s.iC = ic; s.vm = gM * (vg - s.vg) - s.vm; s.vg = vg; }
    const gK = s.Ck > 0 ? 2 * s.Ck / T : 0; let vp = s.vp, vk = s.vk; const t = s.t, h = 1e-5;
    for (let it = 0; it < 8; it++){
      // one tube current + two perturbed ones give the whole Jacobian (each triode() call shared by both equations)
      const i0 = triode(t, vp - vk, vg - vk), iP = triode(t, vp + h - vk, vg - vk), iK = triode(t, vp - vk - h, vg - vk - h);
      const g0 = gridI(vg - vk, s.kgc), gKk = gridI(vg - vk - h, s.kgc), cap = s.Ck > 0 ? gK : 0, capT = s.Ck > 0 ? (gK * (vk - s.vk) - s.iK) : 0;
      const f1 = (s.B - vp) / s.Ra - i0, f2 = i0 + g0 - vk / s.Rk - capT;
      const A = -1 / s.Ra - (iP - i0) / h, Bq = -(iK - i0) / h, Cq = (iP - i0) / h, D = (iK - i0) / h + (gKk - g0) / h - 1 / s.Rk - cap;
      const det = A * D - Bq * Cq; if (Math.abs(det) < 1e-20) break;
      let dp = (D * f1 - Bq * f2) / det, dk = (-Cq * f1 + A * f2) / det;
      dp = Math.max(-20, Math.min(20, dp)); dk = Math.max(-5, Math.min(5, dk)); vp -= dp; vk -= dk; if (Math.abs(dp) < 1e-5 && Math.abs(dk) < 1e-7) break;
    }
    if (s.Ck > 0) s.iK = gK * (vk - s.vk) - s.iK;
    s.vk = vk; s.vp = vp; s.ip = (s.B - vp) / s.Ra; return vp;
  }
}
const audioTaper = x => (Math.exp(4.4 * x) - 1) / (Math.exp(4.4) - 1);
const gainTaper = x => (Math.exp(2.5 * x) - 1) / (Math.exp(2.5) - 1);
function toneStack(fs, t, m, l, marshall, sc){
  let C1, C2, C3, R1, R2, R3, R4;
  if (marshall){ C1 = 470e-12; C2 = 22e-9; C3 = 22e-9; R1 = 220e3; R2 = 1e6; R3 = 25e3; R4 = 33e3; }
  else { C1 = 250e-12; C2 = 20e-9; C3 = 20e-9; R1 = 250e3; R2 = 1e6; R3 = 25e3; R4 = 56e3; }
  l = audioTaper(l); if (!marshall) t = audioTaper(t);
  const b1 = t*C1*R1 + m*C3*R3 + l*(C1*R2 + C2*R2) + (C1*R3 + C2*R3);
  const b2 = t*(C1*C2*R1*R4 + C1*C3*R1*R4) - m*m*(C1*C3*R3*R3 + C2*C3*R3*R3) + m*(C1*C3*R1*R3 + C1*C3*R3*R3 + C2*C3*R3*R3) + l*(C1*C2*R1*R2 + C1*C2*R2*R4 + C1*C3*R2*R4) + l*m*(C1*C3*R2*R3 + C2*C3*R2*R3) + (C1*C2*R1*R3 + C1*C2*R3*R4 + C1*C3*R3*R4);
  const b3 = l*m*(C1*C2*C3*R1*R2*R3 + C1*C2*C3*R2*R3*R4) - m*m*(C1*C2*C3*R1*R3*R3 + C1*C2*C3*R3*R3*R4) + m*(C1*C2*C3*R1*R3*R3 + C1*C2*C3*R3*R3*R4) + t*C1*C2*C3*R1*R3*R4 - t*m*C1*C2*C3*R1*R3*R4 + t*l*C1*C2*C3*R1*R2*R4;
  const a1 = (C1*R1 + C1*R3 + C2*R3 + C2*R4 + C3*R4) + m*C3*R3 + l*(C1*R2 + C2*R2);
  const a2 = m*(C1*C3*R1*R3 - C2*C3*R3*R4 + C1*C3*R3*R3 + C2*C3*R3*R3) + l*m*(C1*C3*R2*R3 + C2*C3*R2*R3) - m*m*(C1*C3*R3*R3 + C2*C3*R3*R3) + l*(C1*C2*R2*R4 + C1*C2*R1*R2 + C1*C3*R2*R4 + C2*C3*R2*R4) + (C1*C2*R1*R4 + C1*C3*R1*R4 + C1*C2*R3*R4 + C1*C2*R1*R3 + C1*C3*R3*R4 + C2*C3*R3*R4);
  const a3 = l*m*(C1*C2*C3*R1*R2*R3 + C1*C2*C3*R2*R3*R4) - m*m*(C1*C2*C3*R1*R3*R3 + C1*C2*C3*R3*R3*R4) + m*(C1*C2*C3*R3*R3*R4 + C1*C2*C3*R1*R3*R3 - C1*C2*C3*R1*R3*R4) + l*C1*C2*C3*R1*R2*R4 + C1*C2*C3*R1*R3*R4;
  const c = 2 * fs, c2 = c * c, c3 = c2 * c;
  const B0 = -b1*c - b2*c2 - b3*c3, B1 = -b1*c + b2*c2 + 3*b3*c3, B2 = b1*c + b2*c2 - 3*b3*c3, B3 = b1*c - b2*c2 + b3*c3;
  const A0 = -1 - a1*c - a2*c2 - a3*c3, A1 = -3 - a1*c + a2*c2 + 3*a3*c3, A2 = -3 + a1*c + a2*c2 - 3*a3*c3, A3 = -1 + a1*c - a2*c2 + a3*c3;
  return {b: [B0/A0, B1/A0, B2/A0, B3/A0], a: [1, A1/A0, A2/A0, A3/A0]};
}
const DEF = {gain: .4, bass: .5, mid: .6, treble: .55, master: .55, presence: .3, nfb: 0, bright: 1, marshall: 1, mains: 345, windR: 35, reservoir: 16,
  bias: -11.5, Re: 6.2, Le: .4e-3, Bl: 10.3, Mms: .0308, Kms: 13565, Rms: 4.13, xbl: 7, xk: 5, raa: 8000, fluxSat: .06, noise: 3, level: 1, seed: 1,
  rectifier: 1, coilTemp: 60, leak: 30, hyst: .3, tolerance: 1, cathode: 1, channel: 0, os: 2, out: .05};
class Amp {
  constructor(prm, fsBase){
    const p = this.p = Object.assign({}, DEF, prm); const os = this.os = p.os; let fs = this.fs = fsBase * os / Math.max(1, p.div || 1); const T = this.T = 1 / fs, sc = p.tolerance, nz = p.noise;
    RS = 88172645 ^ ((p.seed * 7919 + 1) | 0); for (let i = 0; i < 10; i++) urand();
    this.Bres = p.mains * .92; this.Bscr = this.Bres - 10; this.Bpi = this.Bres - 40; this.Bpre = this.Bres - 60;
    this.Cres = tol(p.reservoir * 1e-6, .2, sc); this.Rw = tol(p.windR, .05, sc); this.Cscr = tol(47e-6, .2, sc); this.Rscr = tol(1000, .05, sc); this.Cpi = tol(22e-6, .2, sc); this.Rpi = tol(4700, .05, sc); this.Cpre = tol(22e-6, .2, sc); this.Rpre = tol(10e3, .05, sc);
    this.kchild = p.rectifier === 1 ? .25 / Math.pow(17, 1.5) : .25 / Math.pow(50, 1.5);
    this.v1a = new Stage(ax7(sc), 290, tol(100e3, .05, sc), tol(1500, .05, sc), tol(22e-6, .2, sc), tol(1e-6, .1, sc), 1e6, tol(68e3, .05, sc), 120e-12, fs, nz);
    this.vintage = p.channel < .5;
    this.v1b = this.vintage ? new Stage(ax7(sc), 290, tol(100e3, .05, sc), tol(820, .05, sc), tol(.68e-6, .1, sc), tol(22e-9, .1, sc), 1e6, 100e3, 110e-12, fs, nz)
                            : new Stage(ax7(sc), 290, tol(100e3, .05, sc), tol(10e3, .05, sc), 0, tol(22e-9, .1, sc), 1e6, 100e3, 110e-12, fs, nz);
    this.v2a = new Stage(ax7(sc), 290, tol(100e3, .05, sc), tol(820, .05, sc), tol(.68e-6, .1, sc), tol(22e-9, .1, sc), tol(470e3, .05, sc), tol(47e3, .05, sc), 120e-12, fs, nz);
    this.dc1a = this.v1a.vp; this.dc1b = this.v1b.vp; this.dc2a = this.v2a.vp;
    this.Rpot = tol(1e6, .2, sc); this.Cbright = tol(470e-12, .1, sc); this.brightS = 0; this.vb = 0;
    this.tcf = ax7(sc); this.cfvk = 0; this.cfC = 0; this.cfCi = 0; this.cfRk = tol(100e3, .05, sc);
    this.sc = sc; this.setTone();
    this.tp1 = ax7(sc); this.tp2 = ax7(sc); this.npi = new Noise(1e6, 1.6e-3, fs, nz);
    this.piRa1 = tol(82e3, .05, sc); this.piRa2 = tol(100e3, .05, sc); this.piRb = tol(1000, .05, sc); this.piRt = tol(10e3, .05, sc);
    this.pv1 = 200; this.pv2 = 200; this.pI = 1e-3; this.fbLP = 0; this.VsPrev = 0;
    this.cathb = p.cathode > .5; this.Rkp = tol(130, .05, sc); this.Ckp = tol(250e-6, .2, sc); this.gref = this.cathb ? 0 : p.bias; this.Vk = this.cathb ? 9 : 0;
    this.cg = [0, 0]; this.cgi = [0, 0]; this.vg1 = [this.gref, this.gref]; this.Ccpl = [tol(.1e-6, .1, sc), tol(.1e-6, .1, sc)]; this.Rgl = [tol(220e3, .05, sc), tol(220e3, .05, sc)];
    this.a = Math.sqrt(p.raa / 4 / 8);
    const ip = pentode(250, -7.3, 250, 1); this.kg1 = [tol(ip / .048, .25, sc), tol(ip / .048, .25, sc)];
    const a = this.a; this.gW = 2 * (.6e-9 * 4 * a * a) / T; this.Rcore = 90e3 / (4 * a * a); this.Lm = 25 / (4 * a * a); this.Lleak = p.leak * 1e-6; this.Rot = .45;
    this.iW = 0; this.Vs = 0; this.phi = 0; this.play = new Float64Array(6); this.pr = new Float64Array(6); for (let i = 0; i < 6; i++) this.pr[i] = p.fluxSat * .002 * Math.pow(100, i / 5);
    this.ic = 0; this.x = 0; this.u = 0; this.ieqPrev = 0; this.iL2 = 0; this.iL2e = 0; this.Le1 = p.Le * .35; this.L2c = p.Le * 1.3; this.R2c = 6;
    this.Tc = p.coilTemp; this.Tm = p.coilTemp * 1.6 / 5.1; this.t = 0;
    this.up = 0; this.lp1 = 0; this.lp2 = 0; this._r0 = new Float64Array(3); this._r = new Float64Array(3); this._J = [new Float64Array(3), new Float64Array(3), new Float64Array(3)];
    this.div = Math.max(1, p.div || 1); this.acc = 0; this.cnt = 0; this.yPrev = 0; this.yCur = 0;
    this.fs = fs = fsBase * os / this.div; this.T = 1 / this.fs; this.setTone(); this.gW = 2 * (.6e-9 * 4 * a * a) / this.T;
    for (let k = 0; k < .2 * this.fs; k++) this.step(0);   // power up and settle
  }
  setTone(){ const p = this.p; this.ts = toneStack(this.fs, p.treble, p.mid, p.bass, p.marshall, this.sc); this.tx = [0, 0, 0]; this.ty = [0, 0, 0]; }
  step(sig){
    const s = this, p = s.p, T = s.T;
    s.t += T;
    const vsrc = Math.abs(p.mains * Math.sin(2 * Math.PI * 50 * s.t));
    let irect = 0;
    if (p.rectifier === 0){
      if (vsrc - s.Bres > 0){ const nVt = 1.8 * .02585, Is = 1e-9; let vd = .6;
        for (let it = 0; it < 30; it++){ const e = Math.exp(Math.min(vd / nVt, 80)), f = Is * (e - 1) - (vsrc - s.Bres - vd) / s.Rw, df = Is * e / nVt + 1 / s.Rw; let d = f / df; d = Math.max(-.2, Math.min(.2, d)); vd -= d; if (Math.abs(d) < 1e-9) break; }
        irect = Math.max(0, (vsrc - s.Bres - vd) / s.Rw); }
    } else {
      let i = 0;
      for (let it = 0; it < 25; it++){ const v = vsrc - s.Bres - i * s.Rw; if (v <= 0){ i = 0; break; } const f = s.kchild * Math.pow(v, 1.5) - i, df = -1.5 * s.kchild * Math.sqrt(v) * s.Rw - 1; const d = f / df; i -= d; if (i < 0) i = 0; if (Math.abs(d) < 1e-9) break; }
      irect = i;
    }
    // preamp
    let o = s.v1a.tick(sig, s.Bpre, T) - s.dc1a;
    { const gpot = gainTaper(p.gain), Rt = (1 - gpot) * s.Rpot + 1e3, Rb = gpot * s.Rpot + 1e3, C = p.bright > 0 ? s.Cbright : 1e-18, c = 2 / T;
      const b0 = Rb * (1 + c * Rt * C), b1 = Rb * (1 - c * Rt * C), a0 = Rb + Rt + c * Rt * Rb * C, a1 = Rb + Rt - c * Rt * Rb * C;
      s.vb = (b0 * o + b1 * s.brightS - a1 * s.vb) / a0; s.brightS = o; }
    let vgcf;
    if (s.vintage){ o = s.v1b.tick(s.vb, s.Bpre, T) - s.dc1b; vgcf = s.dc1b + o; }
    else { o = s.v1b.tick(s.vb, s.Bpre, T) - s.dc1b; o = s.v2a.tick(o * .8, s.Bpre, T) - s.dc2a; vgcf = s.dc2a + o; }
    for (let it = 0; it < 8; it++){
      const f = triode(s.tcf, s.Bpre - s.cfvk, vgcf - s.cfvk) + gridI(vgcf - s.cfvk, 3e-4) - s.cfvk / s.cfRk;
      const h = 1e-4, f2 = triode(s.tcf, s.Bpre - s.cfvk - h, vgcf - s.cfvk - h) + gridI(vgcf - s.cfvk - h, 3e-4) - (s.cfvk + h) / s.cfRk;
      let d = f / ((f2 - f) / h); d = Math.max(-20, Math.min(20, d)); s.cfvk -= d; if (Math.abs(d) < 1e-5) break; }
    const icf = (s.cfvk - s.cfC) / (T / (2 * 22e-9) + 100e3); s.cfC += T / 22e-9 * .5 * (icf + s.cfCi); s.cfCi = icf;
    const ts = s.ts, xin = icf * 100e3;
    const st = ts.b[0] * xin + ts.b[1] * s.tx[0] + ts.b[2] * s.tx[1] + ts.b[3] * s.tx[2] - ts.a[1] * s.ty[0] - ts.a[2] * s.ty[1] - ts.a[3] * s.ty[2];
    s.tx[2] = s.tx[1]; s.tx[1] = s.tx[0]; s.tx[0] = xin; s.ty[2] = s.ty[1]; s.ty[1] = s.ty[0]; s.ty[0] = st;
    const pin = st * audioTaper(p.master) + s.npi.tick();
    // NFB + presence
    const alp = T / (1 / (2 * Math.PI * 650) + T), Vp = 2 * s.Vs - s.VsPrev; s.VsPrev = s.Vs;
    s.fbLP += alp * (Vp - s.fbLP); const fb = -p.nfb * (Vp - p.presence * (Vp - s.fbLP));
    // long-tailed pair
    const Bpi = s.Bpi, Ra1 = s.piRa1, Ra2 = s.piRa2, Rt_ = s.piRt, Rb_ = s.piRb;
    const LTP = (P1, P2, I, R) => { const vk = I * (Rt_ + Rb_), vt = I * Rt_;
      R[0] = (Bpi - P1) / Ra1 - triode(s.tp1, P1 - vk, vt + pin - vk); R[1] = (Bpi - P2) / Ra2 - triode(s.tp2, P2 - vk, vt + fb - vk); R[2] = (Bpi - P1) / Ra1 + (Bpi - P2) / Ra2 - I; };
    const r0 = s._r0, r = s._r, J = s._J;
    for (let it = 0; it < 8; it++){
      const h = 1e-4; LTP(s.pv1, s.pv2, s.pI, r0);
      LTP(s.pv1 + h, s.pv2, s.pI, r); for (let q = 0; q < 3; q++) J[q][0] = (r[q] - r0[q]) / h;
      LTP(s.pv1, s.pv2 + h, s.pI, r); for (let q = 0; q < 3; q++) J[q][1] = (r[q] - r0[q]) / h;
      LTP(s.pv1, s.pv2, s.pI + 1e-7, r); for (let q = 0; q < 3; q++) J[q][2] = (r[q] - r0[q]) / 1e-7;
      const [s1, s2, s3] = r0;
      const det = J[0][0]*(J[1][1]*J[2][2]-J[1][2]*J[2][1]) - J[0][1]*(J[1][0]*J[2][2]-J[1][2]*J[2][0]) + J[0][2]*(J[1][0]*J[2][1]-J[1][1]*J[2][0]);
      if (Math.abs(det) < 1e-30) break;
      let d1 = (s1*(J[1][1]*J[2][2]-J[1][2]*J[2][1]) - J[0][1]*(s2*J[2][2]-J[1][2]*s3) + J[0][2]*(s2*J[2][1]-J[1][1]*s3)) / det;
      let d2 = (J[0][0]*(s2*J[2][2]-J[1][2]*s3) - s1*(J[1][0]*J[2][2]-J[1][2]*J[2][0]) + J[0][2]*(J[1][0]*s3-s2*J[2][0])) / det;
      const d3 = (J[0][0]*(J[1][1]*s3-s2*J[2][1]) - J[0][1]*(J[1][0]*s3-s2*J[2][0]) + s1*(J[1][0]*J[2][1]-J[1][1]*J[2][0])) / det;
      d1 = Math.max(-30, Math.min(30, d1)); d2 = Math.max(-30, Math.min(30, d2));
      s.pv1 -= d1; s.pv2 -= d2; s.pI -= d3; if (Math.abs(d1) + Math.abs(d2) < 1e-4) break;
    }
    // EL84 grids through coupling caps, grid current blocking
    const drive = [s.pv1, s.pv2];
    for (let k = 0; k < 2; k++){
      const gC = 2 * s.Ccpl[k] / T, Zs = (k ? Ra2 : Ra1) * .6 + 1500 + 1 / gC; let vg = s.vg1[k];
      for (let it = 0; it < 8; it++){ const ic = (drive[k] - s.cg[k] - s.cgi[k] / gC - vg) / Zs, x = vg - s.Vk, ig = gridI(x, 2e-3), dig = x > 0 ? 3e-3 * Math.sqrt(x) : 0;
        const f = ic - (vg - s.gref) / s.Rgl[k] - ig, df = -1 / Zs - 1 / s.Rgl[k] - dig, d = f / df; vg -= d; if (Math.abs(d) < 1e-6) break; }
      const ic = (drive[k] - s.cg[k] - s.cgi[k] / gC - vg) / Zs; s.cg[k] += (ic + s.cgi[k]) / gC; s.cgi[k] = ic; s.vg1[k] = vg;
    }
    // output stage + transformer + speaker
    const Re = p.Re * (1 + .00393 * s.Tc) + s.Rot, Blt = p.Bl * (1 - .002 * s.Tm), xb = s.x / (p.xbl * 1e-3), Bl = Blt / (1 + xb * xb);
    const L1 = s.Le1 + s.Lleak, al2 = (s.L2c / T) / (s.L2c / T + s.R2c), be2 = s.R2c / (s.L2c / T + s.R2c), den = L1 / T + Re + s.R2c * (1 - be2), gi = 1 / den;
    const c0 = (L1 / T * s.ic + s.R2c * al2 * s.iL2 - Bl * s.u) / den, a = s.a, hk = p.hyst;
    let V = s.Vs, ipa = 0, ipb = 0, ig2 = 0, imag = 0;
    const OUT = VV => { const ph = s.phi + .5 * T * (VV + s.Vs); let hy = 0;
      for (let q = 0; q < 6; q++){ let y = s.play[q]; if (ph - s.pr[q] > y) y = ph - s.pr[q]; if (ph + s.pr[q] < y) y = ph + s.pr[q]; hy += y; }
      hy /= 6; const eff = (1 - hk) * ph + hk * hy; const r4 = Math.abs(ph) / p.fluxSat; imag = eff / s.Lm * (1 + r4 * r4 * r4 * r4);
      ipa = pentode(s.Bres - a * VV - s.Vk, s.vg1[0] - s.Vk, s.Bscr - s.Vk, s.kg1[0]); const g2a = PEN.ig2;
      ipb = pentode(s.Bres + a * VV - s.Vk, s.vg1[1] - s.Vk, s.Bscr - s.Vk, s.kg1[1]); ig2 = g2a + PEN.ig2;
      return a * (ipa - ipb) - imag - VV / s.Rcore - (s.gW * (VV - s.Vs) - s.iW) - (c0 + gi * VV); };
    for (let it = 0; it < 10; it++){ const r1 = OUT(V), r2 = OUT(V + 1e-3); let d = r1 / ((r2 - r1) / 1e-3); d = Math.max(-50, Math.min(50, d)); V -= d; if (Math.abs(d) < 1e-5) break; }
    OUT(V);
    { const phn = s.phi + .5 * T * (V + s.Vs); for (let q = 0; q < 6; q++){ if (phn - s.pr[q] > s.play[q]) s.play[q] = phn - s.pr[q]; if (phn + s.pr[q] < s.play[q]) s.play[q] = phn + s.pr[q]; } s.phi = phn; }
    s.iW = s.gW * (V - s.Vs) - s.iW;
    const icn = c0 + gi * V; s.iL2 = al2 * s.iL2 + be2 * icn;
    const vterm = V - s.Rot * icn - s.Lleak * (icn - s.ic) / T;
    const xk = s.x / (p.xk * 1e-3), Kx = p.Kms * (1 + xk * xk);
    const un = (s.u + T / p.Mms * (Bl * .5 * (s.ic + icn) - Kx * s.x - .5 * p.Rms * s.u)) / (1 + .5 * T * p.Rms / p.Mms);
    const xn = s.x + .5 * T * (s.u + un), acc = (un - s.u) / T;
    const Pc = icn * icn * (Re - s.Rot); s.Tc += T / 4.3 * (Pc - (s.Tc - s.Tm) / 3.5); s.Tm += T / 1200 * ((s.Tc - s.Tm) / 3.5 - s.Tm / 1.6);
    s.ic = icn; s.Vs = vterm; s.u = un; s.x = xn;
    const ipow = ipa + ipb;
    if (s.cathb) s.Vk += T / s.Ckp * (ipow + ig2 - s.Vk / s.Rkp);
    const iscrnode = (s.Bres - s.Bscr) / s.Rscr, ipinode = (s.Bscr - s.Bpi) / s.Rpi, iprenode = (s.Bpi - s.Bpre) / s.Rpre;
    s.Bres += T / s.Cres * (irect - ipow - iscrnode); s.Bscr += T / s.Cscr * (iscrnode - ig2 - ipinode);
    s.Bpi += T / s.Cpi * (ipinode - s.pI - iprenode); s.Bpre += T / s.Cpre * (iprenode - s.v1a.ip - s.v1b.ip - (s.vintage ? 0 : s.v2a.ip) - s.cfvk / s.cfRk);
    const ieq = (p.Mms * acc + p.Rms * s.u + p.Kms * s.x) / p.Bl;
    const iL2n = al2 * s.iL2e + be2 * ieq, vbe = s.R2c * (ieq - iL2n); s.iL2e = iL2n;
    const out = p.Re * ieq + s.Le1 * (ieq - s.ieqPrev) / T + vbe + p.Bl * s.u; s.ieqPrev = ieq;
    return out;
  }
  // one sample at the base rate (oversampled inside: linear interpolation up, two-pole average down)
  tick(x){
    const p = this.p; let y;
    if (this.div > 1){   // reduced internal rate (bass only): box-average in, linear interpolation out
      this.acc += x; this.cnt++;
      if (this.cnt >= this.div){ this.yPrev = this.yCur; this.yCur = this.step(this.acc / this.cnt * p.level); this.acc = 0; this.cnt = 0; }
      y = this.yPrev + (this.yCur - this.yPrev) * (this.cnt / this.div);
      this.lp1 += .5 * (y - this.lp1); return this.lp1 * p.out;
    }
    if (this.os === 1) y = this.step(x * p.level);
    else { const xm = .5 * (this.up + x); this.up = x; const a = this.step(xm * p.level), b = this.step(x * p.level); y = .5 * (a + b); }
    this.lp1 += .6 * (y - this.lp1); return this.lp1 * p.out;
  }
}

// ---------------------------------------------------------------------------------------------------------
// "Lekki" – the same circuit reduced to what a phone can run at full rate (~1 µs per sample): every triode
// stage is its static transfer curve from the same Koren tube (table) with its coupling cap, grid-current
// bias shift (blocking) and Miller pole; the tone stack is the exact one; the phase inverter and the EL84
// pair use the same pentode tables with cathode-bias drift and supply sag; the transformer and the speaker
// are a high-pass, flux saturation and the speaker's resonance bump.
class StageL {
  constructor(B, Ra, Rk, Cc, Rl, Cm, fs, Ck){
    // partly bypassed cathode: full gain above 1/(2 pi Rk Ck), the degenerated gain below it (shelf before the curve)
    this.gL = Ck ? 1 / (1 + Rk * 1.6e-3 * 1.2) : 1 / (1 + Rk * 1.6e-3 * 1.2); this.gL = Ck ? this.gL : 1; this.unb = Ck ? 1 : 1 / (1 + Rk * 1.6e-3 * 1.2);
    this.sha = Ck ? 1 - Math.exp(-2 * Math.PI / (2 * Math.PI * Rk * Ck) / fs) : 0; this.shl = 0;
    // DC operating point and the static curve Vp(vg) with the cathode held at its DC voltage (bypassed)
    const t = NOM; let vp = B * .6, vk = 1;
    for (let i = 0; i < 3000; i++){ const ip = triodeF(t, vp - vk, -vk); vp = .95 * vp + .05 * (B - ip * Ra); vk = .95 * vk + .05 * ip * Rk; }
    this.vk = vk; this.dc = vp; this.N = 1201; this.lo = -8; this.hi = 4; this.tab = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++){ const vg = this.lo + (this.hi - this.lo) * i / (this.N - 1); let p = vp;
      for (let it = 0; it < 60; it++){ const f = (B - p) / Ra - triodeF(t, p - vk, vg - vk), d = f / (-1 / Ra - (triodeF(t, p + .01 - vk, vg - vk) - triodeF(t, p - vk, vg - vk)) / .01); p -= Math.max(-30, Math.min(30, d)); if (Math.abs(d) < 1e-6) break; }
      this.tab[i] = p - vp; }
    this.hp = Math.exp(-1 / (fs * Cc * Rl)); this.x1 = 0; this.y1 = 0; this.bias = 0; this.lp = 0;
    this.lpa = 1 - Math.exp(-2 * Math.PI * Math.min(fs * .45, 1 / (2 * Math.PI * 68e3 * Cm * 60)) / fs);
    this.blk = 1 - Math.exp(-1 / (fs * .002)); this.rel = 1 - Math.exp(-1 / (fs * Cc * Rl * 3));
  }
  tick(x){
    const y = this.hp * (this.y1 + x - this.x1); this.x1 = x; this.y1 = y;          // coupling cap
    this.lp += this.lpa * (y - this.lp);                                               // Miller pole
    let v = this.lp; if (this.sha){ this.shl += this.sha * (v - this.shl); v = v - this.shl * (1 - this.gL); } else v *= this.unb;
    let vg = v + this.bias;
    if (vg > 0){ this.bias -= vg * this.blk; vg *= .25; }                              // grid conducts: clamps and charges the cap
    else this.bias -= this.bias * this.rel;
    const u = (vg - this.lo) / (this.hi - this.lo) * (this.N - 1);
    if (u <= 0) return this.tab[0]; if (u >= this.N - 1) return this.tab[this.N - 1];
    const i = u | 0, f = u - i; return this.tab[i] * (1 - f) + this.tab[i + 1] * f;
  }
}
class AmpLight {
  constructor(prm, fs){
    const p = this.p = Object.assign({}, DEF, prm); this.fs = fs; this.T = 1 / fs;
    this.s1 = new StageL(250, 100e3, 1500, 1e-6, 1e6, 1.6e-12, fs, 22e-6);
    this.s2 = new StageL(250, 100e3, p.channel ? 10e3 : 820, 22e-9, 1e6, 1.7e-12, fs, p.channel ? 0 : .68e-6);
    this.s3 = p.channel ? new StageL(250, 100e3, 820, 22e-9, 470e3, 1.7e-12, fs, .68e-6) : null;
    this.sc = 0; this.setTone(); this.vb = 0; this.bs = 0;
    this.Bnom = p.mains * .9; this.B = this.Bnom; this.Vk = p.cathode ? 9 : 0; this.cb = [0, 0];
    this.Rsup = p.rectifier === 0 ? 40 : p.rectifier === 1 ? 140 : 300;
    this.a = Math.sqrt(p.raa / 32); const ip = penP(-7.3, 250); this.kg1 = [ip / .048 * (1 + .08 * grand()), ip / .048 * (1 + .08 * grand())];
    this.hpo = 0; this.hpx = 0; this.flux = 0; this.bz1 = 0; this.bz2 = 0; this.out1 = 0;
    const f0 = Math.sqrt(p.Kms / p.Mms) / (2 * Math.PI), Q = Math.sqrt(p.Kms * p.Mms) / (p.Rms + p.Bl * p.Bl / p.Re);
    const w = 2 * Math.PI * f0 / fs, al = Math.sin(w) / (2 * Q); this.rb = {b0: al, b2: -al, a0: 1 + al, a1: -2 * Math.cos(w), a2: 1 - al};
    this.bump = Math.min(4, (p.Bl * p.Bl / p.Rms) / p.Re); this.r1 = 0; this.r2 = 0; this.ry1 = 0; this.ry2 = 0;
  }
  setTone(){ const p = this.p; this.ts = toneStack(this.fs, p.treble, p.mid, p.bass, p.marshall, 0); this.tx = [0, 0, 0]; this.ty = [0, 0, 0]; }
  tick(x){
    const p = this.p, T = this.T;
    let o = this.s1.tick(x * p.level + (p.noise ? fgauss() * 2e-6 * p.noise : 0));
    { const gpot = gainTaper(p.gain), Rt = (1 - gpot) * 1e6 + 1e3, Rb = gpot * 1e6 + 1e3, C = p.bright > 0 ? 470e-12 : 1e-18, c = 2 * this.fs;
      const b0 = Rb * (1 + c * Rt * C), b1 = Rb * (1 - c * Rt * C), a0 = Rb + Rt + c * Rt * Rb * C, a1 = Rb + Rt - c * Rt * Rb * C;
      this.vb = (b0 * o + b1 * this.bs - a1 * this.vb) / a0; this.bs = o; }
    o = this.s2.tick(this.vb); if (this.s3) o = this.s3.tick(o * .8);
    o = o > 60 ? 60 + (o - 60) * .15 : o < -110 ? -110 + (o + 110) * .15 : o;           // cathode follower limits
    const ts = this.ts, st = ts.b[0] * o + ts.b[1] * this.tx[0] + ts.b[2] * this.tx[1] + ts.b[3] * this.tx[2] - ts.a[1] * this.ty[0] - ts.a[2] * this.ty[1] - ts.a[3] * this.ty[2];
    this.tx[2] = this.tx[1]; this.tx[1] = this.tx[0]; this.tx[0] = o; this.ty[2] = this.ty[1]; this.ty[1] = this.ty[0]; this.ty[0] = st;
    // phase inverter (differential gain ~25, its own soft limit) -> EL84 grids through coupling caps with blocking
    const d = (p.piGain ?? 7) * st * audioTaper(p.master), pi = 120 * Math.tanh(d / 120);
    let g = [pi + this.cb[0], -pi + this.cb[1]];
    for (let k = 0; k < 2; k++){ const vgk = g[k] - this.Vk; if (vgk > 0){ this.cb[k] -= vgk * .02; g[k] = this.Vk + vgk * .1; } else this.cb[k] *= .9995; }
    const bias = p.cathode ? 0 : p.bias;
    const ipa = pentode(this.B, bias + g[0] - this.Vk, this.B - 10 - this.Vk, this.kg1[0]), g2a = PEN.ig2;
    const ipb = pentode(this.B, bias + g[1] - this.Vk, this.B - 10 - this.Vk, this.kg1[1]), g2b = PEN.ig2;
    let V = this.a * (ipa - ipb) * p.Re;
    // speaker resonance raises the load (and the voltage) around Fs
    const rb = this.rb, r = (rb.b0 * V + rb.b2 * this.r2 - rb.a1 * this.ry1 - rb.a2 * this.ry2) / rb.a0; this.r2 = this.r1; this.r1 = V; this.ry2 = this.ry1; this.ry1 = r;
    V += r * this.bump;
    const Vmax = Math.max(20, (this.B - 25 - this.Vk) / this.a); V = Vmax * Math.tanh(V / Vmax);   // plates bottom out
    // transformer: low-frequency flux saturation and the magnetising high-pass
    this.flux = this.flux * .9995 + V * T; const fs_ = p.fluxSat * 2; if (Math.abs(this.flux) > fs_) V *= fs_ / Math.abs(this.flux);
    const hp = .997 * (this.hpo + V - this.hpx); this.hpx = V; this.hpo = hp;
    // supply sag and cathode-bias drift
    const itot = ipa + ipb + g2a + g2b;
    this.B += T / (p.reservoir * 1e-6) * ((this.Bnom - this.B) / this.Rsup - itot + .07);
    if (p.cathode) this.Vk += T / 250e-6 * (itot - this.Vk / 130);
    this.out1 += .5 * (hp - this.out1);
    return this.out1 * p.out * .68;
  }
}
class Lampa extends AudioWorkletProcessor {
  constructor(opt){
    super(); const o = (opt && opt.processorOptions) || {};
    const mk = pp => (pp.light ? new AmpLight(pp, sampleRate) : new Amp(pp, sampleRate));
    this.mk = mk; this.amp = mk(o.params || {}); this.bypass = false; this.load = 0;
    this.port.onmessage = ev => { const m = ev.data;
      if (m.type === 'set'){ Object.assign(this.amp.p, m.params); if ('bass' in m.params || 'mid' in m.params || 'treble' in m.params || 'marshall' in m.params) this.amp.setTone(); }
      else if (m.type === 'rebuild'){ this.amp = this.mk(Object.assign({}, this.amp.p, m.params)); }
      else if (m.type === 'bypass') this.bypass = !!m.on; };
  }
  process(inputs, outputs){
    const inp = inputs[0], out = outputs[0], n = out[0].length;
    const x = inp && inp[0] ? inp[0] : null, x2 = inp && inp[1] ? inp[1] : null;
    for (let i = 0; i < n; i++){
      const v = x ? (x2 ? .5 * (x[i] + x2[i]) : x[i]) : 0;
      const y = this.bypass ? v : this.amp.tick(v);
      out[0][i] = y; if (out[1]) out[1][i] = y;
    }
    return true;
  }
}
registerProcessor('lampa', Lampa);
