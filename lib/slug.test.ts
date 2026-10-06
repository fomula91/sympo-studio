import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESERVED_SLUGS, slugFormatError, slugLockedMessage } from './slug';

/**
 * BE-39 — 공개 주소(slug)의 형식·예약어 규칙.
 *
 * 요점은 둘이다. ① 공백·슬래시·대문자가 든 주소는 열 수 없다. ② 최상위 정적 경로 이름을
 * 주소로 쓰면 참가자 페이지가 정적 라우트에 가려 영영 안 열린다 — `app/`에 경로가 늘었는데
 * 예약어 목록에 안 더하면 그 이름이 조용히 통과한다.
 */
describe('slugFormatError', () => {
  it('소문자·숫자·하이픈 주소는 통과한다', () => {
    expect(slugFormatError('meridian-arte-seoul-260815')).toBeNull();
    expect(slugFormatError('a')).toBeNull();
    expect(slugFormatError('a'.repeat(80))).toBeNull();
  });

  it('형식이 틀리면 거절한다', () => {
    for (const bad of ['', '-lead', 'Upper', 'has space', 'a/b', 'a_b', 'a.b', '한글', 'a'.repeat(81)]) {
      expect(slugFormatError(bad)).toMatch(/소문자·숫자·하이픈/);
    }
  });

  it('예약어(최상위 정적 경로)는 거절한다', () => {
    expect(slugFormatError('console')).toMatch(/예약된 경로/);
    expect(slugFormatError('api')).toMatch(/예약된 경로/);
    // 예약어로 시작하는 것까지 막지는 않는다 — `/console-2026`은 참가자 페이지로 열린다.
    expect(slugFormatError('console-2026')).toBeNull();
  });
});

describe('RESERVED_SLUGS', () => {
  it('app/의 최상위 정적 경로를 전부 담는다', () => {
    // 라우트 그룹 `(studio)`는 URL에 안 나타나므로 그 안의 폴더가 최상위 경로다.
    // 동적 세그먼트(`[slug]`)와 파일(`page.tsx` 등)은 경로 이름이 아니다.
    const appDir = join(__dirname, '..', 'app');
    const segments: string[] = [];
    const collect = (dir: string) => {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        if (!d.isDirectory() || d.name.startsWith('[')) continue;
        if (d.name.startsWith('(')) collect(join(dir, d.name));
        else segments.push(d.name);
      }
    };
    collect(appDir);
    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) expect([...RESERVED_SLUGS]).toContain(s);
  });
});

describe('slugLockedMessage', () => {
  it('지금 상태와, 초안으로 되돌릴 때의 대가를 함께 알린다', () => {
    const msg = slugLockedMessage('공개');
    expect(msg).toContain('지금: 공개');
    expect(msg).toContain('이미 공유한 링크');
  });
});
