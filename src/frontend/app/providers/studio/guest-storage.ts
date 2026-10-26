

import type { EventItem } from "@fe/entities/event";

// 게스트 로컬 워크스페이스 영속(FE-15). 버전을 접두사에 박아 둔다 — 나중에 저장
// 모양이 바뀌면 새 키로 옮기고 예전 값은 그냥 버려진다(마이그레이션 없음, 로컬
// 목업 데이터라 감수할 수 있는 손실이다).
//
// **FE-25에서 `EventItem`에 `documents` 필드가 새로 생겼지만 키는 올리지 않았다** —
// 게스트가 직접 만든 이벤트는 시드 목업이 아니라 사용자 데이터라 손실을 감수할
// 이유가 약하다(팀원 코드리뷰). 대신 읽을 때 `documents`가 없으면 `[]`로 채워서
// 콘솔이 `e.documents.length`를 읽는 곳(사이드바 카드 등)에서 TypeError 없이
// 옛 이벤트를 그대로 보존한다.
export const GUEST_STORAGE_KEY = 'sympo-guest-events-v1';

export function readGuestWorkspace(): EventItem[] | null {
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return (parsed as EventItem[]).map((e) => ({ ...e, documents: e.documents ?? [] }));
  } catch {
    // 손상된 값·프라이빗 모드에서의 접근 거부 등 — 게스트 워크스페이스는 잃어도
    // 시드로 복구되는 로컬 전용 데이터라 조용히 무시하고 시드로 폴백한다.
    return null;
  }
}

// 성공 여부를 돌려준다(FE-19 이후 키 비주얼이 base64로 몇백KB~1MB대까지 커질 수 있어
// 용량 초과가 더는 드문 일이 아니다 — 실패를 그냥 삼키면 화면엔 이미지가 반영된 것처럼
// 보이다가 새로고침하면 그 편집뿐 아니라 이후 다른 편집까지 조용히 사라진다, 코드
// 리뷰 발견). 호출자가 실패를 `saved` 상태 문구로 드러낸다.
export function writeGuestWorkspace(events: EventItem[]): boolean {
  try {
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(events));
    return true;
  } catch {
    // 용량 초과·프라이빗 모드 등 — 화면 동작을 막을 이유는 아니다.
    return false;
  }
}
