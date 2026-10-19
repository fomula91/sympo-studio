import { CAPACITY_MAX_DIGITS, EVENT_TEXT_MAX } from "@fe/entities/event";


// `type`·`inputMode`·`maxLength`는 모든 항목에 명시한다(값이 없으면 `undefined`) —
// 일부만 갖고 있으면 소비하는 쪽(`EditorScreen.tsx`)이 `'type' in f` 같은 런타임
// 가드를 써야 해서, 필드가 늘어날 때마다 이 패턴을 기억해야 하는 부담이 생긴다
// (코드 리뷰 지적). `maxLength`는 `lib/event-limits.ts`의 상수를 그대로 쓴다 —
// 가져오기·`POST`·`PATCH`가 같은 상수로 검증하므로(BE-34), 경로마다 상한이 다르면
// 한쪽에서 통과한 값이 다른 쪽에서 거절되거나 초과 상태로 열리는 비대칭이 생긴다.
export const FIELD_DEFS = [
  { k: 'title' as const, label: '행사명', hint: '날짜·장소는 별도 필드입니다', type: 'text' as const, inputMode: undefined, maxLength: EVENT_TEXT_MAX.title },
  // 로그인 사용자가 만든 이벤트는 생성 시 brand가 행사명으로 임시 채워진다(서버가
  // 필수로 요구하는데 이 화면엔 원래 입력 필드가 없었다, FE-42) — 여기서 실제
  // 브랜드명으로 고칠 수 있게 한다. 게스트는 빈 문자열로 시작해 바로 채운다.
  { k: 'brand' as const, label: '브랜드명', hint: '행사명과 별도로 저장됩니다 — 콘솔 검색에 쓰입니다', type: 'text' as const, inputMode: undefined, maxLength: EVENT_TEXT_MAX.brand },
  // 팀원 리뷰(PR #62) 지적 — 손타이핑 문자열은 형식 오류(서버 이벤트는 PATCH가
  // 400으로 거절하지만 로컬 이벤트는 검증 없이 그대로 저장됨)를 만들 수 있었다.
  // 브라우저 네이티브 날짜 선택기를 쓰면 애초에 YYYY-MM-DD가 아닌 값 자체가 나올
  // 수 없다.
  { k: 'date' as const, label: '일시', hint: '캘린더 연동·리마인더의 소스', type: 'date' as const, inputMode: undefined, maxLength: undefined },
  { k: 'venue' as const, label: '장소', hint: '장소 마스터에서 참조', type: 'text' as const, inputMode: undefined, maxLength: EVENT_TEXT_MAX.venue },
  // 같은 리뷰가 "연자 라이브러리에서 참조"라는 문구가 실제 동작과 다르다고 지적했다
  // — 이 필드는 자유 텍스트이고 연자 라이브러리와 연동되지 않는다(아젠다의 세션별
  // 연자·좌장과는 별개로, 참가자 화면 히어로에 행사 전체 대표 좌장 한 명만 표시하는
  // 용도다, `Microsite.tsx`의 "장소 · 좌장 …" 줄). 문구를 실제 동작에 맞게 고쳤다.
  { k: 'host' as const, label: '좌장', hint: '행사 전체를 대표하는 진행자 이름 — 아젠다의 세션별 연자와는 별개입니다', type: 'text' as const, inputMode: undefined, maxLength: EVENT_TEXT_MAX.host },
  // 팀원 리뷰 지적 — 숫자가 아닌 값을 넣어도 저장됨으로 표시됐다(`detailPatchToBody`가
  // 파싱 실패 시 조용히 capacity를 null로 보내 실제로는 값이 지워지는데도). 입력을
  // 숫자로만 제한해 애초에 그 값이 나올 수 없게 한다. 자릿수는 서버 상한 `MAX_CAPACITY`에서 온다.
  { k: 'cap' as const, label: '예상 참여 인원', hint: '리포트 분모로 사용 — 숫자만 입력됩니다', type: 'text' as const, inputMode: 'numeric' as const, maxLength: CAPACITY_MAX_DIGITS },
];