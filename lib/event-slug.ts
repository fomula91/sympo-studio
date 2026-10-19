

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
