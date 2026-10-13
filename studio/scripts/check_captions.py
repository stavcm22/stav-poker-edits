"""Check a rendered reel's captions against what is actually said in it.

Transcribes the rendered audio (speech recognition, word timestamps), maps every caption word to its time
in the reel, and lists: caption words with no matching spoken word nearby, spoken words with no caption
nearby (to judge: fillers are left out on purpose), and caption timing drift.

usage: check_captions.py <job.json> <reel.mp4|wav>
"""
import json, sys, subprocess, re, numpy as np
from difflib import SequenceMatcher
from faster_whisper import WhisperModel
job = json.load(open(sys.argv[1])); reel = sys.argv[2]
FPS = 30
def to_out(t):
    acc = 0
    for s in job['segments']:
        d = round((s['to'] - s['from']) * FPS) / FPS
        if s['from'] <= t < s['to']: return acc + t - s['from']
        acc += d
    return None
caps = [(to_out(w['t']), w['w']) for w in job['words'] if to_out(w['t']) is not None]
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', reel, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
m = WhisperModel('ivrit-ai/whisper-large-v3-ct2', device='cpu', compute_type='int8', cpu_threads=4)
segs, _ = m.transcribe(audio, language='he', word_timestamps=True, beam_size=5, condition_on_previous_text=False)
said = [(w.start, w.word.strip()) for s in segs for w in s.words]
norm = lambda w: re.sub(r"[^\w']", '', w.replace('׳', "'")).replace('״', '')
print(f'{len(caps)} caption words, {len(said)} recognised words')
used = set()
miss = []
for t, w in caps:
    best = None
    for i, (st, sw) in enumerate(said):
        if abs(st - t) > 1.2: continue
        r = SequenceMatcher(None, norm(w), norm(sw)).ratio()
        if best is None or r > best[0]: best = (r, i, st, sw)
    if best and best[0] >= 0.6:
        used.add(best[1])
        if abs(best[2] - t) > 0.35: print(f'  timing  {t:6.2f}  "{w}"  said at {best[2]:6.2f}  ({best[2]-t:+.2f}s)')
    else:
        miss.append((t, w, best[3] if best else '-'))
print('caption words not heard nearby (check by ear / against the source passes):')
for t, w, b in miss: print(f'  {t:6.2f}  "{w}"   nearest recognised: "{b}"')
print('recognised words with no caption (fillers are dropped on purpose):')
print('  ' + ' | '.join(f'{st:.1f}:{sw}' for i, (st, sw) in enumerate(said) if i not in used))
