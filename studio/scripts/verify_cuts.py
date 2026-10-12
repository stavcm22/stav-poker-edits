"""Check every cut in a rendered reel: quiet at the edges, and each part matches the source audio."""
import json, subprocess, sys, numpy as np
job = json.load(open(sys.argv[1])); out = sys.argv[2]; hook = float(sys.argv[3])
src = 'public/' + job['src']
def load(path):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
    return np.frombuffer(pcm, np.int16).astype(float) / 32768
S, O = load(src), load(out)
def db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)
sr = 16000; acc = hook; ok = True
for i, s in enumerate(job['segments']):
    a, b = s['from'], s['to']; d = b - a
    so = S[int(a * sr):int(b * sr)]
    oo = O[int(acc * sr):int((acc + d) * sr)]
    n = min(len(so), len(oo))
    # correlation of the voice inside the part (skip the faded edges)
    k = int(0.15 * sr)
    c = np.corrcoef(so[k:n - k], oo[k:n - k])[0, 1]
    tail_out = db(O[int((acc + d - 0.04) * sr):int((acc + d) * sr)])
    head_out = db(O[int(acc * sr):int((acc + 0.04) * sr)])
    flag = 'OK' if c > 0.6 else 'CHECK'
    if c <= 0.6: ok = False
    print(f'part {i+1}: src {a:6.2f}-{b:6.2f} -> out {acc:6.2f}-{acc+d:6.2f}  match {c:.2f}  head {head_out:6.1f} dB  tail {tail_out:6.1f} dB  {flag}')
    acc += d
print('ALL PARTS MATCH' if ok else 'SOME PARTS NEED A LOOK')
