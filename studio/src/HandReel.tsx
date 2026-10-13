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
import {Card, Chip, DeckContext, YELLOW} from './Cards';
import {loadFonts} from './fonts';

loadFonts();

// ---------- job format (all times are seconds in the SOURCE video) ----------
// src/srcOffset: a part taken from another file; its times are kept on their own (negative) clock, source time = from + srcOffset
export type Seg = {from: number; to: number; cropX?: number; zoom?: number; src?: string; srcOffset?: number; join?: boolean; vy?: number; cover?: [number, number]}; // join: continues the previous part's sound with no cut; vy: (vertical sources) source row placed at the top of the frame
export type Word = {t: number; w: string; hl?: boolean};
export type Act = [number, string, boolean?]; // time, label, hot
export type Player = {
  id: string;
  name: string;
  cards: [string, string];
  hiddenUntil?: number; // face down until this time
  side: 'left' | 'right';
  row?: number; // 0 = first row of players, 1 = a second row under it (three-way pots)
};
export type Job = {
  src: string;
  title?: string;
  layout?: 'top' | 'full'; // full = vertical frame
  // for a 16:9 source in the full layout: what each stretch of the source shows, and where to crop
  modes?: [number, number, 'face' | 'table' | 'broll' | 'wide', number?, number?, [number, number, number][]?][]; // from, to, mode, face x and y (source px), optional face track [t, x, y] for someone who moves
  eqTop?: number; // equity box position / size overrides
  eqScale?: number;
  faceAt?: number; // with a face y in the mode: keep the face centre at this height (px) so captions clear the chin
  potPos?: 'top' | 'bottom' | 'center'; // where the pot box sits (default top-left)
  rowGap?: number; // px between player rows
  hudStyle?: 'compact'; // compact panels laid exactly over a broadcast's own graphics, no dark floor
  hudBox?: {x: number; y: number; w: number; rowH: number; gap: number; bx: number; by: number; bw: number; bh: number}; // compact layout: player rows at left, board+pot box at right
  vertical?: boolean; // the source is already 9:16: fill the frame with it instead of cropping a 16:9 shot
  floorTop?: number; // solid floor under the HUD from this height (hides a broadcast's own graphics)
  logo?: boolean; // false hides the brand logo in the corner
  calm?: boolean; // no punch-in on the source's own camera changes, only on our cuts
  punches?: number[]; // camera punch-in moments with no text, to land a beat
  chipRain?: boolean; // false turns off the chips raining down on the winner
  shift?: number; // push the wide frame, captions and HUD down (px) to clear a headline above
  pip?: {x: number; y: number; w: number; h: number}; // face-cam window inside the source's table shots
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
  callouts?: [number, string][]; // big slam text at a moment (source time)
  seats?: {hero: string; villain: string; heroName: string; villainName: string}; // positions, e.g. SB / BTN
  meter?: {from: number; to: number; points: [number, number][]}; // live equity bar: [time, hero %]
  stamp?: {at: number; text: string; sub?: string}; // red stamp, e.g. ELIMINATED
  bustAt?: number; // villain's seat gets a red X on the seat map
  event?: string; // e.g. WSOP 2026 · LAS VEGAS
  deck?: string; // 'nolimit' = the No Limit card art
  handle?: string; // shown on the end card
  headline?: {lines: [string, string]; hl?: string; until: number}; // big title at the top while the reel opens
  speaker?: {name: string; sub?: string; at: number; until: number}; // name tag with a yellow underline
  prompt?: {at: number; until: number; question: string; yes: string; no: string; picked: 'yes' | 'no'; pickAt: number};
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
  full: {capTop: 930, hudTop: 1170, potTop: 120, tagTop: 132, eqTop: 108, brandTop: 66},
};
const L = (job: Job) => {
  const l = LAYOUT[job.layout ?? 'top'];
  return job.shift ? {...l, capTop: l.capTop + job.shift, hudTop: l.hudTop + job.shift} : l;
};

// ---------- footage with camera motion ----------
const modeAt = (job: Job, t: number) => {
  for (const m of job.modes ?? []) if (t >= m[0] && t < m[1]) return m;
  return null;
};

