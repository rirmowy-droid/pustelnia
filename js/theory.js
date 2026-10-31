// Church modes, Latin texts (syllables, vowels, consonants, accents) and the chant generator:
// melodies are made fresh every time from the rules of plainchant (finalis, reciting tone, ambitus, neumes,
// intonation and cadence formulas), never copied from existing chants.
'use strict';

// ======================= modes =======================
// deg = diatonic steps above the finalis. tenor = reciting tone. amb = lowest / highest degree of the ambitus.
const MODES = [
  {id:1, name:'I – dorycki (protus autentyczny)',      pc:2, tenor:4, amb:[-1,8],  bflat:.15},
  {id:2, name:'II – hipodorycki (protus plagalny)',    pc:2, tenor:2, amb:[-4,5],  bflat:.25},
  {id:3, name:'III – frygijski (deuterus autentyczny)',pc:4, tenor:5, amb:[-1,8],  bflat:0},
  {id:4, name:'IV – hipofrygijski (deuterus plagalny)',pc:4, tenor:3, amb:[-3,5],  bflat:.1},
  {id:5, name:'V – lidyjski (tritus autentyczny)',     pc:5, tenor:4, amb:[0,8],   bflat:.85},
  {id:6, name:'VI – hipolidyjski (tritus plagalny)',   pc:5, tenor:2, amb:[-4,5],  bflat:.9},
  {id:7, name:'VII – miksolidyjski (tetrardus aut.)',  pc:7, tenor:4, amb:[-1,9],  bflat:0},
  {id:8, name:'VIII – hipomiksolidyjski (tetr. plag.)',pc:7, tenor:3, amb:[-4,5],  bflat:.05},
];
const WHITE = [0,2,4,5,7,9,11];
// MIDI note of a degree. 'fin' = MIDI of the finalis (any transposition). B flat: the step above A, sung as B♭ near F.
function degMidi(mode, fin, deg, flat){
  const start = WHITE.indexOf(mode.pc);
  const k = start + deg, oct = Math.floor(k/7), idx = ((k%7)+7)%7;
  let pc = WHITE[idx]; if (pc===11 && flat) pc = 10;
  return fin + (pc - mode.pc) + 12*oct;
}
const isB = (mode, deg) => WHITE[((WHITE.indexOf(mode.pc)+deg)%7+7)%7] === 11;

