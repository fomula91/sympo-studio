-- 0009_event_status_axes — 발행 상태와 행사 시점을 가른다 (BE-23)
--
-- 설계 근거는 llm-wiki/Decisions/0009-event-status-axes.md.
--
-- `공개예정|진행중|완료`는 사람이 고르는 값이 아니라 event_date와 오늘의 관계였다.
-- 셋을 `공개` 하나로 접고, 시점은 읽는 쪽에서 파생한다(lib/status.ts의 eventPhase).
-- 셋 다 이미 PUBLIC_STATUSES에 들어 있어 **공개 여부는 바뀌지 않는다** — 접기 전후로
-- 참가자에게 보이는 이벤트 집합이 동일하다.
--
-- 잃는 정보는 "그 이벤트가 어느 시점이었는가"인데, 그것은 event_date에 이미 있고
-- 파생이 항상 같은 답을 낸다. 되돌릴 일이 있으면 event_date로 재계산하면 된다.
--
-- CHECK 제약을 걸지 않는 이유는 0001_init 헤더와 같다([[0005-d1-schema]] §status).
-- 검증은 애플리케이션 층(lib/status.ts의 isEventStatus)에 있다.

UPDATE events SET status = '공개' WHERE status IN ('공개예정', '진행중', '완료');
