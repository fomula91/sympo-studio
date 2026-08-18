-- 0001_init — 이벤트·세션·자료·질문·설문응답·이벤트로그·브랜드 프리셋
--
-- 설계 근거는 llm-wiki/Decisions/0005-d1-schema.md.
-- 값이 한글인 컬럼(status 등)에 CHECK 제약을 걸지 않은 이유도 거기 적혀 있다.

-- ---------------------------------------------------------------------------
-- 브랜드 프리셋 — events가 참조하므로 먼저 만든다.
--
-- 실무에서 대행사는 정확한 색상 값을 주지 않고 브랜드 대표 이미지만 넘겼다.
-- 그래서 프리셋은 "미리 준비된 목록"이 아니라 이미지에서 추출해 쌓이는 것이어야
-- 한다(origin='extracted'). 회차가 반복되면 같은 브랜드를 재사용한다.
-- ---------------------------------------------------------------------------
CREATE TABLE brand_presets (
  id         TEXT PRIMARY KEY,                      -- slug 형태 (예: 'meridian')
  label      TEXT NOT NULL,
  hue        REAL NOT NULL,                         -- OKLCH 파생의 입력
  chroma     REAL NOT NULL,                         -- 나머지 색은 lib/theme.ts가 유도한다
  origin     TEXT NOT NULL DEFAULT 'builtin',       -- 'builtin' | 'extracted'
  source_key TEXT,                                  -- 추출 원본 이미지의 R2 키 (origin='extracted'일 때)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- 이벤트 — 회차 하나가 행 하나.
--
-- slug가 UNIQUE인 것이 이 테이블의 핵심 제약이다. 실무에서 이벤트 URL을
-- 돌려쓰다 카카오톡 공유 캐시에 이전 회차 정보가 미리보기로 남았다.
-- 회차마다 주소가 달라야 그 오염이 구조적으로 불가능해진다.
-- ---------------------------------------------------------------------------
CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  brand      TEXT NOT NULL,
  title      TEXT NOT NULL,
  venue      TEXT,
  event_date TEXT,                                  -- ISO 8601 'YYYY-MM-DD'
  host       TEXT,                                  -- 좌장
  capacity   INTEGER,                               -- 예상 참여 인원 (리포트 분모)
  status     TEXT NOT NULL DEFAULT '초안',           -- 초안|검수대기|공개예정|진행중|완료|보관

  -- 테마 (lib/types.ts의 StudioState에 평평하게 있던 것을 이벤트 단위로 내린다)
  preset_id  TEXT REFERENCES brand_presets(id) ON DELETE SET NULL,
  mode       TEXT NOT NULL DEFAULT 'light',         -- light|dark
  icon_set   TEXT NOT NULL DEFAULT 'geo',           -- geo|solid|number
  density    TEXT NOT NULL DEFAULT '기본',           -- 컴팩트|기본|여유
  key_visual TEXT,
  kv_pattern TEXT NOT NULL DEFAULT 'stripe',        -- stripe|grid|flat|none

  -- 참여 기능 토글 (SQLite에 BOOLEAN이 없어 0/1)
  engage_qa     INTEGER NOT NULL DEFAULT 0,
  engage_survey INTEGER NOT NULL DEFAULT 0,
  engage_chat   INTEGER NOT NULL DEFAULT 0,
  engage_cert   INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_status ON events(status, event_date DESC);
CREATE INDEX idx_events_brand ON events(brand);

-- ---------------------------------------------------------------------------
-- 세션(아젠다) — 이미지 슬라이드가 아니라 레코드.
--
-- 실무에서는 연자가 바뀔 때마다 새 이미지를 받아 다시 올렸다. 여기서는
-- speaker 한 컬럼을 고치는 일이 된다.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,            -- 드래그 정렬 결과
  start_time TEXT,                                  -- 'HH:MM'
  title      TEXT NOT NULL,
  speaker    TEXT,
  kind       TEXT NOT NULL DEFAULT 'LECTURE',       -- OPENING|LECTURE|PANEL|QA|CASE|CLOSING
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_event ON sessions(event_id, sort_order);

-- ---------------------------------------------------------------------------
-- 자료 — status='pending'이 이 테이블의 요점.
--
-- 연자가 제때 도착하지 않아 강의자료가 행사 진행 중에 올라왔다. 자료 행은
-- 파일보다 먼저 생길 수 있어야 하고(r2_key NULL), 그동안 참가자 화면은
-- 빈 목록이 아니라 "준비 중"을 보여준다.
-- display_name은 해시 파일명이 아니라 사람이 읽는 이름이다.
-- ---------------------------------------------------------------------------
CREATE TABLE documents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id   INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  r2_key       TEXT,                                -- 업로드 전에는 NULL
  content_type TEXT,
  size_bytes   INTEGER,
  page_count   INTEGER,
  tag          TEXT,                                -- 강의자료|제품소개 …
  status       TEXT NOT NULL DEFAULT 'pending',     -- 'pending' | 'ready'
  sort_order   INTEGER NOT NULL DEFAULT 0,
  uploaded_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_documents_event ON documents(event_id, sort_order);

-- ---------------------------------------------------------------------------
-- Q&A 질문
--
-- client_hash는 rate limit 판정용 IP 해시다. 원문 IP는 저장하지 않는다.
-- ---------------------------------------------------------------------------
CREATE TABLE questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id  INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  author      TEXT,
  status      TEXT NOT NULL DEFAULT 'published',    -- 'published' | 'hidden'
  client_hash TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_questions_event ON questions(event_id, created_at DESC);
-- BE-3의 rate limit이 "이 해시가 최근 N초 안에 몇 건 썼나"를 묻는다.
CREATE INDEX idx_questions_rate ON questions(client_hash, created_at);

-- ---------------------------------------------------------------------------
-- 설문 응답 — 문항 하나가 행 하나.
--
-- 실무에서 이탈 지점을 없앴는데도 설문 응답률이 오르지 않았고, 원인은 고령
-- 사용자였다. 끝나고 몰아 받는 2단 폼 대신 "세션이 끝날 때마다 1문항"이
-- 유력한 대안이라 세션 단위 응답을 담을 수 있어야 한다.
--
-- 문항 하나를 행 하나로 두면 두 형태를 모두 담는다.
--   세션별 1문항  → session_id = 해당 세션
--   행사 전체 문항 → session_id = NULL
-- 응답 구조를 바꿔도 마이그레이션이 필요 없다는 것이 이 설계의 요점이다.
-- ---------------------------------------------------------------------------
CREATE TABLE survey_responses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id   INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  question_key TEXT NOT NULL,                       -- 'overall_satisfaction' 등
  answer       TEXT NOT NULL,
  respondent   TEXT NOT NULL,                       -- 익명 토큰. 개인정보 아님
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_survey_event ON survey_responses(event_id, question_key);
-- 같은 응답자가 같은 문항에 두 번 답하면 응답률 집계가 왜곡된다.
-- session_id가 NULL일 때 SQLite의 UNIQUE는 중복을 허용하므로 IFNULL로 접는다.
CREATE UNIQUE INDEX idx_survey_once
  ON survey_responses(event_id, respondent, question_key, IFNULL(session_id, -1));

-- ---------------------------------------------------------------------------
-- 이벤트 로그 — 리포트(BE-5)의 원자료.
-- ---------------------------------------------------------------------------
CREATE TABLE event_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                        -- page_view|session_view|doc_view|survey_complete
  session_id  INTEGER,
  document_id INTEGER,
  visitor     TEXT,                                 -- 익명 토큰
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_logs_event_kind ON event_logs(event_id, kind, created_at);
-- BE-5의 "30일 보존 후 삭제" Cron이 이 인덱스로 스캔한다.
-- 로그는 방치하면 무한 증가하므로 삭제 경로를 스키마 단계에서 준비해 둔다.
CREATE INDEX idx_logs_created ON event_logs(created_at);
