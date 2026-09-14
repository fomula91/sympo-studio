-- 0014_users_email_not_identity — users.email에서 UNIQUE를 뗀다 (BE-30)
--
-- BE-26이 계정 연결 키를 `oauth_accounts(provider, provider_account_id)` 하나로
-- 좁히면서 **이메일이 겹치는 사용자는 로그인하지 못하는 막다른 길**을 남겼다
-- (409로 거절). 별개 계정을 만들어 주는 것이 옳은 모델인데, `users.email`이
-- `NOT NULL UNIQUE`라 두 번째 행을 못 만들었다([[Decisions/0010-account-link-key]]).
--
-- ---------------------------------------------------------------------------
-- 왜 이 순서인가 — 실측으로 확인한 D1의 두 가지
-- ---------------------------------------------------------------------------
--
-- ① **`PRAGMA foreign_keys = OFF`가 D1에서 먹지 않는다.** 실행해도 값이 1로 남는다
--    (로컬 D1 실측). `defer_foreign_keys = true`는 켜지지만 **검사를 미룰 뿐 FK
--    액션은 막지 않는다.**
--
-- ② 그래서 **부모를 DROP하면 CASCADE가 실제로 발화한다.** 스크래치 테이블로 재현했다:
--    `defer_foreign_keys = true`를 켜고 부모를 DROP하니 자식 2행이 0행이 됐다.
--    SQLite는 부모 테이블을 지울 때 암묵적 `DELETE FROM`을 돌리고, 그 삭제에서
--    FK 액션은 비활성화되지 않는다.
--
-- 즉 `users`를 그냥 DROP하면 `oauth_accounts`·`auth_sessions`·`events`가 통째로
-- 지워지고, `events`의 CASCADE를 타고 아젠다·자료·질문·설문·로그까지 따라간다.
-- **사용자 데이터 전부다.**
--
-- ---------------------------------------------------------------------------
-- 해법: 지우기 전에 "가리키는 손"을 놓게 한다
-- ---------------------------------------------------------------------------
--
-- CASCADE는 **부모를 실제로 가리키는 행**만 지운다. 그래서 DROP 전에
--   - 떼어 둘 수 있는 참조(`events.owner_id`·`brand_presets.owner_id`는 NULL 허용)는
--     **잠시 NULL로 내리고** 원래 값을 임시 테이블에 적어 둔다.
--   - 떼어 둘 수 없는 참조(`oauth_accounts.user_id`·`auth_sessions.user_id`는 NOT NULL)는
--     **행 자체를 임시 테이블로 대피**시키고 비운다.
-- 그러면 DROP 시점에 `users`를 가리키는 행이 하나도 없어 CASCADE가 0행을 지운다.
-- 재작성이 끝나면 임시 테이블에서 되돌린다.
--
-- **이 파일이 중간에 실패해도 안전하다** — 마이그레이션 파일 하나가 원자적이라는 것을
-- 실측으로 확인했다(앞 문장이 성공하고 뒤 문장이 실패하면 앞 문장까지 롤백된다).
-- 이게 아니었다면 2단계 직후 실패가 **모든 사용자 이벤트를 owner_id NULL로 만들어
-- 자정 Cron이 지우는** 최악의 경로가 됐다.
--
-- `auth_sessions`는 대피시키지 않고 버려도 됐지만(다시 로그인하면 된다) 굳이 로그아웃을
-- 강제할 이유가 없어 함께 옮긴다.

-- **재실행 가능하게 둔다.** 임시 테이블이 남아 있으면 재시도가 `table … already exists`로
-- 즉사하는데, 그 상태는 하필 **모든 사용자 이벤트가 owner_id NULL**인 순간일 수 있다
-- (원자성 덕에 정상 경로에서는 안 생기지만, 원격 적용이 다른 방식으로 끊길 가능성까지
-- 배제할 근거는 없다 — 실측한 것은 로컬이다). 값이 비싼 쪽으로 기울여 둔다.
-- **원격에 적용하기 전에 백업을 뜬다**(`wrangler d1 export`).
DROP TABLE IF EXISTS tmp_event_owner;
DROP TABLE IF EXISTS tmp_preset_owner;
DROP TABLE IF EXISTS tmp_oauth_accounts;
DROP TABLE IF EXISTS tmp_auth_sessions;

-- 1) 떼어 둘 수 있는 참조를 내려놓는다.
CREATE TABLE tmp_event_owner AS SELECT id, owner_id FROM events WHERE owner_id IS NOT NULL;
UPDATE events SET owner_id = NULL;

CREATE TABLE tmp_preset_owner AS SELECT id, owner_id FROM brand_presets WHERE owner_id IS NOT NULL;
UPDATE brand_presets SET owner_id = NULL;

-- 2) NOT NULL이라 내려놓을 수 없는 자식은 통째로 대피시킨다.
CREATE TABLE tmp_oauth_accounts AS SELECT * FROM oauth_accounts;
CREATE TABLE tmp_auth_sessions AS SELECT * FROM auth_sessions;
DELETE FROM oauth_accounts;
DELETE FROM auth_sessions;

-- 3) users 재작성 — email에서 UNIQUE만 뺀다. 나머지는 0010 그대로다.
--    이메일은 이제 **표시용 속성**이다. 계정을 가리키는 것은 oauth_accounts뿐이고,
--    같은 주소를 가진 별개 계정이 나란히 존재할 수 있어야 한다.
CREATE TABLE users_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  name       TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, email, name, avatar_url, created_at, updated_at)
     SELECT id, email, name, avatar_url, created_at, updated_at FROM users;

-- 이 시점에 users를 가리키는 행은 없다 — CASCADE가 0행을 지운다.
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 4) 되돌린다. 자식부터 넣고(부모가 이미 있으므로 FK가 만족된다) 참조를 다시 건다.
INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id, created_at)
     SELECT id, user_id, provider, provider_account_id, created_at FROM tmp_oauth_accounts;

INSERT INTO auth_sessions (id, user_id, expires_at, created_at)
     SELECT id, user_id, expires_at, created_at FROM tmp_auth_sessions;

UPDATE events
   SET owner_id = (SELECT t.owner_id FROM tmp_event_owner t WHERE t.id = events.id)
 WHERE id IN (SELECT id FROM tmp_event_owner);

UPDATE brand_presets
   SET owner_id = (SELECT t.owner_id FROM tmp_preset_owner t WHERE t.id = brand_presets.id)
 WHERE id IN (SELECT id FROM tmp_preset_owner);

DROP TABLE tmp_event_owner;
DROP TABLE tmp_preset_owner;
DROP TABLE tmp_oauth_accounts;
DROP TABLE tmp_auth_sessions;
