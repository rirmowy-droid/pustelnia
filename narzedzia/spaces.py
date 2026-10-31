"""Spaces for Pustelnia, computed from geometry: early reflections by image sources (frequency-dependent wall
absorption per material), late tail as decorrelated noise decaying per octave band with Sabine/Eyring RT60,
air absorption. Open-air places (courtyard, canyon) have no ceiling and only a few discrete echoes."""
import numpy as np, json, subprocess, os, shutil
from scipy.io import wavfile
SR = 44100; C = 343.0
BANDS = np.array([63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000])
MAT = {   # absorption coefficient per band
    'skala':   [0.02, 0.03, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09],
    'kamien':  [0.01, 0.02, 0.02, 0.03, 0.03, 0.04, 0.05, 0.06, 0.07],
    'tynk':    [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1],
    'piasek':  [0.10, 0.15, 0.25, 0.40, 0.55, 0.60, 0.65, 0.70, 0.70],
    'drewno':  [0.15, 0.12, 0.10, 0.08, 0.07, 0.07, 0.07, 0.08, 0.08],
    'woda':    [0.01, 0.01, 0.01, 0.01, 0.02, 0.02, 0.02, 0.03, 0.03],
    'otwarte': [1, 1, 1, 1, 1, 1, 1, 1, 1],
    'ludzie':  [0.2, 0.35, 0.5, 0.65, 0.75, 0.8, 0.8, 0.8, 0.8],
}
AIR = np.array([0, 0, 0.0003, 0.0006, 0.001, 0.002, 0.005, 0.016, 0.05])   # Np/m approx (20 C, 40 %)
def band_filter(x, i):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); c = BANDS[i]
    lo, hi = c / np.sqrt(2), c * np.sqrt(2)
    if i == 0: lo = 0
    if i == len(BANDS) - 1: hi = SR
    w = 1 / np.sqrt(1 + ((f / hi) ** 8)) * (1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 8) if lo > 0 else 1)
    return np.fft.irfft(X * w, len(x))
def make(dim, walls, src, mic, seconds, order=3, rough=0.3, seed=0, diffuse_gain=1.0, mic_sep=0.3, rt_open=None):
    """dim: (Lx, Ly, Lz) ; walls: 6 materials (x0, x1, y0, y1, z0 floor, z1 ceiling)."""
    rng = np.random.default_rng(seed); Lx, Ly, Lz = dim; n = int(seconds * SR)
    A = np.array([MAT[w] for w in walls])                      # 6 x bands
    S = np.array([Ly * Lz, Ly * Lz, Lx * Lz, Lx * Lz, Lx * Ly, Lx * Ly])
    V = Lx * Ly * Lz; Stot = S.sum()
    abar = (S[:, None] * A).sum(0) / Stot
    rt = 0.161 * V / (-Stot * np.log(1 - np.minimum(abar, 0.99)) + 4 * AIR * V)   # Eyring + air
    if rt_open is not None: rt = np.array(rt_open) * np.array([1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.65, 0.5, 0.35])   # open air: only what bounces back from far walls
    rt = np.minimum(rt, seconds / 1.25)
    out = np.zeros((2, n))
    for ch in range(2):
        m = np.array(mic) + np.array([(ch - 0.5) * mic_sep, 0, 0])
        er = np.zeros((len(BANDS), n))
        R = range(-order, order + 1)
        for i in R:
            for j in R:
                for k in R:
                    if abs(i) + abs(j) + abs(k) > order: continue
                    # image position and the walls hit
                    px = (i * Lx + (src[0] if i % 2 == 0 else Lx - src[0])); py = (j * Ly + (src[1] if j % 2 == 0 else Ly - src[1])); pz = (k * Lz + (src[2] if k % 2 == 0 else Lz - src[2]))
                    d = np.linalg.norm(np.array([px, py, pz]) - m); t = d / C
                    if t * SR >= n - 1: continue
                    refl = np.ones(len(BANDS))
                    for cnt, (w0, w1) in zip((i, j, k), ((0, 1), (2, 3), (4, 5))):
                        a = abs(cnt); h0 = (a + (1 if cnt < 0 else 0)) // 2; h1 = a - h0
                        refl *= np.sqrt(1 - A[w0]) ** (2 * h0) * np.sqrt(1 - A[w1]) ** (2 * h1)
                    if np.all(refl < 1e-3): continue
                    g = refl * np.exp(-AIR * d) / max(d, 0.5)
                    # rough walls smear a reflection over a few ms
                    idx = int(t * SR + rng.uniform(-1, 1) * rough * 0.002 * SR * (abs(i) + abs(j) + abs(k)))
                    idx = min(max(idx, 0), n - 1)
                    er[:, idx] += g * (1 if rng.random() > 0.0 else -1)
        # late tail per band
        tail = np.zeros((len(BANDS), n)); t = np.arange(n) / SR
        mixing = 0.002 * np.sqrt(V) + 0.01
        for b in range(len(BANDS)):
            noise = band_filter(rng.standard_normal(n), b)
            env = np.exp(-6.91 * t / max(rt[b], 0.05)) * np.minimum(1, (t / mixing) ** 2)
            tail[b] = noise * env
        # scale the tail so its energy continues the early part smoothly
        e_er = np.sqrt(np.sum(er ** 2, 1) + 1e-12); e_tail = np.sqrt(np.sum(tail[:, :int(mixing * 3 * SR)] ** 2, 1) + 1e-12)
        if not all(w == 'otwarte' for w in walls[4:6]):
            for b in range(len(BANDS)): tail[b] *= diffuse_gain * 0.6 * e_er[b] / e_tail[b] * (Stot / (4 * np.pi * 8)) ** 0.1
        else:
            tail *= 0.15 * diffuse_gain
        y = np.zeros(n)
        for b in range(len(BANDS)): y += band_filter(er[b], b) + tail[b]
        out[ch] = y
    out /= np.sqrt(np.sum(out ** 2) / 2)       # unit energy: every space at a similar loudness
    return out, rt
