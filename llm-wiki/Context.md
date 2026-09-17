# sympo-studio — Context

> **에이전트용 고밀도 컨텍스트.** 사람이 읽을 요약은 [[Summaries/Status]].
> 이 문서는 **이력이 아니라 현재 상태**다(이력은 [[log]]·[[Summaries/History]]). 낡으면 고친다.
> 기준일 **2026-09-14** / main `6bdcd26`.

## 제품

제약사 심포지엄 마이크로사이트를 만들고 운영하는 스튜디오. 운영자가 콘솔에서 이벤트를 관리하고 에디터에서 아젠다·자료·참여·테마를 편집하면 참가자용 마이크로사이트(모바일/태블릿)에 반영된다.

- 배포: https://sympo.superjacob.com (BE-22, 2026-09-17)
  - 구 주소 https://sympo-studio.fomula91.workers.dev도 **함께 살아 있다**(`workers_dev: true`) — 옛 링크를 죽이지 않으려고 둘 다 둔다
- 원격: https://github.com/fomula91/sympo-studio (public, main)
- 디자인 원본: claude.ai/design `19de1b74-f6ac-4ef0-9fbc-f6ec958ccc9f` (`SYMPO STUDIO.dc.html`, `Microsite.dc.html`)

## ⚠️ 가장 먼저 알아야 할 구조적 사실

**스튜디오 화면 5개(`ConsoleScreen`·`EditorScreen`·`ReportScreen`·`ViewerScreen`·`StudioShell`)는 `fetch` 호출이 0건이다.** 전부 `useStudio()`의 로컬 목업 상태만 고친다. 서버에 붙어 있는 것은 참가자 라우트뿐이다.

| 라우트 | 서버 | 비고 |
|---|---|---|
| `/[slug]` | ✅ | `GET /api/public/[slug]` → `Microsite`. Q&A·설문·자료·로그 전부 실제 D1 |
| `/[slug]/report` | ✅ | `GET /api/public/[slug]` + `GET /api/events/[id]/ops` |
| `/(studio)/console` | ❌ | 로컬 목업 |
| `/(studio)/events/[id]/edit` | ❌ | 로컬 목업 |
| `/(studio)/report` | ❌ | 로컬 목업(실측 뷰는 `/[slug]/report`) |
| `/intro` · `/` | — | 정적 |

**열린 FE 과제 중 FE-15·FE-19·FE-23·FE-24·FE-25가 전부 이 하나의 미연결에서 파생된다.** 개별 과제로 착수하면 같은 벽에 다시 부딪히므로, **스튜디오↔D1 연결 범위를 먼저 정하는 것**이 선행 판단이다. 과거에 FE-5·FE-19·FE-23이 모두 여기서 범위를 좁혔다.

## 스택

- **프론트**: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript. 화면은 전부 클라이언트 컴포넌트.
- **백엔드**: Cloudflare Workers + D1 + R2 + Cron. OpenNext(`@opennextjs/cloudflare`)로 빌드·배포.
- **스타일**: 인라인 oklch 리터럴(디자인 원본 충실) + `app/globals.css`의 hover/focus 헬퍼 클래스. Pretendard.
- **테스트**: vitest **99건 / 12파일**(`lib/` 순수 함수 + 가짜 D1으로 **발행 SQL을 고정**하는 것들 — `agenda`·`auth`·`import`·`ops`·`presets`·`r2`·`rate-limit`·`rate-policy`·`retention`·`seed`·`status`·`theme`). 가짜 D1은 **SQL 문자열만 본다** — 의미 검증은 로컬 D1 실측으로 보완한다(BE-27·28·31이 그렇게 했다). 컴포넌트 테스트는 **없다**(FE-22에서 도입했다가 우선순위 판단으로 리젝, 번호 결번).
- **CI/CD**: `.github/workflows/ci.yml`(PR 검증 `verify`) + `deploy.yml`(main 머지 시 자동 배포).

## 디렉터리