const SegVideo: React.FC<{job: Job; seg: Seg; index: number; dur: number; punch: number; shakeX: number; shakeY: number; joinOut?: boolean}> = ({
  job,
  seg,
  joinOut,
  index,
  dur,
  punch,
  shakeX,
  shakeY,
}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const base = (seg.zoom ?? 1) * (index % 2 === 0 ? 1.0 : 1.08);
  const drift = interpolate(f, [0, dur], [0, 0.045], {extrapolateRight: 'clamp'});
  const z = (base + drift) * punch;
  const trim = Math.round((seg.from + (seg.srcOffset ?? 0)) * fps);
  const src = staticFile(seg.src ?? job.src);
  // sound runs on its own track so picture changes never touch it
  const audio = (
    <Audio src={src} trimBefore={trim} volume={(vf) => Math.max(0, Math.min(1, seg.join ? 1 : (vf + 1) / 3, joinOut ? 1 : (dur - vf) / 3))} />
  );

  if (job.layout === 'full' && job.vertical) {
    const t = (trim + f) / fps - (seg.srcOffset ?? 0);
    const since = index > 0 && !seg.join ? f / fps : 99;
    const kick = since < 0.4 ? Math.exp(-since * fps / 2.6) : 0;
    // a compact HUD sits on the broadcast's own boxes, so the picture keeps one fixed scale there
    const fixed = job.hudStyle === 'compact';
    const s = Math.max(1080 / 1080, 1920 / 1910) * (fixed ? 1 : z * (1 + 0.06 * kick));
    const W = 1080 * s;
    const H = 1910 * s;
    const grade = `contrast(1.06) saturate(1.1) brightness(${1.02 + 0.2 * kick}) blur(${(6 * kick).toFixed(2)}px)`;
    void t;
    return (
      <AbsoluteFill style={{overflow: 'hidden'}}>
        {audio}
        <OffthreadVideo muted src={src} trimBefore={trim} style={{position: 'absolute', width: W, height: H, left: (1080 - W) / 2 + (fixed ? 0 : shakeX), top: fixed ? 0 : (seg.vy !== undefined ? Math.max(1920 - H, -seg.vy * s) : (1920 - H) * 0.3) + shakeY, filter: grade}} />
        {seg.cover && (
          // frosts a band of this shot (an operator screen at the bottom of the show's overhead camera)
          <div style={{position: 'absolute', left: 0, right: 0, top: seg.cover[0], height: seg.cover[1] - seg.cover[0], backdropFilter: 'blur(26px) brightness(0.55)', WebkitBackdropFilter: 'blur(26px) brightness(0.55)'}} />
        )}
      </AbsoluteFill>
    );
  }
  if (job.layout === 'full' && job.modes) {
    // same clock the picture runs on (the trim is whole frames), so a crop changes on the exact frame the shot does
    const t = (trim + f) / fps - (seg.srcOffset ?? 0);
    const m = modeAt(job, t);
    const mode = m ? m[2] : 'face';
    let cx = (m && m[3]) ?? 960;
    let cy = m && m[4];
    const track = m && m[5];
    if (track && track.length > 1) {
      // follow a face that moves: interpolate its (already smoothed) path
      const i = Math.max(0, Math.min(track.length - 2, track.findIndex((p) => p[0] > t) - 1));
      const [t0, x0, y0] = track[i];
      const [t1, x1, y1] = track[i + 1];
      const k = Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1)));
      cx = x0 + (x1 - x0) * k;
      cy = y0 + (y1 - y0) * k;
    }
    // punch-in with a quick blur on every cut and every change of shot
    const since = Math.min(index > 0 ? f / fps : 99, m && !job.calm ? t - m[0] : 99);
    const kick = since < 0.4 ? Math.exp(-since * fps / 2.6) : 0;
    let H = 1920 * z * (1 + 0.08 * kick);
    let top = (1920 - H) / 2;
    if (cy && job.faceAt) {
      // put the face at faceAt; grow the picture just enough that it still fills the frame
      H = Math.max(H, ((1920 - job.faceAt) * 1080) / (1080 - cy), (job.faceAt * 1080) / cy);
      top = Math.min(0, Math.max(1920 - H, job.faceAt - (cy * H) / 1080));
    }
    const W = (H * 16) / 9;
    const left = Math.min(0, Math.max(1080 - W, 540 - cx * (H / 1080))) + shakeX;
    top += shakeY;
    const grade = `contrast(1.07) saturate(1.12) brightness(${1.02 + 0.25 * kick}) blur(${(7 * kick).toFixed(2)}px)`;
    if ((mode === 'table' && job.pip) || mode === 'wide') {
      const rect = mode === 'wide' ? {x: 0, y: 0, w: 1920, h: 1080} : job.pip!;
      const pw = mode === 'wide' ? 1010 : 920;
      const sc = pw / rect.w;
      const ph = rect.h * sc;
      const pz = 1 + drift * 0.6;
      const enter = spring({frame: Math.round((m ? t - m[0] : 99) * fps), fps, config: {damping: 14, stiffness: 150}});
      return (
        <AbsoluteFill>
          {audio}
          <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
            <OffthreadVideo muted src={src} trimBefore={trim} style={{position: 'absolute', width: W * 1.1, height: H * 1.1, left: 540 - 960 * (H * 1.1 / 1080), top: (1920 - H * 1.1) / 2, filter: 'blur(26px) brightness(0.42) saturate(1.2)'}} />
          </div>
          <div
            style={{
              position: 'absolute',
              left: (1080 - pw) / 2 + shakeX * 0.5,
              top: (mode === 'wide' ? 330 + (job.shift ?? 0) : 250) + shakeY * 0.5 + (1 - enter) * 60,
              opacity: Math.min(1, enter * 1.4),
              transform: `scale(${0.88 + 0.12 * enter}) rotate(${(1 - enter) * -2}deg)`,
              width: pw,
              height: ph,
              borderRadius: 34,
              overflow: 'hidden',
              border: '3px solid rgba(255,194,26,0.75)',
              boxShadow: '0 24px 70px rgba(0,0,0,0.6), 0 0 40px rgba(255,194,26,0.18)',
            }}
          >
            <OffthreadVideo
              muted
              src={src}
              trimBefore={trim}
              style={{position: 'absolute', width: 1920 * sc * pz, height: 1080 * sc * pz, left: -rect.x * sc * pz - (pw * (pz - 1)) / 2, top: -rect.y * sc * pz - (ph * (pz - 1)) / 2, filter: grade}}
            />
          </div>
        </AbsoluteFill>
      );
    }
    return (
      <AbsoluteFill style={{overflow: 'hidden'}}>
        {audio}
        <OffthreadVideo muted src={src} trimBefore={trim} style={{position: 'absolute', width: W, height: H, left, top, filter: grade}} />
      </AbsoluteFill>
    );
  }

  const full = job.layout === 'full';
  const boxW = 1080;
  const boxH = full ? 1920 : VIDEO_H;
  const w = full ? boxW * z : ((VIDEO_H * 16) / 9) * z;
  const h = full ? boxH * z : VIDEO_H * z;
  const cropX = seg.cropX ?? 0.5;
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: boxW, height: boxH, overflow: 'hidden'}}>
      <OffthreadVideo
        src={src}
        trimBefore={trim}
        // short fades at every cut so speech never clicks or jumps
        volume={(vf) => Math.max(0, Math.min(1, (vf + 1) / 3, (dur - vf) / 3))}
        style={{position: 'absolute', width: w, height: h, left: -(w - boxW) * cropX + shakeX, top: -(h - boxH) / 2 + shakeY}}
      />
    </div>
  );
};

