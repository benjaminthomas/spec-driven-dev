// Self-check for bin/cli.mjs: installs into throwaway folders with a fake HOME. Run: node scripts/test-cli.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "cli.mjs");
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sdd-test-")));  // real path: macOS /var → /private/var
const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sdd-home-")));  // outside tmp, like a real HOME
fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
const sh = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: "ignore" });
const cli = (...a) => { try { return execFileSync("node", [CLI, ...a], { env: { ...process.env, SPEC_DRIVEN_HOME: home }, stdio: "pipe" }).toString(); } catch (e) { e.message += `\n${e.stdout}${e.stderr}`; throw e; } };

function repo(dir, scripts, subjects, branches = []) {
  fs.mkdirSync(dir, { recursive: true });
  sh(dir, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ scripts }));
  for (const s of subjects) sh(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", s);
  for (const b of branches) sh(dir, "branch", b);
}

// 1. single repo: tools installed, commands + conventions detected
const single = path.join(tmp, "single");
repo(single, { lint: "eslint .", test: "vitest", dev: "vite" }, ["STP-1: a", "STP-2: b", "STP-3: c"], ["STP-1", "STP-2", "staging"]);
const inst = cli("--yes", "--tools=cursor,codex", `--dir=${single}`);
assert.ok(!fs.existsSync(path.join(single, ".spec-driven.yml")) && inst.includes('say "run spec-setup"') && inst.includes("in single, open your AI tool") && inst.includes("Set up your project in your AI tool") && inst.includes("several repos that change together"), "install only installs, then hands over\n" + inst);
cli("setup", "--yes", `--dir=${single}`);
assert.ok(fs.existsSync(path.join(single, ".cursor/skills/spec-setup/SKILL.md")));
assert.ok(fs.existsSync(path.join(single, ".agents/skills/spec-create/references/task-template.md")));
let cfg = fs.readFileSync(path.join(single, ".spec-driven.yml"), "utf8");
for (const want of ["layout: single", 'lint: "npm run lint"', 'test: "npm test"', 'key: "STP"', 'branch_name: "{ticket}"', 'commit_style: "ticket"', 'base_branch: "staging"'])
  assert.ok(cfg.includes(want), `single config missing ${want}\n${cfg}`);

// 2. existing config is never overwritten under --yes
fs.writeFileSync(path.join(single, ".spec-driven.yml"), "layout: hand-edited\n");
cli("setup", "--yes", `--dir=${single}`);
assert.equal(fs.readFileSync(path.join(single, ".spec-driven.yml"), "utf8"), "layout: hand-edited\n");

// 3. multi-repo workspace: detected from sibling repos, per-repo commands
const ws = path.join(tmp, "ws");
repo(path.join(ws, "api"), { test: "jest" }, ["feat: x", "fix: y"]);
repo(path.join(ws, "web"), { build: "next build" }, ["feat: z"]);
sh(path.join(ws, "api"), "worktree", "add", "-q", path.join(ws, "api-STP-9"));  // must not count as a repo
cli("setup", "--yes", `--dir=${ws}`);
cfg = fs.readFileSync(path.join(ws, ".spec-driven.yml"), "utf8");
assert.ok(!cfg.includes("api-STP-9"), "worktree listed as a repo");
for (const want of ["layout: multi-repo", 'path: "api"', 'path: "web"', 'build: "npm run build"', 'commit_style: "conventional"'])
  assert.ok(cfg.includes(want), `multi-repo config missing ${want}\n${cfg}`);

// 4. monorepo: declared workspace globs win over conventional folders
const mono = path.join(tmp, "mono");
repo(mono, { build: "turbo build" }, ["feat: init"]);
fs.writeFileSync(path.join(mono, "package.json"), JSON.stringify({ workspaces: ["extensions/*", "tools/cli"] }));
for (const d of ["extensions/pixel", "extensions/widget", "tools/cli"]) { fs.mkdirSync(path.join(mono, d), { recursive: true }); fs.writeFileSync(path.join(mono, d, "package.json"), "{}"); }
fs.mkdirSync(path.join(mono, "extensions/no-manifest"));
cli("setup", "--yes", `--dir=${mono}`);
cfg = fs.readFileSync(path.join(mono, ".spec-driven.yml"), "utf8");
for (const want of ["layout: monorepo", 'path: "extensions/pixel"', 'path: "extensions/widget"', 'path: "tools/cli"'])
  assert.ok(cfg.includes(want), `monorepo config missing ${want}\n${cfg}`);
assert.ok(!cfg.includes("no-manifest"), "folder without a manifest listed as a package");

// 5. global install uses the tool's home folder; detection picks up ~/.cursor
cli("--yes", "--global", "--no-setup", "--tools=cursor,codex,antigravity", `--dir=${single}`);
for (const d of [".cursor/skills", ".agents/skills", ".gemini/config/skills"])
  assert.ok(fs.existsSync(path.join(home, d, "spec-ship/SKILL.md")), `global install missing in ${d}`);

// 6. doctor: passes on a good config, fails on a missing base branch / script
const doctor = (dir) => { try { return { code: 0, out: cli("doctor", `--dir=${dir}`) }; } catch (e) { return { code: e.status, out: e.stdout.toString() }; } };
fs.writeFileSync(path.join(single, ".spec-driven.yml"), 'layout: single\ngit:\n  base_branch: "staging"\ncommands:\n  lint: "npm run lint"\n');
assert.equal(doctor(single).code, 0, doctor(single).out);
fs.writeFileSync(path.join(single, ".spec-driven.yml"), 'layout: single\ngit:\n  base_branch: "nope"\ncommands:\n  build: "npm run build"\n');
let d = doctor(single);
assert.equal(d.code, 1);
assert.ok(d.out.includes('"nope" doesn\'t exist') && d.out.includes('"build", which isn\'t in package.json'), d.out);
assert.equal(doctor(ws).code, 0, doctor(ws).out);  // setup's own output must pass doctor

// 7. status: silent with nothing open, lists unfinished specs
assert.equal(cli("status", `--dir=${single}`), "");
fs.mkdirSync(path.join(single, "specs/a"), { recursive: true });
fs.writeFileSync(path.join(single, "specs/a/README.md"), "- [x] one\n- [ ] two\n");
fs.mkdirSync(path.join(single, "specs/b"));
fs.writeFileSync(path.join(single, "specs/b/investigation.md"), "x");
const st = cli("status", `--dir=${single}`);
assert.ok(st.includes("specs/a: 1/2 tasks done") && st.includes("specs/b: investigated"), st);

// 8. multi-repo from inside one repo, with repos in unrelated places (/Projects/frontend, /Work/backend …)
const ws2 = path.join(tmp, "ws2"), elsewhere = path.join(tmp, "elsewhere", "billing");
repo(path.join(ws2, "app"), { test: "jest" }, ["feat: a"]);
repo(elsewhere, { build: "tsc" }, ["feat: b"], ["develop"]);
fs.mkdirSync(path.join(tmp, "not-a-repo"));
//  a) explicit --workspace keeps the config where you say; bad paths are skipped
cli("setup", "--yes", `--dir=${path.join(ws2, "app")}`, "--layout=multi-repo", `--workspace=${ws2}`, `--repos=${path.join(ws2, "app")},${elsewhere},${path.join(tmp, "not-a-repo")},missing`);
cfg = fs.readFileSync(path.join(ws2, ".spec-driven.yml"), "utf8");
for (const want of ["layout: multi-repo", 'path: "app"', `path: ${JSON.stringify(elsewhere)}`, 'base_branch: "develop"', "after_approval: stop"])
  assert.ok(cfg.includes(want), `multi-repo (paths) config missing ${want}\n${cfg}`);
