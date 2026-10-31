"""Prepare the Pustelnia sample library: male schola (basses + tenors summed), basses alone, a children's choir
(soprano/alto samples with formants moved up like a child's shorter vocal tract), pipe organs (looped sustains),
bells and gongs from VCSL, and synthesized chains (physical-ish impact model). Output: mono MP3 + manifest.json."""
import numpy as np, glob, os, re, json, subprocess, sys
from scipy.io import wavfile
from scipy.signal import resample_poly, stft, istft
SR = 44100
EC = '/home/claude/pu/dl/choir/ec'
VC = '/home/claude/src/vcsl'
OUT = '/home/claude/pu/repo/sample'
NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
def midi(name):
    m = re.match(r'([A-G])(s|#|b)?(-?\d)', name); acc = {'s': '#', '#': '#', 'b': 'b', None: ''}[m[2]]
    return 12 * (int(m[3]) + 1) + NOTE[m[1] + acc]
def rd(p):
    sr, x = wavfile.read(p)
    if np.issubdtype(x.dtype, np.integer): x = x.astype(np.float64) / np.iinfo(x.dtype).max
    else: x = x.astype(np.float64)
    if x.ndim > 1: x = x.mean(1)
    if sr != SR: x = resample_poly(x, SR, sr)
    return x
def onset(x, th=0.02):
    e = np.abs(x); mx = e[:SR * 2].max(); i = int(np.argmax(e > mx * th)); return max(0, i - 64)
def fade_out(x, sec):
    n = min(len(x), int(sec * SR)); x = x[:n].copy(); f = min(n, int(0.35 * SR)); x[-f:] *= np.linspace(1, 0, f) ** 2; return x
manifest = {}
def enc(inst, name, x, peak, extra=None, kbps=96):
    os.makedirs(f'{OUT}/{inst}', exist_ok=True)
    tmp = f'/tmp/_p_{os.getpid()}.wav'; wavfile.write(tmp, SR, (x / peak * 0.89).astype(np.float32))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-b:a', f'{kbps}k', f'{OUT}/{inst}/{name}.mp3'], check=True)
def add_mel(inst, layer, m, name, meta=None):
    I = manifest.setdefault(inst, {'type': 'melodic', 'layers': {}, 'meta': {}})
    I['layers'].setdefault(layer, {}).setdefault(str(m), []).append(name + '.mp3')
    if meta: I['meta'][name + '.mp3'] = meta
def add_perc(inst, name, meta=None):
    I = manifest.setdefault(inst, {'type': 'percussion', 'sounds': [], 'meta': {}})
    I['sounds'].append(name + '.mp3')
    if meta: I['meta'][name + '.mp3'] = meta

# ------------------------------------------------------------------ tuning: measure the pitch, flatten the drift
def pitch_track(x, f0, hop=0.01):
    """Pitch every 10 ms around the expected f0 (normalised autocorrelation, parabolic peak). Returns times, cents."""
    h = int(hop * SR); lo, hi = int(SR / (f0 * 1.15)), int(SR / (f0 / 1.15)); w = max(int(SR / f0 * 3), 512)
    ts, cs = [], []
    for i in range(0, len(x) - w - hi, h):
        a = x[i:i + w]; e0 = np.dot(a, a)
        if e0 < 1e-7: continue
        b = x[i:i + w + hi]
        r = np.correlate(b, a, 'valid')[lo:hi + 1]                       # lag lo..hi
        eb = np.convolve(b * b, np.ones(w), 'valid')[lo:hi + 1]
        nr = r / np.sqrt(e0 * eb + 1e-12); k = int(np.argmax(nr))
        if nr[k] < .5: continue
        if 0 < k < len(nr) - 1: y0, y1, y2 = nr[k - 1], nr[k], nr[k + 1]; k = k + .5 * (y0 - y2) / (y0 - 2 * y1 + y2 + 1e-12)
        ts.append(i / SR); cs.append(1200 * np.log2(SR / (lo + k) / f0))
    return np.array(ts), np.array(cs)
