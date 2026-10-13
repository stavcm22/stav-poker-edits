"""Build the Israbluff ep.9 reels: Meni shoves king high on the river, Elad folds queens, Ez folds K9.

jobs/isra9-4.json       with the table talk first (Meni the calm mental coach, Dor's flight story)
jobs/isra9-4-hand.json  the hand only

Source is the show's own 9:16 cut (input/israbluff9-4.mp4); the first 30 s are not used.
Captions were settled word by word across several recognition passes on short, slowed clips
(scripts/data/isra9_4_*.json); words no pass agreed on are left out rather than guessed,
and fillers (אחי, כאילו, אתה יודע) stay in the sound but not in the captions.
Who says what: the table talk is Ez (cap) about Meni; Dor (bald, glasses) tells the flight story;
Elad (left in the green shots) says the focus line; Ez reacts to the bluff at the end.
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

# (cut-in window, cut-out window): each part starts in the quietest moment of the first and ends in the quietest of the second
TALK = [
    ((29.10, 29.18), (49.38, 49.48)),   # Ez about Meni the mental coach / "אני נרדם איתו בלילה" / Dor: the flight from Varna
    ((53.40, 53.74), (55.96, 56.40)),   # Dor: "ורק שמתי את הפרק של נו לימיט איתך"
    ((57.90, 58.40), (59.56, 59.95)),   # Elad: "הרגעת את החרדה, אתה אומר"
]
HAND = [
    ((75.20, 75.66), (82.48, 83.00)),   # flop: Elad "צ'ק", Ez "2,500", dealer "בט 2,500", Meni "קול", Elad "קול"
    ((84.60, 85.03), (87.04, 87.60)),   # Elad: "הדבר הכי חשוב להיות בפוקוס ולהיות רגוע"
    ((90.70, 91.30), (95.38, 95.70)),   # turn: check, "7", "בט 7,000", the calls
    ((97.60, 98.00), (99.40, 100.20)),  # "קול. אוף."
    ((104.00, 104.56), (108.44, 109.00)),  # river: "צ'ק. 11. בט 11,000."
    ((112.90, 113.60), (135.58, 135.66)),  # the shove, both fold, the reveal
]

W = [
    # Ez, about Meni
    (29.28, 'לא,'), (29.42, 'אבל'), (29.48, 'תחשוב'), (29.90, 'שהשחקני'), (30.46, 'פוקר'), (30.80, 'שמתאמנים'), (31.38, 'אצלו,'),
    (33.48, 'הם'), (33.54, 'גם'), (33.70, 'מפסידים', 1), (34.10, 'סכומים,'),
    (34.50, 'זה'), (34.60, 'הרוב'), (35.06, 'רק'), (35.86, 'מנטליות,', 1),
    (37.36, 'הם'), (37.66, 'שמחים'), (38.70, 'לדבר'), (38.98, 'איתו'), (39.14, 'שוב'), (39.58, 'כי'), (39.68, 'הוא'), (39.88, 'נעים', 1), (40.64, 'להם.'),
    (41.42, 'זה'), (41.72, '90%', 1), (42.82, 'מהעבודה,'), (43.30, 'נכון?'),
    (44.06, 'אני'), (44.44, 'נרדם', 1), (44.82, 'איתו'), (45.06, 'בלילה.'),
    # Dor
    (46.34, 'אני'), (46.92, 'גם'), (47.06, 'סיפרתי'), (47.48, 'שהייתה'), (47.74, 'לנו'), (47.84, 'טיסה'),
    (48.16, 'מאוד'), (48.34, 'מאוד'), (48.52, 'קשה', 1), (48.80, 'מוורנה.'),
    (53.72, 'ורק'), (54.32, 'שמתי'), (55.04, 'את'), (55.06, 'הפרק'), (55.52, 'של'), (55.62, 'נו', 1), (55.76, 'לימיט', 1), (55.96, 'איתך.'),
    # Elad
    (58.38, 'הרגעת'), (58.82, 'את'), (58.90, 'החרדה,', 1), (59.40, 'אתה'), (59.54, 'אומר.'),
    # the flop calls (quiet table talk: these follow the actions the show's graphics confirm)
    (75.66, "צ'ק."), (76.88, '2,500.', 1), (78.90, 'בט'), (79.00, '2,500.'), (80.00, 'קול.'), (82.02, 'קול.'),
    (85.02, 'הדבר'), (85.48, 'הכי'), (85.86, 'חשוב'), (86.12, 'להיות'), (86.24, 'בפוקוס', 1), (86.78, 'ולהיות'), (87.04, 'רגוע.', 1),
    # the turn and river calls
    (91.20, "צ'ק."), (91.72, '7.', 1), (93.40, 'בט'), (93.62, '7,000.'),
    (94.76, 'קול.'),
    (98.00, 'קול.'), (98.92, 'אוף.'),
    (104.56, "צ'ק."), (105.56, '11.', 1), (107.64, 'בט'), (107.90, '11,000.'),
    # the shove, the folds, the reveal
    (113.66, 'אול'), (113.90, 'אין.', 1),
    (117.32, 'טוב.'),
    (120.06, 'טוב.'),
    (120.40, 'יואו,'), (121.24, 'יואו,'), (121.90, 'קינג', 1), (123.64, 'עשר', 1), (124.42, 'בלאף.', 1), (125.46, 'טוב'), (125.68, 'עליי.'),
    (126.04, 'קינג'), (126.66, 'גבוה,'), (126.96, 'אול'), (127.20, 'אין.', 1),
    (128.42, 'לכל'), (129.14, 'צופינו'), (129.56, 'בבית,'), (130.08, 'אני'), (130.14, 'מתנצל.', 1),
    (131.14, 'מה'), (131.50, 'זרקת?'), (132.20, "ג'קים?"),
    (133.44, 'דאמות.', 1),
    (134.30, 'דאמות?'), (134.96, 'באמת?', 1),
]
CAPS = [{'t': t, 'w': w[0], **({'hl': True} if len(w) > 1 else {})} for t, *w in W]


def make(parts, out, title, captions_only=False):
    segs = []
    for (a0, a1), (b0, b1) in parts:
        segs.append({'from': quiet(a0, a1, 'late'), 'to': round(min(quiet(b0, b1, 'early') + 0.04, 137.1), 3)})
    # the reveal: the show's overhead shot (122.92-126.16) carries its logo at the top (Meni's equity box comes in
    # right as it starts and sits over it) and an operator screen at the bottom (frosted for those 3 s);
    # the split points sit on whole output frames and the sound runs on across them
    last = segs.pop()
    last['from'] = round(round(last['from'] * 30) / 30, 4)
    A, B = 3688 / 30, 3785 / 30
    segs += [{'from': last['from'], 'to': round(A, 4)},
             {'from': round(A, 4), 'to': round(B, 4), 'join': True, 'cover': [1628, 1920]},
             {'from': round(B, 4), 'to': last['to'], 'join': True}]
    S = segs
    h = next(i for i, s in enumerate(S) if s['from'] > 75)   # first hand part: the flop
    turn, river = h + 2, h + 4
    job = {
        'src': 'input/israbluff9-4.mp4',
        'title': title,
        'layout': 'full',
        'vertical': True,
        'hudStyle': 'compact',
        # exactly over the broadcast's own boxes (players x 40-700 y 1205-1630, board/pot x 705-1045 y 1400-1630)
        'hudBox': {'x': 22, 'y': 1194, 'w': 690, 'rowH': 144, 'gap': 6, 'bx': 702, 'by': 1386, 'bw': 364, 'bh': 260},
        'shift': 150,
        'deck': 'nolimit',
        'chipRain': False,
        'segments': segs,
        'words': CAPS,
        'hudFrom': S[0]['from'] + 0.1,
        # blinds 500 / 1K + 1K BB ante; Ez opens 3K, Meni and Elad call; flop: Ez bets 2.5K, both call
        'pot': [[S[0]['from'], 2500], [34.0, 5500], [46.0, 8500], [59.0, 10500], [76.88, 13000], [80.0, 15500], [82.02, 18000],
                [91.72, 25000], [94.76, 32000], [98.0, 39000], [105.56, 50000], [113.66, 108300]],
        'board': ['5d', 'Js', 'As', '6h', '3h'],
        'boardAt': [S[h]['from'] + 0.1, S[h]['from'] + 0.22, S[h]['from'] + 0.34, S[turn]['from'] + 0.1, S[river]['from'] + 0.1],
        'players': [
            {'id': 'meni', 'name': 'מני', 'cards': ['Kd', 'Td'], 'side': 'left'},
            {'id': 'elad', 'name': 'אלעד', 'cards': ['Qh', 'Qc'], 'side': 'left'},
            {'id': 'ez', 'name': 'עז', 'cards': ['Kc', '9h'], 'side': 'left'},
        ],
        'actions': {
            'meni': [[46.0, 'CALL 3K'], [75.66, ''], [80.0, 'CALL 2.5K'], [91.2, ''], [94.76, 'CALL 7K'], [104.56, ''], [113.66, 'ALL-IN 58.3K', True], [120.4, 'WINS 108K', True]],
            'elad': [[59.0, 'CALL 2K'], [75.66, 'CHECK'], [82.02, 'CALL 2.5K'], [91.2, 'CHECK'], [98.0, 'CALL 7K'], [104.56, 'CHECK'], [117.32, 'FOLD']],
            'ez': [[34.0, 'RAISE 3K'], [75.66, ''], [76.88, 'BET 2.5K'], [91.72, 'BET 7K'], [105.56, 'BET 11K'], [120.06, 'FOLD']],
        },
        'strength': {
            'meni': [[S[0]['from'] + 0.6, ''], [S[h]['from'] + 0.6, 'GUTSHOT'], [S[river]['from'] + 0.4, 'KING HIGH'], [121.9, 'BLUFF']],
            'elad': [[S[0]['from'] + 0.6, 'QUEENS']],
            'ez': [[S[0]['from'] + 0.6, ''], [S[river]['from'] + 0.4, 'KING HIGH']],
        },
        'win': {'at': 120.4, 'player': 'meni', 'cards': ['Kd', 'Td']},
        'punches': [113.66],
        'equity': {'player': 'מני', 'values': [['PRE', 23], ['FLOP', 17], ['TURN', 8], ['RIVER', 0]], 'at': 122.94},
        'eqTop': 84,
        'eqScale': 0.96,
    }
    if captions_only:
        # the same reel without our hand panels (the show's own graphics already show the hand);
        # sounds, punches and the equity box stay as they were
        job['hideHud'] = True
    json.dump(job, open(os.path.join(ROOT, out), 'w'), ensure_ascii=False, indent=1)
    d = sum(s['to'] - s['from'] for s in segs)
    print(f'{out}: {len(segs)} parts, {d:.1f}s')
    for s in segs: print(f"  {s['from']:7.2f}-{s['to']:7.2f}  in {sm[fr(s['from'])]:6.1f} dB  out {sm[fr(s['to']) - 1]:6.1f} dB")


make(TALK + HAND, 'jobs/isra9-4.json', 'Israbluff 9 - Meni shoves king high (with the table talk)')
make(HAND, 'jobs/isra9-4-hand.json', 'Israbluff 9 - Meni shoves king high (hand only)')
make(TALK + HAND, 'jobs/isra9-4-caps.json', 'Israbluff 9 - captions only (with the table talk)', captions_only=True)
make(HAND, 'jobs/isra9-4-hand-caps.json', 'Israbluff 9 - captions only (hand only)', captions_only=True)
