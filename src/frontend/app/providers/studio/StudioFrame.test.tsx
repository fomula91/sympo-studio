import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRESETS } from '@fe/entities/theme';
import { INITIAL } from './initial-state';
import { StudioFrame } from './StudioFrame';
import type { useStudio } from './StudioProvider';

let studio: ReturnType<typeof useStudio>;
const navigation = vi.hoisted(() => ({ pathname: '/console', push: vi.fn() }));
vi.mock('./StudioProvider', () => ({ useStudio: () => studio }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname, useRouter: () => ({ push: navigation.push }) }));
vi.mock('@fe/features/account-menu', () => ({ AccountMenu: () => <div>계정 메뉴</div> }));
vi.mock('@fe/widgets/participant-site', () => ({ DevicePreview: () => <div>행사 미리보기</div> }));

const user = { id: 91, email: 'test@example.invalid', name: '테스트 계정', avatarUrl: null };
function state(overrides: Partial<ReturnType<typeof useStudio>> = {}) {
  return {
    s: INITIAL, ev: INITIAL.events[0], effectiveId: 0, presets: PRESETS,
    patch: vi.fn(), resetSessions: vi.fn(), createEvent: vi.fn(),
    isServerEvent: false, setEventStatus: vi.fn(), serverIds: new Set<number>(),
    authStatus: 'checking', authError: null, eventsListError: null,
    user: null, eventsListLoaded: false, loadStatus: 'idle',
    ...overrides,
  } as ReturnType<typeof useStudio>;
}
function render() {
  return renderToStaticMarkup(<StudioFrame><div>행사 본문과 가져오기 안내</div></StudioFrame>);
}
beforeEach(() => {
  navigation.pathname = '/console';
  studio = state();
});

it('인증 확인 전 첫 HTML에 예시 목록·건수·본문·미리보기를 노출하지 않는다', () => {
  studio.s = { ...INITIAL, viewerOpen: true };
  const html = render();
  expect(html).toContain('로그인 상태를 확인하고 있습니다');
  expect(html).not.toContain('이벤트 15건');
  expect(html).not.toContain('행사 본문');
  expect(html).not.toContain('행사 미리보기');
});

it('로그인 후 목록 응답 대기 중에도 예시 목록을 노출하지 않는다', () => {
  studio = state({ user, authStatus: 'ready' });
  const html = render();
  expect(html).toContain('내 행사를 불러오는 중');
  expect(html).not.toContain('이벤트 15건');
  expect(html).not.toContain('행사 본문');
});

it('목록 조회 실패는 빈 계정·예시 목록 대신 오류와 재시도를 보여준다', () => {
  studio = state({ user, authStatus: 'ready', eventsListError: '행사 목록 조회 실패' });
  const html = render();
  expect(html).toContain('행사 목록 조회 실패');
  expect(html).toContain('다시 불러오기');
  expect(html).not.toContain('아직 만든 행사가 없습니다');
  expect(html).not.toContain('행사 본문');
});

it('인증 확인 실패도 게스트 예시로 대체하지 않는다', () => {
  studio = state({ authError: '로그인 상태 확인 실패' });
  const html = render();
  expect(html).toContain('로그인 상태 확인 실패');
  expect(html).toContain('다시 불러오기');
  expect(html).not.toContain('행사 본문');
});

it('성공한 빈 목록은 ev 없이도 생성 버튼과 가져오기 안내를 렌더링한다', () => {
  studio = state({ user, authStatus: 'ready', eventsListLoaded: true, s: { ...INITIAL, events: [] }, ev: undefined, effectiveId: null });
  const html = render();
  expect(html).toContain('아직 만든 행사가 없습니다');
  expect(html).toContain('새 이벤트');
  expect(html).toContain('가져오기 안내');
  expect(html).not.toContain('이벤트 15건');
});

it('로그인 목록이 도착하면 실제 목록의 건수와 본문을 보여준다', () => {
  const ev = { ...INITIAL.events[0], id: 91, title: '내 행사' };
  studio = state({ user, authStatus: 'ready', eventsListLoaded: true, s: { ...INITIAL, events: [ev] }, ev, effectiveId: 91 });
  const html = render();
  expect(html).toContain('이벤트 1건');
  expect(html).toContain('행사 본문');
});

it('에디터 상세 응답 전에는 시드 헤더와 미리보기도 가린다', () => {
  navigation.pathname = '/events/1/edit';
  studio = state({ user, authStatus: 'ready', eventsListLoaded: true, loadStatus: 'loading', s: { ...INITIAL, viewerOpen: true } });
  const html = render();
  expect(html).toContain('행사를 불러오는 중');
  expect(html).not.toContain('MERIDIAN');
  expect(html).not.toContain('행사 미리보기');
});

it('상세가 먼저 도착한 에디터는 목록 응답을 기다리지 않고 실제 행사를 보여준다', () => {
  navigation.pathname = '/events/91/edit';
  const ev = { ...INITIAL.events[0], id: 91, title: '내 행사' };
  studio = state({ user, authStatus: 'ready', loadStatus: 'idle', s: { ...INITIAL, events: [ev] }, ev, effectiveId: 91 });
  const html = render();
  expect(html).toContain('내 행사');
  expect(html).toContain('행사 본문');
});

it('에디터 오류는 시드 헤더 대신 기존 오류 본문과 콘솔 복귀를 보여준다', () => {
  navigation.pathname = '/events/91/edit';
  studio = state({ user, authStatus: 'ready', loadStatus: 'error' });
  const html = render();
  expect(html).toContain('행사를 확인하지 못했습니다');
  expect(html).toContain('콘솔로 돌아가기');
  expect(html).not.toContain('MERIDIAN');
});

it('확인된 게스트 체험과 로그아웃 후에는 예시 행사를 유지한다', () => {
  studio = state({ authStatus: 'ready', eventsListError: '이전 계정 조회 실패' });
  const html = render();
  expect(html).toContain('이벤트 15건');
  expect(html).toContain('행사 본문');
  expect(html).not.toContain('이전 계정 조회 실패');
});