| 경로 | 역할 |
|---|---|
| `components/StudioApp.tsx` | 단일 상태 + patch 패턴, 네비·헤더·벌크바 |
| `components/screens/*` | 스튜디오 4화면 (전부 목업) |
| `components/Microsite.tsx` | **참가자 뷰 — 에디터 프리뷰와 공용(단일 렌더 경로)** |
| `components/PdfViewer.tsx` | PDF.js canvas 뷰어. `next/dynamic(ssr:false)`로 lazy load |
| `components/{QaPanel,SurveyPanel}.tsx` | Q&A·설문 패널 |
| `lib/db.ts` | D1 바인딩 접근·DTO 변환·`ApiError`/`withRoute` |
| `lib/auth.ts` | PKCE·세션·업서트·만료 정리 + **`assertCanEdit`(모든 쓰기 경로가 지난다)** |
| `lib/api.ts` | FE→서버 클라이언트(`fetchWithTimeout`·`sendEventLogs`·`fetchEventOps`) |
| `lib/theme.ts` | 프리셋→OKLCH 파생 `derive`, WCAG 대비비 게이트(`culori`) |
| `lib/agenda.ts` | 아젠다·자료 입력 검증 |
| `lib/status.ts` | 발행 상태 4종 검증 (→ [[0009-event-status-axes]]) |
| `lib/r2.ts` | 서명 URL 발급(**TTL 10분**)·업로드 가드 |
| `lib/seed.ts` | 데모 데이터 리셋. **`DEMO_SLUG`는 예약어** |
| `worker/index.ts` | OpenNext 워커를 감싼 커스텀 엔트리 — 자정 Cron |

## API (18 라우트)

정본은 [[API-Guide-FE]]. 요약만:

- `GET /api/public/[slug]` — 참가자 공개 조회(이벤트+아젠다+자료+테마+engage). **공개 상태만 노출**, 문서마다 서명 URL 포함
- `/api/events` · `/api/events/[id]` — 이벤트 CRUD
- `/api/events/[id]/{sessions,documents}` — 아젠다·자료 쓰기(**목록 전체를 받는 id 기준 diff**)
- `/api/events/[id]/documents/[docId]/upload` — R2 업로드(PDF만·20MB·본문은 바이트 그대로, multipart 아님)
- `/api/events/[id]/{questions,questions/[qid]}` — Q&A
- `/api/events/[id]/survey` · `/survey/summary` — 설문
- `/api/events/[id]/{logs,ops}` — 로그 적재(배치 최대 30) · 집계
- `/api/auth/{google,callback/google,logout,me}` — Google SSO
- `/api/presets` · `/api/files/[...key]`

## 스키마 / 마이그레이션

`migrations/0001`~`0015` (**0007·0011이 결번**). 둘 다 같은 이유다 — **미머지 브랜치에 묵는 사이 뒤 번호가 먼저 적용돼** 앞 번호를 두면 "적용된 0009 뒤에 0007이 적용되는" 이력이 남는다. 0007은 BE-12가 0010으로, 0011은 BE-27이 0015로 옮겼다. 근거는 [[0005-d1-schema]]. **번호를 다시 쓰지 않는다** — 결번이 그 사고의 기록이다.

- `sessions`는 **아젠다 세션**이다. 인증 세션은 `auth_sessions` — 헷갈리지 말 것.
- `events.owner_id` NULL = 데모 이벤트(게스트 체험이 여기 기댄다). 소유자가 있으면 세션 일치 필수이고 **불일치는 403이 아니라 404**.
- 발행 상태 4종 `초안|검수대기|공개|보관`(저장) / 행사 시점 3종(`event_date`에서 **파생**) → [[0009-event-status-axes]]. `진행중`은 상태가 아니라 시점이다.

## 반복해서 밟은 지뢰

- **서명 URL은 10분 TTL**이다. 페이지 로드 때 받은 URL로 한참 뒤에 열면 만료돼 있다 → 여는 직전 재조회.
- **`status`와 실제 열람 가능 여부가 어긋날 수 있다** — 파일 없는 문서도 메타 수정으로 `ready`가 된다. 게이트는 `status` 단독이 아니라 `url` 유무까지 봐야 한다.
- **로컬 dev에서 참가자 페이지가 전부 500이면** `.dev.vars`의 `DOC_URL_SECRET` 미설정이다(`lib/r2.ts`가 던진다).
- **로컬 D1은 비어 있는 게 정상이다** — 시드는 `worker/index.ts`의 Cron에서만 돈다. `next dev`로는 안 채워지므로 API로 직접 만든다.
- **아젠다 쓰기는 전체 삭제 후 재삽입 금지** — 세션 id가 새로 발급돼 설문·로그 참조가 끊긴다.
- **상위 라우트만 막으면 자식 라우트로 우회된다** — 과거에 `PUT …/sessions`에 빈 배열로 남의 아젠다가 전멸했다.

