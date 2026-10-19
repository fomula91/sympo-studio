import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESLint, Linter } from 'eslint';
import plugin, { boundaryViolation } from './fsd-boundaries.mjs';

const root = process.cwd();
const from = (name) => path.join(root, 'src/frontend', name);
describe('FSD boundaries', () => {
  it.each([
    ['pages/editor/ui/Screen.tsx', '@fe/entities/event'],
    ['features/view-document/ui/PdfViewer.tsx', '@fe/shared/api/http'],
    ['entities/event/model/defaults.ts', '../lib/rules'],
    ['entities/event/lib/rules.ts', '@/lib/status'],
    ['widgets/participant-site/ui/Microsite.tsx', '@fe/features/view-document/client'],
    ['app/providers/studio/Provider.tsx', '@fe/app/providers/studio/types'],
  ])('allows %s → %s', (file, target) => expect(boundaryViolation(from(file), target, root)).toBeNull());
  it.each([
    ['features/account-menu/ui/Menu.tsx', '@fe/app/providers/studio'],
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
    "import x from '@fe/app/providers/studio';",
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
});
