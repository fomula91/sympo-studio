import { expect, it } from 'vitest';
import { filterEvents } from './filter-events';
import type { EventItem } from '../model/types';

const events = [
  { id: 1, title: '정기 세미나', brand: 'AURORA', venue: '서울', slug: 'spring', dateCode: '261116', status: '초안' },
  { id: 2, title: 'AURORA 심포지엄', brand: 'PRIME', venue: '부산', slug: 'summer', dateCode: '261117', status: '공개' },
  { id: 3, title: '연말 모임', brand: 'HALO', venue: '대전', slug: 'winter', dateCode: '261118', status: '보관' },
] as EventItem[];

it.each([
  ['정기', [1]],
  ['  auRoRa  ', [1, 2]],
  ['부산', [2]],
  ['winter', [3]],
  ['261117', [2]],
  ['없는검색어', []],
  ['', [1, 2, 3]],
  ['   ', [1, 2, 3]],
])('검색어 %s는 기존 검색 대상·정규화 규칙으로 행사 목록을 고른다', (query, ids) => {
  expect(filterEvents(events, query).map((event) => event.id)).toEqual(ids);
});

it('검색 결과의 각 상태 건수와 선택 상태의 목록 건수가 일치한다', () => {
  const searched = filterEvents(events, 'aurora');
  expect(searched).toHaveLength(2);
  for (const status of ['초안', '공개', '보관']) {
    expect(filterEvents(events, 'aurora', status)).toEqual(searched.filter((event) => event.status === status));
  }
});

it('검색·상태 필터는 원본 순서를 보존하고 검색을 지우면 목록을 복원한다', () => {
  const snapshot = structuredClone(events);
  expect(filterEvents(events, 'aurora', '공개').map((event) => event.id)).toEqual([2]);
  expect(filterEvents(events, '', '공개').map((event) => event.id)).toEqual([2]);
  expect(filterEvents(events, '')).toEqual(snapshot);
  expect(events).toEqual(snapshot);
});
