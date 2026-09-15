# sympo-studio — Index

진입 지도. **전체를 읽지 말고 여기서 필요한 곳으로 간다.**

이 위키는 **독자에 따라 두 층**으로 나뉜다.

| 층 | 누구 | 어떻게 쓰였나 |
|---|---|---|
| **요약층** `Summaries/` | 사람 | 짧고 쉬운 문장. 읽고 바로 판단·착수할 수 있게 |
| **정본층** 나머지 | 에이전트 | 간결하지만 고밀도. 근거·수치·함정까지 |

---

## 사람이 읽는 것

| 문서 | 언제 |
|---|---|
| **[[Summaries/Status]]** | **여기부터.** 지금 무엇이 되고 무엇이 안 되는가 (30초) |
| **[[Summaries/Next]]** | 다음에 뭘 할지 정하고 싶을 때 (1분) |
| [[Summaries/History]] | 무슨 일이 있었는지 훑고 싶을 때 |
| [[Onboarding-FE]] | **프론트엔드 담당자는 여기부터.** 규칙·환경·검증 |
| [[field-experience]] | **문제 정의의 정본.** 무엇을 겪었고 무엇을 안 겪었는가 |
| [[design]] | 디자인 컨셉 (색·타이포·반응형·컴포넌트 패턴) |

## 에이전트가 읽는 것

| 문서 | 무엇 |
|---|---|
| **[[Context]]** | **우선 읽기.** 제품·스택·디렉터리·API·반복해서 밟은 지뢰 |
| **[[Next-Tasks]]** | **과제 정본.** Next-Task(핫픽스·차단·필수) + FE/BE 백로그 |
| [[API-Guide-FE]] | 엔드포인트·에러 규약·rate limit 정본 |
| [[log]] | 최근 작업 기록 (최신 3개 날짜) |
| [[OpenQuestions]] | 미결정·미검증 질문 |

### 과제와 Next-Task

```
과제 = 앞으로 할 일 전체        → Next-Tasks.md
└── Next-Task = 먼저 할 것      → 핫픽스 · 차단 · 필수
```

## 아카이브 (원문 보존, 평소엔 안 연다)

- [[Archive/Closed-Tasks]] — 종료한 과제 36건
- [[Archive/log-2026-09]] · [[Archive/log-2026-08]] — 과거 작업 로그 16일치

## Decisions (ADR)

되돌리기 비싼 판단. **전부 읽지 말고 과제에 링크로 걸린 것만** 본다.

| # | 결정 |
|---|---|
| [[0001-backend-for-working-demo]] | 정적 전용을 버리고 실제 동작하는 백엔드를 붙인다 |
| [[0002-cloudflare-free-tier-stack]] | Cloudflare 단일 벤더 + "저장·조회는 서버, 렌더링·생성은 클라이언트" |
| [[0003-next-tasks-fe-be-split]] | 과제를 FE/BE 두 섹션으로 나눈다 (훅 파싱 계약 포함) |
| [[0004-problem-redefinition]] | 문제 정의를 실무 경험 기준으로 재정립, 관찰과 가설을 갈라 쓴다 |
| [[0005-d1-schema]] | D1 스키마 — 회차 고유성·프리셋 축적·문항 단위 설문 |
| [[0006-rate-limit-key]] | rate limit 키 — 브라우저 토큰 버킷 + IP 총량 상한의 2층 |
| [[0007-sso-and-account-model]] | Google SSO + 개인 계정 소유권 (게스트 경로 유지, 0001 개정) |
| [[0008-rate-limit-counter]] | rate limit 판정을 (키, 창) 카운터로 (0006 부분 개정) |
| [[0009-event-status-axes]] | 이벤트 상태를 발행 상태·행사 시점 두 축으로 |
| [[0010-account-link-key]] | 계정 연결 키는 `oauth_accounts` 하나, 이메일은 식별자가 아니다 (0007 부분 개정) |
| [[0011-upload-admission]] | 업로드 한도를 예약으로 판정 (0008의 증가 시점을 업로드에 한해 개정) |

## Reviews

- [[Reviews/2026-09-01-codex-fe-qa]] — Codex FE 리뷰: Q&A 연결
- [[Reviews/2026-09-02-codex-branch-review]] — Codex 브랜치 리뷰: Q&A·미리보기·수료증 PDF
- [[Reviews/2026-09-02-pr9-final-review]] — PR #9 최종: Codex CLI × Claude 교차 검증
- [[Reviews/2026-09-03-fe5-cross-review]] — FE-5 리포트 실측 뷰 교차 검증
