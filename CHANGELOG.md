# Changelog
## 1.21.0 — 2026-11-11
- **Build report: which models ran and how many tokens it took.** New `spec-driven-dev usage STP-123` reads Claude Code's own session files (including every subagent) and shows tokens per stage and model, how much came from cache, subagent count and time span. `--summary` gives three lines, `--json` the raw numbers. It works out which feature each reply belongs to from what you typed and the skill that was running, and counts a response only once.
- spec-ship adds a **Built with spec-driven-dev** section to the PR, and the ticket comment carries it too: models per stage, tokens, verified N/M, review result, escalations. Totals only, never content. `usage.report: all | pr | ticket | local | off` (default `all`).
- spec-implement logs the model each coder ran on, so tools whose token counts can't be read (Cursor, Antigravity, OpenCode, Codex for now) still get the models line.
## 1.20.0 — 2026-11-11
- **OpenCode support.** The installer offers OpenCode and puts the skills in `~/.config/opencode/skills` (all projects) or `.opencode/skills` (this project). OpenCode also reads the Claude Code and `.agents` skill folders, so an install for those already covers it. `models.opencode` takes `provider/model` values.
- **Model per task tier now works beyond Claude Code.** Based on each tool's current docs: Codex CLI (`spawn_agent` or `.codex/agents/*.toml` with `model`), Cursor (Task tool `model`, or `.cursor/agents/*.md`), OpenCode (agent files with `model:`) and Antigravity (Gemini tiers only: `flash`, `pro`). A new `host-models.md` reference tells spec-implement how to dispatch on each. Before, only Claude Code switched models; the others asked you to switch the session.
- Antigravity's tier defaults are now `flash` (light) and `pro` (standard, deep) instead of the session's model.
## 1.19.0 — 2026-11-11
- **Verification screenshots on the ticket.** spec-verify now saves each screenshot as a file in `{feature}/evidence/` (kept out of git, since screenshots can show customer data); before, reports named screenshot files that were never saved. Once the final review passes, spec-ship's ticket comment attaches them: up to 6, one per UI criterion, each checked first for secrets or real customer data. It works with any tracker: it uses the connected tool's upload if there is one, or the tracker's API with credentials you already have (`trackers.md` lists each one); if neither can, it lists the files for you to drag onto the ticket. `tracker.screenshots: off` turns it off.
## 1.18.2 — 2026-11-11
- **One question instead of two at hand-over.** In a folder with earlier Claude Code sessions, the first question now offers the session choice directly: "Yes, in a new session", "Yes, continue my last session (2 h ago)", "Yes, pick a session to resume", or "No". In 1.18.1 the choice only came after answering yes, so it looked as if it wasn't offered.
## 1.18.1 — 2026-11-11
- **Resume a session instead of always starting a new one.** After install, if you've used Claude Code in that folder before, the hand-over asks where setup should run: a new session (recommended), continue your last session (with "run spec-setup" sent in it), or pick one from Claude Code's session list. First-time folders still open a new session straight away. Codex always opens a new session for now.
## 1.18.0 — 2026-11-11
- **Any ticket tracker, not just Jira, GitHub and Linear.** `tracker.type` takes any tracker's name: GitLab, Azure Boards, ClickUp, Asana, YouTrack, Shortcut, Monday, Trello and others. The skills read the ticket and post updates through whichever MCP server or CLI (`glab`, `az`, …) your AI tool has; if none can reach it, they ask you to paste the ticket and print updates for you to post.
- Setup detects more: `AB#4512` (Azure Boards), `CU-86a1…` (ClickUp), `sc-1234` (Shortcut), and GitLab from the remote. The terminal menu adds GitLab, Azure Boards, ClickUp and "Another tracker…"; scripts can pass `--tracker=<name>`. `doctor` no longer rejects other names.
- A new `trackers.md` reference lists each tracker's ID shapes, the tools that read it, and what "status" means there (transitions, State field, labels, list statuses…).
## 1.17.0 — 2026-11-11
- **PR review feedback goes through the pipeline again.** Say "address the PR comments": spec-review collects the unresolved review threads, checks each against the code and sorts them into fix, scope change, question, disagree or nit, and you pick which to act on. Fixes run through implement → verify → review → checkpoint → ship onto the same PR. A scope change updates the requirements and waits for your approval first. After the push it replies on each thread (once you've seen the text), never resolves them for the reviewer, and records the round in `review.md`.
- **The ticket keeps up with the work.** When a tracker tool is connected (Jira/Atlassian, GitHub or Linear MCP, or `gh`/`acli`), the pipeline moves the ticket and comments at each stage: investigate posts the summary, implement moves it to *In Progress*, verify posts each acceptance criterion with pass/fail, review posts the blocker counts, and ship moves it to *In Review* with the PR link. So the team can see in the tracker that it was verified.
- Status names are read from the project's real workflow on first use and saved to `team.yml` (`tracker.statuses`), never guessed. It never closes a ticket or moves it backwards.
- `tracker.updates: ask` (default) confirms the first update per ticket; `on` or `off` in plain words ("stop updating Jira"). No tracker connected: it prints the comment for you to paste.
## 1.16.4 — 2026-11-11
- **"Add X to the workspace" checks first.** For each repo named, spec-setup now says whether it's already in the workspace (and changes nothing), in the team's list but not cloned here (and offers the clone), not found, or new. A new repo is audited on its own, gets its areas in `CONTEXT.md`, a fresh GitRisk score, the pointer offer and a `doctor` run. Before, it was only added to the repo list.
## 1.16.3 — 2026-11-11
- **Project-memory pointer in every repo.** In a multi-repo workspace, spec-setup now offers the one-line `AGENTS.md`/`CLAUDE.md` pointer for every repo you have, in one question, and skips repos that already have it. The line names the specs repo instead of assuming it sits next door. Joining offers it for any of your repos that lack it. Setup still never commits: it lists one commit per repo in that repo's style, and warns when a repo is on a feature branch.
## 1.16.2 — 2026-11-11
- **Tidier team setup.** `team.yml` and `.spec-driven.yml` leave out unset values instead of writing `""` (and drop a section left empty).
- `team init --fresh` skips the backup when spec-setup wrote the config in the same run, so a first-time install no longer leaves a pointless `.spec-driven.yml.bak`. spec-setup now passes it.
- The audit's draft map gives a source on every line (file or command, or "guess"), and counts are made with a command, not by eye.

## 1.16.1 — 2026-11-11
- **Fix: backups never overwrite an older backup.** `team init` (and `setup --join --force`) used to copy the current settings to `.spec-driven.yml.bak`, replacing any backup already there. If `.bak` exists, the new backup now gets a dated name (`.spec-driven.yml.bak-20261111-1622`). Found when a user's original config backup was lost.

## 1.16.0 — 2026-11-11
- **Join a team that's already set up.** A team's shared rules (tracker, git conventions, per-repo commands, models, GitRisk, sharing) now live in `team.yml` in the specs repo, committed with the specs. Each person's `.spec-driven.yml` keeps only local paths and personal preferences, and overrides the team for them only (`doctor` lists any overrides).
  - `spec-setup` looks for an existing team setup first and offers **Join**, which asks only which of the team's repos you have. No audit, no convention questions, and the shared files aren't changed.
  - `spec-driven-dev setup --join=<specs repo path or git URL>` does the same from a terminal, with clone commands for team repos you don't have.
  - `spec-driven-dev team init` converts an existing setup: it writes `team.yml` and keeps a backup of your old file.
  - `settings` saves team rules (GitRisk, sharing) to `team.yml` when there is one, and every skill reads it.

## 1.15.0 — 2026-11-11
- **`spec-driven-dev ci`: GitRisk hotspots refresh on every merge.** It writes a GitHub Actions workflow into the specs repo that checks out every repo in `team-repos.yml` (full history), runs `risk`, and commits `CONTEXT.md`'s Risk hotspots only when they changed, not for a date-only change. It runs when a code repo pings it, nightly, and on demand. `--notify` also writes the small trigger workflow into each code repo, on its base branch. It needs one secret, `GITRISK_TOKEN`, and commits nothing for you.
- `risk --repos=a,b --specs-dir=…` scores a checkout without a personal settings file, as used in CI.
- The Risk hotspots block puts its date on its own line, so a date-only change is easy to ignore.

## 1.14.2 — 2026-11-11
- **Adding repos the menu can't show.** The repo question names the other repos it found and says how to add them, or a repo from another folder, under *Type something*, since the menu only fits 4.
- **GitRisk is part of the shared project memory.** `spec-driven-dev risk` now keeps a short "Risk hotspots" block in `CONTEXT.md` (the top 5 files, the counts per tier, the date), replaced in place on every run. `CONTEXT.md` is shared, so teammates see the hotspots even though the full `context/risk.md` stays gitignored.
- **Setup choices are interactive menus again.** 1.14.1 moved open questions to plain text, and the agent then asked everything that way. Now real choices (layout and repos, sharing, specs location, after-approval mode, guessed commands) use the host's question tool, such as Claude Code's menus: up to 4 per call, 2–4 options each, the recommendation first, and evidence in each option. Layout is asked on its own first. If you choose several repos, they're a tick-box list with one option per repo and its evidence, never preset bundles. Base branch, PR target, branch naming and commit style are always confirmed in their own menu, and the tracker in the next one, each with the detected value first and its evidence. Open questions follow as plain text. Tools without menus get a numbered text list.

## 1.14.1 — 2026-11-11
Fixes from a first-time setup on a real multi-repo project.
- **Choosing repos comes with context.** In a multi-repo setup, spec-setup no longer skips the repo question or shows bare folder names. It says what each repo is, shows evidence of how it connects to the current one (env vars, API calls, docs, with `path:line`), notes whether you commit to it, and recommends a selection with a reason for each. It asks once and writes nothing until you answer.
- **No more "Invalid tool parameters" during setup.** Open questions (fragile spots, direction, unwritten rules) are asked as plain text in one message. Menus are only used for real choices with two or more options. A one-option menu was being rejected, and the question was lost.

## 1.14.0 — 2026-11-11
- **`spec-driven-dev uninstall`.** Lists everything an install put on this machine (the skills in each AI tool, the Claude Code plugin, the npx download cache) and removes it after one confirmation. Other skills are left alone. `--all` also removes the settings file and workspace registry. Specs, `CONTEXT.md` and code are never touched. Without a terminal it only lists, unless you pass `--yes`.

## 1.13.1 — 2026-11-11
- Clearer hand-over after installing: "Open Claude Code in soreto-shopify to set up your project? It first asks how your project is organised…". The folder says where it opens; "project" says what gets set up, since that can span several repos. The step is now "Set up your project in your AI tool", and the explanation is shown once, in the question.
- `spec-investigate` must look up GitRisk for the files it touches when risk is on, and say so in **Risk Hotspots** even when none are high (a live run had skipped it).

## 1.13.0 — 2026-11-11
Changes from a first-time install on a real multi-repo project.
- **Setup happens in your AI tool.** The installer now only installs the skills, then hands over with one next step: say "run spec-setup". If Claude Code or Codex is installed, it offers to open it with that already typed in. In the chat you can correct any answer as you go, which the terminal menus couldn't do. `spec-driven-dev setup` stays for scripts and CI (flags, no questions).
- **Colour per step** in the installer and `doctor` (blue for installing, magenta for handing over, green ✓, yellow notes, red problems). Plain text when piped, in CI, or with `NO_COLOR`; `FORCE_COLOR=1` turns it on.
- **A Shopify app is no longer read as a monorepo.** Workspaces that only cover `extensions/` next to `shopify.app.toml` are one app.
- **Commit style per repo** in multi-repo workspaces: a repo that writes `STP-123: …` keeps that even when the others use `feat: …`.
- **Teams on different subsets of repos:** spec-setup offers a dedicated specs repo everyone clones; `team-repos.yml` there lists every team repo with its git URL; `doctor` shows which aren't cloned (with the clone command); and spec-investigate stops and says so when a ticket needs a repo that isn't on this machine. A specs folder that is a whole repo is always shared, with only `risk.md` ignored.
- FAQ: what npm's "Unknown project config" warnings mean (a pnpm-style `.npmrc` in an npm project) and how to clear them.

## 1.12.0 — 2026-11-11
- **Setup asks whether to share specs with your team:** share everything (recommended), share project memory only, or keep everything local. It first says what your `.gitignore` does today, and with `--yes` it keeps that. It changes `.gitignore` only through one marked block, replacing only lines about the specs folder, and asks before replacing any. `risk.md` stays ignored either way. Saved as `context.share`.
- **Multi-repo:** when the workspace folder isn't a git repo, setup explains that specs kept there can't be shared and offers a specs folder inside one of the repos (`--specs-dir=<repo>/specs`).
- `spec-driven-dev settings --share=all|memory|none` (or the menu) changes it later, and so does saying "share the specs with the team" in your AI tool. `doctor` warns when `.gitignore` no longer matches the choice.

## 1.11.2 — 2026-11-11
- **Works from inside your AI tool.** Running `npx @benjaminthomas/spec-driven-dev` with no terminal to answer in (for example `!` in Claude Code) used to stop and change nothing. It now installs the skills for the AI tools it finds, in this project, and tells you to say "run spec-setup", which asks the setup questions in the chat. The settings file is still only written from your answers. Found during a first-time install.
- `spec-driven-dev setup` without a terminal now also points to "run spec-setup" in your AI tool.

## 1.11.1 — 2026-11-11
- **GitRisk keeps up with new code.** Files added in the last 90 days with fewer than 3 commits, or not committed yet, are labelled `new` instead of scoring as low risk. Each shows the riskiest file it connects to (imports or is imported by), and skills give it that file's care when it's high or critical. Uncommitted files are now scored, so fan-out on the files they import rises straight away.
- `spec-implement` re-scores after every batch commit, so later batches and reviewers see current scores, not the ones from before the feature started.
- `spec-checkpoint` adds new areas to CONTEXT.md's map and notes important new files in their area file.
- `risk.md` is now treated as a build output: the first `risk` run adds it to `.gitignore`, skills never stage it, and `doctor` flags it if it's committed. Before, re-scoring at each batch committed it every time, which means noisy diffs and merge conflicts between branches.
- `spec-checkpoint` also updates an existing area's one-line description when a feature changes what that area does.
- `risk.md` gets a **New files** section. The tool's own files (`.spec-driven.yml`, `experiments/`) are no longer scored.

## 1.11.0 — 2026-11-10
- **GitRisk: historical risk per file.** `spec-driven-dev risk` scores tracked files from git alone (no model): `Risk = 0.30 × Churn + 0.35 × Bug Density + 0.20 × Fan-out + 0.15 × Security`. Security is the share of a file's commits that were security fixes. Writes `specs/context/risk.md`. `--files=` looks up chosen files, `--json` prints everything, and weights can be overridden under `risk.weights`. `doctor` checks them.
- With `risk.enabled: on`, the skills use the scores: investigate reports **Risk Hotspots**, create raises tiers and requires tests aimed at past failures, and the batch reviewer and `spec-review` check them. With `off`, every skill ignores risk completely.
- **`spec-driven-dev risk-eval`** (needs Claude Code) runs the same tickets with risk on and off in fresh clones and compares agent behaviour: risky files read, planned and tested, tiers, and cost. Writes a report plus an append-only `experiments/LOG.md`.
- **Switch features without editing YAML:** say "turn GitRisk off/on" (or "run straight through after I approve") in your AI tool, or run `spec-driven-dev settings` for an arrow-key menu (`--risk=on|off`, `--after-approval=stop|run-through` for scripts). Only that line changes; comments are kept.
- `risk-eval` options: `--runs`, `--arms=on|off` (rerun one side), `--timeout` (minutes, default 20), `--model`. Failed runs record where they stopped.
- MCP server: reports the real package version (was always `1.0.0`) and labels YAML and JSON supporting files with their own types instead of Markdown.
- Fix: `--help` cut off after ten lines, hiding the newest commands and flags.
- Fix: a multi-repo config now applies only in its own folder and the repos it lists. Before, any repo under that folder picked it up.
- The npm package now includes `plugin/.claude-plugin`, so `risk-eval` can load the plugin.

## 1.10.0 — 2026-11-10
- **Project memory, so context survives new sessions, compaction and new features.**
  - Setup asks whether the project is new or existing (`--project=new|existing`), detected from commit and file counts and saved as `context.project`.
  - `spec-setup` audits an existing repo with cheap commands plus one round of questions, or records the intended stack for a new one, and writes `specs/CONTEXT.md` (index, ≤60 lines) and `specs/context/<area>.md` (≤150 lines each). With your consent, it adds a one-line pointer to `CLAUDE.md`/`AGENTS.md`.
  - Every spec folder gets a **Resume here** block in its README and an append-only `log.md`. Skills read Resume here first and update it before stopping.
  - Context is passed on as digests: investigation → Relevant Context → each task's Project Context. Coders never load the context files.
  - `spec-checkpoint` distils a finished feature's log into the right area file.
  - Requirements are numbered R1… and traced through tasks (`Covers`) to verification.
- New `spec-driven-dev context [--areas=a,b]` prints the memory without a model. `status` shows each spec's Resume-here next step. `doctor` checks the size limits and flags context lines pointing at files that no longer exist.
- **New `spec-review` skill** between verify and checkpoint. It reviews the whole branch against the spec's requirements, the project's conventions, and the code (correctness, security, tests), writes a ranked `review.md`, and blocks `spec-ship` and run-through on open blockers. Fixes go through `spec-implement`'s fix loop after your yes. It also reviews any branch or PR, and posts comments only with your approval. `status` shows "verified, not reviewed" and "open blockers".
- `spec-implement`'s orchestrator and `spec-checkpoint` now follow commit rules recorded in CONTEXT.md (found in a live test: batch commits had ignored a "no AI co-author trailers" rule).
- Every doc and skill now describes the full flow: investigate → create → approve → implement → verify → review → checkpoint → ship.
- Optional [graphify](https://github.com/Graphify-Labs/graphify) support (`context.graph: auto|off`): used when installed, never installed for you.

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
