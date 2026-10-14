// Decode a GHL workflow-builder save request ("Copy as cURL (bash)") into WorkflowJSON/<name> - v<version>.json,
// then print the inspect.js view (diff against the previous export, or the full tree on a first export).
// Reads the cURL from the clipboard, or from a file path given as the first argument. Only the request body is
// written; the headers (which carry the user's GHL session token) are never written or printed.
// Run from the project root; exports land in <project root>/WorkflowJSON/.
// Usage: node <skill dir>/decode.js [curl-file]
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { inspect } = require("./inspect");

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "WorkflowJSON");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function readClipboard() {
  const cmds = {
    win32: ['powershell.exe -NoProfile -Command "Get-Clipboard -Raw"'],
    darwin: ["pbpaste"],
  }[process.platform] || ["wl-paste --no-newline", "xclip -selection clipboard -o", "xsel --clipboard --output"];
  for (const cmd of cmds) {
    try { return execSync(cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); } catch {}
  }
  fail(`could not read the clipboard (tried: ${cmds.join(", ")}). Save the cURL to a file and pass its path instead.`);
}

const src = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : readClipboard();

const m = src.match(/--data(?:-raw|-binary)?\s+(\$?)'/);
if (!m) fail("the clipboard is not a workflow save request (no --data-raw body). Re-copy the PUT row with Copy as cURL (bash).");
const ansiC = m[1] === "$";

// Collect the quoted body up to the first unescaped closing quote.
let i = m.index + m[0].length, raw = "";
while (i < src.length) {
  const c = src[i];
  if (ansiC && c === "\\") { raw += c + src[i + 1]; i += 2; continue; }
  if (c === "'") break;
  raw += c; i++;
}

// Undo bash $'...' escaping.
const body = !ansiC ? raw : raw.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/g, (_, e) => {
  if (/^[uU]/.test(e)) return String.fromCodePoint(parseInt(e.slice(1), 16));
  if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
  if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8));
  return { n: "\n", r: "\r", t: "\t", a: "\x07", b: "\b", e: "\x1b", f: "\f", v: "\v" }[e] ?? e;
});

let wf;
try { wf = JSON.parse(body); } catch { fail("the request body is not JSON. Re-copy the PUT row with Copy as cURL (bash)."); }
if (!wf._id || !wf.workflowData) fail("the request body is not a workflow (no _id / workflowData). Copy the PUT to backend.leadconnectorhq.com/workflow/<location>/<workflow id>.");

fs.mkdirSync(OUT_DIR, { recursive: true });
const name = wf.name.replace(/\s*\|\s*/g, " - ").replace(/[:\\/*?"<>]/g, "").trim();
const out = path.join(OUT_DIR, `${name} - v${wf.version}.json`);
fs.writeFileSync(out, JSON.stringify(wf, null, 2));
console.log(`saved: ${path.relative(ROOT, out)}\n`);
inspect(out);
