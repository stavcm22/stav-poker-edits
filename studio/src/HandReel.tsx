import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Card, Chip, YELLOW} from './Cards';
import {loadFonts} from './fonts';

loadFonts();

// ---------- job format (all times are seconds in the SOURCE video) ----------
export type Seg = {from: number; to: number; cropX?: number; zoom?: number};
export type Word = {t: number; w: string; hl?: boolean};
export type Act = [number, string, boolean?]; // time, label, hot
export type Player = {
  id: string;
  name: string;
  cards: [string, string];
  hiddenUntil?: number; // face down until this time
  side: 'left' | 'right';
};
export type Job = {
  src: string;
  title?: string;
  layout?: 'top' | 'full'; // full = 9:16 source filling the frame
  segments: Seg[];
  words: Word[];
  tag?: {text: string; sub?: string; at: number; until: number};
  pot?: [number, number][];
  unit?: string;
  hudFrom?: number;
  board?: string[];
  boardAt?: number[];
  players?: Player[];
  actions?: Record<string, Act[]>;
  strength?: Record<string, [number, string][]>;
  equity?: {player: string; values: [string, number][]; at: number; until?: number; gain?: string};
  win?: {at: number; player: string; cards: string[]};
  hook?: {stat: string; statLabel: string; head: [string, string]; hlWord?: string; show: string[]};
  brand?: string;
  credit?: string;
};

export const HOOK_SEC = 2.3;
export const END_SEC = 2.4;
const FPS = 30;

// ---------- time mapping through the cut list ----------
export const outDuration = (job: Job) => job.segments.reduce((a, s) => a + (s.to - s.from), 0);
export const srcToOut = (job: Job, t: number) => {
  let acc = 0;
  for (const s of job.segments) {
    if (t < s.from) return acc;
    if (t <= s.to) return acc + (t - s.from);
    acc += s.to - s.from;
  }
  return acc;
};
const outToSrc = (job: Job, o: number) => {
  let acc = 0;
  for (const s of job.segments) {
    const d = s.to - s.from;
    if (o < acc + d) return s.from + (o - acc);
    acc += d;
  }
  return job.segments[job.segments.length - 1].to;
};
const latest = <T,>(list: [number, T][], t: number) => {
  let cur: [number, T] | null = null;
  let prev: [number, T] | null = null;
  for (const x of list)
    if (x[0] <= t) {
      prev = cur;
      cur = x;
    }
  return {cur, prev};
};
const soft = (frame: number, fps: number, at: number, damping = 18) =>
  spring({frame: frame - Math.round(at * fps), fps, config: {damping, mass: 0.7, stiffness: 120}});

// ---------- layouts ----------
const VIDEO_H = 1080;
const LAYOUT = {
  top: {capTop: VIDEO_H - 190, hudTop: 1150, potTop: 40, tagTop: 52, eqTop: 150, brandTop: VIDEO_H - 70},
  full: {capTop: 930, hudTop: 1170, potTop: 120, tagTop: 132, eqTop: 330, brandTop: 66},
};
const L = (job: Job) => LAYOUT[job.layout ?? 'top'];

// ---------- footage with camera motion ----------
const SegVideo: React.FC<{job: Job; seg: Seg; index: number; dur: number; punch: number; shakeX: number; shakeY: number}> = ({
  job,
  seg,
  index,
  dur,
  punch,
  shakeX,
  shakeY,
}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  // alternate framing on every cut, with a slow push-in inside the shot
  const base = (seg.zoom ?? 1) * (index % 2 === 0 ? 1.0 : 1.1);
  const drift = interpolate(f, [0, dur], [0, 0.045], {extrapolateRight: 'clamp'});
  const z = (base + drift) * punch;
  const full = job.layout === 'full';
  const boxW = 1080;
  const boxH = full ? 1920 : VIDEO_H;
  const w = full ? boxW * z : ((VIDEO_H * 16) / 9) * z;
  const h = full ? boxH * z : VIDEO_H * z;
  const cropX = seg.cropX ?? 0.5;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: boxW, height: boxH, overflow: 'hidden'}}>
      <OffthreadVideo
        src={staticFile(job.src)}
        trimBefore={Math.round(seg.from * fps)}
        // short fades at every cut so speech never clicks or jumps
        volume={(vf) => Math.max(0, Math.min(1, (vf + 1) / 3, (dur - vf) / 3))}
        style={{position: 'absolute', width: w, height: h, left: -(w - boxW) * cropX + shakeX, top: -(h - boxH) / 2 + shakeY}}
      />
    </div>
  );
};

