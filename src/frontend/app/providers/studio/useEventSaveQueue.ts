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
  const inFlightSavesRef = useRef<Map<number, Promise<void>>>(new Map());
  const SAVE_DEBOUNCE_MS = 700;

  const flushServerSave = useCallback(
    (id: number): Promise<void> => {
      const timer = saveTimersRef.current.get(id);
      if (timer) clearTimeout(timer);
      saveTimersRef.current.delete(id);
      // 공개 직전 flush도 진행 중인 요청을 공유해 같은 변경을 중복 전송하지 않는다.
      const inFlight = inFlightSavesRef.current.get(id);
      if (inFlight) return inFlight;
      if (!pendingSavesRef.current.get(id)) return Promise.resolve();
      const run = Promise.resolve().then(async () => {
        let delta = pendingSavesRef.current.get(id);
        while (delta) {
          patch({ saved: '변경 저장 중…' });
          try {
            await patchStudioEvent(id, delta);
          } catch (e) {
            console.warn('스튜디오 이벤트 서버 저장 실패:', e);
            patch({ saved: saveErrorMessage(e) });
            // 실패한 델타는 남겨 다음 편집에서 합쳐 재시도하고, 공개 호출자에게 실패를 알린다.
            throw e;
          }
          if (pendingSavesRef.current.get(id) === delta) pendingSavesRef.current.delete(id);
          // 응답 대기 중 쌓인 최신 수정도 순서대로 저장한 뒤에만 완료를 알린다.
          delta = pendingSavesRef.current.get(id);
        }
        patch({ saved: '방금 저장됨' });
      });
      inFlightSavesRef.current.set(id, run);
      const clearInFlight = () => {
        if (inFlightSavesRef.current.get(id) === run) inFlightSavesRef.current.delete(id);
      };
      void run.then(clearInFlight, clearInFlight);
      return run;
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
