// GitRisk U8 experiment: does giving the agent the risk signal change what it does?
// Each ticket runs twice in fresh clones of the repo, risk ON and risk OFF, with the same model and
// prompt. We then measure behaviour from what the agent read and wrote, and keep a dated log.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { scoreRepo, riskMarkdown, normWeights, setConfigValue } from "./risk.mjs";

const TIER_RANK = { light: 1, standard: 2, deep: 3 };
const sh = (cwd, cmd, args) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 512 * 1024 * 1024 }).toString();

export const setRiskEnabled = (text, on) => setConfigValue(text, "risk", "enabled", on ? "on" : "off");

// An arm is "on" | "off" (risk only), or "name:on|off[:model]" where model pins every tier of models.claude to one
// model ("A:off:opus" = top model everywhere, no signal) and "tiered" (or nothing) leaves the config's tiers alone.
export function parseArm(spec) {
  const [a, b, c] = spec.split(":").map((x) => x.trim());
  if (b === undefined) { if (!["on", "off"].includes(a)) throw new Error(`Arm "${spec}": use on, off, or name:on|off[:model]`); return { name: a, risk: a === "on", model: null }; }
  if (!["on", "off"].includes(b)) throw new Error(`Arm "${spec}": second part must be on or off`);
  return { name: a, risk: b === "on", model: c && c !== "tiered" ? c : null };
}
export const pinModels = (text, model) => {
  const without = text.replace(/^models:.*\n(?:(?:[ \t]+.*|[ \t]*)\n)*/m, "");
  return `${without.replace(/\n*$/, "\n")}models:\n  claude:\n    light: ${model}\n    standard: ${model}\n    deep: ${model}\n    escalate: ${model}\n`;
};
const OUTCOME_KEYS = ["agent_test_files", "tests_pass_with_fix", "tests_fail_on_bug", "bug_caught"];
const isTestFile = (f) => /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(f);

// A ticket line may end with the files its real fix touched: "… [files: app/a.ts, app/b.ts]". Those are the
// culprits: whether each arm finds and plans them is measured directly, whatever GitRisk scores them.
export function parseTicket(line) {
  const m = /^(.*?)\s*\[files:\s*([^\]]+)\]\s*$/.exec(line);
  return m ? { text: m[1].trim(), culprits: m[2].split(",").map((f) => f.trim().replace(/^`|`$/g, "")).filter(Boolean) } : { text: line.trim(), culprits: [] };
}

