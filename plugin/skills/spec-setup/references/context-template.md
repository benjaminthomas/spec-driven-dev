# Project context templates

What the project knows, kept small so it can be loaded cheaply. Two levels:

- `{specs_dir}/CONTEXT.md`: the **index**. **60 lines or fewer.** Read once per stage, only during
  spec work.
- `{specs_dir}/context/<area>.md`: details for one area. **150 lines or fewer each.** Read only when
  a task touches that area.
- `{specs_dir}/context/archive.md`: old or superseded entries. Never loaded by default.

`spec-driven-dev context` prints the index, and `spec-driven-dev context --areas=billing,auth`
prints only those area files, with no model needed. `spec-driven-dev doctor` checks the size limits
and flags paths that no longer exist.

## Rules for writing context

- **Only what the code can't tell you quickly:** decisions and their reasons, conventions, places
  that are off-limits, pitfalls, product intent. Don't paste code. Point to it as `path:line`.
- **Every entry gets a date and a source:** `(2026-11-10, spec stp-123)`, `(audit, a1b2c3d)`, or
  `(you told me)`.
- **Add at the end of a section.** Don't reorder or reformat what's already there. The start of the
  file then stays the same, and the host's prompt cache can reuse it.
- **Over the limit?** Merge duplicates. Move anything superseded or older than about a year to
  `archive.md`. Never delete a decision without archiving it.
- **No secrets, keys, tokens, or personal data.** Ask before writing sensitive business details
  such as customer names or pricing. These files are usually committed.
- **The code wins.** If code and context disagree, say so in the report and suggest a fix. Never
  silently rewrite context to match a guess.

## CONTEXT.md (index)

```markdown
# Project context
<!-- Index only, 60 lines max. Details live in context/<area>.md. Maintained by spec-* skills. -->
Project: existing · audited at a1b2c3d (2026-11-10) · graph: none

## Product
{2–3 lines: what it does, who uses it.}

## Areas
| Area | Where | What it does | Details |
|---|---|---|---|
| billing | `api/src/billing/` | invoices, Stripe webhooks | [billing](context/billing.md) |
| web | `web/` | React customer app | — |

## Conventions
- {The handful of rules that apply everywhere, e.g. "errors go through `AppError`" (audit, a1b2c3d)}

## Off-limits / handle with care
- {e.g. `legacy/` is frozen, no changes without approval (you told me)}

## Decisions
- {One line each, newest last: decision, reason, (date, source). Long ones go in an area file.}

## Specs
- {stp-123: retry failed webhooks, touched billing (2026-11-10)}

<!-- risk:start (written by spec-driven-dev risk; don't edit) -->
## Risk hotspots
GitRisk on 2026-11-10: 0 critical · 8 high · 30 medium. Full table: context/risk.md (regenerate: spec-driven-dev risk).
- `app/services/billing.ts` 61.7 high
<!-- risk:end -->
```

The **Risk hotspots** block is written by `spec-driven-dev risk` (setup, every batch, checkpoint) and
replaced in place, so don't edit it. It's the shared part of GitRisk: `context/risk.md` itself is
gitignored because it's regenerated on every run.

## context/<area>.md

```markdown
# {Area}
<!-- 150 lines max. Loaded only when a task touches this area. -->
Where: `{paths}` · last checked {date} at {commit}

## How it works
{A few lines plus `path:line` pointers. Entry points, main flow, data it owns.}

## Conventions
- {rule} ({date}, {source})

## Decisions
- {decision}: {why} ({date}, {source})

## Pitfalls
- {what bit someone, and how to avoid it} ({date}, {source})
```

## Per-feature: Resume here and log.md

These live in each spec folder. Their templates are readme-template.md and log-template.md in
the installed `spec-create` skill folder's references/. The README's **Resume here** block (about 10 lines)
is what a new session reads first. `log.md` is append-only and is never read in full.
