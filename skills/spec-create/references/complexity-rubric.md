# Complexity Rubric

Use this to give every task a **tier**: `light`, `standard`, or `deep`. `spec-implement` runs the
task on the model mapped to that tier in `.spec-driven.yml` (`models:`). Rate from the evidence in
the task file and investigation, not from how long the description is.

## Contents
- Scoring
- Tier from score
- Overrides
- Examples
- What to write in the task file

## Scoring

Add one point for each signal that applies:

| Signal | Point when… |
|---|---|
| Spread | the task changes more than 3 files, or files in more than one module/package/repo |
| New design | there's no existing pattern in the repo to copy (new abstraction, algorithm, or integration) |
| Data | it changes a schema, migration, persisted format, or data backfill |
| Concurrency | it involves async ordering, queues, retries, locking, caching, or idempotency |
| Security | it touches auth, permissions, tenant isolation, secrets, payments, or untrusted input |
| Public contract | it changes an API, event, or interface that other code or other repos depend on |
| Ambiguity | acceptance criteria rely on judgement, or the investigation left UNKNOWNs in this area |
| Hard to verify | correctness can't be fully shown by the tests listed (timing, performance, UI feel) |

## Tier from score

| Score | Tier | Typical work |
|---|---|---|
| 0–1 | `light` | copy change, config value, small UI tweak, adding a field following an existing pattern |
| 2–3 | `standard` | a normal feature slice: a route + service + tests following existing patterns |
| 4+ | `deep` | cross-cutting design, migrations with backfills, auth/permission logic, concurrency fixes |

## Overrides

- **Security or Data alone make a task at least `standard`**, even if nothing else applies.
- **Security + Data, or Security + Concurrency, make it `deep`**, whatever the score.
- If the score is borderline, round up: a tier too high costs money, a tier too low costs rework.

## Examples

- "Rename the Export button to Download CSV" → 0 → `light`
- "Add `exported_at` column and show it on the orders page" → Data, Spread → 2 → `standard`
- "Make the CSV export stream rows instead of loading 10k into memory" → New design, Concurrency, Hard to verify → 3 → `standard`
- "Enforce tenant isolation on all export endpoints and backfill missing tenant IDs" → Security + Data → `deep`

## What to write in the task file

```markdown
## Complexity

**Tier:** standard
**Signals:** Data (adds `exported_at` migration), Spread (api + web)
```
