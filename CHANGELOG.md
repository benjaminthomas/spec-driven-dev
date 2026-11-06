# Changelog

## 1.5.1 — 2026-11-06
- **Fix: setup crashed on Node 14 and 16** (common inside nvm-pinned projects) before asking anything. The CLI now runs on Node 14+, through a small launcher that also explains when Node is too old. CI runs it on Node 14, 16, 18, 20, 22, and 24.
- **Fix: no silent setup.** With no terminal to answer in and no answers passed as flags, setup now stops, changes nothing, and says how to run it (in a terminal window, or with `--layout`/`--repos`/`--yes`). Previously it wrote a config from guesses.

## 1.5.0 — 2026-11-06
- **Run-through after approval.** Say "approved, run it through" (or set `pipeline.after_approval: run-through`) to implement → verify → checkpoint in one go. It stops at the first failure and never pushes without asking. Setup asks for your default.
- **Multi-repo workspaces in different places.** Repos like `/Projects/frontend`, `~/Work/backend`, and `/srv/database` can form one workspace. The config goes in their shared parent, or `~/.spec-driven/<name>/`, and `~/.spec-driven/workspaces.json` lets every repo find it (skills, `doctor`, and `status`).
- Setup prints what it detected before asking, finds repos up to two folders down, and says so when there's no terminal to answer in (instead of silently using defaults).
- `--version`, `--workspace`, and `--after-approval` flags. `doctor` validates `pipeline.after_approval`.
- README: first-time setup is `npx @benjaminthomas/spec-driven-dev@latest`, with an explanation of why `npm install -g` can't run setup.

## 1.4.1 — 2026-11-06
- Setup asks for repos in other folders (multi-repo) and for package folders (monorepo). It checks
  each path, skips ones that don't exist or aren't git repos, and stores outside paths as absolute.
- Choosing a different layout from the one detected now works. For example, `multi-repo` from inside
  a repo uses the parent folder as the workspace. Invalid layouts are re-asked, and an empty
  multi-repo workspace is refused instead of written.
- New flags: `--layout`, `--repos`, `--packages`.
- README leads with `npm install -g @benjaminthomas/spec-driven-dev` and the `spec-driven-dev` command.

## 1.4.0 — 2026-11-06
- Published to npm as `@benjaminthomas/spec-driven-dev` (npm rejected the unscoped name as too close to another package). Run it with `npx @benjaminthomas/spec-driven-dev`.
- `npx spec-driven-dev doctor` checks `.spec-driven.yml` against the real repos: branches exist, `npm run` scripts exist, values are valid. Exits 1 on problems.
- `npx spec-driven-dev status` lists specs with unfinished work. The Claude Code plugin runs it on session start, and it prints nothing when there's nothing unfinished.
- Setup fix: in a multi-repo workspace, repos without the shared base branch (e.g. no `staging`) now get `base_branch: default` instead of inheriting one they don't have.
- CI enforces Anthropic's skill rules: name format, description ≤1024 chars without XML, no reserved words, `SKILL.md` body <500 lines.

## 1.3.1 — 2026-11-06
- Monorepo setup reads the workspace globs declared in `package.json`/`pnpm-workspace.yaml`.
- Codex personal skills install to `~/.agents/skills`.

## 1.3.0 — 2026-11-06
- `npx spec-driven-dev` installer: detects Claude Code, Cursor, Codex CLI, and Antigravity, then runs project discovery.
- New `spec-setup` skill and `.spec-driven.yml`: layout (single/monorepo/multi-repo), tracker, branches, commit style, and commands, read by every stage.

## 1.2.x — 2026-11-06
- `spec-investigate` accepts GitHub Issues, Linear, transcripts, docs, logs, and plain text.
- Tests written first, review gate runs tests, parallel coders in git worktrees.
- `spec-checkpoint` uses the repo's own commands. CI consistency checks and evals.

## 1.1.0 — 2026-11-06
- Added `spec-investigate` as the first stage of the pipeline.

## 1.0.0 — 2026-08-04
- Spec-driven pipeline (`spec-create`, `spec-implement`, `spec-verify`, `spec-checkpoint`, `spec-ship`) and `generative-seo`.
