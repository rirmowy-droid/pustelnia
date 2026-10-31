// Samples, audio graph and every voice: the choirs (with Latin consonants), organs, sampled and synthesized
// bells, chains, semantron, desert wind and the two worklet synths (pads, and basses through the tube amp).
'use strict';
let MAN = null;
// performance: 'lite' on phones (light tube amp, fewer voices, shorter reverbs, slower animation)
const PERF = {mode: 'auto', lite: IS_PHONE};
try { const pm = localStorage.getItem('pu_perf'); if (pm){ PERF.mode = pm; PERF.lite = pm === 'auto' ? IS_PHONE : pm === 'lekki'; } } catch (e){}
const buffers = {}, loading = {};
let ctx = null, master, dryOut, revIn, conv, comp, limiter, preMaster;
let wieloPad = null, wieloBas = null, lampa = null, cabConv = null, cabDry = null, cabWet = null, workletsOk = false;

async function loadManifest(){ if (!MAN) MAN = await (await fetch('sample/manifest.json')).json(); return MAN; }
const decode = url => fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); }).then(a => new Promise((res, rej) => ctx.decodeAudioData(a, res, rej)));
function onsetOf(b){ const d = b.getChannelData(0), n = Math.min(d.length, b.sampleRate | 0); let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(d[i]));
  const th = mx * .03; for (let i = 0; i < n; i++) if (Math.abs(d[i]) > th) return Math.max(0, i / b.sampleRate - .003); return 0; }
function endOf(b){ const d = b.getChannelData(0); let i = d.length - 1; while (i > 0 && Math.abs(d[i]) < 1e-4) i--; return (i + 1) / b.sampleRate; }
function prep(key, f, b){ b._on = onsetOf(b); b._end = endOf(b); const meta = MAN[key].meta?.[f]; if (meta?.loop){ const len = meta.loop[1] - meta.loop[0]; b._loop = [Math.max(b._on + .3, b._end - len), b._end]; } return b; }
// files of an instrument (optionally only some layers, e.g. one vowel)
async function loadInst(key, layerOk){
  await loadManifest(); const I = MAN[key]; if (!I) return;
  let files;
  if (I.type === 'percussion') files = I.sounds;
  else { const ls = Object.keys(I.layers).filter(l => !layerOk || layerOk(l)); files = ls.flatMap(l => Object.values(I.layers[l]).flat()); }
  if (MAN[key].meta && I.type === 'melodic') files = files.concat(files.filter(f => MAN[key].meta[f]?.loop).map(f => f.replace('.mp3', '_rel.mp3')));
  const jobs = files.map(f => { const id = key + '/' + f; if (!loading[id]) loading[id] = decode(`sample/${key}/${f}`).then(b => { buffers[id] = prep(key, f, b); }).catch(() => {}); return loading[id]; });
  const st = $('status'); st.textContent = 'Wczytuję dźwięki…';
  try { await Promise.all(jobs); } finally { st.textContent = ''; }
}
function nearestRoot(key, layer, m){ const L = MAN[key]?.layers?.[layer]; if (!L) return null; let best = null;
  for (const r in L){ const ok = L[r].some(f => buffers[key + '/' + f]); if (!ok) continue; if (best === null || Math.abs(+r - m) < Math.abs(best - m)) best = +r; } return best; }