const Footage: React.FC<{job: Job; offsetOut: number; punch: number; shakeX: number; shakeY: number}> = ({job, offsetOut, punch, shakeX, shakeY}) => {
  const {fps} = useVideoConfig();
  let acc = offsetOut;
  return (
    <AbsoluteFill>
      {job.segments.map((s, i) => {
        const from = Math.round(acc * fps);
        const dur = Math.round((s.to - s.from) * fps);
        acc += s.to - s.from;
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <SegVideo job={job} seg={s} index={i} dur={dur} punch={punch} shakeX={shakeX} shakeY={shakeY} />
          </Sequence>
        );
      })}
      {job.layout === 'full' ? (
        <>
          <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 340, background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0))'}} />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 800,
              bottom: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 28%, rgba(0,0,0,0.9) 58%, #000 72%)',
            }}
          />
        </>
      ) : (
        <div style={{position: 'absolute', left: 0, right: 0, top: VIDEO_H - 260, height: 262, background: 'linear-gradient(to bottom, rgba(0,0,0,0), #000)'}} />
      )}
    </AbsoluteFill>
  );
};

// ---------- word-by-word captions ----------
const Captions: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  const chunks: Word[][] = [];
  let cur: Word[] = [];
  job.words.forEach((w, i) => {
    const gap = i > 0 ? w.t - job.words[i - 1].t : 0;
    if (cur.length && (cur.length >= 3 || gap > 0.7 || /[.,?!]$/.test(job.words[i - 1].w))) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(w);
  });
  if (cur.length) chunks.push(cur);
  const idx = chunks.findIndex((c, i) => t >= c[0].t && (i + 1 >= chunks.length || t < chunks[i + 1][0].t));
  if (idx < 0) return null;
  const chunk = chunks[idx];
  if (t > chunk[chunk.length - 1].t + 1.2) return null;
  const pIn = spring({frame: frame - Math.round(chunk[0].t * fps), fps, config: {damping: 16, stiffness: 170}});
  const activeIdx = chunk.reduce((a, w, i) => (t >= w.t ? i : a), -1);
  return (
    <div
      style={{
        position: 'absolute',
        top: L(job).capTop,
        left: 40,
        right: 40,
        display: 'flex',
        justifyContent: 'center',
        gap: 18,
        direction: 'rtl',
        flexWrap: 'wrap',
        transform: `translateY(${(1 - pIn) * 18}px) scale(${0.94 + 0.06 * pIn})`,
        opacity: Math.min(1, pIn * 1.5),
      }}
    >
      {chunk.map((w, i) => {
        const on = t >= w.t;
        const p = spring({frame: frame - Math.round(w.t * fps), fps, config: {damping: 11, stiffness: 220}});
        const active = i === activeIdx;
        return (
          <span
            key={i}
            style={{
              fontFamily: 'Heebo',
              fontWeight: 900,
              fontSize: 80,
              color: w.hl ? YELLOW : '#fff',
              textShadow: active ? '0 0 26px rgba(255,194,26,0.35), 0 4px 14px rgba(0,0,0,0.9)' : '0 4px 14px rgba(0,0,0,0.9)',
              opacity: on ? 1 : 0.28,
              transform: `scale(${on ? 0.9 + 0.1 * p + (active ? 0.06 : 0) : 0.9})`,
              display: 'inline-block',
              WebkitTextStroke: '1px rgba(0,0,0,0.35)',
            }}
          >
            {w.w.replace(/[.,:]+$/, '')}
          </span>
        );
      })}
    </div>
  );
};

