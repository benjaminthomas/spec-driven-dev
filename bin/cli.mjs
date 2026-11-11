#!/usr/bin/env node
// spec-driven-dev installer (npm i -g @benjaminthomas/spec-driven-dev): detects your AI coding tools, copies the skills into each one, and
// runs project discovery (layout, tracker, branches, commands) to write .spec-driven.yml.
//
//   spec-driven-dev                 install the skills, then hand over to your AI tool ("run spec-setup")
//   spec-driven-dev setup           scripted setup for CI: needs --yes or answer flags (people: say "run spec-setup")
//   spec-driven-dev ci              write GitHub Actions that refresh GitRisk hotspots on every merge (--notify also writes the per-repo trigger)
//   spec-driven-dev uninstall       remove the skills (all tools), the Claude Code plugin and the download cache; --all also removes the settings file
//   spec-driven-dev doctor          check .spec-driven.yml against the real repos (exit 1 on problems)
//   spec-driven-dev status          list specs with unfinished work and each one's "Resume here" next step
//   spec-driven-dev context         print specs/CONTEXT.md; --areas=billing,api prints only those area files
//   spec-driven-dev risk            GitRisk: score files from git history into specs/context/risk.md (--files=a,b  --json  --top=N  --since=…)
//   spec-driven-dev settings        switch features from a menu (GitRisk, run-through, sharing); or --risk=on|off --after-approval=… --share=all|memory|none
//   spec-driven-dev risk-eval       U8 experiment: run tickets with risk on vs off and compare agent behaviour (--tickets=<file> --runs=N --model=… --arms=on,off --timeout=20)
//   flags: --yes  --global  --tools=claude,cursor  --skills=spec-create,...  --no-setup  --dir=<path>
//          --layout=single|monorepo|multi-repo  --repos=~/Projects/frontend,/srv/backend  --workspace=<config dir>
//          --packages=apps/web,packages/ui  --after-approval=stop|run-through  --project=new|existing  --risk=on|off  --share=all|memory|none  --specs-dir=<path>  --version
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import prompts from "prompts";  // arrow-key menus that work in PowerShell, cmd, macOS and Linux terminals
import { fileURLToPath } from "node:url";
import { scoreRepo, riskMarkdown, normWeights, weightProblems, setConfigValue, riskSummaryBlock, withRiskSummary } from "./risk.mjs";
import { SHARE_MODES, shareState, planShare, shareTitle } from "./share.mjs";

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
const YES = flag("yes") || flag("y") || !process.stdin.isTTY || ["doctor", "status", "context", "risk", "risk-eval", "setup", "ci"].includes(command) || (command === "uninstall" && flag("yes"));
const DIR = path.resolve(opt("dir") || process.cwd());

// Colour only for a person at a terminal; pipes, CI and NO_COLOR get plain text (and the tests stay plain).
const COLOR = (process.stdout.isTTY || !!process.env.FORCE_COLOR) && !process.env.NO_COLOR && process.env.TERM !== "dumb";
const paint = (code) => (t) => (COLOR ? `\x1b[${code}m${t}\x1b[0m` : t);
const ink = { green: paint("32"), yellow: paint("33"), red: paint("31"), cyan: paint("36"), magenta: paint("35"), blue: paint("34"), bold: paint("1"), dim: paint("2") };
// Each stage gets its own colour so the steps are easy to tell apart while scrolling.
const step = (n, title, color) => console.log(`\n${color(ink.bold(`━━ ${n} · ${title} `))}${color("━".repeat(Math.max(4, 44 - title.length)))}`);
if (COLOR) {
  const plain = console.log.bind(console);
  console.log = (...a) => {
    const t = a.join(" ");
    plain(t.replace(/^(\s*)(✓)/gm, (_, s, g) => s + ink.green(g)).replace(/^(\s*)(✗.*)$/gm, (_, s, g) => s + ink.red(g))
      .replace(/^(\s*)(•)/gm, (_, s, g) => s + ink.yellow(g)).replace(/^(Next:.*)$/gm, (_, g) => ink.cyan(ink.bold(g))));
  };
}

if (flag("version") || flag("v")) {
  console.log(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version);
  process.exit(0);
}
// No terminal to answer in (e.g. `!` in Claude Code, an IDE task, a pipe) and nothing passed explicitly:
// stop rather than write a config from guesses.
const ANSWER_FLAGS = ["share", "specs-dir", "risk", "yes", "y", "layout", "repos", "packages", "tools", "workspace", "after-approval", "skills", "global", "no-setup", "project"];
const NO_TTY = !process.stdin.isTTY && !args.some((a) => ANSWER_FLAGS.some((f) => a === `--${f}` || a.startsWith(`--${f}=`)));
// Installing the skills needs no answers, so the default command still does that without a terminal
// (e.g. `!` in Claude Code) and hands the questions to the spec-setup skill, which asks them in the chat.
const HANDOFF = command === "install" && NO_TTY;
// Setup is a conversation in the AI tool now; the setup command stays for scripts and CI (flags only).
const SETUP_IN_AGENT = command === "setup" && !args.some((a) => ANSWER_FLAGS.some((f) => a === `--${f}` || a.startsWith(`--${f}=`)));
if (command === "settings" && NO_TTY) {
  console.log(`✗ No interactive terminal, so ${command === "settings" ? "the settings menu can't open" : "setup can't ask its questions"}. Nothing was changed.

  This happens when it runs through another program: a "!" command in Claude Code, an editor task,
  or piped input. Either:
    • run it yourself in a terminal window (Terminal, iTerm, or your editor's terminal panel):
        npx @benjaminthomas/spec-driven-dev@latest settings
    • or give the answer as a flag, for example:
        npx @benjaminthomas/spec-driven-dev@latest settings --risk=off`);
  process.exit(1);
}

