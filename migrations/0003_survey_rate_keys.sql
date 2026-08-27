-- 0003_survey_rate_keys — 설문 응답 수집(BE-4)의 rate limit 판정 키
--
-- questions와 같은 규칙(0002_token_hash.sql, ADR 0006)을 survey_responses에도
-- 적용한다: 판정은 별도 저장소 없이 대상 테이블 자체로 하므로, 설문 POST를
-- 통제하려면 이 테이블에도 키 2층(client_hash=IP, token_hash=브라우저)이
-- 저장돼야 한다. 날짜 소금 익명화 규칙도 동일하다.
--
-- respondent와 token_hash는 다른 값이다 — respondent는 중복 응답 방지용이라
-- 날짜 소금 없이 안정적이어야 하고(idx_survey_once), token_hash는 rate limit
-- 판정용이라 매일 로테이션한다.

ALTER TABLE survey_responses ADD COLUMN client_hash TEXT;
ALTER TABLE survey_responses ADD COLUMN token_hash TEXT;

-- 이 행에 실행된 쓰기(INSERT+UPDATE) 누적 수. 재제출은 upsert로 행이 늘지
-- 않으므로 행 수만 세면 "같은 문항 반복 제출"이 rate limit에 영영 안 걸린 채
-- D1 쓰기만 소모한다 — 하루 한도 판정은 행 수가 아니라 이 누적 합으로 센다.
ALTER TABLE survey_responses ADD COLUMN write_count INTEGER NOT NULL DEFAULT 1;

CREATE INDEX idx_survey_rate ON survey_responses(client_hash, created_at);
CREATE INDEX idx_survey_rate_token ON survey_responses(token_hash, created_at);