TUNE_LOG = []
def flatten(x, midi_note, name='', keep=1.0):
    """Library-style tuning: shift the sample so its median pitch is exactly the note, and remove the slow drift of
    the section (anything slower than ~2 Hz). Vibrato and the natural fast wobble stay. Time-varying resampling."""
    f0 = 440 * 2 ** ((midi_note - 69) / 12)
    ts, cs = pitch_track(x, f0)
    if len(cs) < 20: return x
    med = np.median(cs); ok = np.abs(cs - med) < 60                       # drop octave / tracking errors
    ts, cs = ts[ok], cs[ok]
    k = 25                                                                  # 250 ms smoothing: the drift
    pad = np.pad(cs, k, mode='edge'); slow = np.convolve(pad, np.ones(2 * k + 1) / (2 * k + 1), 'same')[k:-k]
    t = np.arange(len(x)) / SR; corr = -np.interp(t, ts, slow) * keep      # cents to apply
    rate = 2 ** (corr / 1200); pos = np.concatenate([[0], np.cumsum(rate[:-1])])
    pos = pos[pos < len(x) - 1]
    y = np.interp(pos, np.arange(len(x)), x)
    TUNE_LOG.append((name, round(float(med), 1), round(float(np.ptp(slow)), 1)))
    return y

# ------------------------------------------------------------------ formant shift (children)
def formant_shift(x, alpha, lift=40, n=2048, hop=256):
    """Move the spectral envelope up by alpha (shorter vocal tract) while keeping the pitch: cepstral envelope
    per STFT frame, envelope resampled on the frequency axis, fine structure (harmonics) kept."""
    f, t, Z = stft(x, SR, nperseg=n, noverlap=n - hop)
    mag = np.abs(Z) + 1e-9; ph = np.angle(Z)
    L = np.log(mag)
    c = np.fft.irfft(L, axis=0)                      # real cepstrum per frame
    c[lift:-lift] = 0
    env = np.fft.rfft(c, axis=0).real
    k = np.arange(len(f))
    env2 = np.stack([np.interp(k / alpha, k, env[:, j]) for j in range(env.shape[1])], 1)
    mag2 = np.exp(L - env + env2)
    _, y = istft(mag2 * np.exp(1j * ph), SR, nperseg=n, noverlap=n - hop)
    return y[:len(x)]

def choir():
    vowels = ['ah', 'eh', 'ee', 'oh', 'oo']
    for v in vowels:
        for dyn in ['mf', 'f']:
            B = {midi(re.search(r'_([A-G]s?\d)\.wav', p)[1]): p for p in glob.glob(f'{EC}/samples/B/B_{v}_{dyn}_*.wav')}
            T = {midi(re.search(r'_([A-G]s?\d)\.wav', p)[1]): p for p in glob.glob(f'{EC}/samples/T/T_{v}_{dyn}_*.wav')}
            # bass section alone (ison, organum below)
            for m, p in sorted(B.items()):
                x = rd(p); x = flatten(x[onset(x):], m, os.path.basename(p)); x = fade_out(x, 3.8); enc('bas', f'{v}_{m}_{dyn}', x, 0.5); add_mel('bas', f'{v}_{dyn}', m, f'{v}_{m}_{dyn}')
            # schola: basses and tenors singing the same pitch where both ranges meet
            for m in sorted(set(B) | set(T)):
                parts = []
                if m in B: parts.append(rd(B[m]))
                if m in T: parts.append(rd(T[m]))
                parts = [flatten(p[onset(p):], m, f'schola {v} {m}') for p in parts]; n = min(len(p) for p in parts)
                x = sum(p[:n] for p in parts) / np.sqrt(len(parts))
                x = fade_out(x, 3.8); enc('schola', f'{v}_{m}_{dyn}', x, 0.5); add_mel('schola', f'{v}_{dyn}', m, f'{v}_{m}_{dyn}')
        # children: soprano (and alto below C4) samples with formants raised ~17 %, a little brighter and lighter
        S = {midi(re.search(r'_([A-G]s?\d)\.wav', p)[1]): p for p in glob.glob(f'{EC}/samples/S/S_{v}_mf_*.wav')}
        A = {midi(re.search(r'_([A-G]s?\d)\.wav', p)[1]): p for p in glob.glob(f'{EC}/samples/A/A_{v}_mf_*.wav')}
        src = dict(A); src.update(S)
        for m, p in sorted(src.items()):
            if m < 57: continue
            x = rd(p); x = flatten(x[onset(x):][:int(6.2 * SR)], m, os.path.basename(p))
            y = formant_shift(x, 1.17)
            # thinner chest resonance of a child: gentle low cut
            Y = np.fft.rfft(y); fr = np.fft.rfftfreq(len(y), 1 / SR); Y *= 1 / np.sqrt(1 + (220 / np.maximum(fr, 1)) ** 2); y = np.fft.irfft(Y, len(y))
            y = fade_out(y, 3.8); enc('dzieci', f'{v}_{m}_mf', y, 0.5); add_mel('dzieci', f'{v}_mf', m, f'{v}_{m}_mf')
        print('choir', v, 'tuned', len(TUNE_LOG), 'median |offset| %.1f ct, median drift removed %.1f ct' % (np.median([abs(a) for _, a, _ in TUNE_LOG]), np.median([b for *_, b in TUNE_LOG])), flush=True)

