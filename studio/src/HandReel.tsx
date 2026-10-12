import React from 'react';
import {
  AbsoluteFill,
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
  equity?: {player: string; values: [string, number][]; at: number; until?: number; gain?: string};
  win?: {at: number; player: string; cards: string[]};
  hook?: {stat: string; statLabel: string; head: [string, string]; hlWord?: string; show: string[]; vs?: boolean};
  brand?: string;
};

export const HOOK_SEC = 2.3;

// map source time <-> output time through the cut list
export const outDuration = (job: Job) => job.segments.reduce((a, s) => a + (s.to - s.from), 0);
const srcToOut = (job: Job, t: number) => {
  let acc = 0;
  for (const s of job.segments) {
    if (t < s.from) return acc; // snaps into the next segment start
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
  const last = job.segments[job.segments.length - 1];
  return last.to;
};

const last = <T,>(list: [number, ...T[]][], t: number) => {
  let r: [number, ...T[]] | null = null;
  let prev: [number, ...T[]] | null = null;
  for (const x of list) if (x[0] <= t) {
    prev = r;
    r = x;
  }
  return {cur: r, prev};
};

// ---------- video layout: 16:9 source shown in the top 1080x1080 square ----------
const VIDEO_H = 1080;

const Footage: React.FC<{job: Job; offsetOut: number}> = ({job, offsetOut}) => {
  const {fps} = useVideoConfig();
  let acc = offsetOut;
  return (
    <AbsoluteFill>
      {job.segments.map((s, i) => {
        const from = Math.round(acc * fps);
        const dur = Math.round((s.to - s.from) * fps);
        acc += s.to - s.from;
        const zoom = s.zoom ?? 1;
        const cropX = s.cropX ?? 0.5;
        // the source is scaled to fill a 1080x1080 box, keeping its aspect
        const w = (VIDEO_H * 16) / 9 * zoom;
        const left = -(w - 1080) * cropX;
        return (
          <Sequence key={i} from={from} durationInFrames={dur} layout="none">
            <div style={{position: 'absolute', left: 0, top: 0, width: 1080, height: VIDEO_H, overflow: 'hidden'}}>
              <OffthreadVideo
                src={staticFile(job.src)}
                trimBefore={Math.round(s.from * fps)}
                style={{position: 'absolute', height: VIDEO_H * zoom, width: w, left, top: -(VIDEO_H * zoom - VIDEO_H) / 2}}
              />
            </div>
          </Sequence>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: VIDEO_H - 260,
          height: 262,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0), #000)',
        }}
      />
    </AbsoluteFill>
  );
};

// ---------- word-by-word captions ----------
const Captions: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  // chunk words: max 3 words or a pause
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
  const end = chunk[chunk.length - 1].t + 1.2;
  if (t > end) return null;
  const pIn = spring({frame: frame - Math.round(chunk[0].t * fps), fps, config: {damping: 18, stiffness: 160}});
  return (
    <div
      style={{
        position: 'absolute',
        top: VIDEO_H - 190,
        left: 40,
        right: 40,
        display: 'flex',
        justifyContent: 'center',
        gap: 18,
        direction: 'rtl',
        flexWrap: 'wrap',
        transform: `translateY(${(1 - pIn) * 14}px)`,
        opacity: Math.min(1, pIn * 1.5),
      }}
    >
      {chunk.map((w, i) => {
        const on = t >= w.t;
        const p = spring({frame: frame - Math.round(w.t * fps), fps, config: {damping: 16, stiffness: 200}});
        return (
          <span
            key={i}
            style={{
              fontFamily: 'Heebo',
              fontWeight: 800,
              fontSize: 76,
              color: w.hl ? YELLOW : '#fff',
              textShadow: '0 4px 14px rgba(0,0,0,0.85)',
              opacity: on ? Math.min(1, 0.35 + p) : 0.35,
              transform: `scale(${on ? 0.92 + 0.08 * p : 0.92})`,
              display: 'inline-block',
            }}
          >
            {w.w}
          </span>
        );
      })}
    </div>
  );
};

// ---------- HUD ----------
const soft = (frame: number, fps: number, at: number, damping = 18) =>
  spring({frame: frame - Math.round(at * fps), fps, config: {damping, mass: 0.7, stiffness: 120}});

const Label: React.FC<{acts: Act[]; t: number; frame: number; fps: number; align: 'left' | 'right'}> = ({acts, t, frame, fps, align}) => {
  const {cur, prev} = last(acts as unknown as [number, string, boolean?][], t);
  const box = (a: Act, opacity: number, scale: number, y: number) => (
    <div
      style={{
        position: 'absolute',
        [align]: 0,
        top: 0,
        height: 46,
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        background: a[2] ? YELLOW : '#202326',
        color: a[2] ? '#111' : '#fff',
        fontFamily: 'Barlow',
        fontWeight: 700,
        fontSize: 31,
        borderRadius: 5,
        whiteSpace: 'nowrap',
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
        transformOrigin: `${align} center`,
      }}
    >
      {a[1]}
    </div>
  );
  if (!cur) return null;
  const pIn = soft(frame, fps, cur[0], 16);
  const out = interpolate(t - cur[0], [0, 0.18], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'relative', height: 46}}>
      {prev && prev[1] && out > 0 && box(prev as Act, out, 1, 0)}
      {cur[1] && box(cur as Act, Math.min(1, pIn * 1.4), 0.9 + 0.1 * pIn, (1 - pIn) * 10)}
    </div>
  );
};

