# README Template

Use this structure for the README.md at the root of each spec folder. The README serves as the orchestration index — the `spec-implement` skill reads it to determine batch order, task assignments, and completion status.

## Template

```markdown
# {Feature Name}

## Resume here

<!-- Overwritten by each spec-* skill when it finishes. A new session reads this first. Keep it ~10 lines. -->
- **Stage:** spec created, awaiting approval
- **Next:** review the spec, then say "implement" (or "approved, run it through")
- **Open questions:** {none, or one line each}
- **Last commit:** {short sha, or "none yet"}
- **Areas:** {context areas this feature touches, e.g. billing, api}

## Overview

{One paragraph summary of what the feature does and why it exists.}

## Quick Links

- [Requirements](./requirements.md) — full requirements and acceptance criteria
- [Action Required](./action-required.md) — manual steps needing human action
- [Log](./log.md) — decisions, deviations and review findings (append-only)

## Dependency Graph

​```mermaid
graph TD
    task-01-name["01: Task Title"]
    task-02-name["02: Task Title"]
    task-03-name["03: Task Title"]
    task-01-name --> task-03-name
    task-02-name --> task-03-name
​```

## Batches

| Batch | Tasks | Tiers | Description |
|------|-------|-------|-------------|
| 1 | task-01, task-02 | light, standard | {Brief description of what this batch accomplishes} |
| 2 | task-03 | deep | {Brief description} |

**Model plan:** {n} light · {n} standard · {n} deep. Deep tasks: {task-03 — reason}.

## Task Status

### Batch 1
- [ ] [task-01-{name}](./tasks/task-01-{name}.md) — {One-line title}
- [ ] [task-02-{name}](./tasks/task-02-{name}.md) — {One-line title}

### Batch 2
- [ ] [task-03-{name}](./tasks/task-03-{name}.md) — {One-line title}
```

## Key Points

- **Resume here** is the cheap way back in. Every `spec-*` skill overwrites it when it finishes (stage, next action, open questions, last commit), so a new or compacted session reads ~10 lines instead of the whole history. `spec-driven-dev status` prints each spec's **Next** line.

- The **Dependency Graph** uses Mermaid syntax (widely rendered in GitHub, VS Code, etc.). Each node shows the task number and title for quick reference.
- The **Batches** table provides a scannable overview of what runs in parallel.
- The **Task Status** section uses markdown checkboxes that the `spec-implement` skill updates as tasks complete. The orchestrator parses these to determine which batch to resume from.
- Links to task files use relative paths pointing into the `tasks/` subfolder.
- Tasks without dependencies have no incoming arrows in the graph — these form Batch 1.
