"""Synthesise the reel's sound effects so no third-party audio is needed."""
import numpy as np, wave, os
SR = 48000
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'sfx')
rng = np.random.default_rng(7)

def save(name, x):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.9
    st = np.stack([x, x], 1)
    with wave.open(os.path.join(out, name), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())

def t(sec): return np.arange(int(SR * sec)) / SR
def env(n, a, d):  # attack/decay in seconds
    tt = np.arange(n) / SR
    return np.minimum(1, tt / max(a, 1e-4)) * np.exp(-tt / d)
def bandpass(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))

# card dealt onto felt: soft swish + small slap
n = int(SR * 0.22)
sw = bandpass(rng.normal(size=n), 1500, 9000) * env(n, 0.03, 0.05)
slap = bandpass(rng.normal(size=n), 300, 3000) * np.r_[np.zeros(int(SR*0.05)), env(n - int(SR*0.05), 0.001, 0.015)]
save('card.wav', sw * 0.7 + slap)

# card flip: quick double flick
n = int(SR * 0.16)
a = bandpass(rng.normal(size=n), 2500, 11000) * env(n, 0.002, 0.012)
b = np.roll(a, int(SR * 0.05)) * 0.7
save('flip.wav', a + b)

# chips: a few ceramic clicks with ring
n = int(SR * 0.45); x = np.zeros(n)
for k, dt in enumerate([0, 0.045, 0.085, 0.14, 0.2]):
    s = int(SR * dt); m = n - s
    tone = sum(np.sin(2 * np.pi * f * np.arange(m) / SR) for f in (3200 + 300 * k, 5100 - 200 * k, 7400))
    x[s:] += tone * env(m, 0.0005, 0.02) * (1 - 0.12 * k)
x += bandpass(rng.normal(size=n), 2000, 9000) * env(n, 0.001, 0.03) * 0.3
save('chips.wav', x)

# impact: low boom + noise hit (hook and reveal)
tt = t(0.9)
boom = np.sin(2 * np.pi * (55 + 60 * np.exp(-tt * 18)) * tt) * np.exp(-tt * 4.5)
hit = bandpass(rng.normal(size=len(tt)), 200, 6000) * env(len(tt), 0.001, 0.06)
save('impact.wav', boom + hit * 0.5)

# whoosh: filtered noise sweep (hook exit)
tt = t(0.55); n = len(tt)
nz = rng.normal(size=n); y = np.zeros(n)
for i in range(0, n, 1024):
    seg = nz[i:i + 1024]
    c = 600 + 5000 * (i / n)
    y[i:i + len(seg)] = bandpass(seg, c * 0.6, c * 1.6)
save('whoosh.wav', y * np.sin(np.pi * tt / tt[-1]) ** 2)

# win: bright rising chime
tt = t(1.4)
ch = sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt * (2.5 + i)) for i, f in enumerate((880, 1318.5, 1760, 2637)))
save('win.wav', ch)
print('ok')
