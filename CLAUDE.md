@AGENTS.md

---

# LLM-WIKI 연동 규칙 (repo 내장 모드)

이 프로젝트의 **정본(설계 결정·ADR·측정 결과·과제·로그)은 repo 안의 `llm-wiki/`다.** 코드와 함께 버전 관리되고 함께 커밋된다.

- **세션 시작**: SessionStart 훅이 `llm-wiki/`의 최근 로그·열린 과제를 자동 주입한다. 상세가 필요하면 `llm-wiki/index.md`부터 진입한다(전체를 읽지 않는다).
- **세션 종료 전**: 의미 있는 작업을 했으면 `llm-wiki/log.md` 오늘 날짜 섹션(`## YYYY-MM-DD`)에 `- **제목**: 내용` 형식으로 기록한다. 코드 변경이 있는데 오늘 기록이 없으면 Stop 훅이 경고한다. 커밋은 코드와 함께 한다.
- **과제 관리**: 새 과제는 `llm-wiki/Next-Tasks.md`의 `## 열린 과제` 아래 `### N. 제목` + `무엇 → 왜 → 완료 기준`으로 추가하고, 종료되면 종료 기록 표로 옮긴다. (제목 형식은 훅이 파싱하는 계약이다.)
- **설계 결정**: ADR은 `llm-wiki/Decisions/NNNN-*.md`로 남긴다.

---

# 이 저장소의 검증 단계

공식 검증 입구는 아직 없다. 현재는 아래 두 명령이 전부이며, 우회 실행(예: `npx tsc` 단독, `next build` 직접 호출) 대신 npm 스크립트를 쓴다.

| 변경한 곳 | 1차로 돌릴 것 | 비고 |
| --- | --- | --- |
| 컴포넌트·lib 등 모든 TS/TSX | `npm run lint` | eslint(next 프리셋). 빠름 |
| 위와 동일 + 라우팅·설정(`next.config.ts`, `app/`) | `npm run build` | Turbopack 빌드 + TypeScript 검사 포함 |
| UI 동작(화면 전환·드래그·프리뷰) | `npm run dev` 후 브라우저 확인 | 자동 테스트 없음(수동). 테스트 도입은 열린 과제 |

실패 시 원인 분류 (실측 기준):

| 출력의 첫 토큰/패턴 | 분류 | 대응 |
| --- | --- | --- |
| `Type error:` (build 중) | 코드 문제 | 타입 수정 |
| `✖ N problems` (lint) | 코드 문제 | 규칙 위반 수정 |
| `sh: next: command not found` / `Cannot find module` | 환경 문제 | `npm install` — 코드로 고치려 들지 말 것 |
| `EADDRINUSE` (dev) | 환경 문제 | 기존 dev 서버(:3000) 종료 후 재시도 |
