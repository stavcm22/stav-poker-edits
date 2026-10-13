"""For each camera shot: where the faces are (source px) and how much each mouth moves (who is talking).

usage: shot_faces.py <video> <model.onnx> <cut,cut,...>   -> JSON on stdout
"""
import cv2, json, sys, numpy as np
video, model, cuts = sys.argv[1], sys.argv[2], [float(c) for c in sys.argv[3].split(',')]
cap = cv2.VideoCapture(video)
W, H = 960, 540
det = cv2.FaceDetectorYN.create(model, '', (W, H), 0.6, 0.3, 50)
SX = 1920 / W
out = []
for a, b in zip(cuts, cuts[1:]):
    ts = np.arange(a + 0.08, b - 0.04, 0.12)
    tracks = []  # each: list of (t, x, y, w, mouth patch)
    for t in ts:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, fr = cap.read()
        if not ok: break
        fr = cv2.resize(fr, (W, H))
        _, faces = det.detect(fr)
        g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        for f in faces if faces is not None else []:
            x, y, w, h = f[:4]
            # mouth corners are landmarks 3 and 4
            mx = (f[10] + f[12]) / 2; my = (f[11] + f[13]) / 2
            r = max(6, int(w * 0.28))
            patch = g[max(0, int(my - r * 0.6)):int(my + r * 0.6), max(0, int(mx - r)):int(mx + r)]
            patch = cv2.resize(patch, (32, 20)).astype(float) if patch.size else None
            cx = x + w / 2
            tr = next((tr for tr in tracks if abs(tr[-1][1] - cx) < w * 0.8), None)
            if tr is None: tracks.append([(t, cx, y + h / 2, w, patch)])
            else: tr.append((t, cx, y + h / 2, w, patch))
    faces = []
    for tr in tracks:
        if len(tr) < max(2, len(ts) * 0.3): continue
        mv = [np.mean(np.abs(p1[4] - p0[4])) for p0, p1 in zip(tr, tr[1:]) if p0[4] is not None and p1[4] is not None]
        faces.append({'x': round(float(np.median([e[1] for e in tr])) * SX), 'y': round(float(np.median([e[2] for e in tr])) * SX),
                      'w': round(float(np.median([e[3] for e in tr])) * SX), 'talk': round(float(np.mean(mv)) if mv else 0, 2), 'n': len(tr)})
    faces.sort(key=lambda f: f['x'])
    out.append({'from': a, 'to': b, 'faces': faces})
print(json.dumps(out))
