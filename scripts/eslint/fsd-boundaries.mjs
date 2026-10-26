import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

// `context.cwd`는 ESLint를 어디서 실행했느냐에 따라 바뀐다 — repo 루트가 아닌
// 하위 폴더에서 돌리면(예: 에디터 통합, `cd src && eslint ...`) prefix 계산이
// 전부 틀어져 이 규칙이 조용히 꺼진다(리뷰 발견). 이 플러그인 파일 자신의 위치로
// 고정 경로를 잡는다 — `scripts/eslint/`에서 두 단계 위가 repo 루트다.
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
const serverBuiltins = new Set(builtinModules);
const normalize = (value) => value.replaceAll('\\', '/').replace(/\.(tsx?|jsx?|mjs)$/, '').replace(/\/index$/, '');

// Root/server lib a slice may reach only through a named adapter — add an entry
// here (not a new `file ===` branch) when another entity needs the same shape.
const contractAdapters = [
  { file: 'entities/event/lib/rules', allowed: new Set(['slug', 'status', 'event-limits', 'event-slug', 'demo-sessions', 'agenda-limits']) },
];

// Deep paths that are themselves the intended public entry (ssr:false client
// shims, Next's own global style/font setup) — add here, not inline below.
const extraPublicEntries = new Set(['features/view-document/client', 'app/styles/font', 'app/styles/globals.css']);

function deepImportBlocked(targetLayer, targetSlice, rest) {
  if (targetLayer === 'shared' || !rest.length) return false;
  return !extraPublicEntries.has([targetLayer, targetSlice, ...rest].join('/'));
}

/** Resolve both aliases and relative paths before applying the same boundary rules. */
export function boundaryViolation(filename, specifier, root) {
  const file = normalize(path.resolve(filename));
  const base = normalize(path.resolve(root));
  const prefix = `${base}/src/frontend/`;
  const insideFrontend = file.startsWith(prefix);
  // Next's own `app/` composition root sits outside src/frontend and isn't
  // part of the layer graph, but it must still reach slices through their
  // public API rather than importing internals directly.
  const isRootEntry = !insideFrontend && file.startsWith(`${base}/app/`);
  if (!insideFrontend && !isRootEntry) return null;
  const [layer, slice] = insideFrontend ? file.slice(prefix.length).split('/') : [];
  let target;
  if (specifier.startsWith('@fe/')) target = `${prefix}${specifier.slice(4)}`;
  else if (specifier.startsWith('@/')) target = `${base}/${specifier.slice(2)}`;
  else if (specifier.startsWith('.')) target = path.resolve(path.dirname(filename), specifier);
  else if (path.isAbsolute(specifier)) target = specifier;
  else {
    if (insideFrontend && (serverBuiltins.has(specifier) || /^(node:|server-only$|@opennextjs\/|cloudflare:|next\/(headers|server)(\/|$))/.test(specifier))) return 'Server modules cannot enter the frontend.';
    return null;
  }
  // Alias expansion must resolve dot segments too; otherwise shared/../app
  // is classified as shared and can bypass both layer and server boundaries.
  target = normalize(path.resolve(target));
  if (!target.startsWith(prefix)) {
    if (isRootEntry) return null; // root entry reaching lib/server/assets directly is outside this rule
    const contract = target.slice(`${base}/lib/`.length);
    if (contractAdapters.some((adapter) => file === `${prefix}${adapter.file}` && target.startsWith(`${base}/lib/`) && adapter.allowed.has(contract))) return null;
    return 'Root/server modules must not enter the frontend; use the event contract adapter.';
  }
  const [targetLayer, targetSlice, ...rest] = target.slice(prefix.length).split('/');
  if (!layers.includes(targetLayer)) return 'Unknown frontend layer.';
  if (isRootEntry) return deepImportBlocked(targetLayer, targetSlice, rest) ? 'Use the target slice public API instead of a deep import.' : null;
  if (!layers.includes(layer)) return 'Unknown frontend layer.';
  if (layers.indexOf(targetLayer) < layers.indexOf(layer)) return 'Upward layer dependencies are forbidden.';
  const segmented = layer === 'app' || layer === 'shared';
  if (layer === targetLayer) {
    if (!segmented && slice !== targetSlice) return 'Different slices in the same layer cannot depend on one another.';
    if (!segmented && !specifier.startsWith('.')) return 'Use relative imports inside a slice.';
    return null;
  }
  return deepImportBlocked(targetLayer, targetSlice, rest) ? 'Use the target slice public API instead of a deep import.' : null;
}

const rule = {
  meta: { type: 'problem', schema: [], messages: { boundary: '{{reason}}', dynamic: 'Use a static string module path so frontend boundaries can be checked.' } },
  create(context) {
    function check(source, node) {
      if (!source || typeof source.value !== 'string') {
        context.report({ node, messageId: 'dynamic' });
        return;
      }
      const reason = boundaryViolation(context.filename, source.value, PROJECT_ROOT);
      if (reason) context.report({ node: source, messageId: 'boundary', data: { reason } });
    }
    return {
      ImportDeclaration: (node) => check(node.source, node),
      ExportNamedDeclaration: (node) => { if (node.source) check(node.source, node); },
      ExportAllDeclaration: (node) => check(node.source, node),
      ImportExpression: (node) => check(node.source, node),
      TSImportType: (node) => { const source = node.source ?? node.argument ?? node.parameter; check(source?.literal ?? source, node); },
      // `import db = require('@/lib/db')` — `@typescript-eslint/no-require-imports`만
      // 이 형태를 잡고 있었다. 그 규칙을 끄면 경계 검사 없이 서버 모듈이 들어온다(리뷰 발견).
      TSImportEqualsDeclaration: (node) => {
        if (node.moduleReference.type === 'TSExternalModuleReference') check(node.moduleReference.expression, node);
      },
      CallExpression: (node) => { if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node.arguments[0], node); },
    };
  },
};

const plugin = { rules: { boundaries: rule } };
export default plugin;
