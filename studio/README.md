# Stav Poker Studio

Remotion project for re-editing reels.

## Mani Malka reel (No Limit), improved version

Rebuilds `assets/work/w3.mp4` at 1080x1920 with new, crisp card graphics:
cards deal and flip in, labels and pot animate softly, Mani's cards show from
the start and the chip leader's cards flip only when they are shown on camera.
The equity numbers (39 / 68 / 75 / 100) were checked by exact calculation.

```bash
npm install
# upscale the source once (the result is not committed)
ffmpeg -i ../assets/work/w3.mp4 -vf "scale=1080:1920:flags=lanczos,hqdn3d=1.2:1.2:2:2,unsharp=5:5:0.7:5:5:0.0,eq=contrast=1.03:saturation=1.06" \
  -c:v libx264 -preset slow -crf 12 -pix_fmt yuv420p -c:a copy public/input/w3_1080.mp4
npx remotion render src/index.ts ManiWithHook out/mani-with-hook.mp4 --crf=16 --audio-bitrate=192k
npx remotion render src/index.ts ManiNoHook   out/mani-no-hook.mp4   --crf=16 --audio-bitrate=192k
```

`npx remotion studio` opens a live preview.
