# Log Template

`specs/{feature}/log.md` keeps what would otherwise live only in the chat: decisions, deviations,
answers from the user, review findings, and dead ends. Without it, those are lost when the session
ends or the conversation is compacted.

**Rules**
- **Append only.** Add entries at the bottom. Never rewrite or reorder.
- **Never read it in full.** A new session reads the README's **Resume here** block. Read the log's
  last ~20 lines only when Resume here isn't enough.
- **One to three lines per entry.** Point to files as `path:line`. Don't paste code.
- **Log what's worth keeping:** a decision and its reason, a change from the spec, the user's answer
  to a question, a review finding and its fix, an approach that failed and why. Skip routine
  progress, which the checkboxes already show.

## Template

```markdown
# Log: {Feature Name}

- 2026-11-10 spec-create · Created spec: {N} tasks in {B} batches. Covers R1–R{n}.
- 2026-11-10 spec-implement · Decision: reuse `retryWithBackoff` (`src/lib/retry.ts:12`) instead of a new helper. The user asked for it.
- 2026-11-10 spec-implement · Deviation: task-03 also touches `src/api/routes.ts`, because the route table lives there.
- 2026-11-11 spec-verify · R3 failed: webhook retried 5 times, not 3. Fixed in task-04 and re-verified.
```

Each entry has the date, the skill that wrote it, then what happened and why.
