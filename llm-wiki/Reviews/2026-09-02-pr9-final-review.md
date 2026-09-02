# PR #9 최종 코드리뷰 — Codex CLI × Claude 교차 검증

- 검토일: 2026-09-02
- 대상: `chore/claude-local-role-notes`(PR #9) vs `origin/main`
- 구성: ① 이 세션이 직접 돌린 Codex CLI(`codex review --base origin/main`) ② 이 세션이 직접 돌린 Claude 멀티에이전트 `/code-review` ③ 팀원이 별도로 돌린 Codex(GPT-5.4) × Claude 교차 리뷰(신규 작업분 대상)
- 관련 문서: [[Reviews/2026-09-01-codex-fe-qa]], [[Reviews/2026-09-02-codex-branch-review]] — 이번 리뷰는 그 위에서 새로 나온 것만 다룬다(딥링크 `notFound()`, `toGamut` 감이 클램핑, 게이트 버튼 `disabled`+사유, 미리보기 `preview` prop, 수료증 `fitLine` 등 이전 라운드 지적은 이미 코드로 닫힌 것을 팀원이 재확인함)

## 실행 메모

Codex CLI는 이 머신에 설치돼 있지 않아 `npx -y @openai/codex`로 받았다. 기본 모델(`gpt-5.2`, `~/.codex/config.toml`)이 이 계정(ChatGPT 로그인)에서 지원 안 돼 400 에러로 실패 — `~/.codex/models_cache.json`에서 확인한 `codex-auto-review` 모델로 재시도해 성공했다. `npx -y codex`(스코프 없는 패키지명)는 전혀 다른 오래된 정적 사이트 생성기라 혼동 주의.

## 교차 확인 — 양쪽이 독립적으로 발견 (2건, 머지 전 처리 권장)

### C1. `/[slug]`가 네트워크 실패에서 회복되지 않는다

FE-9는 "아젠다·자료는 로컬 state라 오프라인에도 계속 보임"을 완료 근거로 삼았는데, 같은 PR의 FE-3이 `/[slug]`를 실제 `fetch`로 바꾸며 그 전제를 깼다. 오프라인 진입·새로고침 시 아젠다·자료가 통째로 사라지고, 연결이 복구돼도 수동 새로고침 전까진 죽어 있었다(초기 호출이 slug 변경 시 1회뿐, 재시도·backoff·`online` 이벤트 재호출 없음).

**수정**: `app/[slug]/page.tsx` — 성공 응답을 `localStorage`에 캐시하고, fetch 실패 시 캐시가 있으면 "오프라인 — 마지막으로 불러온 정보" 배너와 함께 그대로 렌더(완전히 죽지 않음). `window.addEventListener('online', ...)`로 네트워크 복구 시 자동 재요청. 에러 화면에 수동 "다시 시도" 버튼도 추가.

### C2. 멈춘 요청 하나가 Q&A 폴링 전체를 영구 차단한다

`QaPanel`의 `inFlight` ref가 폴링 간 공유되는데, `lib/api.ts`의 `fetch`에 timeout이나 `AbortSignal`이 없어 요청이 pending으로 매달리면 `inFlight`가 영원히 `true`로 남는다. Claude는 처음 "최대 4초 공백"(P3)으로 봤으나, 응답이 아예 안 오면 이후 모든 폴링이 즉시 반환되고 오프라인→온라인 복귀로 effect가 재실행돼도 복구되지 않는다 — Codex의 P2 판정이 맞다.

**수정**: `lib/api.ts`에 `fetchWithTimeout`(8초, `AbortController`) 추가해 `fetchQuestions`·`postQuestion` 모두 적용. 요청이 응답을 못 받아도 8초 안에 반드시 실패로 정리돼 `inFlight`가 리셋된다.

## Codex 단독 (3건) — 코드로 재검증함

### X1. 비공개로 전환한 행사에도 질문·설문을 계속 기록할 수 있다 — BE, 머지 안 막음

`questions`·`survey` 라우트가 `engage_qa`/`engage_survey`만 보고 이벤트 상태(공개예정·진행중·완료 vs 초안·보관)를 안 본다 — `survey/summary`도 마찬가지. 대조군인 `app/api/public/[slug]/route.ts`는 이미 `PUBLIC_STATUSES`로 이 원칙을 지킨다. PR #9가 만든 결함이 아니라 BE-3·BE-4가 원래 갖고 있던 것 — **BE-18**로 등록, 코드는 손대지 않음.

### X2. 대비비 게이트가 실제 키비주얼 위 텍스트는 검사하지 않는다 — P2, 범위 결정 필요

게이트는 브랜드 프리셋 색으로 합성한 배경만 검사하는데, 실제 렌더는 임의의 업로드 이미지 위에 반투명 그라디언트 + 흰 라벨이다. 흰 이미지를 올리면 게이트는 통과인데 실제 대비는 크게 떨어질 수 있다. 실제로 고치려면(이미지 픽셀 샘플링 + 오버레이 합성) 상당한 작업이라 **FE-18**로 등록만 하고 이번엔 손대지 않음 — 범위(실제 검사 vs 한계 문서화)부터 결정 필요.

### X3. 수료증 문자열 처리가 서로게이트 쌍을 자르고 무제한 입력에서 느려질 수 있다 — 수정함

`certificate.ts`의 파일명 자르기(`slice(0,60)`)가 UTF-16 코드 유닛 기준이라 이모지 등 서로게이트 쌍을 반으로 잘랐고, 행사명 입력 필드에 길이 제한이 없어 극단적으로 긴 입력이 들어오면 폭 재계산 루프가 느려질 수 있었다.

**수정**: 파일명 자르기를 `Array.from()` 코드 포인트 단위로 교체. `EditorScreen.tsx`의 기본 정보 입력(제목·일시·장소·좌장·인원)에 `maxLength={200}` 추가해 애초에 극단적인 입력이 안 들어오게 막음.

## Claude 단독 (5건 + 1건 자체 발견)

### Y0(자체 발견). `patchEvent`의 slug 재계산이 유일성 검사를 안 함 — Codex CLI 리뷰가 잡음, 수정함

`StudioProvider.tsx`의 `patchEvent`가 title/venue/date 변경 시 `autoSlug`로 slug를 재계산하는데(2026-09-01에 이 세션이 추가), 기존 이벤트들과 충돌 검사를 안 했다. 새 이벤트 생성 시에는 `uniqueSlug()`를 쓰면서 편집 시에는 빠뜨렸다.

**수정**: 편집 시에도 다른 이벤트들의 slug를 제외 목록으로 넘겨 `uniqueSlug()`를 통과시키도록 교체 — 생성·편집 두 경로가 같은 규칙을 쓴다.

### Y1. Q&A 폴링에 탭 비가시 정지가 없다 — 수정함, 무료 티어 직결

`setInterval(load, 4000)`이 탭이 백그라운드여도 계속 돈다. 참가자 1명이 탭을 열어두면 하루 21,600 요청 — BE-8이 막으려던 시나리오를 FE-3이 실제로 만들었다.

**수정**: `document.hidden`이면 폴링을 건너뛰고, `visibilitychange`로 다시 보일 때 즉시 한 번 갱신.

### Y2. 커스텀 프리셋이 참가자 화면에 전달되지 않는다 — BE-17과 동일 건, 기존 등록 유지

이미 이 세션이 BE-17로 등록해둔 것과 같은 문제(`presetId` 문자열만 있고 `{hue, chroma}`가 없음). 새로 등록하지 않음.

### Y3. `keyVisual`에 blob URL을 저장하고 revoke 안 함 — 부분 수정

`URL.createObjectURL(f)` 후 이전 URL을 revoke 안 해 교체·초기화마다 누수됐다. **수정**: 교체·비우기 세 지점 모두 이전 blob URL을 `revokeObjectURL`. 다만 "blob URL 자체가 서버에 저장 불가능하다"는 더 큰 구조적 문제는 **FE-19**로 등록만(BE-1 CRUD 연결 전까지 잠복 상태).

### Y4. `getClientToken()`이 storage 접근을 try/catch 없이 함 — 수정함

프라이빗 모드 등 storage가 막힌 브라우저에서 예외가 그대로 던져져 "전송에 실패했습니다"로만 끝났다. **수정**: try/catch로 감싸 실패 시 메모리 전용 토큰으로 폴백(그 세션 동안은 IP 버킷으로 강등되지만 최소한 동작은 한다).

### Y5. `qaDisabled`가 단방향이고 일일 한도도 60초 후 재활성화됨 — 수정함

한 번 403을 받으면 리마운트 전까지 폼 자체가 안 보였고, 일일 한도(429)도 60초 뒤 버튼이 되살아나 곧바로 다시 실패했다. **수정**: 비활성 안내에 "다시 시도" 버튼 추가(폼을 다시 보여줌). 429 메시지에 "오늘"이 포함되면(일일 한도) 60초 자동 재활성화를 안 함 — 거짓 희망을 주지 않는다.

## 정리

| 분류 | 건수 | 처리 |
|---|---|---|
| 교차 확인(C1·C2) | 2 | 전부 수정 |
| Codex 단독(X1~X3) | 3 | X3 수정, X1·X2는 BE-18·FE-18 등록 |
| Claude 단독(Y0~Y5) | 6 | Y0·Y1·Y3(부분)·Y4·Y5 수정, Y2는 BE-17과 동일 건 |

**아직 안 고친 것**: FE-18(대비비 게이트가 실제 이미지 대비 미검사, 범위 결정 필요), FE-19(keyVisual blob URL 구조적 한계), BE-18(Q&A·설문 라우트 이벤트 상태 미검사, 팀원 판단 필요).

`npm run lint`·`npm run test`(12건)·`npm run build` 전부 통과(빌드는 `.next` 캐시 문제로 한 번 실패했다가 캐시 삭제 후 통과 — 코드 문제 아님).
