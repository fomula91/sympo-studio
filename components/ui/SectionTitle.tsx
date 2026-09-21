// 에디터 섹션마다 반복되던 제목+설명 헤더 패턴을 통일한다(FE-13).
import type { ReactNode } from 'react';
import { UI } from '@/lib/ui';

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em' }}>{title}</h2>
        {action ? (
          <>
            <div style={{ flex: 1 }} />
            {action}
          </>
        ) : null}
      </div>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: UI.muted, lineHeight: 1.6 }}>{description}</p>
    </>
  );
}
