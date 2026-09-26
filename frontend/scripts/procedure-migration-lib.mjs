import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { parse } from '@vue/compiler-dom';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const baseline = '93a98dcf74b6aab8c68aef486c06b12ab1402cab';
export const normalize = s => s.replaceAll('\r\n', '\n');
export const read = p => normalize(fs.readFileSync(path.join(root, p), 'utf8'));
export const at = p => normalize(execFileSync('git', ['show', `${baseline}:${p}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
export const descriptor = s => parseSfc(s).descriptor;
export const template = (p, s) => p.endsWith('.html') ? s : descriptor(s).template?.content || '';
export const classes = n => (n.props?.find(p => p.type === 6 && p.name === 'class')?.value?.content || '').split(/\s+/).filter(Boolean);
export const walk = (n, fn) => { fn(n); for (const c of n.children || []) walk(c, fn); };

// Explicitly scoped to the existing procedure component graph. Shared session,
// login and management components are separately protected by SHA-256 hashes.
const seen = new Set();
function collect(p) {
  if (seen.has(p) || p.endsWith('/UserSessionCard.vue')) return;
  seen.add(p);
  const s = at(p);
  for (const match of (descriptor(s).scriptSetup?.content || '').matchAll(/import .*? from ["']([^"']+\.vue)["']/g)) {
    collect(path.posix.normalize(path.posix.join(path.posix.dirname(p), match[1])));
  }
  for (const block of [descriptor(s).template, ...descriptor(s).styles]) {
    if (block?.src) seen.add(path.posix.normalize(path.posix.join(path.posix.dirname(p), block.src)));
  }
}
collect('frontend/src/components/LoginCredentialsPage.vue');
export const files = [...seen].sort();

export function isProtected(n) {
  if (n.type !== 1) return false;
  if (n.tag === 'table') return true;
  return classes(n).some(c => /(?:table-wrap|table-scroll|table-container|table-toolbar|filter-card|filters|filter-row|anm-toggle-row)$/.test(c));
}
export function regions(p, s) {
  const result = [];
  function visit(n) {
    if (isProtected(n)) result.push(n.loc.source);
    else for (const child of n.children || []) visit(child);
  }
  visit(parse(template(p, s)));
  return result;
}
export function bindings(p, s) {
  const result = [];
  walk(parse(template(p, s)), n => {
    for (const prop of n.props || []) {
      if (prop.type !== 7) continue;
      const arg = prop.arg?.content || '';
      if (prop.name === 'bind' && arg.startsWith('aria-')) continue;
      result.push([prop.name, arg, prop.exp?.content || '', prop.modifiers.map(m => m.content)]);
    }
    if (n.type === 5) result.push(['text', n.content.content]);
  });
  return result;
}
