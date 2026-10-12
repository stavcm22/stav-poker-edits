import React from 'react';

export const YELLOW = '#FFC21A';
const RED = '#E3262E';
const SUIT: Record<string, string> = {h: '♥', d: '♦', s: '♠', c: '♣'};

export const Chip: React.FC<{size: number; color?: string}> = ({size, color = YELLOW}) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="46" fill={color} />
    <circle cx="50" cy="50" r="46" fill="none" stroke="#111" strokeWidth="9" strokeDasharray="14 22" />
    <circle cx="50" cy="50" r="30" fill="#111" />
    <circle cx="50" cy="50" r="25" fill={color} />
    <path
      d="M50 34 C44 42 37 46 37 53 C37 58 41 61 45 61 C47 61 48.5 60 49 59 L46 67 L54 67 L51 59 C51.5 60 53 61 55 61 C59 61 63 58 63 53 C63 46 56 42 50 34 Z"
      fill="#111"
    />
  </svg>
);

type CardProps = {
  card: string | null; // e.g. "Ah", "Th"; null = face down
  w: number;
  h: number;
  flip?: number; // 0 = back, 1 = face
  glow?: number; // 0..1 winning highlight
  dim?: number; // 0..1
  style?: React.CSSProperties;
};

const Face: React.FC<{card: string; w: number; h: number}> = ({card, w, h}) => {
  const r = card[0] === 'T' ? '10' : card[0];
  const s = card[1];
  const color = s === 'h' || s === 'd' ? RED : '#121212';
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#fff',
        borderRadius: w * 0.09,
        overflow: 'hidden',
        boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{position: 'absolute', left: w * 0.1, top: h * 0.03, fontSize: w * 0.34, color, lineHeight: 1}}>
        {SUIT[s]}
      </div>
      <div
        style={{
          position: 'absolute',
          right: r === '10' ? w * 0.04 : w * 0.1,
          bottom: h * (r === 'Q' ? 0.1 : 0.04),
          fontFamily: 'Barlow',
          fontWeight: 700,
          fontSize: h * (r === '10' ? 0.52 : 0.6),
          letterSpacing: r === '10' ? -w * 0.03 : 0,
          color,
          lineHeight: 0.92,
        }}
      >
        {r}
      </div>
    </div>
  );
};

const Back: React.FC<{w: number; h: number}> = ({w, h}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: '#0c0c0c',
      border: `${Math.max(2, w * 0.03)}px solid ${YELLOW}`,
      borderRadius: w * 0.09,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
    }}
  >
    <Chip size={w * 0.62} />
  </div>
);

export const Card: React.FC<CardProps> = ({card, w, h, flip = 1, glow = 0, dim = 0, style}) => {
  const angle = (1 - flip) * 180;
  const showFace = card !== null && angle < 90;
  return (
    <div style={{width: w, height: h, perspective: 900, ...style}}>
      <div
        style={{
          position: 'relative',
          width: w,
          height: h,
          transform: `rotateY(${showFace ? angle : angle - 180}deg)`,
          borderRadius: w * 0.09,
          boxShadow: glow > 0 ? `0 0 ${18 * glow}px ${4 * glow}px rgba(255,194,26,${0.75 * glow})` : undefined,
          outline: glow > 0 ? `${4 * glow}px solid rgba(255,194,26,${glow})` : undefined,
        }}
      >
        {showFace ? <Face card={card as string} w={w} h={h} /> : <Back w={w} h={h} />}
        {dim > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: w * 0.09,
              background: `rgba(20,20,20,${0.55 * dim})`,
            }}
          />
        )}
      </div>
    </div>
  );
};
