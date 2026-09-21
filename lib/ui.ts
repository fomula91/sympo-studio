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
  toneSuccessBg: 'var(--tone-success-bg)',
  toneSuccessFg: 'var(--tone-success-fg)',
  toneWarningBg: 'var(--tone-warning-bg)',
  toneWarningFg: 'var(--tone-warning-fg)',
  toneDangerBg: 'var(--tone-danger-bg)',
  toneDangerFg: 'var(--tone-danger-fg)',
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

/**
 * 행사 시점 배지 (BE-23). 발행 상태 배지 옆에 나란히 그린다 — 두 축이 다른 것을
 * 말하므로 한 칸에 합치지 않는다. `null`(날짜 미정)이면 아무것도 그리지 않는다.
 *
 * 색을 죽여 둔 이유: 시점은 달력이 정하는 사실이지 운영자가 조치할 상태가 아니다.
 * 발행 상태 배지와 같은 채도로 그리면 눈이 둘을 같은 종류로 읽는다.
 */
export function phasePillStyle(): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    height: 22,
    padding: '0 8px',
    borderRadius: 6,
    fontFamily: MONO,
    fontSize: 10.5,
    fontWeight: 650,
    letterSpacing: '0.02em',
    background: 'transparent',
    border: `1px solid ${UI.line}`,
    color: UI.faint,
  };
}
