---
source: "FE-14 단계별 적용 계획(PR #74, 47307aa), 2026-10-19 현재 코드 의존 관계 조사"
verified: 2026-10-19
---

# 0015 — FE-14: 라우트는 유지하고 프론트엔드 내부를 단계별 FSD로 나눈다

## 상태

구현 반영·리뷰 대기 — 동일 브랜치에서 1~4단계 코드 이전과 경계 규칙을 적용했다.
로그인/업로드/실패 알림 E2E 및 동일 데이터의 전후 스크린샷 대조가 남아 있어 FE-14는 열린 상태다.
PR #74의 범위 재정의 위에 쌓는 후속 결정이며, FE-14 전체를 종료하지 않는다.

## 맥락

`EditorScreen.tsx`에는 기본정보·아젠다·자료·참여·테마 섹션이 모여 있고,
`StudioProvider.tsx`에는 인증 초기화·게스트 저장·서버 저장 큐·업로드·가져오기가,
`StudioShell.tsx`에는 내비게이션·일괄 작업·미리보기 조합이 함께 있다.
이동할 폴더 이름보다 현재 결합을 끊는 방법을 먼저 결정해야 한다.

조사 기준은 PR #74 보완 커밋 `47307aa`다. 확인한 연결은 다음과 같다.

- `app/(studio)/layout.tsx`가 Provider와 Shell을 감싼다. 콘솔·에디터 라우트는
  `useStudio()` 값을 Screen의 props로 전달하지만 Shell·AccountMenu는 Provider를 직접 읽는다.
- Shell은 `ViewerScreen`을 import하고, EditorScreen과 ViewerScreen은 `Microsite`를 공유한다.
  `app/[slug]/page.tsx`도 같은 Microsite를 사용한다. 이 공유는 유지해야 한다.
- `EventDetail`은 세션과 자료 배열을 소유한다. 이것들을 무조건 서로 다른 entity로 나누면
  같은 레이어 사이의 타입 의존이 생긴다.
- `lib/api.ts`는 HTTP 처리와 Q&A·설문·리포트·로그 API가 섞여 있다.
  `lib/studio-api.ts`도 이벤트·자료·인증·프리셋·가져오기 API가 한 파일에 있다.
- `app/api/events/route.ts`와 `app/api/events/import/route.ts`는 `lib/data.ts`의
  `autoSlug`를 쓴다. `lib/slug.ts`·`status.ts`·`event-limits.ts`도 서버와 FE가 공유한다.
  따라서 `lib/` 전체를 프론트엔드 폴더로 옮길 수 없다.

## 결정

### 1. Next 라우트와 FSD 디렉터리를 물리적으로 구분한다

루트 `app/`은 Next App Router 전용으로 유지한다. FSD 구현은 `src/frontend/` 아래 둔다.
`@fe/*` → `./src/frontend/*` alias를 추가했고 기존 `@/*`는 그대로 유지한다.
`src/frontend/app`은 FSD 조립 계층이며 Next의 `src/app`이 아니다.
`src/frontend/pages`도 Next의 루트 `pages`·`src/pages`가 아니므로 Pages Router로 쓰이지 않는다.
이 중첩 경로는 Next 이름 충돌과 서버 코드를 함께 가진 현재 저장소를 위한 프로젝트 선택이다.

적용 구조:

```text
app/                         Next 라우트·layout·metadata·API 경로 유지
lib/                         서버 구현 + 명시된 서버/FE 공용 순수 규칙 유지
src/frontend/
  app/                       providers, 라우트별 연결 컴포넌트, 전역 스타일 진입점
  pages/                     console, editor, report, participant, participant-report, intro
  widgets/                   participant-site, studio-shell
  features/                  ask-question, answer-survey, view-document,
                             edit-slug, extract-theme, account-menu
  entities/                  event, theme, account
  shared/                    ui, api, lib, config, styles
```

