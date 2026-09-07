import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// vitest.config.ts에서 test.globals를 켜지 않아, RTL의 자동 cleanup이 afterEach를
// 못 찾는다 — 명시적으로 등록하지 않으면 테스트마다 렌더된 DOM이 document에 쌓인다.
afterEach(cleanup);