# ------------------------------------------------------------------ organs: sustained with a seamless loop
def loop_points(x, a, b):
    """Find a loop end near b whose waveform matches the start a (autocorrelation), return (a, e)."""
    w = 2048; ref = x[a:a + w]; best, be = -1, b
    for e in range(b - 2000, b + 2000):
        seg = x[e:e + w]
        if len(seg) < w: break
        c = np.dot(ref, seg) / (np.linalg.norm(ref) * np.linalg.norm(seg) + 1e-12)
        if c > best: best, be = c, e
    return a, be, best
def organ():
    sets = [('organy_pleno', 'Aerophones/Edge-blown Aerophones/Pipe Organ/Loud/*.wav', r'_([A-G]#?\d)\.wav'),
            ('organy_ciche', 'Aerophones/Edge-blown Aerophones/Pipe Organ/Quiet/*rr1.wav', r'_([A-G]#?\d)_rr'),
            ('organy_pedal', 'Aerophones/Edge-blown Aerophones/Pipe Organ/Loud Pedal/*.wav', r'_([A-G]#?\d)\.wav'),
            ('pozytyw_8', "Aerophones/Edge-blown Aerophones/Renaissance Organ/8'/*rr1.wav", r'_([A-G]#?\d)_rr'),
            ('pozytyw_pelny', "Aerophones/Edge-blown Aerophones/Renaissance Organ/Full/*rr1.wav", r'_([A-G]#?\d)_rr')]
    for inst, pat, rx in sets:
        files = sorted(glob.glob(f'{VC}/{pat}'))
        xs = []
        for p in files:
            m = midi(re.search(rx, os.path.basename(p))[1]) + (12 if inst in ('organy_ciche', 'pozytyw_8', 'pozytyw_pelny') else 0); x = rd(p); x = x[onset(x, 0.05):]   # these sets are named an octave low (checked by spectrum)
            # stable part: 1.2 s .. 4.2 s ; crossfade the loop seam
            a = int(1.2 * SR); b = int(min(len(x) / SR - 1.5, 4.5) * SR)
            if b - a < SR: a, b = int(0.5 * SR), int((len(x) / SR - 0.8) * SR)
            a, e, q = loop_points(x, a, b)
            body = x[:e].copy(); xf = 2048
            body[e - xf:e] = body[e - xf:e] * np.linspace(1, 0, xf) + x[a - xf:a] * np.linspace(0, 1, xf)
            tail = x[e:e + int(1.2 * SR)].copy(); tail *= np.linspace(1, 0, len(tail)) ** 1.5
            xs.append((m, body, tail, a, e))
        pk = max(np.abs(b).max() for _, b, _, _, _ in xs)
        for m, body, tail, a, e in xs:
            nm = f'{m}'; enc(inst, nm, body, pk); add_mel(inst, 'mf', m, nm, {'loop': [a / SR, e / SR]})
            enc(inst, nm + '_rel', tail, pk)
        print('organ', inst, len(xs), flush=True)

