---
name: spec-review
description: >
  Review the whole change before it ships: checks the branch diff against the spec (every
  requirement R1… delivered, nothing out of scope), the project's recorded conventions and
  off-limits areas, and the code itself (correctness, security, error handling, tests,
  performance). Writes a ranked review.md with file:line evidence and blocks spec-ship on
  blockers. Use after spec-verify, when the user says "review this", "code review", "review the
  branch", "review PR #42", "is this ready to merge", or "/spec-review". Also works with no spec
  folder, on any branch, diff, or pull request, including a teammate's. Reports findings and offers
  fixes; it changes code only after the user says yes, through spec-implement's fix loop.
license: MIT
---

# Review the change

`spec-implement` reviews each batch as it's built. This skill reviews the **finished whole**, the
way a careful human reviewer would before merge: does it do what was asked, does it follow how this
project works, and is the code sound? Every finding is checked against the code before it's
reported. A short list of real problems beats a long list of guesses.

```
investigate → create → approve → implement → verify → review → checkpoint → ship
```

## Project config (read first)

Load `.spec-driven.yml`: walk up from the current directory to the home folder, and the first one
found wins (a `multi-repo` config only applies inside the repos it lists). If none is found, check
`~/.spec-driven/workspaces.json`, which maps each multi-repo config to its repo paths. Use the config
whose repos contain the current directory. Its values beat anything you would detect or assume. This
skill uses `git` (base branch, PR target), `commands` (lint/typecheck/test), `models`/`effort`,
`layout`/`repos`, and `specs_dir`.

**Multi-repo:** review each listed repo that has changes on this branch, and write one review.md
covering all of them. **No config?** Work from the repo itself and say what you assumed.

## Step 1: Work out what to review

| The user gave | Diff to review | Spec |
|---|---|---|
| nothing, on a spec's branch | `git diff <merge-base with pr_target>...HEAD`, plus uncommitted changes | `{specs_dir}/{feature}/` matched by branch or ticket |
| a PR number or URL | `gh pr diff <n>` and `gh pr view <n>` | the PR's linked spec, if any |
| a branch, commit range, or paths | that diff | none, unless one matches |

No spec? Review against the PR or commit description and the code alone, and say so in the report.

## Step 2: Load only what the review needs

Keep it cheap, because the diff is the expensive part:

1. The README's **Resume here** block, `requirements.md` (requirements R1… and Coverage), and the
   investigation's **Relevant Context**. Without a spec, read `{specs_dir}/CONTEXT.md` and only the
   `context/<area>.md` files the diff touches. Never the archive.
2. `git diff --stat` first, then the diff itself. Open a full file only around a suspected finding,
   to confirm it.
3. **Optional graph.** If `context.graph` isn't `off` and graphify is available, use
   `graphify query "callers of <changed function>" --budget 1000` to find callers the diff didn't
   update. Treat INFERRED edges as hints to check.

**Model.** Review on at least the `standard` tier (`models.<tool>.standard`), and on `deep` when the
spec's hardest task is deep or the diff touches auth, payments, personal data, or migrations. A
review on a weaker model than the code was written with misses things.

## Step 3: Review in four passes

1. **Against the spec.** For each requirement R1…, point to the code that delivers it, or report it
   as missing. Flag changes no task asked for (scope creep) and task-listed files that weren't
   touched. Non-goals that got built count as findings.
2. **Against the project's memory.** Conventions, off-limits areas, and pitfalls from Step 2. A
   broken recorded convention is a finding. Quote the convention and its source. Check the
   **commits** too, not just the diff: `git log --format='%h %an <%ae>%n%B' <base>..HEAD` against
   any recorded rule on commit format, authorship, or trailers.
3. **The code.** Correctness (logic, edge cases, error paths, races), security (injection, authz,
   secrets, unsafe input), data safety (migrations, deletes, irreversible writes), tests (behaviour
   without a test, tests weakened, skipped or deleted), and performance on hot paths only.
   **Risk.** When `risk.enabled` is on and `{specs_dir}/context/risk.md` exists, look up the changed
   files (`spec-driven-dev risk --files=…`). Give **high** and **critical** files a line-by-line read
   of their error paths and callers, check that the tests target their past failure patterns, and
   put the score in any finding on them. When risk is `off`, skip this and don't mention it.
4. **Run the checks.**4. **Run the checks.** Run `commands.lint`, `typecheck`, and `test` once if verify didn't just run
   them on this exact commit. A failing check is a blocker.

**Verify every finding before reporting it.** Re-read the code around it and ask "what concrete
input or state makes this go wrong?" If you can't name one, drop it or mark it a question. Don't
report style the linter would catch, or personal taste.

## Step 4: Write the report

Write `{specs_dir}/{feature}/review.md` using `references/report-template.md`. With no spec, write
`review.md` in the current directory only if the user wants a file; otherwise report in chat.

| Severity | Meaning | Effect |
|---|---|---|
| **blocker** | wrong behaviour, a missing requirement, a security or data-loss risk, a failing check | `spec-ship` and run-through stop |
| **should-fix** | a real problem that's safe to ship but shouldn't stay: a missing test, a broken convention, fragile code | listed in the PR |
| **nit** | small and optional | listed once, never blocks |
| **question** | needs the author's intent to judge | asked, never blocks |

Then append one line to `log.md` (counts per severity) and overwrite the README's **Resume here**:
`Stage: reviewed (B blockers, S should-fix)`, `Next: fix blockers` or `Next: spec-checkpoint`.

## Step 5: Offer fixes (only on a yes)

Tell the user the result:

```
Reviewed {feature}: {B} blockers · {S} should-fix · {N} nits · {Q} questions → specs/{feature}/review.md
Fix the blockers and should-fix items now? (y / pick numbers / n)
```

- **On a yes,** hand the chosen findings to `spec-implement`'s fix loop: grouped by task, one
  fix agent each, tests run, then review again. Log each fix. After the fixes, re-review only the
  changed lines and update review.md.
- **On a no,** stop. Blockers stay open, and `spec-ship` will refuse to open a PR until they're
  fixed or the user explicitly accepts each one, which is recorded in review.md.
- **Someone else's PR:** never push to their branch. Offer to post the findings as PR review
  comments (`gh pr review`), and do it only after the user says yes and has seen the text.

## Run-through

In run-through mode (see `spec-implement`), this runs after verify passes. **Any blocker stops the
run-through** at this stage with the report. should-fix items don't stop it, but they are listed in
the final summary. Fixes still need a yes.

## Boundaries

- Reports and asks. Never edits code, commits, or pushes on its own.
- Writing `review.md`, the log line, and **Resume here** is part of the review, not a code change.
  Do it even when the user says "don't change anything". Without the file, `spec-ship` can't see
  the result. Skip it only if the user explicitly says not to write files, and then say the result
  won't gate shipping.
- Never posts to a PR, issue, or chat without the user's yes on the exact text.
- Never weakens a finding to get a pass, and never re-labels a blocker to unblock shipping. Only the
  user can accept a blocker.
