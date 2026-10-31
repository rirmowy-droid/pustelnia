// Small shared helpers.
'use strict';
const $ = id => document.getElementById(id);
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
const rnd = (a,b)=>a+Math.random()*(b-a);
const pick = a => a[Math.floor(Math.random()*a.length)];
const chance = p => Math.random() < p;
const lerp = (a,b,t)=>a+(b-a)*t;
const mtof = m => 440*Math.pow(2,(m-69)/12);
const NAMES = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B','H'];
const IS_PHONE = /Android|iPhone|iPad/i.test(navigator.userAgent);
function wpick(items, weights){ let s=0; for (const w of weights) s+=w; let r=Math.random()*s; for (let i=0;i<items.length;i++){ r-=weights[i]; if (r<=0) return items[i]; } return items[items.length-1]; }
