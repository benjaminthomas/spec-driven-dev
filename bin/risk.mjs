// GitRisk: per-file historical risk from git alone (no model, no tokens).
//   Risk = 0.30·Churn + 0.35·BugDensity + 0.20·FanOut + 0.15·Security   (each factor 0–100)
// The weights are a hypothesis to calibrate by backtest, so .spec-driven.yml `risk.weights` overrides them.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const DEFAULT_WEIGHTS = { churn: 0.3, bug_density: 0.35, fan_out: 0.2, security: 0.15 };
export const TIERS = [[75, "critical"], [50, "high"], [25, "medium"], [0, "low"]];
const NEW_DAYS = 90; // a file added within this many days with fewer than MIN_COMMITS commits (or not committed yet) has too little history to score fairly
const MIN_COMMITS = 3; // shortcut: a file with 1 commit that was a fix would score 100% bug density; divide by at least 3. Replace with Bayesian smoothing if calibration shows it matters.

// Classification uses the conventional-commit type when the repo uses one, and message keywords otherwise.
const BUG = /^(fix|hotfix|bugfix|revert)(\(.+\))?!?:|\b(fix(e[sd]|ing)?|bug|hotfix|regression|broken|crash(es|ed)?|patch(ed)?|defect)\b/i;
const SECURITY = /\b(security|cve-\d+|xss|csrf|ssrf|sqli|injection|vuln(erability)?|exploit|sanitiz(e|ation)|escap(e|ing) (html|input|output)|auth(entication|orization)? (bypass|fix)|privilege|secret(s)? (leak|exposed)|leak(ed|s)? (token|key|secret|credential)|rate.?limit|helmet|csp)\b/i;
const SKIP = /(^|\/)(node_modules|dist|build|out|vendor|coverage|\.next|graphify-out|specs|experiments)\/|(^|\/)(\.spec-driven\.yml|\.gitignore|\.gitattributes|\.gitmodules)$|\.(md|mdx|txt|lock|log|png|jpe?g|gif|svg|ico|webp|pdf|zip|map|snap|csv)$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum|poetry\.lock|composer\.lock)$/i;
const CODE = /\.(m?[jt]sx?|cjs|py|rb|go|rs|java|kt|php|cs|swift|scala|vue|svelte)$/i;

const git = (cwd, args) => {
  try { return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 512 * 1024 * 1024 }).toString(); } catch { return ""; }
};
export const classify = (subject) => ({ bug: BUG.test(subject), security: SECURITY.test(subject) });
export const tierOf = (score) => TIERS.find(([min]) => score >= min)[1];

// Value at the 90th percentile; "expected" in min(100, actual / expected × 100), so one outlier can't flatten everyone else.
function p90(values) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.9))] : 1;
}

