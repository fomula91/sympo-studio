import { describe, expect, it } from 'vitest';
import { purgeOrphanDocuments } from './retention';

/**
 * 고아 R2 객체 정리가 **살아 있는 이벤트 안까지 본다**는 것을 고정한다 (BE-29).
 *
 * 예전 판정은 "죽은 이벤트의 프리픽스"였다. `documentKey`가 회차마다 nonce를 붙이는
 * 탓에 덮어쓰기가 새 객체를 만드는데, 옛 객체 삭제는 실패해도 넘어가는 경로라
 * **실패하면 영원히 회수되지 않았다.** 되돌아가면 증상이 요금으로만 드러난다.
 *
 * 유예(ORPHAN_GRACE_MS)도 함께 고정한다 — 빠지면 R2 put과 D1 커밋 사이에 Cron이
 * 겹쳤을 때 **방금 올린 자료가 지워진다.**
 */
function fakeBucket(objects: { key: string; ageMs: number }[]) {
  const deleted: string[] = [];
  const bucket = {
    list: async () => ({
      objects: objects.map((o) => ({ key: o.key, uploaded: new Date(Date.now() - o.ageMs) })),
      truncated: false,
    }),
    delete: async (keys: string[]) => {
      deleted.push(...keys);
    },
  };
  return { bucket: bucket as unknown as R2Bucket, deleted };
}

function fakeDb(keys: string[]) {
  const db = {
    prepare: () => ({
      all: async () => ({ results: keys.map((k) => ({ r2_key: k })) }),
    }),
  };
  return db as unknown as D1Database;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('purgeOrphanDocuments', () => {
  it('자료 행이 참조하는 객체는 남긴다', async () => {
    const { bucket, deleted } = fakeBucket([{ key: 'events/1/5-aaaa.pdf', ageMs: DAY }]);
    await purgeOrphanDocuments(fakeDb(['events/1/5-aaaa.pdf']), bucket);
    expect(deleted).toEqual([]);
  });

  it('살아 있는 이벤트 안이라도 참조되지 않으면 지운다', async () => {
    // 덮어쓰기로 밀려난 옛 객체 — 예전 판정("죽은 이벤트")으로는 절대 안 잡혔다.
    const { bucket, deleted } = fakeBucket([
      { key: 'events/1/5-old.pdf', ageMs: DAY },
      { key: 'events/1/5-new.pdf', ageMs: DAY },
    ]);
    await purgeOrphanDocuments(fakeDb(['events/1/5-new.pdf']), bucket);
    expect(deleted).toEqual(['events/1/5-old.pdf']);
  });

  it('막 올라온 객체는 참조가 없어도 건드리지 않는다', async () => {
    // R2 put과 D1 커밋 사이의 찰나 — 여기서 지우면 방금 올린 자료가 사라진다.
    const { bucket, deleted } = fakeBucket([{ key: 'events/1/5-fresh.pdf', ageMs: 5_000 }]);
    await purgeOrphanDocuments(fakeDb([]), bucket);
    expect(deleted).toEqual([]);
  });

  it('우리 키 규칙이 아닌 객체는 건드리지 않는다', async () => {
    const { bucket, deleted } = fakeBucket([{ key: 'events/not-a-number/x.pdf', ageMs: DAY }]);
    await purgeOrphanDocuments(fakeDb([]), bucket);
    expect(deleted).toEqual([]);
  });
});