assert.ok(!cfg.includes("not-a-repo") && !cfg.includes("missing"), "invalid repo paths were saved");
assert.equal(doctor(ws2).code, 0, doctor(ws2).out);  // absolute paths outside the workspace must resolve
//  b) a repo outside the config's folder finds the config through ~/.spec-driven/workspaces.json
const reg = JSON.parse(fs.readFileSync(path.join(home, ".spec-driven/workspaces.json"), "utf8"));
assert.deepEqual(reg[path.join(ws2, ".spec-driven.yml")].sort(), [path.join(ws2, "app"), elsewhere].sort());
assert.ok(doctor(path.join(elsewhere)).out.includes(path.join(ws2, ".spec-driven.yml")), "outside repo didn't find its workspace config");
//  c) without --workspace, the config goes in the repos' shared parent folder
cli("setup", "--yes", `--dir=${elsewhere}`, "--layout=multi-repo", `--repos=${path.join(ws2, "app")},${elsewhere}`, "--after-approval=run-through");
cfg = fs.readFileSync(path.join(tmp, ".spec-driven.yml"), "utf8");
assert.ok(cfg.includes('path: "ws2/app"') && cfg.includes('path: "elsewhere/billing"') && cfg.includes("after_approval: run-through"), cfg);
fs.rmSync(path.join(tmp, ".spec-driven.yml"));
assert.throws(() => cli("setup", "--yes", `--dir=${ws2}`, "--layout=multi-repo", "--repos=missing"), /at least one git repo/);
assert.throws(() => cli("setup", "--yes", `--dir=${ws2}`, "--after-approval=maybe"), /must be stop or run-through/);

//  d) repos two folders down are found (e.g. ~/work/client/api)
const deep = path.join(tmp, "deep");
repo(path.join(deep, "client", "api"), {}, ["x"]);
cli("setup", "--yes", `--dir=${deep}`);
assert.ok(fs.readFileSync(path.join(deep, ".spec-driven.yml"), "utf8").includes('path: "client/api"'), "nested repo not found");

// 9. monorepo chosen for a repo setup saw as single: package folders given, missing ones skipped
fs.rmSync(path.join(single, ".spec-driven.yml"));
fs.mkdirSync(path.join(single, "apps/web"), { recursive: true });
cli("setup", "--yes", `--dir=${single}`, "--layout=monorepo", "--packages=apps/web,apps/nope");
cfg = fs.readFileSync(path.join(single, ".spec-driven.yml"), "utf8");
assert.ok(cfg.includes("layout: monorepo") && cfg.includes('path: "apps/web"') && !cfg.includes("apps/nope"), cfg);
assert.throws(() => cli("setup", "--yes", `--dir=${single}`, "--layout=mono"), /--layout must be/);

// 10a. no terminal and no answers given: refuse, change nothing
const quiet = path.join(tmp, "quiet");
repo(quiet, {}, ["x"]);
assert.ok(cli("setup", `--dir=${quiet}`).includes('say "run spec-setup"'), "setup without flags points to the AI tool");
assert.ok(!fs.existsSync(path.join(quiet, ".spec-driven.yml")), "wrote a config without answers");

// 10b. models block: written by setup, parsed and validated by doctor
cfg = fs.readFileSync(path.join(quiet, "..", "ws", ".spec-driven.yml"), "utf8");
assert.ok(/models:[\s\S]*claude:\n    light: haiku\n    standard: sonnet\n    deep: opus\n    escalate: fable/.test(cfg), cfg);
assert.ok(/effort:[^\n]*\n  light: low\n  standard: medium\n  deep: high\n  escalate: xhigh/.test(cfg), cfg);
fs.writeFileSync(path.join(quiet, ".spec-driven.yml"), "layout: single\nmodels:\n  claude:\n    light: haiku\n    huge: x\neffort:\n  deep: turbo\n");
d = doctor(quiet);
assert.ok(d.code === 1 && d.out.includes("models.claude.standard is missing") && d.out.includes("models.claude.huge: unknown tier") && d.out.includes('effort.deep "turbo"'), d.out);
fs.rmSync(path.join(quiet, ".spec-driven.yml"));

// 12. project memory: new/existing detected and saved, context command, doctor limits + stale paths, Resume here in status
cfg = fs.readFileSync(path.join(ws, ".spec-driven.yml"), "utf8");
assert.ok(/context:[^\n]*\n  project: new[^\n]*\n  graph: auto/.test(cfg), `tiny repos should read as new\n${cfg}`);
const big = path.join(tmp, "big");
repo(big, { test: "jest" }, Array.from({ length: 20 }, (_, i) => `feat: ${i}`));
fs.mkdirSync(path.join(big, "src/billing"), { recursive: true });
fs.writeFileSync(path.join(big, "src/billing/retry.ts"), "export {}\n");
cli("setup", "--yes", `--dir=${big}`);
assert.ok(fs.readFileSync(path.join(big, ".spec-driven.yml"), "utf8").includes("project: existing"), "20 commits should read as existing");
fs.rmSync(path.join(big, ".spec-driven.yml"));
cli("setup", "--yes", `--dir=${big}`, "--project=new");
assert.ok(fs.readFileSync(path.join(big, ".spec-driven.yml"), "utf8").includes("project: new"), "--project should win over detection");
assert.throws(() => cli("setup", "--yes", `--dir=${quiet}`, "--project=old"), /--project must be new or existing/);

assert.ok(cli("context", `--dir=${big}`).includes("No specs/CONTEXT.md yet"));
assert.ok(doctor(big).out.includes("no specs/CONTEXT.md yet"), doctor(big).out);
fs.mkdirSync(path.join(big, "specs/context"), { recursive: true });
fs.writeFileSync(path.join(big, "specs/CONTEXT.md"), "# Project context\n- retries live in `src/billing/retry.ts:1`\n- old helper `src/legacy/old.ts`\n- see `context/billing.md`\n- npm `@acme/pkg`\n");
fs.writeFileSync(path.join(big, "specs/context/billing.md"), "# Billing\n- never retry more than 3 times\n");
fs.writeFileSync(path.join(big, "specs/context/archive.md"), "x\n".repeat(500));  // archive is exempt from limits
assert.ok(cli("context", `--dir=${big}`).includes("retries live in"));
let ctx = cli("context", `--dir=${big}`, "--areas=billing,auth");
assert.ok(ctx.includes("never retry more than 3") && ctx.includes("no specs/context/auth.md") && !ctx.includes("retries live in"), ctx);
d = doctor(big);
assert.equal(d.code, 0, d.out);
assert.ok(d.out.includes("`src/legacy/old.ts`, which no longer exists") && !d.out.includes("retry.ts`, which") && !d.out.includes("context/billing.md`, which") && !d.out.includes("@acme/pkg"), d.out);
fs.writeFileSync(path.join(big, "specs/context/billing.md"), "x\n".repeat(160));
d = doctor(big);
assert.ok(d.code === 1 && d.out.includes("context/billing.md is 161 lines (limit 150)"), d.out);
fs.rmSync(path.join(big, "specs/context/billing.md"));

fs.mkdirSync(path.join(big, "specs/feat"), { recursive: true });
fs.writeFileSync(path.join(big, "specs/feat/README.md"), "# Feat\n\n## Resume here\n\n- **Stage:** batch 1/2 done\n- **Next:** spec-implement batch 2 (task-03 needs the API key first)\n\n## Task Status\n- [x] one\n- [ ] two\n");
assert.ok(cli("status", `--dir=${big}`).includes("1/2 tasks done → next: spec-implement batch 2 (task-03 needs the API key first)"));
fs.writeFileSync(path.join(big, "specs/feat/README.md"), "- [x] one\n- [x] two\n");
fs.writeFileSync(path.join(big, "specs/feat/verification-report.md"), "ok");
assert.ok(cli("status", `--dir=${big}`).includes("verified, not reviewed → next: spec-review"));
fs.writeFileSync(path.join(big, "specs/feat/review.md"), "### 1. [blocker] x\n- **Where:** a\n- **Status:** open\n");
assert.ok(cli("status", `--dir=${big}`).includes("open blockers"));
fs.writeFileSync(path.join(big, "specs/feat/review.md"), "### 1. [blocker] x\n- **Status:** fixed in abc123\n### 2. [nit] y\n- **Status:** open\n");
assert.equal(cli("status", `--dir=${big}`), "", "a fixed blocker and an open nit shouldn't count as unfinished");

