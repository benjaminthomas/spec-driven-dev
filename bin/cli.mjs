#!/usr/bin/env node
// spec-driven-dev installer (npm i -g @benjaminthomas/spec-driven-dev): detects your AI coding tools, copies the skills into each one, and
// runs project discovery (layout, tracker, branches, commands) to write .spec-driven.yml.
//
//   spec-driven-dev                 install + project setup (interactive)
//   spec-driven-dev setup           project setup only
//   spec-driven-dev doctor          check .spec-driven.yml against the real repos (exit 1 on problems)
//   spec-driven-dev status          list specs with unfinished tasks (used by the session-start hook)
//   flags: --yes  --global  --tools=claude,cursor  --skills=spec-create,...  --no-setup  --dir=<path>
//          --layout=single|monorepo|multi-repo  --repos=~/Projects/frontend,/srv/backend  --workspace=<config dir>
//          --packages=apps/web,packages/ui  --after-approval=stop|run-through  --version
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import prompts from "prompts";  // arrow-key menus that work in PowerShell, cmd, macOS and Linux terminals
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKILLS_DIR = path.join(ROOT, "plugin", "skills");
const HOME = process.env.SPEC_DRIVEN_HOME || os.homedir(); // overridable for tests
const ALL_SKILLS = fs.readdirSync(SKILLS_DIR).filter((d) => fs.existsSync(path.join(SKILLS_DIR, d, "SKILL.md")));

const TOOLS = {
  claude: { label: "Claude Code", home: ".claude", bin: "claude", project: ".claude/skills", global: ".claude/skills" },
  cursor: { label: "Cursor", home: ".cursor", bin: "cursor", project: ".cursor/skills", global: ".cursor/skills" },
  codex: { label: "Codex CLI", home: ".codex", bin: "codex", project: ".agents/skills", global: ".agents/skills" }, // Codex reads $HOME/.agents/skills
  antigravity: { label: "Antigravity", home: ".gemini", bin: "antigravity", project: ".agents/skills", global: ".gemini/config/skills" },
};

// ---------- args & prompts ----------
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const command = args.find((a) => !a.startsWith("-")) || "install";
const YES = flag("yes") || flag("y") || !process.stdin.isTTY || ["doctor", "status"].includes(command);
const DIR = path.resolve(opt("dir") || process.cwd());

if (flag("version") || flag("v")) {
  console.log(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version);
  process.exit(0);
}
// No terminal to answer in (e.g. `!` in Claude Code, an IDE task, a pipe) and nothing passed explicitly:
// stop rather than write a config from guesses.
const ANSWER_FLAGS = ["yes", "y", "layout", "repos", "packages", "tools", "workspace", "after-approval", "skills", "global", "no-setup"];
if (["install", "setup"].includes(command) && !process.stdin.isTTY && !args.some((a) => ANSWER_FLAGS.some((f) => a === `--${f}` || a.startsWith(`--${f}=`)))) {
  console.log(`✗ No interactive terminal, so setup can't ask its questions. Nothing was changed.

  This happens when it runs through another program: a "!" command in Claude Code, an editor task,
  or piped input. Either:
    • run it yourself in a terminal window (Terminal, iTerm, or your editor's terminal panel):
        npx @benjaminthomas/spec-driven-dev@latest ${command === "setup" ? "setup" : ""}
    • or give the answers as flags, for example:
        npx @benjaminthomas/spec-driven-dev@latest setup --layout=multi-repo --repos=~/Projects/frontend,~/Projects/backend
      (add --yes to accept everything it detects)`);
  process.exit(1);
}

if (flag("help") || flag("h")) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 11).join("\n").replace(/^\/\/ ?/gm, ""));
  process.exit(0);
}

// Every question goes through these helpers. With --yes (or answers given as flags) they return the default.
const cancelled = () => { console.log("\n✗ Setup cancelled. Nothing was changed."); process.exit(1); };
async function ask(q) { const r = await prompts({ name: "v", ...q }, { onCancel: cancelled }); return r.v; }
async function askText(message, initial = "", validate) {
  if (YES) return initial;
  return String((await ask({ type: "text", message, initial, validate })) ?? "").trim();
}
async function askSelect(message, choices, initialValue) {
  if (YES) return initialValue;
  const initial = Math.max(0, choices.findIndex((c) => c.value === initialValue));
  return ask({ type: "select", message, choices, initial, hint: "↑/↓ then Enter" });
}
async function askMulti(message, choices) {
  if (YES) return choices.filter((c) => c.selected).map((c) => c.value);
  return ask({ type: "multiselect", message, choices, instructions: false, hint: "↑/↓ move · Space select · A all · Enter confirm" });
}
async function askConfirm(message, initial = true) {
  if (YES) return initial;
  return ask({ type: "toggle", message, initial, active: "yes", inactive: "no" });
}

