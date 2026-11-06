# Changelog

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
