"""Build the two WSOP 2026 reels (10-10 full house, Q-Q vs combo draw) from the transcript.

Captions use the recogniser's word timings (corrected text), cuts land in the quietest point
next to each kept passage, and every HUD event is tied to the word that says it.
"""
import json, os, subprocess, numpy as np
ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'public/input/new-src.mp4')
words = [w for s in json.load(open(os.path.join(ROOT, 'scripts/data/rafi_wsop_transcript.json'))) for w in s['words']]
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
    k = idx[-1] if prefer == 'late' else idx[0]
    return round(lo + k / 100, 3)

def passage(i0, i1):
    """keep words i0..i1; cut in the quiet just before i0 and just after i1"""
    a, b = words[i0]['s'], words[i1]['e']
    prev_e = words[i0 - 1]['e'] if i0 > 0 else 0
    next_s = words[i1 + 1]['s'] if i1 + 1 < len(words) else b + 0.6
    cin = quiet(max(prev_e, a - 0.6), a + 0.02, 'late')
    cout = quiet(b, min(next_s, b + 0.45), 'early')
    return {'from': cin, 'to': round(cout + 0.04, 3)}

def caps(ranges, fixes, drop=(), hl=()):
    out = []
    for i0, i1 in ranges:
        for i in range(i0, i1 + 1):
            if i in drop: continue
            w = fixes.get(i, words[i]['w'].strip())
            if not w: continue
            out.append({'t': T(i), 'w': w, **({'hl': True} if i in hl else {})})
    return out

MODES = [[0, 7.25, 'face', 1000], [7.25, 16.25, 'table'], [16.25, 18.25, 'face', 900], [18.25, 32.75, 'table'],
         [32.75, 46.25, 'face', 930], [46.25, 78.5, 'table'], [78.5, 105.5, 'face', 870], [105.5, 117.0, 'table'],
         [117.0, 123.0, 'broll', 860], [123.0, 133.5, 'broll', 830], [133.5, 139.25, 'broll', 960], [139.25, 142.5, 'table'],
         [142.5, 147.5, 'face', 1040], [147.5, 193.75, 'table'], [193.75, 205.25, 'broll', 760], [205.25, 211.5, 'table'],
         [211.5, 217.0, 'face', 780]]
PIP = {'x': 1310, 'y': 30, 'w': 590, 'h': 332}
COMMON = {'event': 'WSOP 2026 · LAS VEGAS', 'src': 'input/new-src.mp4', 'brand': 'RAFIVEGAS', 'credit': 'עריכה: @stavcm', 'layout': 'full', 'modes': MODES, 'pip': PIP}

# ---------------- hand 1: 10-10, set, river full house vs A-J bluff ----------------
R1 = [(35, 57), (71, 107), (108, 124), (125, 162), (163, 171), (215, 221), (222, 263), (264, 267), (268, 275), (276, 295)]
F1 = {39: 'בסמול.', 41: 'שעשיתי', 42: 'לו', 43: '4-בט', 44: 'ביד', 46: 'הקודמת,', 49: 'ל-500', 54: '2,000,', 55: '',
      76: 'מאוסטריה,', 88: 'CAPABLE.', 103: 'לבלף', 109: 'עם', 110: 'עשיריות.', 120: 'ב-1,700,', 121: '', 122: '',
      125: 'טרן', 129: 'שיש', 141: 'עשיריות.', 159: '4.5,', 160: '', 171: 'פול-האוס.', 190: '', 191: '',
      227: 'אול-אין', 228: '', 262: '5.5,', 263: '', 271: "ג'ק", 272: '', 274: 'אס', 275: 'ספייד.', 281: '', 289: 'להדיח', 293: 'להקטין'}
