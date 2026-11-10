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
cli("--yes", "--tools=cursor,codex", `--dir=${single}`);
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
assert.throws(() => cli("setup", `--dir=${quiet}`), /No interactive terminal/);
assert.ok(!fs.existsSync(path.join(quiet, ".spec-driven.yml")), "wrote a config without a terminal or flags");

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

// 10. --version
assert.equal(cli("--version").trim(), JSON.parse(fs.readFileSync(path.join(path.dirname(CLI), "..", "package.json"), "utf8")).version);

// 11. bad input fails loudly
assert.throws(() => cli("--yes", "--tools=nope", "--no-setup", `--dir=${single}`));

fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(home, { recursive: true, force: true });
console.log("✓ cli self-check passed");
