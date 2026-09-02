-- 0005_event_log_rate_keys — 이벤트 로그 적재의 남용 통제 키 (BE-5)
--
-- event_logs는 참가자 화면이 자동으로 보내는 테이블이라 사람이 누르는 Q&A·설문과
-- 성격이 다르다: 한 참가자가 한 세션에서 수십 건을 만든다. 통제가 없으면 D1
-- 쓰기 한도를 가장 먼저 소진하는 경로가 된다.
--
-- 판정 규칙은 questions·survey_responses와 같다(ADR 0006의 2층 키). 그래서
-- 같은 컬럼 이름과 같은 인덱스 모양을 쓴다 — lib/rate-limit.ts가 테이블 이름만
-- 바꿔 재사용할 수 있어야 한다.
--
-- visitor(익명 방문자 토큰)와 token_hash는 다른 값이다: visitor는 "같은 사람의
-- 열람을 하나로 세기" 위해 날짜 소금 없이 안정적이어야 하고, token_hash는
-- rate limit 판정용이라 매일 로테이션한다. survey_responses의 respondent와
-- 같은 구분이다(0003 주석).

ALTER TABLE event_logs ADD COLUMN client_hash TEXT;
ALTER TABLE event_logs ADD COLUMN token_hash TEXT;

CREATE INDEX idx_logs_rate ON event_logs(client_hash, created_at);
CREATE INDEX idx_logs_rate_token ON event_logs(token_hash, created_at);

-- 집계(GET /ops)가 kind별로 방문자를 세는 경로. idx_logs_event_kind가
-- (event_id, kind, created_at)이라 kind 필터까지는 타지만, DISTINCT visitor는
-- 정렬을 타야 한다 — 방문자 컬럼을 인덱스 끝에 붙여 커버링이 되게 한다.
CREATE INDEX idx_logs_visitor ON event_logs(event_id, kind, visitor);
