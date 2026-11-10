# Review Report Template

Copy this structure into `specs/{feature}/review.md`.

```markdown
# Review: {feature}

**Result:** {B} blockers · {S} should-fix · {N} nits · {Q} questions
**Reviewed:** {base}...{head short sha} ({files} files, +{add}/−{del}) on {date}, model {model}
**Checks:** lint {PASS/FAIL/skipped} · typecheck {…} · test {…}

## Requirements

| Req | Delivered by | Status |
|---|---|---|
| R1 | `src/x.ts:40` | ✅ delivered |
| R2 | — | ❌ missing → finding 1 |

## Findings

### 1. [blocker] {one-line title}
- **Where:** `path/to/file.ts:123`
- **Problem:** {what's wrong}
- **Failure:** {the concrete input or state that makes it go wrong}
- **Fix:** {the suggested change}
- **Status:** open  <!-- open | fixed in {sha} | accepted by {user} on {date}: {reason} -->

### 2. [should-fix] …

## Scope

- Unrequested changes: {files or "none"}
- Task-listed files not touched: {files or "none"}

## Conventions checked

- {convention} ({source}): {followed / broken → finding n}
```

## Key Points

- Number findings once and never renumber them, so "fix 1 and 3" stays unambiguous across fix rounds.
- **Status** is how a blocker gets cleared: `fixed in <sha>` after a fix round, or `accepted by <user>` when the user explicitly takes the risk. `spec-ship` refuses while any blocker is `open`.
- Leave out sections that don't apply, such as Requirements when there's no spec.
