import type { EventItem, Section, Session } from './types';

// 아래 브랜드·인물·기관·제품명은 전부 가상입니다. 실존 캠페인/의료인/의약품과 무관합니다.
export const BRANDS = ['MERIDIAN', 'AURORA', 'PRIME', 'VERTEX', 'HALO', 'HERO'];

export const VENUES = [
  '아르떼 호텔 서울',
  '메종 그랜드 서울',
  '노바 호텔 강남',
  '리버뷰 타워 여의도',
  '스텔라 컨벤션 삼성',
  '한강 컨벤션센터',
  '해운대 마리나 부산',
  '보문 레이크 경주',
];

export const STATUS = ['초안', '검수대기', '공개예정', '진행중', '완료', '보관'];

export const SESSIONS0: Session[] = [
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
];

export const SESSION_LIB: Omit<Session, 'id'>[] = [
  { time: '19:30', title: 'Late-Breaking Data Review', speaker: '오하린 교수 · 명우대학교병원', kind: 'LECTURE' },
  { time: '19:50', title: 'Case Sharing: 임상 적용 사례', speaker: '강도윤 교수 · 하람대학교병원', kind: 'CASE' },
  { time: '20:10', title: 'Closing Remarks', speaker: '좌장 서정우', kind: 'CLOSING' },
];

const VENUE_SLUG: Record<string, string> = {
  '아르떼 호텔 서울': 'arte-seoul',
  '메종 그랜드 서울': 'maison-grand',
  '노바 호텔 강남': 'nova-gangnam',
  '리버뷰 타워 여의도': 'riverview-yeouido',
  '스텔라 컨벤션 삼성': 'stella-samsung',
  '한강 컨벤션센터': 'hangang-convention',
  '해운대 마리나 부산': 'marina-busan',
  '보문 레이크 경주': 'bomun-gyeongju',
};

export function venueSlug(v: string): string {
  return (
    VENUE_SLUG[v] ||
    (v || '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() ||
    'venue'
  );
}

export function autoSlug(title: string, venue: string, date: string): string {
  const head = (title.split(' ')[0] || 'event').toLowerCase().replace(/[^a-z0-9]/g, '') || 'event';
  return `${head}-${venueSlug(venue)}-${date.replace(/-/g, '').slice(2)}`;
}

export const SECTIONS: { id: Section; label: string; meta: string }[] = [
  { id: 'basic', label: '기본 정보', meta: '5' },
  { id: 'agenda', label: '아젠다', meta: '' },
  { id: 'docs', label: '자료', meta: '4' },
  { id: 'engage', label: '참여', meta: '2' },
  { id: 'theme', label: '테마', meta: '' },
];

export const NAV: { id: string; label: string; glyph: string; shape?: 'phone' }[] = [
  { id: 'console', label: '콘솔', glyph: '▦' },
  { id: 'editor', label: '에디터', glyph: '▤' },
  { id: 'theme', label: '테마', glyph: '◐' },
  { id: 'viewer', label: '뷰어', glyph: '', shape: 'phone' },
  { id: 'report', label: '리포트', glyph: '▥' },
];

export function seedEvents(): EventItem[] {
  const events: EventItem[] = [];
  const d = new Date(2026, 7, 15);
  for (let i = 0; i < 15; i++) {
    const brand = BRANDS[i % BRANDS.length];
    const venue = VENUES[(i * 3) % VENUES.length];
    const st =
      i === 0 ? '진행중' : i === 1 ? '검수대기' : i === 2 ? '공개예정' : i === 3 ? '초안' : i > 11 ? '보관' : '완료';
    const dd = new Date(d.getTime() - i * 6.4 * 86400000);
    const code =
      String(dd.getFullYear()).slice(2) +
      String(dd.getMonth() + 1).padStart(2, '0') +
      String(dd.getDate()).padStart(2, '0');
    events.push({
      id: i,
      brand,
      venue,
      status: st,
      dateCode: code,
      slug: `${brand.toLowerCase()}-${venueSlug(venue)}-${code}`,
      sessions: 5 + (i % 4),
      docs: 2 + (i % 5),
    });
  }
  return events;
}

export const DOCS = [
  { name: 'Early Intervention Strategies with ATELOVAN', meta: 'lecture · 24p · 4.1MB', tag: '강의자료' },
  { name: 'Long-Term Adherence: Real-World Evidence Review', meta: 'lecture · 18p · 3.2MB', tag: '강의자료' },
  { name: '아텔로반 제품 정보', meta: 'product · 6p · 1.1MB', tag: '제품소개' },
  { name: '케이로스타 제품 정보', meta: 'product · 5p · 0.9MB', tag: '제품소개' },
];

export const ENGAGE_DEFS = [
  { k: 'qa' as const, label: '실시간 Q&A', desc: '외부 링크·QR 대신 페이지 내 수집' },
  { k: 'survey' as const, label: '설문조사', desc: '2단 설문 · 응답 후 수료증 노출' },
  { k: 'chat' as const, label: '현장 채팅', desc: '좌장 승인 후 공개' },
  { k: 'cert' as const, label: '수료증 자동 발급', desc: '설문 완료 시 PDF 생성' },
];

export const FIELD_DEFS = [
  { k: 'title' as const, label: '행사명', hint: '날짜·장소는 별도 필드입니다' },
  { k: 'date' as const, label: '일시', hint: '캘린더 연동·리마인더의 소스' },
  { k: 'venue' as const, label: '장소', hint: '장소 마스터에서 참조' },
  { k: 'host' as const, label: '좌장', hint: '연자 라이브러리에서 참조' },
  { k: 'cap' as const, label: '예상 참여 인원', hint: '리포트 분모로 사용' },
];

// 아래 수치는 실측이 아닌 샘플입니다. 리포트 층은 "어떤 지표를 봐야 하는가"를 보여주기 위한 화면입니다.
export const METRICS = [
  { label: '행사 셋업 소요시간', value: '7분 40초', before: '42분', delta: '−82%' },
  { label: '설문 응답률', value: '66%', before: '42%', delta: '+24pt' },
  { label: '모바일 이탈률', value: '13%', before: '38%', delta: '−25pt' },
  { label: '색상 AA 통과율', value: '100%', before: '미측정', delta: '게이트' },
];

export const OPS = [
  { label: '특정 행사 진입 클릭 수', before: '4.6회', after: '2회' },
  { label: '편집 → 프리뷰 반영', before: '12초', after: '즉시' },
  { label: '색상 입력 횟수', before: '12회', after: '0회' },
  { label: '저장 실패율', before: '미측정', after: '0.04%' },
  { label: '아젠다 재제작', before: '이미지 재작업', after: '필드 수정' },
];
