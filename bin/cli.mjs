#!/usr/bin/env node
// spec-driven-dev installer: detects your AI coding tools, copies the skills into each one, and
// runs project discovery (layout, tracker, branches, commands) to write .spec-driven.yml.
//
//   npx spec-driven-dev                 install + project setup (interactive)
//   npx spec-driven-dev setup           project setup only
//   npx spec-driven-dev doctor          check .spec-driven.yml against the real repos (exit 1 on problems)
//   npx spec-driven-dev status          list specs with unfinished tasks (used by the session-start hook)
//   flags: --yes  --global  --tools=claude,cursor  --skills=spec-create,...  --no-setup  --dir=<path>
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKILLS_DIR = path.join(ROOT, "skills");
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

if (flag("help") || flag("h")) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 9).join("\n").replace(/^\/\/ ?/gm, ""));
  process.exit(0);
}

const rl = YES ? null : createInterface({ input: process.stdin, output: process.stdout });
async function ask(q, def = "") {
  if (YES) return def;
  const a = (await rl.question(`${q}${def ? ` [${def}]` : ""}: `)).trim();
  return a || def;
}
async function pick(q, items, defaults) {
  items.forEach((it, i) => console.log(`  ${i + 1}. ${it.label}`));
  const defIdx = items.map((it, i) => (defaults.includes(it.value) ? i + 1 : null)).filter(Boolean).join(",");
  const a = await ask(`${q} (comma-separated numbers, "all", or "none")`, defIdx || "none");
  if (a === "all") return items.map((it) => it.value);
  if (a === "none") return [];
  return a.split(",").map((n) => items[Number(n.trim()) - 1]?.value).filter(Boolean);
}

