# stabilise + grade the upscaled pass, then the slow tail (motion-interpolated)
set -e
cd /home/user/stav-poker-edits/studio/public/input/dj
S=/tmp/claude-0/-home-user/a5a0643e-3bc2-5485-a332-ef6ebbbd5670/scratchpad
IN=${1:-dj_sr.mp4}
ffmpeg -v error -y -i $IN -vf "vidstabdetect=shakiness=8:accuracy=15:result=$S/dj_sr.trf" -f null -
ffmpeg -v error -y -i $IN -vf "vidstabtransform=input=$S/dj_sr.trf:smoothing=18:zoom=4:optzoom=1:interpol=bicubic,scale=1080:1920:flags=lanczos,eq=contrast=1.06:saturation=0.92:gamma=0.99,colorbalance=rs=-0.03:bs=0.04:rh=0.04:bh=-0.03,vignette=PI/5" -an -c:v libx264 -crf 10 -preset slow -pix_fmt yuv420p dj_main.mp4
ffmpeg -v error -y -i dj_main.mp4 -vf "trim=start=12.12:end=13.83,setpts=(PTS-STARTPTS)*2.19,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" -an -c:v libx264 -crf 10 -preset slow -pix_fmt yuv420p dj_tail.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 dj_main.mp4 dj_tail.mp4