// ---------- HUD ----------
const Label: React.FC<{acts: Act[]; t: number; frame: number; fps: number; align: 'left' | 'right'}> = ({acts, t, frame, fps, align}) => {
  const {cur, prev} = latest(acts.map((a) => [a[0], a] as [number, Act]), t);
  if (!cur) return null;
  const a = cur[1];
  const box = (x: Act, opacity: number, scale: number, y: number) => (
    <div
      style={{
        position: 'absolute',
        [align]: 0,
        top: 0,
        height: 48,
        padding: '0 15px',
        display: 'flex',
        alignItems: 'center',
        background: x[2] ? YELLOW : 'rgba(32,35,38,0.95)',
        color: x[2] ? '#111' : '#fff',
        fontFamily: 'Barlow',
        fontWeight: 700,
        fontSize: 32,
        borderRadius: 6,
        whiteSpace: 'nowrap',
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
        transformOrigin: `${align} center`,
        boxShadow: x[2] ? '0 0 22px rgba(255,194,26,0.45)' : 'none',
      }}
    >
      {x[1]}
    </div>
  );
  const pIn = soft(frame, fps, a[0], 13);
  const out = interpolate(t - a[0], [0, 0.18], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'relative', height: 48}}>
      {prev && prev[1][1] && out > 0 && box(prev[1], out, 1, 0)}
      {a[1] && box(a, Math.min(1, pIn * 1.4), 0.85 + 0.15 * pIn, (1 - pIn) * 12)}
    </div>
  );
};

const STREETS = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];

