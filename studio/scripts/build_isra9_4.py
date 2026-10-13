"""Build jobs/isra9-4.json: Israbluff ep.9 - Meni shoves king-high on the river, Elad folds queens.

Source is the show's own 9:16 cut (input/israbluff9-4.mp4). The first 30 s are not used.
Captions were settled word by word against several recognition passes (scripts/data/isra9_4_*.json),
not taken straight from one transcript.
"""
import json, os, subprocess, numpy as np
ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'public/input/israbluff9-4.mp4')

pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', SRC, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
x = np.frombuffer(pcm, np.int16).astype(float) / 32768
n = len(x) // 160
sm = np.convolve(20 * np.log10(np.sqrt(np.mean(x[:n * 160].reshape(n, 160) ** 2, 1)) + 1e-12), np.ones(3) / 3, 'same')
fr = lambda t: int(round(t * 100))

def quiet(lo, hi, prefer):
    seg = sm[fr(lo):fr(hi) + 1]
    m = seg.min()
    idx = [i for i, v in enumerate(seg) if v <= m + 3]
    return round(lo + (idx[-1] if prefer == 'late' else idx[0]) / 100, 3)

# (cut-in search window, cut-out search window): each part starts in the quietest moment of the first window
# and ends in the quietest moment of the second
PARTS = [
    ((29.10, 29.18), (48.80, 49.30)),   # "לא, אבל תחשוב שהשחקני פוקר ... 90% מהעבודה, נכון? אני נרדם איתו בלילה ... טיסה מאוד מאוד קשה מוורנה."
    ((53.40, 53.74), (55.96, 56.40)),   # "ורק שמתי את הפרק של נו לימיט איתך."
    ((57.90, 58.40), (59.56, 59.95)),   # "הרגעת את החרדה, אתה אומר."
    ((75.20, 75.66), (82.48, 83.00)),   # flop: "צ'ק. 2,500. בט 2,500. קול. קול."
    ((84.60, 85.03), (87.04, 87.60)),   # "הדבר הכי חשוב להיות בפוקוס ולהיות רגוע."
    ((90.70, 91.20), (94.00, 94.30)),   # turn: "צ'ק. 7. בט 7,000."
    ((94.40, 94.76), (95.25, 95.60)),   # "קול."
    ((97.60, 98.00), (99.40, 100.20)),  # "קול. אוף."
    ((104.00, 104.56), (108.44, 109.00)),  # river: "צ'ק. 11. בט 11,000."
    ((112.90, 113.60), (135.58, 135.66)),  # the shove, both fold, and the reveal
]
segs = []
for (a0, a1), (b0, b1) in PARTS:
    segs.append({'from': quiet(a0, a1, 'late'), 'to': round(min(quiet(b0, b1, 'early') + 0.04, 137.1), 3)})
# the reveal: the show's overhead shot (122.92-126.16) carries its logo, so that stretch is reframed below the logo
# (on Meni's flipped cards and the board) while the sound runs on; the split points sit on whole output frames
last = segs.pop()
last['from'] = round(round(last['from'] * 30) / 30, 4)
A, B = 3688 / 30, 3785 / 30   # 122.933 / 126.167: just after the shot's first and last frames
segs += [{'from': last['from'], 'to': round(A, 4)},
         {'from': round(A, 4), 'to': round(B, 4), 'join': True, 'zoom': 1.3, 'vy': 375},
         {'from': round(B, 4), 'to': last['to'], 'join': True}]

# captions: (time, word, highlight)
W = [
    (29.28, 'לא,'), (29.42, 'אבל'), (29.48, 'תחשוב'), (29.90, 'שהשחקני'), (30.46, 'פוקר'), (30.80, 'שמתאמנים'), (31.38, 'אצלו,'),
    (31.74, 'שהם,'), (32.00, 'אתה'), (33.24, 'יודע,'), (33.48, 'הם'), (33.54, 'גם'), (33.70, 'מפסידים', 1), (34.10, 'סכומים,'),
    (34.50, 'זה'), (34.60, 'הרוב'), (35.06, 'רק'), (35.86, 'מנטליות,', 1), (36.54, 'זה'), (36.64, 'הרוב,'),
    (37.36, 'הם'), (37.66, 'שמחים'), (38.70, 'לדבר'), (38.98, 'איתו'), (39.14, 'שוב'), (39.58, 'כי'), (39.68, 'הוא'), (39.88, 'נעים', 1), (40.64, 'להם,'),
    (40.94, 'אתה'), (41.16, 'מבין?'), (41.42, 'זה'), (41.72, '90%', 1), (42.82, 'מהעבודה,'), (43.30, 'נכון?'),
    (44.06, 'אני'), (44.44, 'נרדם', 1), (44.82, 'איתו'), (45.06, 'בלילה.'),
    (45.50, 'אני'), (45.78, 'סיפרתי,'), (46.34, 'אני'), (46.92, 'גם'), (47.06, 'סיפרתי'), (47.48, 'שהייתה'), (47.74, 'לנו'), (47.84, 'טיסה'),
    (48.16, 'מאוד'), (48.34, 'מאוד'), (48.52, 'קשה', 1), (48.80, 'מוורנה.'),
    (53.72, 'ורק'), (54.32, 'שמתי'), (55.04, 'את'), (55.06, 'הפרק'), (55.52, 'של'), (55.62, 'נו', 1), (55.76, 'לימיט', 1), (55.96, 'איתך.'),
    (58.38, 'הרגעת'), (58.82, 'את'), (58.90, 'החרדה,', 1), (59.40, 'אתה'), (59.54, 'אומר.'),
    (75.66, "צ'ק."), (76.88, '2,500.', 1), (78.90, 'בט'), (79.00, '2,500.'), (80.00, 'קול.'), (82.02, 'קול.'),
    (85.02, 'הדבר'), (85.48, 'הכי'), (85.86, 'חשוב'), (86.12, 'להיות'), (86.24, 'בפוקוס', 1), (86.78, 'ולהיות'), (87.04, 'רגוע.', 1),
    (91.20, "צ'ק."), (91.72, '7.', 1), (93.40, 'בט'), (93.62, '7,000.'),
    (94.76, 'קול.'),
    (98.00, 'קול.'), (98.92, 'אוף.'),
    (104.56, "צ'ק."), (105.56, '11.', 1), (107.64, 'בט'), (107.90, '11,000.'),
    (113.66, 'אול'), (113.90, 'אין.', 1),
    (117.32, 'טוב.'),
    (120.06, 'טוב.'),
    (120.40, 'יואו,'), (121.24, 'יואו,'), (121.90, 'קינג', 1), (123.64, 'עשר', 1), (124.42, 'פלצת.'), (125.46, 'טוב'), (125.68, 'עליי.'),
    (126.04, 'קינג'), (126.66, 'גבוה,'), (126.96, 'אול'), (127.20, 'אין.', 1),
    (128.42, 'לכל'), (129.14, 'הצופים'), (129.56, 'בבית,'), (130.08, 'אני'), (130.14, 'מתנצל.', 1),
    (131.14, 'מה'), (131.50, 'זרקת?'), (132.20, "ג'קים?"),
    (133.44, 'דאמות.', 1),
    (134.30, 'דאמות?'), (134.96, 'באמת?', 1),
]
caps = [{'t': t, 'w': w[0], **({'hl': True} if len(w) > 1 else {})} for t, *w in W]

