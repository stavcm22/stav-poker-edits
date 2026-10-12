"""Check every cut in a rendered reel against the source speech.

For each kept part: find the exact offset of the part inside the render (speech envelopes,
10 ms steps), report how well the speech matches, and how loud the audio is right at each cut.
"""
import json, subprocess, sys, numpy as np
job = json.load(open(sys.argv[1])); out = sys.argv[2]; hook = float(sys.argv[3])
FPS = 30
def env(path):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
    x = np.frombuffer(pcm, np.int16).astype(float) / 32768
    n = len(x) // 160
    return 20 * np.log10(np.sqrt(np.mean(x[:n * 160].reshape(n, 160) ** 2, 1)) + 1e-9)
envs = {}
O = env(out)
acc_f = round(hook * FPS); ok = True
for i, s in enumerate(job['segments']):
    sp = s.get('src', job['src'])
    S = envs.setdefault(sp, env('public/' + sp)) if sp not in envs else envs[sp]
    a_f, d_f = round((s['from'] + s.get('srcOffset', 0)) * FPS), round((s['to'] - s['from']) * FPS)   # what Remotion actually plays
    a, d, o0 = a_f / FPS, d_f / FPS, acc_f / FPS
    src = S[int(a * 100):int((a + d) * 100)]
    best = (-2, 0)
    for lag in range(-15, 16):
        seg = O[int(o0 * 100) + lag:int(o0 * 100) + lag + len(src)]
        if len(seg) < len(src): continue
        c = np.corrcoef(np.clip(src[8:-8], -70, 0), np.clip(seg[8:-8], -70, 0))[0, 1]
        if c > best[0]: best = (c, lag)
    c, lag = best
    edge_in, edge_out = S[int(a * 100)], S[int((a + d) * 100) - 1]
    good = c > 0.9 and abs(lag) <= 3
    ok &= good
    print(f'part {i+1}: src {a:6.2f}-{a+d:6.2f}  out {o0:6.2f}  speech match {c:.3f}  offset {lag*10:+d} ms  '
          f'level at cut-in {edge_in:6.1f} dB  at cut-out {edge_out:6.1f} dB  {"OK" if good else "CHECK"}')
    acc_f += d_f
print('ALL PARTS MATCH THE SOURCE' if ok else 'SOME PARTS NEED A LOOK')
