"""Build jobs/mani-run-it-twice.json: Mani's jacks vs K-J, asked to run it twice, villain refused, king on the turn."""
import json, os, subprocess, numpy as np
ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'public/input/noamdor-src.mp4')
words = [w for s in json.load(open(os.path.join(ROOT, 'scripts/data/mani_rit2_transcript.json'))) for w in s['words']]
T = lambda i: round(words[i]['s'], 3)

pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', SRC, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
x = np.frombuffer(pcm, np.int16).astype(float) / 32768
n = len(x) // 160
db = 20 * np.log10(np.sqrt(np.mean(x[:n * 160].reshape(n, 160) ** 2, 1)) + 1e-12)
sm = np.convolve(db, np.ones(3) / 3, 'same')
fr = lambda t: int(round(t * 100))

def quiet(lo, hi, prefer):
    lo, hi = max(0, lo), min(len(sm) / 100 - 0.01, hi)
    seg = sm[fr(lo):fr(hi) + 1]
    if len(seg) == 0: return lo
    m = seg.min()
    idx = [i for i, v in enumerate(seg) if v <= m + 3]
    return round(lo + (idx[-1] if prefer == 'late' else idx[0]) / 100, 3)

def passage(i0, i1):
    a, b = words[i0]['s'], words[i1]['e']
    prev_e = words[i0 - 1]['e'] if i0 > 0 else 0
    next_s = words[i1 + 1]['s'] if i1 + 1 < len(words) else b + 0.6
    cin = quiet(max(prev_e, a - 0.6), a + 0.02, 'late')
    cout = quiet(b, min(next_s, b + 0.45), 'early')
    return {'from': cin, 'to': round(min(cout + 0.04, len(sm) / 100 - 0.05), 3)}

R = [(3, 7), (19, 34), (94, 129), (130, 135), (146, 169), (216, 245)]
FIX = {96: '', 97: '', 99: 'משנה,', 19: 'משלם,', 20: 'משלם,', 23: '450.', 109: 'מה', 111: 'בזה?', 115: "צ'ק.", 116: '', 120: 'דוחף', 147: 'רוצה',
       149: 'שורף,', 150: 'קינג.', 151: 'שורף,', 152: '10.', 156: "ג'ק.", 157: '', 165: 'טילט', 169: '',
       216: 'איזה', 217: 'מעצבן,', 219: 'אחי,', 222: 'אותי,', 226: "ג'ק", 227: '', 229: "ג'קים?", 230: '', 235: 'לקרות,', 240: 'אותך,', 242: 'המצב,'}
HL = {7, 23, 27, 34, 103, 106, 107, 108, 115, 120, 121, 124, 127, 134, 135, 147, 148, 150, 152, 155, 156, 161, 165, 167, 168, 217, 221, 229, 242, 244}

CUT_IN = {94: 36.91, 216: 91.59}  # measured pauses where the recogniser's word edges run together
segs = []
for a, b in R:
    g = passage(a, b)
    if a in CUT_IN: g['from'] = CUT_IN[a]
    segs.append(g)
caps = []
for i0, i1 in R:
    for i in range(i0, i1 + 1):
        w = FIX.get(i, words[i]['w'].strip())
        if w: caps.append({'t': T(i), 'w': w, **({'hl': True} if i in HL else {})})

# what the camera shows: Mani alone (crop on him) or the hosts' two-shot (shown whole in a frame)
MODES = []
hosts = [(18.0, 18.75), (25.0, 26.0), (28.25, 29.75), (30.75, 32.0), (33.75, 34.75), (51.25, 52.25), (54.5, 55.5), (61.5, 63.25),
         (64.25, 65.25), (72.5, 74.75), (75.0, 75.5), (77.25, 78.25), (79.5, 81.5), (85.5, 86.5), (87.75, 88.75), (90.25, 91.25),
         (92.25, 93.25), (96.0, 97.0), (98.0, 98.75), (100.75, 101.0)]
t = 0.0
for a, b in hosts:
    if a > t: MODES.append([t, a, 'face', 1010])
    MODES.append([a, b, 'wide'])
    t = b
MODES.append([t, 103.0, 'face', 1010])

job = {
  'src': 'input/noamdor-src.mp4',
  'title': 'No Limit - Mani: asked to run it twice, he said no',
  'brand': 'NOLIMIT',
  'handle': '@nolimit__podcast',
  'deck': 'nolimit',
  'layout': 'full',
  'modes': MODES,
  'segments': segs,
  'words': caps,
  'headline': {'lines': ['ביקשתי לרוץ פעמיים', 'והוא סירב...'], 'hl': 'סירב', 'until': segs[1]['from'] + 1.6},
  'speaker': {'name': 'מני מלכה', 'at': segs[0]['from'] + 0.2, 'until': segs[1]['from'] + 2.2},
  'hudFrom': segs[0]['from'] + 0.1,
  'pot': [[T(7), 75], [T(19), 150], [T(20), 225], [T(23), 675], [T(30), 1050], [T(121), 2000], [T(125), 2850]],
  'board': ['Ac', '9d', '3h', 'Ks', 'Tc'],
  'boardAt': [T(106), T(107), T(108), T(150), T(152)],
  'players': [
    {'id': 'mani', 'name': 'מני', 'cards': ['Js', 'Jh'], 'side': 'left'},
    {'id': 'vil', 'name': 'VILLAIN', 'cards': ['Kd', 'Jc'], 'hiddenUntil': T(155), 'side': 'right'},
  ],
  'actions': {
    'mani': [[0, ''], [T(23), 'RAISE 450'], [T(100), ''], [T(114), 'CHECK'], [T(124), 'CALL', True], [T(149), '']],
    'vil': [[0, ''], [T(6), 'BET 75'], [T(30), 'CALL 450'], [T(100), ''], [T(121), 'ALL-IN 950', True], [T(149), ''], [T(161), 'WINS 2,850', True]],
  },
  'strength': {
    'mani': [[0, 'JACKS'], [T(161), 'JACKS · LOSES']],
    'vil': [[0, ''], [T(155), 'KINGS']],
  },
  'prompt': {'at': T(133), 'until': T(149) + 0.1, 'question': 'RUN IT TWICE?', 'yes': 'מני', 'no': 'הוא', 'picked': 'no', 'pickAt': T(146)},
  'callouts': [[T(161) + 0.05, 'BAD BEAT']],
  'win': {'at': T(161), 'player': 'vil', 'cards': ['Kd', 'Ks', 'Ac', 'Jc', 'Tc']},
  'equity': {'player': 'מני', 'values': [['PRE', 68], ['FLOP', 86], ['TURN', 2], ['RIVER', 0]], 'at': T(216) + 0.2},
}
json.dump(job, open(os.path.join(ROOT, 'jobs/mani-run-it-twice.json'), 'w'), ensure_ascii=False, indent=1)
d = sum(s['to'] - s['from'] for s in segs)
print(f'{len(segs)} parts, {d:.1f}s')
for s in segs: print(f"  {s['from']:7.2f}-{s['to']:7.2f}  in {sm[fr(s['from'])]:6.1f} dB  out {sm[fr(s['to']) - 1]:6.1f} dB")
