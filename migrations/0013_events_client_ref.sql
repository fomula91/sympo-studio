-- 0013_events_client_ref — 가져오기 멱등성 키 (BE-15)
--
-- 게스트가 로컬 워크스페이스에서 만든 이벤트를 로그인 뒤 서버로 올린다
-- ([[0007-sso-and-account-model]] §1-1). 그때 **네트워크가 끊겨 다시 누르는 것은
-- 결함이 아니라 정상 경로**다 — 그 재시도가 중복을 만들면 "로그인하면 잃는다"를
-- 막으려던 장치가 이번엔 "로그인하면 두 배가 된다"가 된다.
--
-- 그래서 클라이언트가 만든 식별자(`client_ref`, 로컬 UUID)를 함께 받아
-- **(소유자, client_ref)를 유일**하게 둔다. 재요청이 오면 새로 만들지 않고 기존 행을
-- 돌려준다.
--
-- **부분 인덱스인 이유**: 데모와 그 밖의 `client_ref IS NULL` 행을 인덱스에 넣지
-- 않는다. SQLite는 UNIQUE에서 NULL을 서로 다른 값으로 보므로 동작 자체는 같지만,
-- 조건을 명시하면 "이 유일성은 가져온 행에만 해당한다"가 스키마에 남는다.
--
-- **소유자를 키에 넣는 것이 요점**이다. `client_ref`만으로 유일하게 두면 남의
-- ref 값을 알아낸 사람이 그 값으로 요청해 **남의 이벤트를 자기 것으로 받아볼 수**
-- 있다. 조회도 항상 `owner_id = 나`와 함께 한다.

ALTER TABLE events ADD COLUMN client_ref TEXT;

CREATE UNIQUE INDEX idx_events_client_ref
    ON events(owner_id, client_ref)
 WHERE client_ref IS NOT NULL;
