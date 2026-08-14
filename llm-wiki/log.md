# sympo-studio — Log

이 프로젝트의 시간순 기억. 최신이 위로.

> **형식 계약 (훅이 파싱한다)**: 날짜 섹션은 `## YYYY-MM-DD`, 항목은 `- **제목**: 내용`.
> 코드 repo의 SessionStart 훅이 최신 섹션의 **제목**들만 추출해 세션에 주입한다.
> 제목은 주입만 보고도 무슨 일이 있었는지 알 수 있게 쓴다.

## 2026-08-15
- **가상 데이터 전환**: 포트폴리오 공개를 위해 실존으로 보이는 의료인·소속기관·의약품·행사장 데이터를 전부 가상 세트로 교체. `lib/data.ts` 외에 `Microsite.tsx`(FILES·fallback), `StudioApp.tsx`(INITIAL), `ReportScreen.tsx`(하드코딩 문자열)에 흩어져 있던 것까지 정리. lint·build 통과. **커밋 aa065d4의 diff에 원본이 남아 있어 새 리포지토리 이전 필요**(→ Next-Tasks).
- **방향 전환 — 포트폴리오용 무료 영구 배포**: 전 직장 담당 프로젝트를 포트폴리오로 마이그레이션하는 것이 목표. "오랫동안 무료"의 적은 비용이 아니라 무료 티어 정책 변경·비활성 pause라고 판단 → 런타임 의존성 0(정적 export + Cloudflare/GitHub Pages + localStorage) 방향으로 결정. DB·Auth·Realtime은 도입하지 않음.
- **하네스 설치**: LLM-WIKI 하네스 보일러플레이트로 프로젝트 위키 초기화(repo 내장 모드). CLAUDE.md에 연동 규칙·검증 단계 병합.
- **SYMPO STUDIO 초기 구현**: claude.ai/design 프로토타입(콘솔·에디터·뷰어·리포트 + Microsite)을 Next.js 16 + TS로 구현. 빌드·브라우저 검증 통과. GitHub public repo 생성·푸시.
