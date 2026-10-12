import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Card, Chip, YELLOW} from './Cards';
import {loadFonts} from './fonts';

loadFonts();

export const FPS = 30;
export const SRC_FRAMES = 1433; // w3.mp4 length at 30 fps
export const SRC_DURATION = SRC_FRAMES / FPS;
const NOHOOK_FRAME = 65; // 2.17 s: speech starts here, the old hook is gone
export const NOHOOK_START = NOHOOK_FRAME / FPS;
const CLEAN_FRAME = 86; // 2.87 s: first frame with no trace of the old wipe
const SRC = 'input/w3_1080.mp4';

// ---------- the hand (all times are seconds in the original reel) ----------
const BOARD = ['Ah', '4h', '8h', 'Qc', '5c'];
const BOARD_AT = [6.13, 6.27, 6.41, 10.7, 23.5];
const MANI = ['Th', '6h'];
const VILLAIN = ['Qh', '8s'];
const REVEAL_AT = 39.3;
const WIN_AT = 41.87;
const WIN_CARDS = new Set(['Ah', '4h', '8h']);
const HUD_IN = 2.2;
const FADE_OUT = 45.45;
const END_CARD = 46.0;

const POT: [number, number][] = [
  [0, 2.5],
  [2.75, 4.5],
  [4.67, 5.5],
  [6.97, 8.5],
  [7.53, 16.5],
  [8.3, 21.5],
  [14.13, 39.5],
  [20.4, 57.5],
  [25.9, 78.5],
  [35.5, 99.5],
];
type Lbl = {text: string; hot?: boolean} | null;
const MANI_ACT: [number, Lbl][] = [
  [0, null],
  [4.67, {text: 'CALL 2 BB'}],
  [6.1, null],
  [6.9, {text: 'CHECK'}],
  [7.53, {text: 'RAISE 8 BB'}],
  [10.67, null],
  [14.13, {text: 'BET 18 BB'}],
  [23.47, null],
  [25.9, {text: 'ALL-IN 21 BB', hot: true}],
  [35.5, {text: 'ALL-IN', hot: true}],
  [WIN_AT, {text: 'WINS 99.5 BB', hot: true}],
];
const VIL_ACT: [number, Lbl][] = [
  [0, null],
  [2.75, {text: 'RAISE 2 BB'}],
  [6.1, null],
  [6.97, {text: 'BET 3 BB'}],
  [8.3, {text: 'CALL 8 BB'}],
  [10.67, null],
  [20.4, {text: 'CALL 18 BB'}],
  [23.47, null],
  [35.5, {text: 'CALL 21 BB'}],
  [WIN_AT, null],
];
const EQUITY: [string, number, number][] = [
  ['PRE', 39, 40.2],
  ['FLOP', 68, 40.6],
  ['TURN', 75, 41.0],
  ['RIVER', 100, 41.35],
];
const EQ_IN = 39.8;

// ---------- helpers ----------
const soft = (frame: number, fps: number, startSec: number, damping = 18) =>
  spring({frame: frame - Math.round(startSec * fps), fps, config: {damping, mass: 0.7, stiffness: 120}});

const lastIndex = <T,>(list: [number, T][], t: number) => {
  let i = 0;
  for (let k = 0; k < list.length; k++) if (list[k][0] <= t) i = k;
  return i;
};

