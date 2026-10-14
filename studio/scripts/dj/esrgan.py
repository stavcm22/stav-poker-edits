"""Real-ESRGAN (realesr-general-x4v3, SRVGGNetCompact) on every frame of a video; frames go out
downscaled to the target size through an ffmpeg pipe so nothing huge lands on disk.
usage: esrgan.py <model.pth> <in.mp4> <out.mp4> <W> <H> [first_n_frames]"""
import sys, subprocess, time, numpy as np, torch, torch.nn as nn, torch.nn.functional as F
model_p, src, dst, W, H = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
limit = int(sys.argv[6]) if len(sys.argv) > 6 else None
class SRVGG(nn.Module):
    def __init__(s, nf=64, nc=32, up=4):
        super().__init__(); s.up = up
        b = [nn.Conv2d(3, nf, 3, 1, 1), nn.PReLU(nf)]
        for _ in range(nc): b += [nn.Conv2d(nf, nf, 3, 1, 1), nn.PReLU(nf)]
        b += [nn.Conv2d(nf, 3 * up * up, 3, 1, 1)]
        s.body = nn.ModuleList(b); s.ps = nn.PixelShuffle(up)
    def forward(s, x):
        o = x
        for m in s.body: o = m(o)
        return s.ps(o) + F.interpolate(x, scale_factor=s.up, mode='nearest')
torch.set_num_threads(4)
net = SRVGG(); net.load_state_dict(torch.load(model_p, map_location='cpu')['params']); net.eval()
net = net.to(memory_format=torch.channels_last)
info = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:stream_side_data=rotation', '-of', 'default=nw=1', src], capture_output=True, text=True).stdout
kv = dict(l.split('=', 1) for l in info.split() if '=' in l)
w, h = int(kv['width']), int(kv['height'])
if kv.get('rotation') in ('-90', '90', '270', '-270'): w, h = h, w
fps = kv['r_frame_rate']
dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{W}x{H}', '-r', fps, '-i', '-',
                        '-c:v', 'libx264', '-crf', '8', '-preset', 'medium', '-pix_fmt', 'yuv444p10le', dst], stdin=subprocess.PIPE)
n = 0; t0 = time.time()
with torch.inference_mode():
    while True:
        buf = dec.stdout.read(w * h * 3)
        if len(buf) < w * h * 3: break
        x = torch.from_numpy(np.frombuffer(buf, np.uint8).reshape(h, w, 3).copy()).permute(2, 0, 1)[None].float().div(255).contiguous(memory_format=torch.channels_last)
        y = net(x).clamp(0, 1)
        y = F.interpolate(y, size=(H, W), mode='bicubic', antialias=True, align_corners=False).clamp(0, 1)
        enc.stdin.write((y[0].permute(1, 2, 0).numpy() * 65535 + 0.5).astype('<u2').tobytes())
        n += 1
        if n % 20 == 0: print(f'{n} frames, {(time.time() - t0) / n:.2f}s/frame', flush=True)
        if limit and n >= limit: break
enc.stdin.close(); enc.wait(); dec.kill()
print(f'done {n} frames in {time.time() - t0:.0f}s')