// ======================= graph =======================
async function initAudio(){
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint: 'playback', sampleRate: PERF.lite ? 32000 : undefined});
  dryOut = ctx.createGain(); revIn = ctx.createGain(); conv = ctx.createConvolver(); conv.normalize = false;
  preMaster = ctx.createGain(); comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 2.2; comp.attack.value = .03; comp.release.value = .4;
  limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -1.5; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = .002; limiter.release.value = .15;
  master = ctx.createGain(); master.gain.value = .8;
  revIn.connect(conv); conv.connect(preMaster); dryOut.connect(preMaster);
  preMaster.connect(comp); comp.connect(limiter); limiter.connect(master); master.connect(ctx.destination);
  try {
    await ctx.audioWorklet.addModule('js/wk/synth.js'); await ctx.audioWorklet.addModule('js/wk/amp.js'); workletsOk = true;
  } catch (e){ console.warn('worklets', e); workletsOk = false; }
  initMixer();
  if (workletsOk){
    wieloPad = new AudioWorkletNode(ctx, 'wielo', {numberOfInputs: 0, outputChannelCount: [2]}); wieloPad.connect(channelIn('pad'));
    wieloBas = new AudioWorkletNode(ctx, 'wielo', {numberOfInputs: 0, outputChannelCount: [2]});
    buildAmp();
    if (PERF.lite){ wieloPad.port.postMessage({type: 'maxv', n: 8}); wieloBas.port.postMessage({type: 'maxv', n: 3}); }
  }
  applyMacros();
}
// bass: synth -> tube amp (physics) -> computed speaker cabinet IR -> bass channel ; or clean
function ampParams(){
  const A = AMP, spk = CAB_SPK[A.cab] || CAB_SPK.kol_4x12_57;
  return Object.assign({gain: A.gain, master: A.master, bass: A.bass, mid: A.mid, treble: A.treble, presence: A.presence, nfb: 0, rectifier: A.rect, noise: A.noise, level: A.level,
    os: 1, div: 2, out: .005, light: PERF.lite ? 1 : 0, marshall: A.stack === 'marshall' ? 1 : 0, channel: A.channel, seed: A.seed}, spk);
}
function buildAmp(){
  if (lampa){ try { wieloBas.disconnect(); lampa.disconnect(); } catch (e){} }
  lampa = new AudioWorkletNode(ctx, 'lampa', {numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: {params: ampParams()}});
  cabConv = cabConv || ctx.createConvolver(); cabConv.normalize = false; cabDry = cabDry || ctx.createGain(); cabWet = cabWet || ctx.createGain();
  const bus = channelIn('bas');
  try { cabConv.disconnect(); cabDry.disconnect(); cabWet.disconnect(); } catch (e){}
  wieloBas.connect(lampa); lampa.connect(cabConv); cabConv.connect(cabWet); cabWet.connect(bus); wieloBas.connect(cabDry); cabDry.connect(bus);
  applyAmp(true);
}
let ampCabId = null;
async function applyAmp(force){
  if (!lampa) return; const A = AMP, t = ctx.currentTime;
  lampa.port.postMessage({type: 'bypass', on: !A.on});
  lampa.port.postMessage({type: 'set', params: {gain: A.gain, master: A.master, bass: A.bass, mid: A.mid, treble: A.treble, presence: A.presence, nfb: 0, level: A.level, noise: A.noise}});
  cabWet.gain.setTargetAtTime(A.on ? 1 : 0, t, .05); cabDry.gain.setTargetAtTime(A.on ? 0 : .6, t, .05);
  if (force || ampCabId !== A.cab){ ampCabId = A.cab; await loadIRList(); const meta = IRS.find(x => x.id === A.cab); if (meta){ const b = await decode(meta.file); const n = Math.min(b.length, 4096), out = ctx.createBuffer(1, n, b.sampleRate); out.copyToChannel(b.getChannelData(0).subarray(0, n), 0); cabConv.buffer = out; } }
}
function rebuildAmp(){ if (lampa) lampa.port.postMessage({type: 'rebuild', params: ampParams()}); }

// ======================= macros =======================
const M = {zar: .45, gest: .45, pust: .5};
function applyMacros(){
  M.zar = $('m_zar').value / 100; M.gest = $('m_gest').value / 100; M.pust = $('m_pust').value / 100;
  if (!ctx) return; const t = ctx.currentTime;
  revIn.gain.setTargetAtTime(.35 + M.pust * .75, t, .2);
  dryOut.gain.setTargetAtTime(1 - M.pust * .35, t, .2);
  master.gain.setTargetAtTime($('vol').value / 100, t, .05);
  applyWind();
}
['m_zar', 'm_gest', 'm_pust', 'vol'].forEach(id => $(id).addEventListener('input', applyMacros));

