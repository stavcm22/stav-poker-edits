import React from 'react';
import {AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFonts} from './fonts';

loadFonts();

// Iguana DJ (Nissim Segev): one handheld pass of the booth and the floor, stabilised, upscaled and graded,
// kept in real time; the last 1.7 s run slow under a quiet end card. No effects on the beat on purpose.
export const DJ_SEC = 15.86;
const MAIN_END = 12.12; // source seconds kept in real time
const CARD_AT = 12.4; // end card starts
const GOLD = '#e3c48f';

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const rise = (t: number, at: number, dur = 0.9) => interpolate(t, [at, at + dur], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});

const Grain: React.FC<{frame: number}> = ({frame}) => (
  <AbsoluteFill style={{mixBlendMode: 'overlay', opacity: 0.09, pointerEvents: 'none'}}>
    <svg width="1080" height="1920">
      <filter id="g">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={frame % 24} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="1080" height="1920" filter="url(#g)" />
    </svg>
  </AbsoluteFill>
);

const Line: React.FC<{p: number; children: React.ReactNode; style: React.CSSProperties}> = ({p, children, style}) => (
  <div style={{opacity: p, transform: `translateY(${(1 - p) * 18}px)`, filter: `blur(${(1 - p) * 6}px)`, ...style}}>{children}</div>
);

export const DjReel: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const push = 1 + 0.05 * (t / DJ_SEC);

  // opening wordmark: in at 0.35 s, gone by 3 s
  const openIn = rise(t, 0.35, 1.0);
  const openOut = 1 - rise(t, 2.3, 0.7);
  const op = openIn * openOut;

  // end card
  const dim = rise(t, CARD_AT, 1.1);
  const c1 = rise(t, CARD_AT + 0.25);
  const c2 = rise(t, CARD_AT + 0.5);
  const c3 = rise(t, CARD_AT + 0.75);
  const c4 = rise(t, CARD_AT + 1.0);
  const rule = rise(t, CARD_AT + 0.45, 1.1);

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <AbsoluteFill style={{transform: `scale(${push})`, filter: `blur(${dim * 7}px)`}}>
        <Sequence durationInFrames={Math.round(MAIN_END * fps)}>
          <OffthreadVideo src={staticFile('input/dj/dj_main.mp4')} muted style={{width: 1080, height: 1920}} />
        </Sequence>
        <Sequence from={Math.round(MAIN_END * fps)}>
          <OffthreadVideo src={staticFile('input/dj/dj_tail.mp4')} muted style={{width: 1080, height: 1920}} />
        </Sequence>
      </AbsoluteFill>
      <Audio src={staticFile('input/dj/dj_audio.wav')} />

      {/* top shade only while the wordmark is up; the darkening for the end card */}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%)', opacity: op}} />
      <AbsoluteFill style={{background: 'rgba(6,6,8,0.62)', opacity: dim}} />
      <Grain frame={frame} />

      {/* opening wordmark */}
      <div style={{position: 'absolute', top: 150, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, opacity: op}}>
        <div style={{fontFamily: 'Montserrat', fontWeight: 300, fontSize: 34, letterSpacing: '0.55em', marginRight: '-0.55em', color: '#fff'}}>IGUANA DJ</div>
        <div style={{width: 70 * openIn, height: 1, background: GOLD}} />
        <div style={{fontFamily: 'Heebo', fontWeight: 300, fontSize: 36, color: 'rgba(255,255,255,0.9)', direction: 'rtl', letterSpacing: '0.04em'}}>ניסים שגב</div>
      </div>

      {/* end card */}
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -40}}>
          <Line p={c1} style={{fontFamily: 'Montserrat', fontWeight: 300, fontSize: 92, letterSpacing: '0.3em', marginRight: '-0.3em', color: GOLD}}>
            IGUANA DJ
          </Line>
          <div style={{width: 120 * rule, height: 1, background: 'rgba(227,196,143,0.8)', margin: '38px 0 40px'}} />
          <Line p={c2} style={{fontFamily: 'Heebo', fontWeight: 500, fontSize: 66, color: '#fff', direction: 'rtl'}}>
            ניסים שגב
          </Line>
          <Line p={c3} style={{fontFamily: 'Heebo', fontWeight: 300, fontSize: 40, color: 'rgba(255,255,255,0.78)', direction: 'rtl', marginTop: 14}}>
            תקליטן לחתונות ואירועים
          </Line>
          <Line p={c4} style={{fontFamily: 'Montserrat', fontWeight: 500, fontSize: 44, letterSpacing: '0.12em', color: '#fff', marginTop: 70, direction: 'ltr'}}>
            054-5943033
          </Line>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
