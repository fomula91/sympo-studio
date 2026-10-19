import path from 'node:path';
import { builtinModules } from 'node:module';

const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
const contracts = new Set(['slug', 'status', 'event-limits', 'event-slug', 'demo-sessions']);
const serverBuiltins = new Set(builtinModules);
const normalize = (value) => value.replaceAll('\\', '/').replace(/\.(tsx?|jsx?|mjs)$/, '').replace(/\/index$/, '');

/** Resolve both aliases and relative paths before applying the same boundary rules. */
export function boundaryViolation(filename, specifier, root) {
  const file = normalize(path.resolve(filename));
  const base = normalize(path.resolve(root));
  const prefix = `${base}/src/frontend/`;
  if (!file.startsWith(prefix)) return null;
  const [layer, slice] = file.slice(prefix.length).split('/');
  let target;
  if (specifier.startsWith('@fe/')) target = `${prefix}${specifier.slice(4)}`;
  else if (specifier.startsWith('@/')) target = `${base}/${specifier.slice(2)}`;
  else if (specifier.startsWith('.')) target = path.resolve(path.dirname(filename), specifier);
  else if (path.isAbsolute(specifier)) target = specifier;
  else {
    if (serverBuiltins.has(specifier) || /^(node:|server-only$|@opennextjs\/|cloudflare:|next\/(headers|server)(\/|$))/.test(specifier)) return 'Server modules cannot enter the frontend.';
    return null;
  }
  target = normalize(target);
  if (!target.startsWith(prefix)) {
    const contract = target.slice(`${base}/lib/`.length);
    if (file === `${prefix}entities/event/lib/rules` && target.startsWith(`${base}/lib/`) && contracts.has(contract)) return null;
    return 'Root/server modules must not enter the frontend; use the event contract adapter.';
  }
  const [targetLayer, targetSlice, ...rest] = target.slice(prefix.length).split('/');
  if (!layers.includes(targetLayer) || !layers.includes(layer)) return 'Unknown frontend layer.';
  if (layers.indexOf(targetLayer) < layers.indexOf(layer)) return 'Upward layer dependencies are forbidden.';
  const segmented = layer === 'app' || layer === 'shared';
  if (layer === targetLayer) {
    if (!segmented && slice !== targetSlice) return 'Different slices in the same layer cannot depend on one another.';
    if (!segmented && !specifier.startsWith('.')) return 'Use relative imports inside a slice.';
    return null;
  }
  if (targetLayer !== 'shared' && rest.length && !(targetLayer === 'features' && targetSlice === 'view-document' && rest.join('/') === 'client')) {
    return 'Use the target slice public API instead of a deep import.';
  }
  return null;
}

const rule = {
  meta: { type: 'problem', schema: [], messages: { boundary: '{{reason}}', dynamic: 'Use a static string module path so frontend boundaries can be checked.' } },
  create(context) {
    function check(source, node) {
      if (!source || typeof source.value !== 'string') {
        context.report({ node, messageId: 'dynamic' });
        return;
      }
      const reason = boundaryViolation(context.filename, source.value, context.cwd);
      if (reason) context.report({ node: source, messageId: 'boundary', data: { reason } });
    }
    return {
      ImportDeclaration: (node) => check(node.source, node),
      ExportNamedDeclaration: (node) => { if (node.source) check(node.source, node); },
      ExportAllDeclaration: (node) => check(node.source, node),
      ImportExpression: (node) => check(node.source, node),
      TSImportType: (node) => { const source = node.source ?? node.argument ?? node.parameter; check(source?.literal ?? source, node); },
      CallExpression: (node) => { if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node.arguments[0], node); },
    };
  },
};

const plugin = { rules: { boundaries: rule } };
export default plugin;