S = segs
job = {
    'src': 'input/israbluff9-4.mp4',
    'title': 'Israbluff 9 - Meni shoves king high, Elad folds queens',
    'layout': 'full',
    'vertical': True,
    'floorTop': 1150,
    'deck': 'nolimit',
    'potPos': 'bottom',
    'chipRain': False,
    'segments': segs,
    'words': caps,
    'hudFrom': S[0]['from'] + 0.1,
    # blinds 500 / 1K + 1K BB ante; Ez opens 3K, Meni and Elad call
    'pot': [[S[0]['from'], 2500], [34.0, 5500], [46.0, 8500], [59.0, 10500],
            [76.88, 13000], [80.0, 15500], [82.02, 18000],
            [91.72, 25000], [94.76, 32000], [98.0, 39000],
            [105.56, 50000], [113.66, 108300]],
    'board': ['5d', 'Js', 'As', '6h', '3h'],
    'boardAt': [S[3]['from'] + 0.1, S[3]['from'] + 0.25, S[3]['from'] + 0.4, S[5]['from'] + 0.1, S[8]['from'] + 0.1],
    'players': [
        {'id': 'meni', 'name': 'מני', 'cards': ['Kd', 'Td'], 'side': 'left'},
        {'id': 'elad', 'name': 'אלעד', 'cards': ['Qh', 'Qc'], 'side': 'right'},
        {'id': 'ez', 'name': 'עז', 'cards': ['Kc', '9h'], 'side': 'right', 'row': 1},
    ],
    'actions': {
        'meni': [[46.0, 'CALL 3K'], [75.66, ''], [80.0, 'CALL'], [91.2, ''], [94.76, 'CALL'], [104.56, ''], [113.66, 'ALL-IN 58.3K', True], [120.4, 'WINS 108K', True]],
        'elad': [[59.0, 'CALL'], [75.66, 'CHECK'], [82.02, 'CALL'], [91.2, 'CHECK'], [98.0, 'CALL'], [104.56, 'CHECK'], [117.32, 'FOLD']],
        'ez': [[34.0, 'RAISE 3K'], [75.66, ''], [76.88, 'BET 2.5K'], [91.2, ''], [91.72, 'BET 7K'], [104.56, ''], [105.56, 'BET 11K'], [120.06, 'FOLD']],
    },
    'strength': {
        'meni': [[S[0]['from'] + 0.6, ''], [S[3]['from'] + 0.6, 'GUTSHOT'], [S[8]['from'] + 0.4, 'KING HIGH'], [121.9, 'BLUFF']],
        'elad': [[S[0]['from'] + 0.6, 'QUEENS']],
        'ez': [[S[0]['from'] + 0.6, ''], [S[8]['from'] + 0.4, 'KING HIGH']],
    },
    'win': {'at': 120.4, 'player': 'meni', 'cards': ['Kd', 'Td']},
    'punches': [113.66],
    'equity': {'player': 'מני', 'values': [['PRE', 23], ['FLOP', 17], ['TURN', 8], ['RIVER', 0]], 'at': 126.04},
    'eqTop': 56,
    'eqScale': 0.78,
}
json.dump(job, open(os.path.join(ROOT, 'jobs/isra9-4.json'), 'w'), ensure_ascii=False, indent=1)
d = sum(s['to'] - s['from'] for s in segs)
print(f'{len(segs)} parts, {d:.1f}s')
for s in segs: print(f"  {s['from']:7.2f}-{s['to']:7.2f}  in {sm[fr(s['from'])]:6.1f} dB  out {sm[fr(s['to']) - 1]:6.1f} dB")
