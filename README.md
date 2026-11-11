# spec-driven-dev

[![npm](https://img.shields.io/npm/v/@benjaminthomas/spec-driven-dev?label=npm)](https://www.npmjs.com/package/@benjaminthomas/spec-driven-dev)
[![check](https://github.com/benjaminthomas/spec-driven-dev/actions/workflows/check.yml/badge.svg)](https://github.com/benjaminthomas/spec-driven-dev/actions/workflows/check.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**A step-by-step workflow that gets AI coding agents from "here's a ticket" to "here's a reviewed PR"
without guessing.** It first investigates the problem, then writes a plan you approve, then builds it
in parallel with tests and review, then checks the real running app, and finally commits and opens
the PR.

It's a set of nine [Agent Skills](https://agentskills.io), plain Markdown instruction files that
AI coding tools load on demand. It works with Claude Code, Codex CLI, Cursor, and Google Antigravity,
in any language or framework, and in a single repo, a monorepo, or several repos that change
together, even when those repos live in different folders. To set it up, run
`npx @benjaminthomas/spec-driven-dev@latest` in your project.

---

## Contents

- [Why use it](#why-use-it)
- [Quick start (5 minutes)](#quick-start-5-minutes)
- [Project setup: your team's rules](#project-setup-your-teams-rules)
- [How the workflow fits together](#how-the-workflow-fits-together)
- [The skills, one by one](#the-skills-one-by-one)
- [What ends up in your repo](#what-ends-up-in-your-repo)
- [Safety rails](#safety-rails)
- [FAQ](#faq)
- [Install](#install)
- [Compatibility](#compatibility)
- [By the numbers](#by-the-numbers)
- [Working on this repo](#working-on-this-repo)
- [Changelog](CHANGELOG.md)

---

## Why use it

Asking an AI agent to "just build it" tends to fail in predictable ways:

| Problem | What this workflow does instead |
|---|---|
| The agent guesses how your system works and builds on a wrong assumption | **`spec-investigate`** reads the real code first and labels every finding as verified, inferred, assumed, or unknown |
| A big plan won't fit in the agent's context, or is too vague to act on | **`spec-create`** splits the work into small, self-contained task files, so each agent reads only its own |
| One agent working alone is slow | **`spec-implement`** runs several coder agents in parallel, each in its own copy of the repo |
| "It compiles" gets treated as "it works" | **`spec-verify`** drives the real running app and checks every acceptance criterion, with evidence |
| Problems slip through because nobody reviews the whole change | **`spec-review`** checks the finished branch against the spec, your conventions, and the code, and blocks shipping on real problems |
| The agent treats a file that broke five times like any other | **GitRisk** scores files from git history (churn, bug fixes, dependents, security fixes), so risky files get a deeper look, a higher tier and targeted tests. Switch it on or off any time |
| A new session forgets what was decided last time | **Project memory**: a small `specs/CONTEXT.md`, plus a "Resume here" block and a log in every spec, kept short so reloading them is cheap |
| Broken code gets committed, or a PR is pushed by accident | **`spec-checkpoint`** commits only once lint, types, tests, and build all pass. **`spec-ship`** asks before it pushes |

Each stage writes its result to a file, so you can stop at any point, hand over to a teammate, or
start a new session and continue where you left off.

---

## Quick start (5 minutes)

**1. Run the installer in your project** (for several repos, run it inside any one of them):

```bash
npx @benjaminthomas/spec-driven-dev@latest
```

It installs the skills into the AI tools you pick (Claude Code, Cursor, Codex CLI, Antigravity),
for this project or all your projects. Each step has its own colour so it's easy to follow. It also
works with `!` inside Claude Code: it then installs for the tools it finds.

> **Why not `npm install -g`?** You can: `npm install -g @benjaminthomas/spec-driven-dev`, then run
> `spec-driven-dev` in place of the `npx …` command. Handy if you use `doctor`/`status` often.

**2. Say "run spec-setup" in your AI tool.** Setup is a conversation, so the agent can read the code
and you can change any answer as you go. It asks how the project is organised (one repo, a monorepo,
or several repos that change together), your tracker, branches and commit style, where specs live
and whether your team shares them, then looks through the code and saves the project memory
([details below](#project-setup-your-teams-rules)). If Claude Code or Codex is installed, the
installer asks "Open Claude Code in soreto-shopify to set up your project?" (with your folder's name)
and opens it with "run spec-setup" already typed in.

**3. Then run each stage in order.** You can type the slash command or just say the
words in quotes.

```
/spec-investigate STP-123          "look into STP-123 before we plan it"
                                   → read specs/stp-123-…/investigation.md

/spec-create                       "turn this into a spec"
                                   → review specs/stp-123-…/  ← YOU APPROVE HERE

/spec-implement                    "implement the spec"
/spec-verify                       "does it actually work?"
/spec-review                       "review this"
/spec-checkpoint                   "checkpoint"
/spec-ship                         "ship it"
```

**The right model for each task.** `spec-create` rates every task **light**, **standard**, or
**deep**, based on how much it touches and how risky it is (data, security, concurrency, public
contracts, unclear requirements). `spec-implement` then runs each task on the model for its tier:

| Tier | Typical task | Claude Code | Codex CLI | Effort |
|---|---|---|---|---|
| light | copy change, config value, small UI tweak following an existing pattern | `haiku` | `gpt-6-luna` | low |
| standard | a normal feature slice: route + service + tests | `sonnet` | `gpt-6.1-sol` | medium |
| deep | migrations with backfills, auth/permissions, concurrency, cross-repo contracts | `opus` | `gpt-6.1-sol` | high |
| escalate | a deep task that still fails after a fix round | `fable` (asks first, as it may use usage credits) | (session model) | xhigh |

- **Reviews:** each batch's review runs on at least `standard`, and on the batch's highest tier.
- **Escalation:** a task that still fails after a fix round is retried one tier up. A deep task
  that still fails goes to the `escalate` model.
- **Fallback:** if a model isn't available on your plan or provider, that task runs on your current
  model and the report says so.
- **Where the defaults come from:** they were checked on 2026-11-06 against
  [Claude Code's model docs](https://code.claude.com/docs/en/model-config) (on Bedrock, Google Cloud,
  and Foundry, `sonnet`/`haiku` point to older versions),
  [Anthropic's model overview](https://platform.claude.com/docs/en/about-claude/models/overview),
  [Codex's config docs](https://developers.openai.com/codex/config-basic), and
  [Cursor's model list](https://cursor.com/help/models-and-usage/available-models). Claude Code
  uses family aliases, which always point to the newest model. Cursor's models depend on your plan,
  so it uses your current model until you fill in the models you can see in its picker.
- **Tools that run one model per session** (Cursor, Codex) don't switch silently. Before a heavier
  batch, they pause and tell you which model to switch to.
- **Changing the models:** edit the `models:` section of `.spec-driven.yml`, for example to use a
  newer model for `deep`.

**Fewer stops:** after reviewing the spec, say **"approved, run it through"**. The workflow then
implements, verifies, reviews, and commits in one go. It stops at the first failure or review
blocker, and always asks before pushing or opening a PR. To make this the default after approval,
choose `run-through` during setup (`pipeline.after_approval` in `.spec-driven.yml`).

That's the whole workflow. Every stage can be used on its own as well: use `/spec-create` straight
from a planning chat, or `/spec-checkpoint` on any work in progress.

---

## Project setup: your team's rules

Teams work differently. Some branch from `main`, some from `staging`. Some name branches `STP-123`,
others `fix/STP-123-short-name`. Some have one repo, others have six. None of this is built into the
skills. Each project describes its own rules in **`.spec-driven.yml`**, and every skill reads that
file before doing anything.

**How the file gets created:** in your AI tool, say **"run spec-setup"**. It detects what it can
(layout, tracker, branches, commit style per repo, commands, written rules in `CLAUDE.md`/`AGENTS.md`,
CI config, recent PR targets), shows you a draft marked *detected* or *guess*, and asks only about
the guesses, in one round. You can correct anything in plain words ("actually it's Jira, key STP")
before it writes the file. If any skill finds no config, it runs this setup first.

| What it asks | Detected from | Example answer |
|---|---|---|
| How the project is organised | git repos and workspace files (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `go.work`, …). A Shopify app's `extensions/` count as one app | `single`, `monorepo`, or `multi-repo` |
| *multi-repo:* which repos you work on | each repo's purpose, evidence of how it connects to this one (env vars, API calls, docs), your recent commits, and `team-repos.yml`; it recommends a selection with reasons | `soreto-shopify, reverb-backend` |
| *multi-repo:* where specs live | (you choose) | a dedicated specs repo, a code repo, or this machine only |
| Issue tracker | ticket keys in branch names and commits | Jira, key `STP` |
| Base branch / PR target | default branch, `staging`/`develop`, recent PR targets | `staging` |
| Branch name pattern | your recent branch names | `{ticket}` → `STP-123` |
| Commit style | recent commit messages, judged per repo | `ticket` (`STP-123: …`), with one repo on `conventional` |
| Commands | `package.json` scripts, lockfile, Makefile, CI | `npm run lint` |
| Share specs with the team | your `.gitignore` today | everything / project memory only / local |
| After you approve a spec | (you choose) | `stop` (wait at each stage) or `run-through` |

**Where the file lives, by layout:**

| Layout | What it means | `.spec-driven.yml` goes in | How the workflow adapts |
|---|---|---|---|
| **single** | one repo, one app | the repo root (commit it, so the team shares it) | as described below |
| **monorepo** | one repo, many apps/packages | the repo root (commit it) | tasks name their package, and checks run per package |
| **multi-repo** | several repos that change together, in any folders | their shared parent folder, or `~/.spec-driven/<name>/` (personal to your machine) | investigation searches every listed repo, tasks stay inside one repo each, and `spec-ship` opens one PR per repo, each linking the others |

**Repos in different places.** A multi-repo workspace doesn't need its repos in one folder
(`/Projects/frontend`, `~/Work/backend`, `/srv/database`). The config goes in their shared parent
folder, or `~/.spec-driven/<name>/` when that would be your home folder, and is recorded in
`~/.spec-driven/workspaces.json` so every repo finds it.

**Teams where people work on different repos.** One developer has the Shopify app and the backend,
another the dashboard and the backend. Each person's workspace lists only the repos they have, and
specs go in a place everyone has: a small dedicated specs repo is best. Its `team-repos.yml` lists
every team repo with its git URL, so setup offers them, `doctor` shows which aren't cloned yet (with
the clone command), and an investigation stops and says so when a ticket needs a repo that isn't on
this machine.

**Joining a team that's already set up.** The first person's setup moves the team's rules (tracker,
base branch, branch and commit style, per-repo commands, models, GitRisk, sharing) into **`team.yml`
in the specs repo**, which is committed with the specs. Each person's own `.spec-driven.yml` keeps only
where their repos are on that machine and personal preferences. A colleague clones the specs repo and
the code repos they work on, then says "run spec-setup": it finds the team's setup, offers **Join**, and
asks only which of the team's repos they have. No audit, no convention questions, and nothing shared
changes. From a terminal: `spec-driven-dev setup --join=../soreto-specs`. Changing a team rule is an
edit to `team.yml` and a commit, and anything set in your own file overrides it for you only (`doctor`
lists those overrides). An existing setup can be converted with `spec-driven-dev team init`.

**For scripts and CI** there's `spec-driven-dev setup` with flags (it asks nothing):
`--yes`, `--layout=multi-repo --repos=~/Projects/frontend,~/Work/backend --workspace=~/Projects`,
`--layout=monorepo --packages=apps/web,packages/ui`, `--specs-dir=<path>`, `--share=all|memory|none`,
`--after-approval=run-through`, `--project=new|existing`. Installer flags: `--tools=cursor,codex`,
`--global`, `--no-setup`, `--version`.

To change the rules later, edit the file or run setup again, then run `spec-driven-dev doctor`
to confirm the file still matches your repos. Setup never overwrites the file without
asking. See [`config-template.yml`](plugin/skills/spec-setup/references/config-template.yml) for every field.

### Project memory: so context isn't lost between sessions and features

Setup asks whether this is a **new or existing project** and detects the likely answer from the
commit and file counts. Then "run spec-setup" in your AI tool builds the project's memory:

- **Existing project:** a shallow audit using cheap commands (folder sizes, manifests, CI, busy areas
  from git log, your README/CLAUDE.md/ADRs), then one round of questions the code can't answer
  (what the product does, off-limits areas, fragile spots, where it's heading, unwritten rules).
- **New project:** it asks about the stack and conventions you want and saves them as the first
  decisions.

Everything is kept small on purpose, because loading context costs tokens:

| File | Size limit | Loaded when |
|---|---|---|
| `specs/CONTEXT.md`, the index: product, area map, top conventions, decisions | 60 lines | once per stage, only during spec work |
| `specs/context/<area>.md`, details for one area | 150 lines | only when a task touches that area |
| `specs/context/archive.md`, superseded entries | none | never by default |
| `specs/<feature>/README.md`, its **Resume here** block | ~10 lines | first thing in a new or compacted session |
| `specs/<feature>/log.md`, decisions, deviations, review findings | append-only | rarely; read in full only once, at checkpoint |

Each stage passes on a digest instead of the files: the investigation keeps 10–20 relevant lines,
and each task file gets only the 3–5 conventions it needs, so parallel coders never load the
context. When a feature is finished, `spec-checkpoint` adds its lasting lessons to the right area
file. Requirements are numbered (R1, R2…) and traced from investigation to tasks to verification.

`spec-driven-dev context` prints the index, and `spec-driven-dev context --areas=billing,api`
prints just those areas, with no model involved. `doctor` checks the size limits and flags context
lines that point to files that no longer exist. If you install
[graphify](https://github.com/Graphify-Labs/graphify), the skills use it for cheaper code
navigation. It's optional (`context.graph: off` turns it off), and nothing is installed for you.

### Sharing specs with your team

Setup asks whether to commit the specs folder, and shows what your `.gitignore` does today:

| Choice | What's committed | Good for |
|---|---|---|
| **Share everything** (recommended) | plans, investigations, reviews and project memory | teams that review plans in PRs, and handovers |
| **Share project memory only** | `specs/CONTEXT.md` and `specs/context/` | sharing what the project knows, keeping per-ticket files local |
| **Keep everything local** | nothing (`specs/` is ignored) | trying it out, or personal use |

Setup changes `.gitignore` only after you agree, edits one marked block, and replaces only lines about
the specs folder. `risk.md` is always ignored. Change your mind any time with
`spec-driven-dev settings --share=all|memory|none`, or say "share the specs with the team" in your AI
tool. `doctor` warns if `.gitignore` drifts from your choice.

**Multi-repo:** the workspace folder usually isn't a git repo, so specs kept there stay on your
machine. To share them, choose a specs folder inside the repo your team treats as home, for example
`--specs-dir=frontend/specs`.

### GitRisk: which files have a history of breaking

`spec-driven-dev risk` scores every tracked code file from git history alone, with no model and no
tokens, and writes the top files to `specs/context/risk.md`:

```
Risk = 0.30 × Churn + 0.35 × Bug Density + 0.20 × Fan-out + 0.15 × Security      (each factor 0–100)
```

| Factor | Weight | What it measures |
|---|---|---|
| Churn | 30% | how often the file changes, against the repo's 90th percentile |
| Bug Density | 35% | share of its commits that were bug fixes (`fix:` type or fix-like wording) |
| Fan-out | 20% | how many other files import it, against the repo's 90th percentile |
| Security | 15% | share of its commits that were security fixes (security, CVE, XSS, injection…) |

Tiers: critical ≥ 75, high ≥ 50, medium ≥ 25. Files added in the last 90 days with fewer than 3
commits, or not committed yet, are labelled **new** instead of being scored, because too little history isn't the same as
safe. Each new file shows the riskiest file it imports or is imported by, and inherits that file's
care when it's high or critical.

**When it updates:** setup scores the whole history once. After that it re-scores at every batch
commit in `spec-implement` and at `spec-checkpoint`. Each run takes under a second and uses no model,
so later batches see the new files and the extra fan-out they add. Lookups for the files a ticket
touches (`--files=`) always read the live history. Commits made outside the pipeline are picked up
at the next run. It doesn't hook into every commit.

`risk.md` is regenerated on every run, so the first run adds it to `.gitignore`, the way you'd ignore
a build output. Committing it would cause merge conflicts between branches. `doctor` flags it if
it's committed.

When `risk.enabled` is on, the skills use it:
- `spec-investigate` always looks up the files in the change surface, digs into high and critical
  ones (past fix commits, dependents), and lists them as **Risk Hotspots**, or says it checked and
  found none;
- `spec-create` raises those tasks one tier and requires a test aimed at each file's past failure
  pattern;
- `spec-implement`'s reviewer and `spec-review` check those tests and read the risky files line
  by line.

**Turning it on or off, no YAML needed:**
- **In your AI tool:** say "turn GitRisk off" or "turn GitRisk on". `spec-setup` changes just that
  setting and tells you what it means.
- **In a terminal:** run `spec-driven-dev settings` and pick with the arrow keys. It also switches
  run-through mode. For scripts, use `spec-driven-dev settings --risk=off`.
- **By hand:** set `risk.enabled: on` or `off` in `.spec-driven.yml`.

Off means every skill ignores risk completely.

`spec-driven-dev risk --files=a.ts,b.ts` prints scores for chosen files. The weights are a starting
hypothesis: change them under `risk.weights` in `.spec-driven.yml` once you've backtested them
against your own past bugs.

**Keep the hotspots current on every merge (GitHub Actions).** With a dedicated specs repo on GitHub:

```bash
spec-driven-dev ci --notify
```

This writes `.github/workflows/gitrisk.yml` into the specs repo, plus, with `--notify`, a small
`gitrisk-notify.yml` into each code repo on your machine. When something lands on a repo's base
branch, it pings the specs repo, which checks out every repo in `team-repos.yml` with full history,
runs `risk`, and commits the **Risk hotspots** in `CONTEXT.md` only when they changed. A date-only
change isn't committed. It also runs nightly, and on demand from the Actions tab. You add one secret,
`GITRISK_TOKEN` (read access to the code repos, write access to the specs repo), and commit the
workflow files yourself. The command prints the exact steps.

**Does it change what the agent does?** `spec-driven-dev risk-eval --tickets=tickets.md` runs each
ticket twice, in fresh clones with risk on and off, through investigate and create on the same
model. It then compares what the agent did:
- risky files read and named in the investigation;
- risky files in the plan, and whether tests were planned for them;
- task tiers;
- cost.

Results go to `experiments/` with the transcripts, and every run, including failures, is appended to
`experiments/LOG.md`. It needs Claude Code.

## How the workflow fits together

```
 ┌──────────────────┐   ┌─────────────┐   ┌──────────┐   ┌────────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   ┌───────────┐
 │ spec-investigate │ → │ spec-create │ → │ YOU      │ → │ spec-implement │ → │ spec-verify │ → │ spec-review │ → │ spec-checkpoint │ → │ spec-ship │
 │ understand       │   │ plan        │   │ approve  │   │ build + test   │   │ prove       │   │ review      │   │ commit          │   │ open PR   │
 └──────────────────┘   └─────────────┘   └──────────┘   └────────────────┘   └─────────────┘   └─────────────┘   └─────────────────┘   └───────────┘
   investigation.md       specs/<feature>/                   code + tests,       verification-     review.md         local commit         pushed branch
   + work branch          task files                         one commit/batch    report.md         (blockers stop)                        + GitHub PR
```

- **The approval step is yours.** Nothing builds until you've read the spec and run `spec-implement`
  yourself. `spec-investigate` never moves on to the next stage by itself.
- **Each stage reads the previous stage's files.** `spec-create` uses `investigation.md` as its
  evidence, `spec-implement` works through the task files, `spec-verify` checks against their
  acceptance criteria, and `spec-review` checks the whole diff against the requirements before
  anything is committed for shipping.
- **Every stage leaves a way back in.** Each one updates the spec's **Resume here** block and adds
  to its `log.md`, so a new or compacted session continues from about 10 lines, not the chat history.
- **Stages can be skipped.** For new projects with nothing to investigate, start at `spec-create`.
  For a quick fix, use only `spec-checkpoint` and `spec-ship`.

---

## The skills, one by one

### 0. `spec-setup`: learn the project's rules

**Say:** "run spec-setup", "configure the pipeline", "audit this repo", "refresh the project context"

**What it does:** see [Project setup](#project-setup-your-teams-rules). It writes `.spec-driven.yml`, then
builds the [project memory](#project-memory-so-context-isnt-lost-between-sessions-and-features): a
shallow audit and one round of questions for an existing repo, or your intended stack and conventions
for a new one, saved to `specs/CONTEXT.md`. It adds a one-line pointer to `CLAUDE.md`/`AGENTS.md`
only if you say yes. No branches, commits, or code.

### 1. `spec-investigate`: understand before planning

**Say:** "investigate STP-123", "look into this before we plan it", or `/spec-investigate <input>`

**Give it any of these:**

| Input | Example |
|---|---|
| Jira ticket | `STP-123` or `https://acme.atlassian.net/browse/STP-123` |
| GitHub issue | `#482` or `https://github.com/acme/app/issues/482` |
| Linear issue | `https://linear.app/acme/issue/ENG-91` |
| Transcript / notes / PRD / log file | `./call-transcript.txt`, `./prd.md`, `./error.log` |
| Plain text | `"Checkout times out for EU users since Tuesday's deploy"` |
| Pasted material | a Slack thread or stack trace pasted into the same message |

You can add `--context ./notes.md` to supply extra background, such as meeting notes.

**What it does:**
1. Loads the input. For tickets, that includes comments and linked issues. Free text is read
   carefully: "maybe we should add an endpoint" is recorded as a proposal, not a requirement.
2. Creates a work branch from the base branch in `.spec-driven.yml`, named by its pattern, and never
   touches existing work. In a multi-repo setup, it creates the branch only in the repos that need
   changes.
3. Traces how the system actually works, naming real files and functions. For bugs, it finds the
   root cause.
4. Sorts the work into **required / supporting / optional / out of scope**, and lists risks, security
   and performance concerns, and existing tests.

It starts from the project memory (`specs/CONTEXT.md` and only the area files the ticket touches),
treats it as a lead rather than evidence, and notes where the code contradicts it. If graphify is
installed, it uses it to map the code more cheaply.

With GitRisk on, it also looks harder at high-risk files in the change surface (their past fix
commits and dependents) and lists them as **Risk Hotspots**.

**You get:** `specs/<feature>/investigation.md`, with every finding labelled **VERIFIED**,
**INFERRED**, **ASSUMPTION**, or **UNKNOWN**, a short **Relevant Context** digest for the next
stages, and requirements numbered R1, R2… so they can be traced through to verification and review.

**It won't:** write code, write tests, or start `spec-create` without being asked.

### 2. `spec-create`: turn the plan into tasks

**Say:** "create a spec", "plan this feature", "break this into tasks"

**What it does:** It reads `investigation.md` if one exists, plus your planning conversation. If
there's no conversation, it asks you a few questions first. It then splits the work into tasks,
each touching 1–5 files, and groups them into **batches**. Tasks in the same batch don't depend on
each other and don't touch the same files, so they can be built at the same time.

**You get:** a `specs/<feature>/` folder (see [What ends up in your repo](#what-ends-up-in-your-repo)).
Each task file is complete on its own: description, files to change, implementation steps, **tests
to write**, acceptance criteria, the requirements it **covers**, and the few **project conventions**
that apply to it. Every requirement must map to a task, and the spec isn't finished until it does.
It also starts the spec's `log.md` and **Resume here** block.

With GitRisk on, a task that touches a high-risk file goes up one tier and must include a test
aimed at that file's past failures.

**Then:** read it, edit anything you disagree with, and only then run `spec-implement`.

### 3. `spec-implement`: build it, batch by batch

**Say:** "implement this feature", "run the spec", "continue implementing"

**What it does, for each batch:**
1. Starts one coder agent per task, running at the same time. Each one works in its **own git
   worktree** (a separate copy of the repo) so they can't overwrite each other's work.
2. Each coder **writes the task's tests first**, then writes code until they pass, and then runs
   lint and typecheck.
3. Merges the worktrees back. If two tasks conflict, it stops and asks you.
4. A **separate reviewer agent** runs lint, typecheck, and tests and checks every acceptance
   criterion. If anything fails, fix agents are sent in, for up to 3 rounds before it stops and
   asks you.
5. Logs decisions and deviations to `log.md`, updates **Resume here**, then commits the batch and
   ticks it off in the spec's README.

Each coder gets only its task file, which already carries the 3–5 project conventions that task
needs, so parallel coders don't each load the project memory.

**It can resume:** if you stop halfway, or the conversation gets compacted, run it again. It reads
the spec's **Resume here** block and carries on from the first unfinished batch. If your tool can't run agents in parallel, it does the tasks one at a time instead.

### 4. `spec-verify`: prove it works

**Say:** "verify this", "test it end to end", "does this actually work?"

**What it does:** It collects every acceptance criterion from the spec, starts your app, and checks
each one the way a user would: clicking through the UI, calling real API routes, and reading the
database only to confirm the result.

**You get:** `specs/<feature>/verification-report.md`, with pass or fail for each criterion and the
evidence (screenshots, responses, data), grouped by requirement number (R1…) where the spec has them. If there's no spec, it asks you what "working" means and
checks that instead.

### 5. `spec-review`: review the whole change

**Say:** "review this", "code review", "review PR #42", "is this ready to merge?"

**What it does:** It reviews the finished branch against the spec (every requirement R1… delivered,
nothing out of scope), the project's recorded conventions, and the code itself: correctness,
security, error handling, tests, and hot-path performance. It checks each finding against the code
before reporting it, and reads the diff rather than the whole repo.

With GitRisk on, high-risk files get a line-by-line read of their error paths and callers.

**You get:** `specs/<feature>/review.md`, with findings ranked blocker, should-fix, nit, or question,
each with `file:line` and a suggested fix. Blockers stop `spec-ship` and run-through. It then asks
whether to fix them, and fixes go through `spec-implement`'s fix loop only after you say yes. It also
reviews any branch or a teammate's PR, and posts PR comments only after you approve the text.

### 6. `spec-checkpoint`: commit safely

**Say:** "checkpoint", "commit everything", "save my progress"

**What it does:** It runs the lint, typecheck, test, and build commands from `.spec-driven.yml` (or
finds them in `package.json`, `Makefile`, `pyproject.toml`, CI config, and so on) and fixes failures.
Then it stages everything and commits in your configured style (`feat: …` or `STP-123: …`). In a
multi-repo setup, it makes one commit in each repo that changed.

When a spec is finished, it also adds the feature's lasting lessons (decisions and why, conventions
found, pitfalls) to the right `specs/context/<area>.md`, and shows you those changes so you can
correct them. It follows any commit rules recorded in the project memory.

**It won't:** push. Committing is a local step.

### 7. `spec-ship`: open the PR

**Say:** "ship it", "push this", "open a PR"

**What it does:** It creates a branch using your naming pattern if you're on the default branch,
**shows you exactly what will be pushed and waits for your "yes"**, then pushes and opens a GitHub PR
against your configured PR target, with a written description. In a multi-repo setup, it opens one
PR per repo, each linking the others. If a PR already exists for the branch, it pushes the new commits to that PR
instead of opening another one.

It won't open a PR while `review.md` has an open blocker, unless you accept it. Any should-fix
items are listed in the PR description.

**Needs:** the [GitHub CLI](https://cli.github.com) (`gh`), logged in.

### Bonus: `generative-seo`, a separate skill for SEO

This one isn't part of the workflow. It runs SEO and **GEO** (Generative Engine Optimization: getting
your content cited by ChatGPT, Perplexity, and Google AI Overviews) for any website codebase. It has
seven modes: `audit`, `content`, `optimize`, `competitors`, `citations`, `report`, and `social`. The
first time, it asks a few questions about your brand, domain, and framework, and remembers the
answers. See `plugin/skills/generative-seo/SKILL.md`.

---

## What ends up in your repo

```
specs/
└── stp-123-csv-export-missing-rows/
    ├── investigation.md          ← spec-investigate: what's true today, with evidence
    ├── requirements.md           ← spec-create: what we're building and why
    ├── action-required.md        ← spec-create: things only a human can do (API keys, DNS, accounts)
    ├── README.md                 ← spec-create: "Resume here", batches, dependency graph, progress checkboxes
    ├── log.md                    ← every stage: decisions, deviations, review findings (append-only)
    ├── tasks/
    │   ├── task-01-fix-pagination.md
    │   ├── task-02-add-export-test-fixtures.md
    │   └── …
    ├── verification-report.md    ← spec-verify: pass/fail per acceptance criterion
    └── review.md                 ← spec-review: ranked findings; open blockers stop spec-ship
specs/CONTEXT.md                  ← spec-setup / spec-checkpoint: project memory index (≤60 lines)
specs/context/<area>.md           ← details per area, loaded only when needed (≤150 lines)
specs/context/risk.md             ← spec-driven-dev risk: GitRisk scores (regenerate; don't edit)
experiments/                      ← spec-driven-dev risk-eval: on/off reports, transcripts, LOG.md
```

These are plain Markdown files, so you can review them in a PR, edit them, or hand them to a
teammate. If your repo gitignores `specs/`, the skills respect that.

---

## Safety rails

Built into the skills, not left to the agent's judgment:

- **You approve before anything is built.** Nothing goes from investigation to implementation by
  itself.
- **Your work is never destroyed.** No stash, reset, force-push, or branch deletion without your
  say-so. If there are uncommitted changes it doesn't recognise, it stops and asks.
- **No guessing.** Gaps are marked UNKNOWN, and missing tickets are asked for rather than made up.
- **Tests can't be cheated.** Coders may not delete, skip, or weaken a test to make it pass, and the
  reviewer checks for this.
- **Pushing needs an explicit "yes".** `spec-ship` also refuses while `review.md` has an open
  blocker, unless you accept it, and that is recorded.
- **Reviews are checked, not guessed.** `spec-review` confirms each finding against the code before
  reporting it, never edits code without your yes, and never posts PR comments without your yes on
  the exact text.
- **Context costs stay small.** Project memory has hard size limits, is loaded only for the areas a
  task touches, and is passed between stages as short digests.
- **Investigation stays in scope.** Ideas that come up along the way go under "optional" or "out of
  scope" instead of being folded into the work.

---

## FAQ

**How do I turn GitRisk off (or on)?**
Say "turn GitRisk off" in your AI tool, or run `spec-driven-dev settings` and pick from the menu.
Off means every skill ignores risk scores. Turning it on again offers to score the files if that
hasn't been done yet.

**Do I need Jira?**
No. Use GitHub Issues, Linear, a transcript, a document, or a sentence of plain text. Jira is just
one of the options.

**How does it choose the base branch and branch name?**
From `.spec-driven.yml`, which setup fills in by looking at your recent branches and asking you to
confirm. To change it, edit `git.base_branch` / `git.branch_name` or run setup again.

**Should I commit `.spec-driven.yml`?**
For a single repo or monorepo, yes: the whole team then follows the same rules. A multi-repo
config sits outside any repo, so it stays on your machine.

**Should I commit the specs?**
Setup asks. Sharing everything is recommended: teammates and reviewers see the plans and the
reasoning, and the project memory builds up for everyone. See
[Sharing specs with your team](#sharing-specs-with-your-team).

**Does it work with my stack?**
Yes. No skill assumes a language or framework. Each one finds the repo's own commands.

**Do I have to start every stage myself?**
No. After you approve a spec, say "approved, run it through": implement, verify, review, and checkpoint then
run one after another, stopping at the first failure or review blocker. Two steps always wait for you: approving the
spec, and pushing or opening the PR. You don't need slash commands either. Saying "investigate
STP-123" or "ship it" picks the right skill.

**The installer didn't ask me about my project.**
That's expected from 1.13.0: the installer only installs the skills. Project setup happens in your
AI tool: say "run spec-setup". It runs on Node 14+, and works from `!` inside Claude Code too.

**npm prints "Unknown project config" warnings.**
They come from your project's `.npmrc`, not from this package: settings such as `auto-install-peers`
or `shamefully-hoist` are for pnpm, and npm warns about them on every `npm`/`npx` command in that
folder. If the project uses npm (it has a `package-lock.json`), delete those lines. If it uses pnpm,
run `pnpm dlx @benjaminthomas/spec-driven-dev` instead.

**Setup thought my repo was a monorepo (or a single repo).**
Tell it in the chat: "this is one repo that works with reverb-backend". A Shopify app's
`extensions/` folder is treated as part of one app from 1.13.0.

**Can I skip stages?**
Yes. Every skill works on its own. `spec-verify` even works without a spec: it asks what to check.

**What if my tool can't run agents in parallel?**
`spec-implement` builds tasks one at a time instead. You get the same results, just more slowly.

**Can I stop halfway?**
Yes. Progress is saved in the spec's `README.md` checkboxes and the commit for each batch. Run
`spec-implement` again to continue.

**How do I update?**
Run `npm install -g @benjaminthomas/spec-driven-dev@latest`, then `spec-driven-dev` in your project.
Claude Code plugin users run
`/plugin marketplace update spec-driven-dev` and then update the `ticket-to-pr` plugin. Your config is never
touched by an update.

**Can I trust the npm package?**
Releases are published by this repo's GitHub Actions workflow, not from anyone's laptop, through
npm [trusted publishing](https://docs.npmjs.com/trusted-publishers). Each version's npm page shows
a provenance badge linking it to the exact commit and workflow run that built it. The package has
one small dependency (`prompts`, for the setup menus), and it contains only `bin/` and the `plugin/skills/`
folder.

**Something isn't working. Where do I start?**
Run `spec-driven-dev doctor` in your project. It checks the config against your
repos and names anything that doesn't match. If that passes, open an
[issue](https://github.com/benjaminthomas/spec-driven-dev/issues) with the doctor output and the
skill you were running.

**`spec-verify` says it skipped some UI checks.**
Your tool needs browser automation (an MCP browser server, a built-in browser tool, or an
extension) for checks that involve the UI. Checks that only touch the API or database work
everywhere.

---

## Install

### Any tool: npm (recommended)

```bash
npm install -g @benjaminthomas/spec-driven-dev    # once per machine; adds the `spec-driven-dev` command
```

Then, in a project:

```bash
spec-driven-dev                                   # detect tools, install skills, set up the project
spec-driven-dev setup --yes                       # only (re)run project setup
spec-driven-dev --global                          # install skills for all projects, not just this one
spec-driven-dev --tools=cursor,codex              # pick tools without being asked
spec-driven-dev --skills=spec-create,spec-ship    # install only some skills
spec-driven-dev --yes                             # accept every detected default (CI-friendly)
spec-driven-dev doctor                            # check .spec-driven.yml against the real repos
spec-driven-dev status                            # list unfinished specs and each one's next step
spec-driven-dev context --areas=billing           # print the project memory (index, or chosen areas)
spec-driven-dev settings                          # switch GitRisk, run-through and sharing from a menu
spec-driven-dev team init                         # share the team's rules in the specs repo (team.yml)
spec-driven-dev setup --join=../team-specs        # join a team that's already set up
spec-driven-dev ci --notify                       # GitHub Actions: refresh GitRisk hotspots on every merge
spec-driven-dev uninstall                         # remove the skills, plugin and cache (--all: settings too)
spec-driven-dev risk                              # GitRisk: score files from git history → specs/context/risk.md
spec-driven-dev risk-eval --tickets=tickets.md    # compare agent behaviour with the risk signal on vs off
                                                  #   (--runs=3 --arms=on --timeout=20 --model=sonnet)
spec-driven-dev --help                            # show all of the above
```

**Without installing:** replace `spec-driven-dev` with `npx @benjaminthomas/spec-driven-dev`, for
example `npx @benjaminthomas/spec-driven-dev doctor`. That downloads and runs the latest version once,
which is handy in CI or on a machine you won't use again.

`doctor` checks that every branch, folder, and `npm run` script named in the config exists, and
that each value is one the skills understand. It exits 1 if anything is wrong, so you can run it in
CI. `status` prints nothing when all specs are finished.

**Updating:** run `npm install -g @benjaminthomas/spec-driven-dev@latest` to get the newest CLI,
then `spec-driven-dev` in each project to refresh its skills. This replaces the installed skill
folders and leaves your `.spec-driven.yml` alone. If you use `npx`, add `@latest`, because `npx`
can otherwise reuse an older copy it cached. What changed in each version is in
[CHANGELOG.md](CHANGELOG.md).

`npx github:benjaminthomas/spec-driven-dev` installs straight from GitHub instead, for example to
try an unreleased commit on `main`.

**Requirements:** Node.js 14 or newer and git, on macOS, Linux, or Windows (PowerShell or cmd). The
installer has one small dependency, [`prompts`](https://www.npmjs.com/package/prompts), for its menus.
CI tests it on Node 14, 16, 18, 20, 22, and 24, and on Windows and macOS.

### Claude Code (plugin `ticket-to-pr`, with automatic updates)

```
/plugin marketplace add https://github.com/benjaminthomas/spec-driven-dev.git
/plugin install ticket-to-pr@spec-driven-dev
```

To update, run `/plugin marketplace update spec-driven-dev`, then update the plugin from `/plugin`.

Installed it before 1.9.0? The plugin was called `spec-driven-dev` then. Uninstall that one and
install `ticket-to-pr@spec-driven-dev`; the old name no longer gets updates.

To see unfinished specs and their next step at any time, run `spec-driven-dev status`
(for example, `specs/stp-123: 3/5 tasks done → next: spec-implement`). If
you use the plugin, `spec-driven-dev` skips Claude Code so you don't get every skill twice. Then say
"run spec-setup" in Claude Code for the project config.

### By hand

Copy the `plugin/skills/<name>/` folders you want. Each one is self-contained. Where each tool looks for
skills:

| Tool | This project | All projects |
|---|---|---|
| Claude Code | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` |
| Codex CLI | `.agents/skills/<name>/` | `~/.agents/skills/<name>/` |
| Cursor | `.cursor/skills/<name>/` (also reads `.agents/skills/`) | `~/.cursor/skills/<name>/` |
| Antigravity | `.agents/skills/<name>/` | `~/.gemini/config/skills/<name>/` |

Codex CLI and Antigravity share the project path, so installing for one covers both.

### Fallback: MCP server (for tools without Agent Skills support)

If your tool supports MCP but not Agent Skills, `mcp-server/` serves the same nine skills as MCP
tools. It reads `plugin/skills/` directly, so there's nothing to keep in sync.

```bash
cd mcp-server && npm install
```

Point your tool's MCP config at `node /path/to/spec-driven-dev/mcp-server/server.js` (stdio).
Each skill becomes a tool that returns its instructions, and supporting files are available as
`skill://<name>/<path>` resources. Prefer native skills support where your tool has it.

---

### Uninstall

```bash
npx @benjaminthomas/spec-driven-dev@latest uninstall
```

It lists everything an install put on your machine (the skills in each AI tool, the Claude Code
plugin, the npx download cache), then removes it after one confirmation. Your other skills stay.

- **Kept by default:** your `.spec-driven.yml` settings file. Add `--all` to remove it and the
  workspace registry (`~/.spec-driven/`) too.
- **Never touched:** specs, `CONTEXT.md`, `team-repos.yml` and your code. They're your team's work.
  Delete them yourself if you want them gone.
- **In scripts or with `!` in Claude Code:** add `--yes`, since there's no terminal to confirm in.
- **Plugin installs:** `/plugin uninstall ticket-to-pr@spec-driven-dev` in Claude Code, if the
  command can't do it for you.

## Compatibility

| Skill | Claude Code | Codex CLI | Cursor | Antigravity | Notes |
|---|---|---|---|---|---|
| `spec-setup` | ✅ | ✅ | ✅ | ✅ | Reads git and project files, and writes one config file |
| `spec-investigate` | ✅ | ✅ | ✅ | ✅ | Fetches tickets via whatever access the tool has (Atlassian/Linear MCP, `gh`); otherwise asks you to paste the ticket. Files and text need nothing extra |
| `spec-create` | ✅ | ✅ | ✅ | ✅ | Planning and writing files only |
| `spec-implement` | ✅ | ✅ | ✅ | ✅ | Parallel agents and worktrees where the tool supports them; otherwise one task at a time |
| `spec-verify` | ✅ | ⚠️ | ⚠️ | ⚠️ | UI checks need browser automation; API and database checks work everywhere |
| `spec-review` | ✅ | ✅ | ✅ | ✅ | git diff, or `gh` for pull requests |
| `spec-checkpoint` | ✅ | ✅ | ✅ | ✅ | Plain git plus your repo's own check commands |
| `spec-ship` | ✅ | ✅ | ✅ | ✅ | git plus the GitHub CLI (`gh`) |
| `generative-seo` | ✅ | ✅ | ✅ | ✅ | Web search and writing files |

⚠️ = works, but one step depends on a capability your tool might not have. The skill tells you and
skips that step rather than failing.

---

## By the numbers

| Skill | Stage | SKILL.md lines | Words | Supporting files |
|---|---|---:|---:|---:|
| `spec-setup` | 0 · configure | 308 | 3,393 | 4 |
| `spec-investigate` | 1 · understand | 387 | 3,391 | 1 |
| `spec-create` | 2 · plan | 198 | 1,806 | 6 |
| `spec-implement` | 3 · build | 327 | 2,777 | 3 |
| `spec-verify` | 4 · prove | 163 | 1,581 | 1 |
| `spec-review` | 5 · review | 137 | 1,318 | 1 |
| `spec-checkpoint` | 6 · commit | 140 | 1,168 | 0 |
| `spec-ship` | 7 · PR | 230 | 1,412 | 0 |
| `generative-seo` | standalone | 255 | 2,209 | 7 |
| **Total** | | **2,145** | **19,055** | **23** |

- **8** skills: **1** setup + **6** workflow stages + **1** standalone
- **4** tools supported natively (Claude Code, Codex CLI, Cursor, Antigravity), plus an MCP fallback
- **3** layouts: single repo, monorepo, multi-repo
- **1** npm package, `@benjaminthomas/spec-driven-dev`, plus the Claude Code plugin `ticket-to-pr` and an MCP fallback
- **0** stack assumptions: lint, typecheck, test, build, and dev commands come from your repo

_The table is generated by `python3 scripts/check.py --fix`; CI fails if it goes out of date._

---

## Working on this repo

```
plugin/skills/<name>/SKILL.md the skill itself (frontmatter: name, description, license)
plugin/skills/<name>/references/ templates and prompts the skill loads when needed
.claude-plugin/               Claude Code marketplace manifest
plugin/                       the Claude Code plugin (manifest + skills only, no scripts or hooks)
.agents/skills/               symlinks so Codex/Antigravity pick the skills up inside this repo
bin/spec-driven-dev.cjs       launcher (runs on any Node, explains if it's too old)
bin/cli.mjs                   the `spec-driven-dev` CLI: installer, setup menus, doctor, status, context, risk
bin/risk.mjs                  GitRisk scoring (churn, bug density, fan-out, security)
bin/risk-eval.mjs             risk on/off experiment harness
bin/share.mjs                 what's committed from the specs folder (.gitignore block)
package.json                  npm package (ships bin/ and plugin/skills/)
mcp-server/                   MCP fallback server
CHANGELOG.md                  what changed in each version
scripts/check.py              consistency checks + metrics generator
scripts/test-cli.mjs          installer self-test (fake HOME, throwaway repos)
.github/workflows/check.yml   CI: consistency checks + installer self-test on every push and PR
.github/workflows/publish.yml publishes to npm when a vX.Y.Z tag is pushed
plugin/evals/                 `claude plugin eval` cases
```

- **Adding a skill:** create `plugin/skills/<name>/SKILL.md`, then add the name to the two manifests, a `.agents/skills/<name>` symlink, the `STAGES` map in
  `scripts/check.py`, and this README. `python3 scripts/check.py` lists anything you missed.
- **Before pushing:** run `python3 scripts/check.py --fix`, then `npm test` (which runs the checks
  and the installer self-test). CI (`.github/workflows/check.yml`) runs
  the same checks, the installer self-test, and a syntax check on the MCP server.
- **Evals:** `claude plugin eval plugin --runs 1` checks that skills trigger on their phrases and stay
  within their own stage. These runs use your Claude credentials, so they aren't part of CI.
- **Skill rules** (from [Anthropic's skill authoring guide](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices),
  enforced by `scripts/check.py`):
  - Names are lowercase with hyphens.
  - Descriptions are 1,024 characters or fewer, in the third person, and say both what the skill
    does and when to use it.
  - `SKILL.md` stays under 500 lines, with detail in `references/` one link deep.
  - Facts are read from the repo, not assumed.
- **Releasing:**
  1. Increase `version` in both `package.json` and `plugin/.claude-plugin/plugin.json` (the check fails if
     they differ).
  2. Add a `CHANGELOG.md` entry, then commit and push.
  3. Tag the release and push the tag: `git tag v1.16.1 && git push origin v1.16.1`.
  4. Watch the **publish** run in the repo's Actions tab. When it's green, the new version is on
     npm. Claude Code plugin users get it from the marketplace once the commit is on `main`.

  `.github/workflows/publish.yml` then runs the tests and publishes to npm through
  [trusted publishing](https://docs.npmjs.com/trusted-publishers). No npm token or passkey is
  needed, and the package page shows a provenance badge linking the release to the exact commit.
  The workflow refuses to publish if the tag doesn't match `package.json`.

## License

MIT. See `LICENSE`.
