// 화면마다 인라인으로 반복되던 카드(표면+테두리+둥근 모서리) 패턴을 통일한다(FE-13).
import type { CSSProperties, ReactNode } from 'react';
import { UI } from '@/lib/ui';

export function Card({
  children,
  padding = 20,
  radius = 14,
  style,
}: {
  children: ReactNode;
  padding?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: UI.surface,
        border: `1px solid ${UI.line}`,
        borderRadius: radius,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