# ------------------------------------------------------------------ bells & metal from VCSL
def bells():
    def mel(inst, pat, rx, layer_rx=None, dur=9.0):
        files = sorted(glob.glob(f'{VC}/{pat}')); xs = []
        for p in files:
            b = os.path.basename(p); m = midi(re.search(rx, b)[1]); lay = (re.search(layer_rx, b) or [None, 'mf'])[1] if layer_rx else 'mf'
            x = rd(p); x = fade_out(x[onset(x, 0.01):], dur); xs.append((m, lay, b, x))
        pk = max(np.abs(x).max() for *_, x in xs)
        for m, lay, b, x in xs:
            nm = re.sub(r'[^A-Za-z0-9_]', '', os.path.splitext(b)[0]); enc(inst, nm, x, pk); add_mel(inst, lay, m, nm)
        print('bells', inst, len(xs), flush=True)
    mel('dzwony_rurowe', 'Idiophones/Struck Idiophones/Tubular Bells 2/*.wav', r'_([A-G]#?\d)_', r'_(v\d)_', 10)
    mel('dzwony_rurowe_stare', 'Idiophones/Struck Idiophones/Tubular Bells 1/*.wav', r'_([A-G]#?\d)_', r'_(pp|p|f|ff)_', 10)
    mel('dzwonki_reczne', 'Idiophones/Struck Idiophones/Hand Chimes/*.wav', r'_([A-G]#?\d)_', None, 8)
    def perc(inst, pat, dur=12.0):
        files = sorted(glob.glob(f'{VC}/{pat}')); xs = []
        for p in files:
            if p.endswith('.mp3'):
                tmp = f'/tmp/_m_{os.getpid()}.wav'; subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', p, tmp], check=True); x = rd(tmp)
            else: x = rd(p)
            x = fade_out(x[onset(x, 0.01):], dur); xs.append((os.path.basename(p), x))
        pk = max(np.abs(x).max() for _, x in xs)
        for b, x in xs:
            nm = re.sub(r'[^A-Za-z0-9_]', '', os.path.splitext(b)[0]); enc(inst, nm, x, pk); add_perc(inst, nm, {'rms': float(20 * np.log10(np.sqrt(np.mean(x[:SR] ** 2)) / pk + 1e-9))})
        print('perc', inst, len(xs), flush=True)
    perc('dzwonki_tybetanskie', 'Idiophones/Struck Idiophones/Hand Bells, Nepalese/*.wav', 8)
    perc('gong', 'Idiophones/Struck Idiophones/Gong 1/*.wav', 14)
    perc('gong_maly', 'Idiophones/Struck Idiophones/Gong 2/*.mp3', 10)
    perc('cymbalki', 'Idiophones/Struck Idiophones/Finger Cymbals/*.wav', 6)
    perc('dzwoneczki_kadzielnicy', 'Idiophones/Struck Idiophones/Sleigh Bells/*.wav', 3)
    perc('kowadlo', 'Idiophones/Struck Idiophones/Anvil/*.wav', 3)

def drums():
    # frame drum: 'dum' = open low hit (large drum), 'tek' = muted / small drum ; darbuka for the high strokes
    files = sorted(glob.glob(f'{VC}/Membranophones/Struck Membranophones/Frame Drum/*.wav')) + sorted(glob.glob(f'{VC}/Membranophones/Struck Membranophones/Darbuka/*vl2*.wav'))
    xs = []
    for p in files:
        b = os.path.basename(p)
        kind = 'dum' if b.startswith('HDrumL_Hit_') else 'tek' if ('HitMuted' in b or b.startswith('HDrumS_Hit_')) else 'dar' if b.startswith('Darbuka') else 'reka'
        x = rd(p); x = fade_out(x[onset(x, 0.01):], 2.0); xs.append((kind, b, x))
    pk = max(np.abs(x).max() for *_, x in xs)
    for kind, b, x in xs:
        nm = kind + '_' + re.sub(r'[^A-Za-z0-9_]', '', os.path.splitext(b)[0]); enc('beben', nm, x, pk); add_perc('beben', nm)
    print('drums', len(xs), flush=True)

