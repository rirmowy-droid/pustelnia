// The monastery: sections (a text sung line by line), phrases built by the chant generator, and the players –
// schola, ison / organum, children, organ, synth bass through the tube amp, pads, bells, chains, censer,
// semantron, frame drum and the desert wind. Free chant rhythm or a meter; harmony from the mode or own chords.
// Every setting in S, L and AMP is read live.
'use strict';
const S = {text: 'pustynia', textMode: 'kolejno', mode: 1, modeMode: 'stały', shift: 0, tempo: 150, style: 'mieszany', cons: 'brak',
  harm: 'modus', chords: 'Dm C Dm:2 | F C Dm:2', rhythm: 'swobodny', meter: '4/4', bpm: 72,
  pat: {beben: 'x..ox.o.', dzwony: '', lancuchy: '', semantron: ''}};
const LAYER_DEF = [
  {id: 'mnisi', name: 'Mnisi (schola)', opts: [['schola', 'Schola – basy i tenory razem'], ['schola2', 'Wielka schola (podwójny chór)'], ['bas', 'Same basy (ciemno)']], def: 'schola', vol: .85},
  {id: 'ison', name: 'Ison / organum', opts: [['ison', 'Ison – trzymany ton (bizantyjski)'], ['organum4', 'Organum – kwarta niżej'], ['organum5', 'Organum – kwinta niżej'], ['oktawa', 'Basy oktawę niżej']], def: 'ison', vol: .6},
  {id: 'dzieci', name: 'Chór dziecięcy', opts: [['alternatim', 'Na przemian z mnichami'], ['oktawa', 'Razem z mnichami, oktawę wyżej'], ['odpowiedzi', 'Odpowiedzi na końcach fraz'], ['wysoki', 'Wysoki trzymany ton']], def: 'alternatim', vol: .6},
  {id: 'organy', name: 'Organy', opts: [['organy_ciche', 'Ciche (flety)'], ['pozytyw_8', 'Pozytyw 8′ (renesansowe)'], ['pozytyw_pelny', 'Pozytyw pełny'], ['organy_pleno', 'Plenum (pełne)']], def: 'organy_ciche', vol: .65},
  {id: 'bas', name: 'Bas syntezatorowy', opts: Object.entries(BASS_PATCHES).map(([k, v]) => [k, v.name]), def: 'gleboki', vol: .45},
  {id: 'pad', name: 'Syntezatory (tło)', opts: Object.entries(PAD_PATCHES).map(([k, v]) => [k, v.name]), def: 'wydmy', vol: .7},
  {id: 'dzwony', name: 'Dzwony', opts: [['mieszane', 'Wszystkie (dzwonnica, sygnaturka, rurowe)'], ['dzwonnica', 'Dzwonnica (wielkie dzwony)'], ['sygnaturka', 'Sygnaturka i dzwonki ręczne'], ['rurowe', 'Dzwony rurowe'], ['tybet', 'Dzwonki z Nepalu i gong']], def: 'mieszane', vol: .55},
  {id: 'beben', name: 'Bęben ramowy', opts: [['ramowy', 'Bęben ramowy i darbuka (gra wzór rytmu)']], def: 'ramowy', vol: .55, on: false},
  {id: 'lancuchy', name: 'Łańcuchy', opts: [['rzadko', 'Rzadkie uderzenia'], ['czesto', 'Częste uderzenia i wleczenie']], def: 'rzadko', vol: .7},
  {id: 'kadzielnica', name: 'Kadzielnica', opts: [['tak', 'Kołysanie na łańcuszkach z dzwoneczkami']], def: 'tak', vol: .35, on: false},
  {id: 'semantron', name: 'Semantron (kołatka)', opts: [['tak', 'Drewniana deska – wezwanie na modlitwę']], def: 'tak', vol: .5},
  {id: 'wiatr', name: 'Wiatr pustyni', opts: [['tak', 'Wiatr, piasek, świst w skałach']], def: 'tak', vol: .35},
];
const L = {};
for (const d of LAYER_DEF) L[d.id] = {on: d.on ?? true, inst: d.def, vol: d.vol};
const AMP = {on: true, gain: .45, master: .55, bass: .55, mid: .6, treble: .5, presence: .3, nfb: 0, rect: 1, noise: 3, level: 1.2, cab: 'kol_4x12_57', stack: 'marshall', channel: 0, seed: 1};
const volCurve = v => v * v * 1.6;
try { const sv = JSON.parse(localStorage.getItem('pu_state') || 'null'); if (sv){ const pat = Object.assign({}, S.pat, (sv.S || {}).pat || {}); Object.assign(S, sv.S || {}); S.pat = pat; for (const k in sv.L || {}) if (L[k]) Object.assign(L[k], sv.L[k]); Object.assign(AMP, sv.AMP || {}); } } catch (e){}
function saveState(){ try { localStorage.setItem('pu_state', JSON.stringify({S, L, AMP})); } catch (e){} }

