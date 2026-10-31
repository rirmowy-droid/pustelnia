// The monastery: sections (a text sung line by line), phrases built by the chant generator, and the players –
// schola, ison / organum, children, organ, synth bass through the tube amp, pads, bells, chains, censer,
// semantron and the desert wind. Every setting in S, L and AMP is read live.
'use strict';
const S = {text: 'pustynia', textMode: 'kolejno', mode: 1, modeMode: 'stały', shift: 0, tempo: 150, style: 'mieszany', kids: 'alternatim'};
const LAYER_DEF = [
  {id: 'mnisi', name: 'Mnisi (schola)', opts: [['schola', 'Schola – basy i tenory razem'], ['schola2', 'Wielka schola (podwójny chór)'], ['bas', 'Same basy (ciemno)']], def: 'schola', vol: .85},
  {id: 'ison', name: 'Ison / organum', opts: [['ison', 'Ison – trzymany ton (bizantyjski)'], ['organum4', 'Organum – kwarta niżej'], ['organum5', 'Organum – kwinta niżej'], ['oktawa', 'Basy oktawę niżej']], def: 'ison', vol: .6},
  {id: 'dzieci', name: 'Chór dziecięcy', opts: [['alternatim', 'Na przemian z mnichami'], ['oktawa', 'Razem z mnichami, oktawę wyżej'], ['odpowiedzi', 'Odpowiedzi na końcach fraz'], ['wysoki', 'Wysoki trzymany ton']], def: 'alternatim', vol: .6},
  {id: 'organy', name: 'Organy', opts: [['organy_ciche', 'Ciche (flety)'], ['pozytyw_8', 'Pozytyw 8′ (renesansowe)'], ['pozytyw_pelny', 'Pozytyw pełny'], ['organy_pleno', 'Plenum (pełne)']], def: 'organy_ciche', vol: .65},
  {id: 'bas', name: 'Bas syntezatorowy', opts: Object.entries(BASS_PATCHES).map(([k, v]) => [k, v.name]), def: 'gleboki', vol: .45},
  {id: 'pad', name: 'Syntezatory (tło)', opts: Object.entries(PAD_PATCHES).map(([k, v]) => [k, v.name]), def: 'wydmy', vol: .7},
  {id: 'dzwony', name: 'Dzwony', opts: [['mieszane', 'Wszystkie (dzwonnica, sygnaturka, rurowe)'], ['dzwonnica', 'Dzwonnica (wielkie dzwony)'], ['sygnaturka', 'Sygnaturka i dzwonki ręczne'], ['rurowe', 'Dzwony rurowe'], ['tybet', 'Dzwonki z Nepalu i gong']], def: 'mieszane', vol: .55},
  {id: 'lancuchy', name: 'Łańcuchy', opts: [['rzadko', 'Rzadkie uderzenia'], ['czesto', 'Częste uderzenia i wleczenie']], def: 'rzadko', vol: .7},
  {id: 'kadzielnica', name: 'Kadzielnica', opts: [['tak', 'Kołysanie na łańcuszkach z dzwoneczkami']], def: 'tak', vol: .35, on: false},
  {id: 'semantron', name: 'Semantron (kołatka)', opts: [['tak', 'Drewniana deska – wezwanie na modlitwę']], def: 'tak', vol: .5},
  {id: 'wiatr', name: 'Wiatr pustyni', opts: [['tak', 'Wiatr, piasek, świst w skałach']], def: 'tak', vol: .35},
];
const L = {};
for (const d of LAYER_DEF) L[d.id] = {on: d.on ?? true, inst: d.def, vol: d.vol};
const AMP = {on: true, gain: .45, master: .55, bass: .55, mid: .6, treble: .5, presence: .3, nfb: 0, rect: 1, noise: 3, level: 1.2, cab: 'kol_4x12_57', stack: 'marshall', channel: 0, seed: 1};
const volCurve = v => v * v * 1.6;
try { const sv = JSON.parse(localStorage.getItem('pu_state') || 'null'); if (sv){ Object.assign(S, sv.S || {}); for (const k in sv.L || {}) if (L[k]) Object.assign(L[k], sv.L[k]); Object.assign(AMP, sv.AMP || {}); } } catch (e){}
function saveState(){ try { localStorage.setItem('pu_state', JSON.stringify({S, L, AMP})); } catch (e){} }

// ======================= helpers =======================
const FIN = {2: 50, 4: 52, 5: 53, 7: 55};       // natural finalis for men: D3, E3, F3, G3
const modeOf = id => MODES.find(m => m.id === id) || MODES[0];
const on = id => L[id].on;
const ch = id => channelIn(id);