const Footage: React.FC<{job: Job; offsetOut: number; punch: number; shakeX: number; shakeY: number; shade?: number}> = ({job, offsetOut, punch, shakeX, shakeY, shade = 1}) => {
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
            <SegVideo job={job} seg={s} index={i} dur={dur} punch={punch} shakeX={shakeX} shakeY={shakeY} joinOut={!!job.segments[i + 1]?.join} />
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
              display: job.hudStyle === 'compact' ? 'none' : 'block',
              opacity: shade,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 28%, rgba(0,0,0,0.9) 58%, #000 72%)',
            }}
          />
          <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 38%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)', pointerEvents: 'none'}} />
          {job.floorTop !== undefined && (
            <div style={{position: 'absolute', left: 0, right: 0, top: job.floorTop - 220, bottom: 0, background: `linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0.85) 150px, #000 220px)`}} />
          )}
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
        columnGap: 30,
        rowGap: 4,
        direction: 'rtl',
        flexWrap: 'wrap',
        transform: `translateY(${(1 - pIn) * 18}px) scale(${0.94 + 0.06 * pIn})`,
        opacity: Math.min(1, pIn * 1.5),
      }}
    >
      {chunk.map((w, i) => {
        const on = t >= w.t;
        const p = spring({frame: frame - Math.round(w.t * fps), fps, config: w.hl ? {damping: 7, stiffness: 260} : {damping: 11, stiffness: 220}});
        const active = i === activeIdx;
        const tilt = w.hl && on ? (1 - Math.min(1, p)) * -8 : 0;
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
              transform: `scale(${on ? 0.93 + 0.07 * p + (active ? 0.03 : 0) : 0.93}) rotate(${tilt}deg)`,
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


// compact HUD: one panel per player stacked at the left, the board and pot in a panel at the right,
// each sitting exactly over a broadcast's own graphics so they never show, with the rest of the picture left clear
const HudCompact: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  if (!job.players || !job.hudBox || job.hudFrom === undefined || t < job.hudFrom) return null;
  const b = job.hudBox;
  const enter = soft(frame, fps, job.hudFrom, 20);
  const win = job.win && t >= job.win.at ? soft(frame, fps, job.win.at, 22) : 0;
  const shine = job.win ? interpolate(t - job.win.at - 0.25, [0, 0.9], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const winSet = new Set(job.win?.cards ?? []);
  const board = job.board ?? [];
  const at = job.boardAt ?? [];
  const panel: React.CSSProperties = {position: 'absolute', background: 'rgba(12,14,16,0.985)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, boxShadow: '0 10px 30px rgba(0,0,0,0.45)'};
  const cw = 66;
  const ch = 94;
  const pot = job.pot ? latest(job.pot, t) : {cur: undefined, prev: undefined};
  const pp = pot.cur ? interpolate(t - pot.cur[0], [0, 0.5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)}) : 0;
  const potV = pot.cur ? (pot.prev ? pot.prev[1] : pot.cur[1]) + (pot.cur[1] - (pot.prev ? pot.prev[1] : pot.cur[1])) * pp : 0;
  const pulse = 1 + 0.08 * Math.sin(Math.PI * pp) * (pot.prev ? 1 : 0);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: enter, transform: `translateY(${(1 - enter) * 24}px)`}}>
      {job.players.map((pl, i) => {
        const y = b.y + i * (b.rowH + b.gap);
        const isWinner = job.win?.player === pl.id;
        const st = latest(job.strength?.[pl.id] ?? [], t).cur;
        const stP = st ? soft(frame, fps, st[0], 14) : 0;
        const acts = job.actions?.[pl.id] ?? [];
        const folded = (latest(acts.map((a) => [a[0], a] as [number, Act]), t).cur?.[1][1] ?? '') === 'FOLD';
        const heb = /[א-ת]/.test(pl.name);
        return (
          <div key={pl.id} style={{...panel, left: b.x, top: y, width: b.w, height: b.rowH,
            border: isWinner && win ? `2px solid rgba(255,194,26,${0.4 + 0.6 * win})` : panel.border, boxShadow: isWinner && win ? `0 0 ${40 * win}px rgba(255,194,26,0.45)` : panel.boxShadow}}>
            <div style={{position: 'absolute', inset: 0, opacity: folded ? 0.45 : 1}}>
            {pl.cards.map((c, k) => (
              <Card key={c} card={c} w={cw} h={ch} flip={soft(frame, fps, job.hudFrom! + 0.15 + i * 0.12 + k * 0.08, 15)}
                glow={isWinner && winSet.has(c) ? win : 0} dim={win && !isWinner ? win * 0.6 : 0} shine={isWinner && winSet.has(c) ? shine : 0}
                style={{position: 'absolute', left: 16 + k * (cw + 6), top: (b.rowH - ch) / 2}} />
            ))}
            <div style={{position: 'absolute', left: 16 + 2 * (cw + 6) + 14, top: 14, display: 'flex', alignItems: 'center', gap: 12}}>
              <div style={{fontFamily: heb ? 'Heebo' : 'Barlow', fontWeight: 800, fontSize: 40, color: '#fff', direction: heb ? 'rtl' : 'ltr', lineHeight: 1}}>{pl.name}</div>
              {st && st[1] && (
                <div style={{fontFamily: 'Barlow', fontWeight: 700, fontSize: 22, letterSpacing: 1.5, color: YELLOW, border: `2px solid ${YELLOW}`, borderRadius: 5, padding: '2px 8px', opacity: stP, transform: `scale(${0.8 + 0.2 * stP})`, whiteSpace: 'nowrap'}}>{st[1]}</div>
              )}
            </div>
            <div style={{position: 'absolute', left: 16 + 2 * (cw + 6) + 14, top: b.rowH - 62, width: 330}}>
              <Label acts={acts} t={t} frame={frame} fps={fps} align="left" />
            </div>
            </div>
          </div>
        );
      })}
      <div style={{...panel, left: b.bx, top: b.by, width: b.bw, height: b.bh}}>
        {[0, 1, 2, 3, 4].map((k) => {
          const bcw = Math.min(cw, (b.bw - 28 - 24) / 5);
          const bch = bcw * 1.42;
          const x = 14 + k * (bcw + 6);
          const c = board[k];
          const a = at[k] ?? 1e9;
          if (!c || t < a) return <div key={'s' + k} style={{position: 'absolute', left: x, top: 14, width: bcw, height: bch, borderRadius: 8, border: '2px dashed rgba(255,255,255,0.14)'}} />;
          const p = soft(frame, fps, a, 15);
          const flip = soft(frame, fps, a + 0.12, 14);
          const inWin = winSet.has(c);
          return (
            <Card key={c} card={c} w={bcw} h={bch} flip={flip} glow={inWin ? win : 0} dim={win && !inWin ? win * 0.6 : 0} shine={inWin ? shine : 0}
              style={{position: 'absolute', left: x, top: 14, opacity: Math.min(1, p * 1.6), transform: `translateY(${(1 - p) * -40}px) rotate(${(1 - p) * -8}deg)`}} />
          );
        })}
        <div style={{position: 'absolute', left: 14, right: 14, bottom: 14, height: b.bh - Math.min(cw, (b.bw - 52) / 5) * 1.42 - 42, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14}}>
          <div style={{transform: `rotate(${pp * 360 * (pot.prev ? 1 : 0)}deg)`}}><Chip size={40} /></div>
          <div style={{fontFamily: 'Barlow', fontWeight: 600, fontSize: 28, color: '#9aa4a8', letterSpacing: 3}}>POT</div>
          <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 50, color: '#fff', transform: `scale(${pulse})`, fontVariantNumeric: 'tabular-nums'}}>{Math.round(potV).toLocaleString('en-US')}</div>
        </div>
      </div>
    </div>
  );
};