const run = (cmd, argv, cwd) => {
  try { return execFileSync(cmd, argv, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; }
};
const onPath = (bin) => !!run(process.platform === "win32" ? "where" : "which", [bin]);

// ---------- install ----------
async function install() {
  const detected = Object.keys(TOOLS).filter((t) => fs.existsSync(path.join(HOME, TOOLS[t].home)) || onPath(TOOLS[t].bin));
  let tools = opt("tools")?.split(",");
  if (!tools) {
    console.log("\nWhich AI coding tools should get the skills? (detected ones are pre-selected)");
    tools = await pick("Tools", Object.entries(TOOLS).map(([value, t]) => ({ value, label: t.label + (detected.includes(value) ? "  ✓ detected" : "") })), detected);
  }
  const bad = tools.filter((t) => !TOOLS[t]);
  if (bad.length) throw new Error(`Unknown tool(s): ${bad.join(", ")} — expected ${Object.keys(TOOLS).join(", ")}`);

  // Claude Code users who already have the plugin would get every skill twice.
  const plugins = path.join(HOME, ".claude/plugins/installed_plugins.json");
  if (tools.includes("claude") && !opt("tools") && fs.existsSync(plugins) && fs.readFileSync(plugins, "utf8").includes('"spec-driven-dev@')) {
    console.log("• Claude Code already has the spec-driven-dev plugin, so it's skipped here (update it with /plugin).");
    tools = tools.filter((t) => t !== "claude");
  }

  const global = flag("global") || (!YES && (await ask("Install for this project only, or globally for all projects? (project/global)", "project")) === "global");
  const skills = opt("skills")?.split(",") || ALL_SKILLS;
  const unknown = skills.filter((s) => !ALL_SKILLS.includes(s));
  if (unknown.length) throw new Error(`Unknown skill(s): ${unknown.join(", ")} — expected ${ALL_SKILLS.join(", ")}`);

  const dests = [...new Set(tools.map((t) => (global ? path.join(HOME, TOOLS[t].global) : path.join(DIR, TOOLS[t].project))))];
  for (const dest of dests) {
    for (const s of skills) {
      const to = path.join(dest, s);
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(path.join(SKILLS_DIR, s), to, { recursive: true, dereference: true, filter: (f) => !f.endsWith(".DS_Store") });
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

function detectLayout(dir) {
  if (isRepo(dir)) {
    const top = run("git", ["rev-parse", "--show-toplevel"], dir);
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
  // a git worktree has a .git *file*; it belongs to its main repo, so skip it
  const repos = subdirs(dir).filter((n) => { try { return fs.statSync(path.join(dir, n, ".git")).isDirectory(); } catch { return false; } });
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
  return out + `specs_dir: ${y(c.specsDir)}\n`;
}

async function setup() {
  console.log("\nProject setup — detecting how this project works…");
  const d = detectLayout(DIR);
  let repos = d.repos;
  if (d.layout === "multi-repo") {
    const owners = {};
    for (const r of repos) (owners[gitFacts(path.join(d.root, r))?.owner || "?"] ||= []).push(r);
    const biggest = Object.values(owners).sort((a, b) => b.length - a.length)[0] || [];
    console.log(`Found ${repos.length} git repos in ${d.root}. Which ones change together as one workspace?`);
    repos = await pick("Repos", repos.map((r) => ({ value: r, label: `${r}  (${Object.keys(owners).find((o) => owners[o].includes(r))})` })), biggest);
  }
  const layout = await ask(`Layout — single, monorepo, or multi-repo (detected: ${d.layout})`, d.layout);
  const root = d.root;
  const file = path.join(root, ".spec-driven.yml");
  if (fs.existsSync(file) && (await ask(`${file} exists — overwrite? (y/n)`, "n")) !== "y") {
    console.log("• Kept the existing config. Run the spec-setup skill in your AI tool to review it.");
    return;
  }

  const repoDirs = layout === "multi-repo" ? repos.map((r) => path.join(root, r)) : [isRepo(root) ? root : DIR];
  const facts = repoDirs.map(gitFacts).filter(Boolean);
  const g = infer(facts);
  if (facts.length) console.log(`Detected: tracker ${g.trackerType}${g.key ? ` (${g.key}-…)` : ""}, base ${g.base}, branches "${g.branchName}", commits ${g.commitStyle}`);

  const trackerType = await ask("Issue tracker (jira/github/linear/none)", g.trackerType);
  const key = trackerType === "jira" || trackerType === "linear" ? await ask("Ticket key prefix (e.g. STP)", g.key) : "";
  const url = trackerType === "none" ? "" : await ask("Tracker URL (optional)", "");
  const base = await ask('Base branch work is cut from ("default" = repo default branch)', g.base);
  const pr = await ask("Branch PRs target", base);
  const branchName = await ask("Branch name pattern ({ticket} {slug} {type})", g.branchName);
  const commitStyle = await ask("Commit style (conventional/ticket/freeform)", g.commitStyle);
  const specsDir = await ask("Where specs/<feature>/ folders go", "specs");

  const config = {
    layout, tracker: { type: trackerType, key, url }, specsDir, devUrl: "",
    git: { remote: "origin", base_branch: base, pr_target: pr, branch_name: branchName, commit_style: commitStyle },
    commands: layout === "single" ? commandsFor(repoDirs[0]) : commandsFor(root),
    repos: layout === "single" ? [] : (layout === "multi-repo" ? repos : d.repos).map((r) => {
      const f = layout === "multi-repo" ? gitFacts(path.join(root, r)) : null;
      // a repo without an integration branch must say so, or it inherits the top-level base (e.g. staging) it doesn't have
      return { path: r, role: "", base: f ? f.integration || "default" : "", commands: commandsFor(path.join(root, r)) };
    }),
  };
  fs.writeFileSync(file, toYaml(config));
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
    const [, key, val] = m;
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
    if (d === path.dirname(d) || d === HOME) return null;
  }
}

function doctor() {
  const file = findConfig(DIR);
  if (!file) throw new Error(`No .spec-driven.yml in ${DIR} or above. Run: npx spec-driven-dev setup`);
  const root = path.dirname(file);
  let c;
  try { c = parseYaml(fs.readFileSync(file, "utf8")); } catch (e) { throw new Error(`${file} could not be read: ${e.message}`); }
  const problems = [], notes = [];
  if (!["single", "monorepo", "multi-repo"].includes(c.layout)) problems.push(`layout "${c.layout}" must be single, monorepo, or multi-repo`);
  if (c.tracker && !["jira", "github", "linear", "none"].includes(c.tracker.type)) problems.push(`tracker.type "${c.tracker.type}" must be jira, github, linear, or none`);
  if (c.git?.commit_style && !["conventional", "ticket", "freeform"].includes(c.git.commit_style)) problems.push(`git.commit_style "${c.git.commit_style}" must be conventional, ticket, or freeform`);
  if (c.git?.branch_name && !/\{(ticket|slug)\}/.test(c.git.branch_name)) problems.push(`git.branch_name "${c.git.branch_name}" needs {ticket} or {slug}`);
  const repos = c.layout === "single" ? [{ path: "." }] : Array.isArray(c.repos) ? c.repos : [];
  if (c.layout !== "single" && !repos.length) problems.push(`layout is ${c.layout} but repos: is empty`);
  for (const r of repos) {
    const dir = path.join(root, r.path || "");
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
    if (!flag("no-setup") && (YES || (await ask("\nSet up this project now? (y/n)", "y")) === "y")) await setup();
  } else if (command === "setup") await setup();
  else throw new Error(`Unknown command "${command}" — use install (default), setup, doctor, or status`);
  if (["install", "setup"].includes(command)) console.log('\nNext: in your AI tool, say "investigate <ticket>" or "create a spec".');
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
} finally {
  rl?.close();
}