SPACES = [
    ('jaskinia', 'Jaskinia pustelnika', 'Klasztor na pustyni', (7, 5, 3.2), ['skala'] * 4 + ['piasek', 'skala'], (2, 2.5, 1.5), (5, 2.2, 1.6), 2.5, 0.9),
    ('kaplica', 'Kamienna kaplica', 'Klasztor na pustyni', (14, 7, 8), ['kamien'] * 4 + ['drewno', 'tynk'], (7, 1.5, 1.7), (7, 10.5, 1.6), 4.5, 0.5),
    ('krypta', 'Krypta pod kościołem', 'Klasztor na pustyni', (12, 8, 3.6), ['kamien'] * 4 + ['ludzie', 'kamien'], (2, 4, 1.6), (9, 4.5, 1.6), 3.5, 0.5),
    ('bazylika', 'Bazylika (wielka nawa)', 'Klasztor na pustyni', (60, 24, 22), ['kamien', 'kamien', 'kamien', 'kamien', 'ludzie', 'tynk'], (30, 3, 2), (30, 30, 2), 9.0, 0.4),
    ('cysterna', 'Podziemna cysterna', 'Klasztor na pustyni', (30, 18, 8), ['kamien'] * 4 + ['woda', 'kamien'], (5, 9, 2), (20, 9, 1.8), 9.0, 0.4),
    ('dziedziniec', 'Dziedziniec klasztoru (pod niebem)', 'Pustynia', (24, 18, 30), ['kamien', 'kamien', 'kamien', 'kamien', 'piasek', 'otwarte'], (6, 5, 1.7), (16, 12, 1.7), 2.5, 0.6),
    ('kanion', 'Kanion – skalne ściany', 'Pustynia', (90, 400, 200), ['skala', 'skala', 'otwarte', 'otwarte', 'piasek', 'otwarte'], (30, 200, 1.7), (55, 200, 1.7), 4.0, 0.2),
    ('wydmy', 'Otwarta pustynia (wydmy)', 'Pustynia', (400, 400, 300), ['piasek', 'otwarte', 'otwarte', 'otwarte', 'piasek', 'otwarte'], (150, 200, 1.7), (160, 200, 1.7), 2.0, 0.1),
]
if __name__ == '__main__':
    out = '/home/claude/pu/app/ir'; meta = []
    OPEN = {'dziedziniec': 1.1, 'kanion': 1.6, 'wydmy': 0.5}
    for i, (id_, name, group, dim, walls, src, mic, sec, rough) in enumerate(SPACES):
        y, rt = make(dim, walls, src, mic, sec, order=3 if max(dim) < 40 else 2, rough=rough, seed=i, rt_open=OPEN.get(id_))
        tmp = f'/tmp/_ir_{id_}.wav'; wavfile.write(tmp, SR, (y.T / np.abs(y).max() * 0.9).astype(np.float32))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-b:a', '128k', f'{out}/{id_}.mp3'], check=True)
        meta.append(dict(id=id_, name=name, group=group, kind='space', file=f'ir/{id_}.mp3', len=sec, gain=float(np.abs(y).max() / 0.9), rt60=[round(float(r), 2) for r in rt]))
        print(id_, 'RT60 (125/1k/4k):', np.round(rt[[1, 4, 6]], 2), flush=True)
    # real places from the IR Library (MIT), already in Jesienna Warszawa
    J = json.load(open('/home/claude/jesienna-warszawa/ir/ir.json'))
    for jid, nm in [('kosciol', 'Mały kościół (nagranie)'), ('panteon', 'Panteon w Rzymie (nagranie)'), ('teatr_ostia', 'Rzymski teatr w Ostii (nagranie)'), ('wenecja', 'Kamienne wnętrze z XIII w. (nagranie)'), ('piwnica', 'Piwnica (nagranie)')]:
        e = next(x for x in J if x['id'] == jid); shutil.copy(f'/home/claude/jesienna-warszawa/{e["file"]}', f'{out}/{jid}.mp3')
        e = dict(e, name=nm, group='Prawdziwe miejsca (nagrania)'); meta.append(e)
    shutil.copy('/home/claude/jesienna-warszawa/ir/LICENSE-IR-Library.md', out)
    # speaker cabinets computed from physics (bass through the tube amp)
    for cid, nm in [('4x12_57', 'Kolumna 4×12 zamknięta, mikrofon dynamiczny'), ('2x12_open_wst', 'Kolumna 2×12 otwarta, mikrofon wstęgowy'), ('1x12_open_sosna_poj', 'Kolumna 1×12 sosnowa, mikrofon pojemnościowy')]:
        h = np.load(f'/home/claude/jw/render/ir3_{cid}.npy')[:4096]; h = h / np.abs(h).max() * 0.9
        wavfile.write(f'{out}/kol_{cid}.wav', SR, (h * 32767).astype(np.int16))
        meta.append(dict(id='kol_' + cid, name=nm, group='Kolumny głośnikowe (policzone)', kind='cab', file=f'ir/kol_{cid}.wav', len=4096 / SR, gain=1.0))
    json.dump(meta, open(f'{out}/ir.json', 'w'), indent=1, ensure_ascii=False)