// ======================= helpers =======================
const FIN = {2: 50, 4: 52, 5: 53, 7: 55};       // natural finalis for men: D3, E3, F3, G3
const modeOf = id => MODES.find(m => m.id === id) || MODES[0];
const on = id => L[id].on;
const ch = id => channelIn(id);
const finOf = md => FIN[md.pc] + S.shift + (md.amb[1] >= 9 ? -2 : 0);

// ======================= time: the bar clock (meter + tempo) =======================
// One clock for chords and rhythm patterns. In free rhythm the chant floats over it; in "metrum" the chant
// sits on its eighths.
const CLK = {t0: 0};
const eighthDur = () => 30 / S.bpm;
const stepsPerBar = () => (METERS[S.meter] || METERS['4/4']).reduce((a, b) => a + b, 0);
const barDur = () => eighthDur() * stepsPerBar();
function barIndexAt(t){ return Math.floor((t - CLK.t0) / barDur() + 1e-6); }
function nextStepAt(t){ const e = eighthDur(), k = Math.ceil((t - CLK.t0) / e - 1e-6); return CLK.t0 + k * e; }
function nextBarAt(t){ const b = barDur(), k = Math.ceil((t - CLK.t0) / b - 1e-6); return CLK.t0 + k * b; }
// own chords
let PROG = parseProgression(S.chords).list;
function setChords(txt){ const r = parseProgression(txt); if (r.list.length){ S.chords = txt; PROG = r.list; saveState(); } return r; }
const ownChords = () => S.harm === 'wlasne' && PROG.length > 0;
function chordAtBar(b){ const total = PROG.reduce((a, x) => a + x.bars, 0); let x = ((b % total) + total) % total;
  for (const p of PROG){ if (x < p.bars) return {chord: p.chord, start: x === 0 || x % 1 === 0 && x < 1}; x -= p.bars; } return {chord: PROG[0].chord}; }
function chordAt(t){ const b = (t - CLK.t0) / barDur(); return chordAtBar(Math.floor(b + 1e-6)).chord; }

// ======================= section / phrase state =======================
let SEC = null, playing = false, timer = null, nextAt = 0, Q = [], phraseNo = 0, nextBar = 0, lastChord = null;
const LINE = {mnisi: null, ison: null, dzieci: null};     // the voice currently sounding for each choir role
let organHeld = [], bassHeld = null, padHeld = [];
function newSection(){
  let tx = TEXTS.find(t => t.id === S.text) || TEXTS[0];
  if (S.textMode === 'kolejno' && SEC){ tx = TEXTS[(TEXTS.indexOf(tx) + 1) % TEXTS.length]; S.text = tx.id; syncTextUI(); }
  else if (S.textMode === 'losowo' && SEC){ tx = pick(TEXTS.filter(t => t.id !== SEC.text.id)); S.text = tx.id; syncTextUI(); }
  let mode = S.mode; if (S.modeMode === 'losowy' && SEC) mode = pick(MODES).id;
  const md = modeOf(mode), fin = finOf(md);
  SEC = {text: tx, lines: parseText(tx.lines), i: 0, mode: md, fin, psalm: S.style === 'psalmodia' || (S.style === 'mieszany' && chance(.4))};
  prepareBells(md, fin);
  showNow();
}
function pulse(){ return 60 / S.tempo * (.92 + M.pust * .2); }

