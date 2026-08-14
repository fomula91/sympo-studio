import type { IconSetId, KvPattern, Mode } from './types';

export interface Preset {
  id: string;
  label: string;
  h: number;
  c: number;
}

export const PRESETS: Preset[] = [
  { id: 'slate', label: '슬레이트 뉴트럴', h: 255, c: 0.028 },
  { id: 'aurora', label: 'AURORA 그린', h: 158, c: 0.105 },
  { id: 'prime', label: 'PRIME 블루', h: 252, c: 0.125 },
  { id: 'vertex', label: 'VERTEX 퍼플', h: 305, c: 0.115 },
  { id: 'amber', label: 'HERO 앰버', h: 72, c: 0.115 },
];

export const ICONSETS: Record<IconSetId, { label: string; glyphs: string[] }> = {
  geo: { label: '기하', glyphs: ['○', '□', '△', '◇'] },
  solid: { label: '솔리드', glyphs: ['●', '■', '▲', '◆'] },
  number: { label: '넘버', glyphs: ['01', '02', '03', '04'] },
};

export interface Theme {
  mode: Mode;
  h: number;
  c: number;
  bg: string;
  surface: string;
  line: string;
  ink: string;
  muted: string;
  brand: string;
  onBrand: string;
  soft: string;
  L: { bg: number; surface: number; ink: number; muted: number; brand: number; onBrand: number };
}

// 근사 상대휘도: OKLCH 명도 L을 감마 보정된 휘도로 취급
export function lum(L: number): number {
  return Math.pow(Math.max(0, Math.min(1, L)), 3);
}

export function ratio(L1: number, L2: number): number {
  const a = lum(L1);
  const b = lum(L2);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

export function derive(preset: Preset, mode: Mode): Theme {
  const { h, c } = preset;
  if (mode === 'dark') {
    return {
      mode,
      h,
      c,
      bg: `oklch(0.185 ${(c * 0.12).toFixed(3)} ${h})`,
      surface: `oklch(0.245 ${(c * 0.14).toFixed(3)} ${h})`,
      line: `oklch(0.33 ${(c * 0.16).toFixed(3)} ${h})`,
      ink: `oklch(0.965 0.004 ${h})`,
      muted: `oklch(0.72 ${(c * 0.12).toFixed(3)} ${h})`,
      brand: `oklch(0.78 ${(c * 0.72).toFixed(3)} ${h})`,
      onBrand: `oklch(0.2 ${(c * 0.2).toFixed(3)} ${h})`,
      soft: `oklch(0.31 ${(c * 0.34).toFixed(3)} ${h})`,
      L: { bg: 0.185, surface: 0.245, ink: 0.965, muted: 0.72, brand: 0.78, onBrand: 0.2 },
    };
  }
  return {
    mode,
    h,
    c,
    bg: `oklch(0.982 ${(c * 0.06).toFixed(3)} ${h})`,
    surface: `oklch(1 0 ${h})`,
    line: `oklch(0.912 ${(c * 0.08).toFixed(3)} ${h})`,
    ink: `oklch(0.235 ${(c * 0.18).toFixed(3)} ${h})`,
    muted: `oklch(0.53 ${(c * 0.12).toFixed(3)} ${h})`,
    brand: `oklch(0.475 ${c.toFixed(3)} ${h})`,
    onBrand: `oklch(0.99 ${(c * 0.08).toFixed(3)} ${h})`,
    soft: `oklch(0.955 ${(c * 0.26).toFixed(3)} ${h})`,
    L: { bg: 0.982, surface: 1, ink: 0.235, muted: 0.53, brand: 0.475, onBrand: 0.99 },
  };
}

export const KV_PATTERNS: Record<KvPattern, (t: Theme) => string> = {
  stripe: (t) => `repeating-linear-gradient(115deg, ${t.brand} 0 14px, ${t.soft} 14px 28px)`,
  grid: (t) =>
    `linear-gradient(${t.soft} 1px, transparent 1px) 0 0/26px 26px, linear-gradient(90deg, ${t.soft} 1px, transparent 1px) 0 0/26px 26px, ${t.brand}`,
  flat: (t) => t.brand,
  none: (t) => t.brand,
};

export interface ContrastRow {
  label: string;
  ratio: string;
  pass: boolean;
}

export function contrastRows(theme: Theme, mode: Mode): ContrastRow[] {
  const defs = [
    { label: '본문 텍스트 / 표면', a: theme.L.ink, b: theme.L.surface, min: 4.5 },
    { label: '보조 텍스트 / 표면', a: theme.L.muted, b: theme.L.surface, min: 4.5 },
    { label: '브랜드 위 텍스트', a: theme.L.onBrand, b: theme.L.brand, min: 4.5 },
    { label: '브랜드 / 배경', a: theme.L.brand, b: theme.L.bg, min: 3 },
    {
      label: '히어로 텍스트 / 키 비주얼',
      a: 0.985,
      b: theme.L.brand * (mode === 'dark' ? 0.58 : 0.68),
      min: 4.5,
    },
  ];
  return defs.map((r) => {
    const v = ratio(r.a, r.b);
    return { label: r.label, ratio: `${v.toFixed(2)}:1`, pass: v >= r.min };
  });
}
