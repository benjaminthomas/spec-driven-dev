// The team's shared rules live in the specs repo as team.yml; each person's .spec-driven.yml keeps only
// local things (where their repos are, which ones they have, personal preferences). The effective
// config is team.yml with the personal file on top.
import fs from "node:fs";
import path from "node:path";

// Shared: decided once by the team. Personal: differs per machine or per person.
export const TEAM_KEYS = ["tracker", "git", "commands", "models", "effort", "risk", "context", "usage"];
export const PERSONAL_KEYS = ["version", "layout", "repos", "specs_dir", "pipeline"];
const REPO_TEAM_KEYS = ["role", "git", "commands"];

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
export function deepMerge(a, b) {
  if (!isObj(a) || !isObj(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a[k]) ? deepMerge(a[k], v) : v;
  return out;
}

// personal: the parsed .spec-driven.yml; team: the parsed team.yml (or null). Repos match by folder name.
export function mergeConfig(personal, team) {
  if (!team) return personal;
  const shared = Object.fromEntries(TEAM_KEYS.filter((k) => team[k] !== undefined).map((k) => [k, team[k]]));
  const merged = deepMerge(shared, personal);
  const byName = new Map((Array.isArray(team.repos) ? team.repos : []).map((r) => [r.name, r]));
  if (Array.isArray(personal.repos)) {
    merged.repos = personal.repos.map((r) => {
      const t = byName.get(path.basename(String(r.path || "").replace(/[\\/]+$/, "")));
      return t ? deepMerge(Object.fromEntries(REPO_TEAM_KEYS.filter((k) => t[k] !== undefined).map((k) => [k, t[k]])), r) : r;
    });
  }
  return merged;
}

// Leaves that the personal file sets differently from the team, e.g. "git.base_branch".
export function overrides(personal, team, prefix = "") {
  const out = [];
  for (const k of prefix ? Object.keys(personal || {}) : TEAM_KEYS) {
    const p = personal?.[k], t = team?.[k];
    if (p === undefined || t === undefined) continue;
    if (isObj(p) && isObj(t)) out.push(...overrides(p, t, `${prefix}${k}.`));
    else if (JSON.stringify(p) !== JSON.stringify(t)) out.push({ key: `${prefix}${k}`, yours: p, team: t });
  }
  return out;
}

// Small YAML writer for nested maps, lists of maps and scalars (JSON strings are valid YAML scalars).
export function dumpYaml(obj, indent = "") {
  const scalar = (v) => (typeof v === "string" ? (/^[\w./@~-]+$/.test(v) && !/^(on|off|yes|no|true|false|null|\d.*)$/i.test(v) ? v : JSON.stringify(v)) : String(v));
  let out = "";
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "" || (isObj(v) && !Object.keys(v).length)) continue; // "" means unset
    if (Array.isArray(v)) {
      out += `${indent}${k}:\n`;
      for (const item of v) {
        if (!isObj(item)) { out += `${indent}  - ${scalar(item)}\n`; continue; }
        const body = dumpYaml(item, `${indent}    `).replace(/^\s+/, "");
        out += `${indent}  - ${body}`;
      }
    } else if (isObj(v)) { const body = dumpYaml(v, `${indent}  `); if (body) out += `${indent}${k}:\n${body}`; }
    else out += `${indent}${k}: ${scalar(v)}\n`;
  }
  return out;
}

// Split one config into the team's part and the personal part.
export function splitConfig(c) {
  const team = { version: 1 };
  for (const k of TEAM_KEYS) if (c[k] !== undefined) team[k] = c[k];
  const repos = (Array.isArray(c.repos) ? c.repos : []).map((r) => {
    const t = { name: path.basename(String(r.path || "").replace(/[\\/]+$/, "")) };
    for (const k of REPO_TEAM_KEYS) if (r[k] !== undefined && r[k] !== "") t[k] = r[k];
    return t;
  }).filter((t) => Object.keys(t).length > 1);
  if (repos.length) team.repos = repos;
  const personal = {};
  for (const k of PERSONAL_KEYS) if (c[k] !== undefined) personal[k] = c[k];
  if (Array.isArray(personal.repos)) personal.repos = personal.repos.map((r) => ({ path: r.path }));
  return { team, personal };
}

export const TEAM_HEADER = `# team.yml — the team's shared rules for spec-driven-dev (tracker, git conventions, commands,
# models, GitRisk, sharing). Committed in the specs repo, so everyone works the same way. Each
# person's .spec-driven.yml only says where their repos are; a value set there overrides this file
# for that person. Change a rule here and commit it (or say "change our branch rules" in your AI tool).
`;
export const PERSONAL_HEADER = (teamFile) => `# .spec-driven.yml — your local settings: where your repos are and personal preferences.
# The team's shared rules are in ${teamFile}. Anything you set here overrides them for you only.
`;

export const teamFileFor = (configFile, specsDir) => path.resolve(path.dirname(configFile), specsDir || "specs", "team.yml");
export const readIf = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
