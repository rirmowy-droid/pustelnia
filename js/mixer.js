// Mixer: a channel strip for every layer (volume, pan, EQ, low cut, drive, compression, send to the space) and
// a master with the space (computed monastery and desert spaces + real recorded places), EQ and compression.
'use strict';
const MX_CH = {pan: 0, mute: false, solo: false, hpf: 30, low: 0, mid: 0, midF: 1000, high: 0, drive: 0, comp: .15, rev: .6};
const MX = {
  ch: {
    mnisi: {...MX_CH, hpf: 70, rev: .75, comp: .25}, ison: {...MX_CH, hpf: 50, rev: .7, pan: -.12}, dzieci: {...MX_CH, hpf: 160, rev: .85, high: 1, pan: .15},
    organy: {...MX_CH, hpf: 30, rev: .85}, bas: {...MX_CH, hpf: 28, rev: .25, comp: .3}, pad: {...MX_CH, hpf: 90, rev: .7},
    dzwony: {...MX_CH, hpf: 40, rev: 1, pan: -.1}, lancuchy: {...MX_CH, hpf: 120, rev: .6, pan: .2}, kadzielnica: {...MX_CH, hpf: 200, rev: .55, pan: .3},
    semantron: {...MX_CH, hpf: 90, rev: .7, pan: -.3}, wiatr: {...MX_CH, hpf: 60, rev: .3},
  },
  master: {space: 'kaplica', spaceMix: .65, low: 0, mid: 0, midF: 1500, high: 0, comp: .35},
};
try { const sv = JSON.parse(localStorage.getItem('pu_mixer') || 'null'); if (sv){ for (const id in sv.ch || {}) Object.assign(MX.ch[id] || {}, sv.ch[id]); Object.assign(MX.master, sv.master || {}); } } catch (e){}
function saveMixer(){ try { localStorage.setItem('pu_mixer', JSON.stringify(MX)); } catch (e){} }
let IRS = []; const irBuf = {}; const CH = {}; let MS = null;
async function loadIRList(){ if (!IRS.length){ try { IRS = await (await fetch('ir/ir.json')).json(); } catch (e){ IRS = []; } } return IRS; }
async function loadIR(id){
  const meta = IRS.find(x => x.id === id); if (!meta) return null;
  if (!irBuf[id]) irBuf[id] = decode(meta.file).then(b => { // drop the codec's leading silence, keep unit energy
    const d = b.getChannelData(0); let mx = 0; for (let i = 0; i < Math.min(d.length, b.sampleRate); i++) mx = Math.max(mx, Math.abs(d[i]));
    let s = 0; while (s < d.length && Math.abs(d[s]) < mx * .02) s++; s = Math.max(0, s - 4);
    const n = b.length - s, out = ctx.createBuffer(b.numberOfChannels, n, b.sampleRate), g = meta.gain || 1;
    for (let c = 0; c < b.numberOfChannels; c++){ const src = b.getChannelData(c).subarray(s), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = src[i] * g; out.copyToChannel(o, c); }
    return out; });
  return irBuf[id];
}
function driveCurve(a){ const n = 2048, g = 1 + a * 10, c = new Float32Array(n); for (let i = 0; i < n; i++){ const x = (i / (n - 1) * 2 - 1) * 1.5; c[i] = Math.tanh(g * x) / g * (1 + a); } return c; }
function buildChannel(id){
  const n = {};
  n.in = ctx.createGain(); n.drive = ctx.createWaveShaper(); n.drive.oversample = '2x';
  n.hpf = ctx.createBiquadFilter(); n.hpf.type = 'highpass'; n.hpf.Q.value = .6;
  n.low = ctx.createBiquadFilter(); n.low.type = 'lowshelf'; n.low.frequency.value = 150;
  n.mid = ctx.createBiquadFilter(); n.mid.type = 'peaking'; n.mid.Q.value = .9;
  n.high = ctx.createBiquadFilter(); n.high.type = 'highshelf'; n.high.frequency.value = 6500;
  n.comp = ctx.createDynamicsCompressor(); n.comp.attack.value = .01; n.comp.release.value = .25; n.comp.knee.value = 8;
  n.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); n.mute = ctx.createGain(); n.send = ctx.createGain();
  n.in.connect(n.drive); n.drive.connect(n.hpf); n.hpf.connect(n.low); n.low.connect(n.mid); n.mid.connect(n.high); n.high.connect(n.comp); n.comp.connect(n.pan);
  n.pan.connect(n.mute); n.mute.connect(dryOut); n.mute.connect(n.send); n.send.connect(revIn);
  CH[id] = n; applyChannel(id); return n;
}
function channelIn(id){ return (CH[id] || buildChannel(id)).in; }
const anySolo = () => Object.values(MX.ch).some(c => c.solo);
function applyChannel(id){
  const n = CH[id], c = MX.ch[id]; if (!n || !c) return; const t = ctx.currentTime, set = (p, v) => p.setTargetAtTime(v, t, .04);
  set(n.in.gain, L[id] ? volCurve(L[id].vol) : 1);
  n.drive.curve = c.drive > 0 ? driveCurve(c.drive) : null;
  set(n.hpf.frequency, c.hpf); set(n.low.gain, c.low); set(n.mid.gain, c.mid); set(n.mid.frequency, c.midF); set(n.high.gain, c.high);
  n.comp.threshold.value = -6 - c.comp * 30; n.comp.ratio.value = 1 + c.comp * 6;
  if (n.pan.pan) set(n.pan.pan, c.pan);
  set(n.mute.gain, !c.mute && (!anySolo() || c.solo) ? 1 : 0); set(n.send.gain, c.rev);
}
function applyAllChannels(){ for (const id in CH) applyChannel(id); }
function initMixer(){
  if (MS) return; MS = {};
  MS.low = ctx.createBiquadFilter(); MS.low.type = 'lowshelf'; MS.low.frequency.value = 120;
  MS.mid = ctx.createBiquadFilter(); MS.mid.type = 'peaking'; MS.mid.Q.value = .8;
  MS.high = ctx.createBiquadFilter(); MS.high.type = 'highshelf'; MS.high.frequency.value = 8000;
  MS.ret = ctx.createGain();
  preMaster.disconnect(); conv.disconnect();
  conv.connect(MS.ret); MS.ret.connect(preMaster);
  preMaster.connect(MS.low); MS.low.connect(MS.mid); MS.mid.connect(MS.high); MS.high.connect(comp);
  for (const id in MX.ch) buildChannel(id);
  applyMaster();
}
async function applyMaster(){
  if (!MS) return; const m = MX.master, t = ctx.currentTime, set = (p, v) => p.setTargetAtTime(v, t, .05);
  await loadIRList(); const b = await loadIR(m.space); if (b && conv.buffer !== b) conv.buffer = b;
  set(MS.ret.gain, m.spaceMix * .6); set(MS.low.gain, m.low); set(MS.mid.gain, m.mid); set(MS.mid.frequency, m.midF); set(MS.high.gain, m.high);
  comp.threshold.value = -8 - m.comp * 22; comp.ratio.value = 1.5 + m.comp * 4; saveMixer();
}
// ---------- UI ----------
function mxSlider(label, min, max, step, val, fmt, onInput){
  const w = document.createElement('label'); w.className = 'mxs';
  const top = document.createElement('span'); top.innerHTML = `${label} <b></b>`; const b = top.querySelector('b');
  const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val; b.textContent = fmt(+val);
  r.oninput = () => { b.textContent = fmt(+r.value); onInput(+r.value); }; w.append(top, r); return w;
}
const fmtDb = v => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB', fmtPct = v => Math.round(v * 100) + '%', fmtHz = v => v >= 1000 ? (v / 1000).toFixed(1) + ' kHz' : Math.round(v) + ' Hz';
const fmtPan = v => Math.abs(v) < .03 ? 'środek' : (v < 0 ? 'L ' : 'P ') + Math.round(Math.abs(v) * 100);
function irSelect(kind, value, onChange){
  const s = document.createElement('select'); const groups = {};
  for (const ir of IRS.filter(x => x.kind === kind)) (groups[ir.group] ||= []).push(ir);
  for (const g in groups){ const og = document.createElement('optgroup'); og.label = g; for (const ir of groups[g]) og.appendChild(new Option(ir.name + (ir.rt60 ? ` · ${ir.rt60[4]} s` : ''), ir.id)); s.appendChild(og); }
  s.value = value; s.onchange = () => onChange(s.value); return s;
}
async function buildMixerUI(){
  await loadIRList(); const box = $('mixer'); box.innerHTML = '';
  const m = MX.master, mc = document.createElement('div'); mc.className = 'card';
  mc.innerHTML = '<div class="label">Miejsce i całość</div>';
  const spW = document.createElement('label'); spW.className = 'fld'; spW.textContent = 'Gdzie śpiewają mnisi';
  spW.appendChild(irSelect('space', m.space, v => { m.space = v; applyMaster(); }));
  const g = document.createElement('div'); g.className = 'mxgrid';
  g.append(mxSlider('Ilość przestrzeni', 0, 1.2, .01, m.spaceMix, fmtPct, v => { m.spaceMix = v; applyMaster(); }),
    mxSlider('Kompresja', 0, 1, .01, m.comp, fmtPct, v => { m.comp = v; applyMaster(); }),
    mxSlider('Niskie', -12, 12, .5, m.low, fmtDb, v => { m.low = v; applyMaster(); }), mxSlider('Wysokie', -12, 12, .5, m.high, fmtDb, v => { m.high = v; applyMaster(); }),
    mxSlider('Środek', -12, 12, .5, m.mid, fmtDb, v => { m.mid = v; applyMaster(); }), mxSlider('Częstotliwość środka', 200, 5000, 10, m.midF, fmtHz, v => { m.midF = v; applyMaster(); }));
  mc.append(spW, g); box.appendChild(mc);
  for (const d of LAYER_DEF){
    const id = d.id, c = MX.ch[id], card = document.createElement('div'); card.className = 'card mxch';
    const head = document.createElement('div'); head.className = 'mxhead'; head.innerHTML = `<b>${d.name}</b>`;
    const mu = document.createElement('button'); mu.className = 'mxb' + (c.mute ? ' on' : ''); mu.textContent = 'M'; mu.title = 'Wycisz';
    mu.onclick = () => { c.mute = !c.mute; mu.classList.toggle('on', c.mute); applyAllChannels(); saveMixer(); };
    const so = document.createElement('button'); so.className = 'mxb solo' + (c.solo ? ' on' : ''); so.textContent = 'S'; so.title = 'Tylko ta warstwa';
    so.onclick = () => { c.solo = !c.solo; so.classList.toggle('on', c.solo); applyAllChannels(); saveMixer(); };
    head.append(mu, so);
    const g2 = document.createElement('div'); g2.className = 'mxgrid'; const chg = (k, v) => { c[k] = v; if (ctx) applyChannel(id); saveMixer(); };
    g2.append(mxSlider('Głośność', 0, 1, .01, L[id].vol, fmtPct, v => { L[id].vol = v; syncLayerVol(id); if (ctx) applyChannel(id); saveState(); }),
      mxSlider('Panorama', -1, 1, .01, c.pan, fmtPan, v => chg('pan', v)), mxSlider('Niskie', -12, 12, .5, c.low, fmtDb, v => chg('low', v)),
      mxSlider('Wysokie', -12, 12, .5, c.high, fmtDb, v => chg('high', v)), mxSlider('Środek', -12, 12, .5, c.mid, fmtDb, v => chg('mid', v)),
      mxSlider('Częstotliwość środka', 200, 6000, 10, c.midF, fmtHz, v => chg('midF', v)), mxSlider('Filtr dołu', 20, 500, 1, c.hpf, fmtHz, v => chg('hpf', v)),
      mxSlider('Przester', 0, 1, .01, c.drive, fmtPct, v => chg('drive', v)), mxSlider('Kompresja', 0, 1, .01, c.comp, fmtPct, v => chg('comp', v)),
      mxSlider('Przestrzeń (wysyłka)', 0, 1.5, .01, c.rev, fmtPct, v => chg('rev', v)));
    const det = document.createElement('details'); const sum = document.createElement('summary'); sum.textContent = 'Korektor i efekty'; det.append(sum, g2);
    card.append(head, det); box.appendChild(card);
  }
  const reset = document.createElement('button'); reset.className = 'btn'; reset.textContent = 'Przywróć ustawienia miksu';
  reset.onclick = () => { try { localStorage.removeItem('pu_mixer'); } catch (e){} location.reload(); };
  const cr = document.createElement('div'); cr.className = 'note'; cr.style.marginTop = '10px';
  cr.textContent = 'Kaplica, jaskinia, krypta, bazylika, cysterna, dziedziniec, kanion i wydmy są policzone z geometrii i materiałów (odbicia lustrzane + pogłos w pasmach). „Nagrania” to prawdziwe odpowiedzi impulsowe z IR Library Connera (MIT).';
  box.append(reset, cr);
}
function syncLayerVol(id){ const r = document.querySelector(`[data-layervol="${id}"]`); if (r) r.value = Math.round(L[id].vol * 100); }