// ======================= scheduling =======================
function at(t, fn){ Q.push({t, fn}); }
function startEngine(){
  if (playing) return; playing = true; Q = []; SEC = null; newSection(); phraseNo = 0;
  CLK.t0 = ctx.currentTime + .3; nextBar = 0; lastChord = null; nextAt = CLK.t0;
  if (on('semantron') && !S.pat.semantron) { semantronCall(nextAt); nextAt += 4.2; }
  startWind(); censerLoop();
  timer = setInterval(tick, 80); tick();
}
function stopEngine(){
  playing = false; clearInterval(timer); timer = null; Q = [];
  const t = ctx.currentTime;
  for (const k in LINE){ if (LINE[k]) LINE[k].forEach(v => v && v.release(t, .3)); LINE[k] = null; }
  organHeld.forEach(v => v && v.release(t)); organHeld = []; if (bassHeld){ bassHeld.off(t); bassHeld = null; } padHeld.forEach(v => v.off(t)); padHeld = [];
  if (wieloBas) wieloBas.port.postMessage({type: 'panic'}); if (wieloPad) wieloPad.port.postMessage({type: 'panic'});
}
function tick(){
  if (!playing) return; const now = ctx.currentTime;
  while (CLK.t0 + nextBar * barDur() < now + 1.2){ bar(nextBar, CLK.t0 + nextBar * barDur()); nextBar++; }
  while (nextAt < now + 1.2){ nextAt = phrase(nextAt); }
  Q.sort((a, b) => a.t - b.t);
  while (Q.length && Q[0].t < now + .25){ const e = Q.shift(); try { e.fn(Math.max(e.t, now + .005)); } catch (err){ console.error(err); } }
}

