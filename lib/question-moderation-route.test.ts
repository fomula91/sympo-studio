import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from './db';
import { GET } from '@/app/api/events/[id]/questions/moderation/route';

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), authorize: vi.fn(), prepare: vi.fn(), bind: vi.fn(), all: vi.fn() }));
vi.mock('@/lib/db', async (original) => ({ ...await original<typeof import('./db')>(), getDb: mocks.getDb }));
vi.mock('@/lib/auth', () => ({ assertCanEdit: mocks.authorize }));
const context = { params: Promise.resolve({ id: '42' }) };
type ListResponse = { questions: { status: string; createdAt: string }[]; nextCursor: number | null };
const row = (id: number, status = 'published') => ({ id, session_id: null, body: `질문 ${id}`, author: null, created_at: '2026-10-26 03:00:00', status });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getDb.mockResolvedValue({ prepare: mocks.prepare });
  mocks.prepare.mockReturnValue({ bind: mocks.bind });
  mocks.bind.mockReturnValue({ all: mocks.all });
  mocks.all.mockResolvedValue({ results: [] });
});

describe('운영자 질문 목록', () => {
  it('권한이 없으면 숨긴 질문을 조회하기 전에 404로 끝난다', async () => {
    mocks.authorize.mockRejectedValue(new ApiError('이벤트를 찾을 수 없습니다.', 404));
    const res = await GET(new NextRequest('http://localhost/api/events/42/questions/moderation'), context);
    expect(res.status).toBe(404);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('공개·숨김 상태와 복구에 필요한 질문을 반환하고 개인정보·공유 캐시는 제외한다', async () => {
    mocks.all.mockResolvedValue({ results: [row(2, 'hidden'), row(1)] });
    const req = new NextRequest('http://localhost/api/events/42/questions/moderation');
    const res = await GET(req, context);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), req, 42);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.bind).toHaveBeenCalledWith(42);
    const data = await res.json() as ListResponse;
    expect(data.questions.map((q: { status: string }) => q.status)).toEqual(['hidden', 'published']);
    expect(data.questions[0].createdAt).toBe('2026-10-26T03:00:00Z');
    expect(data.nextCursor).toBeNull();
    expect(mocks.prepare.mock.calls[0][0]).not.toMatch(/client_hash|token_hash/);
  });

  it('최신 50건과 다음 커서를 반환하고 이전 질문은 행사 id와 커서로 제한한다', async () => {
    mocks.all.mockResolvedValue({ results: Array.from({ length: 51 }, (_, i) => row(100 - i)) });
    const first = await GET(new NextRequest('http://localhost/api/events/42/questions/moderation'), context);
    const data = await first.json() as ListResponse;
    expect(data.questions).toHaveLength(50);
    expect(data.nextCursor).toBe(51);
    await GET(new NextRequest(`http://localhost/api/events/42/questions/moderation?before=${data.nextCursor}`), context);
    expect(mocks.prepare).toHaveBeenLastCalledWith(expect.stringContaining('WHERE event_id = ? AND id < ?'));
    expect(mocks.bind).toHaveBeenLastCalledWith(42, 51);
  });

  it.each(['0', '-1', '1.5', 'abc', '9007199254740992'])('잘못된 커서 %s는 400이다', async (before) => {
    const res = await GET(new NextRequest(`http://localhost/api/events/42/questions/moderation?before=${before}`), context);
    expect(res.status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