# ------------------------------------------------------------------ chains (synthesized)
def link_hit(rng, amp, bright=1.0):
    """One steel link striking another: a short contact click + a handful of inharmonic ring modes."""
    n = int(0.45 * SR); t = np.arange(n) / SR; y = np.zeros(n)
    f1 = rng.uniform(1900, 3600) * bright
    for k, r in enumerate([1.0, 2.62, 4.95, 7.9, 11.6, 15.7]):
        f = f1 * r * rng.uniform(0.97, 1.03)
        if f > 19000: break
        tau = rng.uniform(0.04, 0.16) / (1 + 0.6 * k)
        y += rng.uniform(0.4, 1.0) / (1 + 0.5 * k) * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t / tau)
    c = int(0.0015 * SR); y[:c] += rng.standard_normal(c) * np.linspace(1, 0, c) * 0.8
    return y * amp
def chain(kind, seed):
    rng = np.random.default_rng(seed); dur = {'upadek': 2.2, 'grzechot': 2.6, 'wleczenie': 3.5, 'kadzielnica': 4.0, 'uderzenie': 1.6}[kind]
    n = int(dur * SR); y = np.zeros(n + SR)
    def put(tm, amp, bright=1.0):
        i = int(tm * SR); h = link_hit(rng, amp, bright); y[i:i + len(h)] += h[:len(y) - i]
    if kind in ('upadek', 'uderzenie'):
        # chain lands on stone: a dense burst, then links settle with fewer and softer touches
        thud_t = np.arange(int(0.25 * SR)) / SR
        y[:len(thud_t)] += 0.5 * np.sin(2 * np.pi * rng.uniform(70, 110) * thud_t) * np.exp(-thud_t / 0.05) * (1 if kind == 'upadek' else 0.6)
        m = 60 if kind == 'upadek' else 30; tt = 0.0
        for i in range(m):
            tt += rng.exponential(0.004 + 0.02 * (i / m) ** 2 * (2 if kind == 'upadek' else 1))
            put(tt, np.exp(-tt / (0.5 if kind == 'upadek' else 0.3)) * rng.uniform(0.3, 1.0))
    elif kind == 'grzechot':
        for s in range(4):                        # shaken: bursts at each change of direction
            base = 0.15 + s * 0.55
            for i in range(int(rng.integers(8, 18))): put(base + rng.exponential(0.03), rng.uniform(0.2, 0.9) * (1 - s * 0.15))
    elif kind == 'wleczenie':
        tt = 0.05
        while tt < dur - 0.3: put(tt, rng.uniform(0.05, 0.4) * (0.6 + 0.4 * np.sin(tt * 3)), 0.8); tt += rng.exponential(0.018)
        fr = rng.standard_normal(n); fr = np.convolve(fr, np.ones(6) / 6, 'same'); y[:n] += 0.04 * fr * np.minimum(1, np.arange(n) / (0.2 * SR))
    elif kind == 'kadzielnica':
        # censer swinging on chains: clinks at both ends of every swing
        T = rng.uniform(1.1, 1.4)
        for s in range(int(dur / (T / 2))):
            base = 0.1 + s * T / 2
            for i in range(int(rng.integers(3, 8))): put(base + rng.exponential(0.015), rng.uniform(0.2, 0.7))
    y = y[:n]; y[-int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR))
    return y
def chains():
    for kind in ['uderzenie', 'upadek', 'grzechot', 'wleczenie', 'kadzielnica']:
        for v in range(4):
            x = chain(kind, 100 * v + len(kind)); enc('lancuchy', f'{kind}_{v}', x, np.abs(x).max()); add_perc('lancuchy', f'{kind}_{v}')
    print('chains', flush=True)

if __name__ == '__main__':
    what = sys.argv[1:] or ['choir', 'organ', 'bells', 'chains']
    if os.path.exists(f'{OUT}/manifest.json'): manifest.update(json.load(open(f'{OUT}/manifest.json')))
    for w in what:
        for k in [k for k in list(manifest) if (w == 'choir' and k in ('bas', 'schola', 'dzieci')) or (w == 'organ' and k.startswith(('organy', 'pozytyw'))) or (w == 'chains' and k == 'lancuchy') or (w == 'drums' and k == 'beben') or (w == 'bells' and k in ('dzwony_rurowe', 'dzwony_rurowe_stare', 'dzwonki_reczne', 'dzwonki_tybetanskie', 'gong', 'gong_maly', 'cymbalki', 'dzwoneczki_kadzielnicy', 'kowadlo'))]: del manifest[k]
        globals()[w]()
        json.dump(manifest, open(f'{OUT}/manifest.json', 'w'), indent=0)
