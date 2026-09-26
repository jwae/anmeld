import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { parse } from '@vue/compiler-dom';
import { files, root, at, descriptor, template, classes, isProtected, walk } from './procedure-migration-lib.mjs';

const stage = process.argv[2];
const groups = {
  shell: /LoginCredentialsPage|AnmeldeverfahrenHeader/,
  procedures: /AnmeldeverfahrenView|VerfahrenUndRundenBereich|Anmeldeverfahren(?:Form|Liste)|Anmelderunden/,
  data: /Import|Kapazitaet|SchulenImVerfahren/,
  work: /AbgleichView|KoordinationView|OffeneFaelleView/,
  reports: /AuswertungenView/,
};
const write = (p, s) => fs.writeFileSync(path.join(root, p), s);
const marker = 'anm-procedure-ui';
const excluded = ':where(:not(.anm-procedure-ui))';
const designProperty = p => /^(background|border|box-shadow|color$|font|line-height|padding|height$|min-height$|transition|transform$|text-shadow|text-decoration|letter-spacing|white-space)/.test(p);

for (const p of files.filter(p => groups[stage]?.test(p) && !p.endsWith('.css'))) {
  const before = at(p), t = template(p, before), ast = parse(t), edits = [];
  const markedTags = new Set(), markedClasses = new Set();
  function visit(n, parent) {
    if (isProtected(n)) return;
    if (n.type === 1) {
      const old = classes(n), extra = [];
      const attr = name => n.props.find(p => p.type === 6 && p.name === name)?.value?.content;
      const hasProtected = (() => { let found = false; walk(n, c => { if (c !== n && isProtected(c)) found = true; }); return found; })();
      if (n.tag === 'button') {
        extra.push('anm-button');
        const event = n.props.find(p => p.type === 7 && p.name === 'on' && p.arg?.content === 'click')?.exp?.content || '';
        if (!/close|cancel|reset|back/i.test(event)) {
          if (/confirmDelete|deleteStudent|deleteAll|handleDelete|deleteSelected/i.test(event) || old.some(c => /danger|delete.*(?:submit|button)$/.test(c))) extra.push('anm-button--danger');
          else if (old.some(c => /primary|submit/.test(c)) || /handleNext|submit|save/.test(event)) extra.push('anm-button--primary');
        }
        if (old.some(c => /icon-button|nav-button|nav-icon-button/.test(c))) extra.push('anm-button--icon');
      } else if (['input', 'select', 'textarea'].includes(n.tag) && attr('type') !== 'hidden' && !old.includes('hidden-input')) {
        if (['checkbox', 'radio'].includes(attr('type'))) extra.push('anm-procedure-check-input');
        else extra.push('anm-input');
      } else if (/^h[1-6]$/.test(n.tag)) extra.push('anm-procedure-title');
      else if (n.tag === 'p' && !hasProtected) extra.push('anm-procedure-copy');
      else if (n.tag === 'span' && (old.includes('field-label') || parent?.tag === 'label')) extra.push('anm-label');
      else if (n.tag === 'label' && !hasProtected) {
        extra.push(n.children.some(c => c.type === 1 && c.tag === 'input' && c.props.some(p => p.name === 'type' && ['checkbox','radio'].includes(p.value?.content))) ? 'anm-check' : 'anm-field');
      } else if (!hasProtected && old.some(c => /feedback-panel$|^anm-overlay-feedback$|^anm-loading-state$/.test(c))) {
        extra.push('anm-alert');
        if (old.some(c => /error/.test(c))) extra.push('anm-status--danger');
        else if (old.some(c => /success/.test(c))) extra.push('anm-status--success');
      }
      if (extra.length) {
        extra.push(marker);
        markedTags.add(n.tag);
        for (const c of old) markedClasses.add(c);
        for (const prop of n.props) if (prop.type === 7 && prop.arg?.content === 'class') {
          for (const c of prop.exp?.content.match(/[\w-]+/g) || []) markedClasses.add(c);
        }
      }
      if (old.some(c => /(?:^anm-card$|roadmap-card$|overlay-card$|dialog$|modal$|modal-content$|mapping-card$|^auswertung-card$|^anm-section$)/.test(c))) extra.push('anm-procedure-surface');
      if (n.tag === 'UserSessionCard') extra.push('anm-procedure-session');
      if (extra.length) {
        const prop = n.props.find(p => p.type === 6 && p.name === 'class');
        const cls = [...old.filter(c => !(extra.includes('anm-button') && /^btn-(primary|secondary|danger)$/.test(c))), ...extra].join(' ');
        if (prop) edits.push([prop.loc.start.offset, prop.loc.end.offset, `class="${cls}"`]);
        else edits.push([n.loc.start.offset + n.tag.length + 1, n.loc.start.offset + n.tag.length + 1, ` class="${cls}"`]);
      }
    }
    for (const c of n.children || []) visit(c, n);
  }
  visit(ast);
  let next = t;
  for (const [start, end, value] of edits.sort((a,b) => b[0] - a[0])) next = next.slice(0,start) + value + next.slice(end);

  function migrateCss(css) {
    const sheet = postcss.parse(css);
    const rules = []; sheet.walkRules(r => rules.push(r));
    for (const rule of rules) {
      if (rule.parent.type === 'atrule' && /keyframes/.test(rule.parent.name)) continue;
      const selectors = rule.selectors.map(selector => {
        const terminal = selector.trim().split(/\s+(?![^()]*\))/).at(-1);
        const tokens = [...terminal.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
        const tag = terminal.match(/^(?:\:deep\()?([a-z][\w-]*)/)?.[1];
        if (!tokens.some(c => markedClasses.has(c)) && !markedTags.has(tag)) return selector;
        if (selector.includes(':deep(')) return selector.replace(/:deep\(([^)]+)\)/g, `:deep($1${excluded})`);
        const pseudo = selector.indexOf('::');
        return pseudo < 0 ? selector + excluded : selector.slice(0,pseudo) + excluded + selector.slice(pseudo);
      });
      if (selectors.join(',') === rule.selectors.join(',')) continue;
      const design = rule.nodes.filter(n => n.type === 'decl' && designProperty(n.prop));
      if (!design.length) continue;
      const layout = rule.nodes.filter(n => n.type === 'decl' && !designProperty(n.prop));
      if (layout.length) {
        const clone = rule.cloneAfter({ selector: selectors.join(',\n') });
        clone.removeAll(); for (const n of design) clone.append(n.clone());
        for (const n of design) n.remove();
      } else rule.selector = selectors.join(',\n');
    }
    return sheet.toString();
  }
  let output = p.endsWith('.html') ? next : before.replace(t, next);
  if (p.endsWith('.vue')) {
    for (const style of descriptor(before).styles) {
      if (style.src) {
        const cssPath = path.posix.normalize(path.posix.join(path.posix.dirname(p), style.src));
        // External templates are transformed separately, below.
        if (!descriptor(before).template?.src) write(cssPath, migrateCss(at(cssPath)));
      } else output = output.replace(style.content, migrateCss(style.content));
    }
  } else {
    const cssPath = p.replace(/\.html$/, '.css');
    write(cssPath, migrateCss(at(cssPath)));
  }
  if (p.endsWith('AnmeldeverfahrenView.vue')) output = output.replace('.anm-roadmap-card p,\n.anm-roadmap-card p', '.anm-roadmap-card p');
  write(p, output);
  console.log(`${p}: ${edits.length} presentation elements`);
}