H1 = {39, 43, 50, 54, 77, 88, 103, 110, 113, 114, 115, 117, 120, 127, 140, 159, 166, 167, 171, 219, 221, 227, 249, 251, 252, 256, 262, 265, 267, 270, 271, 275, 276, 289, 291}
segs1 = [passage(a, b) for a, b in R1]
# real table footage of the showdown, kept with its own table sound
segs1.insert(next(i for i, g in enumerate(segs1) if g['from'] > 120), {'from': 120.3, 'to': 127.6})  # Rafi turns over his tens next to the full board
job1 = dict(COMMON)
job1.update({
  'title': 'Rafi Vegas - WSOP 2026: down-bet on a full house',
  'segments': segs1,
  'words': caps(R1, F1, hl=H1),
  'tag': {'text': 'רפי וגאס', 'sub': 'WSOP 2026 · LAS VEGAS', 'at': segs1[0]['from'], 'until': segs1[0]['from'] + 2.3},
  'hudFrom': segs1[0]['from'] + 0.1,
  'pot': [[T(35), 700], [T(50), 1200], [T(54), 3100], [T(57), 4600], [T(121), 6300], [T(124), 8000], [T(159), 12500], [T(162), 17000],
          [T(262), 22500], [T(265), 49200], [T(267), 70400]],
  'board': ['Ks', 'Ts', '6h', '9s', '6c'],
  'boardAt': [T(113), T(114), T(117), T(127), T(167)],
  'players': [
    {'id': 'rafi', 'name': 'רפי', 'cards': ['Th', 'Tc'], 'side': 'left'},
    {'id': 'btn', 'name': 'BUTTON', 'cards': ['As', 'Jh'], 'hiddenUntil': T(270), 'side': 'right'},
  ],
  'actions': {
    'rafi': [[0, ''], [T(53), 'RAISE 2,000'], [T(111), ''], [T(119), 'BET 1,700'], [T(125), ''], [T(158), 'BET 4,500'], [T(163), ''],
             [T(261), 'BET 5,500'], [T(266), 'CALL', True], [T(270) + 0.6, 'WINS 70,400', True]],
    'btn': [[0, ''], [T(47), 'RAISE 500'], [T(57), 'CALL 2,000'], [T(111), ''], [T(124), 'CALL 1,700'], [T(125), ''], [T(162), 'CALL 4,500'],
            [T(163), ''], [T(265), 'ALL-IN 26,700', True], [T(270) + 0.6, '']],
  },
  'strength': {
    'rafi': [[0, 'PAIR'], [T(114), 'SET'], [T(167), 'FULL HOUSE'], [T(270) + 0.6, 'TENS FULL']],
    'btn': [[0, ''], [T(270), 'BLUFF']],
  },
  'seats': {'hero': 'SB', 'villain': 'BTN', 'heroName': 'רפי', 'villainName': 'BUTTON'},
  'teaser': [segs1[[g['from'] for g in segs1].index(113.08)]['from'], segs1[[g['from'] for g in segs1].index(113.08)]['to']],
  'bustAt': T(276),
  'callouts': [[T(167) + 0.15, 'FULL HOUSE!'], [T(265), 'ALL-IN!'], [T(270) + 0.05, 'BLUFF!']],
  'win': {'at': T(270) + 0.6, 'player': 'rafi', 'cards': ['Th', 'Tc', 'Ts', '6h', '6c']},
  'equity': {'player': 'רפי', 'values': [['PRE', 57], ['FLOP', 83], ['TURN', 75], ['RIVER', 100]], 'at': T(276) + 0.4, 'gain': 'POT 70,400'},
  'hook': {'stat': 'FULL HOUSE', 'statLabel': 'בריבר, מול שחקן שיודע לבלף', 'head': ['הימרתי קטן', 'והוא דחף אול-אין'], 'hlWord': 'אול-אין', 'show': ['Th', 'Tc', 'Ts', '6h', '6c']},
})

# ---------------- hand 2: Q-Q all-in vs 9-9 straight + flush draw ----------------
R2 = [(299, 330), (331, 332), (333, 335), (336, 337), (338, 342), (343, 345), (346, 347), (348, 353), (354, 362), (363, 371), (372, 375), (378, 381), (382, 385), (386, 392)]
F2 = {300: 'פותח', 301: 'אנדר', 302: 'דה', 303: 'גאן,', 308: '60,000', 309: '', 312: 'לשלוש', 317: 'קווינס,', 318: 'בלי', 319: 'יהלום,',
      323: 'לשלוש', 324: 'עשרה', 342: 'לתוך', 343: '29,', 340: '12,000', 341: '', 346: 'טרן', 382: 'בריבר', 384: 'אס ספייד,'}
