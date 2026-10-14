// Show a GHL workflow export: header, triggers, then a diff against the newest earlier export of the same workflow
// (matched by _id in the same folder), or the full step tree when there is none.
// Usage: node .claude/skills/ghl-workflow-export/inspect.js <export.json> [<older-export.json> | --tree]
const fs = require("fs");
const path = require("path");

const NOISE = new Set(["nestedDropdownTypes", "allowIsOperatorTypes", "_softDeletedFallbackCache", "__segmentId", "__conditionId",
  "ifElseNodeId", "showErrors", "branchNameError", "__customInputs__", "previewUrl", "trackingOptions", "createdAt", "updatedAt"]);
const clean = o => JSON.stringify(o, (k, v) => (NOISE.has(k) ? undefined : v));
const MAX = 900;
const load = f => JSON.parse(fs.readFileSync(f, "utf8"));
const steps = wf => (wf.workflowData && wf.workflowData.templates) || [];
const nexts = s => [].concat(s.next || []);

function previousExport(file, wf) {
  const dir = path.dirname(file);
  let best = null;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const full = path.join(dir, f);
    if (path.resolve(full) === path.resolve(file)) continue;
    let o; try { o = load(full); } catch { continue; }
    if (o._id === wf._id && o.version < wf.version && (!best || o.version > best.version)) best = { file: full, version: o.version };
  }
  return best && best.file;
}

function header(wf) {
  console.log(`${wf.name} | ${wf.status} | v${wf.version} | id ${wf._id}`);
  const keys = ["allowMultiple", "allowMultipleOpportunity", "stopOnResponse", "removeContactFromLastStep", "timezone"];
  console.log("settings: " + keys.map(k => `${k}=${JSON.stringify(wf[k])}`).join(" "));
  console.log("triggers (each one starts the workflow; filters inside a trigger AND together):");
  for (const t of wf.newTriggers || []) console.log("  " + trigger(t));
}

function trigger(t) {
  const conds = (t.conditions || []).map(c => `${c.title || c.field} ${c.operator} ${JSON.stringify(c.value)}`).join(" AND ");
  return `${t.type} "${t.name}"${t.deleted ? " [deleted]" : ""}: ${conds || "(no filters)"}`;
}

// One line per If/Else branch, so the AND/OR joining its conditions stays visible.
function branches(a, ind) {
  const cond = c => [c.conditionSubType || c.conditionType, c.conditionOperator, c.conditionValueOperator,
    c.conditionValue === undefined ? "" : JSON.stringify(c.conditionValue), c.conditionValueUnit].filter(Boolean).join(" ");
  const lines = a.branches.map(b => `branch "${b.name}": ` + (b.segments || [])
    .map(seg => "(" + (seg.conditions || []).map(cond).join(` ${(seg.operator || "and").toUpperCase()} `) + ")")
    .join(` ${(b.operator || "and").toUpperCase()} `));
  return [...lines, `else-branch "${a.noneBranchName || "None"}"`].join(`\n${ind}    `);
}

function describe(s, byId, ind = "") {
  const a = s.attributes || {};
  if (s.type === "goto") return `-> "${(byId.get(a.targetNodeId) || {}).name || a.targetNodeId}"`;
  if (s.type === "if_else" && Array.isArray(a.branches) && a.branches.length) return branches(a, ind);
  return clean(a).slice(0, MAX);
}

function tree(wf) {
  const all = steps(wf), byId = new Map(all.map(s => [s.id, s])), seen = new Set();
  const walk = (id, ind) => {
    const s = byId.get(id);
    if (!s || seen.has(id)) return;
    seen.add(id);
    const end = nexts(s).length === 0 ? "   [END of path]" : "";
    // A branch marker is the If/Else child that names one branch; its steps print indented beneath it.
    const marker = s.type === "if_else" && !(s.attributes && Array.isArray(s.attributes.branches) && s.attributes.branches.length);
    if (marker) console.log(`${ind}> branch "${s.name}"${end}`);
    else console.log(`${ind}- [${s.type}] ${s.name}${end}\n${ind}    ${describe(s, byId, ind)}`);
    const childInd = nexts(s).length > 1 ? ind + "    " : marker ? ind + "  " : ind;
    for (const n of nexts(s)) walk(n, childInd);
  };
  console.log(`\nSTEPS (${all.length}):`);
  for (const r of all.filter(s => !s.parentKey)) walk(r.id, "");
  const unreached = all.filter(s => !seen.has(s.id));
  if (unreached.length) console.log("\nUNREACHED steps: " + unreached.map(s => s.name).join(", "));
}

function diff(oldWf, wf) {
  console.log(`\nDIFF v${oldWf.version} -> v${wf.version}`);
  let changes = 0;
  const say = line => { changes++; console.log(line); };

  const oldT = new Map((oldWf.newTriggers || []).map(t => [t.id, t]));
  const newT = new Map((wf.newTriggers || []).map(t => [t.id, t]));
  for (const [id, t] of newT) {
    const o = oldT.get(id);
    if (!o) say(`+ TRIGGER ${trigger(t)}`);
    else if (trigger(o) !== trigger(t)) say(`~ TRIGGER\n    OLD: ${trigger(o)}\n    NEW: ${trigger(t)}`);
  }
  for (const [id, t] of oldT) if (!newT.has(id)) say(`- TRIGGER ${trigger(t)}`);

  const A = new Map(steps(oldWf).map(s => [s.id, s])), B = new Map(steps(wf).map(s => [s.id, s]));
  const nm = id => (B.get(id) || A.get(id) || { name: id }).name;
  const nextNames = s => nexts(s).map(nm).join(", ") || "(end)";
  for (const [id, s] of B) {
    const o = A.get(id);
    if (!o) { say(`\n+ NEW [${s.type}] ${s.name} | after: ${nm(s.parentKey) || "-"} | next: ${nextNames(s)}\n    ${describe(s, B)}`); continue; }
    const ca = clean(o.attributes), cb = clean(s.attributes);
    const moved = nextNames(o) !== nextNames(s);
    if (ca === cb && o.name === s.name && !moved) continue;
    say(`\n~ CHANGED [${s.type}] ${o.name === s.name ? s.name : `${o.name} -> ${s.name}`}${moved ? ` | next: ${nextNames(o)} -> ${nextNames(s)}` : ""}`);
    if (ca !== cb) console.log(`    OLD: ${describe(o, A, "    ")}\n    NEW: ${describe(s, B, "    ")}`);
  }
  for (const [id, s] of A) if (!B.has(id)) say(`\n- REMOVED [${s.type}] ${s.name}`);
  if (!changes) console.log("no trigger or step changes");
}

function inspect(file, against) {
  const wf = load(file);
  header(wf);
  const older = against === "--tree" ? null : against || previousExport(file, wf);
  if (older) {
    console.log(`compared with: ${path.basename(older)}`);
    diff(load(older), wf);
  } else tree(wf);
}

module.exports = { inspect };
if (require.main === module) {
  if (!process.argv[2]) { console.error("usage: node inspect.js <export.json> [<older-export.json> | --tree]"); process.exit(1); }
  inspect(process.argv[2], process.argv[3]);
}