// Within-repo dependents: how many other files import this one. Relative JS/TS imports and Python module paths.
// shortcut: no tsconfig path aliases or cross-repo consumers (GitRisk open question U7); add when a repo needs them.
function fanOut(repo, files) {
  const set = new Set(files), dependents = new Map(files.map((f) => [f, new Set()]));
  const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx", ".py", "/__init__.py"];
  const pyIndex = new Map(files.filter((f) => f.endsWith(".py")).map((f) => [f.replace(/\/__init__\.py$|\.py$/, "").split("/").join("."), f]));
  for (const f of files) {
    if (!CODE.test(f)) continue;
    let text = "";
    try { text = fs.readFileSync(path.join(repo, f), "utf8"); } catch { continue; }
    if (text.length > 2e6) continue;
    const targets = new Set();
    for (const m of text.matchAll(/(?:from\s+|require\(\s*|import\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
      const hit = exts.map((e) => base + e).find((c) => set.has(c));
      if (hit) targets.add(hit);
    }
    if (f.endsWith(".py")) for (const m of text.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) {
      const hit = pyIndex.get(m[1] || m[2]);
      if (hit) targets.add(hit);
    }
    for (const t of targets) if (t !== f) dependents.get(t).add(f);
  }
  const imports = new Map(files.map((f) => [f, new Set()]));
  for (const [t, srcs] of dependents) for (const f of srcs) imports.get(f).add(t);
  return { counts: new Map([...dependents].map(([f, s]) => [f, s.size])), dependents, imports };
}

// Score every code file in one repo, including new files not committed yet. `prefix` labels files in multi-repo workspaces.
export function scoreRepo(repo, { since = "2 years ago", weights = DEFAULT_WEIGHTS, prefix = "" } = {}) {
  const committed = git(repo, ["ls-files"]).split("\n").filter((f) => f && !SKIP.test(f));
  const untracked = git(repo, ["ls-files", "--others", "--exclude-standard"]).split("\n").filter((f) => f && !SKIP.test(f));
  const files = [...committed, ...untracked];
  const tracked = new Set(files);
  // When each file was first added (all history, not just `since`), to tell new files from quiet old ones.
  const added = new Map();
  for (const block of git(repo, ["log", "--diff-filter=A", "--format=%x1e%ct", "--name-only"]).split("\x1e").slice(1)) {
    const [ts, ...names] = block.split("\n");
    for (const f of names) if (f) added.set(f, Number(ts)); // log is newest first, so the last write is the first add
  }
  const cutoff = Date.now() / 1000 - NEW_DAYS * 86400;
  const recent = (f) => !added.has(f) || added.get(f) >= cutoff;
  const stats = new Map(files.map((f) => [f, { commits: 0, bug: 0, security: 0 }]));
  let commits = 0;
  // \x1e starts each commit; the subject follows, then the changed file names.
  for (const block of git(repo, ["log", "--no-merges", `--since=${since}`, "--name-only", "--format=%x1e%s"]).split("\x1e").slice(1)) {
    const [subject, ...changed] = block.split("\n");
    const c = classify(subject);
    commits++;
    for (const f of changed) {
      const s = tracked.has(f) && stats.get(f);
      if (!s) continue;
      s.commits++;
      if (c.bug) s.bug++;
      if (c.security) s.security++;
    }
  }
  // "New" = recent AND too few commits to judge. A young file that's already been fixed a lot has real history.
  const isNew = new Set(files.filter((f) => untracked.includes(f) || (recent(f) && stats.get(f).commits < MIN_COMMITS)));
  const graph = fanOut(repo, files), fan = graph.counts;
  const expChurn = p90([...stats.values()].map((s) => s.commits)), expFan = p90([...fan.values()]);
  const rows = files.map((f) => {
    const s = stats.get(f), denom = Math.max(s.commits, MIN_COMMITS);
    const factors = {
      churn: Math.min(100, (s.commits / expChurn) * 100),
      bug_density: s.commits ? (s.bug / denom) * 100 : 0,
      fan_out: Math.min(100, ((fan.get(f) || 0) / expFan) * 100),
      security: s.commits ? (s.security / denom) * 100 : 0,
    };
    const score = Object.keys(DEFAULT_WEIGHTS).reduce((t, k) => t + (Number(weights[k]) || 0) * factors[k], 0);
    const r = (x) => Math.round(x * 10) / 10;
    return { file: prefix ? `${prefix}/${f}` : f, path: f, score: r(score), tier: tierOf(score), commits: s.commits, bug_fixes: s.bug, security_fixes: s.security, dependents: fan.get(f) || 0,
      factors: { churn: r(factors.churn), bug_density: r(factors.bug_density), fan_out: r(factors.fan_out), security: r(factors.security) } };
  });
  // New files: too little history for a fair score, so label them "new" and show the riskiest established
  // file they import or are imported by. New code next to a hotspot deserves the hotspot's care.
  const byPath = new Map(rows.map((x) => [x.path, x]));
  for (const x of rows) {
    if (!isNew.has(x.path)) continue;
    x.tier = "new";
    x.committed = !untracked.includes(x.path);
    const near = [...graph.imports.get(x.path), ...graph.dependents.get(x.path)].map((n) => byPath.get(n)).filter((n) => n && !isNew.has(n.path)).sort((a, b) => b.score - a.score)[0];
    if (near) x.near = { file: near.file, score: near.score, tier: near.tier };
  }
  for (const x of rows) delete x.path;
  return { commits, head: git(repo, ["rev-parse", "--short", "HEAD"]).trim(), rows };
}

export function normWeights(w) {
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(DEFAULT_WEIGHTS)) if (w && w[k] !== undefined && w[k] !== "") out[k] = Number(w[k]);
  return out;
}
export function weightProblems(w) {
  const p = [];
  for (const [k, v] of Object.entries(w || {})) {
    if (!(k in DEFAULT_WEIGHTS)) p.push(`risk.weights.${k}: unknown factor (use ${Object.keys(DEFAULT_WEIGHTS).join(", ")})`);
    else if (!(Number(v) >= 0)) p.push(`risk.weights.${k} "${v}" must be a number ≥ 0`);
  }
  const sum = Object.values(normWeights(w)).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.001) p.push(`risk.weights add up to ${Math.round(sum * 1000) / 1000}, not 1`);
  return p;
}

// The area file skills read: top N files, within the 150-line area-file limit.
export function riskMarkdown({ rows, repos, weights, since, top }) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const w = weights;
  const fresh = rows.filter((r) => r.tier === "new");
  const freshShown = fresh.filter((r) => r.near).sort((a, b) => b.near.score - a.near.score).slice(0, 15);
  const shown = rows.filter((r) => r.score > 0 && r.tier !== "new").slice(0, Math.min(top, 120 - freshShown.length));
  const lines = [
    "# Risk",
    "<!-- Generated by `spec-driven-dev risk`. Don't edit by hand: re-run it. Skills read this only when risk.enabled is on. -->",
    `Scored ${repos.map((r) => `${r.name} at ${r.head} (${r.commits} commits)`).join(", ")} · since ${since} · ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Risk = ${w.churn} × Churn + ${w.bug_density} × Bug Density + ${w.fan_out} × Fan-out + ${w.security} × Security (each 0–100; weights ${pct(w.churn)} / ${pct(w.bug_density)} / ${pct(w.fan_out)} / ${pct(w.security)}).`,
    "Tiers: critical ≥ 75 · high ≥ 50 · medium ≥ 25. A historical signal, not proof of a bug.",
    "",
    "| File | Score | Tier | Churn | Bug density | Fan-out | Security | Commits (fixes / security) |",
    "|---|---|---|---|---|---|---|---|",
    ...shown.map((r) => `| \`${r.file}\` | ${r.score} | ${r.tier} | ${r.factors.churn} | ${r.factors.bug_density} | ${r.factors.fan_out} | ${r.factors.security} | ${r.commits} (${r.bug_fixes} / ${r.security_fixes}) |`),
  ];
  if (fresh.length) {
    lines.push("", `## New files (${fresh.length})`, "", `Added in the last ${NEW_DAYS} days with fewer than ${MIN_COMMITS} commits, or not committed yet, so there's too little history to score. Give them standard care, and the care of the riskiest file they connect to when that file is high or critical.`);
    if (freshShown.length) lines.push("", "| New file | Connects to | Its score / tier |", "|---|---|---|", ...freshShown.map((r) => `| \`${r.file}\` | \`${r.near.file}\` | ${r.near.score} ${r.near.tier} |`));
  }
  if (rows.length > shown.length + freshShown.length) lines.push("", `${rows.length - shown.length - freshShown.length} more files not shown. \`spec-driven-dev risk --files=a,b\` prints any file's score.`);
  return lines.join("\n") + "\n";
}

