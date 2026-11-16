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
vi.mock('next/navigation', () => ({ usePathname: () => '/events/1/edit', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@fe/shared/lib/state/useArmedAction', () => ({ useArmedAction: () => [null, vi.fn(), vi.fn()] }));
vi.mock('@fe/shared/lib/theme/palette', () => ({ contrastAllPass: () => true }));
vi.mock('@fe/entities/event', () => ({ deleteStudioEvent: vi.fn(), patchStudioEventStatus: vi.fn() }));

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

it.each(['handlePublish', 'handleUnpublish'] as const)('%s 실패 시 서버의 입력 검증 사유를 유지한다', async (action) => {
  const patch = vi.fn();
  const ev = { id: 1, title: '', venue: '', slug: 'test', presetId: 'test', mode: 'light', date: '2026-10-26', dateCode: '261026' } as StudioShellProps['ev'];
  const s = { events: [ev], sel: [], viewerOpen: false, section: 'basic', bulk: false, saved: '방금 저장됨' } as StudioShellProps['s'];
  const setEventStatus = vi.fn().mockRejectedValue(new ApiClientError(400, 'title은 필수입니다.'));
  const shell = createShell({ s, ev, presets: [{ id: 'test', label: 'test', h: 200, c: 0.1 }], patch, setEventStatus, serverIds: new Set([1]), createEvent: vi.fn() });
  await shell[action]();
  const message = patch.mock.calls[patch.mock.calls.length - 1][0].saved as string;
  expect(message).toContain('title은 필수입니다.');
  expect(message).not.toContain('다시 시도');
  expect(savedColor(message)).toBe(UI.toneDangerFg);
});
