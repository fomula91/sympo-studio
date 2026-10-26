'use client';

import { useCallback, useEffect, useRef } from 'react';

import { putStudioEventSessions } from "@fe/entities/event";

import type { Session } from "@fe/entities/event";
import type { PatchFn, StudioState } from "./types";

import type { Dispatch, SetStateAction } from 'react';
import { saveErrorMessage } from './save-error';

export function useSessionSync({ patch, setS }: {
 patch: PatchFn;
 setS: Dispatch<SetStateAction<StudioState>>;
}) {

  // FE-24 ③ — 아젠다(sessions)는 detailPatchToBody가 다루지 않는 필드라(배열 전체를
  // 보내는 다른 계약, PUT .../sessions) 위 필드 저장 큐와 분리한다. 델타를 merge하지
  // 않고 "최신 배열 전체"만 덮어써 보관한다 — 순서 변경 델타는 항상 배열 전부를 들고
  // 오므로 merge할 것이 없다.
  const pendingSessionsRef = useRef<Map<number, Session[]>>(new Map());
  const sessionSaveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // 서버가 실제로 발급한 세션 id만 담는다. 로컬에서 새로 추가한 세션은 `Date.now()`로
  // 임시 id를 받는데(AgendaSection), 그 값을 그대로 PUT에 실으면 "남의 세션 id"로
  // 거절당한다(존재하지 않는 id라 UPDATE 0행이 아니라 400) — 여기 없는 id는 전부
  // null(새 행)로 보내 서버가 실제 id를 새로 발급하게 한다.
  const knownSessionIdsRef = useRef<Map<number, Set<number>>>(new Map());
  // 이벤트별로 세션 저장 요청을 직렬화한다 — 디바운스는 "연달아 편집하는 동안"만
  // 막아준다. 느린 네트워크에서 A 저장이 응답을 기다리는 사이 사용자가 또 편집하면
  // 새 타이머가 독립적으로 잡혀 B가 A와 겹쳐 나갈 수 있다. 겹치면 A의 응답이 B가
  // 이미 반영한 로컬 편집을 화면에서 덮어쓰고, B는 A가 방금 실제 id를 발급한
  // 세션을 여전히 옛 임시 id로 들고 있어 "모르는 id"로 오인해 **같은 세션을 중복
  // 삽입**한다(`/code-review` 발견). 이전 저장이 끝난 뒤에만 다음 저장이 시작되도록
  // Promise 체인으로 묶고, 보낼 배열은 스케줄된 시점이 아니라 **실행 시점**에
  // 다시 읽는다 — 그래야 앞선 저장이 갱신한 `knownSessionIdsRef`를 보고 간다.
  const sessionSaveChainRef = useRef<Map<number, Promise<void>>>(new Map());

  const flushSessionSave = useCallback(
    (id: number): Promise<void> => {
      const timer = sessionSaveTimersRef.current.get(id);
      if (timer) clearTimeout(timer);
      sessionSaveTimersRef.current.delete(id);
      if (!pendingSessionsRef.current.has(id)) return sessionSaveChainRef.current.get(id) ?? Promise.resolve();
      const prior = sessionSaveChainRef.current.get(id) ?? Promise.resolve();
      const run = prior.catch(() => {}).then(() => {
        const sessions = pendingSessionsRef.current.get(id);
        if (!sessions) return;
        patch({ saved: '변경 저장 중…' });
        const known = knownSessionIdsRef.current.get(id) ?? new Set<number>();
        const body = sessions.map((s) => ({
          id: known.has(s.id) ? s.id : null,
          time: s.time || null,
          title: s.title,
          speaker: s.speaker || null,
          kind: s.kind,
        }));
        return putStudioEventSessions(id, body)
          .then((serverSessions) => {
            knownSessionIdsRef.current.set(id, new Set(serverSessions.map((s) => s.id)));
            // 방금 보낸 배열(sessions/body)과 응답(serverSessions)은 같은 순서다 —
            // 위치로 짝지어 "이번 저장에서 새로 발급된" 임시 id → 실제 id 매핑을 만든다.
            const resolvedIds = new Map<number, number>();
            sessions.forEach((s, i) => {
              if (!known.has(s.id) && serverSessions[i]) resolvedIds.set(s.id, serverSessions[i].id);
            });
            const stillPending = pendingSessionsRef.current.get(id);
            if (stillPending && stillPending !== sessions) {
              // 이 저장이 오가는 동안 더 최신 편집이 이미 쌓여 있다 — 화면은 그
              // 최신 편집을 그대로 두고(덮어쓰면 방금 반영한 편집이 사라진다,
              // `/code-review` 발견), 방금 실제 id가 발급된 항목이 그 최신 편집
              // 안에 옛 임시 id로 남아 있다면 바꿔치기만 한다. 안 그러면 다음 저장이
              // 그 항목을 "모르는 id"로 오인해 같은 세션을 중복 삽입한다.
              if (resolvedIds.size > 0) {
                pendingSessionsRef.current.set(
                  id,
                  stillPending.map((s) => (resolvedIds.has(s.id) ? { ...s, id: resolvedIds.get(s.id)! } : s)),
                );
              }
            } else {
              if (pendingSessionsRef.current.get(id) === sessions) pendingSessionsRef.current.delete(id);
              setS((prev) => {
                const idx = prev.events.findIndex((e) => e.id === id);
                if (idx < 0) return prev;
                const events = prev.events.slice();
                events[idx] = { ...events[idx], sessions: serverSessions };
                return { ...prev, events };
              });
            }
            patch({ saved: '방금 저장됨' });
          })
          .catch((e) => {
            console.warn('아젠다 저장 실패:', e);
            patch({ saved: saveErrorMessage(e, '아젠다 저장') });
            // 필드 저장과 같은 이유로 큐에서 지우지 않는다 — 다음 아젠다 편집이 최신
            // 배열로 다시 덮어써 재시도된다. 단, 호출자(공개 직전 flush 등)는 실패를
            // 알아야 하므로 여기서 삼키지 않고 다시 던진다.
            throw e;
          });
      });
      sessionSaveChainRef.current.set(id, run);
      return run;
    },
    [patch, setS],
  );

  useEffect(
    () => () => {
      for (const id of pendingSessionsRef.current.keys()) flushSessionSave(id).catch(() => {});
    },
    [flushSessionSave],
  );
 return { knownSessionIdsRef, pendingSessionsRef, sessionSaveTimersRef, flushSessionSave };
}
