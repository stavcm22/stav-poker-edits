"""Build jobs/mani-run-it-twice.json: Mani's jacks vs K-J, asked to run it twice, villain refused, king on the turn."""
import json, os, subprocess, numpy as np
ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'public/input/noamdor-long.mp4')  # same clip as noamdor-src, same timing, runs on past 102s
words = [w for s in json.load(open(os.path.join(ROOT, 'scripts/data/mani_rit2_transcript.json'))) for w in s['words']]
T = lambda i: round(words[i]['s'], 3)

def envelope(path):
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
    x = np.frombuffer(pcm, np.int16).astype(float) / 32768
    n = len(x) // 160
    db = 20 * np.log10(np.sqrt(np.mean(x[:n * 160].reshape(n, 160) ** 2, 1)) + 1e-12)
    return np.convolve(db, np.ones(3) / 3, 'same')
sm = envelope(SRC)
fr = lambda t: int(round(t * 100))

def quiet(lo, hi, prefer, sm=sm):
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

R = [(3, 34), (94, 129), (130, 135), (146, 169), (184, 195), (216, 245)]
FILLER = {16, 123, 162, 193, 218, 219, 245}  # "אחי" / "כאילו": kept in the sound, not in the captions
FIX = {13: 'היד.', 15: 'מסתכל,', 147: 'רצים', 195: 'ככה.', 94: '', 95: '', 96: '', 97: '', 99: 'משנה,', 23: '450.', 109: 'מה', 111: 'בזה?', 115: "צ'ק.", 116: '', 120: 'סחורה?',
       149: 'שורף,', 150: 'קינג.', 151: 'שורף,', 152: '10.', 156: "ג'ק.", 157: '', 165: 'טילט', 169: '',
       216: 'איזה', 217: 'מעצבן,', 222: 'אותי,', 226: "ג'ק", 227: '', 229: "ג'קים?", 230: '', 235: 'לקרות,', 240: 'אותך,', 242: 'המצב,', 244: 'המצב.'}
HL = {7, 23, 27, 34, 103, 106, 107, 108, 115, 120, 121, 124, 127, 134, 135, 147, 148, 150, 152, 155, 156, 161, 165, 167, 168, 187, 190, 217, 221, 229, 242, 244}

CUT_IN = {94: 36.91, 184: 80.08, 216: 91.59}  # measured pauses where the recogniser's word edges run together
CUT_OUT = {184: 82.46, 216: 105.88}  # 184: Dor's line runs straight into crosstalk, the dip after "לא ככה"; 216: Dor's last line, before the laugh
segs = []
for a, b in R:
    g = passage(a, b)
    if a in CUT_IN: g['from'] = CUT_IN[a]
    if a in CUT_OUT: g['to'] = CUT_OUT[a]
    segs.append(g)
caps = []
for i0, i1 in R:
    for i in range(i0, i1 + 1):
        w = '' if i in FILLER else FIX.get(i, words[i]['w'].strip())
        if w: caps.append({'t': T(i), 'w': w, **({'hl': True} if i in HL else {})})
# Dor closes it (past the end of the first file): "אתה יושב כזה ואומר, איזה שולחן טוב, שולחן טוב, ואתה במינוס."
tail = [w for w in json.load(open(os.path.join(ROOT, 'scripts/data/mani_rit2_tail.json'))) if 102.5 < w['s'] < 105.8]
caps += [{'t': w['s'], 'w': w['w'].strip(), **({'hl': True} if w['w'].strip().rstrip(',.') in ('שולחן', 'במינוס') else {})} for w in tail]

# the opening comes from the part of the episode just before (context-src): Mani sets the story up
CTX = 'input/context-src.mp4'
OFF = 1000.0  # context parts run on their own clock: reel time = source time - OFF, so they sit before everything else
csm = envelope(os.path.join(ROOT, 'public', CTX))
cw = [w for s in json.load(open(os.path.join(ROOT, 'scripts/data/mani_rit2_context_transcript.json'))) for w in s['words']]
# "I'll tell you a hand from a few days ago" / who the player was + "the tilt hand of my life" / jacks in the small, limps, didn't notice it was his turn
CR = [(83, 91), (104, 129), (130, 153)]
CFIX = {83: '', 87: 'יד', 104: 'ישב', 105: 'מולי...', 108: 'שמות.', 111: 'אמר,', 123: '', 125: 'יד', 128: 'החיים.', 129: '', 132: "ג'קים", 133: '', 134: 'בסמול.'}
CHL = {87, 110, 117, 121, 126, 128, 132, 138, 144, 148, 149, 150}
intro, icaps = [], []
for a, b in CR:
    s0, e1 = cw[a]['s'], cw[b]['e']
    pe = cw[a - 1]['e']
    ns = cw[b + 1]['s']
    cin = {104: 40.75}.get(a) or quiet(max(pe, s0 - 0.6), s0 + 0.02, 'late', csm)  # 104: speech starts right on a camera cut, so open on the hosts listening  # 124: dip between "אחי," and "זה", after the camera cut
    cout = quiet(e1, min(ns, e1 + 0.45), 'early', csm)
    intro.append({'from': round(cin - OFF, 3), 'to': round(cout + 0.04 - OFF, 3), 'src': CTX, 'srcOffset': OFF})
    for i in range(a, b + 1):
        w = CFIX.get(i, cw[i]['w'].strip())
        if w: icaps.append({'t': round(cw[i]['s'] - OFF, 3), 'w': w, **({'hl': True} if i in CHL else {})})
