# spec-driven-dev

[![npm](https://img.shields.io/npm/v/@benjaminthomas/spec-driven-dev?label=npm)](https://www.npmjs.com/package/@benjaminthomas/spec-driven-dev)
[![check](https://github.com/benjaminthomas/spec-driven-dev/actions/workflows/check.yml/badge.svg)](https://github.com/benjaminthomas/spec-driven-dev/actions/workflows/check.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**A step-by-step workflow that gets AI coding agents from "here's a ticket" to "here's a reviewed PR"
without guessing.** It first investigates the problem, then writes a plan you approve, then builds it
in parallel with tests and review, then checks the real running app, and finally commits and opens
the PR.

It's a set of eight [Agent Skills](https://agentskills.io), plain Markdown instruction files that
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
| Broken code gets committed, or a PR is pushed by accident | **`spec-checkpoint`** commits only once lint, types, tests, and build all pass. **`spec-ship`** asks before it pushes |

Each stage writes its result to a file, so you can stop at any point, hand over to a teammate, or
start a new session and continue where you left off.

---

## Quick start (5 minutes)

**1. Run the installer in your project** (for several repos, run it inside any one of them):

```bash
npx @benjaminthomas/spec-driven-dev@latest
```

This one command downloads the tool, installs the skills, and sets up the project. It asks its
questions in your terminal, so run it in a real terminal, not through another tool. If there's no
terminal to answer in, it says so and uses the detected values.

> **Why not `npm install -g`?** npm doesn't let a package ask questions while it installs, and an
> install doesn't know which project it's for. That's why setup is a separate step you run inside
> the project. If you'll use the `doctor`/`status` commands often, you can also install it
> globally: `npm install -g @benjaminthomas/spec-driven-dev`, then run `spec-driven-dev` in place of
> the `npx …` command.

It:
1. **Finds your AI tools** (Claude Code, Cursor, Codex CLI, Antigravity) and installs the skills
   into each one you choose, for this project or for all projects.
2. **Sets up your project** by detecting its layout, issue tracker, branch conventions, and
   commands, then asking you to confirm. The answers go into `.spec-driven.yml`
   ([details below](#project-setup-your-teams-rules)).

**3. In your AI tool, run each stage in order.** You can type the slash command or just say the
words in quotes.

```
/spec-investigate STP-123          "look into STP-123 before we plan it"
                                   → read specs/stp-123-…/investigation.md

/spec-create                       "turn this into a spec"
                                   → review specs/stp-123-…/  ← YOU APPROVE HERE

/spec-implement                    "implement the spec"
/spec-verify                       "does it actually work?"
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
implements, verifies, and commits in one go. It stops at the first failure, and it always asks
before pushing or opening a PR. To make this the default after approval, choose `run-through` during
setup (`pipeline.after_approval` in `.spec-driven.yml`).

That's the whole workflow. Every stage can be used on its own as well: use `/spec-create` straight
from a planning chat, or `/spec-checkpoint` on any work in progress.

---

## Project setup: your team's rules

Teams work differently. Some branch from `main`, some from `staging`. Some name branches `STP-123`,
others `fix/STP-123-short-name`. Some have one repo, others have six. None of this is built into the
skills. Each project describes its own rules in **`.spec-driven.yml`**, and every skill reads that
file before doing anything.

**How the file gets created:** `spec-driven-dev` (or `spec-driven-dev setup` to run only this
step) detects the answers from your repos and asks you to confirm them. In your AI tool you can also
say **"run spec-setup"**: that does a deeper version that also reads `CLAUDE.md`/`AGENTS.md`, CI
config, and recent PRs, and fills in what the installer can't (such as each repo's role, or commands
for stacks other than Node). If a skill finds no config, it runs this setup first.

**What `spec-driven-dev` asks, in order.** Each question is a menu: move with **↑/↓**, tick with
**Space**, and confirm with **Enter**. What it detected is pre-selected and marked *(detected)*, so you
can usually just press Enter. Repo paths are added one at a time: paste a path (quotes, `~`, and
Windows paths like `C:\work\api` all work). A path that doesn't exist or isn't a git repo is flagged
straight away, so you can fix it before moving on. Press Enter on an empty line when you're done.
**Ctrl+C** cancels without changing anything.

| Question | Detected from | Example answer |
|---|---|---|
| Which AI tools get the skills | tool folders in your home directory and commands on your `PATH` | Claude Code, Cursor |
| This project only, or all projects | (you choose) | `project` |
| Project layout | git repos and workspace files (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `go.work`, …) | `single`, `monorepo`, or `multi-repo` |
| *multi-repo:* which repos nearby belong | git repos up to two folders down, grouped by GitHub owner | `frontend` |
| *multi-repo:* repos in other places | (you type paths: absolute, `~/…`, or relative) | `~/Work/backend, /srv/database` |
| *multi-repo:* where the config lives | the repos' shared parent folder, or `~/.spec-driven/<name>/` | `~/Projects` |
| *monorepo:* package folders | the workspaces your `package.json`/`pnpm-workspace.yaml` declares, or `apps/*`, `packages/*` | `apps/web, packages/ui` |
| Issue tracker | ticket keys in branch names and commits | Jira, key `STP` |
| Base branch / PR target | default branch, `staging`/`develop` branches | `staging` |
| Branch name pattern | your recent branch names | `{ticket}` → `STP-123` |
| Commit style | your recent commit messages | `conventional` (`feat: …`) or `ticket` (`STP-123: …`) |
| Lint / typecheck / test / build / dev commands | `package.json` scripts and lockfile (per repo or package) | `pnpm run lint` |
| Where specs go | (you choose) | `specs/` |
| After you approve a spec | (you choose) | `stop` (wait at each stage) or `run-through` |
| Model and effort per task tier | written with the defaults above | edit `models:` / `effort:` later |

**Where the file lives, by layout:**

| Layout | What it means | `.spec-driven.yml` goes in | How the workflow adapts |
|---|---|---|---|
| **single** | one repo, one app | the repo root (commit it, so the team shares it) | as described below |
| **monorepo** | one repo, many apps/packages | the repo root (commit it) | tasks name their package, and checks run per package |
| **multi-repo** | several repos that change together, in any folders | their shared parent folder, or `~/.spec-driven/<name>/` (personal to your machine) | investigation searches every listed repo, tasks stay inside one repo each, and `spec-ship` opens one PR per repo, each linking the others |

**Repos in different places.** A multi-repo workspace doesn't need its repos in one folder. For
example, from inside `/Projects/frontend`:

```
✔ How is this project organised? › Multiple repos
✔ Which of these repos (found under /Projects) belong to this workspace? › frontend
? Add a repo from another folder — paste its path, or press Enter to finish (1 selected) › ~/Work/nope
  › Folder not found: /Users/you/Work/nope
? Add a repo from another folder — paste its path, or press Enter to finish (1 selected) › ~/Work/backend
  ✓ added /Users/you/Work/backend
? Add a repo from another folder — paste its path, or press Enter to finish (2 selected) › /srv/database
  ✓ added /srv/database
? Add a repo from another folder — paste its path, or press Enter to finish (3 selected) ›
✔ Folder for this workspace's settings file (.spec-driven.yml) › ~/.spec-driven/frontend-workspace
```

- **Where the config goes:** the repos' shared parent folder, or `~/.spec-driven/<name>/` when that
  parent would be your home folder or `/`.
- **How every repo finds it:** setup records the workspace in `~/.spec-driven/workspaces.json`, so
  `/Work/backend` finds its config even though the config isn't above it. The skills, `doctor`,
  and `status` all look there.
- **Paths are checked:** ones that don't exist or aren't git repos are skipped with a message, and
  setup stops if a workspace would end up with no repos.

Every question also has a flag, for scripts and CI:
`--layout=multi-repo --repos=~/Projects/frontend,~/Work/backend --workspace=~/Projects`,
`--layout=monorepo --packages=apps/web,packages/ui`, `--after-approval=run-through`,
`--tools=cursor,codex`, `--global`, `--yes` (accept everything detected), and `--version`.

To change the rules later, edit the file or run setup again, then run `spec-driven-dev doctor`
to confirm the file still matches your repos. Setup never overwrites the file without
asking. See [`config-template.yml`](plugin/skills/spec-setup/references/config-template.yml) for every field.

## How the workflow fits together

```
 ┌──────────────────┐   ┌─────────────┐   ┌──────────┐   ┌────────────────┐   ┌─────────────┐   ┌─────────────────┐   ┌───────────┐
 │ spec-investigate │ → │ spec-create │ → │ YOU      │ → │ spec-implement │ → │ spec-verify │ → │ spec-checkpoint │ → │ spec-ship │
 │ understand       │   │ plan        │   │ approve  │   │ build + test   │   │ prove       │   │ commit          │   │ open PR   │
 └──────────────────┘   └─────────────┘   └──────────┘   └────────────────┘   └─────────────┘   └─────────────────┘   └───────────┘
   investigation.md       specs/<feature>/                   code + tests,       verification-      local commit         pushed branch
   + work branch          task files                         one commit/batch    report.md                               + GitHub PR
```

- **The approval step is yours.** Nothing builds until you've read the spec and run `spec-implement`
  yourself. `spec-investigate` never moves on to the next stage by itself.
- **Each stage reads the previous stage's files.** `spec-create` uses `investigation.md` as its
  evidence, `spec-implement` works through the task files, and `spec-verify` checks against their
  acceptance criteria.
- **Stages can be skipped.** For new projects with nothing to investigate, start at `spec-create`.
  For a quick fix, use only `spec-checkpoint` and `spec-ship`.

---

## The skills, one by one

### 0. `spec-setup`: learn the project's rules

**Say:** "run spec-setup", "configure the pipeline", "change our branch rules"

**What it does:** see [Project setup](#project-setup-your-teams-rules). It writes `.spec-driven.yml` and
nothing else: no branches, commits, or code.

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

**You get:** `specs/<feature>/investigation.md`, with every finding labelled **VERIFIED**,
**INFERRED**, **ASSUMPTION**, or **UNKNOWN**.

**It won't:** write code, write tests, or start `spec-create` without being asked.

### 2. `spec-create`: turn the plan into tasks

**Say:** "create a spec", "plan this feature", "break this into tasks"

**What it does:** It reads `investigation.md` if one exists, plus your planning conversation. If
there's no conversation, it asks you a few questions first. It then splits the work into tasks,
each touching 1–5 files, and groups them into **batches**. Tasks in the same batch don't depend on
each other and don't touch the same files, so they can be built at the same time.

**You get:** a `specs/<feature>/` folder (see [What ends up in your repo](#what-ends-up-in-your-repo)).
Each task file is complete on its own: description, files to change, implementation steps, **tests
to write**, and acceptance criteria.

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
5. Commits the batch and ticks it off in the spec's README.

**It can resume:** if you stop halfway, run it again and it carries on from the first unfinished
batch. If your tool can't run agents in parallel, it does the tasks one at a time instead.

### 4. `spec-verify`: prove it works

**Say:** "verify this", "test it end to end", "does this actually work?"

**What it does:** It collects every acceptance criterion from the spec, starts your app, and checks
each one the way a user would: clicking through the UI, calling real API routes, and reading the
database only to confirm the result.

**You get:** `specs/<feature>/verification-report.md`, with pass or fail for each criterion and the
evidence (screenshots, responses, data). If there's no spec, it asks you what "working" means and
checks that instead.

### 5. `spec-checkpoint`: commit safely

**Say:** "checkpoint", "commit everything", "save my progress"

**What it does:** It runs the lint, typecheck, test, and build commands from `.spec-driven.yml` (or
finds them in `package.json`, `Makefile`, `pyproject.toml`, CI config, and so on) and fixes failures.
Then it stages everything and commits in your configured style (`feat: …` or `STP-123: …`). In a
multi-repo setup, it makes one commit in each repo that changed.

**It won't:** push. Committing is a local step.

### 6. `spec-ship`: open the PR

**Say:** "ship it", "push this", "open a PR"

**What it does:** It creates a branch using your naming pattern if you're on the default branch,
**shows you exactly what will be pushed and waits for your "yes"**, then pushes and opens a GitHub PR
against your configured PR target, with a written description. In a multi-repo setup, it opens one
PR per repo, each linking the others. If a PR already exists for the branch, it pushes the new commits to that PR
instead of opening another one.

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
    ├── README.md                 ← spec-create: batches, dependency graph, progress checkboxes
    ├── tasks/
    │   ├── task-01-fix-pagination.md
    │   ├── task-02-add-export-test-fixtures.md
    │   └── …
    └── verification-report.md    ← spec-verify: pass/fail per acceptance criterion
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
- **Pushing needs an explicit "yes".**
- **Investigation stays in scope.** Ideas that come up along the way go under "optional" or "out of
  scope" instead of being folded into the work.

---

## FAQ

**Do I need Jira?**
No. Use GitHub Issues, Linear, a transcript, a document, or a sentence of plain text. Jira is just
one of the options.

**How does it choose the base branch and branch name?**
From `.spec-driven.yml`, which setup fills in by looking at your recent branches and asking you to
confirm. To change it, edit `git.base_branch` / `git.branch_name` or run setup again.

**Should I commit `.spec-driven.yml`?**
For a single repo or monorepo, yes: the whole team then follows the same rules. A multi-repo
config sits outside any repo, so it stays on your machine.

**Does it work with my stack?**
Yes. No skill assumes a language or framework. Each one finds the repo's own commands.

**Do I have to start every stage myself?**
No. After you approve a spec, say "approved, run it through": implement, verify, and checkpoint then
run one after another, stopping at the first failure. Two steps always wait for you: approving the
spec, and pushing or opening the PR. You don't need slash commands either. Saying "investigate
STP-123" or "ship it" picks the right skill.

**Setup didn't ask me anything.**
Update to 1.5.1 or later (`npx @benjaminthomas/spec-driven-dev@latest --version`). Earlier versions
crashed on Node 14 or 16, which nvm often switches to inside older projects, and wrote a config
silently when there was no terminal. Now it runs on Node 14+. With no terminal to answer in (a `!`
command in Claude Code, an editor task, piped input), it stops, changes nothing, and tells you to run
it in a terminal window or pass flags such as `--layout=multi-repo --repos=…`.

**Setup didn't ask me about repos.**
It only asks about repos for a multi-repo or monorepo layout. If it detected `single`, type
`multi-repo` at the layout question, then add your other repos by path. If it asked nothing at all,
there was no terminal to type answers into (it prints a note saying so), so run it directly in a
terminal. Check which version ran with `npx @benjaminthomas/spec-driven-dev@latest --version`.

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
`/plugin marketplace update spec-driven-dev` and then update the plugin. Your config is never
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
spec-driven-dev setup                             # only (re)run project setup
spec-driven-dev --global                          # install skills for all projects, not just this one
spec-driven-dev --tools=cursor,codex              # pick tools without being asked
spec-driven-dev --skills=spec-create,spec-ship    # install only some skills
spec-driven-dev --yes                             # accept every detected default (CI-friendly)
spec-driven-dev doctor                            # check .spec-driven.yml against the real repos
spec-driven-dev status                            # list specs with unfinished work
spec-driven-dev --help                            # show all of the above
```

**Without installing:** replace `spec-driven-dev` with `npx @benjaminthomas/spec-driven-dev`, for
example `npx @benjaminthomas/spec-driven-dev setup`. That downloads and runs the latest version once,
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

### Claude Code (plugin, with automatic updates)

```
/plugin marketplace add https://github.com/benjaminthomas/spec-driven-dev.git
/plugin install ticket-to-pr@spec-driven-dev
```

To update, run `/plugin marketplace update spec-driven-dev`, then update the plugin from `/plugin`.

To see unfinished specs and their next step at any time, run `spec-driven-dev status`
(for example, `specs/stp-123: 3/5 tasks done → next: spec-implement`). If
you use the plugin, `spec-driven-dev` skips Claude Code so you don't get every skill twice. Run
`spec-driven-dev setup` for the project config.

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

If your tool supports MCP but not Agent Skills, `mcp-server/` serves the same eight skills as MCP
tools. It reads `plugin/skills/` directly, so there's nothing to keep in sync.

```bash
cd mcp-server && npm install
```

Point your tool's MCP config at `node /path/to/spec-driven-dev/mcp-server/server.js` (stdio).
Each skill becomes a tool that returns its instructions, and supporting files are available as
`skill://<name>/<path>` resources. Prefer native skills support where your tool has it.

---

## Compatibility

| Skill | Claude Code | Codex CLI | Cursor | Antigravity | Notes |
|---|---|---|---|---|---|
| `spec-setup` | ✅ | ✅ | ✅ | ✅ | Reads git and project files, and writes one config file |
| `spec-investigate` | ✅ | ✅ | ✅ | ✅ | Fetches tickets via whatever access the tool has (Atlassian/Linear MCP, `gh`); otherwise asks you to paste the ticket. Files and text need nothing extra |
| `spec-create` | ✅ | ✅ | ✅ | ✅ | Planning and writing files only |
| `spec-implement` | ✅ | ✅ | ✅ | ✅ | Parallel agents and worktrees where the tool supports them; otherwise one task at a time |
| `spec-verify` | ✅ | ⚠️ | ⚠️ | ⚠️ | UI checks need browser automation; API and database checks work everywhere |
| `spec-checkpoint` | ✅ | ✅ | ✅ | ✅ | Plain git plus your repo's own check commands |
| `spec-ship` | ✅ | ✅ | ✅ | ✅ | git plus the GitHub CLI (`gh`) |
| `generative-seo` | ✅ | ✅ | ✅ | ✅ | Web search and writing files |

⚠️ = works, but one step depends on a capability your tool might not have. The skill tells you and
skips that step rather than failing.

---

## By the numbers

| Skill | Stage | SKILL.md lines | Words | Supporting files |
|---|---|---:|---:|---:|
| `spec-setup` | 0 · configure | 117 | 1,068 | 1 |
| `spec-investigate` | 1 · understand | 330 | 2,794 | 1 |
| `spec-create` | 2 · plan | 166 | 1,503 | 5 |
| `spec-implement` | 3 · build | 303 | 2,458 | 3 |
| `spec-verify` | 4 · prove | 155 | 1,492 | 1 |
| `spec-checkpoint` | 5 · commit | 108 | 795 | 0 |
| `spec-ship` | 6 · PR | 220 | 1,268 | 0 |
| `generative-seo` | standalone | 255 | 2,209 | 7 |
| **Total** | | **1,654** | **13,587** | **18** |

- **8** skills: **1** setup + **6** workflow stages + **1** standalone
- **4** tools supported natively (Claude Code, Codex CLI, Cursor, Antigravity), plus an MCP fallback
- **3** layouts: single repo, monorepo, multi-repo
- **1** npm package, `@benjaminthomas/spec-driven-dev`, plus the Claude Code plugin and an MCP fallback
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
bin/cli.mjs                   the `spec-driven-dev` CLI: installer, setup menus, doctor, status
package.json                  npm package (ships bin/ and plugin/skills/)
mcp-server/                   MCP fallback server
CHANGELOG.md                  what changed in each version
scripts/check.py              consistency checks + metrics generator
scripts/test-cli.mjs          installer self-test (fake HOME, throwaway repos)
.github/workflows/check.yml   CI: consistency checks + installer self-test on every push and PR
.github/workflows/publish.yml publishes to npm when a vX.Y.Z tag is pushed
evals/                        `claude plugin eval` cases
```

- **Adding a skill:** create `skills/<name>/SKILL.md`, then add the name to the two manifests, a `.agents/skills/<name>` symlink, the `STAGES` map in
  `scripts/check.py`, and this README. `python3 scripts/check.py` lists anything you missed.
- **Before pushing:** run `python3 scripts/check.py --fix`, then `npm test` (which runs the checks
  and the installer self-test). CI (`.github/workflows/check.yml`) runs
  the same checks, the installer self-test, and a syntax check on the MCP server.
- **Evals:** `claude plugin eval . --runs 1` checks that skills trigger on their phrases and stay
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
  3. Tag the release and push the tag: `git tag v1.4.1 && git push origin v1.4.1`.
  4. Watch the **publish** run in the repo's Actions tab. When it's green, the new version is on
     npm. Claude Code plugin users get it from the marketplace once the commit is on `main`.

  `.github/workflows/publish.yml` then runs the tests and publishes to npm through
  [trusted publishing](https://docs.npmjs.com/trusted-publishers). No npm token or passkey is
  needed, and the package page shows a provenance badge linking the release to the exact commit.
  The workflow refuses to publish if the tag doesn't match `package.json`.

## License

MIT. See `LICENSE`.
