

import type { EventItem } from "@fe/entities/event";

// 목록 응답엔 sessions·documents·키 비주얼 원문이 없다(BE-36) — 이미 상세를 불러온
// 이벤트가 있으면 그 값을 목록의 빈 값으로 덮지 않는다. 로그인 시 최초 조회(마운트
// 이펙트)와 가져오기 완료 뒤 재조회(FE-39) 둘 다 같은 판정이 필요해 함수로 뺐다
// (`/code-review` 발견 — 가져오기 쪽이 이 병합 없이 통째로 덮어써, 상세를 이미 본
// 이벤트의 키 비주얼·세션·자료가 가져오기 한 번으로 화면에서 사라질 뻔했다).
export function mergeDetailLoadedEvents(
  prevEvents: EventItem[],
  freshEvents: EventItem[],
  loadedIds: ReadonlySet<number>,
): EventItem[] {
  const priorById = new Map(prevEvents.map((e) => [e.id, e]));
  return freshEvents.map((e) => {
    const prior = priorById.get(e.id);
    return loadedIds.has(e.id) && prior
      ? { ...e, keyVisual: prior.keyVisual, sessions: prior.sessions, documents: prior.documents, sessionCount: undefined, documentCount: undefined }
      : e;
  });
}