## 문제 정의 (근거의 층)

- **정본은 [[field-experience]]** — 겪은 것과 안 겪은 것을 가른 문서. **여기 없는 내용을 "관찰"로 쓰지 않는다.** 기존 README가 화면에서 역산해 문제를 지어냈고 넷 중 셋이 사실과 달랐다 → [[0004-problem-redefinition]].
- 문제는 **두 층**이다. ① **제작·운영 효율**(색상 값 미전달·아젠다 이미지 왕복·URL 재사용 캐시 오염·자료 도착 지연·현장 네트워크) — 도구로 풀린다. ② **참여율** — 링크를 프로덕트 안으로 옮기고 **플랫폼 교체까지 했으나 설문은 오르지 않았다.** 원인은 고령 사용자이고, 도구 교체로는 안 풀린다는 것이 실측이다.
- **이 프로젝트가 도전하는 지점은 ②** — 현장에서 사람이 하던 안내를 UI가 대신할 수 있는가.
- **사용자 정의에 간극이 있다.** 관찰 위치는 대행사 자료를 받아 올리는 제작자 겸 현장 운영자였고, 만들려는 것은 행사 운영자가 직접 쓰는 도구다 — **본인이 하던 중간 역할을 없애는 도구**이며 이 간극을 문서에 명시한다.
- **가설로만 표기할 것**: 운영자 직접 편집이 왕복을 없앤다 / UI 개선이 고령 사용자 응답률을 올린다. 둘 다 미검증.

## 핵심 판단

- **테마**: HEX 입력 대신 브랜드 프리셋 1회 선택 → OKLCH 파생, WCAG AA 미달은 저장 게이트로 차단. 단 **프리셋만으로는 절반** — 실무에서 넘어오는 건 색상 값이 아니라 이미지라 추출→축적 흐름이 있어야 실제 문제를 푼다.
- **에디터 프리뷰와 참가자 뷰는 같은 `Microsite`를 공유한다.** 프리뷰용 별도 구현을 만들지 말 것.
- **계정은 게스트/로그인 이원 구조.** 비로그인도 전부 조작하고 편집은 `localStorage`에 영속하며, 로그인하면 서버 소유권을 갖고 로컬 작업을 **묻고 가져온다** → [[0007-sso-and-account-model]].
- **조용한 실패를 만들지 않는다.** 게스트가 서버 기능을 누를 때·오프라인·rate limit — 전부 **왜 안 되는지가 화면에 보여야** 한다. 서버 `error` 문구는 그대로 노출해도 되게 작성돼 있다.
- dc 프로토타입 런타임(support.js)은 React로 대체 — DCLogic의 setState 패턴을 patch 함수로 이식.

## 제약

- **채용용 포트폴리오**다. 공개 문서에 회사명을 쓰지 않고 "실무에서 관찰한 문제를 처음부터 다시 설계한 개인 프로젝트"로 서술한다.
- **무료 유지가 하드 제약.** R2 활성화에 결제 수단이 필요해 등록했고, 안전장치는 **사용량 알람 + 코드 상한**이다 — 파일당 20MB, 이벤트당 자료 60개, 고아 R2 객체는 자정 Cron이 정리.
- **브랜드·인물·기관·의약품·행사장은 전부 가상**이고 리포트 수치도 샘플이다(`샘플 데이터` 배지 유지).
- **커밋에 `Co-Authored-By: Claude` 트레일러를 넣지 않는다** — 히스토리도 심사 대상(2026-08-15 결정, 기존 커밋 2건도 재작성).

## 명령

```bash
npm run lint                  # TS/TSX 고쳤으면 최소 이것
npm run test                  # vitest 99건
npm run build                 # 라우팅·설정까지 건드렸으면 (타입 검사 포함)
npm run dev                   # 브라우저 확인
npm run db:migrate            # 로컬 D1 마이그레이션
npm run db:console -- "SQL"   # 로컬 D1 조회
npm run cf:typegen            # wrangler.jsonc 수정 후 타입 재생성
```

실패 분류: `Type error:`/`✖ N problems` = 코드 · `command not found`/`Cannot find module` = 환경(`npm install`) · `EADDRINUSE` = 기존 dev 서버. **환경 문제를 코드로 고치려 들지 말 것.**
