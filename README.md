# spec-driven-dev

A Claude Code plugin bundling five skills: a parallel-wave, spec-driven feature
workflow, and a portable SEO/GEO operations skill. Works in any codebase — none
of these assume a specific framework, stack, or product.

## What's inside

### The feature pipeline

Four skills that work together, each one resumable and each producing an
artifact the next stage (or the next person) can pick up cold:

```
create-spec  →  implement-feature  →  verify-feature  →  ship-it
```

| Skill | Trigger | Input | Output |
|---|---|---|---|
| `create-spec` | "create a spec", "plan this feature", "break this into tasks" | A planning conversation (or an interview if there wasn't one) | `specs/{feature}/` — `requirements.md`, `action-required.md`, `tasks/task-NN-*.md`, `README.md` with a dependency graph and wave breakdown |
| `implement-feature` | "implement this feature", "run the spec", "continue implementing" | `specs/{feature}/` | Real code changes — one coder subagent per task per wave, run in parallel within a wave, with a code-review gate before each wave is committed |
| `verify-feature` | "test this end to end", "does this actually work", right after `implement-feature` finishes | `specs/{feature}/` | `specs/{feature}/verification-report.md` — every acceptance criterion checked against the *real running app* (clicks, API calls, DB reads used only to confirm state), pass/fail with evidence |
| `ship-it` | "ship it", "push this", "open a PR" | A committed, verified branch | A pushed branch + an opened GitHub PR |

The insight behind the pipeline: implementation plans that live in one giant
file are either too large for an agent's context window or too shallow for
independent execution. Splitting into one self-contained task file per unit of
work lets multiple coder agents implement a feature in parallel, safely,
without anyone needing to re-read the whole plan.

None of these four skills write to a specific stack's config — they read
whatever lint/typecheck/build/dev commands the target repo actually has and
use those.

### generative-seo

A standalone fifth skill, unrelated to the pipeline above: runs an
evidence-based SEO + GEO (Generative Engine Optimization) program — technical
SEO audits, answer-first content built to get cited by ChatGPT/Perplexity/AI
Overviews, an AI-citation tracker, competitor research, and draft-only social
distribution. First use in a project spends a few minutes learning that
project's specifics (brand, domain, framework, content location) via a short
interview, then remembers the answers for every later run. See
`skills/generative-seo/SKILL.md` for the seven modes
(`audit`/`content`/`optimize`/`competitors`/`citations`/`report`/`social`).

## Install

From within Claude Code:

```
/plugin marketplace add <path-or-git-url-to-this-repo>
/plugin install spec-driven-dev@spec-driven-dev
```

Or, for local development/testing without publishing anywhere, point Claude
Code at this folder directly as a marketplace source (its own
`.claude-plugin/marketplace.json` lists itself with `source: "./"`).

## Typical flow

1. Plan a feature in conversation, then `/create-spec` to capture it.
2. `/implement-feature` to build it wave-by-wave with review gates between waves.
3. `/verify-feature` to prove the acceptance criteria hold against the real
   running app — not just that it compiles.
4. Commit (e.g. with your own `checkpoint`-style workflow), then `/ship-it` to
   push and open the PR.
5. Any time, independent of the pipeline: `/generative-seo` for SEO/GEO work
   on the same project or any other.

## License

MIT — see `LICENSE`.
