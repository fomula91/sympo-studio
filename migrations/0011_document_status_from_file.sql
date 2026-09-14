-- 0011_document_status_from_file — 자료 status를 파일 존재와 일치시킨다 (BE-27)
--
-- `documents.status`는 원래 **입력**이었다. `lib/agenda.ts`가 신규 생성만
-- 검사했고(`id === null && status === 'ready'` → 400) 기존 항목 수정 경로에는
-- 검사가 없어서, **`r2_key`가 NULL인 자료를 메타 저장 한 번으로 `ready`로 올릴 수
-- 있었다.** 그러면 참가자 화면에 열 수 없는 자료가 "준비됨"으로 뜬다.
--
-- 이번 변경으로 status는 `r2_key` 유무에서 **파생**된다(라우트가 같은 문에서
-- CASE로 계산한다). 앞으로 어긋난 행은 만들어지지 않지만, **이미 어긋나 있는 행은
-- 코드 변경만으로 고쳐지지 않는다** — 그 행들을 여기서 맞춘다.
--
-- 방향은 한쪽뿐이다: 파일이 없는데 'ready'인 행을 'pending'으로 내린다.
-- 반대(파일이 있는데 'pending')는 업로드 라우트가 항상 'ready'로 쓰므로 생기지
-- 않지만, 파생 규칙과 같은 식을 쓰는 편이 안전하고 의미도 명확하다.
--
-- **데이터를 지우지 않는다.** status만 실제 상태에 맞춘다 — 'pending'은 결함
-- 표시가 아니라 "연자 자료가 아직 안 왔다"는 이 테이블의 정상 상태다
-- (0001_init.sql 주석, [[field-experience]]).

UPDATE documents
   SET status = CASE WHEN r2_key IS NULL THEN 'pending' ELSE 'ready' END
 WHERE status <> (CASE WHEN r2_key IS NULL THEN 'pending' ELSE 'ready' END);