// 13. a repo under a multi-repo workspace folder, but not listed in it, doesn't inherit its config
const stray = path.join(ws, "unrelated");
repo(stray, {}, ["x"]);
assert.ok(doctor(stray).out.includes("No .spec-driven.yml") || doctor(stray).code === 1, "unlisted repo picked up the workspace config");
assert.equal(doctor(path.join(ws, "api")).code, 0, "listed repo should still find the workspace config");

// 14. GitRisk: weighted score from churn, bug density, fan-out, security; weights from config; --files; A/B harness
const rk = path.join(tmp, "risky");
fs.mkdirSync(rk, { recursive: true });
sh(rk, "init", "-q", "-b", "main");
const OLD = { ...process.env, GIT_AUTHOR_DATE: "2025-01-01T10:00:00", GIT_COMMITTER_DATE: "2025-01-01T10:00:00" };  // older than the 90-day "new" window
const commitFile = (f, body, msg, env = OLD) => { fs.writeFileSync(path.join(rk, f), body); execFileSync("git", ["add", "-A"], { cwd: rk, env }); execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", msg], { cwd: rk, env }); };
commitFile("a.ts", "export const a = 1;\n", "feat: add a");
commitFile("b.ts", "import { a } from './a';\n", "feat: add b");
commitFile("c.ts", "import { a } from \"./a\";\n", "feat: add c");
["fix: off by one", "fix: null crash", "fix: sanitize input to stop xss", "chore: tidy"].forEach((m, i) => commitFile("a.ts", `export const a = ${i + 2};\n`, m));
commitFile("README.md", "docs", "docs: readme");
let rj = JSON.parse(cli("risk", `--dir=${rk}`, "--json"));
const A = rj.rows.find((r) => r.file === "a.ts"), B = rj.rows.find((r) => r.file === "b.ts");
assert.equal(rj.rows[0].file, "a.ts", "most-fixed, most-imported file should rank first");
assert.ok(!rj.rows.some((r) => r.file === "README.md"), "docs aren't scored");
assert.deepEqual(rj.weights, { churn: 0.3, bug_density: 0.35, fan_out: 0.2, security: 0.15 });
assert.equal(A.commits, 5); assert.equal(A.bug_fixes, 3); assert.equal(A.security_fixes, 1); assert.equal(A.dependents, 2);
assert.equal(A.factors.churn, 100); assert.equal(A.factors.fan_out, 100); assert.equal(A.factors.bug_density, 60); assert.equal(A.factors.security, 20);
assert.equal(A.score, Math.round((0.3 * 100 + 0.35 * 60 + 0.2 * 100 + 0.15 * 20) * 10) / 10);  // 74 → high
assert.equal(A.tier, "high"); assert.equal(B.factors.bug_density, 0);
fs.writeFileSync(path.join(rk, ".spec-driven.yml"), "layout: single\nrisk:\n  enabled: on\n  weights:\n    churn: 0\n    bug_density: 1\n    fan_out: 0\n    security: 0\n");
assert.equal(JSON.parse(cli("risk", `--dir=${rk}`, "--json")).rows[0].score, 60, "config weights should override the defaults");
fs.writeFileSync(path.join(rk, ".spec-driven.yml"), "layout: single\nrisk:\n  enabled: maybe\n  weights:\n    churn: 0.5\n    speed: 0.1\n");
d = doctor(rk);
assert.ok(d.code === 1 && d.out.includes('risk.enabled "maybe"') && d.out.includes("risk.weights.speed: unknown factor") && d.out.includes("add up to"), d.out);
assert.throws(() => cli("risk", `--dir=${rk}`), /add up to/);
fs.writeFileSync(path.join(rk, ".spec-driven.yml"), "layout: single\n");
assert.ok(cli("risk", `--dir=${rk}`).includes("Scored 3 files"));
const riskMd = fs.readFileSync(path.join(rk, "specs/context/risk.md"), "utf8");
assert.ok(riskMd.includes("Risk = 0.3 × Churn + 0.35 × Bug Density + 0.2 × Fan-out + 0.15 × Security") && riskMd.includes("| `a.ts` | 74 | high |"), riskMd);
assert.ok(cli("risk", `--dir=${rk}`, "--files=./a.ts,new.ts").includes("a.ts: 74 high") && cli("risk", `--dir=${rk}`, "--files=new.ts").includes("not scored"));
assert.ok(doctor(rk).code === 0, doctor(rk).out);
fs.rmSync(path.join(rk, "specs"), { recursive: true });

// New files: labelled "new" (not low), uncommitted ones included, and they borrow their riskiest neighbour
commitFile("e.ts", "export const e = 1;\n", "feat: add e", process.env);                    // committed today
fs.writeFileSync(path.join(rk, "d.ts"), "import { a } from './a';\n");                       // not committed yet, imports high-risk a.ts
rj = JSON.parse(cli("risk", `--dir=${rk}`, "--json"));
const D = rj.rows.find((x) => x.file === "d.ts"), E = rj.rows.find((x) => x.file === "e.ts");
assert.ok(D && D.tier === "new" && D.committed === false && D.near?.file === "a.ts" && D.near.tier === "high", JSON.stringify(D));
assert.ok(E && E.tier === "new" && E.committed === true && !E.near, JSON.stringify(E));
assert.equal(rj.rows.find((x) => x.file === "a.ts").dependents, 3, "a new importer should raise a.ts's fan-out right away");
assert.equal(rj.rows.find((x) => x.file === "a.ts").tier, "high");
let lk = cli("risk", `--dir=${rk}`, "--files=d.ts,e.ts");
assert.ok(lk.includes("d.ts: new, not committed yet") && lk.includes("Connects to a.ts") && lk.includes("treat it as high") && lk.includes("e.ts: new — too little history to score. Give it standard care."), lk);
assert.ok(cli("risk", `--dir=${rk}`).includes("2 new"));
const md2 = fs.readFileSync(path.join(rk, "specs/context/risk.md"), "utf8");
assert.ok(md2.includes("## New files (2)") && md2.includes("| `d.ts` | `a.ts` |") && !/\| `d\.ts` \| \d/.test(md2), md2);
fs.rmSync(path.join(rk, "specs"), { recursive: true });
fs.rmSync(path.join(rk, "d.ts"));
execFileSync("git", ["reset", "-q", "--hard", "HEAD~1"], { cwd: rk });

// A/B harness, with a fake `claude` that behaves differently when it can see the risk signal
const fake = path.join(tmp, "fake-claude.mjs");
fs.writeFileSync(fake, `#!/usr/bin/env node
import fs from "node:fs";
const on = fs.existsSync("specs/context/risk.md") && /enabled: on/.test(fs.readFileSync(".spec-driven.yml", "utf8"));
const stdin = fs.readFileSync(0, "utf8");
fs.mkdirSync("specs/t/tasks", { recursive: true });
if (/spec-implement/.test(stdin)) { // "implement": fix a.ts and, only with the signal, write a test that needs the fix
  fs.appendFileSync("a.ts", "\\n// fixed\\n");
  if (on) fs.writeFileSync("a.test.mjs", "import fs from 'node:fs'; if (!/fixed/.test(fs.readFileSync('a.ts','utf8'))) process.exit(1);");
}
fs.writeFileSync("specs/t/investigation.md", on ? "## Risk Hotspots\\n| \\\`a.ts\\\` | 74 high |\\n" : "nothing\\n");
fs.writeFileSync("specs/t/tasks/task-01-x.md", "## Complexity\\n**Tier:** " + (on ? "deep" : "standard") + (on ? "\\n## Files\\n- \\\`a.ts\\\` — x\\n## Tests (\\\`npm test\\\`)\\n- a.test.ts — past xss\\n" : "\\n## Files to Modify\\n- \\\`a.ts\\\` — x\\n## Tests\\nNone — trivial\\n"));
fs.writeFileSync("specs/t/models.txt", (fs.readFileSync(".spec-driven.yml", "utf8").match(/deep: (\\S+)/) || [, "unpinned"])[1]);
const ev = (o) => console.log(JSON.stringify(o));
ev({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: on ? "a.ts" : "b.ts" } }] } });
ev({ type: "result", total_cost_usd: on ? 0.02 : 0.01, num_turns: 3, usage: { input_tokens: 100, output_tokens: on ? 60 : 40 } });
`);
fs.chmodSync(fake, 0o755);
fs.writeFileSync(path.join(rk, "tickets.md"), "# tickets\n- Fix the a() rounding bug [files: a.ts, zz.ts]\n");
const evalOut = cli("risk-eval", `--dir=${rk}`, "--tickets=tickets.md", `--claude=${fake}`, `--out=${path.join(tmp, "exp")}`);
assert.ok(evalOut.includes("t1-on-r1: read 1 risky / 1 files, 1 risky in plan") && evalOut.includes("t1-off-r1: read 0 risky"), evalOut);
const expDir = fs.readdirSync(path.join(tmp, "exp")).find((f) => f.startsWith("risk-eval-"));
const rep = fs.readFileSync(path.join(tmp, "exp", expDir, "report.md"), "utf8");
assert.ok(rep.includes("| 1. Fix the a() rounding bug | Risky files looked at | 0 | 1 | 1 |"), rep);
assert.ok(rep.includes("…of those, with tests planned | 0 | 1 | 1 |") && rep.includes("Avg tier of tasks on risky files (1–3) | 2 | 3 | 1 |"), rep);
assert.ok(rep.includes("Known culprit files looked at | 0 | 1 | 1 |") && rep.includes("Known culprit files in the plan | 1 | 1 | 0 |") && rep.includes("Known culprit files (score) | `a.ts` (") && rep.includes("`zz.ts` (unscored)"), rep);
assert.ok(evalOut.includes("culprits read 1/2, planned 1"), evalOut);
assert.ok(fs.readFileSync(path.join(tmp, "exp", "LOG.md"), "utf8").includes("1 ticket(s) × 1 run(s) × 2 arms") , "experiment log not appended");
assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, "exp", expDir, "results.json"), "utf8")).results.length, 2);
assert.ok(!fs.existsSync(path.join(rk, "specs")), "risk-eval must not write into the repo under test");
// measure() on its own: a read of a tracked path counts with or without a clone prefix to strip
{
  const { measure } = await import(path.join(path.dirname(CLI), "risk-eval.mjs"));
  const transcript = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/c/src/a.ts" } }] } });
  const base = { transcript, risky: new Set(["src/a.ts"]), tracked: ["src/a.ts", "src/b.ts"], featureDir: path.join(tmp, "no-such-dir"), feature: "x" };
  assert.equal(measure({ ...base, clone: "/c" }).files_read, 1);
  assert.equal(measure({ ...base, clone: "" }).files_read, 1, "re-measure without a clone must still count reads");
  assert.equal(measure({ ...base, clone: "" }).risky_files_read, 1);
  // task parsing: plain (unbackticked) paths under "## Files", and "Tier: deep (…)" without bold
  const fd = path.join(tmp, "feat"); fs.mkdirSync(path.join(fd, "tasks"), { recursive: true });
  fs.writeFileSync(path.join(fd, "tasks", "task-01.md"), "# T\n## Do\nstuff\n## Files\n- src/a.ts — change it\n## Validation\nmanual\nTier: deep (money)\n");
  const m2 = measure({ ...base, clone: "", featureDir: fd, culprits: ["src/a.ts"] });
  assert.equal(m2.culprit_plan_files, 1, "plain path under ## Files counts");
  assert.equal(m2.culprit_files_with_tests, 0, "no Tests section means no tests planned");
  assert.equal(m2.tier_all_tasks, 3, "unbolded Tier: line is read");
  // no "## Files" heading: paths anywhere in the task count; a "## Files" heading still scopes to that section
  fs.writeFileSync(path.join(fd, "tasks", "task-02.md"), "# T2\n## Changes\n1. `src/b.ts`: add it\n## Tests\nunit\n");
  const m3 = measure({ ...base, clone: "", featureDir: fd, culprits: ["src/a.ts", "src/b.ts"] });
  assert.equal(m3.culprit_plan_files, 2, "path under ## Changes counts when there is no ## Files");
  assert.equal(m3.culprit_files_with_tests, 1, "only the task with a Tests section counts");
}
// re-measure a saved run: same numbers, first report kept, log line added
const rm = cli("risk-eval", `--dir=${rk}`, `--remeasure=${path.join(tmp, "exp", expDir)}`);
assert.ok(rm.includes("Re-measured") && fs.existsSync(path.join(tmp, "exp", expDir, "report-v1.md")) && fs.existsSync(path.join(tmp, "exp", expDir, "results-v1.json")), rm);
assert.ok(fs.readFileSync(path.join(tmp, "exp", expDir, "report.md"), "utf8").includes("Known culprit files in the plan | 1 | 1 | 0 |"));
assert.ok(fs.readFileSync(path.join(tmp, "exp", "LOG.md"), "utf8").includes("re-measured"));