// ======================= noise =======================
let noiseBuf = null, pinkBuf = null;
function noise(){ if (!noiseBuf){ noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return noiseBuf; }
function pink(){ if (!pinkBuf){ pinkBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate); const d = pinkBuf.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < d.length; i++){ const w = Math.random() * 2 - 1; b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * .1848) * .2; } } return pinkBuf; }

// ======================= choir =======================
// One sung note from the section samples. Legato inside a syllable: the next note starts inside the sustain
// (no new attack) and crossfades. The sample already holds 3-10 real singers per note.
const CHOIR_TONE = {schola: 4200, bas: 3200, dzieci: 7000};
function choirNote(key, vowel, m, o = {}){
  const t = o.when ?? ctx.currentTime, vel = clamp(o.vel ?? .6, 0, 1);
  let layer = vowel + '_' + (vel > .62 ? 'f' : 'mf'), root = MAN[key].layers[layer] ? nearestRoot(key, layer, m) : null;
  if (root === null){ layer = vowel + '_mf'; root = MAN[key].layers[layer] ? nearestRoot(key, layer, m) : null; }
  if (root === null){ layer = Object.keys(MAN[key].layers).find(l => nearestRoot(key, l, m) !== null); if (!layer) return null; root = nearestRoot(key, layer, m); }
  const file = pick(MAN[key].layers[layer][root]), buf = buffers[key + '/' + file]; if (!buf) return null;
  const s = ctx.createBufferSource(); s.buffer = buf;
  const cents = (Math.random() * 2 - 1) * (o.drift ?? 5);
  const rate = Math.pow(2, (m - root) / 12 + cents / 1200);
  if (o.fromM !== undefined && o.fromM !== m){ s.playbackRate.setValueAtTime(Math.pow(2, (o.fromM - root) / 12 + cents / 1200), t); s.playbackRate.setTargetAtTime(rate, t, .025); }
  else s.playbackRate.setValueAtTime(rate, t);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = .5; lp.frequency.value = (CHOIR_TONE[key] || 4000) * (.55 + vel * .6) * (.75 + M.zar * .5);
  const g = ctx.createGain(); g.gain.value = 0; s.connect(lp); lp.connect(g); g.connect(o.bus);
  const amp = (o.gain ?? 1) * (.45 + .55 * vel) * .55;
  const legato = !!o.legato, off = legato ? Math.min(buf._on + .32 + Math.random() * .2, buf.duration - 1) : buf._on;
  const atk = legato ? (o.xfade ?? .05) : (o.attack ?? .09);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + atk);
  s.start(t, off);
  const v = {m, alive: true, t0: t, amp, g, s, lp, key, vowel, root, cents, avail: buf.duration - off - .25,
    canGlide(m2){ return Math.abs(m2 - root) <= 2.5; },
    glide(m2, at, tau = .03){ this.m = m2; s.playbackRate.setTargetAtTime(Math.pow(2, (m2 - root) / 12 + cents / 1200), at, tau); },
    endsBy(at){ return at > t + this.avail; },
    release(at, tau = .09){ if (!this.alive) return; this.alive = false; at = Math.max(at, t + atk); if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(at); else g.gain.cancelScheduledValues(at);
      g.gain.setTargetAtTime(0, at, tau); try { s.stop(at + tau * 8); } catch (e){} },
    dip(at, depth, len){ g.gain.setValueAtTime(amp, at); g.gain.linearRampToValueAtTime(amp * depth, at + len * .4); g.gain.linearRampToValueAtTime(amp, at + len); } };
  glow('chor', vel, t);
  return v;
}
// Latin consonants around the vowels: fricatives and plosives from filtered noise, nasals and liquids as a dark,
// short closure of the vowel. Spread over a few ms because many singers never land exactly together.
function consonant(c, t, bus, level, high){
  if (!c || S.cons === 'brak') return;
  const soft = S.cons === 'miekkie';
  const sh = high ? 1.25 : 1;
  for (const ch of c){
    if ('aeiouy'.includes(ch)) continue;
    const spec = {
      s: ['bandpass', 6200, 1.2, .11, .5], c: ['bandpass', 5800, 1.2, .09, .45], z: ['bandpass', 5500, 1.4, .08, .35], x: ['bandpass', 5000, 1, .1, .45],
      f: ['highpass', 3000, .7, .07, .25], v: ['bandpass', 3500, .8, .05, .18], h: ['bandpass', 1500, .6, .09, .2],
      t: ['bandpass', 4200, 1.2, .018, .55], d: ['bandpass', 3200, 1.2, .016, .4], p: ['bandpass', 900, 1, .016, .45], b: ['bandpass', 700, 1, .014, .35],
      k: ['bandpass', 2200, 1.4, .022, .5], q: ['bandpass', 2200, 1.4, .022, .5], g: ['bandpass', 1900, 1.4, .02, .4],
      r: ['bandpass', 1400, 2, .03, .12], l: ['lowpass', 700, .7, .04, .08], m: ['lowpass', 400, .7, .05, .1], n: ['lowpass', 500, .7, .05, .1], j: ['bandpass', 2800, 1, .04, .15],
    }[ch];
    if (!spec) continue;
    const [type, f, q, len, lv] = spec;
    if (soft && f < 1500) continue;                       // soft mode: only the airy fricatives and plosive bursts
    for (let k = 0; k < (PERF.lite ? 1 : 2); k++){
      const n = ctx.createBufferSource(); n.buffer = noise(); const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f * sh * rnd(.9, 1.1); fl.Q.value = q;
      const g = ctx.createGain(); n.connect(fl); fl.connect(g); g.connect(bus);
      const tt = t + k * rnd(.004, .012) - (len > .05 ? len * .5 : 0), a = level * lv * .28 * (k ? .6 : 1) * (soft ? .45 : 1);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(a, tt + Math.min(.012, len * .3)); g.gain.setTargetAtTime(0, tt + len * .6, len * .35);
      n.start(tt, Math.random() * 2); n.stop(tt + len * 3 + .05);
    }
  }
}

