# sympo-studio — Context

Claude Code가 우선 읽는 구현 컨텍스트. "지금 무엇을 만드는가"를 한 장으로 유지한다.
낡으면 고친다 — 이 문서는 이력이 아니라 현재 상태다 (이력은 [[log]]).

## 무엇을 만드는가
- SYMPO STUDIO: 제약사 심포지엄용 마이크로사이트를 만들고 운영하는 스튜디오. 운영자가 콘솔에서 이벤트를 관리하고, 에디터에서 아젠다·자료·참여·테마를 편집하면 참가자용 마이크로사이트(모바일/태블릿)에 즉시 반영된다.
- 화면 4개: 콘솔(목록·검색·상태 필터·벌크 액션) / 에디터(5개 섹션 + 라이브 프리뷰) / 뷰어(참가자 뷰 반응형 검증) / 리포트(운영 지표).
- 디자인 소스: claude.ai/design 프로젝트 `19de1b74-f6ac-4ef0-9fbc-f6ec958ccc9f` (`SYMPO STUDIO.dc.html`, `Microsite.dc.html`).

## 스택 / 구조
- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript. 화면은 전부 클라이언트 컴포넌트이고 아직 시드 데이터로 그린다.
- **백엔드(BE-1 완료)**: Cloudflare D1 + Route Handler. `wrangler.jsonc`(D1 바인딩 `DB`) · `migrations/0001_init.sql`(7개 테이블) · `lib/db.ts`(바인딩 접근·DTO 변환) · `app/api/events/*`(이벤트 CRUD). `next.config.ts`의 `initOpenNextCloudflareForDev()`가 있어야 `next dev`에서도 바인딩이 잡힌다. 스키마 근거는 [[0005-d1-schema]].
- DB 명령: `npm run db:migrate`(로컬 적용) · `npm run db:console -- "SQL"`(조회) · `npm run cf:typegen`(wrangler.jsonc 수정 후 타입 재생성).
- 스타일: 인라인 oklch(디자인 원본 충실) + `app/globals.css`의 hover/focus 헬퍼 클래스. Pretendard CDN.
- 디렉터리: `components/StudioApp.tsx`(단일 상태 + patch 패턴, 네비/헤더/벌크바) · `components/screens/*`(4개 화면) · `components/Microsite.tsx`(참가자 뷰, 프리뷰/뷰어 공용) · `lib/theme.ts`(프리셋→OKLCH 파생 `derive`, WCAG 대비비 게이트) · `lib/data.ts`(시드·상수) · `lib/ui.ts`(공용 스타일).
- 원격: https://github.com/fomula91/sympo-studio (public, main).

## 문제 정의 (근거의 층)
- **정본은 [[field-experience]]** — 무엇을 직접 겪었고 무엇을 겪지 않았는가. 문제를 서술할 때 **여기 없는 내용을 "관찰"로 쓰지 않는다.** 기존 README의 문제 정의가 프로토타입에서 역산돼 셋이 허구였던 경위와 재정립 판단은 [[0004-problem-redefinition]].
- 문제는 **두 층**이다. ① **제작·운영 효율**(색상 값 미전달·아젠다 이미지 왕복·URL 재사용 캐시 오염·자료 도착 지연·현장 네트워크) — 도구로 풀린다. ② **참여율** — 외부 링크를 프로덕트 안으로 이미 옮겼고 **플랫폼 교체까지 했으나 설문은 오르지 않았다.** 원인은 고령 사용자. 도구 교체로는 안 풀린다는 것이 실측이다.
- **이 프로젝트가 도전하는 지점은 ②** — 현장에서 사람이 하던 안내를 UI가 대신할 수 있는가. 아직 시도된 적 없는 접근이다.
- **사용자 정의에 간극이 있다.** 관찰 위치는 대행사 자료를 받아 올리는 제작자 겸 현장 운영자였고, 만들려는 것은 행사 운영자가 직접 쓰는 도구다. 즉 **본인이 하던 중간 역할을 없애는 도구**이며, 이 간극을 숨기지 않고 문서에 명시한다.
- **가설로만 표기할 것 두 가지**: 운영자 직접 편집이 왕복을 없앤다 / UI 개선이 고령 사용자 응답률을 올린다. 둘 다 검증되지 않았다.

## 핵심 판단 (요약)
- 테마는 HEX 입력 대신 브랜드 프리셋 1회 선택 → OKLCH 파생. WCAG AA 대비비 미달 조합은 저장 게이트로 차단하는 것이 제품 컨셉. **단 프리셋만으로는 절반의 해법** — 실무에서 넘어오는 건 색상 값이 아니라 이미지라, 대표 이미지에서 추출해 프리셋으로 쌓는 흐름이 있어야 실제 문제를 푼다(FE-8).
- 에디터 프리뷰와 참가자 뷰는 같은 `Microsite` 컴포넌트를 공유한다(단일 렌더 경로).
- dc 프로토타입 런타임(support.js)은 React로 대체 — 포팅 시 DCLogic의 setState 패턴을 patch 함수로 이식.

## 목적과 제약 (이게 기술 선택을 좌우한다)
- **전 직장에서 담당했던 프로젝트를 채용용 포트폴리오로 재구현**하는 작업이다. 공개 문서에는 회사명을 쓰지 않고 "실무에서 관찰한 문제를 처음부터 다시 설계한 개인 프로젝트"로 서술한다(경력 사실은 이력서·면접에서만).
- **무료로 오랫동안 유지**가 하드 제약이다. 결제 수단을 등록하지 않는 것이 안전장치다.
- 브랜드·인물·소속기관·의약품·행사장은 **전부 가상**이며, 리포트 수치도 샘플이다.
- **커밋 메시지에 `Co-Authored-By: Claude` 트레일러를 넣지 않는다.** 커밋 히스토리도 심사 대상이라서다(2026-08-15 결정, 기존 커밋 2건도 제거 후 재작성).

## 지금 단계
- 프론트 구현 완료(lint·build 통과), 데이터는 목업. README·리포지토리 정리 완료.
- **방향 전환**: 정적 전용(localStorage) → 실제 동작하는 백엔드로. Q&A·설문이라는 제품 핵심을 정적으로는 증명할 수 없기 때문 → [[0001-backend-for-working-demo]].
- 붙일 스택은 Cloudflare 단일 벤더(Workers + D1 + R2), 원칙은 **"저장·조회는 서버, 렌더링·생성은 클라이언트"** → [[0002-cloudflare-free-tier-stack]].
- [[Next-Tasks]]는 **FE/BE 두 섹션**으로 나뉜다(제목 접두사 `FE-`/`BE-`가 훅 파싱 계약) → [[0003-next-tasks-fe-be-split]].
- **BE-1 완료** — D1 스키마 7개 테이블 + 이벤트 CRUD가 로컬에서 왕복한다 → [[0005-d1-schema]].
- 다음 한 걸음: **BE-2**(Cloudflare 배포). `wrangler.jsonc`의 `database_id`가 아직 placeholder라 원격 D1을 만들어 채워야 한다.
- 서버 없이 지금 착수 가능한 것: **FE-2**(라우트 분리 + 폰트 자체 호스팅), **FE-7**(대비비 저장 게이트), FE-4의 수료증 부분.
