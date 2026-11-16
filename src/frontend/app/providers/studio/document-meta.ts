

import type { StudioDocument } from "@fe/entities/event";

// addDocument·removeDocument가 PUT .../documents(전체 교체 계약)에 보내는 메타 행
// 하나를 만든다 — 추가·삭제·업로드 실패 시 되돌리기, 세 자리에서 같은 모양이 필요하다.
export function toDocumentMetaBody(d: StudioDocument) {
  return { id: d.id, sessionId: d.sessionId, displayName: d.displayName, tag: d.tag };
}
