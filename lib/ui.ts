import type { CSSProperties } from 'react';

export const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

// 값은 app/globals.css의 CSS 변수를 가리킨다 — :root와 :root[data-theme='dark']에서 실제 색을 정의한다.
export const UI = {
  ink: 'var(--ink)',
  ink2: 'var(--ink2)',
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  line: 'var(--line)',
  lineFaint: 'var(--line-faint)',
  soft: 'var(--soft)',
  muted: 'var(--muted)',
  muted2: 'var(--muted2)',
  faint: 'var(--faint)',
  green: 'var(--green)',
  brand: 'var(--brand)',
  brandPress: 'var(--brand-press)',
  brandSoft: 'var(--brand-soft)',
  onBrand: 'var(--on-brand)',
};

// 세그먼트 토글 버튼 (정렬·모드·아이콘·밀도 등). brand=true면 선택 상태를 스튜디오 브랜드색으로 표시한다.
export function seg(active: boolean, brand = false): CSSProperties {
  return {
    height: 44,
    padding: '0 15px',
    borderRadius: 9,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12.5,
    fontWeight: 650,
    letterSpacing: '-0.01em',
    background: active ? (brand ? UI.brand : UI.ink) : 'transparent',
    color: active ? (brand ? UI.onBrand : UI.surface) : UI.muted,
  };
}

export const ghostBtn: CSSProperties = {
  height: 44,
  padding: '0 16px',
  borderRadius: 10,
  border: `1px solid ${UI.line}`,
  background: UI.surface,
  fontSize: 13,
  fontWeight: 600,
  color: UI.ink2,
  cursor: 'pointer',
};

export const primaryBtn: CSSProperties = {
  height: 44,
  padding: '0 18px',
  borderRadius: 10,
  border: 'none',
  background: UI.brand,
  color: UI.onBrand,
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
    ...(bg === 'transparent' ? { border: `1px solid ${UI.line}` } : {}),
  };
}
