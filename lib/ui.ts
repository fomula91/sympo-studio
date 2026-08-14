import type { CSSProperties } from 'react';

export const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

export const UI = {
  ink: 'oklch(0.22 0.008 250)',
  bg: 'oklch(0.968 0.002 250)',
  line: 'oklch(0.912 0.004 250)',
  lineFaint: 'oklch(0.945 0.003 250)',
  soft: 'oklch(0.955 0.003 250)',
  muted: 'oklch(0.55 0.008 250)',
  faint: 'oklch(0.62 0.006 250)',
  green: 'oklch(0.55 0.11 145)',
};

// 세그먼트 토글 버튼 (정렬·모드·아이콘·밀도 등)
export function seg(active: boolean): CSSProperties {
  return {
    height: 44,
    padding: '0 15px',
    borderRadius: 9,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12.5,
    fontWeight: 650,
    letterSpacing: '-0.01em',
    background: active ? UI.ink : 'transparent',
    color: active ? '#fff' : 'oklch(0.48 0.008 250)',
  };
}

export const ghostBtn: CSSProperties = {
  height: 44,
  padding: '0 16px',
  borderRadius: 10,
  border: '1px solid oklch(0.9 0.004 250)',
  background: '#fff',
  fontSize: 13,
  fontWeight: 600,
  color: 'oklch(0.35 0.008 250)',
  cursor: 'pointer',
};

export const primaryBtn: CSSProperties = {
  height: 44,
  padding: '0 18px',
  borderRadius: 10,
  border: 'none',
  background: UI.ink,
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

export const monoLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.14em',
  color: UI.faint,
};

// 콘솔 카드 상태 배지
export function pillStyle(status: string): CSSProperties {
  const map: Record<string, [string, string]> = {
    진행중: ['oklch(0.96 0.03 145)', 'oklch(0.4 0.1 145)'],
    검수대기: ['oklch(0.965 0.035 78)', 'oklch(0.44 0.09 68)'],
    공개예정: ['oklch(0.955 0.003 250)', 'oklch(0.4 0.008 250)'],
    초안: ['transparent', 'oklch(0.55 0.008 250)'],
    완료: ['oklch(0.955 0.003 250)', 'oklch(0.5 0.008 250)'],
    보관: ['transparent', 'oklch(0.66 0.006 250)'],
  };
  const [bg, fg] = map[status] || map['완료'];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    height: 22,
    padding: '0 9px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 650,
    background: bg,
    color: fg,
    ...(bg === 'transparent' ? { border: '1px solid oklch(0.9 0.004 250)' } : {}),
  };
}