const run = (cmd, argv, cwd) => {
  try { return execFileSync(cmd, argv, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; }
};
const onPath = (bin) => !!run(process.platform === "win32" ? "where" : "which", [bin]);

// fs.cpSync needs Node 16.7+; this keeps Node 14 working. Follows symlinks, skips .DS_Store.
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from)) {
    if (e === ".DS_Store") continue;
    const src = path.join(from, e), dst = path.join(to, e);
    if (fs.statSync(src).isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

// ---------- install ----------
async function install() {
  const detected = Object.keys(TOOLS).filter((t) => fs.existsSync(path.join(HOME, TOOLS[t].home)) || onPath(TOOLS[t].bin));
  let tools = opt("tools")?.split(",");
  if (!tools) tools = await askMulti("Which AI coding tools should get the skills?",
    Object.entries(TOOLS).map(([value, t]) => ({ value, title: t.label + (detected.includes(value) ? "  (installed)" : ""), selected: detected.includes(value) })));
  const bad = tools.filter((t) => !TOOLS[t]);
  if (bad.length) throw new Error(`Unknown tool(s): ${bad.join(", ")} — expected ${Object.keys(TOOLS).join(", ")}`);

  // Claude Code users who already have the plugin would get every skill twice.
  const plugins = path.join(HOME, ".claude/plugins/installed_plugins.json");
  if (tools.includes("claude") && !opt("tools") && fs.existsSync(plugins) && /"(spec-driven-dev|ticket-to-pr)@/.test(fs.readFileSync(plugins, "utf8"))) {
    console.log("• Claude Code already has the spec-driven-dev plugin, so it's skipped here (update it with /plugin).");
    tools = tools.filter((t) => t !== "claude");
  }

  const global = flag("global") || (await askSelect("Install the skills for…", [
    { title: "This project only", value: false, description: "skills go in this folder, e.g. .cursor/skills/" },
    { title: "All my projects", value: true, description: "skills go in your home folder, e.g. ~/.cursor/skills/" },
  ], false));
  const skills = opt("skills")?.split(",") || ALL_SKILLS;
  const unknown = skills.filter((s) => !ALL_SKILLS.includes(s));
  if (unknown.length) throw new Error(`Unknown skill(s): ${unknown.join(", ")} — expected ${ALL_SKILLS.join(", ")}`);

  const dests = [...new Set(tools.map((t) => (global ? path.join(HOME, TOOLS[t].global) : path.join(DIR, TOOLS[t].project))))];
  for (const dest of dests) {
    for (const s of skills) {
      const to = path.join(dest, s);
      fs.rmSync(to, { recursive: true, force: true });
      copyDir(path.join(SKILLS_DIR, s), to);
    }
    console.log(`✓ ${skills.length} skills → ${dest}`);
  }
  if (!dests.length) console.log("• No tools selected — nothing installed.");
}

// ---------- discovery ----------
const MARKERS = ["pnpm-workspace.yaml", "turbo.json", "nx.json", "lerna.json", "go.work"];
const PKG_DIRS = ["apps", "packages", "services", "libs"];
const MANIFESTS = ["package.json", "go.mod", "pyproject.toml", "Cargo.toml", "composer.json", "pom.xml"];
const isRepo = (d) => run("git", ["rev-parse", "--is-inside-work-tree"], d) === "true";
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const subdirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name); } catch { return []; } };

// Git repos up to two folders down (e.g. ~/work/client/api). A git worktree has a .git *file*;
// it belongs to its main repo, so it is skipped. Repos aren't searched inside.
function findRepos(dir, depth = 2, prefix = "") {
  const out = [];
  for (const n of subdirs(dir)) {
    if (n === "node_modules") continue;
    const full = path.join(dir, n);
    let isGitDir = false;
    try { isGitDir = fs.statSync(path.join(full, ".git")).isDirectory(); } catch {}
    if (isGitDir) out.push(prefix + n);
    else if (depth > 1) out.push(...findRepos(full, depth - 1, `${prefix}${n}/`));
  }
  return out;
}

function detectLayout(dir) {
  if (isRepo(dir)) {
    const top = path.resolve(run("git", ["rev-parse", "--show-toplevel"], dir));  // C:/x → C:\x on Windows
    const pkg = readJson(path.join(top, "package.json"));
    const cargo = fs.existsSync(path.join(top, "Cargo.toml")) && fs.readFileSync(path.join(top, "Cargo.toml"), "utf8").includes("[workspace]");
    const hasManifest = (rel) => MANIFESTS.some((m) => fs.existsSync(path.join(top, rel, m)));
    // Prefer the workspace list the repo declares; fall back to conventional folders.
    // shortcut: only "dir/*", "dir/**" and exact paths are expanded — enough for typical workspace globs.
    const pnpm = fs.existsSync(path.join(top, "pnpm-workspace.yaml")) ? [...fs.readFileSync(path.join(top, "pnpm-workspace.yaml"), "utf8").matchAll(/^\s*-\s*['"]?([^'"\n#]+?)['"]?\s*$/gm)].map((m) => m[1]) : [];
    const declared = [...(Array.isArray(pkg?.workspaces) ? pkg.workspaces : pkg?.workspaces?.packages || []), ...pnpm].filter((g) => !g.startsWith("!"));
    const globs = declared.length ? declared : PKG_DIRS.map((p) => `${p}/*`);
    const packages = [...new Set(globs.flatMap((g) => {
      const base = g.replace(/\/\*\*?$/, "");
      return base === g ? [g.replace(/\/$/, "")] : subdirs(path.join(top, base)).map((n) => `${base}/${n}`);
    }))].filter(hasManifest);
    const mono = MARKERS.some((m) => fs.existsSync(path.join(top, m))) || pkg?.workspaces || cargo || packages.length > 1;
    return { layout: mono ? "monorepo" : "single", root: top, repos: mono ? packages : [] };
  }
  const repos = findRepos(dir);
  return repos.length ? { layout: "multi-repo", root: dir, repos } : { layout: "single", root: dir, repos: [] };
}