URL·route group·API 응답·storage key를 바꾸지 않는다. 루트 `app` 파일은 점진적으로
FSD의 app 연결 컴포넌트 또는 page의 공개 API를 호출하는 진입점으로 만든다.
현재의 `'use client'` 경계를 유지하며, 파일 이동을 이유로 루트 layout 전체를 client로 바꾸지 않는다.
`next/font/local`의 상대 폰트 경로와 공개 PDF·폰트 URL은 이동 단계에서 따로 확인한다.

### 2. Microsite와 미리보기는 하나의 widget slice를 공유한다

`Microsite`는 `widgets/participant-site/ui/Microsite.tsx`에 둔다.
참가자 탭·아젠다·자료·Q&A·설문을 조합하므로 shared나 단일 entity가 아니다.
`ViewerScreen`은 독립 URL의 page가 아니라 이 slice 안의 기기별 `DevicePreview`로 옮긴다.
Editor page와 participant page가 같은 slice의 공개 API를 사용한다.

Shell이 이 widget을 직접 import하면 서로 다른 widget 간 의존이 된다.
따라서 FSD app 계층에서 DevicePreview를 만들어 Shell의 preview slot으로 전달한다.
Shell은 preview 열림 상태와 닫기 callback을 props로 받는다.

`preview` 모드의 쓰기·로그 전송 차단, 실제 documents 전달, PDF 동적 로딩은 그대로 유지한다.
미리보기와 공개 페이지의 데이터 조회는 각 진입점에 남기고, 표시 컴포넌트를 복제하지 않는다.

### 3. Provider는 app에 두고 아래 레이어에는 props로 연결한다

Provider의 최종 위치는 `app/providers/studio/`다. 내부는 context/provider, guest-storage,
event-merge, event-save-queue, session-sync, document-upload, account-lifecycle로 책임을 나눈다.
저장 큐·ref·잠금의 소유자는 한 Provider 인스턴스로 유지한다. 화면마다 hook을 새로 만들어
동일한 저장 큐를 중복 생성하지 않는다.

`useStudio()`는 FSD app 계층의 연결 컴포넌트만 사용한다. 기존 라우트의 props 전달 방식을
확장해 Shell·AccountMenu에도 상태와 callback을 주입한다. pages/widgets/features가
상위 app의 context를 import하는 예외는 만들지 않는다.

Provider는 entities의 저수준 API를 사용한다. UI feature를 호출하지 않는다.
가져오기 변환·계정 초기화·전체 저장 조정은 app 내부에 남기고, feature는 전달받은 callback을
호출한다. 사용자·이벤트 타입은 entities, `StudioState`와 조정용 Patch 타입은 app 소유다.
하위 화면의 props는 필요한 필드와 callback을 명시하고 `StudioState` 전체를 import하지 않는다.

### 4. 파일별 목표 소유권

