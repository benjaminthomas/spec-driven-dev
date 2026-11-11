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

// Behaviour metrics from the agent's transcript (stream-json) and the spec it wrote.
export function measure({ transcript, clone, risky, tracked = [] }) {
  const reads = new Set();
  let cost = 0, turns = 0, inTok = 0, outTok = 0, error = "";
  for (const line of transcript.split("\n")) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.type === "assistant") for (const c of e.message?.content || []) {
      // A file counts as looked at when a Read, Grep or Bash call names it (agents often use grep/sed/cat, not Read).
      if (c.type !== "tool_use" || !["Read", "Grep", "Bash", "Glob"].includes(c.name)) continue;
      const text = JSON.stringify(c.input || {}).split(clone + "/").join("").split(clone.replace(/^\/private/, "") + "/").join("");
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
  const feature = (fs.existsSync(specsDir) ? fs.readdirSync(specsDir) : []).find((d) => fs.existsSync(path.join(specsDir, d, "investigation.md")) || fs.existsSync(path.join(specsDir, d, "tasks")));
  const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
  const inv = feature ? read(path.join(specsDir, feature, "investigation.md")) : "";
  const tasks = [];
  const tdir = feature && path.join(specsDir, feature, "tasks");
  if (tdir && fs.existsSync(tdir)) for (const t of fs.readdirSync(tdir).filter((f) => f.endsWith(".md"))) {
    const text = read(path.join(tdir, t));
    const section = (name) => (text.match(new RegExp(`^## ${name}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m")) || [])[1] || "";
    const files = [...(section("Files to Create") + section("Files to Modify")).matchAll(/`([^`\s]+\.[\w]+)`/g)].map((m) => m[1]);
    const tests = section("Tests").trim();
    tasks.push({ name: t, files, tier: (text.match(/\*\*Tier:\*\*\s*(light|standard|deep)/i) || [])[1]?.toLowerCase(), hasTests: !!tests && !/^none\b/i.test(tests) });
  }
  const isRisky = (f) => risky.has(f);
  const planFiles = new Set(tasks.flatMap((t) => t.files));
  const riskyPlan = [...planFiles].filter(isRisky);
  const riskyTasks = tasks.filter((t) => t.files.some(isRisky));
  const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
  return {
    feature: feature || null,
    files_read: reads.size,
    risky_files_read: [...reads].filter(isRisky).length,
    investigation_risky_mentions: [...risky].filter((f) => inv.includes(f)).length,
    plan_files: planFiles.size,
    risky_plan_files: riskyPlan.length,
    risky_files_with_tests: riskyPlan.filter((f) => tasks.some((t) => t.files.includes(f) && t.hasTests)).length,
    tier_on_risky_tasks: avg(riskyTasks.map((t) => TIER_RANK[t.tier]).filter(Boolean)),
    tier_all_tasks: avg(tasks.map((t) => TIER_RANK[t.tier]).filter(Boolean)),
    tasks: tasks.length,
    cost_usd: Math.round(cost * 10000) / 10000, turns, input_tokens: inTok, output_tokens: outTok, error,
  };
}

const METRICS = [
  ["risky_files_read", "Risky files looked at"], ["investigation_risky_mentions", "Risky files named in investigation"],
  ["risky_plan_files", "Risky files in the plan"], ["risky_files_with_tests", "…of those, with tests planned"],
  ["tier_on_risky_tasks", "Avg tier of tasks on risky files (1–3)"], ["files_read", "Repo files looked at (Read/Grep/Bash)"],
  ["tasks", "Tasks"], ["cost_usd", "Cost (USD)"], ["output_tokens", "Output tokens"],
];

function report({ meta, results }) {
  const lines = [`# GitRisk U8 experiment — ${meta.started}`, "",
    "Question: does feeding GitRisk's historical-risk signal into the spec-driven-dev workflow change what the AI agent does?", "",
    `- Repo: \`${meta.repo}\` at ${meta.head}; risky set = ${meta.risky} files scored high or critical (weights ${JSON.stringify(meta.weights)})`,
    `- Model: ${meta.model} · stages: ${meta.stages.join(" → ")} · runs per arm: ${meta.runs} · tickets: ${meta.tickets.length}`,
    "- Arms: **on** = risk.enabled on + specs/context/risk.md present; **off** = risk.enabled off, no risk file. Fresh clone per run, same prompt.",
    "", "## Results (mean per arm)", "", "| Ticket | Metric | Off | On | Δ (on − off) |", "|---|---|---|---|---|"];
  const mean = (rs, k) => { const v = rs.map((r) => r.metrics?.[k]).filter((x) => typeof x === "number"); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null; };
  meta.tickets.forEach((t, i) => {
    const off = results.filter((r) => r.ticket === i && r.arm === "off" && !r.metrics?.error), on = results.filter((r) => r.ticket === i && r.arm === "on" && !r.metrics?.error);
    for (const [k, label] of METRICS) {
      const a = mean(off, k), b = mean(on, k);
      lines.push(`| ${i + 1}. ${t.slice(0, 40).replace(/\|/g, "/")} | ${label} | ${a ?? "—"} | ${b ?? "—"} | ${a !== null && b !== null ? Math.round((b - a) * 100) / 100 : "—"} |`);
    }
  });
  const failed = results.filter((r) => r.metrics?.error || r.exit !== 0);
  lines.push("", "## Runs", "", "| Ticket | Arm | Run | Exit | Feature folder | Error |", "|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.ticket + 1} | ${r.arm} | ${r.run} | ${r.exit} | ${r.metrics?.feature || "—"} | ${(r.metrics?.error || "").replace(/\|/g, "/")} |`));
  lines.push("", "## Caveats", "",
    `- ${meta.runs} run(s) per arm is a pilot, not a significance test. Agent behaviour varies run to run; increase --runs before drawing conclusions.`,
    "- Metrics are proxies read from the transcript and the written spec (files the agent opened, files and tests it planned, task tiers). They don't measure whether the eventual code has fewer bugs.",
    "- The risky set comes from the same repo history the ON arm sees, so a higher \"risky files read\" in ON is expected; the interesting signal is whether that changes the plan (tests, tiers) without raising cost much.",
    `- Failed runs: ${failed.length}. They are excluded from the means but kept in results.json.`);
  return lines.join("\n") + "\n";
}

export async function riskEval(opts) {
  const { repo, tickets, runs = 1, arms = ["on", "off"], timeoutMin = 20, model = "sonnet", stages = ["investigate", "create"], claude = "claude", out, pluginDir, since, weights, configText = "" } = opts;
  if (!tickets.length) throw new Error("No tickets: pass --tickets=<file> with one ticket per line");
  const started = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const dir = path.join(out, `risk-eval-${started.replace(/[:]/g, "-")}`);
  fs.mkdirSync(dir, { recursive: true });
  const w = normWeights(weights);
  const scored = scoreRepo(repo, { since, weights: w });
  scored.rows.sort((a, b) => b.score - a.score);
  const risky = new Set(scored.rows.filter((r) => r.tier === "high" || r.tier === "critical").map((r) => r.file));
  const riskMd = riskMarkdown({ rows: scored.rows, repos: [{ name: path.basename(repo), head: scored.head, commits: scored.commits }], weights: w, since, top: 60 });
  fs.writeFileSync(path.join(dir, "risk.md"), riskMd);
  const meta = { started, repo, head: scored.head, risky: risky.size, weights: w, model, stages, runs, tickets };
  const stageText = stages.map((s) => `spec-${s}`).join(", then ");
  const results = [];
  for (let t = 0; t < tickets.length; t++) for (let r = 1; r <= runs; r++) for (const arm of ((t + r) % 2 ? ["off", "on"] : ["on", "off"]).filter((a) => arms.includes(a))) {
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), `risk-eval-${arm}-`));
    sh(os.tmpdir(), "git", ["clone", "-q", "--no-hardlinks", repo, clone]);
    for (const extra of ["specs/CONTEXT.md", "specs/context"]) {
      const src = path.join(repo, extra);
      if (fs.existsSync(src) && !fs.existsSync(path.join(clone, extra))) fs.cpSync ? fs.cpSync(src, path.join(clone, extra), { recursive: true }) : sh(repo, "cp", ["-R", src, path.join(clone, extra)]);
    }
    fs.rmSync(path.join(clone, "specs/context/risk.md"), { force: true });
    fs.writeFileSync(path.join(clone, ".spec-driven.yml"), setRiskEnabled(configText || "version: 1\nlayout: single\n", arm === "on"));
    if (arm === "on") { fs.mkdirSync(path.join(clone, "specs/context"), { recursive: true }); fs.writeFileSync(path.join(clone, "specs/context/risk.md"), riskMd); }
    const prompt = `Use the ticket-to-pr plugin skills. This is a non-interactive run: don't ask questions, make reasonable assumptions and record them. Ticket (plain text, no tracker): ${tickets[t]}\nRun ${stageText}. Work on the current branch; don't create branches, commit, push, or implement anything.`;
    const res = spawnSync(claude, ["-p", "--output-format", "stream-json", "--verbose", "--model", model, "--plugin-dir", pluginDir, "--permission-mode", "acceptEdits",
      "--allowedTools", "Read Write Edit Glob Grep Skill Bash(git:*) Bash(ls:*) Bash(cat:*) Bash(head:*) Bash(tail:*) Bash(wc:*) Bash(find:*) Bash(grep:*) Bash(node:*) Bash(npx:*) Bash(spec-driven-dev:*)"],
      { cwd: clone, input: prompt, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, timeout: timeoutMin * 60 * 1000 });
    const transcript = res.stdout || "";
    const tag = `t${t + 1}-${arm}-r${r}`;
    fs.writeFileSync(path.join(dir, `${tag}.jsonl`), transcript);
    const tracked = sh(clone, "git", ["ls-files"]).split("\n").filter((f) => f.includes("/") || f.includes("."));
    const metrics = measure({ transcript, clone, risky, tracked });
    if (res.status !== 0 && !metrics.error) {
      // Say where it stopped, so a stall (usage limit, API wait) is told apart from a skill problem.
      const events = transcript.split("\n").filter(Boolean).length;
      const lastTool = [...transcript.matchAll(/"type":"tool_use","id":"[^"]+","name":"(\w+)"/g)].pop()?.[1] || "none";
      metrics.error = `${res.error?.code === "ETIMEDOUT" ? `timed out after ${timeoutMin} min` : `exit ${res.status}`} · ${events} events · last tool ${lastTool} ${(res.stderr || "").slice(0, 120)}`.trim();
    }
    if (metrics.feature) fs.cpSync ? fs.cpSync(path.join(clone, "specs", metrics.feature), path.join(dir, tag), { recursive: true }) : sh(clone, "cp", ["-R", path.join("specs", metrics.feature), path.join(dir, tag)]);
    results.push({ ticket: t, arm, run: r, exit: res.status, metrics });
    fs.rmSync(clone, { recursive: true, force: true });
    console.log(`  ${tag}: ${metrics.error ? `failed (${metrics.error.slice(0, 80)})` : `read ${metrics.risky_files_read} risky / ${metrics.files_read} files, ${metrics.risky_plan_files} risky in plan, $${metrics.cost_usd}`}`);
  }
  fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify({ meta, results }, null, 2));
  const md = report({ meta, results });
  fs.writeFileSync(path.join(dir, "report.md"), md);
  const failed = results.filter((x) => x.metrics.error).length;
  fs.appendFileSync(path.join(out, "LOG.md"), `${fs.existsSync(path.join(out, "LOG.md")) ? "" : "# GitRisk experiment log\n\nAppend-only record of every run, including failures.\n\n"}- ${started} · ${tickets.length} ticket(s) × ${runs} run(s) × 2 arms on \`${path.basename(repo)}\` at ${scored.head}, ${model}, ${stages.join("+")} · ${results.length - failed} ok, ${failed} failed · [report](${path.basename(dir)}/report.md)\n`);
  return { dir, report: md, results };
}