segs = intro + segs
caps = icaps + caps
HUD_FROM = round(cw[130]['s'] - OFF - 0.1, 3)  # the cards come in on "I've got jacks"

# what the camera shows, shot by shot (exact cuts, faces found by scripts/shot_faces.py): full screen on one face,
# on a two-shot the one who is talking (most mouth movement)
def shot_modes(path, grid, off=0.0, pick=None):
    # cut times are snapped onto the file's frame timestamps (grid + k/25), the instant the new shot's first frame shows
    snap = lambda t: round(round((t - grid) * 25) / 25 + grid + 0.002, 3)
    out = []
    for i, sh in enumerate(json.load(open(os.path.join(ROOT, path)))):
        f = sh['faces'][pick[i]] if pick and i in pick else max(sh['faces'], key=lambda f: f['talk'])
        m = [round(snap(sh['from']) - off, 3), round(snap(sh['to']) - off, 3), 'face', f['x'], f['y']]
        xs = [p[1] for p in f['track']]
        if max(xs) - min(xs) > 160:  # someone moving a lot in this shot: follow the face along a smoothed path
            tr = np.array(f['track'], float)
            k = np.ones(5) / 5
            pad = lambda v: np.convolve(np.pad(v, 2, mode='edge'), k, 'valid')
            m.append([[round(t - off, 2), int(x), int(y)] for t, x, y in zip(tr[:, 0], pad(tr[:, 1]), pad(tr[:, 2]))])
        out.append(m)
    out[0][0] = round(-off if off else 0.0, 3)
    out[-1][1] = round(-900.0 if off else 151.0, 3)
    return out
MODES = shot_modes('scripts/data/mani_rit2_ctx_shots.json', 0.0333, OFF) + shot_modes('scripts/data/mani_rit2_shots.json', 0.025)

job = {
  'src': 'input/noamdor-long.mp4',
  'title': 'No Limit - Mani: asked to run it twice, he said no',
  'brand': 'NOLIMIT',
  'handle': '@nolimit__podcast',
  'deck': 'nolimit',
  'layout': 'full',
  'modes': MODES,
  'potPos': 'bottom',
  'faceAt': 600,
  'eqTop': 56,
  'eqScale': 0.78,
  'logo': False,
  'calm': True,
  'chipRain': False,
  'segments': segs,
  'words': caps,
  'hudFrom': HUD_FROM,
  'pot': [[T(7), 75], [T(19), 150], [T(20), 225], [T(23), 675], [T(30), 1050], [T(121), 2000], [T(125), 2850]],
  'board': ['Ac', '9d', '3h', 'Ks', 'Tc'],
  'boardAt': [T(106), T(107), T(108), T(150), T(152)],
  'players': [
    {'id': 'mani', 'name': 'מני', 'cards': ['Js', 'Jh'], 'side': 'left'},
    {'id': 'vil', 'name': 'VILLAIN', 'cards': ['Kd', 'Jc'], 'hiddenUntil': T(155), 'side': 'right'},
  ],
  'actions': {
    'mani': [[round(cw[147]['s'] - OFF, 3), 'LIMP'], [T(23), 'RAISE 450'], [T(100), ''], [T(114), 'CHECK'], [T(124), 'CALL', True], [T(149), '']],
    'vil': [[0, ''], [T(6), 'BET 75'], [T(30), 'CALL 450'], [T(100), ''], [T(121), 'ALL-IN 950', True], [T(149), ''], [T(161), 'WINS 2,850', True]],
  },
  'strength': {
    'mani': [[HUD_FROM + 0.6, 'JACKS'], [T(161), 'JACKS · LOSES']],
    'vil': [[0, ''], [T(155), 'KINGS']],
  },
  'win': {'at': T(161), 'player': 'vil', 'cards': ['Kd', 'Ks', 'Ac', 'Jc', 'Tc']},
  'equity': {'player': 'מני', 'values': [['PRE', 68], ['FLOP', 86], ['TURN', 2], ['RIVER', 0]], 'at': T(216) + 0.2},
}
json.dump(job, open(os.path.join(ROOT, 'jobs/mani-run-it-twice.json'), 'w'), ensure_ascii=False, indent=1)
d = sum(s['to'] - s['from'] for s in segs)
print(f'{len(segs)} parts, {d:.1f}s')
for s in segs:
    e, o = (csm, OFF) if s.get('src') else (sm, 0)
    print(f"  {s['from'] + o:7.2f}-{s['to'] + o:7.2f}  in {e[fr(s['from'] + o)]:6.1f} dB  out {e[fr(s['to'] + o) - 1]:6.1f} dB  {s.get('src', '')}")