| 현재 파일/책임 | 최종 위치 | 이동 시 경계 |
|---|---|---|
| `components/ui/*`, `lib/ui.ts`, Logo·Reveal | `shared/ui`, `shared/config` | 상태 배지의 범용 tone과 스타일만 포함. 행사 상태 판단은 event에 둠 |
| `app/globals.css`의 디자인 토큰 | `shared/styles/tokens.css` | 전역 reset·페이지 CSS는 app/styles. 기존 CSS 로드 순서·선택자 유지 |
| `lib/font.ts` | `app/styles/font.ts` | next/font 설정은 앱 조립 계층. public 폰트 상대 경로 갱신 |
| `lib/useOnlineStatus.ts`, ThemeToggle | `shared/lib/network`, `shared/ui` | 브라우저 API 접근 시점·SSR 초기값 유지 |
| `lib/api.ts`의 오류·timeout·client token | `shared/api` | 범용 transport만. 도메인별 요청은 아래 항목으로 분리 |
| `EventItem`, `EventDetail`, `EventInfo`, `Engage`, Session·Document 타입 | `entities/event/model` | 세션·자료는 이벤트 소유 데이터로 한 slice 안에 모음. ID 참조 유지 |
| 이벤트·세션·자료·공개 조회·로그·리포트 API | `entities/event/api` | 공개용/운영자용 DTO 구분 유지. 컴포넌트 effect·선택 상태는 넣지 않음 |
| `AuthUser`, 인증 조회·로그아웃·탈퇴 요청 | `entities/account` | 전송 함수와 타입만. 게스트 복구 등 조정은 app |
| Preset, 기본 프리셋, 프리셋 API | `entities/theme` | event는 presetId만 보유하며 theme slice를 import하지 않음 |
| `lib/theme.ts`의 색 계산·Theme·표현 옵션·아이콘 패턴 | `shared/lib/theme`, `shared/config` | Preset 목록과 분리. 범용 계산은 h/c 등 값 입력으로 받음 |
| `lib/data.ts` | 소유자별 분리 | event 기본값/데모 → event, 편집 섹션 정의 → editor page, NAV → studio-shell, 리포트 샘플 → report page. autoSlug 예외는 아래 참조 |
| EditorScreen 및 5개 Section | `pages/editor/ui` 및 편집 features | Agenda·Docs·Engage는 page 내부, Basic·Theme는 해당 편집 feature가 소유 |
| ConsoleScreen·ReportScreen | `pages/console`, `pages/report` | 업무 화면과 샘플 리포트라는 기존 의미 유지 |
| `app/[slug]/page.tsx`, `app/[slug]/report/page.tsx`의 본문 | `pages/participant`, `pages/participant-report` | 루트 파일은 라우팅 진입점 유지 |
| `app/intro/page.tsx`, IntroNav·FeatureShowcase | `pages/intro` | 페이지별 export 제공. 다른 page에서 import하지 않음 |
| QaPanel·Q&A API | `features/ask-question` | 질문 조회·전송·폴링·draft 수명 유지 |
| SurveyPanel·설문 API·certificate | `features/answer-survey` | 설문 완료→수료증 유지. 에디터 인증서 미리보기는 이 feature의 공개 API 사용 |
| PdfViewer | `features/view-document` | UI와 pdf.js lifecycle. 서명 URL 재조회는 event API 사용, preview 데이터 주입 유지 |
| slug 편집·테마 추출 | `features/edit-event-details`, `features/edit-theme` | 서버 변경 함수는 entity API, 화면 상태·색 추출은 feature. 성공 적용은 callback |
| AccountMenu | `features/account-menu` | app으로부터 user/인증 상태/로그아웃·탈퇴 callback 전달 |

event의 sessions/documents를 독립 entity slice로 나누지 않는 것은 현재의 소유·저장 계약에
따른 선택이다. 독립적으로 재사용하는 도메인이 생기면 별도 ADR로 분리한다.
`Section`·`Device` 같은 page 옵션과 `Mode`·`Density` 같은 표현 옵션을 구분해 옮긴다.
혼합 `types.ts`나 `data.ts`를 이름만 바꿔 shared에 통째로 넣지 않는다.

### 5. 서버와 공용 순수 규칙은 FSD 밖에 둔다

`app/api/**`, `lib/db.ts`, `auth.ts`, `r2.ts`, `rate-limit.ts`, `rate-policy` 관련 코드,
`account.ts`, `events.ts`, `agenda.ts`, `import.ts`, `presets.ts`, `qa.ts`, `survey.ts`,
`logs.ts`, `ops.ts`, `retention.ts`, `seed.ts` 및 서버 테스트·migrations·Workers 설정은 이동하지 않는다.
FE에서 이 서버 모듈을 import하는 것은 금지한다.

다음은 **서버/FE가 함께 쓰는 순수 계약**으로 남기는 정확한 예외다.