// Change one `block: key: value` line in .spec-driven.yml text, keeping every comment and other line as is.
export function setConfigValue(text, blockName, key, value) {
  const block = text.match(new RegExp(`^${blockName}:.*\\n(?:(?:[ \\t]+.*|[ \\t]*)\\n)*`, "m"));
  const line = new RegExp(`^([ \\t]+${key}:[ \\t]*)[^\\s#]+`, "m");
  if (!block) return `${text.replace(/\n*$/, "\n")}${blockName}:\n  ${key}: ${value}\n`;
  const body = line.test(block[0]) ? block[0].replace(line, `$1${value}`) : block[0].replace(new RegExp(`^${blockName}:.*\\n`), `$&  ${key}: ${value}\n`);
  return text.replace(block[0], body);
}

// A short, committed summary inside CONTEXT.md, so the hotspots are part of the shared project memory
// (risk.md itself is gitignored: it's regenerated on every run). Replaced in place between markers.
const RB = "<!-- risk:start (written by spec-driven-dev risk; don't edit) -->", RE = "<!-- risk:end -->";
export function riskSummaryBlock(rows, date) {
  const top = rows.filter((r) => r.tier === "critical" || r.tier === "high").slice(0, 5);
  const counts = ["critical", "high", "medium"].map((t) => `${rows.filter((r) => r.tier === t).length} ${t}`).join(" · ");
  return [RB, "## Risk hotspots", `GitRisk on ${date}: ${counts}. Full table: context/risk.md (regenerate: spec-driven-dev risk).`,
    ...(top.length ? top.map((r) => `- \`${r.file}\` ${r.score} ${r.tier}`) : ["- No high or critical files."]), RE].join("\n");
}
export function withRiskSummary(text, block) {
  const i = text.indexOf(RB), j = text.indexOf(RE);
  if (i >= 0 && j > i) return text.slice(0, i) + block + text.slice(j + RE.length);
  return `${text.replace(/\n*$/, "")}\n\n${block}\n`;
}
