# Changelog

## 1.9.0 — 2026-11-10
- **The Claude Code plugin is now `ticket-to-pr`** (was `spec-driven-dev`, a name another directory listing already uses). Reinstall with `/plugin install ticket-to-pr@spec-driven-dev`; the marketplace id, npm package and CLI are unchanged.
- The plugin moved to `plugin/` and contains only its manifest, icon and skills, so it passes Anthropic's plugin directory checks.
- Removed the session-start hook. Run `spec-driven-dev status` to list unfinished specs instead.
- Author is now Benjamin Thomas.

## 1.8.0 — 2026-11-06
- **Model defaults checked against the vendors' current docs** (2026-11-06) instead of written from memory.
  - Claude Code keeps family aliases (`haiku`/`sonnet`/`opus`), which follow the newest model on your provider, and gains `escalate: fable` for deep tasks that keep failing. It asks first, because Fable can bill to usage credits.
  - Codex gets real defaults (`gpt-6-luna` / `gpt-6.1-sol`).
  - Cursor stays on your session's model, because its models depend on your plan.
- **Effort per tier** (`effort:` in `.spec-driven.yml`: light `low`, standard `medium`, deep `high`, escalate `xhigh`), passed to coders on hosts that support it.
- If a configured model isn't available, that task falls back to the session's model and the report says why.
- `doctor` validates `effort:` and the `escalate` tier.

## 1.7.0 — 2026-11-06
- **Model routing by task complexity.** `spec-create` rates every task `light`, `standard`, or `deep` using a shared rubric (`references/complexity-rubric.md`): spread, new design, data, concurrency, security, public contract, ambiguity, and hard to verify. `spec-implement` runs each coder on that tier's model from `.spec-driven.yml` → `models:` (Claude Code defaults `haiku`/`sonnet`/`opus`). Reviews run on at least `standard`, and repeat failures escalate one tier. Tools that can't pick a model per agent pause and say which model to switch to.
- `spec-investigate` adds a complexity estimate and the model worth planning on.
- Spec README shows the model plan (`n light · n standard · n deep`).
- Fix: config lines like `key:   # comment` are now read as the start of a section.

## 1.6.0 — 2026-11-06
- **Setup uses menus.** Arrow keys and Enter to choose, Space to tick, instead of typing words and comma-separated numbers. Detected values are pre-selected and marked *(detected)*. Branch-naming and commit-style questions show real examples (`STP-123`, `feat: add login`) instead of patterns. Ctrl+C cancels cleanly.
- **Repo paths are added one at a time and checked as you go.** A wrong path shows an error and lets you fix it, instead of being skipped after the fact. Pasted paths can have quotes, `~`, or Windows form (`"C:\personal\society-app"` now works).
- **Windows fixes:** git paths are normalised (`C:/x` → `C:\x`), and `~\` is expanded. CI now also runs on Windows and macOS.
- Adds one dependency, `prompts` (works on Node 6+, so Node 14 support is unchanged).

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