// ======================= one bar: own chords and rhythm patterns =======================
function bar(b, t){
  if (ownChords()){
    const c = chordAtBar(b).chord;
    if (c !== lastChord){ lastChord = c; at(t, tt => playChord(c, tt)); }
  }
  const steps = stepsPerBar(), e = eighthDur(), groups = METERS[S.meter] || METERS['4/4'];
  const accentSteps = new Set(); { let k = 0; for (const g of groups){ accentSteps.add(k); k += g; } }
  for (const inst of ['beben', 'dzwony', 'lancuchy', 'semantron']){
    const p = (S.pat[inst] || '').replace(/[^xXoO.\-_ ]/g, '').replace(/\s/g, ''); if (!p || !on(inst)) continue;
    for (let k = 0; k < steps; k++){
      const c = p[(b * steps + k) % p.length]; if (c !== 'x' && c !== 'X' && c !== 'o' && c !== 'O') continue;
      const strong = c === 'x' || c === 'X', tt = t + k * e + (k ? rnd(-.006, .006) : 0), acc = accentSteps.has(k);
      at(tt, x => hitPattern(inst, strong, acc, x));
    }
  }
}
function hitPattern(inst, strong, acc, t){
  const v = (strong ? .8 : .45) * (acc ? 1.1 : .9);
  if (inst === 'beben'){ if (strong) hit('beben', pick(['dum', 'dum', 'reka']), {when: t, gain: .8 * v, bus: ch('beben')}); else hit('beben', pick(['tek', 'tek', 'dar']), {when: t, gain: .7 * v, bus: ch('beben'), pan: rnd(-.2, .2)}); }
  else if (inst === 'dzwony'){ const md = SEC.mode, fin = SEC.fin, root = ownChords() ? (chordAt(t).root - fin % 12 + 12) % 12 + fin : fin;
    if (strong) melodicHit('dzwony_rurowe', root + 12, {when: t, vel: v, bus: ch('dzwony'), gain: .8});
    else melodicHit('dzwonki_reczne', degMidi(md, fin, pick([0, 2, 4, 7]), false) + 24, {when: t, vel: v * .8, bus: ch('dzwony'), gain: .5}); }
  else if (inst === 'lancuchy') hit('lancuchy', strong ? 'uderzenie' : 'grzechot', {when: t, gain: (strong ? .8 : .45) * v, bus: ch('lancuchy'), pan: rnd(-.6, .6)});
  else if (inst === 'semantron') semantron({when: t, pos: strong ? .3 : .75, vel: v, bus: ch('semantron')});
}
// organ, pads and bass follow the written chords
function playChord(c, t){
  const fin = SEC ? SEC.fin : 50, base = 55;                                   // voicing around G3..G4
  const notes = c.ivs.map(i => { let m = c.root + i; while (m < base) m += 12; while (m > base + 12) m -= 12; return m; }).sort((a, b) => a - b);
  const bassM = (() => { let m = c.root + 36; while (m < 36) m += 12; while (m > 47) m -= 12; return m; })();
  if (on('organy')){ organHeld.forEach(v => v && v.release(t + .04)); organHeld = [];
    for (const m of notes) organHeld.push(organNote(L.organy.inst, m + 12, {when: t, bus: ch('organy'), gain: .9 / Math.sqrt(notes.length)}));
    if (MAN.organy_pedal) organHeld.push(organNote('organy_pedal', bassM, {when: t, bus: ch('organy'), gain: .55})); organHeld = organHeld.filter(Boolean); }
  if (on('pad') && wieloPad){ const patch = PAD_PATCHES[L.pad.inst] || PAD_PATCHES.wydmy; padHeld.forEach(v => v.off(t + .3)); padHeld = [];
    for (const m of notes.slice(0, PERF.lite ? 3 : 4)) padHeld.push(synthNote(wieloPad, patch, mtof(m + 12), {when: t + rnd(0, .15), vel: .5, pan: rnd(-.5, .5)})); }
  if (on('bas') && wieloBas){ const patch = BASS_PATCHES[L.bas.inst] || BASS_PATCHES.gleboki;
    if (bassHeld) bassHeld.bend(mtof(bassM), t, .12); else bassHeld = synthNote(wieloBas, patch, mtof(bassM), {when: t, vel: .5 + M.zar * .4}); }
  glow('organy', .6, t);
}

