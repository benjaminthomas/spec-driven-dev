// Self-check for bin/cli.mjs: installs into throwaway folders with a fake HOME. Run: node scripts/test-cli.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "cli.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-test-"));
const home = path.join(tmp, "home");
fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
const sh = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: "ignore" });
const cli = (...a) => execFileSync("node", [CLI, ...a], { env: { ...process.env, SPEC_DRIVEN_HOME: home }, stdio: "pipe" }).toString();

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

// 4. global install uses the tool's home folder; detection picks up ~/.cursor
cli("--yes", "--global", "--no-setup", "--tools=cursor", `--dir=${single}`);
assert.ok(fs.existsSync(path.join(home, ".cursor/skills/spec-ship/SKILL.md")));

// 5. bad input fails loudly
assert.throws(() => cli("--yes", "--tools=nope", "--no-setup", `--dir=${single}`));

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✓ cli self-check passed");
