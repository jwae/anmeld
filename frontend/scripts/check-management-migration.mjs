// Read-only regression checks for the administration design migration.
// Run from frontend: node scripts/check-management-migration.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parse } from "@vue/compiler-dom";
import postcss from "postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const original = "dbe48f8"; // Before the design migration; never rewritten by this test.
const resumed = "93a98dc"; // User's committed login and central design system.
const normalize = text => text.replaceAll("\r\n", "\n");
const read = p => normalize(fs.readFileSync(path.join(root, p), "utf8"));
const at = (revision, p) => normalize(execFileSync("git", ["show", `${revision}:${p}`], { cwd: root, encoding: "utf8" }));
const names = ["APPManagement", "UserManagementPanel", "SchoolManagement", "SchoolGroupManagement", "CatalogManagement", "AppProtocol"];
const template = s => s.includes("<script") ? s.match(/<template>([\s\S]*)<\/template>/)[1] : s;
const script = s => s.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const classes = n => (n.props?.find(p => p.type === 6 && p.name === "class")?.value?.content || "").split(/\s+/);
const walk = (node, fn) => { fn(node); for (const child of node.children || []) walk(child, fn); };
function protectedRegions(text) {
  const regions = [];
  function visit(n) {
    if (n.type === 1 && (n.tag === "table" || classes(n).some(c => /table-wrap$|school-management-table-card$|school-group-table-toolbar$|app-protocol-filters$/.test(c)))) {
      regions.push(n.loc.source);
    } else for (const child of n.children || []) visit(child);
  }
  visit(parse(template(text)));
  return regions;
}
function bindings(text) {
  const result = [];
  walk(parse(template(text)), n => {
    for (const p of n.props || []) {
      if (p.type !== 7) continue;
      // Class and accessible-state presentation may change; application bindings may not.
      const arg = p.arg?.content || "";
      if (p.name === "bind" && (arg === "class" || arg.startsWith("aria-"))) continue;
      result.push([p.name, arg, p.exp?.content || "", p.modifiers.map(m => m.content)]);
    }
    if (n.type === 5) result.push(["interpolation", n.content.content]);
  });
  return result;
}
function tableRules(css, regions) {
  const classSet = new Set();
  const tags = new Set();
  for (const region of regions) walk(parse(region), n => {
    if (n.type !== 1) return;
    tags.add(n.tag);
    for (const c of classes(n)) classSet.add(c);
    for (const p of n.props) if (p.type === 7 && p.arg?.content === "class") {
      for (const value of p.exp?.content.match(/[\w-]+/g) || []) classSet.add(value);
    }
  });
  const result = {};
  postcss.parse(css).walkRules(rule => {
    for (let selector of rule.selectors) {
      selector = selector.replaceAll(":where(:not(.anm-migrated))", "");
      const tokens = [...selector.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
      if (tokens.length ? !tokens.every(c => classSet.has(c)) : !tags.has(selector.match(/^\w+/)?.[0])) continue;
      const media = []; let parent = rule.parent;
      while (parent?.type === "atrule") { media.unshift(`${parent.name} ${parent.params}`); parent = parent.parent; }
      const key = `${media.join("|")}|${selector}`;
      result[key] ||= {};
      for (const d of rule.nodes) if (d.type === "decl") result[key][d.prop] = d.value + (d.important ? " !important" : "");
    }
  });
  return result;
}

let regions = 0;
for (const name of names) {
  const prefix = `frontend/src/components/${name}`;
  const beforeScript = script(at(original, `${prefix}.vue`));
  const currentScript = script(read(`${prefix}.vue`)).replace("./ManagementSessionCard.vue", "./UserSessionCard.vue");
  assert.equal(currentScript, beforeScript, `${name}: business script changed`);
  const p = fs.existsSync(path.join(root, `${prefix}.html`)) ? `${prefix}.html` : `${prefix}.vue`;
  const before = at(original, p), current = read(p);
  const protectedBefore = protectedRegions(before);
  assert.deepEqual(protectedRegions(current), protectedBefore, `${name}: table/filter region changed`);
  assert.deepEqual(bindings(current), bindings(before), `${name}: data/event/permission bindings changed`);
  if (protectedBefore.length) assert.deepEqual(
    tableRules(read(`${prefix}.css`), protectedBefore),
    tableRules(at(original, `${prefix}.css`), protectedBefore),
    `${name}: declarations relevant to legacy tables changed`,
  );
  regions += protectedBefore.length;
  walk(parse(template(current)), n => {
    if (n.type !== 1 || n.tag !== "button") return;
    const event = n.props.find(p => p.type === 7 && p.name === "on" && p.arg?.content === "click")?.exp?.content || "";
    if (/^(close|cancel)/i.test(event)) assert.ok(!classes(n).includes("anm-button--danger"), `${name}: close/cancel styled as danger`);
  });
}

for (const p of ["App.vue", "App.html", "App.css", "Login.css", "main.ts", "styles/components.css", "styles/tokens.css", "styles/index.css", "components/UserSessionCard.vue", "components/UserSessionCard.html", "components/UserSessionCard.css", "components/HelpOverlay.vue"]) {
  assert.equal(read(`frontend/src/${p}`), at(resumed, `frontend/src/${p}`), `Protected file changed: ${p}`);
}

const catalog = read("frontend/src/components/CatalogManagement.html");
assert.ok(catalog.includes("'anm-button--primary': catalog.name === selectedCatalogName"), "Catalog selection must use new button state");
assert.ok(read("frontend/src/styles/management.css").includes(".anm-migrated.anm-managed-dialog"), "Missing dialog style");
const panel = read("frontend/src/components/UserManagementPanel.html");
for (const tab of ["users", "groups", "schools", "school-groups", "catalogs", "protocol"]) {
  assert.ok(panel.includes(`id="management-tab-${tab}"`) && panel.includes(`aria-labelledby="management-tab-${tab}"`));
  assert.ok(panel.includes(`id="management-panel-${tab}"`) && panel.includes(`aria-controls="management-panel-${tab}"`));
}
console.log(`PASS: ${names.length} business scripts, data/event bindings, ${regions} table/filter regions and their CSS, protected screens, and repaired UI states.`);
console.log("Static regression check only; browser geometry, focus and live API workflows still require visual/integration checks.");

// Procedure files now have their own pinned source and protected-region checks.
await import("./check-procedure-migration.mjs");