function commandsFor(dir) {
  const pkg = readJson(path.join(dir, "package.json"));
  const out = { install: "", lint: "", typecheck: "", test: "", build: "", dev: "" };
  if (!pkg) return out;
  const pm = fs.existsSync(path.join(dir, "pnpm-lock.yaml")) ? "pnpm" : fs.existsSync(path.join(dir, "yarn.lock")) ? "yarn" : fs.existsSync(path.join(dir, "bun.lockb")) || fs.existsSync(path.join(dir, "bun.lock")) ? "bun" : "npm";
  const s = pkg.scripts || {};
  const name = (...ks) => ks.find((k) => s[k]);
  const cmd = (k) => (k ? (pm === "npm" && k === "test" ? "npm test" : `${pm} run ${k}`) : "");
  return { install: `${pm} install`, lint: cmd(name("lint")), typecheck: cmd(name("typecheck", "type-check", "tsc", "check-types")), test: cmd(name("test")), build: cmd(name("build")), dev: cmd(name("dev", "start")) };
}

function gitFacts(dir) {
  if (!isRepo(dir)) return null;
  const def = run("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], dir).replace(/^origin\//, "") || run("git", ["branch", "--show-current"], dir);
  const branches = run("git", ["for-each-ref", "--sort=-committerdate", "--count=40", "--format=%(refname:short)", "refs/remotes", "refs/heads"], dir).split("\n").filter(Boolean).map((b) => b.replace(/^origin\//, ""));
  const subjects = run("git", ["log", "-40", "--format=%s"], dir).split("\n").filter(Boolean);
  const owner = (run("git", ["remote", "get-url", "origin"], dir).match(/[:/]([^/:]+)\/[^/]+?(\.git)?$/) || [])[1] || "";
  return { def, branches, subjects, owner, integration: ["staging", "develop", "development"].find((b) => branches.includes(b)) || "" };
}

function infer(facts) {
  const branches = facts.flatMap((f) => f.branches);
  const subjects = facts.flatMap((f) => f.subjects);
  const keys = {};
  for (const s of [...branches, ...subjects]) for (const m of s.matchAll(/\b([A-Z][A-Z0-9]{1,9})-\d+\b/g)) keys[m[1]] = (keys[m[1]] || 0) + 1;
  const key = Object.entries(keys).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const ghRefs = subjects.filter((s) => /#\d+/.test(s)).length;
  const bare = branches.filter((b) => /^[A-Z][A-Z0-9]+-\d+$/.test(b)).length;
  const work = branches.filter((b) => !["main", "master", "HEAD", "staging", "develop", "development", "pre-prod", "origin"].includes(b)).length || 1;
  const conv = subjects.filter((s) => /^(feat|fix|chore|docs|refactor|test|perf|build|ci|style)(\(.+\))?!?:/.test(s)).length;
  const tick = subjects.filter((s) => /^\[?[A-Z][A-Z0-9]+-\d+/.test(s)).length;
  const n = subjects.length || 1;
  return {
    trackerType: key ? "jira" : ghRefs ? "github" : "none",
    key,
    branchName: key && bare / work >= 0.3 ? "{ticket}" : key ? "{type}/{ticket}-{slug}" : "{type}/{slug}",
    commitStyle: conv / n >= 0.5 ? "conventional" : tick / n >= 0.5 ? "ticket" : "freeform",
    base: facts.filter((f) => f.integration === "staging").length > facts.length / 2 ? "staging" : facts.find((f) => f.integration)?.integration || "default",
  };
}

const y = (v) => JSON.stringify(v ?? ""); // JSON strings are valid YAML scalars
function toYaml(c) {
  const cmds = (o, pad) => Object.entries(o).map(([k, v]) => `${pad}${k}: ${y(v)}`).join("\n");
  let out = `# .spec-driven.yml — written by spec-driven-dev setup. Edit freely, or re-run setup.\n# Every spec-* skill reads this first. Field reference: skills/spec-setup/references/config-template.yml\nversion: 1\nlayout: ${c.layout}\n`;
  if (c.repos.length) {
    out += "repos:\n" + c.repos.map((r) => {
      let e = `  - path: ${y(r.path)}\n    role: ${y(r.role)}\n`;
      if (r.base && r.base !== c.git.base_branch) e += `    git:\n      base_branch: ${y(r.base)}\n      pr_target: ${y(r.base)}\n`;
      if (r.commands && Object.values(r.commands).some(Boolean)) e += `    commands:\n${cmds(r.commands, "      ")}\n`;
      return e;
    }).join("");
  }
  out += `tracker:\n  type: ${c.tracker.type}\n  key: ${y(c.tracker.key)}\n  url: ${y(c.tracker.url)}\n`;
  out += `git:\n${cmds(c.git, "  ")}\n`;
  out += `commands:\n${cmds(c.commands, "  ")}\n  dev_url: ${y(c.devUrl)}\n`;
  out += "models:   # model per task tier; \"default\" = the session's model; escalate = last resort for repeat failures\n" + Object.entries(MODEL_DEFAULTS)
    .map(([tool, m]) => `  ${tool}:\n` + MODEL_KEYS.map((t) => `    ${t}: ${m[t]}\n`).join("")).join("");
  out += "effort:   # effort / reasoning level per tier (Claude Code, Codex): low | medium | high | xhigh | max | default\n"
    + MODEL_KEYS.map((t) => `  ${t}: ${EFFORT_DEFAULTS[t]}\n`).join("");
  out += `pipeline:\n  after_approval: ${c.afterApproval || "stop"}   # stop | run-through (implement → verify → checkpoint; ship always asks)\n`;
  return out + `specs_dir: ${y(c.specsDir)}\n`;
}

const LAYOUTS = ["single", "monorepo", "multi-repo"];
const TIERS = ["light", "standard", "deep"];
const MODEL_KEYS = [...TIERS, "escalate"]; // escalate: optional last resort when a deep task keeps failing
const EFFORTS = ["low", "medium", "high", "xhigh", "max", "default"];
// Checked against the vendors' docs on 2026-11-06 (Claude Code model-config, OpenAI Codex config,
// Cursor models page). Claude Code aliases track the newest model per family on your provider.
// Cursor's models depend on your plan, so it defaults to the session's model.
// shortcut: model names go stale; refresh these defaults (and the README table) when vendors ship new lines.
const MODEL_DEFAULTS = {
  claude: { light: "haiku", standard: "sonnet", deep: "opus", escalate: "fable" },
  codex: { light: "gpt-6-luna", standard: "gpt-6.1-sol", deep: "gpt-6.1-sol", escalate: "default" },
  cursor: { light: "default", standard: "default", deep: "default", escalate: "default" },
  antigravity: { light: "default", standard: "default", deep: "default", escalate: "default" },
};
// Effort / reasoning level per tier, for tools that support it (Claude Code, Codex).
const EFFORT_DEFAULTS = { light: "low", standard: "medium", deep: "high", escalate: "xhigh" };
const splitList = (v) => (v || "").split(",").map((x) => x.trim()).filter(Boolean);
// Paths are stored relative to the config's folder when inside it, absolute otherwise.
const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } }; // /var vs /private/var etc.
const relOrAbs = (root, p) => { const r = path.relative(real(root), real(p)); return r.startsWith("..") || path.isAbsolute(r) ? real(p) : r || "."; };

async function chooseLayout(detected) {
  const forced = opt("layout");
  if (forced && !LAYOUTS.includes(forced)) throw new Error(`--layout must be one of ${LAYOUTS.join(", ")}`);
  if (forced) return forced;
  const tag = (v) => (v === detected ? "  (detected)" : "");
  return askSelect("How is this project organised?", [
    { title: `Single repo${tag("single")}`, value: "single", description: "one git repo, one app" },
    { title: `Monorepo${tag("monorepo")}`, value: "monorepo", description: "one git repo with several apps or packages" },
    { title: `Multiple repos${tag("multi-repo")}`, value: "multi-repo", description: "several git repos that change together, in any folders" },
  ], detected);
}

const expandHome = (p) => p.replace(/^~(?=$|[\\/])/, HOME);
// Accept what people paste: surrounding quotes, ~, relative paths, Windows or POSIX separators.
const cleanPath = (v) => path.resolve(DIR, expandHome(String(v).trim().replace(/^(["'])(.*)\1$/, "$2").trim()));
const gitTop = (p) => { const t = run("git", ["rev-parse", "--show-toplevel"], p); return t ? path.resolve(t) : p; }; // git prints C:/x on Windows
function repoPathProblem(v) {
  if (!String(v || "").trim()) return null;
  const p = cleanPath(v);
  if (!fs.existsSync(p)) return `Folder not found: ${p}`;
  if (!isRepo(p)) return `Not a git repo: ${p}`;
  return null;
}

function commonParent(paths) {
  if (!paths.length) return "";
  let parts = paths[0].split(path.sep);
  for (const p of paths.slice(1)) { const q = p.split(path.sep); let i = 0; while (i < parts.length && parts[i] === q[i]) i++; parts = parts.slice(0, i); }
  return parts.join(path.sep) || path.sep;
}

// multi-repo: the repos can live anywhere (/Projects/frontend, /Work/backend, …). Pick the ones found
// nearby, add any others by path, then decide where the config lives.
async function chooseRepos(d) {
  const insideRepo = d.layout !== "multi-repo";
  const scanRoot = insideRepo ? path.dirname(d.root) : d.root;
  let picked = [];
  const fromFlag = opt("repos");
  if (fromFlag) {
    picked = splitList(fromFlag).map(cleanPath);
  } else {
    const found = findRepos(scanRoot);
    if (found.length) {
      const owners = {};
      for (const r of found) { const o = gitFacts(path.join(scanRoot, r))?.owner || "?"; (owners[o] = owners[o] || []).push(r); }
      const biggest = Object.values(owners).sort((a, b) => b.length - a.length)[0] || [];
      const here = insideRepo ? [path.relative(scanRoot, d.root)] : [];
      const pre = new Set([...here, ...(insideRepo ? [] : biggest)]);
      picked = (await askMulti(`Which of these repos (found under ${scanRoot}) belong to this workspace?`,
        found.map((r) => { const o = Object.keys(owners).find((k) => owners[k].includes(r)); return { value: r, title: r + (o && o !== "?" ? `  (${o})` : ""), selected: pre.has(r) }; })))
        .map((r) => path.join(scanRoot, r));
    } else if (insideRepo) picked = [d.root];
    // Repos elsewhere: one path at a time, checked as you type, so a typo can be fixed straight away.
    if (!YES) for (;;) {
      const v = await askText(`Add a repo from another folder — paste its path, or press Enter to finish${picked.length ? ` (${picked.length} selected)` : ""}`, "",
        (x) => repoPathProblem(x) || true);
      if (!v) break;
      picked.push(cleanPath(v));
      console.log(`  ✓ added ${gitTop(cleanPath(v))}`);
    }
  }
  const abs = [];
  for (const p of [...new Set(picked)]) {
    if (!fs.existsSync(p)) console.log(`  ✗ ${p}: folder not found — skipped`);
    else if (!isRepo(p)) console.log(`  ✗ ${p}: not a git repo — skipped`);
    else abs.push(gitTop(p));
  }
  if (!abs.length) throw new Error("A multi-repo workspace needs at least one git repo. Re-run setup and pick or add repos (or use --repos=a,b).");

  // Config location: the repos' shared parent folder, unless that's too broad (home or /), in which
  // case a named folder under ~/.spec-driven/. Repos outside it find the config via the registry.
  const parent = commonParent([...new Set(abs.map(real))].map((p) => path.dirname(p)));
  const tooBroad = !parent || parent === HOME || parent === path.parse(parent).root || HOME.startsWith(parent + path.sep);
  // Ran in a workspace folder and every repo is under it → keep the config right there.
  const allUnderScan = !insideRepo && abs.every((p) => real(p).startsWith(real(scanRoot) + path.sep));
  const defRoot = opt("workspace") ? path.resolve(DIR, expandHome(opt("workspace")))
    : allUnderScan ? scanRoot
    : tooBroad ? path.join(HOME, ".spec-driven", path.basename(abs[0]) + "-workspace") : parent;
  const root = cleanPath(await askText("Folder for this workspace's settings file (.spec-driven.yml)", defRoot));
  fs.mkdirSync(root, { recursive: true });
  const repos = [...new Set(abs)].map((p) => relOrAbs(root, p));
  console.log(`  Workspace repos: ${repos.join(", ")}`);
  return { root, repos };
}

// ~/.spec-driven/workspaces.json maps each multi-repo config to its repos, so a repo outside the
// config's folder (e.g. /Work/backend for a config in /Projects) can still find it.
const REGISTRY = () => path.join(HOME, ".spec-driven", "workspaces.json");
function readRegistry() { return readJson(REGISTRY()) || {}; }
function register(file, repoPaths) {
  const reg = readRegistry();
  reg[file] = repoPaths;
  fs.mkdirSync(path.dirname(REGISTRY()), { recursive: true });
  fs.writeFileSync(REGISTRY(), JSON.stringify(reg, null, 2) + "\n");
}

// monorepo: confirm or edit the package folders (relative to the repo root).
async function choosePackages(d) {
  const root = d.root;
  const fromFlag = opt("packages");
  let chosen = fromFlag ? splitList(fromFlag) : d.repos.length
    ? await askMulti("Which packages are part of this monorepo?", d.repos.map((r) => ({ value: r, title: r, selected: true })))
    : [];
  if (!fromFlag && !YES) for (;;) {
    const v = await askText("Add another package folder (relative to the repo root), or press Enter to finish", "",
      (x) => !String(x || "").trim() || fs.existsSync(path.resolve(root, String(x).trim())) || `Folder not found in ${root}`);
    if (!v) break;
    chosen.push(v);
  }
  const pkgs = [];
  for (const p of chosen) {
    if (fs.existsSync(path.resolve(root, p))) pkgs.push(relOrAbs(root, path.resolve(root, p)));
    else console.log(`  ✗ ${p}: folder not found in ${root} — skipped`);
  }
  return { root, repos: pkgs };
}

async function setup() {
  if (opt("after-approval") && !["stop", "run-through"].includes(opt("after-approval"))) throw new Error("--after-approval must be stop or run-through");
  console.log("\nProject setup — detecting how this project works…");
  const d = detectLayout(DIR);
  console.log(d.layout === "multi-repo" ? `Detected: ${d.repos.length} git repos under ${d.root} (multi-repo).`
    : d.layout === "monorepo" ? `Detected: monorepo at ${d.root} with ${d.repos.length} package(s)${d.repos.length ? `: ${d.repos.join(", ")}` : ""}.`
    : isRepo(d.root) ? `Detected: single repo at ${d.root}. If it works together with other repos, choose multi-repo.`
    : `Detected: no git repo in ${d.root}. Choose multi-repo to list your repos, wherever they are.`);
  const layout = await chooseLayout(d.layout);
  const { root, repos } = layout === "multi-repo" ? await chooseRepos(d) : layout === "monorepo" ? await choosePackages(d) : { root: d.layout === "multi-repo" ? DIR : d.root, repos: [] };
  if (layout === "single" && !isRepo(root)) console.log(`  • ${root} isn't a git repo — run setup inside the repo, or choose multi-repo.`);
  const file = path.join(root, ".spec-driven.yml");
  if (fs.existsSync(file) && !(await askConfirm(`${file} already exists. Replace it?`, false))) {
    console.log("• Kept the existing config. Run the spec-setup skill in your AI tool to review it.");
    return;
  }

  const repoDirs = layout === "multi-repo" ? repos.map((r) => path.resolve(root, r)) : [root];
  const facts = repoDirs.map(gitFacts).filter(Boolean);
  const g = infer(facts);
  if (facts.length) console.log(`Detected: tracker ${g.trackerType}${g.key ? ` (${g.key}-…)` : ""}, base ${g.base}, branches "${g.branchName}", commits ${g.commitStyle}`);

  const det = (v, d) => (v === d ? "  (detected)" : "");
  const trackerType = await askSelect("Where do your tickets live?", [
    { title: `Jira${det("jira", g.trackerType)}`, value: "jira" },
    { title: `GitHub Issues${det("github", g.trackerType)}`, value: "github" },
    { title: `Linear${det("linear", g.trackerType)}`, value: "linear" },
    { title: `No tracker${det("none", g.trackerType)}`, value: "none", description: "work from transcripts, docs, or plain descriptions" },
  ], g.trackerType);
  const key = trackerType === "jira" || trackerType === "linear" ? (await askText("Ticket key prefix (the STP in STP-123)", g.key)).toUpperCase() : "";
  const url = trackerType === "none" ? "" : await askText("Tracker URL (optional, press Enter to skip)", "");
  const branchChoices = (initial) => [
    { title: "Each repo's default branch", value: "default", description: "e.g. main or master" },
    ...[...new Set(facts.map((f) => f.integration).filter(Boolean).concat(initial !== "default" ? [initial] : []))].map((b) => ({ title: b, value: b })),
    { title: "Another branch…", value: "__other" },
  ];
  const pickBranch = async (message, initial) => {
    const v = await askSelect(message, branchChoices(initial), initial);
    return v === "__other" ? askText("Branch name", "") : v;
  };
  const base = await pickBranch("Which branch is new work started from?", g.base);
  const pr = await pickBranch("Which branch do pull requests go into?", base);
  const ex = key || "STP";
  let branchName = await askSelect("How are work branches named?", [
    { title: `${ex}-123${det("{ticket}", g.branchName)}`, value: "{ticket}", description: "just the ticket ID" },
    { title: `feat/${ex}-123-add-login${det("{type}/{ticket}-{slug}", g.branchName)}`, value: "{type}/{ticket}-{slug}" },
    { title: `feat/add-login${det("{type}/{slug}", g.branchName)}`, value: "{type}/{slug}", description: "no ticket ID" },
    { title: "Custom pattern…", value: "__custom" },
  ], g.branchName);
  if (branchName === "__custom") branchName = await askText("Pattern using {ticket}, {slug}, {type}", g.branchName, (x) => /\{(ticket|slug)\}/.test(x) || "Include {ticket} or {slug}");
  const commitStyle = await askSelect("How are commit messages written?", [
    { title: `feat: add login${det("conventional", g.commitStyle)}`, value: "conventional", description: "conventional commits" },
    { title: `${ex}-123: add login${det("ticket", g.commitStyle)}`, value: "ticket", description: "ticket ID first" },
    { title: `Add login${det("freeform", g.commitStyle)}`, value: "freeform", description: "no fixed format" },
  ], g.commitStyle);
  const specsDir = await askText("Folder for specs (one sub-folder per feature)", "specs");
  const afterApproval = opt("after-approval") || await askSelect("After you approve a spec…", [
    { title: "Stop after each stage", value: "stop", description: "you start implement, verify and checkpoint yourself" },
    { title: "Run straight through", value: "run-through", description: "implement → verify → commit in one go; stops at any failure, never pushes without asking" },
  ], "stop");

  const config = {
    layout, tracker: { type: trackerType, key, url }, specsDir, devUrl: "", afterApproval,
    git: { remote: "origin", base_branch: base, pr_target: pr, branch_name: branchName, commit_style: commitStyle },
    commands: layout === "single" ? commandsFor(repoDirs[0]) : commandsFor(root),
    repos: repos.map((r) => {
      const f = layout === "multi-repo" ? gitFacts(path.resolve(root, r)) : null;
      // a repo without an integration branch must say so, or it inherits the top-level base (e.g. staging) it doesn't have
      return { path: r, role: "", base: f ? f.integration || "default" : "", commands: commandsFor(path.resolve(root, r)) };
    }),
  };
  fs.writeFileSync(file, toYaml(config));
  if (layout === "multi-repo") register(real(file), repos.map((r) => real(path.resolve(root, r))));
  console.log(`✓ Wrote ${file}`);
  console.log(isRepo(root) ? "  Commit it so your team shares the same rules." : "  This folder isn't a git repo, so the config is personal to this machine.");
  console.log('  Fill in repo roles, dev_url, and non-Node commands by asking your AI tool to "run spec-setup".');
}

// ---------- reading the config ----------
// shortcut: parses the YAML subset setup writes (nested maps, lists of maps, scalars); a full YAML parser if users start hand-writing anchors/flow style.
function parseYaml(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  const scalar = (v) => {
    v = v.replace(/\s+#.*$/, "").trim();
    if (/^".*"$/.test(v)) return JSON.parse(v);
    if (/^'.*'$/.test(v)) return v.slice(1, -1);
    return v;
  };
  for (const raw of text.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.search(/\S/);
    let line = raw.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    let parent = stack[stack.length - 1].node;
    if (line.startsWith("- ")) {
      const item = {};
      parent.push(item);
      stack.push({ indent, node: item });
      parent = item;
      line = line.slice(2);
    }
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    const val = rawVal.replace(/(^|\s+)#.*$/, "").trim();  // `key:   # comment` opens a block
    if (val === "") {
      const next = text.split("\n").slice(text.split("\n").indexOf(raw) + 1).find((l) => l.trim() && !l.trim().startsWith("#"));
      parent[key] = next && next.trim().startsWith("- ") ? [] : {};
      stack.push({ indent: line === raw.trim() ? indent : indent + 2, node: parent[key] });
    } else parent[key] = scalar(val);
  }
  return root;
}

function findConfig(dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    const f = path.join(d, ".spec-driven.yml");
    if (fs.existsSync(f)) return f;
    if (d === path.dirname(d) || d === HOME) break;
  }
  // Not above us: a multi-repo workspace elsewhere may list this repo.
  const here = real(dir);
  for (const [file, repos] of Object.entries(readRegistry()))
    if (fs.existsSync(file) && repos.some((r) => here === r || here.startsWith(r + path.sep))) return file;
  return null;
}

function doctor() {
  const file = findConfig(DIR);
  if (!file) throw new Error(`No .spec-driven.yml in ${DIR} or above. Run: spec-driven-dev setup  (or npx @benjaminthomas/spec-driven-dev setup)`);
  const root = path.dirname(file);
  let c;
  try { c = parseYaml(fs.readFileSync(file, "utf8")); } catch (e) { throw new Error(`${file} could not be read: ${e.message}`); }
  const problems = [], notes = [];
  if (!["single", "monorepo", "multi-repo"].includes(c.layout)) problems.push(`layout "${c.layout}" must be single, monorepo, or multi-repo`);
  if (c.tracker && !["jira", "github", "linear", "none"].includes(c.tracker.type)) problems.push(`tracker.type "${c.tracker.type}" must be jira, github, linear, or none`);
  if (c.git?.commit_style && !["conventional", "ticket", "freeform"].includes(c.git.commit_style)) problems.push(`git.commit_style "${c.git.commit_style}" must be conventional, ticket, or freeform`);
  for (const [tool, m] of Object.entries(c.models || {})) {
    if (typeof m !== "object") { problems.push(`models.${tool} must list light / standard / deep`); continue; }
    for (const t of TIERS) if (!m[t]) problems.push(`models.${tool}.${t} is missing (use "default" for the session's model)`);
    for (const k of Object.keys(m)) if (!MODEL_KEYS.includes(k)) problems.push(`models.${tool}.${k}: unknown tier (use light, standard, deep, escalate)`);
  }
  for (const [k, v] of Object.entries(c.effort || {})) {
    if (!MODEL_KEYS.includes(k)) problems.push(`effort.${k}: unknown tier (use light, standard, deep, escalate)`);
    else if (!EFFORTS.includes(v)) problems.push(`effort.${k} "${v}" must be one of ${EFFORTS.join(", ")}`);
  }
  if (c.pipeline?.after_approval && !["stop", "run-through"].includes(c.pipeline.after_approval)) problems.push(`pipeline.after_approval "${c.pipeline.after_approval}" must be stop or run-through`);
  if (c.git?.branch_name && !/\{(ticket|slug)\}/.test(c.git.branch_name)) problems.push(`git.branch_name "${c.git.branch_name}" needs {ticket} or {slug}`);
  const repos = c.layout === "single" ? [{ path: "." }] : Array.isArray(c.repos) ? c.repos : [];
  if (c.layout !== "single" && !repos.length) problems.push(`layout is ${c.layout} but repos: is empty`);
  for (const r of repos) {
    const dir = path.resolve(root, r.path || ".");
    const label = r.path === "." ? "repo" : r.path;
    if (!fs.existsSync(dir)) { problems.push(`${label}: folder not found`); continue; }
    const gitDir = c.layout === "monorepo" ? root : dir;
    if (c.layout !== "monorepo" && !isRepo(gitDir)) { problems.push(`${label}: not a git repo`); continue; }
    if (c.layout === "multi-repo" && !r.role) notes.push(`${label}: no role — investigations search better with one`);
    if (/\(role inferred, verify\)/.test(r.role || "")) notes.push(`${label}: role is still marked "inferred, verify"`);
    for (const k of ["base_branch", "pr_target"]) {
      const b = r.git?.[k] || c.git?.[k];
      if (b && b !== "default" && isRepo(gitDir) && !run("git", ["rev-parse", "--verify", "--quiet", `refs/remotes/${c.git?.remote || "origin"}/${b}`], gitDir) && !run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${b}`], gitDir))
        problems.push(`${label}: git.${k} "${b}" doesn't exist (locally or on ${c.git?.remote || "origin"})`);
    }
    const pkg = readJson(path.join(dir, "package.json"));
    const cmds = { ...(c.layout === "single" ? c.commands : {}), ...(r.commands || {}) };
    for (const [k, v] of Object.entries(cmds)) {
      const script = typeof v === "string" && v.match(/^(?:npm|pnpm|yarn|bun) run ([\w:.-]+)$/)?.[1];
      if (script && pkg && !pkg.scripts?.[script]) problems.push(`${label}: commands.${k} runs "${script}", which isn't in package.json scripts`);
    }
  }
  const specs = path.join(root, c.specs_dir || "specs");
  if (!fs.existsSync(specs)) notes.push(`${c.specs_dir || "specs"}/ doesn't exist yet — created on first spec`);
  console.log(`Checked ${file}`);
  for (const n of notes) console.log(`  • ${n}`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  if (problems.length) { process.exitCode = 1; console.log(`${problems.length} problem(s). Fix the file, or ask your AI tool to "run spec-setup".`); }
  else console.log("✓ Config matches the repos.");
}

// Silent unless something is unfinished, so it costs no context in a session start hook.
function status() {
  const file = findConfig(DIR);
  const root = file ? path.dirname(file) : DIR;
  const specsName = (file && parseYaml(fs.readFileSync(file, "utf8")).specs_dir) || "specs";
  const specs = path.join(root, specsName);
  const lines = [];
  for (const name of subdirs(specs)) {
    const readme = path.join(specs, name, "README.md");
    if (!fs.existsSync(readme)) {
      if (fs.existsSync(path.join(specs, name, "investigation.md"))) lines.push(`- ${specsName}/${name}: investigated, no spec yet → next: spec-create`);
      continue;
    }
    const t = fs.readFileSync(readme, "utf8");
    const done = (t.match(/^\s*- \[x\]/gim) || []).length, todo = (t.match(/^\s*- \[ \]/gm) || []).length;
    if (todo) lines.push(`- ${specsName}/${name}: ${done}/${done + todo} tasks done → next: spec-implement`);
    else if (done && !fs.existsSync(path.join(specs, name, "verification-report.md"))) lines.push(`- ${specsName}/${name}: all tasks done, not verified → next: spec-verify`);
  }
  if (lines.length) console.log(`spec-driven-dev: unfinished work in ${root}\n${lines.join("\n")}`);
}

try {
  if (command === "doctor") doctor();
  else if (command === "status") status();
  else if (command === "install") {
    await install();
    if (!flag("no-setup") && (await askConfirm("Set up this project now?", true))) await setup();
  } else if (command === "setup") await setup();
  else throw new Error(`Unknown command "${command}" — use install (default), setup, doctor, or status`);
  if (["install", "setup"].includes(command)) console.log('\nNext: in your AI tool, say "investigate <ticket>" or "create a spec".');
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
} finally {
}
