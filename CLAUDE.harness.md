# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Context Economy

**The cheapest token is the one you never send. Context is billed per turn, not per session.**

- Name the target files up front. Don't survey the repo when the task already names its scope.
- Read ranges, not files: locate with `grep -n`, then read the surrounding block.
- Keep tool output small: quiet flags on test/install commands, `git diff --stat` before a full diff, `tail`/`grep` on logs.
- One logical task per session; `/compact` or `/clear` before starting the next one.
- Send cheap work (commit messages, summaries, mechanical renames) to a cheaper model.

Everything that stays in this file is re-sent on every turn — keep detail in the wiki and link to it.

---

---

# LLM-WIKI 연동 규칙 (repo 내장 모드)

이 프로젝트의 **정본(설계 결정·ADR·측정 결과·과제·로그)은 repo 안의 `llm-wiki/`다.** 코드와 함께 버전 관리되고 함께 커밋된다.

- **세션 시작**: SessionStart 훅이 `llm-wiki/`의 최근 로그·열린 과제를 자동 주입한다. 상세가 필요하면 `llm-wiki/index.md`부터 진입한다(전체를 읽지 않는다).
- **세션 종료 전**: 의미 있는 작업을 했으면 `llm-wiki/log.md` 오늘 날짜 섹션(`## YYYY-MM-DD`)에 `- **제목**: 내용` 형식으로 기록한다. 제목은 한 줄로 압축한다 — 최신 섹션 제목이 다음 세션의 매 턴에 주입된다. 코드 변경이 있는데 오늘 기록이 없으면 Stop 훅이 경고한다. 커밋은 코드와 함께 한다.
- **과제 관리**: 새 과제는 `llm-wiki/Next-Tasks.md`의 `## 열린 과제` 아래 `### N. 제목` + `무엇 → 왜 → 완료 기준`으로 추가하고, 종료되면 종료 기록 표로 옮긴다. (제목 형식은 훅이 파싱하는 계약이다.)
- **설계 결정**: ADR은 `llm-wiki/Decisions/NNNN-*.md`로 남긴다.

---

# 이 저장소의 검증 단계 (프로젝트별로 작성)

> **TODO(프로젝트별)**: 아래 표를 채워라 — 하네스의 절반이다.
> 목적은 "무엇을 돌릴지 추측하지 말고 표를 따른다".
>
> 1. **공식 검증 입구** 하나(`pnpm verify` 등)를 정한다. 우회 실행 금지.
>    조용한 모드로 돌리고 실패했을 때만 상세를 본다.
> 2. **변경 종류 → 실행할 검증** 표 — 빠르고 결정적인 것부터.
> 3. **실패 원인 분류** 표 — 출력 첫 토큰으로 환경 문제와 코드 문제를 가른다.
>
> 문구는 실측으로 쓴다: 실제로 실패시켜 보고 그 출력을 기준으로 적는다.

| 변경한 곳 | 1차로 돌릴 것 | 비고 |
| --- | --- | --- |
| (예: 도메인 로직) | (예: 단위 테스트) | |
| (예: 라우트/미들웨어) | (예: 라우트 테스트) | |
| (예: 의존성·CI) | (예: 공식 검증 입구 전체) | |
