// StudioProvider의 ev 파생 로직 회귀 테스트 — FE-16(PR #27)에서 실제로 겪은 회귀 클래스를 고정한다.
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioProvider, useStudio } from './StudioProvider';

const mockParams: { current: { id?: string } } = { current: {} };

vi.mock('next/navigation', () => ({
  useParams: () => mockParams.current,
}));

function setUrlId(id?: string) {
  mockParams.current = id ? { id } : {};
}

function EvProbe() {
  const { ev, patchEvent } = useStudio();
  return (
    <div>
      <div data-testid="ev-id">{ev.id}</div>
      <div data-testid="ev-title">{ev.title}</div>
      <button onClick={() => patchEvent({ title: 'PATCHED' })}>patch</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <StudioProvider>
      <EvProbe />
    </StudioProvider>,
  );
}

const probeElement = (
  <StudioProvider>
    <EvProbe />
  </StudioProvider>
);

function currentEvId(): string {
  return screen.getByTestId('ev-id').textContent ?? '';
}

function currentEvTitle(): string {
  return screen.getByTestId('ev-title').textContent ?? '';
}

beforeEach(() => {
  setUrlId(undefined);
});

describe('StudioProvider의 ev 파생', () => {
  it('URL에 유효한 이벤트 id가 있으면 그 이벤트를 가리킨다', () => {
    setUrlId('1');
    renderProbe();
    expect(currentEvId()).toBe('1');
  });

  it('URL에 id가 없는 라우트(/console·/report)로 이동해도 마지막으로 보던 이벤트를 유지한다', () => {
    setUrlId('1');
    const { rerender } = renderProbe();
    expect(currentEvId()).toBe('1');

    setUrlId(undefined);
    rerender(probeElement);
    expect(currentEvId()).toBe('1');
  });

  it('숫자가 아닌 id에서 무한 렌더 없이 안전하게 렌더된다', () => {
    setUrlId('abc');
    expect(() => renderProbe()).not.toThrow();
  });

  it('존재하지 않는 숫자 id를 거쳐 id 없는 라우트로 가도 patchEvent가 조용히 no-op되지 않는다', () => {
    // 리뷰가 지적한 P3: 없는 id가 selectedId에 남으면, 이후 id 없는 라우트에서 patchEvent가
    // 화면에 보이는 이벤트(ev)가 아니라 그 죽은 id를 대상으로 삼아 조용히 실패한다.
    setUrlId('999999');
    const { rerender } = renderProbe();

    setUrlId(undefined);
    rerender(probeElement);

    fireEvent.click(screen.getByText('patch'));
    expect(currentEvTitle()).toBe('PATCHED');
  });
});