// ======================= Latin =======================
// Texts from the psalms, the prophets and the Ordinary (public domain), with the accents of the liturgical books.
// Lines are phrases; '*' marks the middle of a psalm verse (mediant).
const TEXTS = [
  {id:'pustynia', name:'Ps 62(63) – Pragnie Cię dusza moja na ziemi pustynnej', lines:[
    'Deus, Deus méus, * ad te de lúce vígilo.',
    'Sitívit in te ánima méa, * quam multiplíciter tibi cáro méa,',
    'in térra desérta et ínvia * et inaquósa.']},
  {id:'vox', name:'Iz 40 – Głos wołającego na pustyni', lines:[
    'Vox clamántis in desérto: * paráte víam Dómini,',
    'réctas fácite in solitúdine * sémitas Déi nóstri.',
    'Omnis vállis exaltábitur, * et omnis mons humiliábitur.']},
  {id:'laetabitur', name:'Iz 35 – Rozweseli się pustynia', lines:[
    'Laetábitur desérta et ínvia, * et exsultábit solitúdo,',
    'et florébit quasi lílium. * Gérminans germinábit,',
    'et exsultábit laetabúnda * et láudans.']},
  {id:'kyrie', name:'Kyrie eleison', lines:['Kýrie eléison.','Kýrie eléison.','Christe eléison.','Christe eléison.','Kýrie eléison.','Kýrie eléison.']},
  {id:'agnus', name:'Agnus Dei', lines:['Agnus Déi, * qui tóllis peccáta múndi:','miserére nóbis.','Agnus Déi, * qui tóllis peccáta múndi:','dóna nóbis pácem.']},
  {id:'miserere', name:'Ps 50(51) – Miserere', lines:[
    'Miserére méi, Déus, * secúndum mágnam misericórdiam túam.',
    'Et secúndum multitúdinem miseratiónum tuárum, * déle iniquitátem méam.',
    'Amplius láva me ab iniquitáte méa, * et a peccáto méo múnda me.']},
  {id:'requiem', name:'Requiem aeternam', lines:['Réquiem aetérnam * dóna éis, Dómine,','et lux perpétua * lúceat éis.']},
  {id:'dies', name:'Dies irae (tekst)', lines:['Díes írae, díes ílla,','sólvet saeclum in favílla,','téste Dávid cum Sibýlla.','Quántus trémor est futúrus,','quándo júdex est ventúrus.']},
  {id:'pater', name:'Pater noster', lines:['Páter nóster, * qui es in caélis,','sanctificétur nómen túum.','Advéniat régnum túum. * Fíat volúntas túa,','sicut in caélo, et in térra.']},
  {id:'gloria', name:'Gloria Patri', lines:['Glória Pátri, et Fílio, * et Spirítui Sáncto.','Sicut érat in princípio, et nunc, et sémper, * et in saécula saeculórum. Amen.']},
  {id:'salve', name:'Salve Regina (tekst)', lines:['Sálve, Regína, * máter misericórdiae,','víta, dulcédo, * et spes nóstra, sálve.','Ad te clamámus, * éxsules, fílii Hévae.']},
  {id:'deprofundis', name:'Ps 129(130) – De profundis', lines:['De profúndis clamávi ad te, Dómine: * Dómine, exáudi vócem méam.','Fíant áures túae intendéntes * in vócem deprecatiónis méae.']},
];
const ACC = {'á':'a','é':'e','í':'i','ó':'o','ú':'u','ý':'y','ǽ':'ae','æ':'ae','œ':'oe'};
const VOW = 'aeiouy';
// one word -> syllables {txt, nuc (vowel letters), onset, coda, acc}
function syllabify(word){
  const raw = word.toLowerCase().replace(/[^a-záéíóúýæœǽ]/g,'');
  if (!raw) return [];
  let accentAt = -1; const letters = [];
  for (const ch of raw){ if (ACC[ch]){ accentAt = letters.length; for (const c of ACC[ch]) letters.push(c); } else letters.push(ch); }
  const s = letters.join('');
  // vowel nuclei (diphthongs ae, oe, au count as one; u after q / g before vowel is a consonant)
  const nuc = []; let i = 0;
  while (i < s.length){
    const c = s[i];
    if (VOW.includes(c) && !(c==='u' && i>0 && (s[i-1]==='q' || (s[i-1]==='g' && s[i-2]==='n')) && VOW.includes(s[i+1]||''))){
      let j = i+1; const two = s.slice(i,i+2); if (two==='ae'||two==='oe'||two==='au') j = i+2;
      nuc.push([i,j]); i = j;
    } else i++;
  }
  if (!nuc.length) return [{txt:s, nuc:'', onset:s, coda:'', acc:false}];
  // split consonants between nuclei: one -> to the next; two or more -> first stays (mute + liquid go together)
  const bounds = [0];
  for (let k=1;k<nuc.length;k++){
    const a = nuc[k-1][1], b = nuc[k][0], cons = s.slice(a,b);
    let cut = b;
    if (cons.length===1) cut = a;
    else if (cons.length>=2){ const last2 = cons.slice(-2); cut = (/^[bcdfgpt][lr]$/.test(last2) || last2==='ch' || last2==='ph' || last2==='th' || last2==='qu' || last2==='gn') ? b-2 : b-1; if (cons==='gn') cut = a+1; }
    bounds.push(cut);
  }
  bounds.push(s.length);
  const out = [];
  for (let k=0;k<nuc.length;k++){
    const a = bounds[k], b = bounds[k+1], txt = s.slice(a,b), n0 = nuc[k][0]-a, n1 = nuc[k][1]-a;
    out.push({txt, nuc:txt.slice(n0,n1), onset:txt.slice(0,n0), coda:txt.slice(n1), acc:false});
  }
  if (accentAt>=0){ let pos = 0; for (const sy of out){ if (accentAt>=pos && accentAt<pos+sy.txt.length) sy.acc = true; pos += sy.txt.length; } }
  else if (out.length>=2) out[out.length-2].acc = true; else out[0].acc = out.length===1 && raw.length>2;
  return out;
}
// sung vowel for a nucleus -> sample vowel
function vowelOf(nuc){
  if (!nuc) return 'oh';
  if (nuc==='ae'||nuc==='oe') return 'eh';
  if (nuc==='au') return 'ah';
  return {a:'ah',e:'eh',i:'ee',y:'ee',o:'oh',u:'oo'}[nuc[0]] || 'ah';
}
// a whole line -> [{...syl, word index, wordEnd, vowel}], '*' sets the mediant
function parseLine(line){
  const words = line.split(/\s+/).filter(Boolean); const out = []; let mediant = -1;
  words.forEach((w, wi)=>{
    if (w==='*'){ mediant = out.length-1; return; }
    const syl = syllabify(w); syl.forEach((sy, k)=>out.push({...sy, word:wi, wordEnd:k===syl.length-1, vowel:vowelOf(sy.nuc), punct:k===syl.length-1 ? (w.match(/[,.:;]$/)||[''])[0] : ''}));
  });
  return {syl: out, mediant};
}
function parseText(lines){ return lines.map(parseLine); }

