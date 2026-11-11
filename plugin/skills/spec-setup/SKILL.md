---
name: spec-setup
description: >
  One-time discovery that teaches the spec-driven-dev pipeline how THIS project works, and saves
  the answers to .spec-driven.yml — project layout (single repo, monorepo, or multiple repos),
  issue tracker, base branch, PR target, branch naming, commit style, and the lint/typecheck/test/
  build/dev commands. It also builds the project's memory: for an existing repo a shallow audit
  plus one round of questions, for a new one the intended stack and conventions, saved to a small
  specs/CONTEXT.md that later skills load cheaply. Use when the user says "set up spec-driven",
  "configure the pipeline", "spec-setup", "audit this repo", "refresh the project context",
  "change our branch rules", "turn GitRisk on/off", "turn on run-through", or when any other spec-* skill finds no .spec-driven.yml or no
  CONTEXT.md. Detects everything it can first and only asks about what is ambiguous. Writes config
  and context files only — never changes code, branches, or commits.
license: MIT
---

# spec-setup

Learn this project's rules and context once, save them, and let every other `spec-*` skill reuse
them. This is **the** setup: the npm installer only copies the skills and then sends people here, so
treat it as their first conversation with the workflow. Explain each question in a line, and let
them change any earlier answer at any point ("actually it's Jira") before you write anything. Team rules live in a config file the team can review and change — never in the skills
themselves. What the project *knows* (areas, conventions, decisions) lives in
`{specs_dir}/CONTEXT.md`, kept small so loading it is cheap.

## Where the config lives

`.spec-driven.yml`, found by walking up from the current directory (stop at the home folder). The
first one found wins.

| Layout | Put the file in | Share it? |
|---|---|---|
| `single` | the repo root | Commit it — the whole team gets the same rules |
| `monorepo` | the repo root | Commit it |
| `multi-repo` | the shared parent folder of the repos (usually not itself a git repo) | Personal by default; offer to also commit a copy into the repo the team treats as "home" |

A multi-repo config only applies inside the repos it lists. If the current repo sits under that
folder but isn't listed, treat it as having no config (ask whether to add it).

## Step 1 — Detect before asking

Read, don't guess. Collect a draft of every field in `references/config-template.yml`:

1. **Layout.**
   - Inside a git repo with workspace markers (`pnpm-workspace.yaml`, `workspaces` in
     `package.json`, `turbo.json`, `nx.json`, `lerna.json`, `go.work`, `[workspace]` in
     `Cargo.toml`, several `apps/*`/`packages/*`/`services/*` with their own manifests) →
     `monorepo`; list the packages.
   - **Not a monorepo:** a Shopify app (`shopify.app*.toml` at the root) whose workspaces only cover
     `extensions/`. Those are parts of one app deployed together, so it's `single` (or one repo of a
     multi-repo workspace). The same goes for any repo whose "packages" are plug-ins of one app.
   - **Ask when one repo works with others.** Even inside a single repo, ask once: "Does this repo
     change together with other repos (for example a backend)?" A yes means `multi-repo`.
   - Not inside a git repo, but sibling folders are git repos → candidate `multi-repo`.
   - **Choosing the repos is a required question for `multi-repo`, never a detection.** Someone new
     doesn't know what `soreto-melissa` is, so never show bare folder names. Follow
     `references/repo-picker.md`: say what each candidate repo is, show evidence of how it connects
     to the current repo, note whether the user commits to it, and recommend a selection with a
     reason per repo. Ask once, and don't write the config until they've answered. Always also
     offer repos in **other folders** (e.g. `~/clients/billing`). Check each path is a git repo,
     and store paths inside the workspace as relative and paths outside it as absolute.
   - The repos of one workspace can live in unrelated places (`/Projects/frontend`,
     `~/Work/backend`, `/srv/database`). Put the config in their shared parent folder, or in
     `~/.spec-driven/<name>/` when that parent would be the home folder or `/`. Then record it in
     `~/.spec-driven/workspaces.json` (`{"<config path>": ["<repo path>", …]}`) so every repo can
     find it.
   - The user can override the detected layout. If they choose `multi-repo` from inside one repo,
     the workspace folder defaults to that repo's parent, with the current repo pre-selected. If
     they choose `monorepo`, ask for the package folders. Never write a `multi-repo` config with
     no repos.
   - Otherwise → `single`.
2. **Existing written rules.** `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, PR templates,
   `.github/workflows`. Anything stated there is a strong default — quote it back to the user.
3. **Tracker.** Ticket keys in recent branch names and commit subjects (`STP-123`, `#45`,
   `ENG-91`), Jira/Linear links in PR templates or docs, whether GitHub Issues are enabled
   (`gh repo view --json hasIssuesEnabled`).