const Hud: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  if (!job.players || job.hudFrom === undefined || t < job.hudFrom) return null;
  const enter = soft(frame, fps, job.hudFrom, 20);
  const win = job.win && t >= job.win.at ? soft(frame, fps, job.win.at, 22) : 0;
  const shine = job.win ? interpolate(t - job.win.at - 0.25, [0, 0.9], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const winSet = new Set(job.win?.cards ?? []);
  const board = job.board ?? [];
  const at = job.boardAt ?? [];
  const street = t >= (at[4] ?? 1e9) ? 3 : t >= (at[3] ?? 1e9) ? 2 : t >= (at[0] ?? 1e9) ? 1 : 0;
  const bw = 140;
  const bh = 200;
  const gap = 10;
  const bl = 540 - (5 * bw + 4 * gap) / 2;
  const top = L(job).hudTop;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: enter, transform: `translateY(${(1 - enter) * 30}px)`}}>
      {/* street indicator */}
      <div style={{position: 'absolute', top: top - 62, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 26}}>
        {STREETS.map((s, i) => {
          const on = i === street;
          const reached = i <= street;
          return (
            <div key={s} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6}}>
              <div style={{fontFamily: 'Barlow', fontWeight: 700, fontSize: 26, letterSpacing: 3, color: on ? YELLOW : reached ? '#e9eef0' : 'rgba(233,238,240,0.35)'}}>{s}</div>
              <div style={{height: 4, width: on ? 54 : 18, borderRadius: 2, background: on ? YELLOW : 'rgba(233,238,240,0.25)'}} />
            </div>
          );
        })}
      </div>
      {/* placeholders show the empty board slots */}
      {[0, 1, 2, 3, 4].map((k) => (
        <div
          key={'slot' + k}
          style={{position: 'absolute', left: bl + k * (bw + gap), top, width: bw, height: bh, borderRadius: 13, border: '2px dashed rgba(255,255,255,0.12)'}}
        />
      ))}
      {board.map((c, k) => {
        const a = at[k] ?? 0;
        if (t < a) return null;
        const p = soft(frame, fps, a, 15);
        const flip = soft(frame, fps, a + 0.12, 14);
        const inWin = winSet.has(c);
        return (
          <Card
            key={c}
            card={c}
            w={bw}
            h={bh}
            flip={flip}
            glow={inWin ? win : 0}
            dim={win && !inWin ? win : 0}
            shine={inWin ? shine : 0}
            style={{
              position: 'absolute',
              left: bl + k * (bw + gap),
              top,
              opacity: Math.min(1, p * 1.6),
              transform: `translateY(${(1 - p) * -70}px) rotate(${(1 - p) * -10}deg) scale(${0.9 + 0.1 * p})`,
            }}
          />
        );
      })}
      {job.players.map((pl) => {
        const left = pl.side === 'left';
        const isWinner = job.win?.player === pl.id;
        const heb = /[א-ת]/.test(pl.name);
        const st = latest(job.strength?.[pl.id] ?? [], t).cur;
        const stP = st ? soft(frame, fps, st[0], 14) : 0;
        return (
          <React.Fragment key={pl.id}>
            {pl.cards.map((c, k) => {
              const flip =
                pl.hiddenUntil !== undefined
                  ? t < pl.hiddenUntil
                    ? 0
                    : soft(frame, fps, pl.hiddenUntil + k * 0.12, 13)
                  : soft(frame, fps, job.hudFrom! + 0.1 + k * 0.1, 15);
              const lift = pl.hiddenUntil !== undefined && t >= pl.hiddenUntil ? Math.sin(Math.PI * Math.min(1, flip)) * -26 : 0;
              return (
                <Card
                  key={c}
                  card={c}
                  w={96}
                  h={138}
                  flip={flip}
                  glow={isWinner && winSet.has(c) ? win : 0}
                  dim={win && !isWinner ? win : 0}
                  shine={isWinner && winSet.has(c) ? shine : 0}
                  style={{position: 'absolute', left: (left ? 60 : 820) + k * 104, top: top + 228, transform: `translateY(${lift}px)`}}
                />
              );
            })}
            <div
              style={{
                position: 'absolute',
                [left ? 'left' : 'right']: 276,
                top: top + 226,
                display: 'flex',
                flexDirection: left ? 'row' : 'row-reverse',
                alignItems: 'center',
                gap: 12,
                opacity: win && !isWinner ? 1 - 0.45 * win : 1,
              }}
            >
              <div style={{fontFamily: heb ? 'Heebo' : 'Barlow', fontWeight: 800, fontSize: 42, color: '#fff', direction: heb ? 'rtl' : 'ltr'}}>{pl.name}</div>
              {st && st[1] && (
                <div
                  style={{
                    fontFamily: 'Barlow',
                    fontWeight: 700,
                    fontSize: 24,
                    letterSpacing: 1.5,
                    color: YELLOW,
                    border: `2px solid ${YELLOW}`,
                    borderRadius: 5,
                    padding: '3px 9px',
                    opacity: stP,
                    transform: `scale(${0.8 + 0.2 * stP})`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {st[1]}
                </div>
              )}
            </div>
            <div style={{position: 'absolute', [left ? 'left' : 'right']: 276, top: top + 296, width: 300}}>
              <Label acts={job.actions?.[pl.id] ?? []} t={t} frame={frame} fps={fps} align={left ? 'left' : 'right'} />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

const Pot: React.FC<{job: Job; t: number}> = ({job, t}) => {
  if (!job.pot || job.hudFrom === undefined || t < job.hudFrom) return null;
  const {cur, prev} = latest(job.pot, t);
  if (!cur) return null;
  const p = interpolate(t - cur[0], [0, 0.5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const from = prev ? prev[1] : cur[1];
  const v = from + (cur[1] - from) * p;
  const pulse = 1 + 0.09 * Math.sin(Math.PI * p) * (prev ? 1 : 0);
  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        top: L(job).potTop,
        height: 86,
        padding: '0 24px',
        background: 'rgba(14,19,22,0.9)',
        border: '1px solid rgba(255,194,26,0.35)',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: `0 0 ${24 * (pulse - 1) * 10}px rgba(255,194,26,${(pulse - 1) * 3})`,
      }}
    >
      <div style={{transform: `rotate(${p * 360 * (prev ? 1 : 0)}deg)`}}>
        <Chip size={52} />
      </div>
      <div style={{fontFamily: 'Barlow', fontWeight: 600, fontSize: 34, color: '#9aa4a8', letterSpacing: 3}}>POT</div>
      <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 58, color: '#fff', transform: `scale(${pulse})`, marginLeft: 8, fontVariantNumeric: 'tabular-nums'}}>
        {Math.round(v).toLocaleString('en-US')}
      </div>
      {job.unit && <div style={{fontFamily: 'Barlow', fontWeight: 700, fontSize: 24, color: '#fff', marginTop: 12}}>{job.unit}</div>}
    </div>
  );
};

const Tag: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  const tag = job.tag;
  if (!tag || t < tag.at || t > tag.until) return null;
  const p = soft(frame, fps, tag.at, 18);
  const out = interpolate(t, [tag.until - 0.3, tag.until], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', right: 44, top: L(job).tagTop, direction: 'rtl', textAlign: 'right', opacity: p * out, transform: `translateX(${(1 - p) * 30}px)`}}>
      <div style={{fontFamily: 'Heebo', fontWeight: 800, fontSize: 42, color: '#fff', textShadow: '0 3px 10px rgba(0,0,0,0.7)'}}>{tag.text}</div>
      <div style={{height: 5, background: YELLOW, marginTop: 4, width: `${p * 100}%`}} />
      {tag.sub && <div style={{fontFamily: 'Heebo', fontWeight: 700, fontSize: 30, color: '#ddd', marginTop: 6, textShadow: '0 3px 10px rgba(0,0,0,0.7)'}}>{tag.sub}</div>}
    </div>
  );
};

const EquityBox: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  const eq = job.equity;
  if (!eq || t < eq.at || (eq.until && t > eq.until)) return null;
  const pIn = soft(frame, fps, eq.at, 18);
  return (
    <div
      style={{
        position: 'absolute',
        left: 84,
        top: L(job).eqTop,
        width: 912,
        height: 320,
        background: 'rgba(12,14,16,0.9)',
        border: '1px solid rgba(255,194,26,0.25)',
        borderRadius: 18,
        opacity: Math.min(1, pIn * 1.3),
        transform: `translateY(${(1 - pIn) * -30}px) scale(${0.96 + 0.04 * pIn})`,
        boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
      }}
    >
      <div style={{position: 'absolute', top: 28, left: 0, right: 0, textAlign: 'center', direction: 'rtl'}}>
        <span style={{fontFamily: 'Heebo', fontWeight: 800, fontSize: 42, color: '#fff'}}>האקוויטי של {eq.player}</span>
        {eq.gain && job.win && t >= job.win.at && (
          <span style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 44, color: YELLOW, marginRight: 20, direction: 'ltr', display: 'inline-block'}}>{eq.gain}</span>
        )}
      </div>
      <div style={{position: 'absolute', top: 105, left: 30, right: 30, display: 'flex', justifyContent: 'space-around'}}>
        {eq.values.map(([label, v], i) => {
          const a = eq.at + 0.3 + i * 0.32;
          const p = t < a ? 0 : soft(frame, fps, a, 15);
          const n = interpolate(t - a, [0, 0.4], [0, v], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
          const final = i === eq.values.length - 1;
          return (
            <div key={label} style={{width: 190, textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * 22}px)`}}>
              <div style={{fontFamily: 'Barlow', fontWeight: 700, fontSize: 38, color: '#b9c0c4', letterSpacing: 2}}>{label}</div>
              <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 84, color: final ? YELLOW : '#fff', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums'}}>{Math.round(n)}%</div>
              <div style={{margin: '14px auto 0', width: 150, height: 6, borderRadius: 3, background: '#2b3034'}}>
                <div style={{width: `${n}%`, height: '100%', borderRadius: 3, background: final ? YELLOW : '#e9eef0'}} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Hook: React.FC<{job: Job; o: number; frame: number; fps: number}> = ({job, o, frame, fps}) => {
  const h = job.hook!;
  const outP = interpolate(o, [HOOK_SEC - 0.45, HOOK_SEC], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  if (outP >= 1) return null;
  const a = (s: number, d = 16) => spring({frame: frame - Math.round(s * fps), fps, config: {damping: d, mass: 0.7, stiffness: 140}});
  const stamp = a(0.35, 9);
  const shake = o > 0.35 && o < 0.6 ? Math.sin(o * 120) * 10 * (1 - (o - 0.35) / 0.25) : 0;
  const drift = 1 + 0.04 * Math.min(1, o / HOOK_SEC);
  const [l1, l2] = h.head;
  const line = (s: string) =>
    s.split(' ').map((w, i) => (
      <span key={i} style={{color: w === h.hlWord ? YELLOW : '#fff'}}>
        {w}{' '}
      </span>
    ));
  return (
    <AbsoluteFill style={{background: `rgba(0,0,0,${0.86 * (1 - outP)})`}}>
      <AbsoluteFill
        style={{
          opacity: 1 - outP,
          filter: `blur(${outP * 16}px)`,
          transform: `translate(${shake}px, ${shake * 0.4}px) scale(${drift + outP * 0.12})`,
          alignItems: 'center',
        }}
      >
        <div style={{position: 'absolute', top: 520, display: 'flex', gap: 14}}>
          {h.show.map((c, i) => {
            const p = a(0.04 + i * 0.07, 13);
            return (
              <Card
                key={i}
                card={c === '??' ? null : c}
                w={98}
                h={140}
                flip={c === '??' ? 0 : a(0.14 + i * 0.07, 13)}
                style={{opacity: p, transform: `translateY(${(1 - p) * -90}px) rotate(${(1 - p) * (i % 2 ? 12 : -12)}deg)`}}
              />
            );
          })}
        </div>
        <div
          style={{
            position: 'absolute',
            top: 720,
            fontFamily: 'Barlow',
            fontWeight: 800,
            fontSize: 250,
            color: '#fff',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            letterSpacing: 4,
            opacity: Math.min(1, stamp * 2),
            transform: `scale(${2.2 - 1.2 * stamp})`,
            textShadow: '0 0 40px rgba(255,194,26,0.35)',
          }}
        >
          {h.stat}
        </div>
        <div style={{position: 'absolute', top: 1000, fontFamily: 'Heebo', fontWeight: 700, fontSize: 42, color: '#c6ccce', direction: 'rtl', opacity: a(0.7), transform: `translateY(${(1 - a(0.7)) * 16}px)`}}>
          {h.statLabel}
        </div>
        <div style={{position: 'absolute', top: 1110, width: 940, height: 300}}>
          <div
            style={{
              position: 'absolute',
              left: 60,
              right: 60,
              top: 30,
              bottom: 30,
              background: YELLOW,
              opacity: 0.14,
              clipPath: 'polygon(3% 10%, 100% 0%, 97% 90%, 0% 100%)',
              transform: `scaleX(${interpolate(o, [1.0, 1.35], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)})})`,
              transformOrigin: 'right center',
            }}
          />
          <div
            style={{
              position: 'relative',
              textAlign: 'center',
              fontFamily: 'Heebo',
              fontWeight: 900,
              fontSize: 108,
              lineHeight: 1.1,
              direction: 'rtl',
              paddingTop: 40,
              opacity: a(0.95),
              transform: `translateY(${(1 - a(0.95)) * 26}px)`,
            }}
          >
            {line(l1)}
            <br />
            {line(l2)}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{job: Job; sec: number}> = ({job, sec}) => {
  const p = interpolate(sec, [0, 0.5], [0, 1], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{background: `rgba(0,0,0,${p})`, alignItems: 'center', justifyContent: 'center', gap: 26}}>
      <div style={{opacity: p, transform: `scale(${0.92 + 0.08 * p})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24}}>
        <Chip size={110} />
        <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 110, letterSpacing: 10, color: '#fff'}}>{job.brand}</div>
        {job.credit && <div style={{fontFamily: 'Heebo', fontWeight: 700, fontSize: 38, color: '#9aa4a8', direction: 'rtl'}}>{job.credit}</div>}
      </div>
    </AbsoluteFill>
  );
};