H2 = {317, 324, 325, 333, 334, 335, 337, 340, 343, 345, 348, 349, 352, 357, 359, 362, 366, 371, 372, 379, 380, 384, 385, 389}
segs2 = [passage(a, b) for a, b in R2]
# extend the reaction to show the real cards being turned over on the table
segs2[10] = {'from': 195.6, 'to': 203.4}  # dealer turns the nines, deals the river, both hands face up
job2 = dict(COMMON)
job2.update({
  'title': 'Rafi Vegas - WSOP 2026: queens all-in against a monster draw',
  'segments': segs2,
  'words': caps(R2, F2, hl=H2),
  'tag': {'text': 'רפי וגאס', 'sub': 'WSOP 2026 · LAS VEGAS', 'at': segs2[0]['from'], 'until': segs2[0]['from'] + 2.3},
  'hudFrom': segs2[0]['from'] + 0.1,
  'pot': [[T(333), 29500], [T(340), 41500], [T(345), 53500], [T(366), 96500], [T(371), 123500]],
  'board': ['8s', 'Td', '4d', '7d', 'As'],
  'boardAt': [T(333), T(334), T(335), T(348), T(384)],
  'players': [
    {'id': 'rafi', 'name': 'רפי', 'cards': ['Qh', 'Qc'], 'side': 'left'},
    {'id': 'utg', 'name': 'UTG', 'cards': ['9d', '9h'], 'hiddenUntil': T(379), 'side': 'right'},
  ],
  'actions': {
    'rafi': [[0, ''], [T(320), 'RAISE 13,500'], [T(331), ''], [T(339), 'BET 12,000'], [T(346), ''], [T(366), 'ALL-IN', True], [T(384) + 0.5, 'WINS 123,500', True]],
    'utg': [[0, ''], [T(311), 'RAISE 3,500'], [T(330), 'CALL'], [T(331), ''], [T(345), 'CALL 12,000'], [T(346), ''], [T(371), 'CALL ALL-IN', True], [T(384) + 0.5, '']],
  },
  'strength': {
    'rafi': [[0, 'PAIR'], [T(333), 'OVERPAIR'], [T(384) + 0.5, 'QUEENS HOLD']],
    'utg': [[0, ''], [T(379), 'COMBO DRAW']],
  },
  'seats': {'hero': 'BB', 'villain': 'UTG', 'heroName': 'רפי', 'villainName': 'UTG'},
  'teaser': [next(g for g in segs2 if g['from'] > 189)['from'], next(g for g in segs2 if g['from'] > 189)['to']],
  'meter': {'from': T(379) + 0.2, 'to': T(386), 'points': [[T(379) + 0.2, 61], [T(384), 100]]},
  'bustAt': T(384) + 0.6,
  'callouts': [[T(366), 'ALL-IN!'], [T(379) + 0.05, 'COMBO DRAW'], [T(384) + 0.05, 'SAFE!']],
  'win': {'at': T(384) + 0.5, 'player': 'rafi', 'cards': ['Qh', 'Qc', 'As', 'Td', '8s']},
  'hook': {'stat': '39%', 'statLabel': 'הסיכוי שלו לנצח בטרן', 'head': ['אול-אין עם קווינס', 'מול דרואו מפלצתי'], 'hlWord': 'מפלצתי', 'show': ['Qh', 'Qc', '8s', 'Td', '4d']},
})

for name, job in [('rafi-wsop-fullhouse', job1), ('rafi-wsop-queens', job2)]:
    json.dump(job, open(os.path.join(ROOT, f'jobs/{name}.json'), 'w'), ensure_ascii=False, indent=1)
    d = sum(s['to'] - s['from'] for s in job['segments'])
    print(f"{name}: {len(job['segments'])} parts, {d:.1f}s content")
    for s in job['segments']:
        print(f"   {s['from']:7.2f}-{s['to']:7.2f}  in {sm[fr(s['from'])]:6.1f} dB  out {sm[fr(s['to']) - 1]:6.1f} dB")