// ======================= organ =======================
function organNote(key, m, o = {}){
  const t = o.when ?? ctx.currentTime, root = nearestRoot(key, 'mf', m); if (root === null) return null;
  const file = MAN[key].layers.mf[root][0], buf = buffers[key + '/' + file]; if (!buf) return null;
  const s = ctx.createBufferSource(); s.buffer = buf; if (buf._loop){ s.loop = true; s.loopStart = buf._loop[0]; s.loopEnd = buf._loop[1]; }
  const rate = Math.pow(2, (m - root) / 12); s.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = 0; s.connect(g); g.connect(o.bus);
  const amp = (o.gain ?? 1) * .42 * (.6 + .4 * (o.vel ?? .6));
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + (o.attack ?? .04)); s.start(t, buf._on);
  glow('organy', .5, t);
  return {m, alive: true, release(at){ if (!this.alive) return; this.alive = false; at = Math.max(at, t + .05);
    if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(at); else g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(0, at, .05); try { s.stop(at + .5); } catch (e){}
    // the room keeps the pipe sounding after the key: its own recorded release tail
    const rb = buffers[key + '/' + file.replace('.mp3', '_rel.mp3')]; if (rb){ const r = ctx.createBufferSource(); r.buffer = rb; r.playbackRate.value = rate; const rg = ctx.createGain(); rg.gain.value = amp * .9; r.connect(rg); rg.connect(o.bus); r.start(at); } } };
}

