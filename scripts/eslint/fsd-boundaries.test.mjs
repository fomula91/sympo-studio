import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESLint, Linter } from 'eslint';
import plugin, { boundaryViolation } from './fsd-boundaries.mjs';

const root = process.cwd();
const from = (name) => path.join(root, 'src/frontend', name);
const fromRoot = (name) => path.join(root, 'app', name);
describe('FSD boundaries', () => {
  it.each([
    ['pages/editor/ui/Screen.tsx', '@fe/entities/event'],
    ['features/view-document/ui/PdfViewer.tsx', '@fe/shared/api/http'],
    ['entities/event/model/defaults.ts', '../lib/rules'],
    ['entities/event/lib/rules.ts', '@/lib/status'],
    ['widgets/participant-site/ui/Microsite.tsx', '@fe/features/view-document/client'],
    ['app/providers/studio/Provider.tsx', '@fe/app/providers/studio/types'],
    ['pages/editor/ui/Screen.tsx', '@fe/shared/../entities/event'],
    ['entities/event/lib/rules.ts', '@/lib/../lib/status'],
  ])('allows %s → %s', (file, target) => expect(boundaryViolation(from(file), target, root)).toBeNull());
  it.each([
    ['(studio)/console/page.tsx', '@fe/pages/console'],
    ['(studio)/layout.tsx', '@fe/app/providers'],
    ['layout.tsx', '@fe/app/styles/font'],
    ['layout.tsx', '@fe/app/styles/globals.css'],
    ['api/events/route.ts', '@/lib/db'],
    ['[slug]/page.tsx', 'next/navigation'],
  ])('allows Next root entry %s → %s', (file, target) => expect(boundaryViolation(fromRoot(file), target, root)).toBeNull());
  it.each([
    ['features/account-menu/ui/Menu.tsx', '@fe/app/providers/studio'],
    ['features/account-menu/ui/Menu.tsx', '@fe/shared/../app/providers/studio/StudioProvider'],
    ['features/account-menu/ui/Menu.tsx', '@fe/shared/../../../lib/db'],
    ['features/account-menu/ui/Menu.tsx', '@/src/frontend/shared/../app/providers/studio/StudioProvider'],
    ['features/account-menu/ui/Menu.tsx', '@/src/frontend/shared/../../../lib/db'],
    ['widgets/studio-shell/ui/Shell.tsx', '@fe/widgets/participant-site'],
    ['pages/editor/ui/Screen.tsx', '@fe/entities/event/model/types'],
    ['pages/editor/ui/Screen.tsx', '../../../entities/event/model/types'],
    ['features/account-menu/ui/Menu.tsx', '../../../app/providers/studio'],
    ['entities/event/model/types.ts', '@fe/entities/event'],
    ['entities/event/model/types.ts', '@/lib/status'],
    ['entities/event/lib/rules.ts', '@/lib/db'],
    ['shared/api/http.ts', '@/lib/auth'],
    ['shared/api/http.ts', 'node:fs'],
    ['shared/api/http.ts', 'fs/promises'],
    ['shared/api/http.ts', 'next/headers'],
  ])('rejects %s → %s', (file, target) => expect(boundaryViolation(from(file), target, root)).toBeTruthy());
  it.each([
    ['(studio)/console/page.tsx', '@fe/app/providers/studio/StudioProvider'],
    ['(studio)/layout.tsx', '@fe/app/providers/studio/StudioFrame'],
    ['(studio)/report/page.tsx', '@fe/entities/event/model/types'],
    ['(studio)/console/page.tsx', '../../../src/frontend/app/providers/studio/StudioProvider'],
  ])('rejects Next root entry %s → %s (deep import, not the public API)', (file, target) => expect(boundaryViolation(fromRoot(file), target, root)).toBeTruthy());
  it.each([
    "import x from '@fe/app/providers/studio';",
    "import x from '@fe/shared/../app/providers/studio/StudioProvider';",
    "import('@fe/shared/../../../lib/db');",
    "export { x } from '@fe/app/providers/studio';",
    "export * from '@fe/app/providers/studio';",
    "import('@fe/app/providers/studio');",
    "require('@fe/app/providers/studio');",
    'import(target);',
    'require(target);',
  ])('checks module syntax: %s', (code) => {
    const linter = new Linter({ cwd: root });
    const messages = linter.verify(code, [{ plugins: { fsd: plugin }, rules: { 'fsd/boundaries': 'error' } }], { filename: from('features/example/test.js') });
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe('fsd/boundaries');
  });
  it.each([
    "import type { StudioState } from '@fe/app/providers/studio/types';",
    "export type { StudioState } from '@fe/app/providers/studio/types';",
    "type State = import('@fe/app/providers/studio/types').StudioState;",
  ])('checks TypeScript type-only paths: %s', async (code) => {
    const eslint = new ESLint({ cwd: root });
    const [result] = await eslint.lintText(code, { filePath: from('features/example/types.ts') });
    expect(result.messages.filter((message) => message.ruleId === 'fsd/boundaries')).toHaveLength(1);
  });
  it("checks TSImportEqualsDeclaration: import db = require('...')", async () => {
    const eslint = new ESLint({ cwd: root });
    const code = "import db = require('@fe/app/providers/studio/StudioProvider');";
    const [result] = await eslint.lintText(code, { filePath: from('features/example/requires.ts') });
    expect(result.messages.filter((message) => message.ruleId === 'fsd/boundaries')).toHaveLength(1);
  });
  // 리뷰 발견 — prefix 계산이 ESLint 실행 당시 context.cwd 기준이면, repo 루트가
  // 아닌 곳(하위 폴더 통합 실행 등)에서 돌릴 때 규칙이 조용히 꺼진다. 플러그인
  // 파일 자신의 위치로 고정했으니 cwd를 repo 루트가 아닌 곳으로 둬도 그대로 잡혀야 한다.
  it('stays active when ESLint runs with a non-root cwd', async () => {
    const eslint = new ESLint({ cwd: path.join(root, 'src') });
    const code = "import { x } from '@/lib/db';";
    const [result] = await eslint.lintText(code, { filePath: from('features/example/cwd.ts') });
    expect(result.messages.filter((message) => message.ruleId === 'fsd/boundaries')).toHaveLength(1);
  });
});
