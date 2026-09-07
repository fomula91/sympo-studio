-- 0007_auth — Google SSO 계정과 세션, 이벤트 소유권 (BE-12, ADR 0007)
--
-- **이름 주의**: 이 스키마의 `sessions`는 **아젠다 세션**이다(0001). 인증 세션은
-- `auth_sessions`로 둔다 — 같은 이름을 재사용하면 스키마·쿼리·타입 전반에서
-- 조용히 뒤섞인다.

CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- provider를 컬럼으로 둔 이유: 나중에 GitHub 등을 붙일 때 마이그레이션 없이
-- 늘어나야 한다(ADR 0007의 "감수하는 것" 절).
CREATE TABLE oauth_accounts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,               -- 'google'
  provider_account_id TEXT NOT NULL,               -- Google의 sub 클레임
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_account_id)
);

-- id는 **세션 토큰의 SHA-256 해시**다. 원문 토큰은 저장하지 않는다 — D1 내용이
-- 유출돼도 세션을 탈취할 수 없어야 한다. 해싱 자체는 client_hash·token_hash
-- (ADR 0006)에서 이미 쓰던 패턴이라 새로운 개념이 아니다.
CREATE TABLE auth_sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
-- 만료 세션 정리 Cron이 이 인덱스로 스캔한다.
CREATE INDEX idx_auth_sessions_expires ON auth_sessions(expires_at);

-- NULL = 데모 이벤트(시드가 만들고 자정 Cron이 리셋하는 것).
-- 값이 있으면 그 사용자의 이벤트다 — 이 한 컬럼이 게스트 세계와 계정 세계를
-- 가른다(ADR 0007 결정 1).
ALTER TABLE events ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX idx_events_owner ON events(owner_id);