// ======================= chant generator =======================
// Builds one phrase: [{deg, dur (pulses), si (syllable index), first (first note of the syllable), flat}]
// density: 0..1 (more neumes and melismas) ; kind: 'arch' | 'psalm' ; end: 'final' | 'half'
function makePhrase(mode, phr, o={}){
  const syl = phr.syl, n = syl.length, dens = o.density ?? .4, end = o.end ?? 'final';
  const lo = mode.amb[0], hi = mode.amb[1], T = mode.tenor;
  const notes = [];
  let cur = o.startDeg ?? (chance(.6) ? 0 : pick([-1,1,2]));
  const goal = end==='final' ? 0 : pick([T, T-1, 1, 2]);
  const peakAt = rnd(.3,.65), peak = Math.min(hi, T + (chance(.4)?1:0) + (dens>.6&&chance(.3)?1:0));
  // accent before the last syllable governs the cadence (cursus): last accent of the phrase
  let lastAcc = -1; for (let i=n-1;i>=0;i--) if (syl[i].acc){ lastAcc = i; break; }
  const psalm = o.kind==='psalm';
  for (let i=0;i<n;i++){
    const t = n>1 ? i/(n-1) : 1, sy = syl[i];
    // where the line wants to be now
    let target;
    if (psalm){
      if (i < 2) target = Math.min(T, cur + 1 + (i===1?1:0));                     // intonation up to the tenor
      else if (i === phr.mediant || i === lastAcc) target = T + (chance(.5)?1:0);   // accent of the cadence above the tenor
      else if (i > lastAcc && lastAcc>=0) target = i===n-1 ? goal : lerp(T, goal, (i-lastAcc)/(n-1-lastAcc));
      else target = T;                                                                // recitation
    } else {
      target = t < peakAt ? lerp(o.startDeg ?? 0, peak, Math.pow(t/peakAt, .8)) : lerp(peak, goal, Math.pow((t-peakAt)/(1-peakAt), 1.2));
      if (sy.acc) target += .8;
    }
    // number of notes for this syllable: syllabic, neumatic or a melisma
    let k = 1;
    const melisma = (sy.acc ? .3 : .06) + dens*(sy.acc ? .35 : .22) + (i===n-1||i===n-2 ? .12 : 0) + (psalm && i>1 && i<lastAcc && i!==phr.mediant ? -.6 : 0);
    if (chance(melisma)) k = 2 + (chance(.5) ? 1 : 0);
    if (chance(melisma*dens*.6)) k += Math.floor(rnd(2, 3 + dens*6));               // long melisma (jubilus) on rich settings
    if (psalm && i>1 && i<lastAcc && i!==phr.mediant) k = 1;
    const shape = k===1 ? 'punctum' : k===2 ? pick(['clivis','podatus']) : k===3 ? pick(['torculus','porrectus','climacus','scandicus']) : 'melisma';
    const tg = Math.round(target);
    const seq = [];
    if (shape==='punctum') seq.push(tg);
    else if (shape==='clivis') seq.push(tg+1, tg);
    else if (shape==='podatus') seq.push(tg-1, tg);
    else if (shape==='torculus') seq.push(tg-1, tg, tg-1);
    else if (shape==='porrectus') seq.push(tg+1, tg-1, tg);
    else if (shape==='climacus') seq.push(tg+2, tg+1, tg);
    else if (shape==='scandicus') seq.push(tg-2, tg-1, tg);
    else { // melisma: a winding line around the target, mostly by step, returning to it
      let d = tg + pick([-1,0,1]);
      for (let j=0;j<k;j++){ seq.push(d); d += wpick([-1,1,-2,2,0],[4,4,1,1,.5]); d = clamp(d, tg-3, tg+3); }
      seq.push(tg);
    }
    // fit the line: no leaps larger than a fifth from the previous note, stay in the ambitus
    for (let j=0;j<seq.length;j++){
      let d = clamp(seq[j], lo, hi);
      const prev = notes.length ? notes[notes.length-1].deg : cur;
      if (Math.abs(d-prev) > 4) d = prev + Math.sign(d-prev)*pick([2,3,4]);
      d = clamp(d, lo, hi);
      seq[j] = d;
    }
    seq.forEach((d, j)=>{
      const last = j===seq.length-1;
      let dur = 1;
      if (last && sy.wordEnd && sy.punct) dur = 1.6;                // punctuation: a small hold
      if (last && sy.acc && !psalm) dur += .25;
      notes.push({deg:d, dur, si:i, first:j===0, flat:false});
    });
    cur = seq[seq.length-1];
  }
  // cadence: approach the goal by step from above (or below in modes III/IV), long final note (mora vocis)
  const L = notes.length, fin = notes[L-1];
  if (fin.deg !== goal){ fin.deg = goal; }
  if (L>1 && Math.abs(notes[L-2].deg - goal) > 2) notes[L-2].deg = goal + (mode.pc===4 ? -1 : 1);
  fin.dur = end==='final' ? 2.6 : 1.9;
  if (L>1) notes[L-2].dur = Math.max(notes[L-2].dur, 1.3);
  // B or B flat: flatten when the line touches F around it (avoid the tritone), else per mode habit
  for (let j=0;j<L;j++){
    if (!isB(mode, notes[j].deg)) continue;
    const near = notes.slice(Math.max(0,j-3), j+4).some(x => !isB(mode, x.deg) && ((WHITE[((WHITE.indexOf(mode.pc)+x.deg)%7+7)%7])===5));
    notes[j].flat = near || chance(mode.bflat);
  }
  return notes;
}
// organum below the chant (Musica enchiriadis style): parallel fourth/fifth, but the organal voice never goes
// below its boundary tone and joins the chant in unison at the end of the phrase (occursus)
function organumLine(mode, fin, notes, interval){
  const out = []; const floor = degMidi(mode, fin, mode.amb[0], false) - (interval===7 ? 5 : 3);
  for (let j=0;j<notes.length;j++){
    const m = degMidi(mode, fin, notes[j].deg, notes[j].flat);
    let o = Math.max(m - interval, floor);
    if (j >= notes.length-2) o = m - (j===notes.length-1 ? 0 : (m-o>2 ? 2 : m-o));   // occursus: meet at the final
    out.push(o);
  }
  return out;
}