// ======================= one phrase =======================
const quant = d => d < 1.2 ? 1 : d < 1.7 ? 2 : d < 2.2 ? 3 : 4;      // free durations -> eighths
function phrase(t0){
  if (!SEC || SEC.i >= SEC.lines.length){ const wasSec = !!SEC; if (wasSec) t0 = interlude(t0); newSection(); }
  const metr = S.rhythm === 'metrum';
  if (metr) t0 = nextStepAt(t0);
  const md = SEC.mode, fin = SEC.fin, line = SEC.lines[SEC.i], li = SEC.i, last = li === SEC.lines.length - 1;
  const kind = SEC.psalm ? 'psalm' : (S.style === 'mieszany' && chance(.25) ? 'psalm' : 'arch');
  const notes = makePhrase(md, line, {density: M.gest * .85, kind, end: last || chance(.55) ? 'final' : 'half'});
  const N = notes.length, times = []; let tt = t0;
  if (metr){ const e = eighthDur(); for (const n of notes){ const d = quant(n.dur) * e; times.push([tt, d]); tt += d; } }
  else { const P = pulse();     // free rhythm: a little faster in the middle of the line, slower into the cadence
    for (let j = 0; j < N; j++){ const x = N > 1 ? j / (N - 1) : 1, rub = 1.05 - .12 * Math.sin(Math.PI * x) + (x > .8 ? (x - .8) * .9 : 0);
      const d = notes[j].dur * P * rub * rnd(.95, 1.06); times.push([tt, d]); tt += d; } }
  const end = tt, P = metr ? eighthDur() * 2 : pulse();
  // melody in midi; with own chords every note is bent into the chord's scale and strong notes land on chord tones
  let mel = notes.map(n => degMidi(md, fin, n.deg, n.flat));
  if (ownChords()) mel = mel.map((m, j) => { const c = chordAt(times[j][0] + .01), strong = notes[j].first && (line.syl[notes[j].si].acc || j === 0 || j === N - 1);
    return snapTo(m, strong ? c.pcs : chordScale(md, fin, c)); });
  const kidsMode = on('dzieci') ? L.dzieci.inst : 'brak', kidsSing = kidsMode === 'alternatim' ? (li % 2 === 1) : false;
  const menSing = on('mnisi') && !(kidsSing && kidsMode === 'alternatim');
  const melKey = L.mnisi.inst === 'bas' ? 'bas' : 'schola';
  at(t0, () => showLine(line, li));
  notes.forEach((n, j) => { if (n.first) at(times[j][0], (x) => hlSyl(n.si, x)); });
  if (menSing) singLine('mnisi', melKey, mel, notes, times, line, {gain: L.mnisi.inst === 'schola2' ? .8 : 1, double: L.mnisi.inst === 'schola2' && !PERF.lite});
  if (on('dzieci')){
    if (kidsSing || kidsMode === 'oktawa') singLine('dzieci', 'dzieci', mel.map(m => m + 12), notes, times, line, {gain: kidsMode === 'oktawa' ? .7 : 1, high: true});
    else if (kidsMode === 'odpowiedzi'){ const k0 = Math.max(0, notes.findIndex(n => n.si >= line.syl.length - 2)); singLine('dzieci', 'dzieci', mel.map(m => m + 12), notes, times, line, {from: k0, gain: .9, high: true}); }
    else if (kidsMode === 'wysoki'){ const hm = degMidi(md, fin, md.tenor, false) + 12; singLine('dzieci', 'dzieci', notes.map(() => hm), notes, times, line, {gain: .55, high: true}); }
  }
  if (on('ison') && (menSing || kidsSing)){
    const v = L.ison.inst;
    if (v === 'ison'){
      const isonAt = j => { if (ownChords()){ let m = chordAt(times[j][0] + .01).root + 48; while (m > 57) m -= 12; while (m < 45) m += 12; return m; }
        return SEC.psalm && chance(.3) ? degMidi(md, fin, md.tenor, false) - (degMidi(md, fin, md.tenor, false) > 56 ? 12 : 0) : fin; };
      const first = isonAt(0); singLine('ison', 'bas', notes.map((_, j) => ownChords() ? isonAt(j) : first), notes, times, line, {gain: .75});
    }
    else if (v === 'oktawa') singLine('ison', 'bas', mel.map(m => m - 12 >= 45 ? m - 12 : m), notes, times, line, {gain: .7});
    else { const o = organumLine(md, fin, notes, v === 'organum5' ? 7 : 5); singLine('ison', 'bas', ownChords() ? o.map((m, j) => snapTo(m, chordScale(md, fin, chordAt(times[j][0] + .01)))) : o, notes, times, line, {gain: .75}); }
  }
  if (!ownChords()) modalAccompaniment(t0, end, notes, times, line, md, fin, P, N);
  // bells and chains: automatic only when they have no rhythm pattern of their own
  if (on('dzwony') && !(S.pat.dzwony || '').trim()){
    const st = L.dzwony.inst;
    if ((st === 'dzwonnica' || st === 'mieszane') && (li === 0 || chance(.25 + M.gest * .3))) at(t0, (x) => towerBell(mtof(fin), {when: x, vel: .7, bus: ch('dzwony'), size: 1.2, pan: -.2}));
    if ((st === 'rurowe' || st === 'mieszane') && chance(.3 + M.gest * .3)) at(t0 + P * rnd(0, 2), (x) => melodicHit(pick(['dzwony_rurowe', 'dzwony_rurowe_stare']), degMidi(md, fin, pick([0, 4, 7]), false) + 12, {when: x, vel: rnd(.4, .8), bus: ch('dzwony'), gain: .8}));
    if ((st === 'sygnaturka' || st === 'mieszane') && chance(.35 + M.gest * .35)) sanctusBells(times[N - 1][0], md, fin);
    if (st === 'tybet' && chance(.5)) at(end - P, (x) => hit(pick(['dzwonki_tybetanskie', 'cymbalki']), null, {when: x, gain: .6, bus: ch('dzwony'), pan: rnd(-.6, .6)}));
    if (st === 'tybet' && last) at(end, (x) => hit('gong', null, {when: x, gain: .5, bus: ch('dzwony')}));
  }
  if (on('lancuchy') && !(S.pat.lancuchy || '').trim() && chance((L.lancuchy.inst === 'czesto' ? .55 : .22) + M.gest * .2)) at(end - P * rnd(.2, 1), (x) => hit('lancuchy', pick(['uderzenie', 'uderzenie', 'grzechot']), {when: x, gain: rnd(.5, .9), bus: ch('lancuchy'), pan: rnd(-.7, .7)}));
  SEC.i++; phraseNo++;
  // breath between lines; longer with "Pustka". In meter: rest to the end of the bar (+ a bar more when empty)
  if (metr){ let n = nextBarAt(end + eighthDur() * 1.5); if (M.pust > .5) n += barDur() * Math.round((M.pust - .5) * 4); return n; }
  return end + P * (1.2 + M.pust * 3.5) * rnd(.85, 1.2);
}
// organ, bass and pads from the mode when no chords are written
function modalAccompaniment(t0, end, notes, times, line, md, fin, P, N){
  if (on('organy')){
    const k = L.organy.inst, g = .9, med = line.mediant >= 0 ? notes.findIndex(n => n.si > line.mediant) : -1;
    const chordAt_ = (t, degs) => at(t, (tt) => { organHeld.forEach(v => v && v.release(tt + .05)); organHeld = [];
      for (const d of degs){ const m = degMidi(md, fin, d, isB(md, d) && md.bflat > .5) + 12; organHeld.push(organNote(k, m, {when: tt, bus: ch('organy'), gain: g / Math.sqrt(degs.length)})); }
      const pm = fin - 12; if (MAN.organy_pedal) organHeld.push(organNote('organy_pedal', pm >= 36 ? pm : pm + 12, {when: tt, bus: ch('organy'), gain: .55}));
      organHeld = organHeld.filter(Boolean); });
    chordAt_(t0, [0, 4, 7]);
    if (med > 0){ const dm = notes[med].deg; chordAt_(times[med][0], chance(.5) ? [dm - 2, dm, dm + 2] : [0, 4, 7]); }
    if (N > 3) chordAt_(times[N - 2][0], [0, 4, 7]);
    at(end + P * .9, (tt) => { if (!SEC || SEC.i === 0 || chance(.4)){ organHeld.forEach(v => v && v.release(tt)); organHeld = []; } });
  }
  if (on('bas') && wieloBas){
    const patch = BASS_PATCHES[L.bas.inst] || BASS_PATCHES.gleboki, bm = fin - 12;
    at(t0 - .05, (tt) => { if (bassHeld) bassHeld.off(tt + .1); bassHeld = synthNote(wieloBas, patch, mtof(bm), {when: tt, vel: .5 + M.zar * .4}); });
    const med = line.mediant >= 0 ? notes.findIndex(n => n.si > line.mediant) : Math.floor(N * .55);
    if (med > 0 && chance(.6)) at(times[med][0], (tt) => { if (bassHeld) bassHeld.bend(mtof(degMidi(md, fin, pick([4, 3, -3, 2]), false) - 12), tt, .25); });
    if (N > 2) at(times[N - 2][0], (tt) => { if (bassHeld) bassHeld.bend(mtof(bm), tt, .3); });
  }
  if (on('pad') && wieloPad && (SEC.i === 0 || chance(.45))){
    const patch = PAD_PATCHES[L.pad.inst] || PAD_PATCHES.wydmy;
    at(t0, (tt) => { padHeld.forEach(v => v.off(tt + .5)); padHeld = [];
      const degs = pick([[0, 4, 8], [0, 4, 9], [0, 2, 4, 7], [0, 4, 7, 11], [-3, 0, 4]]).slice(0, PERF.lite ? 3 : 4);
      for (const d of degs) padHeld.push(synthNote(wieloPad, patch, mtof(degMidi(md, fin, d, isB(md, d) && md.bflat > .5) + 12), {when: tt + rnd(0, .4), vel: .5, pan: rnd(-.5, .5)})); });
  }
}
// sing a line with one section of the choir, like one breath: the same vowel stays one sound that glides from
// note to note; a new vowel crossfades in (~0.1 s, like a singer changing the mouth shape); a sample that runs
// out hands over to a fresh one under a long crossfade; consonants (optional) are laid between the vowels.
function singLine(role, key, pitches, notes, times, line, o = {}){
  const from = o.from ?? 0, bus = ch(role), cons = S.cons !== 'brak';
  let prevSi = -1;
  for (let j = from; j < notes.length; j++){
    const n = notes[j], [t, d] = times[j], sy = line.syl[n.si], newSyl = n.si !== prevSi, first = j === from;
    if (cons && newSyl && !first){ const prev = line.syl[prevSi]; if (prev && prev.coda) at(t - .07, (tt) => consonant(prev.coda, tt, bus, .9 * (o.gain ?? 1), o.high)); }
    if (cons && newSyl && sy.onset) at(t - .045, (tt) => consonant(sy.onset, tt, bus, (first ? 1.1 : .95) * (o.gain ?? 1), o.high));
    const m = pitches[j], vel = .5 + M.zar * .25 + (sy.acc ? .08 : 0);
    at(t, (tt) => {
      const cur = LINE[role], v0 = cur && cur[0];
      const alive = !first && v0 && v0.alive;
      if (alive && v0.vowel === sy.vowel && v0.canGlide(m) && !v0.endsBy(tt + d)){
        // same vowel: keep the sound, just move the pitch (and a tiny articulation on a new syllable with consonants)
        const offs = cur.map(v => v.m - v0.m); cur.forEach((v, i) => v.glide(m + offs[i], tt, newSyl ? .03 : .02));
        if (cons && newSyl && /[mnlrbdgptkcqv]/.test((sy.onset || '') + (line.syl[n.si - 1]?.coda || ''))) cur.forEach(v => v.dip(tt - .02, .5, .1));
        else if (newSyl && sy.acc) cur.forEach(v => v.dip(tt - .01, .85, .14));   // accent: a small push of breath
        return;
      }
      // new sound: crossfade from the old one (vowel change, too far to glide, or the sample is ending)
      const xf = !alive ? .09 : v0.vowel !== sy.vowel ? .1 : .16;
      const mk = (dm, g, dt) => choirNote(key, sy.vowel, m + dm, {when: tt + dt, vel, gain: g * (o.gain ?? 1), bus, legato: alive, xfade: xf, attack: .1, drift: key === 'dzieci' ? 3 : 6, fromM: alive ? v0.m : undefined});
      const nv = []; const v1 = mk(0, 1, 0); if (v1) nv.push(v1);
      if (o.double){ const v2 = mk(rnd(-.08, .08), .7, rnd(.01, .03)); if (v2) nv.push(v2); }
      if (cur) cur.forEach(v => v && v.release(tt + (alive ? xf * .5 : .02), alive ? xf * .5 : .06));
      LINE[role] = nv;
    });
    prevSi = n.si;
  }
  const [tl, dl] = times[notes.length - 1];
  at(tl + dl, (tt) => { if (LINE[role]) LINE[role].forEach(v => v && v.release(tt, .18)); LINE[role] = null; const sy = line.syl[notes[notes.length - 1].si]; if (cons && sy.coda) consonant(sy.coda, tt - .02, bus, .7, o.high); });
}
function sanctusBells(t, md, fin){
  const base = degMidi(md, fin, 0, false) + 24, n = Math.floor(rnd(3, 7));
  for (let i = 0; i < n; i++) at(t + i * rnd(.07, .14), (tt) => melodicHit('dzwonki_reczne', base + pick([0, 2, 4, 7, 12]), {when: tt, vel: rnd(.3, .7), bus: ch('dzwony'), gain: .55}));
}
function interlude(t){
  const md = SEC.mode, fin = SEC.fin, len = 3 + M.pust * 7;
  if (on('dzwony') && ['dzwonnica', 'mieszane'].includes(L.dzwony.inst)){
    const degs = [7, 4, 2, 0, -3], k = Math.floor(rnd(2, 4));
    for (let r = 0; r < k; r++) degs.forEach((d, i) => at(t + r * 2.6 + i * .52 + rnd(0, .05), (tt) => towerBell(mtof(degMidi(md, fin, d, false)), {when: tt, vel: rnd(.5, .8), bus: ch('dzwony'), size: .7 + (4 - i) * .12, pan: -.5 + i * .25})));
  } else if (on('dzwony')) at(t, (tt) => hit('gong', null, {when: tt, gain: .55, bus: ch('dzwony')}));
  if (on('lancuchy')) at(t + rnd(.5, 2), (tt) => hit('lancuchy', pick(['upadek', 'wleczenie']), {when: tt, gain: .8, bus: ch('lancuchy'), pan: rnd(-.5, .5)}));
  if (on('semantron') && !(S.pat.semantron || '').trim()) semantronCall(t + len * .4);
  if (on('organy') && !ownChords()) at(t + .2, (tt) => { organHeld.forEach(v => v && v.release(tt + len * .6)); organHeld = []; });
  return t + len + (on('semantron') ? 3 : 0);
}
function semantronCall(t){
  let tt = t, gap = .62;
  for (let i = 0; i < 9; i++){ at(tt, (x) => semantron({when: x, pos: .5 + rnd(-.1, .1), vel: .6 + i * .03, bus: ch('semantron')})); tt += gap; gap *= .88; }
  for (const f of [0, .14, .28, .56, .7, .84, 1.12]) at(tt + f, (x) => semantron({when: x, pos: f % .28 === 0 ? .3 : .75, vel: .7, bus: ch('semantron')}));
}
let censerT = null;
function censerLoop(){
  if (censerT) clearTimeout(censerT);
  const step = () => { if (!playing) return; if (on('kadzielnica')){ const t = ctx.currentTime + .1;
      hit('lancuchy', 'kadzielnica', {when: t, gain: .55, bus: ch('kadzielnica'), pan: rnd(-.4, .4)});
      if (chance(.6)) hit('dzwoneczki_kadzielnicy', null, {when: t + rnd(.3, 1.2), gain: .25, bus: ch('kadzielnica'), pan: rnd(-.5, .5)}); }
    censerT = setTimeout(step, rnd(3.3, 4.2) * 1000); };
  step();
}
async function loadNeeded(){
  const need = new Set();
  if (on('mnisi')) need.add(L.mnisi.inst === 'bas' ? 'bas' : 'schola');
  if (on('ison')) need.add('bas');
  if (on('dzieci')) need.add('dzieci');
  if (on('organy')){ need.add(L.organy.inst); need.add('organy_pedal'); }
  if (on('dzwony')){ need.add('dzwonki_reczne'); need.add('dzwony_rurowe'); if (!PERF.lite) need.add('dzwony_rurowe_stare'); need.add('gong'); need.add('dzwonki_tybetanskie'); need.add('cymbalki'); }
  if (on('lancuchy') || on('kadzielnica')) need.add('lancuchy');
  if (on('kadzielnica')) need.add('dzwoneczki_kadzielnicy');
  if (on('beben')) need.add('beben');
  const choirs = new Set(['schola', 'bas', 'dzieci']);
  await Promise.all([...need].map(k => loadInst(k, choirs.has(k) ? (l => l.endsWith('_mf') || (M.zar > .62 && k !== 'dzieci' && !PERF.lite)) : null)));
}
