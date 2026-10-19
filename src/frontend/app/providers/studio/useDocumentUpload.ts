'use client';

import { useCallback, useEffect, useRef } from 'react';

import { putStudioEventDocuments, uploadStudioDocument } from "@fe/entities/event";

import type { EventItem, StudioDocument } from "@fe/entities/event";
import type { StudioState } from "./types";

import type { Dispatch, SetStateAction } from 'react';

import { toDocumentMetaBody } from './document-meta';

export function useDocumentUpload({ s, setS, effectiveId, serverIds }: {
 s: StudioState;
 setS: Dispatch<SetStateAction<StudioState>>;
 effectiveId: number | null;
 serverIds: Set<number>;
}) {

  // 메타 행 생성 → 파일 업로드, 두 단계를 한 동작으로 묶는다. 즉시 실행이다(디바운스
  // 없음) — 파일을 드롭한 순간이 곧 "이걸 올리겠다"는 의사 표시라 텍스트 입력처럼
  // 타이핑 중간값을 무시할 이유가 없다.
  //
  // **동시 호출은 이벤트별 ref 락으로 막는다** — DocsSection의 로컬 busy 상태만으로는
  // 부족하다(편집 화면을 벗어났다 돌아오면 그 상태가 초기화되지만, 이전 요청은 계속
  // 진행 중일 수 있다) — 겹쳐 나가면(둘 다 같은 "현재 목록" 스냅샷에서 시작해 서로의
  // 결과를 모른 채 PUT하는 전체 교체 계약이라) 나중 응답이 먼저 응답을 덮어쓸 수 있다.
  const docsBusyRef = useRef<Set<number>>(new Set());
  // addDocument는 useCallback 인스턴스 하나를 여러 파일에 걸쳐 그대로 재사용한다
  // (DocsSection이 여러 파일을 순차로 올릴 때 매번 같은 함수 참조를 호출한다) — 그
  // 인스턴스가 캡처한 s.events는 호출 시점이 아니라 **그 인스턴스가 만들어진
  // 렌더 시점**의 값으로 고정된다. 그래서 같은 배치에서 file1을 올린 뒤 바로
  // file2를 올리면, file2 쪽 current는 file1이 아직 없던 옛 목록을 본다 — PUT이
  // 전체 교체 계약이라 file1의 행이 "제출 목록에 없는 기존 id"로 보여 서버가
  // 지운다(/code-review 발견, 실측: 2파일 드롭 시 첫 파일이 삭제됨). s.events를
  // 미러링하는 ref로 항상 최신 값을 읽게 해 해결한다 — ref 객체 자체는 안 바뀌므로
  // 오래된 addDocument 인스턴스라도 `.current`는 그 사이의 setS를 그대로 본다.
  const eventsRef = useRef(s.events);
  useEffect(() => {
    eventsRef.current = s.events;
  }, [s.events]);
  // 자료 목록을 바꿀 때는 `setS`와 함께 `eventsRef`도 **즉시** 고친다 — 위 effect는
  // 다음 렌더가 커밋된 뒤에야 돌아서, 네트워크 대기 없이 바로 이어지는 호출(다중
  // 업로드에서 한 파일이 실패해 되돌린 직후 다음 파일)은 되돌리기 전 목록을 읽는다.
  // 그러면 이미 지운 자료 id가 PUT에 실려 서버가 400("이 이벤트의 자료가 아닙니다")으로
  // 거절해, 실패 하나가 다음 파일까지 연쇄로 실패시켰다(PR #64 리뷰 발견).
  const setEventDocuments = useCallback(
    (id: number, update: (docs: StudioDocument[]) => StudioDocument[]) => {
      const apply = (events: EventItem[]): EventItem[] => {
        const idx = events.findIndex((e) => e.id === id);
        if (idx < 0) return events;
        const next = events.slice();
        next[idx] = { ...next[idx], documents: update(next[idx].documents) };
        return next;
      };
      eventsRef.current = apply(eventsRef.current);
      setS((prev) => {
        const events = apply(prev.events);
        return events === prev.events ? prev : { ...prev, events };
      });
    },
    [setS],
  );
  const addDocument = useCallback(
    async (file: File): Promise<void> => {
      if (effectiveId == null || !serverIds.has(effectiveId)) return;
      const id = effectiveId;
      if (docsBusyRef.current.has(id)) return;
      docsBusyRef.current.add(id);
      try {
        const current = eventsRef.current.find((e) => e.id === id)?.documents ?? [];
        const metaBody = [
          ...current.map(toDocumentMetaBody),
          // 160자는 lib/agenda.ts DOC_NAME_MAX와 같다 — 안 자르면 긴 파일명이 메타
          // PUT을 400으로 거절해, 등록까지 끝낸 뒤에야 기술적인 에러 메시지로 실패한다.
          { id: null, sessionId: null, displayName: file.name.replace(/\.[^.]+$/, '').slice(0, 160), tag: null },
        ];
        const saved = await putStudioEventDocuments(id, metaBody);
        const existingIds = new Set(current.map((d) => d.id));
        const created = saved.find((d) => !existingIds.has(d.id));
        setEventDocuments(id, () => saved);
        if (!created) return;
        try {
          const result = await uploadStudioDocument(id, created.id, file);
          setEventDocuments(id, (docs) =>
            docs.map((d) =>
              d.id === created.id
                ? { ...d, status: result.status, hasFile: true, sizeBytes: result.sizeBytes, contentType: file.type || null }
                : d,
            ),
          );
        } catch (e) {
          // 업로드 실패 — 방금 만든 메타 행을 되돌린다. 안 그러면 빈 'pending' 자료가
          // 목록에 영영 남고, 이번 범위엔 "기존 pending 행에 다시 올리기" UI가 없어
          // 되돌리는 것 말고는 회복할 방법이 없다. 되돌리기 자체가 실패해도 원래
          // 실패 사유를 덮지 않는다(호출자에게 그대로 던진다).
          try {
            const rolledBack = await putStudioEventDocuments(
              id,
              saved.filter((d) => d.id !== created.id).map(toDocumentMetaBody),
            );
            setEventDocuments(id, () => rolledBack);
          } catch (rollbackError) {
            console.warn('업로드 실패 후 메타 되돌리기도 실패:', rollbackError);
          }
          throw e;
        }
      } finally {
        docsBusyRef.current.delete(id);
      }
    },
    [effectiveId, serverIds, setEventDocuments],
  );

  const removeDocument = useCallback(
    async (docId: number): Promise<void> => {
      if (effectiveId == null || !serverIds.has(effectiveId)) return;
      const id = effectiveId;
      if (docsBusyRef.current.has(id)) return;
      docsBusyRef.current.add(id);
      try {
        const current = eventsRef.current.find((e) => e.id === id)?.documents ?? [];
        const metaBody = current.filter((d) => d.id !== docId).map(toDocumentMetaBody);
        const saved = await putStudioEventDocuments(id, metaBody);
        setEventDocuments(id, () => saved);
      } finally {
        docsBusyRef.current.delete(id);
      }
    },
    [effectiveId, serverIds, setEventDocuments],
  );
 return { addDocument, removeDocument };
}