// ---------- sound design ----------
type Sfx = {at: number; file: string; vol: number; dur: number};
const buildSfx = (job: Job, hookSec: number, withHook: boolean): Sfx[] => {
  const o = (t: number) => hookSec + srcToOut(job, t);
  const list: Sfx[] = [];
  if (withHook && job.hook) {
    list.push({at: 0.05, file: 'card.wav', vol: 0.5, dur: 0.3});
    list.push({at: 0.35, file: 'impact.wav', vol: 0.75, dur: 0.9});
    list.push({at: HOOK_SEC - 0.5, file: 'whoosh.wav', vol: 0.5, dur: 0.6});
  }
  (job.boardAt ?? []).forEach((t) => list.push({at: o(t), file: 'card.wav', vol: 0.32, dur: 0.3}));
  for (const acts of Object.values(job.actions ?? {}))
    for (const [t, label] of acts)
      if (/BET|RAISE|CALL|ALL-IN/.test(label)) list.push({at: o(t), file: 'chips.wav', vol: 0.26, dur: 0.5});
  for (const p of job.players ?? [])
    if (p.hiddenUntil !== undefined && p.hiddenUntil < 1e4) {
      list.push({at: o(p.hiddenUntil), file: 'impact.wav', vol: 0.26, dur: 0.9});
      list.push({at: o(p.hiddenUntil), file: 'flip.wav', vol: 0.36, dur: 0.2});
    }
  if (job.win) list.push({at: o(job.win.at), file: 'win.wav', vol: 0.22, dur: 1.4});
  return list;
};

