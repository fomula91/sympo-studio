import type { Section } from "../model/state";

export const SECTIONS: { id: Section; label: string; meta: string }[] = [
  { id: 'basic', label: '기본 정보', meta: '5' },
  { id: 'agenda', label: '아젠다', meta: '' },
  { id: 'docs', label: '자료', meta: '' },
  { id: 'engage', label: '참여', meta: '2' },
  { id: 'theme', label: '테마', meta: '' },
];

// 'chat'(현장 채팅)은 목록에서 뺐다(FE-17) — 실제 채팅 화면이 어디에도 없어 토글을
// 남겨두면 없는 기능을 켜는 것처럼 보인다. engage.chat 필드 자체(타입·DB)는 그대로
// 둔다 — 나중에 실제 채팅을 만들면 다시 넣는다.
export const ENGAGE_DEFS = [
  { k: 'qa' as const, label: '실시간 Q&A', desc: '외부 링크·QR 대신 페이지 내 수집' },
  { k: 'survey' as const, label: '설문조사', desc: '2단 설문 · 응답 후 수료증 노출' },
  { k: 'cert' as const, label: '수료증 자동 발급', desc: '설문 완료 시 PDF 생성' },
];