// ======================= sampled bells, gongs, chains =======================
function melodicHit(key, m, o = {}){
  const I = MAN[key]; if (!I) return; const layers = Object.keys(I.layers); const vel = o.vel ?? .6;
  const layer = layers.length > 1 ? layers.sort()[Math.min(layers.length - 1, Math.floor(vel * layers.length))] : layers[0];
  const root = nearestRoot(key, layer, m) ?? nearestRoot(key, layers[0], m); if (root === null) return;
  const lay = MAN[key].layers[layer][root] ? layer : layers.find(l => MAN[key].layers[l][root]);
  const buf = buffers[key + '/' + pick(MAN[key].layers[lay][root])]; if (!buf) return;
  const t = o.when ?? ctx.currentTime, s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; s.playbackRate.value = Math.pow(2, (m - root) / 12);
  g.gain.value = (o.gain ?? 1) * (.35 + .65 * vel); s.connect(g); g.connect(o.bus); s.start(t, buf._on); glow('dzwon', vel, t);
}
function hit(key, name, o = {}){
  const files = MAN[key]?.sounds || []; const f = name ? files.find(x => x.startsWith(name)) && pick(files.filter(x => x.startsWith(name))) : pick(files);
  const buf = buffers[key + '/' + f]; if (!buf) return;
  const t = o.when ?? ctx.currentTime, s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; s.playbackRate.value = o.rate ?? 1;
  g.gain.value = o.gain ?? .7; s.connect(g);
  if (o.pan !== undefined && ctx.createStereoPanner){ const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(o.bus); } else g.connect(o.bus);
  s.start(t, buf._on); glow(key.startsWith('lanc') ? 'lancuch' : 'dzwon', o.gain ?? .5, t);
}

// ======================= tower bell (modal synthesis) =======================
// Partials of a tuned church bell relative to the strike note: hum (octave below), prime, minor-third tierce,
// quint, nominal, then the upper partials; every partial is a slightly split doublet, so the bell "warbles".
const BELL = [[.5, .9, 34], [1, .75, 15], [1.183, .55, 10], [1.506, .25, 6], [2, .9, 7], [2.514, .3, 4], [2.662, .35, 3.5], [3.011, .3, 2.6], [4.166, .2, 1.7], [5.433, .12, 1.1], [6.796, .07, .8]];
const bellCache = {};
function renderBell(f, size){
  const key = Math.round(f * 2) + '_' + size.toFixed(1);
  if (bellCache[key]) return bellCache[key];
  const sr = PERF.lite ? 22050 : 32000, dur = Math.min(PERF.lite ? 9 : 16, 16 * size);
  const oc = new OfflineAudioContext(1, Math.floor(sr * dur), sr), out = oc.createGain(); out.connect(oc.destination); out.gain.value = .09;
  for (const [r, a, tau] of BELL){
    const fr = f * r * (1 + (Math.random() * 2 - 1) * .004); if (fr > sr * .45) continue;
    for (const split of (PERF.lite && r > 3 ? [1] : [-1, 1])){
      const osc = oc.createOscillator(); osc.frequency.value = fr * (1 + split * rnd(.0005, .0025)); const g = oc.createGain();
      const amp = a * (split > 0 ? rnd(.5, 1) : 1), T = tau * size * (.85 + Math.random() * .3);
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(amp, .003 + (r < 1 ? .03 : 0)); g.gain.setTargetAtTime(0, .01, T / 4.6);
      osc.connect(g); g.connect(out); osc.start(0); osc.stop(dur);
    }
  }
  const n = oc.createBufferSource(), nb = oc.createBuffer(1, Math.floor(sr * .15), sr), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * .012));
  n.buffer = nb; const bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(sr * .45, f * 4.2); bp.Q.value = 2; const ng = oc.createGain(); ng.gain.value = .6;
  n.connect(bp); bp.connect(ng); ng.connect(out); n.start(0);
  return (bellCache[key] = oc.startRendering().then(b => { bellCache[key] = b; return b; }));
}
function towerBell(f, o = {}){
  const size = Math.round((o.size ?? 1) * 5) / 5, b = renderBell(f, size);
  if (b instanceof Promise) return;                         // first strike of a new pitch is being prepared; it rings next time
  const t = o.when ?? ctx.currentTime, vel = o.vel ?? .7, s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = b; g.gain.value = (o.gain ?? 1) * (.4 + .6 * vel); s.connect(g);
  if (o.pan !== undefined && ctx.createStereoPanner){ const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(o.bus); } else g.connect(o.bus);
  s.start(t); glow('dzwon', vel, t);
}
function prepareBells(md, fin){ for (const d of [7, 4, 2, 0, -3]) for (const sz of [.7, .8, 1, 1.2]) renderBell(mtof(degMidi(md, fin, d, false)), Math.round(sz * 5) / 5); }
// semantron: a long wooden board struck with a mallet (Eastern monasteries, Sinai). Where it is hit sets the pitch.
function semantron(o = {}){
  const t = o.when ?? ctx.currentTime, pos = o.pos ?? .5, vel = o.vel ?? .7, out = ctx.createGain(); out.gain.value = (o.gain ?? 1) * 2.2 * (.4 + .6 * vel); out.connect(o.bus);
  const base = 180 + pos * 220;
  for (const [r, q, tau] of [[1, 18, .16], [2.71, 14, .09], [5.1, 10, .05], [8.3, 8, .03]]){
    const n = ctx.createBufferSource(); n.buffer = noise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = base * r * rnd(.97, 1.03); bp.Q.value = q;
    const g = ctx.createGain(); n.connect(bp); bp.connect(g); g.connect(out); g.gain.setValueAtTime(r === 1 ? 3 : 1.6, t); g.gain.setTargetAtTime(0, t + .002, tau / 3);
    n.start(t, Math.random() * 2); n.stop(t + tau * 3 + .05);
  }
  glow('drewno', vel, t);
}