// named arms with a model policy, implement stage, and the bug-caught outcome from replaying the agent's tests on the snapshot
const ev3 = cli("risk-eval", `--dir=${rk}`, "--tickets=tickets.md", `--claude=${fake}`, `--out=${path.join(tmp, "exp3")}`, "--arms=A:off:opus,B:on:tiered", "--stages=investigate,create,implement", "--test=node a.test.mjs");
assert.ok(ev3.includes("t1-A-r1:") && ev3.includes("bug not caught (0 test files)") && ev3.includes("t1-B-r1:") && ev3.includes("bug caught (1 test files)"), ev3);
const exp3 = path.join(tmp, "exp3", fs.readdirSync(path.join(tmp, "exp3")).find((f) => f.startsWith("risk-eval-")));
assert.equal(fs.readFileSync(path.join(exp3, "t1-A-r1", "models.txt"), "utf8"), "opus", "arm A pins every tier to opus");
assert.equal(fs.readFileSync(path.join(exp3, "t1-B-r1", "models.txt"), "utf8"), "unpinned", "arm B leaves models as configured");
const rep3 = fs.readFileSync(path.join(exp3, "report.md"), "utf8");
assert.ok(rep3.includes("| Ticket | Metric | A | B | Δ (B − A) |") && rep3.includes("Bug caught: both of the above (0–1) | 0 | 1 | 1 |"), rep3);
assert.ok(fs.existsSync(path.join(exp3, "t1-B-r1.diff")) && fs.readFileSync(path.join(exp3, "t1-B-r1.diff"), "utf8").includes("a.test.mjs"), "agent diff kept");
assert.ok(!fs.existsSync(path.join(rk, "a.test.mjs")) && !/fixed/.test(fs.readFileSync(path.join(rk, "a.ts"), "utf8")), "repo under test untouched");
assert.ok(fs.readFileSync(path.join(tmp, "exp3", "LOG.md"), "utf8").includes("2 arms (A/B)"));

