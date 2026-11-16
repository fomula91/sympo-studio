// 아젠다 세션 입력의 허용값·상한 — 서버와 에디터가 함께 보는 정본 (FE-49).
//
// 클라이언트 번들(에디터의 세션 편집 입력칸)도 이 파일을 읽으므로 **서버 전용
// 모듈을 import하지 않는다** — 상수만 둔다(lib/event-limits.ts와 같은 이유).

/** 0001_init.sql의 sessions.kind 주석과 같은 목록. 화이트리스트 밖은 400. */
export const SESSION_KINDS: readonly string[] = ['OPENING', 'LECTURE', 'PANEL', 'QA', 'CASE', 'CLOSING'];

export const SESSION_TITLE_MAX = 120;
export const SESSION_SPEAKER_MAX = 80;
