'use client';

import { useCallback, useEffect, useRef } from 'react';

import { patchStudioEvent } from "@fe/entities/event";

import type { PatchEvent } from "@fe/entities/event";
import type { PatchFn } from "./types";
import { saveErrorMessage } from './save-error';

export function useEventSaveQueue({ patch }: {
 patch: PatchFn;
}) {

  // 텍스트 입력은 키 입력마다 patchEvent를 부른다(기존 로컬 전용 동작) — 서버 PATCH까지
  // 매 키 입력마다 보내면 12글자 제목 하나에 요청 12번이 나간다(실측으로 확인). 짧은
  // 무입력 구간(SAVE_DEBOUNCE_MS)이 지난 뒤 누적된 델타 하나로 합쳐 한 번만 보낸다.
  // 이벤트 id별로 큐를 분리한다 — 단일 슬롯이면 A를 편집한 직후(700ms 안) B로 넘어가
  // 편집할 때 B의 델타가 A의 대기 중이던 델타를 통째로 덮어써 A의 변경이 조용히
  // 사라진다(교차 리뷰 발견 — Provider가 스튜디오 공용 레이아웃에 있어 이벤트 전환으로는
  // 언마운트되지 않으므로 cleanup도 이걸 못 잡는다).
  const pendingSavesRef = useRef<Map<number, PatchEvent>>(new Map());
  const saveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const SAVE_DEBOUNCE_MS = 700;

  const flushServerSave = useCallback(
    (id: number): Promise<void> => {
      const delta = pendingSavesRef.current.get(id);
      const timer = saveTimersRef.current.get(id);
      if (timer) clearTimeout(timer);
      saveTimersRef.current.delete(id);
      if (!delta) return Promise.resolve();
      patch({ saved: '변경 저장 중…' });
      return patchStudioEvent(id, delta)
        .then(() => {
          // 이 델타를 큐에서 뺀다 — 단, 응답을 기다리는 사이 같은 이벤트에 새 편집이
          // 들어와 이미 다른(더 최신) 델타로 교체됐다면 그건 건드리지 않는다(이미
          // 예약된 다음 타이머가 그 최신 값을 마저 보낸다).
          if (pendingSavesRef.current.get(id) === delta) pendingSavesRef.current.delete(id);
          patch({ saved: '방금 저장됨' });
        })
        .catch((e) => {
          console.warn('스튜디오 이벤트 서버 저장 실패:', e);
          patch({ saved: saveErrorMessage(e) });
          // 실패한 델타는 큐에서 지우지 않고 남겨둔다(위에서 이미 지우지 않음) —
          // 이전엔 요청 보내기 전에 먼저 비웠어서, 실패한 필드는 재시도 수단 없이
          // 그대로 사라지고 이어서 다른 필드를 수정하면 그 필드만 나가 "방금 저장됨"이
          // 뜨는 동안 실패한 필드는 계속 서버에 반영 안 된 채 묻혔다(교차 리뷰 발견).
          // 이제 같은 이벤트를 한 번 더 편집하면 남은 델타와 합쳐져 함께 재전송된다.
          // 호출자(공개 직전 flush 등)는 실패를 알아야 하므로 다시 던진다.
          throw e;
        });
    },
    [patch],
  );

  // 언마운트 시 대기 중인 이벤트 전부 즉시 보낸다 — 안 그러면 마지막 700ms 안의
  // 편집이 화면 이동과 함께 조용히 유실된다. 이벤트별 타이머는 계속 살아 있는 동안
  // 각자 알아서 flush되므로(전환만으로는 안 지워짐), 여기서는 진짜 언마운트만 처리한다.
  useEffect(
    () => () => {
      for (const id of pendingSavesRef.current.keys()) flushServerSave(id).catch(() => {});
    },
    [flushServerSave],
  );
 return { pendingSavesRef, saveTimersRef, flushServerSave, SAVE_DEBOUNCE_MS };
}
