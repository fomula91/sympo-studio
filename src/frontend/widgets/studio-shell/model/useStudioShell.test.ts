import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiClientError } from '@fe/shared/api/http';
import { savedColor, UI } from '@fe/shared/config/ui';
import type { StudioShellProps } from './props';
import { useStudioShell as createShell } from './useStudioShell';

// 핸들러 검증용 React 대역이며 화면 렌더링은 로컬 브라우저에서 별도로 확인한다.
vi.mock('react', () => ({
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, vi.fn()],
  useEffect: () => {},
}));
const navigation = vi.hoisted(() => ({ pathname: '/events/1/edit', push: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname, useRouter: () => ({ push: navigation.push }) }));
vi.mock('@fe/shared/lib/state/useArmedAction', () => ({ useArmedAction: () => [null, vi.fn(), vi.fn()] }));
vi.mock('@fe/shared/lib/theme/palette', () => ({ contrastAllPass: () => true }));
vi.mock('@fe/entities/event', async (importOriginal) => ({
  ...await importOriginal<typeof import('@fe/entities/event')>(),
  deleteStudioEvent: vi.fn(),
  patchStudioEventStatus: vi.fn(),
}));

beforeEach(() => {
  navigation.pathname = '/events/1/edit';
  navigation.push.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it.each(['handlePublish', 'handleUnpublish'] as const)('%s 실패 시 서버의 입력 검증 사유를 유지한다', async (action) => {
  const patch = vi.fn();
  const ev = { id: 1, title: '', venue: '', slug: 'test', presetId: 'test', mode: 'light', date: '2026-10-26', dateCode: '261026' } as StudioShellProps['ev'];
  const s = { events: [ev], query: '', status: '전체', sel: [], viewerOpen: false, section: 'basic', bulk: false, saved: '방금 저장됨' } as StudioShellProps['s'];
  const setEventStatus = vi.fn().mockRejectedValue(new ApiClientError(400, 'title은 필수입니다.'));
  const shell = createShell({ s, ev, effectiveId: 1, presets: [{ id: 'test', label: 'test', h: 200, c: 0.1 }], patch, setEventStatus, serverIds: new Set([1]), createEvent: vi.fn() });
  await shell[action]();
  const message = patch.mock.calls[patch.mock.calls.length - 1][0].saved as string;
  expect(message).toContain('title은 필수입니다.');
  expect(message).not.toContain('다시 시도');
  expect(savedColor(message)).toBe(UI.toneDangerFg);
});

function navigationShell(effectiveId: number | null, displayedId: number) {
  const ev = { id: displayedId, title: '테스트 행사', venue: '', date: '2026-11-16', presetId: 'test', mode: 'light' } as StudioShellProps['ev'];
  const s = { events: [ev], query: '', status: '전체', sel: [], viewerOpen: false, section: 'agenda', bulk: false, saved: '방금 저장됨' } as StudioShellProps['s'];
  return createShell({ s, ev, effectiveId, presets: [], patch: vi.fn(), setEventStatus: vi.fn(), serverIds: new Set(), createEvent: vi.fn() });
}

it.each(['editor', 'theme'] as const)('상세 조회 전 %s 이동은 표시용 시드 대신 URL의 행사 id를 유지한다', (target) => {
  navigation.pathname = '/events/27/edit';
  navigationShell(27, 0).goTo(target);
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/events/27/edit');
});

it.each(['editor', 'theme'] as const)('콘솔에서 다른 행사를 선택한 뒤 %s 이동은 새 행사 id를 유지한다', (target) => {
  navigation.pathname = '/events/27/edit';
  navigationShell(27, 27);
  navigation.pathname = '/console';
  navigationShell(27, 27);
  navigation.pathname = '/events/42/edit';
  navigationShell(42, 27).goTo(target);
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/events/42/edit');
});

it('이벤트 id가 없는 리포트에서도 마지막 선택 id로 에디터에 돌아간다', () => {
  navigation.pathname = '/report';
  navigationShell(27, 0).goTo('editor');
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/events/27/edit');
});

it('게스트 시드 id 0도 표시용 행사로 대체하지 않는다', () => {
  navigation.pathname = '/events/0/edit';
  navigationShell(0, 1).goTo('theme');
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/events/0/edit');
});

it('선택 id가 없을 때는 표시 중인 행사로 이동한다', () => {
  navigation.pathname = '/console';
  navigationShell(null, 1).goTo('editor');
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith('/events/1/edit');
});

it.each(['console', 'report'] as const)('%s 이동은 행사 id와 관계없이 기존 경로를 쓴다', (target) => {
  navigationShell(27, 0).goTo(target);
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith(`/${target}`);
});

it.each([
  ['없는검색어', '전체', 0],
  ['  aurora  ', '전체', 2],
  ['aurora', '초안', 1],
  ['aurora', '보관', 0],
  ['', '전체', 3],
  ['', '공개', 2],
])('콘솔 헤더는 검색어 %s · 상태 %s의 목록 건수를 표시한다', (query, status, count) => {
  navigation.pathname = '/console';
  const ev = { id: 1, title: '테스트 행사', brand: 'AURORA', venue: '서울', slug: 'first', date: '2026-11-16', dateCode: '261116', status: '초안', presetId: 'test', mode: 'light' } as StudioShellProps['ev'];
  const events = [ev, { ...ev, id: 2, status: '공개' }, { ...ev, id: 3, brand: 'PRIME', status: '공개' }];
  const s = { events, query, status, sel: [], viewerOpen: false, section: 'agenda', bulk: false, saved: '방금 저장됨' } as StudioShellProps['s'];
  const shell = createShell({ s, ev, effectiveId: 1, presets: [], patch: vi.fn(), setEventStatus: vi.fn(), serverIds: new Set(), createEvent: vi.fn() });
  expect(shell.heading).toBe(`이벤트 ${count}건`);
});