// ======================= desert wind =======================
let WIND = null;
function startWind(){
  if (WIND || !ctx) return;
  const w = WIND = {};
  w.src = ctx.createBufferSource(); w.src.buffer = pink(); w.src.loop = true;
  w.bp = ctx.createBiquadFilter(); w.bp.type = 'bandpass'; w.bp.frequency.value = 450; w.bp.Q.value = .6;
  w.whist = ctx.createBiquadFilter(); w.whist.type = 'bandpass'; w.whist.frequency.value = 1100; w.whist.Q.value = 22;   // wind singing in the stones
  w.sand = ctx.createBiquadFilter(); w.sand.type = 'highpass'; w.sand.frequency.value = 5000;
  w.g = ctx.createGain(); w.gw = ctx.createGain(); w.gs = ctx.createGain(); w.g.gain.value = 0;
  w.lfo = ctx.createOscillator(); w.lfo.frequency.value = .07; w.lfoG = ctx.createGain(); w.lfoG.gain.value = .5; w.lfo.connect(w.lfoG); w.lfoG.connect(w.g.gain);
  w.lfo2 = ctx.createOscillator(); w.lfo2.frequency.value = .031; w.lfo2G = ctx.createGain(); w.lfo2G.gain.value = 260; w.lfo2.connect(w.lfo2G); w.lfo2G.connect(w.bp.frequency); w.lfo2G.connect(w.whist.frequency);
  w.src.connect(w.bp); w.bp.connect(w.g); w.src.connect(w.whist); w.whist.connect(w.gw); w.gw.connect(w.g); w.src.connect(w.sand); w.sand.connect(w.gs); w.gs.connect(w.g);
  w.g.connect(channelIn('wiatr')); w.src.start(); w.lfo.start(); w.lfo2.start();
  applyWind();
}
function applyWind(){ if (!WIND) return; const t = ctx.currentTime, on = L.wiatr?.on;
  WIND.g.gain.setTargetAtTime(on ? .5 : 0, t, .8); WIND.lfoG.gain.setTargetAtTime(on ? .45 : 0, t, .8);
  WIND.gw.gain.setTargetAtTime(.25 + M.pust * .5, t, .5); WIND.gs.gain.setTargetAtTime(.1 + M.zar * .3, t, .5); }

// ======================= worklet synths =======================
let synthId = 1;
function synthNote(node, patch, f, o = {}){
  if (!node) return null; const id = synthId++, t = o.when ?? ctx.currentTime;
  node.port.postMessage({type: 'on', id, t, f, vel: o.vel ?? .6, pan: o.pan ?? 0, patch});
  if (o.dur) node.port.postMessage({type: 'off', id, t: t + o.dur});
  glow(node === wieloBas ? 'bas' : 'pad', o.vel ?? .5, t);
  return {id, off(at){ node.port.postMessage({type: 'off', id, t: at ?? ctx.currentTime}); }, bend(fr, at, glide){ node.port.postMessage({type: 'bend', id, f: fr, t: at, glide}); }};
}