// ======================= section / phrase state =======================
let SEC = null, playing = false, timer = null, nextAt = 0, Q = [], phraseNo = 0, textCycle = 0;
let lastVoices = {mnisi: [], ison: [], dzieci: []}, organHeld = [], bassHeld = null, padHeld = [];
function newSection(){
  let tx = TEXTS.find(t => t.id === S.text) || TEXTS[0];
  if (S.textMode === 'kolejno' && SEC){ textCycle = (TEXTS.indexOf(tx) + 1 + (SEC ? 0 : 0)) % TEXTS.length; tx = TEXTS[textCycle]; S.text = tx.id; syncTextUI(); }
  else if (S.textMode === 'losowo' && SEC){ tx = pick(TEXTS.filter(t => t.id !== SEC.text.id)); S.text = tx.id; syncTextUI(); }
  let mode = S.mode;
  if (S.modeMode === 'losowy' && SEC) mode = pick(MODES).id;
  const md = modeOf(mode), fin = FIN[md.pc] + S.shift + (md.amb[1] >= 9 ? -2 : 0);
  SEC = {text: tx, lines: parseText(tx.lines), i: 0, mode: md, fin, psalm: S.style === 'psalmodia' || (S.style === 'mieszany' && chance(.4))};
  showNow();
}
const lineFlat = (n) => n.flat;
function pulse(){ return 60 / S.tempo * (.92 + M.pust * .2); }

// ======================= scheduling =======================
function at(t, fn){ Q.push({t, fn}); }
function startEngine(){
  if (playing) return; playing = true; Q = []; SEC = null; newSection(); nextAt = ctx.currentTime + .3; phraseNo = 0;
  if (on('semantron')) semantronCall(nextAt); nextAt += on('semantron') ? 4.2 : 0;
  startWind(); censerLoop();
  timer = setInterval(tick, 60); tick();
}
function stopEngine(){
  playing = false; clearInterval(timer); timer = null; Q = [];
  const t = ctx.currentTime;
  for (const k in lastVoices){ lastVoices[k].forEach(v => v && v.release(t, .3)); lastVoices[k] = []; }
  organHeld.forEach(v => v.release(t)); organHeld = []; if (bassHeld){ bassHeld.off(t); bassHeld = null; } padHeld.forEach(v => v.off(t)); padHeld = [];
  if (wieloBas) wieloBas.port.postMessage({type: 'panic'}); if (wieloPad) wieloPad.port.postMessage({type: 'panic'});
}
function tick(){
  if (!playing) return; const now = ctx.currentTime;
  while (nextAt < now + 1.2){ nextAt = phrase(nextAt); }
  Q.sort((a, b) => a.t - b.t);
  while (Q.length && Q[0].t < now + .3){ const e = Q.shift(); try { e.fn(Math.max(e.t, now + .005)); } catch (err){ console.error(err); } }
}