if (flag("help") || flag("h")) {
  const lines = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1);
  console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith("//"))).join("\n").replace(/^\/\/ ?/gm, "")); // the whole header comment
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
  step(1, "Install the skills", ink.blue);
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
  if (!dests.length) console.log(HANDOFF ? "• No AI coding tools found (Claude Code, Cursor, Codex or Antigravity). Install one, or pass --tools=claude,cursor." : "• No tools selected — nothing installed.");
  return dests.length ? tools : [];
}

// The setup questions (layout, repos, tracker, branches, sharing) and the audit need a model, so they
// happen in the AI tool. Claude Code and Codex can be opened with the request already typed in.
const LAUNCHERS = [["claude", "Claude Code"], ["codex", "Codex"]];
async function handOver(tools, onlySetup) {
  // The folder says where the AI tool opens; "project" says what gets set up (it can span several repos).
  const name = path.basename(gitTop(DIR));
  const what = "It first asks how your project is organised: one repo, a monorepo, or several repos that change together.";
  const next = `Next: in ${name}, open your AI tool and say "run spec-setup".\n${what}
Then it asks about your tracker, branches and sharing, and looks through the code.
Start a new session if your tool doesn't recognise it yet.`;
  step(onlySetup ? 1 : 2, "Set up your project in your AI tool", ink.magenta);
  if (onlySetup) {
    console.log(`Setup happens in your AI tool now, so it can read the code and you can change any answer as you go.\n${next}\nFor scripts and CI: spec-driven-dev setup --yes [--layout=… --repos=… --share=…]`);
    return;
  }
  const launcher = LAUNCHERS.find(([bin]) => tools.includes(bin) && onPath(bin));
  if (!launcher || !process.stdin.isTTY || YES) { console.log(`Skills installed.\n${next}`); return; }
  // The question carries the explanation, so there's no paragraph to read twice.
  if (!(await askConfirm(`Open ${launcher[1]} in ${name} to set up your project? ${what} (A few minutes, on your ${launcher[1]} plan.)`, true))) {
    console.log(next);
    return;
  }
  const { spawnSync } = await import("node:child_process");
  spawnSync(launcher[0], ["run spec-setup"], { cwd: DIR, stdio: "inherit" });
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
    // A Shopify app keeps its app extensions in npm workspaces under extensions/: one app, not a monorepo.
    const shopifyApp = fs.readdirSync(top).some((f) => /^shopify\.app.*\.toml$/.test(f)) && declared.length > 0 && declared.every((g) => g.startsWith("extensions/"));
    const mono = !shopifyApp && (MARKERS.some((m) => fs.existsSync(path.join(top, m))) || pkg?.workspaces || cargo || packages.length > 1);
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
  let out = `# .spec-driven.yml — written by spec-driven-dev. Edit freely, or say \"run spec-setup\" in your AI tool to review it.\n# Every spec-* skill reads this first. Field reference: skills/spec-setup/references/config-template.yml\nversion: 1\nlayout: ${c.layout}\n`;
  if (c.repos.length) {
    out += "repos:\n" + c.repos.map((r) => {
      let e = `  - path: ${y(r.path)}\n    role: ${y(r.role)}\n`;
      const g = [r.base && r.base !== c.git.base_branch ? `      base_branch: ${y(r.base)}\n      pr_target: ${y(r.base)}\n` : "", r.commitStyle ? `      commit_style: ${y(r.commitStyle)}\n` : ""].join("");
      if (g) e += `    git:\n${g}`;
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
  out += `context:   # project memory: {specs_dir}/CONTEXT.md (index) + context/<area>.md\n  project: ${c.project || "existing"}   # existing | new\n  graph: auto   # auto = use graphify if installed | off\n  share: ${c.share || "all"}   # all | memory | none: what's committed from the specs folder\n`;
  out += "risk:   # GitRisk: historical risk per file from git (spec-driven-dev risk). Weights are a hypothesis to calibrate\n  enabled: on   # on | off (off = skills ignore risk; risk-eval compares the two)\n  since: \"2 years ago\"\n  weights:\n    churn: 0.30\n    bug_density: 0.35\n    fan_out: 0.20\n    security: 0.15\n";
  out += `pipeline:\n  after_approval: ${c.afterApproval || "stop"}   # stop | run-through (implement → verify → review → checkpoint; ship always asks)\n`;
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

// shortcut: counts only (no model here), so a big template repo with 1 commit reads as existing; the spec-setup skill confirms.
function detectProject(dirs) {
  const n = (d, a) => Number(run("git", a, d).split("\n").filter(Boolean).length);
  const commits = dirs.reduce((t, d) => t + (Number(run("git", ["rev-list", "--count", "HEAD"], d)) || 0), 0);
  const files = dirs.reduce((t, d) => t + n(d, ["ls-files"]), 0);
  return { commits, files, kind: commits >= 20 || files >= 50 ? "existing" : "new" };
}

async function setup() {
  if (opt("project") && !["new", "existing"].includes(opt("project"))) throw new Error("--project must be new or existing");
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
  const specsDir = await chooseSpecsDir(layout, root, repos);
  const share = await chooseShare(root, specsDir);
  const afterApproval = opt("after-approval") || await askSelect("After you approve a spec…", [
    { title: "Stop after each stage", value: "stop", description: "you start implement, verify and checkpoint yourself" },
    { title: "Run straight through", value: "run-through", description: "implement → verify → review → commit in one go; stops at any failure or review blocker, never pushes without asking" },
  ], "stop");

  const pd = detectProject(repoDirs.filter(isRepo));
  const project = opt("project") || await askSelect("Is this a new project or an existing one?", [
    { title: `Existing project${pd.kind === "existing" ? "  (detected)" : ""}`, value: "existing", description: `${pd.commits} commits, ${pd.files} files — your AI tool audits it once and saves what it learns` },
    { title: `New project${pd.kind === "new" ? "  (detected)" : ""}`, value: "new", description: "nothing to audit — your AI tool asks about the stack and conventions you want" },
  ], pd.kind);

  const config = {
    project, share: share || "none", layout, tracker: { type: trackerType, key, url }, specsDir, devUrl: "", afterApproval,
    git: { remote: "origin", base_branch: base, pr_target: pr, branch_name: branchName, commit_style: commitStyle },
    commands: layout === "single" ? commandsFor(repoDirs[0]) : commandsFor(root),
    repos: repos.map((r) => {
      const f = layout === "multi-repo" ? gitFacts(path.resolve(root, r)) : null;
      // a repo without an integration branch must say so, or it inherits the top-level base (e.g. staging) it doesn't have
      // each repo keeps its own commit style when it differs from the workspace's (one repo uses STP-123:, another feat:)
      const own = f && f.subjects.length >= 5 ? infer([f]).commitStyle : "";
      return { path: r, role: "", base: f ? f.integration || "default" : "", commitStyle: own && own !== commitStyle ? own : "", commands: commandsFor(path.resolve(root, r)) };
    }),
  };
  fs.writeFileSync(file, toYaml(config));
  if (layout === "multi-repo") register(real(file), repos.map((r) => real(path.resolve(root, r))));
  console.log(`✓ Wrote ${file}`);
  if (share) await applyShare(root, specsDir, share, { quietIfSame: true });
  console.log(isRepo(root) ? "  Commit it so your team shares the same rules." : "  This folder isn't a git repo, so the config is personal to this machine.");
  console.log(project === "existing"
    ? `  Next: ask your AI tool to "run spec-setup". It audits the ${layout === "multi-repo" ? "repos" : "repo"}, asks a few questions, and saves ${specsDir}/CONTEXT.md.`
    : `  Next: ask your AI tool to "run spec-setup". It asks about your stack and conventions and saves ${specsDir}/CONTEXT.md.`);
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

// A multi-repo config applies only in its own folder and inside the repos it lists, so a repo that
// merely sits under that folder (e.g. ~/Projects/other-project) doesn't pick up the workspace's rules.
function configApplies(f, dir) {
  let c;
  try { c = parseYaml(fs.readFileSync(f, "utf8")); } catch { return true; }
  if (c.layout !== "multi-repo" || !Array.isArray(c.repos)) return true;
  const here = real(dir), base = path.dirname(f);
  return here === real(base) || c.repos.some((r) => { const p = real(path.resolve(base, expandHome(String(r.path || "")))); return here === p || here.startsWith(p + path.sep); });
}

function findConfig(dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    const f = path.join(d, ".spec-driven.yml");
    if (fs.existsSync(f) && configApplies(f, dir)) return f;
    if (d === path.dirname(d) || d === HOME) break;
  }
  // Not above us: a multi-repo workspace elsewhere may list this repo.
  const here = real(dir);
  for (const [file, repos] of Object.entries(readRegistry()))
    if (fs.existsSync(file) && repos.some((r) => here === r || here.startsWith(r + path.sep))) return file;
  return null;
}

function doctor() {
  if (COLOR) step("✓", "Check the settings", ink.cyan);
  const file = findConfig(DIR);
  if (!file) throw new Error(`No .spec-driven.yml in ${DIR} or above. In your AI tool, say "run spec-setup".`);
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
  if (c.context?.project && !["new", "existing"].includes(c.context.project)) problems.push(`context.project "${c.context.project}" must be new or existing`);
  if (c.context?.graph && !["auto", "off"].includes(c.context.graph)) problems.push(`context.graph "${c.context.graph}" must be auto or off`);
  // Multi-repo context names paths from the workspace folder (soreto-shopify/app/) or from inside a repo (app/).
  const repoRoots = c.layout === "multi-repo" ? [root, ...(c.repos || []).map((r) => path.resolve(root, expandHome(r.path)))] : [root];
  checkContext(specs, c.specs_dir || "specs", repoRoots, problems, notes);
  // The team's repo list (in the specs location) vs the repos on this machine.
  const team = parseYaml(fs.existsSync(path.join(specs, "team-repos.yml")) ? fs.readFileSync(path.join(specs, "team-repos.yml"), "utf8") : "").repos;
  if (Array.isArray(team)) {
    const mine = new Set((c.repos || []).map((r) => path.basename(String(r.path || "").replace(/\/+$/, ""))));
    for (const t of team) {
      if (!t.name || mine.has(t.name)) continue;
      const here = path.join(root, t.name);
      notes.push(isRepo(here) ? `${t.name} is cloned at ${here} but isn't in this workspace — say "add ${t.name} to the workspace" if you work on it`
        : `team repo ${t.name} isn't on this machine (fine if you don't work on it)${t.url ? `: git clone ${t.url} ${here}` : ""}`);
    }
  }
  if (c.context?.share) {
    if (!SHARE_MODES.includes(c.context.share)) problems.push(`context.share "${c.context.share}" must be all, memory or none`);
    const g = specsInGit(root, c.specs_dir || "specs");
    if (!g && c.context.share !== "none") notes.push(`context.share is ${c.context.share}, but ${c.specs_dir || "specs"} isn't inside a git repo, so nothing can be shared`);
    else if (g && SHARE_MODES.includes(c.context.share) && shareState(g.top, g.rel) !== c.context.share)
      notes.push(`context.share is ${c.context.share}, but .gitignore makes it "${shareTitle[shareState(g.top, g.rel)].toLowerCase()}". Fix: spec-driven-dev settings --share=${c.context.share}`);
  }
  const rmd = path.join(specs, "context", "risk.md"), rtop = run("git", ["rev-parse", "--show-toplevel"], root);
  if (rtop && fs.existsSync(rmd) && run("git", ["ls-files", path.relative(path.resolve(rtop), real(rmd))], rtop))
    problems.push(`${c.specs_dir || "specs"}/context/risk.md is committed to git. It's regenerated on every run, so it causes merge conflicts. Run: git rm --cached ${path.relative(path.resolve(rtop), real(rmd))}  (spec-driven-dev risk adds it to .gitignore)`);
  if (c.risk) {
    if (c.risk.enabled && !["on", "off"].includes(c.risk.enabled)) problems.push(`risk.enabled "${c.risk.enabled}" must be on or off`);
    problems.push(...weightProblems(c.risk.weights));
    if (c.risk.enabled !== "off" && !fs.existsSync(path.join(specs, "context", "risk.md"))) notes.push(`risk is on but ${c.specs_dir || "specs"}/context/risk.md doesn't exist — run: spec-driven-dev risk`);
  }
  console.log(`Checked ${file}`);
  for (const n of notes) console.log(`  • ${n}`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  if (problems.length) { process.exitCode = 1; console.log(`${problems.length} problem(s). Fix the file, or ask your AI tool to "run spec-setup".`); }
  else console.log("✓ Config matches the repos.");
}

const LIMITS = { "CONTEXT.md": 60, area: 150 };
// Context lines point at code as `path` or `path:line`; flag the ones that no longer exist anywhere in the repos.
function checkContext(specs, specsName, repoRoots, problems, notes) {
  const index = path.join(specs, "CONTEXT.md");
  if (!fs.existsSync(index)) { notes.push(`no ${specsName}/CONTEXT.md yet — ask your AI tool to "run spec-setup" to audit the project`); return; }
  const areaDir = path.join(specs, "context");
  const files = [index, ...(fs.existsSync(areaDir) ? fs.readdirSync(areaDir).filter((f) => f.endsWith(".md") && f !== "archive.md").map((f) => path.join(areaDir, f)) : [])];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const rel = path.relative(specs, f), max = f === index ? LIMITS["CONTEXT.md"] : LIMITS.area, lines = text.split("\n").length;
    if (lines > max) problems.push(`${specsName}/${rel} is ${lines} lines (limit ${max}) — merge duplicates or move old entries to context/archive.md`);
    for (const [, p] of text.matchAll(/`([\w.@-]+(?:\/[\w.@-]+)+\/?)(?::\d+)?`/g)) {
      if (p.startsWith("context/") || /^(?:https?|www|@)/.test(p)) continue; // @scope/pkg is a package name, not a path
      if (!repoRoots.some((r) => fs.existsSync(path.join(r, p)))) notes.push(`${specsName}/${rel} mentions \`${p}\`, which no longer exists — stale context?`);
    }
  }
}

function context() {
  const file = findConfig(DIR);
  const root = file ? path.dirname(file) : DIR;
  const specsName = (file && parseYaml(fs.readFileSync(file, "utf8")).specs_dir) || "specs";
  const index = path.join(root, specsName, "CONTEXT.md");
  const areas = splitList(opt("areas"));
  if (!areas.length) {
    if (!fs.existsSync(index)) { console.log(`No ${specsName}/CONTEXT.md yet. Ask your AI tool to "run spec-setup" to create it.`); return; }
    process.stdout.write(fs.readFileSync(index, "utf8"));
    return;
  }
  for (const a of areas) {
    const f = path.join(root, specsName, "context", `${a.replace(/[^\w-]/g, "")}.md`);
    if (fs.existsSync(f)) process.stdout.write(fs.readFileSync(f, "utf8").replace(/\n*$/, "\n\n"));
    else console.log(`(no ${specsName}/context/${a}.md — nothing recorded for this area yet)\n`);
  }
}

// ---------- sharing specs through git ----------
function specsInGit(root, specsDir) {
  const abs = path.resolve(root, specsDir);
  let probe = abs;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const top = run("git", ["rev-parse", "--show-toplevel"], probe);
  if (!top) return null;
  const rel = path.relative(path.resolve(top), real(probe)).split(path.sep).concat(path.relative(probe, abs).split(path.sep)).filter((x) => x && x !== ".").join("/");
  return rel.startsWith("..") ? null : { top, rel };
}

async function chooseSpecsDir(layout, root, repos) {
  if (opt("specs-dir")) return opt("specs-dir");
  if (layout !== "multi-repo" || isRepo(root)) return askText("Folder for specs (one sub-folder per feature)", "specs");
  // The workspace folder isn't a repo, so specs kept there can never be shared through git.
  return askSelect("Where should specs and project memory live?", [
    { title: `In this workspace folder (${path.join(root, "specs")})`, value: "specs", description: "on this machine only; it isn't a git repo, so it can't be shared" },
    ...repos.map((r) => ({ title: `Inside ${r}/specs`, value: `${r}/specs`.replace(/^\.\//, ""), description: "can be shared with the team through that repo" })),
  ], "specs");
}

async function chooseShare(root, specsDir) {
  const g = specsInGit(root, specsDir);
  if (opt("share") && !SHARE_MODES.includes(opt("share"))) throw new Error("--share must be all, memory or none");
  if (!g) { if (opt("share") && opt("share") !== "none") console.log(`  • ${specsDir} isn't inside a git repo, so it can't be shared. Choose a folder inside a repo (--specs-dir) to share it.`); return null; }
  if (!g.rel) { console.log(`  • ${specsDir} is a repo of its own, so everything in it is shared.`); return "all"; }
  const now = shareState(g.top, g.rel);
  if (now !== "all") console.log(`  • Your .gitignore currently makes ${g.rel}: ${shareTitle[now].toLowerCase()}.`);
  return opt("share") || askSelect("Share specs and project memory with your team?", [
    { title: `Share everything${now === "all" ? "  (current)" : ""}  (recommended)`, value: "all", description: "commit plans, investigations, reviews and project memory; teammates and PR reviewers see the reasoning" },
    { title: `Share project memory only${now === "memory" ? "  (current)" : ""}`, value: "memory", description: "commit CONTEXT.md and context/; keep each feature's working files local" },
    { title: `Keep everything local${now === "none" ? "  (current)" : ""}`, value: "none", description: "ignore the specs folder; nothing is shared" },
  ], now === "custom" ? "all" : now);
}

async function applyShare(root, specsDir, mode, { quietIfSame } = {}) {
  const g = specsInGit(root, specsDir);
  if (!g) { console.log(`  • ${specsDir} isn't inside a git repo, so there's nothing to share or ignore.`); return; }
  if (!g.rel) mode = "all"; // a dedicated specs repo is shared by definition
  if (quietIfSame && shareState(g.top, g.rel) === mode && mode !== "all") return;
  const gi = path.join(g.top, ".gitignore");
  const before = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
  const plan = planShare(before, g.rel, mode);
  if (plan.text === before) return;
  if (plan.removed.length && !opt("share") && !(await askConfirm(`To ${shareTitle[mode].toLowerCase()}, these .gitignore lines would be replaced: ${plan.removed.join(", ")}. Go ahead?`, true))) {
    console.log("  • Left .gitignore as it was. Change it later with: spec-driven-dev settings");
    return;
  }
  fs.writeFileSync(gi, plan.text);
  console.log(`  ✓ .gitignore updated: ${shareTitle[mode].toLowerCase()}${plan.removed.length ? ` (replaced: ${plan.removed.join(", ")})` : ""}.`);
  const now = shareState(g.top, g.rel);
  if (now !== mode) console.log(`  • Another ignore rule (a nested .gitignore or your global git excludes) still makes it "${shareTitle[now].toLowerCase()}". Check: git check-ignore -v ${g.rel}/CONTEXT.md`);
}

// risk.md is regenerated on every run (it carries a date), so committing it means noisy diffs and merge
// conflicts between branches. Keep it out of git like a build output; anyone can recreate it in a second.
function ignoreGenerated(file) {
  const top = run("git", ["rev-parse", "--show-toplevel"], path.dirname(file));
  if (!top) return; // e.g. a multi-repo workspace folder that isn't a repo
  const rel = path.relative(path.resolve(top), real(file)).split(path.sep).join("/");
  if (rel.startsWith("..") || run("git", ["check-ignore", "--no-index", rel], top)) return;
  const gi = path.join(top, ".gitignore");
  const text = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
  fs.writeFileSync(gi, `${text}${text && !text.endsWith("\n") ? "\n" : ""}# GitRisk scores, regenerated by spec-driven-dev risk\n${rel}\n`);
  console.log(`  Added ${rel} to .gitignore (it's regenerated on every run, so it shouldn't be committed).`);
}

function loadConfig() {
  const file = findConfig(DIR);
  return { file, root: file ? path.dirname(file) : gitTop(DIR), c: file ? parseYaml(fs.readFileSync(file, "utf8")) : {} };
}

function risk() {
  const loaded = loadConfig();
  const { root } = loaded;
  // CI has no personal .spec-driven.yml: --repos and --specs-dir describe the checkout instead.
  const c = opt("repos") ? { ...loaded.c, layout: "multi-repo", repos: splitList(opt("repos")).map((p) => ({ path: p })), specs_dir: opt("specs-dir") || loaded.c.specs_dir } : loaded.c;
  const bad = weightProblems(c.risk?.weights);
  if (bad.length) throw new Error(bad.join("; "));
  const weights = normWeights(c.risk?.weights), since = opt("since") || c.risk?.since || "2 years ago";
  const repoDirs = c.layout === "multi-repo" ? (c.repos || []).map((r) => ({ dir: path.resolve(root, expandHome(r.path)), name: r.path })) : [{ dir: root, name: path.basename(root) }];
  const scored = repoDirs.filter((r) => isRepo(r.dir)).map((r) => ({ ...r, ...scoreRepo(r.dir, { since, weights, prefix: c.layout === "multi-repo" ? r.name : "" }) }));
  if (!scored.length) throw new Error(`No git repo found at ${root}`);
  const rows = scored.flatMap((s) => s.rows).sort((a, b) => b.score - a.score || b.commits - a.commits);
  const wanted = splitList(opt("files"));
  if (wanted.length) {
    const norm = (f) => f.replace(/\\/g, "/").replace(/^\.\//, "");
    const hits = wanted.map((f) => rows.find((r) => r.file === norm(f) || r.file.endsWith("/" + norm(f))) || { file: norm(f), score: null, tier: "no history" });
    if (flag("json")) console.log(JSON.stringify(hits, null, 2));
    else for (const h of hits) console.log(h.score === null ? `${h.file}: not scored (not a code file, or doesn't exist)`
      : h.tier === "new" ? `${h.file}: new${h.committed ? "" : ", not committed yet"} — too little history to score.${h.near ? ` Connects to ${h.near.file} (${h.near.score} ${h.near.tier})${["high", "critical"].includes(h.near.tier) ? ": treat it as " + h.near.tier : ""}.` : " Give it standard care."}`
      : `${h.file}: ${h.score} ${h.tier} (churn ${h.factors.churn}, bug density ${h.factors.bug_density}, fan-out ${h.factors.fan_out}, security ${h.factors.security})`);
    return;
  }
  if (flag("json")) { console.log(JSON.stringify({ weights, since, rows }, null, 2)); return; }
  const specs = path.join(root, c.specs_dir || "specs");
  fs.mkdirSync(path.join(specs, "context"), { recursive: true });
  const out = path.join(specs, "context", "risk.md");
  fs.writeFileSync(out, riskMarkdown({ rows, repos: scored, weights, since, top: Number(opt("top")) || 40 }));
  ignoreGenerated(out);
  const ctx = path.join(specs, "CONTEXT.md");
  if (fs.existsSync(ctx)) {
    fs.writeFileSync(ctx, withRiskSummary(fs.readFileSync(ctx, "utf8"), riskSummaryBlock(rows, new Date().toISOString().slice(0, 10))));
    console.log(`  Updated the "Risk hotspots" summary in ${path.relative(DIR, ctx) || ctx}, which is shared with the team.`);
  }
  const count = (t) => rows.filter((r) => r.tier === t).length;
  console.log(`✓ Scored ${rows.length} files from ${scored.reduce((t, s) => t + s.commits, 0)} commits → ${path.relative(DIR, out) || out}`);
  console.log(`  ${count("critical")} critical · ${count("high")} high · ${count("medium")} medium · ${count("new")} new. Top 5:`);
  for (const r of rows.filter((x) => x.tier !== "new").slice(0, 5)) console.log(`  ${String(r.score).padStart(5)}  ${r.tier.padEnd(8)} ${r.file}`);
  if (c.risk?.enabled === "off") console.log("  Note: risk.enabled is off in .spec-driven.yml, so the skills won't use this until you turn it on.");
}

async function riskEvalCmd() {
  const { file, root, c } = loadConfig();
  const repo = gitTop(DIR);
  if (c.layout === "multi-repo" && real(repo) === real(root)) throw new Error("risk-eval runs on one repo: run it inside one of the workspace's repos");
  const ticketsFile = opt("tickets");
  if (!ticketsFile) throw new Error("Pass --tickets=<file> with one ticket per line");
  const tickets = fs.readFileSync(path.resolve(DIR, ticketsFile), "utf8").split("\n").map((l) => l.replace(/^\s*[-*]\s+/, "").trim()).filter((l) => l && !l.startsWith("#"));
  const claude = opt("claude") || "claude";
  if (!opt("claude") && !onPath("claude")) throw new Error("risk-eval drives Claude Code headlessly; install it first (https://code.claude.com)");
  const { riskEval } = await import("./risk-eval.mjs");
  const runs = Number(opt("runs")) || 1, stages = splitList(opt("stages") || "investigate,create");
  console.log(`GitRisk U8 experiment: ${tickets.length} ticket(s) × ${runs} run(s) × 2 arms (risk on / off) on ${root}`);
  // A workspace config's repo paths don't resolve inside a lone clone, so a multi-repo member gets a single-repo config.
  const configText = c.layout === "multi-repo" ? "version: 1\nlayout: single\n" : file ? fs.readFileSync(file, "utf8") : "";
  const arms = splitList(opt("arms") || "on,off");
  if (!arms.length || arms.some((a) => !["on", "off"].includes(a))) throw new Error("--arms must be on, off, or on,off");
  const { dir } = await riskEval({ repo, tickets, arms, timeoutMin: Number(opt("timeout")) || 20, runs, model: opt("model") || "sonnet", stages, claude, out: path.resolve(DIR, opt("out") || "experiments"),
    pluginDir: path.join(ROOT, "plugin"), since: c.risk?.since || "2 years ago", weights: c.risk?.weights, configText });
  console.log(`✓ Report: ${path.join(dir, "report.md")}`);
}

// Plain-language switches, so anyone can change them without editing YAML.
const SETTINGS = [
  { block: "risk", key: "enabled", flag: "risk", name: "GitRisk", about: "extra care on files with a history of bugs",
    get: (c) => c.risk?.enabled || "on", options: [
      { value: "on", title: "On", description: "investigations, plans and reviews look harder at historically risky files" },
      { value: "off", title: "Off", description: "the skills ignore risk completely" }] },
  { block: "pipeline", key: "after_approval", flag: "after-approval", name: "After you approve a spec", about: "how far it goes on its own",
    get: (c) => c.pipeline?.after_approval || "stop", options: [
      { value: "stop", title: "Stop after each stage", description: "you start implement, verify, review and commit yourself" },
      { value: "run-through", title: "Run straight through", description: "implement → verify → review → commit; stops at any failure, never pushes" }] },
  { block: "context", key: "share", flag: "share", name: "Share specs with the team", about: "what's committed from the specs folder",
    get: (c) => c.context?.share || "all", after: (file, c, v) => applyShare(path.dirname(file), c.specs_dir || "specs", v), options: [
      { value: "all", title: "Share everything", description: "commit plans, investigations, reviews and project memory" },
      { value: "memory", title: "Share project memory only", description: "commit CONTEXT.md and context/; keep feature files local" },
      { value: "none", title: "Keep everything local", description: "ignore the specs folder" }] },
];

async function settings() {
  const file = findConfig(DIR);
  if (!file) throw new Error(`No .spec-driven.yml in ${DIR} or above. In your AI tool, say "run spec-setup" first.`);
  let text = fs.readFileSync(file, "utf8");
  const label = (s, v) => s.options.find((o) => o.value === v)?.title || v;
  const save = async (s, v) => {
    if (!s.options.some((o) => o.value === v)) throw new Error(`--${s.flag} must be ${s.options.map((o) => o.value).join(" or ")}`);
    text = setConfigValue(text, s.block, s.key, v);
    fs.writeFileSync(file, text);
    console.log(`✓ ${s.name}: ${label(s, v)}  (saved in ${file})`);
    if (s.after) await s.after(file, parseYaml(text), v);
  };
  const given = SETTINGS.filter((s) => opt(s.flag));
  if (given.length) for (const s of given) await save(s, opt(s.flag));
  else for (;;) {
    const c = parseYaml(text);
    const pick = await askSelect("Settings: pick one to change", [
      ...SETTINGS.map((s) => ({ title: `${s.name}: ${label(s, s.get(c))}`, description: s.about, value: s })),
      { title: "Done", value: null }], null);
    if (!pick) break;
    const v = await askSelect(`${pick.name}`, pick.options, pick.get(c));
    if (v !== pick.get(c)) await save(pick, v);
  }
  const c = parseYaml(text);
  if (c.risk?.enabled !== "off" && !fs.existsSync(path.join(path.dirname(file), c.specs_dir || "specs", "context", "risk.md"))) {
    if (given.length || !(await askConfirm("GitRisk is on but files haven't been scored yet. Score them now? (uses git only, takes seconds)", true)))
      console.log("  GitRisk is on, but nothing is scored yet. Run: spec-driven-dev risk");
    else risk();
  }
}

// Finds everything an install put on this machine and removes it after one confirmation.
// Specs, CONTEXT.md and code are never touched: they're the team's work, not part of the install.
async function uninstall() {
  const found = [];
  const ours = (d) => ALL_SKILLS.map((s) => path.join(d, s)).filter((f) => fs.existsSync(path.join(f, "SKILL.md")));
  const dirs = [...new Set(Object.values(TOOLS).flatMap((t) => [path.join(HOME, t.global), path.join(DIR, t.project)]))];
  for (const d of dirs) { const f = ours(d); if (f.length) found.push({ what: `${f.length} skills in ${d}`, paths: f }); }
  const plugins = readJson(path.join(HOME, ".claude/plugins/installed_plugins.json"));
  const pluginIds = Object.keys(plugins?.plugins || plugins || {}).filter((k) => /^(ticket-to-pr|spec-driven-dev)@/.test(k));
  for (const id of pluginIds) found.push({ what: `Claude Code plugin ${id}`, plugin: id });
  const npx = path.join(HOME, ".npm", "_npx");
  for (const c of subdirs(npx)) if (fs.existsSync(path.join(npx, c, "node_modules", "@benjaminthomas", "spec-driven-dev")) && process.platform !== "win32")
    found.push({ what: `npx download cache ${path.join(npx, c)}`, paths: [path.join(npx, c)] });
  const config = findConfig(DIR);
  const reg = readRegistry();
  if (flag("all")) {
    if (config) found.push({ what: `settings file ${config}`, paths: [config], config });
    if (fs.existsSync(path.join(HOME, ".spec-driven"))) found.push({ what: `workspace registry ${path.join(HOME, ".spec-driven")}`, paths: [path.join(HOME, ".spec-driven")] });
  }
  step(1, "Uninstall spec-driven-dev", ink.red);
  if (!found.length) { console.log("✓ Nothing to remove: no skills, plugin or cache from spec-driven-dev were found."); return; }
  console.log("Found:\n" + found.map((f) => `  • ${f.what}`).join("\n"));
  if (!flag("all") && (config || Object.keys(reg).length)) console.log(`  Kept: your settings file${config ? ` (${config})` : ""}. Add --all to remove it too.`);
  console.log("  Never touched: specs, CONTEXT.md and your code.");
  if (!process.stdin.isTTY && !flag("yes")) { console.log("Nothing removed. To remove the above, run: spec-driven-dev uninstall --yes"); return; }
  if (!flag("yes") && !(await askConfirm("Remove everything listed above?", false))) { console.log("Nothing removed."); return; }
  for (const f of found) {
    if (f.plugin) {
      let ok = false;
      if (onPath("claude")) try { execFileSync("claude", ["plugin", "uninstall", f.plugin], { stdio: "ignore" }); ok = true; } catch {}
      console.log(ok ? `✓ Removed ${f.what}` : `• Remove the plugin in Claude Code: /plugin uninstall ${f.plugin}`);
      continue;
    }
    for (const p of f.paths) fs.rmSync(p, { recursive: true, force: true });
    console.log(`✓ Removed ${f.what}`);
  }
  console.log("Done. Reinstall any time with: npx @benjaminthomas/spec-driven-dev@latest");
}

// ---------- CI: refresh GitRisk hotspots on merge ----------
function ghSlug(url) { return (String(url || "").match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/) || [])[1] || ""; }

function ciFiles({ specsSlug, repos, version }) {
  const checkouts = repos.map((r) => `      - uses: actions/checkout@v4
        with:
          repository: ${r.slug}
          path: ${r.name}
          fetch-depth: 0          # full history: GitRisk reads git log
          token: \${{ secrets.GITRISK_TOKEN }}`).join("\n");
  const specs = `# Refreshes the "Risk hotspots" block in CONTEXT.md from every team repo's git history.
# Written by \`spec-driven-dev ci\`. Re-run that command after adding a repo to team-repos.yml.
# Needs a repository secret GITRISK_TOKEN: a token that can read the code repos and write to this repo.
name: GitRisk
on:
  repository_dispatch:
    types: [code-merged]      # sent by each code repo's gitrisk-notify workflow
  schedule:
    - cron: "0 3 * * *"       # nightly safety net
  workflow_dispatch:
permissions:
  contents: write
concurrency:
  group: gitrisk
  cancel-in-progress: true
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          path: specs
          token: \${{ secrets.GITRISK_TOKEN }}
${checkouts}
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Score files from git history
        run: npx -y @benjaminthomas/spec-driven-dev@${version} risk --dir=. --repos=${repos.map((r) => r.name).join(",")} --specs-dir=specs
      - name: Commit when the hotspots changed (not for a date-only change)
        working-directory: specs
        run: |
          git add CONTEXT.md .gitignore
          if git diff --cached --quiet -I '^Updated [0-9-]+$'; then echo "Hotspots unchanged"; exit 0; fi
          git -c user.name="gitrisk[bot]" -c user.email="gitrisk@users.noreply.github.com" commit -m "chore: refresh GitRisk hotspots"
          git push
`;
  const notify = (branch) => `# Tells the specs repo to refresh GitRisk hotspots when work lands here.
# Written by \`spec-driven-dev ci --notify\`. Needs the same GITRISK_TOKEN secret in this repo.
name: GitRisk notify
on:
  push:
    branches: [${branch}]
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - run: gh api repos/${specsSlug}/dispatches -f event_type=code-merged
        env:
          GH_TOKEN: \${{ secrets.GITRISK_TOKEN }}
`;
  return { specs, notify };
}

function ci() {
  const { root, c } = loadConfig();
  if (!c.layout) throw new Error('No .spec-driven.yml found. Say "run spec-setup" in your AI tool first.');
  const specs = path.resolve(root, c.specs_dir || "specs");
  const g = specsInGit(root, c.specs_dir || "specs");
  if (!g) throw new Error(`${specs} isn't inside a git repo, so there's nowhere to run CI. Keep specs in a repo (a dedicated specs repo is best).`);
  const specsSlug = ghSlug(run("git", ["remote", "get-url", "origin"], g.top));
  if (!specsSlug) throw new Error(`The specs repo at ${g.top} has no GitHub remote yet. Push it first, e.g.: gh repo create <org>/<name> --private --source ${g.top} --push`);
  const team = parseYaml(fs.existsSync(path.join(specs, "team-repos.yml")) ? fs.readFileSync(path.join(specs, "team-repos.yml"), "utf8") : "").repos;
  const list = (Array.isArray(team) && team.length ? team : (c.repos || []).map((r) => ({ name: path.basename(String(r.path)), url: run("git", ["remote", "get-url", "origin"], path.resolve(root, expandHome(String(r.path)))) })))
    .map((r) => ({ name: r.name, slug: ghSlug(r.url) })).filter((r) => r.name && r.name !== path.basename(g.top));
  const missing = list.filter((r) => !r.slug);
  if (missing.length) throw new Error(`No GitHub URL for ${missing.map((r) => r.name).join(", ")}. Add a "url:" for each in team-repos.yml.`);
  if (!list.length) throw new Error("No code repos to score. List them in team-repos.yml or your workspace.");
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  const { specs: specsYml, notify } = ciFiles({ specsSlug, repos: list, version });
  if (g.rel) throw new Error(`Specs live inside ${g.top}, a code repo. The CI step needs a dedicated specs repo, so its commits don't land in a code repo. Move specs with spec-setup, or use: spec-driven-dev risk after merges.`);
  const wf = path.join(g.top, ".github", "workflows", "gitrisk.yml");
  fs.mkdirSync(path.dirname(wf), { recursive: true });
  fs.writeFileSync(wf, specsYml);
  step(1, "GitRisk on every merge", ink.cyan);
  console.log(`✓ Wrote ${wf}\n  Scores ${list.map((r) => r.name).join(", ")} nightly, on demand, and whenever a code repo pings it.`);
  const wrote = [];
  for (const r of (c.repos || [])) {
    const dir = path.resolve(root, expandHome(String(r.path)));
    if (!flag("notify") || !isRepo(dir) || real(dir) === real(g.top)) continue;
    const branch = r.git?.base_branch && r.git.base_branch !== "default" ? r.git.base_branch : c.git?.base_branch && c.git.base_branch !== "default" ? c.git.base_branch : run("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], dir).replace(/^origin\//, "") || "main";
    const f = path.join(dir, ".github", "workflows", "gitrisk-notify.yml");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, notify(branch));
    wrote.push(`${path.basename(dir)} (on ${branch})`);
  }
  if (wrote.length) console.log(`✓ Wrote .github/workflows/gitrisk-notify.yml in: ${wrote.join(", ")}`);
  else console.log("• Add --notify to also write the small trigger workflow into each code repo on this machine, so a merge refreshes the hotspots straight away.");
  console.log(`
Next:
  1. Create a GitHub token (fine-grained): read access to ${list.map((r) => r.name).join(", ")}; contents: read & write on ${specsSlug}.
  2. Add it as a secret named GITRISK_TOKEN in ${specsSlug}${wrote.length ? " and in each code repo" : ""}:  gh secret set GITRISK_TOKEN -R ${specsSlug}
  3. Commit and push the workflow file(s). Nothing was committed for you.
  4. Try it: gh workflow run GitRisk -R ${specsSlug}`);
}

// Silent unless something is unfinished, so it's cheap to run at the start of a session.
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
    const next = t.match(/^## Resume here[\s\S]*?^- \*\*Next:\*\*\s*(.+)$/m)?.[1]?.trim();
    const done = (t.match(/^\s*- \[x\]/gim) || []).length, todo = (t.match(/^\s*- \[ \]/gm) || []).length;
    if (todo) lines.push(`- ${specsName}/${name}: ${done}/${done + todo} tasks done → next: ${next || "spec-implement"}`);
    else if (done && !fs.existsSync(path.join(specs, name, "verification-report.md"))) lines.push(`- ${specsName}/${name}: all tasks done, not verified → next: spec-verify`);
    else if (done && !fs.existsSync(path.join(specs, name, "review.md"))) lines.push(`- ${specsName}/${name}: verified, not reviewed → next: spec-review`);
    else if (done && /\[blocker\][^\n]*\n(?:(?!###)[^\n]*\n)*?- \*\*Status:\*\* open/.test(fs.readFileSync(path.join(specs, name, "review.md"), "utf8"))) lines.push(`- ${specsName}/${name}: review has open blockers → next: fix them (spec-review)`);
  }
  if (lines.length) console.log(`spec-driven-dev: unfinished work in ${root}\n${lines.join("\n")}`);
}

try {
  if (command === "doctor") doctor();
  else if (command === "status") status();
  else if (command === "context") context();
  else if (command === "risk") risk();
  else if (command === "settings") await settings();
  else if (command === "uninstall") await uninstall();
  else if (command === "ci") ci();
  else if (command === "risk-eval") await riskEvalCmd();
  else if (command === "install") {
    if (HANDOFF) console.log("No interactive terminal (for example a \"!\" command in Claude Code), so the skills go to the AI tools it finds, for this project.\n");
    const tools = await install();
    if (tools.length && !flag("no-setup")) await handOver(tools);
  } else if (SETUP_IN_AGENT) handOver([], true);
  else if (command === "setup") await setup();
  else throw new Error(`Unknown command "${command}" — use install (default), setup, settings, ci, uninstall, doctor, status, context, risk, or risk-eval`);
  if (command === "setup" && !SETUP_IN_AGENT) console.log('\nNext: in your AI tool, say "investigate <ticket>" or "create a spec".');
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
} finally {
}
