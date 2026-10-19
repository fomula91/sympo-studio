// 서버 Cron 리셋(seed.ts)과 FE 기본값이 함께 쓰는 순수 데모 데이터 — FE
// `Session` 타입(src/frontend)을 여기서 역참조하지 않는다(ADR 0015 5절).
// 구조만 로컬로 선언해, 필드 오타·누락이 생기면 바로 타입 에러로 드러나게 한다.
type DemoSession = { id: number; time: string; title: string; speaker: string; kind: string };

export const SESSIONS0 = [
  { id: 1, time: '17:00', title: '개회사', speaker: '좌장 서정우 · 도원대학교병원', kind: 'OPENING' },
  {
    id: 2,
    time: '17:20',
    title: 'Early Intervention Strategies with ATELOVAN',
    speaker: '배준혁 교수 · 청연대학교병원',
    kind: 'LECTURE',
  },
  {
    id: 3,
    time: '17:50',
    title: 'Long-Term Adherence: Real-World Evidence Review',
    speaker: '문세영 교수 · 유림대학교병원',
    kind: 'LECTURE',
  },
  { id: 4, time: '18:20', title: 'Panel Discussion', speaker: '연자 3인 · 좌장 서정우', kind: 'PANEL' },
  { id: 5, time: '18:50', title: 'Q&A 세션', speaker: '현장 질문 · 실시간 수집', kind: 'QA' },
  { id: 6, time: '19:10', title: '폐회 및 설문', speaker: '운영진', kind: 'CLOSING' },
] satisfies DemoSession[];
