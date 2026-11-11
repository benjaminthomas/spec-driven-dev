// Token and model usage per feature, read from Claude Code's own session files
// (~/.claude/projects/<folder>/<session>.jsonl, plus <session>/subagents/agent-*.jsonl and .meta.json).
// Each assistant record carries message.model, message.usage and attributionSkill (the skill that was active).
// shortcut: Claude Code only. Codex and OpenCode keep session files too; add readers when we can test them.
import fs from "node:fs";
import path from "node:path";

// Claude Code names a folder's session directory after its path, every non-alphanumeric as "-".
export const claudeDirName = (absPath) => absPath.replace(/[^A-Za-z0-9]/g, "-");

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A feature folder is named by its folder and, when it starts with one, its ticket key
// ("stp-297-pricing-fixer" is also "STP-297"). Returns the folder of the longest name mentioned.
export const aliases = (folder) => [folder, ...(/^([A-Za-z][A-Za-z0-9]*-\d+)(?=-|$)/.exec(folder) || []).slice(1)];
const mentions = (text, features) => {
  let best = null, len = 0;
  for (const f of features) for (const n of aliases(f))
    if (n.length > len && new RegExp(`(^|[^A-Za-z0-9-])${esc(n)}($|[^A-Za-z0-9])`, "i").test(text)) { best = f; len = n.length; }
  return best;
};
// "STP-297", "stp-297" or the full folder name -> the folder, or null.
export const resolveFeature = (arg, features) => features.find((f) => f === arg) || features.find((f) => aliases(f).some((a) => a.toLowerCase() === String(arg).toLowerCase())) || null;
const readJsonl = (f) => {
  try { return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
};
// Text a person typed, or the arguments of a Skill call: these say which feature the work is about.
// Tool results and the assistant's own prose are left out, because they mention other features in passing.
function steeringText(rec) {
  const c = rec.message?.content;
  if (rec.type === "user" && !rec.isMeta) {
    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  if (rec.type === "assistant" && Array.isArray(c))
    return c.filter((b) => b.type === "tool_use" && b.name === "Skill").map((b) => JSON.stringify(b.input || {})).join("\n");
  return "";
}
// "spec-verify" or a plugin's "spec-driven-dev:spec-verify" -> "verify". Setup isn't feature work.
const stageOf = (skill) => { const m = /(?:^|:)spec-([a-z-]+)$/.exec(skill || ""); return m && m[1] !== "setup" ? m[1] : null; };

export function featureUsage({ projectDirs, features, target }) {
  const rows = new Map(); // `${stage}\t${model}` -> totals
  const seen = new Set();
  const out = { target, sessions: 0, agents: 0, first: null, last: null, rows };
  const add = (rec, stage) => {
    const m = rec.message || {}, u = m.usage;
    if (!u || !m.model || m.model === "<synthetic>") return;
    const id = `${rec.sessionId}:${m.id || rec.uuid}`;
    if (seen.has(id)) return; // one response is split over several records with the same usage
    seen.add(id);
    const k = `${stage}\t${m.model}`;
    const r = rows.get(k) || { stage, model: m.model, responses: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
    r.responses++; r.input += u.input_tokens || 0; r.cacheWrite += u.cache_creation_input_tokens || 0;
    r.cacheRead += u.cache_read_input_tokens || 0; r.output += u.output_tokens || 0;
    rows.set(k, r);
    if (rec.timestamp) { if (!out.first || rec.timestamp < out.first) out.first = rec.timestamp; if (!out.last || rec.timestamp > out.last) out.last = rec.timestamp; }
  };
  for (const dir of projectDirs) {
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      const recs = readJsonl(path.join(dir, f));
      let cur = null, last = null, counted = false; // last: the stage still running when a reply has no skill tag
      const spawned = new Map(); // tool_use id of an Agent/Task call -> { feature, stage }
      for (const rec of recs) {
        const t = steeringText(rec);
        if (t) { const f = mentions(t, features); if (f && f !== cur) { cur = f; last = null; } }
        if (rec.type !== "assistant") continue;
        const tagged = stageOf(rec.attributionSkill);
        if (rec.attributionSkill) last = tagged;
        // A reply with no skill tag, after a stage ran, is follow-up chat about that feature (fixes, questions).
        const stage = tagged || (last ? "follow-up" : null);
        for (const b of Array.isArray(rec.message?.content) ? rec.message.content : [])
          if (b.type === "tool_use" && (b.name === "Agent" || b.name === "Task")) spawned.set(b.id, { feature: cur, stage: tagged || last });
        if (cur === target && stage) { add(rec, stage); counted = true; }
      }
      const subDir = path.join(dir, f.replace(/\.jsonl$/, ""), "subagents");
      let subs = [];
      try { subs = fs.readdirSync(subDir).filter((s) => s.endsWith(".jsonl")); } catch {}
      for (const s of subs) {
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(path.join(subDir, s.replace(/\.jsonl$/, ".meta.json")), "utf8")); } catch {}
        const parent = spawned.get(meta.toolUseId) || {};
        const named = mentions(meta.description || "", features);
        if ((named || parent.feature) !== target) continue;
        const recs2 = readJsonl(path.join(subDir, s));
        const stage = parent.stage || stageOf(recs2.find((r) => r.attributionSkill)?.attributionSkill) || "other";
        const before = seen.size;
        for (const r of recs2) if (r.type === "assistant") add(r, stage);
        if (seen.size > before) { out.agents++; counted = true; }
      }
      if (counted) out.sessions++;
    }
  }
  return out;
}

