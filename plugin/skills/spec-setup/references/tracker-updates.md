# Tracker updates (status and comments)

When a tracker tool is connected (a Jira/Atlassian, GitHub or Linear MCP server, or the `gh`, `acli`
or `jira` CLI), the pipeline keeps the ticket in step with the work, so the team can see in the
tracker that it was investigated, verified and reviewed. Every pipeline skill follows these rules.

## Settings (`tracker.updates` in team.yml or .spec-driven.yml)

```yaml
tracker:
  updates: ask        # ask (default) | on | off
  statuses:           # this project's real status names; leave a stage out to never move it
    start: In Progress     # when implementation starts
    review: In Review      # when the PR is open
```

- `off`: never write to the tracker. `ask`: confirm the first write for each ticket, then go on
  for the rest of that ticket. `on`: write without asking.
- Never post anything when there's no ticket (no tracker, or the work started from a doc or a
  description).

## Statuses: read, never guess

Workflows differ in every team. The first time a move is needed and `tracker.statuses` is unset,
read the ticket's real transitions (Jira: `getTransitionsForJiraIssue`; Linear: the team's states;
GitHub: labels or a Projects status field, if the team uses one), propose a mapping for `start`
and `review`, and save it to `team.yml` (shared) on a yes. Move a ticket only along a transition
it offers right now. Never move it backwards, never close it or mark it Done (that's for
people, after merge), and never move a ticket assigned to someone else without asking.

## When to write

| Stage | Status | Comment |
|---|---|---|
| spec-investigate done | — | summary: root cause or approach, repos affected, top risks, open questions |
| spec-implement starts | `start` | — |
| spec-verify done | — | each acceptance criterion with pass/fail and one line of evidence; overall N of M pass |
| spec-review done | — | blocker / should-fix / nit counts, and each blocker in one line |
| spec-ship done | `review` | PR link, plus "verified N/M, review: no blockers" |
| PR feedback round done | `review` (only if people moved it back) | "review feedback round N addressed": fixes, scope changes, commit |

One comment per stage. A rerun replaces nothing: it posts a new, shorter comment saying what
changed ("re-verified after fix: 12/12 pass").

## What a comment looks like

Short, factual, readable by someone who never saw the spec. Start with the stage and the result,
then at most 8 lines. Name file paths, never paste code, secrets, tokens, customer data or env
values. Example:

> **Verified (spec-driven-dev)**: 11 of 12 acceptance criteria pass.
> - ✓ R1 discount applies at checkout (dev store, order #1043)
> - ✗ R4 email copy: still shows the old text (screenshot in verification-report.md)
> Spec: `soreto-specs/STP-123/`

## Failure and fallback

- No tracker tool connected, or a write fails: don't retry in a loop and don't block the stage.
  Print the comment text so the user can paste it, and say which status change didn't happen.
- Record each write in `log.md` (`tracker: moved to In Progress`, `tracker: posted verify comment`).
