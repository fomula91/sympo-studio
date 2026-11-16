import type { EventItem } from '../model/types';

/** 검색 대상과 정규화 규칙을 목록·건수 표시에 함께 적용한다. 정렬은 호출부가 맡는다. */
export function filterEvents(events: readonly EventItem[], query: string, status = '전체'): EventItem[] {
  const q = query.trim().toLowerCase();
  return events.filter(
    (event) =>
      (status === '전체' || event.status === status) &&
      (!q || (event.title + event.brand + event.venue + event.slug + event.dateCode).toLowerCase().includes(q)),
  );
}