- `lib/slug.ts`, `lib/status.ts`, `lib/event-limits.ts`: 현 위치와 정본 유지.
- `lib/data.ts`의 `venueSlug`·`autoSlug`는 2단계에서 `lib/event-slug.ts`로 추출한다.
  서버 두 라우트와 FE 호출부를 함께 바꾸고 로직은 유지한다. `uniqueSlug`는 FE event에 둔다.
- `lib/demo-sessions.ts`: 서버 seed와 FE 기본값이 공유하는 순수 데모 데이터. FE 타입을 역참조하지 않는다.

프론트엔드는 이 예외를 `entities/event/lib` adapter를 통해서만 참조한다. entity 공개 API로
내보내므로 features/pages가 루트 lib를 직접 가져오지 않는다. 단순 파일 재배치 때문에
서버와 브라우저의 검증 규칙을 복사하지 않는다. 공용 파일은 Node·Cloudflare·DOM 의존이 없어야 한다.

### 6. import 규칙과 점진적 이전

의존 방향은 app → pages → widgets → features → entities → shared다.
중간 레이어를 건너뛸 수 있지만 상향 참조 및 서로 다른 동급 slice 간 참조는 금지한다.
같은 slice 내부는 상대 import, slice 밖에서는 명시적 공개 API(`index.ts`)만 사용한다.
App·Shared 내부 segment 간 참조는 허용하되 순환 의존은 허용하지 않는다.

`export *`로 모든 파일을 노출하지 않는다. 공개 entry에 client 전용 기능과 서버용 코드를
섞지 않는다. pdf.js의 지연 로딩이 eager import로 바뀌지 않게 별도 client entry를 유지한다.

- 1단계: 새 shared는 React·외부 패키지·다른 shared만 참조한다. 옛 코드에서 새 shared를
  import하는 방향으로 바꾸고, 새 shared가 옛 components/lib를 역참조하게 하지 않는다.
- 2단계: 도메인 타입/API를 나누면서 모든 소비자를 갱신한다. 기존 경로가 필요하면 명시적
  re-export만 임시 허용하고 새 코드에서 그 경로를 쓰지 않는다. 제거 담당은 4단계다.
- 3단계: feature는 callback으로 조합한다. Provider 등 옛 app 구현이 새 feature를 조립하는
  과정에서도 feature → 옛 Provider import는 허용하지 않는다.
- 4단계: app/page/widget 조합을 완성하고 FE용 legacy 경로·임시 re-export를 제거한다.
  루트 lib는 서버 및 위 순수 계약만 남긴다.

규칙 강제는 기존 ESLint flat config에 프로젝트 전용 로컬 규칙을 추가하는 방식으로 정한다.
새 플러그인 의존성 없이 파일의 정규화된 실제 경로를 비교해 alias·상대경로 우회를 함께 잡는다.
정적 import/export, `import type`, 문자열 `import()`를 검사하고 FSD 내부의 해석 불가 동적
경로 import/require는 허용하지 않는다. root app 진입점과 서버 lib 예외를 별도로 분류한다.
`scripts/eslint/fsd-boundaries.mjs`와 테스트에서 허용/금지 fixture(상향·동급·deep import·상대 우회·server 유입·동적 import)를
테스트하며 `npm run lint`에 포함했다. 타입 전용 import/export, TS import type도 검사한다.

## 단계별 커밋과 검증

| 단계 | 제출 범위 | 완료 증거 |
|---|---|---|
| 0 | 이 ADR·과제 상태·요약·진입 링크 | 실제 import 조사, 이동 대상·예외의 경로 확인, 문서 diff 검토. 리뷰 승인 전 상태는 제안 |
| 1 | shared 추출 + Editor의 5개 섹션 파일 분리 | lint·build·기존 test, 콘솔/에디터/참가자 화면 밝음·어두움 비교. 저장 handler·ref 수명 변경 없음 |
| 2 | types/data/API 분할 + event/theme/account | lint·build·test, 로그인/게스트/목록→상세→저장→새로고침, 세션·자료·프리셋 요청 계약 유지 |
| 3 | Q&A·설문·PDF·slug·색 추출·계정 UI feature | lint·build·test, 전송 실패 안내·초안 유지·PDF 열기/닫기·미리보기의 쓰기 차단 검증 |
| 4 | Provider·Shell 조립 분리, pages/widgets 배치, 규칙 강제, 임시 경로 제거 | lint·build·test, ADR과 실제 구조 대조, 전체 운영자→참가자 흐름·SSR 경계·import 위반 0건 |

