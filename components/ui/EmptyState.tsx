// 목록이 비었을 때 보여주는 안내 문구 패턴을 통일한다(FE-13).
import type { ReactNode } from 'react';
import { UI } from '@/lib/ui';

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '80px 0', textAlign: 'center', color: UI.faint, fontSize: 14 }}>{children}</div>
  );
}
