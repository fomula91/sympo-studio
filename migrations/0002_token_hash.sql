-- 0002_token_hash — rate limit 키 2층 구조(브라우저 토큰 버킷 + IP 총량 상한)
--
-- 설계 근거는 llm-wiki/Decisions/0006-rate-limit-key.md.
-- token_hash = SHA-256(브라우저 토큰|KST날짜) 앞 16자. 원문 토큰은 저장하지
-- 않고 날짜 소금으로 매일 로테이션한다(client_hash와 같은 익명화 규칙).
-- 토큰 없는 요청은 NULL — 그 경우 판정은 client_hash(IP) 단독으로 한다.

ALTER TABLE questions ADD COLUMN token_hash TEXT;

CREATE INDEX idx_questions_rate_token ON questions(token_hash, created_at);
