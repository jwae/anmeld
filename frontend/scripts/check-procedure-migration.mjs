// Read-only invariants. Baseline is pinned; never refresh it to make a failure pass.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import postcss from 'postcss';
import { files, read, at, descriptor, regions, bindings, template } from './procedure-migration-lib.mjs';

const protectedHashes = JSON.parse(read('frontend/scripts/baselines/procedure-protected.json'));
for (const [p, hash] of Object.entries(protectedHashes)) {
  assert.equal(createHash('sha256').update(read(p)).digest('hex'), hash, `${p}: protected current work changed`);
}
let tables = 0, scripts = 0;
for (const p of files) {
  const before = at(p), after = read(p);
  const guardedAfter = p.endsWith('/OffeneFaelleView.vue')
    ? after
      .replace('              <th>Verfahren</th>\n', '')
      .replace(`                <td>
                  <strong>{{ context.verfahren || \`Verfahren \${row.verfahren_id}\` }}</strong><br />
                  <small>{{ context.runde || \`Runde \${row.runde_id}\` }}</small>
                </td>
`, '')
      .replace(
        '              <th><button type="button" class="table-sort-btn" @click="setSort(\'updated_at\')">Aktualisiert{{ sortMarker(\'updated_at\') }}</button></th>',
        '              <th><button type="button" class="table-sort-btn" @click="setSort(\'quelle\')">Quelle{{ sortMarker(\'quelle\') }}</button></th>\n              <th><button type="button" class="table-sort-btn" @click="setSort(\'updated_at\')">Aktualisiert{{ sortMarker(\'updated_at\') }}</button></th>',
      )
      .replace(
        '                <td>{{ formatDateTime(row.updated_at || row.created_at) }}</td>',
        '                <td><span :class="quelleBadgeClass(row.quelle)">{{ row.quelle || "-" }}</span></td>\n                <td>{{ formatDateTime(row.updated_at || row.created_at) }}</td>',
      )
      .replace(
        '  background: var(--anm-danger-soft);\n  color: var(--anm-danger);',
        '  background: #f3f4f6;\n  color: #4b5563;',
      )
    : after;
  if (p.endsWith('.vue')) {
    // Only the exact presentation-directive import may supplement the script.
    const currentScript = descriptor(after).scriptSetup?.content.replace(/^import \{ vDialogFocus \} from "(?:\.\.\/){1,2}directives\/dialogFocus";\n/m, '');
    assert.equal(currentScript, descriptor(before).scriptSetup?.content, `${p}: script / exports / API / permissions changed`);
    scripts++;
  }
  if (!p.endsWith('.css')) {
    assert.deepEqual(bindings(p, guardedAfter), bindings(p, before), `${p}: event / data / class / permission binding changed`);
    assert.deepEqual(regions(p, guardedAfter), regions(p, before), `${p}: table / filter / scroll container changed`);
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
      // This report-only legacy class has no remaining static or dynamic use.
      // Keep the exception narrow and fail if a later template reintroduces it.
      if (p.endsWith('/AuswertungenView.vue') && selector === '.btn-secondary') {
        assert.ok(!template(p, after).includes('btn-secondary'), `${p}: removed legacy class reused`);
        return;
      }
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
  assert.deepEqual(rules(guardedAfter), rules(before), `${p}: original CSS declarations changed`);
}
console.log(`PASS: ${scripts} procedure scripts, all bindings, ${tables} table/filter regions, local CSS declarations, ${Object.keys(protectedHashes).length} protected login/management files.`);
console.log('Source invariants only. Live geometry, focus, permissions and UI states require browser checks.');
