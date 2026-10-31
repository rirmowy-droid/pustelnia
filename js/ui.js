// Controls: texts, modes, tempo, layers, the bass amp, play / stop, mixer view, the sung line on screen.
'use strict';
for (const t of TEXTS) $('text').appendChild(new Option(t.name, t.id));
for (const m of MODES) $('mode').appendChild(new Option(m.name, m.id));
$('text').value = S.text; $('textMode').value = S.textMode; $('style').value = S.style; $('mode').value = S.mode; $('modeMode').value = S.modeMode;
$('shift').value = S.shift; $('tempo').value = S.tempo;
const shiftTxt = () => { $('shiftVal').textContent = (S.shift > 0 ? '+' : '') + S.shift + ' półt.'; };
const tempoTxt = () => { $('tempoVal').textContent = S.tempo + ' nut na minutę'; };
shiftTxt(); tempoTxt();
$('text').onchange = () => { S.text = $('text').value; saveState(); if (playing && SEC) SEC.i = SEC.lines.length; };   // next line starts the new text
$('textMode').onchange = () => { S.textMode = $('textMode').value; saveState(); };
$('style').onchange = () => { S.style = $('style').value; saveState(); };
$('mode').onchange = () => { S.mode = +$('mode').value; saveState(); if (playing && SEC){ SEC.mode = modeOf(S.mode); SEC.fin = FIN[SEC.mode.pc] + S.shift + (SEC.mode.amb[1] >= 9 ? -2 : 0); showNow(); } };
$('modeMode').onchange = () => { S.modeMode = $('modeMode').value; saveState(); };
$('shift').oninput = () => { S.shift = +$('shift').value; shiftTxt(); saveState(); if (playing && SEC) SEC.fin = FIN[SEC.mode.pc] + S.shift + (SEC.mode.amb[1] >= 9 ? -2 : 0); };
$('tempo').oninput = () => { S.tempo = +$('tempo').value; tempoTxt(); saveState(); };
function syncTextUI(){ $('text').value = S.text; }
function showNow(){ if (!SEC) return; $('sec').textContent = SEC.text.name; $('modeTag').textContent = 'modus ' + SEC.mode.name + (SEC.psalm ? ' · psalmodia' : ''); }
function showLine(line, li){
  const d = Math.max(0, (Q.length ? 0 : 0)); const el = $('line'); el.innerHTML = '';
  let w = -1;
  line.syl.forEach((sy, i) => { if (sy.word !== w && i){ el.appendChild(document.createTextNode(' ')); } w = sy.word;
    const sp = document.createElement('span'); sp.textContent = sy.txt + (sy.wordEnd ? sy.punct : ''); if (sy.acc) sp.className = 'acc'; sp.dataset.i = i; el.appendChild(sp);
    if (!sy.wordEnd) el.appendChild(document.createTextNode('-')); });
}
function hlSyl(si, t){ setTimeout(() => { document.querySelectorAll('#line span.on').forEach(x => x.classList.remove('on')); const sp = document.querySelector(`#line span[data-i="${si}"]`); if (sp) sp.classList.add('on'); }, Math.max(0, (t - ctx.currentTime) * 1000)); }
// ---------- layers ----------
function buildLayers(){
  const box = $('layers'); box.innerHTML = '';
  for (const d of LAYER_DEF){
    const st = L[d.id], row = document.createElement('div'); row.className = 'layer';
    const head = document.createElement('div'); head.className = 'lhead';
    const tog = document.createElement('button'); tog.className = 'tog' + (st.on ? ' on' : ''); tog.textContent = d.name;
    tog.onclick = async () => { st.on = !st.on; tog.classList.toggle('on', st.on); saveState(); if (d.id === 'wiatr') applyWind(); if (st.on && ctx) await loadNeeded(); };
    head.appendChild(tog);
    if (d.opts.length > 1){ const sel = document.createElement('select'); for (const [v, n] of d.opts) sel.appendChild(new Option(n, v)); sel.value = st.inst;
      sel.onchange = async () => { st.inst = sel.value; saveState(); if (ctx) await loadNeeded(); }; head.appendChild(sel); }
    else { const s = document.createElement('span'); s.className = 'note'; s.style.margin = 0; s.textContent = d.opts[0][1]; head.appendChild(s); }
    const vol = document.createElement('input'); vol.type = 'range'; vol.className = 'lvol'; vol.min = 0; vol.max = 100; vol.value = Math.round(st.vol * 100); vol.dataset.layervol = d.id;
    vol.oninput = () => { st.vol = vol.value / 100; if (ctx) applyChannel(d.id); saveState(); };
    row.append(head, vol); box.appendChild(row);
  }
}
buildLayers();
// ---------- the bass amp ----------
function buildAmpUI(){
  const box = $('ampBox'); box.innerHTML = '';
  const tog = document.createElement('button'); tog.className = 'tog' + (AMP.on ? ' on' : ''); tog.textContent = AMP.on ? 'Wzmacniacz włączony' : 'Wzmacniacz wyłączony (czysto)';
  tog.onclick = () => { AMP.on = !AMP.on; tog.classList.toggle('on', AMP.on); tog.textContent = AMP.on ? 'Wzmacniacz włączony' : 'Wzmacniacz wyłączony (czysto)'; saveState(); if (ctx) applyAmp(); };
  const wrap = document.createElement('div'); wrap.className = 'fld full'; wrap.appendChild(tog); box.appendChild(wrap);
  const sl = (key, label, min, max, step, fmt, rebuild) => { const w = mxSlider(label, min, max, step, AMP[key], fmt, v => { AMP[key] = v; saveState(); if (ctx){ rebuild ? rebuildAmp() : applyAmp(); } }); box.appendChild(w); };
  sl('gain', 'Gain (przester przedwzmacniacza)', 0, 1, .01, fmtPct); sl('master', 'Master (przester lamp mocy)', 0, 1, .01, fmtPct);
  sl('level', 'Siła sygnału na wejściu', .2, 3, .01, v => v.toFixed(2) + '×');
  sl('bass', 'Bas', 0, 1, .01, fmtPct); sl('mid', 'Środek', 0, 1, .01, fmtPct); sl('treble', 'Góra', 0, 1, .01, fmtPct); sl('presence', 'Presence', 0, 1, .01, fmtPct);
  sl('noise', 'Szum lamp', 0, 10, .1, v => v.toFixed(1) + '×');
  const sel = (key, label, opts, rebuild) => { const w = document.createElement('label'); w.className = 'fld'; w.textContent = label; const s = document.createElement('select');
    for (const [v, n] of opts) s.appendChild(new Option(n, v)); s.value = String(AMP[key]); s.onchange = () => { AMP[key] = isNaN(+s.value) ? s.value : +s.value; saveState(); if (ctx){ rebuild ? rebuildAmp() : applyAmp(); } }; w.appendChild(s); box.appendChild(w); };
  sel('rect', 'Prostownik', [[1, 'Lampowy GZ34 (ugina się)'], [2, 'Lampowy 5U4 (mocno się ugina)'], [0, 'Krzemowy (twardy)']], true);
  sel('stack', 'Barwa', [['marshall', 'Brytyjska (mocny środek)'], ['fender', 'Amerykańska (wycięty środek)']], true);
  sel('channel', 'Kanał', [[0, 'Vintage – 2 stopnie'], [1, 'Gorący – 3 stopnie']], true);
  sel('cab', 'Kolumna', [['kol_4x12_57', '4×12 zamknięta + mikrofon dynamiczny'], ['kol_2x12_open_wst', '2×12 otwarta + mikrofon wstęgowy'], ['kol_1x12_open_sosna_poj', '1×12 sosnowa + mikrofon pojemnościowy']], true);
}
buildAmpUI();
// ---------- play ----------
$('playBtn').onclick = async () => {
  const b = $('playBtn');
  if (playing){ stopEngine(); b.classList.remove('on'); b.textContent = '▶'; return; }
  b.disabled = true;
  try {
    await initAudio(); if (ctx.state === 'suspended') await ctx.resume();
    await loadNeeded(); startEngine(); b.classList.add('on'); b.textContent = '■';
  } catch (e){ console.error(e); $('status').textContent = 'Nie udało się uruchomić dźwięku: ' + e.message; }
  b.disabled = false;
};
$('viewBtn').onclick = async () => {
  const mx = $('mixer'), show = !mx.classList.contains('show');
  if (show){ if (!ctx) await initAudio(); await buildMixerUI(); }
  mx.classList.toggle('show', show); $('band').classList.toggle('hidden', show); $('viewBtn').textContent = show ? 'Mnisi' : 'Mikser';
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && ctx.state === 'suspended' && playing) ctx.resume(); });
