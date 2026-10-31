// The desert monastery: sky from dusk to night, stars and moon, jagged mountains, dunes with drifting sand,
// a monastery on a rock with a bell tower and a dome, hermit caves with lamps, smoke from the censer.
// Windows glow with the choir, the bells swing when they ring, the dome glows with the organ.
'use strict';
const cv = $('sky'), g2 = cv.getContext('2d'); let W = 0, H = 0;
const GL = {chor: 0, dzwon: 0, organy: 0, bas: 0, pad: 0, lancuch: 0, drewno: 0};
const sand = [], stars = [], smoke = [];
function resize(){ W = cv.width = innerWidth; H = cv.height = innerHeight; stars.length = 0; for (let i = 0; i < 160; i++) stars.push({x: Math.random(), y: Math.random() * .55, r: Math.random() * 1.3 + .2, p: Math.random() * 6}); }
addEventListener('resize', resize); resize();
function glow(kind, vel, t){ const d = Math.max(0, (t - (ctx ? ctx.currentTime : 0)) * 1000); const k = kind.startsWith('chor') ? 'chor' : kind;
  setTimeout(() => { if (k in GL) GL[k] = Math.min(1, GL[k] + (vel ?? .5) * .45); }, d); }
// deterministic ridge lines
function ridge(seed, base, amp, rough){ const pts = []; let s = seed; const rnd2 = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  let y = base; for (let x = 0; x <= 1.0001; x += .02){ y += (rnd2() - .5) * rough; y = base + (y - base) * .85; pts.push([x, y + Math.sin(x * 7 + seed) * amp]); } return pts; }
const R1 = ridge(11, .52, .05, .08), R2 = ridge(23, .6, .03, .06);
let swing = 0, tm = 0;
function col(a, b, t){ return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
function frame(){
  tm += .04;
  const night = clamp(.35 + M.pust * .65 - M.zar * .35, 0, 1), heat = M.zar;
  // sky
  const top = col([214, 120, 64], [14, 14, 36], night), mid = col([238, 176, 96], [44, 34, 70], night), hor = col([250, 214, 150], [120, 70, 70], night * .8);
  const sg = g2.createLinearGradient(0, 0, 0, H * .75); sg.addColorStop(0, `rgb(${top})`); sg.addColorStop(.55, `rgb(${mid})`); sg.addColorStop(1, `rgb(${hor})`);
  g2.fillStyle = sg; g2.fillRect(0, 0, W, H);
  // stars and the moon come out with the night
  if (night > .35){ for (const s of stars){ const a = (night - .35) * 1.5 * (.6 + .4 * Math.sin(tm * 1.3 + s.p)); g2.fillStyle = `rgba(255,244,220,${Math.min(1, a)})`; g2.beginPath(); g2.arc(s.x * W, s.y * H, s.r, 0, 7); g2.fill(); } }
  const mx = W * .8, my = H * (.16 + (1 - night) * .25), mr = Math.min(W, H) * .045;
  g2.fillStyle = `rgba(255,236,200,${.35 + night * .6})`; g2.beginPath(); g2.arc(mx, my, mr, 0, Math.PI * 2); g2.fill();
  { const u = clamp(my / (H * .75) / .55, 0, 1), sc = col(top, mid, u); g2.fillStyle = `rgb(${sc})`; g2.beginPath(); g2.arc(mx + mr * .42, my - mr * .2, mr * .88, 0, Math.PI * 2); g2.fill(); }   // crescent: the sky covers part of the disc
  // mountains of the desert (two ranges)
  const drawRidge = (R, c, alpha) => { g2.fillStyle = `rgba(${c},${alpha})`; g2.beginPath(); g2.moveTo(0, H); for (const [x, y] of R) g2.lineTo(x * W, y * H); g2.lineTo(W, H); g2.fill(); };
  drawRidge(R1, col([170, 92, 70], [52, 38, 70], night).join(','), 1);
  drawRidge(R2, col([150, 78, 52], [40, 28, 52], night).join(','), 1);
  // the cliff with hermit caves on the left
  g2.fillStyle = `rgb(${col([128, 64, 40], [30, 22, 38], night)})`; g2.beginPath(); g2.moveTo(0, H * .42); g2.lineTo(W * .08, H * .44); g2.lineTo(W * .14, H * .55); g2.lineTo(W * .2, H * .62); g2.lineTo(W * .26, H * .78); g2.lineTo(0, H * .8); g2.fill();
  for (const [cx, cy] of [[.05, .5], [.11, .56], [.07, .63], [.16, .66]]){ g2.fillStyle = 'rgba(10,6,12,.85)'; g2.beginPath(); g2.ellipse(cx * W, cy * H, W * .012, H * .018, 0, Math.PI, 0); g2.fill();
    const lamp = .25 + night * .5 + GL.chor * .3 + .08 * Math.sin(tm * 3 + cx * 40); g2.fillStyle = `rgba(255,190,90,${lamp})`; g2.beginPath(); g2.arc(cx * W, cy * H - H * .004, 2.2, 0, 7); g2.fill(); }
  // monastery on its rock
  const bx = W * .56, by = H * .66, s = Math.min(W, H) / 700;
  const wall = `rgb(${col([206, 150, 96], [58, 44, 60], night)})`, shade = `rgb(${col([170, 112, 70], [40, 30, 46], night)})`;
  g2.fillStyle = shade; g2.beginPath(); g2.moveTo(bx - 210 * s, by + 40 * s); g2.lineTo(bx - 170 * s, by - 10 * s); g2.lineTo(bx + 190 * s, by - 6 * s); g2.lineTo(bx + 240 * s, by + 40 * s); g2.fill();   // rock
  g2.fillStyle = wall; g2.fillRect(bx - 160 * s, by - 70 * s, 330 * s, 66 * s);                                                                                                        // long wall
  for (let x = -160; x < 170; x += 18) g2.fillRect(bx + x * s, by - 78 * s, 10 * s, 8 * s);                                                                                          // crenels
  // church with a dome and a cross; the dome glows with the organ
  g2.fillStyle = wall; g2.fillRect(bx - 40 * s, by - 120 * s, 90 * s, 52 * s);
  g2.beginPath(); g2.arc(bx + 5 * s, by - 120 * s, 38 * s, Math.PI, 0); g2.fill();
  if (GL.organy > .02){ const og = g2.createRadialGradient(bx + 5 * s, by - 130 * s, 0, bx + 5 * s, by - 130 * s, 80 * s); og.addColorStop(0, `rgba(255,210,140,${GL.organy * .35})`); og.addColorStop(1, 'rgba(255,210,140,0)'); g2.fillStyle = og; g2.beginPath(); g2.arc(bx + 5 * s, by - 130 * s, 80 * s, 0, 7); g2.fill(); }
  g2.strokeStyle = wall; g2.lineWidth = 3 * s; g2.beginPath(); g2.moveTo(bx + 5 * s, by - 158 * s); g2.lineTo(bx + 5 * s, by - 182 * s); g2.moveTo(bx - 4 * s, by - 173 * s); g2.lineTo(bx + 14 * s, by - 173 * s); g2.stroke();
  // bell tower with three bells that swing when they ring
  const tx = bx + 110 * s; g2.fillStyle = wall; g2.fillRect(tx - 22 * s, by - 170 * s, 44 * s, 100 * s);
  g2.beginPath(); g2.moveTo(tx - 26 * s, by - 170 * s); g2.lineTo(tx, by - 196 * s); g2.lineTo(tx + 26 * s, by - 170 * s); g2.fill();
  swing += (GL.dzwon * .6 - swing) * .1; const sw = Math.sin(tm * 4) * swing;
  for (let i = 0; i < 2; i++){ const ax = tx - 9 * s + i * 18 * s, ay = by - 160 * s;
    g2.fillStyle = 'rgba(14,8,16,.9)'; g2.beginPath(); g2.moveTo(ax - 7 * s, ay + 24 * s); g2.lineTo(ax - 7 * s, ay + 6 * s); g2.arc(ax, ay + 6 * s, 7 * s, Math.PI, 0); g2.lineTo(ax + 7 * s, ay + 24 * s); g2.fill();
    g2.save(); g2.translate(ax, ay + 6 * s); g2.rotate(sw * (i ? -1 : 1)); g2.fillStyle = `rgb(${col([196, 150, 70], [170, 130, 70], night)})`;
    g2.beginPath(); g2.moveTo(-5 * s, 14 * s); g2.quadraticCurveTo(-5 * s, 0, 0, 0); g2.quadraticCurveTo(5 * s, 0, 5 * s, 14 * s); g2.fill(); g2.restore(); }
  if (GL.dzwon > .05){ g2.strokeStyle = `rgba(255,220,150,${GL.dzwon * .5})`; g2.lineWidth = 1.5; for (let r = 1; r <= 3; r++){ g2.beginPath(); g2.arc(tx, by - 150 * s, (30 + r * 22 + (1 - GL.dzwon) * 30) * s, -2.4, -.7); g2.stroke(); } }
  // windows glow with the choir
  const wl = .2 + night * .35 + GL.chor * .6;
  for (let i = 0; i < 9; i++){ const wx = bx + (-145 + i * 34) * s, wy = by - 52 * s; g2.fillStyle = `rgba(255,${180 + GL.chor * 50},${90 + GL.chor * 40},${Math.min(1, wl * (.7 + .3 * Math.sin(tm * 2 + i)))})`;
    g2.beginPath(); g2.moveTo(wx, wy + 18 * s); g2.lineTo(wx, wy + 5 * s); g2.arc(wx + 4 * s, wy + 5 * s, 4 * s, Math.PI, 0); g2.lineTo(wx + 8 * s, wy + 18 * s); g2.fill(); }
  // censer smoke rising from the church
  if (L.kadzielnica?.on && playing && chance(.25)) smoke.push({x: bx - 20 * s + rnd(-4, 4), y: by - 70 * s, a: .35, r: 3});
  for (let i = smoke.length - 1; i >= 0; i--){ const p = smoke[i]; p.y -= .5; p.x += Math.sin(tm + p.y * .05) * .4 + .15; p.r += .06; p.a *= .985;
    g2.fillStyle = `rgba(230,220,210,${p.a * .4})`; g2.beginPath(); g2.arc(p.x, p.y, p.r, 0, 7); g2.fill(); if (p.a < .02) smoke.splice(i, 1); }
  // dunes in front (they breathe with the bass)
  const dune = (base, amp, k, ph, c) => { g2.fillStyle = c; g2.beginPath(); g2.moveTo(0, H);
    for (let x = 0; x <= W; x += 8){ const u = x / W; g2.lineTo(x, H * (base + amp * Math.sin(u * k + ph) + amp * .4 * Math.sin(u * k * 2.3 + ph * 1.7) - GL.bas * .004 * Math.sin(u * 30 + tm * 6))); }
    g2.lineTo(W, H); g2.fill(); };
  dune(.8, .03, 4, 1, `rgb(${col([226, 168, 104], [70, 50, 64], night)})`);
  dune(.88, .035, 3, 2.4, `rgb(${col([212, 150, 88], [56, 40, 56], night)})`);
  dune(.95, .03, 5, 4, `rgb(${col([196, 132, 76], [44, 32, 46], night)})`);
  // sand blown by the wind
  const windOn = L.wiatr?.on; const want = (windOn ? 90 + M.zar * 90 : 10) * (PERF.lite ? .4 : 1);
  while (sand.length < want) sand.push({x: Math.random() * W, y: H * (.7 + Math.random() * .3), v: rnd(.5, 1.6), l: rnd(4, 14)});
  g2.strokeStyle = `rgba(${col([255, 226, 170], [180, 160, 170], night)},.35)`; g2.lineWidth = 1; g2.beginPath();
  for (let i = sand.length - 1; i >= 0; i--){ const p = sand[i]; p.x += p.v * (2 + Math.sin(tm * .3) * 1.5); p.y += Math.sin(tm + p.x * .01) * .2; g2.moveTo(p.x, p.y); g2.lineTo(p.x - p.l, p.y + .5);
    if (p.x > W + 20){ if (sand.length > want) sand.splice(i, 1); else { p.x = -20; p.y = H * (.7 + Math.random() * .3); } } }
  g2.stroke();
  for (const k in GL) GL[k] *= .93;
}
let lastF = 0; function loop(ts){ if (ts - lastF > (PERF.lite ? 90 : 40)){ lastF = ts; frame(); } requestAnimationFrame(loop); }
requestAnimationFrame(loop);
