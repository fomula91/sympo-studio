# FE-5 리포트 실측 뷰 — Codex CLI × Claude 교차 검증

- 검토일: 2026-09-03
- 대상: `fe-5-report-real-data` vs `origin/main` ([PR #20](https://github.com/fomula91/sympo-studio/pull/20))
- 구성: ① 이 세션이 직접 돌린 Codex CLI(`codex review --base origin/main -c model="codex-auto-review"`) ② 이 세션이 직접 돌린 Claude 멀티에이전트 `/code-review`

## Codex CLI

지적 없음 — "타입 안전하고 기존 API 계약·문서화된 범위와 일치한다. 확정적인 회귀는 발견되지 않았다." 리뷰 도중 Codex 자체 sandbox에서 `npm test`가 `spawn EPERM`으로 한 번 실패했는데, Windows 프로세스 스폰 권한 문제(환경 이슈)지 코드 문제가 아니며 Codex의 최종 판정에는 영향 없었다.

## Claude `/code-review` — 2건, 둘 다 반영

### 1. 네트워크 순단 시 자동 복구 경로가 없음 — 수정함

`app/[slug]/page.tsx`(참가자 페이지)는 교차 리뷰(C1, [[Reviews/2026-09-02-pr9-final-review]])로 "오프라인 진입 시 완전히 하얗게 죽는다"가 지적돼 `localStorage` 캐시 + `online` 이벤트 자동 재요청을 갖췄는데, 이 리포트 페이지는 같은 패턴 없이 수동 "다시 시도" 버튼뿐이었다. 행사장 백스테이지처럼 와이파이가 불안정한 곳에서 열어둘 가능성이 있는 화면이라 지적이 타당하다고 판단.

**수정**: `online` 이벤트 리스너를 추가해 네트워크가 복구되면 자동으로 다시 받아온다. 다만 이 페이지는 폴링이 아니라 마운트 시 1회 로드라 "마지막 성공 응답을 보여주며 진행"할 상태 자체가 없다 — 그래서 참가자 페이지의 `localStorage` 캐시까지는 옮기지 않고 자동 재시도만 추가했다(완전한 오프라인 폴백보다 가벼운 조치가 이 화면의 실제 사용 패턴에 맞다고 판단).

### 2. `capacity` 미설정 시 세션 막대 너비가 라벨과 다른 척도로 계산됨 — 수정함

`capacity`가 없으면 막대 너비를 `visitors * 20`(임의 계수)로 clamp해 그렸는데, 옆의 라벨은 방문자 수 그대로("5명"·"6명")를 보여준다. 방문자 5명과 6명이 둘 다 막대 100%로 clamp되면서 "거의 꽉 찼다"는 인상을 주는데 라벨은 그렇지 않다는 모순이 생긴다.

**수정**: capacity가 없을 때는 이 이벤트의 세션 중 최다 방문자 수를 100%로 놓는 상대 막대로 바꿨다(`barWidth()`) — 막대 길이와 라벨이 같은 척도(이 이벤트 내 상대 비교)를 쓰게 됐다.

## 정리

`npm run lint`·`test`(12건)·`build` 전부 통과, 두 지적 모두 반영 완료.
