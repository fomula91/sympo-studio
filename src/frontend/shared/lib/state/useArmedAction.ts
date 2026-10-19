// 되돌릴 수 없는 작업을 위한 "2클릭 확인 후 자동 해제" 패턴 hook.
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * "한 번 누르면 확인 상태로, 같은 버튼을 다시 누르거나 autoDisarmMs 안에
 * 아무 반응이 없으면 자동으로 풀리는" 2클릭 확인 패턴 — 자료 삭제·콘솔
 * 일괄삭제 등 되돌릴 수 없는 작업에서 반복돼 여기로 뽑았다. `disarm()`은
 * state만 바꾸고 타이머 정리는 `armed`를 보는 effect에 맡긴다 — 호출자가
 * render 중에 `disarm()`을 불러도(예: 선택이 바뀌면 즉시 해제) ref를
 * 직접 건드리지 않아 `react-hooks/refs`에 걸리지 않는다.
 */
export function useArmedAction<T>(autoDisarmMs = 4000) {
  const [armed, setArmed] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (armed === null && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [armed]);
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 호출자(예: AccountMenu의 closeMenu)가 이 함수들을 다른 effect의 의존성으로
  // 쓰므로, autoDisarmMs가 안 바뀌는 한 매 렌더 새 함수가 되지 않게 고정한다.
  const arm = useCallback(
    (key: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setArmed(key);
      timerRef.current = setTimeout(() => setArmed(null), autoDisarmMs);
    },
    [autoDisarmMs],
  );
  const disarm = useCallback(() => setArmed(null), []);

  return [armed, arm, disarm] as const;
}