export function totals(u) {
  const t = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, responses: 0 };
  for (const r of u.rows.values()) for (const k of Object.keys(t)) t[k] += r[k];
  t.allIn = t.input + t.cacheWrite + t.cacheRead;
  t.cachedShare = t.allIn ? t.cacheRead / t.allIn : 0;
  return t;
}

export const fmtTokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n));
export const modelName = (m) => {
  const c = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(m);
  return c ? `${c[1][0].toUpperCase()}${c[1].slice(1)} ${c[2]}.${c[3]}` : m;
};
const STAGE_ORDER = ["investigate", "create", "implement", "verify", "review", "checkpoint", "ship", "follow-up", "other"];
const byStage = (a, b) => (STAGE_ORDER.indexOf(a) + 1 || 99) - (STAGE_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b);
const span = (u) => {
  if (!u.first || !u.last) return "";
  const m = Math.round((Date.parse(u.last) - Date.parse(u.first)) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

// A few lines for a PR description or a ticket comment: totals only, never content.
export function summary(u) {
  const t = totals(u);
  if (!t.responses) return "";
  const models = new Map();
  for (const r of u.rows.values()) { const s = models.get(r.model) || new Set(); s.add(r.stage); models.set(r.model, s); }
  const modelLine = [...models].sort((a, b) => b[1].size - a[1].size)
    .map(([m, st]) => `${modelName(m)} (${[...st].sort(byStage).join(", ")})`).join(" · ");
  return [
    `Built with spec-driven-dev · ${u.target}${span(u) ? ` · over ${span(u)}` : ""}`,
    `Models: ${modelLine}`,
    `Tokens: ${fmtTokens(t.allIn)} in (${Math.round(t.cachedShare * 100)}% from cache) · ${fmtTokens(t.output)} out · ${u.agents} subagent${u.agents === 1 ? "" : "s"} · ${u.sessions} session${u.sessions === 1 ? "" : "s"}`,
  ].join("\n");
}

export function table(u) {
  const rows = [...u.rows.values()].sort((a, b) => byStage(a.stage, b.stage) || b.output - a.output);
  const t = totals(u);
  const line = (r) => `| ${r.stage} | ${modelName(r.model)} | ${r.responses} | ${fmtTokens(r.input + r.cacheWrite + r.cacheRead)} | ${fmtTokens(r.cacheRead)} | ${fmtTokens(r.output)} |`;
  return [`| Stage | Model | Responses | Tokens in | from cache | Tokens out |`, `|---|---|---|---|---|---|`, ...rows.map(line),
    `| **Total** | | ${t.responses} | ${fmtTokens(t.allIn)} | ${fmtTokens(t.cacheRead)} | ${fmtTokens(t.output)} |`].join("\n");
}