4. **Git, per repo.** Default branch (`git symbolic-ref refs/remotes/origin/HEAD` or
   `gh repo view --json defaultBranchRef`); integration branches (`staging`, `develop`,
   `pre-prod`); which branch recent PRs targeted (`gh pr list --state merged --limit 20 --json
   baseRefName`); the pattern of the last ~20 remote branch names; the commit style from
   `git log -30 --format=%s`. Judge commit style **per repo**: when one repo writes `STP-123: …` and
   the others write `feat: …`, keep the majority at the top level and give that repo its own
   `git.commit_style`.
5. **Commands, per repo/package.** `package.json` scripts plus the lockfile's package manager,
   `Makefile`, `pyproject.toml`/`tox.ini`, `Cargo.toml`, `go.mod`, `composer.json`, CI workflow
   steps (CI is often the most truthful source). Dev URL from the dev script, `.env.example`, or
   framework defaults.

6. **Models per tier.** Write the `models:` block from the template. Ask which models the user
   has for each tool they installed, only if they want to tune it: the Claude defaults (haiku /
   sonnet / opus) work as-is, and `default` is safe for the rest.
7. **After approval.** Ask whether an approved spec should stop after each stage (`stop`), or
   run implement → verify → review → checkpoint in one go (`run-through`), stopping at any failure and never
   pushing. Store it as `pipeline.after_approval`.
8. **New or existing project.** Detect it (commit and file counts) and confirm in one line. Store
   it as `context.project`. This decides what Step 4 does.
9. **Where specs live (multi-repo).** One specs folder serves the whole workspace: each ticket gets
   one folder there even when it changes several repos; code, branches and PRs stay in each repo.
   Offer, in this order, with the reason for each:
   - **A dedicated specs repo (recommended for teams where developers work on different subsets of
     repos):** everyone clones it, whatever code repos they have. Use an existing one (path or git
     URL; offer the `git clone` command) or create one: only after a yes, `mkdir` it next to the
     repos and `git init`. Never create a remote repo; say how to push it (`gh repo create`).
     Then set `specs_dir: <specs-repo>` (its root holds `CONTEXT.md`, `context/` and feature folders).
   - **Inside one code repo** (`<repo>/specs`): fine when every developer has that repo.
   - **The workspace folder:** on this machine only, since it isn't a git repo.
10. **The team's repo list.** Keep `{specs_dir}/team-repos.yml` (see `references/config-template.yml`)
   listing every repo the team works across with its git URL and a one-line role. Each developer's
   own `.spec-driven.yml` lists only the repos they have. When the file exists, offer its repos
   instead of making people remember them, and for any not cloned here show
   `git clone <url> <workspace>/<name>`. When someone adds a repo, add it to the file too.
11. **Sharing with the team.** Find out what git does with the specs folder today:
   `git check-ignore -v {specs_dir}/CONTEXT.md` and `git check-ignore -v {specs_dir}/x/README.md`.
   Then ask once, saying what's true now (e.g. "your .gitignore ignores `specs/`, so nothing is
   shared today"):
   - **Share everything (recommended):** commit plans, investigations, reviews and project memory,
     so teammates and PR reviewers see the reasoning and the memory grows for everyone.
   - **Share project memory only:** commit `CONTEXT.md` and `context/`; feature files stay local.
   - **Keep everything local:** ignore the specs folder.

   **Multi-repo:** if the config folder isn't a git repo, specs kept there can't be shared. Say so
   and offer `specs_dir: <repo>/specs` inside the repo the team treats as home.
   Store the answer as `context.share`. A dedicated specs repo is shared by nature: set
   `context.share: all`.

## How to ask

- **Real choices** (layout, keep these repos, sharing, after-approval mode) can be a menu, but only
  with **two or more** options. A menu with one option is rejected by the tool and the user never
  sees the question. "Other" doesn't count as an option.
- **Open questions** (what the product does, fragile spots, direction, unwritten rules, anything
  else to add) are plain text in **one chat message**. The user answers in their own words or says
  "skip". Never turn an open question into a menu.

## Step 2 — Confirm in one round

Show the draft as a short table grouped by layout, tracker, git, commands, and specs location.
Mark each value **detected** (with where it came from) or **guess**. Then ask only about guesses
and conflicts — in one message, not a drip of questions. Typical ones:

- "Your repos default to `master`, but recent PRs targeted `staging`. Cut work from `staging`?"
- "Recent branches are bare ticket IDs (`STP-282`). Keep that, or use `fix/STP-282-short-slug`?"
- "These 6 repos share the `acme` GitHub org. Do they form one workspace for the pipeline?"
- "Where should specs live — this folder's `specs/`, or inside one repo so they go through PRs?"

