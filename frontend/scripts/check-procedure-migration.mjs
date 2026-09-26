// Read-only invariants. Baseline is pinned; never refresh it to make a failure pass.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
import { files, read, at, descriptor, regions, bindings } from './procedure-migration-lib.mjs';

const protectedHashes = JSON.parse(read('frontend/scripts/baselines/procedure-protected.json'));
for (const [p, hash] of Object.entries(protectedHashes)) {
  assert.equal(createHash('sha256').update(read(p)).digest('hex'), hash, `${p}: protected current work changed`);
}
let tables = 0, scripts = 0;
for (const p of files) {
  const before = at(p), after = read(p);
  if (p.endsWith('.vue')) {
    assert.equal(descriptor(after).scriptSetup?.content, descriptor(before).scriptSetup?.content, `${p}: script / exports / API / permissions changed`);
    scripts++;
  }
  if (!p.endsWith('.css')) {
    assert.deepEqual(bindings(p, after), bindings(p, before), `${p}: event / data / class / permission binding changed`);
    assert.deepEqual(regions(p, after), regions(p, before), `${p}: table / filter / scroll container changed`);
    tables += regions(p, before).length;
  }
  // Local declarations remain byte-equivalent at CSS AST level. Only the
  // zero-specificity exclusion on opted-in controls is allowed. Header/shell
  // contain no tables and are reviewed separately; unused rules are allowlisted.
  if (/LoginCredentialsPage\.css$|AnmeldeverfahrenHeader\.css$/.test(p)) continue;
  const css = s => p.endsWith('.css') ? s : descriptor(s).styles.filter(b => !b.src).map(b => b.content).join('\n');
  function rules(s) {
    const result = {};
    postcss.parse(css(s)).walkRules(rule => {
      let selector = rule.selector.replaceAll(':where(:not(.anm-procedure-ui))', '');
      // A duplicated selector in the original roadmap rule is redundant.
      selector = [...new Set(selector.split(',').map(v => v.trim()))].join(',');
      const media = []; let parent = rule.parent;
      while (parent?.type === 'atrule') { media.unshift(`${parent.name} ${parent.params}`); parent = parent.parent; }
      for (const part of selector.split(',')) {
        const key = `${media.join('|')}|${part.trim()}`;
        result[key] ||= {};
        for (const n of rule.nodes.filter(n => n.type === 'decl')) result[key][n.prop] = [n.value, !!n.important];
      }
    });
    return result;
  }
  assert.deepEqual(rules(after), rules(before), `${p}: original CSS declarations changed`);
}
console.log(`PASS: ${scripts} procedure scripts, all bindings, ${tables} table/filter regions, local CSS declarations, ${Object.keys(protectedHashes).length} protected login/management files.`);
console.log('Source invariants only. Live geometry, focus, permissions and UI states require browser checks.');
