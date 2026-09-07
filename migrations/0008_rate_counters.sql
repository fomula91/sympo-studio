-- 0008_rate_counters — rate limit 판정을 (키, 창) 카운터로 (BE-21, ADR 0008)
--
-- 지금까지 판정은 대상 테이블(questions·survey_responses·event_logs)의 당일 행을
-- 세었다. 그 방식이 **정상 운영에서 비싸진다**: 행사장은 단일 egress IP라
-- 참가자 100명이 설문을 내면 그 IP의 당일 행이 상한에 닿고, 이후 모든 요청이
-- 매번 그 행들을 전부 훑는다 — 429로 거절되는 요청까지. 공격이 아니라 평범한
-- 행사 하나에서 밟힌다(ADR 0008 근거 ③).
--
-- 카운터는 PK 하나로 잡히므로 판정이 대상 테이블 크기와 무관해진다.
--
-- **증가는 성공한 쓰기에만 한다.** 요청마다 증가시키면 D1 쓰기 한도(10만/일)가
-- Workers 요청 한도(10만/일)와 1:1로 붙어, 플러드가 읽기 대신 쓰기 티어를
-- 태운다 — 쓰기가 마르면 Q&A·설문·로그가 전부 죽는다. 지금은 읽기만 타서
-- 서비스가 살아남는데 그 성질을 잃으면 안 된다.
--
-- scope에 정책과 범위를 함께 넣는다(BE-19): 브라우저 토큰 버킷은 이벤트별,
-- IP 총량 상한은 전역이다.
--   'questions:e12'  — 이벤트 12의 질문, 토큰 버킷
--   'questions'      — 전역, IP 총량
--
-- window_key에 시각을 넣어 창이 자연히 롤오버한다 — 별도 리셋이 필요 없다.
--   'd:2026-09-07'        하루 (KST)
--   'm:2026-09-07T11:23'  60초 창의 분 단위 근사
-- 분 버킷은 정확한 슬라이딩 윈도우가 아니라 경계에서 최대 2배가 통과할 수 있다.
-- 목적이 무료 티어 소진 방지라 그 오차는 감수한다(ADR 0008).

CREATE TABLE rate_counters (
  key_hash   TEXT NOT NULL,               -- token_hash 또는 client_hash
  scope      TEXT NOT NULL,
  window_key TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (key_hash, scope, window_key)
);

-- 만료 정리 Cron이 이 인덱스로 스캔한다. 방치하면 단조 증가한다 —
-- 사용자가 지우는 경로가 없다(event_logs·auth_sessions와 같은 성질).
CREATE INDEX idx_rate_counters_expires ON rate_counters(expires_at);

-- 기존 판정 인덱스는 더 이상 rate limit에 쓰이지 않는다. 컬럼(client_hash·
-- token_hash·write_count)은 남겨 둔다 — SQLite에서 컬럼을 지우려면 테이블
-- 재생성이 필요하고, 누가 썼는지는 사후 조사에 쓸모가 있다. write_count는
-- 이 마이그레이션 이후 판정에 관여하지 않는다.
