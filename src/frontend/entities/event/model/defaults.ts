import { SESSIONS0 } from "../lib/rules";
import { venueSlug } from "../lib/rules";
import type { EventItem } from "./types";

const THEME_PRESET_CYCLE = ['aurora', 'prime', 'vertex', 'amber', 'slate'];

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

/** base가 이미 쓰이고 있으면 -2, -3 ...을 붙여 회차별 고유 slug를 보장한다 — 서버의 ensureUniqueSlug와 같은 규칙. */
export function uniqueSlug(base: string, existing: string[]): string {
  const clean = base || 'event';
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? clean : `${clean}-${n}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${clean}-${Date.now()}`;
}

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function seedEvents(): EventItem[] {
  const events: EventItem[] = [];
  // 오늘을 기준으로 흩뿌린다(BE-23) — 날짜를 고정해두면 목업 15건이 전부 '종료'로만
  // 보여 시점 배지가 무슨 축인지 화면에서 드러나지 않는다. i=2가 정확히 오늘이라
  // '예정'·'당일'·'종료'가 콘솔에 한 번에 나온다.
  const today = new Date();
  for (let i = 0; i < 15; i++) {
    const brand = BRANDS[i % BRANDS.length];
    const venue = VENUES[(i * 3) % VENUES.length];
    // 발행 상태만 배정한다 — '진행중'·'완료' 같은 시점은 event_date에서 파생되므로
    // 여기서 고를 값이 아니다(BE-23).
    const st = i === 1 || i === 3 ? '초안' : i > 11 ? '보관' : '공개';
    const dd = new Date(today.getTime() + (12 - i * 6) * 86400000);
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
      title: `${brand} 심포지엄`,
      date: `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`,
      host: '좌장 서정우',
      cap: '120',
      engage: { qa: true, survey: true, chat: false, cert: true },
      presetId: THEME_PRESET_CYCLE[i % THEME_PRESET_CYCLE.length],
      mode: 'light',
      iconSet: 'geo',
      density: '기본',
      keyVisual: '',
      kvPattern: 'stripe',
      sessions: SESSIONS0.slice(),
      // 순수 로컬 목업이라 실제 업로드된 파일이 없다 — 콘솔 카드의 "자료" 개수도
      // 이제 이 배열 길이에서 그대로 파생된다(FE-25, docs 필드 자체를 없앴다).
      documents: [],
    });
  }
  return events;
}

export function defaultEventDetail(): Omit<EventItem, 'id' | 'brand' | 'status' | 'dateCode' | 'slug'> {
  return {
    title: '새 이벤트',
    venue: '',
    date: todayLocalDate(),
    host: '',
    cap: '',
    engage: { qa: true, survey: true, chat: false, cert: true },
    presetId: 'aurora',
    mode: 'light',
    iconSet: 'geo',
    density: '기본',
    keyVisual: '',
    kvPattern: 'stripe',
    sessions: [],
    documents: [],
  };
}
