# spec-driven-dev

Seven [Agent Skills](https://agentskills.io) — an open, cross-host standard for packaging agent
instructions — bundling a parallel-batch, spec-driven feature workflow and a portable SEO/GEO
operations skill. Works in any codebase — none of these assume a specific framework, stack, or
product. Packaged as a Claude Code plugin for that host, and installable as plain skill folders
on any other Agent-Skills-compatible host (see [Compatibility](#compatibility) and
[Install](#install) below).

## What's inside

### The feature pipeline

Six skills that work together, each one resumable and each producing an
artifact the next stage (or the next person) can pick up cold:

```
spec-investigate  →  spec-create  →  spec-implement  →  spec-verify  →  spec-checkpoint  →  spec-ship
```

| Skill | Trigger | Input | Output |
|---|---|---|---|
| `spec-investigate` | "investigate STP-123", "look into this before we plan it" | A ticket (Jira, GitHub Issues, Linear), a call transcript, a doc/PRD, a log, or plain text — plus any optional context | `specs/{feature}/investigation.md` — evidence-based report of current behaviour, root cause, affected repos/files, risks, test landscape, and open questions, plus a work branch; no code changes |
| `spec-create` | "create a spec", "plan this feature", "break this into tasks" | A planning conversation (or an interview if there wasn't one) | `specs/{feature}/` — `requirements.md`, `action-required.md`, `tasks/task-NN-*.md`, `README.md` with a dependency graph and batch breakdown |
| `spec-implement` | "implement this feature", "run the spec", "continue implementing" | `specs/{feature}/` | Real code changes plus their tests — one coder subagent per task per batch, run in parallel (each in its own git worktree where the host allows), with a code-review gate before each batch is committed |
| `spec-verify` | "test this end to end", "does this actually work", right after `spec-implement` finishes | `specs/{feature}/` | `specs/{feature}/verification-report.md` — every acceptance criterion checked against the *real running app* (clicks, API calls, DB reads used only to confirm state), pass/fail with evidence |
| `spec-checkpoint` | "checkpoint", "commit everything", "save my progress" | A working tree with changes | A local commit — but only after lint, typecheck, and build all pass |
| `spec-ship` | "ship it", "push this", "open a PR" | A committed, verified branch | A pushed branch + an opened GitHub PR |

The insight behind the pipeline: implementation plans that live in one giant
file are either too large for an agent's context window or too shallow for
independent execution. Splitting into one self-contained task file per unit of
work lets multiple coder agents implement a feature in parallel, safely,
without anyone needing to re-read the whole plan.

None of these six skills write to a specific stack's config — they read
whatever lint/typecheck/build/dev commands the target repo actually has and
use those.

### generative-seo

A standalone seventh skill, unrelated to the pipeline above: runs an
evidence-based SEO + GEO (Generative Engine Optimization) program — technical
SEO audits, answer-first content built to get cited by ChatGPT/Perplexity/AI
Overviews, an AI-citation tracker, competitor research, and draft-only social
distribution. First use in a project spends a few minutes learning that
project's specifics (brand, domain, framework, content location) via a short
interview, then remembers the answers for every later run. See
`skills/generative-seo/SKILL.md` for the seven modes
(`audit`/`content`/`optimize`/`competitors`/`citations`/`report`/`social`).

## By the numbers

| Skill | Stage | SKILL.md lines | Words | Supporting files |
|---|---|---:|---:|---:|
| `spec-investigate` | 1 · understand | 310 | 2,553 | 1 |
| `spec-create` | 2 · plan | 136 | 1,195 | 4 |
| `spec-implement` | 3 · build | 223 | 1,645 | 3 |
| `spec-verify` | 4 · prove | 140 | 1,336 | 1 |
| `spec-checkpoint` | 5 · commit | 94 | 599 | 0 |
| `spec-ship` | 6 · PR | 201 | 1,051 | 0 |
| `generative-seo` | standalone | 255 | 2,209 | 7 |
| **Total** | | **1,359** | **10,588** | **16** |

- **7** skills — **6** pipeline stages + **1** standalone
- **4** hosts supported natively (Claude Code, Codex CLI, Cursor, Antigravity) + an MCP fallback for any MCP host
- **3** install paths: Claude Code plugin, `install.sh`, MCP server (121 lines, 1 dependency)
- **0** stack-specific assumptions — lint/typecheck/build/dev commands are read from the target repo

## Compatibility

Every skill here is a plain `SKILL.md` + `references/` folder conforming to the open
[Agent Skills](https://agentskills.io) spec, which Claude Code, Codex CLI, Cursor, and Google
Antigravity all read natively. The `.claude-plugin/` manifest layer (plugin.json,
marketplace.json) is Claude Code-specific packaging on top of that — none of the other hosts
have an equivalent plugin/marketplace concept, so on those hosts you install the `skills/`
folders directly (see Install below).

| Skill | Claude Code | Codex CLI | Cursor | Antigravity | Notes |
|---|---|---|---|---|---|
| `spec-investigate` | ✅ | ✅ | ✅ | ✅ | Fetches tickets via whatever access the host has (Atlassian/Linear MCP, `gh`, or pasted text); free-form input needs nothing extra |
| `spec-create` | ✅ | ✅ | ✅ | ✅ | Planning + file writing only, no host-specific mechanics |
| `spec-implement` | ✅ | ✅ | ✅ | ✅ | Parallel dispatch uses whichever subagent/background-agent mechanism your host provides; falls back to sequential execution if it has none |
| `spec-verify` | ✅ | ⚠️ | ⚠️ | ⚠️ | UI-observable criteria need a browser-automation tool available on your host (MCP browser server, built-in browser tool, or extension); API/DB-only criteria work everywhere |
| `spec-checkpoint` | ✅ | ✅ | ✅ | ✅ | Plain git commands |
| `spec-ship` | ✅ | ✅ | ✅ | ✅ | Plain git + GitHub CLI (`gh`) commands |
| `generative-seo` | ✅ | ✅ | ✅ | ✅ | Web search + file writing only |

⚠️ = works, but one step's usefulness depends on a host capability that isn't guaranteed present
— the skill degrades gracefully (it says so and skips that step) rather than failing outright.

Native Agent Skills support is new on some of these hosts and still settling — if a skill
doesn't get picked up, check your host's current docs for its exact discovery path.

## Install

### Claude Code (plugin)

```
/plugin marketplace add https://github.com/benjaminthomas/spec-driven-dev.git
/plugin install spec-driven-dev@spec-driven-dev
```

Or, for local development/testing without publishing anywhere, point Claude
Code at this folder directly as a marketplace source (its own
`.claude-plugin/marketplace.json` lists itself with `source: "./"`).

### Codex CLI, Cursor, Antigravity, or any other Agent-Skills-compatible host

Run `install.sh` from a clone of this repo:

```bash
./install.sh                        # interactive: pick a host and skills
./install.sh codex                   # all seven skills, into the current project
./install.sh cursor spec-create      # just one skill, into the current project
./install.sh --global antigravity    # install globally instead of per-project
```

Or copy the `skills/<name>/` folders you want by hand — each is fully self-contained. Common
discovery paths as of this writing (also what `install.sh` targets):

| Host | Project-level | Global |
|---|---|---|
| Codex CLI | `.agents/skills/<name>/` | `~/.codex/skills/<name>/` |
| Cursor | `.cursor/skills/<name>/` (or `.agents/skills/<name>/`) | `~/.cursor/skills/<name>/` |
| Antigravity | `.agents/skills/<name>/` | `~/.gemini/config/skills/<name>/` |

Note that Codex CLI and Antigravity share the same project-level path, so installing for one
also covers the other at that scope.

### Fallback: MCP server (for hosts without native Agent Skills support)

If your host speaks MCP but doesn't yet support Agent Skills natively — or only implements MCP
tools, not prompts — `mcp-server/` exposes the same seven skills as MCP tools instead. It reads
directly from `skills/` at request time, so there's nothing to keep in sync by hand.

```bash
cd mcp-server && npm install
```

Then point your host's MCP config at `node /path/to/spec-driven-dev/mcp-server/server.js`
(stdio transport). Each skill becomes a callable tool (e.g. `spec-create`) that returns the
skill's instructions as text; supporting files are also exposed as `skill://<name>/<path>`
resources for hosts that can't otherwise reach the local filesystem.

Treat this as the fallback, not the primary path — prefer native Agent Skills support
(above) wherever your host has it.

## Typical flow

1. `/spec-investigate <ticket | file | text>` to understand the system before planning (optional for greenfield work).
2. Plan the feature in conversation, then `/spec-create` to capture it — review and approve the spec before implementing.
3. `/spec-implement` to build it batch-by-batch with review gates between batches.
4. `/spec-verify` to prove the acceptance criteria hold against the real
   running app — not just that it compiles.
5. `/spec-checkpoint` to commit locally, once lint/typecheck/build all pass.
6. `/spec-ship` to push and open the PR.
7. Any time, independent of the pipeline: `/generative-seo` for SEO/GEO work
   on the same project or any other.

## Development

- `python3 scripts/check.py` checks the repo for drift: each skill's frontmatter, `references/` links, `.agents/skills` symlinks, `install.sh`, the manifests, and README mentions. `--fix` regenerates the *By the numbers* table. CI (`.github/workflows/check.yml`) runs it on every push and PR, along with `bash -n install.sh` and `node --check` on the MCP server.
- `evals/` holds `claude plugin eval` cases that check each pipeline skill fires on its trigger phrases and stays in its lane. Run them with `claude plugin eval . --runs 1`. They use your own Claude credentials, so they aren't part of CI.

## License

MIT — see `LICENSE`.
