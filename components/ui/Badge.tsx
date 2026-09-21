// 의미색 배지 — 상태(공개/검수대기)·대비비 통과/미달·리포트 증감을 하나의 톤 체계로 통일한다(FE-13).
import type { CSSProperties, ReactNode } from 'react';
import { UI } from '@/lib/ui';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'muted' | 'faint';

const TONE_STYLE: Record<BadgeTone, { bg: string; fg: string; bordered?: boolean }> = {
  success: { bg: UI.toneSuccessBg, fg: UI.toneSuccessFg },
  warning: { bg: UI.toneWarningBg, fg: UI.toneWarningFg },
  danger: { bg: UI.toneDangerBg, fg: UI.toneDangerFg },
  muted: { bg: 'transparent', fg: UI.muted, bordered: true },
  faint: { bg: 'transparent', fg: UI.faint, bordered: true },
};

export function Badge({
  tone,
  children,
  style,
}: {
  tone: BadgeTone;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const t = TONE_STYLE[tone];
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        padding: '0 9px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 650,
        background: t.bg,
        color: t.fg,
        ...(t.bordered ? { border: `1px solid ${UI.line}` } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
