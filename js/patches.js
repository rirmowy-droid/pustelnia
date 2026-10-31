// Synth sounds: every patch is a stack of different oscillators (see js/wk/synth.js for the kinds).
'use strict';
const BASS_PATCHES = {
  gleboki:  {name:'Głęboki (sinus, trójkąt, sub-oktawa, alikwoty)', gain:.5, env:[.08,1.2,.85,1.6], fenv:[.05,1.5,.4,1], filt:{type:'lp', f:380, q:.9, env:1.2, key:.3}, drift:3,
    oscs:[{t:'sin'}, {t:'tri', lvl:.45, det:4}, {t:'sub', lvl:.22}, {t:'add', lvl:.35, p:{amps:[0,.6,.35,.2,.12], norm:.6}}]},
  pustynny: {name:'Pustynny (piły, zwijacz fali, FM)', gain:.36, env:[.02,1.4,.75,1.2], fenv:[.01,.9,.25,.8], filt:{type:'lp', f:520, q:1.4, env:2.6, key:.4}, drift:5, sat:.3,
    oscs:[{t:'saw', det:-7}, {t:'saw', det:8, lvl:.8}, {t:'fold', lvl:.6, p:{fold:3.2, foldLfo:.3}}, {t:'fm', lvl:.5, p:{ratio:1, idx:3, idx2:.6, idxT:.5}}]},
  gardlowy: {name:'Gardłowy (formanty „o”, synchronizacja, PWM)', gain:.42, env:[.06,1,.8,1.4], fenv:[.04,1.2,.5,1], filt:{type:'lp', f:900, q:1.8, env:1.5, key:.5}, drift:6,
    oscs:[{t:'formant', lvl:.9, p:{vowel:'o', scale:.85}}, {t:'sync', lvl:.4, p:{ratio:2.3, sweep:.8, sweepT:.6, lfo:.15}}, {t:'pulse', lvl:.45, p:{pw:.22, pwm:.18, pwmRate:.21}}, {t:'sin', lvl:.6}]},
  mnich:    {name:'Mnich (szereg harmoniczny, oddech, zniekształcenie fazy)', gain:.4, env:[.15,1.6,.85,2], fenv:[.1,2,.6,1.5], filt:{type:'lp', f:1000, q:.8, env:.8, key:.5}, drift:4,
    oscs:[{t:'add', p:{amps:[1,.62,.42,.3,.22,.16,.12,.09,.07], norm:.42}}, {t:'noise', lvl:.35, p:{q:24}}, {t:'pd', lvl:.4, p:{d:.12, dEnv:.8}}, {t:'sin', lvl:.5, r:.5}]},
  ziemia:   {name:'Ziemia (chaos, supersaw, modulacja kołowa)', gain:.34, env:[.03,1.2,.8,1.4], fenv:[.02,1,.35,1], filt:{type:'lp', f:620, q:1.6, env:2, key:.4}, drift:7, sat:.4,
    oscs:[{t:'chaos', lvl:.35, p:{r:3.72, rLfo:.12}}, {t:'supersaw', lvl:.7, p:{n:7, spread:22}}, {t:'sin', r:.5, lvl:.8}, {t:'ring', lvl:.25, p:{ratio:1.5}}]},
  struna:   {name:'Struna (Karplus-Strong smyczkiem, FM 3-op)', gain:.45, env:[.02,2,.7,1.6], fenv:[.01,1.5,.4,1], filt:{type:'lp', f:1300, q:.9, env:1, key:.6}, drift:4,
    oscs:[{t:'ks', p:{fb:.997, bright:.35, bow:1.2}}, {t:'fm3', lvl:.35, p:{ratio:2, ratio2:3.01, idx:1.6, idx2:.8, idxT:1.2}}, {t:'tri', lvl:.5}]},
};
const PAD_PATCHES = {
  wydmy:  {name:'Wiatr nad wydmami (szum strojony, formant „u”, tablica fal)', gain:.22, env:[3,3,.8,5], filt:{type:'lp', f:2200, q:.6, env:.4, key:.3}, drift:9,
    oscs:[{t:'noise', p:{q:34}, pan:-.4}, {t:'noise', r:2, lvl:.6, p:{q:44}, pan:.4}, {t:'formant', lvl:.5, p:{vowel:'u', scale:1}}, {t:'wt', lvl:.4, p:{morph:.5, morphLfo:.5, morphRate:.05}}]},
  zar:    {name:'Żar (supersaw, PWM, nasycenie)', gain:.14, env:[2.5,2,.85,4], fenv:[3,3,.6,4], filt:{type:'lp', f:900, q:1.1, env:1.4, key:.4}, drift:6, sat:.3,
    oscs:[{t:'supersaw', p:{n:7, spread:28}}, {t:'pulse', lvl:.6, det:5, p:{pw:.4, pwm:.25, pwmRate:.13}, pan:.3}, {t:'saw', r:.5, lvl:.4, det:-4, pan:-.3}]},
  szklo:  {name:'Szkło (FM, rozciągnięte alikwoty, sinusy)', gain:.2, env:[.6,3,.5,5], filt:{type:'lp', f:6000, q:.5, key:.2}, drift:3,
    oscs:[{t:'fm', p:{ratio:3.5, idx:1.6, idx2:.3, idxT:2}}, {t:'add', lvl:.6, p:{amps:[1,0,.4,0,.25,0,.15], stretch:.0015, norm:.5}, pan:.25}, {t:'sin', r:2, lvl:.3, pan:-.25}]},
  miraz:  {name:'Miraż (tablica fal, modulacja kołowa, zniekształcenie fazy)', gain:.2, env:[2,2,.8,4], filt:{type:'lp', f:2600, q:.7, env:.5, key:.3}, drift:8,
    oscs:[{t:'wt', p:{morph:1.2, morphLfo:.9, morphRate:.09}, pan:-.3}, {t:'wt', det:9, p:{morph:2, morphLfo:.8, morphRate:.06}, pan:.3}, {t:'ring', lvl:.18, p:{ratio:1.414}}, {t:'pd', lvl:.3, p:{d:.25, dEnv:.4}}]},
  pyl:    {name:'Pył (struna smyczkiem, chaos, piasek)', gain:.2, env:[1.5,2,.8,4], filt:{type:'lp', f:1800, q:.8, key:.4}, drift:10,
    oscs:[{t:'ks', p:{fb:.998, bright:.25, bow:1.5}}, {t:'chaos', lvl:.12, p:{r:3.6, rLfo:.1}}, {t:'noise', r:4, lvl:.25, p:{q:6}}, {t:'tri', r:.5, lvl:.4}]},
  aniol:  {name:'Anielski (formanty dziecięce „a” i „o”, sinus)', gain:.18, env:[1.8,2,.85,4], filt:{type:'lp', f:5000, q:.5, key:.2}, drift:7, vib:[4.6, 9, 1.2],
    oscs:[{t:'formant', p:{vowel:'a', scale:1.25}, pan:-.2}, {t:'formant', det:6, lvl:.8, p:{vowel:'o', scale:1.25}, pan:.2}, {t:'sin', r:2, lvl:.2}]},
};
// speaker parameters seen by the amp (lumped from the same physical speakers as the cabinet IRs)
const CAB_SPK = {
  kol_4x12_57:        {Re:6.2, Bl:10.3, Mms:.0308, Kms:13565, Rms:4.13},
  kol_2x12_open_wst:  {Re:6.2, Bl:10.3, Mms:.0309, Kms:4998, Rms:4.52},
  kol_1x12_open_sosna_poj: {Re:6.2, Bl:10.3, Mms:.0307, Kms:5173, Rms:4.36},
};