const Hud: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  if (!job.players || job.hudFrom === undefined || t < job.hudFrom) return null;
  const enter = soft(frame, fps, job.hudFrom, 20);
  const win = job.win && t >= job.win.at ? soft(frame, fps, job.win.at, 22) : 0;
  const winSet = new Set(job.win?.cards ?? []);
  const board = job.board ?? [];
  const bw = 140;
  const bh = 200;
  const gap = 10;
  const bl = 540 - (5 * bw + 4 * gap) / 2;
  const top = 1150;
  return (
    <div style={{position: 'absolute', inset: 0, opacity: enter, transform: `translateY(${(1 - enter) * 30}px)`}}>
      {board.map((c, k) => {
        const at = job.boardAt?.[k] ?? 0;
        if (t < at) return null;
        const p = soft(frame, fps, at, 17);
        const flip = soft(frame, fps, at + 0.12, 16);
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
            style={{
              position: 'absolute',
              left: bl + k * (bw + gap),
              top,
              opacity: Math.min(1, p * 1.6),
              transform: `translateY(${(1 - p) * -46}px) rotate(${(1 - p) * -6}deg)`,
            }}
          />
        );
      })}
      {job.players.map((pl) => {
        const left = pl.side === 'left';
        const cardsX = left ? 60 : 824;
        const isWinner = job.win?.player === pl.id;
        return (
          <React.Fragment key={pl.id}>
            {pl.cards.map((c, k) => {
              const hidden = pl.hiddenUntil !== undefined && t < pl.hiddenUntil;
              const flip = hidden ? 0 : soft(frame, fps, pl.hiddenUntil ?? job.hudFrom! + 0.08 + k * 0.08, 15);
              return (
                <Card
                  key={c}
                  card={c}
                  w={94}
                  h={134}
                  flip={pl.hiddenUntil !== undefined ? (t < pl.hiddenUntil ? 0 : soft(frame, fps, pl.hiddenUntil + k * 0.12, 15)) : flip}
                  glow={isWinner && winSet.has(c) ? win : 0}
                  dim={win && !isWinner ? win : 0}
                  style={{position: 'absolute', left: cardsX + k * 102, top: top + 226}}
                />
              );
            })}
            <div
              style={{
                position: 'absolute',
                [left ? 'left' : 'right']: 272,
                top: top + 232,
                fontFamily: /[א-ת]/.test(pl.name) ? 'Heebo' : 'Barlow',
                fontWeight: 800,
                fontSize: 40,
                color: '#fff',
                direction: /[א-ת]/.test(pl.name) ? 'rtl' : 'ltr',
                opacity: win && !isWinner ? 1 - 0.45 * win : 1,
              }}
            >
              {pl.name}
            </div>
            <div style={{position: 'absolute', [left ? 'left' : 'right']: 272, top: top + 300, width: 280}}>
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
  const {cur, prev} = last(job.pot as unknown as [number, number][], t);
  if (!cur) return null;
  const p = interpolate(t - cur[0], [0, 0.45], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const from = prev ? (prev[1] as number) : (cur[1] as number);
  const v = from + ((cur[1] as number) - from) * p;
  const pulse = 1 + 0.07 * Math.sin(Math.PI * p) * (prev ? 1 : 0);
  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        top: 40,
        height: 84,
        padding: '0 22px',
        background: 'rgba(14,19,22,0.92)',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <Chip size={50} />
      <div style={{fontFamily: 'Barlow', fontWeight: 600, fontSize: 34, color: '#9aa4a8', letterSpacing: 3}}>POT</div>
      <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 56, color: '#fff', transform: `scale(${pulse})`, marginLeft: 10}}>
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
    <div
      style={{
        position: 'absolute',
        right: 44,
        top: 52,
        direction: 'rtl',
        textAlign: 'right',
        opacity: p * out,
        transform: `translateX(${(1 - p) * 30}px)`,
      }}
    >
      <div style={{fontFamily: 'Heebo', fontWeight: 800, fontSize: 40, color: '#fff', textShadow: '0 3px 10px rgba(0,0,0,0.7)'}}>
        {tag.text}
      </div>
      <div style={{height: 5, background: YELLOW, marginTop: 4, width: `${p * 100}%`}} />
      {tag.sub && (
        <div style={{fontFamily: 'Heebo', fontWeight: 700, fontSize: 30, color: '#ddd', marginTop: 6, textShadow: '0 3px 10px rgba(0,0,0,0.7)'}}>
          {tag.sub}
        </div>
      )}
    </div>
  );
};

const EquityBox: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  const eq = job.equity;
  if (!eq || t < eq.at || (eq.until && t > eq.until)) return null;
  const pIn = interpolate(t - eq.at, [0, 0.25], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <div
      style={{
        position: 'absolute',
        left: 84,
        top: 150,
        width: 912,
        height: 320,
        background: 'rgba(12,14,16,0.9)',
        backdropFilter: 'blur(16px)',
        borderRadius: 16,
        opacity: pIn,
        transform: `scale(${0.98 + 0.02 * pIn})`,
      }}
    >
      <div style={{position: 'absolute', top: 28, left: 0, right: 0, textAlign: 'center', direction: 'rtl'}}>
        <span style={{fontFamily: 'Heebo', fontWeight: 800, fontSize: 42, color: '#fff'}}>האקוויטי של {eq.player}</span>
        {eq.gain && job.win && t >= job.win.at && (
          <span style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 44, color: YELLOW, marginRight: 20, direction: 'ltr', display: 'inline-block'}}>
            {eq.gain}
          </span>
        )}
      </div>
      <div style={{position: 'absolute', top: 105, left: 30, right: 30, display: 'flex', justifyContent: 'space-around'}}>
        {eq.values.map(([label, v], i) => {
          const at = eq.at + 0.3 + i * 0.38;
          const p = t < at ? 0 : soft(frame, fps, at, 18);
          const n = interpolate(t - at, [0, 0.35], [0, v], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
          const final = i === eq.values.length - 1;
          return (
            <div key={label} style={{width: 190, textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * 18}px)`}}>
              <div style={{fontFamily: 'Barlow', fontWeight: 700, fontSize: 38, color: '#b9c0c4', letterSpacing: 2}}>{label}</div>
              <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 84, color: final ? YELLOW : '#fff', lineHeight: 1.05}}>{Math.round(n)}%</div>
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
  const outP = interpolate(o, [HOOK_SEC - 0.4, HOOK_SEC], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  if (outP >= 1) return null;
  const a = (s: number) => spring({frame: frame - Math.round(s * fps), fps, config: {damping: 18, mass: 0.7, stiffness: 120}});
  const rise = (p: number, d = 26) => ({opacity: p, transform: `translateY(${(1 - p) * d}px)`});
  const num = parseFloat(h.stat);
  const isNum = !Number.isNaN(num);
  const n = isNum ? interpolate(o, [0.3, 1.0], [0, num], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)}) : 0;
  const drift = 1 + 0.035 * Math.min(1, o / HOOK_SEC);
  const [l1, l2] = h.head;
  const renderLine = (s: string) =>
    s.split(' ').map((w, i) => (
      <span key={i} style={{color: w === h.hlWord ? YELLOW : '#fff'}}>
        {w}{' '}
      </span>
    ));
  return (
    <AbsoluteFill style={{background: `rgba(0,0,0,${1 - outP})`}}>
      <AbsoluteFill style={{opacity: 1 - outP, filter: `blur(${outP * 14}px)`, transform: `scale(${drift + outP * 0.06})`, alignItems: 'center'}}>
        <div style={{position: 'absolute', top: 560, display: 'flex', gap: 14, alignItems: 'center', ...rise(a(0.05))}}>
          {h.show.map((c, i) => (
            <Card key={i} card={c === '??' ? null : c} w={86} h={124} flip={c === '??' ? 0 : a(0.15 + i * 0.08)} />
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            top: 720,
            fontFamily: 'Barlow',
            fontWeight: 800,
            fontSize: 270,
            color: '#fff',
            lineHeight: 1,
            opacity: a(0.3),
            transform: `scale(${0.92 + 0.08 * a(0.3)})`,
          }}
        >
          {isNum ? `${Math.round(n)}${h.stat.replace(/[0-9.]/g, '')}` : h.stat}
        </div>
        <div style={{position: 'absolute', top: 1010, fontFamily: 'Heebo', fontWeight: 700, fontSize: 40, color: '#a3abaf', direction: 'rtl', ...rise(a(0.6), 14)}}>
          {h.statLabel}
        </div>
        <div
          style={{
            position: 'absolute',
            top: 1150,
            width: 900,
            textAlign: 'center',
            fontFamily: 'Heebo',
            fontWeight: 900,
            fontSize: 104,
            lineHeight: 1.08,
            direction: 'rtl',
            ...rise(a(0.9), 22),
          }}
        >
          {renderLine(l1)}
          <br />
          {renderLine(l2)}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const HandReel: React.FC<{job: Job; withHook: boolean}> = ({job, withHook}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const hookSec = withHook && job.hook ? HOOK_SEC : 0;
  const o = frame / fps; // output seconds
  const inContent = o >= hookSec;
  const t = outToSrc(job, Math.max(0, o - hookSec)); // source seconds
  // frame clock in source time, for springs
  const sf = Math.round(t * fps);
  const endFade = interpolate(frame, [durationInFrames - 12, durationInFrames - 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Footage job={job} offsetOut={hookSec} />
      {inContent && (
        <>
          <Captions job={job} t={t} frame={sf} fps={fps} />
          <Pot job={job} t={t} />
          <Tag job={job} t={t} frame={sf} fps={fps} />
          <Hud job={job} t={t} frame={sf} fps={fps} />
          <EquityBox job={job} t={t} frame={sf} fps={fps} />
        </>
      )}
      {job.brand && (
        <div
          style={{
            position: 'absolute',
            right: 44,
            top: VIDEO_H - 70,
            fontFamily: 'Barlow',
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 3,
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          {job.brand}
        </div>
      )}
      {hookSec > 0 && <Hook job={job} o={o} frame={frame} fps={fps} />}
      {endFade > 0 && <AbsoluteFill style={{background: '#000', opacity: endFade}} />}
    </AbsoluteFill>
  );
};

export {srcToOut};