// ======================= one phrase =======================
function phrase(t0){
  if (!SEC || SEC.i >= SEC.lines.length){ const wasSec = !!SEC; if (wasSec) t0 = interlude(t0); newSection(); }
  const md = SEC.mode, fin = SEC.fin, line = SEC.lines[SEC.i], li = SEC.i, last = li === SEC.lines.length - 1;
  const kind = SEC.psalm ? 'psalm' : (S.style === 'mieszany' && chance(.25) ? 'psalm' : 'arch');
  const notes = makePhrase(md, line, {density: M.gest * .85, kind, end: last || chance(.55) ? 'final' : 'half'});
  const P = pulse(), N = notes.length;
  // free rhythm: a little faster in the middle of the line, slower into the cadence
  const times = []; let tt = t0;
  for (let j = 0; j < N; j++){
    const x = N > 1 ? j / (N - 1) : 1, rub = 1.05 - .12 * Math.sin(Math.PI * x) + (x > .8 ? (x - .8) * .9 : 0);
    const d = notes[j].dur * P * rub * rnd(.95, 1.06);
    times.push([tt, d]); tt += d;
  }
  const end = tt;
  const kidsMode = on('dzieci') ? L.dzieci.inst : 'brak';
  const kidsSing = kidsMode === 'alternatim' ? (li % 2 === 1) : false;
  const menSing = on('mnisi') && !(kidsSing && kidsMode === 'alternatim');
  const melKey = L.mnisi.inst === 'bas' ? 'bas' : 'schola';
  const mel = notes.map(n => degMidi(md, fin, n.deg, n.flat));
  at(t0, () => showLine(line, li));
  notes.forEach((n, j) => { if (n.first) at(times[j][0], (tt) => hlSyl(n.si, tt)); });
  // ---- melody: men
  if (menSing) singLine('mnisi', melKey, mel, notes, times, line, {gain: L.mnisi.inst === 'schola2' ? .8 : 1, double: L.mnisi.inst === 'schola2'});
  // ---- children
  if (on('dzieci')){
    if (kidsSing || kidsMode === 'oktawa') singLine('dzieci', 'dzieci', mel.map(m => m + 12), notes, times, line, {gain: kidsMode === 'oktawa' ? .7 : 1, high: true});
    else if (kidsMode === 'odpowiedzi'){ const k0 = Math.max(0, notes.findIndex(n => n.si >= line.syl.length - 2)); singLine('dzieci', 'dzieci', mel.map(m => m + 12), notes, times, line, {from: k0, gain: .9, high: true}); }
    else if (kidsMode === 'wysoki'){ const hm = degMidi(md, fin, md.tenor, false) + 12; singLine('dzieci', 'dzieci', notes.map(() => hm), notes, times, line, {gain: .55, high: true, hold: true}); }
  }
  // ---- ison / organum (the basses)
  if (on('ison') && (menSing || kidsSing)){
    const v = L.ison.inst;
    if (v === 'ison'){ const im = SEC.psalm && chance(.3) ? degMidi(md, fin, md.tenor, false) - 12 * (degMidi(md, fin, md.tenor, false) > 56 ? 1 : 0) : fin;
      singLine('ison', 'bas', notes.map(() => im), notes, times, line, {gain: .75, hold: true}); }
    else if (v === 'oktawa') singLine('ison', 'bas', mel.map(m => m - 12 >= 45 ? m - 12 : m), notes, times, line, {gain: .7});
    else singLine('ison', 'bas', organumLine(md, fin, notes, v === 'organum5' ? 7 : 5), notes, times, line, {gain: .75});
  }
  // ---- organ: open fifth on the finalis, a chord of the mode at the mediant, back to the finalis at the end
  if (on('organy')){
    const k = L.organy.inst, g = .9, med = line.mediant >= 0 ? notes.findIndex(n => n.si > line.mediant) : -1;
    const chordAt = (t, degs, dur) => at(t, (tt) => { organHeld.forEach(v => v.release(tt + .05)); organHeld = [];
      for (const d of degs){ const m = degMidi(md, fin, d, isB(md, d) && md.bflat > .5) + 12; organHeld.push(organNote(k, m, {when: tt, bus: ch('organy'), gain: g / Math.sqrt(degs.length)})); }
      const pm = fin - 12; if (MAN.organy_pedal) organHeld.push(organNote('organy_pedal', pm >= 36 ? pm : pm + 12, {when: tt, bus: ch('organy'), gain: .55}));
      organHeld = organHeld.filter(Boolean); });
    chordAt(t0, [0, 4, 7], 0);
    if (med > 0){ const dm = notes[med].deg; chordAt(times[med][0], chance(.5) ? [dm - 2, dm, dm + 2].map(x => x) : [0, 4, 7], 0); }
    if (N > 3) chordAt(times[N - 2][0], [0, 4, 7], 0);
    at(end + P * .9, (tt) => { if (!SEC || SEC.i === 0 || chance(.4)){ organHeld.forEach(v => v.release(tt)); organHeld = []; } });
  }
  // ---- synth bass (through the tube amp): the finalis an octave or two below, a move to the fifth at the mediant
  if (on('bas') && wieloBas){
    const patch = BASS_PATCHES[L.bas.inst] || BASS_PATCHES.gleboki, bm = fin - 12;
    at(t0 - .05, (tt) => { if (bassHeld) bassHeld.off(tt + .1); bassHeld = synthNote(wieloBas, patch, mtof(bm), {when: tt, vel: .5 + M.zar * .4}); });
    const med = line.mediant >= 0 ? notes.findIndex(n => n.si > line.mediant) : Math.floor(N * .55);
    if (med > 0 && chance(.6)) at(times[med][0], (tt) => { if (bassHeld) bassHeld.bend(mtof(degMidi(md, fin, pick([4, 3, -3, 2]), false) - 12), tt, .25); });
    if (N > 2) at(times[N - 2][0], (tt) => { if (bassHeld) bassHeld.bend(mtof(bm), tt, .3); });
  }
  // ---- pads: a slowly changing open chord of the mode
  if (on('pad') && wieloPad && (li === 0 || chance(.45))){
    const patch = PAD_PATCHES[L.pad.inst] || PAD_PATCHES.wydmy;
    at(t0, (tt) => { padHeld.forEach(v => v.off(tt + .5)); padHeld = [];
      const degs = pick([[0, 4, 8], [0, 4, 9], [0, 2, 4, 7], [0, 4, 7, 11], [-3, 0, 4]]);
      for (const d of degs) padHeld.push(synthNote(wieloPad, patch, mtof(degMidi(md, fin, d, isB(md, d) && md.bflat > .5) + 12), {when: tt + rnd(0, .4), vel: .5, pan: rnd(-.5, .5)})); });
  }
  // ---- bells at the start of the phrase, small bells at the cadence
  if (on('dzwony')){
    const st = L.dzwony.inst;
    if ((st === 'dzwonnica' || st === 'mieszane') && (li === 0 || chance(.25 + M.gest * .3))) at(t0, (tt) => towerBell(mtof(fin), {when: tt, vel: .7, bus: ch('dzwony'), size: 1.2, pan: -.2}));
    if ((st === 'rurowe' || st === 'mieszane') && chance(.3 + M.gest * .3)) at(t0 + P * rnd(0, 2), (tt) => melodicHit(pick(['dzwony_rurowe', 'dzwony_rurowe_stare']), degMidi(md, fin, pick([0, 4, 7]), false) + 12, {when: tt, vel: rnd(.4, .8), bus: ch('dzwony'), gain: .8}));
    if ((st === 'sygnaturka' || st === 'mieszane') && chance(.35 + M.gest * .35)) sanctusBells(times[N - 1][0], md, fin);
    if (st === 'tybet' && chance(.5)) at(end - P, (tt) => hit(pick(['dzwonki_tybetanskie', 'cymbalki']), null, {when: tt, gain: .6, bus: ch('dzwony'), pan: rnd(-.6, .6)}));
    if (st === 'tybet' && last) at(end, (tt) => hit('gong', null, {when: tt, gain: .5, bus: ch('dzwony')}));
  }
  // ---- chains at the end of a phrase
  if (on('lancuchy') && chance((L.lancuchy.inst === 'czesto' ? .55 : .22) + M.gest * .2)) at(end - P * rnd(.2, 1), (tt) => hit('lancuchy', pick(['uderzenie', 'uderzenie', 'grzechot']), {when: tt, gain: rnd(.5, .9), bus: ch('lancuchy'), pan: rnd(-.7, .7)}));
  SEC.i++; phraseNo++;
  // breath between lines; longer with "Pustka"
  return end + P * (1.2 + M.pust * 3.5) * rnd(.85, 1.2);
}
// sing a line with one section of the choir: legato between notes, consonants between syllables
function singLine(role, key, pitches, notes, times, line, o = {}){
  const from = o.from ?? 0, bus = ch(role);
  let prevSi = -1;
  for (let j = from; j < notes.length; j++){
    const n = notes[j], [t, d] = times[j], sy = line.syl[n.si], newSyl = n.si !== prevSi, first = j === from;
    // hold: the same pitch through the whole line -> only re-articulate the vowel on a new syllable
    if (o.hold && !newSyl && !first) { prevSi = n.si; continue; }
    if (newSyl && !first){ const prev = line.syl[prevSi]; if (prev && prev.coda) at(t - .07, (tt) => consonant(prev.coda, tt, bus, .9 * (o.gain ?? 1), o.high)); }
    if (newSyl && sy.onset) at(t - .045, (tt) => consonant(sy.onset, tt, bus, (first ? 1.1 : .95) * (o.gain ?? 1), o.high));
    const m = pitches[j], vel = .5 + M.zar * .25 + (sy.acc ? .08 : 0);
    at(t, (tt) => {
      const old = lastVoices[role]; lastVoices[role] = [];
      const legato = !first && old.length && old[0]?.alive;
      const mk = (dm, g, dt) => choirNote(key, sy.vowel, m + dm, {when: tt + dt, vel, gain: g * (o.gain ?? 1), bus, legato, xfade: newSyl ? .06 : .045, attack: .11, drift: key === 'dzieci' ? 3 : 6});
      const v1 = mk(0, 1, 0); if (v1) lastVoices[role].push(v1);
      if (o.double){ const v2 = mk(rnd(-.08, .08), .7, rnd(.01, .03)); if (v2) lastVoices[role].push(v2); }
      old.forEach(v => v && v.release(tt + (legato ? .05 : .02), legato ? .03 : .06));
      if (newSyl && !first && /[mnlr]/.test((line.syl[n.si].onset || '') + (line.syl[n.si - 1]?.coda || ''))) lastVoices[role].forEach(v => v.dip(tt, .55, .09));
    });
    prevSi = n.si;
  }
  // last note: let it ring and fade with the breath
  const [tl, dl] = times[notes.length - 1];
  at(tl + dl, (tt) => { lastVoices[role].forEach(v => v && v.release(tt, .18)); lastVoices[role] = []; const sy = line.syl[notes[notes.length - 1].si]; if (sy.coda) consonant(sy.coda, tt - .02, bus, .7, o.high); });
}
// sanctus bells: a quick shake of several small bells
function sanctusBells(t, md, fin){
  const base = degMidi(md, fin, 0, false) + 24, n = Math.floor(rnd(3, 7));
  for (let i = 0; i < n; i++) at(t + i * rnd(.07, .14), (tt) => melodicHit('dzwonki_reczne', base + pick([0, 2, 4, 7, 12]), {when: tt, vel: rnd(.3, .7), bus: ch('dzwony'), gain: .55}));
}
// between sections: bells pealing, chains, the semantron calling, a long silence of the desert
function interlude(t){
  const md = SEC.mode, fin = SEC.fin, len = 3 + M.pust * 7;
  if (on('dzwony') && ['dzwonnica', 'mieszane'].includes(L.dzwony.inst)){
    const degs = [7, 4, 2, 0, -3], k = Math.floor(rnd(2, 4));     // rounds: the bells ring down the scale
    for (let r = 0; r < k; r++) degs.forEach((d, i) => at(t + r * 2.6 + i * .52 + rnd(0, .05), (tt) => towerBell(mtof(degMidi(md, fin, d, false)), {when: tt, vel: rnd(.5, .8), bus: ch('dzwony'), size: .7 + (4 - i) * .12, pan: -.5 + i * .25})));
  } else if (on('dzwony')) at(t, (tt) => hit('gong', null, {when: tt, gain: .55, bus: ch('dzwony')}));
  if (on('lancuchy')) at(t + rnd(.5, 2), (tt) => hit('lancuchy', pick(['upadek', 'wleczenie']), {when: tt, gain: .8, bus: ch('lancuchy'), pan: rnd(-.5, .5)}));
  if (on('semantron')) semantronCall(t + len * .4);
  if (on('organy')) at(t + .2, (tt) => { organHeld.forEach(v => v.release(tt + len * .6)); organHeld = []; });
  return t + len + (on('semantron') ? 3 : 0);
}
// the semantron rhythm: slow strokes that speed up, then a running figure
function semantronCall(t){
  let tt = t, gap = .62;
  for (let i = 0; i < 9; i++){ at(tt, (x) => semantron({when: x, pos: .5 + rnd(-.1, .1), vel: .6 + i * .03, bus: ch('semantron')})); tt += gap; gap *= .88; }
  for (const f of [0, .14, .28, .56, .7, .84, 1.12]) at(tt + f, (x) => semantron({when: x, pos: f % .28 === 0 ? .3 : .75, vel: .7, bus: ch('semantron')}));
}
// the censer swings on its chains all the time it is on
let censerT = null;
function censerLoop(){
  if (censerT) clearTimeout(censerT);
  const step = () => { if (!playing) return; if (on('kadzielnica')){ const t = ctx.currentTime + .1;
      hit('lancuchy', 'kadzielnica', {when: t, gain: .55, bus: ch('kadzielnica'), pan: rnd(-.4, .4)});
      if (chance(.6)) hit('dzwoneczki_kadzielnicy', null, {when: t + rnd(.3, 1.2), gain: .25, bus: ch('kadzielnica'), pan: rnd(-.5, .5)}); }
    censerT = setTimeout(step, rnd(3.3, 4.2) * 1000); };
  step();
}
// what's needed for the layers that are on
async function loadNeeded(){
  const need = new Set();
  if (on('mnisi')) need.add(L.mnisi.inst === 'bas' ? 'bas' : 'schola');
  if (on('ison')) need.add('bas');
  if (on('dzieci')) need.add('dzieci');
  if (on('organy')){ need.add(L.organy.inst); need.add('organy_pedal'); }
  if (on('dzwony')){ need.add('dzwonki_reczne'); need.add('dzwony_rurowe'); need.add('dzwony_rurowe_stare'); need.add('gong'); need.add('dzwonki_tybetanskie'); need.add('cymbalki'); }
  if (on('lancuchy') || on('kadzielnica')) need.add('lancuchy');
  if (on('kadzielnica')) need.add('dzwoneczki_kadzielnicy');
  // choirs: the mezzo-forte layer always, forte only when the music burns hot (saves phone memory)
  const choirs = new Set(['schola', 'bas', 'dzieci']);
  await Promise.all([...need].map(k => loadInst(k, choirs.has(k) ? (l => l.endsWith('_mf') || (M.zar > .62 && k !== 'dzieci')) : null)));
}