If the user says "just use the defaults", accept the detected values and the template defaults
for the rest.

## Step 3 — Write and report

1. Write `.spec-driven.yml` using `references/config-template.yml` as the shape. Keep its
   comments; drop fields that don't apply (e.g. `repos:` for `single`). Per-repo values only go
   under `repos:` where they differ from the top level.
2. If it's inside a repo, tell the user it's meant to be committed (so teammates get the same
   rules) — don't commit it yourself.
3. If `npx` is available, run `npx -y @benjaminthomas/spec-driven-dev doctor` from the config's folder. It checks
   that every branch, folder, and `npm run` script in the file really exists. Fix anything it
   reports before finishing.
4. Report: the file path, a one-line summary per section, and "re-run spec-setup any time these
   change".

## Step 4 — Project context

Skip if `{specs_dir}/CONTEXT.md` already exists (offer a refresh instead, see `references/audit.md`).

1. Read `references/audit.md` and follow it: a shallow audit for an existing project, or the
   intended stack and conventions for a new one. One round of questions, no more.
2. Write `{specs_dir}/CONTEXT.md` (and any area files) using `references/context-template.md`.
   Keep the index to 60 lines and area files to 150.
3. **Apply the sharing choice.** Show the exact `.gitignore` lines that will be replaced or added,
   and change it only after a yes, by running `spec-driven-dev settings --share=<all|memory|none>`
   (it manages one marked block and only replaces lines about the specs folder). Never rewrite
   other `.gitignore` lines.
4. **Risk scores.** For an existing project, run `spec-driven-dev risk` (or
   `npx -y @benjaminthomas/spec-driven-dev risk`) to write `{specs_dir}/context/risk.md`. It uses
   git only, no model, and adds `risk.md` to `.gitignore` because it's regenerated on every run. Skip it for a new project with no history. Mention the hotspot count in the
   report. Set `risk.enabled: off` only if the user doesn't want it.
5. **Offer, don't do:** ask whether to add this one line to `CLAUDE.md` / `AGENTS.md` (whichever
   the project uses), so hosts reload the pointer after compaction and in every new session:
   `For spec work, read specs/CONTEXT.md first, then the "Resume here" block of any unfinished spec.`
   Add it only on a yes.
6. Re-run `npx -y @benjaminthomas/spec-driven-dev doctor` if available. It checks the size limits
   and flags context lines that point to files which no longer exist.

## After setup

Finish with **one** next step, not a list: "Setup's done. Say *investigate STP-123* to start your
first ticket." If anything was left out (a tracker URL, a repo not cloned), name it in one line.

## Quick switches (plain words, no YAML)

When the user asks to switch a feature on or off, change only that one line of `.spec-driven.yml`,
keep every other line and comment, and confirm in one sentence. Don't re-run discovery.

| They say | Set |
|---|---|
| "turn GitRisk off", "stop using risk scores", "ignore risky files" | `risk.enabled: off` |
| "turn GitRisk on", "use the risk scores" | `risk.enabled: on`, then run `spec-driven-dev risk` if `{specs_dir}/context/risk.md` doesn't exist yet |
| "run straight through after I approve", "fewer stops" | `pipeline.after_approval: run-through` |
| "stop after each stage" | `pipeline.after_approval: stop` |
| "add reverb-react to the workspace", "I also work on X" | add it under `repos:` (clone first if needed, from `team-repos.yml`), and to `team-repos.yml` if it's new to the team |
| "share the specs with the team", "keep specs local", "share only the project memory" | `context.share: all / none / memory`: show the `.gitignore` change, then run `spec-driven-dev settings --share=…` on a yes |

Reply with what changed and what it means, for example: "GitRisk is now off. Investigations, plans
and reviews will ignore risk scores until you turn it back on." People who prefer a menu can run
`spec-driven-dev settings` in a terminal.

## Updating

Re-running `spec-setup` with an existing config: load it, re-detect, and show only what changed or
looks stale (a branch that no longer exists, a script that was renamed). Never silently overwrite
a value the user set by hand.

## Boundaries

- Writes `.spec-driven.yml`, `{specs_dir}/CONTEXT.md` and `{specs_dir}/context/*.md`, plus the
  one-line pointer in `CLAUDE.md` / `AGENTS.md` only if the user says yes. No branches, commits,
  pushes, installs, or code. Never installs graphify or anything else.
- Never put secrets, tokens, or credentials in the config or context files. Ask before saving
  sensitive business details.
- A value in the config beats a detected value. If the config looks wrong mid-run (a base
  branch that doesn't exist), the other skills stop and point back here rather than overriding it.
