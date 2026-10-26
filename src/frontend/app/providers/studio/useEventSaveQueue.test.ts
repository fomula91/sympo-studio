import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiClientError } from '@fe/shared/api/http';
import { useEventSaveQueue as createSaveQueue } from './useEventSaveQueue';

const requests = vi.hoisted(() => ({ patch: vi.fn() }));
// React 참조 훅을 대체해 저장 컨트롤러의 요청 순서를 검증한다. 실제 마운트 테스트는 아니다.
vi.mock('@fe/entities/event', () => ({ patchStudioEvent: requests.patch }));
vi.mock('react', () => ({
  useRef: (value: unknown) => ({ current: value }),
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { requests.patch.mockReset(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

it('늦은 첫 요청이 끝나기 전 최신 요청을 보내지 않고 최신 값까지 저장한다', async () => {
  const first = deferred();
  const second = deferred();
  requests.patch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const patch = vi.fn();
  const queue = createSaveQueue({ patch });
  queue.pendingSavesRef.current.set(1, { title: '첫 입력' });
  const flushing = queue.flushServerSave(1);
  await vi.waitFor(() => expect(requests.patch).toHaveBeenCalledTimes(1));
  queue.pendingSavesRef.current.set(1, { title: '최신 입력', host: '새 좌장' });
  expect(queue.flushServerSave(1)).toBe(flushing);
  expect(requests.patch).toHaveBeenCalledTimes(1);
  first.resolve();
  await vi.waitFor(() => expect(requests.patch).toHaveBeenCalledTimes(2));
  expect(requests.patch).toHaveBeenLastCalledWith(1, { title: '최신 입력', host: '새 좌장' });
  expect(patch).not.toHaveBeenCalledWith({ saved: '방금 저장됨' });
  second.resolve();
  await flushing;
  expect(queue.pendingSavesRef.current.size).toBe(0);
  expect(patch).toHaveBeenLastCalledWith({ saved: '방금 저장됨' });
});

it('공개 직전 flush가 진행 중 요청을 중복 전송하지 않고 완료를 기다린다', async () => {
  const request = deferred();
  requests.patch.mockReturnValue(request.promise);
  const queue = createSaveQueue({ patch: vi.fn() });
  queue.pendingSavesRef.current.set(1, { title: '수정' });
  const saving = queue.flushServerSave(1);
  await vi.waitFor(() => expect(requests.patch).toHaveBeenCalledTimes(1));
  const publishingFlush = queue.flushServerSave(1);
  expect(publishingFlush).toBe(saving);
  request.resolve();
  await publishingFlush;
  expect(requests.patch).toHaveBeenCalledTimes(1);
});

it('실패를 호출자에게 전달하고 실패 델타를 보존해 수정 후 재시도한다', async () => {
  const error = new ApiClientError(400, 'title은 필수입니다.');
  requests.patch.mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
  const patch = vi.fn();
  const queue = createSaveQueue({ patch });
  const invalid = { title: '', venue: '행사장' };
  queue.pendingSavesRef.current.set(1, invalid);
  await expect(queue.flushServerSave(1)).rejects.toBe(error);
  expect(queue.pendingSavesRef.current.get(1)).toBe(invalid);
  expect(patch).toHaveBeenLastCalledWith({ saved: '저장 실패 — title은 필수입니다.' });
  queue.pendingSavesRef.current.set(1, { ...invalid, title: '수정한 제목' });
  await queue.flushServerSave(1);
  expect(requests.patch).toHaveBeenLastCalledWith(1, { title: '수정한 제목', venue: '행사장' });
  expect(queue.pendingSavesRef.current.size).toBe(0);
});

it('서로 다른 행사의 저장은 한 행사의 지연에 막히지 않는다', async () => {
  const slow = deferred();
  requests.patch.mockImplementation((id: number) => id === 1 ? slow.promise : Promise.resolve());
  const queue = createSaveQueue({ patch: vi.fn() });
  queue.pendingSavesRef.current.set(1, { title: '느린 행사' });
  queue.pendingSavesRef.current.set(2, { title: '다른 행사' });
  const first = queue.flushServerSave(1);
  await queue.flushServerSave(2);
  expect(queue.pendingSavesRef.current.has(1)).toBe(true);
  expect(queue.pendingSavesRef.current.has(2)).toBe(false);
  slow.resolve();
  await first;
});