// 15. settings: switch features by flag, keeping comments; refuses without a terminal or flags
const st2 = path.join(tmp, "settings");
repo(st2, {}, ["x"]);
fs.writeFileSync(path.join(st2, ".spec-driven.yml"), "layout: single\n# keep me\nrisk:   # GitRisk\n  enabled: on   # on | off\n  since: \"2 years ago\"\npipeline:\n  after_approval: stop\n");
let so = cli("settings", `--dir=${st2}`, "--risk=off", "--after-approval=run-through");
let y2 = fs.readFileSync(path.join(st2, ".spec-driven.yml"), "utf8");
assert.ok(so.includes("GitRisk: Off") && so.includes("Run straight through"), so);
assert.ok(y2.includes("  enabled: off   # on | off") && y2.includes("# keep me") && y2.includes("after_approval: run-through") && y2.includes('since: "2 years ago"'), y2);
so = cli("settings", `--dir=${st2}`, "--risk=on");
assert.ok(fs.readFileSync(path.join(st2, ".spec-driven.yml"), "utf8").includes("  enabled: on") && so.includes("nothing is scored yet"), so);
fs.writeFileSync(path.join(st2, ".spec-driven.yml"), "layout: single\n");
cli("settings", `--dir=${st2}`, "--risk=off");
assert.ok(fs.readFileSync(path.join(st2, ".spec-driven.yml"), "utf8").endsWith("risk:\n  enabled: off\n"), "risk block should be added when missing");
assert.equal(doctor(st2).code, 0, doctor(st2).out);
assert.throws(() => cli("settings", `--dir=${st2}`, "--risk=maybe"), /--risk must be on or off/);
assert.throws(() => cli("settings", `--dir=${st2}`), /settings menu can't open/);
assert.throws(() => cli("settings", `--dir=${quiet}`, "--risk=off"), /No .spec-driven.yml/);

// 16. --help shows the whole command list, including the last commands and flags
const help = execFileSync("node", [CLI, "--help", "--yes"]).toString();
assert.ok(help.includes("risk-eval") && help.includes("settings") && help.includes("--risk=on|off"), help);

// 17. risk.md is generated: risk adds it to .gitignore once, and doctor flags it if it's committed
const gr = path.join(tmp, "gitignored");
repo(gr, {}, ["feat: x"]);
fs.writeFileSync(path.join(gr, ".gitignore"), "node_modules/");  // no trailing newline on purpose
fs.writeFileSync(path.join(gr, ".spec-driven.yml"), "layout: single\n");
let ro = cli("risk", `--dir=${gr}`);
assert.ok(ro.includes("Added specs/context/risk.md to .gitignore"), ro);
assert.equal(fs.readFileSync(path.join(gr, ".gitignore"), "utf8"), "node_modules/\n# GitRisk scores, regenerated by spec-driven-dev risk\nspecs/context/risk.md\n");
assert.ok(!cli("risk", `--dir=${gr}`).includes("Added"), "second run must not add it again");
assert.equal((fs.readFileSync(path.join(gr, ".gitignore"), "utf8").match(/risk\.md/g) || []).length, 1);
assert.equal(doctor(gr).code, 0, doctor(gr).out);
sh(gr, "add", "-f", "specs/context/risk.md");
d = doctor(gr);
assert.ok(d.code === 1 && d.out.includes("risk.md is committed to git") && d.out.includes("git rm --cached specs/context/risk.md"), d.out);
sh(gr, "rm", "-q", "--cached", "specs/context/risk.md");
assert.equal(doctor(gr).code, 0, doctor(gr).out);

// 18. no terminal and no flags: install still installs the skills (detected tools, this project) and hands setup to the AI tool
const hand = path.join(tmp, "handoff");
repo(hand, {}, ["x"]);
const ho = cli(`--dir=${hand}`);
assert.ok(fs.existsSync(path.join(hand, ".cursor/skills/spec-setup/SKILL.md")), "skills should be installed for detected tools");
assert.ok(!fs.existsSync(path.join(hand, ".spec-driven.yml")), "no config without answers");
assert.ok(ho.includes('say "run spec-setup"') && !ho.includes("Nothing was changed") && !ho.includes('"investigate <ticket>"'), ho);
assert.ok(cli("setup", `--dir=${hand}`).includes("For scripts and CI") && !fs.existsSync(path.join(hand, ".spec-driven.yml")));

// 19. sharing: detect the current state, never change it under --yes, switch modes cleanly, and handle multi-repo
const sh2 = path.join(tmp, "share");
repo(sh2, {}, ["x"]);
fs.writeFileSync(path.join(sh2, ".gitignore"), "node_modules/\nspecs/\n.env\n");     // like soreto-shopify today
const ign = (rel) => { try { execFileSync("git", ["check-ignore", "--no-index", rel], { cwd: sh2, stdio: "pipe" }); return true; } catch { return false; } };
let so2 = cli("setup", "--yes", `--dir=${sh2}`);
assert.ok(so2.includes("currently makes specs: keep everything local"), so2);
assert.ok(fs.readFileSync(path.join(sh2, ".spec-driven.yml"), "utf8").includes("share: none"));
assert.equal(fs.readFileSync(path.join(sh2, ".gitignore"), "utf8"), "node_modules/\nspecs/\n.env\n", "--yes must keep the existing choice");
assert.equal(doctor(sh2).code, 0, doctor(sh2).out);
so2 = cli("settings", `--dir=${sh2}`, "--share=memory");
let gi2 = fs.readFileSync(path.join(sh2, ".gitignore"), "utf8");
assert.ok(so2.includes("replaced: specs/") && gi2.startsWith("node_modules/\n.env\n") && gi2.includes("specs/*\n!specs/CONTEXT.md\n!specs/context/\nspecs/context/risk.md"), so2 + gi2);
assert.ok(!ign("specs/CONTEXT.md") && !ign("specs/context/billing.md") && ign("specs/stp-1/README.md") && ign("specs/context/risk.md"), "memory mode patterns");
cli("settings", `--dir=${sh2}`, "--share=all");
gi2 = fs.readFileSync(path.join(sh2, ".gitignore"), "utf8");
assert.ok(!ign("specs/stp-1/README.md") && !ign("specs/CONTEXT.md") && ign("specs/context/risk.md") && (gi2.match(/spec-driven-dev: what/g) || []).length === 1, gi2);
cli("risk", `--dir=${sh2}`);
assert.ok(!fs.readFileSync(path.join(sh2, ".gitignore"), "utf8").includes("# GitRisk scores"), "risk must not add a second ignore line");
cli("settings", `--dir=${sh2}`, "--share=none");
assert.ok(ign("specs/CONTEXT.md") && ign("specs/x/README.md"));
fs.writeFileSync(path.join(sh2, ".gitignore"), "node_modules/\n");                       // config says none, git says shared
d = doctor(sh2);
assert.ok(d.out.includes("context.share is none, but .gitignore makes it \"share everything\"") && d.out.includes("settings --share=none"), d.out);
assert.throws(() => cli("settings", `--dir=${sh2}`, "--share=team"), /--share must be all or memory or none/);
// a fresh repo with no rule: --yes picks "share everything", which only ignores risk.md
const sh3 = path.join(tmp, "share3");
repo(sh3, {}, ["x"]);
cli("setup", "--yes", `--dir=${sh3}`);
assert.ok(fs.readFileSync(path.join(sh3, ".spec-driven.yml"), "utf8").includes("share: all") && fs.readFileSync(path.join(sh3, ".gitignore"), "utf8").includes("specs/context/risk.md"));
// multi-repo: the workspace folder isn't a repo, so specs only share when kept inside one of the repos
const ws3 = path.join(tmp, "ws3");
repo(path.join(ws3, "shop"), {}, ["x"]);
repo(path.join(ws3, "api"), {}, ["x"]);
let mo = cli("setup", "--yes", `--dir=${ws3}`, "--share=all");
assert.ok(mo.includes("isn't inside a git repo, so it can't be shared") && fs.readFileSync(path.join(ws3, ".spec-driven.yml"), "utf8").includes("share: none"), mo);
fs.rmSync(path.join(ws3, ".spec-driven.yml"));
mo = cli("setup", "--yes", `--dir=${ws3}`, "--specs-dir=shop/specs", "--share=memory");
const y3 = fs.readFileSync(path.join(ws3, ".spec-driven.yml"), "utf8");
assert.ok(y3.includes('specs_dir: "shop/specs"') && y3.includes("share: memory"), y3);
assert.ok(fs.readFileSync(path.join(ws3, "shop", ".gitignore"), "utf8").includes("specs/*\n!specs/CONTEXT.md"), "the rule goes in the repo that holds the specs");
assert.equal(doctor(ws3).code, 0, doctor(ws3).out);
fs.mkdirSync(path.join(ws3, "shop/specs"), { recursive: true });
fs.mkdirSync(path.join(ws3, "shop/app"), { recursive: true });
fs.writeFileSync(path.join(ws3, "shop/specs/CONTEXT.md"), "- routes in `shop/app/` and `app/`; gone: `shop/old/`\n");
d = doctor(ws3);
assert.ok(!d.out.includes("`shop/app/`, which") && !d.out.includes("`app/`, which") && d.out.includes("`shop/old/`, which no longer exists"), d.out);

// 20. a Shopify app's extensions/ workspaces are one app, not a monorepo
const shop = path.join(tmp, "shopapp");
repo(shop, { dev: "shopify app dev" }, ["STP-1: a"]);
fs.writeFileSync(path.join(shop, "package.json"), JSON.stringify({ workspaces: ["extensions/*"] }));
fs.writeFileSync(path.join(shop, "shopify.app.toml"), "name = 'x'\n");
for (const e of ["checkout-widget", "web-pixel"]) { fs.mkdirSync(path.join(shop, "extensions", e), { recursive: true }); fs.writeFileSync(path.join(shop, "extensions", e, "package.json"), "{}"); }
cli("setup", "--yes", `--dir=${shop}`);
assert.ok(fs.readFileSync(path.join(shop, ".spec-driven.yml"), "utf8").includes("layout: single"), "Shopify app read as a monorepo");

// 21. multi-repo: a repo whose commit style differs from the workspace keeps its own
const ws4 = path.join(tmp, "ws4");
repo(path.join(ws4, "a"), {}, ["feat: 1", "fix: 2", "feat: 3", "chore: 4", "feat: 5", "fix: 6"]);
repo(path.join(ws4, "b"), {}, ["feat: 1", "fix: 2", "feat: 3", "chore: 4", "feat: 5", "fix: 6"]);
repo(path.join(ws4, "c"), {}, ["STP-1: a", "STP-2: b", "STP-3: c", "STP-4: d", "STP-5: e"]);
cli("setup", "--yes", `--dir=${ws4}`);
const y4 = fs.readFileSync(path.join(ws4, ".spec-driven.yml"), "utf8");
assert.ok(/commit_style: "conventional"/.test(y4) && /path: "c"[\s\S]*?commit_style: "ticket"/.test(y4) && !/path: "a"[\s\S]*?commit_style[\s\S]*?path: "b"/.test(y4), y4);
assert.equal(doctor(ws4).code, 0, doctor(ws4).out);

// 22. a dedicated specs repo: specs at its root are shared, only risk.md is ignored; team-repos.yml drives doctor notes
const ws5 = path.join(tmp, "ws5");
repo(path.join(ws5, "shop"), {}, ["x"]);
repo(path.join(ws5, "api"), {}, ["x"]);
repo(path.join(ws5, "team-specs"), {}, ["docs: start"]);
repo(path.join(ws5, "dash"), {}, ["x"]);          // cloned, but this developer doesn't list it
let o5 = cli("setup", "--yes", `--dir=${ws5}`, "--repos=shop,api", "--layout=multi-repo", `--workspace=${ws5}`, "--specs-dir=team-specs", "--share=memory");
assert.ok(o5.includes("is a repo of its own, so everything in it is shared") && fs.readFileSync(path.join(ws5, ".spec-driven.yml"), "utf8").includes("share: all"), o5);
assert.ok(fs.readFileSync(path.join(ws5, "team-specs", ".gitignore"), "utf8").includes("/context/risk.md"));
const ign5 = (rel) => { try { execFileSync("git", ["check-ignore", "--no-index", rel], { cwd: path.join(ws5, "team-specs"), stdio: "pipe" }); return true; } catch { return false; } };
assert.ok(!ign5("CONTEXT.md") && !ign5("stp-1/README.md") && ign5("context/risk.md"));
fs.writeFileSync(path.join(ws5, "team-specs", "team-repos.yml"), "repos:\n  - name: shop\n    url: git@x:t/shop.git\n  - name: dash\n    url: git@x:t/dash.git\n  - name: zoe\n    url: git@x:t/zoe.git\n");
d = doctor(ws5);
assert.ok(d.code === 0 && d.out.includes('dash is cloned at') && d.out.includes('add dash to the workspace') && d.out.includes("team repo zoe isn't on this machine") && d.out.includes("git clone git@x:t/zoe.git") && !d.out.includes("team repo shop"), d.out);

// 23. uninstall: lists, refuses without --yes when there's no terminal, removes only our skills, keeps config unless --all
const un = path.join(tmp, "uninstall"), unHome = path.join(tmp, "uninstall-home");
repo(un, {}, ["x"]);
fs.mkdirSync(path.join(unHome, ".cursor/skills/my-own-skill"), { recursive: true });
fs.writeFileSync(path.join(unHome, ".cursor/skills/my-own-skill/SKILL.md"), "mine");
fs.mkdirSync(path.join(unHome, ".npm/_npx/abc/node_modules/@benjaminthomas/spec-driven-dev"), { recursive: true });
const ucli = (...a) => execFileSync("node", [CLI, ...a], { env: { ...process.env, SPEC_DRIVEN_HOME: unHome }, stdio: "pipe" }).toString();
ucli("--yes", "--global", "--no-setup", "--tools=cursor,codex", `--dir=${un}`);
ucli("setup", "--yes", `--dir=${un}`);
let uo = ucli("uninstall", `--dir=${un}`);
assert.ok(uo.includes("9 skills in") && uo.includes("npx download cache") && uo.includes("Nothing removed") && uo.includes("Kept: your settings file"), uo);
assert.ok(fs.existsSync(path.join(unHome, ".cursor/skills/spec-setup/SKILL.md")), "listing must not delete");
uo = ucli("uninstall", "--yes", `--dir=${un}`);
assert.ok(!fs.existsSync(path.join(unHome, ".cursor/skills/spec-setup")) && !fs.existsSync(path.join(unHome, ".agents/skills/spec-create")), uo);
assert.ok(fs.existsSync(path.join(unHome, ".cursor/skills/my-own-skill/SKILL.md")), "other skills must stay");
assert.ok(fs.existsSync(path.join(un, ".spec-driven.yml")) && !fs.existsSync(path.join(unHome, ".npm/_npx/abc")), "config kept, cache removed");
uo = ucli("uninstall", "--yes", "--all", `--dir=${un}`);
assert.ok(!fs.existsSync(path.join(un, ".spec-driven.yml")) && uo.includes("Removed settings file"), uo);
assert.ok(ucli("uninstall", "--yes", `--dir=${un}`).includes("Nothing to remove"));

// 24. risk keeps a short, shared "Risk hotspots" block in CONTEXT.md, replaced in place on each run
const rh = path.join(tmp, "riskctx");
fs.mkdirSync(rh, { recursive: true }); sh(rh, "init", "-q", "-b", "main");
const OLD2 = { ...process.env, GIT_AUTHOR_DATE: "2025-01-01T10:00:00", GIT_COMMITTER_DATE: "2025-01-01T10:00:00" };
const cf = (f, b, m) => { fs.writeFileSync(path.join(rh, f), b); execFileSync("git", ["add", "-A"], { cwd: rh, env: OLD2 }); execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", m], { cwd: rh, env: OLD2 }); };
cf("a.ts", "export const a = 1;\n", "feat: a"); cf("b.ts", "import { a } from './a';\n", "feat: b"); cf("c.ts", "import { a } from './a';\n", "feat: c");
["fix: one", "fix: two", "fix: three", "chore: x"].forEach((m, i) => cf("a.ts", `export const a = ${i + 2};\n`, m));
fs.writeFileSync(path.join(rh, ".spec-driven.yml"), "layout: single\n");
fs.mkdirSync(path.join(rh, "specs"), { recursive: true });
fs.writeFileSync(path.join(rh, "specs/CONTEXT.md"), "# Project context\n\n## Areas\n- app\n");
let rco = cli("risk", `--dir=${rh}`);
let ctxText = fs.readFileSync(path.join(rh, "specs/CONTEXT.md"), "utf8");
assert.ok(rco.includes("Risk hotspots") && ctxText.startsWith("# Project context\n\n## Areas\n- app\n") && ctxText.includes("## Risk hotspots") && ctxText.includes("- `a.ts` ") && ctxText.includes("context/risk.md"), ctxText);
cli("risk", `--dir=${rh}`);
ctxText = fs.readFileSync(path.join(rh, "specs/CONTEXT.md"), "utf8");
assert.equal((ctxText.match(/## Risk hotspots/g) || []).length, 1, "block must be replaced, not appended again");
assert.ok(!fs.readFileSync(path.join(rh, ".gitignore"), "utf8").includes("CONTEXT.md"), "CONTEXT.md stays shared");

// 25. ci: writes the specs-repo workflow (+ per-repo triggers with --notify); risk runs from a CI checkout; date-only changes aren't committed
const cw = path.join(tmp, "ciws");
for (const [n, msgs] of [["shop", ["feat: a", "fix: b", "fix: c"]], ["api", ["feat: x"]], ["team-specs", ["docs: start"]]]) repo(path.join(cw, n), {}, msgs);
sh(path.join(cw, "shop"), "remote", "add", "origin", "git@github.com:acme/shop.git");
sh(path.join(cw, "api"), "remote", "add", "origin", "https://github.com/acme/api.git");
fs.writeFileSync(path.join(cw, "team-specs", "team-repos.yml"), "repos:\n  - name: shop\n    url: git@github.com:acme/shop.git\n  - name: api\n    url: https://github.com/acme/api.git\n");
cli("setup", "--yes", `--dir=${cw}`, "--layout=multi-repo", "--repos=shop,api", `--workspace=${cw}`, "--specs-dir=team-specs");
assert.throws(() => cli("ci", `--dir=${cw}`), /no GitHub remote yet/);
sh(path.join(cw, "team-specs"), "remote", "add", "origin", "https://github.com/acme/team-specs.git");
let co = cli("ci", `--dir=${cw}`, "--notify");
const wf = fs.readFileSync(path.join(cw, "team-specs/.github/workflows/gitrisk.yml"), "utf8");
assert.ok(wf.includes("repository: acme/shop") && wf.includes("repository: acme/api") && !wf.includes("repository: acme/team-specs") && wf.includes("--repos=shop,api --specs-dir=specs") && wf.includes("fetch-depth: 0") && wf.includes("types: [code-merged]"), wf);
const nf = fs.readFileSync(path.join(cw, "shop/.github/workflows/gitrisk-notify.yml"), "utf8");
assert.ok(nf.includes("repos/acme/team-specs/dispatches") && /branches: \[main\]/.test(nf) && fs.existsSync(path.join(cw, "api/.github/workflows/gitrisk-notify.yml")), nf);
assert.ok(co.includes("GITRISK_TOKEN") && co.includes("Nothing was committed"), co);
for (const f of [path.join(cw, "team-specs/.github/workflows/gitrisk.yml"), path.join(cw, "shop/.github/workflows/gitrisk-notify.yml")])
  execFileSync("python3", ["-c", "import sys,yaml; d=yaml.safe_load(open(sys.argv[1])); assert d['jobs']", f]);
// simulate the workflow's steps in a CI-shaped checkout: ./specs + ./shop + ./api, no personal config
const run2 = path.join(tmp, "cirun");
fs.mkdirSync(run2);
for (const n of ["shop", "api"]) execFileSync("git", ["clone", "-q", path.join(cw, n), path.join(run2, n)]);
execFileSync("git", ["clone", "-q", path.join(cw, "team-specs"), path.join(run2, "specs")]);
fs.writeFileSync(path.join(run2, "specs/CONTEXT.md"), "# Project context\n");
sh(path.join(run2, "specs"), "add", "-A"); sh(path.join(run2, "specs"), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "ctx");
const ci1 = execFileSync("node", [CLI, "risk", `--dir=${run2}`, "--repos=shop,api", "--specs-dir=specs"], { env: { ...process.env, SPEC_DRIVEN_HOME: home } }).toString();
assert.ok(ci1.includes("Scored") && fs.readFileSync(path.join(run2, "specs/CONTEXT.md"), "utf8").includes("## Risk hotspots"), ci1);
const changed = () => { execFileSync("git", ["add", "CONTEXT.md", ".gitignore"], { cwd: path.join(run2, "specs") }); try { execFileSync("git", ["diff", "--cached", "--quiet", "-I", "^Updated [0-9-]+$"], { cwd: path.join(run2, "specs") }); return false; } catch { return true; } };
assert.ok(changed(), "first run adds the block, so it commits");
sh(path.join(run2, "specs"), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "hotspots");
const ctxp = path.join(run2, "specs/CONTEXT.md");
fs.writeFileSync(ctxp, fs.readFileSync(ctxp, "utf8").replace(/^Updated .*$/m, "Updated 2099-01-01"));
assert.ok(!changed(), "a date-only change must not be committed");
fs.writeFileSync(ctxp, fs.readFileSync(ctxp, "utf8").replace(/^- .*$/m, "- `shop/other.ts` 99 critical"));
assert.ok(changed(), "a hotspot change must be committed");

// 26. team: person A shares the rules (team init); person B, on another machine with fewer repos, joins
const tA = path.join(tmp, "teamA"), tB = path.join(tmp, "teamB"), homeB = path.join(tmp, "homeB");
repo(path.join(tA, "shop"), { lint: "eslint ." }, ["STP-1: a", "STP-2: b", "STP-3: c"], ["staging"]);
repo(path.join(tA, "api"), { test: "jest" }, ["STP-4: d"], ["staging"]);
repo(path.join(tA, "dash"), {}, ["feat: e"]);
repo(path.join(tA, "team-specs"), {}, ["docs: start"]);
fs.writeFileSync(path.join(tA, "team-specs/team-repos.yml"), `repos:\n  - name: shop\n    url: ${path.join(tA, "shop")}\n  - name: api\n    url: ${path.join(tA, "api")}\n  - name: dash\n    url: ${path.join(tA, "dash")}\n`);
cli("setup", "--yes", `--dir=${tA}`, "--layout=multi-repo", "--repos=shop,api,dash", `--workspace=${tA}`, "--specs-dir=team-specs");
const beforeA = fs.readFileSync(path.join(tA, ".spec-driven.yml"), "utf8");
fs.writeFileSync(path.join(tA, ".spec-driven.yml.bak"), "an older backup the user wants to keep\n");
const ti = cli("team", "init", `--dir=${tA}`);
const teamYml = fs.readFileSync(path.join(tA, "team-specs/team.yml"), "utf8"), personalA = fs.readFileSync(path.join(tA, ".spec-driven.yml"), "utf8");
assert.ok(ti.includes("Wrote") && teamYml.includes("tracker:") && teamYml.includes("base_branch: staging") && teamYml.includes("commit_style:") && teamYml.includes("risk:"), teamYml);
assert.ok(!personalA.includes("tracker:") && !personalA.includes("base_branch") && personalA.includes("specs_dir: team-specs") && personalA.includes("path: shop"), personalA);
assert.equal(fs.readFileSync(path.join(tA, ".spec-driven.yml.bak"), "utf8"), "an older backup the user wants to keep\n", "an existing backup must never be overwritten");
const dated = fs.readdirSync(tA).find((f) => f.startsWith(".spec-driven.yml.bak-"));
assert.ok(dated && fs.readFileSync(path.join(tA, dated), "utf8") === beforeA && ti.includes(dated), "old config saved under a dated name");
assert.equal(doctor(tA).code, 0, doctor(tA).out);
assert.ok(doctor(tA).out.includes("team rules come from"), doctor(tA).out);
assert.ok(!/: ""$/m.test(teamYml), "team.yml leaves out unset values");
assert.throws(() => cli("team", "init", `--dir=${tA}`), /already exists/);
// --fresh (setup just wrote the config): no backup
const tF = path.join(tmp, "teamF");
repo(path.join(tF, "shop"), {}, ["STP-1: a"]); repo(path.join(tF, "fs-specs"), {}, ["docs: start"]);
cli("setup", "--yes", `--dir=${tF}`, "--layout=multi-repo", "--repos=shop", `--workspace=${tF}`, "--specs-dir=fs-specs");
const tif = cli("team", "init", "--fresh", `--dir=${tF}`);
assert.ok(!fs.readdirSync(tF).some((f) => f.startsWith(".spec-driven.yml.bak")) && !tif.includes("saved as"), tif);
sh(path.join(tA, "team-specs"), "add", "-A"); sh(path.join(tA, "team-specs"), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "team rules");
// person B: different machine, clones the specs repo plus only shop and api
fs.mkdirSync(tB);
for (const n of ["shop", "api", "team-specs"]) execFileSync("git", ["clone", "-q", path.join(tA, n), path.join(tB, n)]);
const bcli = (...a) => execFileSync("node", [CLI, ...a], { env: { ...process.env, SPEC_DRIVEN_HOME: homeB }, stdio: "pipe" }).toString();
const jo = bcli("setup", `--dir=${tB}`, `--join=${path.join(tB, "team-specs")}`);
const personalB = fs.readFileSync(path.join(tB, ".spec-driven.yml"), "utf8");
assert.ok(jo.includes("Joined the team") && jo.includes("shop, api") && jo.includes("dash isn't cloned here") && jo.includes(`git clone ${path.join(tA, "dash")}`), jo);
assert.ok(personalB.includes("layout: multi-repo") && personalB.includes("specs_dir: team-specs") && !personalB.includes("tracker"), personalB);
const dB = execFileSync("node", [CLI, "doctor", `--dir=${tB}`], { env: { ...process.env, SPEC_DRIVEN_HOME: homeB } }).toString();
assert.ok(dB.includes("team rules come from") && dB.includes("Config matches the repos"), dB);
fs.writeFileSync(path.join(tA, "team-specs/team-repos.yml"), fs.readFileSync(path.join(tA, "team-specs/team-repos.yml"), "utf8").replace("  - name: shop\n", "  - name: shop\n    role: the storefront app\n"));
assert.ok(!doctor(tA).out.includes("shop: no role"), "roles come from team-repos.yml, not each person's file");
assert.ok(!fs.readFileSync(path.join(tB, "team-specs/team.yml"), "utf8").includes("personal"), "joining must not change the team's file");
assert.equal(execFileSync("git", ["status", "--short"], { cwd: path.join(tB, "team-specs") }).toString().trim(), "", "joining leaves the specs repo untouched");
assert.throws(() => bcli("setup", `--dir=${tB}`, `--join=${path.join(tB, "team-specs")}`), /already exists/);
// a personal override is reported; a team setting changed from settings goes to team.yml
fs.appendFileSync(path.join(tB, ".spec-driven.yml"), "git:\n  base_branch: main\n");
assert.ok(execFileSync("node", [CLI, "doctor", `--dir=${tB}`], { env: { ...process.env, SPEC_DRIVEN_HOME: homeB } }).toString().includes('your git.base_branch ("main") overrides the team\'s ("staging")'));
const so3 = bcli("settings", `--dir=${tB}`, "--risk=off");
assert.ok(so3.includes("shared with the team") && fs.readFileSync(path.join(tB, "team-specs/team.yml"), "utf8").includes("enabled: off"), so3);

// 27. any tracker: detected from its ID shape, named with --tracker, and accepted by doctor
const tz = path.join(tmp, "azure");
repo(tz, {}, ["Fix login AB#4512", "Add export AB#4520", "Tidy AB#4521"]);
cli("setup", "--yes", `--dir=${tz}`);
assert.ok(fs.readFileSync(path.join(tz, ".spec-driven.yml"), "utf8").includes("type: azure-boards"), "AB#123 means Azure Boards");
const tc = path.join(tmp, "clickup");
repo(tc, {}, ["CU-86a1b2c3d fix cart", "CU-86a1b2c9x add badge"]);
cli("setup", "--yes", `--dir=${tc}`);
assert.ok(fs.readFileSync(path.join(tc, ".spec-driven.yml"), "utf8").includes("type: clickup"), "CU-… means ClickUp");
const ta = path.join(tmp, "asana");
repo(ta, {}, ["start"]);
cli("setup", "--yes", `--dir=${ta}`, "--tracker=Asana");
assert.ok(fs.readFileSync(path.join(ta, ".spec-driven.yml"), "utf8").includes("type: asana"));
assert.equal(doctor(ta).code, 0, doctor(ta).out);
fs.writeFileSync(path.join(ta, ".spec-driven.yml"), fs.readFileSync(path.join(ta, ".spec-driven.yml"), "utf8").replace("type: asana", 'type: "Bad Name!"'));
assert.ok(doctor(ta).out.includes("must be a tracker name"), doctor(ta).out);
assert.throws(() => cli("setup", "--yes", `--dir=${path.join(tmp, "x")}`, "--tracker=9 bad!"), /tracker name/);

// 28. OpenCode: installs into its own skills folder, and the config gets an opencode model section
const toc = path.join(tmp, "oc"); repo(toc, {}, ["start"]);
cli("--yes", "--no-setup", "--tools=opencode", `--dir=${toc}`);
assert.ok(fs.existsSync(path.join(toc, ".opencode/skills/spec-create/SKILL.md")), "OpenCode project install");
cli("setup", "--yes", `--dir=${toc}`);
assert.ok(/models:[\s\S]*opencode:/.test(fs.readFileSync(path.join(toc, ".spec-driven.yml"), "utf8")));
assert.equal(doctor(toc).code, 0, doctor(toc).out);

// 29. usage: tokens per stage and model, from fake Claude Code session files
{
  const uw = path.join(tmp, "usagews"); repo(uw, {}, ["STP-9: a"]);
  cli("setup", "--yes", `--dir=${uw}`);
  for (const f of ["stp-9-cart", "stp-10-other"]) { fs.mkdirSync(path.join(uw, "specs", f), { recursive: true }); fs.writeFileSync(path.join(uw, "specs", f, "README.md"), "# x\n"); }
  const pd = path.join(home, ".claude", "projects", fs.realpathSync(uw).replace(/[^A-Za-z0-9]/g, "-"));
  fs.mkdirSync(path.join(pd, "s1", "subagents"), { recursive: true });
  const a = (id, skill, model, out, extra = {}) => ({ type: "assistant", sessionId: "s1", timestamp: `2026-11-11T10:${String(out).padStart(2, "0")}:00Z`, attributionSkill: skill, message: { id, model, usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 90, output_tokens: out }, content: extra.content || [] } });
  const lines = [
    { type: "user", message: { content: "investigate STP-9" } },
    a("m1", "spec-investigate", "claude-opus-5-5", 5), a("m1", "spec-investigate", "claude-opus-5-5", 5), // same response twice: counted once
    a("m2", "spec-implement", "claude-opus-5-5", 3, { content: [{ type: "tool_use", name: "Agent", id: "tu1", input: {} }] }),
    { type: "user", message: { content: "now STP-10 please" } },
    a("m3", "spec-investigate", "claude-opus-5-5", 50), // other feature: not counted
  ];
  fs.writeFileSync(path.join(pd, "s1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));
  fs.writeFileSync(path.join(pd, "s1", "subagents", "agent-x.meta.json"), JSON.stringify({ toolUseId: "tu1", description: "Implement task-01" }));
  fs.writeFileSync(path.join(pd, "s1", "subagents", "agent-x.jsonl"), JSON.stringify(a("m4", null, "claude-haiku-5-5", 7)));
  const ucli = (...x) => execFileSync("node", [CLI, ...x], { env: { ...process.env, SPEC_DRIVEN_HOME: home }, cwd: uw, stdio: "pipe" }).toString();
  const j = JSON.parse(ucli("usage", "STP-9", "--json"));
  assert.equal(j.target, "stp-9-cart");
  assert.equal(j.totals.output, 15, "5 + 3 + 7: the duplicate and the other feature are left out");
  assert.ok(j.rows.some((r) => r.stage === "implement" && r.model === "claude-haiku-5-5"), "a subagent counts under the stage that started it");
  const sm = ucli("usage", "stp-9", "--summary");
  assert.ok(sm.includes("Haiku 5.5 (implement)") && sm.includes("1 subagent") && sm.includes("90% from cache"), sm);
  assert.throws(() => ucli("usage", "STP-404"), /No spec folder matches/);
}

// 10. --version
assert.equal(cli("--version").trim(), JSON.parse(fs.readFileSync(path.join(path.dirname(CLI), "..", "package.json"), "utf8")).version);

// 11. bad input fails loudly
assert.throws(() => cli("--yes", "--tools=nope", "--no-setup", `--dir=${single}`));

fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(home, { recursive: true, force: true });
console.log("✓ cli self-check passed");
