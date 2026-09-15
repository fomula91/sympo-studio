# 인트로 페이지 재설계 — 체크리스트

무료 템플릿 섹션(Hero 01 / Features 01 / Features 03 / Feature 04)의 구조를 참고해
`app/intro/page.tsx`를 7개 섹션으로 재구성한다. 대상 파일은 `app/intro/page.tsx` 하나이고,
나머지 앱(콘솔·에디터·뷰어·리포트)의 전역 디자인 토큰은 건드리지 않는다.

## 0. 준비
- [x] 인트로 전용 CSS 변수 정의 (`app/globals.css`에 `--intro-*` 신규 블록, 라이트/다크) — 기존 `--brand` 등 전역 토큰은 유지
- [x] 새 폰트 크기·간격 상수는 `app/intro/page.tsx` 내부 상수로만 정의 (다른 화면에 영향 없음)

## 1. 섹션 1 — 제품 소개 (Hero 01)
- [x] 새 히어로 카피 적용 (사용자 제공 문구 그대로)
- [x] CTA 두 개(데모 열기 / 설계 과정 보기) — "설계 과정 보기"는 `#problem`(3번 섹션)으로 스크롤
- [x] 큰 제품 화면: `editor.png`를 브라우저 크롬 프레임 안에 배치 (결정 4 — console.png에서 변경)
- [x] 배경 효과를 옅은 청록 계열로 교체 (신규 추가)

## 2. 섹션 2 — 제품 둘러보기 (Features 01)
- [x] 왼쪽 기능 목록(콘솔/에디터/뷰어/리포트) + 오른쪽 스크린샷을 클릭으로 전환하는 `FeatureShowcase` 클라이언트 컴포넌트 신설
- [x] 스크린샷 4종은 기존 `public/screens/*.png` 재사용 (신규 캡처 없음)

## 3. 섹션 3 — 현장의 문제와 설계 판단
- [x] 기존 `DESIGN_ROWS`(7건) 중 대표성 있는 3건 선정(행사 식별·아젠다·프리뷰) — 결정 3
- [x] 프리뷰 카드는 Feature 04 스타일로 2열 병합(`gridColumn: span 2`)

## 4. 섹션 4 — 참가자 경험 (Features 03)
- [x] 기존 `viewer.png`를 메인 비주얼로 재사용
- [x] 3단계는 번호 텍스트 스텝으로 설명 (결정 2 — 신규 스크린샷 캡처는 범위 제외)

## 5. 섹션 5 — 라이트·다크와 브랜드 테마
- [x] 기존 `ThemeToggle` 재사용 + 라이트/다크 나란히 보여주는 `ThemeSample` 카드 신설
- [x] 브랜드 테마 프리셋 스와치 4개 예시 (하드코딩 값, "장식용 예시" 문구 명시)

## 6. 섹션 6 — 구현 범위·기술 선택
- [x] 기존 "기술 선택"·"한계" 섹션을 하나로 압축
- [x] 구현됨 / 미구현 / 미검증 3분류로 재정리

## 7. 섹션 7 — 데모 CTA·푸터
- [x] 기존 CTA·푸터 컴포넌트 그대로, 새 토큰만 적용

## 마무리 (1차)
- [x] `npm run lint` 통과 (worktree에 `node_modules` 심볼릭 링크 후 재실행)
- [x] `npm run build` 통과 (`/intro` 정적 프리렌더 확인)
- [x] `npm run dev`로 라이트/다크 전환, `FeatureShowcase` 탭 전환 브라우저 실측 확인
- [x] 모바일 폭 확인 — `resize_window`가 실제 뷰포트에 반영 안 돼 iframe으로 직접 폭을 바꿔가며 360~1920px 스윕, 가로 스크롤 없음 확인. 이 과정에서 "현장의 문제" 하이라이트 카드의 `gridColumn: span 2`가 좁은 화면에서 오버플로우를 만드는 실제 버그를 찾아 미디어쿼리(`min-width:700px`)로 수정 (context-notes 참조)
- [x] `llm-wiki/log.md` 오늘 날짜에 `[FE]` 기록
- [x] 커밋 + PR (#44)

## 8. `/code-review` 반영 (PR #44 리뷰 1)
- [x] `.compare-highlight` 브레이크포인트를 700px→704px로 정정 (그리드가 실제로 2열이 되는 지점과 어긋나 있었음)
- [x] `FeatureShowcase`가 선택된 이미지 1장만 DOM에 넣던 것을 4장 전부 렌더 + `display` 전환으로 변경(no-JS·크롤러 콘텐츠 누락 해결), `!important` 제거
- [x] `ThemeSample` 하드코딩 hex ↔ `globals.css --intro-*` 상호 참조 주석 추가
- [x] `sectionStyle`·`cardBase`·`ctaBtn`·`ghostLink`·`ScopeColumn`의 불필요한 `Tokens` 매개변수 제거(모듈 상수로 복귀)

## 9. 디자인·FE 리뷰 반영 (사용자 2차 리뷰)
- [x] 모바일 헤더 CTA 줄바꿈 버그 수정 — `.intro-header`(패딩/간격) + `.intro-header-cta`(flex-shrink:0, nowrap), 480px 이하에서 패딩·간격 축소
- [x] "제품 둘러보기"를 1024px 이하에서 가로 탭 + 전체 폭 화면으로 전환 (768px에서 화면이 358px로 쪼그라들던 문제)
- [x] "참가자 경험" 3단계를 실제 화면 캡처 3장으로 교체 — 스튜디오 에디터 라이브 프리뷰(아젠다·강의자료 PDF 뷰어)와 실제 참가자 페이지(Q&A 폼)를 직접 캡처해 `sharp`로 3:4 크롭. 상세 경위는 context-notes 참조
- [x] `FeatureShowcase` 탭에 `aria-pressed`·`aria-controls` 추가(보조기기 접근성)
- [x] "구현 범위·기술 선택" 3열 레이아웃에서 라벨+설명 좌우 배치를 제목-위/설명-아래로 변경(1024px에서 열 폭이 좁아 문장이 과도하게 끊기던 문제), 이제 안 쓰는 `.intro-limit-row` CSS 제거
- [x] 전체 본문 카피 톤을 "-다" 종결의 건조한 문장에서 "-어요/-해요" 위주의 부드러운 톤으로 조정(사용자 요청) — 헤더 히어로 문구(사용자가 직접 준 문구)는 그대로 유지
- [x] `npm run lint`·`build` 통과, 헤더 고정(390px)·기술 섹션 열 폭(1024px)·참가자 경험 이미지 브라우저 재확인