// ---------- the reel ----------
export const HandReel: React.FC<{job: Job; withHook: boolean; showEnd?: boolean; sfx?: boolean}> = ({job, withHook, showEnd = true, sfx: sfxOn = true}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const hookSec = withHook && job.hook ? HOOK_SEC : 0;
  const content = outDuration(job);
  const o = frame / fps;
  const inContent = o >= hookSec && o < hookSec + content;
  const t = outToSrc(job, Math.min(content - 0.001, Math.max(0, o - hookSec)));
  const sf = Math.round(t * fps);

  // camera accents on the big moments: reveal and win
  const moments: number[] = [];
  for (const p of job.players ?? []) if (p.hiddenUntil !== undefined && p.hiddenUntil < 1e4) moments.push(p.hiddenUntil);
  if (job.win) moments.push(job.win.at);
  let punch = 1;
  let shakeX = 0;
  let shakeY = 0;
  let flash = 0;
  for (const m of moments) {
    const d = (o - (hookSec + srcToOut(job, m))) * fps;
    if (d >= 0 && d < 40) {
      punch *= 1 + 0.07 * (1 - Math.exp(-d / 2.5)) * Math.exp(-d / 14);
      flash = Math.max(flash, 0.32 * Math.exp(-d / 3.5));
      if (d < 12) {
        shakeX += Math.sin(d * 2.3) * 14 * (1 - d / 12);
        shakeY += Math.cos(d * 1.9) * 9 * (1 - d / 12);
      }
    }
  }
  const endSec = o - (hookSec + content);
  const lastFade = showEnd ? interpolate(frame, [durationInFrames - 10, durationInFrames - 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const sfx = sfxOn ? buildSfx(job, hookSec, withHook) : [];

  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Footage job={job} offsetOut={hookSec} punch={punch} shakeX={shakeX} shakeY={shakeY} />
      {inContent && (
        <AbsoluteFill style={{transform: `translate(${shakeX * 0.4}px, ${shakeY * 0.4}px)`}}>
          <Captions job={job} t={t} frame={sf} fps={fps} />
          <Pot job={job} t={t} />
          <Tag job={job} t={t} frame={sf} fps={fps} />
          <Hud job={job} t={t} frame={sf} fps={fps} />
          <EquityBox job={job} t={t} frame={sf} fps={fps} />
        </AbsoluteFill>
      )}
      {job.brand && inContent && (
        <div style={{position: 'absolute', right: 44, top: L(job).brandTop, fontFamily: 'Barlow', fontWeight: 800, fontSize: 30, letterSpacing: 4, color: 'rgba(255,255,255,0.75)'}}>
          {job.brand}
        </div>
      )}
      {flash > 0 && <AbsoluteFill style={{background: '#fff', opacity: flash}} />}
      {hookSec > 0 && o < hookSec + 0.1 && <Hook job={job} o={o} frame={frame} fps={fps} />}
      {endSec >= 0 && job.brand && showEnd && <EndCard job={job} sec={endSec} />}
      {sfx.map((s, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(s.at * fps))} durationInFrames={Math.round(s.dur * fps) + 2} layout="none">
          <Audio src={staticFile('sfx/' + s.file)} volume={s.vol} />
        </Sequence>
      ))}
      {lastFade > 0 && <AbsoluteFill style={{background: '#000', opacity: lastFade}} />}
    </AbsoluteFill>
  );
};