const Hud: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  if (job.hudStyle === 'compact') return <HudCompact job={job} t={t} frame={frame} fps={fps} />;
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
        const rowY = (pl.row ?? 0) * (job.rowGap ?? 168);
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
                  style={{position: 'absolute', left: (left ? 60 : 820) + k * 104, top: top + 228 + rowY, transform: `translateY(${lift}px)`}}
                />
              );
            })}
            <div
              style={{
                position: 'absolute',
                [left ? 'left' : 'right']: 276,
                top: top + 226 + rowY,
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
            <div style={{position: 'absolute', [left ? 'left' : 'right']: 276, top: top + 296 + rowY, width: 300}}>
              <Label acts={job.actions?.[pl.id] ?? []} t={t} frame={frame} fps={fps} align={left ? 'left' : 'right'} />
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// centre of the pot box, where the chips fly to
const potSpot = (job: Job) => {
  if (job.hudStyle === 'compact' && job.hudBox) return {x: job.hudBox.bx + job.hudBox.bw / 2, y: job.hudBox.by + job.hudBox.bh - 50, w: 0};
  if (job.potPos === 'bottom') return {x: 540, y: L(job).hudTop + (job.players?.some((p) => p.row) ? 590 : 470), w: 400};
  if (job.potPos === 'center') return {x: 540, y: L(job).hudTop + 300, w: 210};
  return {x: 120, y: L(job).potTop + 43, w: 0};
};

const Pot: React.FC<{job: Job; t: number}> = ({job, t}) => {
  if (job.hudStyle === 'compact') return null;
  if (!job.pot || job.hudFrom === undefined || t < job.hudFrom) return null;
  if (job.layout === 'full' && (job.potPos ?? 'top') === 'top' && job.equity && t >= job.equity.at) return null;
  const {cur, prev} = latest(job.pot, t);
  if (!cur) return null;
  const p = interpolate(t - cur[0], [0, 0.5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const from = prev ? prev[1] : cur[1];
  const v = from + (cur[1] - from) * p;
  const pulse = 1 + 0.09 * Math.sin(Math.PI * p) * (prev ? 1 : 0);
  const pos = potSpot(job);
  if (job.potPos === 'center') {
    return (
      <div style={{position: 'absolute', left: pos.x - 105, top: pos.y - 62, width: 210, height: 124, background: 'rgba(14,19,22,0.9)', border: '1px solid rgba(255,194,26,0.45)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 ${24 * (pulse - 1) * 10}px rgba(255,194,26,${(pulse - 1) * 3})`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <div style={{transform: `rotate(${p * 360 * (prev ? 1 : 0)}deg)`}}>
            <Chip size={30} />
          </div>
          <div style={{fontFamily: 'Barlow', fontWeight: 600, fontSize: 26, color: '#9aa4a8', letterSpacing: 4}}>POT</div>
        </div>
        <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 56, lineHeight: 1, color: '#fff', transform: `scale(${pulse})`, fontVariantNumeric: 'tabular-nums'}}>
          {Math.round(v).toLocaleString('en-US')}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        ...(job.potPos === 'bottom' ? {left: '50%', marginLeft: -pos.w / 2, width: pos.w, justifyContent: 'center', boxSizing: 'border-box'} : {left: 40}),
        top: pos.y - 43,
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
        top: job.eqTop ?? L(job).eqTop,
        width: 912,
        height: 320,
        transformOrigin: '50% 0',
        background: 'rgba(12,14,16,0.9)',
        border: '1px solid rgba(255,194,26,0.25)',
        borderRadius: 18,
        opacity: Math.min(1, pIn * 1.3),
        transform: `translateY(${(1 - pIn) * -30}px) scale(${(0.96 + 0.04 * pIn) * (job.eqScale ?? 1)})`,
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
              <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 84, color: final ? (v === 0 ? '#ff3b4d' : YELLOW) : '#fff', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums'}}>{Math.round(n)}%</div>
              <div style={{margin: '14px auto 0', width: 150, height: 6, borderRadius: 3, background: '#2b3034'}}>
                <div style={{width: `${n}%`, height: '100%', borderRadius: 3, background: final ? (v === 0 ? '#ff3b4d' : YELLOW) : '#e9eef0'}} />
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
        {job.event && (
          <div style={{position: 'absolute', top: 420, fontFamily: 'Barlow', fontWeight: 700, fontSize: 40, letterSpacing: 10, color: YELLOW, opacity: a(0.0), textShadow: '0 0 20px rgba(255,194,26,0.5)'}}>
            {job.event}
          </div>
        )}
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
            fontSize: h.stat.length > 7 ? 170 : 250,
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
  const sparkles = Array.from({length: 26}, (_, k) => {
    const x = Math.abs((Math.sin(k * 91.7) * 4375.85) % 1) * 1080;
    const y = 500 + Math.abs((Math.sin(k * 17.3) * 1531.2) % 1) * 900;
    const tw = Math.max(0, Math.sin(sec * 5 + k * 1.3));
    return <div key={k} style={{position: 'absolute', left: x, top: y, width: 8, height: 8, borderRadius: 4, background: k % 3 ? YELLOW : '#fff', opacity: p * tw * 0.9, boxShadow: `0 0 ${10 + tw * 14}px ${YELLOW}`, transform: `scale(${0.6 + tw})`}} />;
  });
  return (
    <AbsoluteFill style={{background: `rgba(0,0,0,${p})`, alignItems: 'center', justifyContent: 'center', gap: 26}}>
      {sparkles}
      <div style={{opacity: p, transform: `scale(${0.92 + 0.08 * p})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24}}>
        {job.brand === 'NOLIMIT' ? (
          <NoLimitLogo size={2.6} opacity={1} />
        ) : (
          <>
            <Chip size={110} />
            <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 110, letterSpacing: 10, color: '#fff'}}>{job.brand}</div>
          </>
        )}
        {job.handle && <div style={{display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'Barlow', fontWeight: 700, fontSize: 44, color: '#fff'}}><Chip size={40} />{job.handle}</div>}
        {job.event && <div style={{fontFamily: 'Barlow', fontWeight: 700, fontSize: 40, letterSpacing: 10, color: YELLOW, textShadow: '0 0 24px rgba(255,194,26,0.6)'}}>{job.event}</div>}
        {job.credit && <div style={{fontFamily: 'Heebo', fontWeight: 700, fontSize: 38, color: '#9aa4a8', direction: 'rtl'}}>{job.credit}</div>}
      </div>
    </AbsoluteFill>
  );
};


// ---------- effects: chips into the pot, chip rain, slam callouts ----------
const ChipFlights: React.FC<{job: Job; t: number}> = ({job, t}) => {
  if (!job.players || !job.pot || job.hudFrom === undefined || t < job.hudFrom) return null;
  const top = L(job).hudTop;
  const {x: potX, y: potY} = potSpot(job);
  const flights: React.ReactNode[] = [];
  job.players.forEach((pl) => {
    for (const [at, label] of job.actions?.[pl.id] ?? []) {
      if (!/BET|RAISE|CALL|ALL-IN/.test(label)) continue;
      const dt = t - at;
      if (dt < 0 || dt > 1.0) continue;
      const big = /ALL-IN/.test(label);
      const pi = job.players!.indexOf(pl);
      const hb = job.hudStyle === 'compact' ? job.hudBox : undefined;
      const fromX = hb ? hb.x + 120 : pl.side === 'left' ? 360 : 720;
      const fromY = hb ? hb.y + pi * (hb.rowH + hb.gap) + hb.rowH / 2 : top + 320;
      const count = big ? 12 : 6;
      for (let k = 0; k < count; k++) {
        const p = Math.min(1, Math.max(0, (dt - k * 0.035) / 0.55));
        if (p <= 0 || p >= 1) continue;
        const e = 1 - Math.pow(1 - p, 3);
        const x = fromX + (potX - fromX) * e + Math.sin(k * 1.7) * 30 * (1 - e);
        const y = fromY + (potY - fromY) * e - Math.sin(Math.PI * e) * (260 + k * 12);
        flights.push(
          <div key={`${pl.id}-${at}-${k}`} style={{position: 'absolute', left: x - 26, top: y - 26, transform: `rotate(${e * 540 + k * 40}deg) scale(${1 - 0.35 * e})`, opacity: p < 0.85 ? 1 : (1 - p) / 0.15, filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.5))'}}>
            <Chip size={52} />
          </div>,
        );
      }
    }
  });
  return <>{flights}</>;
};

const ChipRain: React.FC<{job: Job; t: number}> = ({job, t}) => {
  if (!job.win || job.chipRain === false) return null;
  const dt = t - job.win.at;
  if (dt < 0 || dt > 2.6) return null;
  const chips: React.ReactNode[] = [];
  for (let k = 0; k < 34; k++) {
    const r1 = (Math.sin(k * 12.9898) * 43758.5453) % 1;
    const r2 = (Math.sin(k * 78.233) * 12543.123) % 1;
    const x = Math.abs(r1) * 1080;
    const delay = Math.abs(r2) * 0.8;
    const p = (dt - delay) / 1.7;
    if (p <= 0 || p >= 1) continue;
    const y = -80 + p * p * 2100;
    chips.push(
      <div key={k} style={{position: 'absolute', left: x - 30, top: y, transform: `rotate(${p * 720 * (k % 2 ? 1 : -1)}deg) rotateX(${p * 540}deg)`, opacity: p > 0.85 ? (1 - p) / 0.15 : 1}}>
        <Chip size={44 + (k % 4) * 10} />
      </div>,
    );
  }
  return <AbsoluteFill style={{pointerEvents: 'none'}}>{chips}</AbsoluteFill>;
};

const Callouts: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  const cur = (job.callouts ?? []).find(([at]) => t >= at && t < at + 1.25);
  if (!cur) return null;
  const [at, text] = cur;
  const p = spring({frame: frame - Math.round(at * fps), fps, config: {damping: 9, stiffness: 210}});
  const out = interpolate(t - at, [0.95, 1.25], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const d = (t - at) * fps;
  const shake = d < 10 ? Math.sin(d * 2.1) * 12 * (1 - d / 10) : 0;
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          top: 560,
          fontFamily: 'Barlow',
          fontWeight: 800,
          fontSize: text.length > 9 ? 150 : 190,
          letterSpacing: 4,
          color: YELLOW,
          WebkitTextStroke: '6px #111',
          paintOrder: 'stroke fill',
          textShadow: '0 0 40px rgba(255,194,26,0.55), 0 12px 30px rgba(0,0,0,0.7)',
          whiteSpace: 'nowrap',
          opacity: Math.min(1, p * 2) * out,
          transform: `translate(${shake}px, ${shake * 0.4}px) scale(${2.4 - 1.4 * p}) rotate(-6deg)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};


// ---------- seat map: where everyone sits ----------
const POS = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'];
const SeatMap: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  const st = job.seats;
  if (!st || job.hudFrom === undefined || t < job.hudFrom) return null;
  if (job.equity && t >= job.equity.at - 0.2) return null;
  const at = job.hudFrom;
  const appear = spring({frame: frame - Math.round(at * fps), fps, config: {damping: 15, stiffness: 140}});
  // big in the middle first, then docks in the top-right corner
  const dock = interpolate(t - at, [2.2, 2.9], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const W = 420;
  const Hh = 250;
  const big = {x: 540, y: 640, s: 1.55};
  const small = {x: 1080 - 40 - (W * 0.62) / 2, y: 210, s: 0.62};
  const cx = big.x + (small.x - big.x) * dock;
  const cy = big.y + (small.y - big.y) * dock;
  const sc = (big.s + (small.s - big.s) * dock) * (0.7 + 0.3 * appear);
  const hi = POS.indexOf(st.hero);
  const seats = POS.map((pos, i) => {
    const ang = Math.PI / 2 + (((i - hi + 9) % 9) * 2 * Math.PI) / 9;
    return {pos, x: W / 2 + Math.cos(ang) * (W / 2 + 6), y: Hh / 2 + Math.sin(ang) * (Hh / 2 + 6)};
  });
  const btn = seats[0];
  return (
    <div style={{position: 'absolute', left: cx - W / 2, top: cy - Hh / 2, width: W, height: Hh, transform: `scale(${sc})`, opacity: Math.min(1, appear * 1.5)}}>
      {dock < 1 && (
        <div style={{position: 'absolute', left: -60, right: -60, top: -78, textAlign: 'center', fontFamily: 'Barlow', fontWeight: 800, fontSize: 34, letterSpacing: 6, color: '#fff', opacity: 1 - dock}}>
          WHERE THEY SIT
        </div>
      )}
      <div style={{position: 'absolute', inset: 0, borderRadius: Hh, background: 'radial-gradient(ellipse at 50% 40%, #1f7a4a, #0d3a24)', border: `7px solid #3a2a12`, boxShadow: `0 0 0 3px ${YELLOW}55, 0 18px 40px rgba(0,0,0,0.6)`}} />
      <div style={{position: 'absolute', left: W / 2 - 34, top: Hh / 2 - 34, opacity: 0.5}}>
        <Chip size={68} />
      </div>
      {seats.map(({pos, x, y}, i) => {
        const isHero = pos === st.hero;
        const isVil = pos === st.villain;
        const on = isHero || isVil;
        const bust = isVil && job.bustAt !== undefined && t >= job.bustAt ? spring({frame: frame - Math.round(job.bustAt * fps), fps, config: {damping: 12}}) : 0;
        const pulse = on ? 1 + 0.08 * Math.sin((t - at) * 6 + (isHero ? 0 : 1.5)) : 1;
        return (
          <div key={pos} style={{position: 'absolute', left: x - 26, top: y - 26, width: 52, height: 52, transform: `scale(${pulse})`}}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                background: isHero ? YELLOW : isVil ? '#f2f4f5' : '#2a2f33',
                border: on ? '3px solid #111' : '2px solid #4a5156',
                boxShadow: isHero ? '0 0 22px rgba(255,194,26,0.8)' : isVil ? '0 0 16px rgba(255,255,255,0.5)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Barlow',
                fontWeight: 800,
                fontSize: pos.length > 3 ? 13 : 17,
                color: on ? '#111' : '#8a9297',
              }}
            >
              {pos}
            </div>
            {bust > 0 && (
              <div style={{position: 'absolute', inset: -6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow', fontWeight: 800, fontSize: 64, color: '#ff2a3d', textShadow: '0 0 12px rgba(255,42,61,0.8)', transform: `scale(${2 - bust})`, opacity: Math.min(1, bust * 1.5)}}>
                ✕
              </div>
            )}
            {on && (
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: y > Hh / 2 ? 58 : -40,
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  fontFamily: /[א-ת]/.test(isHero ? st.heroName : st.villainName) ? 'Heebo' : 'Barlow',
                  fontWeight: 800,
                  fontSize: 26,
                  color: isHero ? YELLOW : '#fff',
                  textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                }}
              >
                {isHero ? st.heroName : st.villainName}
              </div>
            )}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: btn.x + (W / 2 - btn.x) * 0.28 - 15,
          top: btn.y + (Hh / 2 - btn.y) * 0.28 - 15,
          width: 30,
          height: 30,
          borderRadius: 15,
          background: '#fff',
          border: '2px solid #111',
          fontFamily: 'Barlow',
          fontWeight: 800,
          fontSize: 18,
          color: '#111',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        D
      </div>
    </div>
  );
};

// ---------- live equity tug-of-war ----------
const Meter: React.FC<{job: Job; t: number}> = ({job, t}) => {
  const m = job.meter;
  if (!m || t < m.from || t > m.to) return null;
  let v = m.points[0][1];
  for (let i = 0; i < m.points.length; i++) {
    const [pt, pv] = m.points[i];
    if (t >= pt) {
      const prev = i > 0 ? m.points[i - 1][1] : pv;
      v = prev + (pv - prev) * interpolate(t - pt, [0, 0.5], [0, 1], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
    }
  }
  const pIn = interpolate(t - m.from, [0, 0.3], [0, 1], {extrapolateRight: 'clamp'});
  const out = interpolate(t, [m.to - 0.3, m.to], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 70, right: 70, top: 812, opacity: pIn * out}}>
      <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: 'Barlow', fontWeight: 800, fontSize: 52, color: '#fff', textShadow: '0 3px 10px rgba(0,0,0,0.8)'}}>
        <span style={{color: YELLOW}}>{Math.round(v)}%</span>
        <span>{Math.round(100 - v)}%</span>
      </div>
      <div style={{height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.18)', overflow: 'hidden', border: '2px solid rgba(0,0,0,0.6)', marginTop: 6}}>
        <div style={{width: `${v}%`, height: '100%', background: `linear-gradient(90deg, ${YELLOW}, #ffe27a)`, boxShadow: '0 0 20px rgba(255,194,26,0.7)'}} />
      </div>
    </div>
  );
};


// ---------- red stamp: ELIMINATED ----------
const Stamp: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  const st = job.stamp;
  if (!st || t < st.at || t > st.at + 2.2) return null;
  const p = spring({frame: frame - Math.round(st.at * fps), fps, config: {damping: 10, stiffness: 230}});
  const out = interpolate(t - st.at, [1.8, 2.2], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const d = (t - st.at) * fps;
  const shake = d < 12 ? Math.sin(d * 2.4) * 14 * (1 - d / 12) : 0;
  const red = '#ff2a3d';
  return (
    <AbsoluteFill style={{alignItems: 'center', pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: `rgba(120,0,10,${0.35 * Math.max(0, 1 - d / 14)})`}} />
      <div
        style={{
          position: 'absolute',
          top: 520,
          padding: '14px 40px 10px',
          border: `10px solid ${red}`,
          borderRadius: 18,
          transform: `translate(${shake}px, ${shake * 0.5}px) rotate(-11deg) scale(${2.6 - 1.6 * p})`,
          opacity: Math.min(1, p * 2) * out,
          textAlign: 'center',
          background: 'rgba(10,0,2,0.35)',
          boxShadow: `0 0 50px rgba(255,42,61,0.45)`,
        }}
      >
        <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 150, letterSpacing: 8, color: red, lineHeight: 1, textShadow: '0 0 30px rgba(255,42,61,0.6)'}}>{st.text}</div>
        {st.sub && <div style={{fontFamily: 'Barlow', fontWeight: 700, fontSize: 40, letterSpacing: 6, color: '#fff', marginTop: 6}}>{st.sub}</div>}
      </div>
    </AbsoluteFill>
  );
};


// ---------- No Limit pieces: logo, headline, speaker tag, run-it-twice prompt ----------
export const NoLimitLogo: React.FC<{size?: number; opacity?: number}> = ({size = 1, opacity = 0.92}) => (
  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', opacity}}>
    <div style={{display: 'flex', alignItems: 'center', fontFamily: 'Barlow', fontWeight: 800, fontSize: 44 * size, letterSpacing: 2 * size, color: '#fff', lineHeight: 1}}>
      N<span style={{display: 'inline-flex', margin: `0 ${2 * size}px`, transform: `translateY(${1 * size}px)`}}><Chip size={36 * size} /></span>LIMIT
    </div>
    <div style={{fontFamily: 'Barlow', fontWeight: 700, fontSize: 12 * size, letterSpacing: 5 * size, color: '#fff', opacity: 0.85, marginTop: 3 * size}}>POKER PODCAST</div>
  </div>
);

const Headline: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  const h = job.headline;
  if (!h || t > h.until) return null;
  const at = job.segments[0].from;
  const p = spring({frame: frame - Math.round(at * fps), fps, config: {damping: 14, stiffness: 150}});
  const out = interpolate(t, [h.until - 0.35, h.until], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const line = (s: string) => s.split(' ').map((w, i) => <span key={i} style={{color: h.hl && w.replace(/[.,?!:]/g, '') === h.hl ? '#ff8a1f' : '#fff'}}>{w} </span>);
  return (
    <div style={{position: 'absolute', top: 170, left: 50, right: 50, textAlign: 'center', direction: 'rtl', fontFamily: 'Heebo', fontWeight: 900, fontSize: 84, lineHeight: 1.12, textShadow: '0 4px 16px rgba(0,0,0,0.85)', WebkitTextStroke: '1px rgba(0,0,0,0.4)', opacity: Math.min(1, p * 1.4) * out, transform: `translateY(${(1 - p) * -30}px)`}}>
      {line(h.lines[0])}
      <br />
      {line(h.lines[1])}
    </div>
  );
};

const SpeakerTag: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  const sp = job.speaker;
  if (!sp || t < sp.at || t > sp.until) return null;
  const p = spring({frame: frame - Math.round(sp.at * fps), fps, config: {damping: 16, stiffness: 140}});
  const out = interpolate(t, [sp.until - 0.3, sp.until], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', top: 760, right: 70, direction: 'rtl', textAlign: 'right', opacity: Math.min(1, p * 1.4) * out, transform: `translateX(${(1 - p) * 40}px)`}}>
      <div style={{fontFamily: 'Heebo', fontWeight: 800, fontSize: 48, color: '#fff', textShadow: '0 3px 12px rgba(0,0,0,0.8)'}}>{sp.name}</div>
      <div style={{height: 6, background: YELLOW, width: `${p * 100}%`, marginTop: 2}} />
      {sp.sub && <div style={{fontFamily: 'Heebo', fontWeight: 700, fontSize: 30, color: '#e6e6e6', marginTop: 6, textShadow: '0 3px 10px rgba(0,0,0,0.8)'}}>{sp.sub}</div>}
    </div>
  );
};

const Prompt: React.FC<{job: Job; t: number; frame: number; fps: number}> = ({job, t, frame, fps}) => {
  const q = job.prompt;
  if (!q || t < q.at || t > q.until) return null;
  const p = spring({frame: frame - Math.round(q.at * fps), fps, config: {damping: 13, stiffness: 170}});
  const pick = t >= q.pickAt ? spring({frame: frame - Math.round(q.pickAt * fps), fps, config: {damping: 9, stiffness: 220}}) : 0;
  const out = interpolate(t, [q.until - 0.3, q.until], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const btn = (label: string, kind: 'yes' | 'no') => {
    const chosen = q.picked === kind;
    const c = kind === 'yes' ? YELLOW : '#ff2a3d';
    const lit = chosen ? pick : 0;
    const dim = !chosen && pick > 0 ? 0.35 : 1;
    return (
      <div style={{width: 380, height: 120, borderRadius: 18, border: `4px solid ${c}`, background: lit ? (kind === 'yes' ? `rgba(255,194,26,${0.9 * lit})` : `rgba(255,42,61,${0.9 * lit})`) : 'rgba(12,14,16,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: dim, transform: `scale(${1 + 0.1 * Math.sin(Math.PI * Math.min(1, lit))})`, boxShadow: lit ? `0 0 40px ${c}` : 'none'}}>
        <span style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 56, color: lit ? '#111' : c}}>{kind === 'yes' ? 'YES' : 'NO'}</span>
        <span style={{fontFamily: 'Heebo', fontWeight: 800, fontSize: 40, color: lit ? '#111' : '#fff', direction: 'rtl'}}>{label}</span>
      </div>
    );
  };
  const shake = pick > 0 && pick < 1 ? Math.sin(t * 90) * 8 * (1 - pick) : 0;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: 470, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, opacity: Math.min(1, p * 1.5) * out, transform: `translateX(${shake}px) scale(${0.85 + 0.15 * p})`}}>
      <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 96, color: '#fff', letterSpacing: 4, textShadow: '0 6px 20px rgba(0,0,0,0.85)', WebkitTextStroke: '3px #111', paintOrder: 'stroke fill'}}>{q.question}</div>
      <div style={{display: 'flex', gap: 40, direction: 'ltr'}}>
        {btn(q.yes, 'yes')}
        {btn(q.no, 'no')}
      </div>
    </div>
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
  for (const [at] of job.callouts ?? []) list.push({at: o(at), file: 'impact.wav', vol: 0.3, dur: 0.9});
  if (job.stamp) list.push({at: o(job.stamp.at), file: 'impact.wav', vol: 0.42, dur: 0.9});
  if (job.prompt) {
    list.push({at: o(job.prompt.at), file: 'whoosh.wav', vol: 0.12, dur: 0.6});
    list.push({at: o(job.prompt.pickAt), file: 'impact.wav', vol: 0.32, dur: 0.9});
  }
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
  for (const [at] of job.callouts ?? []) moments.push(at);
  for (const at of job.punches ?? []) moments.push(at);
  if (job.stamp) moments.push(job.stamp.at);
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
  // the dark floor under the cards only comes in with the cards; before that a light one keeps the captions readable
  const shade = job.layout === 'full' && job.hudFrom !== undefined && inContent
    ? interpolate(t, [job.hudFrom - 0.2, job.hudFrom + 0.5], [0.3, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
    : 1;
  const endSec = o - (hookSec + content);
  const lastFade = showEnd ? interpolate(frame, [durationInFrames - 10, durationInFrames - 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;
  const sfx = sfxOn ? buildSfx(job, hookSec, withHook) : [];

  return (
    <DeckContext.Provider value={job.deck}>
    <AbsoluteFill style={{background: '#000'}}>
      <Footage job={job} offsetOut={hookSec} punch={punch} shakeX={shakeX} shakeY={shakeY} shade={shade} />
      {inContent && (
        <AbsoluteFill style={{transform: `translate(${shakeX * 0.4}px, ${shakeY * 0.4}px)`}}>
          <Captions job={job} t={t} frame={sf} fps={fps} />
          <Pot job={job} t={t} />
          <Tag job={job} t={t} frame={sf} fps={fps} />
          <Hud job={job} t={t} frame={sf} fps={fps} />
          <EquityBox job={job} t={t} frame={sf} fps={fps} />
          <SeatMap job={job} t={t} frame={sf} fps={fps} />
          <Headline job={job} t={t} frame={sf} fps={fps} />
          <SpeakerTag job={job} t={t} frame={sf} fps={fps} />
          <Prompt job={job} t={t} frame={sf} fps={fps} />
          <Meter job={job} t={t} />
          <ChipFlights job={job} t={t} />
          <Callouts job={job} t={t} frame={sf} fps={fps} />
          <ChipRain job={job} t={t} />
          <Stamp job={job} t={t} frame={sf} fps={fps} />
        </AbsoluteFill>
      )}
      {job.brand && inContent && job.brand !== 'NOLIMIT' && (
        <div style={{position: 'absolute', right: 44, top: L(job).brandTop, fontFamily: 'Barlow', fontWeight: 800, fontSize: 30, letterSpacing: 4, color: 'rgba(255,255,255,0.75)'}}>
          {job.brand}
        </div>
      )}
      {job.brand === 'NOLIMIT' && job.logo !== false && inContent && (
        <div style={{position: 'absolute', right: 40, top: 118}}>
          <NoLimitLogo size={1} />
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
    </DeckContext.Provider>
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


// ---------- cold open: the climax first, a rewind, then the whole hand ----------
const REWIND_SEC = 1.1;
const coldTeaser = (job: Job, from: number, to: number): Job => ({...job, segments: [{from, to}], hook: undefined});
export const coldOpenFrames = (job: Job, from: number, to: number) =>
  reelFrames(coldTeaser(job, from, to), false, false) + Math.round(REWIND_SEC * FPS) + reelFrames(job, false);
const Rewind: React.FC = () => {
  const f = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const p = f / durationInFrames;
  const lines = Array.from({length: 14}, (_, i) => i);
  return (
    <AbsoluteFill style={{background: '#050505', overflow: 'hidden'}}>
      <Sequence layout="none"><Audio src={staticFile('sfx/rewind.wav')} volume={0.6} /></Sequence>
      {lines.map((i) => {
        const y = ((i * 137 + f * 47) % 1920) - 40;
        return <div key={i} style={{position: 'absolute', left: 0, right: 0, top: y, height: 6 + (i % 3) * 5, background: i % 2 ? 'rgba(255,194,26,0.35)' : 'rgba(255,255,255,0.18)', transform: `translateX(${Math.sin(i + f) * 40}px)`}} />;
      })}
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, transform: `scale(${1.25 - 0.25 * Math.min(1, p * 3)}) translateX(${Math.sin(f * 1.7) * 6}px)`}}>
          <div style={{fontFamily: 'Barlow', fontWeight: 800, fontSize: 150, color: YELLOW, letterSpacing: -10, textShadow: '6px 0 0 rgba(255,0,60,0.6), -6px 0 0 rgba(0,200,255,0.6)'}}>◀◀</div>
          <div style={{fontFamily: 'Heebo', fontWeight: 900, fontSize: 88, color: '#fff', direction: 'rtl', textShadow: '4px 0 0 rgba(255,0,60,0.5), -4px 0 0 rgba(0,200,255,0.5)'}}>איך הגענו לזה?</div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{background: '#fff', opacity: interpolate(f, [0, 3], [0.6, 0], {extrapolateRight: 'clamp'})}} />
    </AbsoluteFill>
  );
};
export const ColdOpenReel: React.FC<{job: Job; teaser: [number, number]}> = ({job, teaser}) => {
  const {fps} = useVideoConfig();
  const tj = coldTeaser(job, teaser[0], teaser[1]);
  const a = reelFrames(tj, false, false);
  const r = Math.round(REWIND_SEC * fps);
  return (
    <AbsoluteFill style={{background: '#000'}}>
      <Sequence durationInFrames={a}>
        <HandReel job={tj} withHook={false} showEnd={false} />
      </Sequence>
      <Sequence from={a} durationInFrames={r}>
        <Rewind />
      </Sequence>
      <Sequence from={a + r}>
        <HandReel job={job} withHook={false} />
      </Sequence>
    </AbsoluteFill>
  );
};