// ---------- pieces ----------
const PotBox: React.FC<{t: number; frame: number; fps: number}> = ({t, frame, fps}) => {
  const i = lastIndex(POT, t);
  const [at, val] = POT[i];
  const prev = i > 0 ? POT[i - 1][1] : val;
  const p = interpolate(t - at, [0, 0.45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const shown = prev + (val - prev) * p;
  const pulse = 1 + 0.07 * Math.sin(Math.PI * p) * (i > 0 ? 1 : 0);
  const text = (Math.round(shown * 2) / 2).toFixed(1);
  const hide = interpolate(t, [EQ_IN, EQ_IN + 0.2], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (hide <= 0) return null;
  return (
    <div
      style={{
        opacity: hide,
        position: 'absolute',
        left: 50,
        top: 230,
        width: 366,
        height: 94,
        background: '#0e1316',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        padding: '0 22px',
        gap: 16,
        boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
      }}
    >
      <Chip size={54} />
      <div style={{fontFamily: 'Barlow', fontWeight: 600, fontSize: 38, color: '#9aa4a8', letterSpacing: 3}}>POT</div>
      <div style={{flex: 1}} />
      <div
        style={{
          fontFamily: 'Barlow',
          fontWeight: 800,
          fontSize: 62,
          color: '#fff',
          transform: `scale(${pulse})`,
          transformOrigin: 'right center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {text}
      </div>
      <div style={{fontFamily: 'Barlow', fontWeight: 700, fontSize: 26, color: '#fff', marginTop: 14}}>BB</div>
    </div>
  );
};

const ActionLabel: React.FC<{list: [number, Lbl][]; t: number; frame: number; fps: number; align: 'left' | 'right'}> = ({
  list,
  t,
  frame,
  fps,
  align,
}) => {
  const i = lastIndex(list, t);
  const [at, cur] = list[i];
  const prev = i > 0 ? list[i - 1][1] : null;
  const pIn = soft(frame, fps, at, 16);
  const out = interpolate(t - at, [0, 0.18], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const box = (l: NonNullable<Lbl>, opacity: number, scale: number, y: number) => (
    <div
      style={{
        position: 'absolute',
        [align]: 0,
        top: 0,
        height: 46,
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        background: l.hot ? YELLOW : '#202326',
        color: l.hot ? '#111' : '#fff',
        fontFamily: 'Barlow',
        fontWeight: 700,
        fontSize: 31,
        letterSpacing: 0.5,
        borderRadius: 5,
        whiteSpace: 'nowrap',
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
        transformOrigin: `${align} center`,
      }}
    >
      {l.text}
    </div>
  );
  return (
    <div style={{position: 'relative', height: 46}}>
      {prev && out > 0 && box(prev, out, 1, 0)}
      {cur && box(cur, Math.min(1, pIn * 1.4), 0.9 + 0.1 * pIn, (1 - pIn) * 10)}
    </div>
  );
};

const Hud: React.FC<{t: number; frame: number; fps: number}> = ({t, frame, fps}) => {
  const enter = soft(frame, fps, HUD_IN, 20);
  const win = soft(frame, fps, WIN_AT, 22);
  const boardW = 140;
  const boardH = 200;
  const gap = 10;
  const boardLeft = 540 - (5 * boardW + 4 * gap) / 2;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: enter, transform: `translateY(${(1 - enter) * 30}px)`}}>
      {/* board */}
      {BOARD.map((c, k) => {
        const at = BOARD_AT[k];
        if (t < at) return null;
        const p = soft(frame, fps, at, 17);
        const flip = soft(frame, fps, at + 0.12, 16);
        const isWin = WIN_CARDS.has(c);
        return (
          <Card
            key={c}
            card={c}
            w={boardW}
            h={boardH}
            flip={flip}
            glow={isWin ? win : 0}
            dim={isWin ? 0 : win}
            style={{
              position: 'absolute',
              left: boardLeft + k * (boardW + gap),
              top: 1064,
              opacity: Math.min(1, p * 1.6),
              transform: `translateY(${(1 - p) * -46}px) rotate(${(1 - p) * -6}deg)`,
            }}
          />
        );
      })}

      {/* Mani: cards always visible */}
      {MANI.map((c, k) => {
        const p = soft(frame, fps, HUD_IN + 0.08 + k * 0.08, 18);
        return (
          <Card
            key={c}
            card={c}
            w={94}
            h={134}
            flip={p}
            glow={win}
            style={{position: 'absolute', left: 60 + k * 102, top: 1290, transform: `translateY(${(1 - p) * 20}px)`}}
          />
        );
      })}
      <div style={{position: 'absolute', left: 272, top: 1292, display: 'flex', alignItems: 'center', gap: 12}}>
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            overflow: 'hidden',
            border: `3px solid ${YELLOW}`,
            boxSizing: 'border-box',
          }}
        >
          <Img src={staticFile('mani.png')} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </div>
        <div style={{fontFamily: 'Heebo', fontWeight: 800, fontSize: 42, color: '#fff', direction: 'rtl'}}>מני</div>
      </div>
      <div style={{position: 'absolute', left: 272, top: 1366, width: 260}}>
        <ActionLabel list={MANI_ACT} t={t} frame={frame} fps={fps} align="left" />
      </div>

      {/* villain: hidden until Mani shows his cards on camera */}
      <div
        style={{
          position: 'absolute',
          right: 268,
          top: 1300,
          fontFamily: 'Barlow',
          fontWeight: 700,
          fontSize: 36,
          color: '#fff',
          letterSpacing: 0.5,
          opacity: 1 - 0.45 * win,
        }}
      >
        CHIP LEADER
      </div>
      <div style={{position: 'absolute', right: 268, top: 1366, width: 260}}>
        <ActionLabel list={VIL_ACT} t={t} frame={frame} fps={fps} align="right" />
      </div>
      {VILLAIN.map((c, k) => {
        const flip = t < REVEAL_AT ? 0 : soft(frame, fps, REVEAL_AT + k * 0.12, 15);
        return (
          <Card
            key={c}
            card={c}
            w={94}
            h={134}
            flip={flip}
            dim={win}
            style={{position: 'absolute', left: 824 + k * 102, top: 1290}}
          />
        );
      })}
    </div>
  );
};

const EquityBox: React.FC<{t: number; frame: number; fps: number}> = ({t, frame, fps}) => {
  if (t < EQ_IN) return null;
  const pIn = interpolate(t - EQ_IN, [0, 0.2], [0, 1], {extrapolateRight: 'clamp', easing: Easing.out(Easing.quad)});
  const gain = soft(frame, fps, WIN_AT, 18);
  return (
    <div
      style={{
        position: 'absolute',
        left: 84,
        top: 196,
        width: 912,
        height: 330,
        background: 'rgba(12,14,16,0.94)',
        backdropFilter: 'blur(18px)',
        borderRadius: 16,
        opacity: pIn,
        transform: `scale(${0.98 + 0.02 * pIn})`,
        boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 30,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'baseline',
          gap: 22,
          direction: 'rtl',
        }}
      >
        <span style={{fontFamily: 'Heebo', fontWeight: 800, fontSize: 42, color: '#fff'}}>האקוויטי של מני</span>
        {t >= WIN_AT && (
          <span
            style={{
              fontFamily: 'Barlow',
              fontWeight: 800,
              fontSize: 44,
              color: YELLOW,
              direction: 'ltr',
              opacity: gain,
              transform: `translateX(${(1 - gain) * -16}px)`,
              display: 'inline-block',
            }}
          >
            +49.5 BB
          </span>
        )}
      </div>
      <div style={{position: 'absolute', top: 110, left: 30, right: 30, display: 'flex', justifyContent: 'space-around'}}>
        {EQUITY.map(([label, v, at]) => {
          const p = t < at ? 0 : soft(frame, fps, at, 18);
          const n = interpolate(t - at, [0, 0.35], [0, v], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
          });
          const final = v === 100;
          return (
            <div
              key={label}
              style={{
                width: 190,
                textAlign: 'center',
                opacity: p,
                transform: `translateY(${(1 - p) * 18}px)`,
              }}
            >
              <div style={{fontFamily: 'Barlow', fontWeight: 700, fontSize: 38, color: '#b9c0c4', letterSpacing: 2}}>{label}</div>
              <div
                style={{
                  fontFamily: 'Barlow',
                  fontWeight: 800,
                  fontSize: 84,
                  color: final ? YELLOW : '#fff',
                  lineHeight: 1.05,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {Math.round(n)}%
              </div>
              <div style={{margin: '14px auto 0', width: 150, height: 6, borderRadius: 3, background: '#2b3034'}}>
                <div
                  style={{
                    width: `${n}%`,
                    height: '100%',
                    borderRadius: 3,
                    background: final ? YELLOW : '#e9eef0',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Hook: React.FC<{t: number; frame: number; fps: number}> = ({t, frame, fps}) => {
  const outP = interpolate(t, [1.95, 2.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  if (outP >= 1) return null;
  const drift = 1 + 0.035 * interpolate(t, [0, 2.2], [0, 1], {extrapolateRight: 'clamp'});
  const a = (s: number) => soft(frame, fps, s, 18);
  const pCards = a(0.05);
  const pStat = a(0.3);
  const n = interpolate(t, [0.3, 1.05], [0, 68], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const pLabel = a(0.6);
  const pHead = a(0.95);
  const bar = interpolate(t, [1.15, 1.55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const rise = (p: number, d = 26) => ({opacity: p, transform: `translateY(${(1 - p) * d}px)`});
  return (
    <AbsoluteFill style={{background: `rgba(0,0,0,${1 - outP})`}}>
      <AbsoluteFill
        style={{
          opacity: 1 - outP,
          filter: `blur(${outP * 14}px)`,
          transform: `scale(${drift + outP * 0.06})`,
          alignItems: 'center',
        }}
      >
        <div style={{position: 'absolute', top: 540, display: 'flex', alignItems: 'center', gap: 16, ...rise(pCards)}}>
          <Card card={null} w={82} h={118} />
          <Card card={null} w={82} h={118} />
          <div style={{fontFamily: 'Barlow', fontWeight: 700, fontSize: 34, color: '#8d9599', margin: '0 18px'}}>VS</div>
          <Card card="Th" w={82} h={118} flip={a(0.15)} />
          <Card card="6h" w={82} h={118} flip={a(0.23)} />
        </div>
        <div
          style={{
            position: 'absolute',
            top: 700,
            fontFamily: 'Barlow',
            fontWeight: 800,
            fontSize: 290,
            color: '#fff',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            opacity: pStat,
            transform: `scale(${0.92 + 0.08 * pStat})`,
          }}
        >
          {Math.round(n)}%
        </div>
        <div
          style={{
            position: 'absolute',
            top: 1000,
            fontFamily: 'Heebo',
            fontWeight: 700,
            fontSize: 40,
            color: '#a3abaf',
            direction: 'rtl',
            ...rise(pLabel, 14),
          }}
        >
          אקוויטי בפלופ
        </div>
        <div style={{position: 'absolute', top: 1080, display: 'flex', gap: 12}}>
          {['Ah', '4h', '8h'].map((c, k) => {
            const p = a(0.7 + k * 0.09);
            return <Card key={c} card={c} w={86} h={124} flip={p} style={rise(p, 20)} />;
          })}
        </div>
        <div style={{position: 'absolute', top: 1268, width: 760, height: 250}}>
          <div
            style={{
              position: 'absolute',
              left: 40,
              right: 40,
              top: 18,
              bottom: 18,
              background: YELLOW,
              clipPath: 'polygon(4% 8%, 100% 0%, 96% 92%, 0% 100%)',
              transform: `scaleX(${bar})`,
              transformOrigin: 'right center',
              opacity: 0.16,
            }}
          />
          <div
            style={{
              position: 'relative',
              textAlign: 'center',
              fontFamily: 'Heebo',
              fontWeight: 900,
              fontSize: 104,
              lineHeight: 1.08,
              color: '#fff',
              direction: 'rtl',
              paddingTop: 10,
              ...rise(pHead, 22),
            }}
          >
            <span style={{color: YELLOW}}>צבע</span> בפלופ
            <br />
            ורק לא לב
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- the reel ----------
export const ManiReel: React.FC<{withHook: boolean}> = ({withHook}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const offset = withHook ? 0 : NOHOOK_FRAME;
  const srcFrame = frame + offset;
  const t = srcFrame / fps;
  const graphicsOn = t < END_CARD;

  const fadeToBlack = interpolate(t, [FADE_OUT, END_CARD - 0.05], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fadeFromBlack = interpolate(t, [END_CARD, END_CARD + 0.4], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const startFade = withHook ? 0 : interpolate(frame, [0, 8], [1, 0], {extrapolateRight: 'clamp'});
  const black = t < END_CARD ? fadeToBlack : fadeFromBlack;

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <OffthreadVideo src={staticFile(SRC)} trimBefore={offset > 0 ? offset : undefined} />

      {/* hide the old wipe transition under a held clean frame */}
      {srcFrame < CLEAN_FRAME && (
        <AbsoluteFill>
          <Freeze frame={0}>
            <OffthreadVideo src={staticFile(SRC)} trimBefore={CLEAN_FRAME} muted />
          </Freeze>
        </AbsoluteFill>
      )}

      {graphicsOn && (
        <>
          {/* cover the old burned-in graphics with crisp new ones */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 1022,
              bottom: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0px, #000 18px)',
            }}
          />
          <PotBox t={t} frame={srcFrame} fps={fps} />
          <Hud t={t} frame={srcFrame} fps={fps} />
          <EquityBox t={t} frame={srcFrame} fps={fps} />
        </>
      )}

      {withHook && <Hook t={t} frame={srcFrame} fps={fps} />}

      {(black > 0 || startFade > 0) && (
        <AbsoluteFill style={{background: '#000', opacity: Math.max(black, startFade)}} />
      )}
    </AbsoluteFill>
  );
};
