'use client';

import { Suspense } from 'react';
import ConsoleScreen from '@/components/screens/ConsoleScreen';
import { useStudio } from '@/components/StudioProvider';

export default function ConsolePage() {
  const { s, patch, user, authStatus } = useStudio();
  // ConsoleScreen이 useSearchParams()로 로그인 리다이렉트 사유(?auth=)를 읽는다 —
  // 이 페이지는 정적 프리렌더 대상이라 Suspense 경계가 없으면 빌드가 실패한다.
  return (
    <Suspense fallback={null}>
      <ConsoleScreen s={s} patch={patch} user={user} authStatus={authStatus} />
    </Suspense>
  );
}