export const reelFrames = (job: Job, withHook: boolean, showEnd = true) =>
  Math.round((outDuration(job) + (withHook && job.hook ? HOOK_SEC : 0) + (job.brand && showEnd ? END_SEC : 0)) * FPS);

// two hands back to back: the first opens with its hook, a short bridge card, the second closes with the end card
const BRIDGE_SEC = 1.2;
export const DoubleReel: React.FC<{first: Job; second: Job; withHook: boolean; bridge: string}> = ({first, second, withHook, bridge}) => {
  const {fps} = useVideoConfig();
  const a = reelFrames(first, withHook, false);
  const b = Math.round(BRIDGE_SEC * fps);
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Sequence durationInFrames={a}>
        <HandReel job={first} withHook={withHook} showEnd={false} />
      </Sequence>
      <Sequence from={a} durationInFrames={b}>
        <Bridge text={bridge} />
      </Sequence>
      <Sequence from={a + b}>
        <HandReel job={second} withHook={false} />
      </Sequence>
    </AbsoluteFill>
  );
};
const Bridge: React.FC<{text: string}> = ({text}) => {
  const f = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const p = spring({frame: f, fps, config: {damping: 14, stiffness: 160}});
  const out = interpolate(f, [durationInFrames - 8, durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: '#000', alignItems: 'center', justifyContent: 'center'}}>
      <Sequence layout="none"><Audio src={staticFile('sfx/whoosh.wav')} volume={0.5} /></Sequence>
      <div style={{fontFamily: 'Heebo', fontWeight: 900, fontSize: 120, color: '#fff', direction: 'rtl', opacity: p * out, transform: `scale(${1.3 - 0.3 * p})`}}>
        {text.split(' ').map((w, i) => <span key={i} style={{color: i === 1 ? YELLOW : '#fff'}}>{w} </span>)}
      </div>
    </AbsoluteFill>
  );
};
export const doubleFrames = (first: Job, second: Job, withHook: boolean) =>
  reelFrames(first, withHook, false) + Math.round(BRIDGE_SEC * FPS) + reelFrames(second, false);
