# Tracker updates (status and comments)

When a tracker tool is connected (an MCP server such as Atlassian, GitHub, GitLab, Linear, Azure
DevOps or ClickUp, or a CLI such as `gh`, `glab`, `az`, `acli`; see `trackers.md`), the pipeline keeps the ticket in step with the work, so the team can see in the
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
read the ticket's real states (Jira: `getTransitionsForJiraIssue`; Linear, Shortcut: workflow
states; Azure Boards, YouTrack: the State field; ClickUp: the list's statuses; GitHub, GitLab:
labels or a board/Projects status field, if the team uses one; Asana, Monday, Trello: the section,
status column or list), propose a mapping for `start`
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
| spec-ship done | `review` | PR link, plus "verified N/M, review: no blockers", the build report (models and tokens, when `usage.report` is `all` or `ticket`), and the verification screenshots attached |
| PR feedback round done | `review` (only if people moved it back) | "review feedback round N addressed": fixes, scope changes, commit |

One comment per stage. A rerun replaces nothing: it posts a new, shorter comment saying what
changed ("re-verified after fix: 12/12 pass").

## Screenshots on the final comment

Attach the verification screenshots once the final review has passed (no open blockers), on
spec-ship's comment, and again after a PR feedback round only for screenshots that changed.

- Take them from `{feature}/evidence/`, the files `verification-report.md` names. At most 6: one per
  UI criterion, the ones a reviewer most needs. Name each in the comment with its criterion
  (`R3 thank-you page: 03-thank-you-downloads.png`).
- **Look at every image before attaching it.** Skip (and say so) any that shows a secret, token,
  env value, real customer's personal data or a payment detail. Test data is fine.
- How to attach: see the **Attach a file** column in `trackers.md`. Use the connected tool's upload
  operation if it has one; otherwise its API, only with credentials already set up on this machine.
  Never ask for a token in chat.
- Can't attach: post the comment anyway, list the screenshot paths, and tell the user which files
  to drag onto the ticket.
- Covered by `tracker.updates` (`ask` confirms it with the comment). `tracker.screenshots: off`
  turns only the attachments off.

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
