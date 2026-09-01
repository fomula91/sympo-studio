-- 0004_survey_updated_at — 설문 응답의 "최초 제출"과 "마지막 쓰기"를 분리한다.
--
-- 배경: 재제출을 upsert로 접으면서 created_at을 매번 datetime('now')로
-- 덮어썼다. 그 결과 두 가지가 동시에 깨졌다.
--
--   1. 최초 제출 시각이 영구 소실된다. 재제출 한 번이면 "언제 처음 답했나"를
--      알 수 없고, 이건 BE-5(이벤트 로그·OPS 집계)의 입력이다.
--   2. 그렇다고 created_at을 그대로 두면 rate limit의 60초 창이 재제출을
--      아예 못 본다 — 창 판정이 created_at 기준이기 때문이다. 같은 행을
--      계속 두드리는 요청이 순간 폭주 판정을 통과한다.
--
-- 두 요구가 한 컬럼에 겹쳐 있던 것이 원인이라 컬럼을 나눈다:
--   created_at  최초 제출 (불변)
--   updated_at  마지막 쓰기 (upsert마다 갱신) — rate limit 판정은 이쪽을 본다
--
-- SQLite의 ADD COLUMN은 상수가 아닌 DEFAULT(datetime('now'))를 허용하지 않아
-- nullable로 추가하고 기존 행을 created_at으로 채운다. 이후 삽입·갱신은
-- 애플리케이션이 항상 값을 넣는다(app/api/events/[id]/survey/route.ts).

ALTER TABLE survey_responses ADD COLUMN updated_at TEXT;

UPDATE survey_responses SET updated_at = created_at WHERE updated_at IS NULL;

-- rate limit 판정 컬럼이 created_at → updated_at으로 바뀌었으므로 인덱스도
-- 따라 옮긴다. 남겨두면 판정 쿼리가 인덱스를 못 타고 당일 행을 전부 스캔한다.
DROP INDEX IF EXISTS idx_survey_rate;
DROP INDEX IF EXISTS idx_survey_rate_token;
CREATE INDEX idx_survey_rate ON survey_responses(client_hash, updated_at);
CREATE INDEX idx_survey_rate_token ON survey_responses(token_hash, updated_at);