각 구현 단계에서 동일 데이터로 전후 화면을 비교한다. 최소 390px·834px과 데스크톱에서
레이아웃·탭·다크모드·키보드 포커스를 확인한다. 공개/비공개·업로드·로그아웃·재로그인·가져오기와
실패 안내도 해당 단계에서 확인한다. 승인된 테스트 계정/이벤트로 검증하며 운영 데이터에
임의로 질문·설문을 제출하거나 계정을 삭제하지 않는다. 못 한 검증은 PR에 명시한다.

리팩터 작업에서 #77 기능 추가·버그 수정, API 스펙·DB·storage key 변경은 섞지 않는다.
다만 동작 보존에 필요한 import/폰트 경로 수정은 같은 단계에서 한다. 필수 결함 수정이 먼저
필요해지면 그 fix를 별도 PR로 처리하고 이전 계획의 파일 기준을 갱신한다.

PR #74의 보완 커밋 47307aa에서 시작한 브랜치를 사용자 요청(2026-10-19)으로
`fe-14-architecture-adr`로 변경했다. 이후 1~4단계도 이 브랜치에서 이어서 작업한다.
단계별로 커밋과 검증 결과를 구분하며, 단계마다 새 브랜치나 PR을 만들지 않는다.
이는 PR #74에서 정한 단계별 별도 PR 방식에 대한 사용자 요청에 따른 변경이다.
ADR은 현재 구현 계획으로 사용하고 리뷰 의견이 오면 후속 구현에도 반영한다.

원격 head 브랜치 이름 변경으로 GitHub가 기존 draft PR #78을 자동으로 닫았다.
변경된 브랜치로 대체 draft PR을 열고, #74가 미병합인 동안에는 선행 문서 변경도
main 대비 diff에 포함됨을 표시한다. #74 병합 후 diff를 다시 확인한다.
최종 머지는 담당자가 수행한다.

## 구현 상세와 검증 (2026-10-19)

- BasicSection 전체를 `edit-event-details`, ThemeSection 전체를 `edit-theme`에 배치했다. slug/색 추출만 떼어 상위 page의 상태를 다시 참조하는 대신 좁은 props와 callback으로 연결한다.
- Provider는 `useEventSaveQueue`, `useSessionSync`, `useAccountActions`, `useDocumentUpload`와 guest-storage/event-merge/document-meta/initial-state로 나눴다. ref와 잠금은 Provider당 한 인스턴스이며 기존 저장 계약을 유지한다.
- Shell의 상태·공개·일괄 작업은 `model/useStudioShell.ts`, 렌더링은 UI에 두었다. `StudioFrame`이 계정 메뉴와 미리보기를 slot으로 조립한다.
- event/theme/account 및 각 화면·feature/widget은 명시적 index 공개 API를 사용한다. PDF는 `features/view-document/client.ts`를 통한 동적 로딩을 유지한다.
- 소개와 리포트가 함께 사용하는 가상 지표 METRICS는 `entities/event/model/sample-metrics.ts`가 소유한다. OPS는 리포트 내부에 둔다. 루트 `/`는 기존 redirect만 유지하고, 소개 페이지 metadata를 라우트에서 다시 export한다.
- CSS는 shared 토큰 → app/styles/globals.css 순서로 로딩한다. shared의 savedColor/phasePillStyle은 문구 톤·표현 스타일만 다루며 행사 시점 계산은 event 규칙에 둔다.
- build 및 앱 소스 lint 통과, 테스트 171건 통과(기존 135 + 경계 검사 36). 정적 import/export 그래프 92개 FE 파일의 순환 0건.
- 브라우저: 게스트 콘솔→에디터, 기본정보 수정→새로고침 복원→원복, 자료 업로드의 게스트 비활성, 모바일 390/태블릿 834 미리보기, 다크/라이트 전환, Q&A·설문 미리보기 전송 제한, 소개 페이지 title 확인.
- 한계: 승인된 로그인 테스트 세션이 없어 서버 저장·발행·업로드·가져오기·탈퇴 및 전송 실패 알림 E2E는 미검증. PDF 실파일 열기/닫기와 전후 동일 데이터 스크린샷 대조도 남았다. 위 확인을 전체 사용자 흐름 완료로 간주하지 않는다. PR #79는 draft로 유지한다.

