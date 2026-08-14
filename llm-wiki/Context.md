# sympo-studio — Context

Claude Code가 우선 읽는 구현 컨텍스트. "지금 무엇을 만드는가"를 한 장으로 유지한다.
낡으면 고친다 — 이 문서는 이력이 아니라 현재 상태다 (이력은 [[log]]).

## 무엇을 만드는가
- SYMPO STUDIO: 제약사 심포지엄용 마이크로사이트를 만들고 운영하는 스튜디오. 운영자가 콘솔에서 이벤트를 관리하고, 에디터에서 아젠다·자료·참여·테마를 편집하면 참가자용 마이크로사이트(모바일/태블릿)에 즉시 반영된다.
- 화면 4개: 콘솔(목록·검색·상태 필터·벌크 액션) / 에디터(5개 섹션 + 라이브 프리뷰) / 뷰어(참가자 뷰 반응형 검증) / 리포트(운영 지표).
- 디자인 소스: claude.ai/design 프로젝트 `19de1b74-f6ac-4ef0-9fbc-f6ec958ccc9f` (`SYMPO STUDIO.dc.html`, `Microsite.dc.html`).

## 스택 / 구조
- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript. 전부 클라이언트 컴포넌트, 백엔드/DB 없음(시드 데이터 하드코딩).
- 스타일: 인라인 oklch(디자인 원본 충실) + `app/globals.css`의 hover/focus 헬퍼 클래스. Pretendard CDN.
- 디렉터리: `components/StudioApp.tsx`(단일 상태 + patch 패턴, 네비/헤더/벌크바) · `components/screens/*`(4개 화면) · `components/Microsite.tsx`(참가자 뷰, 프리뷰/뷰어 공용) · `lib/theme.ts`(프리셋→OKLCH 파생 `derive`, WCAG 대비비 게이트) · `lib/data.ts`(시드·상수) · `lib/ui.ts`(공용 스타일).
- 원격: https://github.com/fomula91/sympo-studio (public, main).

## 핵심 판단 (요약)
- 테마는 HEX 입력 대신 브랜드 프리셋 1회 선택 → OKLCH 파생. WCAG AA 대비비 미달 조합은 저장 게이트로 차단하는 것이 제품 컨셉.
- 에디터 프리뷰와 참가자 뷰는 같은 `Microsite` 컴포넌트를 공유한다(단일 렌더 경로).
- dc 프로토타입 런타임(support.js)은 React로 대체 — 포팅 시 DCLogic의 setState 패턴을 patch 함수로 이식.

## 지금 단계
- 디자인 프로토타입의 충실한 프론트 구현 완료(빌드·브라우저 검증 통과). 데이터는 전부 목업.
- 다음 한 걸음 후보: DB 연동(이벤트 CRUD 영속화), Vercel 배포, 자동 테스트 도입.