// Behaviour metrics from the agent's transcript (stream-json) and the spec it wrote.
// featureDir: re-measure a saved run from its copied spec folder instead of a live clone.
export function measure({ transcript, clone, risky, tracked = [], culprits = [], featureDir = null, feature: featureName = null }) {
  const reads = new Set();
  let cost = 0, turns = 0, inTok = 0, outTok = 0, error = "";
  for (const line of transcript.split("\n")) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "assistant") for (const c of e.message?.content || []) {
      // A file counts as looked at when a Read, Grep or Bash call names it (agents often use grep/sed/cat, not Read).
      if (c.type !== "tool_use" || !["Read", "Grep", "Bash", "Glob"].includes(c.name)) continue;
      let text = JSON.stringify(c.input || {});
      if (clone) text = text.split(clone + "/").join("").split(clone.replace(/^\/private/, "") + "/").join(""); // no clone (re-measure): paths stay as they are
      for (const f of tracked) if (text.includes(f)) reads.add(f);
    }
    if (e.type === "result") {
      cost = e.total_cost_usd || 0; turns = e.num_turns || 0;
      inTok = (e.usage?.input_tokens || 0) + (e.usage?.cache_read_input_tokens || 0) + (e.usage?.cache_creation_input_tokens || 0);
      outTok = e.usage?.output_tokens || 0;
      if (e.is_error) error = String(e.result || "error").slice(0, 200);
    }
  }
  const specsDir = path.join(clone, "specs");
  const feature = featureDir ? featureName : (fs.existsSync(specsDir) ? fs.readdirSync(specsDir) : []).find((d) => fs.existsSync(path.join(specsDir, d, "investigation.md")) || fs.existsSync(path.join(specsDir, d, "tasks")));
  const fdir = featureDir || (feature && path.join(specsDir, feature));
  const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
  const inv = fdir ? read(path.join(fdir, "investigation.md")) : "";
  const tasks = [];
  const tdir = fdir && path.join(fdir, "tasks");
  if (tdir && fs.existsSync(tdir)) for (const t of fs.readdirSync(tdir).filter((f) => f.endsWith(".md"))) {
    const text = read(path.join(tdir, t));
    // Agents vary the headings ("## Files", "## Files to Modify", "## Tests (`npm test`)"), so match by prefix and join all of them.
    const sections = (prefix) => [...text.matchAll(new RegExp(`^##+ ${prefix}[^\\n]*\\n([\\s\\S]*?)(?=^##+ |$(?![\\s\\S]))`, "gm"))].map((m) => m[1]).join("\n");
    // Files: backticked paths, plus any tracked file named plainly (agents don't always use backticks).
    // No "## Files" heading at all ("## Changes", paths in prose): read the whole task, or the plan scores zero.
    const filesText = sections("Files") || text;
    const files = [...new Set([...[...filesText.matchAll(/`([^`\s]+\.[\w]+)`/g)].map((m) => m[1]), ...tracked.filter((f) => filesText.includes(f))])];
    const tests = sections("Tests").trim();
    tasks.push({ name: t, files, tier: (text.match(/\bTier:\**\s*(light|standard|deep)\b/i) || [])[1]?.toLowerCase(), hasTests: !!tests && !/^none\b/i.test(tests) });
  }
  const isRisky = (f) => risky.has(f);
  const planFiles = new Set(tasks.flatMap((t) => t.files));
  const riskyPlan = [...planFiles].filter(isRisky);
  const riskyTasks = tasks.filter((t) => t.files.some(isRisky));
  const withTests = (f) => tasks.some((t) => t.files.includes(f) && t.hasTests);
  const culpritPlan = culprits.filter((f) => planFiles.has(f));
  const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
  return {
    feature: feature || null,
    files_read: reads.size,
    risky_files_read: [...reads].filter(isRisky).length,
    investigation_risky_mentions: [...risky].filter((f) => inv.includes(f)).length,
    plan_files: planFiles.size,
    risky_plan_files: riskyPlan.length,
    risky_files_with_tests: riskyPlan.filter(withTests).length,
    culprit_files_read: culprits.length ? culprits.filter((f) => reads.has(f)).length : null,
    culprit_plan_files: culprits.length ? culpritPlan.length : null,
    culprit_files_with_tests: culprits.length ? culpritPlan.filter(withTests).length : null,
    risky_read_list: [...reads].filter(isRisky), plan_files_list: [...planFiles],
    tier_on_risky_tasks: avg(riskyTasks.map((t) => TIER_RANK[t.tier]).filter(Boolean)),
    tier_all_tasks: avg(tasks.map((t) => TIER_RANK[t.tier]).filter(Boolean)),
    tasks: tasks.length,
    cost_usd: Math.round(cost * 10000) / 10000, turns, input_tokens: inTok, output_tokens: outTok, error,
  };
}

// Recompute every run's metrics from what the run saved (transcript + spec folder), e.g. after a parser fix.
// The first report and results are kept as *-v1 files; the log records that it happened.
export function remeasure({ runDir, repo, since, weights }) {
  const { meta, results } = JSON.parse(fs.readFileSync(path.join(runDir, "results.json"), "utf8"));
  const head = sh(repo, "git", ["rev-parse", "--short", "HEAD"]).trim();
  if (head !== meta.head) throw new Error(`${repo} is at ${head}, but the run was measured at ${meta.head}. Check out that commit first.`);
  const scored = scoreRepo(repo, { since, weights: normWeights(weights || meta.weights) });
  const risky = new Set(scored.rows.filter((r) => ["medium", "high", "critical"].includes(r.tier)).map((r) => r.file));
  const tracked = sh(repo, "git", ["ls-files"]).split("\n").filter((f) => f.includes("/") || f.includes("."));
  for (const r of results) {
    const tag = `t${r.ticket + 1}-${r.arm}-r${r.run}`, featureDir = path.join(runDir, tag);
    if (!r.metrics?.feature || !fs.existsSync(featureDir)) continue;
    const transcript = fs.readFileSync(path.join(runDir, `${tag}.jsonl`), "utf8");
    const kept = Object.fromEntries(OUTCOME_KEYS.filter((k) => k in r.metrics).map((k) => [k, r.metrics[k]])); // outcome metrics come from running tests, not the transcript
    r.metrics = { ...measure({ transcript, clone: "", risky, tracked, culprits: meta.culprits?.[r.ticket] || [], featureDir, feature: r.metrics.feature }), ...kept, error: r.metrics.error };
  }
  for (const f of ["results.json", "report.md"]) { const v1 = path.join(runDir, f.replace(/\.(\w+)$/, "-v1.$1")); if (!fs.existsSync(v1)) fs.renameSync(path.join(runDir, f), v1); }
  meta.risky = risky.size;
  fs.writeFileSync(path.join(runDir, "results.json"), JSON.stringify({ meta, results }, null, 2));
  const md = report({ meta, results });
  fs.writeFileSync(path.join(runDir, "report.md"), md);
  fs.appendFileSync(path.join(path.dirname(runDir), "LOG.md"), `- ${new Date().toISOString().replace(/\.\d+Z$/, "Z")} · re-measured [${path.basename(runDir)}](${path.basename(runDir)}/report.md) from its saved transcripts and specs (harness parser fix); first report kept as report-v1.md\n`);
  return { dir: runDir, report: md, results };
}

const METRICS = [
  ["risky_files_read", "Risky files looked at"], ["investigation_risky_mentions", "Risky files named in investigation"],
  ["risky_plan_files", "Risky files in the plan"], ["risky_files_with_tests", "…of those, with tests planned"],
  ["culprit_files_read", "Known culprit files looked at"], ["culprit_plan_files", "Known culprit files in the plan"], ["culprit_files_with_tests", "…of those, with tests planned"],
  ["tier_on_risky_tasks", "Avg tier of tasks on risky files (1–3)"], ["files_read", "Repo files looked at (Read/Grep/Bash)"],
  ["tasks", "Tasks"], ["agent_test_files", "Test files the agent wrote or changed"], ["tests_pass_with_fix", "Agent's tests pass with its fix (0–1)"],
  ["tests_fail_on_bug", "Agent's tests fail on the unfixed snapshot (0–1)"], ["bug_caught", "Bug caught: both of the above (0–1)"],
  ["cost_usd", "Cost (USD)"], ["output_tokens", "Output tokens"],
];

function report({ meta, results }) {
  // Arms as given, except the classic on/off pair, which reads off → on.
  const arms = (meta.arms || [{ name: "on" }, { name: "off" }]).slice().sort((a, b) => (a.name === "off" && b.name === "on" ? -1 : a.name === "on" && b.name === "off" ? 1 : 0));
  const delta = arms.length === 2, cap = (n) => n[0].toUpperCase() + n.slice(1);
  const lines = [`# GitRisk U8 experiment — ${meta.started}`, "",
    "Question: does feeding GitRisk's historical-risk signal into the spec-driven-dev workflow change what the AI agent does?", "",
    `- Repo: \`${meta.repo}\` at ${meta.head}; risky set = ${meta.risky} files scored medium or above (${meta.tiers}; weights ${JSON.stringify(meta.weights)})`,
    `- Model: ${meta.model} · stages: ${meta.stages.join(" → ")} · runs per arm: ${meta.runs} · tickets: ${meta.tickets.length}${meta.testCmd ? ` · test command: \`${meta.testCmd}\`` : ""}`,
    `- Arms: ${arms.map((a) => `**${a.name}** = risk ${a.risk ? "on (risk.md present)" : "off (no risk file)"}, ${a.model ? `every tier pinned to ${a.model}` : "models as configured (tier picks the model)"}`).join("; ")}. Fresh clone per run, same prompt.`,
    "", "## Results (mean per arm)", "", `| Ticket | Metric | ${arms.map((a) => cap(a.name)).join(" | ")} |${delta ? ` Δ (${arms[1].name} − ${arms[0].name}) |` : ""}`, `|---|---|${arms.map(() => "---|").join("")}${delta ? "---|" : ""}`];
  const mean = (rs, k) => { const v = rs.map((r) => r.metrics?.[k]).filter((x) => typeof x === "number"); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null; };
  meta.tickets.forEach((t, i) => {
    const c = meta.culprits?.[i] || [];
    if (c.length) lines.push(`| ${i + 1}. ${t.slice(0, 40).replace(/\|/g, "/")} | Known culprit files (score) | ${c.map((f) => `\`${f}\` (${meta.culpritScores?.[f] || "unscored"})`).join(", ")} | | |`);
    const per = arms.map((a) => results.filter((r) => r.ticket === i && r.arm === a.name && !r.metrics?.error));
    for (const [k, label] of METRICS) {
      const ms = per.map((rs) => mean(rs, k));
      if (ms.every((m) => m === null)) continue; // metric not measured in this run (e.g. no test command)
      lines.push(`| ${i + 1}. ${t.slice(0, 40).replace(/\|/g, "/")} | ${label} | ${ms.map((m) => m ?? "—").join(" | ")} |${delta ? ` ${ms[0] !== null && ms[1] !== null ? Math.round((ms[1] - ms[0]) * 100) / 100 : "—"} |` : ""}`);
    }
  });
  const failed = results.filter((r) => r.metrics?.error || r.exit !== 0);
  lines.push("", "## Runs", "", "| Ticket | Arm | Run | Exit | Feature folder | Error |", "|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.ticket + 1} | ${r.arm} | ${r.run} | ${r.exit} | ${r.metrics?.feature || "—"} | ${(r.metrics?.error || "").replace(/\|/g, "/")} |`));
  lines.push("", "## Caveats", "",
    `- ${meta.runs} run(s) per arm is a pilot, not a significance test. Agent behaviour varies run to run; increase --runs before drawing conclusions.`,
    "- Metrics are proxies read from the transcript and the written spec (files the agent opened, files and tests it planned, task tiers). They don't measure whether the eventual code has fewer bugs.",
    "- The risky set comes from the same repo history the ON arm sees, so a higher \"risky files read\" in ON is expected; the interesting signal is whether that changes the plan (tests, tiers) without raising cost much.",
    "- Known culprit files (given per ticket as `[files: …]`) are the files the real fix touched. They're measured directly, so a ticket whose culprits score low still shows whether the signal helped or hurt.",
    `- Failed runs: ${failed.length}. They are excluded from the means but kept in results.json.`);
  return lines.join("\n") + "\n";
}