## 대안과 트레이드오프

- 루트 `app`/`pages`에 FSD를 그대로 배치: Next 라우팅과 이름이 겹치므로 선택하지 않는다.
- 루트 app을 `src/app`으로 전부 이동: API·asset·slug 경로 검사까지 변경 범위를 넓혀 현재 목적에 불필요하다.
- Provider를 shared에 두기: 행사·계정·저장 조정 책임이 shared로 내려가므로 선택하지 않는다.
- 하위 화면에서 app Provider import 허용: 순환·상향 의존을 규칙의 예외로 고착하므로 props 연결을 택한다.
- Microsite를 복제하거나 shared에 넣기: 프리뷰=실물 공유를 깨거나 도메인 feature가 shared로 유입된다.
- 모든 세션·자료를 독립 slice로 만들기: 현재 event aggregate의 참조가 cross-import 예외로 늘어난다.
- 즉시 모든 파일 이동: 동작 회귀의 원인 추적이 어려우므로 단계별 커밋과 검증을 유지한다.

대신 app 연결 컴포넌트와 props가 늘고, 상대 폰트 경로·import를 손보는 비용이 든다.
FSD 적용 자체가 #77의 오작동을 해결하지는 않는다. 이 작업의 결과는 책임 경계와 검증 가능한
의존 규칙이며, 사용자 기능 개선은 별도 과제로 추적한다.

## 재검토 트리거

- callback 전달이 여러 화면에서 같은 조합을 반복하거나 Provider 조정 코드가 다시 한 파일에 모일 때.
- 세션·자료가 이벤트 밖에서도 독립적으로 편집·재사용될 때.
- 서버 공용 규칙의 예외 목록이 늘거나 클라이언트에 서버 모듈이 유입될 때.
- 프리뷰/실물의 표시 구현을 복제해야 한다는 요구가 생길 때.
- Next 업그레이드 또는 새 빌드 도구가 중첩 폴더/alias를 다르게 해석할 때.

## 확인 근거

- 저장소: `components/{StudioProvider,StudioShell,Microsite,AccountMenu}.tsx`,
  `components/screens/*`, `lib/{types,data,api,studio-api,theme,slug,status,event-limits}.ts`,
  `app/(studio)/layout.tsx`, `app/layout.tsx`, `tsconfig.json`, `eslint.config.mjs`.
- 설치된 Next 16.3.1 문서: `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`,
  `05-server-and-client-components.md`(같은 디렉터리).
- [FSD Layers](https://feature-sliced.design/docs/reference/layers): 레이어 방향과 동급 slice 격리 원칙.
- [FSD Public API](https://feature-sliced.design/docs/reference/public-api): slice 진입점과 내부 구현 경계.
- [FSD + Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs): 라우터와 FSD 디렉터리 구분 참고.
  `src/frontend/` 중첩은 이 저장소의 선택이며 공식 예제 경로를 그대로 적용한 것은 아니다.