export async function riskEval(opts) {
  const { repo, tickets, runs = 1, timeoutMin = 20, model = "sonnet", stages = ["investigate", "create"], claude = "claude", out, pluginDir, since, weights, configText = "", testCmd = "" } = opts;
  const arms = (opts.arms || ["on", "off"]).map((a) => (typeof a === "string" ? parseArm(a) : a));
  if (new Set(arms.map((a) => a.name)).size !== arms.length) throw new Error("Arm names must be unique");
  const implementing = stages.includes("implement");
  if (!tickets.length) throw new Error("No tickets: pass --tickets=<file> with one ticket per line");
  const started = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const dir = path.join(out, `risk-eval-${started.replace(/[:]/g, "-")}`);
  fs.mkdirSync(dir, { recursive: true });
  const w = normWeights(weights);
  const scored = scoreRepo(repo, { since, weights: w });
  scored.rows.sort((a, b) => b.score - a.score);
  const risky = new Set(scored.rows.filter((r) => ["medium", "high", "critical"].includes(r.tier)).map((r) => r.file));
  const tierCount = (t) => scored.rows.filter((r) => r.tier === t).length;
  const parsed = tickets.map(parseTicket);
  const culpritScores = {};
  for (const { culprits } of parsed) for (const f of culprits) { const row = scored.rows.find((r) => r.file === f); culpritScores[f] = row ? `${row.tier} ${row.score}` : "unscored"; }
  const riskMd = riskMarkdown({ rows: scored.rows, repos: [{ name: path.basename(repo), head: scored.head, commits: scored.commits }], weights: w, since, top: 60 });
  fs.writeFileSync(path.join(dir, "risk.md"), riskMd);
  const meta = { started, repo, head: scored.head, risky: risky.size, tiers: `${tierCount("critical")} critical, ${tierCount("high")} high, ${tierCount("medium")} medium`, weights: w, model, stages, runs, arms, testCmd,
    tickets: parsed.map((p) => p.text), culprits: parsed.map((p) => p.culprits), culpritScores };
  const stageText = stages.map((s) => `spec-${s}`).join(", then ");
  const results = [];
  // A fresh clone of the snapshot, with the project's context copied in and node_modules linked (shortcut: no
  // install per clone, the snapshot's dependencies are assumed current; install per clone if a ticket changes them).
  const freshClone = (prefix) => {
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), `risk-eval-${prefix}-`));
    sh(os.tmpdir(), "git", ["clone", "-q", "--no-hardlinks", repo, clone]);
    for (const extra of ["specs/CONTEXT.md", "specs/context"]) {
      const src = path.join(repo, extra);
      if (fs.existsSync(src) && !fs.existsSync(path.join(clone, extra))) fs.cpSync(src, path.join(clone, extra), { recursive: true });
    }
    fs.rmSync(path.join(clone, "specs/context/risk.md"), { force: true });
    if (fs.existsSync(path.join(repo, "node_modules")) && !fs.existsSync(path.join(clone, "node_modules"))) fs.symlinkSync(path.join(repo, "node_modules"), path.join(clone, "node_modules"));
    return clone;
  };
  const runTests = (cwd) => spawnSync("sh", ["-c", testCmd], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000, stdio: ["ignore", "pipe", "pipe"] }).status === 0;
  const rotate = (n) => arms.slice(n % arms.length).concat(arms.slice(0, n % arms.length));
  for (let t = 0; t < tickets.length; t++) for (let r = 1; r <= runs; r++) for (const arm of rotate(t + r)) {
    const clone = freshClone(arm.name);
    let cfg = setRiskEnabled(configText || "version: 1\nlayout: single\n", arm.risk);
    if (arm.model) cfg = pinModels(cfg, arm.model);
    fs.writeFileSync(path.join(clone, ".spec-driven.yml"), cfg);
    if (arm.risk) { fs.mkdirSync(path.join(clone, "specs/context"), { recursive: true }); fs.writeFileSync(path.join(clone, "specs/context/risk.md"), riskMd); }
    const prompt = `Use the ticket-to-pr plugin skills. This is a non-interactive run: don't ask questions, make reasonable assumptions and record them. Ticket (plain text, no tracker): ${parsed[t].text}\nRun ${stageText}. Work on the current branch; don't create branches, commit or push${implementing ? ". Implement and test on this branch, leaving the changes uncommitted" : ", or implement anything"}.`;
    const res = spawnSync(claude, ["-p", "--output-format", "stream-json", "--verbose", "--model", arm.model || model, "--plugin-dir", pluginDir, "--permission-mode", "acceptEdits",
      "--allowedTools", `Read Write Edit Glob Grep Skill Agent Bash(git:*) Bash(ls:*) Bash(cat:*) Bash(head:*) Bash(tail:*) Bash(wc:*) Bash(find:*) Bash(grep:*) Bash(node:*) Bash(npx:*) Bash(spec-driven-dev:*)${implementing ? " Bash(npm:*) Bash(pnpm:*) Bash(yarn:*)" : ""}`],
      { cwd: clone, input: prompt, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, timeout: timeoutMin * 60 * 1000 });
    const transcript = res.stdout || "";
    const tag = `t${t + 1}-${arm.name}-r${r}`;
    fs.writeFileSync(path.join(dir, `${tag}.jsonl`), transcript);
    const tracked = sh(clone, "git", ["ls-files"]).split("\n").filter((f) => f.includes("/") || f.includes("."));
    const metrics = measure({ transcript, clone, risky, tracked, culprits: parsed[t].culprits });
    if (res.status !== 0 && !metrics.error) {
      // Say where it stopped, so a stall (usage limit, API wait) is told apart from a skill problem.
      const events = transcript.split("\n").filter(Boolean).length;
      const lastTool = [...transcript.matchAll(/"type":"tool_use","id":"[^"]+","name":"(\w+)"/g)].pop()?.[1] || "none";
      metrics.error = `${res.error?.code === "ETIMEDOUT" ? `timed out after ${timeoutMin} min` : `exit ${res.status}`} · ${events} events · last tool ${lastTool} ${(res.stderr || "").slice(0, 120)}`.trim();
    }
    if (implementing) {
      // Outcome: the agent's own tests must pass with its fix and fail on the unfixed snapshot. Its diff is kept.
      const changed = sh(clone, "git", ["status", "--porcelain", "--untracked-files=all"]).split("\n").map((l) => l.slice(3).trim()).filter((f) => f && !f.startsWith("specs/") && f !== ".spec-driven.yml");
      sh(clone, "git", ["add", "-A", "--", ".", ":!specs", ":!.spec-driven.yml"]);
      fs.writeFileSync(path.join(dir, `${tag}.diff`), sh(clone, "git", ["diff", "--cached"]));
      const testFiles = changed.filter(isTestFile);
      metrics.agent_test_files = testFiles.length;
      if (testCmd && !metrics.error) {
        metrics.tests_pass_with_fix = runTests(clone) ? 1 : 0;
        const bug = freshClone("bug");
        for (const f of testFiles) { fs.mkdirSync(path.dirname(path.join(bug, f)), { recursive: true }); fs.copyFileSync(path.join(clone, f), path.join(bug, f)); }
        metrics.tests_fail_on_bug = testFiles.length && !runTests(bug) ? 1 : 0;
        fs.rmSync(bug, { recursive: true, force: true });
        metrics.bug_caught = metrics.tests_pass_with_fix && metrics.tests_fail_on_bug ? 1 : 0;
      }
    }
    if (metrics.feature) fs.cpSync(path.join(clone, "specs", metrics.feature), path.join(dir, tag), { recursive: true });
    results.push({ ticket: t, arm: arm.name, run: r, exit: res.status, metrics });
    fs.rmSync(clone, { recursive: true, force: true });
    console.log(`  ${tag}: ${metrics.error ? `failed (${metrics.error.slice(0, 80)})` : `read ${metrics.risky_files_read} risky / ${metrics.files_read} files, ${metrics.risky_plan_files} risky in plan${parsed[t].culprits.length ? `, culprits read ${metrics.culprit_files_read}/${parsed[t].culprits.length}, planned ${metrics.culprit_plan_files}` : ""}${"bug_caught" in metrics ? `, bug ${metrics.bug_caught ? "caught" : "not caught"} (${metrics.agent_test_files} test files)` : ""}, $${metrics.cost_usd}`}`);
  }
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify({ meta, results }, null, 2));
  const md = report({ meta, results });
  fs.writeFileSync(path.join(dir, "report.md"), md);
  const failed = results.filter((x) => x.metrics.error).length;
  fs.appendFileSync(path.join(out, "LOG.md"), `${fs.existsSync(path.join(out, "LOG.md")) ? "" : "# GitRisk experiment log\n\nAppend-only record of every run, including failures.\n\n"}- ${started} · ${tickets.length} ticket(s) × ${runs} run(s) × ${arms.length} arms (${arms.map((a) => a.name).join("/")}) on \`${path.basename(repo)}\` at ${scored.head}, ${model}, ${stages.join("+")} · ${results.length - failed} ok, ${failed} failed · [report](${path.basename(dir)}/report.md)\n`);
  return { dir, report: md, results };
}
